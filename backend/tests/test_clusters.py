"""
ResQnet Incident Clustering Test Suite (Step 6.4)
Comprehensive test suite verifying deterministic spatial + temporal clustering of citizen reports:
- New report creates a new cluster
- Nearby + temporally correlated reports join the same cluster
- Geographically distant reports create separate clusters
- Temporally distant reports create separate clusters
- Cluster membership, centroid, and report counts update accurately
- Reports strictly remain UNVERIFIED (never auto-verified)
- Clustering NEVER creates/modifies roads, hazard_zones, safety_hubs, field_surveys, or missions
- Duplicate processing of a report is idempotent
- Offline reports with client_timestamp are clustered using observation time
- Unauthorized access is blocked (401/403)
- Nonexistent report returns 404
- Transaction rollback occurs on persistence failure
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
    IncidentReport,
    ReportStatus,
    ReportCluster,
    ReportClusterStatus,
    Road,
    HazardZone,
    SafetyHub,
    FieldSurvey,
    Mission,
)
from app.modules.clusters.service import cluster_incident_report


# ── Helper to Seed Users & Reports ───────────────────────────────────────────

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


async def create_report_helper(
    user_id: int,
    category: str = "flood",
    lat: float = 12.9716,
    lng: float = 77.5946,
    submitted_offline: bool = False,
    client_timestamp: datetime = None,
    created_at: datetime = None,
) -> IncidentReport:
    async with AsyncSessionLocal() as session:
        geom_wkt = f"SRID=4326;POINT({lng} {lat})"
        report = IncidentReport(
            reporter_id=user_id,
            category=category,
            description="Test incident observation",
            lat=lat,
            lng=lng,
            geom=geom_wkt,
            status=ReportStatus.unverified,
            submitted_offline=submitted_offline,
            client_timestamp=client_timestamp,
        )
        if created_at:
            report.created_at = created_at
            report.updated_at = created_at
        session.add(report)
        await session.commit()
        await session.refresh(report)
        return report


# ── Tests ───────────────────────────────────────────────────────────────────

def test_new_report_creates_new_cluster():
    """Verify that an initial report creates a new open cluster with count=1."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"citizen_cl1_{uid}@example.com", "Cluster User", UserRole.citizen)
            report = await create_report_helper(user.id, category=cat, lat=12.1000, lng=77.1000)

            async with AsyncSessionLocal() as session:
                cluster, is_new = await cluster_incident_report(session, report.id)

            assert is_new is True
            assert cluster is not None
            assert cluster.report_count == 1
            assert cluster.dominant_category == cat
            assert cluster.status == ReportClusterStatus.open
            assert cluster.centroid_lat == pytest.approx(12.1000, rel=1e-5)
            assert cluster.centroid_lng == pytest.approx(77.1000, rel=1e-5)

            # Check report in db
            async with AsyncSessionLocal() as session:
                db_rep = await session.get(IncidentReport, report.id)
                assert db_rep.cluster_id == cluster.id
                assert db_rep.status == ReportStatus.unverified  # NEVER auto-verified
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_spatial_proximity_joins_existing_cluster():
    """Verify that a second report within 100 meters joins the existing cluster."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"citizen_cl2_{uid}@example.com", "Spatial User", UserRole.citizen)
            
            # Report 1 at (12.2000, 77.2000)
            r1 = await create_report_helper(user.id, category=cat, lat=12.2000, lng=77.2000)
            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id)
            assert is_new1 is True

            # Report 2 ~50 meters away at (12.2003, 77.2002)
            r2 = await create_report_helper(user.id, category=cat, lat=12.2003, lng=77.2002)
            async with AsyncSessionLocal() as session:
                c2, is_new2 = await cluster_incident_report(session, r2.id)

            assert is_new2 is False
            assert c2.id == c1.id
            assert c2.report_count == 2
            # Centroid should be the average of (12.2000, 77.2000) and (12.2003, 77.2002)
            expected_lat = (12.2000 + 12.2003) / 2
            expected_lng = (77.2000 + 77.2002) / 2
            assert c2.centroid_lat == pytest.approx(expected_lat, rel=1e-4)
            assert c2.centroid_lng == pytest.approx(expected_lng, rel=1e-4)

            # Verify both reports in DB
            async with AsyncSessionLocal() as session:
                rep1 = await session.get(IncidentReport, r1.id)
                rep2 = await session.get(IncidentReport, r2.id)
                assert rep1.cluster_id == c1.id
                assert rep2.cluster_id == c1.id
                assert rep1.status == ReportStatus.unverified
                assert rep2.status == ReportStatus.unverified
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_spatial_distance_creates_separate_clusters():
    """Verify that reports far apart (> 500m default radius) create separate clusters."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"citizen_cl3_{uid}@example.com", "Distant User", UserRole.citizen)

            # Report 1 in Bangalore Central (12.3000, 77.3000)
            r1 = await create_report_helper(user.id, category=cat, lat=12.3000, lng=77.3000)
            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id)
            assert is_new1 is True

            # Report 2 in Whitefield (~15 km away) at (12.3000, 77.5000)
            r2 = await create_report_helper(user.id, category=cat, lat=12.3000, lng=77.5000)
            async with AsyncSessionLocal() as session:
                c2, is_new2 = await cluster_incident_report(session, r2.id)

            assert is_new2 is True
            assert c2.id != c1.id
            assert c1.report_count == 1
            assert c2.report_count == 1
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_temporal_window_creates_separate_clusters():
    """Verify that reports at the same location but outside the temporal window create separate clusters."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"landslide_{uid}"
            user = await create_user_helper(f"citizen_cl4_{uid}@example.com", "Time User", UserRole.citizen)

            # Report 1 at time T - 4 hours
            past_time = datetime.now(timezone.utc) - timedelta(hours=4)
            r1 = await create_report_helper(
                user.id, category=cat, lat=13.0827, lng=80.2707, created_at=past_time
            )
            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(
                    session, r1.id, temporal_window_minutes=120
                )
            assert is_new1 is True

            # Manually ensure c1 updated_at is in the past for testing
            async with AsyncSessionLocal() as session:
                db_c1 = await session.get(ReportCluster, c1.id)
                db_c1.updated_at = past_time
                await session.commit()

            # Report 2 at time NOW at the exact same location
            r2 = await create_report_helper(
                user.id, category=cat, lat=13.0827, lng=80.2707
            )
            async with AsyncSessionLocal() as session:
                c2, is_new2 = await cluster_incident_report(
                    session, r2.id, temporal_window_minutes=120
                )

            assert is_new2 is True
            assert c2.id != c1.id
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_offline_report_uses_client_timestamp():
    """Verify that an offline report uses client_timestamp for temporal correlation."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"tree_fall_{uid}"
            user = await create_user_helper(f"citizen_off_{uid}@example.com", "Offline User", UserRole.citizen)

            obs_time = datetime.now(timezone.utc) - timedelta(minutes=15)
            # Offline report submitted now, but observed 15 minutes ago
            r_offline = await create_report_helper(
                user.id,
                category=cat,
                lat=12.9200,
                lng=77.6100,
                submitted_offline=True,
                client_timestamp=obs_time,
            )

            async with AsyncSessionLocal() as session:
                cluster, is_new = await cluster_incident_report(session, r_offline.id)

            assert is_new is True
            assert cluster.dominant_category == cat
            assert cluster.report_count == 1
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_idempotent_duplicate_clustering():
    """Verify that processing the same report multiple times is idempotent."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"fire_{uid}"
            user = await create_user_helper(f"citizen_idem_{uid}@example.com", "Idem User", UserRole.citizen)
            report = await create_report_helper(user.id, category=cat, lat=12.9500, lng=77.6000)

            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, report.id)
            assert is_new1 is True

            # Second execution on same report
            async with AsyncSessionLocal() as session:
                c2, is_new2 = await cluster_incident_report(session, report.id)
            assert is_new2 is False
            assert c2.id == c1.id
            assert c2.report_count == 1  # Count does not double
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_clustering_never_modifies_ground_truth_or_missions():
    """Verify that clustering NEVER touches roads, hazard_zones, safety_hubs, field_surveys, or missions."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"citizen_gt_cl_{uid}@example.com", "GT Cluster", UserRole.citizen)
            report = await create_report_helper(user.id, category=cat, lat=12.9716, lng=77.5946)

            async with AsyncSessionLocal() as session:
                roads_before = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_before = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_before = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_before = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()
                missions_before = (await session.execute(select(func.count(Mission.id)))).scalar_one()

            async with AsyncSessionLocal() as session:
                cluster, _ = await cluster_incident_report(session, report.id)

            async with AsyncSessionLocal() as session:
                roads_after = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_after = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_after = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_after = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()
                missions_after = (await session.execute(select(func.count(Mission.id)))).scalar_one()

            assert roads_before == roads_after
            assert hazards_before == hazards_after
            assert hubs_before == hubs_after
            assert surveys_before == surveys_after
            assert missions_before == missions_after
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_api_process_report_and_rbac():
    """Verify HTTP API endpoint for processing clusters with role-based access control."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"road_block_{uid}"
            coord = await create_user_helper(f"coord_api_{uid}@example.com", "Coord Alice", UserRole.coordinator)
            fund = await create_user_helper(f"fund_api_{uid}@example.com", "Fund Dan", UserRole.fundraiser)
            citizen = await create_user_helper(f"cit_api_{uid}@example.com", "Cit Bob", UserRole.citizen)

            coord_token = create_access_token({"sub": str(coord.id), "email": coord.email, "role": "coordinator"})
            fund_token = create_access_token({"sub": str(fund.id), "email": fund.email, "role": "fundraiser"})

            report = await create_report_helper(citizen.id, category=cat, lat=13.0000, lng=77.6000)

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Unauthenticated -> 401
                res_unauth = await ac.post(f"/api/v1/clusters/process-report/{report.id}")
                assert res_unauth.status_code == 401

                # 2. Fundraiser -> 403
                res_fund = await ac.post(
                    f"/api/v1/clusters/process-report/{report.id}",
                    headers={"Authorization": f"Bearer {fund_token}"},
                )
                assert res_fund.status_code == 403

                # 3. Coordinator -> 200 Success
                res_coord = await ac.post(
                    f"/api/v1/clusters/process-report/{report.id}",
                    headers={"Authorization": f"Bearer {coord_token}"},
                )
                assert res_coord.status_code == 200
                data = res_coord.json()
                assert data["report_id"] == report.id
                assert data["is_new_cluster"] is True
                assert data["report_status"] == "unverified"
                assert data["cluster"]["dominant_category"] == cat

                # 4. Nonexistent report -> 404
                res_404 = await ac.post(
                    "/api/v1/clusters/process-report/999999",
                    headers={"Authorization": f"Bearer {coord_token}"},
                )
                assert res_404.status_code == 404

                # 5. List clusters
                res_list = await ac.get(
                    "/api/v1/clusters",
                    headers={"Authorization": f"Bearer {coord_token}"},
                )
                assert res_list.status_code == 200
                assert len(res_list.json()) >= 1

                # 6. Get cluster detail
                cluster_id = data["cluster_id"]
                res_detail = await ac.get(
                    f"/api/v1/clusters/{cluster_id}",
                    headers={"Authorization": f"Bearer {coord_token}"},
                )
                assert res_detail.status_code == 200
                detail = res_detail.json()
                assert detail["id"] == cluster_id
                assert len(detail["reports"]) == 1
                assert detail["reports"][0]["id"] == report.id
                assert detail["reports"][0]["status"] == "unverified"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_cluster_transaction_rollback_on_failure():
    """Verify that a database failure during clustering triggers db.rollback()."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"citizen_roll_cl_{uid}@example.com", "Rollback User", UserRole.citizen)
            report = await create_report_helper(user.id, category=cat, lat=12.9716, lng=77.5946)

            async with AsyncSessionLocal() as session:
                with patch.object(session, "commit", side_effect=RuntimeError("Simulated DB Cluster Error")):
                    with patch.object(session, "rollback", new_callable=AsyncMock) as mock_rollback:
                        with pytest.raises(RuntimeError, match="Simulated DB Cluster Error"):
                            await cluster_incident_report(session, report.id)

                        assert mock_rollback.called, "db.rollback() MUST be called when persistence fails"
        finally:
            await engine.dispose()

    asyncio.run(_run())


# ── Step 6.4 Hardened Temporal Tests ─────────────────────────────────────────

def test_temporal_case_a_online_reports_within_window_join_cluster():
    """Case A: Online report at 10:00 + online report at 10:30 -> same cluster."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"storm_{uid}"
            user = await create_user_helper(f"cit_ta_{uid}@example.com", "User TA", UserRole.citizen)
            
            t10_00 = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)
            t10_30 = datetime(2026, 9, 4, 10, 30, 0, tzinfo=timezone.utc)

            r1 = await create_report_helper(user.id, category=cat, lat=15.1000, lng=78.1000, created_at=t10_00)
            r2 = await create_report_helper(user.id, category=cat, lat=15.1002, lng=78.1002, created_at=t10_30)

            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id, temporal_window_minutes=120)
                c2, is_new2 = await cluster_incident_report(session, r2.id, temporal_window_minutes=120)

            assert is_new1 is True
            assert is_new2 is False
            assert c1.id == c2.id
            assert c2.report_count == 2
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_temporal_case_b_delayed_offline_report_joins_original_event_cluster():
    """Case B: Offline report with client_timestamp 10:05 uploaded at 14:00 joins the 10:00 event cluster."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"cit_tb_{uid}@example.com", "User TB", UserRole.citizen)

            t10_00 = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)
            t10_05 = datetime(2026, 9, 4, 10, 5, 0, tzinfo=timezone.utc)
            t14_00 = datetime(2026, 9, 4, 14, 0, 0, tzinfo=timezone.utc)

            # Online report at 10:00
            r1 = await create_report_helper(user.id, category=cat, lat=15.2000, lng=78.2000, created_at=t10_00)
            # Offline report observed at 10:05, but uploaded at 14:00
            r2 = await create_report_helper(
                user.id,
                category=cat,
                lat=15.2003,
                lng=78.2002,
                submitted_offline=True,
                client_timestamp=t10_05,
                created_at=t14_00,
            )

            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id, temporal_window_minutes=120)
                c2, is_new2 = await cluster_incident_report(session, r2.id, temporal_window_minutes=120)

            assert is_new1 is True
            assert is_new2 is False, "Delayed offline report (10:05) MUST join the 10:00 cluster"
            assert c1.id == c2.id
            assert c2.report_count == 2
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_temporal_case_c_offline_report_outside_window_does_not_join():
    """Case C: Offline report observed at 04:00, uploaded at 10:05, does NOT join 10:00 cluster."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"flood_{uid}"
            user = await create_user_helper(f"cit_tc_{uid}@example.com", "User TC", UserRole.citizen)

            t04_00 = datetime(2026, 9, 4, 4, 0, 0, tzinfo=timezone.utc)
            t10_00 = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)
            t10_05 = datetime(2026, 9, 4, 10, 5, 0, tzinfo=timezone.utc)

            # Online report for 10:00 event
            r1 = await create_report_helper(user.id, category=cat, lat=15.3000, lng=78.3000, created_at=t10_00)
            # Offline report observed at 04:00 (6 hours earlier), uploaded at 10:05
            r2 = await create_report_helper(
                user.id,
                category=cat,
                lat=15.3002,
                lng=78.3002,
                submitted_offline=True,
                client_timestamp=t04_00,
                created_at=t10_05,
            )

            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id, temporal_window_minutes=120)
                c2, is_new2 = await cluster_incident_report(session, r2.id, temporal_window_minutes=120)

            assert is_new1 is True
            assert is_new2 is True, "Offline report observed at 04:00 MUST NOT join 10:00 cluster"
            assert c1.id != c2.id
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_temporal_case_d_cluster_updated_at_does_not_determine_offline_matching():
    """Case D: Cluster updated_at must NOT determine whether an offline event is temporally related."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            cat = f"hazard_{uid}"
            user = await create_user_helper(f"cit_td_{uid}@example.com", "User TD", UserRole.citizen)

            t10_00 = datetime(2026, 9, 4, 10, 0, 0, tzinfo=timezone.utc)
            t14_00 = datetime(2026, 9, 4, 14, 0, 0, tzinfo=timezone.utc)
            t14_05 = datetime(2026, 9, 4, 14, 5, 0, tzinfo=timezone.utc)

            # 1. Cluster created for 10:00 event
            r1 = await create_report_helper(user.id, category=cat, lat=15.4000, lng=78.4000, created_at=t10_00)
            async with AsyncSessionLocal() as session:
                c1, is_new1 = await cluster_incident_report(session, r1.id, temporal_window_minutes=120)
            assert is_new1 is True

            # 2. Simulate DB activity bumping cluster updated_at to 14:00 (e.g. system sync/note update)
            async with AsyncSessionLocal() as session:
                db_c1 = await session.get(ReportCluster, c1.id)
                db_c1.updated_at = t14_00
                await session.commit()

            # 3. New report observed at 14:05 (4 hours after the 10:00 event in cluster 1)
            r2 = await create_report_helper(
                user.id,
                category=cat,
                lat=15.4002,
                lng=78.4002,
                created_at=t14_05,
            )

            async with AsyncSessionLocal() as session:
                c2, is_new2 = await cluster_incident_report(session, r2.id, temporal_window_minutes=120)

            # Because the event in cluster 1 was at 10:00 (outside 120-min window of 14:05),
            # cluster updated_at at 14:00 must NOT falsely correlate r2 into c1!
            assert is_new2 is True
            assert c1.id != c2.id
        finally:
            await engine.dispose()

    asyncio.run(_run())

