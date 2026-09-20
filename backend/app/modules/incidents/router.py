"""
ResQnet Incident Reporting Module (Citizen Signals)
Implements citizen crowdsourced incident report submission (Tier-1 unverified signals).
Citizen reports are NEVER ground truth and ALWAYS start as UNVERIFIED.
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import IncidentReport, ReportStatus, User, UserRole
from app.modules.auth.router import require_role
from app.core.exceptions import BadRequestException

router = APIRouter(tags=["Incident Reports"])


# ─── Request & Response Schemas ─────────────────────────────────────────────

class IncidentReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(..., min_length=1, max_length=100, description="Incident category, e.g. flood, road_block, injury, fire")
    description: Optional[str] = Field(None, max_length=5000, description="Detailed description of the observed incident")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude in WGS84 (-90.0 to 90.0)")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Longitude in WGS84 (-180.0 to 180.0)")
    photo_url: Optional[str] = Field(None, max_length=512, description="Optional URL to uploaded photo evidence")
    submitted_offline: bool = Field(False, description="Flag indicating if the report was buffered offline")
    client_timestamp: Optional[datetime] = Field(None, description="Client device timestamp when the incident was recorded")


class IncidentReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reporter_id: Optional[int] = None
    category: str
    description: Optional[str] = None
    status: ReportStatus
    lat: float
    lng: float
    photo_url: Optional[str] = None
    cluster_id: Optional[int] = None
    submitted_offline: bool
    client_timestamp: Optional[datetime] = None
    created_at: datetime


# Aliases for backwards-compatibility
ReportCreate = IncidentReportCreate
ReportOut = IncidentReportResponse


# ─── Routes ────────────────────────────────────────────────────────────────

@router.post(
    "/incident-reports",
    response_model=IncidentReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a citizen incident report (Signal)",
)
async def create_incident_report(
    payload: IncidentReportCreate,
    current_user: User = Depends(require_role(UserRole.citizen)),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new citizen incident report.
    - Restricted exclusively to authenticated CITIZEN users.
    - Report status is ALWAYS initialized to UNVERIFIED (signal, not ground truth).
    - Coordinates are indexed as a PostGIS POINT in SRID 4326.
    - Trusted operational fields (cluster_id, verified_by_id, verified_at) are strictly server-controlled.
    - Media field is strictly `photo_url`. `media_url` and `media_type` are reserved for responder field surveys.
    """
    # Create PostGIS POINT EWKT: POINT(lng lat)
    geom_wkt = f"SRID=4326;POINT({payload.lng} {payload.lat})"

    report = IncidentReport(
        reporter_id=current_user.id,
        category=payload.category.strip(),
        description=payload.description.strip() if payload.description else None,
        lat=payload.lat,
        lng=payload.lng,
        geom=geom_wkt,
        photo_url=payload.photo_url.strip() if payload.photo_url else None,
        status=ReportStatus.unverified,  # ALWAYS unverified on citizen creation
        cluster_id=None,
        submitted_offline=payload.submitted_offline,
        client_timestamp=payload.client_timestamp,
        verified_by_id=None,
        verified_at=None,
    )

    try:
        db.add(report)
        await db.commit()
        await db.refresh(report)
    except Exception:
        await db.rollback()
        raise

    return IncidentReportResponse.model_validate(report)


# Backwards compatibility alias for /incidents endpoint
@router.post(
    "/incidents",
    response_model=IncidentReportResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_incident_report_legacy(
    payload: IncidentReportCreate,
    current_user: User = Depends(require_role(UserRole.citizen)),
    db: AsyncSession = Depends(get_db),
):
    """Legacy alias pointing to the canonical incident creation logic."""
    return await create_incident_report(payload=payload, current_user=current_user, db=db)
