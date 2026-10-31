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


class SmsIngestPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    raw_sms: str = Field(..., description="Raw SMS string in RESQ1 format or parsed format")
    sender_phone: Optional[str] = Field(None, max_length=50, description="Originating cellular phone number")
    alert_uid: Optional[str] = Field(None, max_length=64, description="Extracted Alert UID (e.g. RQN-xxx)")
    category: Optional[str] = Field(None, max_length=100)
    severity: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=5000)
    lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    lng: Optional[float] = Field(None, ge=-180.0, le=180.0)
    people_affected: Optional[str] = Field(None, max_length=50)
    client_timestamp: Optional[datetime] = Field(None)


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


@router.post(
    "/incident-reports/sms-ingest",
    response_model=IncidentReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest parsed SMS incident report from GSM modem receiver daemon",
)
async def ingest_sms_incident_report(
    payload: SmsIngestPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Ingests an SMS alert received from a cellular GSM modem/gateway daemon.
    - Security rule: SMS signals ALWAYS initialize with status=UNVERIFIED.
    - They NEVER trigger automatic mission dispatch without coordinator human verification.
    - If alert_uid exists in database, returns existing record to prevent duplicate incident creation.
    """
    raw_str = payload.raw_sms.strip()
    
    # Defaults
    alert_uid = payload.alert_uid or "UNKNOWN"
    cat = payload.category or "other"
    desc = payload.description or ""
    lat = payload.lat if payload.lat is not None else 30.7333
    lng = payload.lng if payload.lng is not None else 76.7794

    # Parse compact RESQ1 format if formatted as RESQ1|...
    if raw_str.startswith("RESQ1|"):
        parts = raw_str.split("|")
        # Format: RESQ1|ALERT_UID|ALERT_TYPE|LAT|LON|ACCURACY|PEOPLE_AFFECTED|DESCRIPTION|TIMESTAMP
        if len(parts) >= 8:
            alert_uid = parts[1]
            raw_type = parts[2]
            
            # Map category
            lower_type = raw_type.lower()
            if "fire" in lower_type:
                cat = "fire"
            elif "casualty" in lower_type or "medical" in lower_type or "injury" in lower_type:
                cat = "injury"
            elif "flood" in lower_type:
                cat = "flood"
            elif "collapse" in lower_type or "road" in lower_type:
                cat = "road_block"
            else:
                cat = "other"

            if parts[3] != "UNKNOWN" and parts[4] != "UNKNOWN":
                try:
                    lat = float(parts[3])
                    lng = float(parts[4])
                except ValueError:
                    pass

            accuracy_val = parts[5]
            people_val = parts[6]
            raw_desc = parts[7]
            
            desc = f"[SMS-INGEST][UID: {alert_uid}][Accuracy: {accuracy_val}][People: {people_val}] {raw_desc}"
            if payload.sender_phone:
                desc += f" (Sender: {payload.sender_phone})"

    # Duplicate detection check via UID in description or operation log
    query = select(IncidentReport).where(
        IncidentReport.description.ilike(f"%{alert_uid}%")
    )
    res = await db.execute(query)
    existing = res.scalars().first()
    if existing:
        return IncidentReportResponse.model_validate(existing)

    geom_wkt = f"SRID=4326;POINT({lng} {lat})"
    report = IncidentReport(
        reporter_id=None,  # SMS originated report without web session
        category=cat,
        description=desc or f"[SMS-INGEST] {raw_str}",
        lat=lat,
        lng=lng,
        geom=geom_wkt,
        photo_url=None,
        status=ReportStatus.unverified,  # ALWAYS UNVERIFIED signal!
        cluster_id=None,
        submitted_offline=True,
        client_timestamp=payload.client_timestamp or datetime.utcnow(),
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

