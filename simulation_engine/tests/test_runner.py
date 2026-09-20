"""
Tests: Scenario Runner (unit tests — no live ResQnet connection required)
Verifies state machine transitions, speed, pause/resume, reset.
Uses asyncio and a mock API client.
"""
import asyncio
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.clock import SimulatedClock
from app.event_log import EventLog
from app.models import EventStatus, ScenarioState, SimulatedEvent, SourceType, EventType, SimSeverity
from app.runner import ScenarioRunner

SCENARIO_DIR = os.path.join(os.path.dirname(__file__), "..", "config")


def make_runner():
    """Create a fresh runner with a real event log."""
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    return runner, log


def run(coro):
    """Run an async coroutine in tests."""
    return asyncio.get_event_loop().run_until_complete(coro)


class TestRunnerStateMachine:

    def test_initial_state(self):
        """Runner starts in IDLE state."""
        runner, _ = make_runner()
        state = runner.get_state()
        assert state.state == ScenarioState.IDLE

    def test_load_scenario(self):
        """Loading scenario populates events."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        state = runner.get_state()
        assert state.total_events == 7
        assert state.scenario_id == "FLOOD_DEMO_01"

    def test_get_state_returns_runner_state(self):
        """get_state() returns a RunnerState with correct fields."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        state = runner.get_state()
        assert state.speed_multiplier == 1
        assert state.elapsed_sim_seconds == 0.0
        assert state.sim_time_display == "T+00:00"

    def test_set_speed_changes_clock(self):
        """set_speed() changes the clock's speed multiplier."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        runner.set_speed(10)
        assert runner._clock.speed_multiplier == 10

    def test_invalid_speed_raises(self):
        """set_speed() with invalid multiplier raises ValueError."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        with pytest.raises(ValueError):
            runner.set_speed(7)

    def test_reset_clears_state(self):
        """reset() returns runner to IDLE and clears event log."""
        runner, log = make_runner()
        runner.load("FLOOD_DEMO_01")

        # Simulate some state
        runner._clock.start()
        runner._state = ScenarioState.RUNNING
        runner._events_fired = 3

        # Mock the ResQnet reset call
        with patch("app.runner.ResQnetClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_instance.authenticate = AsyncMock()
            mock_instance._coordinator_headers = MagicMock(return_value={})
            mock_instance._client = MagicMock()

            import httpx
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value={"event": "simulation_reset"})
            mock_http_client = AsyncMock()
            mock_http_client.post = AsyncMock(return_value=mock_response)
            mock_instance._client.return_value = mock_http_client
            MockClient.return_value = mock_instance

            result = run(runner.reset())

        state = runner.get_state()
        assert state.state == ScenarioState.IDLE
        assert state.events_fired == 0
        assert len(log.get_entries()) == 0

    def test_events_start_as_pending(self):
        """All events should start with PENDING status."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        for evt in runner._events:
            assert evt.status == EventStatus.PENDING

    def test_pause_not_running_is_noop(self):
        """Pausing when not running should not change state."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        run(runner.pause())  # Should be a no-op
        assert runner._state == ScenarioState.IDLE

    def test_resume_not_paused_is_noop(self):
        """Resuming when not paused should not change state."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        run(runner.resume())  # Should be a no-op
        assert runner._state == ScenarioState.IDLE

    def test_event_ids_are_deterministic(self):
        """Event IDs must be deterministic across loads."""
        runner1, _ = make_runner()
        runner1.load("FLOOD_DEMO_01")
        ids1 = [e.event_id for e in runner1._events]

        runner2, _ = make_runner()
        runner2.load("FLOOD_DEMO_01")
        ids2 = [e.event_id for e in runner2._events]

        assert ids1 == ids2

    def test_summarize_response_alert(self):
        """summarize_response should produce readable strings for alert events."""
        from app.runner import ScenarioRunner
        summary = ScenarioRunner._summarize_response(
            "FLOOD_WARNING",
            {"id": 42, "severity": "EMERGENCY"}
        )
        assert "42" in summary
        assert "EMERGENCY" in summary

    def test_summarize_response_road(self):
        """summarize_response for ROAD_BLOCKED."""
        from app.runner import ScenarioRunner
        summary = ScenarioRunner._summarize_response(
            "ROAD_BLOCKED",
            {"road_id": 12, "blocked": True}
        )
        assert "12" in summary
        assert "True" in summary

    def test_clock_speed_in_state(self):
        """Speed multiplier should be reflected in runner state."""
        runner, _ = make_runner()
        runner.load("FLOOD_DEMO_01")
        runner.set_speed(5)
        state = runner.get_state()
        assert state.speed_multiplier == 5
