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
| 1 Foundation | Adapter / routing-lab-2v wiring — NOT STARTED |
| 2 Coordinator | Backend persistence (hub_map_geometry, road_closures, /map API) — **DONE (2026-09-20)** |
| 3 Responder | Live GPS, Navigate to Mission — NOT STARTED |
| 4 Citizen | GPS, SOS, evacuation routing — NOT STARTED |
| 5 Parity & removal | NOT STARTED |

---

## §2 Acceptance checklist (Map Engine doc §41)

Not yet tracked per-item. Will populate when Phase 1 frontend wiring begins.

---

## §3 Decisions log

| Date | Decision |
|---|---|
| 2026-09-20 | hub_map_geometry endpoint does NOT touch safety_hubs columns — only writes to the new extension table |
| 2026-09-20 | CORS: added localhost:5174 (Map Engine V2 Vite port) — no other origins removed |
| 2026-09-20 | Road closures use soft-delete (is_active=False), not hard DELETE |

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

### 2026-09-20 — Backend map persistence (Phase 2 backend)
**Files changed:**
- `app/core/config.py` — added localhost:5174 to CORS_ORIGINS
- `app/db/models.py` — appended HubMapGeometry (model 20) and RoadClosure (model 21); additive relationship on SafetyHub
- `alembic/versions/a1b2c3d4e5f6_add_map_geometry_tables.py` — NEW migration
- `app/modules/map/__init__.py` — NEW (empty)
- `app/modules/map/schemas.py` — NEW (MapStateResponse, RoadClosureCreate/Update/Out, HubMapGeometryUpsert/Out)
- `app/modules/map/service.py` — NEW (get_map_state, CRUD road closures, upsert hub geometry)
- `app/modules/map/router.py` — NEW (GET /map/state, CRUD /map/road-closures, PATCH /map/hubs/{id}/map-geometry)
- `app/api/v1/router.py` — added map_router import + include_router
- `doc/memory.md` — NEW (this file)

**Pending:**
- Run `alembic upgrade head` once Python 3.11 venv or pg_config is available
- Frontend wiring (Phase 1 adapter — separate task)
