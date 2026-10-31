"""
ResQnet FastAPI Application Entry Point
Modular monolith — all domain modules registered under /api/v1.
"""
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.logging import setup_logging, logger
from app.core.exceptions import AppException
from app.api.v1.router import api_v1_router

from app.modules.auth.router import router as auth_router, get_current_user
from app.modules.roads.router import router as roads_router
from app.modules.hazards.router import router as hazards_router
from app.modules.routing.router import router as routing_router
from app.modules.hubs.router import router as hubs_router
from app.modules.incidents.router import router as incidents_router
from app.modules.missions.router import router as missions_router, list_responders
from app.modules.clusters.router import router as clusters_router, list_clusters
from app.modules.field_surveys.router import router as field_surveys_router
from app.modules.alerts.router import router as alerts_router
from app.modules.campaigns.router import router as campaigns_router
from app.modules.donations.router import router as donations_router
from app.modules.resources.router import router as resources_router
from app.modules.sync.router import router as sync_router
from app.modules.simulation.router import router as simulation_router
from app.modules.admin.router import router as admin_router
from app.db.session import get_db
from app.db.models import User, UserRole
from sqlalchemy.ext.asyncio import AsyncSession


setup_logging()
settings = get_settings()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Offline-first disaster response and field coordination platform — SIH 2026",
    version=settings.VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Centralized Exception Handlers ──────────────────────────────────────────

@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handles domain-specific application exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handles standard HTTP exceptions including 404 routing errors."""
    code = getattr(exc, "code", None)
    if not code:
        if exc.status_code == 404:
            code = "NOT_FOUND"
        elif exc.status_code == 401:
            code = "UNAUTHORIZED"
        elif exc.status_code == 403:
            code = "FORBIDDEN"
        elif exc.status_code == 400:
            code = "BAD_REQUEST"
        else:
            code = "HTTP_ERROR"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error": {
                "code": code,
                "message": exc.detail if isinstance(exc.detail, str) else "HTTP Exception",
                "details": exc.detail if not isinstance(exc.detail, str) else None,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handles FastAPI HTTP exceptions."""
    return await starlette_http_exception_handler(request, exc)


from fastapi.encoders import jsonable_encoder

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handles FastAPI/Pydantic request payload and query validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "error",
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": jsonable_encoder(exc.errors()),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Safety net for unhandled exceptions to prevent stack trace leakage."""
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected internal server error occurred.",
                "details": None,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


# ── Register Versioned API Router (/api/v1) ──────────────────────────────────
app.include_router(api_v1_router, prefix="/api")

# Register module routes under /api for existing bindings
API_PREFIX = "/api"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(roads_router, prefix=API_PREFIX)
app.include_router(hazards_router, prefix=API_PREFIX)
app.include_router(routing_router, prefix=API_PREFIX)
app.include_router(hubs_router, prefix=API_PREFIX)
app.include_router(incidents_router, prefix=API_PREFIX)
app.include_router(missions_router, prefix=API_PREFIX)
app.include_router(clusters_router, prefix=API_PREFIX)
app.include_router(field_surveys_router, prefix=API_PREFIX)
app.include_router(alerts_router, prefix=API_PREFIX)
app.include_router(campaigns_router, prefix=API_PREFIX)
app.include_router(donations_router, prefix=API_PREFIX)
app.include_router(resources_router, prefix=API_PREFIX)
app.include_router(sync_router, prefix=API_PREFIX)
app.include_router(simulation_router, prefix=API_PREFIX)
app.include_router(admin_router, prefix=API_PREFIX)

# Legacy aliases for older UI builds
@app.get("/api/incidents/clusters", include_in_schema=False)
async def legacy_incident_clusters(db = Depends(get_db), current_user = Depends(get_current_user)):
    return await list_clusters(cluster_status=None, limit=50, offset=0, current_user=current_user, db=db)

@app.get("/api/auth/responders", include_in_schema=False)
async def legacy_auth_responders(db = Depends(get_db), current_user = Depends(get_current_user)):
    return await list_responders(current_user=current_user, db=db)


@app.get("/api/notifications")
async def get_notifications(
    role: str = "responder",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetches real role-filtered operational notifications.
    For role=responder:
    - Mission assignments for this responder
    - SITREP / field survey verification tasks
    - Audit log history / operational status updates
    """
    from sqlalchemy import select, desc
    from app.db.models import Mission, MissionStatus, FieldSurvey, AuditLog, Responder
    from app.modules.missions.service import get_responder_by_user_id

    notifications = []
    notif_id = 1

    if role == "responder" or current_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, current_user.id)
        if responder:
            # 1. Mission Dispatches / Assignments (interrupt / priority)
            missions_res = await db.execute(
                select(Mission)
                .where(Mission.responder_id == responder.id)
                .order_by(desc(Mission.created_at))
                .limit(5)
            )
            for m in missions_res.scalars().all():
                is_active = m.status in (MissionStatus.assigned, MissionStatus.accepted, MissionStatus.in_progress)
                time_str = m.created_at.strftime("%d %b • %H:%M IST") if m.created_at else "Recently"
                priority_label = "PRIORITY 1" if m.mission_type.value in ("verify_incident", "rescue") else "STANDARD"
                notifications.append({
                    "id": notif_id,
                    "category": "missions",
                    "title": f"Mission Dispatched: #{m.id} — {m.title}",
                    "desc": m.description or f"Operational field mission assigned to your unit: {m.title}. Target: {m.target_lat or 30.7398}° N, {m.target_lng or 76.7827}° E.",
                    "dispatchRef": f"MISSION-#{m.id}",
                    "grid": f"{round(m.target_lat or 30.7398, 4)}° N, {round(m.target_lng or 76.7827, 4)}° E",
                    "time": time_str,
                    "priority": priority_label,
                    "read": not is_active,
                    "action": "Open Mission Detail",
                    "actionTab": "missions",
                })
                notif_id += 1

            # 2. Field Survey / SITREP Requests (Push)
            surveys_res = await db.execute(
                select(FieldSurvey)
                .where(FieldSurvey.responder_id == responder.id)
                .order_by(desc(FieldSurvey.submitted_at))
                .limit(3)
            )
            for s in surveys_res.scalars().all():
                time_str = s.submitted_at.strftime("%d %b • %H:%M IST") if s.submitted_at else "Recently"
                notifications.append({
                    "id": notif_id,
                    "category": "verifications",
                    "title": f"Field Survey #{s.id} Logged",
                    "desc": f"Ground-truth inspection packet recorded. Verification outcome: {s.verification_outcome.value if s.verification_outcome else 'Recorded'}. Hazard Lvl: {s.hazard_level or 'Standard'}.",
                    "dispatchRef": f"SURVEY-#{s.id}",
                    "grid": f"{round(s.observed_lat or 30.7398, 4)}° N, {round(s.observed_lng or 76.7827, 4)}° E",
                    "time": time_str,
                    "priority": "GROUND TRUTH",
                    "read": True,
                    "action": "Open Verification Workbench",
                    "actionTab": "verification",
                })
                notif_id += 1

            # 3. Status History (Badge / System Audit)
            audits_res = await db.execute(
                select(AuditLog)
                .where(AuditLog.actor_id == current_user.id)
                .order_by(desc(AuditLog.created_at))
                .limit(3)
            )
            for a in audits_res.scalars().all():
                time_str = a.created_at.strftime("%d %b • %H:%M IST") if a.created_at else "Recently"
                action_name = a.action.replace("_", " ").title()
                notifications.append({
                    "id": notif_id,
                    "category": "system",
                    "title": f"Status Update: {action_name}",
                    "desc": f"Telemetry log recorded for entity {a.entity_type} #{a.entity_id or ''}. Audit status synchronized with central command.",
                    "dispatchRef": f"AUDIT-#{a.id}",
                    "grid": "Central EOC Link",
                    "time": time_str,
                    "priority": "SYSTEM LOG",
                    "read": True,
                    "action": "View Tactical Telemetry",
                    "actionTab": "dashboard",
                })
                notif_id += 1

    return notifications



@app.get("/")
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "status": "operational",
        "docs": "/api/docs",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy",
        "version": settings.VERSION,
    }
