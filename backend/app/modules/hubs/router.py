"""
Safety Hub Module Router (API v1)
Exposes endpoints for hub creation, retrieval, occupancy updates, operational status overrides,
and capacity management.
"""
from typing import List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User
from app.modules.auth.router import get_current_user
from app.modules.hubs.schemas import (
    HubOut,
    HubCreate,
    OccupancyUpdate,
    StatusUpdate,
    CapacityUpdate,
)
from app.modules.hubs.service import (
    get_all_hubs_service,
    get_hub_by_id_service,
    create_hub_service,
    update_occupancy_service,
    update_status_service,
    update_capacity_service,
    delete_hub_service,
    divert_hub_influx_service,
)

class DivertInfluxRequest(BaseModel):
    target_hub_id: Optional[int] = None

router = APIRouter(prefix="/hubs", tags=["Safety Hubs"])


@router.get("", response_model=List[HubOut])
async def list_hubs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves all safety hubs enriched with operational capacity metrics.
    Accessible to all authenticated users (citizen, responder, coordinator, fundraiser).
    """
    return await get_all_hubs_service(db)


@router.get("/{hub_id}", response_model=HubOut)
async def get_hub(
    hub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves operational details for a specific safety hub.
    Accessible to all authenticated users.
    """
    return await get_hub_by_id_service(db, hub_id)


@router.post("", response_model=HubOut, status_code=status.HTTP_201_CREATED)
async def create_hub(
    payload: HubCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new safety hub with PostGIS POINT geometry.
    Restricted to Coordinators.
    """
    return await create_hub_service(db, payload, current_user)


@router.patch("/{hub_id}/occupancy", response_model=HubOut)
async def update_occupancy(
    hub_id: int,
    payload: OccupancyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates safety hub current occupancy with an incremental delta (+ for arrivals, - for departures).
    Protected by PostgreSQL SELECT FOR UPDATE row-level locking.
    Restricted to Coordinators or Responders assigned to an active mission linked to this hub.
    """
    return await update_occupancy_service(db, hub_id, payload.delta, current_user)


@router.patch("/{hub_id}/status", response_model=HubOut)
async def set_hub_status(
    hub_id: int,
    payload: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually overrides safety hub operational status (e.g. closing or reopening a hub).
    Restricted to Coordinators. Reopening a hub derives state from current occupancy.
    """
    return await update_status_service(db, hub_id, payload.status, current_user)


@router.patch("/{hub_id}/capacity", response_model=HubOut)
async def update_capacity(
    hub_id: int,
    payload: CapacityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Modifies safety hub maximum capacity.
    Restricted to Coordinators. Rejects capacity reductions below current occupancy.
    """
    return await update_capacity_service(db, hub_id, payload.max_capacity, current_user)


@router.delete("/{hub_id}")
async def delete_hub(
    hub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes a safety hub:
    - Admin owns permanent deletion.
    - Coordinators may only delete ad-hoc hubs with zero check-ins (occupancy == 0).
    - Hubs with active check-ins cannot be deleted; must be deactivated to closed status.
    """
    return await delete_hub_service(db, hub_id, current_user)


@router.post("/{hub_id}/divert")
async def divert_hub_influx(
    hub_id: int,
    payload: DivertInfluxRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Diverts influx from a hub to an alternate hub, closes the source hub, and invalidates route cache.
    """
    return await divert_hub_influx_service(db, hub_id, payload.target_hub_id, current_user)
