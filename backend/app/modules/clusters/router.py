"""
ResQnet Incident Clustering Router (Step 6.4)
Exposes endpoints for processing incident report clustering and querying clusters.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import User, UserRole, ReportCluster, ReportClusterStatus, IncidentReport
from app.modules.auth.router import get_current_user, require_roles
from app.core.exceptions import NotFoundException
from app.modules.clusters.schemas import (
    ClusterResponse,
    ClusterDetailResponse,
    ProcessReportResponse,
)
from app.modules.clusters.service import (
    cluster_incident_report,
    approve_incident_cluster,
    dismiss_incident_cluster,
)

router = APIRouter(prefix="/clusters", tags=["Incident Clusters"])


@router.post(
    "/process-report/{report_id}",
    response_model=ProcessReportResponse,
    status_code=status.HTTP_200_OK,
    summary="Process an incident report into a spatial+temporal cluster",
)
async def process_report_clustering(
    report_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator, UserRole.responder, UserRole.citizen)),
    db: AsyncSession = Depends(get_db),
):
    """
    Triggers deterministic spatial and temporal clustering for an incident report.
    - Resolves nearest existing open cluster within configurable radius/time window or creates a new cluster.
    - Preserves unverified report status (clustering is NOT ground truth verification).
    - Restricted to authenticated coordinators, responders, and citizens.
    """
    cluster, is_new = await cluster_incident_report(db=db, report_id=report_id)
    report = await db.get(IncidentReport, report_id)

    return ProcessReportResponse(
        report_id=report.id,
        cluster_id=cluster.id,
        is_new_cluster=is_new,
        report_status=report.status,
        cluster=ClusterResponse.model_validate(cluster),
    )


@router.get(
    "",
    response_model=List[ClusterResponse],
    summary="List incident report clusters",
)
async def list_clusters(
    cluster_status: Optional[ReportClusterStatus] = Query(None, alias="status", description="Filter by cluster status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists incident clusters with optional status filtering."""
    query = select(ReportCluster).order_by(ReportCluster.created_at.desc())
    if cluster_status:
        query = query.where(ReportCluster.status == cluster_status)
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    clusters = result.scalars().all()
    return [ClusterResponse.model_validate(c) for c in clusters]


@router.get(
    "/{cluster_id}",
    response_model=ClusterDetailResponse,
    summary="Get cluster details by ID",
)
async def get_cluster_detail(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves cluster details including its constituent unverified incident reports."""
    query = (
        select(ReportCluster)
        .where(ReportCluster.id == cluster_id)
        .options(selectinload(ReportCluster.reports))
    )
    result = await db.execute(query)
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise NotFoundException(f"Cluster with ID {cluster_id} not found")

    return ClusterDetailResponse.model_validate(cluster)


@router.post(
    "/{cluster_id}/approve",
    response_model=dict,
    summary="Approve unverified incident cluster into verified ground truth and hazard zone (Coordinator only)",
)
async def approve_cluster(
    cluster_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve incident cluster:
    - Sets cluster status to 'verified'
    - Sets all member citizen reports to 'verified'
    - Creates or updates active HazardZone perimeter
    - Invalidates routing cache so citizen routes avoid danger zone
    - Writes to shared audit log
    """
    cluster, hazard_zone, affected_count = await approve_incident_cluster(
        db=db,
        cluster_id=cluster_id,
        actor_user=current_user,
    )
    return {
        "status": "success",
        "cluster_id": cluster.id,
        "cluster_status": cluster.status.value if hasattr(cluster.status, "value") else cluster.status,
        "hazard_zone_id": hazard_zone.id if hazard_zone else None,
        "hazard_zone_severity": hazard_zone.severity.value if hazard_zone and hasattr(hazard_zone.severity, "value") else None,
        "rerouted_users_count": affected_count,
        "message": f"Incident cluster #{cluster_id} approved. Ground truth verified and hazard zone active. Routing updated.",
    }


@router.post(
    "/{cluster_id}/dismiss",
    response_model=dict,
    summary="Dismiss false alarm cluster (Coordinator only)",
)
async def dismiss_cluster(
    cluster_id: int,
    current_user: User = Depends(require_roles(UserRole.coordinator)),
    db: AsyncSession = Depends(get_db),
):
    """
    Dismiss false alarm cluster:
    - Sets cluster status to 'dismissed'
    - Sets member reports to 'rejected'
    - Writes to shared audit log
    """
    cluster = await dismiss_incident_cluster(
        db=db,
        cluster_id=cluster_id,
        actor_user=current_user,
    )
    return {
        "status": "success",
        "cluster_id": cluster.id,
        "cluster_status": cluster.status.value if hasattr(cluster.status, "value") else cluster.status,
        "message": f"Incident cluster #{cluster_id} dismissed as false alarm.",
    }
