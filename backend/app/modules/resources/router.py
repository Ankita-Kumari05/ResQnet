"""
Safety Hub Resource & Requirements Module Router (API v1) (Step 6.11)
Exposes endpoints for resource inventory management, requirement lifecycle,
and responder delivery execution.
"""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User, ResourceType
from app.modules.auth.router import get_current_user
from app.modules.resources.schemas import (
    HubResourceOut,
    HubResourceUpdate,
    ResourceRequirementOut,
    ResourceRequirementCreate,
    ResourceRequirementUpdate,
    ResourceDeliveryRequest,
)
from app.modules.resources.service import (
    get_hub_resources_service,
    update_hub_resource_service,
    get_hub_requirements_service,
    create_requirement_service,
    update_requirement_service,
    deliver_resource_service,
)

router = APIRouter(tags=["Hub Resources & Requirements"])


@router.get("/hubs/{hub_id}/resources", response_model=List[HubResourceOut])
async def get_hub_resources(
    hub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves current resource inventory levels for a safety hub.
    Accessible to all authenticated users.
    """
    return await get_hub_resources_service(db, hub_id)


@router.put("/hubs/{hub_id}/resources/{resource_type}", response_model=HubResourceOut)
async def update_hub_resource(
    hub_id: int,
    resource_type: ResourceType,
    payload: HubResourceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Directly updates or initializes hub resource inventory level.
    Protected by SELECT FOR UPDATE row-level locking.
    Restricted to Coordinators.
    """
    return await update_hub_resource_service(db, hub_id, resource_type, payload, current_user)


@router.get("/hubs/{hub_id}/requirements", response_model=List[ResourceRequirementOut])
async def get_hub_requirements(
    hub_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves resource requirements for a safety hub.
    Accessible to all authenticated users.
    """
    return await get_hub_requirements_service(db, hub_id)


@router.post(
    "/hubs/{hub_id}/requirements",
    response_model=ResourceRequirementOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_hub_requirement(
    hub_id: int,
    payload: ResourceRequirementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new resource requirement for a safety hub.
    Restricted to Coordinators. Server automatically derives shortfall_quantity.
    """
    return await create_requirement_service(db, hub_id, payload, current_user)


@router.patch("/requirements/{requirement_id}", response_model=ResourceRequirementOut)
async def update_requirement(
    requirement_id: int,
    payload: ResourceRequirementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Modifies an existing resource requirement (required quantity, priority, status).
    Restricted to Coordinators. Server recalculates shortfall_quantity automatically.
    """
    return await update_requirement_service(db, requirement_id, payload, current_user)


@router.post("/requirements/{requirement_id}/deliver", response_model=ResourceRequirementOut)
async def deliver_resource(
    requirement_id: int,
    payload: ResourceDeliveryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits a resource delivery for a requirement.
    Restricted to Responders with an active, non-offline profile and a matching active deliver_resource mission.
    Protected by SELECT FOR UPDATE row-level locking.
    """
    return await deliver_resource_service(db, requirement_id, payload, current_user)
