"""
ResQnet Simulation Engine Service Entry Point
Runs the Simulation Engine FastAPI application under Uvicorn.
Strictly decoupled from PostgreSQL/PostGIS (HTTP REST communication only).
"""
import sys
import os
import argparse

# Determine runtime base directory
if getattr(sys, "frozen", False):
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
    PARENT_DIR = os.path.dirname(EXE_DIR)
    if hasattr(sys, "_MEIPASS"):
        BUNDLE_DIR = sys._MEIPASS
    else:
        BUNDLE_DIR = EXE_DIR
    sim_paths = [
        BUNDLE_DIR,
        os.path.join(BUNDLE_DIR, "simulation_engine"),
        EXE_DIR,
        os.path.join(EXE_DIR, "simulation_engine"),
        PARENT_DIR,
        os.path.join(PARENT_DIR, "simulation_engine"),
    ]
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    BUNDLE_DIR = BASE_DIR
    sim_paths = [
        os.path.join(BASE_DIR, "simulation_engine"),
        BASE_DIR,
    ]

for p in sim_paths:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

import uvicorn
from app.main import app
from app.config import get_sim_settings

def run(host: str = "127.0.0.1", port: int = 9000):
    settings = get_sim_settings()
    print(f"Starting Simulation Engine on {host}:{port} -> ResQnet Target: {settings.RESQNET_BASE_URL}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info", access_log=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ResQnet Simulation Engine Runner")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address to bind")
    parser.add_argument("--port", type=int, default=9000, help="Port to bind")
    args = parser.parse_args()

    run(host=args.host, port=args.port)
