"""
ResQnet Versioned API Router (v1)
Registers central versioned domain endpoints under /api/v1.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.auth.router import router as auth_router
from app.modules.incidents.router import router as incidents_router
from app.modules.clusters.router import router as clusters_router
from app.modules.missions.router import router as missions_router
from app.modules.field_surveys.router import router as field_surveys_router
from app.modules.hazards.router import router as hazards_router
from app.modules.routing.router import router as routing_router
from app.modules.hubs.router import router as hubs_router
from app.modules.resources.router import router as resources_router
from app.modules.campaigns.router import router as campaigns_router
from app.modules.donations.router import router as donations_router
from app.modules.alerts.router import router as alerts_router
from app.modules.roads.router import router as roads_router
from app.modules.sync.router import router as sync_router
from app.modules.simulation.router import router as simulation_router
from app.modules.admin.router import router as admin_router
from app.modules.map.router import router as map_router

api_v1_router = APIRouter(prefix="/v1")

# Mount domain module routers under /api/v1
api_v1_router.include_router(auth_router)
api_v1_router.include_router(roads_router)
api_v1_router.include_router(incidents_router)
api_v1_router.include_router(clusters_router)
api_v1_router.include_router(missions_router)
api_v1_router.include_router(field_surveys_router)
api_v1_router.include_router(hazards_router)
api_v1_router.include_router(routing_router)
api_v1_router.include_router(hubs_router)
api_v1_router.include_router(resources_router)
api_v1_router.include_router(campaigns_router)
api_v1_router.include_router(donations_router)
api_v1_router.include_router(alerts_router)
api_v1_router.include_router(sync_router)
api_v1_router.include_router(simulation_router)
api_v1_router.include_router(admin_router)
api_v1_router.include_router(map_router)




@api_v1_router.get("/health", tags=["Health"])
async def health_check_v1(db: AsyncSession = Depends(get_db)):
    """Health check endpoint for API v1 validating database connectivity."""
    db_status = "disconnected"
    try:
        result = await db.execute(text("SELECT 1"))
        if result.scalar() == 1:
            db_status = "connected"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "healthy",
        "version": "1.0.0",
        "database": db_status,
    }
