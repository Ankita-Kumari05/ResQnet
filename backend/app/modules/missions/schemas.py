"""
ResQnet Missions Schemas (Step 6.5)
Pydantic schemas for responder field dispatch missions and lifecycle transitions.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from app.db.models import MissionType, MissionStatus, ResponderStatus


class MissionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_type: MissionType = Field(..., description="Type of operational mission")
    title: str = Field(..., min_length=1, max_length=255, description="Descriptive mission title")
    description: Optional[str] = Field(None, max_length=5000, description="Mission operational briefing")
    responder_id: Optional[int] = Field(None, description="Assigned responder profile ID")
    cluster_id: Optional[int] = Field(None, description="Incident cluster ID for verification missions")
    road_id: Optional[int] = Field(None, description="Road segment ID for road survey missions")
    hub_id: Optional[int] = Field(None, description="Safety hub ID for resource/delivery missions")
    target_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Target location latitude")
    target_lng: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Target location longitude")
    notes: Optional[str] = Field(None, max_length=5000, description="Initial coordinator notes")


class MissionReassign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    responder_id: int = Field(..., description="New assigned responder profile ID")
    notes: Optional[str] = Field(None, max_length=5000, description="Reassignment rationale notes")


class MissionActionNotes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: Optional[str] = Field(None, max_length=5000, description="Action or status update notes")


class MissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mission_type: MissionType
    status: MissionStatus
    title: str
    description: Optional[str] = None
    responder_id: Optional[int] = None
    cluster_id: Optional[int] = None
    road_id: Optional[int] = None
    hub_id: Optional[int] = None
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: datetime


class ResponderDirectoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Responder profile ID")
    user_id: int = Field(..., description="Associated User ID")
    full_name: str = Field(..., description="Responder full name")
    ngo_name: Optional[str] = Field(None, description="Affiliated NGO name")
    status: ResponderStatus = Field(..., description="Current operational status")
    verification_status: Optional[str] = Field("verified", description="Statutory accreditation verification status")
