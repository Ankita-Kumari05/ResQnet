"""
Test Suite: Map Engine V2 & ResQnet Backend Synchronization
Tests:
- Role permissions: Coordinators can author closures & hub geometry; Citizens/Responders cannot (403)
- GET /api/v1/map/state returns Feature lists with [lng, lat] coordinate order
- POST /api/v1/map/road-closures creates closure and writes AuditLog
- PATCH /api/v1/map/hubs/{id}/map-geometry upserts spatial geometry
- DELETE /api/v1/map/road-closures/{id} soft-deactivates
"""
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.db.models import (
    User,
    UserRole,
    SafetyHub,
    HubStatus,
    AuditLog,
)

pytestmark = pytest.mark.asyncio


async def get_or_create_user(email: str, full_name: str, role: UserRole) -> User:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalar_one_or_none()
        if not user:
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


async def test_map_state_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/map/state")
        assert res.status_code == 401


async def test_map_state_authenticated_structure():
    user = await get_or_create_user("citizen_test_map@resqnet.org", "Citizen Test", UserRole.citizen)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/map/state", headers=auth_headers(user))
        assert res.status_code == 200
        data = res.json()
        assert "version" in data
        assert "hazards" in data
        assert "hubs" in data
        assert "closures" in data
        assert isinstance(data["hazards"], list)
        assert isinstance(data["hubs"], list)
        assert isinstance(data["closures"], list)
        if len(data["hubs"]) > 0:
            hub = data["hubs"][0]
            assert hub["type"] == "Feature"
            assert hub["geometry"]["type"] == "Point"
            coords = hub["geometry"]["coordinates"]
            assert len(coords) == 2
            # Longitude ~ 76° (India), Latitude ~ 30°
            assert coords[0] > coords[1]


async def test_road_closure_rbac():
    citizen = await get_or_create_user("citizen_rc_test@resqnet.org", "Citizen RC", UserRole.citizen)
    coord = await get_or_create_user("coord_rc_test@resqnet.org", "Coord RC", UserRole.coordinator)

    payload = {
        "kind": "full",
        "name": f"Blocked Sector {uuid.uuid4().hex[:4]}",
        "geom": {
            "type": "LineString",
            "coordinates": [[76.7800, 30.7400], [76.7850, 30.7450]],
        },
        "reason": "Test barrier",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Citizen should get 403 Forbidden
        res_citizen = await client.post(
            "/api/v1/map/road-closures",
            headers=auth_headers(citizen),
            json=payload,
        )
        assert res_citizen.status_code == 403

        # Coordinator should get 201 Created
        res_coord = await client.post(
            "/api/v1/map/road-closures",
            headers=auth_headers(coord),
            json=payload,
        )
        assert res_coord.status_code == 201
        data = res_coord.json()
        assert data["type"] == "Feature"
        props = data["properties"]
        assert props["kind"] == "full"
        assert props["is_active"] is True
        # Verify coordinate order [lng, lat]
        assert data["geometry"]["coordinates"] == [[76.7800, 30.7400], [76.7850, 30.7450]]

        closure_id = props["id"]

        # Verify audit log was recorded
        async with AsyncSessionLocal() as session:
            audit = await session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "road_closure",
                    AuditLog.entity_id == closure_id,
                )
            )
            audit_entry = audit.scalar_one_or_none()
            assert audit_entry is not None
            assert audit_entry.action == "CREATE"

        # Soft delete
        res_del = await client.delete(
            f"/api/v1/map/road-closures/{closure_id}",
            headers=auth_headers(coord),
        )
        assert res_del.status_code == 200
        assert res_del.json()["properties"]["is_active"] is False


async def test_hub_map_geometry_upsert():
    coord = await get_or_create_user("coord_hub_test@resqnet.org", "Coord Hub", UserRole.coordinator)

    # Ensure a safety hub exists
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SafetyHub).limit(1))
        hub = result.scalar_one_or_none()
        if not hub:
            hub = SafetyHub(
                name="Test Hub for Map Sync",
                status=HubStatus.open,
                max_capacity=50,
                current_occupancy=0,
                latitude=30.7398,
                longitude=76.7827,
            )
            session.add(hub)
            await session.commit()
            await session.refresh(hub)
        hub_id = hub.id

    payload = {
        "entrance_geom": {
            "type": "Point",
            "coordinates": [76.7827, 30.7398],
        },
        "area_geom": {
            "type": "Polygon",
            "coordinates": [
                [
                    [76.7820, 30.7390],
                    [76.7830, 30.7390],
                    [76.7830, 30.7400],
                    [76.7820, 30.7400],
                    [76.7820, 30.7390],
                ]
            ],
        },
        "is_verified": True,
        "capabilities": {"medical": True, "shelter": True, "water": True},
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/map/hubs/{hub_id}/map-geometry",
            headers=auth_headers(coord),
            json=payload,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["hub_id"] == hub_id
        assert data["entrance_geom"]["coordinates"] == [76.7827, 30.7398]
        assert data["is_verified"] is True
        assert data["capabilities"]["medical"] is True
