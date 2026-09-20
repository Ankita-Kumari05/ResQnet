"""
Routing Engine Module (Step 6.9)
Implements disaster-aware Dijkstra's algorithm over verified road state and PostGIS spatial hazard perimeters.
"""
import math
from datetime import datetime
from typing import Any, Dict, List, Optional

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    HazardSeverity,
    HazardZone,
    HubStatus,
    Intersection,
    Road,
    RoadStatus,
    SafetyHub,
)
from app.db.session import get_db
from app.modules.routing.cache import (
    get_cached_graph,
    is_cache_dirty,
    set_cached_graph,
)

router = APIRouter(prefix="/routing", tags=["routing"])

# Prototype spatial hazard penalty weights
SPATIAL_HAZARD_WEIGHTS = {
    HazardSeverity.LOW: 5.0,
    HazardSeverity.MEDIUM: 20.0,
    HazardSeverity.HIGH: 50.0,
    # CRITICAL is non-traversable (edge omitted dynamically)
}


# ─── Schemas ───────────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    from_lat: float = Field(..., description="Origin latitude coordinate")
    from_lng: float = Field(..., description="Origin longitude coordinate")
    target_hub_id: Optional[int] = Field(
        default=None, description="Optional target hub ID; auto-selects if None"
    )
    to_lat: Optional[float] = Field(
        default=None, description="Optional target destination latitude"
    )
    to_lng: Optional[float] = Field(
        default=None, description="Optional target destination longitude"
    )
    reverse: Optional[bool] = Field(
        default=False, description="Whether to reverse the route (e.g. backward route / return to base/hub)"
    )


class RouteStep(BaseModel):
    road_id: int
    road_name: str
    from_node: int
    to_node: int
    from_name: str
    to_name: str
    distance_km: float
    hazard_penalty: float
    flood_penalty: float
    congestion_penalty: float
    spatial_hazard_penalty: float = 0.0
    edge_cost: float
    is_blocked: bool = False
    last_verified_at: Optional[datetime] = None


class RouteResponse(BaseModel):
    success: bool
    message: str
    from_intersection_id: Optional[int] = None
    target_hub_id: Optional[int] = None
    target_hub_name: Optional[str] = None
    total_cost: float = 0.0
    total_distance_km: float = 0.0
    waypoints: List[dict] = []
    steps: List[RouteStep] = []
    cost_explanation: str = ""


# ─── Graph Builder ─────────────────────────────────────────────────────────

async def build_graph(db: AsyncSession) -> tuple[nx.DiGraph, dict, dict]:
    """
    Builds a directed NetworkX graph from verified road state and PostGIS spatial hazards.
    Reuses in-memory cache if clean.
    """
    if not is_cache_dirty():
        cached = get_cached_graph()
        if cached is not None:
            return cached

    G = nx.DiGraph()

    # 1. Load Intersections (Nodes)
    int_result = await db.execute(select(Intersection))
    intersections = int_result.scalars().all()
    intersection_map = {i.id: i for i in intersections}

    for i in intersections:
        G.add_node(
            i.id,
            name=i.name,
            lat=i.lat,
            lng=i.lng,
            is_hub=i.is_hub,
            hub_id=i.hub_id,
        )

    # 2. Query PostGIS ST_Intersects for active HazardZones intersecting Roads
    spatial_stmt = (
        select(Road.id, HazardZone.severity)
        .join(HazardZone, func.ST_Intersects(Road.geom, HazardZone.geom))
        .where(HazardZone.is_active == True)
    )
    spatial_res = await db.execute(spatial_stmt)

    # Deterministic maximum severity mapping per road
    road_spatial_hazards: Dict[int, HazardSeverity] = {}
    severity_rank = {
        HazardSeverity.LOW: 1,
        HazardSeverity.MEDIUM: 2,
        HazardSeverity.HIGH: 3,
        HazardSeverity.CRITICAL: 4,
    }

    for road_id, severity in spatial_res.all():
        if road_id not in road_spatial_hazards:
            road_spatial_hazards[road_id] = severity
        else:
            current_sev = road_spatial_hazards[road_id]
            if severity_rank.get(severity, 0) > severity_rank.get(current_sev, 0):
                road_spatial_hazards[road_id] = severity

    # 3. Load Roads (Edges)
    road_result = await db.execute(select(Road))
    roads = road_result.scalars().all()
    road_map = {r.id: r for r in roads}

    for r in roads:
        # Rule 1: Exclude blocked roads entirely
        if r.is_blocked or r.status == RoadStatus.blocked:
            continue

        # Rule 5: Check dynamic spatial CRITICAL hazard
        spatial_sev = road_spatial_hazards.get(r.id)
        if spatial_sev == HazardSeverity.CRITICAL:
            # Non-traversable dynamically
            continue

        # Rule 6 & 7: Calculate dynamic edge cost
        spatial_penalty = (
            SPATIAL_HAZARD_WEIGHTS.get(spatial_sev, 0.0) if spatial_sev else 0.0
        )
        total_edge_cost = (
            r.distance_km
            + r.hazard_penalty
            + r.flood_penalty
            + r.congestion_penalty
            + spatial_penalty
        )

        edge_attrs = {
            "road_id": r.id,
            "road_name": r.name,
            "cost": total_edge_cost,
            "distance_km": r.distance_km,
            "hazard_penalty": r.hazard_penalty,
            "flood_penalty": r.flood_penalty,
            "congestion_penalty": r.congestion_penalty,
            "spatial_hazard_penalty": spatial_penalty,
            "is_blocked": False,
            "last_verified_at": r.last_verified_at,
        }

        # Forward edge
        G.add_edge(r.from_intersection_id, r.to_intersection_id, **edge_attrs)

        # Rule 8: Backward edge if bidirectional
        if r.is_bidirectional:
            G.add_edge(r.to_intersection_id, r.from_intersection_id, **edge_attrs)

    set_cached_graph(G, intersection_map, road_map)
    return G, intersection_map, road_map


def nearest_intersection(lat: float, lng: float, intersections: dict) -> Optional[int]:
    """Finds the closest intersection node to the given coordinates."""
    best_id = None
    best_dist = float("inf")
    for iid, i in intersections.items():
        d = math.sqrt((i.lat - lat) ** 2 + (i.lng - lng) ** 2)
        if d < best_dist:
            best_dist = d
            best_id = iid
    return best_id


# ─── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/calculate", response_model=RouteResponse)
@router.post("/safe-route", response_model=RouteResponse)
async def calculate_route(
    req: RouteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculates safe disaster-aware evacuation route using Dijkstra's algorithm."""
    G, intersection_map, road_map = await build_graph(db)

    if not intersection_map:
        raise HTTPException(
            status_code=status.HTTP_53TC_SERVICE_UNAVAILABLE if hasattr(status, 'HTTP_53TC_SERVICE_UNAVAILABLE') else 503,
            detail="Road graph not loaded. Run seed first."
        )

    from_node = nearest_intersection(req.from_lat, req.from_lng, intersection_map)
    if from_node is None:
        return RouteResponse(
            success=False,
            message="No valid origin intersection node found.",
        )

    start_node = from_node
    target_node = None
    target_hub = None

    # Handle point-to-point routing if to_lat and to_lng are supplied
    if req.to_lat is not None and req.to_lng is not None:
        target_node = nearest_intersection(req.to_lat, req.to_lng, intersection_map)
        if target_node is None:
            return RouteResponse(
                success=False,
                message="No valid destination intersection node found.",
            )
        
        # If reverse/retreat is requested, swap start and target
        if req.reverse:
            src, dst = target_node, start_node
        else:
            src, dst = start_node, target_node

        if src not in G or dst not in G:
            return RouteResponse(
                success=False,
                message="Routing node not connected in current road network graph.",
            )

        try:
            best_path = nx.dijkstra_path(G, src, dst, weight="cost")
            best_cost = nx.dijkstra_path_length(G, src, dst, weight="cost")
            # If target node is a hub, find it
            target_inter = intersection_map.get(dst)
            if target_inter and target_inter.is_hub and target_inter.hub_id:
                hub_res = await db.execute(select(SafetyHub).where(SafetyHub.id == target_inter.hub_id))
                target_hub = hub_res.scalar_one_or_none()
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return RouteResponse(
                success=False,
                message="No viable route found between coordinates. Path may be blocked.",
            )
    else:
        # Fallback to Hub routing (Rule 9)
        hub_result = await db.execute(
            select(SafetyHub).where(
                SafetyHub.status.in_([HubStatus.open, HubStatus.near_capacity])
            )
        )
        available_hubs = hub_result.scalars().all()

        # Filter by positive available capacity
        routable_hubs = [
            h for h in available_hubs if (h.max_capacity - h.current_occupancy) > 0
        ]

        if req.target_hub_id is not None:
            routable_hubs = [h for h in routable_hubs if h.id == req.target_hub_id]

        if not routable_hubs:
            return RouteResponse(
                success=False,
                message="No available Safety Hubs with capacity. All hubs are full, closed, or unavailable.",
            )

        # Find corresponding intersection nodes for routable hubs
        hub_nodes = {}
        for hub in routable_hubs:
            for iid, inter in intersection_map.items():
                if inter.is_hub and inter.hub_id == hub.id:
                    hub_nodes[iid] = hub
                    break

        if not hub_nodes:
            return RouteResponse(
                success=False,
                message="Safety Hubs have no corresponding intersection nodes in the road graph.",
            )

        # Run Dijkstra to each routable hub, pick lowest cost
        best_path = None
        best_cost = float("inf")

        for hub_node_id, hub in hub_nodes.items():
            if hub_node_id not in G or start_node not in G:
                continue
            
            # Forward: start_node -> hub_node_id. Reverse: route from incident back to safety hub (or hub to origin)
            # When responder requests retreat/backward from mission target, they want to go from start_node to hub
            src, dst = (hub_node_id, start_node) if req.reverse else (start_node, hub_node_id)

            try:
                path = nx.dijkstra_path(G, src, dst, weight="cost")
                cost = nx.dijkstra_path_length(G, src, dst, weight="cost")
                if cost < best_cost:
                    best_cost = cost
                    best_path = path
                    target_hub = hub
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue

    if not best_path:
        return RouteResponse(
            success=False,
            message="No viable route found. All paths are blocked or hubs unreachable.",
        )

    # Build step-by-step response
    steps = []
    total_distance = 0.0
    total_hazard = 0.0
    total_flood = 0.0
    total_congestion = 0.0
    total_spatial_hazard = 0.0

    for i in range(len(best_path) - 1):
        u, v = best_path[i], best_path[i + 1]
        edge = G[u][v]
        total_distance += edge["distance_km"]
        total_hazard += edge["hazard_penalty"]
        total_flood += edge["flood_penalty"]
        total_congestion += edge["congestion_penalty"]
        total_spatial_hazard += edge["spatial_hazard_penalty"]

        steps.append(
            RouteStep(
                road_id=edge["road_id"],
                road_name=edge["road_name"],
                from_node=u,
                to_node=v,
                from_name=intersection_map[u].name,
                to_name=intersection_map[v].name,
                distance_km=edge["distance_km"],
                hazard_penalty=edge["hazard_penalty"],
                flood_penalty=edge["flood_penalty"],
                congestion_penalty=edge["congestion_penalty"],
                spatial_hazard_penalty=edge["spatial_hazard_penalty"],
                edge_cost=edge["cost"],
                is_blocked=False,
                last_verified_at=edge["last_verified_at"],
            )
        )

    waypoints = [
        {
            "id": nid,
            "name": intersection_map[nid].name,
            "lat": intersection_map[nid].lat,
            "lng": intersection_map[nid].lng,
        }
        for nid in best_path
    ]

    explanation_parts = [f"Total distance: {total_distance:.2f} km"]
    if total_hazard > 0:
        explanation_parts.append(f"Road hazard penalty: +{total_hazard:.1f}")
    if total_flood > 0:
        explanation_parts.append(f"Flood penalty: +{total_flood:.1f}")
    if total_congestion > 0:
        explanation_parts.append(f"Congestion penalty: +{total_congestion:.1f}")
    if total_spatial_hazard > 0:
        explanation_parts.append(f"Spatial hazard perimeter penalty: +{total_spatial_hazard:.1f}")
    explanation_parts.append(f"Total route cost: {best_cost:.2f}")

    destination_name = target_hub.name if target_hub else (intersection_map[best_path[-1]].name if best_path else "Destination")
    direction_label = "Backward retreat route" if req.reverse else "Safe route"

    return RouteResponse(
        success=True,
        message=f"{direction_label} found to {destination_name}",
        from_intersection_id=best_path[0] if best_path else from_node,
        target_hub_id=target_hub.id if target_hub else None,
        target_hub_name=target_hub.name if target_hub else destination_name,
        total_cost=round(best_cost, 2),
        total_distance_km=round(total_distance, 2),
        waypoints=waypoints,
        steps=steps,
        cost_explanation=" | ".join(explanation_parts),
    )


@router.get("/safe-route", response_model=RouteResponse)
async def get_safe_route(
    from_lat: float,
    from_lng: float,
    target_hub_id: Optional[int] = None,
    to_lat: Optional[float] = None,
    to_lng: Optional[float] = None,
    reverse: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """GET endpoint alias for safe-route calculation using query parameters."""
    req = RouteRequest(
        from_lat=from_lat,
        from_lng=from_lng,
        target_hub_id=target_hub_id,
        to_lat=to_lat,
        to_lng=to_lng,
        reverse=reverse,
    )
    return await calculate_route(req=req, db=db)


@router.get("/graph")
async def get_graph_summary(db: AsyncSession = Depends(get_db)):
    """Returns full graph summary and edge parameters for offline rendering/caching."""
    G, intersection_map, road_map = await build_graph(db)
    
    # Query active hazards for summary
    hazard_stmt = select(HazardZone).where(HazardZone.is_active == True)
    hazards_res = await db.execute(hazard_stmt)
    active_hazards = hazards_res.scalars().all()

    # Query safety hubs summary
    hubs_stmt = select(SafetyHub)
    hubs_res = await db.execute(hubs_stmt)
    all_hubs = hubs_res.scalars().all()

    nodes_summary = [
        {
            "id": i.id,
            "name": i.name,
            "lat": i.lat,
            "lng": i.lng,
            "is_hub": i.is_hub,
            "hub_id": i.hub_id,
        }
        for i in intersection_map.values()
    ]

    edges_summary = []
    for u, v, data in G.edges(data=True):
        edges_summary.append({
            "from_node": u,
            "to_node": v,
            "road_id": data["road_id"],
            "road_name": data["road_name"],
            "distance_km": data["distance_km"],
            "cost": data["cost"],
            "hazard_penalty": data["hazard_penalty"],
            "flood_penalty": data["flood_penalty"],
            "congestion_penalty": data["congestion_penalty"],
            "spatial_hazard_penalty": data["spatial_hazard_penalty"],
            "last_verified_at": data["last_verified_at"].isoformat() if data["last_verified_at"] else None,
        })

    hubs_summary = [
        {
            "id": h.id,
            "name": h.name,
            "status": h.status.value if hasattr(h.status, "value") else str(h.status),
            "max_capacity": h.max_capacity,
            "current_occupancy": h.current_occupancy,
            "available_capacity": max(0, h.max_capacity - h.current_occupancy),
        }
        for h in all_hubs
    ]

    return {
        "nodes": nodes_summary,
        "edges": edges_summary,
        "hubs": hubs_summary,
        "active_hazard_count": len(active_hazards),
        "total_nodes": len(nodes_summary),
        "total_edges": len(edges_summary),
    }
