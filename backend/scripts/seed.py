"""
ResQnet Seed Data — Virtual City
Represents a small disaster-affected area for SIH prototype demonstration.

Layout (approximate):
  Hub A (north-west)     Hub B (north-east)     Hub C (south)
       [I1]                    [I2]
        |  \                  /  |
       [I3]--[I4]----[I5]--[I6]
        |                        |
       [I7]                    [I8]

10 road segments covering all key paths.
Hazard zones initially INACTIVE — activated via simulation events.
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import Base
from app.db.models import (
    User, UserRole, Responder, ResponderStatus,
    Intersection, Road, RoadStatus,
    SafetyHub, HubStatus, HubResource,
    HazardZone, HazardSeverity,
    ResourceRequirement, ResourceType, RequirementStatus,
    Campaign, CampaignStatus, EmergencyAlert, AlertSeverity,
)





from app.core.security import get_password_hash
from app.core.config import get_settings

settings = get_settings()


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=True)

    # Create all tables
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))

        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, PRIMARY KEY (version_num));"))
        await conn.execute(text("DELETE FROM alembic_version;"))
        await conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('71867cddef4b');"))



    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        # ── Users ──────────────────────────────────────────────────────
        users = [
            User(email="coordinator@resqnet.in", full_name="Control Center", role=UserRole.coordinator,
                 hashed_password=get_password_hash("coord123"), is_active=True),
            User(email="citizen1@resqnet.in", full_name="Priya Sharma", role=UserRole.citizen,
                 hashed_password=get_password_hash("citizen123"), is_active=True),
            User(email="citizen2@resqnet.in", full_name="Arjun Mehta", role=UserRole.citizen,
                 hashed_password=get_password_hash("citizen123"), is_active=True),
            User(email="responder1@resqnet.in", full_name="Team Alpha - NGO Sahayak",
                 role=UserRole.responder,
                 hashed_password=get_password_hash("respond123"), is_active=True),
            User(email="responder2@resqnet.in", full_name="Team Beta - NGO Raksha",
                 role=UserRole.responder,
                 hashed_password=get_password_hash("respond123"), is_active=True),
            User(email="fundraiser@resqnet.in", full_name="Campaign Manager",
                 role=UserRole.fundraiser,
                 hashed_password=get_password_hash("fund123"), is_active=True),
        ]
        for u in users:
            db.add(u)
        await db.flush()

        responders = [
            Responder(user_id=users[3].id, ngo_name="NGO Sahayak", status=ResponderStatus.available),
            Responder(user_id=users[4].id, ngo_name="NGO Raksha", status=ResponderStatus.available),
        ]
        for r in responders:
            db.add(r)
        await db.flush()


        # ── Safety Hubs ────────────────────────────────────────────────
        hubs = [
            SafetyHub(name="Hub Alpha — Community Center", address="North Market Road",
                      lat=20.560, lng=85.820,
                      max_capacity=400, current_occupancy=120,
                      status=HubStatus.open),
            SafetyHub(name="Hub Beta — Government School", address="East Bridge Street",
                      lat=20.558, lng=85.835,
                      max_capacity=300, current_occupancy=80,
                      status=HubStatus.open),
            SafetyHub(name="Hub Gamma — Sports Complex", address="South Canal Road",
                      lat=20.545, lng=85.827,
                      max_capacity=600, current_occupancy=50,
                      status=HubStatus.open),
        ]
        for h in hubs:
            db.add(h)
        await db.flush()

        # ── Hub Resources Inventory ───────────────────────────────────
        hub_resources_seed = [
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.food, current_quantity=800.0, unit="kg", critical_threshold=200.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.water, current_quantity=750.0, unit="L", critical_threshold=200.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.medical, current_quantity=50.0, unit="kits", critical_threshold=100.0), # Critical!
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.water, current_quantity=50.0, unit="L", critical_threshold=200.0), # Critical!
        ]
        for hr in hub_resources_seed:
            db.add(hr)
        await db.flush()


        # ── Intersections (Graph Nodes) ────────────────────────────────
        # I1=NW corner (Hub Alpha)  I2=NE corner (Hub Beta)
        # I3=West-mid  I4=Center-W  I5=Center-E  I6=East-mid
        # I7=SW        I8=SE        I9=South (Hub Gamma)
        intersections = [
            Intersection(name="North Market Junction", lat=20.560, lng=85.820, is_hub=True, hub_id=hubs[0].id),
            Intersection(name="East Bridge Junction",  lat=20.558, lng=85.835, is_hub=True, hub_id=hubs[1].id),
            Intersection(name="West Crossroads",       lat=20.554, lng=85.818),
            Intersection(name="Central West",          lat=20.554, lng=85.824),
            Intersection(name="Central East",          lat=20.554, lng=85.830),
            Intersection(name="East Crossroads",       lat=20.554, lng=85.836),
            Intersection(name="South-West Corner",     lat=20.547, lng=85.818),
            Intersection(name="South-East Corner",     lat=20.547, lng=85.836),
            Intersection(name="South Canal Hub",       lat=20.545, lng=85.827, is_hub=True, hub_id=hubs[2].id),
        ]
        for i in intersections:
            db.add(i)
        await db.flush()

        I = intersections  # alias for readability below

        # ── Roads (Graph Edges) ────────────────────────────────────────
        # All roads start CLEAR with zero penalties
        roads = [
            # Hub Alpha connections
            Road(name="North Market Road (N-W)",   from_intersection_id=I[0].id, to_intersection_id=I[2].id, distance_km=0.8, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="North Diagonal (Hub A→C4)", from_intersection_id=I[0].id, to_intersection_id=I[3].id, distance_km=1.0, is_bidirectional=True, status=RoadStatus.clear),
            # Hub Beta connections
            Road(name="East Bridge Road (N-E)",    from_intersection_id=I[1].id, to_intersection_id=I[5].id, distance_km=0.7, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="North-East Link (Hub B→C5)",from_intersection_id=I[1].id, to_intersection_id=I[4].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear),
            # Central horizontal spine
            Road(name="Central Spine West",        from_intersection_id=I[2].id, to_intersection_id=I[3].id, distance_km=0.6, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="Central Spine East",        from_intersection_id=I[4].id, to_intersection_id=I[5].id, distance_km=0.6, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="Central Cross (C4-C5)",     from_intersection_id=I[3].id, to_intersection_id=I[4].id, distance_km=0.5, is_bidirectional=True, status=RoadStatus.clear),
            # South connections
            Road(name="South-West Descent",        from_intersection_id=I[2].id, to_intersection_id=I[6].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="South-East Descent",        from_intersection_id=I[5].id, to_intersection_id=I[7].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear),
            # Hub Gamma connections
            Road(name="Canal Road West",           from_intersection_id=I[6].id, to_intersection_id=I[8].id, distance_km=1.1, is_bidirectional=True, status=RoadStatus.clear),
            Road(name="Canal Road East",           from_intersection_id=I[7].id, to_intersection_id=I[8].id, distance_km=1.1, is_bidirectional=True, status=RoadStatus.clear),
            # Alternative diagonal (creates alternate route for demo)
            Road(name="Flood-Prone River Road",    from_intersection_id=I[3].id, to_intersection_id=I[8].id, distance_km=1.3, is_bidirectional=True, status=RoadStatus.clear),
        ]
        for r in roads:
            db.add(r)
        await db.flush()

        # ── Hazard Zones (initially INACTIVE) ─────────────────────────
        hazard_zones = [
            HazardZone(name="River Basin Flood Zone",  hazard_type="flood",     severity=HazardSeverity.LOW, is_active=False),
            HazardZone(name="Northern Landslide Zone", hazard_type="landslide", severity=HazardSeverity.LOW, is_active=False),
        ]

        for z in hazard_zones:
            db.add(z)
        await db.flush()

        # ── Resource Requirements ──────────────────────────────────────
        req1 = ResourceRequirement(
            hub_id=hubs[0].id,
            resource_type=ResourceType.medical,
            required_quantity=500.0,
            fulfilled_quantity=100.0,
            shortfall_quantity=400.0,
            unit="boxes",
            priority=3,
            status=RequirementStatus.open,
        )
        db.add(req1)
        await db.flush()

        # ── Relief Campaigns ──────────────────────────────────────────
        camp1 = Campaign(
            title="Emergency Medical Kits for Hub Alpha",
            description="Funding emergency medical kits for flood victims at Hub Alpha.",
            status=CampaignStatus.active,
            hub_id=hubs[0].id,
            requirement_id=req1.id,
            ngo_user_id=users[5].id, # fundraiser
            resource_type=ResourceType.medical,
            target_amount=40000.0,
            raised_amount=5000.0,
            share_slug="hub-alpha-meds-demo",
        )
        camp2 = Campaign(
            title="Clean Water Supply for Hub Beta",
            description="General relief campaign for clean drinking water supply.",
            status=CampaignStatus.active,
            hub_id=hubs[1].id,
            requirement_id=None,
            ngo_user_id=users[0].id, # coordinator
            resource_type=ResourceType.water,
            target_amount=25000.0,
            raised_amount=10000.0,
            share_slug="hub-beta-water-demo",
        )
        db.add(camp1)
        db.add(camp2)

        # ── Emergency Alerts (Fictional Virtual City Demo) ─────────────
        alert1 = EmergencyAlert(
            title="DEMO: CRITICAL FLOOD WARNING — NORTH CANAL REGION",
            message="Immediate evacuation advised for residents in North Market/Canal zone due to rising flood waters. Proceed to Hub Alpha or Hub Beta.",
            severity=AlertSeverity.EMERGENCY,
            alert_type="evacuation",
            affected_area_geom=None,  # City-wide broadcast for demo
            is_active=True,
            issued_by_id=users[0].id,  # coordinator
        )
        db.add(alert1)

        await db.commit()


from scripts.seed_fresh_map_dataset import seed_fresh_map_dataset

async def seed():
    await seed_fresh_map_dataset()

if __name__ == "__main__":
    asyncio.run(seed())

