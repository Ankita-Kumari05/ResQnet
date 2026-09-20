"""
ResQnet Relief Campaign Schemas (Step 6.12)
Defines Pydantic request/response models for campaign management.
"""
import math
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.db.models import CampaignStatus, ResourceType


class CampaignCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255, description="Relief campaign title")
    description: Optional[str] = Field(None, max_length=5000, description="Campaign detailed description")
    requirement_id: Optional[int] = Field(None, description="Associated ResourceRequirement ID (Mandatory for fundraisers)")
    hub_id: Optional[int] = Field(None, description="Optional Safety Hub ID (Derived from requirement if present)")
    resource_type: Optional[ResourceType] = Field(None, description="Optional ResourceType (Derived from requirement if present)")
    target_amount: Optional[float] = Field(None, description="Financial fundraising target in INR (must be > 0)")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v_stripped = v.strip()
        if len(v_stripped) < 3:
            raise ValueError("title must be at least 3 characters long")
        return v_stripped

    @field_validator("target_amount")
    @classmethod
    def validate_target_amount(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if math.isnan(v) or math.isinf(v):
                raise ValueError("target_amount must be a valid finite number")
            if v <= 0:
                raise ValueError("target_amount must be greater than 0")
            return round(v, 2)
        return v


class CampaignOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: CampaignStatus
    hub_id: Optional[int] = None
    requirement_id: Optional[int] = None
    ngo_user_id: Optional[int] = None
    resource_type: Optional[ResourceType] = None
    target_amount: float
    raised_amount: float
    share_slug: Optional[str] = None
    progress_percent: float = 0.0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CampaignUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    status: Optional[CampaignStatus] = Field(None, description="Optional status override (e.g. closed)")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_stripped = v.strip()
            if len(v_stripped) < 3:
                raise ValueError("title must be at least 3 characters long")
            return v_stripped
        return v
