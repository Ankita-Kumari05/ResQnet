"""
ResQnet Missions Service (Step 6.5)
Implements transactional mission lifecycle state transitions, responder eligibility,
audit logging, and data integrity guarantees.
"""
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    ConflictException,
)
from app.db.models import (
    Mission,
    MissionStatus,
    MissionType,
    Responder,
    ResponderStatus,
    ReportCluster,
    ReportClusterStatus,
    Road,
    SafetyHub,
    AuditLog,
    User,
    UserRole,
)
from app.core.audit import write_audit_log
from app.modules.missions.schemas import MissionCreate, MissionReassign, MissionActionNotes


async def get_responder_by_user_id(db: AsyncSession, user_id: int) -> Optional[Responder]:
    """Resolves the Responder profile associated with a User ID."""
    result = await db.execute(select(Responder).where(Responder.user_id == user_id))
    return result.scalar_one_or_none()


async def log_mission_audit(
    db: AsyncSession,
    actor_id: int,
    action: str,
    mission_id: int,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
) -> AuditLog:
    """Delegates to unified write_audit_log utility."""
    return await write_audit_log(
        db=db,
        actor_id=actor_id,
        action=action,
        entity_type="missions",
        entity_id=mission_id,
        old_values=old_values,
        new_values=new_values,
    )


async def create_mission_service(
    db: AsyncSession,
    payload: MissionCreate,
    actor_user: User,
) -> Mission:
    """
    Creates a new operational dispatch mission in ASSIGNED state.
    - Validates target context according to mission type.
    - Validates responder existence and operational eligibility.
    - Preserves unverified report status and does not mutate ground truth.
    """
    target_lat = payload.target_lat
    target_lng = payload.target_lng

    # 1. Target Validation per Mission Type
    if payload.mission_type == MissionType.verify_incident:
        if not payload.cluster_id:
            raise BadRequestException(
                message="Mission of type 'verify_incident' requires a valid 'cluster_id'.",
                code="CLUSTER_REQUIRED_FOR_INCIDENT_MISSION",
            )
        cluster = await db.get(ReportCluster, payload.cluster_id)
        if not cluster:
            raise NotFoundException(f"Report cluster with ID {payload.cluster_id} not found")
        # Default mission target to cluster centroid if not explicitly provided
        if target_lat is None:
            target_lat = cluster.centroid_lat
        if target_lng is None:
            target_lng = cluster.centroid_lng
        # Update cluster state to mission_assigned if currently open
        if cluster.status == ReportClusterStatus.open:
            cluster.status = ReportClusterStatus.mission_assigned

    elif payload.mission_type == MissionType.survey_road:
        if not payload.road_id:
            raise BadRequestException(
                message="Mission of type 'survey_road' requires an authoritative 'road_id'.",
                code="ROAD_REQUIRED_FOR_ROAD_MISSION",
            )
        road = await db.get(Road, payload.road_id)
        if not road:
            raise NotFoundException(f"Road with ID {payload.road_id} not found")

    elif payload.mission_type == MissionType.deliver_resource:
        if payload.hub_id:
            hub = await db.get(SafetyHub, payload.hub_id)
            if not hub:
                raise NotFoundException(f"Safety Hub with ID {payload.hub_id} not found")

    # 2. Responder Validation & Eligibility
    if payload.responder_id is not None:
        responder = await db.get(Responder, payload.responder_id)
        if not responder:
            raise NotFoundException(f"Responder with ID {payload.responder_id} not found")
        if responder.verification_status and responder.verification_status != "verified":
            raise BadRequestException(
                message=f"Responder #{responder.id} is NOT VERIFIED (status: {responder.verification_status}) and cannot be deployed.",
                code="RESPONDER_NOT_VERIFIED",
            )
        if responder.status == ResponderStatus.offline:
            raise BadRequestException(
                message=f"Responder #{responder.id} is OFFLINE and cannot receive new mission assignments.",
                code="RESPONDER_OFFLINE",
            )
        if responder.status == ResponderStatus.on_mission:
            raise BadRequestException(
                message=f"Responder #{responder.id} is already ON_MISSION and cannot be assigned concurrently.",
                code="RESPONDER_ALREADY_ON_MISSION",
            )

    # 3. Geometry Construction
    geom_wkt = None
    if target_lat is not None and target_lng is not None:
        geom_wkt = f"SRID=4326;POINT({target_lng} {target_lat})"

    # 4. Instantiate Mission in ASSIGNED state
    mission = Mission(
        mission_type=payload.mission_type,
        status=MissionStatus.assigned,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        responder_id=payload.responder_id,
        cluster_id=payload.cluster_id,
        road_id=payload.road_id,
        hub_id=payload.hub_id,
        target_lat=target_lat,
        target_lng=target_lng,
        geom=geom_wkt,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(mission)
    await db.flush()

    # 5. Audit Record
    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_CREATED",
        mission_id=mission.id,
        new_values={
            "mission_type": mission.mission_type.value,
            "status": mission.status.value,
            "responder_id": mission.responder_id,
            "cluster_id": mission.cluster_id,
            "road_id": mission.road_id,
        },
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def accept_mission_service(
    db: AsyncSession,
    mission_id: int,
    actor_user: User,
) -> Mission:
    """
    Responder accepts an ASSIGNED mission (ASSIGNED -> ACCEPTED).
    Updates responder status to DEPLOYED.
    """
    responder = await get_responder_by_user_id(db, actor_user.id)
    if not responder:
        raise ForbiddenException("Authenticated user has no associated responder profile.")

    # Lock mission row to prevent concurrent race conditions
    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if mission.responder_id != responder.id:
        raise ForbiddenException(
            message="You cannot accept a mission that is not assigned to your responder profile.",
            code="MISSION_NOT_ASSIGNED_TO_CALLER",
        )

    if mission.status != MissionStatus.assigned:
        raise ConflictException(
            message=f"Cannot accept mission in state '{mission.status.value}'. Must be in ASSIGNED state.",
            code="INVALID_STATE_TRANSITION",
        )

    old_status = mission.status.value
    mission.status = MissionStatus.accepted
    mission.accepted_at = datetime.now(timezone.utc)
    responder.status = ResponderStatus.deployed

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_ACCEPTED",
        mission_id=mission.id,
        old_values={"status": old_status},
        new_values={"status": mission.status.value, "responder_status": responder.status.value},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def reject_mission_service(
    db: AsyncSession,
    mission_id: int,
    actor_user: User,
    payload: Optional[MissionActionNotes] = None,
) -> Mission:
    """
    Responder rejects an ASSIGNED mission (ASSIGNED -> REJECTED).
    """
    responder = await get_responder_by_user_id(db, actor_user.id)
    if not responder:
        raise ForbiddenException("Authenticated user has no associated responder profile.")

    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if mission.responder_id != responder.id:
        raise ForbiddenException(
            message="You cannot reject a mission that is not assigned to your responder profile.",
            code="MISSION_NOT_ASSIGNED_TO_CALLER",
        )

    if mission.status != MissionStatus.assigned:
        raise ConflictException(
            message=f"Cannot reject mission in state '{mission.status.value}'. Must be in ASSIGNED state.",
            code="INVALID_STATE_TRANSITION",
        )

    old_status = mission.status.value
    mission.status = MissionStatus.rejected
    if payload and payload.notes:
        rejection_note = f"[Rejection Reason]: {payload.notes.strip()}"
        mission.notes = f"{mission.notes}\n{rejection_note}" if mission.notes else rejection_note

    # Reset responder to available if appropriate
    responder.status = ResponderStatus.available

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_REJECTED",
        mission_id=mission.id,
        old_values={"status": old_status},
        new_values={"status": mission.status.value, "notes": mission.notes},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def start_mission_service(
    db: AsyncSession,
    mission_id: int,
    actor_user: User,
) -> Mission:
    """
    Responder begins an accepted mission (ACCEPTED -> IN_PROGRESS).
    Updates responder status to ON_MISSION.
    """
    responder = await get_responder_by_user_id(db, actor_user.id)
    if not responder:
        raise ForbiddenException("Authenticated user has no associated responder profile.")

    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if mission.responder_id != responder.id:
        raise ForbiddenException(
            message="You cannot start a mission that is not assigned to your responder profile.",
            code="MISSION_NOT_ASSIGNED_TO_CALLER",
        )

    if mission.status != MissionStatus.accepted:
        raise ConflictException(
            message=f"Cannot start mission in state '{mission.status.value}'. Must be in ACCEPTED state.",
            code="INVALID_STATE_TRANSITION",
        )

    old_status = mission.status.value
    mission.status = MissionStatus.in_progress
    responder.status = ResponderStatus.on_mission

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_STARTED",
        mission_id=mission.id,
        old_values={"status": old_status},
        new_values={"status": mission.status.value, "responder_status": responder.status.value},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def complete_mission_service(
    db: AsyncSession,
    mission_id: int,
    actor_user: User,
    payload: Optional[MissionActionNotes] = None,
) -> Mission:
    """
    Responder completes an in-progress mission (IN_PROGRESS -> COMPLETED).
    NOTE: Mission completion represents conclusion of field activity.
    It does NOT verify ground truth (which strictly requires Step 6.6 Field Surveys).
    """
    responder = await get_responder_by_user_id(db, actor_user.id)
    if not responder:
        raise ForbiddenException("Authenticated user has no associated responder profile.")

    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if mission.responder_id != responder.id:
        raise ForbiddenException(
            message="You cannot complete a mission that is not assigned to your responder profile.",
            code="MISSION_NOT_ASSIGNED_TO_CALLER",
        )

    if mission.status != MissionStatus.in_progress:
        raise ConflictException(
            message=f"Cannot complete mission in state '{mission.status.value}'. Must be in IN_PROGRESS state.",
            code="INVALID_STATE_TRANSITION",
        )

    old_status = mission.status.value
    mission.status = MissionStatus.completed
    mission.completed_at = datetime.now(timezone.utc)
    if payload and payload.notes:
        completion_note = f"[Completion Notes]: {payload.notes.strip()}"
        mission.notes = f"{mission.notes}\n{completion_note}" if mission.notes else completion_note

    responder.status = ResponderStatus.available

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_COMPLETED",
        mission_id=mission.id,
        old_values={"status": old_status},
        new_values={"status": mission.status.value, "completed_at": mission.completed_at.isoformat()},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def cancel_mission_service(
    db: AsyncSession,
    mission_id: int,
    actor_user: User,
    payload: Optional[MissionActionNotes] = None,
) -> Mission:
    """
    Coordinator cancels a mission (IN_PROGRESS -> CANCELLED, or ASSIGNED/ACCEPTED -> CANCELLED).
    Terminal states (COMPLETED, REJECTED, CANCELLED) cannot be cancelled.
    """
    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    terminal_statuses = {MissionStatus.completed, MissionStatus.rejected, MissionStatus.cancelled}
    if mission.status in terminal_statuses:
        raise ConflictException(
            message=f"Cannot cancel a mission in terminal state '{mission.status.value}'.",
            code="INVALID_STATE_TRANSITION",
        )

    old_status = mission.status.value
    mission.status = MissionStatus.cancelled
    if payload and payload.notes:
        cancellation_note = f"[Cancellation Reason]: {payload.notes.strip()}"
        mission.notes = f"{mission.notes}\n{cancellation_note}" if mission.notes else cancellation_note

    # Reset responder to available if they were deployed/on_mission on this mission
    if mission.responder_id:
        responder = await db.get(Responder, mission.responder_id)
        if responder and responder.status in {ResponderStatus.deployed, ResponderStatus.on_mission}:
            responder.status = ResponderStatus.available

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_CANCELLED",
        mission_id=mission.id,
        old_values={"status": old_status},
        new_values={"status": mission.status.value, "notes": mission.notes},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission


async def reassign_mission_service(
    db: AsyncSession,
    mission_id: int,
    payload: MissionReassign,
    actor_user: User,
) -> Mission:
    """
    Coordinator reassigns an ASSIGNED or REJECTED mission to another responder.
    """
    query = select(Mission).where(Mission.id == mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if mission.status not in {MissionStatus.assigned, MissionStatus.rejected}:
        raise ConflictException(
            message=f"Cannot reassign mission in state '{mission.status.value}'. Only ASSIGNED or REJECTED missions can be reassigned.",
            code="INVALID_STATE_TRANSITION",
        )

    new_responder = await db.get(Responder, payload.responder_id)
    if not new_responder:
        raise NotFoundException(f"Responder with ID {payload.responder_id} not found")

    if new_responder.verification_status and new_responder.verification_status != "verified":
        raise BadRequestException(
            message=f"Responder #{new_responder.id} is NOT VERIFIED (status: {new_responder.verification_status}) and cannot receive assignments.",
            code="RESPONDER_NOT_VERIFIED",
        )
    if new_responder.status == ResponderStatus.offline:
        raise BadRequestException(
            message=f"Responder #{new_responder.id} is OFFLINE and cannot receive assignments.",
            code="RESPONDER_OFFLINE",
        )

    old_responder_id = mission.responder_id
    old_status = mission.status.value

    mission.responder_id = new_responder.id
    mission.status = MissionStatus.assigned  # Reset to assigned for the new responder to accept
    if payload.notes:
        reassign_note = f"[Reassignment]: {payload.notes.strip()}"
        mission.notes = f"{mission.notes}\n{reassign_note}" if mission.notes else reassign_note

    await log_mission_audit(
        db=db,
        actor_id=actor_user.id,
        action="MISSION_REASSIGNED",
        mission_id=mission.id,
        old_values={"responder_id": old_responder_id, "status": old_status},
        new_values={"responder_id": new_responder.id, "status": mission.status.value},
    )

    try:
        await db.commit()
        await db.refresh(mission)
    except Exception:
        await db.rollback()
        raise

    return mission
