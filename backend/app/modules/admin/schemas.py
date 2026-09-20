"""
ResQnet Admin Module Schemas
Provides schemas for Verification decisions, Analytics aggregates, Action Logs, and Configuration.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ─── Verification Schemas ───

class VerificationDecisionRequest(BaseModel):
    decision: str = Field(..., description="APPROVE or REJECT")
    justification: Optional[str] = Field(None, description="Registrar review justification notes")


class NGOVerificationItem(BaseModel):
    id: int
    case_number: str
    org_name: str
    org_type: Optional[str] = "Disaster Relief NGO"
    darpan_id: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str
    justification: Optional[str] = None
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_id: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ─── Analytics Schemas ───

class AdminAnalyticsResponse(BaseModel):
    total_users: int
    citizens_count: int
    coordinators_count: int
    responders_count: int
    incidents_total: int
    incidents_verified: int
    incidents_rejected: int
    incidents_unverified: int
    missions_total: int
    missions_completed: int
    ngos_verified: int
    ngos_pending: int
    avg_resolution_hours: float
    active_alerts_count: int


# ─── Action Log / Audit Schemas ───

class ActionLogItem(BaseModel):
    id: int
    timestamp: datetime
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    action: str
    target: Optional[str] = None
    entity_type: str
    entity_id: Optional[int] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None


# ─── Admin Notification Schemas ───

class AdminNotificationItem(BaseModel):
    id: int
    category: str  # accreditation, security, health
    categoryLabel: str
    title: str
    desc: str
    dispatchRef: str
    grid: str
    time: str
    priority: str
    read: bool
    action: str
    actionTab: str


# ─── Configuration Schemas ───

class SystemConfigUpdate(BaseModel):
    key: str
    value: Any
