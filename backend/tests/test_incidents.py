"""
ResQnet Citizen Incident Reporting Test Suite (Step 6.3)
Verifies:
- Citizen can create incident report
- Report status is strictly UNVERIFIED (signal, not ground truth)
- Reporter ID is bound to authenticated citizen
- photo_url is accepted
- media_url and media_type are strictly rejected
- Invalid coordinates and missing categories are rejected
- Unauthorized roles (responder, coordinator, fundraiser, unauthenticated) cannot create reports
- Incident creation does not mutate ground truth tables (roads, hazards, hubs, surveys)
- Database transaction explicitly rolls back on persistence failure
- Response never leaks passwords or hashes
"""
import asyncio
import uuid
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, text, func
from geoalchemy2.functions import ST_AsText, ST_SRID

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import engine, AsyncSessionLocal
from app.db.models import (
    User,
    UserRole,
    IncidentReport,
    ReportStatus,
    Road,
    HazardZone,
    SafetyHub,
    FieldSurvey,
)


# ── Helper to Seed Users ─────────────────────────────────────────────────────
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


# ── Test Cases ──────────────────────────────────────────────────────────────

def test_citizen_create_incident_report_success():
    """Verify citizen creates an unverified report with photo_url and PostGIS geometry."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_{uid}@example.com", "John Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "flood",
                        "description": "Rising water level near bridge",
                        "lat": 12.9716,
                        "lng": 77.5946,
                        "photo_url": "https://media.resqnet.org/uploads/flood1.jpg",
                        "submitted_offline": False,
                    },
                )

            assert res.status_code == 201
            data = res.json()
            assert data["category"] == "flood"
            assert data["description"] == "Rising water level near bridge"
            assert data["lat"] == 12.9716
            assert data["lng"] == 77.5946
            assert data["status"] == "unverified"
            assert data["reporter_id"] == citizen.id
            assert data["cluster_id"] is None
            assert data["photo_url"] == "https://media.resqnet.org/uploads/flood1.jpg"
            assert "created_at" in data
            assert "password" not in data
            assert "hashed_password" not in data

            # Verify in PostgreSQL database directly
            report_id = data["id"]
            async with AsyncSessionLocal() as session:
                db_report = await session.get(IncidentReport, report_id)
                assert db_report is not None
                assert db_report.status == ReportStatus.unverified
                assert db_report.reporter_id == citizen.id
                assert db_report.cluster_id is None
                assert db_report.verified_by_id is None
                assert db_report.verified_at is None
                assert db_report.photo_url == "https://media.resqnet.org/uploads/flood1.jpg"

                # Verify PostGIS Geometry
                geo_query = await session.execute(
                    text("SELECT ST_AsText(geom) as wkt, ST_SRID(geom) as srid FROM incident_reports WHERE id = :id"),
                    {"id": report_id}
                )
                geo_row = geo_query.mappings().first()
                assert geo_row is not None
                assert geo_row["srid"] == 4326
                assert "POINT" in geo_row["wkt"]
                assert "77.5946" in geo_row["wkt"]
                assert "12.9716" in geo_row["wkt"]
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_media_url_and_media_type_rejected():
    """Verify that media_url and media_type (reserved for field surveys) are rejected for citizen reports."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_media_{uid}@example.com", "Media Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Attempt sending media_url
                res_media_url = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "flood",
                        "lat": 12.9716,
                        "lng": 77.5946,
                        "media_url": "https://resqnet.storage/video.mp4",
                    },
                )
                assert res_media_url.status_code == 422
                assert res_media_url.json()["error"]["code"] == "VALIDATION_ERROR"

                # 2. Attempt sending media_type
                res_media_type = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "flood",
                        "lat": 12.9716,
                        "lng": 77.5946,
                        "media_type": "video/mp4",
                    },
                )
                assert res_media_type.status_code == 422
                assert res_media_type.json()["error"]["code"] == "VALIDATION_ERROR"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_unauthenticated_incident_report_rejected():
    """Verify unauthenticated requests are rejected with 401."""
    async def _run():
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/incident-reports",
                    json={
                        "category": "fire",
                        "lat": 12.9716,
                        "lng": 77.5946,
                    },
                )
            assert res.status_code == 401
            data = res.json()
            assert data["status"] == "error"
            assert data["error"]["code"] == "UNAUTHORIZED"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_non_citizen_roles_rejected():
    """Verify responder, coordinator, and fundraiser cannot submit citizen reports (403)."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            responder = await create_user_helper(f"resp_{uid}@example.com", "Responder Bob", UserRole.responder)
            coordinator = await create_user_helper(f"coord_{uid}@example.com", "Coordinator Alice", UserRole.coordinator)
            fundraiser = await create_user_helper(f"fund_{uid}@example.com", "Fundraiser Dan", UserRole.fundraiser)

            resp_token = create_access_token({"sub": str(responder.id), "email": responder.email, "role": "responder"})
            coord_token = create_access_token({"sub": str(coordinator.id), "email": coordinator.email, "role": "coordinator"})
            fund_token = create_access_token({"sub": str(fundraiser.id), "email": fundraiser.email, "role": "fundraiser"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # 1. Responder attempt -> 403
                res_resp = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {resp_token}"},
                    json={"category": "landslide", "lat": 13.0, "lng": 77.0},
                )
                assert res_resp.status_code == 403
                assert res_resp.json()["error"]["code"] == "FORBIDDEN"

                # 2. Coordinator attempt -> 403
                res_coord = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {coord_token}"},
                    json={"category": "landslide", "lat": 13.0, "lng": 77.0},
                )
                assert res_coord.status_code == 403
                assert res_coord.json()["error"]["code"] == "FORBIDDEN"

                # 3. Fundraiser attempt -> 403
                res_fund = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {fund_token}"},
                    json={"category": "landslide", "lat": 13.0, "lng": 77.0},
                )
                assert res_fund.status_code == 403
                assert res_fund.json()["error"]["code"] == "FORBIDDEN"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_invalid_coordinates_and_categories_validation():
    """Verify boundary checks on latitude, longitude, and category requirements."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_val_{uid}@example.com", "Val Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # Latitude > 90
                res_lat_high = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"category": "flood", "lat": 95.0, "lng": 77.0},
                )
                assert res_lat_high.status_code == 422

                # Latitude < -90
                res_lat_low = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"category": "flood", "lat": -95.0, "lng": 77.0},
                )
                assert res_lat_low.status_code == 422

                # Longitude > 180
                res_lng_high = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"category": "flood", "lat": 12.0, "lng": 185.0},
                )
                assert res_lng_high.status_code == 422

                # Longitude < -180
                res_lng_low = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"category": "flood", "lat": 12.0, "lng": -185.0},
                )
                assert res_lng_low.status_code == 422

                # Missing category
                res_no_cat = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"lat": 12.0, "lng": 77.0},
                )
                assert res_no_cat.status_code == 422

                # Empty string category
                res_empty_cat = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"category": "", "lat": 12.0, "lng": 77.0},
                )
                assert res_empty_cat.status_code == 422
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_cannot_inject_trusted_operational_fields():
    """Verify that attempting to inject trusted fields (status, cluster_id, verified_by_id) is forbidden."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_inj_{uid}@example.com", "Injector Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "road_block",
                        "description": "Fallen tree",
                        "lat": 13.0827,
                        "lng": 80.2707,
                        # Attacker attempts to inject trusted states
                        "status": "verified",
                        "cluster_id": 999,
                        "verified_by_id": 1,
                        "verified_at": "2026-09-04T00:00:00Z",
                    },
                )

            # Strict schema validation rejects forbidden extra fields
            assert res.status_code == 422
            assert res.json()["error"]["code"] == "VALIDATION_ERROR"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_incident_creation_does_not_modify_ground_truth_tables():
    """Verify that citizen incident reporting NEVER mutates roads, hazards, hubs, or surveys."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_gt_{uid}@example.com", "Ground Truth Test", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncSessionLocal() as session:
                roads_before = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_before = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_before = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_before = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "flood",
                        "description": "High water near highway",
                        "lat": 12.9716,
                        "lng": 77.5946,
                        "photo_url": "https://example.com/photo.jpg",
                    },
                )
            assert res.status_code == 201

            async with AsyncSessionLocal() as session:
                roads_after = (await session.execute(select(func.count(Road.id)))).scalar_one()
                hazards_after = (await session.execute(select(func.count(HazardZone.id)))).scalar_one()
                hubs_after = (await session.execute(select(func.count(SafetyHub.id)))).scalar_one()
                surveys_after = (await session.execute(select(func.count(FieldSurvey.id)))).scalar_one()

            assert roads_before == roads_after, "Roads table must not be mutated by citizen reports"
            assert hazards_before == hazards_after, "HazardZone table must not be mutated by citizen reports"
            assert hubs_before == hubs_after, "SafetyHub table must not be mutated by citizen reports"
            assert surveys_before == surveys_after, "FieldSurvey table must not be mutated by citizen reports"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_database_transaction_rollback_on_persistence_failure():
    """Verify that a database error during report persistence explicitly executes db.rollback()."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_roll_{uid}@example.com", "Rollback Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            # Patch db.commit to raise an exception and spy on db.rollback
            with patch("sqlalchemy.ext.asyncio.AsyncSession.commit", side_effect=RuntimeError("Simulated DB Disk Full")):
                with patch("sqlalchemy.ext.asyncio.AsyncSession.rollback", new_callable=AsyncMock) as mock_rollback:
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        with pytest.raises(RuntimeError, match="Simulated DB Disk Full"):
                            await ac.post(
                                "/api/v1/incident-reports",
                                headers={"Authorization": f"Bearer {token}"},
                                json={
                                    "category": "landslide",
                                    "lat": 13.0,
                                    "lng": 77.0,
                                },
                            )

                    # Confirm db.rollback was explicitly called before exception propagation
                    assert mock_rollback.called, "db.rollback() MUST be called when persistence fails"
        finally:
            await engine.dispose()

    asyncio.run(_run())


def test_no_password_or_hash_exposed_in_responses():
    """Verify that incident report creation response contains no sensitive credential keys."""
    async def _run():
        try:
            uid = uuid.uuid4().hex[:8]
            citizen = await create_user_helper(f"citizen_sec_{uid}@example.com", "Sec Citizen", UserRole.citizen)
            token = create_access_token({"sub": str(citizen.id), "email": citizen.email, "role": "citizen"})

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post(
                    "/api/v1/incident-reports",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "category": "medical_emergency",
                        "lat": 12.9716,
                        "lng": 77.5946,
                    },
                )
            assert res.status_code == 201
            body = res.text
            assert "password" not in body.lower()
            assert "hash" not in body.lower()
            assert "secret" not in body.lower()
        finally:
            await engine.dispose()

    asyncio.run(_run())
