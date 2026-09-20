# ResQnet — Workflow & Build Documentation

> **Smart India Hackathon 2026 Prototype**
> Offline-first Disaster Response & Field Coordination Platform
> Version: 1.0.0 · Stack: FastAPI + React + PostgreSQL/PostGIS

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Directory Structure](#4-directory-structure)
5. [Backend Modules](#5-backend-modules)
6. [Frontend Pages & Components](#6-frontend-pages--components)
7. [Simulation Engine](#7-simulation-engine)
8. [Data Flow & Workflows](#8-data-flow--workflows)
9. [User Roles & Permissions](#9-user-roles--permissions)
10. [Build & Setup Guide](#10-build--setup-guide)
11. [Docker Deployment](#11-docker-deployment)
12. [Environment Configuration](#12-environment-configuration)
13. [API Reference](#13-api-reference)
14. [Key Design Principles](#14-key-design-principles)

---

## 1. Project Overview

**ResQnet** is a disaster response and field coordination platform built for the Smart India Hackathon 2026. It provides a unified operational picture for:

- **Citizens** — Report incidents, access safety information, find shelters
- **NGO Responders** — Receive missions, perform field surveys, update ground truth
- **Coordinators** — Manage operations, dispatch teams, monitor the full situational map
- **Fundraisers** — Browse and donate to active disaster relief campaigns
- **Admins** — Manage platform users, audit logs, and system health

### Key Capabilities

| Capability | Description |
|---|---|
| Offline-First | Service Worker + Dexie.js IndexedDB + Sync Queue |
| Safe Routing | Dijkstra algorithm on a PostGIS graph, excludes blocked/hazardous roads |
| Two-Tier Ground Truth | Citizen reports = UNVERIFIED until NGO verifies via field survey |
| Automation-First | System handles routine dispatching; coordinator supervises |
| Simulation Engine | Separate process to inject deterministic disaster scenarios for demos |

---

## 2. System Architecture

```
+---------------------------------------------------------------------+
|                          CLIENT LAYER                               |
|   React 19 + Vite + TypeScript + Tailwind CSS v4 + MapLibre GL     |
|   +----------+ +----------+ +-----------+ +----------+ +--------+  |
|   | Citizen  | |Responder | |Coordinator| |Fundraiser| | Admin  |  |
|   |Dashboard | |Dashboard | | Dashboard | |  Page    | | Panel  |  |
|   +----------+ +----------+ +-----------+ +----------+ +--------+  |
|              Service Worker (Offline)  +  Dexie.js (IndexedDB)      |
+-------------------------------+---------+---------------------------+
                                |
                     REST API (HTTP/JSON) | JWT Bearer Token Auth
                                |
+-------------------------------v-------------------------------------+
|                        BACKEND LAYER                                |
|                  FastAPI Modular Monolith (Port 8000)               |
|  +---------+ +----------+ +----------+ +----------+ +-----------+  |
|  | Auth &  | | Incident | |  Roads & | | Routing  | |  Safety   |  |
|  |  Users  | | Reports  | |  Hazards | |  Engine  | |   Hubs    |  |
|  +---------+ +----------+ +----------+ +----------+ +-----------+  |
|  +---------+ +----------+ +----------+ +----------+ +-----------+  |
|  |Missions/| |  Field   | |   Sync   | |Campaigns/| |Simulation |  |
|  |   NGO   | | Surveys  | |  Queue   | |Donations | |  Router   |  |
|  +---------+ +----------+ +----------+ +----------+ +-----------+  |
|                    Async SQLAlchemy ORM + Alembic                   |
+-------------------------------+---------+---------------------------+
                                | SQL + PostGIS
+-------------------------------v-------------------------------------+
|                       DATABASE LAYER                                |
|              PostgreSQL 16 + PostGIS 3.4 (Port 5432)               |
|       Spatial queries - Road graph - Hazard zones - GIS data        |
+---------------------------------------------------------------------+
                                ^
                                | HTTP API calls only (no direct DB access)
+-------------------------------+-------------------------------------+
|                  SIMULATION ENGINE (Separate Process)               |
|                   Python FastAPI (Port 9000)                        |
|       Injects deterministic disaster scenarios via REST API          |
|       Scenarios: Flood, Earthquake, Landslide                       |
+---------------------------------------------------------------------+
```

---

## 3. Tech Stack

### Backend

| Component | Technology | Version |
|---|---|---|
| Web Framework | FastAPI | 0.115.0 |
| ASGI Server | Uvicorn | 0.30.6 |
| ORM | SQLAlchemy (async) | 2.0.35 |
| Async DB Driver | asyncpg | 0.29.0 |
| Sync DB Driver | psycopg2-binary | 2.9.9 |
| Migrations | Alembic | 1.13.3 |
| Validation | Pydantic v2 | 2.9.2 |
| Auth | python-jose (JWT) + passlib (bcrypt) | 3.3.0 / 1.7.4 |
| Geospatial | GeoAlchemy2 + Shapely | 0.15.2 / 2.0.6 |
| Graph Routing | NetworkX (Dijkstra) | 3.3 |
| QR Codes | qrcode[pil] | 7.4.2 |
| Runtime | Python | 3.12+ |

### Frontend

| Component | Technology | Version |
|---|---|---|
| UI Framework | React | 19.2.8 |
| Build Tool | Vite | 8.2.2 |
| Language | TypeScript | 6.0.2 |
| Styling | Tailwind CSS v4 | 4.3.3 |
| Map Rendering | MapLibre GL | 6.7.0 |
| Routing | React Router DOM | 7.18.3 |
| HTTP Client | Axios | 1.20.0 |
| Offline DB | Dexie.js (IndexedDB) | 4.4.5 |
| Charts | Recharts | 3.10.1 |
| Icons | Lucide React | 1.41.0 |
| Notifications | React Hot Toast | 2.6.0 |
| QR Display | qrcode.react | 4.2.0 |
| Linter | OxLint | 1.79.0 |

### Database

| Component | Technology |
|---|---|
| Database | PostgreSQL 16 |
| Spatial Extension | PostGIS 3.4 |
| Docker Image | postgis/postgis:16-3.4 |

---

## 4. Directory Structure

```
ResQnet/
├── backend/                    # FastAPI backend (Python)
│   ├── app/
│   │   ├── main.py             # App entry point - registers all routers
│   │   ├── api/v1/router.py    # Versioned API router (/api/v1)
│   │   ├── core/               # Config, security, logging, exceptions
│   │   ├── db/                 # DB session, models, base
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Cross-cutting service layer
│   │   ├── utils/              # Helper utilities
│   │   └── modules/            # Domain modules (see Section 5)
│   ├── alembic/                # DB migration scripts
│   ├── scripts/                # seed.py and utilities
│   ├── tests/                  # pytest test suite
│   ├── Dockerfile              # Backend container
│   └── requirements.txt        # Python dependencies
│
├── frontend/                   # React + Vite frontend (TypeScript)
│   ├── src/
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx             # Router configuration
│   │   ├── pages/              # Role-specific dashboards
│   │   ├── components/         # Shared UI components
│   │   ├── contexts/           # React context providers
│   │   ├── lib/                # API clients, utilities, offline logic
│   │   └── types/              # TypeScript type definitions
│   ├── public/                 # Static assets
│   ├── Dockerfile              # Frontend container (nginx)
│   ├── nginx.conf              # Production nginx config
│   ├── vite.config.ts          # Vite build configuration
│   └── package.json            # NPM dependencies
│
├── simulation_engine/          # Standalone simulation service (Python)
│   ├── app/
│   │   ├── main.py             # FastAPI entry (port 9000)
│   │   ├── api_client.py       # ResQnet HTTP client
│   │   └── ...                 # Scenario runners, clock, models
│   ├── config/                 # JSON scenario definition files
│   └── requirements.txt
│
├── docs/                       # Project documentation
├── docker-compose.yml          # Multi-service container orchestration
├── START_RESQNET.bat           # One-click Windows dev launcher
├── .env.example                # Template for environment variables
└── README.md                   # Project quickstart
```

---

## 5. Backend Modules

The backend is a **Modular Monolith** — all domain logic is cleanly separated into modules, each owning its router, service, and schemas, while sharing a single database and deployment.

| Module | Path | Responsibility |
|---|---|---|
| `auth` | `modules/auth/` | JWT login, registration, token refresh, password hashing (bcrypt) |
| `admin` | `modules/admin/` | Admin-only CRUD: user management, audit viewing, system status |
| `incidents` | `modules/incidents/` | Citizen incident reports — created as UNVERIFIED; triggers clustering |
| `clusters` | `modules/clusters/` | Spatial + temporal clustering of incident reports into incident clusters |
| `missions` | `modules/missions/` | Mission lifecycle: create → assign → accept → in_progress → complete |
| `field_surveys` | `modules/field_surveys/` | Ground-truth field surveys by responders → verification pipeline |
| `roads` | `modules/roads/` | Road network: status (CLEAR/BLOCKED/DAMAGED), geospatial segments |
| `hazards` | `modules/hazards/` | Hazard zones: flood/earthquake/landslide areas with polygon geometry |
| `routing` | `modules/routing/` | Dijkstra safe-route calculation using NetworkX, excludes blocked roads |
| `hubs` | `modules/hubs/` | Safety/shelter hubs: occupancy tracking with SELECT FOR UPDATE concurrency |
| `resources` | `modules/resources/` | Hub resource inventory (food, water, medical supplies) |
| `campaigns` | `modules/campaigns/` | Fundraising campaigns: DRAFT → ACTIVE → COMPLETED lifecycle |
| `donations` | `modules/donations/` | Donation recording linked to campaigns |
| `fundraising` | `modules/fundraising/` | Fundraising aggregate analytics and views |
| `alerts` | `modules/alerts/` | Emergency alert broadcasts to all users |
| `sync` | `modules/sync/` | Offline sync queue — reconciles queued mutations on reconnect |
| `simulation` | `modules/simulation/` | Simulation control endpoints (used by simulation engine) |
| `audit` | `modules/audit/` | Immutable audit log for all state-changing operations |

### Module Internal Structure (Typical)

```
modules/<name>/
├── __init__.py
├── router.py      # FastAPI APIRouter — HTTP endpoints
├── service.py     # Business logic — called by router
├── schemas.py     # Pydantic models (request/response)
└── models.py      # (if module-specific ORM models needed)
```

### Core Services

| File | Purpose |
|---|---|
| `core/config.py` | Pydantic-settings config, loaded via get_settings() with lru_cache |
| `core/security.py` | JWT creation/verification, password hashing |
| `core/logging.py` | Structured logging setup |
| `core/exceptions.py` | Custom AppException hierarchy |
| `core/audit.py` | Audit log writer utility |
| `db/session.py` | Async SQLAlchemy session factory + get_db() dependency |

---

## 6. Frontend Pages & Components

### Pages (src/pages/)

| File | Route | Description |
|---|---|---|
| `LoginPage.tsx` | /login | Auth entry — JWT stored, role-based redirect after login |
| `RegisterPage.tsx` | /register | New user registration with role selection |
| `CitizenDashboard.tsx` | /dashboard | Incident reporting, shelter finder, safe routes, offline queue |
| `ResponderDashboard.tsx` | /dashboard | Mission list, field survey submission, verification workbench |
| `CoordinatorDashboard.tsx` | /dashboard | Full operational map, mission dispatch, simulation panel, analytics |
| `AdminDashboard.tsx` | /admin | User management, audit log viewer, platform health |
| `FundraisingPage.tsx` | /fundraising | Campaign browser, donation flow |
| `EmergencyScreen.tsx` | /emergency | High-contrast emergency info screen |

### Shared Components (src/components/)

| File | Description |
|---|---|
| `AppShell.tsx` | Layout wrapper — nav bar, auth guard, role-based routing |
| `ResQnetMap.tsx` | Main MapLibre GL map — layers for incidents, roads, hubs, hazards |
| `Navbar.tsx` | Top navigation bar with role-aware links and emergency button |
| `EmergencyAlertBanner.tsx` | Live banner displayed when active emergency alerts exist |
| `EmergencyModeModal.tsx` | Full-screen emergency mode overlay |
| `BottomSheet.tsx` | Mobile-friendly slide-up panel for detail views |

---

## 7. Simulation Engine

The Simulation Engine is a **physically separate** FastAPI service (port 9000) that emulates external disaster information sources for SIH demo purposes.

### Key Design Constraints

- **NO direct database access** — all events go through ResQnet's REST API only
- **NO schema modifications** — frozen ResQnet DB schema is fully preserved
- **NO fake/verified data** — all injected citizen reports remain UNVERIFIED
- **Source attribution** — all simulated data carries [SIM] prefix in title/message fields

### Supported Scenarios

| Scenario ID | Disaster Type | Key Targets |
|---|---|---|
| `FLOOD_DEMO_01` | North Canal Flood | Hub Alpha, Road 12, HazardZone 1 |
| `EARTHQUAKE_DEMO_01` | Capital District Earthquake | Hub Gamma, Road 6, HazardZone 1 |
| `LANDSLIDE_DEMO_01` | Northern Hill Slope Failure | Hub Beta, Road 1, HazardZone 2 |

### Standard 7-Event Timeline (same structure across all scenarios)

| T+ | Event Type | ResQnet API Endpoint | Business Logic Triggered |
|---|---|---|---|
| T+00 | Warning Alert | POST /api/v1/alerts | EmergencyAlert created + AuditLog |
| T+10 | Hazard Activation | POST /api/simulation/events/flood | HazardZone activated, routing cache invalidated |
| T+20 | Citizen Reports | POST /api/simulation/events/reports/generate | 3x UNVERIFIED IncidentReports + clustering pipeline |
| T+30 | Road Blocked | POST /api/simulation/events/road/block | Road is_blocked=True, excluded from routing graph |
| T+40 | Responder Dispatch | POST /api/v1/missions | Mission ASSIGNED, responder notified |
| T+50 | Hub Occupancy | PATCH /api/v1/hubs/{id}/occupancy | Occupancy updated with SELECT FOR UPDATE lock |
| T+60 | Situation Update | POST /api/v1/alerts | Second alert broadcast + AuditLog |

### Simulation Clock

- Speed multipliers: 1x, 5x, 10x (real-seconds per simulated-second)
- Supports start, pause, resume, reset operations
- Events fire when elapsed_sim_seconds >= event.offset_seconds

---

## 8. Data Flow & Workflows

### 8.1 Incident Report to Mission Workflow

```
[Citizen] submits incident
    |
    v
POST /api/incidents
IncidentReport created (status = UNVERIFIED)
    |
    v
Automatic clustering pipeline
  Radius: 500m spatial + 120min temporal
  find_or_create_cluster() --> IncidentCluster (OPEN)
    |
    v
[Coordinator] reviews cluster on operational map
    |
    v
POST /api/v1/missions
Mission created (status = ASSIGNED)
    |
    v
[Responder] accepts mission --> in_progress
    |
    v
Responder physically surveys area
POST /api/field_surveys
FieldSurvey submitted (hazard_level, verification_outcome, GPS location)
    |
    v
[Coordinator] reviews field survey
    |
    +-- VERIFY --> IncidentReport status = VERIFIED
    |               Road/Hazard state updated
    |               Routing graph recalculated
    |               IncidentCluster = RESOLVED
    |
    +-- REJECT --> IncidentReport status = REJECTED
    |
    v
AuditLog entry written for every state transition
```

### 8.2 Safe Routing Workflow

```
[User] requests a safe route
GET /api/routing/safe-route?from_lat=&from_lng=&to_lat=&to_lng=
    |
    v
Routing Engine loads road graph from PostgreSQL (NetworkX DiGraph)
    |
    Exclusion rules applied:
    +-- Exclude: is_blocked = True
    +-- Exclude: road_status IN (BLOCKED, DAMAGED)
    +-- Exclude: geometry intersects active HazardZone (PostGIS ST_Intersects)
    +-- Weights: edge length + hazard penalty
    |
    v
Dijkstra shortest-path algorithm (NetworkX)
    |
    v
Response: GeoJSON LineString + total_distance_m + waypoints array
```

### 8.3 Offline Sync Workflow

```
[User's network drops]
    |
    v
Actions stored in Dexie.js IndexedDB queue
  (incident reports, field surveys, sync mutations)
    |
    v
[Network restored - Service Worker detects connectivity]
    |
    v
POST /api/sync/queue
    |
    v
Sync Queue Module replays each queued operation in order
    |
    v
Conflicts resolved (last-write-wins / flagged for review)
AuditLog entry written per replayed operation
```

### 8.4 Fundraising Campaign Workflow

```
[Coordinator] creates new campaign
Campaign.status = DRAFT
    |
    v
Campaign activated --> status = ACTIVE
    |
    v
[Fundraiser] browses campaigns on FundraisingPage
    |
    v
POST /api/donations
Donation recorded, Campaign.amount_raised updated
QR code generated for sharing (qrcode[pil])
    |
    v
Target reached --> Campaign.status = COMPLETED
```

### 8.5 Hub Occupancy Update (Concurrency-Safe)

```
PATCH /api/v1/hubs/{hub_id}/occupancy
    |
    v
SELECT FOR UPDATE -- PostgreSQL row-level lock acquired
    |
    v
Validate: new_occupancy <= hub.capacity
    |
    v
hub.current_occupancy updated
COMMIT -- lock released
    |
    v
AuditLog entry written
Map UI reflects updated occupancy ratio
```

---

## 9. User Roles & Permissions

| Role | Enum | Capabilities |
|---|---|---|
| Citizen | `citizen` | Submit incident reports, access safe routes, find shelters, sync offline data |
| Responder | `responder` | Accept missions, submit field surveys, verify incidents, update road status |
| Coordinator | `coordinator` | Full dashboard access, dispatch missions, manage clusters, run simulation |
| Fundraiser | `fundraiser` | Browse active campaigns, make donations |
| Admin | `admin` | User CRUD, view full audit logs, manage all platform data |

### Demo Accounts (from seed data)

| Role | Email | Password |
|---|---|---|
| Coordinator | coordinator@resqnet.in | coord123 |
| Citizen | citizen1@resqnet.in | citizen123 |
| Responder | responder1@resqnet.in | respond123 |
| Fundraiser | fundraiser@resqnet.in | fund123 |

---

## 10. Build & Setup Guide

### Prerequisites

| Tool | Minimum Version |
|---|---|
| Python | 3.12+ |
| Node.js | 20+ |
| PostgreSQL | 16 with PostGIS 3.4 |

---

### Step 1 — Database

```bash
psql -U postgres -c "CREATE USER resqnet WITH PASSWORD 'resqnet';"
psql -U postgres -c "CREATE DATABASE resqnet OWNER resqnet;"
psql -U resqnet -d resqnet -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

---

### Step 2 — Backend

```bash
cd backend

# Virtual environment
python -m venv venv
venv\Scripts\activate             # Windows
# source venv/bin/activate        # Linux / macOS

# Dependencies
pip install -r requirements.txt

# Environment config
copy .env.example .env            # Edit DATABASE_URL and SECRET_KEY

# Database migrations
alembic upgrade head

# Seed virtual city + demo accounts
python scripts/seed.py

# Run dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

| URL | Purpose |
|---|---|
| http://localhost:8000 | API root |
| http://localhost:8000/api/docs | Swagger interactive docs |
| http://localhost:8000/api/redoc | ReDoc API reference |
| http://localhost:8000/health | Health check |

---

### Step 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

**App URL:** http://localhost:5173

#### NPM Scripts

| Script | Description |
|---|---|
| `npm run dev` | Vite dev server with Hot Module Replacement |
| `npm run build` | TypeScript compile + Vite bundle to dist/ |
| `npm run preview` | Serve production build locally |
| `npm run lint` | OxLint static analysis |

---

### Step 4 — Simulation Engine (Optional, for demo)

```bash
cd simulation_engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 9000 --reload
```

**Control UI:** http://localhost:9000/ui

**Demo procedure:**
1. Open http://localhost:9000/ui (simulation control)
2. Open http://localhost:5173 (ResQnet dashboard) side by side
3. Select scenario: FLOOD_DEMO_01, EARTHQUAKE_DEMO_01, or LANDSLIDE_DEMO_01
4. Choose speed: 1x, 5x, or 10x
5. Click Start Simulation — watch events propagate live to the ResQnet dashboard

---

### One-Click Windows Launcher

```batch
START_RESQNET.bat
```

Launches backend + frontend in separate terminal windows and opens the browser automatically.

---

## 11. Docker Deployment

### Services

| Service | Container | Image / Build Context | Port |
|---|---|---|---|
| Database | resqnet_db | postgis/postgis:16-3.4 | 5432 |
| Backend | resqnet_backend | ./backend/Dockerfile | 8000 |
| Frontend | resqnet_frontend | ./frontend/Dockerfile | 5173 → nginx:80 |

### Commands

```bash
# Build all images and start services
docker compose up --build

# Start detached
docker compose up -d

# View backend logs
docker compose logs -f backend

# Stop all
docker compose down

# Stop and delete all data volumes (CAUTION)
docker compose down -v
```

### Production Environment Variables

| Variable | Value / Note |
|---|---|
| `DATABASE_URL` | postgresql+asyncpg://resqnet:resqnet@db:5432/resqnet |
| `SYNC_DATABASE_URL` | postgresql+psycopg2://resqnet:resqnet@db:5432/resqnet |
| `SECRET_KEY` | **Change in production** |
| `ALGORITHM` | HS256 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 10080 (7 days) |
| `ENVIRONMENT` | production |
| `FRONTEND_URL` | http://localhost:5173 |

The frontend Dockerfile produces a static Vite build served by nginx. The nginx.conf handles SPA routing (all unknown paths → index.html).

---

## 12. Environment Configuration

### Backend .env

```env
DATABASE_URL=postgresql+asyncpg://resqnet:resqnet@localhost:5432/resqnet
SYNC_DATABASE_URL=postgresql+psycopg2://resqnet:resqnet@localhost:5432/resqnet
SECRET_KEY=resqnet-super-secret-key-change-in-production-2026
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ENVIRONMENT=development
FRONTEND_URL=http://localhost:5173
```

### Clustering Config (backend/app/core/config.py)

| Setting | Default | Description |
|---|---|---|
| `CLUSTERING_RADIUS_METERS` | 500.0 | Spatial proximity radius for incident grouping |
| `CLUSTERING_TEMPORAL_WINDOW_MINUTES` | 120 | Time window for temporal incident correlation |

---

## 13. API Reference

### Base URLs

| Purpose | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Swagger (interactive) | http://localhost:8000/api/docs |
| ReDoc | http://localhost:8000/api/redoc |
| OpenAPI JSON | http://localhost:8000/api/openapi.json |

### Authentication

```
Authorization: Bearer <JWT_ACCESS_TOKEN>

# Obtain token:
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded
Body: username=<email>&password=<password>
```

### API Module Summary

| Module | Prefix | Key Endpoints |
|---|---|---|
| Auth | `/api/v1/auth/` | POST /login, POST /register, GET /me |
| Incidents | `/api/incidents/` | POST /, GET /, GET /{id}, PATCH /{id}/status |
| Clusters | `/api/clusters/` | GET /, GET /{id} |
| Missions | `/api/v1/missions/` | POST /, GET /, PATCH /{id}/status |
| Field Surveys | `/api/field_surveys/` | POST /, GET / |
| Roads | `/api/roads/` | GET /, PATCH /{id}/status |
| Hazards | `/api/hazards/` | GET /, POST /, PATCH /{id} |
| Routing | `/api/routing/` | GET /safe-route |
| Hubs | `/api/v1/hubs/` | GET /, GET /{id}, PATCH /{id}/occupancy |
| Resources | `/api/resources/` | GET /, POST /, PATCH /{id} |
| Campaigns | `/api/campaigns/` | GET /, POST /, PATCH /{id} |
| Donations | `/api/donations/` | POST /, GET / |
| Alerts | `/api/v1/alerts/` | GET /, POST / |
| Sync | `/api/sync/` | POST /queue |
| Simulation | `/api/simulation/` | POST /events/flood, POST /events/reset |
| Admin | `/api/admin/` | User CRUD, audit log access |
| Notifications | `/api/notifications` | GET /?role=responder |

---

## 14. Key Design Principles

### 1. Offline-First
User actions are stored first in Dexie.js (IndexedDB). When connectivity returns, the Sync Queue replays operations against the live backend. This ensures full functionality during network outages — critical in disaster scenarios where infrastructure may be damaged.

### 2. Deterministic Safety Routing
Routing uses Dijkstra's algorithm (NetworkX) on a live PostGIS road graph. Zero AI/ML in safety-critical paths. Unsafe roads are deterministically excluded based on `is_blocked` flags and PostGIS ST_Intersects checks against active hazard zone polygons.

### 3. Two-Tier Ground Truth
- **Tier 1 — Unverified:** Citizen reports are always created with `status = UNVERIFIED` and never presented as confirmed facts.
- **Tier 2 — Verified:** NGO responders submit `FieldSurvey` records after physical inspection. Only then does data become verified ground truth and trigger road/hazard state updates.

### 4. Automation-First Operations
The system automatically clusters nearby incidents (spatial + temporal), suggests missions, and drives state machine transitions. Coordinators supervise and override — the platform minimizes manual coordination overhead to enable scalable disaster response with limited staff.

### 5. Modular Monolith
Single FastAPI process for deployment simplicity, but all domain logic is strictly separated into independent modules. Each module owns its router, service layer, and schemas. This enables rapid feature development without the operational complexity of microservices.

### 6. Immutable Audit Trail
Every state-changing operation — mission assignment, incident verification, hub update, road status change — writes an immutable entry to the `AuditLog` table. This provides a tamper-evident operational history for accountability and post-incident review.

---

*ResQnet v1.0 · SIH 2026 · Built with FastAPI + React + PostGIS*
*Last updated: September 2026*
