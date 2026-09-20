"""
ResQnet Complete Realistic Demo Seed Data Script (SIH 2026 Prototype)
Populates all 17 tables in the ResQnet database with a complete, interconnected,
realistic disaster management scenario centered on the virtual city operating area.

Usage:
    cd backend
    python scripts/seed_demo_data.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys
import uuid

# Add parent directory to path to allow importing app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

from app.db.session import Base
from app.db.models import (
    User, UserRole, Responder, ResponderStatus,
    Intersection, Road, RoadStatus,
    SafetyHub, HubStatus, HubResource, ResourceType,
    HazardZone, HazardSeverity,
    IncidentReport, ReportStatus,
    ReportCluster, ReportClusterStatus,
    Mission, MissionType, MissionStatus,
    FieldSurvey, FieldSurveyVerificationOutcome,
    ResourceRequirement, RequirementStatus,
    Campaign, CampaignStatus,
    Donation,
    EmergencyAlert, AlertSeverity,
    AuditLog,
)
from app.core.security import get_password_hash
from app.core.config import get_settings

settings = get_settings()

def pt(lat: float, lng: float) -> str:
    """Helper to create PostGIS POINT WKT string."""
    return f"SRID=4326;POINT({lng} {lat})"

def poly(coords: list[tuple[float, float]]) -> str:
    """Helper to create PostGIS POLYGON WKT string."""
    ring = ", ".join(f"{lng} {lat}" for lat, lng in coords)
    return f"SRID=4326;POLYGON(({ring}))"

def line(coords: list[tuple[float, float]]) -> str:
    """Helper to create PostGIS LINESTRING WKT string."""
    pts = ", ".join(f"{lng} {lat}" for lat, lng in coords)
    return f"SRID=4326;LINESTRING({pts})"


async def seed_demo_data():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    now = datetime.now(timezone.utc)

    print("[*] Initializing PostgreSQL schema & PostGIS extensions...")
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
        print("[1/10] Seeding User Accounts (Citizens, Coordinators, Responders, Admin, Fundraiser)...")

        # ── 1. USERS ────────────────────────────────────────────────────────
        # 12 Citizens (Min 10 required)
        citizens_data = [
            ("citizen1@resqnet.in", "Priya Sharma", "citizen123"),       # Main Walkthrough Protagonist
            ("citizen2@resqnet.in", "Arjun Mehta", "citizen123"),
            ("citizen3@resqnet.in", "Kavita Patel", "citizen123"),
            ("citizen4@resqnet.in", "Rajesh Kumar", "citizen123"),
            ("citizen5@resqnet.in", "Ananya Sen", "citizen123"),
            ("citizen6@resqnet.in", "Vikram Joshi", "citizen123"),
            ("citizen7@resqnet.in", "Sunita Devi", "citizen123"),
            ("citizen8@resqnet.in", "Rohan Verma", "citizen123"),
            ("citizen9@resqnet.in", "Meera Nair", "citizen123"),
            ("citizen10@resqnet.in", "Deepak Choudhury", "citizen123"),
            ("citizen11@resqnet.in", "Neha Gupta", "citizen123"),
            ("citizen12@resqnet.in", "Amit Roy", "citizen123"),
        ]
        citizens = [
            User(
                email=email,
                full_name=name,
                role=UserRole.citizen,
                hashed_password=get_password_hash(pwd),
                is_active=True,
                created_at=now - timedelta(days=20, hours=i),
            )
            for i, (email, name, pwd) in enumerate(citizens_data)
        ]
        for c in citizens:
            db.add(c)

        # 3 Coordinators + 1 Admin (Coordinator role)
        coordinators_data = [
            ("coordinator@resqnet.in", "Rajiv Menon - Control Center Lead", "coord123"),
            ("coord_north@resqnet.in", "Dr. Sanjay Verma - Sector Commander North", "coord123"),
            ("coord_south@resqnet.in", "Sunita Rao - Logistics & Evacuation Lead", "coord123"),
            ("admin@resqnet.in", "System Administrator - Emergency Ops Center", "admin123"),
        ]
        coordinators = [
            User(
                email=email,
                full_name=name,
                role=UserRole.coordinator,
                hashed_password=get_password_hash(pwd),
                is_active=True,
                created_at=now - timedelta(days=60),
            )
            for email, name, pwd in coordinators_data
        ]
        for coord in coordinators:
            db.add(coord)

        # 8 Responders (Min 8 required with diverse units)
        responders_user_data = [
            ("responder1@resqnet.in", "Capt. Tarun Rawat (Rescue Team Alpha)", "respond123"),
            ("responder2@resqnet.in", "Dr. Pooja Saxena (Medical Team Bravo)", "respond123"),
            ("responder3@resqnet.in", "Insp. Devendra Singh (Fire Response Unit)", "respond123"),
            ("responder4@resqnet.in", "Cmdr. Ajay Rathore (NDRF Task Force 7)", "respond123"),
            ("responder5@resqnet.in", "Ramesh Kadam (Urban Search & Rescue USAR)", "respond123"),
            ("responder6@resqnet.in", "Aditi Deshmukh (Drone Recon & Tech Unit)", "respond123"),
            ("responder7@resqnet.in", "Sub-Insp. Farhan Ali (Police Emergency QRT)", "respond123"),
            ("responder8@resqnet.in", "Gurpreet Singh (Red Cross Logistics Convoy)", "respond123"),
        ]
        responder_users = [
            User(
                email=email,
                full_name=name,
                role=UserRole.responder,
                hashed_password=get_password_hash(pwd),
                is_active=True,
                created_at=now - timedelta(days=45),
            )
            for email, name, pwd in responders_user_data
        ]
        for ru in responder_users:
            db.add(ru)

        # 1 Fundraiser
        fundraiser_user = User(
            email="fundraiser@resqnet.in",
            full_name="Relief Campaign Director",
            role=UserRole.fundraiser,
            hashed_password=get_password_hash("fund123"),
            is_active=True,
            created_at=now - timedelta(days=30),
        )
        db.add(fundraiser_user)
        await db.flush()

        # ── 2. RESPONDER PROFILES ───────────────────────────────────────────
        print("[2/10] Seeding Responder Profiles & Geo-tracking...")
        responder_profiles_data = [
            (responder_users[0].id, "Flood Rescue Unit (NGO Sahayak)", ResponderStatus.on_mission, 20.5532, 85.8241),
            (responder_users[1].id, "Medical Emergency Unit (NGO Raksha)", ResponderStatus.on_mission, 20.5548, 85.8185),
            (responder_users[2].id, "City Fire & Rescue Service", ResponderStatus.deployed, 20.5540, 85.8302),
            (responder_users[3].id, "NDRF Disaster Response Wing", ResponderStatus.available, 20.5592, 85.8215),
            (responder_users[4].id, "Civil Defense USAR Team", ResponderStatus.on_mission, 20.5574, 85.8335),
            (responder_users[5].id, "AeroResQ Drone Surveillance", ResponderStatus.available, 20.5520, 85.8260),
            (responder_users[6].id, "Police Emergency Quick Response", ResponderStatus.available, 20.5535, 85.8205),
            (responder_users[7].id, "Red Cross Humanitarian Logistics", ResponderStatus.deployed, 20.5470, 85.8280),
        ]
        responders = [
            Responder(
                user_id=uid,
                ngo_name=ngo,
                status=st,
                last_known_lat=lat,
                last_known_lng=lng,
                geom=pt(lat, lng),
                last_seen_at=now - timedelta(minutes=5),
            )
            for uid, ngo, st, lat, lng in responder_profiles_data
        ]
        for r in responders:
            db.add(r)
        await db.flush()

        # ── 3. SAFETY HUBS ──────────────────────────────────────────────────
        print("[3/10] Seeding Safety Hubs & Relief Shelters...")
        hubs = [
            SafetyHub(
                name="Hub Alpha  -  Community Center",
                address="North Market Road, Sector 4",
                lat=20.560, lng=85.820,
                geom=pt(20.560, 85.820),
                max_capacity=400,
                current_occupancy=285, # 71% occupied
                status=HubStatus.open,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
            SafetyHub(
                name="Hub Beta  -  Government High School",
                address="East Bridge Street, Sector 2",
                lat=20.558, lng=85.835,
                geom=pt(20.558, 85.835),
                max_capacity=300,
                current_occupancy=265, # 88% occupied (NEAR CAPACITY)
                status=HubStatus.near_capacity,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
            SafetyHub(
                name="Hub Gamma  -  Sports Complex",
                address="South Canal Road, Sector 7",
                lat=20.545, lng=85.827,
                geom=pt(20.545, 85.827),
                max_capacity=600,
                current_occupancy=190, # 31% occupied (AMPLE SURPLUS)
                status=HubStatus.open,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
        ]
        for h in hubs:
            db.add(h)
        await db.flush()

        # ── 4. HUB RESOURCES & INVENTORY ─────────────────────────────────────
        print("[4/10] Seeding Hub Resource Inventories & Shortage Requirements...")
        hub_resources = [
            # Hub Alpha
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.food, current_quantity=850.0, unit="kg", critical_threshold=200.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.water, current_quantity=750.0, unit="L", critical_threshold=200.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.medical, current_quantity=45.0, unit="kits", critical_threshold=100.0), # CRITICAL SHORTAGE
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.shelter_kit, current_quantity=120.0, unit="tents", critical_threshold=50.0),

            # Hub Beta (Severely Strained)
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.food, current_quantity=140.0, unit="kg", critical_threshold=200.0), # CRITICAL
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.water, current_quantity=110.0, unit="L", critical_threshold=200.0), # CRITICAL
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.medical, current_quantity=85.0, unit="kits", critical_threshold=50.0),
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.shelter_kit, current_quantity=35.0, unit="tents", critical_threshold=50.0), # CRITICAL

            # Hub Gamma (Well Supplied)
            HubResource(hub_id=hubs[2].id, resource_type=ResourceType.food, current_quantity=1500.0, unit="kg", critical_threshold=300.0),
            HubResource(hub_id=hubs[2].id, resource_type=ResourceType.water, current_quantity=2400.0, unit="L", critical_threshold=300.0),
            HubResource(hub_id=hubs[2].id, resource_type=ResourceType.medical, current_quantity=300.0, unit="kits", critical_threshold=100.0),
            HubResource(hub_id=hubs[2].id, resource_type=ResourceType.shelter_kit, current_quantity=400.0, unit="tents", critical_threshold=100.0),
        ]
        for hr in hub_resources:
            db.add(hr)
        await db.flush()

        # Resource Requirements (Dynamic Shortages)
        reqs = [
            ResourceRequirement(
                hub_id=hubs[0].id,
                resource_type=ResourceType.medical,
                required_quantity=500.0,
                fulfilled_quantity=150.0,
                shortfall_quantity=350.0,
                unit="kits",
                priority=5,
                status=RequirementStatus.open,
            ),
            ResourceRequirement(
                hub_id=hubs[1].id,
                resource_type=ResourceType.water,
                required_quantity=2000.0,
                fulfilled_quantity=500.0,
                shortfall_quantity=1500.0,
                unit="L",
                priority=5,
                status=RequirementStatus.open,
            ),
            ResourceRequirement(
                hub_id=hubs[1].id,
                resource_type=ResourceType.food,
                required_quantity=800.0,
                fulfilled_quantity=300.0,
                shortfall_quantity=500.0,
                unit="kg",
                priority=4,
                status=RequirementStatus.in_transit,
            ),
            ResourceRequirement(
                hub_id=hubs[1].id,
                resource_type=ResourceType.shelter_kit,
                required_quantity=150.0,
                fulfilled_quantity=50.0,
                shortfall_quantity=100.0,
                unit="tents",
                priority=4,
                status=RequirementStatus.open,
            ),
        ]
        for req in reqs:
            db.add(req)
        await db.flush()

        # ── 5. CAMPAIGNS & REALISTIC DONATION LEDGER ────────────────────────
        print("[5/10] Seeding Relief Campaigns & Verified Mock Donations...")
        campaigns = [
            Campaign(
                title="Emergency Medical Kits for Hub Alpha Evacuees",
                description="Funding critical trauma kits, IV fluids, and antibiotics for 280+ flood evacuees sheltered at Hub Alpha.",
                status=CampaignStatus.active,
                hub_id=hubs[0].id,
                requirement_id=reqs[0].id,
                ngo_user_id=fundraiser_user.id,
                resource_type=ResourceType.medical,
                target_amount=50000.0,
                raised_amount=37500.0,
                share_slug="hub-alpha-medical-relief",
            ),
            Campaign(
                title="Clean Drinking Water & Rations for Hub Beta",
                description="Urgent procurement of bottled drinking water, water purification sachets, and meal packets for families relocated to Hub Beta.",
                status=CampaignStatus.active,
                hub_id=hubs[1].id,
                requirement_id=reqs[1].id,
                ngo_user_id=fundraiser_user.id,
                resource_type=ResourceType.water,
                target_amount=35000.0,
                raised_amount=26000.0,
                share_slug="hub-beta-clean-water",
            ),
            Campaign(
                title="Weatherproof Shelter Kits & Warm Blankets",
                description="Providing waterproof emergency family tarps, ground mats, and thermal blankets for families displaced along the canal.",
                status=CampaignStatus.active,
                hub_id=hubs[1].id,
                requirement_id=reqs[3].id,
                ngo_user_id=fundraiser_user.id,
                resource_type=ResourceType.shelter_kit,
                target_amount=45000.0,
                raised_amount=32500.0,
                share_slug="disaster-shelter-kits-demo",
            ),
        ]
        for camp in campaigns:
            db.add(camp)
        await db.flush()

        donations = [
            # Campaign 1 Donations (Total 37,500)
            Donation(campaign_id=campaigns[0].id, donor_name="Rotary Club Apex", amount=10000.0, message="Critical medical supplies for flood victims.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=8)),
            Donation(campaign_id=campaigns[0].id, donor_name="Dr. Arvind Rao", amount=10000.0, message="Stay safe everyone. Standing with the relief teams.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=6)),
            Donation(campaign_id=campaigns[0].id, donor_name="Tech for Good Trust", amount=5000.0, message="Empowering field responders.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=4)),
            Donation(campaign_id=campaigns[0].id, donor_name="Sneha Kulkarni", amount=5000.0, message="Praying for rapid recovery of all trapped families.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=3)),
            Donation(campaign_id=campaigns[0].id, donor_name="Sunil Agarwal", amount=5000.0, message="For emergency medical kits.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=2)),
            Donation(campaign_id=campaigns[0].id, donor_name="Anonymous Citizen", amount=2500.0, message="Every little bit counts.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(minutes=45)),

            # Campaign 2 Donations (Total 26,000)
            Donation(campaign_id=campaigns[1].id, donor_name="Resident Welfare Federation", amount=10000.0, message="Safe potable water for children and seniors.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=10)),
            Donation(campaign_id=campaigns[1].id, donor_name="Manish & Shweta Gupta", amount=5000.0, message="Hope clean water supplies arrive soon.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=7)),
            Donation(campaign_id=campaigns[1].id, donor_name="Civic Action Fund", amount=5000.0, message="Expedite the water tankers.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=5)),
            Donation(campaign_id=campaigns[1].id, donor_name="Kishore Trivedi", amount=5000.0, message="Clean drinking water is fundamental.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=2)),
            Donation(campaign_id=campaigns[1].id, donor_name="Anonymous Donor", amount=1000.0, message="Best wishes to the volunteers.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(minutes=30)),

            # Campaign 3 Donations (Total 32,500)
            Donation(campaign_id=campaigns[2].id, donor_name="Global Relief Initiative", amount=10000.0, message="Emergency waterproof family shelters.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=12)),
            Donation(campaign_id=campaigns[2].id, donor_name="Sunrise Alumni Association", amount=10000.0, message="Warm blankets for displaced residents.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=8)),
            Donation(campaign_id=campaigns[2].id, donor_name="Pooja Hegde", amount=5000.0, message="May all displaced citizens find warmth and shelter.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=4)),
            Donation(campaign_id=campaigns[2].id, donor_name="Harish Chandra", amount=5000.0, message="Support for shelter relief.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(hours=2)),
            Donation(campaign_id=campaigns[2].id, donor_name="Local Merchant Guild", amount=2500.0, message="Solidarity with our affected neighbors.", transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}", created_at=now - timedelta(minutes=20)),
        ]
        for d in donations:
            db.add(d)
        await db.flush()

        # ── 6. GRAPH TOPOLOGY (Intersections & Road Network) ─────────────────
        print("[6/10] Seeding Road Network & Graph Intersections...")
        intersections = [
            Intersection(name="North Market Junction (Hub A)", lat=20.560, lng=85.820, geom=pt(20.560, 85.820), is_hub=True, hub_id=hubs[0].id),
            Intersection(name="East Bridge Junction (Hub B)",  lat=20.558, lng=85.835, geom=pt(20.558, 85.835), is_hub=True, hub_id=hubs[1].id),
            Intersection(name="West Crossroads",              lat=20.554, lng=85.818, geom=pt(20.554, 85.818)),
            Intersection(name="Central West Junction",        lat=20.554, lng=85.824, geom=pt(20.554, 85.824)),
            Intersection(name="Central East Junction",        lat=20.554, lng=85.830, geom=pt(20.554, 85.830)),
            Intersection(name="East Crossroads",              lat=20.554, lng=85.836, geom=pt(20.554, 85.836)),
            Intersection(name="South-West Corner",            lat=20.547, lng=85.818, geom=pt(20.547, 85.818)),
            Intersection(name="South-East Corner",            lat=20.547, lng=85.836, geom=pt(20.547, 85.836)),
            Intersection(name="South Canal Hub (Hub C)",      lat=20.545, lng=85.827, geom=pt(20.545, 85.827), is_hub=True, hub_id=hubs[2].id),
        ]
        for i in intersections:
            db.add(i)
        await db.flush()

        I = intersections
        roads = [
            # Hub Alpha connections
            Road(name="North Market Road (N-W)", from_intersection_id=I[0].id, to_intersection_id=I[2].id, distance_km=0.8, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.560, 85.820), (20.554, 85.818)])),
            Road(name="North Diagonal Link", from_intersection_id=I[0].id, to_intersection_id=I[3].id, distance_km=1.0, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.560, 85.820), (20.554, 85.824)])),
            # Hub Beta connections
            Road(name="East Bridge Road (N-E)", from_intersection_id=I[1].id, to_intersection_id=I[5].id, distance_km=0.7, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.558, 85.835), (20.554, 85.836)])),
            Road(name="North-East Avenue", from_intersection_id=I[1].id, to_intersection_id=I[4].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.558, 85.835), (20.554, 85.830)])),
            # Central Horizontal Spine
            Road(name="Central Spine West", from_intersection_id=I[2].id, to_intersection_id=I[3].id, distance_km=0.6, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.554, 85.818), (20.554, 85.824)])),
            Road(name="Central Spine East", from_intersection_id=I[4].id, to_intersection_id=I[5].id, distance_km=0.6, is_bidirectional=True, status=RoadStatus.blocked, is_blocked=True, hazard_penalty=100.0, geom=line([(20.554, 85.830), (20.554, 85.836)])), # Blocked by tanker accident!
            Road(name="Central Cross (C4-C5)", from_intersection_id=I[3].id, to_intersection_id=I[4].id, distance_km=0.5, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.554, 85.824), (20.554, 85.830)])),
            # South Descending Segments
            Road(name="South-West Descent", from_intersection_id=I[2].id, to_intersection_id=I[6].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.554, 85.818), (20.547, 85.818)])),
            Road(name="South-East Descent", from_intersection_id=I[5].id, to_intersection_id=I[7].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.554, 85.836), (20.547, 85.836)])),
            # Hub Gamma connections
            Road(name="Canal Road West", from_intersection_id=I[6].id, to_intersection_id=I[8].id, distance_km=1.1, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.547, 85.818), (20.545, 85.827)])),
            Road(name="Canal Road East", from_intersection_id=I[7].id, to_intersection_id=I[8].id, distance_km=1.1, is_bidirectional=True, status=RoadStatus.clear, geom=line([(20.547, 85.836), (20.545, 85.827)])),
            # Flood-Prone Alternate Route (Target of Main Walkthrough Flood Scenario)
            Road(name="Flood-Prone River Basin Road", from_intersection_id=I[3].id, to_intersection_id=I[8].id, distance_km=1.3, is_bidirectional=True, status=RoadStatus.flooded, is_blocked=True, flood_penalty=80.0, geom=line([(20.554, 85.824), (20.545, 85.827)])),
        ]
        for r in roads:
            db.add(r)
        await db.flush()

        # ── 7. HAZARD ZONES ─────────────────────────────────────────────────
        print("[7/10] Seeding Hazard Zones...")
        hazard_zones = [
            HazardZone(
                name="River Basin Severe Flood Perimeter",
                hazard_type="flood",
                severity=HazardSeverity.CRITICAL,
                is_active=True,
                geom=poly([(20.556, 85.821), (20.556, 85.828), (20.548, 85.828), (20.548, 85.821), (20.556, 85.821)]),
            ),
            HazardZone(
                name="Northern Ridge Landslide Risk Zone",
                hazard_type="landslide",
                severity=HazardSeverity.HIGH,
                is_active=True,
                geom=poly([(20.563, 85.818), (20.563, 85.825), (20.558, 85.825), (20.558, 85.818), (20.563, 85.818)]),
            ),
            HazardZone(
                name="East Canal Industrial Hazmat Buffer",
                hazard_type="chemical_leak",
                severity=HazardSeverity.MEDIUM,
                is_active=False,
                geom=poly([(20.552, 85.832), (20.552, 85.838), (20.546, 85.838), (20.546, 85.832), (20.552, 85.832)]),
            ),
        ]
        for hz in hazard_zones:
            db.add(hz)
        await db.flush()

        # ── 8. REPORT CLUSTERS ──────────────────────────────────────────────
        print("[8/10] Seeding Report Clusters & Spatial Aggregations...")
        clusters = [
            # Cluster 1: MAIN WALKTHROUGH FLASH FLOOD
            ReportCluster(centroid_lat=20.5532, centroid_lng=85.8241, geom=pt(20.5532, 85.8241), report_count=3, priority_score=95.0, dominant_category="flood", status=ReportClusterStatus.mission_assigned),
            # Cluster 2: Building Collapse at East Bridge
            ReportCluster(centroid_lat=20.5574, centroid_lng=85.8335, geom=pt(20.5574, 85.8335), report_count=2, priority_score=85.0, dominant_category="structural_damage", status=ReportClusterStatus.mission_assigned),
            # Cluster 3: Tanker Overturn & Chemical Spill on Central Spine East
            ReportCluster(centroid_lat=20.5540, centroid_lng=85.8302, geom=pt(20.5540, 85.8302), report_count=1, priority_score=80.0, dominant_category="road_block", status=ReportClusterStatus.verified),
            # Cluster 4: Northern Landslide Obstruction
            ReportCluster(centroid_lat=20.5592, centroid_lng=85.8215, geom=pt(20.5592, 85.8215), report_count=1, priority_score=75.0, dominant_category="landslide", status=ReportClusterStatus.verified),
            # Cluster 5: Critical Cardiac Medical Emergency
            ReportCluster(centroid_lat=20.5548, centroid_lng=85.8185, geom=pt(20.5548, 85.8185), report_count=1, priority_score=90.0, dominant_category="medical", status=ReportClusterStatus.mission_assigned),
            # Cluster 6: Electrical Substation Fire
            ReportCluster(centroid_lat=20.5542, centroid_lng=85.8191, geom=pt(20.5542, 85.8191), report_count=1, priority_score=88.0, dominant_category="fire", status=ReportClusterStatus.mission_assigned),
            # Cluster 7: Underpass Flooding & Stranded Vehicles (OPEN)
            ReportCluster(centroid_lat=20.5462, centroid_lng=85.8278, geom=pt(20.5462, 85.8278), report_count=2, priority_score=65.0, dominant_category="waterlogging", status=ReportClusterStatus.open),
            # Cluster 8: Industrial Fume Leak (OPEN)
            ReportCluster(centroid_lat=20.5488, centroid_lng=85.8212, geom=pt(20.5488, 85.8212), report_count=1, priority_score=55.0, dominant_category="chemical_leak", status=ReportClusterStatus.open),
        ]
        for c in clusters:
            db.add(c)
        await db.flush()

        # ── 9. INCIDENT REPORTS / SOS REQUESTS (16 Total) ────────────────────
        print("[9/10] Seeding 16 Incident Reports & SOS Emergencies with Diverse Lifecycles...")
        incidents_data = [
            # 1. MAIN WALKTHROUGH PROTAGONIST INCIDENT (Priya Sharma - citizen1)
            (citizens[0].id, "flood", "CRITICAL SOS: Water level has surged past 4 feet in North Canal road; two elderly residents trapped on the ground floor with rising floodwaters. Need immediate rescue boat!", ReportStatus.verified, 20.5532, 85.8241, clusters[0].id),
            # 2. Cluster 1 supplementary report
            (citizens[1].id, "flood", "Severe waterlogging entering apartment lobby on Central West road; basement transformer sparking.", ReportStatus.clustered, 20.5538, 85.8244, clusters[0].id),
            # 3. Cluster 1 supplementary report
            (citizens[4].id, "flood", "Ground floor completely inundated; 6 people including infants relocated to roof terrace awaiting rescue.", ReportStatus.clustered, 20.5529, 85.8238, clusters[0].id),
            # 4. Building Collapse (Kavita Patel - citizen3)
            (citizens[2].id, "structural_damage", "Partial collapse of residential building exterior staircase following deluge; 4 residents trapped on 2nd floor.", ReportStatus.verified, 20.5574, 85.8335, clusters[1].id),
            # 5. Stranded Family near East Bridge
            (citizens[7].id, "missing_person", "Family with two small children stranded on elevated concrete pier after sudden flood surge swallowed pathway.", ReportStatus.clustered, 20.5581, 85.8346, clusters[1].id),
            # 6. Road Block Tanker Accident
            (citizens[5].id, "road_block", "Overturned 10-wheeler tanker leaking industrial oil across Central Spine East. Road completely blocked both ways.", ReportStatus.verified, 20.5540, 85.8302, clusters[2].id),
            # 7. Landslide Obstruction
            (citizens[3].id, "landslide", "Hillside mud and boulder slide blocking 120 meters of Northern Market descent. Light vehicles cannot pass.", ReportStatus.verified, 20.5592, 85.8215, clusters[3].id),
            # 8. Severe Medical Emergency
            (citizens[6].id, "medical", "Elderly dialysis patient in severe distress at Sector 4 without electrical power for portable equipment. Urgent paramedic needed!", ReportStatus.verified, 20.5548, 85.8185, clusters[4].id),
            # 9. Electrical Fire
            (citizens[8].id, "fire", "High-voltage transformer burst throwing flames toward nearby shop awnings. Dense smoke spreading.", ReportStatus.verified, 20.5542, 85.8191, clusters[5].id),
            # 10. Underpass Waterlogging
            (citizens[11].id, "waterlogging", "South Canal underpass subway submerged in 5 feet of stormwater; two passenger cars floating and stuck.", ReportStatus.clustered, 20.5462, 85.8278, clusters[6].id),
            # 11. Underpass Waterlogging - second report
            (citizens[3].id, "waterlogging", "Water level rising rapidly inside underpass, emergency tow truck required.", ReportStatus.clustered, 20.5460, 85.8275, clusters[6].id),
            # 12. Chemical Fume Leak
            (citizens[9].id, "chemical_leak", "Stinging yellow chemical vapor venting from storage drum near West Crossroads. Citizens reporting burning eyes.", ReportStatus.unverified, 20.5488, 85.8212, clusters[7].id),
            # 13. Severe Storm & Fallen Tree
            (citizens[10].id, "severe_storm", "Fallen banyan tree brought down 11kV electrical power lines across road near Central West junction.", ReportStatus.verified, 20.5521, 85.8252, None),
            # 14. Structural Damage Crack
            (citizens[0].id, "structural_damage", "Deep structural shear crack observed along East Canal overpass retaining wall; concrete debris shedding.", ReportStatus.unverified, 20.5471, 85.8342, None),
            # 15. Injured Evacuees Trauma First Aid
            (citizens[2].id, "injury", "Two flood evacuees pulled from drainage channel suffering lacerations and hypothermia requiring wound dressing.", ReportStatus.verified, 20.5583, 85.8361, None),
            # 16. False Alarm / Resolved Drainage Puddle
            (citizens[3].id, "flood", "False alarm: stormwater briefly pooled in commercial driveway but naturally drained away within 15 minutes.", ReportStatus.rejected, 20.5455, 85.8265, None),
        ]
        reports = [
            IncidentReport(
                reporter_id=rep_id,
                category=cat,
                description=desc,
                status=st,
                lat=lat,
                lng=lng,
                geom=pt(lat, lng),
                cluster_id=cid,
                submitted_offline=False,
                client_timestamp=now - timedelta(minutes=40),
                created_at=now - timedelta(minutes=40),
            )
            for rep_id, cat, desc, st, lat, lng, cid in incidents_data
        ]
        for rep in reports:
            db.add(rep)
        await db.flush()

        # ── 10. MISSIONS, FIELD SURVEYS, ALERTS & AUDIT ───────────────────────
        print("[10/10] Seeding Operational Field Missions, Ground Truth Surveys, Alerts & Audit Logs...")

        # 8 Operational Missions
        missions = [
            # Mission 1 (MAIN WALKTHROUGH): Flood Rescue assigned to Responder 1 (Team Alpha)
            Mission(
                mission_type=MissionType.rescue,
                status=MissionStatus.in_progress,
                title="Flood Rescue & Evacuation  -  River Basin Sector",
                description="Deploy inflatable rescue craft to extract 2 elderly trapped citizens on ground floor at North Canal Road (Cluster #1).",
                responder_id=responders[0].id,
                cluster_id=clusters[0].id,
                road_id=roads[11].id, # Flood-Prone River Basin Road
                hub_id=hubs[0].id,
                target_lat=20.5532,
                target_lng=85.8241,
                geom=pt(20.5532, 85.8241),
                notes="Priority rescue: elderly evacuees to be transported safely to Hub Alpha.",
                created_at=now - timedelta(minutes=35),
                accepted_at=now - timedelta(minutes=30),
            ),
            # Mission 2: Urban Search & Rubble Clearance
            Mission(
                mission_type=MissionType.rescue,
                status=MissionStatus.in_progress,
                title="USAR Staircase Structural Clearance  -  East Bridge",
                description="Deploy hydraulic shoring and extract 4 stranded residents from 2nd floor balcony (Cluster #2).",
                responder_id=responders[4].id, # USAR Ramesh Kadam
                cluster_id=clusters[1].id,
                road_id=roads[2].id,
                hub_id=hubs[1].id,
                target_lat=20.5574,
                target_lng=85.8335,
                geom=pt(20.5574, 85.8335),
                notes="Shoring team actively securing structural integrity.",
                created_at=now - timedelta(minutes=45),
                accepted_at=now - timedelta(minutes=40),
            ),
            # Mission 3: Tanker Hazmat Inspection
            Mission(
                mission_type=MissionType.survey_road,
                status=MissionStatus.completed,
                title="Hazardous Spill Containment & Road Blockage Survey",
                description="Inspect overturned tanker on Central Spine East and establish 200m exclusion perimeter.",
                responder_id=responders[2].id, # Fire Insp Devendra
                cluster_id=clusters[2].id,
                road_id=roads[5].id, # Central Spine East
                target_lat=20.5540,
                target_lng=85.8302,
                geom=pt(20.5540, 85.8302),
                notes="Foam blanket applied. Heavy recovery crane requested.",
                created_at=now - timedelta(hours=2),
                accepted_at=now - timedelta(hours=1, minutes=50),
                completed_at=now - timedelta(minutes=50),
            ),
            # Mission 4: Landslide Assessment
            Mission(
                mission_type=MissionType.survey_road,
                status=MissionStatus.completed,
                title="Northern Link Landslide Obstruction Assessment",
                description="Perform physical safety survey of mudslide volume on Northern Market Link.",
                responder_id=responders[3].id, # NDRF Cmdr Ajay Rathore
                cluster_id=clusters[3].id,
                road_id=roads[0].id,
                target_lat=20.5592,
                target_lng=85.8215,
                geom=pt(20.5592, 85.8215),
                notes="Earthmoving contractor notified. Estimated clearance 4 hours.",
                created_at=now - timedelta(hours=3),
                accepted_at=now - timedelta(hours=2, minutes=45),
                completed_at=now - timedelta(hours=1, minutes=30),
            ),
            # Mission 5: Medical Emergency
            Mission(
                mission_type=MissionType.rescue,
                status=MissionStatus.in_progress,
                title="Emergency Cardiac Patient Transfer & ALS First Aid",
                description="Deploy ALS paramedic ambulance with backup battery power to Sector 4 (Cluster #5).",
                responder_id=responders[1].id, # Medical Dr Pooja
                cluster_id=clusters[4].id,
                road_id=roads[4].id,
                hub_id=hubs[0].id,
                target_lat=20.5548,
                target_lng=85.8185,
                geom=pt(20.5548, 85.8185),
                notes="Paramedics administering IV fluids and stabilization.",
                created_at=now - timedelta(minutes=25),
                accepted_at=now - timedelta(minutes=20),
            ),
            # Mission 6: Fire Containment
            Mission(
                mission_type=MissionType.verify_incident,
                status=MissionStatus.accepted,
                title="Substation Fire Suppression & Grid Disconnection",
                description="Dispatch water mist tender to control electrical transformer blaze near West Crossroads.",
                responder_id=responders[2].id, # Fire Unit
                cluster_id=clusters[5].id,
                road_id=roads[4].id,
                target_lat=20.5542,
                target_lng=85.8191,
                geom=pt(20.5542, 85.8191),
                notes="Power board notified to cut upstream grid breaker.",
                created_at=now - timedelta(minutes=15),
                accepted_at=now - timedelta(minutes=10),
            ),
            # Mission 7: Aerial Drone Recon
            Mission(
                mission_type=MissionType.survey_road,
                status=MissionStatus.assigned,
                title="Aerial Drone Reconnaissance  -  East Canal Overpass",
                description="High-resolution optical/thermal drone flyover to inspect bridge retaining wall shear crack.",
                responder_id=responders[5].id, # Drone Aditi
                road_id=roads[10].id,
                target_lat=20.5471,
                target_lng=85.8342,
                geom=pt(20.5471, 85.8342),
                notes="Drone flight clearance approved for 120m altitude.",
                created_at=now - timedelta(minutes=10),
            ),
            # Mission 8: Resource Delivery
            Mission(
                mission_type=MissionType.deliver_resource,
                status=MissionStatus.in_progress,
                title="Emergency Potable Water & Rations Convoy to Hub Beta",
                description="Transport 1500L bottled drinking water and 300 emergency meal packs to relieve Hub Beta.",
                responder_id=responders[7].id, # Logistics Gurpreet
                hub_id=hubs[1].id,
                road_id=roads[2].id,
                target_lat=20.558,
                target_lng=85.835,
                geom=pt(20.558, 85.835),
                notes="Convoy moving via West Canal detour.",
                created_at=now - timedelta(minutes=20),
                accepted_at=now - timedelta(minutes=15),
            ),
        ]
        for m in missions:
            db.add(m)
        await db.flush()

        # Field Surveys (Ground Truth Verification)
        surveys = [
            # Survey 1 (MAIN WALKTHROUGH): Team Alpha confirms flood depth and rescues residents
            FieldSurvey(
                mission_id=missions[0].id,
                responder_id=responders[0].id,
                road_id=roads[11].id,
                cluster_id=clusters[0].id,
                observed_lat=20.5532,
                observed_lng=85.8241,
                observed_geom=pt(20.5532, 85.8241),
                observed_condition="Flood depth 1.25m with strong lateral current. Ground floor inundated. Both elderly residents extracted safely to rescue boat. Road impassable for wheeled traffic.",
                road_status=RoadStatus.flooded,
                flood_penalty=80.0,
                is_blocked=True,
                hazard_level=4,
                verification_outcome=FieldSurveyVerificationOutcome.confirmed_hazard,
                media_url="https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80",
                notes="Evacuees being escorted toward Hub Alpha. Flood barriers required at intersection.",
                submitted_offline=False,
                submitted_at=now - timedelta(minutes=15),
            ),
            # Survey 2: Tanker accident ground truth
            FieldSurvey(
                mission_id=missions[2].id,
                responder_id=responders[2].id,
                road_id=roads[5].id,
                cluster_id=clusters[2].id,
                observed_lat=20.5540,
                observed_lng=85.8302,
                observed_geom=pt(20.5540, 85.8302),
                observed_condition="Overturned commercial fuel tanker. Dense fuel sheen on asphalt spanning 60 meters. Road barricaded.",
                road_status=RoadStatus.blocked,
                hazard_penalty=100.0,
                is_blocked=True,
                hazard_level=5,
                verification_outcome=FieldSurveyVerificationOutcome.road_blocked,
                media_url="https://images.unsplash.com/photo-1590856029826-c7a73142bbf1?auto=format&fit=crop&w=800&q=80",
                notes="Foam applied. Hazmat cleanup underway.",
                submitted_offline=False,
                submitted_at=now - timedelta(minutes=55),
            ),
            # Survey 3: Landslide ground truth
            FieldSurvey(
                mission_id=missions[3].id,
                responder_id=responders[3].id,
                road_id=roads[0].id,
                cluster_id=clusters[3].id,
                observed_lat=20.5592,
                observed_lng=85.8215,
                observed_geom=pt(20.5592, 85.8215),
                observed_condition="Debris cone of wet clay and rocks covering approx 80m. Heavy loader required.",
                road_status=RoadStatus.blocked,
                hazard_penalty=60.0,
                is_blocked=True,
                hazard_level=3,
                verification_outcome=FieldSurveyVerificationOutcome.road_blocked,
                submitted_offline=False,
                submitted_at=now - timedelta(hours=1, minutes=35),
            ),
        ]
        for s in surveys:
            db.add(s)
        await db.flush()

        # Update Road last verified survey IDs
        roads[11].last_verified_survey_id = surveys[0].id
        roads[11].last_verified_at = now - timedelta(minutes=15)
        roads[5].last_verified_survey_id = surveys[1].id
        roads[5].last_verified_at = now - timedelta(minutes=55)

        # Emergency Alerts
        alerts = [
            EmergencyAlert(
                title="CRITICAL FLOOD EVACUATION WARNING  -  RIVER BASIN & NORTH CANAL",
                message="Flash flood surge in effect along North Canal / River Basin corridor. Water levels exceed 1.2 meters. Mandatory evacuation ordered. Follow Dijkstra safety evacuation routes toward Hub Alpha or Hub Gamma.",
                severity=AlertSeverity.EMERGENCY,
                alert_type="evacuation",
                affected_area_geom=None,
                is_active=True,
                issued_by_id=coordinators[0].id,
                created_at=now - timedelta(hours=1),
            ),
            EmergencyAlert(
                title="ROAD CLOSURE NOTICE  -  CENTRAL SPINE EAST & NORTH LINK",
                message="Central Spine East closed due to overturned tanker hazmat spill. Northern Market descent impassable due to landslide. Responders on scene. Use Canal Road West for north-south transit.",
                severity=AlertSeverity.WARNING,
                alert_type="road_closure",
                affected_area_geom=None,
                is_active=True,
                issued_by_id=coordinators[1].id,
                created_at=now - timedelta(hours=2),
            ),
            EmergencyAlert(
                title="SHELTER ADVISORY  -  HUB BETA (GOVT SCHOOL) AT 88% CAPACITY",
                message="Hub Beta is nearing operational capacity (265/300). Citizens evacuating from Sector 2 are strongly advised to proceed to Hub Gamma (Sports Complex) where surplus food and medical aid are available.",
                severity=AlertSeverity.ADVISORY,
                alert_type="shelter_update",
                affected_area_geom=None,
                is_active=True,
                issued_by_id=coordinators[2].id,
                created_at=now - timedelta(minutes=45),
            ),
        ]
        for a in alerts:
            db.add(a)
        await db.flush()

        # Audit Logs (System administrative history)
        audit_logs = [
            AuditLog(actor_id=coordinators[0].id, action="CREATE_EMERGENCY_ALERT", entity_type="emergency_alerts", entity_id=alerts[0].id, new_values={"title": alerts[0].title, "severity": "EMERGENCY"}, created_at=now - timedelta(hours=1)),
            AuditLog(actor_id=coordinators[0].id, action="DISPATCH_MISSION", entity_type="missions", entity_id=missions[0].id, new_values={"responder_id": responders[0].id, "type": "rescue"}, created_at=now - timedelta(minutes=35)),
            AuditLog(actor_id=responder_users[0].id, action="PROPAGATE_GROUND_TRUTH", entity_type="roads", entity_id=roads[11].id, new_values={"status": "flooded", "is_blocked": True}, created_at=now - timedelta(minutes=15)),
            AuditLog(actor_id=coordinators[1].id, action="CREATE_EMERGENCY_ALERT", entity_type="emergency_alerts", entity_id=alerts[1].id, new_values={"title": alerts[1].title, "severity": "WARNING"}, created_at=now - timedelta(hours=2)),
        ]
        for al in audit_logs:
            db.add(al)

        await db.commit()

    print("\n" + "="*70)
    print(" [OK] ResQnet Complete Realistic Demo Seed Data Successfully Loaded!")
    print("="*70)
    print("\n[*] POPULATED ENTITIES SUMMARY:")
    print("  - 12 Fictional Citizens (Priya, Arjun, Kavita, Rajesh, etc.)")
    print("  - 4 Coordinators / Admins (Rajiv Menon, Dr. Verma, Sunita Rao, System Admin)")
    print("  - 8 Specialized Field Responders (Alpha, Bravo, Fire, NDRF, USAR, Drone, Police, Red Cross)")
    print("  - 3 Safety Hubs with real occupancy & resource metrics")
    print("  - 12 Hub Inventory Records & 4 Resource Shortage Requirements")
    print("  - 3 Active Crowdfunding Campaigns with 16 Verified Mock Donations (Total: Rs 96,000)")
    print("  - 9 Graph Intersections & 12 Graph Road Edges (with real blockages & penalties)")
    print("  - 3 Active Hazard Zones (Flood, Landslide, Industrial)")
    print("  - 8 Spatial Report Clusters (with dominant categories & priority scores)")
    print("  - 16 Realistic Citizen Incident Reports / SOS Emergencies with varied statuses")
    print("  - 8 Operational Missions assigned across responder teams")
    print("  - 3 Ground Truth Field Surveys with verified media & conditions")
    print("  - 3 Active Emergency Broadcast Alerts (Evacuation, Road Closure, Shelter Advisory)")
    print("  - Complete Audit Trail Logs\n")

    print("[+] DEMO LOGIN CREDENTIALS:")
    print("  Coordinator (Lead):  coordinator@resqnet.in  / coord123")
    print("  Administrator:       admin@resqnet.in        / admin123")
    print("  Citizen (Hero):      citizen1@resqnet.in     / citizen123 (Priya Sharma)")
    print("  Citizen 2:           citizen2@resqnet.in     / citizen123 (Arjun Mehta)")
    print("  Responder (Alpha):   responder1@resqnet.in   / respond123 (Capt. Tarun Rawat)")
    print("  Responder (Medical): responder2@resqnet.in   / respond123 (Dr. Pooja Saxena)")
    print("  Fundraiser:          fundraiser@resqnet.in   / fund123")
    print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
