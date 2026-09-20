# ResQnet Simulation Engine — v1.0

> **"The Simulation Engine emulates external disaster-information sources. Simulated events enter ResQnet through application interfaces rather than directly modifying the operational database."**

---

## Purpose

The Simulation Engine is a **physically and logically separate** side engine that emulates what external disaster-information sources would send to ResQnet during a real emergency. It exists to demonstrate ResQnet's end-to-end operational response workflow for the SIH 2026 competition.

It runs on `http://localhost:9000` while ResQnet runs on `http://localhost:8000`.

**This engine does NOT:**
- Access the ResQnet PostgreSQL/PostGIS database directly
- Execute any SQL
- Fake dashboard state by modifying React state or returning fake API responses
- Claim live government, sensor, news, or social-media data
- Claim AI/ML prediction capability
- Produce unverified data that appears as verified ground truth

---

## Architecture

```
Simulation Engine (port 9000)
        │
        │  normalized SimulatedEvent
        │
        ▼
HTTP/API request (httpx.AsyncClient)
        │
        ▼
ResQnet FastAPI business logic (port 8000)
        │
        ▼
Existing ResQnet database / operational state
        │
        ▼
Existing dashboards / maps / routing / operations
```

### Why It Is Separate

1. **Isolation of concerns**: The simulation engine must behave as an *external information source*, not as an internal ResQnet component.
2. **Integrity**: ResQnet business logic (RBAC, audit logging, state machines, PostGIS queries) must process every simulated event exactly as it would a real event.
3. **Demonstrability**: The audience can observe two windows — a simulation control panel and the ResQnet coordinator dashboard — and see real cause-and-effect.
4. **No schema contamination**: The frozen ResQnet database schema is not modified.

---

## Event Model

Every simulated event is a `SimulatedEvent` with:

| Field | Description |
|-------|-------------|
| `event_id` | Deterministic ID — prevents duplicate delivery |
| `scenario_id` | `FLOOD_DEMO_01` (or other scenario) |
| `source_type` | Simulated source classification (e.g. `SIMULATED_OFFICIAL`) |
| `source_label` | Human-readable source label (e.g. `SIMULATED OFFICIAL ALERT`) |
| `event_type` | One of 7 event types |
| `timestamp` | Wall-clock time when fired |
| `sim_offset_seconds` | Scenario-relative time (T+n) |
| `latitude` / `longitude` | Location of the simulated event |
| `severity` | LOW / MEDIUM / HIGH / CRITICAL |
| `confidence` | 0.0–1.0 (how certain the simulated source is) |
| `description` | Human-readable description with `[SIM]` prefix |
| `api_target` | Which ResQnet endpoint was called |
| `api_role` | Which user role authenticated the call |
| `api_payload` | Exact payload sent |
| `status` | PENDING / SENT / ACKNOWLEDGED / FAILED / SKIPPED |
| `resqnet_response` | ResQnet's actual HTTP response body |
| `chain_notes` | Documentation of ResQnet business logic exercised |
| `chain_warning` | Any caveats or known gaps in the chain |

### Source Types

| Source Type | Meaning |
|-------------|---------|
| `SIMULATED_OFFICIAL` | Emulates a government/authority alert |
| `SIMULATED_SENSOR` | Emulates a water level or sensor reading |
| `SIMULATED_CITIZEN` | Emulates a citizen crowdsourced report |
| `SIMULATED_RESPONDER` | Emulates a field responder observation |
| `SIMULATED_REMOTE_SENSING` | Emulates satellite or aerial observation |
| `SIMULATION_ENGINE` | Engine-generated synthetic event |

Source types exist **only in the Simulation Engine**. They are not added to the frozen ResQnet schema. Source attribution in ResQnet is carried by `[SIM]` prefixes in `title` and `message` fields.

---

## Scenario Model

A scenario is a JSON file in `config/` containing:
- `scenario_id` — unique identifier
- `events` — ordered list with `offset_seconds`, `event_type`, `source_type`, `api_target`, `api_payload`, etc.
- `resqnet_context` — seed entity IDs (hub_id, road_id, etc.)
- `historical_context` — background data labeled as HISTORICAL CONTEXT ONLY

Scenarios are deterministic — the same input produces the same event sequence and IDs every run.

---

## Multi-Disaster Scenarios Supported

The generic Simulation Engine supports three deterministic disaster scenarios via the same operational architecture:
1. `FLOOD_DEMO_01` (*North Canal Flood*)
2. `EARTHQUAKE_DEMO_01` (*Capital District Earthquake*)
3. `LANDSLIDE_DEMO_01` (*Northern Hill Slope Failure*)

### 1. FLOOD_DEMO_01 — Event Timeline

| T+ | Event Type | Source | ResQnet API | Business Logic |
|----|------------|--------|-------------|----------------|
| T+00 | `FLOOD_WARNING` | `SIMULATED_OFFICIAL` | `POST /api/v1/alerts` | `create_emergency_alert()` → EmergencyAlert → AuditLog |
| T+10 | `WATER_LEVEL_HIGH` | `SIMULATED_SENSOR` | `POST /api/simulation/events/flood` | HazardZone 1 activated → routing cache dirty |
| T+20 | `CITIZEN_REPORT` | `SIMULATED_CITIZEN` | `POST /api/simulation/events/reports/generate` | IncidentReport (UNVERIFIED) → cluster pipeline |
| T+30 | `ROAD_BLOCKED` | `SIMULATED_RESPONDER` | `POST /api/simulation/events/road/block` | Road 12 is_blocked=True → excluded from routing graph |
| T+40 | `RESPONDER_DISPATCH` | `SIMULATED_RESPONDER` | `POST /api/v1/missions` | `create_mission_service()` → ASSIGNED → AuditLog |
| T+50 | `SHELTER_CAPACITY_CHANGED` | `SIMULATED_SENSOR` | `PATCH /api/v1/hubs/1/occupancy` | `update_occupancy_service()` → SELECT FOR UPDATE → Hub Alpha |
| T+60 | `SITUATION_UPDATE` | `SIMULATION_ENGINE` | `POST /api/v1/alerts` | Second EmergencyAlert → AuditLog |

### 2. EARTHQUAKE_DEMO_01 — Event Timeline

| T+ | Event Type | Source | ResQnet API | Business Logic |
|----|------------|--------|-------------|----------------|
| T+00 | `EARTHQUAKE_WARNING` | `SIMULATED_OFFICIAL` | `POST /api/v1/alerts` | Emergency Alert created for Capital District Seismic Corridor |
| T+10 | `SEISMIC_EVENT` | `SIMULATED_SENSOR` | `POST /api/simulation/events/flood` | Hazard Zone 1 activated (is_active=True, severity=HIGH) |
| T+20 | `CITIZEN_REPORT` | `SIMULATED_CITIZEN` | `POST /api/simulation/events/reports/generate` | 3 citizen tremor reports clustered with status UNVERIFIED |
| T+30 | `STRUCTURAL_DAMAGE` | `SIMULATED_RESPONDER` | `POST /api/simulation/events/road/block` | Central Spine East (Road #6) blocked by fallen debris |
| T+40 | `RESPONDER_DISPATCH` | `SIMULATED_RESPONDER` | `POST /api/v1/missions` | Team Alpha dispatched to inspect Road #6 structural integrity |
| T+50 | `SHELTER_CAPACITY_CHANGED` | `SIMULATED_SENSOR` | `PATCH /api/v1/hubs/3/occupancy` | Hub Gamma occupancy increased by +50 (100/200, 50% ratio) |
| T+60 | `SITUATION_UPDATE` | `SIMULATION_ENGINE` | `POST /api/v1/alerts` | Situation update broadcast for seismic corridor |

### 3. LANDSLIDE_DEMO_01 — Event Timeline

| T+ | Event Type | Source | ResQnet API | Business Logic |
|----|------------|--------|-------------|----------------|
| T+00 | `LANDSLIDE_WARNING` | `SIMULATED_OFFICIAL` | `POST /api/v1/alerts` | Geological instability warning on Northern Ridge corridor |
| T+10 | `SLOPE_FAILURE` | `SIMULATED_SENSOR` | `POST /api/simulation/events/flood` | Hazard Zone 2 (Northern Landslide Zone) activated |
| T+20 | `CITIZEN_REPORT` | `SIMULATED_CITIZEN` | `POST /api/simulation/events/reports/generate` | 3 citizen reports of rockfall/mud, status UNVERIFIED |
| T+30 | `ROAD_BLOCKED` | `SIMULATED_RESPONDER` | `POST /api/simulation/events/road/block` | North Market Road (Road #1) blocked by debris |
| T+40 | `RESPONDER_DISPATCH` | `SIMULATED_RESPONDER` | `POST /api/v1/missions` | Team Alpha dispatched to survey debris on Road #1 |
| T+50 | `SHELTER_CAPACITY_CHANGED` | `SIMULATED_SENSOR` | `PATCH /api/v1/hubs/2/occupancy` | Hub Beta occupancy increased by +140 (220/300, 73% ratio) |
| T+60 | `SITUATION_UPDATE` | `SIMULATION_ENGINE` | `POST /api/v1/alerts` | Diversion advisory via Central Spine corridor broadcast |

### Known API Gaps and Documented Shortcuts

| Event | Gap | Documented Resolution |
|-------|-----|-----------------------|
| `CITIZEN_REPORT` | Reports go through coordinator (not citizen JWT) | Uses simulation endpoint `reports/generate` which creates UNVERIFIED reports. Reports are NOT claimed as verified. |
| `ROAD_BLOCKED` | Bypasses FieldSurvey ground-truth path | Coordinator applies observation directly. In production, responder would submit FieldSurvey. Gap is noted in chain_warning. |
| `WATER_LEVEL_HIGH` | No sensor auto-creates verified hazard | Activates hazard zone as an observation. Routing graph is lazily rebuilt. No routing result is fabricated. |
| Source attribution | No `source_type` column in frozen schema | `[SIM]` prefix in title/message carries attribution. No schema change. |

---

## API Integration

Every event delivery goes through `ResQnetClient` in `app/api_client.py`. The client:

1. Authenticates with ResQnet (`POST /api/v1/auth/login`) to get JWT tokens
2. Uses the **coordinator JWT** for most events (alerts, missions, hub, simulation endpoints)
3. Delivers the event via the correct HTTP method and endpoint
4. Records the ResQnet response in the event log

No ResQnet database is accessed. No SQL is executed. Every event goes through FastAPI → service layer → ORM → PostgreSQL, exactly as a real event would.

---

## Authentication

- Credentials are loaded from `.env` — never hardcoded in source
- Coordinator JWT for: alerts, simulation events, missions, hub occupancy
- Citizen JWT available for: citizen-source events (not currently required — simulation endpoint uses coordinator auth)
- JWTs are fetched once per simulation run and cached in memory
- No second authentication model is introduced into ResQnet

---

## Simulated Clock

The `SimulatedClock` maintains scenario-relative time:

- **T+00:00** = scenario start
- Speed multiplier: 1x, 5x, 10x (real-seconds per simulated-second)
- Supports `start()`, `pause()`, `resume()`, `reset()`
- Events fire when `elapsed_sim_seconds >= event.offset_seconds`

---

## Reset Behavior

`POST /control/reset` does:
1. Cancels the running async task
2. Resets the clock to T+0
3. Clears the event log
4. Resets all events to PENDING
5. Calls `POST /api/simulation/events/reset` on ResQnet:
   - Sets all roads to `CLEAR`
   - Deactivates all hazard zones
   - Does NOT delete audit logs, incident reports, or missions

If the ResQnet reset call fails (e.g., ResQnet is down), the engine state still resets — the failure is reported in the response.

---

## Source Attribution

Every simulated event that enters ResQnet carries:
- `[SIM]` prefix in `title` and `message` fields
- `alert_type` distinguishing the simulation category (e.g., `flood_warning`, `situation_update`)

The Simulation Engine's event log additionally records:
- `source_type` (e.g., `SIMULATED_OFFICIAL`)
- `source_label` (e.g., `SIMULATED OFFICIAL ALERT`)
- `chain_notes` (what ResQnet business logic was exercised)
- `chain_warning` (any known gaps or shortcuts)

No simulated data is presented as:
- Live government sensor data
- Live news or social media data
- AI-predicted outcomes
- Verified ground truth unless the ResQnet verification workflow was actually executed

---

## How to Run

### Prerequisites

- Python 3.11+
- ResQnet backend running on port 8000 (with seed data loaded)

### Setup

```bash
cd simulation_engine
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

### Configure

```bash
# .env is pre-configured for local development with seed credentials
# Edit if your ResQnet uses different credentials or port
```

### Start Simulation Engine

```bash
cd simulation_engine
uvicorn app.main:app --port 9000 --reload
```

### Run Scenarios (Flood, Earthquake, Landslide)

**Option A — UI (recommended for SIH demo):**
1. Open `http://localhost:9000/ui` in Window 1
2. Open `http://localhost:5173` (ResQnet Dashboard) in Window 2
3. Select desired scenario from dropdown:
   - `FLOOD_DEMO_01` (North Canal Flood)
   - `EARTHQUAKE_DEMO_01` (Capital District Earthquake)
   - `LANDSLIDE_DEMO_01` (Northern Hill Slope Failure)
4. Choose speed multiplier (`1x`, `5x`, or `10x`)
5. Click **▶ Start Simulation**
6. Watch real-time events propagate to ResQnet dashboard

**Option B — API:**
```bash
# List available scenarios
curl http://localhost:9000/scenarios

# Switch scenario
curl -X POST http://localhost:9000/control/select \
  -H "Content-Type: application/json" \
  -d '{"scenario_id": "EARTHQUAKE_DEMO_01"}'

# Start at 10x speed
curl -X POST http://localhost:9000/control/start \
  -H "Content-Type: application/json" \
  -d '{"speed": 10}'

# Check state
curl http://localhost:9000/state

# Check event log
curl http://localhost:9000/log

# Pause / Resume / Reset
curl -X POST http://localhost:9000/control/pause
curl -X POST http://localhost:9000/control/resume
curl -X POST http://localhost:9000/control/reset
curl -X POST http://localhost:9000/control/reset
```

### Run Tests

```bash
cd simulation_engine
python -m pytest tests/ -v
```

---

## Limitations

1. **No live sensor data**: Water level is simulated by activating a hazard zone, not by reading an actual sensor.
2. **No live social media**: Citizen reports are synthetically generated, not scraped.
3. **No AI/ML prediction**: The scenario timeline is deterministic — not predicted by any model.
4. **Routing cache not explicitly invalidated**: The routing graph dirty flag is set in-process. When the engine calls road/hazard APIs externally, the ResQnet process marks the cache dirty internally. This works correctly in a single-process ResQnet deployment.
5. **In-memory event log**: The event log is reset on engine restart. For persistence, a future version could write to a file.
6. **Citizen report path**: The `CITIZEN_REPORT` event uses the coordinator-accessible simulation endpoint rather than the citizen JWT path. Reports are still created as UNVERIFIED.

---

## What Is Simulated vs Real

| Item | Simulated | Real |
|------|-----------|------|
| Flood event trigger | ✓ Simulation Engine decision | — |
| Hazard zone activation | — | ✓ ResQnet HazardZone update |
| Incident reports | ✓ Generated by engine | — |
| Report clustering | — | ✓ ResQnet `find_or_create_cluster()` |
| Report verification | Not performed in demo | ✓ Requires responder FieldSurvey |
| Road blocking | ✓ Engine calls API | ✓ Road.is_blocked set by ResQnet |
| Route recalculation | ✓ Engine triggers via road change | ✓ ResQnet Dijkstra on next call |
| Mission creation | ✓ Engine calls /api/v1/missions | ✓ ResQnet `create_mission_service()` |
| Mission acceptance | Not performed in demo | ✓ Requires responder action |
| Hub occupancy | ✓ Engine calls hub API | ✓ ResQnet `update_occupancy_service()` |
| Alerts | ✓ Engine calls alerts API | ✓ ResQnet `create_emergency_alert()` |
| Audit log | — | ✓ All events write to ResQnet AuditLog |
| JWT authentication | ✓ Uses seed credentials | ✓ ResQnet JWT verification |
