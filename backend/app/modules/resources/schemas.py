"""
ResQnet Safety Hub Resource Inventory & Requirements Schemas (Step 6.11)
Defines Pydantic request/response models for hub resources and requirements.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.db.models import ResourceType, RequirementStatus


# ─── Hub Resource Inventory Schemas ──────────────────────────────────────────

class HubResourceOut(BaseModel):
    id: int
    hub_id: int
    resource_type: ResourceType
    current_quantity: float
    unit: str
    critical_threshold: float
    is_critical: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class HubResourceUpdate(BaseModel):
    current_quantity: float = Field(..., description="Current quantity in inventory (must be >= 0)")
    unit: Optional[str] = Field(default="units", description="Measurement unit (e.g. kg, liters, boxes)")
    critical_threshold: Optional[float] = Field(default=100.0, description="Quantity threshold below which inventory is critical")

    @field_validator("current_quantity")
    @classmethod
    def validate_current_quantity(cls, v: float) -> float:
        if v < 0:
            raise ValueError("current_quantity must be non-negative")
        return v

    @field_validator("critical_threshold")
    @classmethod
    def validate_critical_threshold(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("critical_threshold must be greater than 0")
        return v


# ─── Resource Requirement Schemas ───────────────────────────────────────────

class ResourceRequirementCreate(BaseModel):
    resource_type: ResourceType = Field(..., description="Type of resource required")
    required_quantity: float = Field(..., description="Total quantity required (must be > 0)")
    unit: Optional[str] = Field(default="units", description="Measurement unit")
    priority: int = Field(default=1, description="Priority integer from 1 (lowest) to 5 (highest)")

    @field_validator("required_quantity")
    @classmethod
    def validate_required_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("required_quantity must be greater than 0")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("priority must be an integer between 1 and 5")
        return v


class ResourceRequirementOut(BaseModel):
    id: int
    hub_id: int
    resource_type: ResourceType
    required_quantity: float
    fulfilled_quantity: float
    shortfall_quantity: float
    unit: str
    priority: int
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResourceRequirementUpdate(BaseModel):
    status: Optional[RequirementStatus] = Field(default=None, description="Optional new requirement status")
    required_quantity: Optional[float] = Field(default=None, description="Optional updated required quantity")
    priority: Optional[int] = Field(default=None, description="Optional updated priority (1..5)")

    @field_validator("required_quantity")
    @classmethod
    def validate_required_quantity(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("required_quantity must be greater than 0")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 5):
            raise ValueError("priority must be an integer between 1 and 5")
        return v


# ─── Resource Delivery Schema ────────────────────────────────────────────────

class ResourceDeliveryRequest(BaseModel):
    mission_id: int = Field(..., description="Legitimate deliver_resource mission ID")
    quantity: float = Field(..., description="Delivered quantity (must be > 0)")

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Delivered quantity must be greater than 0")
        return v
