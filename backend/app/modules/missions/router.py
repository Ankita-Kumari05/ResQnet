"""
ResQnet Missions Router (Step 6.5)
Exposes REST endpoints for operational responder dispatch missions, state transitions, and audit tracking.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    User,
    UserRole,
    Mission,
    MissionStatus,
    MissionType,
    Responder,
)
from app.modules.auth.router import get_current_user, require_role, require_roles
from app.core.exceptions import NotFoundException, ForbiddenException
from app.modules.missions.schemas import (
    MissionCreate,
    MissionReassign,
    MissionActionNotes,
    MissionResponse,
    ResponderDirectoryItem,
)
from app.modules.missions.service import (
    get_responder_by_user_id,
    create_mission_service,
    accept_mission_service,
    reject_mission_service,
    start_mission_service,
    complete_mission_service,
    cancel_mission_service,
    reassign_mission_service,
)

router = APIRouter(prefix="/missions", tags=["Missions"])


@router.post(
    "",
    response_model=MissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new operational mission (Coordinator only)",
)
async def create_mission(
    payload: MissionCreate,
    current_user: User = Depends(require_role(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates an operational field mission associated with an incident cluster, road, or safety hub.
    - Initial status is strictly ASSIGNED.
    - Coordinator role required.
    """
    mission = await create_mission_service(db=db, payload=payload, actor_user=current_user)
    return MissionResponse.model_validate(mission)


@router.get(
    "",
    response_model=List[MissionResponse],
    summary="List missions (Coordinator: all, Responder: assigned only)",
)
async def list_missions(
    status_filter: Optional[MissionStatus] = Query(None, alias="status"),
    mission_type: Optional[MissionType] = Query(None, alias="type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists operational missions.
    - Coordinators can view all operational missions.
    - Responders can view only missions assigned to their responder profile.
    - Citizens and fundraisers are forbidden (403).
    """
    query = select(Mission).order_by(Mission.created_at.desc())

    if current_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, current_user.id)
        if not responder:
            return []
        query = query.where(Mission.responder_id == responder.id)

    if status_filter:
        query = query.where(Mission.status == status_filter)
    if mission_type:
        query = query.where(Mission.mission_type == mission_type)

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    missions = result.scalars().all()
    return [MissionResponse.model_validate(m) for m in missions]


@router.get(
    "/responders",
    response_model=List[ResponderDirectoryItem],
    summary="List all responders for dispatch (Coordinator only)",
)
async def list_responders(
    current_user: User = Depends(require_role(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists all registered responders and their operational status.
    Strictly restricted to coordinators for mission assignment.
    """
    stmt = (
        select(Responder, User.full_name)
        .join(User, Responder.user_id == User.id)
        .order_by(Responder.id)
    )
    result = await db.execute(stmt)
    items = []
    for responder, full_name in result.all():
        items.append(
            ResponderDirectoryItem(
                id=responder.id,
                user_id=responder.user_id,
                full_name=full_name,
                ngo_name=responder.ngo_name,
                status=responder.status,
                verification_status=getattr(responder, "verification_status", "verified") or "verified",
            )
        )
    return items


@router.get(
    "/{mission_id}",
    response_model=MissionResponse,
    summary="Get mission detail by ID",
)
async def get_mission(
    mission_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves detail of a specific mission.
    - Coordinators can view any mission.
    - Responders can only view missions assigned to them.
    """
    mission = await db.get(Mission, mission_id)
    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if current_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, current_user.id)
        if not responder or mission.responder_id != responder.id:
            raise ForbiddenException("You are not authorized to view this mission.")

    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/accept",
    response_model=MissionResponse,
    summary="Accept an assigned mission (Assigned Responder only)",
)
async def accept_mission(
    mission_id: int,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Transitions mission from ASSIGNED to ACCEPTED."""
    mission = await accept_mission_service(db=db, mission_id=mission_id, actor_user=current_user)
    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/reject",
    response_model=MissionResponse,
    summary="Reject an assigned mission (Assigned Responder only)",
)
async def reject_mission(
    mission_id: int,
    payload: Optional[MissionActionNotes] = None,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Transitions mission from ASSIGNED to REJECTED."""
    mission = await reject_mission_service(
        db=db, mission_id=mission_id, actor_user=current_user, payload=payload
    )
    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/start",
    response_model=MissionResponse,
    summary="Start an accepted mission (Assigned Responder only)",
)
async def start_mission(
    mission_id: int,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Transitions mission from ACCEPTED to IN_PROGRESS."""
    mission = await start_mission_service(db=db, mission_id=mission_id, actor_user=current_user)
    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/complete",
    response_model=MissionResponse,
    summary="Complete an in-progress mission (Assigned Responder only)",
)
async def complete_mission(
    mission_id: int,
    payload: Optional[MissionActionNotes] = None,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Transitions mission from IN_PROGRESS to COMPLETED.
    Note: Mission completion represents field activity conclusion. It does NOT verify ground truth.
    """
    mission = await complete_mission_service(
        db=db, mission_id=mission_id, actor_user=current_user, payload=payload
    )
    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/cancel",
    response_model=MissionResponse,
    summary="Cancel an in-progress or assigned mission (Coordinator only)",
)
async def cancel_mission(
    mission_id: int,
    payload: Optional[MissionActionNotes] = None,
    current_user: User = Depends(require_role(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Transitions mission to CANCELLED. Coordinator only."""
    mission = await cancel_mission_service(
        db=db, mission_id=mission_id, actor_user=current_user, payload=payload
    )
    return MissionResponse.model_validate(mission)


@router.post(
    "/{mission_id}/reassign",
    response_model=MissionResponse,
    summary="Reassign an assigned or rejected mission (Coordinator only)",
)
async def reassign_mission(
    mission_id: int,
    payload: MissionReassign,
    current_user: User = Depends(require_role(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """Reassigns mission to a new eligible responder. Coordinator only."""
    mission = await reassign_mission_service(
        db=db, mission_id=mission_id, payload=payload, actor_user=current_user
    )
    return MissionResponse.model_validate(mission)


@router.get(
    "/responders/me",
    response_model=ResponderDirectoryItem,
    summary="Get current responder profile and status (Responder only)",
)
async def get_responder_me(
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves authenticated responder profile and single-source status."""
    responder = await get_responder_by_user_id(db, current_user.id)
    if not responder:
        raise NotFoundException("No responder profile associated with authenticated user.")
    return ResponderDirectoryItem(
        id=responder.id,
        user_id=responder.user_id,
        full_name=current_user.full_name,
        ngo_name=responder.ngo_name,
        status=responder.status,
        verification_status=getattr(responder, "verification_status", "verified") or "verified",
    )


@router.post(
    "/responders/status",
    response_model=ResponderDirectoryItem,
    summary="Update responder operational status (Responder only)",
)
async def update_responder_status(
    status_update: dict,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Updates authenticated responder duty status (available, deployed, on_mission, offline)."""
    responder = await get_responder_by_user_id(db, current_user.id)
    if not responder:
        raise NotFoundException("No responder profile associated with authenticated user.")

    req_status = status_update.get("status")
    if not req_status:
        raise BadRequestException("Field 'status' is required.")

    try:
        from app.db.models import ResponderStatus
        new_status = ResponderStatus(req_status)
    except Exception:
        raise BadRequestException(f"Invalid responder status '{req_status}'.")

    responder.status = new_status
    await db.commit()
    await db.refresh(responder)

    return ResponderDirectoryItem(
        id=responder.id,
        user_id=responder.user_id,
        full_name=current_user.full_name,
        ngo_name=responder.ngo_name,
        status=responder.status,
        verification_status=getattr(responder, "verification_status", "verified") or "verified",
    )

