"""
Simulation Engine Event Generator
Converts raw scenario event definitions (from JSON) into typed SimulatedEvent objects.

Chain analysis is embedded in each builder to document exactly what ResQnet business
logic each event exercises.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.models import (
    EventStatus,
    EventType,
    SimSeverity,
    SimulatedEvent,
    SourceType,
)


def _make_event(raw: Dict[str, Any]) -> SimulatedEvent:
    """Build a SimulatedEvent from a raw scenario event dict."""
    return SimulatedEvent(
        event_id=raw["event_id"],
        scenario_id="",                         # Will be set by runner
        source_type=SourceType(raw["source_type"]),
        source_label=raw.get("source_label", raw["source_type"]),
        event_type=EventType(raw["event_type"]),
        sim_offset_seconds=raw["offset_seconds"],
        latitude=raw["lat"],
        longitude=raw["lng"],
        severity=SimSeverity(raw.get("severity", "MEDIUM")),
        confidence=raw.get("confidence", 0.7),
        title=raw.get("title", raw["event_type"]),
        description=raw.get("description", ""),
        api_target=raw.get("api_target", "UNKNOWN"),
        api_role=raw.get("api_role", "coordinator"),
        api_payload=raw.get("api_payload", raw.get("api_payload_template", {})),
        status=EventStatus.PENDING,
        chain_notes=raw.get("chain_notes", ""),
        chain_warning=raw.get("chain_warning", ""),
    )


def build_events_from_scenario(
    scenario_events: list,
    scenario_id: str,
) -> list:
    """
    Convert list of raw event dicts from scenario JSON into SimulatedEvent list.
    Injects scenario_id into each event.

    Returns list ordered by offset_seconds (scenario JSON must already be ordered).
    """
    events = []
    for raw in scenario_events:
        evt = _make_event(raw)
        evt.scenario_id = scenario_id
        events.append(evt)
    return events
