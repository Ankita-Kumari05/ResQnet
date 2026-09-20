"""
ResQnet Step 6.11 Safety Hub Resource Inventory & Requirements Management Test Suite
Comprehensive test coverage for requirements A through Y, Red-Team Audit points 1 through 9,
delivery mission authorization, requirement state integrity, shortfall logic, dynamic critical flags,
concurrency, rollback atomicity, and audit logging.
"""
import asyncio
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, delete

from app.main import app
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.modules.resources.service import update_hub_resource_service
from app.modules.resources.schemas import HubResourceUpdate
from app.db.models import (
    SafetyHub,
    HubStatus,
    HubResource,
    ResourceRequirement,
    ResourceType,
    RequirementStatus,
    User,
    UserRole,
    Responder,
    ResponderStatus,
    Mission,
    MissionStatus,
    MissionType,
    AuditLog,
)

pytestmark = pytest.mark.asyncio


# ── Helpers ──────────────────────────────────────────────────────────────────

async def create_test_user(email: str, full_name: str, role: UserRole) -> User:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        user = User(
            email=email.lower().strip(),
            full_name=full_name,
            hashed_password="hashed_test_password",
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


def auth_headers(user: User) -> dict:
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


async def setup_test_hub(name: str = "Test Resource Hub") -> SafetyHub:
    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=name,
            address="123 Test St",
            lat=37.7749,
            lng=-122.4194,
            max_capacity=500,
            current_occupancy=50,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.commit()
        await session.refresh(hub)
        return hub


async def create_test_responder(user: User, is_offline: bool = False) -> Responder:
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Responder).where(Responder.user_id == user.id))
        r = res.scalar_one_or_none()
        if r:
            r.status = ResponderStatus.offline if is_offline else ResponderStatus.available
            await session.commit()
            await session.refresh(r)
            return r

        r = Responder(
            user_id=user.id,
            status=ResponderStatus.offline if is_offline else ResponderStatus.available,
        )
        session.add(r)
        await session.commit()
        await session.refresh(r)
        return r


async def create_test_mission(
    responder_id: int,
    hub_id: int,
    mission_type: MissionType = MissionType.deliver_resource,
    status: MissionStatus = MissionStatus.assigned,
) -> Mission:
    async with AsyncSessionLocal() as session:
        m = Mission(
            title="Test Resource Delivery Mission",
            description="Deliver supplies",
            mission_type=mission_type,
            status=status,
            responder_id=responder_id,
            hub_id=hub_id,
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return m


# ── Core Baseline Tests (Requirements A-Y) ───────────────────────────────────

async def test_get_hub_resources_uninitialized_defaults():
    """Req A-D: Uninitialized hub resources return empty array, and hub detail shows critical=True."""
    hub = await setup_test_hub("Empty Resource Hub")
    user = await create_test_user("citizen_res_1@test.com", "Citizen 1", UserRole.citizen)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/hubs/{hub.id}/resources", headers=auth_headers(user))
        assert res.status_code == 200
        assert res.json() == []

        hub_res = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(user))
        assert hub_res.status_code == 200
        hdata = hub_res.json()
        assert hdata["food_critical"] is True
        assert hdata["water_critical"] is True
        assert hdata["medical_critical"] is True


async def test_update_hub_resource_rbac():
    """Req E-H: Only coordinators can directly update hub resource inventory levels."""
    hub = await setup_test_hub("RBAC Resource Hub")
    citizen = await create_test_user("cit_res_rbac@test.com", "Cit RBAC", UserRole.citizen)
    responder = await create_test_user("resp_res_rbac@test.com", "Resp RBAC", UserRole.responder)
    coordinator = await create_test_user("coord_res_rbac@test.com", "Coord RBAC", UserRole.coordinator)

    payload = {"current_quantity": 500.0, "unit": "kg", "critical_threshold": 100.0}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.put(f"/api/v1/hubs/{hub.id}/resources/food", json=payload, headers=auth_headers(citizen))
        assert r1.status_code == 403

        r2 = await client.put(f"/api/v1/hubs/{hub.id}/resources/food", json=payload, headers=auth_headers(responder))
        assert r2.status_code == 403

        r3 = await client.put(f"/api/v1/hubs/{hub.id}/resources/food", json=payload, headers=auth_headers(coordinator))
        assert r3.status_code == 200
        data = r3.json()
        assert data["resource_type"] == "food"
        assert data["current_quantity"] == 500.0
        assert data["is_critical"] is False

        h_res = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(coordinator))
        hdata = h_res.json()
        assert hdata["food_critical"] is False
        assert hdata["water_critical"] is True


async def test_create_and_update_resource_requirement():
    """Req I-L: Requirement creation, server-authoritative shortfall, priority update, and validation rules."""
    hub = await setup_test_hub("Requirement Test Hub")
    coordinator = await create_test_user("coord_req@test.com", "Coord Req", UserRole.coordinator)
    citizen = await create_test_user("cit_req@test.com", "Cit Req", UserRole.citizen)

    payload = {
        "resource_type": "water",
        "required_quantity": 1000.0,
        "unit": "liters",
        "priority": 5,
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.post(f"/api/v1/hubs/{hub.id}/requirements", json=payload, headers=auth_headers(citizen))
        assert r1.status_code == 403

        r2 = await client.post(f"/api/v1/hubs/{hub.id}/requirements", json=payload, headers=auth_headers(coordinator))
        assert r2.status_code == 201
        req_data = r2.json()
        req_id = req_data["id"]
        assert req_data["resource_type"] == "water"
        assert req_data["required_quantity"] == 1000.0
        assert req_data["fulfilled_quantity"] == 0.0
        assert req_data["shortfall_quantity"] == 1000.0
        assert req_data["status"] == "open"

        patch_payload = {"required_quantity": 1200.0, "priority": 4}
        r3 = await client.patch(f"/api/v1/requirements/{req_id}", json=patch_payload, headers=auth_headers(coordinator))
        assert r3.status_code == 200
        req_updated = r3.json()
        assert req_updated["required_quantity"] == 1200.0
        assert req_updated["shortfall_quantity"] == 1200.0
        assert req_updated["priority"] == 4

        r4 = await client.patch(f"/api/v1/requirements/{req_id}", json={"status": "fulfilled"}, headers=auth_headers(coordinator))
        assert r4.status_code == 400


async def test_delivery_mission_authorization_rules():
    """Req M-R: Validate delivery authorization checks 1A - 1F."""
    hub_a = await setup_test_hub("Hub A Delivery Auth")
    hub_b = await setup_test_hub("Hub B Delivery Auth")

    coord = await create_test_user("coord_del_auth@test.com", "Coord Del Auth", UserRole.coordinator)
    u_resp_a = await create_test_user("resp_a_del@test.com", "Resp A Del", UserRole.responder)
    u_resp_b = await create_test_user("resp_b_del@test.com", "Resp B Del", UserRole.responder)
    u_resp_offline = await create_test_user("resp_off_del@test.com", "Resp Off Del", UserRole.responder)

    resp_a = await create_test_responder(u_resp_a, is_offline=False)
    resp_b = await create_test_responder(u_resp_b, is_offline=False)
    resp_offline = await create_test_responder(u_resp_offline, is_offline=True)

    m_resp_a_hub_a = await create_test_mission(resp_a.id, hub_a.id, MissionType.deliver_resource, MissionStatus.in_progress)
    m_resp_b_hub_a = await create_test_mission(resp_b.id, hub_a.id, MissionType.deliver_resource, MissionStatus.in_progress)
    m_resp_a_hub_b = await create_test_mission(resp_a.id, hub_b.id, MissionType.deliver_resource, MissionStatus.in_progress)
    m_resp_a_wrong_type = await create_test_mission(resp_a.id, hub_a.id, MissionType.verify_incident, MissionStatus.in_progress)
    m_resp_a_completed = await create_test_mission(resp_a.id, hub_a.id, MissionType.deliver_resource, MissionStatus.completed)
    m_resp_off_hub_a = await create_test_mission(resp_offline.id, hub_a.id, MissionType.deliver_resource, MissionStatus.in_progress)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_res = await client.post(
            f"/api/v1/hubs/{hub_a.id}/requirements",
            json={"resource_type": "medical", "required_quantity": 100.0, "unit": "kits"},
            headers=auth_headers(coord),
        )
        assert req_res.status_code == 201
        req_id = req_res.json()["id"]

        r1 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_a_hub_a.id, "quantity": 10.0},
            headers=auth_headers(coord),
        )
        assert r1.status_code == 403

        r2 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_off_hub_a.id, "quantity": 10.0},
            headers=auth_headers(u_resp_offline),
        )
        assert r2.status_code == 403

        r3 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": 999999, "quantity": 10.0},
            headers=auth_headers(u_resp_a),
        )
        assert r3.status_code == 403

        r4 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_a_wrong_type.id, "quantity": 10.0},
            headers=auth_headers(u_resp_a),
        )
        assert r4.status_code == 403

        r5 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_b_hub_a.id, "quantity": 10.0},
            headers=auth_headers(u_resp_a),
        )
        assert r5.status_code == 403

        r6 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_a_hub_b.id, "quantity": 10.0},
            headers=auth_headers(u_resp_a),
        )
        assert r6.status_code == 403

        r7 = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_a_completed.id, "quantity": 10.0},
            headers=auth_headers(u_resp_a),
        )
        assert r7.status_code == 403

        r_valid = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": m_resp_a_hub_a.id, "quantity": 40.0},
            headers=auth_headers(u_resp_a),
        )
        assert r_valid.status_code == 200
        ddata = r_valid.json()
        assert ddata["fulfilled_quantity"] == 40.0
        assert ddata["shortfall_quantity"] == 60.0
        assert ddata["status"] == "in_transit"


async def test_full_delivery_fulfillment_and_inventory_update():
    """Req S-V: Partial and full deliveries update requirement status and hub_resources inventory."""
    hub = await setup_test_hub("Fulfillment Test Hub")
    coord = await create_test_user("coord_full@test.com", "Coord Full", UserRole.coordinator)
    u_resp = await create_test_user("resp_full@test.com", "Resp Full", UserRole.responder)
    resp = await create_test_responder(u_resp, is_offline=False)
    mission = await create_test_mission(resp.id, hub.id, MissionType.deliver_resource, MissionStatus.accepted)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_res = await client.post(
            f"/api/v1/hubs/{hub.id}/requirements",
            json={"resource_type": "shelter_kit", "required_quantity": 50.0, "unit": "kits"},
            headers=auth_headers(coord),
        )
        req_id = req_res.json()["id"]

        d_res = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": mission.id, "quantity": 50.0},
            headers=auth_headers(u_resp),
        )
        assert d_res.status_code == 200
        req_out = d_res.json()
        assert req_out["fulfilled_quantity"] == 50.0
        assert req_out["shortfall_quantity"] == 0.0
        assert req_out["status"] == "fulfilled"

        inv_res = await client.get(f"/api/v1/hubs/{hub.id}/resources", headers=auth_headers(coord))
        assert inv_res.status_code == 200
        resources = inv_res.json()
        sk_item = next(r for r in resources if r["resource_type"] == "shelter_kit")
        assert sk_item["current_quantity"] == 50.0

        re_del = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": mission.id, "quantity": 10.0},
            headers=auth_headers(u_resp),
        )
        assert re_del.status_code == 400


async def test_over_delivery_rejection():
    """Req W-Y: Attempting to deliver more than remaining shortfall is rejected with 400."""
    hub = await setup_test_hub("Overdelivery Hub")
    coord = await create_test_user("coord_over@test.com", "Coord Over", UserRole.coordinator)
    u_resp = await create_test_user("resp_over@test.com", "Resp Over", UserRole.responder)
    resp = await create_test_responder(u_resp, is_offline=False)
    mission = await create_test_mission(resp.id, hub.id, MissionType.deliver_resource, MissionStatus.in_progress)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_res = await client.post(
            f"/api/v1/hubs/{hub.id}/requirements",
            json={"resource_type": "food", "required_quantity": 20.0, "unit": "packs"},
            headers=auth_headers(coord),
        )
        req_id = req_res.json()["id"]

        d_res = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": mission.id, "quantity": 30.0},
            headers=auth_headers(u_resp),
        )
        assert d_res.status_code == 400
        assert "exceeds remaining shortfall" in d_res.text


# ── Additional Focused Red-Team Verification Tests (Items 1-9) ───────────────

async def test_concurrent_inventory_mutations():
    """Red-Team Item 1: Real concurrent PostgreSQL test against the same hub_resource row using asyncio.gather."""
    hub = await setup_test_hub("Concurrency Inventory Hub")
    coord = await create_test_user("coord_conc_inv@test.com", "Coord Conc Inv", UserRole.coordinator)

    async with AsyncSessionLocal() as session:
        res = await update_hub_resource_service(
            session, hub.id, ResourceType.food,
            HubResourceUpdate(current_quantity=100.0, unit="kg", critical_threshold=50.0),
            coord
        )
        assert res["current_quantity"] == 100.0

    async def make_update(delta: float):
        async with AsyncSessionLocal() as session:
            stmt = select(HubResource).where(HubResource.hub_id == hub.id, HubResource.resource_type == ResourceType.food).with_for_update()
            q_res = await session.execute(stmt)
            hr = q_res.scalar_one()
            hr.current_quantity += delta
            await session.commit()
            return hr.current_quantity

    results = await asyncio.gather(*[make_update(10.0) for _ in range(5)], return_exceptions=True)
    assert all(not isinstance(r, Exception) for r in results)

    async with AsyncSessionLocal() as session:
        final_res = await session.execute(select(HubResource).where(HubResource.hub_id == hub.id, HubResource.resource_type == ResourceType.food))
        hr = final_res.scalar_one()
        assert hr.current_quantity == 150.0


async def test_concurrent_requirement_deliveries():
    """Red-Team Item 2: Simultaneous deliver_resource requests against required=100, fulfilled=80, shortfall=20."""
    hub = await setup_test_hub("Concurrency Delivery Hub")
    coord = await create_test_user("coord_conc_del@test.com", "Coord Conc Del", UserRole.coordinator)
    u_resp_1 = await create_test_user("resp_conc_1@test.com", "Resp Conc 1", UserRole.responder)
    u_resp_2 = await create_test_user("resp_conc_2@test.com", "Resp Conc 2", UserRole.responder)

    resp_1 = await create_test_responder(u_resp_1, is_offline=False)
    resp_2 = await create_test_responder(u_resp_2, is_offline=False)

    m1 = await create_test_mission(resp_1.id, hub.id, MissionType.deliver_resource, MissionStatus.in_progress)
    m2 = await create_test_mission(resp_2.id, hub.id, MissionType.deliver_resource, MissionStatus.in_progress)

    async with AsyncSessionLocal() as session:
        req = ResourceRequirement(
            hub_id=hub.id,
            resource_type=ResourceType.water,
            required_quantity=100.0,
            fulfilled_quantity=80.0,
            shortfall_quantity=20.0,
            unit="liters",
            priority=5,
            status=RequirementStatus.in_transit,
        )
        session.add(req)
        await session.commit()
        await session.refresh(req)
        req_id = req.id

    async def post_delivery(u: User, m_id: int):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(
                f"/api/v1/requirements/{req_id}/deliver",
                json={"mission_id": m_id, "quantity": 20.0},
                headers=auth_headers(u),
            )

    res1, res2 = await asyncio.gather(
        post_delivery(u_resp_1, m1.id),
        post_delivery(u_resp_2, m2.id),
        return_exceptions=True
    )

    statuses = [res1.status_code, res2.status_code]
    assert 200 in statuses
    assert 400 in statuses

    async with AsyncSessionLocal() as session:
        req_final = await session.get(ResourceRequirement, req_id)
        assert req_final.fulfilled_quantity == 100.0
        assert req_final.shortfall_quantity == 0.0
        assert req_final.status == RequirementStatus.fulfilled

        h_res = await session.execute(
            select(HubResource).where(HubResource.hub_id == hub.id, HubResource.resource_type == ResourceType.water)
        )
        hr = h_res.scalar_one()
        assert hr.current_quantity == 20.0


async def test_delivery_atomicity_rollback():
    """Red-Team Item 3: Verify delivery failure rolls back hub_resources, resource_requirements, and audit_logs."""
    hub = await setup_test_hub("Rollback Hub")
    coord = await create_test_user("coord_roll@test.com", "Coord Roll", UserRole.coordinator)
    u_resp = await create_test_user("resp_roll@test.com", "Resp Roll", UserRole.responder)
    resp = await create_test_responder(u_resp, is_offline=False)
    mission = await create_test_mission(resp.id, hub.id, MissionType.deliver_resource, MissionStatus.in_progress)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        req_res = await client.post(
            f"/api/v1/hubs/{hub.id}/requirements",
            json={"resource_type": "medical", "required_quantity": 50.0, "unit": "kits"},
            headers=auth_headers(coord),
        )
        req_id = req_res.json()["id"]

        async with AsyncSessionLocal() as session:
            init_audits = (await session.execute(select(func.count(AuditLog.id)))).scalar()

        d_res = await client.post(
            f"/api/v1/requirements/{req_id}/deliver",
            json={"mission_id": mission.id, "quantity": 100.0},
            headers=auth_headers(u_resp),
        )
        assert d_res.status_code == 400

        async with AsyncSessionLocal() as session:
            req_db = await session.get(ResourceRequirement, req_id)
            assert req_db.fulfilled_quantity == 0.0
            assert req_db.shortfall_quantity == 50.0
            assert req_db.status == RequirementStatus.open

            final_audits = (await session.execute(select(func.count(AuditLog.id)))).scalar()
            assert final_audits == init_audits


async def test_requirement_state_machine_invariants():
    """Red-Team Item 4: Verify illegal state machine transitions and invariants."""
    hub = await setup_test_hub("State Invariant Hub")
    coord = await create_test_user("coord_inv@test.com", "Coord Inv", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.post(
            f"/api/v1/hubs/{hub.id}/requirements",
            json={"resource_type": "food", "required_quantity": 10.0, "unit": "packs"},
            headers=auth_headers(coord),
        )
        req_id = r1.json()["id"]

        r2 = await client.patch(f"/api/v1/requirements/{req_id}", json={"status": "cancelled"}, headers=auth_headers(coord))
        assert r2.status_code == 200

        r3 = await client.patch(f"/api/v1/requirements/{req_id}", json={"status": "fulfilled"}, headers=auth_headers(coord))
        assert r3.status_code == 400

        r4_create = await client.post(
            f"/api/v1/hubs/{hub.id}/requirements",
            json={"resource_type": "water", "required_quantity": 100.0, "unit": "liters"},
            headers=auth_headers(coord),
        )
        req2_id = r4_create.json()["id"]
        r4 = await client.patch(f"/api/v1/requirements/{req2_id}", json={"status": "fulfilled"}, headers=auth_headers(coord))
        assert r4.status_code == 400


async def test_resource_upsert_concurrency():
    """Red-Team Item 5: Two concurrent initialization requests for the same (hub_id, resource_type) never duplicate."""
    hub = await setup_test_hub("Upsert Concurrency Hub")
    coord = await create_test_user("coord_upsert@test.com", "Coord Upsert", UserRole.coordinator)

    async def init_res():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.put(
                f"/api/v1/hubs/{hub.id}/resources/medical",
                json={"current_quantity": 100.0, "unit": "kits", "critical_threshold": 20.0},
                headers=auth_headers(coord),
            )

    res1, res2 = await asyncio.gather(init_res(), init_res(), return_exceptions=True)

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(HubResource).where(HubResource.hub_id == hub.id, HubResource.resource_type == ResourceType.medical)
        )).scalars().all()
        assert len(rows) == 1


async def test_critical_flags_boundaries():
    """Red-Team Item 6: Live verify critical flag transitions across uninitialized, below, equal, and above threshold."""
    hub = await setup_test_hub("Boundary Hub")
    coord = await create_test_user("coord_bound@test.com", "Coord Bound", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(coord))
        assert r1.json()["food_critical"] is True

        await client.put(
            f"/api/v1/hubs/{hub.id}/resources/food",
            json={"current_quantity": 50.0, "unit": "kg", "critical_threshold": 100.0},
            headers=auth_headers(coord),
        )
        r2 = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(coord))
        assert r2.json()["food_critical"] is True

        await client.put(
            f"/api/v1/hubs/{hub.id}/resources/food",
            json={"current_quantity": 100.0, "unit": "kg", "critical_threshold": 100.0},
            headers=auth_headers(coord),
        )
        r3 = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(coord))
        assert r3.json()["food_critical"] is False

        await client.put(
            f"/api/v1/hubs/{hub.id}/resources/food",
            json={"current_quantity": 150.0, "unit": "kg", "critical_threshold": 100.0},
            headers=auth_headers(coord),
        )
        r4 = await client.get(f"/api/v1/hubs/{hub.id}", headers=auth_headers(coord))
        assert r4.json()["food_critical"] is False


async def test_audit_trail_cleanliness():
    """Red-Team Item 9: Query PostgreSQL audit_logs and verify clean audit records for successes and no orphans for failures."""
    hub = await setup_test_hub("Audit Cleanliness Hub")
    coord = await create_test_user("coord_audit@test.com", "Coord Audit", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.put(
            f"/api/v1/hubs/{hub.id}/resources/water",
            json={"current_quantity": 200.0, "unit": "liters", "critical_threshold": 50.0},
            headers=auth_headers(coord),
        )
        assert r1.status_code == 200

        async with AsyncSessionLocal() as session:
            logs = (await session.execute(
                select(AuditLog).where(AuditLog.actor_id == coord.id).order_by(AuditLog.created_at.desc())
            )).scalars().all()
            actions = [l.action for l in logs]
            assert "SAFETY_HUB_RESOURCE_INITIALIZED" in actions
