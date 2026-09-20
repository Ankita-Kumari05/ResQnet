"""
ResQnet Fresh Coherent Test Dataset (Tricity Chandigarh / Mohali / Panchkula)
Specifically designed to exercise the single unified Map Engine across:
- Citizen, Coordinator, Responder roles
- Safety Hubs (Open, Near Capacity, Full, Closed)
- Hazards (Flood/Waterlogging, High-Risk, Danger Zone)
- Road Blockages (Entire Road Block & Road Section Block)
- Cross-Role SOS -> Coordinator Triage -> Mission Dispatch -> Responder OSRM Navigation
"""
import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys
import uuid

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


async def seed_fresh_map_dataset():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    now = datetime.now(timezone.utc)

    print("[*] Reinitializing PostgreSQL database schema for fresh Map Engine dataset...")
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
        print("[1/8] Seeding Users (Citizens, Coordinator, Responders, Admin)...")

        # ── 1. USERS ────────────────────────────────────────────────────────
        # 3 Citizens
        citizen_users = [
            User(
                email="citizen1@resqnet.in",
                full_name="Priya Sharma (Citizen 01)",
                role=UserRole.citizen,
                hashed_password=get_password_hash("citizen123"),
                phone="+91-9876543201",
                is_active=True,
                created_at=now - timedelta(days=5),
            ),
            User(
                email="citizen2@resqnet.in",
                full_name="Arjun Mehta (Citizen 02)",
                role=UserRole.citizen,
                hashed_password=get_password_hash("citizen123"),
                phone="+91-9876543202",
                is_active=True,
                created_at=now - timedelta(days=5),
            ),
            User(
                email="citizen3@resqnet.in",
                full_name="Kavita Patel (Citizen 03)",
                role=UserRole.citizen,
                hashed_password=get_password_hash("citizen123"),
                phone="+91-9876543203",
                is_active=True,
                created_at=now - timedelta(days=5),
            ),
        ]
        for c in citizen_users:
            db.add(c)

        # 1 Coordinator + 1 Admin
        coordinator_user = User(
            email="coordinator@resqnet.in",
            full_name="Rajiv Menon (Coordinator 01)",
            role=UserRole.coordinator,
            hashed_password=get_password_hash("coord123"),
            phone="+91-9876543000",
            department_or_org="State Disaster Control Center",
            is_active=True,
            created_at=now - timedelta(days=30),
        )
        admin_user = User(
            email="admin@resqnet.in",
            full_name="System Administrator",
            role=UserRole.coordinator, # Admin dashboard access
            hashed_password=get_password_hash("admin123"),
            phone="+91-9876543001",
            department_or_org="Emergency Ops Directorate",
            is_active=True,
            created_at=now - timedelta(days=60),
        )
        db.add(coordinator_user)
        db.add(admin_user)

        # 4 Responders
        responder_users = [
            User(
                email="responder1@resqnet.in",
                full_name="Capt. Tarun Rawat (Responder 01)",
                role=UserRole.responder,
                hashed_password=get_password_hash("respond123"),
                phone="+91-9876543101",
                department_or_org="Rescue Team Alpha",
                is_active=True,
                created_at=now - timedelta(days=20),
            ),
            User(
                email="responder2@resqnet.in",
                full_name="Dr. Pooja Saxena (Responder 02)",
                role=UserRole.responder,
                hashed_password=get_password_hash("respond123"),
                phone="+91-9876543102",
                department_or_org="Medical Team Bravo",
                is_active=True,
                created_at=now - timedelta(days=20),
            ),
            User(
                email="responder3@resqnet.in",
                full_name="Insp. Devendra Singh (Responder 03)",
                role=UserRole.responder,
                hashed_password=get_password_hash("respond123"),
                phone="+91-9876543103",
                department_or_org="Fire & Emergency QRT",
                is_active=True,
                created_at=now - timedelta(days=20),
            ),
            User(
                email="responder4@resqnet.in",
                full_name="Cmdr. Ajay Rathore (Responder 04)",
                role=UserRole.responder,
                hashed_password=get_password_hash("respond123"),
                phone="+91-9876543104",
                department_or_org="NDRF Task Force 7",
                is_active=True,
                created_at=now - timedelta(days=20),
            ),
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
            created_at=now - timedelta(days=15),
        )
        db.add(fundraiser_user)
        await db.flush()

        # ── 2. RESPONDER PROFILES ───────────────────────────────────────────
        print("[2/8] Seeding Responder Profiles with distinct operational states...")
        # Responder 01: AVAILABLE (Sector 22 Market)
        # Responder 02: AVAILABLE (Sector 35 Ring)
        # Responder 03: BUSY / DEPLOYED (Sector 43 Bus Terminus)
        # Responder 04: OFFLINE (Mohali Phase 7)
        responders = [
            Responder(
                user_id=responder_users[0].id,
                ngo_name="Rescue Team Alpha (NGO Sahayak)",
                status=ResponderStatus.available,
                verification_status="verified",
                darpan_id="PB-2026-ALPHA-01",
                phone="+91-9876543101",
                last_known_lat=30.7320,
                last_known_lng=76.7730,
                geom=pt(30.7320, 76.7730),
                last_seen_at=now - timedelta(minutes=2),
            ),
            Responder(
                user_id=responder_users[1].id,
                ngo_name="Medical Team Bravo (NGO Raksha)",
                status=ResponderStatus.available,
                verification_status="verified",
                darpan_id="PB-2026-BRAVO-02",
                phone="+91-9876543102",
                last_known_lat=30.7230,
                last_known_lng=76.7650,
                geom=pt(30.7230, 76.7650),
                last_seen_at=now - timedelta(minutes=3),
            ),
            Responder(
                user_id=responder_users[2].id,
                ngo_name="Fire Response Unit (Disaster QRT)",
                status=ResponderStatus.deployed, # BUSY
                verification_status="verified",
                darpan_id="PB-2026-QRT-03",
                phone="+91-9876543103",
                last_known_lat=30.7180,
                last_known_lng=76.7480,
                geom=pt(30.7180, 76.7480),
                last_seen_at=now - timedelta(minutes=5),
            ),
            Responder(
                user_id=responder_users[3].id,
                ngo_name="NDRF Task Force 7 (Reserve Wing)",
                status=ResponderStatus.offline, # OFFLINE
                verification_status="verified",
                darpan_id="PB-2026-NDRF-04",
                phone="+91-9876543104",
                last_known_lat=30.7080,
                last_known_lng=76.7220,
                geom=pt(30.7080, 76.7220),
                last_seen_at=now - timedelta(hours=6),
            ),
        ]
        for r in responders:
            db.add(r)
        await db.flush()

        # ── 3. SAFETY HUBS ──────────────────────────────────────────────────
        print("[3/8] Seeding 4 Safety Hubs with diverse states (OPEN, NEAR_CAPACITY, FULL, CLOSED)...")
        hubs = [
            SafetyHub(
                name="Safety Hub 01 — Sector 17 Staging Hub",
                address="Sector 17 Plaza Entrance, Chandigarh",
                lat=30.7398, lng=76.7827,
                geom=pt(30.7398, 76.7827),
                max_capacity=500,
                current_occupancy=120, # 24% load -> OPEN
                status=HubStatus.open,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
            SafetyHub(
                name="Safety Hub 02 — PGIMER Triage Hub",
                address="Sector 12 / PGIMER Medical Center, Chandigarh",
                lat=30.7650, lng=76.7750,
                geom=pt(30.7650, 76.7750),
                max_capacity=300,
                current_occupancy=275, # 91% load -> NEAR CAPACITY
                status=HubStatus.near_capacity,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
            SafetyHub(
                name="Safety Hub 03 — Manimajra Relief Center",
                address="Old Kalka Road, Manimajra, Chandigarh",
                lat=30.7250, lng=76.8450,
                geom=pt(30.7250, 76.8450),
                max_capacity=400,
                current_occupancy=400, # 100% load -> FULL
                status=HubStatus.full,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
            SafetyHub(
                name="Safety Hub 04 — Industrial Area Phase II Depot",
                address="Plot 18, Industrial Area Phase II, Chandigarh",
                lat=30.7020, lng=76.8020,
                geom=pt(30.7020, 76.8020),
                max_capacity=250,
                current_occupancy=0, # Inactive -> CLOSED
                status=HubStatus.closed,
                food_critical_threshold=0.20,
                water_critical_threshold=0.20,
                medical_critical_threshold=0.20,
                capacity_critical_threshold=0.85,
            ),
        ]
        for h in hubs:
            db.add(h)
        await db.flush()

        # Hub Resources
        hub_resources = [
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.food, current_quantity=1200.0, unit="kg", critical_threshold=300.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.water, current_quantity=2000.0, unit="L", critical_threshold=400.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.medical, current_quantity=150.0, unit="kits", critical_threshold=50.0),
            HubResource(hub_id=hubs[0].id, resource_type=ResourceType.shelter_kit, current_quantity=80.0, unit="tents", critical_threshold=30.0),

            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.food, current_quantity=180.0, unit="kg", critical_threshold=200.0),
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.water, current_quantity=150.0, unit="L", critical_threshold=250.0),
            HubResource(hub_id=hubs[1].id, resource_type=ResourceType.medical, current_quantity=30.0, unit="kits", critical_threshold=50.0),
        ]
        for hr in hub_resources:
            db.add(hr)
        await db.flush()

        # ── 4. GRAPH TOPOLOGY & ROADS ────────────────────────────────────────
        print("[4/8] Seeding Intersections and Road Graph (Entire & Partial Blocks)...")
        intersections = [
            Intersection(name="Sector 17 Central Staging (Hub 01)", lat=30.7398, lng=76.7827, geom=pt(30.7398, 76.7827), is_hub=True, hub_id=hubs[0].id),
            Intersection(name="PGIMER Triage Junction (Hub 02)",    lat=30.7650, lng=76.7750, geom=pt(30.7650, 76.7750), is_hub=True, hub_id=hubs[1].id),
            Intersection(name="Sector 22 Market Junction",          lat=30.7320, lng=76.7730, geom=pt(30.7320, 76.7730)),
            Intersection(name="Sector 35 Roundabout",               lat=30.7230, lng=76.7650, geom=pt(30.7230, 76.7650)),
            Intersection(name="Sector 19 Incident Crossing",        lat=30.7310, lng=76.7910, geom=pt(30.7310, 76.7910)),
            Intersection(name="Madhya Marg East Junction",          lat=30.7380, lng=76.7950, geom=pt(30.7380, 76.7950)),
            Intersection(name="East Bypass Crossing",               lat=30.7380, lng=76.8150, geom=pt(30.7380, 76.8150)),
            Intersection(name="Manimajra Relief Point (Hub 03)",    lat=30.7250, lng=76.8450, geom=pt(30.7250, 76.8450), is_hub=True, hub_id=hubs[2].id),
            Intersection(name="Industrial Area Depot (Hub 04)",     lat=30.7020, lng=76.8020, geom=pt(30.7020, 76.8020), is_hub=True, hub_id=hubs[3].id),
        ]
        for i in intersections:
            db.add(i)
        await db.flush()

        I = intersections
        roads = [
            # 1. Sector 17 <-> Sector 22 (Clear, bidirectional corridor)
            Road(name="Himalaya Marg (Sector 17 - 22)", from_intersection_id=I[0].id, to_intersection_id=I[2].id, distance_km=1.2, is_bidirectional=True, status=RoadStatus.clear, geom=line([(30.7398, 76.7827), (30.7320, 76.7730)])),
            # 2. Sector 22 <-> Sector 35 (Clear, bidirectional)
            Road(name="Dakshin Marg West (Sector 22 - 35)", from_intersection_id=I[2].id, to_intersection_id=I[3].id, distance_km=1.4, is_bidirectional=True, status=RoadStatus.clear, geom=line([(30.7320, 76.7730), (30.7230, 76.7650)])),
            # 3. Sector 17 <-> PGIMER (Clear medical access route)
            Road(name="Jan Marg North (Sector 17 - PGIMER)", from_intersection_id=I[0].id, to_intersection_id=I[1].id, distance_km=2.8, is_bidirectional=True, status=RoadStatus.clear, geom=line([(30.7398, 76.7827), (30.7650, 76.7750)])),
            # 4. Sector 17 <-> Sector 19 (Direct SOS access link)
            Road(name="Sarovar Path (Sector 17 - 19)", from_intersection_id=I[0].id, to_intersection_id=I[4].id, distance_km=1.3, is_bidirectional=True, status=RoadStatus.clear, geom=line([(30.7398, 76.7827), (30.7310, 76.7910)])),
            # 5. Sector 19 <-> Madhya Marg East (Hazard-affected connection)
            Road(name="Sector 19 East Approach", from_intersection_id=I[4].id, to_intersection_id=I[5].id, distance_km=0.9, is_bidirectional=True, status=RoadStatus.hazardous, hazard_penalty=45.0, geom=line([(30.7310, 76.7910), (30.7380, 76.7950)])),
            # 6. ENTIRE ROAD BLOCK: Madhya Marg East -> East Bypass (Water main burst & sinkhole collapse)
            Road(name="Madhya Marg East Corridor (Sector 26 Sinkhole)", from_intersection_id=I[5].id, to_intersection_id=I[6].id, distance_km=1.8, is_bidirectional=True, status=RoadStatus.blocked, is_blocked=True, hazard_penalty=100.0, geom=line([(30.7380, 76.7950), (30.7380, 76.8150)])),
            # 7. East Bypass -> Manimajra Hub 03 (Clear alternative detour)
            Road(name="Old Kalka Link (East Bypass - Manimajra)", from_intersection_id=I[6].id, to_intersection_id=I[7].id, distance_km=3.1, is_bidirectional=True, status=RoadStatus.clear, geom=line([(30.7380, 76.8150), (30.7250, 76.8450)])),
            # 8. ROAD SECTION BLOCK: Sector 17 -> Industrial Area (Partial closure along Purv Marg)
            Road(name="Purv Marg (Sector 17 - Industrial Area)", from_intersection_id=I[0].id, to_intersection_id=I[8].id, distance_km=4.5, is_bidirectional=True, status=RoadStatus.blocked, is_blocked=True, hazard_penalty=85.0, geom=line([(30.7398, 76.7827), (30.7250, 76.7950), (30.7020, 76.8020)])),
        ]
        for r in roads:
            db.add(r)
        await db.flush()

        # ── 5. HAZARD ZONES ─────────────────────────────────────────────────
        print("[5/8] Seeding Realistic Hazard Polygons (Flood, High-Risk, Danger Zone)...")
        hazard_zones = [
            # 1. Flood / Waterlogging Zone: Sukhna Choe Corridor
            HazardZone(
                name="Flood / Waterlogging Zone — Sukhna Choe Corridor",
                hazard_type="flood",
                severity=HazardSeverity.CRITICAL,
                is_active=True,
                geom=poly([
                    (30.7360, 76.7930),
                    (30.7360, 76.8030),
                    (30.7200, 76.8000),
                    (30.7200, 76.7910),
                    (30.7360, 76.7930),
                ]),
            ),
            # 2. High-Risk Zone: Low-Lying Drainage Retention Area
            HazardZone(
                name="High-Risk Zone — N-Choe Monsoon Overflow",
                hazard_type="waterlogging",
                severity=HazardSeverity.HIGH,
                is_active=True,
                geom=poly([
                    (30.7180, 76.7650),
                    (30.7180, 76.7750),
                    (30.7080, 76.7750),
                    (30.7080, 76.7650),
                    (30.7180, 76.7650),
                ]),
            ),
            # 3. Danger Zone: Structural Barrier & Debris Perimeter
            HazardZone(
                name="Danger Zone — Structural Debris & Downed HT Lines",
                hazard_type="infrastructure_collapse",
                severity=HazardSeverity.CRITICAL,
                is_active=True,
                geom=poly([
                    (30.7120, 76.8120),
                    (30.7120, 76.8220),
                    (30.7040, 76.8220),
                    (30.7040, 76.8120),
                    (30.7120, 76.8120),
                ]),
            ),
        ]
        for hz in hazard_zones:
            db.add(hz)
        await db.flush()

        # ── 6. INCIDENT REPORTS & SOS DATA ──────────────────────────────────
        print("[6/8] Seeding Cross-Role SOS & Citizen Incident Reports...")
        # 1. ACTIVE SOS (Citizen 01)
        sos_report = IncidentReport(
            reporter_id=citizen_users[0].id,
            category="medical",
            description="URGENT SOS: Family trapped in ground floor waterlogging near Sector 19 market. Senior citizen requires immediate evacuation and oxygen support.",
            status=ReportStatus.clustered,
            lat=30.7310,
            lng=76.7910,
            geom=pt(30.7310, 76.7910),
            created_at=now - timedelta(minutes=15),
        )
        # 2. NORMAL CITIZEN REPORT (Citizen 02)
        normal_report = IncidentReport(
            reporter_id=citizen_users[1].id,
            category="flood",
            description="Severe street waterlogging up to 1.5 ft near Sector 21 crossing. Light vehicles stalling.",
            status=ReportStatus.unverified,
            lat=30.7270,
            lng=76.7800,
            geom=pt(30.7270, 76.7800),
            created_at=now - timedelta(minutes=35),
        )
        # 3. VERIFIED INCIDENT (Citizen 03, verified by Coordinator)
        verified_report = IncidentReport(
            reporter_id=citizen_users[2].id,
            category="road_block",
            description="Fallen banyan tree and severed telecom cables blocking inner Sector 16 lane.",
            status=ReportStatus.verified,
            verified_at=now - timedelta(minutes=20),
            verified_by_id=coordinator_user.id,
            lat=30.7480,
            lng=76.7860,
            geom=pt(30.7480, 76.7860),
            created_at=now - timedelta(minutes=50),
        )
        # 4. INCIDENT AWAITING TRIAGE
        triage_report = IncidentReport(
            reporter_id=citizen_users[1].id,
            category="injury",
            description="Minor leg injury from debris during evacuation. Citizen safely at roadside waiting for first aid.",
            status=ReportStatus.unverified,
            lat=30.7360,
            lng=76.7680,
            geom=pt(30.7360, 76.7680),
            created_at=now - timedelta(minutes=10),
        )
        db.add(sos_report)
        db.add(normal_report)
        db.add(verified_report)
        db.add(triage_report)
        await db.flush()

        # Report Clusters
        cluster_sos = ReportCluster(
            centroid_lat=30.7310,
            centroid_lng=76.7910,
            geom=pt(30.7310, 76.7910),
            report_count=1,
            priority_score=10.0, # High Priority SOS
            dominant_category="medical",
            status=ReportClusterStatus.mission_assigned,
        )
        cluster_normal = ReportCluster(
            centroid_lat=30.7270,
            centroid_lng=76.7800,
            geom=pt(30.7270, 76.7800),
            report_count=1,
            priority_score=4.5,
            dominant_category="flood",
            status=ReportClusterStatus.open,
        )
        db.add(cluster_sos)
        db.add(cluster_normal)
        await db.flush()

        sos_report.cluster_id = cluster_sos.id
        normal_report.cluster_id = cluster_normal.id
        await db.flush()

        # ── 7. MISSIONS ─────────────────────────────────────────────────────
        print("[7/8] Seeding Connected Missions (Mission 01 ACTIVE linked to SOS, Mission 02 PENDING, Mission 03 COMPLETED)...")
        # Mission 01: ACTIVE, Assigned to Responder 01, linked to Cluster SOS
        mission_01 = Mission(
            mission_type=MissionType.rescue,
            status=MissionStatus.assigned, # ACTIVE
            title="Emergency Medical Evacuation — Sector 19 SOS",
            description="Navigate to Sector 19 residence, extract trapped senior citizen and transfer to Sector 17 Staging Hub.",
            responder_id=responders[0].id,
            cluster_id=cluster_sos.id,
            target_lat=30.7310,
            target_lng=76.7910,
            geom=pt(30.7310, 76.7910),
            notes="Active SOS priority rescue mission. OSRM road route mapped from Sector 22 Responder location.",
            created_at=now - timedelta(minutes=12),
            accepted_at=now - timedelta(minutes=10),
        )
        # Mission 02: PENDING triage
        mission_02 = Mission(
            mission_type=MissionType.survey_road,
            status=MissionStatus.assigned, # PENDING
            title="Road Damage Survey & Waterlogging Assessment — Sector 21",
            description="Inspect flooded junction at Sector 21 and report water depth to EOC.",
            responder_id=responders[1].id,
            cluster_id=cluster_normal.id,
            target_lat=30.7270,
            target_lng=76.7800,
            geom=pt(30.7270, 76.7800),
            notes="Pending field responder survey inspection.",
            created_at=now - timedelta(minutes=25),
        )
        # Mission 03: COMPLETED
        mission_03 = Mission(
            mission_type=MissionType.deliver_resource,
            status=MissionStatus.completed,
            title="Relief Supply Drop — Sector 17 Central Staging",
            description="Delivered 500kg drinking water rations and 40 first aid kits to Sector 17 Staging Hub.",
            responder_id=responders[0].id,
            hub_id=hubs[0].id,
            target_lat=30.7398,
            target_lng=76.7827,
            geom=pt(30.7398, 76.7827),
            notes="Successfully completed and verified by Hub coordinator.",
            created_at=now - timedelta(hours=3),
            accepted_at=now - timedelta(hours=3),
            completed_at=now - timedelta(hours=1),
        )
        db.add(mission_01)
        db.add(mission_02)
        db.add(mission_03)
        await db.flush()

        # ── 8. EMERGENCY ALERTS & CAMPAIGNS ─────────────────────────────────
        print("[8/8] Seeding Verified Alerts and Relief Campaigns...")
        alert = EmergencyAlert(
            title="FLOOD & ROAD OBSTRUCTION WARNING — SUKHNA CHOE / SECTOR 19-26",
            message="Severe waterlogging and road subsidence on Madhya Marg East corridor. Use Himalaya Marg / Jan Marg and avoid flooded underpasses.",
            severity=AlertSeverity.EMERGENCY,
            alert_type="evacuation",
            is_active=True,
            issued_by_id=coordinator_user.id,
        )
        db.add(alert)

        camp = Campaign(
            title="Sector 17 & 19 Emergency Relief Fund",
            description="Funding medical kits, fresh potable water, and emergency rescue rations for flood-impacted citizens.",
            status=CampaignStatus.active,
            hub_id=hubs[0].id,
            ngo_user_id=fundraiser_user.id,
            resource_type=ResourceType.medical,
            target_amount=50000.0,
            raised_amount=32000.0,
            share_slug="tricity-flood-relief-2026",
        )
        db.add(camp)
        await db.flush()

        donation = Donation(
            campaign_id=camp.id,
            donor_name="Chandigarh Relief Foundation",
            amount=15000.0,
            message="Support for field response teams.",
            transaction_ref=f"TXN-{uuid.uuid4().hex[:10].upper()}",
            created_at=now - timedelta(hours=2),
        )
        db.add(donation)

        await db.commit()
        print("[OK] Fresh Map Engine test dataset successfully seeded!")

if __name__ == "__main__":
    asyncio.run(seed_fresh_map_dataset())
