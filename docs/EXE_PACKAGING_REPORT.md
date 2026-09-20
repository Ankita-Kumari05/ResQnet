# ResQnet EXE Packaging & Standalone Release Report
**Smart India Hackathon 2026**

---

## 1. Existing Architecture

ResQnet is an offline-first disaster response and field coordination platform designed for Smart India Hackathon 2026. Prior to standalone Windows packaging, the project operated across separate development environments:

- **Frontend**: React 19.2 + TypeScript + Vite 8.2 + TailwindCSS 4.3 + MapLibre GL 6.7. Development required `npm run dev` running on port `5173`.
- **Backend**: FastAPI modular monolith running via Uvicorn on port `8000`. Modules include Auth, Roads, Hazards, Routing (Dijkstra/NetworkX), Hubs, Incidents, Missions, Field Surveys, Resources, Campaigns, Donations, and Sync Queue.
- **Database**: PostgreSQL 16/18 with PostGIS 3.6 extension running on port `5432` with user `resqnet`. Schema revision is frozen at Alembic head `71867cddef4b`.
- **Simulation Engine**: Standalone disaster simulation service on port `9000` with interactive UI at `/ui`. Driven by JSON scenarios (`FLOOD_DEMO_01`, `EARTHQUAKE_DEMO_01`, `LANDSLIDE_DEMO_01`).

---

## 2. Startup Architecture

The target operational architecture requires two independent executables:

```
┌────────────────────────────────────────────────────────┐
│               ResQnet_Prototype.exe                    │
│   (One-Click Complete Operational Platform Launcher)   │
└───────────┬────────────────┬───────────────────────────┘
            │                │
            ▼                ▼
     ┌──────────────┐ ┌──────────────┐
     │  PostgreSQL  │ │   FastAPI    │
     │   /PostGIS   │ │   Backend    │
     │  (Port 5432) │ │ (Port 8000)  │
     └──────────────┘ └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │   Frontend   │
                      │  Production  │
                      │ (Port 5173)  │
                      └──────┬───────┘
                             │
                             ▼
                          Browser
```

Separate Simulation Controller:
```
┌────────────────────────────────────┐
│   ResQnet_Simulation_Engine.exe    │
│    (Port 9000 — Standalone UI)     │
└─────────────────┬──────────────────┘
                  │
                  ▼ HTTP REST Only
           ResQnet Backend
             (Port 8000)
```

---

## 3. Prototype EXE Architecture (`ResQnet_Prototype.exe`)

The Prototype Orchestrator is a zero-console, graphical Windows application:
1. **Directory Discovery**: Resolves its application base path dynamically at runtime.
2. **Configuration Loading**: Reads relative configuration from `config/config.ini`.
3. **Database Health Probe**: Connects to `127.0.0.1:5432`, verifies PostGIS, checks schema revision (`71867cddef4b`). Automatically manages WSL2 / keepalive / `pg_proxy` bridging if necessary.
4. **Idempotent State Check**: Inspects table records. If populated (660 users, 135 roads, 180 hubs), preserves all data without destructive drops.
5. **Backend Lifecycle**: Launches `backend_service.exe` on port `8000`. Polls `/api/v1/health` until database connectivity reports `connected`.
6. **Frontend Static Server**: Serves pre-built production assets from `frontend/dist/` on port `5173`, with client-side SPA routing fallback and `/api` reverse proxy to port `8000`.
7. **Browser Automation**: Automatically launches the default web browser to `http://127.0.0.1:5173`.
8. **Process Supervision**: Keeps child processes under active supervision, logs errors, and terminates all child services cleanly upon exit.

---

## 4. Simulation Engine EXE Architecture (`ResQnet_Simulation_Engine.exe`)

The Simulation Engine executable is strictly decoupled from PostgreSQL:
1. **Pre-flight Health Check**: Queries `http://127.0.0.1:8000/health`. If ResQnet is not running, displays a friendly user dialog: *"ResQnet Prototype is not running. Start ResQnet_Prototype.exe first."* and terminates without error.
2. **Server Launch**: Starts the simulation FastAPI server on port `9000`.
3. **UI Launch**: Opens `http://127.0.0.1:9000/ui` in the browser.
4. **Zero Database Contact**: Source audit verifies 0 occurrences of SQL/ORM imports. All disaster events enter via official HTTP REST API endpoints.

---

## 5. Database Packaging Strategy

PostgreSQL with PostGIS requires compiled spatial extensions (C libraries, GEOS, PROJ, GDAL). In accordance with the prompt's instructions:
- **No SQLite substitution**: Full PostgreSQL/PostGIS is preserved.
- **Multi-tiered detection**:
  1. Detects native or already running PostgreSQL on port 5432.
  2. Detects local embedded PostgreSQL in `data/pgsql` if bundled.
  3. Detects WSL2 Ubuntu PostgreSQL 18 + PostGIS 3.6 service with automatic TCP bridge (`pg_proxy.py`).
  4. Detects Docker container `resqnet_db`.
- **Honest Dependency Disclosure**: On a system without PostgreSQL/PostGIS installed, the launcher gracefully informs the user rather than faking independence.

---

## 6. Backend Packaging Strategy

- Packaged using **PyInstaller 6.22** into `release/ResQnet_Prototype/backend_service/backend_service.exe`.
- Collects all dependencies: FastAPI, Uvicorn, SQLAlchemy, asyncpg, psycopg2, GeoAlchemy2, Shapely, Pydantic, NetworkX, Passlib/Bcrypt.
- Includes hidden imports for async Uvicorn loops and protocols.

---

## 7. Frontend Packaging Strategy

- Built using the native production pipeline: `tsc -b && vite build`.
- Generates optimized static assets in `frontend/dist/`.
- Served via built-in production static server on port `5173`, proxying `/api` requests to port `8000` (replicating the production Nginx container design).
- Zero Node.js or `npm run dev` required by the end user.

---

## 8. Configuration Strategy

Application-relative configuration via `config/config.ini`:
- Avoids developer machine hardcoded paths.
- Default settings: Backend `127.0.0.1:8000`, Frontend `127.0.0.1:5173`, Database `127.0.0.1:5432`, Simulation `127.0.0.1:9000`.

---

## 9. Logging

Centralized structured logging in `logs/`:
- `prototype.log`: Orchestrator startup, readiness transitions, process management.
- `startup.log`: Clean human-readable startup sequence and error messages.
- `backend.log`: FastAPI access logs, API route executions, database query statuses.
- `frontend.log`: Static file and reverse proxy requests.
- `simulation.log`: Simulation scenarios, event dispatches, and pause/resume states.
- Passwords and secret keys are never logged.

---

## 10. Security

- Authentication: JWT access tokens preserved.
- RBAC: Role-based access control for Coordinator, Citizen, Responder, Fundraiser intact.
- Network Isolation: Simulation engine has zero database credentials.
- Zero Hardcoded Production Secrets: Standard development keys with warning in configuration.

---

## 11. Build Process

Two one-click developer batch files:
1. `BUILD_PROTOTYPE.bat`
2. `BUILD_SIMULATION_ENGINE.bat`

Detects root via `%~dp0`, verifies tools, compiles frontend, packages executables, and assembles the release distributions.

---

## 12. Release Structure

```
release/
├── ResQnet_Prototype/
│   ├── ResQnet_Prototype.exe
│   ├── backend_service/
│   │   └── backend_service.exe
│   ├── frontend/
│   │   └── dist/
│   ├── config/
│   │   └── config.ini
│   ├── data/
│   ├── logs/
│   └── README.txt
│
└── ResQnet_Simulation_Engine/
    ├── ResQnet_Simulation_Engine.exe
    ├── sim_service/
    │   └── sim_service.exe
    ├── scenarios/
    │   ├── FLOOD_DEMO_01.json
    │   ├── EARTHQUAKE_DEMO_01.json
    │   └── LANDSLIDE_DEMO_01.json
    ├── config/
    │   └── config.ini
    ├── logs/
    └── README.txt
```
