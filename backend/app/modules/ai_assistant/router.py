"""
ResQnet-AI Assistant Management Router
Endpoints:
  GET  /ai-assistant/status - Check if ResQnet-AI engine (port 8010) is active
  POST /ai-assistant/start  - Trigger/ensure backend of ResQnet-AI is turned on automatically
"""
import os
import subprocess
import sys
import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/ai-assistant", tags=["AI Assistant"])

AI_ENGINE_URL = "http://127.0.0.1:8010"
AI_HEALTH_URL = f"{AI_ENGINE_URL}/api/v1/health"

# Locate the workspace root and resQnet AI backend folder
CURRENT_FILE = Path(__file__).resolve()
# ResQnet/backend/app/modules/ai_assistant/router.py -> parent x 5 is workspace root
WORKSPACE_ROOT = CURRENT_FILE.parents[5]
AI_BACKEND_DIR = WORKSPACE_ROOT / "resQnet AI" / "backend"
AI_PYTHON = AI_BACKEND_DIR / ".venv" / "Scripts" / "python.exe"


@router.get("/status")
async def get_ai_status():
    """Check whether ResQnet-AI backend is currently up and responding."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(AI_HEALTH_URL)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "running": True,
                    "url": AI_ENGINE_URL,
                    "health": data,
                }
    except Exception:
        pass

    return {
        "running": False,
        "url": AI_ENGINE_URL,
        "health": None,
    }


@router.post("/start")
async def start_ai_backend():
    """
    Trigger the ResQnet AI backend automatically if not already running.
    Spawns uvicorn on port 8010 in detached background mode using its dedicated virtualenv.
    """
    # 1. Quick check if already running
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(AI_HEALTH_URL)
            if resp.status_code == 200:
                return {
                    "status": "already_running",
                    "url": AI_ENGINE_URL,
                    "message": "ResQnet-AI backend is already operational.",
                }
    except Exception:
        pass

    # 2. Check executable paths
    if not AI_PYTHON.exists():
        # Fallback to python in PATH or sys.executable
        py_exec = sys.executable
    else:
        py_exec = str(AI_PYTHON)

    if not AI_BACKEND_DIR.exists():
        raise HTTPException(
            status_code=404,
            detail=f"ResQnet AI backend directory not found at {AI_BACKEND_DIR}"
        )

    # 3. Launch process detached from parent
    cmd = [
        py_exec,
        "-m", "uvicorn",
        "app.main:app",
        "--app-dir", str(AI_BACKEND_DIR),
        "--host", "0.0.0.0",
        "--port", "8010",
    ]

    try:
        # On Windows, DETACHED_PROCESS = 0x00000008, CREATE_NEW_PROCESS_GROUP = 0x00000200
        creationflags = 0
        if sys.platform == "win32":
            creationflags = 0x00000008 | 0x00000200

        subprocess.Popen(
            cmd,
            cwd=str(AI_BACKEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to spawn ResQnet-AI server: {e}")

    # 4. Wait up to 6 seconds for it to become ready
    import asyncio
    for _ in range(12):
        await asyncio.sleep(0.5)
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                resp = await client.get(AI_HEALTH_URL)
                if resp.status_code == 200:
                    return {
                        "status": "started",
                        "url": AI_ENGINE_URL,
                        "message": "ResQnet-AI backend started successfully!",
                        "health": resp.json(),
                    }
        except Exception:
            continue

    return {
        "status": "starting",
        "url": AI_ENGINE_URL,
        "message": "ResQnet-AI backend launched in background; pre-warming models.",
    }

