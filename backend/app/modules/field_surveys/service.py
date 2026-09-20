"""
ResQnet Field Survey Service (Step 6.6)
Implements responder field survey evidence capture, mission validation,
audit logging, and data integrity guarantees.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    ConflictException,
)
from app.db.models import (
    FieldSurvey,
    FieldSurveyVerificationOutcome,
    Mission,
    MissionStatus,
    Responder,
    Road,
    RoadStatus,
    ReportCluster,
    ReportClusterStatus,
    IncidentReport,
    ReportStatus,
    HazardZone,
    HazardSeverity,
    AuditLog,
    User,
    UserRole,
)
from app.modules.field_surveys.schemas import (
    FieldSurveyCreate,
    GroundTruthPropagationResponse,
)
from app.modules.routing.cache import invalidate_route_cache


async def get_responder_by_user_id(db: AsyncSession, user_id: int) -> Optional[Responder]:
    """Resolves the Responder profile associated with a User ID."""
    result = await db.execute(select(Responder).where(Responder.user_id == user_id))
    return result.scalar_one_or_none()


async def submit_field_survey_service(
    db: AsyncSession,
    payload: FieldSurveyCreate,
    actor_user: User,
) -> FieldSurvey:
    """
    Submits a responder field survey capturing physical inspection evidence.

    Integrity Rules:
      - Only the assigned responder can submit evidence for their mission.
      - Mission must be in an executable state (ACCEPTED or IN_PROGRESS).
      - Evidence is recorded as observational data; it NEVER directly modifies
        roads.status, hazard_zones, or incident_reports.status (Ground truth is Step 6.7).
      - media_url is preserved as responder evidence.
      - Atomic transaction with audit logging and rollback protection.
    """
    # 1. Resolve Responder Profile
    responder = await get_responder_by_user_id(db, actor_user.id)
    if not responder:
        raise ForbiddenException("Authenticated user has no associated responder profile.")

    # 2. Lock & Validate Mission
    query = select(Mission).where(Mission.id == payload.mission_id).with_for_update()
    result = await db.execute(query)
    mission = result.scalar_one_or_none()

    if not mission:
        raise NotFoundException(f"Mission with ID {payload.mission_id} not found")

    # 3. Ownership Validation
    if mission.responder_id != responder.id:
        raise ForbiddenException(
            message="You cannot submit a field survey for a mission not assigned to your responder profile.",
            code="MISSION_NOT_ASSIGNED_TO_CALLER",
        )

    # 4. Mission State Validation
    executable_states = {MissionStatus.accepted, MissionStatus.in_progress}
    if mission.status not in executable_states:
        raise ConflictException(
            message=f"Cannot submit field survey for mission in state '{mission.status.value}'. "
                    f"Mission must be in ACCEPTED or IN_PROGRESS state.",
            code="INVALID_MISSION_STATE_FOR_SURVEY",
        )

    # 5. Timestamp Validation (no future timestamps)
    if payload.submitted_offline and payload.client_timestamp:
        future_limit = datetime.now(timezone.utc) + timedelta(minutes=5)
        # Handle naive or aware client_timestamp
        client_ts = payload.client_timestamp
        if client_ts.tzinfo is None:
            client_ts = client_ts.replace(tzinfo=timezone.utc)
        if client_ts > future_limit:
            raise BadRequestException(
                message="Client timestamp cannot be in the future.",
                code="INVALID_CLIENT_TIMESTAMP",
            )

    # 6. Construct PostGIS POINT Geometry (lng lat)
    observed_geom = None
    if payload.observed_lat is not None and payload.observed_lng is not None:
        observed_geom = f"SRID=4326;POINT({payload.observed_lng} {payload.observed_lat})"

    # 7. Instantiate FieldSurvey
    survey = FieldSurvey(
        mission_id=mission.id,
        responder_id=responder.id,
        road_id=mission.road_id,
        cluster_id=mission.cluster_id,
        observed_lat=payload.observed_lat,
        observed_lng=payload.observed_lng,
        observed_geom=observed_geom,
        observed_condition=payload.observed_condition.strip() if payload.observed_condition else None,
        road_status=payload.road_status,
        hazard_penalty=payload.hazard_penalty,
        flood_penalty=payload.flood_penalty,
        congestion_penalty=payload.congestion_penalty,
        is_blocked=payload.is_blocked,
        hazard_level=payload.hazard_level,
        verification_outcome=payload.verification_outcome,
        media_url=payload.media_url.strip() if payload.media_url else None,
        notes=payload.notes.strip() if payload.notes else None,
        submitted_offline=payload.submitted_offline,
        client_timestamp=payload.client_timestamp,
    )
    db.add(survey)
    await db.flush()

    # 8. Record Audit Log
    audit = AuditLog(
        actor_id=actor_user.id,
        action="FIELD_SURVEY_SUBMITTED",
        entity_type="field_surveys",
        entity_id=survey.id,
        new_values={
            "mission_id": mission.id,
            "responder_id": responder.id,
            "verification_outcome": survey.verification_outcome.value if survey.verification_outcome else None,
            "hazard_level": survey.hazard_level,
            "media_url": survey.media_url,
            "submitted_offline": survey.submitted_offline,
        },
    )
    db.add(audit)

    # 9. Commit Transaction Safely
    try:
        await db.commit()
        await db.refresh(survey)
    except Exception:
        await db.rollback()
        raise

    return survey


async def propagate_field_survey_service(
    db: AsyncSession,
    survey_id: int,
    actor_user: User,
) -> GroundTruthPropagationResponse:
    """
    Step 6.7 — Propagates an authorized responder field survey into operational ground truth.

    Guarantees:
      - Authorization: Coordinator or survey owner Responder. Citizens/Fundraisers blocked.
      - Authoritative target resolution: Derived server-side from survey/mission context.
      - Concurrency & Row-level locking on FieldSurvey, Road, ReportCluster.
      - Idempotency: Duplicate calls do not re-mutate state or corrupt audit trails.
      - Staleness safety: Older offline surveys cannot overwrite newer verified state.
      - Consistency: road.status and road.is_blocked stay fully synchronized.
      - Route cache invalidation: Invoked on road state/penalty mutation.
      - Historical preservation: Citizen incident reports and clusters are never deleted.
      - Atomic transaction & Audit logging.
    """
    # 1. Authorization check
    if actor_user.role not in (UserRole.responder, UserRole.coordinator):
        raise ForbiddenException("Only authorized responders or coordinators can propagate ground truth.")

    # 2. Lock & Load FieldSurvey
    survey_query = select(FieldSurvey).where(FieldSurvey.id == survey_id).with_for_update()
    survey_result = await db.execute(survey_query)
    survey = survey_result.scalar_one_or_none()

    if not survey:
        raise NotFoundException(f"Field survey with ID {survey_id} not found")

    # If caller is responder, must own the survey
    if actor_user.role == UserRole.responder:
        responder = await get_responder_by_user_id(db, actor_user.id)
        if not responder or survey.responder_id != responder.id:
            raise ForbiddenException(
                message="You are not authorized to propagate a field survey submitted by another responder.",
                code="UNAUTHORIZED_SURVEY_PROPAGATION",
            )

    # Validate verification outcome exists
    if not survey.verification_outcome:
        raise BadRequestException(
            message="Field survey has no verification outcome recorded to propagate.",
            code="MISSING_VERIFICATION_OUTCOME",
        )

    # 3. Resolve Authoritative Targets
    target_road_id = survey.road_id
    target_cluster_id = survey.cluster_id

    if survey.mission_id and (target_road_id is None or target_cluster_id is None):
        mission_query = select(Mission).where(Mission.id == survey.mission_id)
        mission_res = await db.execute(mission_query)
        mission = mission_res.scalar_one_or_none()
        if mission:
            if target_road_id is None:
                target_road_id = mission.road_id
            if target_cluster_id is None:
                target_cluster_id = mission.cluster_id

    # 4. Compute Effective Timestamp for Staleness Protection
    survey_effective_time = (
        survey.client_timestamp
        if (survey.submitted_offline and survey.client_timestamp)
        else survey.submitted_at
    )
    if survey_effective_time and survey_effective_time.tzinfo is None:
        survey_effective_time = survey_effective_time.replace(tzinfo=timezone.utc)
    elif survey_effective_time is None:
        survey_effective_time = datetime.now(timezone.utc)

    # 5. Lock & Load Authoritative Target Road if present
    road: Optional[Road] = None
    if target_road_id is not None:
        road_query = select(Road).where(Road.id == target_road_id).with_for_update()
        road_res = await db.execute(road_query)
        road = road_res.scalar_one_or_none()

    # Fail safely if outcome requires road target but none exists
    if survey.verification_outcome == FieldSurveyVerificationOutcome.road_blocked and not road:
        raise BadRequestException(
            message="No authoritative road target associated with survey or its mission for road_blocked outcome.",
            code="MISSING_AUTHORITATIVE_ROAD_TARGET",
        )

    # 6. Lock & Load Authoritative Target Cluster if present
    cluster: Optional[ReportCluster] = None
    if target_cluster_id is not None:
        cluster_query = select(ReportCluster).where(ReportCluster.id == target_cluster_id).with_for_update()
        cluster_res = await db.execute(cluster_query)
        cluster = cluster_res.scalar_one_or_none()

    # 7. Check Idempotency
    # If the road was already updated by this exact survey
    if road and road.last_verified_survey_id == survey.id:
        return GroundTruthPropagationResponse(
            survey_id=survey.id,
            verification_outcome=survey.verification_outcome,
            road_id=road.id,
            road_status=road.status,
            road_is_blocked=road.is_blocked,
            cluster_id=cluster.id if cluster else None,
            cluster_status=cluster.status if cluster else None,
            already_propagated=True,
            propagated_at=road.last_verified_at or datetime.now(timezone.utc),
            message="Survey outcome has already been propagated into operational ground truth.",
        )

    # 8. Staleness Protection (Version Safety)
    # If road has a newer last_verified_at timestamp than incoming survey
    if road and road.last_verified_at is not None:
        road_verified_at = road.last_verified_at
        if road_verified_at.tzinfo is None:
            road_verified_at = road_verified_at.replace(tzinfo=timezone.utc)
        if survey_effective_time < road_verified_at:
            return GroundTruthPropagationResponse(
                survey_id=survey.id,
                verification_outcome=survey.verification_outcome,
                road_id=road.id,
                road_status=road.status,
                road_is_blocked=road.is_blocked,
                cluster_id=cluster.id if cluster else None,
                cluster_status=cluster.status if cluster else None,
                already_propagated=False,
                propagated_at=road.last_verified_at,
                message="Survey observation is older than current verified ground truth. Mutation skipped for staleness safety.",
            )

    # 9. Apply Deterministic Ground-Truth Transitions in Atomic Transaction
    try:
        road_updated = False
        cluster_updated = False
        now_utc = datetime.now(timezone.utc)

        # ── Outcome: road_blocked ──
        if survey.verification_outcome == FieldSurveyVerificationOutcome.road_blocked:
            if road:
                old_road_values = {
                    "status": road.status.value,
                    "is_blocked": road.is_blocked,
                    "hazard_penalty": road.hazard_penalty,
                    "flood_penalty": road.flood_penalty,
                    "congestion_penalty": road.congestion_penalty,
                    "confidence_score": road.confidence_score,
                    "last_verified_survey_id": road.last_verified_survey_id,
                }
                road.status = RoadStatus.blocked
                road.is_blocked = True
                road.confidence_score = 1.0
                road.last_verified_survey_id = survey.id
                road.last_verified_at = survey_effective_time

                if survey.hazard_penalty is not None:
                    road.hazard_penalty = survey.hazard_penalty
                if survey.flood_penalty is not None:
                    road.flood_penalty = survey.flood_penalty
                if survey.congestion_penalty is not None:
                    road.congestion_penalty = survey.congestion_penalty

                road_updated = True
                invalidate_route_cache(road_id=road.id)

                audit_road = AuditLog(
                    actor_id=actor_user.id,
                    action="ROAD_GROUND_TRUTH_UPDATED",
                    entity_type="roads",
                    entity_id=road.id,
                    old_values=old_road_values,
                    new_values={
                        "status": road.status.value,
                        "is_blocked": road.is_blocked,
                        "hazard_penalty": road.hazard_penalty,
                        "flood_penalty": road.flood_penalty,
                        "congestion_penalty": road.congestion_penalty,
                        "confidence_score": road.confidence_score,
                        "last_verified_survey_id": survey.id,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "verification_outcome": survey.verification_outcome.value,
                    },
                )
                db.add(audit_road)

            if cluster:
                old_cluster_status = cluster.status
                cluster.status = ReportClusterStatus.verified
                cluster_updated = True

                # Update associated reports to verified without deleting
                rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id).with_for_update()
                rep_res = await db.execute(rep_query)
                reports = rep_res.scalars().all()
                for r in reports:
                    r.status = ReportStatus.verified
                    r.verified_at = survey_effective_time
                    r.verified_by_id = actor_user.id

                audit_cluster = AuditLog(
                    actor_id=actor_user.id,
                    action="CLUSTER_VERIFIED",
                    entity_type="report_clusters",
                    entity_id=cluster.id,
                    old_values={"status": old_cluster_status.value},
                    new_values={
                        "status": cluster.status.value,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "verified_report_count": len(reports),
                    },
                )
                db.add(audit_cluster)

        # ── Outcome: confirmed_hazard ──
        elif survey.verification_outcome == FieldSurveyVerificationOutcome.confirmed_hazard:
            if road:
                old_road_values = {
                    "status": road.status.value,
                    "is_blocked": road.is_blocked,
                    "hazard_penalty": road.hazard_penalty,
                    "flood_penalty": road.flood_penalty,
                    "congestion_penalty": road.congestion_penalty,
                    "confidence_score": road.confidence_score,
                    "last_verified_survey_id": road.last_verified_survey_id,
                }
                # If survey specifies a status, use it; otherwise default to hazardous
                if survey.road_status:
                    road.status = survey.road_status
                else:
                    road.status = RoadStatus.hazardous

                road.is_blocked = (
                    survey.is_blocked
                    if survey.is_blocked is not None
                    else (road.status == RoadStatus.blocked)
                )
                if survey.hazard_penalty is not None:
                    road.hazard_penalty = survey.hazard_penalty
                elif road.hazard_penalty == 0.0:
                    road.hazard_penalty = 5.0  # default hazard penalty weight

                if survey.flood_penalty is not None:
                    road.flood_penalty = survey.flood_penalty
                if survey.congestion_penalty is not None:
                    road.congestion_penalty = survey.congestion_penalty

                road.confidence_score = 1.0
                road.last_verified_survey_id = survey.id
                road.last_verified_at = survey_effective_time

                road_updated = True
                invalidate_route_cache(road_id=road.id)

                audit_road = AuditLog(
                    actor_id=actor_user.id,
                    action="ROAD_GROUND_TRUTH_UPDATED",
                    entity_type="roads",
                    entity_id=road.id,
                    old_values=old_road_values,
                    new_values={
                        "status": road.status.value,
                        "is_blocked": road.is_blocked,
                        "hazard_penalty": road.hazard_penalty,
                        "flood_penalty": road.flood_penalty,
                        "congestion_penalty": road.congestion_penalty,
                        "confidence_score": road.confidence_score,
                        "last_verified_survey_id": survey.id,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "verification_outcome": survey.verification_outcome.value,
                    },
                )
                db.add(audit_road)

            if cluster:
                old_cluster_status = cluster.status
                cluster.status = ReportClusterStatus.verified
                cluster_updated = True

                rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id).with_for_update()
                rep_res = await db.execute(rep_query)
                reports = rep_res.scalars().all()
                for r in reports:
                    r.status = ReportStatus.verified
                    r.verified_at = survey_effective_time
                    r.verified_by_id = actor_user.id

                audit_cluster = AuditLog(
                    actor_id=actor_user.id,
                    action="CLUSTER_VERIFIED",
                    entity_type="report_clusters",
                    entity_id=cluster.id,
                    old_values={"status": old_cluster_status.value},
                    new_values={
                        "status": cluster.status.value,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "verified_report_count": len(reports),
                    },
                )
                db.add(audit_cluster)

        # ── Outcome: no_hazard_found ──
        elif survey.verification_outcome == FieldSurveyVerificationOutcome.no_hazard_found:
            if road:
                old_road_values = {
                    "status": road.status.value,
                    "is_blocked": road.is_blocked,
                    "hazard_penalty": road.hazard_penalty,
                    "flood_penalty": road.flood_penalty,
                    "congestion_penalty": road.congestion_penalty,
                    "confidence_score": road.confidence_score,
                    "last_verified_survey_id": road.last_verified_survey_id,
                }
                road.status = RoadStatus.clear
                road.is_blocked = False
                road.hazard_penalty = 0.0
                road.flood_penalty = 0.0
                road.confidence_score = 1.0
                road.last_verified_survey_id = survey.id
                road.last_verified_at = survey_effective_time

                road_updated = True
                invalidate_route_cache(road_id=road.id)

                audit_road = AuditLog(
                    actor_id=actor_user.id,
                    action="ROAD_GROUND_TRUTH_UPDATED",
                    entity_type="roads",
                    entity_id=road.id,
                    old_values=old_road_values,
                    new_values={
                        "status": road.status.value,
                        "is_blocked": road.is_blocked,
                        "hazard_penalty": road.hazard_penalty,
                        "flood_penalty": road.flood_penalty,
                        "confidence_score": road.confidence_score,
                        "last_verified_survey_id": survey.id,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "verification_outcome": survey.verification_outcome.value,
                    },
                )
                db.add(audit_road)

            if cluster:
                old_cluster_status = cluster.status
                cluster.status = ReportClusterStatus.dismissed
                cluster_updated = True

                # Mark reports as rejected, DO NOT delete historical evidence
                rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id).with_for_update()
                rep_res = await db.execute(rep_query)
                reports = rep_res.scalars().all()
                for r in reports:
                    r.status = ReportStatus.rejected
                    r.verified_at = survey_effective_time
                    r.verified_by_id = actor_user.id

                audit_cluster = AuditLog(
                    actor_id=actor_user.id,
                    action="CLUSTER_DISMISSED",
                    entity_type="report_clusters",
                    entity_id=cluster.id,
                    old_values={"status": old_cluster_status.value},
                    new_values={
                        "status": cluster.status.value,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "rejected_report_count": len(reports),
                    },
                )
                db.add(audit_cluster)

        # ── Outcome: false_report ──
        elif survey.verification_outcome == FieldSurveyVerificationOutcome.false_report:
            if cluster:
                old_cluster_status = cluster.status
                cluster.status = ReportClusterStatus.dismissed
                cluster_updated = True

                # Mark reports as rejected, DO NOT delete historical evidence
                rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id).with_for_update()
                rep_res = await db.execute(rep_query)
                reports = rep_res.scalars().all()
                for r in reports:
                    r.status = ReportStatus.rejected
                    r.verified_at = survey_effective_time
                    r.verified_by_id = actor_user.id

                audit_cluster = AuditLog(
                    actor_id=actor_user.id,
                    action="CLUSTER_DISMISSED",
                    entity_type="report_clusters",
                    entity_id=cluster.id,
                    old_values={"status": old_cluster_status.value},
                    new_values={
                        "status": cluster.status.value,
                        "survey_id": survey.id,
                        "mission_id": survey.mission_id,
                        "rejected_report_count": len(reports),
                    },
                )
                db.add(audit_cluster)

        # If neither road nor cluster was available or updated, record verification audit
        if not road_updated and not cluster_updated:
            audit_survey = AuditLog(
                actor_id=actor_user.id,
                action="VERIFICATION_APPLIED",
                entity_type="field_surveys",
                entity_id=survey.id,
                new_values={
                    "verification_outcome": survey.verification_outcome.value,
                    "note": "Survey verified; no authoritative road or cluster target was modified.",
                },
            )
            db.add(audit_survey)

        # 10. Commit Atomic Transaction
        await db.commit()
        if road:
            await db.refresh(road)
        if cluster:
            await db.refresh(cluster)
    except Exception:
        await db.rollback()
        raise

    return GroundTruthPropagationResponse(
        survey_id=survey.id,
        verification_outcome=survey.verification_outcome,
        road_id=road.id if road else None,
        road_status=road.status if road else None,
        road_is_blocked=road.is_blocked if road else None,
        cluster_id=cluster.id if cluster else None,
        cluster_status=cluster.status if cluster else None,
        already_propagated=False,
        propagated_at=survey_effective_time,
        message="Field survey outcome successfully propagated into operational ground truth.",
    )

