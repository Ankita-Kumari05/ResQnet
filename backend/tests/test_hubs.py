"""
ResQnet Step 6.10 Safety Hubs & Capacity Management Test Suite
Comprehensive coverage for requirements A through Z and Red-Team Verification.
"""
import asyncio
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete

from app.main import app
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.modules.hubs.service import update_occupancy_service
from app.modules.routing.cache import invalidate_route_cache
from app.db.models import (
    SafetyHub,
    HubStatus,
    User,
    UserRole,
    Responder,
    ResponderStatus,
    Mission,
    MissionStatus,
    MissionType,
    AuditLog,
    Intersection,
    Road,
    RoadStatus,
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


_coord_offset = 0.0


def get_unique_coords() -> tuple[float, float]:
    global _coord_offset
    _coord_offset += 1.0
    lat = 45.0 + _coord_offset
    lng = 85.0 + _coord_offset
    return round(lat, 4), round(lng, 4)


# ── Tests A-D: Creation Role Authorization ────────────────────────────────────

async def test_a_coordinator_can_create_hub():
    """Req A: Coordinator can create Safety Hub with PostGIS geometry."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_a_{unique_id}@resqnet.org", "Coord A", UserRole.coordinator)

    unique_name = f"Safety Hub Alpha {unique_id}"
    payload = {
        "name": unique_name,
        "address": "123 Relief Way",
        "lat": 12.9716,
        "lng": 77.5946,
        "max_capacity": 500,
        "current_occupancy": 50,
        "capacity_critical_threshold": 0.85,
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hubs", json=payload, headers=auth_headers(coord))
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["name"] == unique_name
        assert data["max_capacity"] == 500
        assert data["current_occupancy"] == 50
        assert data["available_capacity"] == 450
        assert data["status"] == HubStatus.open.value
        assert data["capacity_critical"] is False


async def test_b_citizen_cannot_create_hub():
    """Req B: Citizen cannot create Safety Hub."""
    unique_id = uuid.uuid4().hex[:6]
    cit = await create_test_user(f"citizen_b_{unique_id}@resqnet.org", "Citizen B", UserRole.citizen)
    payload = {"name": "Unauthorized Hub", "lat": 12.9, "lng": 77.5, "max_capacity": 100}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hubs", json=payload, headers=auth_headers(cit))
        assert res.status_code == 403


async def test_c_fundraiser_cannot_create_hub():
    """Req C: Fundraiser cannot create Safety Hub."""
    unique_id = uuid.uuid4().hex[:6]
    fun = await create_test_user(f"fundraiser_c_{unique_id}@resqnet.org", "Fundraiser C", UserRole.fundraiser)
    payload = {"name": "Unauthorized Hub", "lat": 12.9, "lng": 77.5, "max_capacity": 100}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hubs", json=payload, headers=auth_headers(fun))
        assert res.status_code == 403


async def test_d_responder_cannot_create_hub():
    """Req D: Responder cannot create Safety Hub."""
    unique_id = uuid.uuid4().hex[:6]
    resp = await create_test_user(f"responder_d_{unique_id}@resqnet.org", "Responder D", UserRole.responder)
    payload = {"name": "Unauthorized Hub", "lat": 12.9, "lng": 77.5, "max_capacity": 100}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hubs", json=payload, headers=auth_headers(resp))
        assert res.status_code == 403


async def test_e_authenticated_all_roles_can_read_hubs():
    """Req E: All authenticated roles can view safety hubs list and detail."""
    unique_id = uuid.uuid4().hex[:6]
    cit = await create_test_user(f"citizen_e_{unique_id}@resqnet.org", "Citizen E", UserRole.citizen)
    fun = await create_test_user(f"fundraiser_e_{unique_id}@resqnet.org", "Fundraiser E", UserRole.fundraiser)
    resp = await create_test_user(f"responder_e_{unique_id}@resqnet.org", "Responder E", UserRole.responder)
    coord = await create_test_user(f"coord_e_{unique_id}@resqnet.org", "Coord E", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/hubs", headers=auth_headers(cit))
        assert res.status_code == 200
        hubs = res.json()
        assert isinstance(hubs, list)

        if hubs:
            hub_id = hubs[0]["id"]
            res_fun = await client.get(f"/api/v1/hubs/{hub_id}", headers=auth_headers(fun))
            assert res_fun.status_code == 200
            res_resp = await client.get(f"/api/v1/hubs/{hub_id}", headers=auth_headers(resp))
            assert res_resp.status_code == 200
            res_coord = await client.get(f"/api/v1/hubs/{hub_id}", headers=auth_headers(coord))
            assert res_coord.status_code == 200


async def test_f_invalid_max_capacity_rejected():
    """Req F: Invalid max capacity (<= 0) is rejected."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_f_{unique_id}@resqnet.org", "Coord F", UserRole.coordinator)

    payload = {"name": "Invalid Capacity Hub", "lat": 12.9, "lng": 77.5, "max_capacity": 0}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hubs", json=payload, headers=auth_headers(coord))
        assert res.status_code in [400, 422]


async def test_g_negative_occupancy_rejected():
    """Req G: Resulting occupancy < 0 is rejected."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_g_{unique_id}@resqnet.org", "Coord G", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Bounds Hub G {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 10},
        )
        hub_id = res_c.json()["id"]

        res_g = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": -20},
        )
        assert res_g.status_code == 400
        assert "negative" in res_g.text.lower()


async def test_h_occupancy_above_capacity_rejected():
    """Req H: Resulting occupancy > max_capacity is rejected."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_h_{unique_id}@resqnet.org", "Coord H", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Bounds Hub H {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 10},
        )
        hub_id = res_c.json()["id"]

        res_h = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": 95},
        )
        assert res_h.status_code == 400
        assert "exceed" in res_h.text.lower()


async def test_i_occupancy_at_capacity_derives_full():
    """Req I: Occupancy exactly at max_capacity derives FULL status."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_i_{unique_id}@resqnet.org", "Coord I", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Derivation Hub I {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 80},
        )
        hub_id = res_c.json()["id"]

        res_i = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": 20},
        )
        assert res_i.status_code == 200
        data_i = res_i.json()
        assert data_i["status"] == HubStatus.full.value
        assert data_i["available_capacity"] == 0


async def test_j_occupancy_at_85_percent_derives_near_capacity():
    """Req J: Occupancy at 85% capacity derives NEAR_CAPACITY status."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_j_{unique_id}@resqnet.org", "Coord J", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Derivation Hub J {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 0},
        )
        hub_id = res_c.json()["id"]

        res_j = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": 85},
        )
        assert res_j.status_code == 200
        data_j = res_j.json()
        assert data_j["status"] == HubStatus.near_capacity.value
        assert data_j["capacity_critical"] is True


async def test_k_occupancy_below_threshold_derives_open():
    """Req K: Occupancy below threshold derives OPEN status."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_k_{unique_id}@resqnet.org", "Coord K", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Derivation Hub K {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 85},
        )
        hub_id = res_c.json()["id"]

        res_k = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": -35},  # Drops to 50
        )
        assert res_k.status_code == 200
        data_k = res_k.json()
        assert data_k["status"] == HubStatus.open.value
        assert data_k["capacity_critical"] is False


async def test_l_coordinator_can_close_hub():
    """Req L: Coordinator can manually set hub status to CLOSED."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_l_{unique_id}@resqnet.org", "Coord L", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Closed Hub L {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 50},
        )
        hub_id = res_c.json()["id"]

        res_l = await client.patch(
            f"/api/v1/hubs/{hub_id}/status",
            headers=auth_headers(coord),
            json={"status": HubStatus.closed.value},
        )
        assert res_l.status_code == 200
        assert res_l.json()["status"] == HubStatus.closed.value


async def test_m_closed_persists_when_occupancy_changes():
    """Req M: CLOSED status persists regardless of occupancy changes."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_m_{unique_id}@resqnet.org", "Coord M", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Closed Hub M {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 90},
        )
        hub_id = res_c.json()["id"]

        await client.patch(f"/api/v1/hubs/{hub_id}/status", headers=auth_headers(coord), json={"status": HubStatus.closed.value})

        res_m = await client.patch(
            f"/api/v1/hubs/{hub_id}/occupancy",
            headers=auth_headers(coord),
            json={"delta": -70},
        )
        assert res_m.status_code == 200
        assert res_m.json()["current_occupancy"] == 20
        assert res_m.json()["status"] == HubStatus.closed.value  # CLOSED MUST PERSIST


async def test_n_coordinator_can_reopen_closed_hub():
    """Req N: Coordinator can reopen a CLOSED hub."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_n_{unique_id}@resqnet.org", "Coord N", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Closed Hub N {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 20},
        )
        hub_id = res_c.json()["id"]

        await client.patch(f"/api/v1/hubs/{hub_id}/status", headers=auth_headers(coord), json={"status": HubStatus.closed.value})

        res_n = await client.patch(
            f"/api/v1/hubs/{hub_id}/status",
            headers=auth_headers(coord),
            json={"status": HubStatus.open.value},
        )
        assert res_n.status_code == 200
        assert res_n.json()["status"] == HubStatus.open.value


async def test_o_reopening_derives_correct_state():
    """Req O: Reopening a CLOSED hub derives state from occupancy (FULL when occupancy == capacity)."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_o_{unique_id}@resqnet.org", "Coord O", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Closed Hub O {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 100},
        )
        hub_id = res_c.json()["id"]

        await client.patch(f"/api/v1/hubs/{hub_id}/status", headers=auth_headers(coord), json={"status": HubStatus.closed.value})

        res_o = await client.patch(
            f"/api/v1/hubs/{hub_id}/status",
            headers=auth_headers(coord),
            json={"status": HubStatus.open.value},
        )
        assert res_o.status_code == 200
        assert res_o.json()["status"] == HubStatus.full.value


# ── Responder Authorization Verification (Red-Team Gap 1A-1F) ─────────────────

async def test_p1_responder_active_mission_can_update_occupancy():
    """Red-Team 1A: Responder A with active/accepted/in_progress mission for Hub A CAN update occupancy."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p1_{unique_id}@resqnet.org", "Coord P1", UserRole.coordinator)
    resp_user = await create_test_user(f"responder_p1_{unique_id}@resqnet.org", "Resp P1", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub_res = await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub P1 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 10})
        hub_id = hub_res.json()["id"]

    async with AsyncSessionLocal() as db_session:
        resp_profile = Responder(user_id=resp_user.id, status=ResponderStatus.available)
        db_session.add(resp_profile)
        await db_session.commit()
        await db_session.refresh(resp_profile)

        mission = Mission(title="Mission 1A", mission_type=MissionType.deliver_resource, status=MissionStatus.in_progress, responder_id=resp_profile.id, hub_id=hub_id)
        db_session.add(mission)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(f"/api/v1/hubs/{hub_id}/occupancy", headers=auth_headers(resp_user), json={"delta": 5})
        assert res.status_code == 200
        assert res.json()["current_occupancy"] == 15


async def test_p2_responder_unrelated_hub_returns_403():
    """Red-Team 1B: Responder A with mission for Hub A attempts PATCH Hub B -> 403 Forbidden."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p2_{unique_id}@resqnet.org", "Coord P2", UserRole.coordinator)
    resp_user = await create_test_user(f"responder_p2_{unique_id}@resqnet.org", "Resp P2", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub_a = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub A P2 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()
        hub_b = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub B P2 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

    async with AsyncSessionLocal() as db_session:
        resp_profile = Responder(user_id=resp_user.id, status=ResponderStatus.available)
        db_session.add(resp_profile)
        await db_session.commit()
        await db_session.refresh(resp_profile)

        mission = Mission(title="Mission Hub A", mission_type=MissionType.deliver_resource, status=MissionStatus.assigned, responder_id=resp_profile.id, hub_id=hub_a["id"])
        db_session.add(mission)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(f"/api/v1/hubs/{hub_b['id']}/occupancy", headers=auth_headers(resp_user), json={"delta": 5})
        assert res.status_code == 403


async def test_p3_responder_using_other_responder_mission_returns_403():
    """Red-Team 1C: Responder A attempts update using mission assigned to Responder B -> 403 Forbidden."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p3_{unique_id}@resqnet.org", "Coord P3", UserRole.coordinator)
    resp_a = await create_test_user(f"resp_a_p3_{unique_id}@resqnet.org", "Resp A", UserRole.responder)
    resp_b = await create_test_user(f"resp_b_p3_{unique_id}@resqnet.org", "Resp B", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub P3 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

    async with AsyncSessionLocal() as db_session:
        prof_a = Responder(user_id=resp_a.id, status=ResponderStatus.available)
        prof_b = Responder(user_id=resp_b.id, status=ResponderStatus.available)
        db_session.add_all([prof_a, prof_b])
        await db_session.commit()
        await db_session.refresh(prof_b)

        # Mission is for Resp B on target Hub
        mission = Mission(title="Mission Resp B", mission_type=MissionType.deliver_resource, status=MissionStatus.in_progress, responder_id=prof_b.id, hub_id=hub["id"])
        db_session.add(mission)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Resp A attempts to update hub where Mission belongs to Resp B
        res = await client.patch(f"/api/v1/hubs/{hub['id']}/occupancy", headers=auth_headers(resp_a), json={"delta": 5})
        assert res.status_code == 403


async def test_p4_responder_no_qualifying_mission_returns_403():
    """Red-Team 1D: Responder with profile but NO missions at all -> 403 Forbidden."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p4_{unique_id}@resqnet.org", "Coord P4", UserRole.coordinator)
    resp_user = await create_test_user(f"resp_p4_{unique_id}@resqnet.org", "Resp P4", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub P4 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

    async with AsyncSessionLocal() as db_session:
        prof = Responder(user_id=resp_user.id, status=ResponderStatus.available)
        db_session.add(prof)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(f"/api/v1/hubs/{hub['id']}/occupancy", headers=auth_headers(resp_user), json={"delta": 5})
        assert res.status_code == 403


async def test_p5_offline_responder_returns_403():
    """Red-Team 1E: Responder profile is OFFLINE -> 403 Forbidden."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p5_{unique_id}@resqnet.org", "Coord P5", UserRole.coordinator)
    resp_user = await create_test_user(f"resp_p5_{unique_id}@resqnet.org", "Resp P5", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub P5 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

    async with AsyncSessionLocal() as db_session:
        prof = Responder(user_id=resp_user.id, status=ResponderStatus.offline)  # OFFLINE
        db_session.add(prof)
        await db_session.commit()
        await db_session.refresh(prof)

        mission = Mission(title="Mission Offline Resp", mission_type=MissionType.deliver_resource, status=MissionStatus.in_progress, responder_id=prof.id, hub_id=hub["id"])
        db_session.add(mission)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(f"/api/v1/hubs/{hub['id']}/occupancy", headers=auth_headers(resp_user), json={"delta": 5})
        assert res.status_code == 403
        assert "offline" in res.text.lower()


async def test_p6_inactive_mission_returns_403():
    """Red-Team 1F: Completed/rejected/cancelled mission CANNOT authorize occupancy update -> 403 Forbidden."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_p6_{unique_id}@resqnet.org", "Coord P6", UserRole.coordinator)
    resp_user = await create_test_user(f"resp_p6_{unique_id}@resqnet.org", "Resp P6", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub P6 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

    async with AsyncSessionLocal() as db_session:
        prof = Responder(user_id=resp_user.id, status=ResponderStatus.available)
        db_session.add(prof)
        await db_session.commit()
        await db_session.refresh(prof)

        # Mission is COMPLETED
        mission = Mission(title="Completed Mission", mission_type=MissionType.deliver_resource, status=MissionStatus.completed, responder_id=prof.id, hub_id=hub["id"])
        db_session.add(mission)
        await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(f"/api/v1/hubs/{hub['id']}/occupancy", headers=auth_headers(resp_user), json={"delta": 5})
        assert res.status_code == 403


async def test_r_responder_cannot_modify_status():
    """Req R: Responder CANNOT modify hub operational status directly."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_r_{unique_id}@resqnet.org", "Coord R", UserRole.coordinator)
    resp_user = await create_test_user(f"resp_r_{unique_id}@resqnet.org", "Resp R", UserRole.responder)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub R {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

        res_r = await client.patch(
            f"/api/v1/hubs/{hub['id']}/status",
            headers=auth_headers(resp_user),
            json={"status": HubStatus.closed.value},
        )
        assert res_r.status_code == 403


# ── Capacity Management Tests (Red-Team Gap 5) ───────────────────────────────

async def test_s_coordinator_can_modify_max_capacity():
    """Req S: Coordinator can increase max capacity."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_s_{unique_id}@resqnet.org", "Coord S", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Capacity Hub S {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 200, "current_occupancy": 150})).json()

        res_s = await client.patch(
            f"/api/v1/hubs/{hub['id']}/capacity",
            headers=auth_headers(coord),
            json={"max_capacity": 300},
        )
        assert res_s.status_code == 200
        data_s = res_s.json()
        assert data_s["max_capacity"] == 300
        assert data_s["available_capacity"] == 150
        assert data_s["status"] == HubStatus.open.value  # 150/300 = 50% < 85%


async def test_t_capacity_reduction_below_occupancy_rejected():
    """Red-Team 5: current=80, max=100 -> new max=70 returns HTTP 400."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_t_{unique_id}@resqnet.org", "Coord T", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Capacity Hub T {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 80})).json()

        # new max=70 (< 80) -> 400
        res_t = await client.patch(
            f"/api/v1/hubs/{hub['id']}/capacity",
            headers=auth_headers(coord),
            json={"max_capacity": 70},
        )
        assert res_t.status_code == 400
        assert "below current occupancy" in res_t.text.lower()


async def test_u_capacity_change_derives_correct_state():
    """Red-Team 5: current=80, max=100 -> new max=80 (FULL), new max=120 (OPEN)."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_u_{unique_id}@resqnet.org", "Coord U", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Capacity Hub U {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 80})).json()

        # new max=80 -> current == max -> FULL
        res_equal = await client.patch(f"/api/v1/hubs/{hub['id']}/capacity", headers=auth_headers(coord), json={"max_capacity": 80})
        assert res_equal.status_code == 200
        assert res_equal.json()["status"] == HubStatus.full.value

        # new max=120 -> 80/120 = 66.6% < 85% -> OPEN
        res_expand = await client.patch(f"/api/v1/hubs/{hub['id']}/capacity", headers=auth_headers(coord), json={"max_capacity": 120})
        assert res_expand.status_code == 200
        assert res_expand.json()["status"] == HubStatus.open.value


# ── Concurrency & Row Locking Test (Red-Team Gap 2) ───────────────────────────

async def test_v_concurrent_occupancy_updates_cannot_overbook():
    """
    Red-Team Gap 2: Concurrency test using SELECT FOR UPDATE row locking.
    max_capacity = 100, current = 90. Two concurrent +10 updates.
    Exactly one succeeds, exactly one fails/rejected. Final occupancy = 100, status = FULL.
    """
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_v_{unique_id}@resqnet.org", "Coord V", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Concurrent Hub {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 90})).json()
        hub_id = hub["id"]

    # Run 2 concurrent service calls via separate DB sessions
    async def make_update():
        async with AsyncSessionLocal() as session:
            try:
                res = await update_occupancy_service(session, hub_id=hub_id, delta=10, actor_user=coord)
                return ("SUCCESS", res)
            except Exception as exc:
                return ("FAILURE", str(exc))

    results = await asyncio.gather(make_update(), make_update())
    successes = [r for r in results if r[0] == "SUCCESS"]
    failures = [r for r in results if r[0] == "FAILURE"]

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}. Results: {results}"
    assert len(failures) == 1, f"Expected exactly 1 failure, got {len(failures)}. Results: {results}"

    # Verify final state in DB
    async with AsyncSessionLocal() as session:
        final_hub = await session.get(SafetyHub, hub_id)
        assert final_hub.current_occupancy == 100
        assert final_hub.status == HubStatus.full


# ── Audit Logging Tests (Red-Team Gap 6) ──────────────────────────────────────

async def test_w1_audit_events_created():
    """Req W / Red-Team 6: Audit rows actually created for creation, occupancy update, status close, capacity update."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_w1_{unique_id}@resqnet.org", "Coord W1", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Audit Hub W1 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 10},
        )
        hub_id = res_c.json()["id"]

        await client.patch(f"/api/v1/hubs/{hub_id}/occupancy", headers=auth_headers(coord), json={"delta": 10})
        await client.patch(f"/api/v1/hubs/{hub_id}/status", headers=auth_headers(coord), json={"status": HubStatus.closed.value})
        await client.patch(f"/api/v1/hubs/{hub_id}/status", headers=auth_headers(coord), json={"status": HubStatus.open.value})
        await client.patch(f"/api/v1/hubs/{hub_id}/capacity", headers=auth_headers(coord), json={"max_capacity": 150})

    async with AsyncSessionLocal() as db_session:
        audit_q = await db_session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "safety_hubs", AuditLog.entity_id == hub_id)
            .order_by(AuditLog.id)
        )
        actions = [a.action for a in audit_q.scalars().all()]
        assert "SAFETY_HUB_CREATED" in actions
        assert "SAFETY_HUB_OCCUPANCY_UPDATED" in actions
        assert "SAFETY_HUB_STATUS_CHANGED" in actions
        assert "SAFETY_HUB_CAPACITY_UPDATED" in actions


async def test_w2_failed_mutation_rolls_back_audit():
    """Red-Team 6: Failed mutation (e.g. overbooking) rolls back transaction and leaves NO misleading audit rows."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_w2_{unique_id}@resqnet.org", "Coord W2", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res_c = await client.post(
            "/api/v1/hubs",
            headers=auth_headers(coord),
            json={"name": f"Audit Hub W2 {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 90},
        )
        hub_id = res_c.json()["id"]

        # Failed attempt (+50 over-capacity) -> 400
        res_fail = await client.patch(f"/api/v1/hubs/{hub_id}/occupancy", headers=auth_headers(coord), json={"delta": 50})
        assert res_fail.status_code == 400

    async with AsyncSessionLocal() as db_session:
        audit_q = await db_session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "safety_hubs", AuditLog.entity_id == hub_id, AuditLog.action == "SAFETY_HUB_OCCUPANCY_UPDATED")
        )
        audit_rows = audit_q.scalars().all()
        assert len(audit_rows) == 0  # No audit row left for failed transaction!


# ── Routing Integration & Status Invariant Edge Cases (Red-Team Gap 4 & 7) ────

async def test_x_routing_integration_excludes_full_and_closed_hubs():
    """Req X / Red-Team 7: Step 6.9 Dijkstra routing excludes FULL and CLOSED hubs while accepting OPEN / NEAR_CAPACITY."""
    unique_id = uuid.uuid4().hex[:6]
    base_lat, base_lng = get_unique_coords()

    coord = await create_test_user(f"coord_x_{unique_id}@resqnet.org", "Coord X", UserRole.coordinator)
    cit = await create_test_user(f"citizen_x_{unique_id}@resqnet.org", "Citizen X", UserRole.citizen)

    async with AsyncSessionLocal() as db_session:
        hub_open = SafetyHub(name=f"Routing Open Hub {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, max_capacity=100, current_occupancy=10, status=HubStatus.open)
        hub_full = SafetyHub(name=f"Routing Full Hub {unique_id}", lat=base_lat + 0.01, lng=base_lng + 0.01, max_capacity=100, current_occupancy=100, status=HubStatus.full)
        hub_closed = SafetyHub(name=f"Routing Closed Hub {unique_id}", lat=base_lat + 0.005, lng=base_lng + 0.005, max_capacity=100, current_occupancy=10, status=HubStatus.closed)

        db_session.add_all([hub_open, hub_full, hub_closed])
        await db_session.commit()
        await db_session.refresh(hub_open)
        await db_session.refresh(hub_full)
        await db_session.refresh(hub_closed)

        start_node = Intersection(name=f"Start Node {unique_id}", lat=base_lat, lng=base_lng, is_hub=False)
        node_open = Intersection(name=f"Open Hub Node {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, is_hub=True, hub_id=hub_open.id)
        node_full = Intersection(name=f"Full Hub Node {unique_id}", lat=base_lat + 0.01, lng=base_lng + 0.01, is_hub=True, hub_id=hub_full.id)
        node_closed = Intersection(name=f"Closed Hub Node {unique_id}", lat=base_lat + 0.005, lng=base_lng + 0.005, is_hub=True, hub_id=hub_closed.id)

        db_session.add_all([start_node, node_open, node_full, node_closed])
        await db_session.commit()

        road_1 = Road(from_intersection_id=start_node.id, to_intersection_id=node_open.id, name="Clear Road to Open", status=RoadStatus.clear, distance_km=1.0, is_blocked=False, is_bidirectional=True)
        road_2 = Road(from_intersection_id=start_node.id, to_intersection_id=node_full.id, name="Clear Road to Full", status=RoadStatus.clear, distance_km=0.2, is_blocked=False, is_bidirectional=True)
        road_3 = Road(from_intersection_id=start_node.id, to_intersection_id=node_closed.id, name="Clear Road to Closed", status=RoadStatus.clear, distance_km=0.1, is_blocked=False, is_bidirectional=True)

        db_session.add_all([road_1, road_2, road_3])
        await db_session.commit()

        open_hub_id = hub_open.id
        full_hub_id = hub_full.id
        closed_hub_id = hub_closed.id
        road_ids = [road_1.id, road_2.id, road_3.id]
        node_ids = [start_node.id, node_open.id, node_full.id, node_closed.id]
        hub_ids = [open_hub_id, full_hub_id, closed_hub_id]

    invalidate_route_cache()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res_open = await client.post("/api/v1/routing/calculate", headers=auth_headers(cit), json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": open_hub_id})
            assert res_open.status_code == 200
            assert res_open.json()["success"] is True

            res_full = await client.post("/api/v1/routing/calculate", headers=auth_headers(cit), json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": full_hub_id})
            assert res_full.status_code == 200
            assert res_full.json()["success"] is False

            res_closed = await client.post("/api/v1/routing/calculate", headers=auth_headers(cit), json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": closed_hub_id})
            assert res_closed.status_code == 200
            assert res_closed.json()["success"] is False
    finally:
        async with AsyncSessionLocal() as db_session:
            await db_session.execute(delete(Road).where(Road.id.in_(road_ids)))
            await db_session.execute(delete(Intersection).where(Intersection.id.in_(node_ids)))
            await db_session.execute(delete(SafetyHub).where(SafetyHub.id.in_(hub_ids)))
            await db_session.commit()
        invalidate_route_cache()


async def test_y_status_override_arbitrary_full_prevented():
    """Red-Team 4: Coordinator requesting arbitrary status override (e.g. 'near_capacity' when occupancy is 10/100) derives state automatically."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_y_{unique_id}@resqnet.org", "Coord Y", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub Y {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100, "current_occupancy": 10})).json()

        # Request 'near_capacity' status override manually -> Service derives OPEN based on 10/100
        res_y = await client.patch(f"/api/v1/hubs/{hub['id']}/status", headers=auth_headers(coord), json={"status": HubStatus.near_capacity.value})
        assert res_y.status_code == 200
        assert res_y.json()["status"] == HubStatus.open.value  # Must be derived as OPEN!


async def test_z_no_physical_delete_endpoint():
    """Red-Team 8: Verifies no physical DELETE endpoint is exposed for safety hubs."""
    unique_id = uuid.uuid4().hex[:6]
    coord = await create_test_user(f"coord_z_{unique_id}@resqnet.org", "Coord Z", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        hub = (await client.post("/api/v1/hubs", headers=auth_headers(coord), json={"name": f"Hub Z {unique_id}", "lat": 12.9, "lng": 77.5, "max_capacity": 100})).json()

        res_del = await client.delete(f"/api/v1/hubs/{hub['id']}", headers=auth_headers(coord))
        assert res_del.status_code in [404, 405]  # Method Not Allowed or Not Found
