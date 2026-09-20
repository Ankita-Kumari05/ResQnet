# ResQnet × Map Engine — Integration Rules

Rules for any AI agent or developer integrating the new Map Engine into ResQnet.
**Sources:** the ResQnet Functional Documentation (main) and Map Engine Functionality & Role Logic (map) docs. There, "routing-lab" means the new engine.
MUST / MUST NOT are mandatory.

**Two folders — never confuse them:**
- `routing-lab-v2/` = the NEW Map Engine and source of truth. It is vendored: MUST NOT edit it. If it needs a change, ask.
- `routing-lab/` = the OLD map/routing (legacy). MUST NOT edit, fix or extend it. New code MUST NOT import from it. Keep it runnable until Phase 5 (§4).
- One name is a prefix of the other. When searching or importing, match `routing-lab-v2` and `routing-lab/` separately.

**Before coding:** read `routing-lab-v2/` and the existing ResQnet code. Reuse, do not re-implement. If a requirement or value (threshold, spacing, radius) is undefined, use the `routing-lab-v2/` config value or ask. Never invent one.

---

## 0. Scope lock (strict — overrides everything below)

**Goal: integrate the Map Engine and nothing else. Anything not listed as allowed is read-only.**

**Allowed to change:**
- Map Engine adapter, `routing-lab-v2` wiring, MapLibre map component, coordinate helpers
- Map UI, including purpose-built UI for missing map functions (§3)
- Map tests
- The minimum additive backend/data change the map strictly needs (e.g. mission `target_lat`/`target_lng`, storing hazard/closure/hub geometry)

**Read-only unless explicitly approved:** existing backend logic and API contracts, auth and permission logic, existing DB tables/columns/data, non-map pages and dashboards, business workflows, global theme/styles, dependencies, build/CI/env config, unrelated tests.

- **Ask first.** For any edit outside the allowed list (or if unsure it is allowed): state the file, why the map cannot work without it, and the smallest possible change. Then STOP and wait for approval.
- **No drive-by work.** No refactors, renames, reformatting, cleanups, dependency upgrades or unrelated bug fixes. Log them in `memory.md` under "Out-of-scope findings" and leave them untouched.
- **Minimal diff.** Smallest change that meets the requirement. Prefer adding new code over rewriting existing code. Do not touch lines you did not need to change.
- **Backend/API:** existing endpoints and response shapes MUST stay backward compatible. New endpoints or fields only if the map requires them, additive, and approved.
- **Database:** additive only. MUST NOT drop, rename, alter or delete existing tables, columns or data.
- **Dependencies:** packages that `routing-lab-v2` itself needs may be added only after you list them and get approval.
- **Auth/roles:** MUST NOT change existing auth or permission logic. Map role controls use the existing mechanism.
- **Report every change.** After each task, list every file changed and why. Flag anything outside the allowed list.

---

## 1. Architecture & data ownership

**One authoritative routing pipeline. No second routing engine.**

```
ResQnet state → Map Engine adapter → routing-lab-v2 services → OSRM
              → route safety / detour decision → GeoJSON → MapLibre
```

- ResQnet owns: authentication, role permissions, persistent business data (incidents/SOS, missions, responders, hazards, Safety Hubs, road records) and workflows.
- The Map Engine owns: rendering, road-following routing, route safety, detours, road-section geometry, GPS visualization, progress, arrows, off-route detection, rerouting, arrival, map interaction.
- The **Map Engine adapter** is the only bridge. UI and business code MUST NOT call OSRM or routing-lab-v2 internals directly.
- Reuse routing-lab-v2 services (Routing, Route Safety, Routing Decision, Detour, Road Section, Safety Hub, Route Progress, GPS pipeline, MapLibre component). MUST NOT create parallel versions.
- Missions MUST carry explicit `target_lat` / `target_lng` for navigation. `road_id` is business context only. MUST NOT derive a target by averaging road/intersection endpoints.
- Roads and intersections MAY remain for business records. They MUST NOT act as a route generator.

---

## 2. Coordinates, routing & safety logic

### Coordinates (critical failure mode)
- App state uses `{ lat, lng }`. GeoJSON, MapLibre and OSRM use `[lng, lat]`.
- OSRM URL order: `/route/v1/driving/{lng1},{lat1};{lng2},{lat2}`.
- Convert only in shared adapter helpers. MUST NOT swap inline. Every marker, route, hazard, closure, hub, incident, responder and GPS point MUST reach MapLibre as `[lng, lat]`.
- Route geometry MUST be a valid GeoJSON `LineString`.

### Routing & safety
- Routes MUST be real OSRM road-following routes (driving profile, full geometry). Preserve steps and metrics for the navigation UI.
- A route is NOT safe just because OSRM can reach B. Evaluate it against hazards, full-road closures and road-section closures → `SAFE / WARNING / UNSAFE`.
- Unsafe or blocked → generate detour candidates, re-evaluate them, and choose via the routing decision logic.
- MUST NOT draw a synthetic straight line as a fallback. Invalid geometry or no route → surface a routing error or the engine's defined fallback.
- A/B and Closure Start/End are different things. Closure handles MUST NEVER be reused as route endpoints.
- Road sections: project both gates onto the same road LineString and slice between them. While dragging, preview locally with NO OSRM calls. Only the confirmed section enters safety evaluation.

### Safety Hubs
- Eligible only if: active AND verified AND capacity > 0 AND occupancy < capacity. Full, closed or unverified hubs MUST NOT be evacuation destinations.
- Route to `entranceLocation` when present, otherwise `location`.
- Draft geometry MUST stay separate from saved geometry. Editing one hub MUST NOT move a saved hub.

### GPS & SOS
- Use `watchPosition` / `clearWatch`. Track status, position, accuracy, heading, speed, timestamp, error.
- Permission denied / unavailable / timeout → explicit ERROR state. Never pretend GPS is active. Manual A/B stays available where permitted.
- One persistent GPS marker, updated in place. No auto-recenter on GPS fix, pan, zoom or tool activation.
- GPS MUST NOT overwrite manual A/B unless the user explicitly chooses current location. Responder mission navigation intentionally uses live GPS as A.
- Citizen GPS, responder GPS and the SOS/incident marker are separate objects and states.
- SOS: use live GPS, else the approved fallback location; create a CRITICAL incident with a fixed location.

### Navigation
States: `IDLE → NAVIGATING → OFF_ROUTE → RE_ROUTING → NAVIGATING`, or `NAVIGATING → ARRIVED`.
- Progress: project GPS onto the route LineString; derive remaining geometry, distance and duration.
- Arrows: generated from remaining geometry only (about 60–100 m spacing, bearing from route segments). They MUST shrink as progress increases, regenerate after reroute, and clear on arrival.
- Off-route: distance-from-route threshold AND repeated out-of-route fixes. Reroute: current GPS becomes the new A; the mission target stays B.
- Rerouting is event/threshold driven. MUST NOT call OSRM on every GPS update.
- New closure, hazard change or off-route → re-evaluate the active route and detour if needed.
- Arrival within the configured threshold → `ARRIVED`, clear navigation arrows, mission becomes on-scene.

---

## 3. Role permissions & map UI

Role permissions MUST be enforced, not only hidden in the UI.

| Function | Citizen | Coordinator | Responder |
|---|:-:|:-:|:-:|
| View map, hazards, closures, Safety Hubs | ✓ | ✓ | ✓ |
| GPS / My Location | ✓ | optional | ✓ |
| A→B routing, safe route | ✓ | optional | ✓ |
| Create hazard, block road / section, create hub | — | ✓ | — |
| SOS | ✓ | receives | — |
| View incidents / responders | — | all | assigned / own location |
| Dispatch, create mission + target | — | ✓ | — |
| Navigate to mission | — | — | ✓ |
| Progress, arrows, off-route, reroute, arrival | ✓* | — | ✓ |

\*The docs differ (main: Citizens get these; map: "where enabled"). Gate behind a role config flag and ask the owner for the default.

### Interaction modes
Use the modes defined in `routing-lab-v2`: Explore, Place/Drag Start/Destination, hub/facility/hazard/danger area, Block Road/Section, Polygon Edit.
- In Explore, an empty click inspects/selects and MUST NOT change A/B. Pan, zoom, Set Start/Destination, marker drag and reset are distinct actions. Return to Explore after placing A or B.
- Authoring tools appear only when their workflow is active AND the role allows it.

### Camera
Move the camera only on explicit actions: Recenter, Center on Me, Focus Hub, Fit Route. Fit Route uses MapLibre camera padding for the UI regions. CSS MUST NOT shift geographic objects.

### Layout — no overlap
- Every overlay owns a region: **Top** header/search/status · **Secondary** status chips · **Left** navigation/mission card · **Right** map controls · **Bottom** legend/contextual sheet · **Bottom edge** role navigation (reserved).
- No two components share pixels. MUST NOT fix overlap by raising z-index; use regions, collapsible panels and responsive containers.
- Active navigation has priority over secondary content. Legends are collapsible and role-aware. Layouts MUST work on desktop, tablet and mobile.
- Layer order (bottom→top): base map, hazard areas, road editing, blocked roads, candidate routes (diagnostic), route casing, active route, arrows, operational markers, GPS, A/B markers. Route/navigation geometry MUST NOT be hidden by hazard or UI layers.
- If a required map function has no UI (Coordinator Block Road Section, Responder Navigate to Mission, Citizen Safe Evacuation), build a purpose-built UI in ResQnet's existing visual language, inside the §0 scope.

---

## 4. Migration & acceptance

**Approach: foundation first, then one role at a time. Every phase ends with a working app.**

| Phase | Scope |
|---|---|
| 1 Foundation | Adapter, routing-lab-v2 wiring, coordinate helpers, MapLibre map, A→B safe route |
| 2 Coordinator | Mission target coordinates, hazards, block road/section, Safety Hubs, incident/responder map, dispatch |
| 3 Responder | Live GPS, Navigate to Mission, progress, arrows, off-route, reroute, arrival |
| 4 Citizen | GPS, set start/destination, safe route, hub evacuation, SOS |
| 5 Parity & removal | Full checklist passes, then remove legacy (with approval) |

- One phase at a time, in small reviewable changes. Do not start a phase until the previous phase's checklist items pass.
- Run V2 alongside the old map. Switch features to `routing-lab-v2` phase by phase through the adapter. MUST NOT swap, overwrite or rename the folders in place.
- Legacy removal (old `routing-lab/`, Dijkstra routing, synthetic road graph, old map) happens only in Phase 5, after the full checklist passes and with explicit approval.
- Before each phase: state the plan and files to touch, and flag any outside the §0 allowed list. After: report which checklist items pass and which do not.

### Acceptance
The 21-item acceptance checklist (Map Engine doc §41) is tracked in `memory.md` §2. A phase is done only when its listed items pass.

---

## 5. Agent conduct
- At the start of every session, read `memory.md`. At the end, update it (status, phase tracker, decisions, gotchas, out-of-scope findings, session log). If it conflicts with this file, this file wins.
- When the docs are silent, ask. List assumptions in your plan.
- MUST NOT hardcode coordinates, fake routes or mock data in production paths.
- Add tests for: coordinate order, safety classification, hub eligibility, road-section slicing, progress/arrows, off-route, arrival.
