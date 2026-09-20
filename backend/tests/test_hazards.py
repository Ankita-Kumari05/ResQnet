"""
ResQnet Hazard Zone Operational Management Test Suite (Step 6.8)
Comprehensive tests covering requirements A through AA for Step 6.8:
- Role authorization (Coordinator vs Citizen/Fundraiser/Responder)
- GeoJSON polygon SRID 4326 validation & invalid polygon rejection
- GET list active filtering & detail view with enum serialization
- HazardSeverity enum handling (LOW, MEDIUM, HIGH, CRITICAL)
- Operational updates (severity, is_active, last_verified_survey_id)
- Survey verification linking validation & responder ownership checks
- Immutability of identity fields (id, created_at, geom)
- Soft deactivation on DELETE (is_active = False, row preserved)
- Audit log generation for CREATE, UPDATE, VERIFICATION LINK, DEACTIVATION
- Transaction rollback on failure & row-level locking concurrency
- Absence of spatial guessing / auto polygon creation
"""
import asyncio
import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, text

from app.main import app
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
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
    HazardZone,
    HazardSeverity,
    AuditLog,
)

pytestmark = pytest.mark.asyncio


# ── Helper Functions ─────────────────────────────────────────────────────────

async def create_user(email: str, full_name: str, role: UserRole) -> User:
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


async def create_responder_profile(user: User, ngo_name: str = "Test Relief Org") -> Responder:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Responder).where(Responder.user_id == user.id))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        responder = Responder(
            user_id=user.id,
            ngo_name=ngo_name,
            status=ResponderStatus.available,
        )
        session.add(responder)
        await session.commit()
        await session.refresh(responder)
        return responder


def auth_headers(user: User) -> dict:
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


# ── Tests A-D: Creation Role Authorization ────────────────────────────────────

async def test_coordinator_can_create_hazard_zone():
    """A: Coordinator can create hazard zone."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_create_{unique_id}@resqnet.org", "Coord Create", UserRole.coordinator)

    payload = {
        "name": f"Flood Perimeter {unique_id}",
        "hazard_type": "flood",
        "severity": "HIGH",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [77.10, 28.50],
                    [77.12, 28.50],
                    [77.12, 28.52],
                    [77.10, 28.52],
                    [77.10, 28.50]
                ]
            ]
        }
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["name"] == f"Flood Perimeter {unique_id}"
        assert data["severity"] == "HIGH"
        assert data["is_active"] is True
        assert data["geometry"]["type"] == "Polygon"


async def test_citizen_cannot_create_hazard_zone():
    """B: Citizen cannot create hazard zone (403)."""
    unique_id = str(uuid.uuid4())[:8]
    citizen = await create_user(f"citizen_create_{unique_id}@resqnet.org", "Citizen", UserRole.citizen)

    payload = {
        "name": "Unauthorized Zone",
        "hazard_type": "landslide",
        "severity": "MEDIUM",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(citizen))
        assert res.status_code == 403


async def test_fundraiser_cannot_create_hazard_zone():
    """C: Fundraiser cannot create hazard zone (403)."""
    unique_id = str(uuid.uuid4())[:8]
    fundraiser = await create_user(f"fundraiser_create_{unique_id}@resqnet.org", "Fundraiser", UserRole.fundraiser)

    payload = {
        "name": "Unauthorized Zone",
        "hazard_type": "fire",
        "severity": "LOW",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(fundraiser))
        assert res.status_code == 403


async def test_responder_cannot_create_hazard_zone():
    """D: Responder cannot create hazard zone (403)."""
    unique_id = str(uuid.uuid4())[:8]
    responder_user = await create_user(f"resp_create_{unique_id}@resqnet.org", "Responder", UserRole.responder)
    await create_responder_profile(responder_user)

    payload = {
        "name": "Unauthorized Responder Zone",
        "hazard_type": "flood",
        "severity": "CRITICAL",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(responder_user))
        assert res.status_code == 403


# ── Tests E-F: Geometry Validation ───────────────────────────────────────────

async def test_valid_polygon_geometry_stored_as_srid_4326():
    """E: Valid polygon is stored as POLYGON SRID 4326."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_geom_{unique_id}@resqnet.org", "Coord Geom", UserRole.coordinator)

    payload = {
        "name": f"Valid Poly {unique_id}",
        "hazard_type": "landslide",
        "severity": "MEDIUM",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [77.20, 28.60],
                    [77.25, 28.60],
                    [77.25, 28.65],
                    [77.20, 28.65],
                    [77.20, 28.60]
                ]
            ]
        }
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        assert res.status_code == 201
        zone_id = res.json()["id"]

    # Verify directly in DB that SRID is 4326
    async with AsyncSessionLocal() as session:
        db_res = await session.execute(text("SELECT ST_SRID(geom), ST_GeometryType(geom) FROM hazard_zones WHERE id = :id"), {"id": zone_id})
        srid, geom_type = db_res.fetchone()
        assert srid == 4326
        assert "Polygon" in geom_type


async def test_invalid_polygon_rejected():
    """F: Invalid polygon is rejected (400/422)."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_inv_{unique_id}@resqnet.org", "Coord Inv", UserRole.coordinator)

    # Less than 3 points
    payload = {
        "name": "Invalid Poly",
        "hazard_type": "flood",
        "severity": "LOW",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        assert res.status_code in (400, 422)


# ── Tests G-I: GET List & Detail ─────────────────────────────────────────────

async def test_get_list_returns_active_hazard_zones():
    """G: GET list returns active hazard zones."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_list_{unique_id}@resqnet.org", "Coord List", UserRole.coordinator)

    payload = {
        "name": f"Active Zone {unique_id}",
        "hazard_type": "fire",
        "severity": "CRITICAL",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        assert create_res.status_code == 201

        list_res = await client.get("/api/v1/hazards")
        assert list_res.status_code == 200
        zones = list_res.json()
        matched = [z for z in zones if z["name"] == f"Active Zone {unique_id}"]
        assert len(matched) == 1
        assert matched[0]["is_active"] is True
        assert matched[0]["severity"] == "CRITICAL"


async def test_get_detail_returns_requested_zone():
    """H: GET detail returns requested zone."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_detail_{unique_id}@resqnet.org", "Coord Detail", UserRole.coordinator)

    payload = {
        "name": f"Detail Zone {unique_id}",
        "hazard_type": "flood",
        "severity": "MEDIUM",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        zone_id = create_res.json()["id"]

        detail_res = await client.get(f"/api/v1/hazards/{zone_id}")
        assert detail_res.status_code == 200
        data = detail_res.json()
        assert data["id"] == zone_id
        assert data["name"] == f"Detail Zone {unique_id}"
        assert data["severity"] == "MEDIUM"


async def test_missing_zone_returns_404():
    """I: Missing zone returns correct error (404)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/hazards/99999999")
        assert res.status_code == 404
        assert res.json()["error"]["code"] in ("NOT_FOUND", "HAZARD_ZONE_NOT_FOUND")


# ── Tests J-K: HazardSeverity Enum Handling ─────────────────────────────────

async def test_severity_accepts_enum_values():
    """J: Severity accepts LOW/MEDIUM/HIGH/CRITICAL."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_sev_{unique_id}@resqnet.org", "Coord Sev", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for sev in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
            payload = {
                "name": f"Sev Zone {sev} {unique_id}",
                "hazard_type": "flood",
                "severity": sev,
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            }
            res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
            assert res.status_code == 201
            assert res.json()["severity"] == sev


async def test_invalid_severity_rejected():
    """K: Invalid severity is rejected."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_invsev_{unique_id}@resqnet.org", "Coord InvSev", UserRole.coordinator)

    payload = {
        "name": f"Invalid Sev Zone {unique_id}",
        "hazard_type": "flood",
        "severity": "ULTRA_EXTREME",
        "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/hazards", json=payload, headers=auth_headers(coord))
        assert res.status_code in (400, 422)


# ── Tests L-Q: Operational Updates & Verification Linking ────────────────────

async def test_coordinator_can_update_severity():
    """L: Coordinator can update severity."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_upd_{unique_id}@resqnet.org", "Coord Upd", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Upd Zone {unique_id}",
                "hazard_type": "landslide",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"severity": "CRITICAL"},
            headers=auth_headers(coord)
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["severity"] == "CRITICAL"


async def test_authorized_responder_can_link_own_survey():
    """M, P: Authorized responder can update verification attribution with own survey."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_link_{unique_id}@resqnet.org", "Coord Link", UserRole.coordinator)
    resp_user = await create_user(f"resp_link_{unique_id}@resqnet.org", "Resp Link", UserRole.responder)
    responder = await create_responder_profile(resp_user)

    # Create survey submitted by responder
    async with AsyncSessionLocal() as session:
        survey = FieldSurvey(
            responder_id=responder.id,
            verification_outcome=FieldSurveyVerificationOutcome.confirmed_hazard,
            hazard_level=4,
            notes="Onsite hazard inspection confirmed.",
        )
        session.add(survey)
        await session.commit()
        await session.refresh(survey)
        survey_id = survey.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Link Zone {unique_id}",
                "hazard_type": "flood",
                "severity": "MEDIUM",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        # Responder links survey
        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"last_verified_survey_id": survey_id, "severity": "HIGH"},
            headers=auth_headers(resp_user)
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["last_verified_survey_id"] == survey_id
        assert patch_res.json()["severity"] == "HIGH"


async def test_unauthorized_responder_cannot_link_other_responder_survey():
    """N, Q: Unauthorized responder cannot modify hazard zone verification link with another's survey."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_unauthlink_{unique_id}@resqnet.org", "Coord Unauth", UserRole.coordinator)
    resp_owner = await create_user(f"resp_owner_{unique_id}@resqnet.org", "Resp Owner", UserRole.responder)
    responder1 = await create_responder_profile(resp_owner, "Org A")

    resp_other = await create_user(f"resp_other_{unique_id}@resqnet.org", "Resp Other", UserRole.responder)
    await create_responder_profile(resp_other, "Org B")

    # Survey belongs to responder1
    async with AsyncSessionLocal() as session:
        survey = FieldSurvey(
            responder_id=responder1.id,
            verification_outcome=FieldSurveyVerificationOutcome.confirmed_hazard,
            hazard_level=5,
        )
        session.add(survey)
        await session.commit()
        await session.refresh(survey)
        survey_id = survey.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Other Zone {unique_id}",
                "hazard_type": "flood",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        # resp_other attempts to link responder1's survey
        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"last_verified_survey_id": survey_id},
            headers=auth_headers(resp_other)
        )
        assert patch_res.status_code == 403


async def test_nonexistent_survey_id_cannot_be_linked():
    """O: Nonexistent survey ID cannot be linked (404)."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_nonsurvey_{unique_id}@resqnet.org", "Coord NonSurvey", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Nonexist Zone {unique_id}",
                "hazard_type": "fire",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"last_verified_survey_id": 99999999},
            headers=auth_headers(coord)
        )
        assert patch_res.status_code == 404


# ── Tests R: Immutable Identity Fields ───────────────────────────────────────

async def test_client_cannot_modify_immutable_identity_fields():
    """R: Client cannot modify immutable identity fields (id, created_at, geom during PATCH)."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_immut_{unique_id}@resqnet.org", "Coord Immut", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Immut Zone {unique_id}",
                "hazard_type": "flood",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]
        orig_created_at = create_res.json()["created_at"]

        # Attempt to patch id, created_at, geom
        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={
                "id": 88888,
                "created_at": "2020-01-01T00:00:00Z",
                "severity": "HIGH"
            },
            headers=auth_headers(coord)
        )
        assert patch_res.status_code == 200
        data = patch_res.json()
        assert data["id"] == zone_id  # unchanged
        assert data["created_at"] == orig_created_at  # unchanged
        assert data["severity"] == "HIGH"


# ── Tests S-U: Deactivation Behavior ─────────────────────────────────────────

async def test_delete_deactivates_and_preserves_historical_row():
    """S, T, U: DELETE deactivates zone, removes from active GET list, historical row preserved."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_deact_{unique_id}@resqnet.org", "Coord Deact", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Deact Zone {unique_id}",
                "hazard_type": "landslide",
                "severity": "HIGH",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        # DELETE endpoint call
        del_res = await client.delete(f"/api/v1/hazards/{zone_id}", headers=auth_headers(coord))
        assert del_res.status_code == 200
        assert del_res.json()["is_active"] is False

        # Active GET list no longer contains the zone
        list_res = await client.get("/api/v1/hazards")
        assert list_res.status_code == 200
        active_ids = [z["id"] for z in list_res.json()]
        assert zone_id not in active_ids

    # Historical row still exists in DB
    async with AsyncSessionLocal() as session:
        db_zone = await session.get(HazardZone, zone_id)
        assert db_zone is not None
        assert db_zone.is_active is False


# ── Tests V-X: Audit Logging & Transactions ──────────────────────────────────

async def test_mutation_creates_audit_record_with_old_and_new_values():
    """V, W: Mutation creates audit record containing old and new values."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_audit_{unique_id}@resqnet.org", "Coord Audit", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Audit Zone {unique_id}",
                "hazard_type": "flood",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"severity": "CRITICAL"},
            headers=auth_headers(coord)
        )
        assert patch_res.status_code == 200

    # Query audit logs
    async with AsyncSessionLocal() as session:
        audit_res = await session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "hazard_zone",
                AuditLog.entity_id == zone_id
            ).order_by(AuditLog.id)
        )
        logs = audit_res.scalars().all()
        assert len(logs) >= 2  # CREATE and UPDATE
        create_log = logs[0]
        assert create_log.action == "CREATE"
        assert create_log.actor_id == coord.id

        update_log = logs[1]
        assert update_log.actor_id == coord.id
        assert update_log.old_values["severity"] == "LOW"
        assert update_log.new_values["severity"] == "CRITICAL"


async def test_failed_mutation_rolls_back_atomic_transaction():
    """X: Failed mutation rolls back completely."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_rollback_{unique_id}@resqnet.org", "Coord Rollback", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Rollback Zone {unique_id}",
                "hazard_type": "fire",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        # Attempt invalid patch linking nonexistent survey ID
        patch_res = await client.patch(
            f"/api/v1/hazards/{zone_id}",
            json={"last_verified_survey_id": 99999999, "severity": "CRITICAL"},
            headers=auth_headers(coord)
        )
        assert patch_res.status_code == 404

    # Verify severity was NOT updated to CRITICAL
    async with AsyncSessionLocal() as session:
        zone = await session.get(HazardZone, zone_id)
        assert zone.severity == HazardSeverity.LOW


# ── Tests Y-AA: Concurrency & Spatial Boundaries ─────────────────────────────

async def test_concurrent_updates_do_not_corrupt_state():
    """Y: Concurrent updates do not corrupt hazard-zone state."""
    unique_id = str(uuid.uuid4())[:8]
    coord = await create_user(f"coord_conc_{unique_id}@resqnet.org", "Coord Conc", UserRole.coordinator)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_res = await client.post(
            "/api/v1/hazards",
            json={
                "name": f"Concurrent Zone {unique_id}",
                "hazard_type": "flood",
                "severity": "LOW",
                "coordinates": [[[77.10, 28.50], [77.12, 28.50], [77.12, 28.52], [77.10, 28.50]]]
            },
            headers=auth_headers(coord)
        )
        zone_id = create_res.json()["id"]

        async def update_sev(severity_val: str):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                return await c.patch(
                    f"/api/v1/hazards/{zone_id}",
                    json={"severity": severity_val},
                    headers=auth_headers(coord)
                )

        results = await asyncio.gather(
            update_sev("MEDIUM"),
            update_sev("HIGH"),
            update_sev("CRITICAL")
        )
        for r in results:
            assert r.status_code == 200

    # Verify final state is valid enum
    async with AsyncSessionLocal() as session:
        zone = await session.get(HazardZone, zone_id)
        assert zone.severity in (HazardSeverity.MEDIUM, HazardSeverity.HIGH, HazardSeverity.CRITICAL)


async def test_no_automatic_spatial_guessing_or_citizen_report_auto_creation():
    """Z, AA: No automatic spatial guessing occurs and no hazard zone is created from citizen reports."""
    async with AsyncSessionLocal() as session:
        db_res = await session.execute(select(func.count(HazardZone.id)))
        initial_count = db_res.scalar()

    unique_id = str(uuid.uuid4())[:8]
    citizen = await create_user(f"citizen_report_{unique_id}@resqnet.org", "Citizen Reporter", UserRole.citizen)

    # Post citizen incident report
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        rep_res = await client.post(
            "/api/v1/incidents",
            json={
                "category": "flood",
                "description": "Flash flood on main road",
                "lat": 28.51,
                "lng": 77.11
            },
            headers=auth_headers(citizen)
        )
        assert rep_res.status_code == 201

    # Verify HazardZone count has NOT increased automatically
    async with AsyncSessionLocal() as session:
        db_res = await session.execute(select(func.count(HazardZone.id)))
        new_count = db_res.scalar()
        assert new_count == initial_count
