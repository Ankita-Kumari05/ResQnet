"""
Tests: Full LANDSLIDE_DEMO_01 Scenario (unit tests — no live ResQnet required)
Verifies the complete scenario structure, event models, and event generator for Landslide.
"""
import os
import pytest

from app.event_generator import build_events_from_scenario
from app.models import EventType, SourceType, SimSeverity
from app.scenario_loader import load_scenario

SCENARIO_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


class TestLandslideDemo01Scenario:

    def setup_method(self):
        self.scenario = load_scenario("LANDSLIDE_DEMO_01", scenario_dir=SCENARIO_DIR)
        self.events = build_events_from_scenario(
            self.scenario.events, self.scenario.scenario_id
        )

    def test_event_count(self):
        """Should produce exactly 7 events."""
        assert len(self.events) == 7

    def test_scenario_id_injected(self):
        """scenario_id should be injected into every event."""
        for evt in self.events:
            assert evt.scenario_id == "LANDSLIDE_DEMO_01"

    def test_event_types_in_order(self):
        """Events should be in correct scenario order."""
        expected_order = [
            EventType.LANDSLIDE_WARNING,
            EventType.SLOPE_FAILURE,
            EventType.CITIZEN_REPORT,
            EventType.ROAD_BLOCKED,
            EventType.RESPONDER_DISPATCH,
            EventType.SHELTER_CAPACITY_CHANGED,
            EventType.SITUATION_UPDATE,
        ]
        actual_order = [e.event_type for e in self.events]
        assert actual_order == expected_order

    def test_source_types(self):
        """Each event should have the correct source type."""
        expected_sources = {
            EventType.LANDSLIDE_WARNING: SourceType.SIMULATED_OFFICIAL,
            EventType.SLOPE_FAILURE: SourceType.SIMULATED_SENSOR,
            EventType.CITIZEN_REPORT: SourceType.SIMULATED_CITIZEN,
            EventType.ROAD_BLOCKED: SourceType.SIMULATED_RESPONDER,
            EventType.RESPONDER_DISPATCH: SourceType.SIMULATED_RESPONDER,
            EventType.SHELTER_CAPACITY_CHANGED: SourceType.SIMULATED_SENSOR,
            EventType.SITUATION_UPDATE: SourceType.SIMULATION_ENGINE,
        }
        for evt in self.events:
            assert evt.source_type == expected_sources[evt.event_type], (
                f"{evt.event_type}: expected {expected_sources[evt.event_type]}, got {evt.source_type}"
            )

    def test_offsets_correct(self):
        """Event offsets must match scenario specification: T+00, T+10, T+20, T+30, T+40, T+50, T+60."""
        offsets = [e.sim_offset_seconds for e in self.events]
        assert offsets == [0, 10, 20, 30, 40, 50, 60]

    def test_all_events_have_api_target(self):
        """Every event must have an authenticated API target."""
        for evt in self.events:
            assert evt.api_target, f"Missing api_target for {evt.event_type}"

    def test_landslide_warning_api_target(self):
        """LANDSLIDE_WARNING must target real alerts API."""
        warning = self.events[0]
        assert "/api/v1/alerts" in warning.api_target
        assert warning.event_type == EventType.LANDSLIDE_WARNING

    def test_slope_failure_api_target(self):
        """SLOPE_FAILURE must target hazard activation endpoint."""
        slope = self.events[1]
        assert "/api/simulation/events/flood" in slope.api_target
        assert slope.api_payload.get("zone_id") == 2

    def test_citizen_report_api_target(self):
        """CITIZEN_REPORT must target simulation reports endpoint (unverified path)."""
        report = self.events[2]
        assert "/api/simulation/events/reports/generate" in report.api_target
        assert report.api_payload.get("category") == "landslide"

    def test_road_blocked_api_target(self):
        """ROAD_BLOCKED must target road block endpoint for North Market Road (ID 1)."""
        blockage = self.events[3]
        assert "/api/simulation/events/road/block" in blockage.api_target
        assert blockage.api_payload.get("road_id") == 1
        assert blockage.api_payload.get("block") is True

    def test_responder_dispatch_api_target(self):
        """RESPONDER_DISPATCH must target real missions API (not simulation dispatch)."""
        dispatch = self.events[4]
        assert "/api/v1/missions" in dispatch.api_target
        assert "/api/simulation/events/dispatch" not in dispatch.api_target

    def test_shelter_capacity_api_target(self):
        """SHELTER_CAPACITY_CHANGED must target Hub Beta occupancy endpoint."""
        shelter = self.events[5]
        assert "/api/v1/hubs" in shelter.api_target
        assert "occupancy" in shelter.api_target
        assert shelter.api_payload.get("hub_id") == 2

    def test_situation_update_api_target(self):
        """SITUATION_UPDATE must target alerts API."""
        update = self.events[6]
        assert "/api/v1/alerts" in update.api_target
        assert update.event_type == EventType.SITUATION_UPDATE

    def test_all_events_have_simulated_attribution(self):
        """Every event description must include [SIM] tag."""
        for evt in self.events:
            assert "[SIM" in evt.description, f"Missing [SIM] attribution: {evt.event_id}"

    def test_no_event_has_direct_db_api(self):
        """No event may bypass HTTP API to touch DB."""
        for evt in self.events:
            assert not evt.api_target.startswith("db:"), f"Direct DB API found in {evt.event_id}"
            assert not evt.api_target.startswith("sql:"), f"Direct SQL found in {evt.event_id}"

    def test_event_ids_are_deterministic(self):
        """Event IDs must start with LANDSLIDE_DEMO_01_."""
        for evt in self.events:
            assert evt.event_id.startswith("LANDSLIDE_DEMO_01_")

    def test_no_duplicate_event_ids(self):
        """All event IDs must be unique."""
        ids = [e.event_id for e in self.events]
        assert len(ids) == len(set(ids))

    def test_chain_notes_not_empty(self):
        """Every event must have documented chain notes."""
        for evt in self.events:
            assert evt.chain_notes, f"Missing chain_notes for {evt.event_id}"

    def test_historical_context_is_historical(self):
        """Historical context must not claim real-time AI prediction."""
        ctx = self.scenario.historical_context
        assert "PREDICTION" not in ctx.note or "NOT" in ctx.note
        assert "predictive accuracy" in ctx.disclaimer.lower()
