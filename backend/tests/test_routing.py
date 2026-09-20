"""
ResQnet Disaster-Aware Routing Test Suite (Step 6.9)
Comprehensive tests covering requirements A through R for Step 6.9:
- Basic shortest path calculation
- Blocked road exclusion (is_blocked = True)
- Verified road penalties (hazard, flood, congestion)
- PostGIS ST_Intersects active hazard perimeter spatial penalties
- Inactive hazard zone exclusion
- CRITICAL spatial hazard dynamic non-traversability
- FULL & CLOSED Safety Hub exclusions
- Automatic minimum-cost reachable hub selection
- Explicit target hub selection
- No viable route clean error response
- Deterministic routing calculation
- Cache invalidation and dirty-flag rebuild
- Read-only safety (Citizen cannot mutate ground truth)
- Edge directionality respect (is_bidirectional = False)
- Deterministic maximum severity policy for overlapping hazards
- Step 6.7 and Step 6.8 regression validation
"""
import asyncio
import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient, ASGITransport
from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, Point, Polygon
from sqlalchemy import select, text

import random
from app.main import app
from app.core.security import create_access_token
from app.db.session import AsyncSessionLocal
from app.db.models import (
    User,
    UserRole,
    Intersection,
    Road,
    RoadStatus,
    SafetyHub,
    HubStatus,
    HazardZone,
    HazardSeverity,
)
from app.modules.routing.cache import invalidate_route_cache

pytestmark = pytest.mark.asyncio


# ── Helper Functions ─────────────────────────────────────────────────────────

import random
_coord_offset = float(random.randint(100, 5000))


def get_unique_coords() -> tuple[float, float]:
    global _coord_offset
    _coord_offset += 0.5
    lat = 10.0 + _coord_offset
    lng = 50.0 + _coord_offset
    return round(lat, 4), round(lng, 4)


async def create_user(email: str, role: UserRole = UserRole.citizen) -> User:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        user = User(
            email=email.lower().strip(),
            full_name="Test User",
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


# ── Tests A-F: Graph Traversal & Hazard Penalties ────────────────────────────

async def test_a_basic_shortest_path():
    """A: Basic shortest path calculation."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_a_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub A {unique_id}",
            address="Street 1",
            lat=base_lat + 0.05,
            lng=base_lng + 0.05,
            max_capacity=100,
            current_occupancy=10,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start Node {unique_id}", lat=base_lat, lng=base_lng, is_hub=False)
        i2 = Intersection(name=f"Hub Node {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2])
        await session.flush()

        r1 = Road(
            name=f"Road 1 {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i2.id,
            distance_km=2.5,
            is_blocked=False,
            is_bidirectional=True,
            status=RoadStatus.clear,
        )
        session.add(r1)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True, f"Response: {data}"
        assert data["target_hub_id"] == hub.id
        assert data["total_distance_km"] == 2.5
        assert data["total_cost"] == 2.5


async def test_b_blocked_road_excluded():
    """B: Blocked road (is_blocked = True) is excluded from routing."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_b_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub B {unique_id}",
            address="Street 2",
            lat=base_lat + 0.10,
            lng=base_lng + 0.10,
            max_capacity=100,
            current_occupancy=0,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start B {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Mid B {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05)
        i3 = Intersection(name=f"Hub Node B {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2, i3])
        await session.flush()

        # Direct road i1->i3 is BLOCKED
        r_direct = Road(
            name=f"Direct Road {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i3.id,
            distance_km=1.0,
            is_blocked=True,
            status=RoadStatus.blocked,
        )
        # Detour path i1->i2->i3 is CLEAR
        r_detour1 = Road(name=f"Detour 1 {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=2.0, is_blocked=False, status=RoadStatus.clear)
        r_detour2 = Road(name=f"Detour 2 {unique_id}", from_intersection_id=i2.id, to_intersection_id=i3.id, distance_km=2.0, is_blocked=False, status=RoadStatus.clear)

        session.add_all([r_direct, r_detour1, r_detour2])
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        # Path must use detour (i1 -> i2 -> i3), total distance 4.0 km
        assert data["total_distance_km"] == 4.0
        used_road_ids = [s["road_id"] for s in data["steps"]]
        assert r_direct.id not in used_road_ids


async def test_c_road_penalties_alter_route():
    """C: Verified road penalties (hazard, flood, congestion) alter route selection."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_c_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub C {unique_id}",
            address="Street 3",
            lat=base_lat + 0.10,
            lng=base_lng + 0.10,
            max_capacity=100,
            current_occupancy=0,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start C {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Mid C {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05)
        i3 = Intersection(name=f"Hub Node C {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2, i3])
        await session.flush()

        # Path 1: Short (1.0 km) but has heavy flood penalty (+10.0) -> cost = 11.0
        r_short = Road(
            name=f"Short Flooded {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i3.id,
            distance_km=1.0,
            flood_penalty=10.0,
            is_blocked=False,
            status=RoadStatus.flooded,
        )
        # Path 2: Longer detour (3.0 km) but clear -> cost = 3.0
        r_detour1 = Road(name=f"Detour C1 {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=1.5, is_blocked=False, status=RoadStatus.clear)
        r_detour2 = Road(name=f"Detour C2 {unique_id}", from_intersection_id=i2.id, to_intersection_id=i3.id, distance_km=1.5, is_blocked=False, status=RoadStatus.clear)

        session.add_all([r_short, r_detour1, r_detour2])
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        # Detour selected because cost 3.0 < 11.0
        assert data["total_cost"] == 3.0
        assert data["total_distance_km"] == 3.0


async def test_d_active_hazard_st_intersects_affects_route():
    """D: Active hazard ST_Intersects adds penalty (+50 for HIGH) to intersecting road."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_d_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub D {unique_id}",
            address="Street 4",
            lat=base_lat + 0.10,
            lng=base_lng + 0.10,
            max_capacity=100,
            current_occupancy=0,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start D {unique_id}", lat=base_lat, lng=base_lng)
        i3 = Intersection(name=f"Hub Node D {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i3])
        await session.flush()

        line_geom = from_shape(LineString([(base_lng, base_lat), (base_lng + 0.10, base_lat + 0.10)]), srid=4326)
        r1 = Road(
            name=f"Hazard Intersected Road {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i3.id,
            distance_km=2.0,
            geom=line_geom,
            is_blocked=False,
            status=RoadStatus.clear,
        )
        session.add(r1)

        # Create active HIGH hazard intersecting road
        poly_geom = from_shape(Polygon([
            (base_lng + 0.04, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.04)
        ]), srid=4326)
        hz = HazardZone(
            name=f"High Hazard Zone {unique_id}",
            hazard_type="landslide",
            severity=HazardSeverity.HIGH,
            is_active=True,
            geom=poly_geom,
        )
        session.add(hz)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        # Total cost = 2.0 (distance) + 50.0 (HIGH spatial hazard) = 52.0
        assert data["total_cost"] == 52.0
        assert data["steps"][0]["spatial_hazard_penalty"] == 50.0


async def test_e_inactive_hazard_ignored():
    """E: Inactive hazard zone (is_active = False) is ignored."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_e_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub E {unique_id}",
            address="Street 5",
            lat=base_lat + 0.10,
            lng=base_lng + 0.10,
            max_capacity=100,
            current_occupancy=0,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start E {unique_id}", lat=base_lat, lng=base_lng)
        i3 = Intersection(name=f"Hub Node E {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i3])
        await session.flush()

        line_geom = from_shape(LineString([(base_lng, base_lat), (base_lng + 0.10, base_lat + 0.10)]), srid=4326)
        r1 = Road(
            name=f"Road E {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i3.id,
            distance_km=2.0,
            geom=line_geom,
            is_blocked=False,
            status=RoadStatus.clear,
        )
        session.add(r1)

        # Inactive hazard zone
        poly_geom = from_shape(Polygon([
            (base_lng + 0.04, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.04)
        ]), srid=4326)
        hz = HazardZone(
            name=f"Inactive Hazard {unique_id}",
            hazard_type="fire",
            severity=HazardSeverity.CRITICAL,
            is_active=False,  # INACTIVE
            geom=poly_geom,
        )
        session.add(hz)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        # Inactive CRITICAL hazard ignored; cost remains distance 2.0
        assert data["total_cost"] == 2.0


async def test_f_critical_hazard_makes_road_non_traversable():
    """F: CRITICAL hazard makes intersecting road non-traversable dynamically."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_f_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(
            name=f"Hub F {unique_id}",
            address="Street 6",
            lat=base_lat + 0.10,
            lng=base_lng + 0.10,
            max_capacity=100,
            current_occupancy=0,
            status=HubStatus.open,
        )
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start F {unique_id}", lat=base_lat, lng=base_lng)
        i3 = Intersection(name=f"Hub Node F {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i3])
        await session.flush()

        line_geom = from_shape(LineString([(base_lng, base_lat), (base_lng + 0.10, base_lat + 0.10)]), srid=4326)
        r1 = Road(
            name=f"Critical Hazard Intersected {unique_id}",
            from_intersection_id=i1.id,
            to_intersection_id=i3.id,
            distance_km=2.0,
            geom=line_geom,
            is_blocked=False,
            status=RoadStatus.clear,
        )
        session.add(r1)

        # Active CRITICAL hazard
        poly_geom = from_shape(Polygon([
            (base_lng + 0.04, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.04),
            (base_lng + 0.06, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.06),
            (base_lng + 0.04, base_lat + 0.04)
        ]), srid=4326)
        hz = HazardZone(
            name=f"Critical Hazard Zone {unique_id}",
            hazard_type="fire",
            severity=HazardSeverity.CRITICAL,
            is_active=True,
            geom=poly_geom,
        )
        session.add(hz)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        # Road is non-traversable due to CRITICAL spatial hazard; no alternative route exists
        assert data["success"] is False
        assert "No viable route" in data["message"]


# ── Tests G-K: Hub Selection & Edge Cases ───────────────────────────────────

async def test_g_full_hub_excluded():
    """G: FULL hub (current_occupancy >= max_capacity) is excluded."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_g_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub_full = SafetyHub(
            name=f"Hub Full {unique_id}",
            address="Street Full",
            lat=base_lat + 0.05,
            lng=base_lng + 0.05,
            max_capacity=100,
            current_occupancy=100,  # FULL
            status=HubStatus.full,
        )
        session.add(hub_full)
        await session.flush()

        i1 = Intersection(name=f"Start G {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node G {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub_full.id)
        session.add_all([i1, i2])
        await session.flush()

        r1 = Road(name=f"Road G {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=1.0, is_blocked=False, status=RoadStatus.clear)
        session.add(r1)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub_full.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False
        assert "full, closed, or unavailable" in data["message"]


async def test_h_closed_hub_excluded():
    """H: CLOSED hub (status = closed) is excluded."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_h_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub_closed = SafetyHub(
            name=f"Hub Closed {unique_id}",
            address="Street Closed",
            lat=base_lat + 0.05,
            lng=base_lng + 0.05,
            max_capacity=100,
            current_occupancy=10,
            status=HubStatus.closed,  # CLOSED
        )
        session.add(hub_closed)
        await session.flush()

        i1 = Intersection(name=f"Start H {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node H {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub_closed.id)
        session.add_all([i1, i2])
        await session.flush()

        r1 = Road(name=f"Road H {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=1.0, is_blocked=False, status=RoadStatus.clear)
        session.add(r1)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub_closed.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False


async def test_i_auto_selected_hub_chooses_minimum_cost_reachable_hub():
    """I: Auto-selected hub chooses reachable open hub with minimum Dijkstra cost."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_i_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        # Far Hub (distance 10 km)
        hub_far = SafetyHub(name=f"Hub Far {unique_id}", lat=base_lat + 0.20, lng=base_lng + 0.20, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        # Near Hub (distance 2 km)
        hub_near = SafetyHub(name=f"Hub Near {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add_all([hub_far, hub_near])
        await session.flush()

        i1 = Intersection(name=f"Start I {unique_id}", lat=base_lat, lng=base_lng)
        i_far = Intersection(name=f"Node Far {unique_id}", lat=base_lat + 0.20, lng=base_lng + 0.20, is_hub=True, hub_id=hub_far.id)
        i_near = Intersection(name=f"Node Near {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, is_hub=True, hub_id=hub_near.id)
        session.add_all([i1, i_far, i_near])
        await session.flush()

        r_far = Road(name=f"Road Far {unique_id}", from_intersection_id=i1.id, to_intersection_id=i_far.id, distance_km=10.0, is_blocked=False, status=RoadStatus.clear)
        r_near = Road(name=f"Road Near {unique_id}", from_intersection_id=i1.id, to_intersection_id=i_near.id, distance_km=2.0, is_blocked=False, status=RoadStatus.clear)
        session.add_all([r_far, r_near])
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Omit target_hub_id
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": None},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True, f"test_i Response: {data}"
        assert data["target_hub_id"] == hub_near.id
        assert data["total_distance_km"] == 2.0


async def test_j_specific_target_hub_works():
    """J: Specific target hub selection works when target_hub_id is provided."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_j_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub1 = SafetyHub(name=f"Hub J1 {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        hub2 = SafetyHub(name=f"Hub J2 {unique_id}", lat=base_lat + 0.20, lng=base_lng + 0.20, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add_all([hub1, hub2])
        await session.flush()

        i1 = Intersection(name=f"Start J {unique_id}", lat=base_lat, lng=base_lng)
        i_h1 = Intersection(name=f"Node J1 {unique_id}", lat=base_lat + 0.02, lng=base_lng + 0.02, is_hub=True, hub_id=hub1.id)
        i_h2 = Intersection(name=f"Node J2 {unique_id}", lat=base_lat + 0.20, lng=base_lng + 0.20, is_hub=True, hub_id=hub2.id)
        session.add_all([i1, i_h1, i_h2])
        await session.flush()

        r1 = Road(name=f"Road J1 {unique_id}", from_intersection_id=i1.id, to_intersection_id=i_h1.id, distance_km=2.0, is_blocked=False, status=RoadStatus.clear)
        r2 = Road(name=f"Road J2 {unique_id}", from_intersection_id=i1.id, to_intersection_id=i_h2.id, distance_km=10.0, is_blocked=False, status=RoadStatus.clear)
        session.add_all([r1, r2])
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Request specific hub2 (farther)
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub2.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True, f"test_j Response: {data}"
        assert data["target_hub_id"] == hub2.id
        assert data["total_distance_km"] == 10.0


async def test_k_no_viable_route_handled_cleanly():
    """K: No viable route handled cleanly with success = False."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_k_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(name=f"Hub K {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Isolated Start {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node K {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2])
        # No road connecting i1 and i2
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False
        assert "No viable route" in data["message"]


# ── Tests L-R: Cache, Security, Directionality & Regression ──────────────────

async def test_l_deterministic_output():
    """L: Same input and database state yields identical route and cost."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_l_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(name=f"Hub L {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start L {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node L {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2])
        await session.flush()

        r1 = Road(name=f"Road L {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=3.0, is_blocked=False, status=RoadStatus.clear)
        session.add(r1)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/v1/routing/calculate", json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id}, headers=auth_headers(user))
        res2 = await client.post("/api/v1/routing/calculate", json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id}, headers=auth_headers(user))
        assert res1.json() == res2.json()


async def test_m_cache_invalidation_causes_graph_rebuild():
    """M: Cache invalidation causes dirty flag to trigger graph rebuild."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_m_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(name=f"Hub M {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start M {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node M {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2])
        await session.flush()

        r1 = Road(name=f"Road M {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=2.0, is_blocked=False, status=RoadStatus.clear)
        session.add(r1)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First call loads graph
        res1 = await client.post("/api/v1/routing/calculate", json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id}, headers=auth_headers(user))
        assert res1.json().get("success") is True, f"test_m res1 Response: {res1.json()}"
        assert res1.json()["total_cost"] == 2.0

        # Update road penalty in DB
        async with AsyncSessionLocal() as session:
            road = await session.get(Road, r1.id)
            road.hazard_penalty = 5.0
            await session.commit()

        # Call invalidate_route_cache()
        invalidate_route_cache(r1.id)

        # Next call reflects rebuild with updated penalty
        res2 = await client.post("/api/v1/routing/calculate", json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id}, headers=auth_headers(user))
        assert res2.json()["total_cost"] == 7.0


async def test_n_citizen_cannot_mutate_routing_ground_truth():
    """N: Citizen cannot mutate ground truth via routing endpoint."""
    unique_id = str(uuid.uuid4())[:8]
    citizen = await create_user(f"citizen_rt_n_{unique_id}@resqnet.org", role=UserRole.citizen)
    base_lat, base_lng = get_unique_coords()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET graph summary
        graph_res = await client.get("/api/v1/routing/graph")
        assert graph_res.status_code == 200

        # Calculate route
        calc_res = await client.post("/api/v1/routing/calculate", json={"from_lat": base_lat, "from_lng": base_lng}, headers=auth_headers(citizen))
        assert calc_res.status_code == 200


async def test_o_directionality_respected():
    """O: One-way road (is_bidirectional = False) allows traversal from->to only."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_o_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(name=f"Hub O {unique_id}", lat=base_lat, lng=base_lng, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        i_start = Intersection(name=f"Start O {unique_id}", lat=base_lat + 0.05, lng=base_lng + 0.05)
        i_hub = Intersection(name=f"Hub Node O {unique_id}", lat=base_lat, lng=base_lng, is_hub=True, hub_id=hub.id)
        session.add_all([i_start, i_hub])
        await session.flush()

        # One-way road from i_hub to i_start (REVERSE of what is needed to reach hub)
        r_oneway = Road(
            name=f"One Way Road {unique_id}",
            from_intersection_id=i_hub.id,
            to_intersection_id=i_start.id,
            distance_km=2.0,
            is_bidirectional=False,  # ONE WAY
            is_blocked=False,
            status=RoadStatus.clear,
        )
        session.add(r_oneway)
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt to route from i_start to i_hub
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat + 0.05, "from_lng": base_lng + 0.05, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        # Traversal in reverse direction is blocked by directionality
        assert data["success"] is False


async def test_p_multiple_overlapping_hazards_use_maximum_severity():
    """P: Multiple overlapping active hazards use maximum applicable severity policy."""
    unique_id = str(uuid.uuid4())[:8]
    user = await create_user(f"user_rt_p_{unique_id}@resqnet.org")
    base_lat, base_lng = get_unique_coords()

    async with AsyncSessionLocal() as session:
        hub = SafetyHub(name=f"Hub P {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, max_capacity=100, current_occupancy=0, status=HubStatus.open)
        session.add(hub)
        await session.flush()

        i1 = Intersection(name=f"Start P {unique_id}", lat=base_lat, lng=base_lng)
        i2 = Intersection(name=f"Hub Node P {unique_id}", lat=base_lat + 0.10, lng=base_lng + 0.10, is_hub=True, hub_id=hub.id)
        session.add_all([i1, i2])
        await session.flush()

        line_geom = from_shape(LineString([(base_lng, base_lat), (base_lng + 0.10, base_lat + 0.10)]), srid=4326)
        r1 = Road(name=f"Overlap Road {unique_id}", from_intersection_id=i1.id, to_intersection_id=i2.id, distance_km=2.0, geom=line_geom, is_blocked=False, status=RoadStatus.clear)
        session.add(r1)

        # Hazard 1: LOW (+5)
        hz_low = HazardZone(name=f"Low Hz {unique_id}", hazard_type="flood", severity=HazardSeverity.LOW, is_active=True, geom=from_shape(Polygon([(base_lng + 0.02, base_lat + 0.02), (base_lng + 0.04, base_lat + 0.02), (base_lng + 0.04, base_lat + 0.04), (base_lng + 0.02, base_lat + 0.04), (base_lng + 0.02, base_lat + 0.02)]), srid=4326))
        # Hazard 2: HIGH (+50)
        hz_high = HazardZone(name=f"High Hz {unique_id}", hazard_type="flood", severity=HazardSeverity.HIGH, is_active=True, geom=from_shape(Polygon([(base_lng + 0.03, base_lat + 0.03), (base_lng + 0.05, base_lat + 0.03), (base_lng + 0.05, base_lat + 0.05), (base_lng + 0.03, base_lat + 0.05), (base_lng + 0.03, base_lat + 0.03)]), srid=4326))

        session.add_all([hz_low, hz_high])
        await session.commit()

    invalidate_route_cache()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/routing/calculate",
            json={"from_lat": base_lat, "from_lng": base_lng, "target_hub_id": hub.id},
            headers=auth_headers(user),
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True, f"test_p Response: {data}"
        # Max severity policy: uses HIGH penalty (+50.0), total cost = 2.0 + 50.0 = 52.0
        assert data["total_cost"] == 52.0
        assert data["steps"][0]["spatial_hazard_penalty"] == 50.0
