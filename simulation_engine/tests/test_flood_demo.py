"""
Tests: Full FLOOD_DEMO_01 Scenario (unit tests — no live ResQnet required)
Verifies the complete scenario structure, event models, and event generator.
Live integration tests are in test_integration_live.py (requires ResQnet running).
"""
import os
import pytest

from app.event_generator import build_events_from_scenario
from app.models import EventType, SourceType, ScenarioState, SimSeverity
from app.scenario_loader import load_scenario

SCENARIO_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


class TestFloodDemo01Scenario:

    def setup_method(self):
        self.scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        self.events = build_events_from_scenario(
            self.scenario.events, self.scenario.scenario_id
        )

    def test_event_count(self):
        """Should produce exactly 7 events."""
        assert len(self.events) == 7

    def test_scenario_id_injected(self):
        """scenario_id should be injected into every event."""
        for evt in self.events:
            assert evt.scenario_id == "FLOOD_DEMO_01"

    def test_event_types_in_order(self):
        """Events should be in correct scenario order."""
        expected_order = [
            EventType.FLOOD_WARNING,
            EventType.WATER_LEVEL_HIGH,
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
            EventType.FLOOD_WARNING: SourceType.SIMULATED_OFFICIAL,
            EventType.WATER_LEVEL_HIGH: SourceType.SIMULATED_SENSOR,
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
        """Event offsets must match scenario specification."""
        offsets = [e.sim_offset_seconds for e in self.events]
        assert offsets == [0, 10, 20, 30, 40, 50, 60]

    def test_all_events_have_api_target(self):
        """Every event must have an API target."""
        for evt in self.events:
            assert evt.api_target, f"Missing api_target for {evt.event_type}"

    def test_flood_warning_api_target(self):
        """FLOOD_WARNING must target real alerts API."""
        warning = self.events[0]
        assert "/api/v1/alerts" in warning.api_target
        assert warning.event_type == EventType.FLOOD_WARNING

    def test_water_level_api_target(self):
        """WATER_LEVEL_HIGH must target simulation flood endpoint."""
        water = self.events[1]
        assert "/api/simulation/events/flood" in water.api_target

    def test_citizen_report_api_target(self):
        """CITIZEN_REPORT must target simulation reports endpoint (unverified path)."""
        report = self.events[2]
        assert "/api/simulation/events/reports/generate" in report.api_target

    def test_road_blocked_api_target(self):
        """ROAD_BLOCKED must target simulation road block endpoint."""
        road = self.events[3]
        assert "/api/simulation/events/road/block" in road.api_target

    def test_responder_dispatch_api_target(self):
        """RESPONDER_DISPATCH must target real missions API (not simulation dispatch)."""
        dispatch = self.events[4]
        assert "/api/v1/missions" in dispatch.api_target
        # CRITICAL: Must NOT call /api/simulation/events/dispatch (would duplicate)
        assert "/api/simulation/events/dispatch" not in dispatch.api_target

    def test_shelter_capacity_api_target(self):
        """SHELTER_CAPACITY_CHANGED must target real hub occupancy API."""
        hub = self.events[5]
        assert "/api/v1/hubs" in hub.api_target
        assert "occupancy" in hub.api_target

    def test_situation_update_api_target(self):
        """SITUATION_UPDATE must target real alerts API."""
        update = self.events[6]
        assert "/api/v1/alerts" in update.api_target

    def test_water_level_hazard_zone_id(self):
        """WATER_LEVEL_HIGH should activate hazard zone 1 (River Basin)."""
        water = self.events[1]
        assert water.api_payload.get("zone_id") == 1

    def test_road_blocked_road_id(self):
        """ROAD_BLOCKED should block road 12 (Flood-Prone River Road)."""
        road = self.events[3]
        assert road.api_payload.get("road_id") == 12

    def test_shelter_capacity_hub_id_and_delta(self):
        """SHELTER_CAPACITY_CHANGED should target hub 1 with positive delta."""
        hub = self.events[5]
        assert hub.api_payload.get("hub_id") == 1
        assert hub.api_payload.get("delta", 0) > 0

    def test_all_events_have_sim_label(self):
        """All events requiring ResQnet API payloads should have [SIM] prefix."""
        events_with_title = [e for e in self.events if "title" in e.api_payload]
        for evt in events_with_title:
            assert "[SIM]" in evt.api_payload["title"], (
                f"{evt.event_type}: title missing [SIM] prefix: {evt.api_payload.get('title')}"
            )

    def test_no_event_has_direct_db_api(self):
        """No event should target a direct database or SQL endpoint."""
        forbidden = ["sql", "psql", "postgres", "/db/", "/raw/"]
        for evt in self.events:
            for f in forbidden:
                assert f not in evt.api_target.lower(), (
                    f"Event {evt.event_type} targets a DB endpoint: {evt.api_target}"
                )

    def test_confidence_scores_in_range(self):
        """All confidence scores must be between 0 and 1."""
        for evt in self.events:
            assert 0.0 <= evt.confidence <= 1.0, (
                f"{evt.event_type}: confidence {evt.confidence} out of range"
            )

    def test_all_events_start_pending(self):
        """All events from build_events_from_scenario start as PENDING."""
        from app.models import EventStatus
        for evt in self.events:
            assert evt.status == EventStatus.PENDING

    def test_event_ids_are_deterministic(self):
        """Rebuilding events from same scenario produces same IDs."""
        events2 = build_events_from_scenario(
            self.scenario.events, self.scenario.scenario_id
        )
        ids1 = [e.event_id for e in self.events]
        ids2 = [e.event_id for e in events2]
        assert ids1 == ids2

    def test_no_duplicate_event_ids(self):
        """No two events should have the same event_id."""
        ids = [e.event_id for e in self.events]
        assert len(ids) == len(set(ids))

    def test_chain_notes_not_empty(self):
        """Events should have chain_notes documenting the API chain."""
        for evt in self.events:
            assert evt.chain_notes, f"{evt.event_type} has no chain_notes"

    def test_historical_context_is_historical(self):
        """Historical context must not claim predictive accuracy."""
        hc = self.scenario.historical_context
        disclaimer = hc.disclaimer.lower()
        # Should NOT claim predictions
        assert "predict" not in disclaimer or "not" in disclaimer or "no" in disclaimer
        # Should have a disclaimer note
        assert len(hc.disclaimer) > 10
