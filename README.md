# ResQnet — Disaster Response & Field Coordination Platform
> **Smart India Hackathon 2026 Prototype**

Offline-first disaster response platform providing a unified operational picture for citizens, NGO responders, coordinators, and fundraisers.

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 with PostGIS extension

### 1. Database
```bash
# Install PostGIS and create the DB
psql -U postgres -c "CREATE USER resqnet WITH PASSWORD 'resqnet';"
psql -U postgres -c "CREATE DATABASE resqnet OWNER resqnet;"
psql -U resqnet -d resqnet -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
python scripts/seed.py          # Seeds DB with virtual city + demo accounts
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API Docs: http://localhost:8000/api/docs

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Coordinator | coordinator@resqnet.in | coord123 |
| Citizen | citizen1@resqnet.in | citizen123 |
| Responder | responder1@resqnet.in | respond123 |
| Fundraiser | fundraiser@resqnet.in | fund123 |

---

## Architecture

```
Frontend (React + Vite + TypeScript + Tailwind + MapLibre)
    ↕ REST API
Backend (FastAPI — Modular Monolith)
    ├── Auth & User Module
    ├── Incident Report Module  (UNVERIFIED → cluster → mission)
    ├── Road & Hazard Module    (verified road status)
    ├── Routing Engine          (Dijkstra — NetworkX)
    ├── Safety Hub Module       (occupancy + resources)
    ├── Mission & NGO Module    (field surveys → VERIFIED ground truth)
    ├── Sync Queue Module       (offline reconciliation)
    ├── Fundraising Module      (campaigns + mock donations)
    └── Simulation Engine       (real state mutations for demo)
    ↕ SQL / PostGIS
PostgreSQL + PostGIS Database
```

## Key Design Principles

1. **Offline-First** — Service Worker + Dexie.js + sync queue
2. **Deterministic Safety** — Dijkstra routing (no AI on safety paths)
3. **Two-Tier Ground Truth** — Citizen reports are UNVERIFIED until NGO verifies
4. **Automation-First** — Coordinator supervises, system handles routine operations
5. **Modular Monolith** — One deployable backend, clean module separation

## Disaster Simulation

The coordinator dashboard includes a **Simulation Panel** that triggers real state mutations:

- Start flood (activate hazard zone)
- Block/unblock road
- Generate citizen reports  
- Dispatch NGO team
- Complete verification → road update → routing recalculation
- Increase hub occupancy
- Deplete resources → trigger fundraising
- Reset simulation

All events modify actual database state — the rest of the system reacts naturally.

---

*SIH 2026 · ResQnet v1.0 · Built with FastAPI + React + PostGIS*
