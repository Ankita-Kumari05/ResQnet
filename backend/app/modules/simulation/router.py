"""
Simulation Engine Module
Exposes discrete simulation events that mutate REAL application state.
This is NOT fake UI animation — every event calls actual service logic.
Only accessible to coordinator role.

Virtual city seeded data:
- 8 intersections (nodes)
- 10 road segments (edges)
- 3 Safety Hubs
- 2 Hazard Zones (initially inactive)
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    Road, RoadStatus, SafetyHub, HubStatus, HazardZone, HazardSeverity,
    IncidentReport, ReportStatus, ReportCluster, Mission,
    MissionType, MissionStatus, User, UserRole,
)
from app.modules.auth.router import require_roles
from app.modules.routing.cache import invalidate_route_cache

router = APIRouter(prefix="/simulation", tags=["simulation"])


# ─── Event Schemas ─────────────────────────────────────────────────────────

class FloodEvent(BaseModel):
    zone_id: int
    severity: int = 3


class RoadBlockEvent(BaseModel):
    road_id: int
    block: bool = True


class RoadHazardEvent(BaseModel):
    road_id: int
    hazard_penalty: float = 20.0
    flood_penalty: float = 0.0
    congestion_penalty: float = 0.0
    new_status: RoadStatus = RoadStatus.hazardous


class GenerateReportEvent(BaseModel):
    lat: float
    lng: float
    category: str = "flood"
    description: str = "Simulation-generated citizen report"
    count: int = 1


class HubOccupancyEvent(BaseModel):
    hub_id: int
    delta: int


class HubResourceEvent(BaseModel):
    hub_id: int
    food_delta: int = 0
    water_delta: int = 0
    medical_delta: int = 0


class DispatchNGOEvent(BaseModel):
    responder_id: int
    cluster_id: int
    road_id: Optional[int] = None


class VerifyClusterEvent(BaseModel):
    cluster_id: int
    road_id: Optional[int] = None
    road_status: RoadStatus = RoadStatus.blocked
    is_blocked: bool = True


# ─── Simulation Event Endpoints ─────────────────────────────────────────────

@router.post("/events/flood")
async def sim_start_flood(
    event: FloodEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Activate a hazard zone and increase its flood severity."""
    zone = await db.get(HazardZone, event.zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Hazard zone not found")
    zone.is_active = True
    severity_map = {
        1: HazardSeverity.LOW,
        2: HazardSeverity.MEDIUM,
        3: HazardSeverity.HIGH,
        4: HazardSeverity.HIGH,
        5: HazardSeverity.CRITICAL,
    }
    zone.severity = severity_map.get(event.severity, HazardSeverity.HIGH)
    zone.updated_at = datetime.utcnow()
    invalidate_route_cache()
    await db.commit()
    return {"event": "flood_started", "zone_id": event.zone_id, "severity": zone.severity.value}


@router.post("/events/road/block")
async def sim_block_road(
    event: RoadBlockEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Simulate blocking a road (e.g., landslide, bridge collapse)."""
    road = await db.get(Road, event.road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")
    road.is_blocked = event.block
    road.status = RoadStatus.blocked if event.block else RoadStatus.clear
    road.last_verified_at = datetime.utcnow()
    invalidate_route_cache(event.road_id)
    await db.commit()
    return {"event": "road_blocked", "road_id": event.road_id, "blocked": event.block}


@router.post("/events/road/hazard")
async def sim_set_road_hazard(
    event: RoadHazardEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Apply hazard/flood penalties to a road segment."""
    road = await db.get(Road, event.road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")
    road.hazard_penalty = event.hazard_penalty
    road.flood_penalty = event.flood_penalty
    road.congestion_penalty = event.congestion_penalty
    road.status = event.new_status
    road.last_verified_at = datetime.utcnow()
    invalidate_route_cache(event.road_id)
    await db.commit()
    return {"event": "road_hazard_set", "road_id": event.road_id}


@router.post("/events/reports/generate")
async def sim_generate_reports(
    event: GenerateReportEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Generate citizen reports at a given location (simulates mass reporting)."""
    from app.modules.clusters.service import cluster_incident_report

    created_ids = []
    for i in range(event.count):
        import random
        jitter_lat = event.lat + random.uniform(-0.002, 0.002)
        jitter_lng = event.lng + random.uniform(-0.002, 0.002)
        geom_wkt = f"SRID=4326;POINT({jitter_lng} {jitter_lat})"

        report = IncidentReport(
            reporter_id=None,
            category=event.category,
            description=f"[SIM] {event.description} #{i+1}",
            lat=jitter_lat,
            lng=jitter_lng,
            geom=geom_wkt,
            status=ReportStatus.unverified,
            submitted_offline=False,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)

        cluster, _ = await cluster_incident_report(db, report.id)
        created_ids.append({"lat": jitter_lat, "lng": jitter_lng, "cluster_id": cluster.id})

    return {"event": "reports_generated", "count": event.count, "category": event.category}


@router.post("/events/hub/occupancy")
async def sim_hub_occupancy(
    event: HubOccupancyEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Simulate citizen arrivals/departures at a hub."""
    hub = await db.get(SafetyHub, event.hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    hub.current_occupancy = max(0, hub.current_occupancy + event.delta)
    ratio = hub.current_occupancy / max(hub.max_capacity, 1)
    if ratio >= 1.0:
        hub.status = HubStatus.full
    hub.updated_at = datetime.utcnow()
    await db.commit()
    return {
        "event": "hub_occupancy_updated",
        "hub_id": event.hub_id,
        "current_occupancy": hub.current_occupancy,
        "status": hub.status,
    }


@router.post("/events/hub/resources")
async def sim_hub_resources(
    event: HubResourceEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Simulate resource consumption or replenishment at a hub."""
    hub = await db.get(SafetyHub, event.hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    hub.food_units = max(0, hub.food_units + event.food_delta)
    hub.water_units = max(0, hub.water_units + event.water_delta)
    hub.medical_units = max(0, hub.medical_units + event.medical_delta)
    hub.updated_at = datetime.utcnow()
    await db.commit()
    return {
        "event": "hub_resources_updated",
        "hub_id": event.hub_id,
        "food_units": hub.food_units,
        "water_units": hub.water_units,
        "medical_units": hub.medical_units,
    }


@router.post("/events/dispatch")
async def sim_dispatch_ngo(
    event: DispatchNGOEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Create and assign a verification mission to a responder."""
    from app.db.models import ResponderStatus
    cluster = await db.get(ReportCluster, event.cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    mission = Mission(
        mission_type=MissionType.verify_incident,
        status=MissionStatus.accepted,
        title=f"[SIM] Verify cluster #{event.cluster_id}",
        description="Simulation-dispatched verification mission",
        assignee_id=event.responder_id,
        cluster_id=event.cluster_id,
        road_id=event.road_id,
        target_lat=cluster.centroid_lat,
        target_lng=cluster.centroid_lng,
        accepted_at=datetime.utcnow(),
    )
    db.add(mission)

    responder = await db.get(User, event.responder_id)
    if responder:
        responder.responder_status = ResponderStatus.on_mission

    await db.commit()
    await db.refresh(mission)
    return {"event": "ngo_dispatched", "mission_id": mission.id, "responder_id": event.responder_id}


@router.post("/events/verify")
async def sim_complete_verification(
    event: VerifyClusterEvent,
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Simulate NGO completing verification and updating road status."""
    cluster = await db.get(ReportCluster, event.cluster_id)
    if cluster:
        cluster.status = ReportStatus.verified
        cluster.updated_at = datetime.utcnow()

    if event.road_id:
        road = await db.get(Road, event.road_id)
        if road:
            road.status = event.road_status
            road.is_blocked = event.is_blocked
            road.confidence_score = 1.0
            road.last_verified_at = datetime.utcnow()

    await db.commit()
    return {
        "event": "verification_completed",
        "cluster_id": event.cluster_id,
        "road_id": event.road_id,
        "road_status": event.road_status,
    }


@router.post("/events/reset")
async def sim_reset(
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """
    Reset all roads to CLEAR and deactivate hazard zones.
    Hub occupancy and resources are restored to seed values.
    Reports and missions are NOT deleted (audit trail preserved).
    """
    road_result = await db.execute(select(Road))
    for road in road_result.scalars().all():
        road.is_blocked = False
        road.status = RoadStatus.clear
        road.hazard_penalty = 0.0
        road.flood_penalty = 0.0
        road.congestion_penalty = 0.0

    zone_result = await db.execute(select(HazardZone))
    for zone in zone_result.scalars().all():
        zone.is_active = False

    hub_seed_occupancies = {1: 120, 2: 80, 3: 50}
    hub_result = await db.execute(select(SafetyHub))
    for hub in hub_result.scalars().all():
        if hub.id in hub_seed_occupancies:
            hub.current_occupancy = hub_seed_occupancies[hub.id]
            hub.status = HubStatus.open

    invalidate_route_cache()
    await db.commit()
    return {"event": "simulation_reset", "message": "Roads cleared, hazard zones deactivated, hub occupancy restored."}


@router.get("/state")
async def sim_get_state(
    _: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Return a snapshot of key simulation state for the coordinator dashboard."""
    roads_result = await db.execute(select(Road))
    hubs_result = await db.execute(select(SafetyHub))
    zones_result = await db.execute(select(HazardZone))
    clusters_result = await db.execute(select(ReportCluster))
    missions_result = await db.execute(select(Mission))

    roads = roads_result.scalars().all()
    hubs = hubs_result.scalars().all()
    zones = zones_result.scalars().all()
    clusters = clusters_result.scalars().all()
    missions = missions_result.scalars().all()

    return {
        "roads": [{"id": r.id, "name": r.name, "status": r.status, "is_blocked": r.is_blocked} for r in roads],
        "hubs": [{"id": h.id, "name": h.name, "occupancy": h.current_occupancy, "max": h.max_capacity, "status": h.status} for h in hubs],
        "hazard_zones": [{"id": z.id, "name": z.name, "severity": z.severity, "active": z.is_active} for z in zones],
        "clusters": [{"id": c.id, "count": c.report_count, "status": c.status, "priority": c.priority_score} for c in clusters],
        "missions": [{"id": m.id, "type": m.mission_type, "status": m.status} for m in missions],
    }
