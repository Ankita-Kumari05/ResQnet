"""
Safety Hub Pydantic Schemas for API v1
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.db.models import HubStatus


class HubOut(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    max_capacity: int
    current_occupancy: int
    available_capacity: int
    status: HubStatus
    capacity_critical: bool = False
    food_critical: bool = False
    water_critical: bool = False
    medical_critical: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HubCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = None
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    max_capacity: int = Field(500, gt=0)
    current_occupancy: int = Field(0, ge=0)
    food_critical_threshold: float = Field(0.20, gt=0.0, le=1.0)
    water_critical_threshold: float = Field(0.20, gt=0.0, le=1.0)
    medical_critical_threshold: float = Field(0.20, gt=0.0, le=1.0)
    capacity_critical_threshold: float = Field(0.85, gt=0.0, le=1.0)

    @field_validator("current_occupancy")
    @classmethod
    def validate_occupancy_within_capacity(cls, v: int, info) -> int:
        max_cap = info.data.get("max_capacity")
        if max_cap is not None and v > max_cap:
            raise ValueError("current_occupancy cannot exceed max_capacity")
        return v


class OccupancyUpdate(BaseModel):
    delta: int = Field(..., description="Positive for arrivals, negative for departures")


class StatusUpdate(BaseModel):
    status: HubStatus = Field(..., description="Operational status to set (open or closed)")


class CapacityUpdate(BaseModel):
    max_capacity: int = Field(..., gt=0, description="New maximum capacity")
