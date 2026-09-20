"""
ResQnet Step 6.14 — Offline-First Synchronization & Conflict Resolution Test Suite
Comprehensive tests for:
- Mission state policy (assigned/accepted/in_progress/completed/cancelled/rejected)
- RBAC enforcement (citizen/responder/fundraiser roles)
- Atomic idempotency (Cases A, B, C)
- Concurrency (10-way identical request)
- Mixed batch partial success
- Server-owned _meta (client spoof protection)
- Ownership enforcement on duplicate operation_id
- Inactive/offline responder rejection
- Batch size limit enforcement
- Unknown operation type rejection
- Invalid verification_outcome rejection
- Rollback leaves operation_id reusable
- Audit log behavior
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, text

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import engine, AsyncSessionLocal
from app.db.models import (
    User, UserRole,
    Responder, ResponderStatus,
    Mission, MissionStatus, MissionType,
    FieldSurvey,
    IncidentReport, ReportStatus,
    ReportCluster, ReportClusterStatus,
    SyncQueueLog,
    AuditLog,
    Road, RoadStatus,
    Intersection,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

async def create_user(email: str, role: UserRole) -> User:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(User).where(User.email == email.lower()))
        u = res.scalar_one_or_none()
        if u:
            return u
        u = User(
            email=email.lower(),
            full_name=f"Test {role.value}",
            hashed_password=get_password_hash("Secret123!"),
            role=role,
            is_active=True,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


async def create_responder(user: User, status: ResponderStatus = ResponderStatus.available) -> Responder:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(Responder).where(Responder.user_id == user.id))
        existing = res.scalar_one_or_none()
        if existing:
            existing.status = status
            await s.commit()
            await s.refresh(existing)
            return existing
        r = Responder(
            user_id=user.id,
            ngo_name="Test NGO",
            status=status,
            last_known_lat=12.9716,
            last_known_lng=77.5946,
        )
        s.add(r)
        await s.commit()
        await s.refresh(r)
        return r


async def create_mission(responder: Responder, status: MissionStatus) -> Mission:
    async with AsyncSessionLocal() as s:
        m = Mission(
            mission_type=MissionType.verify_incident,
            status=status,
            title=f"Test Mission {uuid.uuid4().hex[:6]}",
            responder_id=responder.id,
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        return m


def auth_headers(user: User) -> dict:
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def sync_url():
    return "/api/v1/sync/replay"


async def count_reports() -> int:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(func.count()).select_from(IncidentReport))
        return res.scalar_one()


async def count_surveys() -> int:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(func.count()).select_from(FieldSurvey))
        return res.scalar_one()


async def count_sync_logs_for_op(op_id: str) -> int:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(func.count()).select_from(SyncQueueLog).where(SyncQueueLog.operation_id == op_id))
        return res.scalar_one()


async def get_sync_log(op_id: str) -> SyncQueueLog:
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(SyncQueueLog).where(SyncQueueLog.operation_id == op_id))
        return res.scalar_one_or_none()


# ── Test Classes ──────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────────
# 1. MISSION STATE POLICY
# ──────────────────────────────────────────────────────────────────────────────

def test_field_survey_assigned_mission_conflict():
    """FieldSurvey replay for ASSIGNED mission → conflict (responder hasn't accepted yet)."""
    async def _run():
        user = await create_user(f"resp_assigned_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.assigned)

        op_id = str(uuid.uuid4())
        before_surveys = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "mission_id": mission.id,
                        "verification_outcome": "road_blocked",
                        "hazard_level": 3,
                    }
                }]
            })

        assert res.status_code == 200, res.text
        data = res.json()
        assert data["results"][0]["status"] == "conflict"
        assert "assigned" in data["results"][0]["conflict_notes"].lower()

        # No FieldSurvey created
        assert await count_surveys() == before_surveys

        # sync_queue_log has conflict entry
        log = await get_sync_log(op_id)
        assert log is not None
        assert log.status == "conflict"

        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_accepted_mission_success():
    """FieldSurvey replay for ACCEPTED mission → accepted."""
    async def _run():
        user = await create_user(f"resp_accepted_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.accepted)

        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "mission_id": mission.id,
                        "verification_outcome": "confirmed_hazard",
                        "hazard_level": 2,
                    }
                }]
            })

        assert res.status_code == 200, res.text
        data = res.json()
        assert data["results"][0]["status"] == "accepted"
        assert data["results"][0]["server_entity_id"] is not None

        log = await get_sync_log(op_id)
        assert log.status == "accepted"
        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_in_progress_mission_success():
    """FieldSurvey replay for IN_PROGRESS mission → accepted."""
    async def _run():
        user = await create_user(f"resp_inprog_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.in_progress)

        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "mission_id": mission.id,
                        "verification_outcome": "no_hazard_found",
                        "hazard_level": 1,
                    }
                }]
            })

        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["status"] == "accepted"
        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_completed_mission_conflict():
    """FieldSurvey replay for COMPLETED mission → conflict."""
    async def _run():
        user = await create_user(f"resp_completed_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.completed)

        op_id = str(uuid.uuid4())
        before = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "conflict"
        assert await count_surveys() == before
        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_cancelled_mission_conflict():
    """FieldSurvey replay for CANCELLED mission → conflict."""
    async def _run():
        user = await create_user(f"resp_cancelled_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.cancelled)

        op_id = str(uuid.uuid4())
        before = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "false_report"}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "conflict"
        assert await count_surveys() == before
        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_rejected_mission_conflict():
    """FieldSurvey replay for REJECTED mission → conflict."""
    async def _run():
        user = await create_user(f"resp_rejected_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.rejected)

        op_id = str(uuid.uuid4())
        before = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "no_hazard_found"}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "conflict"
        assert await count_surveys() == before
        await engine.dispose()

    asyncio.run(_run())


def test_field_survey_wrong_responder_conflict():
    """FieldSurvey for mission owned by another responder → conflict."""
    async def _run():
        owner_user = await create_user(f"resp_owner_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        other_user = await create_user(f"resp_other_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        owner_resp = await create_responder(owner_user)
        await create_responder(other_user)
        mission = await create_mission(owner_resp, MissionStatus.accepted)

        op_id = str(uuid.uuid4())
        before = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(other_user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "conflict"
        assert await count_surveys() == before
        await engine.dispose()

    asyncio.run(_run())


def test_inactive_responder_rejected():
    """Offline/inactive responder → rejected."""
    async def _run():
        user = await create_user(f"resp_offline_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user, status=ResponderStatus.offline)
        mission = await create_mission(resp, MissionStatus.accepted)

        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })

        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["status"] == "rejected"
        assert "inactive" in data["results"][0]["conflict_notes"].lower()
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 2. RBAC
# ──────────────────────────────────────────────────────────────────────────────

def test_citizen_can_submit_report():
    """Citizen replay of submit_report → accepted."""
    async def _run():
        user = await create_user(f"citizen_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9716, "lng": 77.5946}
                }]
            })

        assert res.status_code == 200
        data = res.json()
        assert data["results"][0]["status"] == "accepted"
        assert data["results"][0]["server_entity_id"] is not None

        # Verify report is UNVERIFIED
        report_id = data["results"][0]["server_entity_id"]
        async with AsyncSessionLocal() as s:
            report = await s.get(IncidentReport, report_id)
        assert report.status == ReportStatus.unverified
        assert report.submitted_offline is True

        await engine.dispose()

    asyncio.run(_run())


def test_citizen_cannot_submit_field_survey():
    """Citizen cannot submit field_survey → rejected."""
    async def _run():
        user = await create_user(f"citizen_nosurvey_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": 999, "verification_outcome": "road_blocked"}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "rejected"
        await engine.dispose()

    asyncio.run(_run())


def test_responder_cannot_submit_report():
    """Responder cannot replay submit_report → rejected."""
    async def _run():
        user = await create_user(f"resp_noreport_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        await create_responder(user)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "test-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.0, "lng": 77.0}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "rejected"
        await engine.dispose()

    asyncio.run(_run())


def test_fundraiser_blocked_from_all_sync():
    """Fundraiser cannot replay any sync operation."""
    async def _run():
        user = await create_user(f"fundraiser_{uuid.uuid4().hex[:6]}@test.com", UserRole.fundraiser)

        for op_type, payload in [
            ("submit_report", {"category": "flood", "lat": 12.0, "lng": 77.0}),
            ("field_survey", {"mission_id": 999, "verification_outcome": "road_blocked"}),
        ]:
            op_id = str(uuid.uuid4())
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(sync_url(), headers=auth_headers(user), json={
                    "client_id": "test-device",
                    "operations": [{
                        "operation_id": op_id,
                        "operation_type": op_type,
                        "client_timestamp": datetime.now(timezone.utc).isoformat(),
                        "payload": payload,
                    }]
                })

            assert res.status_code == 200
            assert res.json()["results"][0]["status"] == "rejected", \
                f"{op_type} should be rejected for fundraiser"

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 3. IDEMPOTENCY — CASE A (SUCCESS)
# ──────────────────────────────────────────────────────────────────────────────

def test_idempotency_case_a_success():
    """Duplicate operation_id for successful operation → returns cached result, exactly one entity."""
    async def _run():
        user = await create_user(f"citizen_idem_a_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())
        before_reports = await count_reports()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # First request
            r1 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "fire", "lat": 12.9, "lng": 77.5}
                }]
            })
            # Second request — same op_id
            r2 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "fire", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert r1.status_code == 200
        assert r2.status_code == 200
        d1 = r1.json()["results"][0]
        d2 = r2.json()["results"][0]
        assert d1["status"] == "accepted"
        assert d2["status"] == "accepted"
        # Same entity returned
        assert d1["server_entity_id"] == d2["server_entity_id"]

        # Exactly ONE report created
        after_reports = await count_reports()
        assert after_reports == before_reports + 1

        # Exactly one sync_queue_log row
        log_count = await count_sync_logs_for_op(op_id)
        assert log_count == 1

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 4. IDEMPOTENCY — CASE B (DETERMINISTIC CONFLICT)
# ──────────────────────────────────────────────────────────────────────────────

def test_idempotency_case_b_deterministic_conflict():
    """Duplicate replay of conflicted operation → returns cached conflict, no domain entity created."""
    async def _run():
        user = await create_user(f"resp_idem_b_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.assigned)  # Conflict trigger

        op_id = str(uuid.uuid4())
        before = await count_surveys()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # First request → conflict
            r1 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })
            # Second request — same op_id
            r2 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })

        assert r1.json()["results"][0]["status"] == "conflict"
        assert r2.json()["results"][0]["status"] == "conflict"

        # No FieldSurvey created after either attempt
        assert await count_surveys() == before

        # Exactly one sync_queue_log row
        assert await count_sync_logs_for_op(op_id) == 1

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 5. IDEMPOTENCY — CASE C (TRANSACTION ROLLBACK — operation_id REUSABLE)
# ──────────────────────────────────────────────────────────────────────────────

def test_idempotency_case_c_rollback_releases_operation_id():
    """
    Unexpected exception during domain processing rolls back EVERYTHING including
    sync_queue_log reservation. Same operation_id is then successfully retried.
    """
    async def _run():
        user = await create_user(f"citizen_idem_c_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())
        before_reports = await count_reports()

        # Patch to simulate unexpected exception in clustering (after report flush)
        # We patch specifically the cluster call, which happens AFTER outer commit.
        # Instead, patch the IncidentReport.add to raise on first call.
        original_add = None
        call_count = [0]

        from sqlalchemy.ext.asyncio import AsyncSession as _AS

        original_flush = _AS.flush

        async def patched_flush(self, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 2:  # Second flush = after report add, inside savepoint
                raise RuntimeError("Simulated unexpected DB error")
            return await original_flush(self, *args, **kwargs)

        with patch.object(_AS, 'flush', patched_flush):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r1 = await ac.post(sync_url(), headers=auth_headers(user), json={
                    "client_id": "dev-c",
                    "operations": [{
                        "operation_id": op_id,
                        "operation_type": "submit_report",
                        "client_timestamp": datetime.now(timezone.utc).isoformat(),
                        "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                    }]
                })

        # First request: should be rejected due to error, savepoint rolled back
        assert r1.status_code == 200
        d1 = r1.json()["results"][0]
        assert d1["status"] == "rejected"

        # sync_queue_log must NOT have the operation_id (rolled back)
        assert await count_sync_logs_for_op(op_id) == 0
        # No report created
        assert await count_reports() == before_reports

        # Second request (retry) with same operation_id must now succeed
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r2 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-c",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert r2.status_code == 200
        d2 = r2.json()["results"][0]
        assert d2["status"] == "accepted"
        assert d2["server_entity_id"] is not None

        # Exactly one report now exists for this op
        assert await count_reports() == before_reports + 1
        assert await count_sync_logs_for_op(op_id) == 1

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 6. CONCURRENCY — 10-WAY IDENTICAL REQUESTS
# ──────────────────────────────────────────────────────────────────────────────

def test_10_concurrent_identical_requests_one_entity():
    """10 simultaneous requests with same operation_id → exactly one domain entity."""
    async def _run():
        user = await create_user(f"citizen_conc_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())
        before = await count_reports()

        async def single_request():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                return await ac.post(sync_url(), headers=auth_headers(user), json={
                    "client_id": "conc-device",
                    "operations": [{
                        "operation_id": op_id,
                        "operation_type": "submit_report",
                        "client_timestamp": datetime.now(timezone.utc).isoformat(),
                        "payload": {"category": "landslide", "lat": 12.9, "lng": 77.5}
                    }]
                })

        # Launch 10 concurrent requests
        responses = await asyncio.gather(*[single_request() for _ in range(10)])

        # All should succeed at the HTTP level
        assert all(r.status_code == 200 for r in responses)

        statuses = [r.json()["results"][0]["status"] for r in responses]
        entity_ids = [r.json()["results"][0]["server_entity_id"] for r in responses if r.json()["results"][0]["status"] == "accepted"]

        # At least one must be accepted
        assert "accepted" in statuses, f"Expected at least one accepted, got: {statuses}"

        # All accepted must have the same entity_id (cached)
        assert len(set(entity_ids)) == 1, f"Got multiple entity IDs: {entity_ids}"

        # Exactly ONE report created in the database
        after = await count_reports()
        assert after == before + 1, f"Expected exactly 1 new report, got {after - before}"

        # Exactly ONE sync_queue_log row
        assert await count_sync_logs_for_op(op_id) == 1

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 7. MIXED BATCH PARTIAL SUCCESS
# ──────────────────────────────────────────────────────────────────────────────

def test_mixed_batch_partial_success():
    """
    Batch of 3 operations:
    #1: valid citizen report → accepted
    #2: field survey for assigned mission → conflict
    #3: valid field survey (accepted mission) → accepted
    """
    async def _run():
        citizen = await create_user(f"citizen_mix_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        resp_user = await create_user(f"resp_mix_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        responder = await create_responder(resp_user)
        assigned_mission = await create_mission(responder, MissionStatus.assigned)
        accepted_mission = await create_mission(responder, MissionStatus.accepted)

        # Op 1: citizen report
        op1_id = str(uuid.uuid4())
        # Op 2: field survey for assigned mission (conflict)
        op2_id = str(uuid.uuid4())
        # Op 3: field survey for accepted mission (success)
        op3_id = str(uuid.uuid4())

        before_reports = await count_reports()
        before_surveys = await count_surveys()

        # Send op1 as citizen, ops 2+3 as responder in separate batches
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r1 = await ac.post(sync_url(), headers=auth_headers(citizen), json={
                "client_id": "mix-device",
                "operations": [{
                    "operation_id": op1_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 13.0, "lng": 77.6}
                }]
            })
            r23 = await ac.post(sync_url(), headers=auth_headers(resp_user), json={
                "client_id": "mix-device",
                "operations": [
                    {
                        "operation_id": op2_id,
                        "operation_type": "field_survey",
                        "client_timestamp": datetime.now(timezone.utc).isoformat(),
                        "payload": {"mission_id": assigned_mission.id, "verification_outcome": "road_blocked"}
                    },
                    {
                        "operation_id": op3_id,
                        "operation_type": "field_survey",
                        "client_timestamp": datetime.now(timezone.utc).isoformat(),
                        "payload": {"mission_id": accepted_mission.id, "verification_outcome": "confirmed_hazard"}
                    }
                ]
            })

        assert r1.status_code == 200
        assert r23.status_code == 200

        # Op1 accepted
        r1_result = r1.json()["results"][0]
        assert r1_result["status"] == "accepted", r1_result
        assert r1_result["server_entity_id"] is not None

        r23_results = r23.json()["results"]
        op2_res = next(r for r in r23_results if r["operation_id"] == op2_id)
        op3_res = next(r for r in r23_results if r["operation_id"] == op3_id)

        # Op2 conflict (assigned mission)
        assert op2_res["status"] == "conflict", op2_res
        # Op3 accepted
        assert op3_res["status"] == "accepted", op3_res
        assert op3_res["server_entity_id"] is not None

        # Database: 1 new report, 1 new survey, no survey for op2
        assert await count_reports() == before_reports + 1
        assert await count_surveys() == before_surveys + 1

        # sync_queue_log
        log2 = await get_sync_log(op2_id)
        log3 = await get_sync_log(op3_id)
        assert log2.status == "conflict"
        assert log3.status == "accepted"

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 8. _meta SPOOF PROTECTION
# ──────────────────────────────────────────────────────────────────────────────

def test_client_meta_spoofing_ignored():
    """Client-supplied _meta.user_id is ignored; server stamps JWT identity."""
    async def _run():
        user = await create_user(f"citizen_spoof_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "spoof-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "category": "fire",
                        "lat": 12.9, "lng": 77.5,
                        "_meta": {"user_id": 9999, "user_role": "coordinator"}  # Attempted spoof
                    }
                }]
            })

        assert res.status_code == 200
        data = res.json()["results"][0]
        assert data["status"] == "accepted"

        # Verify stored _meta has authenticated user ID, not spoofed value
        log = await get_sync_log(op_id)
        assert log is not None
        stored_meta = (log.payload or {}).get("_meta", {})
        assert stored_meta.get("user_id") == user.id
        assert stored_meta.get("user_id") != 9999

        await engine.dispose()

    asyncio.run(_run())


def test_cross_user_duplicate_ownership_rejected():
    """Duplicate operation_id submitted by different user → rejected."""
    async def _run():
        user1 = await create_user(f"citizen_own1_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        user2 = await create_user(f"citizen_own2_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # User1 creates the operation
            await ac.post(sync_url(), headers=auth_headers(user1), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })
            # User2 tries to replay same operation_id
            r2 = await ac.post(sync_url(), headers=auth_headers(user2), json={
                "client_id": "dev-2",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert r2.status_code == 200
        assert r2.json()["results"][0]["status"] == "rejected"
        assert "different authenticated user" in r2.json()["results"][0]["conflict_notes"].lower()

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 9. BATCH SIZE LIMIT
# ──────────────────────────────────────────────────────────────────────────────

def test_batch_size_limit_enforced():
    """Batch with >50 operations → 422 validation error."""
    async def _run():
        user = await create_user(f"citizen_batchlim_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)

        operations = [
            {
                "operation_id": str(uuid.uuid4()),
                "operation_type": "submit_report",
                "client_timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
            }
            for _ in range(51)
        ]

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-limit",
                "operations": operations
            })

        assert res.status_code == 422, f"Expected 422, got {res.status_code}"
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 10. UNKNOWN OPERATION TYPE
# ──────────────────────────────────────────────────────────────────────────────

def test_unknown_operation_type_rejected():
    """Unknown operation type → rejected."""
    async def _run():
        user = await create_user(f"citizen_unkop_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "delete_everything",
                    "payload": {}
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "rejected"
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 11. INVALID VERIFICATION OUTCOME
# ──────────────────────────────────────────────────────────────────────────────

def test_invalid_verification_outcome_rejected():
    """Invalid verification_outcome enum → rejected."""
    async def _run():
        user = await create_user(f"resp_badoutcome_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.accepted)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "mission_id": mission.id,
                        "verification_outcome": "confirmed"  # INVALID — must be confirmed_hazard etc.
                    }
                }]
            })

        assert res.status_code == 200
        assert res.json()["results"][0]["status"] == "rejected"
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 12. UNAUTHENTICATED REQUEST
# ──────────────────────────────────────────────────────────────────────────────

def test_unauthenticated_request_rejected():
    """Request without JWT → 401."""
    async def _run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), json={
                "client_id": "no-auth-device",
                "operations": [{
                    "operation_id": str(uuid.uuid4()),
                    "operation_type": "submit_report",
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert res.status_code == 401
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 13. REPORT REMAINS UNVERIFIED
# ──────────────────────────────────────────────────────────────────────────────

def test_replayed_report_always_unverified():
    """Even if client sends 'verified' in category, status is always UNVERIFIED."""
    async def _run():
        user = await create_user(f"citizen_unverif_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "road_block", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert res.status_code == 200
        report_id = res.json()["results"][0]["server_entity_id"]

        async with AsyncSessionLocal() as s:
            report = await s.get(IncidentReport, report_id)

        assert report.status == ReportStatus.unverified
        assert report.submitted_offline is True
        assert report.verified_at is None
        assert report.verified_by_id is None

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 14. OFFLINE SURVEY TIMESTAMP PRESERVED
# ──────────────────────────────────────────────────────────────────────────────

def test_offline_survey_client_timestamp_preserved():
    """Offline survey replay preserves client_timestamp as observation time; submitted_at is server time."""
    async def _run():
        user = await create_user(f"resp_ts_{uuid.uuid4().hex[:6]}@test.com", UserRole.responder)
        resp = await create_responder(user)
        mission = await create_mission(resp, MissionStatus.accepted)
        op_id = str(uuid.uuid4())

        # Client timestamp is "in the past" (2 hours ago on same server time)
        client_ts = datetime.now(timezone.utc) - timedelta(hours=2)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-ts",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "field_survey",
                    "client_timestamp": client_ts.isoformat(),
                    "payload": {"mission_id": mission.id, "verification_outcome": "road_blocked"}
                }]
            })

        assert res.status_code == 200
        survey_id = res.json()["results"][0]["server_entity_id"]

        async with AsyncSessionLocal() as s:
            survey = await s.get(FieldSurvey, survey_id)

        assert survey.submitted_offline is True
        assert survey.client_timestamp is not None
        # client_timestamp = original observation time (past)
        ct = survey.client_timestamp
        if ct.tzinfo is None:
            ct = ct.replace(tzinfo=timezone.utc)
        assert ct == client_ts, f"Expected {client_ts}, got {ct}"

        # submitted_at = server time (well after the past client timestamp)
        assert survey.submitted_at > client_ts

        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 15. AUDIT LOG BEHAVIOR
# ──────────────────────────────────────────────────────────────────────────────

def test_audit_log_created_for_report_replay():
    """Replayed incident report creates an AuditLog entry."""
    async def _run():
        user = await create_user(f"citizen_audit_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "audit-device",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })

        assert res.status_code == 200
        report_id = res.json()["results"][0]["server_entity_id"]

        async with AsyncSessionLocal() as s:
            res_audit = await s.execute(
                select(AuditLog).where(
                    AuditLog.action == "SYNC_REPORT_REPLAYED",
                    AuditLog.entity_type == "incident_reports",
                    AuditLog.entity_id == report_id,
                )
            )
            audit = res_audit.scalar_one_or_none()

        assert audit is not None
        assert audit.actor_id == user.id
        await engine.dispose()

    asyncio.run(_run())


def test_no_duplicate_audit_on_idempotent_replay():
    """Second replay with same operation_id does NOT create duplicate audit log."""
    async def _run():
        user = await create_user(f"citizen_nodup_audit_{uuid.uuid4().hex[:6]}@test.com", UserRole.citizen)
        op_id = str(uuid.uuid4())
        first_report_id = None

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r1 = await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })
            first_report_id = r1.json()["results"][0]["server_entity_id"]
            assert first_report_id is not None, "First request must succeed and return server_entity_id"

            # Second replay — same op_id
            await ac.post(sync_url(), headers=auth_headers(user), json={
                "client_id": "dev-1",
                "operations": [{
                    "operation_id": op_id,
                    "operation_type": "submit_report",
                    "client_timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {"category": "flood", "lat": 12.9, "lng": 77.5}
                }]
            })

        async with AsyncSessionLocal() as s:
            res_audit = await s.execute(
                select(func.count()).select_from(AuditLog).where(
                    AuditLog.action == "SYNC_REPORT_REPLAYED",
                    AuditLog.entity_id == first_report_id,
                )
            )
            count = res_audit.scalar_one()

        assert count == 1, f"Expected exactly 1 audit log, got {count}"
        await engine.dispose()

    asyncio.run(_run())


# ──────────────────────────────────────────────────────────────────────────────
# 16. DATABASE SCHEMA INTEGRITY
# ──────────────────────────────────────────────────────────────────────────────

def test_alembic_head_unchanged():
    """Alembic revision must remain 71867cddef4b."""
    async def _run():
        async with AsyncSessionLocal() as s:
            res = await s.execute(text("SELECT version_num FROM alembic_version"))
            version = res.scalar_one()
        assert version == "71867cddef4b", f"Unexpected Alembic head: {version}"
        await engine.dispose()

    asyncio.run(_run())


def test_application_table_count():
    """Exactly 17 application tables must exist."""
    async def _run():
        async with AsyncSessionLocal() as s:
            res = await s.execute(text("""
                SELECT count(*) FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                AND table_name NOT IN ('alembic_version', 'spatial_ref_sys')
            """))
            count = res.scalar_one()
        assert count == 17, f"Expected 17 application tables, found {count}"
        await engine.dispose()

    asyncio.run(_run())


def test_sync_status_endpoint():
    """GET /api/v1/sync/status returns online status."""
    async def _run():
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.get("/api/v1/sync/status")
        assert res.status_code == 200
        assert res.json()["online"] is True
        await engine.dispose()

    asyncio.run(_run())
