"""
Simulation Engine — FastAPI Application
Runs on port 9000 (separate from ResQnet on port 8000).

Endpoints:
  GET  /           — status page (JSON)
  GET  /ui         — Simulation Control UI (HTML)
  GET  /health     — health check
  GET  /scenario   — loaded scenario definition
  GET  /state      — current runner state
  GET  /log        — event log
  POST /control/start    — start scenario
  POST /control/pause    — pause
  POST /control/resume   — resume
  POST /control/reset    — reset engine + ResQnet operational state
  POST /control/speed    — change speed multiplier
  GET  /resqnet/health   — proxy health check to ResQnet
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from app.config import get_sim_settings
from app.event_log import event_log
from app.models import ScenarioState
from app.runner import get_runner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("sim.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_sim_settings()
    logger.info(f"Simulation Engine starting on port {settings.SIM_PORT}")
    logger.info(f"ResQnet target: {settings.RESQNET_BASE_URL}")
    # Pre-load the default scenario
    runner = get_runner()
    logger.info("FLOOD_DEMO_01 scenario loaded and ready")
    yield
    logger.info("Simulation Engine shutting down")


app = FastAPI(
    title="ResQnet Simulation Engine",
    description=(
        "External disaster simulation engine for ResQnet SIH 2026 demonstration. "
        "Events enter ResQnet through real HTTP APIs — not direct database access."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Control Request Models ────────────────────────────────────────────────────

class StartRequest(BaseModel):
    speed: int = 1
    scenario_id: Optional[str] = None


class SpeedRequest(BaseModel):
    speed: int


class SelectScenarioRequest(BaseModel):
    scenario_id: str


# ── Core Endpoints ────────────────────────────────────────────────────────────

@app.get("/", tags=["System"])
async def root():
    settings = get_sim_settings()
    runner = get_runner()
    state = runner.get_state()
    return {
        "service": "ResQnet Simulation Engine",
        "version": "1.0.0",
        "resqnet_target": settings.RESQNET_BASE_URL,
        "scenario": state.scenario_id,
        "state": state.state,
        "ui": "/ui",
        "disclaimer": (
            "This engine emulates external disaster-information sources. "
            "Simulated events enter ResQnet through application interfaces "
            "rather than directly modifying the operational database."
        ),
    }


@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "service": "simulation_engine"}


@app.get("/resqnet/health", tags=["System"])
async def resqnet_health():
    """Proxy health check to ResQnet backend."""
    import httpx
    settings = get_sim_settings()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.RESQNET_BASE_URL}/health")
            return {"resqnet_reachable": resp.status_code == 200, "detail": resp.json()}
    except Exception as e:
        return {"resqnet_reachable": False, "error": str(e)}


@app.get("/scenario", tags=["Scenario"])
async def get_scenario():
    """Return the loaded scenario definition."""
    runner = get_runner()
    if runner._scenario is None:
        raise HTTPException(status_code=404, detail="No scenario loaded")
    return runner._scenario.model_dump()


@app.get("/state", tags=["Control"])
async def get_state():
    """Return current runner state snapshot."""
    runner = get_runner()
    return runner.get_state().model_dump()


@app.get("/log", tags=["Events"])
async def get_log():
    """Return the full simulation event log."""
    entries = event_log.get_entries()
    summary = event_log.summary()
    return {
        "summary": summary,
        "entries": [e.model_dump() for e in entries],
    }


# ── Control Endpoints ─────────────────────────────────────────────────────────

@app.post("/control/start", tags=["Control"])
async def start_scenario(req: StartRequest):
    """Start the simulation scenario."""
    runner = get_runner()
    state = runner.get_state()

    if state.state == ScenarioState.RUNNING:
        raise HTTPException(status_code=409, detail="Scenario already running")
    if state.state == ScenarioState.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="Scenario completed — call /control/reset before restarting"
        )

    if req.speed not in (1, 5, 10):
        raise HTTPException(status_code=400, detail="Speed must be 1, 5, or 10")

    # Load scenario if explicitly provided and different from current
    active_scenario = req.scenario_id if req.scenario_id else (state.scenario_id or "FLOOD_DEMO_01")
    if req.scenario_id and req.scenario_id != (state.scenario_id or "FLOOD_DEMO_01"):
        try:
            runner.load(req.scenario_id)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

    await runner.start(speed=req.speed)
    return {
        "action": "started",
        "scenario_id": active_scenario,
        "speed": req.speed,
        "message": f"Scenario {active_scenario} started at {req.speed}x speed",
    }


@app.post("/control/pause", tags=["Control"])
async def pause_scenario():
    """Pause the running scenario."""
    runner = get_runner()
    state = runner.get_state()
    if state.state != ScenarioState.RUNNING:
        raise HTTPException(status_code=409, detail=f"Cannot pause: state is {state.state}")
    await runner.pause()
    return {"action": "paused", "sim_time": runner.get_state().sim_time_display}


@app.post("/control/resume", tags=["Control"])
async def resume_scenario():
    """Resume a paused scenario."""
    runner = get_runner()
    state = runner.get_state()
    if state.state != ScenarioState.PAUSED:
        raise HTTPException(status_code=409, detail=f"Cannot resume: state is {state.state}")
    await runner.resume()
    return {"action": "resumed", "sim_time": runner.get_state().sim_time_display}


@app.post("/control/reset", tags=["Control"])
async def reset_scenario():
    """
    Reset simulation engine state and restore ResQnet operational state.

    SAFETY: This does NOT delete ResQnet database records (audit logs, missions, etc).
    It restores road/hazard operational state via /api/simulation/events/reset.
    """
    runner = get_runner()
    result = await runner.reset()
    return {
        "action": "reset",
        "engine_state": "IDLE",
        "resqnet_reset_result": result,
        "message": (
            "Simulation engine reset. Roads cleared, hazard zones deactivated. "
            "ResQnet audit log and reports preserved."
        ),
    }


@app.get("/scenarios", tags=["Scenario"])
async def list_scenarios():
    """Return available scenario definitions."""
    from app.scenario_loader import list_available_scenarios
    return {"scenarios": list_available_scenarios()}


@app.post("/control/select", tags=["Control"])
async def select_scenario(req: SelectScenarioRequest):
    """Switch active scenario (when runner is IDLE or COMPLETED)."""
    runner = get_runner()
    state = runner.get_state()
    if state.state == ScenarioState.RUNNING:
        raise HTTPException(status_code=409, detail="Cannot switch scenario while running")
    try:
        runner.load(req.scenario_id)
        await runner.reset()
        return {
            "action": "scenario_selected",
            "scenario_id": req.scenario_id,
            "total_events": len(runner._events),
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Simulation Control UI ─────────────────────────────────────────────────────

@app.get("/ui", response_class=HTMLResponse, tags=["UI"])
async def simulation_ui():
    """Simulation Control UI — operational control panel."""
    return HTMLResponse(content=_build_ui_html())


def _build_ui_html() -> str:
    settings = get_sim_settings()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ResQnet Simulation Engine — FLOOD_DEMO_01</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {{
    --bg: #0a0e17;
    --surface: #111827;
    --surface2: #1a2236;
    --border: #1e2d45;
    --accent: #3b82f6;
    --accent-hover: #60a5fa;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
    --text: #e2e8f0;
    --text-muted: #64748b;
    --text-dim: #94a3b8;
    --sim-green: #22d3ee;
    --sim-orange: #fb923c;
    --mono: 'JetBrains Mono', monospace;
  }}
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }}
  .header {{
    background: linear-gradient(135deg, #0f172a 0%, #1e2d45 100%);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
  }}
  .header-badge {{
    background: #ef444415;
    border: 1px solid #ef4444;
    color: #ef4444;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }}
  .header-title {{ font-size: 18px; font-weight: 700; color: var(--text); }}
  .header-sub {{ font-size: 12px; color: var(--text-muted); margin-left: auto; }}
  .main {{ display: grid; grid-template-columns: 340px 1fr; gap: 0; flex: 1; }}
  .sidebar {{
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }}
  .content {{ padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }}
  .card {{
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }}
  .card-title {{
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
  }}
  .status-pill {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }}
  .status-IDLE {{ background: #1e293b; color: var(--text-muted); border: 1px solid var(--border); }}
  .status-RUNNING {{ background: #064e3b; color: var(--success); border: 1px solid var(--success); }}
  .status-PAUSED {{ background: #451a03; color: var(--warning); border: 1px solid var(--warning); }}
  .status-COMPLETED {{ background: #1e3a5f; color: var(--accent); border: 1px solid var(--accent); }}
  .pulse {{ width: 8px; height: 8px; border-radius: 50%; background: currentColor; }}
  .pulse.active {{ animation: pulse 1.2s ease-in-out infinite; }}
  @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} }}
  .sim-clock {{
    font-family: var(--mono);
    font-size: 36px;
    font-weight: 500;
    color: var(--sim-green);
    letter-spacing: 0.05em;
    text-align: center;
    padding: 12px 0;
  }}
  .progress-bar {{ background: #1e293b; border-radius: 4px; height: 6px; overflow: hidden; margin: 8px 0; }}
  .progress-fill {{ height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s ease; }}
  .btn {{
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }}
  .btn:disabled {{ opacity: 0.4; cursor: not-allowed; }}
  .btn-start {{ background: var(--success); color: white; }}
  .btn-start:not(:disabled):hover {{ background: #059669; transform: translateY(-1px); }}
  .btn-pause {{ background: var(--warning); color: #1c1917; }}
  .btn-pause:not(:disabled):hover {{ background: #d97706; transform: translateY(-1px); }}
  .btn-resume {{ background: var(--accent); color: white; }}
  .btn-resume:not(:disabled):hover {{ background: var(--accent-hover); transform: translateY(-1px); }}
  .btn-reset {{ background: #374151; color: var(--text); border: 1px solid var(--border); }}
  .btn-reset:not(:disabled):hover {{ background: #4b5563; transform: translateY(-1px); }}
  .btn-group {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
  .speed-group {{ display: flex; gap: 8px; }}
  .speed-btn {{
    flex: 1;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--mono);
  }}
  .speed-btn:hover {{ border-color: var(--accent); color: var(--accent); }}
  .speed-btn.active {{ background: var(--accent); color: white; border-color: var(--accent); }}
  .stat-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
  .stat {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    text-align: center;
  }}
  .stat-val {{ font-size: 22px; font-weight: 700; font-family: var(--mono); color: var(--accent); }}
  .stat-label {{ font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }}
  .timeline {{ display: flex; flex-direction: column; gap: 0; }}
  .tl-item {{
    display: flex;
    gap: 12px;
    padding: 8px 0;
    border-left: 2px solid var(--border);
    padding-left: 16px;
    margin-left: 8px;
    position: relative;
    transition: all 0.3s;
  }}
  .tl-item::before {{
    content: '';
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--border);
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.3s;
  }}
  .tl-item.fired {{ border-left-color: var(--success); }}
  .tl-item.fired::before {{ background: var(--success); box-shadow: 0 0 6px var(--success); }}
  .tl-item.active {{ border-left-color: var(--warning); }}
  .tl-item.active::before {{ background: var(--warning); animation: pulse 1s infinite; }}
  .tl-item.failed {{ border-left-color: var(--danger); }}
  .tl-item.failed::before {{ background: var(--danger); }}
  .tl-time {{ font-family: var(--mono); font-size: 11px; color: var(--text-muted); white-space: nowrap; min-width: 44px; }}
  .tl-content {{ flex: 1; }}
  .tl-type {{ font-size: 12px; font-weight: 600; color: var(--text-dim); }}
  .tl-source {{ font-size: 10px; color: var(--text-muted); margin-top: 1px; }}
  .tl-status {{
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    margin-top: 3px;
    display: inline-block;
  }}
  .tl-status.ACKNOWLEDGED {{ background: #064e3b; color: var(--success); }}
  .tl-status.FAILED {{ background: #450a0a; color: var(--danger); }}
  .tl-status.SENT {{ background: #1e3a5f; color: var(--accent); }}
  .tl-status.PENDING {{ background: #1e293b; color: var(--text-muted); }}
  .log-container {{
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }}
  .log-entry {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    border-left: 3px solid var(--border);
  }}
  .log-entry.ACKNOWLEDGED {{ border-left-color: var(--success); }}
  .log-entry.FAILED {{ border-left-color: var(--danger); }}
  .log-entry.PENDING {{ border-left-color: var(--text-muted); }}
  .log-entry .log-header {{ display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }}
  .log-entry .log-time {{ font-family: var(--mono); font-size: 11px; color: var(--sim-green); font-weight: 600; }}
  .log-entry .log-type {{ font-weight: 600; color: var(--text); }}
  .log-entry .log-source {{ font-size: 10px; color: var(--warning); background: #451a0315; border: 1px solid #451a03; padding: 1px 5px; border-radius: 3px; }}
  .log-entry .log-response {{ color: var(--success); margin-top: 4px; font-family: var(--mono); font-size: 11px; }}
  .log-entry .log-error {{ color: var(--danger); margin-top: 4px; font-family: var(--mono); font-size: 11px; }}
  .log-entry .log-chain {{ color: var(--text-muted); margin-top: 4px; font-size: 11px; line-height: 1.4; }}
  .disclaimer {{
    background: #1c1a0a;
    border: 1px solid #78350f;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 11px;
    color: #b45309;
    line-height: 1.5;
  }}
  .disclaimer strong {{ color: var(--warning); }}
  ::-webkit-scrollbar {{ width: 6px; }}
  ::-webkit-scrollbar-track {{ background: var(--surface); }}
  ::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 3px; }}
</style>
</head>
<body>
<div class="header">
  <span class="header-badge">⚠ Simulation</span>
  <span class="header-title">ResQnet Simulation Engine</span>
  <span class="header-sub">ResQnet: {settings.RESQNET_BASE_URL} &nbsp;|&nbsp; Port 9000</span>
</div>

<div class="main">
  <!-- Sidebar: Controls -->
  <div class="sidebar">

    <div class="card">
      <div class="card-title">Scenario Selection</div>
      <select id="scenario-select" onchange="onScenarioSelect()" style="width:100%; padding:8px 10px; background:var(--surface); border:1px solid var(--border); color:var(--text); border-radius:6px; font-weight:600; font-size:13px; outline:none; cursor:pointer;">
        <option value="FLOOD_DEMO_01">Flood — FLOOD_DEMO_01</option>
        <option value="EARTHQUAKE_DEMO_01">Earthquake — EARTHQUAKE_DEMO_01</option>
        <option value="LANDSLIDE_DEMO_01">Landslide — LANDSLIDE_DEMO_01</option>
      </select>
      <div id="scenario-desc" style="font-size:11px; color:var(--text-muted); margin-top:8px;">North Canal Flood — SIH Demo</div>
    </div>

    <div class="card">
      <div class="card-title">Status</div>
      <div id="status-pill" class="status-pill status-IDLE"><div class="pulse" id="pulse-dot"></div><span id="status-text">IDLE</span></div>
    </div>

    <div class="card">
      <div class="card-title">Simulated Time</div>
      <div class="sim-clock" id="sim-clock">T+00:00</div>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      <div style="font-size:11px; color:var(--text-muted); text-align:center;" id="progress-text">0 / 7 events</div>
    </div>

    <div class="card">
      <div class="card-title">Controls</div>
      <div class="btn-group" style="margin-bottom:8px;">
        <button class="btn btn-start" id="btn-start" onclick="simStart()">▶ Start</button>
        <button class="btn btn-pause" id="btn-pause" onclick="simPause()" disabled>⏸ Pause</button>
      </div>
      <div class="btn-group">
        <button class="btn btn-resume" id="btn-resume" onclick="simResume()" disabled>▶ Resume</button>
        <button class="btn btn-reset" id="btn-reset" onclick="simReset()">↺ Reset</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Speed</div>
      <div class="speed-group">
        <button class="speed-btn active" id="speed-1" onclick="setSpeed(1)">1×</button>
        <button class="speed-btn" id="speed-5" onclick="setSpeed(5)">5×</button>
        <button class="speed-btn" id="speed-10" onclick="setSpeed(10)">10×</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Event Statistics</div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-val" id="stat-total">7</div><div class="stat-label">Total</div></div>
        <div class="stat"><div class="stat-val" id="stat-fired" style="color:var(--warning)">0</div><div class="stat-label">Fired</div></div>
        <div class="stat"><div class="stat-val" id="stat-ok" style="color:var(--success)">0</div><div class="stat-label">Delivered</div></div>
        <div class="stat"><div class="stat-val" id="stat-fail" style="color:var(--danger)">0</div><div class="stat-label">Failed</div></div>
      </div>
    </div>

    <div class="disclaimer">
      <strong>⚠ SIMULATION ONLY</strong><br>
      All events are clearly marked <code>[SIM]</code>. No live government, sensor, news, or social-media data is used or claimed.
    </div>

  </div>

  <!-- Main Content: Timeline + Log -->
  <div class="content">

    <div class="card">
      <div class="card-title" id="timeline-title">Event Timeline</div>
      <div class="timeline" id="timeline"></div>
    </div>

    <div class="card">
      <div class="card-title">Event Log — Cause & Effect Chain</div>
      <div class="log-container" id="log-container">
        <div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px;">
          No events yet — click START to begin simulation
        </div>
      </div>
    </div>

  </div>
</div>

<script>
const API = '';
let currentSpeed = 1;
let pollInterval = null;

async function api(method, path, body) {{
  const opts = {{ method, headers: {{'Content-Type': 'application/json'}} }};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  return r.json();
}}

async function onScenarioSelect() {{
  const sid = document.getElementById('scenario-select').value;
  try {{
    await api('POST', '/control/select', {{ scenario_id: sid }});
    await loadAndRenderScenario();
  }} catch (e) {{
    console.error('Error switching scenario:', e);
  }}
}}

async function loadAndRenderScenario() {{
  try {{
    const sc = await api('GET', '/scenario');
    if (!sc) return;
    document.getElementById('scenario-select').value = sc.scenario_id;
    document.getElementById('scenario-desc').textContent = sc.name || sc.description || '';
    document.getElementById('timeline-title').textContent = sc.scenario_id + ' — Event Timeline';

    const tl = document.getElementById('timeline');
    tl.innerHTML = (sc.events || []).map(e => {{
      const min = String(Math.floor(e.offset_seconds / 60)).padStart(2, '0');
      const sec = String(e.offset_seconds % 60).padStart(2, '0');
      return `
        <div class="tl-item" data-event="${{e.event_id}}">
          <div class="tl-time">T+${{min}}:${{sec}}</div>
          <div class="tl-content">
            <div class="tl-type">${{e.event_type}}</div>
            <div class="tl-source">${{e.source_label || e.source_type}} → ${{e.api_target}}</div>
          </div>
        </div>
      `;
    }}).join('');

    const [state, log] = await Promise.all([
      api('GET', '/state'),
      api('GET', '/log'),
    ]);
    updateUI(state, log);
  }} catch(e) {{
    console.error(e);
  }}
}}

async function simStart() {{
  const sid = document.getElementById('scenario-select').value;
  try {{
    const res = await api('POST', '/control/start', {{ speed: currentSpeed, scenario_id: sid }});
    console.log('Start:', res);
    startPolling();
  }} catch(e) {{ console.error(e); }}
}}

async function simPause() {{
  await api('POST', '/control/pause');
}}

async function simResume() {{
  await api('POST', '/control/resume');
  startPolling();
}}

async function simReset() {{
  if (!confirm('Reset simulation and restore ResQnet operational state?')) return;
  await api('POST', '/control/reset');
  stopPolling();
  setTimeout(loadAndRenderScenario, 500);
}}

async function setSpeed(s) {{
  currentSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('speed-' + s).classList.add('active');
  try {{ await api('POST', '/control/speed', {{ speed: s }}); }} catch(e) {{}}
}}

function startPolling() {{
  if (pollInterval) return;
  pollInterval = setInterval(poll, 800);
}}

function stopPolling() {{
  if (pollInterval) {{ clearInterval(pollInterval); pollInterval = null; }}
}}

async function poll() {{
  try {{
    const [state, log] = await Promise.all([
      api('GET', '/state'),
      api('GET', '/log'),
    ]);
    updateUI(state, log);
    if (state.state === 'COMPLETED' || state.state === 'IDLE') {{
      stopPolling();
    }}
  }} catch(e) {{}}
}}

function updateUI(state, log) {{
  // Status
  const pill = document.getElementById('status-pill');
  pill.className = 'status-pill status-' + state.state;
  document.getElementById('status-text').textContent = state.state;
  const dot = document.getElementById('pulse-dot');
  dot.className = 'pulse' + (state.state === 'RUNNING' ? ' active' : '');

  // Scenario select disabled when running or paused
  const select = document.getElementById('scenario-select');
  if (select) select.disabled = (state.state === 'RUNNING' || state.state === 'PAUSED');

  // Clock
  document.getElementById('sim-clock').textContent = state.sim_time_display || 'T+00:00';

  // Progress
  const pct = state.total_events > 0 ? (state.events_fired / state.total_events * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = state.events_fired + ' / ' + state.total_events + ' events';

  // Stats
  document.getElementById('stat-total').textContent = state.total_events;
  document.getElementById('stat-fired').textContent = state.events_fired;
  document.getElementById('stat-ok').textContent = state.events_delivered;
  document.getElementById('stat-fail').textContent = state.events_failed;

  // Buttons
  const running = state.state === 'RUNNING';
  const paused = state.state === 'PAUSED';
  const idle = state.state === 'IDLE';
  const completed = state.state === 'COMPLETED';
  document.getElementById('btn-start').disabled = running || paused || completed;
  document.getElementById('btn-pause').disabled = !running;
  document.getElementById('btn-resume').disabled = !paused;

  // Timeline status
  if (log && log.entries) {{
    log.entries.forEach(entry => {{
      const el = document.querySelector('[data-event="' + entry.event_id + '"]');
      if (el) {{
        el.classList.remove('fired', 'active', 'failed');
        if (entry.status === 'ACKNOWLEDGED') el.classList.add('fired');
        else if (entry.status === 'FAILED') el.classList.add('failed');
        else if (entry.status === 'SENT' || entry.status === 'PENDING') el.classList.add('active');
      }}
    }});

    // Event log
    renderLog(log.entries);
  }}
}}

function renderLog(entries) {{
  const container = document.getElementById('log-container');
  if (!entries || entries.length === 0) {{
    container.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px;">No events yet — click START to begin simulation</div>';
    return;
  }}
  const html = [...entries].reverse().map(e => `
    <div class="log-entry ${{e.status}}">
      <div class="log-header">
        <span class="log-time">${{e.sim_time}}</span>
        <span class="log-type">${{e.event_type}}</span>
        <span class="log-source">${{e.source_label}}</span>
        <span class="tl-status ${{e.status}}">${{e.status}}</span>
      </div>
      <div style="color:var(--text-muted); font-size:11px;">${{e.api_target}}</div>
      ${{e.resqnet_response_summary ? '<div class="log-response">✓ ' + e.resqnet_response_summary + '</div>' : ''}}
      ${{e.error_detail ? '<div class="log-error">✗ ' + e.error_detail + '</div>' : ''}}
      ${{e.chain_notes ? '<div class="log-chain">Chain: ' + e.chain_notes.substring(0,120) + '...</div>' : ''}}
    </div>
  `).join('');
  container.innerHTML = html;
}}

// Initial load & poll
loadAndRenderScenario();
</script>
</body>
</html>"""
