"""
ResQnet Incident Clustering Schemas (Step 6.4)
Defines request and response schemas for spatial+temporal incident clustering.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from app.db.models import ReportClusterStatus, ReportStatus


class ReportInClusterSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    description: Optional[str] = None
    lat: float
    lng: float
    photo_url: Optional[str] = None
    status: ReportStatus
    submitted_offline: bool
    client_timestamp: Optional[datetime] = None
    created_at: datetime


class ClusterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    centroid_lat: float
    centroid_lng: float
    report_count: int
    priority_score: float
    dominant_category: Optional[str] = None
    status: ReportClusterStatus
    created_at: datetime
    updated_at: datetime


class ClusterDetailResponse(ClusterResponse):
    reports: List[ReportInClusterSummary] = []


class ProcessReportResponse(BaseModel):
    report_id: int
    cluster_id: int
    is_new_cluster: bool
    report_status: ReportStatus  # strictly UNVERIFIED
    cluster: ClusterResponse
