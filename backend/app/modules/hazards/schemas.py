"""
Hazard Zone Domain Schemas
Pydantic contracts for operational management of hazard perimeters.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.db.models import HazardSeverity


class HazardZoneBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Name or identifier of the hazard perimeter")
    hazard_type: str = Field(..., min_length=1, max_length=100, description="Type of hazard (flood, landslide, fire, etc.)")
    severity: HazardSeverity = Field(default=HazardSeverity.LOW, description="Operational severity level")


class HazardZoneCreate(HazardZoneBase):
    coordinates: Optional[List[List[List[float]]]] = Field(
        default=None,
        description="GeoJSON polygon linear ring coordinates [[ [lng, lat], [lng, lat], ... ]]",
    )
    geometry: Optional[Dict[str, Any]] = Field(
        default=None,
        description="GeoJSON geometry dictionary {'type': 'Polygon', 'coordinates': [...]}"
    )


class HazardZoneUpdate(BaseModel):
    severity: Optional[HazardSeverity] = Field(default=None, description="Updated hazard severity")
    is_active: Optional[bool] = Field(default=None, description="Operational active flag")
    last_verified_survey_id: Optional[int] = Field(default=None, description="Linked ground-truth verification survey ID")


class HazardZoneResponse(BaseModel):
    id: int
    name: str
    hazard_type: str
    severity: HazardSeverity
    is_active: bool
    last_verified_survey_id: Optional[int] = None
    geometry: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
