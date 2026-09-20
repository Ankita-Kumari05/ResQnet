"""
ResQnet Mock Donations Schemas (Step 6.12)
Defines Pydantic request/response models for mock donation operations.
"""
import math
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class DonationCreate(BaseModel):
    campaign_id: int = Field(..., description="ID of active Campaign")
    amount: float = Field(..., gt=0.0, description="Mock donation amount in INR (must be > 0)")
    donor_name: Optional[str] = Field(default="Anonymous Donor", max_length=255, description="Donor display name")
    message: Optional[str] = Field(default=None, max_length=1000, description="Optional encouragement message")
    transaction_ref: Optional[str] = Field(default=None, max_length=128, description="Optional client transaction reference for idempotency")

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            raise ValueError("amount must be a valid finite number")
        if v <= 0:
            raise ValueError("amount must be greater than 0")
        return round(v, 2)

    @field_validator("donor_name")
    @classmethod
    def validate_donor_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_stripped = v.strip()
            return v_stripped if v_stripped else "Anonymous Donor"
        return "Anonymous Donor"


class DonationOut(BaseModel):
    id: int
    campaign_id: int
    donor_name: Optional[str] = None
    amount: float
    message: Optional[str] = None
    transaction_ref: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
