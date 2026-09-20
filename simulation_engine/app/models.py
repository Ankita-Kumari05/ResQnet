"""
Simulation Engine Models
Pure Pydantic models — zero database dependency.

SimulatedEvent is the normalized event representation used internally.
All source attribution lives here; it never enters the ResQnet DB schema.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Source Types ─────────────────────────────────────────────────────────────
# These are SIMULATION ENGINE metadata only.
# They do NOT map to any DB enum — the frozen schema has no source_type column.
# Source attribution in ResQnet is carried via [SIM] prefix in title/message fields.

class SourceType(str, Enum):
    SIMULATED_OFFICIAL = "SIMULATED_OFFICIAL"
    SIMULATED_SENSOR = "SIMULATED_SENSOR"
    SIMULATED_CITIZEN = "SIMULATED_CITIZEN"
    SIMULATED_RESPONDER = "SIMULATED_RESPONDER"
    SIMULATED_REMOTE_SENSING = "SIMULATED_REMOTE_SENSING"
    SIMULATION_ENGINE = "SIMULATION_ENGINE"


# ── Event Types ───────────────────────────────────────────────────────────────

class EventType(str, Enum):
    # Common / Shared
    CITIZEN_REPORT = "CITIZEN_REPORT"
    ROAD_BLOCKED = "ROAD_BLOCKED"
    RESPONDER_DISPATCH = "RESPONDER_DISPATCH"
    SHELTER_CAPACITY_CHANGED = "SHELTER_CAPACITY_CHANGED"
    SITUATION_UPDATE = "SITUATION_UPDATE"
    OFFICIAL_ALERT = "OFFICIAL_ALERT"

    # Flood Scenario (FLOOD_DEMO_01)
    FLOOD_WARNING = "FLOOD_WARNING"
    WATER_LEVEL_HIGH = "WATER_LEVEL_HIGH"

    # Earthquake Scenario (EARTHQUAKE_DEMO_01)
    EARTHQUAKE_WARNING = "EARTHQUAKE_WARNING"
    SEISMIC_EVENT = "SEISMIC_EVENT"
    STRUCTURAL_DAMAGE = "STRUCTURAL_DAMAGE"

    # Landslide Scenario (LANDSLIDE_DEMO_01)
    GEOLOGICAL_WARNING = "GEOLOGICAL_WARNING"
    LANDSLIDE_WARNING = "LANDSLIDE_WARNING"
    SLOPE_FAILURE = "SLOPE_FAILURE"
    ROAD_BLOCKAGE = "ROAD_BLOCKAGE"


# ── Event Delivery Status ─────────────────────────────────────────────────────

class EventStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


# ── Scenario State ────────────────────────────────────────────────────────────

class ScenarioState(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"


# ── Severity ──────────────────────────────────────────────────────────────────

class SimSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ── Core Normalized Event ─────────────────────────────────────────────────────

class SimulatedEvent(BaseModel):
    """
    Normalized simulated event. This is the internal representation.
    All delivery metadata lives here — never in the ResQnet DB.

    source_type and scenario_id mark the simulated origin of every event.
    They are never claimed to be live government, sensor, news, or social media data.
    """
    event_id: str = Field(..., description="Deterministic event ID — prevents duplicates")
    scenario_id: str = Field(..., description="Scenario that generated this event")
    source_type: SourceType = Field(..., description="Simulated source classification")
    source_label: str = Field(..., description="Human-readable source label for display")
    event_type: EventType
    timestamp: Optional[datetime] = None          # Wall clock when fired
    sim_offset_seconds: int                       # Scenario-relative time offset
    latitude: float
    longitude: float
    severity: SimSeverity
    confidence: float = Field(..., ge=0.0, le=1.0)
    title: str
    description: str
    api_target: str
    api_role: str
    api_payload: Dict[str, Any]
    status: EventStatus = EventStatus.PENDING
    resqnet_response: Optional[Dict[str, Any]] = None
    error_detail: Optional[str] = None
    delivered_at: Optional[datetime] = None
    chain_notes: str = ""
    chain_warning: str = ""


# ── Scenario Definition ───────────────────────────────────────────────────────

class ScenarioContext(BaseModel):
    """ResQnet seed entity IDs used by this scenario."""
    coordinator_email: str
    citizen_email: str
    responder_id: int
    hub_id: int
    hub_name: str
    hazard_zone_id: int
    hazard_zone_name: str
    road_id: int
    road_name: str
    incident_lat: float
    incident_lng: float


class HistoricalContext(BaseModel):
    """Historical background — NOT predictions."""
    note: str
    historical_flood_incidents: Optional[int] = None
    historical_seismic_incidents: Optional[int] = None
    historical_landslide_incidents: Optional[int] = None
    previously_affected_roads: Optional[List[str]] = None
    previously_affected_zones: Optional[List[str]] = None
    historical_recurrence: str
    disclaimer: str

    class Config:
        extra = "allow"


class ScenarioDefinition(BaseModel):
    """Loaded scenario definition from JSON config."""
    scenario_id: str
    name: str
    description: str
    version: str
    historical_context: HistoricalContext
    resqnet_context: ScenarioContext
    events: List[Dict[str, Any]]


# ── Runner State ──────────────────────────────────────────────────────────────

class RunnerState(BaseModel):
    """Serializable snapshot of runner state for API/UI consumption."""
    scenario_id: Optional[str] = None
    state: ScenarioState = ScenarioState.IDLE
    speed_multiplier: int = 1
    elapsed_sim_seconds: float = 0.0
    sim_time_display: str = "T+00:00"
    total_events: int = 0
    events_fired: int = 0
    events_delivered: int = 0
    events_failed: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    # Runtime-resolved IDs (e.g. cluster created during run)
    resolved_cluster_id: Optional[int] = None
    resolved_responder_profile_id: Optional[int] = None


# ── Event Log Entry ───────────────────────────────────────────────────────────

class EventLogEntry(BaseModel):
    """Single entry in the simulation event log."""
    sim_time: str
    event_id: str
    source_type: SourceType
    source_label: str
    event_type: EventType
    lat: float
    lng: float
    severity: SimSeverity
    confidence: float
    description: str
    api_target: str
    status: EventStatus
    resqnet_response_summary: Optional[str] = None
    error_detail: Optional[str] = None
    delivered_at: Optional[datetime] = None
    chain_notes: str = ""
    chain_warning: str = ""
