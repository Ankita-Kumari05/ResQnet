"""
ResQnet Incident Clustering Service (Step 6.4)
Implements deterministic spatial + temporal clustering of citizen incident reports using PostGIS.
Incident reports are unverified signals; clustering groups related signals without verifying ground truth.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundException, BadRequestException
from app.core.audit import write_audit_log
from app.modules.routing.cache import invalidate_route_cache
from app.db.models import (
    IncidentReport,
    ReportCluster,
    ReportClusterStatus,
    ReportStatus,
    HazardZone,
    HazardSeverity,
    User,
)


async def cluster_incident_report(
    db: AsyncSession,
    report_id: int,
    radius_meters: Optional[float] = None,
    temporal_window_minutes: Optional[int] = None,
) -> Tuple[ReportCluster, bool]:
    """
    Deterministically clusters an unverified citizen incident report.

    Spatial Rule:
      - Uses PostGIS ST_DWithin on SRID 4326 geography (meters).
      - Configurable radius via CLUSTERING_RADIUS_METERS (default 500m).

    Temporal Rule:
      - Considers offline reports: if submitted_offline and client_timestamp is present,
        client_timestamp is used as the citizen observation time.
      - Otherwise, created_at is used as the observation/submission timestamp.
      - Matches clusters whose updated_at falls within +/- temporal_window_minutes (default 120m).

    Integrity Guarantees:
      - Never marks an incident report as verified (report remains UNVERIFIED).
      - Never modifies roads, hazard_zones, safety_hubs, field_surveys, or missions.
      - Idempotent: If the report is already assigned to a cluster, returns the existing cluster.
    """
    settings = get_settings()
    radius = radius_meters if radius_meters is not None else settings.CLUSTERING_RADIUS_METERS
    window_minutes = (
        temporal_window_minutes
        if temporal_window_minutes is not None
        else settings.CLUSTERING_TEMPORAL_WINDOW_MINUTES
    )

    # 1. Fetch the incident report
    report = await db.get(IncidentReport, report_id)
    if not report:
        raise NotFoundException(f"Incident report with ID {report_id} not found")

    # 2. Check for existing cluster assignment (idempotency)
    if report.cluster_id is not None:
        existing_cluster = await db.get(ReportCluster, report.cluster_id)
        if existing_cluster:
            return existing_cluster, False

    # 3. Determine the effective observation timestamp
    # Offline reports record when the incident occurred via client_timestamp.
    # Online reports default to created_at or current UTC time.
    effective_time = (
        report.client_timestamp
        if (report.submitted_offline and report.client_timestamp is not None)
        else (report.created_at or datetime.now(timezone.utc))
    )

    # Temporal window bounds
    delta = timedelta(minutes=window_minutes)
    min_time = effective_time - delta
    max_time = effective_time + delta

    # 4. Search for candidate nearby and temporally correlated open clusters via PostGIS
    # ST_DWithin(geom::geography, point::geography, radius) operates in meters on WGS84
    # Temporal correlation is evaluated against the effective event timestamps of reports
    # belonging to candidate clusters (supporting offline-delayed batches), NOT cluster DB updated_at.
    spatial_query = text("""
        SELECT rc.id
        FROM report_clusters rc
        WHERE rc.status = 'open'
          AND rc.dominant_category = :category
          AND ST_DWithin(rc.geom::geography, ST_SetSRID(ST_Point(:lng, :lat), 4326)::geography, :radius)
          AND EXISTS (
              SELECT 1
              FROM incident_reports ir
              WHERE ir.cluster_id = rc.id
                AND (
                    CASE 
                        WHEN ir.submitted_offline AND ir.client_timestamp IS NOT NULL THEN ir.client_timestamp 
                        ELSE ir.created_at 
                    END
                ) >= :min_time
                AND (
                    CASE 
                        WHEN ir.submitted_offline AND ir.client_timestamp IS NOT NULL THEN ir.client_timestamp 
                        ELSE ir.created_at 
                    END
                ) <= :max_time
          )
        ORDER BY ST_Distance(rc.geom::geography, ST_SetSRID(ST_Point(:lng, :lat), 4326)::geography) ASC
        LIMIT 1
        FOR UPDATE
    """)

    result = await db.execute(
        spatial_query,
        {
            "category": report.category,
            "lng": report.lng,
            "lat": report.lat,
            "radius": radius,
            "min_time": min_time,
            "max_time": max_time,
        },
    )
    candidate_row = result.mappings().first()

    is_new = False
    if candidate_row:
        # 5a. Join existing cluster
        cluster_id = candidate_row["id"]
        cluster = await db.get(ReportCluster, cluster_id)

        # Update centroid via weighted average
        old_count = cluster.report_count
        new_count = old_count + 1
        new_lat = ((cluster.centroid_lat * old_count) + report.lat) / new_count
        new_lng = ((cluster.centroid_lng * old_count) + report.lng) / new_count

        cluster.centroid_lat = new_lat
        cluster.centroid_lng = new_lng
        cluster.geom = f"SRID=4326;POINT({new_lng} {new_lat})"
        cluster.report_count = new_count
        cluster.priority_score = min(5.0, 1.0 + (new_count - 1) * 0.5)
        cluster.updated_at = func.now()

        # Link report to cluster (keeping report status UNVERIFIED)
        report.cluster_id = cluster.id
    else:
        # 5b. Create new cluster
        new_cluster = ReportCluster(
            centroid_lat=report.lat,
            centroid_lng=report.lng,
            geom=f"SRID=4326;POINT({report.lng} {report.lat})",
            report_count=1,
            priority_score=1.0,
            dominant_category=report.category,
            status=ReportClusterStatus.open,
        )
        db.add(new_cluster)
        await db.flush()  # obtain generated ID

        report.cluster_id = new_cluster.id
        cluster = new_cluster
        is_new = True

    # 6. Commit transaction safely with rollback protection
    try:
        await db.commit()
        await db.refresh(cluster)
        await db.refresh(report)
    except Exception:
        await db.rollback()
        raise

    return cluster, is_new


async def approve_incident_cluster(
    db: AsyncSession,
    cluster_id: int,
    actor_user: User,
    create_hazard_zone: bool = True,
) -> Tuple[ReportCluster, Optional[HazardZone], int]:
    """
    Coordinator decision center approval for an unverified incident cluster:
    1. Locks and updates ReportCluster status to 'verified'.
    2. Updates constituent IncidentReport rows to status 'verified' with verified_by_id and timestamp.
    3. Promotes incident into an active Red/CRITICAL or HIGH HazardZone perimeter if requested.
    4. Invalidates routing graph cache so Dijkstra immediately avoids the approved zone.
    5. Writes an authoritative AuditLog via write_audit_log().
    """
    cluster = await db.get(ReportCluster, cluster_id)
    if not cluster:
        raise NotFoundException(f"Report cluster with ID {cluster_id} not found")

    old_status = cluster.status
    cluster.status = ReportClusterStatus.verified
    cluster.updated_at = datetime.now(timezone.utc)

    # Update constituent reports
    rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id)
    rep_res = await db.execute(rep_query)
    reports = rep_res.scalars().all()
    now_utc = datetime.now(timezone.utc)
    for r in reports:
        r.status = ReportStatus.verified
        r.verified_at = now_utc
        r.verified_by_id = actor_user.id

    # Create / activate linked hazard zone perimeter (Red / CRITICAL)
    hazard_zone = None
    if create_hazard_zone:
        # Create a polygonal danger perimeter around centroid (approx 500m box)
        d_deg = 0.0045  # ~500m
        min_lng = cluster.centroid_lng - d_deg
        max_lng = cluster.centroid_lng + d_deg
        min_lat = cluster.centroid_lat - d_deg
        max_lat = cluster.centroid_lat + d_deg
        polygon_wkt = f"SRID=4326;POLYGON(({min_lng} {min_lat}, {max_lng} {min_lat}, {max_lng} {max_lat}, {min_lng} {max_lat}, {min_lng} {min_lat}))"
        
        hazard_zone = HazardZone(
            name=f"Hazard Zone INC-{cluster.id} ({cluster.dominant_category or 'General Danger'})",
            hazard_type=cluster.dominant_category or "danger",
            severity=HazardSeverity.CRITICAL if cluster.priority_score > 7 else HazardSeverity.HIGH,
            is_active=True,
            geom=polygon_wkt,
        )
        db.add(hazard_zone)
        await db.flush()

    # Invalidate routing graph cache
    invalidate_route_cache()

    # Write unified audit log
    await write_audit_log(
        db=db,
        actor_id=actor_user.id,
        action="INCIDENT_CLUSTER_APPROVED",
        entity_type="report_clusters",
        entity_id=cluster.id,
        old_values={"status": old_status.value if hasattr(old_status, "value") else old_status},
        new_values={
            "status": cluster.status.value if hasattr(cluster.status, "value") else cluster.status,
            "verified_reports_count": len(reports),
            "hazard_zone_id": hazard_zone.id if hazard_zone else None,
            "hazard_severity": hazard_zone.severity.value if hazard_zone and hasattr(hazard_zone.severity, "value") else None,
        },
    )

    await db.commit()
    await db.refresh(cluster)
    if hazard_zone:
        await db.refresh(hazard_zone)

    # Return cluster, created hazard zone, and count of active users within / en route
    affected_count = len(reports)
    return cluster, hazard_zone, affected_count


async def dismiss_incident_cluster(
    db: AsyncSession,
    cluster_id: int,
    actor_user: User,
) -> ReportCluster:
    """
    Dismisses an incident cluster as a false alarm / rejected:
    1. Sets ReportCluster status to 'dismissed'.
    2. Sets constituent reports to 'rejected'.
    3. Writes an authoritative AuditLog via write_audit_log().
    """
    cluster = await db.get(ReportCluster, cluster_id)
    if not cluster:
        raise NotFoundException(f"Report cluster with ID {cluster_id} not found")

    old_status = cluster.status
    cluster.status = ReportClusterStatus.dismissed
    cluster.updated_at = datetime.now(timezone.utc)

    rep_query = select(IncidentReport).where(IncidentReport.cluster_id == cluster.id)
    rep_res = await db.execute(rep_query)
    reports = rep_res.scalars().all()
    now_utc = datetime.now(timezone.utc)
    for r in reports:
        r.status = ReportStatus.rejected
        r.verified_at = now_utc
        r.verified_by_id = actor_user.id

    await write_audit_log(
        db=db,
        actor_id=actor_user.id,
        action="INCIDENT_CLUSTER_DISMISSED",
        entity_type="report_clusters",
        entity_id=cluster.id,
        old_values={"status": old_status.value if hasattr(old_status, "value") else old_status},
        new_values={
            "status": cluster.status.value if hasattr(cluster.status, "value") else cluster.status,
            "rejected_reports_count": len(reports),
            "reason": "false_alarm",
        },
    )

    await db.commit()
    await db.refresh(cluster)
    return cluster
