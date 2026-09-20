"""
ResQnet Missions & Responder Workflow Test Suite (Step 6.5)
Comprehensive test suite verifying:
- Mission creation by Coordinator (ASSIGNED state)
- Target validation (verify_incident -> cluster_id, survey_road -> road_id)
- Role authorization (Citizen/Fundraiser/Responder blocked from creation)
- Responder lifecycle: ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
- Responder rejection: ASSIGNED -> REJECTED
- Coordinator cancellation: IN_PROGRESS -> CANCELLED
- Reassignment of assigned/rejected missions
- Prevention of invalid state transitions
- Audit logging into audit_logs table
- Responder status synchronization (available -> deployed -> on_mission -> available)
- Non-mutation of ground truth tables (roads, hazards, hubs, field_surveys, incident status)
- Transaction rollback on failure and response security
"""
import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, text

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import engine, AsyncSessionLocal
from app.db.models import (
    User,
    UserRole,
    Responder,
    ResponderStatus,
    Mission,
    MissionStatus,
    MissionType,
    ReportCluster,
    ReportClusterStatus,
    Road,
    RoadStatus,
    HazardZone,
    SafetyHub,
    FieldSurvey,
    IncidentReport,
    ReportStatus,
    AuditLog,
    Intersection,
)


# ── Fixture Helpers ─────────────────────────────────────────────────────────

async def create_user_helper(email: str, full_name: str, role: UserRole) -> User:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        user = User(
            email=email.lower().strip(),
            full_name=full_name,
            hashed_password=get_password_hash("Secret123!"),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def create_responder_helper(user: User, status: ResponderStatus = ResponderStatus.available) -> Responder:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Responder).where(Responder.user_id == user.id))
        existing = result.scalar_one_or_none()
        if existing:
            existing.status = status
            await session.commit()
            await session.refresh(existing)
            return existing

        responder = Responder(
            user_id=user.id,
            ngo_name="Red Cross Test",
            status=status,
            last_known_lat=12.9716,
            last_known_lng=77.5946,
        )
        session.add(responder)
        await session.commit()
        await session.refresh(responder)
        return responder


async def create_cluster_helper(category: str = "flood") -> ReportCluster:
    async with AsyncSessionLocal() as session:
        cluster = ReportCluster(
            centroid_lat=12.9716,
            centroid_lng=77.5946,
            geom=f"SRID=4326;POINT(77.5946 12.9716)",
            report_count=1,
            dominant_category=category,
            status=ReportClusterStatus.open,
        )
        session.add(cluster)
        await session.commit()
        await session.refresh(cluster)
        return cluster


async def create_road_helper() -> Road:
    async with AsyncSessionLocal() as session:
        # Create start & end intersections
        i1 = Intersection(name="Node A", lat=12.90, lng=77.50, geom="SRID=4326;POINT(77.50 12.90)")
        i2 = Intersection(name="Node B", lat=12.91, lng=77.51, geom="SRID=4326;POINT(77.51 12.91)")
        session.add_all([i1, i2])
        await session.flush()

        road = Road(
            name="Test Expressway",
            from_intersection_id=i1.id,
            to_intersection_id=i2.id,
            distance_km=1.5,
            status=RoadStatus.clear,
            geom="SRID=4326;LINESTRING(77.50 12.90, 77.51 12.91)",
        )
        session.add(road)
        await session.commit()
        await session.refresh(road)
        return road


# ── Tests ───────────────────────────────────────────────────────────────────

def test_coordinator_creates_mission_success():
    """Verify coordinator creates a mission in ASSIGNED state with cluster and audit record."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m1_{uid}@example.com", "Coord Alice", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_m1_{uid}@example.com", "Resp Bob", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Verify South Bridge Flood",
                        "description": "Inspect reported rising water level",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )

            assert res.status_code == 201
            data = res.json()
            assert data["status"] == "assigned"
            assert data["mission_type"] == "verify_incident"
            assert data["responder_id"] == responder.id
            assert data["cluster_id"] == cluster.id
            assert "password" not in data

            # Verify in DB and verify audit record
            mission_id = data["id"]
            async with AsyncSessionLocal() as session:
                db_m = await session.get(Mission, mission_id)
                assert db_m is not None
                assert db_m.status == MissionStatus.assigned

                # Verify audit log
                audit = (
                    await session.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "missions",
                            AuditLog.entity_id == mission_id,
                            AuditLog.action == "MISSION_CREATED",
                        )
                    )
                ).scalar_one_or_none()
                assert audit is not None
                assert audit.actor_id == coord.id
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_unauthorized_roles_cannot_create_missions():
    """Verify citizen, fundraiser, and unauthenticated requests are blocked from mission creation."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"cit_m2_{uid}@example.com", "Cit User", UserRole.citizen)
            fundraiser = await create_user_helper(f"fund_m2_{uid}@example.com", "Fund User", UserRole.fundraiser)
            resp_user = await create_user_helper(f"resp_m2_{uid}@example.com", "Resp User", UserRole.responder)

            cit_token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})
            fund_token = create_access_token({"sub": str(fundraiser.id), "email": fundraiser.email, "role": "fundraiser"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            cluster = await create_cluster_helper("landslide")
            payload = {
                "mission_type": "verify_incident",
                "title": "Unauthorized Create",
                "cluster_id": cluster.id,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Unauthenticated -> 401
                assert (await ac.post("/api/v1/missions", json=payload)).status_code == 401
                # 2. Citizen -> 403
                assert (await ac.post("/api/v1/missions", headers={"Authorization": f"Bearer {cit_token}"}, json=payload)).status_code == 403
                # 3. Fundraiser -> 403
                assert (await ac.post("/api/v1/missions", headers={"Authorization": f"Bearer {fund_token}"}, json=payload)).status_code == 403
                # 4. Responder -> 403 (Responders cannot self-create/assign missions)
                assert (await ac.post("/api/v1/missions", headers={"Authorization": f"Bearer {resp_token}"}, json=payload)).status_code == 403
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_target_validation_for_mission_types():
    """Verify target requirements: verify_incident requires cluster_id, survey_road requires road_id."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m3_{uid}@example.com", "Coord User", UserRole.coordinator)
            token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. verify_incident without cluster_id -> 400
                res1 = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"mission_type": "verify_incident", "title": "Missing Cluster"},
                )
                assert res1.status_code == 400
                assert res1.json()["error"]["code"] == "CLUSTER_REQUIRED_FOR_INCIDENT_MISSION"

                # 2. survey_road without road_id -> 400
                res2 = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"mission_type": "survey_road", "title": "Missing Road"},
                )
                assert res2.status_code == 400
                assert res2.json()["error"]["code"] == "ROAD_REQUIRED_FOR_ROAD_MISSION"

                # 3. survey_road with valid road -> 201
                road = await create_road_helper()
                res3 = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"mission_type": "survey_road", "title": "Inspect NH48", "road_id": road.id},
                )
                assert res3.status_code == 201
                assert res3.json()["road_id"] == road.id
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_offline_responder_cannot_be_assigned():
    """Verify that an offline responder is rejected from new mission assignments."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m4_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_m4_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.offline)
            cluster = await create_cluster_helper("fire")

            token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Fire Inspection",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )
            assert res.status_code == 400
            assert res.json()["error"]["code"] == "RESPONDER_OFFLINE"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_full_responder_mission_lifecycle():
    """Verify complete valid transition: ASSIGNED -> ACCEPTED -> IN_PROGRESS -> COMPLETED."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m5_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_m5_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Create Mission (ASSIGNED)
                res_create = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Lifecycle Test Mission",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )
                assert res_create.status_code == 201
                mission_id = res_create.json()["id"]

                # 2. Responder Accepts Mission (ASSIGNED -> ACCEPTED)
                res_accept = await ac.post(
                    f"/api/v1/missions/{mission_id}/accept",
                    headers={"Authorization": f"Bearer {resp_token}"},
                )
                assert res_accept.status_code == 200
                assert res_accept.json()["status"] == "accepted"
                assert res_accept.json()["accepted_at"] is not None

                # Verify responder status updated to DEPLOYED
                async with AsyncSessionLocal() as session:
                    db_resp = await session.get(Responder, responder.id)
                    assert db_resp.status == ResponderStatus.deployed

                # 3. Responder Starts Mission (ACCEPTED -> IN_PROGRESS)
                res_start = await ac.post(
                    f"/api/v1/missions/{mission_id}/start",
                    headers={"Authorization": f"Bearer {resp_token}"},
                )
                assert res_start.status_code == 200
                assert res_start.json()["status"] == "in_progress"

                # Verify responder status updated to ON_MISSION
                async with AsyncSessionLocal() as session:
                    db_resp = await session.get(Responder, responder.id)
                    assert db_resp.status == ResponderStatus.on_mission

                # 4. Responder Completes Mission (IN_PROGRESS -> COMPLETED)
                res_comp = await ac.post(
                    f"/api/v1/missions/{mission_id}/complete",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"notes": "Field inspection completed successfully"},
                )
                assert res_comp.status_code == 200
                assert res_comp.json()["status"] == "completed"
                assert res_comp.json()["completed_at"] is not None

                # Verify responder status reset to AVAILABLE
                async with AsyncSessionLocal() as session:
                    db_resp = await session.get(Responder, responder.id)
                    assert db_resp.status == ResponderStatus.available
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_unassigned_responder_cannot_accept():
    """Verify that a responder cannot accept a mission assigned to a different responder."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m6_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp1_user = await create_user_helper(f"resp1_m6_{uid}@example.com", "Resp One", UserRole.responder)
            resp2_user = await create_user_helper(f"resp2_m6_{uid}@example.com", "Resp Two", UserRole.responder)
            
            resp1 = await create_responder_helper(resp1_user, ResponderStatus.available)
            resp2 = await create_responder_helper(resp2_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp2_token = create_access_token({"sub": str(resp2_user.id), "email": resp2_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_create = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Assigned to Resp 1",
                        "responder_id": resp1.id,
                        "cluster_id": cluster.id,
                    },
                )
                mission_id = res_create.json()["id"]

                # Responder 2 attempts to accept -> 403 Forbidden
                res_accept = await ac.post(
                    f"/api/v1/missions/{mission_id}/accept",
                    headers={"Authorization": f"Bearer {resp2_token}"},
                )
                assert res_accept.status_code == 403
                assert res_accept.json()["error"]["code"] == "MISSION_NOT_ASSIGNED_TO_CALLER"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_invalid_state_transitions_rejected():
    """Verify that illegal transitions (e.g. ASSIGNED -> IN_PROGRESS, ASSIGNED -> COMPLETED) are rejected."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m7_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_m7_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_create = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Transition Test",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )
                mission_id = res_create.json()["id"]

                # 1. Attempt ASSIGNED -> IN_PROGRESS (Must be ACCEPTED first) -> 409 Conflict
                res_start = await ac.post(
                    f"/api/v1/missions/{mission_id}/start",
                    headers={"Authorization": f"Bearer {resp_token}"},
                )
                assert res_start.status_code == 409

                # 2. Attempt ASSIGNED -> COMPLETED -> 409 Conflict
                res_comp = await ac.post(
                    f"/api/v1/missions/{mission_id}/complete",
                    headers={"Authorization": f"Bearer {resp_token}"},
                )
                assert res_comp.status_code == 409
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_responder_rejection_and_coordinator_reassignment():
    """Verify ASSIGNED -> REJECTED and subsequent coordinator reassignment back to ASSIGNED."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m8_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp1_user = await create_user_helper(f"resp1_m8_{uid}@example.com", "Resp One", UserRole.responder)
            resp2_user = await create_user_helper(f"resp2_m8_{uid}@example.com", "Resp Two", UserRole.responder)

            resp1 = await create_responder_helper(resp1_user, ResponderStatus.available)
            resp2 = await create_responder_helper(resp2_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp1_token = create_access_token({"sub": str(resp1_user.id), "email": resp1_user.email, "role": "responder"})
            resp2_token = create_access_token({"sub": str(resp2_user.id), "email": resp2_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Create Mission assigned to Resp 1
                res_create = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Rejection Test Mission",
                        "responder_id": resp1.id,
                        "cluster_id": cluster.id,
                    },
                )
                mission_id = res_create.json()["id"]

                # 2. Resp 1 Rejects Mission
                res_rej = await ac.post(
                    f"/api/v1/missions/{mission_id}/reject",
                    headers={"Authorization": f"Bearer {resp1_token}"},
                    json={"notes": "Vehicle breakdown"},
                )
                assert res_rej.status_code == 200
                assert res_rej.json()["status"] == "rejected"

                # 3. Coordinator Reassigns Mission to Resp 2
                res_reassign = await ac.post(
                    f"/api/v1/missions/{mission_id}/reassign",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={"responder_id": resp2.id, "notes": "Reassigned due to vehicle issue"},
                )
                assert res_reassign.status_code == 200
                assert res_reassign.json()["status"] == "assigned"
                assert res_reassign.json()["responder_id"] == resp2.id

                # 4. Resp 2 can now accept
                res_accept = await ac.post(
                    f"/api/v1/missions/{mission_id}/accept",
                    headers={"Authorization": f"Bearer {resp2_token}"},
                )
                assert res_accept.status_code == 200
                assert res_accept.json()["status"] == "accepted"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_coordinator_cancel_mission():
    """Verify coordinator cancels an in-progress mission (IN_PROGRESS -> CANCELLED)."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_m9_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_m9_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_create = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Cancellation Mission",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )
                mission_id = res_create.json()["id"]

                # Accept & Start
                await ac.post(f"/api/v1/missions/{mission_id}/accept", headers={"Authorization": f"Bearer {resp_token}"})
                await ac.post(f"/api/v1/missions/{mission_id}/start", headers={"Authorization": f"Bearer {resp_token}"})

                # Responder cannot cancel -> 403
                res_resp_cancel = await ac.post(
                    f"/api/v1/missions/{mission_id}/cancel",
                    headers={"Authorization": f"Bearer {resp_token}"},
                )
                assert res_resp_cancel.status_code == 403

                # Coordinator cancels -> 200
                res_coord_cancel = await ac.post(
                    f"/api/v1/missions/{mission_id}/cancel",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={"notes": "Situation resolved by local authorities"},
                )
                assert res_coord_cancel.status_code == 200
                assert res_coord_cancel.json()["status"] == "cancelled"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_mission_operations_never_modify_ground_truth():
    """Verify that mission lifecycle actions NEVER mutate roads, hazards, hubs, or field surveys."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_gt_{uid}@example.com", "Coord GT", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_gt_{uid}@example.com", "Resp GT", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("landslide")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncSessionLocal() as session:
                roads_before = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_before = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_before = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_before = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/missions",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={
                        "mission_type": "verify_incident",
                        "title": "Ground Truth Protection Test",
                        "responder_id": responder.id,
                        "cluster_id": cluster.id,
                    },
                )
                m_id = res.json()["id"]
                await ac.post(f"/api/v1/missions/{m_id}/accept", headers={"Authorization": f"Bearer {resp_token}"})
                await ac.post(f"/api/v1/missions/{m_id}/start", headers={"Authorization": f"Bearer {resp_token}"})
                await ac.post(f"/api/v1/missions/{m_id}/complete", headers={"Authorization": f"Bearer {resp_token}"})

            async with AsyncSessionLocal() as session:
                roads_after = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_after = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_after = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_after = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()

            assert roads_before == roads_after
            assert hazards_before == hazards_after
            assert hubs_before == hubs_after
            assert surveys_before == surveys_after
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_mission_transaction_rollback_on_failure():
    """Verify that a database failure during mission state change explicitly invokes db.rollback()."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_roll_{uid}@example.com", "Coord Roll", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_roll_{uid}@example.com", "Resp Roll", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)
            cluster = await create_cluster_helper("flood")

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})

            with patch("sqlalchemy.ext.asyncio.AsyncSession.commit", side_effect=RuntimeError("Simulated DB Mission Error")):
                with patch("sqlalchemy.ext.asyncio.AsyncSession.rollback", new_callable=AsyncMock) as mock_rollback:
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        with pytest.raises(RuntimeError, match="Simulated DB Mission Error"):
                            await ac.post(
                                "/api/v1/missions",
                                headers={"Authorization": f"Bearer {coord_token}"},
                                json={
                                    "mission_type": "verify_incident",
                                    "title": "Rollback Test",
                                    "responder_id": responder.id,
                                    "cluster_id": cluster.id,
                                },
                            )
                    assert mock_rollback.called, "db.rollback() MUST be called when persistence fails"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_coordinator_list_responders_directory_route_resolution():
    """Verify GET /api/v1/missions/responders resolves cleanly and is not intercepted by /{mission_id}."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            coord = await create_user_helper(f"coord_dir_{uid}@example.com", "Coord Dir", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_dir_{uid}@example.com", "Resp Directory", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.available)

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            cit_user = await create_user_helper(f"cit_dir_{uid}@example.com", "Cit Dir", UserRole.citizen)
            cit_token = create_access_token({"sub": str(cit_user.id), "email": cit_user.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Unauthenticated -> 401
                res_unauth = await ac.get("/api/v1/missions/responders")
                assert res_unauth.status_code == 401

                # 2. Citizen role -> 403 Forbidden
                res_cit = await ac.get("/api/v1/missions/responders", headers={"Authorization": f"Bearer {cit_token}"})
                assert res_cit.status_code == 403

                # 3. Coordinator role -> 200 OK (Clean route match, NOT 422 from dynamic /{mission_id})
                res_coord = await ac.get("/api/v1/missions/responders", headers={"Authorization": f"Bearer {coord_token}"})
                assert res_coord.status_code == 200
                data = res_coord.json()
                assert isinstance(data, list)
                matched = [r for r in data if r["id"] == responder.id]
                assert len(matched) == 1
                assert matched[0]["full_name"] == "Resp Directory"
                assert matched[0]["ngo_name"] == "Red Cross Test"
                assert matched[0]["status"] == "available"
                # Ensure no sensitive hash or password leaked
                assert "hashed_password" not in matched[0]
                assert "password" not in matched[0]
        finally:
            await engine.dispose()

    asyncio.run(_run())
