"""
ResQnet Backend Service Entry Point
Runs the FastAPI application under Uvicorn with runtime-relative paths.
Supports running from source, packaged directory, or standalone executable.
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
    backend_paths = [
        BUNDLE_DIR,
        os.path.join(BUNDLE_DIR, "backend"),
        EXE_DIR,
        os.path.join(EXE_DIR, "backend"),
        PARENT_DIR,
        os.path.join(PARENT_DIR, "backend"),
    ]
else:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    BUNDLE_DIR = BASE_DIR
    backend_paths = [
        os.path.join(BASE_DIR, "backend"),
        BASE_DIR,
    ]

for p in backend_paths:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

import uvicorn
from app.main import app
from app.core.config import get_settings

def run(host: str = "127.0.0.1", port: int = 8000):
    settings = get_settings()
    print(f"Starting {settings.PROJECT_NAME} backend v{settings.VERSION} on {host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info", access_log=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ResQnet Backend Service Runner")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    args = parser.parse_args()

    run(host=args.host, port=args.port)
