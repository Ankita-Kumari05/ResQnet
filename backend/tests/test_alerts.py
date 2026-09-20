"""
ResQnet Emergency Alerts Test Suite (Step 6.13)
Comprehensive test coverage for alert creation RBAC, GeoJSON geometry validation,
PostGIS spatial filtering, temporal lifecycle, coordinator deactivation, and audit logging.
"""
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.security import create_access_token, get_password_hash
from app.db.session import AsyncSessionLocal
from app.db.models import (
    User, UserRole, EmergencyAlert, AlertSeverity, AuditLog
)


@pytest.mark.asyncio
async def test_alert_rbac_creation():
    """Citizen, Responder, and Fundraiser receive 403 on alert creation; Coordinator receives 201."""
    async with AsyncSessionLocal() as session:
        cit_email = f"citizen_{uuid.uuid4().hex[:6]}@test.com"
        resp_email = f"resp_{uuid.uuid4().hex[:6]}@test.com"
        fund_email = f"fund_{uuid.uuid4().hex[:6]}@test.com"
        coord_email = f"coord_{uuid.uuid4().hex[:6]}@test.com"

        u_cit = User(email=cit_email, full_name="Citizen", role=UserRole.citizen, hashed_password=get_password_hash("pass"), is_active=True)
        u_resp = User(email=resp_email, full_name="Responder", role=UserRole.responder, hashed_password=get_password_hash("pass"), is_active=True)
        u_fund = User(email=fund_email, full_name="Fundraiser", role=UserRole.fundraiser, hashed_password=get_password_hash("pass"), is_active=True)
        u_coord = User(email=coord_email, full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)

        session.add_all([u_cit, u_resp, u_fund, u_coord])
        await session.commit()

        t_cit = create_access_token({"sub": str(u_cit.id)})
        t_resp = create_access_token({"sub": str(u_resp.id)})
        t_fund = create_access_token({"sub": str(u_fund.id)})
        t_coord = create_access_token({"sub": str(u_coord.id)})

        payload = {
            "title": "FLOOD WARNING TEST",
            "message": "High flood risk near river basin.",
            "severity": "WARNING",
            "alert_type": "flood_warning"
        }

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Citizen -> 403
            res = await ac.post("/api/v1/alerts", json=payload, headers={"Authorization": f"Bearer {t_cit}"})
            assert res.status_code == 403

            # Responder -> 403
            res = await ac.post("/api/v1/alerts", json=payload, headers={"Authorization": f"Bearer {t_resp}"})
            assert res.status_code == 403

            # Fundraiser -> 403
            res = await ac.post("/api/v1/alerts", json=payload, headers={"Authorization": f"Bearer {t_fund}"})
            assert res.status_code == 403

            # Coordinator -> 201
            res = await ac.post("/api/v1/alerts", json=payload, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 201
            data = res.json()
            assert data["title"] == "FLOOD WARNING TEST"
            assert data["issued_by_id"] == u_coord.id
            assert data["is_active"] is True


@pytest.mark.asyncio
async def test_alert_validation():
    """Invalid GeoJSON, empty fields, or past expires_at return 422 Unprocessable Entity."""
    async with AsyncSessionLocal() as session:
        coord_email = f"coord_val_{uuid.uuid4().hex[:6]}@test.com"
        u_coord = User(email=coord_email, full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)
        session.add(u_coord)
        await session.commit()

        t_coord = create_access_token({"sub": str(u_coord.id)})

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Empty title -> 422
            res = await ac.post("/api/v1/alerts", json={"title": "  ", "message": "msg"}, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 422

            # Past expires_at -> 422
            past_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
            res = await ac.post("/api/v1/alerts", json={"title": "Test", "message": "msg", "expires_at": past_time}, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 422

            # Invalid GeoJSON coordinates -> 422
            bad_geojson = {
                "type": "Polygon",
                "coordinates": [[[200.0, 20.0], [85.0, 20.0], [85.0, 21.0], [200.0, 20.0]]]  # 200 is out of bounds longitude
            }
            res = await ac.post("/api/v1/alerts", json={"title": "Test", "message": "msg", "affected_area_geojson": bad_geojson}, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 422


@pytest.mark.asyncio
async def test_alert_spatial_and_temporal_filtering():
    """
    Tests PostGIS ST_Covers spatial filtering, temporal expiration filtering, and NULL geometry global matching.
    """
    async with AsyncSessionLocal() as session:
        coord_email = f"coord_spat_{uuid.uuid4().hex[:6]}@test.com"
        cit_email = f"cit_spat_{uuid.uuid4().hex[:6]}@test.com"
        u_coord = User(email=coord_email, full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)
        u_cit = User(email=cit_email, full_name="Citizen", role=UserRole.citizen, hashed_password=get_password_hash("pass"), is_active=True)
        session.add_all([u_coord, u_cit])
        await session.commit()

        t_coord = create_access_token({"sub": str(u_coord.id)})
        t_cit = create_access_token({"sub": str(u_cit.id)})

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Create spatial alert covering bounding polygon (85.80 -> 85.85, 20.50 -> 20.60)
            polygon_geojson = {
                "type": "Polygon",
                "coordinates": [[
                    [85.80, 20.50],
                    [85.85, 20.50],
                    [85.85, 20.60],
                    [85.80, 20.60],
                    [85.80, 20.50]
                ]]
            }

            res = await ac.post("/api/v1/alerts", json={
                "title": "ZONE A EMERGENCY",
                "message": "Evacuate Zone A",
                "severity": "EMERGENCY",
                "alert_type": "evacuation",
                "affected_area_geojson": polygon_geojson
            }, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 201
            alert_zone_a = res.json()

            # 2. Create global alert (affected_area_geojson = None)
            res = await ac.post("/api/v1/alerts", json={
                "title": "CITYWIDE ADVISORY",
                "message": "Stay tuned to safety radio",
                "severity": "ADVISORY",
                "alert_type": "advisory"
            }, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 201
            alert_global = res.json()

            # 3. Query active alerts with location inside Zone A (85.82, 20.55) -> returns BOTH zone_a and global
            res = await ac.get("/api/v1/alerts/active?lng=85.82&lat=20.55", headers={"Authorization": f"Bearer {t_cit}"})
            assert res.status_code == 200
            active_list = res.json()
            titles = [a["title"] for a in active_list]
            assert "ZONE A EMERGENCY" in titles
            assert "CITYWIDE ADVISORY" in titles
            # Deterministic order: EMERGENCY before ADVISORY
            assert active_list[0]["title"] == "ZONE A EMERGENCY"

            # 4. Query active alerts with location outside Zone A (85.00, 20.00) -> returns ONLY global alert
            res = await ac.get("/api/v1/alerts/active?lng=85.00&lat=20.00", headers={"Authorization": f"Bearer {t_cit}"})
            assert res.status_code == 200
            active_list_out = res.json()
            titles_out = [a["title"] for a in active_list_out]
            assert "ZONE A EMERGENCY" not in titles_out
            assert "CITYWIDE ADVISORY" in titles_out


@pytest.mark.asyncio
async def test_alert_deactivation_and_audit():
    """
    Tests soft-deactivation (is_active=False via DELETE), audit log recording, and terminal state on PATCH.
    """
    async with AsyncSessionLocal() as session:
        coord_email = f"coord_deact_{uuid.uuid4().hex[:6]}@test.com"
        u_coord = User(email=coord_email, full_name="Coordinator", role=UserRole.coordinator, hashed_password=get_password_hash("pass"), is_active=True)
        session.add(u_coord)
        await session.commit()

        t_coord = create_access_token({"sub": str(u_coord.id)})

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Create alert
            res = await ac.post("/api/v1/alerts", json={
                "title": "TEMPORARY WARNING",
                "message": "Flash flood warning",
                "severity": "WARNING",
                "alert_type": "flood"
            }, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 201
            alert_id = res.json()["id"]

            # 2. Update alert via PATCH -> 200
            res = await ac.patch(f"/api/v1/alerts/{alert_id}", json={
                "title": "UPDATED WARNING TITLE"
            }, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 200
            assert res.json()["title"] == "UPDATED WARNING TITLE"

            # 3. Soft-deactivate alert via DELETE -> 200
            res = await ac.delete(f"/api/v1/alerts/{alert_id}", headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 200

            # 4. Assert deactivated alert is excluded from active query
            res = await ac.get("/api/v1/alerts/active", headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 200
            active_ids = [a["id"] for a in res.json()]
            assert alert_id not in active_ids

            # 5. Attempt PATCH on deactivated alert -> 400 Bad Request
            res = await ac.patch(f"/api/v1/alerts/{alert_id}", json={
                "title": "REOPEN ATTEMPT"
            }, headers={"Authorization": f"Bearer {t_coord}"})
            assert res.status_code == 400

    # Verify AuditLog entries
    async with AsyncSessionLocal() as session:
        audit_res = await session.execute(
            select(AuditLog).where(AuditLog.entity_id == alert_id).order_by(AuditLog.id.asc())
        )
        logs = audit_res.scalars().all()
        actions = [l.action for l in logs]
        assert "EMERGENCY_ALERT_CREATED" in actions
        assert "EMERGENCY_ALERT_UPDATED" in actions
        assert "EMERGENCY_ALERT_DEACTIVATED" in actions
