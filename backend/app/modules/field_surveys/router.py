"""
ResQnet Field Surveys Router (Step 6.6)
Exposes REST endpoints for responder field survey submission and evidence retrieval.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import (
    User,
    UserRole,
    FieldSurvey,
    Mission,
    Road,
)
from app.modules.auth.router import get_current_user, require_role, require_roles
from app.core.exceptions import NotFoundException, ForbiddenException
from app.modules.field_surveys.schemas import (
    FieldSurveyCreate,
    FieldSurveyResponse,
    GroundTruthPropagationResponse,
)
from app.modules.field_surveys.service import (
    get_responder_by_user_id,
    submit_field_survey_service,
    propagate_field_survey_service,
)

router = APIRouter(tags=["Field Surveys"])


async def _enrich_survey_response(db: AsyncSession, survey: FieldSurvey) -> FieldSurveyResponse:
    """
    Builds FieldSurveyResponse and computes is_propagated by checking if the
    associated road's last_verified_survey_id matches this survey's ID.
    Falls back to False if no road is found or road has not been verified by this survey.
    """
    data = FieldSurveyResponse.model_validate(survey)

    # Determine road_id: prefer survey.road_id, else look at mission.road_id
    target_road_id = survey.road_id
    if target_road_id is None and survey.mission_id:
        mission = await db.get(Mission, survey.mission_id)
        if mission:
            target_road_id = mission.road_id

    if target_road_id is not None:
        road = await db.get(Road, target_road_id)
        if road and road.last_verified_survey_id == survey.id:
            data.is_propagated = True

    return data


@router.post(
    "/field-surveys",
    response_model=FieldSurveyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit responder field survey evidence (Assigned Responder only)",
)
async def submit_field_survey(
    payload: FieldSurveyCreate,
    current_user: User = Depends(require_role(UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Submits a responder physical inspection survey for an active mission.
    - Captures verified physical observations (verification outcome, hazard level, GPS, media URL).
    - Restricted to the assigned responder.
    - Does NOT mutate operational ground truth (reserved for Step 6.7).
    """
    survey = await submit_field_survey_service(db=db, payload=payload, actor_user=current_user)
    return await _enrich_survey_response(db, survey)


@router.post(
    "/field-surveys/{survey_id}/propagate",
    response_model=GroundTruthPropagationResponse,
    status_code=status.HTTP_200_OK,
    summary="Propagate verified field survey outcome into operational ground truth (Step 6.7)",
)
async def propagate_field_survey(
    survey_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Propagates an authorized responder field survey into operational ground truth.
    - Resolves authoritative target road/cluster server-side.
    - Updates road operational state, blockage status, penalties, and confidence scores.
    - Updates cluster and incident report statuses without deleting historical citizen data.
    - Enforces row-level concurrency locking, staleness protection, and idempotency.
    - Emits system audit log records and signals route-cache invalidation.
    """
    result = await propagate_field_survey_service(db=db, survey_id=survey_id, actor_user=current_user)
    return result


@router.get(
    "/field-surveys/{survey_id}",
    response_model=FieldSurveyResponse,
    summary="Get field survey detail by ID",
)
async def get_field_survey(
    survey_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieves a field survey record.
    - Coordinators can view any survey.
    - Responders can view surveys submitted by their responder profile.
    """
    survey = await db.get(FieldSurvey, survey_id)
    if not survey:
        raise NotFoundException(f"Field survey with ID {survey_id} not found")

    if current_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, current_user.id)
        if not responder or survey.responder_id != responder.id:
            raise ForbiddenException("You are not authorized to view this field survey.")

    return await _enrich_survey_response(db, survey)


@router.get(
    "/missions/{mission_id}/field-surveys",
    response_model=List[FieldSurveyResponse],
    summary="List field surveys for a mission",
)
async def list_mission_field_surveys(
    mission_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder)),
    db: AsyncSession = Depends(get_db),
):
    """Lists all field surveys submitted for a specific mission."""
    mission = await db.get(Mission, mission_id)
    if not mission:
        raise NotFoundException(f"Mission with ID {mission_id} not found")

    if current_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, current_user.id)
        if not responder or mission.responder_id != responder.id:
            raise ForbiddenException("You are not authorized to view field surveys for this mission.")

    query = select(FieldSurvey).where(FieldSurvey.mission_id == mission_id).order_by(FieldSurvey.submitted_at.desc())
    result = await db.execute(query)
    surveys = result.scalars().all()
    return [await _enrich_survey_response(db, s) for s in surveys]
