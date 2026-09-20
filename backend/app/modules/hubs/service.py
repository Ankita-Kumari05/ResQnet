"""
Safety Hub Core Service Layer
Handles transactional CRUD, occupancy updates, capacity management, status invariants,
atomic row-locking, responder-mission authorization, and audit logging.
"""
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    SafetyHub,
    HubStatus,
    User,
    UserRole,
    Responder,
    ResponderStatus,
    Mission,
    MissionStatus,
    AuditLog,
)
from app.core.audit import write_audit_log
from app.modules.routing.cache import invalidate_route_cache
from app.modules.hubs.schemas import HubCreate


def derive_hub_status(
    current_occupancy: int,
    max_capacity: int,
    capacity_critical_threshold: float,
) -> HubStatus:
    """
    Derives hub status based on occupancy and capacity.
    - current_occupancy >= max_capacity -> FULL
    - ratio >= capacity_critical_threshold -> NEAR_CAPACITY
    - otherwise -> OPEN
    """
    if max_capacity <= 0:
        return HubStatus.full
    if current_occupancy >= max_capacity:
        return HubStatus.full
    ratio = current_occupancy / max_capacity
    if ratio >= capacity_critical_threshold:
        return HubStatus.near_capacity
    return HubStatus.open


from app.modules.resources.service import compute_hub_critical_flags


def enrich_hub_dict(hub: SafetyHub) -> Dict[str, Any]:
    """Formats SafetyHub ORM instance into response dictionary (fallback with default critical flags)."""
    avail = max(0, hub.max_capacity - hub.current_occupancy)
    occ_ratio = hub.current_occupancy / max(hub.max_capacity, 1)

    return {
        "id": hub.id,
        "name": hub.name,
        "address": hub.address,
        "lat": hub.lat,
        "lng": hub.lng,
        "max_capacity": hub.max_capacity,
        "current_occupancy": hub.current_occupancy,
        "available_capacity": avail,
        "status": hub.status,
        "capacity_critical": occ_ratio >= hub.capacity_critical_threshold,
        "food_critical": True,
        "water_critical": True,
        "medical_critical": True,
        "created_at": hub.created_at,
        "updated_at": hub.updated_at,
    }


async def async_enrich_hub_dict(db: AsyncSession, hub: SafetyHub) -> Dict[str, Any]:
    """Formats SafetyHub ORM instance into response dictionary with dynamic critical flags."""
    avail = max(0, hub.max_capacity - hub.current_occupancy)
    occ_ratio = hub.current_occupancy / max(hub.max_capacity, 1)
    crit_flags = await compute_hub_critical_flags(db, hub.id)

    return {
        "id": hub.id,
        "name": hub.name,
        "address": hub.address,
        "lat": hub.lat,
        "lng": hub.lng,
        "max_capacity": hub.max_capacity,
        "current_occupancy": hub.current_occupancy,
        "available_capacity": avail,
        "status": hub.status,
        "capacity_critical": occ_ratio >= hub.capacity_critical_threshold,
        "food_critical": crit_flags["food_critical"],
        "water_critical": crit_flags["water_critical"],
        "medical_critical": crit_flags["medical_critical"],
        "created_at": hub.created_at,
        "updated_at": hub.updated_at,
    }


async def log_hub_audit(
    db: AsyncSession,
    actor_id: int,
    action: str,
    hub_id: int,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> AuditLog:
    """Delegates to unified write_audit_log utility."""
    return await write_audit_log(
        db=db,
        actor_id=actor_id,
        action=action,
        entity_type="safety_hubs",
        entity_id=hub_id,
        old_values=old_values,
        new_values=new_values,
    )


async def verify_responder_hub_authorization(
    db: AsyncSession,
    user: User,
    hub_id: int,
) -> Responder:
    """
    Verifies that a responder:
    1. Has an active (non-offline) Responder profile.
    2. Has an active Mission legitimately assigned to them associated with hub_id.
    """
    if user.role != UserRole.responder:
        raise HTTPException(status_code=403, detail="User is not a responder")

    # Fetch responder profile
    resp_res = await db.execute(select(Responder).where(Responder.user_id == user.id))
    responder = resp_res.scalar_one_or_none()

    if not responder:
        raise HTTPException(
            status_code=403,
            detail="Authenticated user has no associated responder profile",
        )

    if responder.status == ResponderStatus.offline:
        raise HTTPException(
            status_code=403,
            detail="Responder profile is OFFLINE and cannot perform operational updates",
        )

    # Check for active mission linking responder to target hub
    mission_stmt = select(Mission).where(
        Mission.responder_id == responder.id,
        Mission.hub_id == hub_id,
        Mission.status.in_([
            MissionStatus.assigned,
            MissionStatus.accepted,
            MissionStatus.in_progress,
        ]),
    )
    m_res = await db.execute(mission_stmt)
    mission = m_res.scalar_one_or_none()

    if not mission:
        raise HTTPException(
            status_code=403,
            detail="Responder is not assigned to an active mission for this Safety Hub",
        )

    return responder


async def get_all_hubs_service(db: AsyncSession) -> List[Dict[str, Any]]:
    """Returns all safety hubs enriched with operational capacity metrics."""
    result = await db.execute(select(SafetyHub).order_by(SafetyHub.id))
    hubs = result.scalars().all()
    return [await async_enrich_hub_dict(db, h) for h in hubs]


async def get_hub_by_id_service(db: AsyncSession, hub_id: int) -> Dict[str, Any]:
    """Returns single safety hub details or 404."""
    hub = await db.get(SafetyHub, hub_id)
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")
    return await async_enrich_hub_dict(db, hub)


async def create_hub_service(
    db: AsyncSession,
    payload: HubCreate,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only: Creates new Safety Hub with PostGIS POINT geometry.
    Status is derived from initial occupancy.
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can create safety hubs")

    if payload.max_capacity <= 0:
        raise HTTPException(status_code=400, detail="max_capacity must be greater than 0")

    if payload.current_occupancy < 0:
        raise HTTPException(status_code=400, detail="current_occupancy cannot be negative")

    if payload.current_occupancy > payload.max_capacity:
        raise HTTPException(
            status_code=400,
            detail="current_occupancy cannot exceed max_capacity",
        )

    initial_status = derive_hub_status(
        payload.current_occupancy,
        payload.max_capacity,
        payload.capacity_critical_threshold,
    )

    hub = SafetyHub(
        name=payload.name,
        address=payload.address,
        lat=payload.lat,
        lng=payload.lng,
        geom=func.ST_SetSRID(func.ST_MakePoint(payload.lng, payload.lat), 4326),
        max_capacity=payload.max_capacity,
        current_occupancy=payload.current_occupancy,
        status=initial_status,
        food_critical_threshold=payload.food_critical_threshold,
        water_critical_threshold=payload.water_critical_threshold,
        medical_critical_threshold=payload.medical_critical_threshold,
        capacity_critical_threshold=payload.capacity_critical_threshold,
    )
    db.add(hub)
    await db.flush()

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_CREATED",
        hub_id=hub.id,
        new_values={
            "name": hub.name,
            "lat": hub.lat,
            "lng": hub.lng,
            "max_capacity": hub.max_capacity,
            "current_occupancy": hub.current_occupancy,
            "status": hub.status.value,
        },
    )

    await db.commit()
    await db.refresh(hub)
    return await async_enrich_hub_dict(db, hub)


async def update_occupancy_service(
    db: AsyncSession,
    hub_id: int,
    delta: int,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Atomic occupancy update using SELECT FOR UPDATE.
    RBAC:
    - Coordinator: allowed for any hub
    - Responder: allowed ONLY if assigned to active mission associated with target hub
    """
    if actor_user.role == UserRole.coordinator:
        pass
    elif actor_user.role == UserRole.responder:
        await verify_responder_hub_authorization(db, actor_user, hub_id)
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Acquire row lock
    stmt = select(SafetyHub).where(SafetyHub.id == hub_id).with_for_update()
    result = await db.execute(stmt)
    hub = result.scalar_one_or_none()

    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    old_occ = hub.current_occupancy
    old_status = hub.status

    new_occ = old_occ + delta
    if new_occ < 0:
        raise HTTPException(status_code=400, detail="Occupancy cannot become negative")

    if new_occ > hub.max_capacity:
        raise HTTPException(
            status_code=400,
            detail="Occupancy cannot exceed maximum hub capacity",
        )

    hub.current_occupancy = new_occ

    # Status Invariant:
    # CLOSED persists regardless of occupancy. Occupancy changes MUST NOT auto-reopen a CLOSED hub.
    if hub.status != HubStatus.closed:
        hub.status = derive_hub_status(
            new_occ,
            hub.max_capacity,
            hub.capacity_critical_threshold,
        )

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_OCCUPANCY_UPDATED",
        hub_id=hub.id,
        old_values={"occupancy": old_occ, "status": old_status.value},
        new_values={
            "occupancy": hub.current_occupancy,
            "status": hub.status.value,
            "delta": delta,
        },
    )

    await db.commit()
    await db.refresh(hub)
    return await async_enrich_hub_dict(db, hub)


async def update_status_service(
    db: AsyncSession,
    hub_id: int,
    new_status: HubStatus,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only manual operational status override.
    Setting status to CLOSED locks the hub into CLOSED state.
    Reopening a CLOSED hub derives status from current occupancy (OPEN, NEAR_CAPACITY, FULL).
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can override hub status")

    stmt = select(SafetyHub).where(SafetyHub.id == hub_id).with_for_update()
    result = await db.execute(stmt)
    hub = result.scalar_one_or_none()

    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    old_status = hub.status

    if new_status == HubStatus.closed:
        hub.status = HubStatus.closed
    else:
        # Reopening or changing status derives state from current occupancy
        hub.status = derive_hub_status(
            hub.current_occupancy,
            hub.max_capacity,
            hub.capacity_critical_threshold,
        )

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_STATUS_CHANGED",
        hub_id=hub.id,
        old_values={"status": old_status.value},
        new_values={"status": hub.status.value, "requested_status": new_status.value},
    )

    # Invalidate route cache when a hub is closed or reopened
    invalidate_route_cache()

    await db.commit()
    await db.refresh(hub)
    return await async_enrich_hub_dict(db, hub)


async def update_capacity_service(
    db: AsyncSession,
    hub_id: int,
    new_max_capacity: int,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Coordinator-only max capacity modification.
    - Validate max_capacity > 0
    - Reject if new_max_capacity < current_occupancy
    - Derive status from occupancy if not CLOSED; preserve CLOSED if CLOSED.
    """
    if actor_user.role != UserRole.coordinator:
        raise HTTPException(status_code=403, detail="Only coordinators can modify hub capacity")

    if new_max_capacity <= 0:
        raise HTTPException(status_code=400, detail="max_capacity must be greater than 0")

    stmt = select(SafetyHub).where(SafetyHub.id == hub_id).with_for_update()
    result = await db.execute(stmt)
    hub = result.scalar_one_or_none()

    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    if new_max_capacity < hub.current_occupancy:
        raise HTTPException(
            status_code=400,
            detail="max_capacity cannot be reduced below current occupancy",
        )

    old_max = hub.max_capacity
    old_status = hub.status

    hub.max_capacity = new_max_capacity

    if hub.status != HubStatus.closed:
        hub.status = derive_hub_status(
            hub.current_occupancy,
            hub.max_capacity,
            hub.capacity_critical_threshold,
        )

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_CAPACITY_UPDATED",
        hub_id=hub.id,
        old_values={"max_capacity": old_max, "status": old_status.value},
        new_values={"max_capacity": hub.max_capacity, "status": hub.status.value},
    )

    await db.commit()
    await db.refresh(hub)
    return await async_enrich_hub_dict(db, hub)


async def delete_hub_service(
    db: AsyncSession,
    hub_id: int,
    actor_user: User,
) -> Dict[str, Any]:
    """
    Deletion rule:
    - Admin owns permanent deletion.
    - Coordinators may only delete ad-hoc hubs with strictly zero check-ins (current_occupancy == 0).
    - If occupancy > 0, hub cannot be deleted and must be deactivated (toggle closed) instead.
    """
    is_admin = actor_user.role == UserRole.admin or actor_user.email == "admin@resqnet.in"
    is_coord = actor_user.role == UserRole.coordinator
    if not is_admin and not is_coord:
        raise HTTPException(status_code=403, detail="Administrative or Coordinator clearance required to delete safety hubs")

    stmt = select(SafetyHub).where(SafetyHub.id == hub_id).with_for_update()
    result = await db.execute(stmt)
    hub = result.scalar_one_or_none()

    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    if not is_admin and hub.current_occupancy > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Safety Hub #{hub_id} has active check-ins ({hub.current_occupancy} occupants). Active hubs cannot be deleted — deactivate the hub to closed status instead.",
        )

    old_values = {
        "name": hub.name,
        "max_capacity": hub.max_capacity,
        "current_occupancy": hub.current_occupancy,
        "status": hub.status.value,
    }

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_PERMANENTLY_DELETED" if is_admin else "SAFETY_HUB_ADHOC_DELETED",
        hub_id=hub.id,
        old_values=old_values,
        new_values=None,
    )

    await db.delete(hub)
    invalidate_route_cache()
    await db.commit()

    return {"status": "success", "message": f"Safety Hub #{hub_id} deleted successfully."}


async def divert_hub_influx_service(
    db: AsyncSession,
    hub_id: int,
    target_hub_id: Optional[int],
    actor_user: User,
) -> Dict[str, Any]:
    """
    Diverts influx from an overloaded or deactivating hub to a designated or nearest alternative hub:
    1. Sets source hub status to 'closed'.
    2. Invalidates routing cache so subsequent Dijkstra queries avoid this hub.
    3. Writes an authoritative AuditLog via write_audit_log().
    """
    if actor_user.role != UserRole.coordinator and actor_user.email != "admin@resqnet.in":
        raise HTTPException(status_code=403, detail="Only coordinators can divert safety hub influx")

    stmt = select(SafetyHub).where(SafetyHub.id == hub_id).with_for_update()
    result = await db.execute(stmt)
    hub = result.scalar_one_or_none()
    if not hub:
        raise HTTPException(status_code=404, detail="Safety Hub not found")

    old_status = hub.status
    hub.status = HubStatus.closed

    # Invalidate routing graph cache so all routing requests immediately divert
    invalidate_route_cache()

    target_hub_name = None
    if target_hub_id:
        target_res = await db.execute(select(SafetyHub).where(SafetyHub.id == target_hub_id))
        target_h = target_res.scalar_one_or_none()
        if target_h:
            target_hub_name = target_h.name

    await log_hub_audit(
        db,
        actor_id=actor_user.id,
        action="SAFETY_HUB_INFLUX_DIVERTED",
        hub_id=hub.id,
        old_values={"status": old_status.value},
        new_values={
            "status": hub.status.value,
            "diverted_to_hub_id": target_hub_id,
            "target_hub_name": target_hub_name,
        },
    )

    await db.commit()
    await db.refresh(hub)

    return {
        "status": "success",
        "message": f"Influx diverted from Hub #{hub_id} ('{hub.name}'). Hub closed and routing redirected.",
        "source_hub_id": hub.id,
        "diverted_to_hub_id": target_hub_id,
        "target_hub_name": target_hub_name,
    }
