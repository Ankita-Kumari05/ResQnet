"""
Road & Hazard Module
Manages road graph edges (status, penalties) and hazard zones.
Only verified responder/coordinator submissions update road status.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Road, RoadStatus, Intersection, HazardZone, User, UserRole
from app.modules.auth.router import get_current_user, require_roles

router = APIRouter(prefix="/roads", tags=["roads"])


# ─── Schemas ───────────────────────────────────────────────────────────────

class IntersectionOut(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    is_hub: bool
    hub_id: Optional[int] = None

    class Config:
        from_attributes = True


class RoadOut(BaseModel):
    id: int
    name: str
    from_intersection_id: int
    to_intersection_id: int
    distance_km: float
    hazard_penalty: float
    flood_penalty: float
    congestion_penalty: float
    is_blocked: bool
    is_bidirectional: bool
    status: RoadStatus
    confidence_score: float
    last_verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoadStatusUpdate(BaseModel):
    status: RoadStatus
    hazard_penalty: float = 0.0
    flood_penalty: float = 0.0
    congestion_penalty: float = 0.0
    is_blocked: bool = False
    confidence_score: float = 1.0
    notes: Optional[str] = None


# ─── Road Routes ───────────────────────────────────────────────────────────

@router.get("/intersections", response_model=List[IntersectionOut])
async def list_intersections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Intersection))
    return result.scalars().all()


@router.get("", response_model=List[RoadOut])
async def list_roads(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Road))
    return result.scalars().all()


@router.get("/{road_id}", response_model=RoadOut)
async def get_road(road_id: int, db: AsyncSession = Depends(get_db)):
    road = await db.get(Road, road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")
    return road


@router.patch("/{road_id}/status", response_model=RoadOut)
async def update_road_status(
    road_id: int,
    payload: RoadStatusUpdate,
    current_user: User = Depends(require_roles(UserRole.responder, UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Only responders and coordinators can update verified road status."""
    road = await db.get(Road, road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")

    road.status = payload.status
    road.hazard_penalty = payload.hazard_penalty
    road.flood_penalty = payload.flood_penalty
    road.congestion_penalty = payload.congestion_penalty
    road.is_blocked = payload.is_blocked
    road.confidence_score = payload.confidence_score
    road.last_verified_at = datetime.utcnow()
    road.last_verified_by_id = current_user.id

    await db.commit()
    await db.refresh(road)

    from app.modules.routing.cache import invalidate_route_cache
    invalidate_route_cache(road.id)

    return road

