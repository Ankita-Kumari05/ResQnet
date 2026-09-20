"""
ResQnet Simulation Engine Launcher (ResQnet_Simulation_Engine.exe)
One-click GUI launcher for the Simulation Engine.
Performs pre-flight checks against ResQnet Prototype, starts simulation server on port 9000,
and opens the Simulation Control UI in the browser.
STRICT ISOLATION: Zero direct PostgreSQL access.
"""
import sys
import os
import time
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
SIM_LOG = os.path.join(LOG_DIR, "simulation.log")

logging.basicConfig(
    filename=SIM_LOG,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    encoding="utf-8",
)
logger = logging.getLogger("sim_launcher")


def log_msg(msg: str, level: str = "INFO"):
    print(f"[{level}] {msg}", flush=True)
    if level == "ERROR":
        logger.error(msg)
    elif level == "WARNING":
        logger.warning(msg)
    else:
        logger.info(msg)


class SimLauncherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("ResQnet Simulation Engine")
        self.root.geometry("480x300")
        self.root.resizable(False, False)
        self.root.configure(bg="#0f172a")

        self.child_process = None
        self.is_running = False

        self._setup_ui()
        threading.Thread(target=self._startup_sequence, daemon=True).start()

    def _setup_ui(self):
        # Header banner
        header = tk.Frame(self.root, bg="#1e293b", height=70)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="ResQnet Simulation Engine",
            font=("Segoe UI", 15, "bold"),
            fg="#f59e0b",
            bg="#1e293b",
        )
        title_lbl.pack(pady=(12, 2))

        subtitle_lbl = tk.Label(
            header,
            text="External Scenario Runner (HTTP REST API Only) — SIH 2026",
            font=("Segoe UI", 8),
            fg="#94a3b8",
            bg="#1e293b",
        )
        subtitle_lbl.pack()

        # Content frame
        content_frame = tk.Frame(self.root, bg="#0f172a", padx=24, pady=20)
        content_frame.pack(fill="both", expand=True)

        self.status_lbl = tk.Label(
            content_frame,
            text="Connecting to ResQnet Prototype...",
            font=("Segoe UI", 11, "bold"),
            fg="#f8fafc",
            bg="#0f172a",
        )
        self.status_lbl.pack(anchor="w", pady=(4, 8))

        self.progress = ttk.Progressbar(content_frame, orient="horizontal", mode="indeterminate", length=430)
        self.progress.pack(pady=(0, 16))
        self.progress.start(15)

        self.target_lbl = tk.Label(
            content_frame, text="• ResQnet Target: http://127.0.0.1:8000", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a"
        )
        self.target_lbl.pack(anchor="w", pady=1)

        self.engine_lbl = tk.Label(
            content_frame, text="• Simulation UI: http://127.0.0.1:9000/ui", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a"
        )
        self.engine_lbl.pack(anchor="w", pady=1)

        self.scenarios_lbl = tk.Label(
            content_frame, text="• Scenarios: FLOOD_DEMO_01, EARTHQUAKE_DEMO_01, LANDSLIDE_DEMO_01", font=("Segoe UI", 8), fg="#64748b", bg="#0f172a"
        )
        self.scenarios_lbl.pack(anchor="w", pady=(4, 0))

        # Buttons
        self.btn_frame = tk.Frame(self.root, bg="#0f172a", padx=24, pady=12)
        self.btn_frame.pack(fill="x", side="bottom")

        self.open_ui_btn = tk.Button(
            self.btn_frame,
            text="Open Simulation UI",
            font=("Segoe UI", 9, "bold"),
            bg="#d97706",
            fg="white",
            relief="flat",
            padx=14,
            pady=6,
            state="disabled",
            command=self.open_ui,
        )
        self.open_ui_btn.pack(side="left", padx=(0, 8))

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

    def _startup_sequence(self):
        log_msg("=== Starting ResQnet Simulation Engine ===")
        # Pre-flight check: is ResQnet Backend running?
        target_url = "http://127.0.0.1:8000/health"
        log_msg(f"Probing ResQnet Backend at {target_url}...")

        backend_alive = False
        try:
            req = urllib.request.Request(target_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    backend_alive = True
        except Exception:
            backend_alive = False

        if not backend_alive:
            log_msg("ResQnet Prototype backend is not running.", "WARNING")
            self.progress.stop()
            self.status_lbl.config(text="ResQnet Prototype is not running.", fg="#f87171")
            messagebox.showwarning(
                "ResQnet Prototype Required",
                "ResQnet Prototype is not running.\n\nPlease start ResQnet_Prototype.exe first, then relaunch Simulation Engine."
            )
            self.root.destroy()
            return

        self.target_lbl.config(fg="#4ade80", text="• ResQnet Target: Connected (http://127.0.0.1:8000)")
        self.status_lbl.config(text="Starting Simulation Server on port 9000...")
        log_msg("Starting Simulation Engine server...")

        # Start simulation engine
        self._start_sim_server()

        # Wait for simulation health
        sim_ready = False
        for _ in range(25):
            time.sleep(0.5)
            try:
                req = urllib.request.Request("http://127.0.0.1:9000/health")
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status == 200:
                        sim_ready = True
                        break
            except Exception:
                pass

        if not sim_ready:
            log_msg("Simulation Engine failed to report healthy on port 9000", "ERROR")
            self.status_lbl.config(text="Simulation Engine failed to start.", fg="#f87171")
            self.progress.stop()
            messagebox.showerror("Error", f"Failed to start Simulation Engine.\nSee logs in:\n{LOG_DIR}")
            return

        self.engine_lbl.config(fg="#4ade80", text="• Simulation UI: Ready (http://127.0.0.1:9000/ui)")
        self.status_lbl.config(text="Simulation Engine Ready!")
        self.progress.stop()
        self.progress.pack_forget()
        self.open_ui_btn.config(state="normal")
        self.is_running = True

        log_msg("Simulation Engine ready. Opening UI...")
        self.open_ui()

    def _start_sim_server(self):
        sim_runner_script = os.path.join(APP_DIR, "launcher", "sim_runner.py")
        sim_exe = os.path.join(APP_DIR, "sim_service", "sim_service.exe")
        log_file = open(os.path.join(LOG_DIR, "simulation_server.log"), "a", encoding="utf-8")

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        if os.path.exists(sim_exe):
            cmd = [sim_exe, "--host", "127.0.0.1", "--port", "9000"]
            cwd = os.path.join(APP_DIR, "sim_service")
        else:
            cmd = [sys.executable, sim_runner_script, "--host", "127.0.0.1", "--port", "9000"]
            cwd = APP_DIR

        self.child_process = subprocess.Popen(cmd, cwd=cwd, stdout=log_file, stderr=log_file, startupinfo=startupinfo)

    def open_ui(self):
        log_msg("Opening browser to http://127.0.0.1:9000/ui")
        webbrowser.open("http://127.0.0.1:9000/ui")

    def shutdown(self):
        log_msg("Shutting down Simulation Engine...")
        if self.child_process:
            try:
                self.child_process.terminate()
                self.child_process.wait(timeout=2)
            except Exception:
                try:
                    self.child_process.kill()
                except Exception:
                    pass
        log_msg("=== Simulation Engine stopped ===")
        self.root.destroy()


def main():
    root = tk.Tk()
    app = SimLauncherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
