"""
ResQnet Database Models — Authoritative 17-Table Schema (v1.0)
All spatial fields use PostGIS geometry via GeoAlchemy2 with SRID 4326.
"""
import enum
from datetime import datetime
from typing import Optional

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class UserRole(str, enum.Enum):
    citizen = "citizen"
    responder = "responder"
    coordinator = "coordinator"
    fundraiser = "fundraiser"
    admin = "admin"


class ResponderStatus(str, enum.Enum):
    available = "available"
    deployed = "deployed"
    on_mission = "on_mission"
    offline = "offline"


class ReportStatus(str, enum.Enum):
    unverified = "unverified"
    clustered = "clustered"
    verified = "verified"
    rejected = "rejected"


class ReportClusterStatus(str, enum.Enum):
    open = "open"
    mission_assigned = "mission_assigned"
    verified = "verified"
    dismissed = "dismissed"


class RoadStatus(str, enum.Enum):
    clear = "clear"
    hazardous = "hazardous"
    flooded = "flooded"
    blocked = "blocked"


class HubStatus(str, enum.Enum):
    open = "open"
    near_capacity = "near_capacity"
    full = "full"
    closed = "closed"


class MissionType(str, enum.Enum):
    verify_incident = "verify_incident"
    survey_road = "survey_road"
    deliver_resource = "deliver_resource"
    rescue = "rescue"


class MissionStatus(str, enum.Enum):
    assigned = "assigned"
    accepted = "accepted"
    in_progress = "in_progress"
    completed = "completed"
    rejected = "rejected"
    cancelled = "cancelled"


class FieldSurveyVerificationOutcome(str, enum.Enum):
    confirmed_hazard = "confirmed_hazard"
    road_blocked = "road_blocked"
    no_hazard_found = "no_hazard_found"
    false_report = "false_report"


class HazardSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlertSeverity(str, enum.Enum):
    ADVISORY = "ADVISORY"
    WARNING = "WARNING"
    EMERGENCY = "EMERGENCY"


class CampaignStatus(str, enum.Enum):
    active = "active"
    fulfilled = "fulfilled"
    closed = "closed"


class ResourceType(str, enum.Enum):
    food = "food"
    water = "water"
    medical = "medical"
    shelter_kit = "shelter_kit"


class RequirementStatus(str, enum.Enum):
    open = "open"
    in_transit = "in_transit"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


# ─────────────────────────────────────────────
# 1. USERS (Authentication & Role Identity)
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.citizen, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    verification_status = Column(String(50), default="verified", nullable=True)
    phone = Column(String(50), nullable=True)
    department_or_org = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    responder_profile = relationship("Responder", back_populates="user", uselist=False)
    reports = relationship("IncidentReport", foreign_keys="[IncidentReport.reporter_id]", back_populates="reporter")
    campaigns = relationship("Campaign", foreign_keys="[Campaign.ngo_user_id]", back_populates="ngo_user")
    alerts_issued = relationship("EmergencyAlert", foreign_keys="[EmergencyAlert.issued_by_id]", back_populates="issued_by")
    audit_logs = relationship("AuditLog", foreign_keys="[AuditLog.actor_id]", back_populates="actor")


# ─────────────────────────────────────────────
# 2. INTERSECTIONS (Routing Graph Nodes)
# ─────────────────────────────────────────────

class Intersection(Base):
    """Graph node — a road junction or point of interest."""
    __tablename__ = "intersections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)

    is_hub = Column(Boolean, default=False, nullable=False)
    hub_id = Column(Integer, ForeignKey("safety_hubs.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    hub = relationship("SafetyHub", back_populates="intersections")
    outgoing_roads = relationship("Road", foreign_keys="[Road.from_intersection_id]", back_populates="from_intersection")
    incoming_roads = relationship("Road", foreign_keys="[Road.to_intersection_id]", back_populates="to_intersection")


# ─────────────────────────────────────────────
# 3. ROADS (Routing Graph Edges)
# ─────────────────────────────────────────────

class Road(Base):
    """Graph edge — a road segment between two intersections with safety weights."""
    __tablename__ = "roads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    from_intersection_id = Column(Integer, ForeignKey("intersections.id", ondelete="RESTRICT"), nullable=False, index=True)
    to_intersection_id = Column(Integer, ForeignKey("intersections.id", ondelete="RESTRICT"), nullable=False, index=True)

    # Graph weights & penalties
    distance_km = Column(Float, nullable=False, default=1.0)
    hazard_penalty = Column(Float, default=0.0, nullable=False)
    flood_penalty = Column(Float, default=0.0, nullable=False)
    congestion_penalty = Column(Float, default=0.0, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    is_bidirectional = Column(Boolean, default=True, nullable=False)

    # Verification metadata (Tier-2 Ground Truth)
    status = Column(Enum(RoadStatus), default=RoadStatus.clear, nullable=False)
    confidence_score = Column(Float, default=1.0, nullable=False)
    last_verified_survey_id = Column(Integer, ForeignKey("field_surveys.id", ondelete="SET NULL"), nullable=True, index=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)

    geom = Column(Geometry("LINESTRING", srid=4326, spatial_index=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("confidence_score >= 0.0 AND confidence_score <= 1.0", name="ck_roads_confidence_score"),
    )

    # Relationships
    from_intersection = relationship("Intersection", foreign_keys=[from_intersection_id], back_populates="outgoing_roads")
    to_intersection = relationship("Intersection", foreign_keys=[to_intersection_id], back_populates="incoming_roads")
    last_verified_survey = relationship("FieldSurvey", foreign_keys=[last_verified_survey_id])
    missions = relationship("Mission", back_populates="road")
    field_surveys = relationship("FieldSurvey", foreign_keys="[FieldSurvey.road_id]", back_populates="road")


# ─────────────────────────────────────────────
# 4. HAZARD ZONES (Danger Perimeters)
# ─────────────────────────────────────────────

class HazardZone(Base):
    """A geographic polygon representing an active hazard area."""
    __tablename__ = "hazard_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    hazard_type = Column(String(100), nullable=False)  # flood, landslide, fire, etc.
    severity = Column(Enum(HazardSeverity), default=HazardSeverity.LOW, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_survey_id = Column(Integer, ForeignKey("field_surveys.id", ondelete="SET NULL"), nullable=True, index=True)
    geom = Column(Geometry("POLYGON", srid=4326, spatial_index=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    last_verified_survey = relationship("FieldSurvey", foreign_keys=[last_verified_survey_id])


# ─────────────────────────────────────────────
# 5. INCIDENT REPORTS (Tier-1 Citizen Reports)
# ─────────────────────────────────────────────

class IncidentReport(Base):
    """Citizen crowdsourced incident report — UNVERIFIED by default."""
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)  # nullable for anonymous
    category = Column(String(100), nullable=False)  # flood, road_block, injury, fire, etc.
    description = Column(Text, nullable=True)
    status = Column(Enum(ReportStatus), default=ReportStatus.unverified, nullable=False)

    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)

    photo_url = Column(String(512), nullable=True)
    cluster_id = Column(Integer, ForeignKey("report_clusters.id", ondelete="SET NULL"), nullable=True, index=True)

    submitted_offline = Column(Boolean, default=False, nullable=False)
    client_timestamp = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    reporter = relationship("User", foreign_keys=[reporter_id], back_populates="reports")
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    cluster = relationship("ReportCluster", back_populates="reports")


# ─────────────────────────────────────────────
# 6. REPORT CLUSTERS (Aggregated Incidents)
# ─────────────────────────────────────────────

class ReportCluster(Base):
    """Spatial cluster of nearby unverified reports — unit for mission dispatch."""
    __tablename__ = "report_clusters"

    id = Column(Integer, primary_key=True, index=True)
    centroid_lat = Column(Float, nullable=False)
    centroid_lng = Column(Float, nullable=False)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    report_count = Column(Integer, default=1, nullable=False)
    priority_score = Column(Float, default=0.0, nullable=False)
    dominant_category = Column(String(100), nullable=True)
    status = Column(Enum(ReportClusterStatus), default=ReportClusterStatus.open, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    reports = relationship("IncidentReport", back_populates="cluster")
    missions = relationship("Mission", back_populates="cluster")
    field_surveys = relationship("FieldSurvey", back_populates="cluster")


# ─────────────────────────────────────────────
# 7. RESPONDERS (NGO Responder Profiles)
# ─────────────────────────────────────────────

class Responder(Base):
    """Dedicated NGO responder profile and location tracker."""
    __tablename__ = "responders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    ngo_name = Column(String(255), nullable=True)
    status = Column(Enum(ResponderStatus), default=ResponderStatus.available, nullable=False)
    verification_status = Column(String(50), default="verified", nullable=True)
    darpan_id = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)

    last_known_lat = Column(Float, nullable=True)
    last_known_lng = Column(Float, nullable=True)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="responder_profile")
    missions = relationship("Mission", foreign_keys="[Mission.responder_id]", back_populates="responder")
    field_surveys = relationship("FieldSurvey", foreign_keys="[FieldSurvey.responder_id]", back_populates="responder")


# ─────────────────────────────────────────────
# 8. MISSIONS (Field Dispatch Tasks)
# ─────────────────────────────────────────────

class Mission(Base):
    """Ground dispatch task assigned to an NGO responder."""
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    mission_type = Column(Enum(MissionType), nullable=False)
    status = Column(Enum(MissionStatus), default=MissionStatus.assigned, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    responder_id = Column(Integer, ForeignKey("responders.id", ondelete="SET NULL"), nullable=True, index=True)
    cluster_id = Column(Integer, ForeignKey("report_clusters.id", ondelete="SET NULL"), nullable=True, index=True)
    road_id = Column(Integer, ForeignKey("roads.id", ondelete="SET NULL"), nullable=True, index=True)
    hub_id = Column(Integer, ForeignKey("safety_hubs.id", ondelete="SET NULL"), nullable=True, index=True)

    target_lat = Column(Float, nullable=True)
    target_lng = Column(Float, nullable=True)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    responder = relationship("Responder", back_populates="missions")
    cluster = relationship("ReportCluster", back_populates="missions")
    road = relationship("Road", back_populates="missions")
    hub = relationship("SafetyHub", back_populates="missions")
    field_surveys = relationship("FieldSurvey", back_populates="mission")


# ─────────────────────────────────────────────
# 9. FIELD SURVEYS (Tier-2 Ground Truth)
# ─────────────────────────────────────────────

class FieldSurvey(Base):
    """Verified physical inspection submitted by a responder (Ground Truth)."""
    __tablename__ = "field_surveys"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("missions.id", ondelete="SET NULL"), nullable=True, index=True)
    responder_id = Column(Integer, ForeignKey("responders.id", ondelete="RESTRICT"), nullable=False, index=True)
    road_id = Column(Integer, ForeignKey("roads.id", ondelete="SET NULL"), nullable=True, index=True)
    cluster_id = Column(Integer, ForeignKey("report_clusters.id", ondelete="SET NULL"), nullable=True, index=True)

    # Physical on-site inspection coordinates & conditions
    observed_lat = Column(Float, nullable=True)
    observed_lng = Column(Float, nullable=True)
    observed_geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    observed_condition = Column(Text, nullable=True)

    # Observed road graph condition
    road_status = Column(Enum(RoadStatus), nullable=True)
    hazard_penalty = Column(Float, nullable=True)
    flood_penalty = Column(Float, nullable=True)
    congestion_penalty = Column(Float, nullable=True)
    is_blocked = Column(Boolean, nullable=True)

    # Ground truth verification attributes
    hazard_level = Column(Integer, nullable=True)  # 1 (low) → 5 (extreme)
    verification_outcome = Column(Enum(FieldSurveyVerificationOutcome), nullable=True)
    media_url = Column(String(512), nullable=True)

    notes = Column(Text, nullable=True)
    submitted_offline = Column(Boolean, default=False, nullable=False)
    client_timestamp = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("hazard_level IS NULL OR (hazard_level >= 1 AND hazard_level <= 5)", name="ck_field_surveys_hazard_level"),
    )

    # Relationships
    mission = relationship("Mission", back_populates="field_surveys")
    responder = relationship("Responder", back_populates="field_surveys")
    road = relationship("Road", foreign_keys=[road_id], back_populates="field_surveys")
    cluster = relationship("ReportCluster", back_populates="field_surveys")


# ─────────────────────────────────────────────
# 10. SAFETY HUBS (Relief Centers)
# ─────────────────────────────────────────────

class SafetyHub(Base):
    """Relief center, shelter, or supply depot."""
    __tablename__ = "safety_hubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)

    max_capacity = Column(Integer, nullable=False, default=500)
    current_occupancy = Column(Integer, default=0, nullable=False)
    status = Column(Enum(HubStatus), default=HubStatus.open, nullable=False)

    # Thresholds (% of max capacity or resource level)
    food_critical_threshold = Column(Float, default=0.20, nullable=False)
    water_critical_threshold = Column(Float, default=0.20, nullable=False)
    medical_critical_threshold = Column(Float, default=0.20, nullable=False)
    capacity_critical_threshold = Column(Float, default=0.85, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("current_occupancy >= 0", name="ck_safety_hubs_occupancy_non_negative"),
        CheckConstraint("max_capacity > 0", name="ck_safety_hubs_max_capacity_positive"),
    )

    # Relationships
    intersections = relationship("Intersection", back_populates="hub")
    resources = relationship("HubResource", back_populates="hub", cascade="all, delete-orphan")
    requirements = relationship("ResourceRequirement", back_populates="hub", cascade="all, delete-orphan")
    campaigns = relationship("Campaign", back_populates="hub")
    missions = relationship("Mission", back_populates="hub")
    map_geometry = relationship("HubMapGeometry", back_populates="hub", uselist=False, cascade="all, delete-orphan")


# ─────────────────────────────────────────────
# 11. HUB RESOURCES (Normalized Inventory)
# ─────────────────────────────────────────────

class HubResource(Base):
    """Normalized supply inventory per relief center."""
    __tablename__ = "hub_resources"

    id = Column(Integer, primary_key=True, index=True)
    hub_id = Column(Integer, ForeignKey("safety_hubs.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_type = Column(Enum(ResourceType), nullable=False)
    current_quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String(50), nullable=False, default="units")
    critical_threshold = Column(Float, nullable=False, default=100.0)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("current_quantity >= 0", name="ck_hub_resources_quantity_non_negative"),
        UniqueConstraint("hub_id", "resource_type", name="uq_hub_resource_type"),
    )

    # Relationships
    hub = relationship("SafetyHub", back_populates="resources")


# ─────────────────────────────────────────────
# 12. RESOURCE REQUIREMENTS (Demand / Shortages)
# ─────────────────────────────────────────────

class ResourceRequirement(Base):
    """Dynamic resource shortage or requisition for a safety hub."""
    __tablename__ = "resource_requirements"

    id = Column(Integer, primary_key=True, index=True)
    hub_id = Column(Integer, ForeignKey("safety_hubs.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_type = Column(Enum(ResourceType), nullable=False)
    required_quantity = Column(Float, nullable=False, default=0.0)
    fulfilled_quantity = Column(Float, nullable=False, default=0.0)
    shortfall_quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String(50), nullable=False, default="units")
    priority = Column(Integer, default=1, nullable=False)  # 1 (low) → 5 (urgent)
    status = Column(Enum(RequirementStatus), default=RequirementStatus.open, nullable=False)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("required_quantity >= 0", name="ck_resource_requirements_required_non_negative"),
        CheckConstraint("fulfilled_quantity >= 0", name="ck_resource_requirements_fulfilled_non_negative"),
        CheckConstraint("shortfall_quantity >= 0", name="ck_resource_requirements_shortfall_non_negative"),
        CheckConstraint("priority >= 1 AND priority <= 5", name="ck_resource_requirements_priority"),
    )

    # Relationships
    hub = relationship("SafetyHub", back_populates="requirements")
    campaigns = relationship("Campaign", back_populates="requirement")


# ─────────────────────────────────────────────
# 13. CAMPAIGNS (Relief Crowdfunding)
# ─────────────────────────────────────────────

class Campaign(Base):
    """Targeted fundraising campaign for a safety hub / NGO response."""
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(CampaignStatus), default=CampaignStatus.active, nullable=False)

    hub_id = Column(Integer, ForeignKey("safety_hubs.id", ondelete="SET NULL"), nullable=True, index=True)
    requirement_id = Column(Integer, ForeignKey("resource_requirements.id", ondelete="SET NULL"), nullable=True, index=True)
    ngo_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    resource_type = Column(Enum(ResourceType), nullable=True)

    target_amount = Column(Float, nullable=False, default=0.0)
    raised_amount = Column(Float, default=0.0, nullable=False)
    share_slug = Column(String(64), unique=True, nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("target_amount >= 0", name="ck_campaigns_target_non_negative"),
        CheckConstraint("raised_amount >= 0", name="ck_campaigns_raised_non_negative"),
    )

    # Relationships
    hub = relationship("SafetyHub", back_populates="campaigns")
    requirement = relationship("ResourceRequirement", back_populates="campaigns")
    ngo_user = relationship("User", foreign_keys=[ngo_user_id], back_populates="campaigns")
    donations = relationship("Donation", back_populates="campaign", cascade="all, delete-orphan")


# ─────────────────────────────────────────────
# 14. DONATIONS (Crowdfunding Ledger)
# ─────────────────────────────────────────────

class Donation(Base):
    """Mock / sandbox donation record for a relief campaign."""
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    donor_name = Column(String(255), nullable=True)
    amount = Column(Float, nullable=False)
    message = Column(Text, nullable=True)
    transaction_ref = Column(String(128), unique=True, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_donations_amount_positive"),
    )

    # Relationships
    campaign = relationship("Campaign", back_populates="donations")


# ─────────────────────────────────────────────
# 15. EMERGENCY ALERTS (Broadcast Notices)
# ─────────────────────────────────────────────

class EmergencyAlert(Base):
    """Emergency broadcast alert with optional multi-polygon zone coverage."""
    __tablename__ = "emergency_alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(Enum(AlertSeverity), default=AlertSeverity.ADVISORY, nullable=False)
    alert_type = Column(String(100), nullable=False)  # evacuation, flood_warning, shelter_update
    affected_area_geom = Column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    issued_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    issued_by = relationship("User", foreign_keys=[issued_by_id], back_populates="alerts_issued")


# ─────────────────────────────────────────────
# 16. SYNC QUEUE LOG (Offline Audit & Reconcile)
# ─────────────────────────────────────────────

class SyncQueueLog(Base):
    """Server-side audit of client offline sync queue operations."""
    __tablename__ = "sync_queue_log"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(128), nullable=False, index=True)
    operation_id = Column(String(64), unique=True, nullable=False, index=True)  # Idempotency key
    operation_type = Column(String(100), nullable=False)
    payload = Column(JSONB, nullable=True)
    client_timestamp = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="accepted", nullable=False)  # accepted | conflict | rejected
    conflict_notes = Column(Text, nullable=True)


# ─────────────────────────────────────────────
# 17. AUDIT LOGS (Administrative Audit Trail)
# ─────────────────────────────────────────────

class AuditLog(Base):
    """System-wide audit trail for administrative and operational mutations."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    old_values = Column(JSONB, nullable=True)
    new_values = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)

    # Relationships
    actor = relationship("User", foreign_keys=[actor_id], back_populates="audit_logs")


# ─────────────────────────────────────────────
# 18. NGO VERIFICATIONS (Accreditation Workbench)
# ─────────────────────────────────────────────

class NGOVerification(Base):
    """Accreditation application dossier for NGO units and statutory verification."""
    __tablename__ = "ngo_verifications"

    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String(100), unique=True, nullable=False, index=True)
    org_name = Column(String(255), nullable=False)
    org_type = Column(String(100), default="Disaster Relief NGO")
    darpan_id = Column(String(100), nullable=True)
    contact_person = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    status = Column(String(50), default="pending", nullable=False)  # pending, verified, rejected
    justification = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    metadata_info = Column("metadata", JSONB, default=dict, nullable=True)

    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


# ─────────────────────────────────────────────
# 19. SYSTEM CONFIGURATION
# ─────────────────────────────────────────────

class SystemConfig(Base):
    """Platform system configuration settings."""
    __tablename__ = "system_config"

    key = Column(String(100), primary_key=True)
    value = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


# ─────────────────────────────────────────────
# 20. HUB MAP GEOMETRY (Map Engine V2 — coordinator-authored)
# ─────────────────────────────────────────────

class HubMapGeometry(Base):
    """
    One-to-one spatial extension of SafetyHub carrying Map Engine V2 geometry.
    Stores entrance point and area polygon authored by a Coordinator on the map.
    Keeps Map Engine geometry separate from the business hub record.
    """
    __tablename__ = "hub_map_geometry"

    hub_id = Column(
        Integer,
        ForeignKey("safety_hubs.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    entrance_geom = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    area_geom = Column(Geometry("POLYGON", srid=4326, spatial_index=True), nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    capabilities = Column(JSONB, nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    hub = relationship("SafetyHub", back_populates="map_geometry")


# ─────────────────────────────────────────────
# 21. ROAD CLOSURES (Map Engine V2 — coordinator-authored)
# ─────────────────────────────────────────────

class RoadClosure(Base):
    """
    Coordinator-drawn road closure geometry stored in PostGIS.
    'full'  — entire named road is closed.
    'section' — a slice of a road between two points.
    road_id is an optional business link to the roads table (not used for routing geometry).
    """
    __tablename__ = "road_closures"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(10), nullable=False)   # 'full' | 'section'
    name = Column(String(255), nullable=False)
    geom = Column(Geometry("LINESTRING", srid=4326, spatial_index=True), nullable=False)

    # Optional business link — SET NULL on road deletion (not used for routing geometry)
    road_id = Column(
        Integer,
        ForeignKey("roads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    is_active = Column(Boolean, default=True, nullable=False)
    reason = Column(Text, nullable=True)

    created_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("kind IN ('full', 'section')", name="ck_road_closures_kind"),
    )

    # Relationships
    road = relationship("Road", foreign_keys=[road_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

