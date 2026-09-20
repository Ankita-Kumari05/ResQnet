"""
ResQnet Prototype Orchestrator & Launcher (ResQnet_Prototype.exe)
One-click GUI orchestrator for the complete ResQnet operational stack.
Manages Database, FastAPI Backend, and Production Frontend with graceful lifecycle.
"""
import sys
import os
import time
import socket
import subprocess
import threading
import webbrowser
import logging
import urllib.request
import urllib.error
import tkinter as tk
from tkinter import messagebox, ttk

# Determine application base directory
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

LOG_DIR = os.path.join(APP_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
STARTUP_LOG = os.path.join(LOG_DIR, "startup.log")
PROTOTYPE_LOG = os.path.join(LOG_DIR, "prototype.log")

# Setup logging
logging.basicConfig(
    filename=PROTOTYPE_LOG,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    encoding="utf-8",
)
logger = logging.getLogger("prototype_orchestrator")


def log_msg(msg: str, level: str = "INFO"):
    print(f"[{level}] {msg}", flush=True)
    if level == "ERROR":
        logger.error(msg)
    elif level == "WARNING":
        logger.warning(msg)
    else:
        logger.info(msg)
    try:
        with open(STARTUP_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}\n")
    except Exception:
        pass


class PrototypeOrchestrator:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("ResQnet Prototype")
        self.root.geometry("480x320")
        self.root.resizable(False, False)

        # Style configuration
        self.root.configure(bg="#0f172a")

        self.child_processes = []
        self.is_running = False

        self._setup_ui()
        # Start startup thread
        threading.Thread(target=self._startup_sequence, daemon=True).start()

    def _setup_ui(self):
        # Header banner
        header = tk.Frame(self.root, bg="#1e293b", height=70)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="ResQnet Prototype",
            font=("Segoe UI", 16, "bold"),
            fg="#38bdf8",
            bg="#1e293b",
        )
        title_lbl.pack(pady=(12, 2))

        subtitle_lbl = tk.Label(
            header,
            text="Disaster Response & Field Coordination Platform — SIH 2026",
            font=("Segoe UI", 8),
            fg="#94a3b8",
            bg="#1e293b",
        )
        subtitle_lbl.pack()

        # Status frame
        content_frame = tk.Frame(self.root, bg="#0f172a", padx=24, pady=20)
        content_frame.pack(fill="both", expand=True)

        self.status_lbl = tk.Label(
            content_frame,
            text="Starting ResQnet...",
            font=("Segoe UI", 11, "bold"),
            fg="#f8fafc",
            bg="#0f172a",
        )
        self.status_lbl.pack(anchor="w", pady=(4, 8))

        self.progress = ttk.Progressbar(content_frame, orient="horizontal", mode="indeterminate", length=430)
        self.progress.pack(pady=(0, 16))
        self.progress.start(15)

        # Info rows
        self.db_status_lbl = tk.Label(
            content_frame, text="• Database (PostGIS :5432): Initializing...", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a"
        )
        self.db_status_lbl.pack(anchor="w", pady=1)

        self.backend_status_lbl = tk.Label(
            content_frame, text="• Backend API (:8000): Waiting...", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a"
        )
        self.backend_status_lbl.pack(anchor="w", pady=1)

        self.frontend_status_lbl = tk.Label(
            content_frame, text="• Frontend Web (:5173): Waiting...", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a"
        )
        self.frontend_status_lbl.pack(anchor="w", pady=1)

        # Buttons frame
        self.btn_frame = tk.Frame(self.root, bg="#0f172a", padx=24, pady=12)
        self.btn_frame.pack(fill="x", side="bottom")

        self.open_btn = tk.Button(
            self.btn_frame,
            text="Open in Browser",
            font=("Segoe UI", 9, "bold"),
            bg="#0284c7",
            fg="white",
            relief="flat",
            padx=14,
            pady=6,
            state="disabled",
            command=self.open_browser,
        )
        self.open_btn.pack(side="left", padx=(0, 8))

        self.docs_btn = tk.Button(
            self.btn_frame,
            text="API Docs",
            font=("Segoe UI", 9),
            bg="#334155",
            fg="white",
            relief="flat",
            padx=10,
            pady=6,
            state="disabled",
            command=lambda: webbrowser.open("http://127.0.0.1:8000/api/docs"),
        )
        self.docs_btn.pack(side="left", padx=(0, 8))

        self.exit_btn = tk.Button(
            self.btn_frame,
            text="Stop & Exit",
            font=("Segoe UI", 9),
            bg="#b91c1c",
            fg="white",
            relief="flat",
            padx=12,
            pady=6,
            command=self.shutdown,
        )
        self.exit_btn.pack(side="right")

        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)

    def set_status(self, text: str, db: str = None, backend: str = None, frontend: str = None):
        self.status_lbl.config(text=text)
        if db:
            self.db_status_lbl.config(text=f"• Database (PostGIS :5432): {db}")
            if "Ready" in db or "Connected" in db:
                self.db_status_lbl.config(fg="#4ade80")
        if backend:
            self.backend_status_lbl.config(text=f"• Backend API (:8000): {backend}")
            if "Ready" in backend or "Healthy" in backend:
                self.backend_status_lbl.config(fg="#4ade80")
        if frontend:
            self.frontend_status_lbl.config(text=f"• Frontend Web (:5173): {frontend}")
            if "Ready" in frontend:
                self.frontend_status_lbl.config(fg="#4ade80")

    def _startup_sequence(self):
        log_msg("=== Starting ResQnet Prototype ===")
        try:
            # 1. Database Startup & Verification
            self.set_status("Starting database...", db="Checking port 5432...")
            db_ready = self._ensure_database()
            if not db_ready:
                raise RuntimeError(
                    "ResQnet could not find or start PostgreSQL with PostGIS on port 5432.\n"
                    "Please ensure PostgreSQL with PostGIS extension is installed or WSL/Docker is available.\n\n"
                    f"Detailed startup logs saved to:\n{STARTUP_LOG}"
                )

            self.set_status("Database ready.", db="Connected & Verified (PostGIS)")
            log_msg("Database ready on port 5432.")

            # Verify Alembic Head & Idempotent Seed
            self._verify_db_state()

            # 2. Backend Startup
            self.set_status("Starting backend...", backend="Launching service...")
            log_msg("Starting backend service on port 8000...")
            self._start_backend()

            # Wait for backend health
            if not self._wait_for_url("http://127.0.0.1:8000/api/v1/health", timeout=30):
                # Fallback check on root health
                if not self._wait_for_url("http://127.0.0.1:8000/health", timeout=10):
                    raise RuntimeError(
                        "Backend service failed to start or report healthy.\n"
                        f"See log files in:\n{LOG_DIR}"
                    )

            self.set_status("Backend ready.", backend="Healthy (v1.0.0)")
            log_msg("Backend healthy on port 8000.")

            # 3. Frontend Startup
            self.set_status("Starting frontend...", frontend="Serving production assets...")
            log_msg("Starting frontend static & proxy server on port 5173...")
            self._start_frontend()

            # Wait for frontend readiness
            if not self._wait_for_url("http://127.0.0.1:5173", timeout=15):
                raise RuntimeError("Frontend server failed to start on port 5173.")

            self.set_status("Frontend ready.", frontend="Ready on port 5173")
            log_msg("Frontend ready on port 5173.")

            # 4. Open Browser
            self.set_status("Opening ResQnet...")
            time.sleep(0.5)
            self.open_browser()

            # Complete
            self.set_status("ResQnet Prototype is operational!")
            self.progress.stop()
            self.progress.pack_forget()
            self.open_btn.config(state="normal")
            self.docs_btn.config(state="normal")
            self.is_running = True
            log_msg("=== ResQnet Prototype successfully started ===")

        except Exception as e:
            err_msg = str(e)
            log_msg(f"Startup failure: {err_msg}", "ERROR")
            self.set_status("Startup Failed!", db="Check logs", backend="Check logs", frontend="Check logs")
            self.progress.stop()
            messagebox.showerror("ResQnet Startup Error", err_msg)

    def _is_port_open(self, host: str, port: int) -> bool:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        try:
            res = s.connect_ex((host, port))
            return res == 0
        except Exception:
            return False
        finally:
            s.close()

    def _ensure_database(self) -> bool:
        # Check if already listening
        if self._is_port_open("127.0.0.1", 5432):
            if self._test_postgis_connection():
                return True

        # Tier 1: Check if local portable PostgreSQL exists in data/pgsql or pgsql
        local_pg_ctl = os.path.join(APP_DIR, "pgsql", "bin", "pg_ctl.exe")
        local_data = os.path.join(APP_DIR, "data", "pgsql")
        if os.path.exists(local_pg_ctl) and os.path.exists(local_data):
            log_msg(f"Starting local PostgreSQL using {local_pg_ctl}...")
            p = subprocess.Popen([local_pg_ctl, "-D", local_data, "start"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.child_processes.append(p)
            for _ in range(15):
                time.sleep(1)
                if self._test_postgis_connection():
                    return True

        # Tier 2: Check if WSL Ubuntu is available with PostgreSQL
        try:
            log_msg("Checking WSL Ubuntu for PostgreSQL...")
            res = subprocess.run(["wsl.exe", "-d", "Ubuntu", "-e", "bash", "-c", "sudo service postgresql status || sudo service postgresql start"], capture_output=True, timeout=8)
            # Check if pg_proxy is needed
            proxy_script = os.path.join(APP_DIR, "pg_proxy.py")
            if os.path.exists(proxy_script):
                log_msg("Launching pg_proxy bridge for Windows to WSL2 PostgreSQL...")
                p_proxy = subprocess.Popen([sys.executable, proxy_script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.child_processes.append(p_proxy)
            for _ in range(15):
                time.sleep(1)
                if self._test_postgis_connection():
                    return True
        except Exception as e:
            log_msg(f"WSL check: {e}", "WARNING")

        # Tier 3: Check if Docker container is available
        try:
            log_msg("Attempting docker compose up -d db...")
            subprocess.run(["docker", "compose", "up", "-d", "db"], cwd=APP_DIR, capture_output=True, timeout=10)
            for _ in range(15):
                time.sleep(1)
                if self._test_postgis_connection():
                    return True
        except Exception as e:
            log_msg(f"Docker check: {e}", "WARNING")

        # Final check
        return self._test_postgis_connection()

    def _test_postgis_connection(self) -> bool:
        if not self._is_port_open("127.0.0.1", 5432):
            return False
        try:
            import psycopg2
            conn = psycopg2.connect("postgresql://resqnet:resqnet@127.0.0.1:5432/resqnet", connect_timeout=3)
            cur = conn.cursor()
            cur.execute("SELECT 1")
            res = cur.fetchone()
            cur.execute("SELECT PostGIS_Version()")
            postgis_ver = cur.fetchone()
            conn.close()
            if res and res[0] == 1 and postgis_ver:
                log_msg(f"PostGIS verified: {postgis_ver[0]}")
                return True
        except Exception as e:
            log_msg(f"Database probe failed: {e}", "WARNING")
        return False

    def _verify_db_state(self):
        """Idempotent database check. Never delete or overwrite existing data."""
        try:
            import psycopg2
            conn = psycopg2.connect("postgresql://resqnet:resqnet@127.0.0.1:5432/resqnet", connect_timeout=3)
            cur = conn.cursor()
            # Check Alembic version
            cur.execute("SELECT version_num FROM alembic_version;")
            ver = cur.fetchone()
            if ver:
                log_msg(f"Alembic version confirmed: {ver[0]}")

            # Check if users exist
            cur.execute("SELECT count(*) FROM users;")
            user_count = cur.fetchone()[0]
            log_msg(f"Database user count: {user_count}")
            conn.close()

            if user_count == 0:
                log_msg("Database is unseeded. Running seed script...")
                seed_script = os.path.join(APP_DIR, "backend", "scripts", "seed.py")
                if os.path.exists(seed_script):
                    subprocess.run([sys.executable, seed_script], cwd=os.path.join(APP_DIR, "backend"), timeout=30)
            else:
                log_msg("Database already populated. Preserving data integrity.")
        except Exception as e:
            log_msg(f"DB verification note: {e}", "WARNING")

    def _start_backend(self):
        backend_exe = os.path.join(APP_DIR, "backend_service", "backend_service.exe")
        backend_runner = os.path.join(APP_DIR, "launcher", "backend_runner.py")
        backend_log = open(os.path.join(LOG_DIR, "backend.log"), "a", encoding="utf-8")

        if os.path.exists(backend_exe):
            cmd = [backend_exe, "--host", "127.0.0.1", "--port", "8000"]
            cwd = os.path.join(APP_DIR, "backend_service")
        else:
            cmd = [sys.executable, backend_runner, "--host", "127.0.0.1", "--port", "8000"]
            cwd = APP_DIR

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        p = subprocess.Popen(cmd, cwd=cwd, stdout=backend_log, stderr=backend_log, startupinfo=startupinfo)
        self.child_processes.append(p)

    def _start_frontend(self):
        frontend_exe = os.path.join(APP_DIR, "frontend_service", "frontend_server.exe")
        frontend_runner = os.path.join(APP_DIR, "launcher", "frontend_server.py")
        frontend_dist = os.path.join(APP_DIR, "frontend", "dist")
        if not os.path.exists(frontend_dist):
            frontend_dist = os.path.join(APP_DIR, "dist")

        frontend_log = open(os.path.join(LOG_DIR, "frontend.log"), "a", encoding="utf-8")

        if os.path.exists(frontend_exe):
            cmd = [frontend_exe, "--port", "5173", "--dir", frontend_dist, "--backend", "http://127.0.0.1:8000"]
            cwd = APP_DIR
        else:
            cmd = [sys.executable, frontend_runner, "--port", "5173", "--dir", frontend_dist, "--backend", "http://127.0.0.1:8000"]
            cwd = APP_DIR

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        p = subprocess.Popen(cmd, cwd=cwd, stdout=frontend_log, stderr=frontend_log, startupinfo=startupinfo)
        self.child_processes.append(p)

    def _wait_for_url(self, url: str, timeout: int = 20) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status in (200, 304):
                        return True
            except Exception:
                time.sleep(0.5)
        return False

    def open_browser(self):
        log_msg("Launching browser to http://127.0.0.1:5173")
        webbrowser.open("http://127.0.0.1:5173")

    def shutdown(self):
        log_msg("Shutting down ResQnet Prototype processes...")
        for p in self.child_processes:
            try:
                p.terminate()
                p.wait(timeout=2)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
        log_msg("=== ResQnet Prototype stopped ===")
        self.root.destroy()


def main():
    root = tk.Tk()
    app = PrototypeOrchestrator(root)
    root.mainloop()


if __name__ == "__main__":
    main()
