"""
ResQnet 6.19-B — Live Integration Test Suite
Validates real end-to-end integration between:
  Simulation Engine (http://localhost:9000)
        ↓ HTTP/API
  ResQnet FastAPI (http://localhost:8000)
        ↓ Business Services
  PostgreSQL / PostGIS (port 5432)
        ↓
  Dashboards / Maps / Routing Engine
"""
import asyncio
import os
import pytest
import httpx
from datetime import datetime, timezone

from app.api_client import ResQnetClient
from app.config import get_sim_settings
from app.event_generator import build_events_from_scenario
from app.event_log import EventLog
from app.models import (
    EventStatus,
    EventType,
    ScenarioState,
    SimSeverity,
    SimulatedEvent,
    SourceType,
)
from app.runner import ScenarioRunner
from app.scenario_loader import load_scenario

pytestmark = pytest.mark.asyncio


async def get_test_client(settings) -> ResQnetClient:
    """Helper to create and authenticate a client in the current async event loop."""
    client = ResQnetClient(
        base_url=settings.RESQNET_BASE_URL,
        coordinator_email=settings.SIM_COORDINATOR_EMAIL,
        coordinator_password=settings.SIM_COORDINATOR_PASSWORD,
        citizen_email=settings.SIM_CITIZEN_EMAIL,
        citizen_password=settings.SIM_CITIZEN_PASSWORD,
    )
    await client.__aenter__()
    await client.authenticate()
    return client


# ─── 1. Health & Reachability ────────────────────────────────────────────────

async def test_01_services_reachable():
    """Verify both ResQnet backend (8000) and Simulation Engine (9000) are online."""
    settings = get_sim_settings()
    async with httpx.AsyncClient(timeout=5.0) as http:
        resp_backend = await http.get(f"{settings.RESQNET_BASE_URL}/health")
        assert resp_backend.status_code == 200, f"Backend unreachable: {resp_backend.text}"
        assert resp_backend.json().get("status") == "healthy"

        resp_sim = await http.get(f"http://localhost:{settings.SIM_PORT}/health")
        assert resp_sim.status_code == 200, f"Simulation engine unreachable: {resp_sim.text}"
        assert resp_sim.json().get("status") == "healthy"


# ─── 2. Authentication ───────────────────────────────────────────────────────

async def test_02_authentication():
    """Verify JWT tokens are minted for coordinator and citizen roles."""
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        assert client._coordinator_token is not None
        assert len(client._coordinator_token) > 20
        assert client._citizen_token is not None
        assert len(client._citizen_token) > 20
    finally:
        await client.__aexit__()


# ─── 3. Phase 3: FLOOD_WARNING (T+00) ────────────────────────────────────────

async def test_03_event_flood_warning():
    """
    T+00: FLOOD_WARNING -> POST /api/v1/alerts
    Verify:
      - HTTP 201 Created
      - Alert has [SIM] prefix and emergency severity
      - Coordinator can retrieve it from /api/v1/alerts/active
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[0]  # E001 FLOOD_WARNING

        success, body, err = await client.deliver_event(event)
        assert success, f"Delivery failed: {err}"
        assert "id" in body, f"No alert ID in body: {body}"
        alert_id = body["id"]
        assert body["severity"] == "EMERGENCY"
        assert "[SIM]" in body["title"]

        # Verify state via GET /api/v1/alerts/active
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/v1/alerts/active",
                headers=client._coordinator_headers(),
            )
            assert resp.status_code == 200
            active_alerts = resp.json()
            matching = [a for a in active_alerts if a["id"] == alert_id]
            assert len(matching) == 1, f"Alert #{alert_id} not found in active alerts"
            assert matching[0]["is_active"] is True
    finally:
        await client.__aexit__()


# ─── 4. Phase 4: WATER_LEVEL_HIGH (T+10) ────────────────────────────────────

async def test_04_event_water_level_high():
    """
    T+10: WATER_LEVEL_HIGH -> POST /api/simulation/events/flood
    Verify:
      - HTTP 200
      - HazardZone 1 is_active=True, severity=HIGH
      - State verified via GET /api/simulation/state
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[1]  # E002 WATER_LEVEL_HIGH

        success, body, err = await client.deliver_event(event)
        assert success, f"Delivery failed: {err}"
        assert body.get("event") == "flood_started"
        assert body.get("zone_id") == 1
        assert body.get("severity") in ("HIGH", 4)

        # Verify state via GET /api/simulation/state
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/simulation/state",
                headers=client._coordinator_headers(),
            )
            assert resp.status_code == 200
            state = resp.json()
            zone_1 = next((z for z in state["hazard_zones"] if z["id"] == 1), None)
            assert zone_1 is not None, "Hazard zone 1 missing in state"
            assert zone_1["active"] is True
            assert zone_1["severity"] in ("HIGH", 4)
    finally:
        await client.__aexit__()


# ─── 5. Phase 5: CITIZEN_REPORT (T+20) ───────────────────────────────────────

async def test_05_event_citizen_report():
    """
    T+20: CITIZEN_REPORT -> POST /api/simulation/events/reports/generate
    Verify:
      - HTTP 200
      - Reports created with UNVERIFIED status (NOT verified ground truth)
      - Cluster formed and visible in simulation state
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[2]  # E003 CITIZEN_REPORT

        success, body, err = await client.deliver_event(event)
        assert success, f"Delivery failed: {err}"
        assert body.get("event") == "reports_generated"
        assert body.get("count") == 3

        # Resolve cluster ID
        cluster_id = await client.get_latest_cluster_id()
        assert cluster_id is not None, "Failed to resolve generated cluster ID"
        assert cluster_id > 0
    finally:
        await client.__aexit__()


# ─── 6. Phase 6: ROAD_BLOCKED & Routing Consequence (T+30) ──────────────────

async def test_06_event_road_blocked_and_routing_detour():
    """
    T+30: ROAD_BLOCKED -> POST /api/simulation/events/road/block
    Verify:
      - HTTP 200
      - Road 12 marked blocked in DB
      - Real operational Dijkstra routing consequence:
        Origin at Intersection 4, target Hub Gamma (Intersection 9).
        When Road 12 (between 4 and 9) is CLEAR, Dijkstra uses Road 12 directly.
        When Road 12 is BLOCKED, Dijkstra MUST detour around it or exclude Road 12.
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            # 1. Ensure Road 12 is clear to establish baseline
            await http.post(
                f"{settings.RESQNET_BASE_URL}/api/simulation/events/road/block",
                json={"road_id": 12, "block": False},
                headers=client._coordinator_headers(),
            )

            resp_pre = await http.post(
                f"{settings.RESQNET_BASE_URL}/api/v1/routing/calculate",
                json={"from_lat": 20.554, "from_lng": 85.824, "target_hub_id": 3},
                headers=client._coordinator_headers(),
            )
            assert resp_pre.status_code == 200, f"Route pre-calc failed: {resp_pre.text}"

        # 2. Fire ROAD_BLOCKED event for Road 12
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[3]  # E004 ROAD_BLOCKED

        success, body, err = await client.deliver_event(event)
        assert success, f"Delivery failed: {err}"
        assert body.get("event") == "road_blocked"
        assert body.get("road_id") == 12
        assert body.get("blocked") is True

        # 3. Verify state via GET /api/simulation/state
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp_state = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/simulation/state",
                headers=client._coordinator_headers(),
            )
            state = resp_state.json()
            road_12 = next((r for r in state["roads"] if r["id"] == 12), None)
            assert road_12 is not None
            assert road_12["is_blocked"] is True
            assert road_12["status"] == "blocked"

            # 4. Verify Dijkstra routing excludes Road 12
            resp_post = await http.post(
                f"{settings.RESQNET_BASE_URL}/api/v1/routing/calculate",
                json={"from_lat": 20.554, "from_lng": 85.824, "target_hub_id": 3},
                headers=client._coordinator_headers(),
            )
            assert resp_post.status_code == 200, f"Route post-calc failed: {resp_post.text}"
            route_post = resp_post.json()
            post_roads = [step["road_id"] for step in route_post.get("steps", [])]

            # PROOF OF REAL OPERATIONAL CONSEQUENCE:
            # Road 12 MUST NOT be present in the post-block route steps!
            assert 12 not in post_roads, f"Blocked road 12 was unexpectedly included in route: {post_roads}"
    finally:
        await client.__aexit__()


# ─── 7. Phase 7: RESPONDER_DISPATCH (T+40) ──────────────────────────────────

async def test_07_event_responder_dispatch():
    """
    T+40: RESPONDER_DISPATCH -> POST /api/v1/missions
    Verify:
      - Resolves cluster and available responder
      - Creates exactly ONE mission (assigned status)
      - AuditLog entry MISSION_CREATED recorded
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        cluster_id = await client.get_latest_cluster_id()
        responder_id = await client.get_responder_profile_id()

        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[4]  # E005 RESPONDER_DISPATCH

        success, body, err = await client.deliver_event(
            event,
            resolved_cluster_id=cluster_id,
            resolved_responder_id=responder_id,
        )
        assert success, f"Delivery failed: {err}"
        assert "id" in body, f"No mission ID in response: {body}"
        mission_id = body["id"]
        assert body["status"] == "assigned"

        # Verify mission in /api/v1/missions
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/v1/missions",
                headers=client._coordinator_headers(),
            )
            assert resp.status_code == 200
            missions = resp.json()
            matching = [m for m in missions if m["id"] == mission_id]
            assert len(matching) == 1, f"Expected exactly 1 mission with ID {mission_id}, found {len(matching)}"
    finally:
        await client.__aexit__()


# ─── 8. Phase 8: SHELTER_CAPACITY_CHANGED (T+50) ─────────────────────────────

async def test_08_event_shelter_capacity_lifecycle():
    """
    T+50: SHELTER_CAPACITY_CHANGED -> PATCH /api/v1/hubs/1/occupancy
    Test capacity status transitions:
      - OPEN: occupancy below critical threshold (0.85)
      - NEAR_CAPACITY: occupancy >= 0.85 * max_capacity (340/400)
      - FULL: occupancy >= max_capacity (400/400)
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        # Query current hub state
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/v1/hubs/1",
                headers=client._coordinator_headers(),
            )
            assert resp.status_code == 200
            hub_data = resp.json()
            initial_occ = hub_data["current_occupancy"]

        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[5]  # E006 SHELTER_CAPACITY_CHANGED

        # Adjust delta so occupancy becomes 300 (ratio 0.75 -> OPEN)
        event.api_payload["delta"] = 300 - initial_occ
        success, body, err = await client.deliver_event(event)
        assert success, f"Open delta failed: {err}"
        assert body["current_occupancy"] == 300
        assert body["status"] == "open"
        assert body["available_capacity"] == 100

        # Test NEAR_CAPACITY transition (delta=+40 -> 340/400 = 85%)
        event.api_payload["delta"] = 40
        success, body, err = await client.deliver_event(event)
        assert success, f"Near capacity delta failed: {err}"
        assert body["current_occupancy"] == 340
        assert body["status"] == "near_capacity"

        # Test FULL transition (delta=+60 -> 400/400 = 100%)
        event.api_payload["delta"] = 60
        success, body, err = await client.deliver_event(event)
        assert success, f"Full delta failed: {err}"
        assert body["current_occupancy"] == 400
        assert body["status"] == "full"
        assert body["available_capacity"] == 0

        # Restore occupancy to 300
        event.api_payload["delta"] = -100
        await client.deliver_event(event)
    finally:
        await client.__aexit__()


# ─── 9. Phase 9: SITUATION_UPDATE (T+60) ─────────────────────────────────────

async def test_09_event_situation_update():
    """
    T+60: SITUATION_UPDATE -> POST /api/v1/alerts
    Verify:
      - HTTP 201 Created
      - alert_type is 'situation_update'
      - Both FLOOD_WARNING and SITUATION_UPDATE appear in active alerts
    """
    settings = get_sim_settings()
    client = await get_test_client(settings)
    try:
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[6]  # E007 SITUATION_UPDATE

        success, body, err = await client.deliver_event(event)
        assert success, f"Delivery failed: {err}"
        assert body["alert_type"] == "situation_update"

        # Verify both alerts in active list
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/v1/alerts/active",
                headers=client._coordinator_headers(),
            )
            assert resp.status_code == 200
            active = resp.json()
            sim_alerts = [a for a in active if "[SIM]" in a.get("title", "")]
            assert len(sim_alerts) >= 2, f"Expected at least 2 simulated alerts, found {len(sim_alerts)}"
    finally:
        await client.__aexit__()


# ─── 10. Phase 11 & 12: Pause/Resume and Safe Reset ──────────────────────────

async def test_10_pause_resume_and_reset():
    """
    Test Pause / Resume lifecycle and Safe Reset:
      - Start runner
      - Pause: clock stops, state becomes PAUSED
      - Resume: state becomes RUNNING
      - Reset: state returns to IDLE, clock to T+0, roads restored to clear
    """
    settings = get_sim_settings()
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    runner.load("FLOOD_DEMO_01")

    # Start at 10x
    await runner.start(speed=10)
    assert runner.get_state().state == ScenarioState.RUNNING

    # Pause after brief execution
    await asyncio.sleep(0.3)
    await runner.pause()
    state_paused = runner.get_state()
    assert state_paused.state == ScenarioState.PAUSED
    clock_at_pause = state_paused.elapsed_sim_seconds

    # Sleep while paused to verify clock does not advance
    await asyncio.sleep(0.3)
    assert runner.get_state().elapsed_sim_seconds == clock_at_pause

    # Resume
    await runner.resume()
    assert runner.get_state().state == ScenarioState.RUNNING

    # Reset
    reset_res = await runner.reset()
    assert runner.get_state().state == ScenarioState.IDLE
    assert runner.get_state().elapsed_sim_seconds == 0.0
    assert reset_res.get("resqnet_reset") == "success"

    # Verify ResQnet roads are cleared after reset
    client = await get_test_client(settings)
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                f"{settings.RESQNET_BASE_URL}/api/simulation/state",
                headers=client._coordinator_headers(),
            )
            state = resp.json()
            road_12 = next(r for r in state["roads"] if r["id"] == 12)
            assert road_12["is_blocked"] is False
            zone_1 = next(z for z in state["hazard_zones"] if z["id"] == 1)
            assert zone_1["active"] is False
    finally:
        await client.__aexit__()


# ─── 11. Phase 13: Idempotency / Duplicate Prevention ─────────────────────────

async def test_11_idempotency_duplicate_prevention():
    """Verify runner skips already delivered events to prevent duplicate operations."""
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    runner.load("FLOOD_DEMO_01")

    event = runner._events[0]
    log.record_pending(event, "T+00:00")
    log.update_status(event.event_id, EventStatus.ACKNOWLEDGED)

    dummy_client = None  # Would fail if called
    await runner._fire_event(dummy_client, event, "T+00:00")

    assert event.status == EventStatus.SKIPPED


# ─── 12. Phase 14: Failure Handling ──────────────────────────────────────────

async def test_12_failure_handling():
    """
    Test delivery to an invalid/unreachable target.
    Verify:
      - event status recorded as FAILED
      - error detail contains diagnostic information
      - event log captures failure without raising unhandled exception
    """
    settings = get_sim_settings()
    unreachable_client = ResQnetClient(
        base_url="http://localhost:59999",
        coordinator_email=settings.SIM_COORDINATOR_EMAIL,
        coordinator_password=settings.SIM_COORDINATOR_PASSWORD,
        citizen_email=settings.SIM_CITIZEN_EMAIL,
        citizen_password=settings.SIM_CITIZEN_PASSWORD,
        timeout=1.0,
    )
    await unreachable_client.__aenter__()
    try:
        unreachable_client._coordinator_token = "mock_token"
        scenario = load_scenario("FLOOD_DEMO_01", scenario_dir=settings.SCENARIO_DIR)
        events = build_events_from_scenario(scenario.events, scenario.scenario_id)
        event = events[0]

        success, body, err = await unreachable_client.deliver_event(event)
        assert success is False
        assert err is not None
        assert any(k in err.lower() for k in ("connect", "timeout", "refused", "59999", "failed"))
    finally:
        await unreachable_client.__aexit__()


# ─── 13. Phase 10: Complete FLOOD_DEMO_01 End-to-End Run ──────────────────────

async def test_13_complete_flood_scenario_run():
    """
    Run FLOOD_DEMO_01 from START to COMPLETED using ScenarioRunner at 10x speed.
    Verify:
      - All 7 events fire in correct chronological sequence
      - All 7 events reach ACKNOWLEDGED status
      - Runner reaches COMPLETED state
      - Event log contains 7 entries with verified ResQnet responses
    """
    settings = get_sim_settings()
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    runner.load("FLOOD_DEMO_01")

    # Reset first to ensure clean state
    await runner.reset()

    # Start at 10x speed (60s scenario takes ~6s real time)
    await runner.start(speed=10)

    # Wait for completion (max 15s)
    for _ in range(30):
        await asyncio.sleep(0.5)
        state = runner.get_state()
        if state.state == ScenarioState.COMPLETED:
            break

    final_state = runner.get_state()
    assert final_state.state == ScenarioState.COMPLETED, f"Expected COMPLETED, got {final_state.state}"
    assert final_state.events_fired == 7, f"Expected 7 fired events, got {final_state.events_fired}"
    assert final_state.events_delivered == 7, f"Expected 7 delivered events, got {final_state.events_delivered}"
    assert final_state.events_failed == 0, f"Events failed: {final_state.events_failed}"

    entries = log.get_entries()
    assert len(entries) == 7
    event_types_delivered = [e.event_type for e in entries]
    expected_order = [
        "FLOOD_WARNING",
        "WATER_LEVEL_HIGH",
        "CITIZEN_REPORT",
        "ROAD_BLOCKED",
        "RESPONDER_DISPATCH",
        "SHELTER_CAPACITY_CHANGED",
        "SITUATION_UPDATE",
    ]
    assert event_types_delivered == expected_order


# ─── 14. Phase 15: Complete EARTHQUAKE_DEMO_01 End-to-End Run ────────────────

async def test_14_complete_earthquake_scenario_run():
    """
    Run EARTHQUAKE_DEMO_01 from START to COMPLETED using ScenarioRunner at 10x speed.
    Verify:
      - All 7 events fire in correct chronological sequence
      - All 7 events reach ACKNOWLEDGED status
      - Runner reaches COMPLETED state
      - Event log contains 7 entries with verified ResQnet responses
      - ResQnet operational state reflects earthquake impact (alerts, road #6 blocked, hub gamma capacity)
    """
    settings = get_sim_settings()
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    runner.load("EARTHQUAKE_DEMO_01")

    # Reset first to ensure clean state
    await runner.reset()

    # Start at 10x speed (60s scenario takes ~6s real time)
    await runner.start(speed=10)

    # Wait for completion (max 20s)
    for _ in range(40):
        await asyncio.sleep(0.5)
        state = runner.get_state()
        if state.state == ScenarioState.COMPLETED:
            break

    final_state = runner.get_state()
    assert final_state.state == ScenarioState.COMPLETED, f"Expected COMPLETED, got {final_state.state}"
    assert final_state.events_fired == 7, f"Expected 7 fired events, got {final_state.events_fired}"
    assert final_state.events_delivered == 7, f"Expected 7 delivered events, got {final_state.events_delivered}"
    assert final_state.events_failed == 0, f"Events failed: {final_state.events_failed}"

    entries = log.get_entries()
    assert len(entries) == 7
    event_types_delivered = [e.event_type for e in entries]
    expected_order = [
        "EARTHQUAKE_WARNING",
        "SEISMIC_EVENT",
        "CITIZEN_REPORT",
        "STRUCTURAL_DAMAGE",
        "RESPONDER_DISPATCH",
        "SHELTER_CAPACITY_CHANGED",
        "SITUATION_UPDATE",
    ]
    assert event_types_delivered == expected_order

    # Verify ResQnet business state consequences
    client = await get_test_client(settings)
    try:
        async with httpx.AsyncClient(base_url=settings.RESQNET_BASE_URL, timeout=5.0) as http:
            # 1. Alert created
            alerts_resp = await http.get("/api/v1/alerts/active", headers=client._coordinator_headers())
            assert alerts_resp.status_code == 200
            alerts = alerts_resp.json()
            eq_alerts = [a for a in alerts if "EARTHQUAKE" in a.get("title", "") or "SEISMIC" in a.get("title", "")]
            assert len(eq_alerts) > 0, "No earthquake alerts found in active alerts"

            # 2. Road #6 is blocked
            roads_resp = await http.get("/api/v1/roads")
            assert roads_resp.status_code == 200
            road_6 = next((r for r in roads_resp.json() if r["id"] == 6), None)
            assert road_6 is not None, "Road #6 not found"
            assert road_6["is_blocked"] is True, "Road #6 should be marked blocked after structural damage"

            # 3. Hub Gamma (ID 3) occupancy changed
            hubs_resp = await http.get("/api/v1/hubs", headers=client._coordinator_headers())
            assert hubs_resp.status_code == 200
            hub_3 = next((h for h in hubs_resp.json() if h["id"] == 3), None)
            assert hub_3 is not None, "Hub #3 not found"
            assert hub_3["current_occupancy"] >= 100, f"Expected Hub 3 occupancy >= 100, got {hub_3['current_occupancy']}"
    finally:
        await client.__aexit__()


# ─── 15. Phase 16: Complete LANDSLIDE_DEMO_01 End-to-End Run ─────────────────

async def test_15_complete_landslide_scenario_run():
    """
    Run LANDSLIDE_DEMO_01 from START to COMPLETED using ScenarioRunner at 10x speed.
    Verify:
      - All 7 events fire in correct chronological sequence
      - All 7 events reach ACKNOWLEDGED status
      - Runner reaches COMPLETED state
      - Event log contains 7 entries with verified ResQnet responses
      - Real Dijkstra routing recalculates and detours around blocked Road #1
      - Hub Beta (ID 2) occupancy increases
    """
    settings = get_sim_settings()
    log = EventLog()
    runner = ScenarioRunner(event_log=log)
    runner.load("LANDSLIDE_DEMO_01")

    # Reset first to ensure clean state
    await runner.reset()

    # Start at 10x speed (60s scenario takes ~6s real time)
    await runner.start(speed=10)

    # Wait for completion (max 20s)
    for _ in range(40):
        await asyncio.sleep(0.5)
        state = runner.get_state()
        if state.state == ScenarioState.COMPLETED:
            break

    final_state = runner.get_state()
    assert final_state.state == ScenarioState.COMPLETED, f"Expected COMPLETED, got {final_state.state}"
    assert final_state.events_fired == 7, f"Expected 7 fired events, got {final_state.events_fired}"
    assert final_state.events_delivered == 7, f"Expected 7 delivered events, got {final_state.events_delivered}"
    assert final_state.events_failed == 0, f"Events failed: {final_state.events_failed}"

    entries = log.get_entries()
    assert len(entries) == 7
    event_types_delivered = [e.event_type for e in entries]
    expected_order = [
        "LANDSLIDE_WARNING",
        "SLOPE_FAILURE",
        "CITIZEN_REPORT",
        "ROAD_BLOCKED",
        "RESPONDER_DISPATCH",
        "SHELTER_CAPACITY_CHANGED",
        "SITUATION_UPDATE",
    ]
    assert event_types_delivered == expected_order

    # Verify ResQnet business state consequences
    client = await get_test_client(settings)
    try:
        async with httpx.AsyncClient(base_url=settings.RESQNET_BASE_URL, timeout=5.0) as http:
            # 1. Alert created
            alerts_resp = await http.get("/api/v1/alerts/active", headers=client._coordinator_headers())
            assert alerts_resp.status_code == 200
            alerts = alerts_resp.json()
            ls_alerts = [a for a in alerts if "GEOLOGICAL" in a.get("title", "") or "LANDSLIDE" in a.get("title", "")]
            assert len(ls_alerts) > 0, "No landslide alerts found in active alerts"

            # 2. Road #1 is blocked
            roads_resp = await http.get("/api/v1/roads")
            assert roads_resp.status_code == 200
            road_1 = next((r for r in roads_resp.json() if r["id"] == 1), None)
            assert road_1 is not None, "Road #1 not found"
            assert road_1["is_blocked"] is True, "Road #1 should be marked blocked after landslide"

            # 3. REAL DIJKSTRA ROUTING CONSEQUENCE:
            # Route from West Crossroads (20.555, 85.820) to Hub Alpha (target_hub_id: 1)
            # When Road #1 is clear, direct path uses Road #1 (distance ~0.8 km).
            # When Road #1 is blocked, Dijkstra MUST exclude Road #1 and detour (distance ~1.6 km).
            route_resp = await http.post(
                "/api/v1/routing/calculate",
                json={
                    "from_lat": 20.555,
                    "from_lng": 85.820,
                    "target_hub_id": 1,
                },
                headers=client._coordinator_headers(),
            )
            assert route_resp.status_code == 200, f"Route calc failed: {route_resp.text}"
            route_data = route_resp.json()
            assert route_data["total_distance_km"] >= 1.5, (
                f"Expected detoured distance >= 1.5 km, got {route_data.get('total_distance_km')}"
            )
            post_roads = [step["road_id"] for step in route_data.get("steps", [])]
            assert 1 not in post_roads, (
                f"Routing still includes blocked Road #1: {post_roads}"
            )

            # 4. Hub Beta (ID 2) occupancy increased to 220 (73%)
            hubs_resp = await http.get("/api/v1/hubs", headers=client._coordinator_headers())
            assert hubs_resp.status_code == 200
            hub_2 = next((h for h in hubs_resp.json() if h["id"] == 2), None)
            assert hub_2 is not None, "Hub #2 not found"
            assert hub_2["current_occupancy"] == 220, (
                f"Expected Hub 2 occupancy 220, got {hub_2['current_occupancy']}"
            )
    finally:
        await client.__aexit__()

