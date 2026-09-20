"""
Tests: Scenario Loader
Verifies loading, validation, ordering, and duplicate ID detection.
"""
import json
import os
import tempfile
import pytest

from app.scenario_loader import load_scenario, list_available_scenarios


SCENARIO_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


class TestScenarioLoader:

    def test_load_flood_demo_01(self):
        """Should load FLOOD_DEMO_01 without errors."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        assert scenario.scenario_id == "FLOOD_DEMO_01"
        assert scenario.name != ""
        assert len(scenario.events) == 7

    def test_event_count(self):
        """Should have exactly 7 events."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        assert len(scenario.events) == 7

    def test_event_ordering(self):
        """Events must be in non-decreasing offset_seconds order."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        offsets = [e["offset_seconds"] for e in scenario.events]
        assert offsets == sorted(offsets), f"Events are out of order: {offsets}"

    def test_event_id_uniqueness(self):
        """All event_ids must be unique."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        ids = [e["event_id"] for e in scenario.events]
        assert len(ids) == len(set(ids)), f"Duplicate event_ids found: {ids}"

    def test_expected_event_types(self):
        """Verify all 7 expected event types are present."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        types = {e["event_type"] for e in scenario.events}
        expected = {
            "FLOOD_WARNING",
            "WATER_LEVEL_HIGH",
            "CITIZEN_REPORT",
            "ROAD_BLOCKED",
            "RESPONDER_DISPATCH",
            "SHELTER_CAPACITY_CHANGED",
            "SITUATION_UPDATE",
        }
        assert types == expected, f"Missing event types: {expected - types}"

    def test_event_offsets(self):
        """Verify the exact timeline offsets."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        offsets = [e["offset_seconds"] for e in scenario.events]
        assert offsets == [0, 10, 20, 30, 40, 50, 60]

    def test_all_events_have_api_target(self):
        """Every event must specify an api_target."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        for evt in scenario.events:
            assert evt.get("api_target"), f"Event {evt['event_id']} missing api_target"

    def test_resqnet_context_has_required_ids(self):
        """ResQnet context must provide required seed entity IDs."""
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=SCENARIO_DIR)
        ctx = scenario.resqnet_context
        assert ctx.hazard_zone_id == 1
        assert ctx.road_id == 12
        assert ctx.hub_id == 1
        assert ctx.responder_id == 1

    def test_file_not_found(self):
        """Should raise FileNotFoundError for missing scenario."""
        with pytest.raises(FileNotFoundError):
            load_scenario("NONEXISTENT_SCENARIO", scenario_dir=SCENARIO_DIR)

    def test_out_of_order_events_rejected(self):
        """Scenario with out-of-order events should fail validation."""
        bad_scenario = {
            "scenario_id": "TEST_BAD",
            "name": "Bad Scenario",
            "description": "test",
            "version": "1.0",
            "historical_context": {
                "note": "test",
                "historical_flood_incidents": 0,
                "previously_affected_roads": [],
                "historical_recurrence": "none",
                "disclaimer": "test",
            },
            "resqnet_context": {
                "coordinator_email": "a@b.com",
                "citizen_email": "c@d.com",
                "responder_id": 1,
                "hub_id": 1,
                "hub_name": "Hub",
                "hazard_zone_id": 1,
                "hazard_zone_name": "Zone",
                "road_id": 1,
                "road_name": "Road",
                "incident_lat": 0.0,
                "incident_lng": 0.0,
            },
            "events": [
                {"event_id": "E1", "offset_seconds": 30, "event_type": "FLOOD_WARNING",
                 "source_type": "SIMULATED_OFFICIAL", "lat": 0.0, "lng": 0.0},
                {"event_id": "E2", "offset_seconds": 10, "event_type": "WATER_LEVEL_HIGH",
                 "source_type": "SIMULATED_SENSOR", "lat": 0.0, "lng": 0.0},
            ],
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "TEST_BAD.json")
            with open(path, "w") as f:
                json.dump(bad_scenario, f)
            with pytest.raises(ValueError, match="out of order"):
                load_scenario("TEST_BAD", scenario_dir=tmpdir)

    def test_duplicate_event_ids_rejected(self):
        """Scenario with duplicate event_ids should fail validation."""
        bad_scenario = {
            "scenario_id": "TEST_DUP",
            "name": "Dup Scenario",
            "description": "test",
            "version": "1.0",
            "historical_context": {
                "note": "test", "historical_flood_incidents": 0,
                "previously_affected_roads": [], "historical_recurrence": "none",
                "disclaimer": "test",
            },
            "resqnet_context": {
                "coordinator_email": "a@b.com", "citizen_email": "c@d.com",
                "responder_id": 1, "hub_id": 1, "hub_name": "Hub",
                "hazard_zone_id": 1, "hazard_zone_name": "Zone",
                "road_id": 1, "road_name": "Road",
                "incident_lat": 0.0, "incident_lng": 0.0,
            },
            "events": [
                {"event_id": "SAME_ID", "offset_seconds": 0, "event_type": "FLOOD_WARNING",
                 "source_type": "SIMULATED_OFFICIAL", "lat": 0.0, "lng": 0.0},
                {"event_id": "SAME_ID", "offset_seconds": 10, "event_type": "WATER_LEVEL_HIGH",
                 "source_type": "SIMULATED_SENSOR", "lat": 0.0, "lng": 0.0},
            ],
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "TEST_DUP.json")
            with open(path, "w") as f:
                json.dump(bad_scenario, f)
            with pytest.raises(ValueError, match="Duplicate event_id"):
                load_scenario("TEST_DUP", scenario_dir=tmpdir)

    def test_list_available_scenarios(self):
        """Should list all 3 scenarios: FLOOD_DEMO_01, EARTHQUAKE_DEMO_01, LANDSLIDE_DEMO_01."""
        scenarios = list_available_scenarios(scenario_dir=SCENARIO_DIR)
        assert "FLOOD_DEMO_01" in scenarios
        assert "EARTHQUAKE_DEMO_01" in scenarios
        assert "LANDSLIDE_DEMO_01" in scenarios

    def test_load_all_three_scenarios(self):
        """Should successfully load all three scenarios through the generic loader."""
        for sc_id in ["FLOOD_DEMO_01", "EARTHQUAKE_DEMO_01", "LANDSLIDE_DEMO_01"]:
            scenario = load_scenario(sc_id, scenario_dir=SCENARIO_DIR)
            assert scenario.scenario_id == sc_id
            assert len(scenario.events) == 7

