"""
Simulation Engine Clock
Maintains scenario-relative simulated time with configurable speed multipliers.
Does NOT rely on real-world elapsed time for event sequencing in tests.
"""
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SimulatedClock:
    """
    Scenario-relative clock with speed multiplier support.

    elapsed_sim_seconds represents simulated scenario time (T+n).
    Wall-clock time is used only for interval measurement, not for event ordering.

    Speed multiplier:
      1x  → 1 sim-second per real second  (full-speed demo)
      5x  → 5 sim-seconds per real second (fast demo)
      10x → 10 sim-seconds per real second (test speed)
    """
    speed_multiplier: int = 1
    _elapsed_sim_seconds: float = field(default=0.0, init=False)
    _wall_start: Optional[float] = field(default=None, init=False)
    _running: bool = field(default=False, init=False)
    _accumulated_before_pause: float = field(default=0.0, init=False)

    def start(self) -> None:
        """Start the clock from current position."""
        if self._running:
            return
        self._wall_start = time.monotonic()
        self._running = True

    def pause(self) -> None:
        """Pause the clock, preserving accumulated time."""
        if not self._running:
            return
        now = time.monotonic()
        elapsed_wall = now - (self._wall_start or now)
        self._accumulated_before_pause += elapsed_wall * self.speed_multiplier
        self._wall_start = None
        self._running = False

    def resume(self) -> None:
        """Resume from paused position."""
        if self._running:
            return
        self._wall_start = time.monotonic()
        self._running = True

    def reset(self) -> None:
        """Reset clock to T+0."""
        self._running = False
        self._wall_start = None
        self._accumulated_before_pause = 0.0

    @property
    def elapsed_sim_seconds(self) -> float:
        """Current simulated elapsed time in seconds."""
        if self._running and self._wall_start is not None:
            elapsed_wall = time.monotonic() - self._wall_start
            return self._accumulated_before_pause + (elapsed_wall * self.speed_multiplier)
        return self._accumulated_before_pause

    @property
    def is_running(self) -> bool:
        return self._running

    def format_sim_time(self, seconds: Optional[float] = None) -> str:
        """Format simulation time as T+MM:SS."""
        s = seconds if seconds is not None else self.elapsed_sim_seconds
        total_seconds = int(s)
        minutes = total_seconds // 60
        secs = total_seconds % 60
        return f"T+{minutes:02d}:{secs:02d}"

    def set_speed(self, multiplier: int) -> None:
        """Change speed multiplier. If running, captures current elapsed first."""
        if multiplier not in (1, 5, 10):
            raise ValueError(f"Speed multiplier must be 1, 5, or 10 — got {multiplier}")
        if self._running:
            current = self.elapsed_sim_seconds
            self.pause()
            self._accumulated_before_pause = current
            self.speed_multiplier = multiplier
            self.resume()
        else:
            self.speed_multiplier = multiplier
