"""
Simulation Engine Runner
Manages scenario lifecycle: START → PAUSE → RESUME → RESET → COMPLETE

State machine:
  IDLE      → start()  → RUNNING
  RUNNING   → pause()  → PAUSED
  PAUSED    → resume() → RUNNING
  RUNNING   → all events fired → COMPLETED
  any state → reset()  → IDLE

The runner fires events when simulated clock reaches each event's offset_seconds.
It does NOT poll on a fixed timer — it calculates how long to sleep before the
next event using (next_offset - current_sim_time) / speed_multiplier.

RESET SAFETY:
  reset() resets ONLY simulation engine state (clock, log, event queue).
  It does NOT delete ResQnet database records.
  It calls /api/simulation/events/reset to restore road/hazard state
  (roads → CLEAR, hazard zones → inactive) — this is a safe operational reset,
  NOT a destructive DB wipe. Reports and AuditLog entries are preserved.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from app.api_client import ResQnetClient
from app.clock import SimulatedClock
from app.config import get_sim_settings
from app.event_generator import build_events_from_scenario
from app.event_log import EventLog
from app.models import (
    EventStatus,
    RunnerState,
    ScenarioDefinition,
    ScenarioState,
    SimulatedEvent,
)
from app.scenario_loader import load_scenario

logger = logging.getLogger("sim.runner")


class ScenarioRunner:
    """
    Drives the FLOOD_DEMO_01 (or any loaded scenario) event timeline.

    Thread safety: asyncio-based. All state mutations happen in the event loop.
    External control (start/pause/resume/reset) may be called from FastAPI handlers.
    """

    def __init__(self, event_log: EventLog):
        self._event_log = event_log
        self._state = ScenarioState.IDLE
        self._clock = SimulatedClock()
        self._scenario: Optional[ScenarioDefinition] = None
        self._events: List[SimulatedEvent] = []
        self._events_fired: int = 0
        self._started_at: Optional[datetime] = None
        self._completed_at: Optional[datetime] = None
        self._runner_task: Optional[asyncio.Task] = None
        self._resolved_cluster_id: Optional[int] = None
        self._resolved_responder_id: Optional[int] = None

    # ── Public Control Interface ─────────────────────────────────────────────

    def load(self, scenario_id: str = "FLOOD_DEMO_01") -> None:
        """Load scenario from config. Can be called in IDLE or after RESET."""
        settings = get_sim_settings()
        self._scenario = load_scenario(scenario_id, scenario_dir=settings.SCENARIO_DIR)
        self._events = build_events_from_scenario(
            self._scenario.events, self._scenario.scenario_id
        )
        logger.info(
            f"Scenario loaded: {scenario_id} — {len(self._events)} events"
        )

    async def start(self, speed: int = 1) -> None:
        """Start the scenario from the beginning."""
        if self._state == ScenarioState.RUNNING:
            logger.warning("Runner already running")
            return
        if self._state == ScenarioState.COMPLETED:
            logger.warning("Scenario completed — reset first")
            return

        if self._scenario is None:
            self.load()

        self._clock.set_speed(speed)
        self._clock.start()
        self._state = ScenarioState.RUNNING
        self._started_at = datetime.now(timezone.utc)
        self._events_fired = 0
        self._resolved_cluster_id = None
        self._resolved_responder_id = None

        # Cancel any stale task
        if self._runner_task and not self._runner_task.done():
            self._runner_task.cancel()

        self._runner_task = asyncio.create_task(self._run_loop())
        logger.info(f"Simulation started (speed={speed}x)")

    async def pause(self) -> None:
        """Pause the running scenario."""
        if self._state != ScenarioState.RUNNING:
            return
        self._clock.pause()
        self._state = ScenarioState.PAUSED
        logger.info("Simulation paused")

    async def resume(self) -> None:
        """Resume from paused state."""
        if self._state != ScenarioState.PAUSED:
            return
        self._clock.resume()
        self._state = ScenarioState.RUNNING

        # Restart the loop task
        if self._runner_task is None or self._runner_task.done():
            self._runner_task = asyncio.create_task(self._run_loop())
        logger.info("Simulation resumed")

    async def reset(self) -> dict:
        """
        Reset simulation engine state.

        SAFETY CONTRACT:
        - Clock resets to T+0
        - Event log clears
        - Events queue resets to PENDING
        - Runner state returns to IDLE
        - Calls /api/simulation/events/reset to restore road/hazard operational state
          (roads → CLEAR, hazard zones → deactivated)
        - Does NOT delete any ResQnet audit logs, reports, or missions
        - Does NOT drop tables, truncate, or run destructive SQL
        """
        if self._runner_task and not self._runner_task.done():
            self._runner_task.cancel()
            try:
                await self._runner_task
            except asyncio.CancelledError:
                pass

        self._clock.reset()
        self._state = ScenarioState.IDLE
        self._events_fired = 0
        self._started_at = None
        self._completed_at = None
        self._resolved_cluster_id = None
        self._resolved_responder_id = None
        self._event_log.clear()

        # Reset events to PENDING
        if self._events:
            for evt in self._events:
                evt.status = EventStatus.PENDING

        # Call ResQnet's safe reset endpoint
        settings = get_sim_settings()
        reset_result = {"resqnet_reset": "not_called", "reason": ""}

        try:
            async with ResQnetClient(
                base_url=settings.RESQNET_BASE_URL,
                coordinator_email=settings.SIM_COORDINATOR_EMAIL,
                coordinator_password=settings.SIM_COORDINATOR_PASSWORD,
                citizen_email=settings.SIM_CITIZEN_EMAIL,
                citizen_password=settings.SIM_CITIZEN_PASSWORD,
            ) as client:
                await client.authenticate()
                import httpx
                resp = await client._client().post(
                    f"{settings.RESQNET_BASE_URL}/api/simulation/events/reset",
                    headers=client._coordinator_headers(),
                )
                if resp.status_code == 200:
                    reset_result = {"resqnet_reset": "success", "detail": resp.json()}
                    logger.info("ResQnet operational state reset (roads clear, hazard zones inactive)")
                else:
                    reset_result = {
                        "resqnet_reset": "failed",
                        "status": resp.status_code,
                        "detail": resp.text[:200],
                    }
                    logger.warning(f"ResQnet reset returned {resp.status_code}")
        except Exception as e:
            reset_result = {"resqnet_reset": "error", "reason": str(e)}
            logger.warning(f"Could not call ResQnet reset: {e}")

        logger.info("Simulation engine state reset complete")
        return reset_result

    def set_speed(self, speed: int) -> None:
        """Change speed multiplier (1, 5, 10)."""
        self._clock.set_speed(speed)

    def get_state(self) -> RunnerState:
        """Return current runner state snapshot."""
        elapsed = self._clock.elapsed_sim_seconds
        return RunnerState(
            scenario_id=self._scenario.scenario_id if self._scenario else None,
            state=self._state,
            speed_multiplier=self._clock.speed_multiplier,
            elapsed_sim_seconds=elapsed,
            sim_time_display=self._clock.format_sim_time(elapsed),
            total_events=len(self._events),
            events_fired=self._events_fired,
            events_delivered=sum(
                1 for e in self._events if e.status == EventStatus.ACKNOWLEDGED
            ),
            events_failed=sum(
                1 for e in self._events if e.status == EventStatus.FAILED
            ),
            started_at=self._started_at,
            completed_at=self._completed_at,
            resolved_cluster_id=self._resolved_cluster_id,
            resolved_responder_profile_id=self._resolved_responder_id,
        )

    # ── Internal Run Loop ────────────────────────────────────────────────────

    async def _run_loop(self) -> None:
        """
        Main event loop. Fires events at their scenario-relative offsets.
        Uses asyncio.sleep() for inter-event waiting (adjusted by speed multiplier).
        """
        settings = get_sim_settings()

        async with ResQnetClient(
            base_url=settings.RESQNET_BASE_URL,
            coordinator_email=settings.SIM_COORDINATOR_EMAIL,
            coordinator_password=settings.SIM_COORDINATOR_PASSWORD,
            citizen_email=settings.SIM_CITIZEN_EMAIL,
            citizen_password=settings.SIM_CITIZEN_PASSWORD,
        ) as client:
            try:
                await client.authenticate()
            except Exception as e:
                logger.error(f"Authentication failed — aborting scenario: {e}")
                self._state = ScenarioState.IDLE
                return

            # Resolve responder profile ID before starting
            self._resolved_responder_id = await client.get_responder_profile_id()

            pending_events = [e for e in self._events if e.status == EventStatus.PENDING]

            for event in pending_events:
                if self._state == ScenarioState.PAUSED:
                    # Wait until resumed
                    while self._state == ScenarioState.PAUSED:
                        await asyncio.sleep(0.2)
                    if self._state != ScenarioState.RUNNING:
                        break

                if self._state != ScenarioState.RUNNING:
                    break

                # Wait until simulated clock reaches this event's offset
                target_offset = event.sim_offset_seconds
                while True:
                    current_sim = self._clock.elapsed_sim_seconds
                    if current_sim >= target_offset:
                        break
                    remaining_sim = target_offset - current_sim
                    sleep_real = remaining_sim / self._clock.speed_multiplier
                    # Sleep in small chunks to support pause/cancel
                    await asyncio.sleep(min(sleep_real, 0.5))

                    if self._state == ScenarioState.PAUSED:
                        while self._state == ScenarioState.PAUSED:
                            await asyncio.sleep(0.2)
                    if self._state != ScenarioState.RUNNING:
                        return

                # Fire the event
                sim_time = self._clock.format_sim_time(event.sim_offset_seconds)
                await self._fire_event(client, event, sim_time)

                # After CITIZEN_REPORT, resolve the cluster for dispatch
                if event.event_type.value == "CITIZEN_REPORT":
                    self._resolved_cluster_id = await client.get_latest_cluster_id()
                    logger.info(f"Post-CITIZEN_REPORT cluster resolved: {self._resolved_cluster_id}")

            # All events fired
            if self._state == ScenarioState.RUNNING:
                self._state = ScenarioState.COMPLETED
                self._completed_at = datetime.now(timezone.utc)
                scenario_name = self._scenario.scenario_id if self._scenario else "Scenario"
                logger.info(f"Scenario {scenario_name} completed")

    async def _fire_event(
        self,
        client: ResQnetClient,
        event: SimulatedEvent,
        sim_time: str,
    ) -> None:
        """Deliver a single event and update log/status."""
        # Idempotency check — do not resend already-acknowledged events
        if self._event_log.is_already_delivered(event.event_id):
            logger.info(f"Skipping already-delivered event: {event.event_id}")
            event.status = EventStatus.SKIPPED
            return

        self._event_log.record_pending(event, sim_time)
        event.timestamp = datetime.now(timezone.utc)

        logger.info(
            f"[{sim_time}] Firing {event.event_type.value} "
            f"(source={event.source_type.value}) → {event.api_target}"
        )

        success, response_body, error_detail = await client.deliver_event(
            event,
            resolved_cluster_id=self._resolved_cluster_id,
            resolved_responder_id=self._resolved_responder_id,
        )

        if success:
            event.status = EventStatus.ACKNOWLEDGED
            event.resqnet_response = response_body
            event.delivered_at = datetime.now(timezone.utc)

            # Build a human-readable response summary
            summary = self._summarize_response(event.event_type.value, response_body)
            self._event_log.update_status(
                event.event_id,
                EventStatus.ACKNOWLEDGED,
                resqnet_response_summary=summary,
            )
            logger.info(f"  ✓ DELIVERED — {summary}")
        else:
            event.status = EventStatus.FAILED
            event.error_detail = error_detail
            self._event_log.update_status(
                event.event_id,
                EventStatus.FAILED,
                error_detail=error_detail,
            )
            logger.warning(f"  ✗ FAILED — {error_detail}")

        self._events_fired += 1

    @staticmethod
    def _summarize_response(event_type: str, body: dict) -> str:
        """Build a short human-readable summary of a ResQnet response."""
        if event_type in (
            "FLOOD_WARNING",
            "SITUATION_UPDATE",
            "OFFICIAL_ALERT",
            "EARTHQUAKE_WARNING",
            "LANDSLIDE_WARNING",
            "GEOLOGICAL_WARNING",
        ):
            alert_id = body.get("id")
            severity = body.get("severity", "")
            return f"Alert #{alert_id} created (severity={severity})"
        elif event_type in ("WATER_LEVEL_HIGH", "SEISMIC_EVENT", "SLOPE_FAILURE"):
            zone_id = body.get("zone_id")
            sev = body.get("severity")
            return f"Hazard Zone #{zone_id} activated (severity={sev})"
        elif event_type == "CITIZEN_REPORT":
            count = body.get("count", 0)
            category = body.get("category", "")
            return f"{count} {category} report(s) created (status=UNVERIFIED)"
        elif event_type in ("ROAD_BLOCKED", "STRUCTURAL_DAMAGE", "ROAD_BLOCKAGE"):
            road_id = body.get("road_id")
            blocked = body.get("blocked")
            return f"Road #{road_id} is_blocked={blocked} → routing graph dirty"
        elif event_type == "RESPONDER_DISPATCH":
            mission_id = body.get("id")
            status = body.get("status", "assigned")
            return f"Mission #{mission_id} created (status={status})"
        elif event_type == "SHELTER_CAPACITY_CHANGED":
            occ = body.get("current_occupancy")
            status = body.get("status", "")
            avail = body.get("available_capacity")
            return f"Hub occupancy={occ}, available={avail}, status={status}"
        return str(body)[:100]


# Module-level singleton
from app.event_log import event_log as _global_event_log

_runner_instance: Optional[ScenarioRunner] = None


def get_runner() -> ScenarioRunner:
    """Return the module-level singleton runner."""
    global _runner_instance
    if _runner_instance is None:
        _runner_instance = ScenarioRunner(event_log=_global_event_log)
        _runner_instance.load("FLOOD_DEMO_01")
    return _runner_instance
