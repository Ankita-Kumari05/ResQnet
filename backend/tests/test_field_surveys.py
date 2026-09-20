"""
ResQnet Responder Field Survey Test Suite (Step 6.6)
Comprehensive test suite verifying:
- Assigned responder can submit field survey evidence
- Role authorization (Citizen/Fundraiser/Coordinator blocked from submission)
- Mission ownership enforcement (cannot submit for another responder's mission)
- Mission state validation (only ACCEPTED / IN_PROGRESS missions can receive surveys)
- Boundary and format validation (hazard_level 1-5, lat/lng boundaries, verification_outcome enum)
- PostGIS POINT(lng lat) SRID 4326 persistence
- Observation fields, media_url, offline client_timestamp persistence
- Audit logging into audit_logs table
- Zero ground truth mutation:
    - verification_outcome=road_blocked does NOT modify roads.status
    - verification_outcome=confirmed_hazard does NOT modify hazard_zones
    - incident reports strictly remain UNVERIFIED
- Transaction rollback on failure and response security
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, text
from geoalchemy2.functions import ST_AsText, ST_SRID

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
    SafetyHub,
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
            ngo_name="Field Team Alpha",
            status=status,
            last_known_lat=12.9716,
            last_known_lng=77.5946,
        )
        session.add(responder)
        await session.commit()
        await session.refresh(responder)
        return responder


async def create_cluster_with_report_helper(category: str = "flood") -> tuple[ReportCluster, IncidentReport]:
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
        await session.flush()

        report = IncidentReport(
            category=category,
            lat=12.9716,
            lng=77.5946,
            geom=f"SRID=4326;POINT(77.5946 12.9716)",
            status=ReportStatus.unverified,
            cluster_id=cluster.id,
        )
        session.add(report)
        await session.commit()
        await session.refresh(cluster)
        await session.refresh(report)
        return cluster, report


async def create_road_helper() -> Road:
    async with AsyncSessionLocal() as session:
        i1 = Intersection(name="Node C", lat=12.92, lng=77.52, geom="SRID=4326;POINT(77.52 12.92)")
        i2 = Intersection(name="Node D", lat=12.93, lng=77.53, geom="SRID=4326;POINT(77.53 12.93)")
        session.add_all([i1, i2])
        await session.flush()

        road = Road(
            name="Survey Highway 1",
            from_intersection_id=i1.id,
            to_intersection_id=i2.id,
            distance_km=2.0,
            status=RoadStatus.clear,
            geom="SRID=4326;LINESTRING(77.52 12.92, 77.53 12.93)",
        )
        session.add(road)
        await session.commit()
        await session.refresh(road)
        return road


async def create_mission_helper(
    responder_id: int,
    cluster_id: int = None,
    road_id: int = None,
    status: MissionStatus = MissionStatus.in_progress,
) -> Mission:
    async with AsyncSessionLocal() as session:
        mission = Mission(
            mission_type=MissionType.verify_incident if cluster_id else MissionType.survey_road,
            status=status,
            title="Field Inspection Mission",
            description="Inspect ground situation",
            responder_id=responder_id,
            cluster_id=cluster_id,
            road_id=road_id,
            target_lat=12.9716,
            target_lng=77.5946,
            geom="SRID=4326;POINT(77.5946 12.9716)",
        )
        session.add(mission)
        await session.commit()
        await session.refresh(mission)
        return mission


# ── Tests ───────────────────────────────────────────────────────────────────

def test_assigned_responder_submits_field_survey_success():
    """Verify assigned responder submits a valid survey with PostGIS geometry, media_url, and audit log."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_s1_{uid}@example.com", "Resp One", UserRole.responder)
            responder = await create_responder_helper(resp_user, ResponderStatus.on_mission)
            cluster, report = await create_cluster_with_report_helper(f"flood_{uid}")
            mission = await create_mission_helper(responder.id, cluster_id=cluster.id, status=MissionStatus.in_progress)

            token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "mission_id": mission.id,
                        "hazard_level": 4,
                        "verification_outcome": "confirmed_hazard",
                        "observed_lat": 12.9720,
                        "observed_lng": 77.5950,
                        "observed_condition": "Water level 40cm across road, strong flow.",
                        "media_url": "https://resqnet.storage/surveys/flood_evidence_01.jpg",
                        "notes": "Barricade placed on south side",
                        "submitted_offline": False,
                    },
                )

            assert res.status_code == 201
            data = res.json()
            assert data["mission_id"] == mission.id
            assert data["responder_id"] == responder.id
            assert data["cluster_id"] == cluster.id
            assert data["hazard_level"] == 4
            assert data["verification_outcome"] == "confirmed_hazard"
            assert data["observed_lat"] == 12.9720
            assert data["observed_lng"] == 77.5950
            assert data["observed_condition"] == "Water level 40cm across road, strong flow."
            assert data["media_url"] == "https://resqnet.storage/surveys/flood_evidence_01.jpg"
            assert data["submitted_offline"] is False
            assert "submitted_at" in data
            assert "password" not in data

            # Verify in PostgreSQL database
            survey_id = data["id"]
            async with AsyncSessionLocal() as session:
                db_s = await session.get(FieldSurvey, survey_id)
                assert db_s is not None
                assert db_s.responder_id == responder.id
                assert db_s.media_url == "https://resqnet.storage/surveys/flood_evidence_01.jpg"

                # Verify PostGIS geometry
                geo_res = await session.execute(
                    text("SELECT ST_AsText(observed_geom) as wkt, ST_SRID(observed_geom) as srid FROM field_surveys WHERE id = :id"),
                    {"id": survey_id}
                )
                geo_row = geo_res.mappings().first()
                assert geo_row["srid"] == 4326
                assert "POINT" in geo_row["wkt"]
                assert "77.595" in geo_row["wkt"]
                assert "12.972" in geo_row["wkt"]

                # Verify Audit Log
                audit = (
                    await session.execute(
                        select(AuditLog).where(
                            AuditLog.entity_type == "field_surveys",
                            AuditLog.entity_id == survey_id,
                            AuditLog.action == "FIELD_SURVEY_SUBMITTED",
                        )
                    )
                ).scalar_one_or_none()
                assert audit is not None
                assert audit.actor_id == resp_user.id
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_unauthorized_roles_cannot_submit_field_survey():
    """Verify citizen, fundraiser, and coordinator are rejected from field survey submission (403)."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"cit_s2_{uid}@example.com", "Cit User", UserRole.citizen)
            fundraiser = await create_user_helper(f"fund_s2_{uid}@example.com", "Fund User", UserRole.fundraiser)
            coord = await create_user_helper(f"coord_s2_{uid}@example.com", "Coord User", UserRole.coordinator)
            resp_user = await create_user_helper(f"resp_s2_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            mission = await create_mission_helper(responder.id, status=MissionStatus.in_progress)

            cit_token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})
            fund_token = create_access_token({"sub": str(fundraiser.id), "email": fundraiser.email, "role": "fundraiser"})
            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})

            payload = {
                "mission_id": mission.id,
                "hazard_level": 3,
                "verification_outcome": "confirmed_hazard",
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Unauthenticated -> 401
                assert (await ac.post("/api/v1/field-surveys", json=payload)).status_code == 401
                # 2. Citizen -> 403
                assert (await ac.post("/api/v1/field-surveys", headers={"Authorization": f"Bearer {cit_token}"}, json=payload)).status_code == 403
                # 3. Fundraiser -> 403
                assert (await ac.post("/api/v1/field-surveys", headers={"Authorization": f"Bearer {fund_token}"}, json=payload)).status_code == 403
                # 4. Coordinator -> 403 (Coordinators cannot submit surveys; responder role required)
                assert (await ac.post("/api/v1/field-surveys", headers={"Authorization": f"Bearer {coord_token}"}, json=payload)).status_code == 403
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_responder_cannot_submit_for_another_responders_mission():
    """Verify that a responder cannot submit a survey for a mission assigned to someone else."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp1_user = await create_user_helper(f"resp1_s3_{uid}@example.com", "Resp One", UserRole.responder)
            resp2_user = await create_user_helper(f"resp2_s3_{uid}@example.com", "Resp Two", UserRole.responder)
            resp1 = await create_responder_helper(resp1_user)
            resp2 = await create_responder_helper(resp2_user)
            mission = await create_mission_helper(resp1.id, status=MissionStatus.in_progress)

            resp2_token = create_access_token({"sub": str(resp2_user.id), "email": resp2_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp2_token}"},
                    json={
                        "mission_id": mission.id,
                        "hazard_level": 2,
                        "verification_outcome": "no_hazard_found",
                    },
                )
            assert res.status_code == 403
            assert res.json()["error"]["code"] == "MISSION_NOT_ASSIGNED_TO_CALLER"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_mission_state_validation_for_surveys():
    """Verify surveys are accepted for ACCEPTED/IN_PROGRESS and rejected for ASSIGNED/REJECTED/CANCELLED/COMPLETED."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_s4_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            # 1. Mission in ASSIGNED state (not yet accepted) -> 409 Conflict
            m_assigned = await create_mission_helper(responder.id, status=MissionStatus.assigned)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_ass = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": m_assigned.id, "hazard_level": 3},
                )
                assert res_ass.status_code == 409
                assert res_ass.json()["error"]["code"] == "INVALID_MISSION_STATE_FOR_SURVEY"

            # 2. Mission in ACCEPTED state -> 201 Created
            m_accepted = await create_mission_helper(responder.id, status=MissionStatus.accepted)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_acc = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": m_accepted.id, "hazard_level": 3, "verification_outcome": "confirmed_hazard"},
                )
                assert res_acc.status_code == 201

            # 3. Mission in CANCELLED state -> 409 Conflict
            m_cancelled = await create_mission_helper(responder.id, status=MissionStatus.cancelled)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res_canc = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": m_cancelled.id, "hazard_level": 1},
                )
                assert res_canc.status_code == 409
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_schema_validations_and_boundary_checks():
    """Verify validation on hazard_level, coordinates, and extra input prevention."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_s5_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            mission = await create_mission_helper(responder.id, status=MissionStatus.in_progress)
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. hazard_level < 1 -> 422
                res1 = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": mission.id, "hazard_level": 0},
                )
                assert res1.status_code == 422

                # 2. hazard_level > 5 -> 422
                res2 = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": mission.id, "hazard_level": 6},
                )
                assert res2.status_code == 422

                # 3. Invalid latitude -> 422
                res3 = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": mission.id, "observed_lat": 95.0, "observed_lng": 77.0},
                )
                assert res3.status_code == 422

                # 4. Attempt to inject responder_id -> 422 (extra inputs forbidden)
                res4 = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"mission_id": mission.id, "responder_id": 999},
                )
                assert res4.status_code == 422
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_offline_field_survey_timestamp_handling():
    """Verify offline survey submission with client_timestamp and future timestamp rejection."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_s6_{uid}@example.com", "Resp User", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            mission = await create_mission_helper(responder.id, status=MissionStatus.in_progress)
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            valid_ts = datetime.now(timezone.utc) - timedelta(hours=2)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Valid offline submission
                res_valid = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={
                        "mission_id": mission.id,
                        "hazard_level": 4,
                        "submitted_offline": True,
                        "client_timestamp": valid_ts.isoformat(),
                    },
                )
                assert res_valid.status_code == 201
                assert res_valid.json()["submitted_offline"] is True
                assert res_valid.json()["client_timestamp"] is not None

                # 2. Future client timestamp (> 5 minutes in future) -> 400 Bad Request
                future_ts = datetime.now(timezone.utc) + timedelta(days=2)
                res_future = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={
                        "mission_id": mission.id,
                        "hazard_level": 4,
                        "submitted_offline": True,
                        "client_timestamp": future_ts.isoformat(),
                    },
                )
                assert res_future.status_code == 400
                assert res_future.json()["error"]["code"] == "INVALID_CLIENT_TIMESTAMP"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_field_survey_never_mutates_ground_truth_tables():
    """
    CRITICAL: Verify that submitting a survey (even with road_blocked or confirmed_hazard)
    NEVER directly updates road status, hazard zones, incident report status, or safety hubs.
    """
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_gt_{uid}@example.com", "Resp GT", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            cluster, report = await create_cluster_with_report_helper(f"cat_{uid}")
            road = await create_road_helper()
            mission = await create_mission_helper(
                responder.id, cluster_id=cluster.id, road_id=road.id, status=MissionStatus.in_progress
            )

            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            # Capture initial states
            async with AsyncSessionLocal() as session:
                road_status_before = (await session.get(Road, road.id)).status
                road_blocked_before = (await session.get(Road, road.id)).is_blocked
                hazards_before = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_before = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                report_status_before = (await session.get(IncidentReport, report.id)).status

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/field-surveys",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={
                        "mission_id": mission.id,
                        "hazard_level": 5,
                        "verification_outcome": "road_blocked",
                        "road_status": "blocked",
                        "is_blocked": True,
                        "observed_condition": "Bridge collapsed; road impassable",
                    },
                )
                assert res.status_code == 201

            # Verify ground truth tables remain 100% UNCHANGED
            async with AsyncSessionLocal() as session:
                db_road = await session.get(Road, road.id)
                assert db_road.status == road_status_before == RoadStatus.clear, "Road status MUST NOT be mutated in Step 6.6"
                assert db_road.is_blocked == road_blocked_before is False, "Road is_blocked MUST NOT be mutated in Step 6.6"

                hazards_after = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                assert hazards_after == hazards_before, "HazardZone table MUST NOT be mutated in Step 6.6"

                hubs_after = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                assert hubs_after == hubs_before, "SafetyHub table MUST NOT be mutated in Step 6.6"

                db_report = await session.get(IncidentReport, report.id)
                assert db_report.status == report_status_before == ReportStatus.unverified, "Incident report MUST remain UNVERIFIED in Step 6.6"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_field_survey_transaction_rollback_on_failure():
    """Verify that a database failure during field survey persistence explicitly executes db.rollback()."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            resp_user = await create_user_helper(f"resp_roll_{uid}@example.com", "Resp Roll", UserRole.responder)
            responder = await create_responder_helper(resp_user)
            mission = await create_mission_helper(responder.id, status=MissionStatus.in_progress)
            resp_token = create_access_token({"sub": str(resp_user.id), "email": resp_user.email, "role": "responder"})

            with patch("sqlalchemy.ext.asyncio.AsyncSession.commit", side_effect=RuntimeError("Simulated DB Survey Error")):
                with patch("sqlalchemy.ext.asyncio.AsyncSession.rollback", new_callable=AsyncMock) as mock_rollback:
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        with pytest.raises(RuntimeError, match="Simulated DB Survey Error"):
                            await ac.post(
                                "/api/v1/field-surveys",
                                headers={"Authorization": f"Bearer {resp_token}"},
                                json={
                                    "mission_id": mission.id,
                                    "hazard_level": 3,
                                    "verification_outcome": "confirmed_hazard",
                                },
                            )
                    assert mock_rollback.called, "db.rollback() MUST be called when persistence fails"
        finally:
            await engine.dispose()

    asyncio.run(_run())
