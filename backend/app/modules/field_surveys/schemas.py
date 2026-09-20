"""
ResQnet Field Survey Schemas (Step 6.6)
Pydantic schemas for responder field survey observations and verification evidence.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from app.db.models import (
    FieldSurveyVerificationOutcome,
    RoadStatus,
    ReportClusterStatus,
)


class FieldSurveyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: int = Field(..., description="ID of the executable mission")
    hazard_level: Optional[int] = Field(None, ge=1, le=5, description="Observed hazard level (1=Low to 5=Extreme)")
    verification_outcome: Optional[FieldSurveyVerificationOutcome] = Field(
        None, description="Responder verification outcome observation"
    )
    observed_lat: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Observed latitude in WGS84")
    observed_lng: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Observed longitude in WGS84")
    observed_condition: Optional[str] = Field(None, max_length=5000, description="Physical on-site inspection condition notes")
    road_status: Optional[RoadStatus] = Field(None, description="Observed road segment status")
    hazard_penalty: Optional[float] = Field(None, ge=0.0, description="Observed hazard penalty weight")
    flood_penalty: Optional[float] = Field(None, ge=0.0, description="Observed flood penalty weight")
    congestion_penalty: Optional[float] = Field(None, ge=0.0, description="Observed congestion penalty weight")
    is_blocked: Optional[bool] = Field(None, description="Observed physical road blockage indicator")
    media_url: Optional[str] = Field(None, max_length=512, description="Evidence media URL (photo/video)")
    notes: Optional[str] = Field(None, max_length=5000, description="Additional responder survey notes")
    submitted_offline: bool = Field(False, description="Flag indicating if the survey was buffered offline")
    client_timestamp: Optional[datetime] = Field(None, description="Client device timestamp when the survey was recorded")


class FieldSurveyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mission_id: Optional[int] = None
    responder_id: int
    road_id: Optional[int] = None
    cluster_id: Optional[int] = None
    observed_lat: Optional[float] = None
    observed_lng: Optional[float] = None
    observed_condition: Optional[str] = None
    road_status: Optional[RoadStatus] = None
    hazard_penalty: Optional[float] = None
    flood_penalty: Optional[float] = None
    congestion_penalty: Optional[float] = None
    is_blocked: Optional[bool] = None
    hazard_level: Optional[int] = None
    verification_outcome: Optional[FieldSurveyVerificationOutcome] = None
    media_url: Optional[str] = None
    notes: Optional[str] = None
    submitted_offline: bool
    client_timestamp: Optional[datetime] = None
    submitted_at: datetime
    # Computed propagation state — True if this survey has been propagated into ground truth.
    # Set server-side based on road.last_verified_survey_id matching this survey's ID.
    is_propagated: bool = False


class GroundTruthPropagationResponse(BaseModel):
    """Schema returned after propagating a field survey into operational ground truth."""
    survey_id: int
    verification_outcome: Optional[FieldSurveyVerificationOutcome] = None
    road_id: Optional[int] = None
    road_status: Optional[RoadStatus] = None
    road_is_blocked: Optional[bool] = None
    cluster_id: Optional[int] = None
    cluster_status: Optional[ReportClusterStatus] = None
    already_propagated: bool = False
    propagated_at: datetime
    message: str

