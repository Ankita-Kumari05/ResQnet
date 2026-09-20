"""
Map Module Router
Exposes:
  GET  /map/state                          - all authenticated roles
  GET  /map/road-closures                  - all authenticated roles
  GET  /map/road-closures/{id}             - all authenticated roles
  POST /map/road-closures                  - coordinator only
  PATCH /map/road-closures/{id}            - coordinator only
  DELETE /map/road-closures/{id}           - coordinator only (soft)
  PATCH /map/hubs/{hub_id}/map-geometry    - coordinator only
"""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import get_db
from app.modules.auth.router import get_current_user, require_roles
from app.db.models import UserRole
from app.modules.map.schemas import (
    HubMapGeometryOut,
    HubMapGeometryUpsert,
    MapStateResponse,
    RoadClosureCreate,
    RoadClosureOut,
    RoadClosureUpdate,
)
from app.modules.map.service import (
    create_road_closure_service,
    deactivate_road_closure_service,
    get_map_state_service,
    get_road_closure_service,
    list_road_closures_service,
    update_road_closure_service,
    upsert_hub_map_geometry_service,
)

router = APIRouter(prefix="/map", tags=["Map State"])


# ── Shared map state ───────────────────────────────────────────────────────────

@router.get("/state", response_model=MapStateResponse)
async def get_map_state(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a GeoJSON snapshot of all active map features
    (hazards, safety hubs with map geometry, road closures).
    Accessible to all authenticated roles (citizen, responder, coordinator).
    """
    return await get_map_state_service(db)


# ── Road closures ─────────────────────────────────────────────────────────────

@router.get("/road-closures", response_model=List[RoadClosureOut])
async def list_road_closures(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all active road closures. Accessible to all authenticated roles."""
    return await list_road_closures_service(db, active_only=True)


@router.get("/road-closures/{closure_id}", response_model=RoadClosureOut)
async def get_road_closure(
    closure_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns a single road closure by ID. Accessible to all authenticated roles."""
    return await get_road_closure_service(db, closure_id)


@router.post("/road-closures", response_model=RoadClosureOut, status_code=status.HTTP_201_CREATED)
async def create_road_closure(
    payload: RoadClosureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.coordinator)),
):
    """Creates a coordinator-authored road closure (Coordinator ONLY)."""
    return await create_road_closure_service(db, current_user, payload)


@router.patch("/road-closures/{closure_id}", response_model=RoadClosureOut)
async def update_road_closure(
    closure_id: int,
    payload: RoadClosureUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.coordinator)),
):
    """Updates a road closure (Coordinator ONLY)."""
    return await update_road_closure_service(db, current_user, closure_id, payload)


@router.delete("/road-closures/{closure_id}", response_model=RoadClosureOut)
async def deactivate_road_closure(
    closure_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.coordinator)),
):
    """Soft-deactivates a road closure (Coordinator ONLY, sets is_active=False)."""
    return await deactivate_road_closure_service(db, current_user, closure_id)


# ── Hub map geometry ──────────────────────────────────────────────────────────

@router.patch("/hubs/{hub_id}/map-geometry", response_model=HubMapGeometryOut)
async def upsert_hub_map_geometry(
    hub_id: int,
    payload: HubMapGeometryUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.coordinator)),
):
    """
    Upserts Map Engine V2 entrance point / area polygon for a safety hub.
    Only writes to hub_map_geometry — the safety_hubs row is NOT altered.
    Coordinator ONLY.
    """
    return await upsert_hub_map_geometry_service(db, current_user, hub_id, payload)
