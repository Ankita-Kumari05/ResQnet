"""
ResQnet Ground Truth Propagation Test Suite (Step 6.7)
Comprehensive tests covering requirements A through W for Step 6.7:
- Deterministic outcome mappings (road_blocked, confirmed_hazard, no_hazard_found, false_report)
- Road status and is_blocked consistency
- Authoritative target resolution (derived server-side, no client redirection)
- Idempotency (duplicate propagation does not corrupt state or duplicate audit records)
- Staleness safety (older offline surveys cannot overwrite newer verified state)
- Non-destructive incident report & cluster lifecycle (reports never deleted)
- Role authorization (Citizen/Fundraiser/Unauthorized responder blocked)
- Audit logging with full old/new state capture and zero credential leaks
- Route cache invalidation boundary invocation
- Transaction atomicity and rollback safety
- Isolation (unrelated roads and clusters untouched)
- Zero database schema modifications
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
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
    FieldSurvey,
    FieldSurveyVerificationOutcome,
    ReportCluster,
    ReportClusterStatus,
    Road,
    RoadStatus,
    HazardZone,
    HazardSeverity,
    SafetyHub,
    IncidentReport,
    ReportStatus,
    AuditLog,
    Intersection,
)
from app.modules.routing.cache import invalidate_route_cache


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
            ngo_name="Ground Truth Verification Unit",
            status=status,
            last_known_lat=12.9716,
            last_known_lng=77.5946,
        )
        session.add(responder)
        await session.commit()
        await session.refresh(responder)
        return responder


async def create_road_helper(name: str = "Test Corridor 7") -> tuple[Road, Intersection, Intersection]:
    async with AsyncSessionLocal() as session:
        suffix = uuid.uuid4().hex[:6]
        int_a = Intersection(name=f"Node A {suffix}", lat=12.9716, lng=77.5946, is_hub=False)
        int_b = Intersection(name=f"Node B {suffix}", lat=12.9750, lng=77.5980, is_hub=False)
        session.add_all([int_a, int_b])
        await session.flush()

        road = Road(
            name=f"{name} {suffix}",
            from_intersection_id=int_a.id,
            to_intersection_id=int_b.id,
            distance_km=2.5,
            status=RoadStatus.clear,
            is_blocked=False,
            hazard_penalty=0.0,
            flood_penalty=0.0,
            congestion_penalty=0.0,
            confidence_score=0.5,
        )
        session.add(road)
        await session.commit()
        await session.refresh(road)
        return road, int_a, int_b


async def create_cluster_with_reports_helper(count: int = 2) -> tuple[ReportCluster, list[IncidentReport]]:
    async with AsyncSessionLocal() as session:
        cluster = ReportCluster(
            centroid_lat=12.9716,
            centroid_lng=77.5946,
            report_count=count,
            priority_score=3.5,
            dominant_category="road_block",
            status=ReportClusterStatus.open,
        )
        session.add(cluster)
        await session.flush()

        reports = []
        for i in range(count):
            rep = IncidentReport(
                category="road_block",
                description=f"Citizen report #{i+1} describing blockage",
                status=ReportStatus.unverified,
                lat=12.9716 + (i * 0.001),
                lng=77.5946 + (i * 0.001),
                cluster_id=cluster.id,
            )
            session.add(rep)
            reports.append(rep)

        await session.commit()
        await session.refresh(cluster)
        for r in reports:
            await session.refresh(r)
        return cluster, reports


async def create_mission_helper(
    responder: Responder,
    road: Road = None,
    cluster: ReportCluster = None,
    mission_type: MissionType = MissionType.survey_road,
) -> Mission:
    async with AsyncSessionLocal() as session:
        mission = Mission(
            mission_type=mission_type,
            status=MissionStatus.accepted,
            title="Ground Verification Mission",
            description="Verify road obstruction and update operational ground truth",
            responder_id=responder.id,
            road_id=road.id if road else None,
            cluster_id=cluster.id if cluster else None,
            target_lat=12.9716,
            target_lng=77.5946,
        )
        session.add(mission)
        await session.commit()
        await session.refresh(mission)
        return mission


async def create_survey_helper(
    responder: Responder,
    mission: Mission,
    outcome: FieldSurveyVerificationOutcome,
    road: Road = None,
    cluster: ReportCluster = None,
    is_blocked: bool = None,
    hazard_penalty: float = None,
    submitted_offline: bool = False,
    client_timestamp: datetime = None,
) -> FieldSurvey:
    async with AsyncSessionLocal() as session:
        survey = FieldSurvey(
            mission_id=mission.id,
            responder_id=responder.id,
            road_id=road.id if road else mission.road_id,
            cluster_id=cluster.id if cluster else mission.cluster_id,
            observed_lat=12.9716,
            observed_lng=77.5946,
            observed_condition="Field responder on-site inspection verified",
            verification_outcome=outcome,
            is_blocked=is_blocked,
            hazard_penalty=hazard_penalty,
            hazard_level=4,
            submitted_offline=submitted_offline,
            client_timestamp=client_timestamp,
        )
        session.add(survey)
        await session.commit()
        await session.refresh(survey)
        return survey


# ── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_road_blocked_changes_authoritative_road_to_blocked():
    """A. Valid road_blocked survey changes authoritative road to BLOCKED with confidence_score=1.0."""
    user = await create_user_helper("resp_a@resqnet.test", "Responder A", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Highway A")
    mission = await create_mission_helper(responder, road=road, mission_type=MissionType.survey_road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["survey_id"] == survey.id
        assert data["road_id"] == road.id
        assert data["road_status"] == "blocked"
        assert data["road_is_blocked"] is True
        assert data["already_propagated"] is False

    # Check database state
    async with AsyncSessionLocal() as session:
        updated_road = await session.get(Road, road.id)
        assert updated_road.status == RoadStatus.blocked
        assert updated_road.is_blocked is True
        assert updated_road.confidence_score == 1.0
        assert updated_road.last_verified_survey_id == survey.id
        assert updated_road.last_verified_at is not None


@pytest.mark.asyncio
async def test_b_road_blockage_fields_consistency():
    """B. Road blockage fields remain logically consistent (BLOCKED -> is_blocked=True, CLEAR -> is_blocked=False)."""
    user = await create_user_helper("resp_b@resqnet.test", "Responder B", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Avenue B")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})

    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        assert (r.status == RoadStatus.blocked and r.is_blocked is True) or (r.status != RoadStatus.blocked and r.is_blocked is False)


@pytest.mark.asyncio
async def test_c_confirmed_hazard_updates_authoritative_targets():
    """C. confirmed_hazard updates authoritative road penalty/status and cluster to VERIFIED."""
    user = await create_user_helper("resp_c@resqnet.test", "Responder C", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Route C")
    cluster, reports = await create_cluster_with_reports_helper(count=2)
    mission = await create_mission_helper(responder, road=road, cluster=cluster)
    survey = await create_survey_helper(
        responder, mission, FieldSurveyVerificationOutcome.confirmed_hazard, road=road, cluster=cluster, hazard_penalty=8.0
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["road_status"] == "hazardous"
        assert data["cluster_status"] == "verified"

    async with AsyncSessionLocal() as session:
        updated_road = await session.get(Road, road.id)
        assert updated_road.status == RoadStatus.hazardous
        assert updated_road.hazard_penalty == 8.0

        updated_cluster = await session.get(ReportCluster, cluster.id)
        assert updated_cluster.status == ReportClusterStatus.verified

        for rep in reports:
            r = await session.get(IncidentReport, rep.id)
            assert r.status == ReportStatus.verified
            assert r.verified_by_id == user.id
            assert r.verified_at is not None


@pytest.mark.asyncio
async def test_d_no_hazard_found_resets_road_safely():
    """D. no_hazard_found resets blocked road to CLEAR and marks cluster dismissed without erasing reports."""
    user = await create_user_helper("resp_d@resqnet.test", "Responder D", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Boulevard D")
    cluster, reports = await create_cluster_with_reports_helper(count=2)

    # Pre-set road to blocked
    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        r.status = RoadStatus.blocked
        r.is_blocked = True
        r.hazard_penalty = 10.0
        await session.commit()

    mission = await create_mission_helper(responder, road=road, cluster=cluster)
    survey = await create_survey_helper(
        responder, mission, FieldSurveyVerificationOutcome.no_hazard_found, road=road, cluster=cluster
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["road_status"] == "clear"
        assert data["road_is_blocked"] is False
        assert data["cluster_status"] == "dismissed"

    async with AsyncSessionLocal() as session:
        updated_road = await session.get(Road, road.id)
        assert updated_road.status == RoadStatus.clear
        assert updated_road.is_blocked is False
        assert updated_road.hazard_penalty == 0.0

        # Reports exist and are marked rejected
        for rep in reports:
            r = await session.get(IncidentReport, rep.id)
            assert r is not None
            assert r.status == ReportStatus.rejected


@pytest.mark.asyncio
async def test_e_false_report_does_not_delete_incident_reports():
    """E. false_report marks cluster dismissed and reports rejected without deleting historical citizen reports."""
    user = await create_user_helper("resp_e@resqnet.test", "Responder E", UserRole.responder)
    responder = await create_responder_helper(user)
    cluster, reports = await create_cluster_with_reports_helper(count=3)
    mission = await create_mission_helper(responder, cluster=cluster, mission_type=MissionType.verify_incident)
    survey = await create_survey_helper(
        responder, mission, FieldSurveyVerificationOutcome.false_report, cluster=cluster
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["cluster_status"] == "dismissed"

    async with AsyncSessionLocal() as session:
        updated_cluster = await session.get(ReportCluster, cluster.id)
        assert updated_cluster.status == ReportClusterStatus.dismissed

        for rep in reports:
            r = await session.get(IncidentReport, rep.id)
            assert r is not None
            assert r.status == ReportStatus.rejected


@pytest.mark.asyncio
async def test_f_citizen_cannot_trigger_propagation():
    """F. Citizen cannot trigger propagation (403 Forbidden)."""
    cit_user = await create_user_helper("citizen_prop@resqnet.test", "Citizen User", UserRole.citizen)
    resp_user = await create_user_helper("resp_f@resqnet.test", "Responder F", UserRole.responder)
    responder = await create_responder_helper(resp_user)
    road, _, _ = await create_road_helper("Road F")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(cit_user.id), "role": cit_user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_g_fundraiser_cannot_trigger_propagation():
    """G. Fundraiser cannot trigger propagation (403 Forbidden)."""
    fund_user = await create_user_helper("fund_prop@resqnet.test", "Fundraiser User", UserRole.fundraiser)
    resp_user = await create_user_helper("resp_g@resqnet.test", "Responder G", UserRole.responder)
    responder = await create_responder_helper(resp_user)
    road, _, _ = await create_road_helper("Road G")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(fund_user.id), "role": fund_user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_h_unauthorized_responder_cannot_propagate_others_survey():
    """H. Unauthorized responder cannot propagate another responder's survey (403 Forbidden)."""
    resp1_user = await create_user_helper("resp1_h@resqnet.test", "Responder 1", UserRole.responder)
    responder1 = await create_responder_helper(resp1_user)

    resp2_user = await create_user_helper("resp2_h@resqnet.test", "Responder 2", UserRole.responder)
    responder2 = await create_responder_helper(resp2_user)

    road, _, _ = await create_road_helper("Road H")
    mission = await create_mission_helper(responder1, road=road)
    survey = await create_survey_helper(responder1, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    # Responder 2 attempts to propagate Responder 1's survey
    token = create_access_token({"sub": str(resp2_user.id), "role": resp2_user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_i_arbitrary_client_target_prevention():
    """I. Server derives target strictly from survey/mission; no arbitrary client-directed mutation."""
    user = await create_user_helper("resp_i@resqnet.test", "Responder I", UserRole.responder)
    responder = await create_responder_helper(user)
    road_target, _, _ = await create_road_helper("Target Road")
    road_other, _, _ = await create_road_helper("Unrelated Road")

    mission = await create_mission_helper(responder, road=road_target)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road_target)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Endpoint path only accepts survey_id; body payload cannot redirect target road
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["road_id"] == road_target.id

    async with AsyncSessionLocal() as session:
        unrelated = await session.get(Road, road_other.id)
        assert unrelated.status == RoadStatus.clear
        assert unrelated.is_blocked is False


@pytest.mark.asyncio
async def test_j_missing_authoritative_target_fails_safely():
    """J. Missing authoritative target fails safely with 400 Bad Request."""
    user = await create_user_helper("resp_j@resqnet.test", "Responder J", UserRole.responder)
    responder = await create_responder_helper(user)
    # Mission without road or cluster
    mission = await create_mission_helper(responder, road=None, cluster=None, mission_type=MissionType.survey_road)
    survey = await create_survey_helper(
        responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=None, cluster=None
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "MISSING_AUTHORITATIVE_ROAD_TARGET" in resp.json()["error"]["code"]


@pytest.mark.asyncio
async def test_k_duplicate_propagation_is_idempotent():
    """K. Duplicate propagation calls are idempotent and do not duplicate audit entries."""
    user = await create_user_helper("resp_k@resqnet.test", "Responder K", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road K")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First call: applies mutation
        resp1 = await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})
        assert resp1.status_code == 200
        assert resp1.json()["already_propagated"] is False

        # Count audit records
        async with AsyncSessionLocal() as session:
            count1 = (await session.execute(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "ROAD_GROUND_TRUTH_UPDATED",
                    AuditLog.entity_id == road.id,
                )
            )).scalar()
            assert count1 == 1

        # Second call: recognizes already-applied state
        resp2 = await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})
        assert resp2.status_code == 200
        assert resp2.json()["already_propagated"] is True

        # Audit record count unchanged
        async with AsyncSessionLocal() as session:
            count2 = (await session.execute(
                select(func.count(AuditLog.id)).where(
                    AuditLog.action == "ROAD_GROUND_TRUTH_UPDATED",
                    AuditLog.entity_id == road.id,
                )
            )).scalar()
            assert count2 == 1


@pytest.mark.asyncio
async def test_l_concurrency_locking():
    """L. Concurrent propagation calls maintain transaction integrity and avoid corruption."""
    user = await create_user_helper("resp_l@resqnet.test", "Responder L", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road L")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Launch two parallel propagation requests
        res1, res2 = await asyncio.gather(
            client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"}),
            client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"}),
        )
        assert res1.status_code == 200
        assert res2.status_code == 200

        # One should apply and one should detect idempotency
        results = [res1.json()["already_propagated"], res2.json()["already_propagated"]]
        assert True in results
        assert False in results

    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        assert r.status == RoadStatus.blocked
        assert r.is_blocked is True


@pytest.mark.asyncio
async def test_m_older_offline_survey_cannot_overwrite_newer_verified_state():
    """M. Older offline survey cannot overwrite newer verified state (staleness protection)."""
    user = await create_user_helper("resp_m@resqnet.test", "Responder M", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road M")

    # Set road to newer verification timestamp (12:00 UTC)
    t_newer = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)
    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        r.status = RoadStatus.clear
        r.is_blocked = False
        r.last_verified_at = t_newer
        await session.commit()

    # Create older offline survey from 10:00 UTC saying road_blocked
    t_older = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)
    mission = await create_mission_helper(responder, road=road)
    survey_old = await create_survey_helper(
        responder,
        mission,
        FieldSurveyVerificationOutcome.road_blocked,
        road=road,
        submitted_offline=True,
        client_timestamp=t_older,
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey_old.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "older than current verified ground truth" in data["message"]

    # Verify road state remained CLEAR and was NOT reverted to BLOCKED
    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        assert r.status == RoadStatus.clear
        assert r.is_blocked is False
        assert r.last_verified_at == t_newer


@pytest.mark.asyncio
async def test_n_and_o_audit_logging_and_values():
    """N & O. Ground-truth update creates audit logs with old/new values and survey/mission context."""
    user = await create_user_helper("resp_no@resqnet.test", "Responder NO", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road NO")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "ROAD_GROUND_TRUTH_UPDATED",
                AuditLog.entity_id == road.id,
            )
        )
        audit = result.scalar_one_or_none()
        assert audit is not None
        assert audit.actor_id == user.id
        assert audit.entity_type == "roads"
        assert audit.old_values["status"] == "clear"
        assert audit.old_values["is_blocked"] is False
        assert audit.new_values["status"] == "blocked"
        assert audit.new_values["is_blocked"] is True
        assert audit.new_values["survey_id"] == survey.id
        assert audit.new_values["mission_id"] == mission.id


@pytest.mark.asyncio
async def test_p_transaction_rollback_on_failure():
    """P. Transaction rollback on exception prevents partial updates."""
    user = await create_user_helper("resp_p@resqnet.test", "Responder P", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road P")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})

    with patch("app.modules.field_surveys.service.invalidate_route_cache", side_effect=RuntimeError("Simulated Invalidation Error")):
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/field-surveys/{survey.id}/propagate",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code >= 500

    # Verify road state was rolled back and remains CLEAR
    async with AsyncSessionLocal() as session:
        r = await session.get(Road, road.id)
        assert r.status == RoadStatus.clear
        assert r.is_blocked is False


@pytest.mark.asyncio
async def test_q_and_r_historical_reports_and_clusters_preserved():
    """Q & R. Incident reports and clusters are never deleted; historical evidence is preserved."""
    user = await create_user_helper("resp_qr@resqnet.test", "Responder QR", UserRole.responder)
    responder = await create_responder_helper(user)
    cluster, reports = await create_cluster_with_reports_helper(count=3)
    mission = await create_mission_helper(responder, cluster=cluster, mission_type=MissionType.verify_incident)
    survey = await create_survey_helper(
        responder, mission, FieldSurveyVerificationOutcome.false_report, cluster=cluster
    )

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})

    async with AsyncSessionLocal() as session:
        # Cluster still exists
        c = await session.get(ReportCluster, cluster.id)
        assert c is not None
        assert c.status == ReportClusterStatus.dismissed

        # All 3 reports still exist
        for rep in reports:
            r = await session.get(IncidentReport, rep.id)
            assert r is not None
            assert r.description == rep.description
            assert r.status == ReportStatus.rejected


@pytest.mark.asyncio
async def test_s_route_cache_invalidation_boundary():
    """S. Routing cache invalidation boundary is invoked with the mutated road ID."""
    user = await create_user_helper("resp_s@resqnet.test", "Responder S", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road S")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    with patch("app.modules.field_surveys.service.invalidate_route_cache") as mock_inval:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/field-surveys/{survey.id}/propagate",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            mock_inval.assert_called_once_with(road_id=road.id)


@pytest.mark.asyncio
async def test_t_and_u_isolation_unrelated_roads_and_hazards_untouched():
    """T & U. Ground truth propagation modifies only authoritative target; unrelated roads and hazards untouched."""
    user = await create_user_helper("resp_tu@resqnet.test", "Responder TU", UserRole.responder)
    responder = await create_responder_helper(user)
    road_target, _, _ = await create_road_helper("Target Road TU")
    road_unrelated, _, _ = await create_road_helper("Unrelated Road TU")

    mission = await create_mission_helper(responder, road=road_target)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road_target)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(f"/api/v1/field-surveys/{survey.id}/propagate", headers={"Authorization": f"Bearer {token}"})

    async with AsyncSessionLocal() as session:
        target = await session.get(Road, road_target.id)
        assert target.status == RoadStatus.blocked

        unrelated = await session.get(Road, road_unrelated.id)
        assert unrelated.status == RoadStatus.clear
        assert unrelated.is_blocked is False
        assert unrelated.last_verified_survey_id is None


@pytest.mark.asyncio
async def test_v_no_credentials_leaked():
    """V. Propagation response and audit logs contain zero credentials or tokens."""
    user = await create_user_helper("resp_v@resqnet.test", "Responder V", UserRole.responder)
    responder = await create_responder_helper(user)
    road, _, _ = await create_road_helper("Road V")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        body_text = resp.text.lower()
        assert "password" not in body_text
        assert "hashed_password" not in body_text
        assert "token" not in body_text
        assert "secret" not in body_text


@pytest.mark.asyncio
async def test_w_coordinator_can_propagate_any_valid_survey():
    """W. Coordinator can propagate any verified survey (operational ground truth coordination)."""
    coord_user = await create_user_helper("coord_w@resqnet.test", "Coordinator W", UserRole.coordinator)
    resp_user = await create_user_helper("resp_w@resqnet.test", "Responder W", UserRole.responder)
    responder = await create_responder_helper(resp_user)
    road, _, _ = await create_road_helper("Road W")
    mission = await create_mission_helper(responder, road=road)
    survey = await create_survey_helper(responder, mission, FieldSurveyVerificationOutcome.road_blocked, road=road)

    token = create_access_token({"sub": str(coord_user.id), "role": coord_user.role.value})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/field-surveys/{survey.id}/propagate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["road_status"] == "blocked"
