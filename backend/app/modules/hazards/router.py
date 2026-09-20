"""
Hazard Zone Router
FastAPI endpoint handlers for geographic HazardZone operational management.
"""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, UserRole
from app.db.session import get_db
from app.modules.auth.router import get_current_user, require_roles
from app.modules.hazards.schemas import (
    HazardZoneCreate,
    HazardZoneResponse,
    HazardZoneUpdate,
)
from app.modules.hazards.service import (
    create_hazard_zone_service,
    deactivate_hazard_zone_service,
    get_hazard_zone_service,
    list_hazard_zones_service,
    update_hazard_zone_service,
)

router = APIRouter(prefix="/hazards", tags=["hazards"])


@router.get("", response_model=List[HazardZoneResponse])
async def list_hazard_zones(db: AsyncSession = Depends(get_db)):
    """Returns active hazard zone perimeters."""
    return await list_hazard_zones_service(db, active_only=True)


@router.get("/{zone_id}", response_model=HazardZoneResponse)
async def get_hazard_zone(zone_id: int, db: AsyncSession = Depends(get_db)):
    """Returns detailed hazard zone perimeter by ID."""
    return await get_hazard_zone_service(db, zone_id)


@router.post("", response_model=HazardZoneResponse, status_code=status.HTTP_201_CREATED)
async def create_hazard_zone(
    payload: HazardZoneCreate,
    current_user: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new hazard zone perimeter (Coordinator ONLY)."""
    return await create_hazard_zone_service(db, current_user, payload)


@router.patch("/{zone_id}", response_model=HazardZoneResponse)
async def update_hazard_zone(
    zone_id: int,
    payload: HazardZoneUpdate,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Updates operational attributes/severity or links survey verification (Coordinator / Authorized Responder)."""
    return await update_hazard_zone_service(db, current_user, zone_id, payload)


@router.delete("/{zone_id}", response_model=HazardZoneResponse)
async def deactivate_hazard_zone(
    zone_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Deactivates a hazard zone perimeter (Coordinator ONLY, soft deletion)."""
    return await deactivate_hazard_zone_service(db, current_user, zone_id)
