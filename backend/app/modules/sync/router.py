"""
Sync Queue Module — Step 6.14: Offline-First Synchronization & Conflict Resolution
Handles offline client operation queues, atomic idempotency, conflict detection, and reconciliation.

Policy:
- Each operation lifecycle executes inside a SINGLE PostgreSQL savepoint (db.begin_nested()).
- sync_queue_log.operation_id UNIQUE constraint is the atomic idempotency guard.
- Server JWT identity is ALWAYS authoritative; client-supplied _meta is stripped and ignored.
- FieldSurvey replay ONLY allowed when mission.status IN (accepted, in_progress).
- Citizen report replay ALWAYS creates IncidentReport with status=UNVERIFIED.
- Replay NEVER directly modifies roads, hazard_zones, or operational ground truth.
- Ground truth propagation remains exclusively the domain of Step 6.7.
"""
import copy
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.db.models import (
    SyncQueueLog,
    User,
    UserRole,
    IncidentReport,
    ReportStatus,
    FieldSurvey,
    Mission,
    MissionStatus,
    Responder,
    ResponderStatus,
    FieldSurveyVerificationOutcome,
    RoadStatus,
    AuditLog,
)
from app.modules.auth.router import get_current_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])

BATCH_MAX_SIZE = 50
ALLOWED_OPERATION_TYPES = {"submit_report", "field_survey"}


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class SyncOperation(BaseModel):
    operation_id: str = Field(..., min_length=1, max_length=64, description="Client-generated unique operation UUID v4")
    operation_type: str = Field(..., description="Operation type: submit_report | field_survey")
    client_timestamp: Optional[datetime] = Field(None, description="Client event recording timestamp")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Operation payload")


class SyncBatchRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=128, description="Client device / browser instance ID")
    operations: List[SyncOperation] = Field(..., description="List of offline operations (max 50)")

    @field_validator("operations")
    @classmethod
    def validate_batch_size(cls, v: List[SyncOperation]) -> List[SyncOperation]:
        if len(v) > BATCH_MAX_SIZE:
            raise ValueError(f"Batch size {len(v)} exceeds maximum of {BATCH_MAX_SIZE} operations.")
        if len(v) == 0:
            raise ValueError("Batch must contain at least one operation.")
        return v


class SyncResultItem(BaseModel):
    operation_id: str
    operation_type: str
    status: str  # accepted | conflict | rejected
    conflict_notes: Optional[str] = None
    server_entity_id: Optional[int] = None


class SyncBatchResponse(BaseModel):
    client_id: str
    total: int
    accepted: int
    conflicts: int
    rejected: int
    results: List[SyncResultItem]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/replay", response_model=SyncBatchResponse)
async def replay_sync_queue(
    batch: SyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a batch of up to 50 offline queued operations from a client.
    Each operation executes inside its own PostgreSQL savepoint (db.begin_nested()).
    Idempotency is atomically enforced via sync_queue_log.operation_id UNIQUE constraint.

    Per-operation transaction:
      - sync_queue_log reservation
      - domain entity mutation
      - audit logging
      - sync status update
    All committed or rolled back together per operation.

    Successful operations before/after a failed operation survive independently.
    """
    results: List[SyncResultItem] = []
    accepted = 0
    conflicts = 0
    rejected = 0

    # Pending report IDs for clustering after outer commit
    report_ids_to_cluster: List[int] = []

    # Sort operations by client_timestamp to respect observation order
    sorted_ops = sorted(
        batch.operations,
        key=lambda op: op.client_timestamp or datetime.now(timezone.utc)
    )

    for op in sorted_ops:
        res = await _process_single_operation(op, batch.client_id, current_user, db)
        item = SyncResultItem(**res)
        results.append(item)

        if item.status == "accepted":
            accepted += 1
            # Collect accepted report IDs for post-commit clustering
            if op.operation_type == "submit_report" and item.server_entity_id:
                report_ids_to_cluster.append(item.server_entity_id)
        elif item.status == "conflict":
            conflicts += 1
        else:
            rejected += 1

    # Commit all accepted operation savepoints together
    await db.commit()

    # Invoke Step 6.4 clustering AFTER the outer commit (clustering has its own commit)
    for report_id in report_ids_to_cluster:
        try:
            from app.modules.clusters.service import cluster_incident_report
            await cluster_incident_report(db, report_id)
        except Exception as exc:
            # Clustering is best-effort; report creation has already committed.
            # Log and continue — do NOT let clustering failure un-create the report.
            logger.warning(f"[sync/replay] Clustering failed for report {report_id}: {exc}")

    return SyncBatchResponse(
        client_id=batch.client_id,
        total=len(batch.operations),
        accepted=accepted,
        conflicts=conflicts,
        rejected=rejected,
        results=results,
    )


# Backwards compatibility: keep /flush as hidden alias
@router.post("/flush", response_model=SyncBatchResponse, include_in_schema=False)
async def flush_sync_queue_legacy(
    batch: SyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await replay_sync_queue(batch=batch, current_user=current_user, db=db)


@router.get("/status")
async def sync_status():
    """Health check to confirm server is reachable — used by client to detect connectivity."""
    return {"online": True, "server_time": datetime.now(timezone.utc).isoformat()}


# ─── Core Atomic Operation Handler ───────────────────────────────────────────

async def _process_single_operation(
    op: SyncOperation,
    batch_client_id: str,
    current_user: User,
    db: AsyncSession,
) -> dict:
    """
    Executes the ENTIRE lifecycle of one offline operation inside a SINGLE PostgreSQL savepoint.

    The savepoint boundary covers:
      1. sync_queue_log.operation_id reservation (UNIQUE constraint guard)
      2. Server-owned _meta stamping (client _meta stripped)
      3. RBAC validation
      4. Entity state validation
      5. Domain mutation (IncidentReport or FieldSurvey creation)
      6. AuditLog recording
      7. sync_queue_log status update
      8. Final flush

    If an unexpected exception occurs anywhere in steps 1–8:
      - The savepoint rolls back ENTIRELY.
      - sync_queue_log reservation is removed.
      - Domain entity is removed.
      - AuditLog row is removed.
      - operation_id remains unused and clean for future retries.
      - The per-operation error is recorded in the batch response.
      - The batch continues processing remaining operations.

    If the operation_id already exists (duplicate submission):
      - The IntegrityError path is taken.
      - The savepoint cleanly rolls back the attempted duplicate reservation.
      - The existing sync_queue_log record is fetched.
      - Ownership is checked: existing_owner != current_user -> rejected.
      - Ownership matches -> cached result returned; NO domain re-execution.
    """
    # Step A: Strip client-supplied _meta (UNTRUSTED) and stamp server JWT identity
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    sanitized_payload = {k: v for k, v in op.payload.items() if k != "_meta"}
    sanitized_payload["_meta"] = {
        "user_id": current_user.id,
        "user_role": user_role_str,
    }

    try:
        async with db.begin_nested():
            # B. Atomic reservation — triggers IntegrityError if operation_id already exists
            received_now = datetime.now(timezone.utc)
            log_entry = SyncQueueLog(
                client_id=batch_client_id,
                operation_id=op.operation_id,
                operation_type=op.operation_type,
                payload=sanitized_payload,
                client_timestamp=op.client_timestamp,
                received_at=received_now,
                status="accepted",   # provisional — updated below
                conflict_notes=None,
            )
            db.add(log_entry)
            await db.flush()  # Will raise IntegrityError if operation_id not unique

            # C. Execute domain operation (all inside this savepoint)
            domain_res = await _execute_domain_operation(
                op_type=op.operation_type,
                client_timestamp=op.client_timestamp,
                payload=sanitized_payload,
                user=current_user,
                db=db,
            )

            # D. Update log status inside the savepoint
            log_entry.status = domain_res["status"]
            log_entry.conflict_notes = domain_res.get("conflict_notes")
            log_entry.processed_at = datetime.now(timezone.utc)

            if domain_res.get("server_entity_id"):
                # Create a NEW dict copy to force SQLAlchemy JSONB mutation detection
                updated_payload = copy.copy(sanitized_payload)
                updated_payload["server_entity_id"] = domain_res["server_entity_id"]
                log_entry.payload = updated_payload
                flag_modified(log_entry, "payload")

            await db.flush()

        # Savepoint committed
        return {
            "operation_id": op.operation_id,
            "operation_type": op.operation_type,
            "status": log_entry.status,
            "conflict_notes": log_entry.conflict_notes,
            "server_entity_id": domain_res.get("server_entity_id"),
        }

    except IntegrityError:
        # Savepoint rolled back. operation_id already in sync_queue_log.
        # Fetch the existing entry (from the outer transaction) and return cached result.
        existing_log = await db.scalar(
            select(SyncQueueLog).where(SyncQueueLog.operation_id == op.operation_id)
        )

        if not existing_log:
            # Rare: non-unique-key IntegrityError from domain logic inside savepoint.
            # Savepoint rolled back everything cleanly. operation_id not reserved.
            return {
                "operation_id": op.operation_id,
                "operation_type": op.operation_type,
                "status": "rejected",
                "conflict_notes": "Database integrity error during domain operation",
                "server_entity_id": None,
            }

        # Ownership security check: compare server-stamped _meta to current authenticated user
        owner_id = (existing_log.payload or {}).get("_meta", {}).get("user_id")
        if owner_id is not None and owner_id != current_user.id:
            # Cross-user duplicate replay attempt — REJECT
            return {
                "operation_id": op.operation_id,
                "operation_type": op.operation_type,
                "status": "rejected",
                "conflict_notes": "Security Error: Operation belongs to a different authenticated user",
                "server_entity_id": None,
            }

        # Ownership matches — return cached result, NO domain re-execution
        return {
            "operation_id": op.operation_id,
            "operation_type": op.operation_type,
            "status": existing_log.status,
            "conflict_notes": existing_log.conflict_notes,
            "server_entity_id": (existing_log.payload or {}).get("server_entity_id"),
        }

    except Exception as exc:
        # Unexpected exception anywhere inside the savepoint.
        # Savepoint rolled back: reservation, domain entity, audit row ALL gone.
        # operation_id NOT persisted — cleanly reusable on next retry.
        logger.warning(
            f"[sync/replay] Unexpected error for op={op.operation_id} type={op.operation_type}: {exc}"
        )
        return {
            "operation_id": op.operation_id,
            "operation_type": op.operation_type,
            "status": "rejected",
            "conflict_notes": "Unexpected server error during processing. Operation is safe to retry.",
            "server_entity_id": None,
        }


async def _execute_domain_operation(
    op_type: str,
    client_timestamp: Optional[datetime],
    payload: dict,
    user: User,
    db: AsyncSession,
) -> dict:
    """
    Routes a sync operation to its domain handler inside the caller's savepoint.
    Returns: {"status": str, "server_entity_id": int|None, "conflict_notes": str|None}

    All DB mutations here are inside the single per-operation savepoint from _process_single_operation.
    This function must NOT call db.commit() or db.rollback().
    """
    user_role_val = user.role.value if hasattr(user.role, "value") else str(user.role)

    # ── Validate operation type first ──────────────────────────────────────
    if op_type not in ALLOWED_OPERATION_TYPES:
        return {
            "status": "rejected",
            "conflict_notes": f"Unknown operation_type '{op_type}'. Allowed: {sorted(ALLOWED_OPERATION_TYPES)}",
        }

    # ── CITIZEN: INCIDENT REPORT REPLAY ───────────────────────────────────
    if op_type == "submit_report":
        if user_role_val != UserRole.citizen.value:
            return {
                "status": "rejected",
                "conflict_notes": f"RBAC Error: Role '{user_role_val}' cannot submit incident reports. Requires citizen.",
            }

        lat = payload.get("lat")
        lng = payload.get("lng")
        category = payload.get("category")
        if lat is None or lng is None or not category:
            return {
                "status": "rejected",
                "conflict_notes": "Payload missing required fields: lat, lng, category",
            }

        try:
            lat = float(lat)
            lng = float(lng)
        except (TypeError, ValueError):
            return {
                "status": "rejected",
                "conflict_notes": "Invalid lat/lng values (must be numeric)",
            }

        geom_wkt = f"SRID=4326;POINT({lng} {lat})"
        report = IncidentReport(
            reporter_id=user.id,        # Server-authenticated identity
            category=str(category).strip(),
            description=str(payload["description"]).strip() if payload.get("description") else None,
            lat=lat,
            lng=lng,
            geom=geom_wkt,
            photo_url=str(payload["photo_url"]).strip() if payload.get("photo_url") else None,
            status=ReportStatus.unverified,  # ALWAYS UNVERIFIED — server-enforced
            cluster_id=None,
            submitted_offline=True,
            client_timestamp=client_timestamp,
            verified_by_id=None,
            verified_at=None,
        )
        db.add(report)
        await db.flush()

        # Audit log inside savepoint
        audit = AuditLog(
            actor_id=user.id,
            action="SYNC_REPORT_REPLAYED",
            entity_type="incident_reports",
            entity_id=report.id,
            new_values={
                "category": report.category,
                "lat": lat,
                "lng": lng,
                "submitted_offline": True,
                "client_timestamp": client_timestamp.isoformat() if client_timestamp else None,
            },
        )
        db.add(audit)
        await db.flush()

        # NOTE: Step 6.4 clustering happens AFTER outer commit in the batch handler
        # to avoid commit conflicts inside the savepoint.
        return {"status": "accepted", "server_entity_id": report.id}

    # ── RESPONDER: FIELD SURVEY REPLAY ────────────────────────────────────
    elif op_type == "field_survey":
        if user_role_val != UserRole.responder.value:
            return {
                "status": "rejected",
                "conflict_notes": f"RBAC Error: Role '{user_role_val}' cannot submit field surveys. Requires responder.",
            }

        # Resolve and validate Responder profile
        responder = await db.scalar(select(Responder).where(Responder.user_id == user.id))
        if not responder:
            return {
                "status": "rejected",
                "conflict_notes": "No responder profile associated with authenticated user",
            }

        # Check responder is active (not offline/deauthorized)
        inactive_statuses = {ResponderStatus.offline}
        if responder.status in inactive_statuses:
            return {
                "status": "rejected",
                "conflict_notes": f"Responder is inactive (status='{responder.status.value}'). Cannot submit survey.",
            }

        mission_id = payload.get("mission_id")
        if not mission_id:
            return {
                "status": "rejected",
                "conflict_notes": "Payload missing required field: mission_id",
            }

        try:
            mission_id = int(mission_id)
        except (TypeError, ValueError):
            return {
                "status": "rejected",
                "conflict_notes": "mission_id must be an integer",
            }

        # Load mission
        mission = await db.get(Mission, mission_id)
        if not mission:
            return {
                "status": "conflict",
                "conflict_notes": f"Mission {mission_id} not found on server",
            }

        # Verify mission ownership — server-determined
        if mission.responder_id != responder.id:
            return {
                "status": "conflict",
                "conflict_notes": (
                    f"Mission {mission_id} ownership mismatch: "
                    f"mission assigned to responder_id={mission.responder_id}, "
                    f"authenticated responder_id={responder.id}"
                ),
            }

        # STRICT mission state check: ONLY accepted or in_progress allowed
        allowed_statuses = {MissionStatus.accepted, MissionStatus.in_progress}
        if mission.status not in allowed_statuses:
            return {
                "status": "conflict",
                "conflict_notes": (
                    f"Mission {mission_id} is in status '{mission.status.value}'. "
                    f"FieldSurvey replay requires mission to be 'accepted' or 'in_progress'."
                ),
            }

        # Validate verification_outcome (must use ONLY frozen enum values)
        verification_outcome_val = payload.get("verification_outcome")
        outcome_enum = None
        if verification_outcome_val:
            try:
                outcome_enum = FieldSurveyVerificationOutcome(verification_outcome_val)
            except ValueError:
                valid_vals = [e.value for e in FieldSurveyVerificationOutcome]
                return {
                    "status": "rejected",
                    "conflict_notes": (
                        f"Invalid verification_outcome '{verification_outcome_val}'. "
                        f"Must be one of: {valid_vals}"
                    ),
                }

        # Validate road_status enum if provided
        road_status_enum = None
        road_status_val = payload.get("road_status")
        if road_status_val:
            try:
                road_status_enum = RoadStatus(road_status_val)
            except ValueError:
                pass  # Invalid road status is non-fatal; skip it

        # Build PostGIS geometry if coordinates provided
        obs_lat = payload.get("observed_lat")
        obs_lng = payload.get("observed_lng")
        obs_geom = (
            f"SRID=4326;POINT({obs_lng} {obs_lat})"
            if (obs_lat is not None and obs_lng is not None)
            else None
        )

        survey = FieldSurvey(
            mission_id=mission.id,
            responder_id=responder.id,             # Server-determined
            road_id=mission.road_id,               # Use mission-assigned road
            cluster_id=mission.cluster_id,         # Use mission-assigned cluster
            observed_lat=obs_lat,
            observed_lng=obs_lng,
            observed_geom=obs_geom,
            observed_condition=payload.get("observed_condition"),
            road_status=road_status_enum,
            hazard_penalty=payload.get("hazard_penalty"),
            flood_penalty=payload.get("flood_penalty"),
            congestion_penalty=payload.get("congestion_penalty"),
            is_blocked=payload.get("is_blocked"),
            hazard_level=payload.get("hazard_level"),
            verification_outcome=outcome_enum,
            media_url=payload.get("media_url"),
            notes=payload.get("notes"),
            submitted_offline=True,
            client_timestamp=client_timestamp,     # Observation time preserved
            submitted_at=datetime.now(timezone.utc),  # Server receipt time
            # NOTE: Road/hazard ground truth NOT modified here.
            # Ground truth propagation is exclusively Step 6.7.
        )
        db.add(survey)
        await db.flush()

        # Audit log inside savepoint
        audit = AuditLog(
            actor_id=user.id,
            action="SYNC_SURVEY_REPLAYED",
            entity_type="field_surveys",
            entity_id=survey.id,
            new_values={
                "mission_id": mission.id,
                "responder_id": responder.id,
                "verification_outcome": outcome_enum.value if outcome_enum else None,
                "hazard_level": payload.get("hazard_level"),
                "submitted_offline": True,
                "client_timestamp": client_timestamp.isoformat() if client_timestamp else None,
            },
        )
        db.add(audit)
        await db.flush()

        return {"status": "accepted", "server_entity_id": survey.id}

    # Unreachable (guarded by ALLOWED_OPERATION_TYPES check above), but defensive:
    return {
        "status": "rejected",
        "conflict_notes": f"Internal routing error for operation_type '{op_type}'",
    }
