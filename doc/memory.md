# ResQnet × Map Engine V2 — Project Memory

Last updated: 2026-09-20

---

## §0 Scope lock compliance notes

- All changes in this session are additive (new tables, new module, new CORS origin).
- No existing endpoints, schemas, models, auth logic, or DB columns were altered.
- Rules.md §0 "ask first" followed: implementation plan approved before coding.

---

## §1 Phase tracker

| Phase | Status |
|---|---|
| 1 Foundation | Adapter / routing-lab-2v wiring — **DONE (2026-09-20)** |
| 2 Coordinator | Backend persistence (hub_map_geometry, road_closures, /map API) — **DONE (2026-09-20)** |
| 3 Responder | Live GPS, Navigate to Mission, deep-link token handoff — **DONE (2026-09-20)** |
| 4 Citizen | GPS, SOS, evacuation routing, road closures layer, 5s sync — **DONE (2026-09-20)** |
| 5 Parity & removal | In Progress |

---

## §2 Acceptance checklist (Map Engine doc §41)

Not yet tracked per-item. Will populate when Phase 1 frontend wiring begins.

---

## §3 Decisions log

| Date | Decision |
|---|---|
| 2026-09-20 | routing-lab-2v pulls hazards, hubs, and closures dynamically from GET /map/state; removed hardcoded seed data from initial production state |
| 2026-09-20 | State polling runs every ~4s and on tab focus; active route re-evaluates only when `version` changes (event-driven, never per GPS fix) |
| 2026-09-20 | Token handoff captures #token=... on mount, persists to sessionStorage['resqnet_token'], and strips fragment via history.replaceState |
| 2026-09-20 | Hub eligibility maps: active=(status!='closed'), capacity=max_capacity, occupancy=current_occupancy, verified=(is_verified!==false), entrance=entrance_geom ?? location |
| 2026-09-20 | hub_map_geometry endpoint does NOT touch safety_hubs columns — only writes to the new extension table |
| 2026-09-20 | CORS: added localhost:5174 (Map Engine V2 Vite port) — no other origins removed |
| 2026-09-20 | Road closures use soft-delete (is_active=False), not hard DELETE |
| 2026-09-20 | ResQnet maps fetch `/map/state` closures & hub geometries; refresh interval set to 5s + window focus |
| 2026-09-20 | Every "Open Map" link passes token via `#token=<encoded token>` while keeping `?role=` |

---

## §4 Architecture notes

- ResQnet backend: FastAPI + SQLAlchemy async + PostGIS (PostgreSQL)
- Map Engine V2: Vite/MapLibre app at localhost:5174 (routing-lab-2v dir)
- Map Engine adapter is the ONLY bridge between the two — no direct OSRM calls from ResQnet UI
- Alembic chain: 71867cddef4b (frozen v1) → a1b2c3d4e5f6 (map geometry tables)

---

## §5 Out-of-scope findings

- .venv and .venv in backend reference Python 3.11 at C:\Users\Aman kumar\... (no longer present)
  → Created .venv_agy (Python 3.14) for running alembic/tests going forward
- psycopg2-binary has no Python 3.14 wheel; synchronous operations use psycopg2 path (Alembic sync migration)
  → Mitigation: Alembic env.py uses SYNC_DATABASE_URL with psycopg2; may need pg_config or use asyncpg adapter

---

## §6 Session log

### 2026-09-20 — V2 Adapter & Live API Synchronization
**Files changed:**
- `routing-lab-2v/src/services/resqnetAdapter.ts` — NEW adapter handling token handoff, [lng, lat] coordinate conversions, hub eligibility mapping, and REST methods
- `routing-lab-2v/src/services/mapSyncService.ts` — NEW polling service (~4s and focus event) with version diff detection
- `routing-lab-2v/src/App.tsx` — removed hardcoded seed data from initial production state; connected useMapSync; wired coordinator confirm actions to backend REST endpoints
- `routing-lab-2v/test_map_sync_adapter.ts` — NEW test suite verifying coordinate order, hub eligibility rules, and closure save/load round-trip

**Completed:**
- Verified token extraction from URL hash `#token=...`, persistence into `sessionStorage['resqnet_token']`, and `history.replaceState` hash cleanup
- Verified hub eligibility mapping rules with `checkSafetyHubEligibility`
- Verified live closure creation, retrieval from `/map/state`, and soft deactivation round-trip
- Verified production build (`npm run build`) passes cleanly with zero errors

### 2026-09-20 — Backend map persistence (Phase 2 backend)
**Files changed:**
- `app/core/config.py` — added localhost:5174 to CORS_ORIGINS
- `app/db/models.py` — appended HubMapGeometry (model 20) and RoadClosure (model 21); additive relationship on SafetyHub
- `alembic/versions/a1b2c3d4e5f6_add_map_geometry_tables.py` — NEW migration
- `app/modules/map/__init__.py` — NEW (empty)
- `app/modules/map/schemas.py` — NEW (MapStateResponse, RoadClosureCreate/Update/Out, HubMapGeometryUpsert/Out)
- `app/modules/map/service.py` — NEW (get_map_state, CRUD road closures, upsert hub geometry)
- `app/modules/map/router.py` — NEW (GET /map/state, CRUD /map/road-closures, PATCH /map/hubs/{id}/map-geometry)
- `backend/tests/test_map_sync.py` — NEW test suite verifying RBAC, GeoJSON coordinates [lng, lat], audit logs, and hub geometry upserts

**Completed:**
- `alembic upgrade head` executed — DB upgraded to revision `a1b2c3d4e5f6`
- Verified DB relations: `hub_map_geometry` and `road_closures` created; all original 17 application tables intact
- Rebuilt and restarted backend container (`resqnet_backend`)
- Verified live endpoints: `GET /api/v1/map/state`, `POST /api/v1/map/road-closures`, `PATCH /api/v1/map/hubs/{id}/map-geometry`
- Verified RBAC enforcement: 403 Forbidden for Citizen/Responder on closure & geometry authoring
- Verified AuditLog generation for road closures
- Pytest suite `tests/test_map_sync.py` (4/4 passed)
- Branch `feat/map-sync` clean and up-to-date
