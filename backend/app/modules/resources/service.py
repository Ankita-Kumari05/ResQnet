"""
ResQnet Safety Hub Resource Inventory & Requirements Service Layer (Step 6.11)
Handles transactional resource inventory upserts, requirement lifecycle, responder delivery atomicity,
strict mission authorization, shortfall derivations, dynamic critical flags, and audit logging.
"""
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    SafetyHub,
    HubStatus,
    HubResource,
    ResourceRequirement,
    ResourceType,
    RequirementStatus,
    User,
    UserRole,
    Responder,
    ResponderStatus,
    Mission,
    MissionStatus,
    MissionType,
    AuditLog,
)
from app.modules.resources.schemas import (
    HubResourceUpdate,
    ResourceRequirementCreate,
    ResourceRequirementUpdate,
    ResourceDeliveryRequest,
)
from app.modules.campaigns.service import sync_campaigns_for_requirement


def enrich_resource_dict(res: HubResource) -> Dict[str, Any]:
    """Formats HubResource ORM instance into response dictionary."""
    is_crit = res.current_quantity < res.critical_threshold
    return {
        "id": res.id,
        "hub_id": res.hub_id,
        "resource_type": res.resource_type,
        "current_quantity": res.current_quantity,
        "unit": res.unit,
        "critical_threshold": res.critical_threshold,
        "is_critical": is_crit,
        "updated_at": res.updated_at,
    }


def enrich_requirement_dict(req: ResourceRequirement) -> Dict[str, Any]:
    """Formats ResourceRequirement ORM instance into response dictionary."""
    return {
        "id": req.id,
        "hub_id": req.hub_id,
        "resource_type": req.resource_type,
        "required_quantity": req.required_quantity,
        "fulfilled_quantity": req.fulfilled_quantity,
        "shortfall_quantity": req.shortfall_quantity,
        "unit": req.unit,
        "priority": req.priority,
        "status": req.status,
        "created_at": req.created_at,
        "updated_at": req.updated_at,
    }


async def log_resource_audit(
    db: AsyncSession,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_id: int,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> AuditLog:
    """Logs an immutable audit log entry for resource operations."""
    audit = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(audit)
    return audit


# ─── Hub Resources Service ───────────────────────────────────────────────────

async def get_hub_resources_service(db: AsyncSession, hub_id: int) -> List[Dict[str, Any]]:
    """Returns all resource inventory items for a specific safety hub."""
    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    result = await db.execute(
        select(HubResource)
        .where(HubResource.hub_id == hub_id)
        .order_by(HubResource.resource_type)
    )
    resources = result.scalars().all()
    return [enrich_resource_dict(r) for r in resources]


async def update_hub_resource_service(
    db: AsyncSession,
    hub_id: int,
    resource_type: ResourceType,
    payload: HubResourceUpdate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only: Updates or initializes current resource inventory for a hub.
    Uses SELECT FOR UPDATE row locking. Writes audit log.
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can directly update hub resource inventory")

    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    # Acquire row lock on hub_resources
    stmt = (
        select(HubResource)
        .where(HubResource.hub_id == hub_id, HubResource.resource_type == resource_type)
        .with_for_update()
    )
    res_q = await db.execute(stmt)
    hub_res = res_q.scalar_one_or_none()

    is_new = False
    old_values = None

    if not hub_res:
        is_new = True
        hub_res = HubResource(
            hub_id=hub_id,
            resource_type=resource_type,
            current_quantity=payload.current_quantity,
            unit=payload.unit or "units",
            critical_threshold=payload.critical_threshold or 100.0,
        )
        db.add(hub_res)
    else:
        old_values = {
            "current_quantity": hub_res.current_quantity,
            "unit": hub_res.unit,
            "critical_threshold": hub_res.critical_threshold,
        }
        hub_res.current_quantity = payload.current_quantity
        if payload.unit:
            hub_res.unit = payload.unit
        if payload.critical_threshold is not None:
            hub_res.critical_threshold = payload.critical_threshold

    await db.flush()

    action = "SAFETY_HUB_RESOURCE_INITIALIZED" if is_new else "SAFETY_HUB_RESOURCE_UPDATED"
    await log_resource_audit(
        db,
        actor_id=actor_user.id,
        action=action,
        entity_type="hub_resources",
        entity_id=hub_res.id,
        old_values=old_values,
        new_values={
            "hub_id": hub_id,
            "resource_type": resource_type.value,
            "current_quantity": hub_res.current_quantity,
            "unit": hub_res.unit,
            "critical_threshold": hub_res.critical_threshold,
        },
    )

    await db.commit()
    await db.refresh(hub_res)
    return enrich_resource_dict(hub_res)


# ─── Resource Requirements Service ─────────────────────────────────────────

async def get_hub_requirements_service(db: AsyncSession, hub_id: int) -> List[Dict[str, Any]]:
    """Returns all resource requirements for a safety hub."""
    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    result = await db.execute(
        select(ResourceRequirement)
        .where(ResourceRequirement.hub_id == hub_id)
        .order_by(ResourceRequirement.created_at.desc())
    )
    requirements = result.scalars().all()
    return [enrich_requirement_dict(r) for r in requirements]


async def create_requirement_service(
    db: AsyncSession,
    hub_id: int,
    payload: ResourceRequirementCreate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only: Creates a new resource requirement for a hub.
    Server calculates shortfall_quantity = max(0, required_quantity - 0).
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can create resource requirements")

    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    shortfall = max(0.0, payload.required_quantity)

    req = ResourceRequirement(
        hub_id=hub_id,
        resource_type=payload.resource_type,
        required_quantity=payload.required_quantity,
        fulfilled_quantity=0.0,
        shortfall_quantity=shortfall,
        unit=payload.unit or "units",
        priority=payload.priority,
        status=RequirementStatus.open,
    )
    db.add(req)
    await db.flush()

    await log_resource_audit(
        db,
        actor_id=actor_user.id,
        action="RESOURCE_REQUIREMENT_CREATED",
        entity_type="resource_requirements",
        entity_id=req.id,
        new_values={
            "hub_id": hub_id,
            "resource_type": req.resource_type.value,
            "required_quantity": req.required_quantity,
            "shortfall_quantity": req.shortfall_quantity,
            "priority": req.priority,
            "status": req.status.value,
        },
    )

    await db.commit()
    await db.refresh(req)
    return enrich_requirement_dict(req)


async def update_requirement_service(
    db: AsyncSession,
    requirement_id: int,
    payload: ResourceRequirementUpdate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only: Modifies an existing requirement's required quantity, priority, or status.
    Recalculates shortfall_quantity automatically.
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can update resource requirements")

    stmt = select(ResourceRequirement).where(ResourceRequirement.id == requirement_id).with_for_update()
    result = await db.execute(stmt)
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=404, detail="Resource Requirement not found")

    old_values = {
        "required_quantity": req.required_quantity,
        "fulfilled_quantity": req.fulfilled_quantity,
        "shortfall_quantity": req.shortfall_quantity,
        "priority": req.priority,
        "status": req.status.value,
    }

    if payload.required_quantity is not None:
        if payload.required_quantity < req.fulfilled_quantity:
            raise HTTPException(
                status_code=400,
                detail="required_quantity cannot be updated to less than already fulfilled_quantity",
            )
        req.required_quantity = payload.required_quantity

    if payload.priority is not None:
        req.priority = payload.priority

    # Server derives shortfall
    req.shortfall_quantity = max(0.0, req.required_quantity - req.fulfilled_quantity)

    if payload.status is not None:
        if payload.status == RequirementStatus.cancelled:
            req.status = RequirementStatus.cancelled
        elif payload.status == RequirementStatus.fulfilled:
            if req.shortfall_quantity > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot set status to fulfilled while shortfall_quantity > 0",
                )
            req.status = RequirementStatus.fulfilled
        else:
            # Re-derive status based on shortfall
            if req.shortfall_quantity == 0:
                req.status = RequirementStatus.fulfilled
            elif req.fulfilled_quantity > 0:
                req.status = RequirementStatus.in_transit
            else:
                req.status = RequirementStatus.open

    action = "RESOURCE_REQUIREMENT_CANCELLED" if req.status == RequirementStatus.cancelled else "RESOURCE_REQUIREMENT_UPDATED"
    await log_resource_audit(
        db,
        actor_id=actor_user.id,
        action=action,
        entity_type="resource_requirements",
        entity_id=req.id,
        old_values=old_values,
        new_values={
            "required_quantity": req.required_quantity,
            "fulfilled_quantity": req.fulfilled_quantity,
            "shortfall_quantity": req.shortfall_quantity,
            "priority": req.priority,
            "status": req.status.value,
        },
    )

    await sync_campaigns_for_requirement(db, req.id, req.status, actor_user.id)

    await db.commit()
    await db.refresh(req)
    return enrich_requirement_dict(req)


# ─── Responder Resource Delivery Service ─────────────────────────────────────

async def deliver_resource_service(
    db: AsyncSession,
    requirement_id: int,
    payload: ResourceDeliveryRequest,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Atomic Responder Resource Delivery Fulfillment.
    Strict Authorization Checks:
    - User must be responder with active (non-offline) profile.
    - Supplied mission_id must exist, have mission_type == deliver_resource,
      belong to authenticated responder, match requirement.hub_id, and be in assigned/accepted/in_progress.
    Atomicity:
    - Row-locks requirement and hub_resources.
    - Updates inventory and fulfillment.
    - Derives shortfall and status.
    - Logs audit events and commits.
    """
    if actor_user.role != UserRole.responder:
        raise HTTPException(status_code=403, detail="Only responders can submit resource deliveries")

    # 1. Fetch & verify active responder profile
    resp_res = await db.execute(select(Responder).where(Responder.user_id == actor_user.id))
    responder = resp_res.scalar_one_or_none()

    if not responder:
        raise HTTPException(status_code=403, detail="Authenticated user has no associated responder profile")

    if responder.status == ResponderStatus.offline:
        raise HTTPException(status_code=403, detail="Responder profile is OFFLINE and cannot deliver resources")

    # 2. Lock and fetch requirement
    req_stmt = select(ResourceRequirement).where(ResourceRequirement.id == requirement_id).with_for_update()
    req_res = await db.execute(req_stmt)
    req = req_res.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=404, detail="Resource Requirement not found")

    if req.status in [RequirementStatus.fulfilled, RequirementStatus.cancelled]:
        raise HTTPException(status_code=400, detail=f"Cannot deliver to a requirement that is already {req.status.value}")

    # 3. Strict Mission Authorization Verification
    m_stmt = select(Mission).where(Mission.id == payload.mission_id)
    m_res = await db.execute(m_stmt)
    mission = m_res.scalar_one_or_none()

    if not mission:
        raise HTTPException(status_code=403, detail="Supplied mission ID does not exist")

    if mission.mission_type != MissionType.deliver_resource:
        raise HTTPException(status_code=403, detail="Supplied mission is not a deliver_resource mission")

    if mission.responder_id != responder.id:
        raise HTTPException(status_code=403, detail="Mission is not assigned to the authenticated responder")

    if mission.hub_id != req.hub_id:
        raise HTTPException(status_code=403, detail="Mission hub does not match requirement hub")

    valid_statuses = [MissionStatus.assigned, MissionStatus.accepted, MissionStatus.in_progress]
    if mission.status not in valid_statuses:
        raise HTTPException(
            status_code=403,
            detail=f"Mission status '{mission.status.value}' is not active/eligible for delivery",
        )

    # 4. Lock & update hub_resources inventory
    res_stmt = (
        select(HubResource)
        .where(HubResource.hub_id == req.hub_id, HubResource.resource_type == req.resource_type)
        .with_for_update()
    )
    res_q = await db.execute(res_stmt)
    hub_res = res_q.scalar_one_or_none()

    if not hub_res:
        # Initialize inventory row if missing
        hub_res = HubResource(
            hub_id=req.hub_id,
            resource_type=req.resource_type,
            current_quantity=0.0,
            unit=req.unit,
            critical_threshold=100.0,
        )
        db.add(hub_res)
        await db.flush()

    # 5. Check delivery quantity against remaining shortfall
    new_fulfilled = req.fulfilled_quantity + payload.quantity
    if new_fulfilled > req.required_quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Delivered quantity ({payload.quantity}) exceeds remaining shortfall ({req.shortfall_quantity})",
        )

    old_req_values = {
        "fulfilled_quantity": req.fulfilled_quantity,
        "shortfall_quantity": req.shortfall_quantity,
        "status": req.status.value,
    }
    old_inv_quantity = hub_res.current_quantity

    # Update atomic values
    req.fulfilled_quantity = new_fulfilled
    req.shortfall_quantity = max(0.0, req.required_quantity - req.fulfilled_quantity)
    hub_res.current_quantity += payload.quantity

    # Derive requirement status
    if req.shortfall_quantity == 0.0:
        req.status = RequirementStatus.fulfilled
    else:
        req.status = RequirementStatus.in_transit

    # Audit logging
    await log_resource_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_RESOURCE_DELIVERED",
        entity_type="hub_resources",
        entity_id=hub_res.id,
        old_values={"current_quantity": old_inv_quantity},
        new_values={
            "current_quantity": hub_res.current_quantity,
            "delivered_quantity": payload.quantity,
            "mission_id": mission.id,
        },
    )

    req_action = "RESOURCE_REQUIREMENT_FULFILLED" if req.status == RequirementStatus.fulfilled else "RESOURCE_REQUIREMENT_UPDATED"
    await log_resource_audit(
        db,
        actor_id=actor_user.id,
        action=req_action,
        entity_type="resource_requirements",
        entity_id=req.id,
        old_values=old_req_values,
        new_values={
            "fulfilled_quantity": req.fulfilled_quantity,
            "shortfall_quantity": req.shortfall_quantity,
            "status": req.status.value,
            "delivered_quantity": payload.quantity,
        },
    )

    await sync_campaigns_for_requirement(db, req.id, req.status, actor_user.id)

    await db.commit()
    await db.refresh(req)
    return enrich_requirement_dict(req)


# ─── Dynamic Critical Flags Calculation ──────────────────────────────────────

async def compute_hub_critical_flags(db: AsyncSession, hub_id: int) -> Dict[str, bool]:
    """
    Computes food_critical, water_critical, and medical_critical for HubOut.
    Rule:
    If hub_resources row exists: critical = (current_quantity < critical_threshold).
    If hub_resources row DOES NOT exist: treat current_quantity as 0.0.
    Since 0.0 < threshold (default threshold >= 0.20 / 100), critical = True!
    """
    result = await db.execute(select(HubResource).where(HubResource.hub_id == hub_id))
    resources = {r.resource_type: r for r in result.scalars().all()}

    def check_critical(rtype: ResourceType) -> bool:
        if rtype in resources:
            r = resources[rtype]
            return r.current_quantity < r.critical_threshold
        # If uninitialized, treat quantity as 0.0 -> Critical = True
        return True

    return {
        "food_critical": check_critical(ResourceType.food),
        "water_critical": check_critical(ResourceType.water),
        "medical_critical": check_critical(ResourceType.medical),
    }
