"""
Tests: Simulated Clock
Verifies start/pause/resume/reset, speed multiplier, and time formatting.
"""
import time
import pytest

from app.clock import SimulatedClock


class TestSimulatedClock:

    def test_initial_state(self):
        """Clock should start at zero, not running."""
        clock = SimulatedClock()
        assert clock.elapsed_sim_seconds == 0.0
        assert not clock.is_running

    def test_start_runs(self):
        """Clock should advance after start."""
        clock = SimulatedClock(speed_multiplier=1)
        clock.start()
        time.sleep(0.05)
        assert clock.elapsed_sim_seconds > 0.0
        assert clock.is_running

    def test_pause_stops_time(self):
        """Elapsed time should not increase while paused."""
        clock = SimulatedClock(speed_multiplier=1)
        clock.start()
        time.sleep(0.05)
        clock.pause()
        elapsed_at_pause = clock.elapsed_sim_seconds
        time.sleep(0.05)
        assert abs(clock.elapsed_sim_seconds - elapsed_at_pause) < 0.01
        assert not clock.is_running

    def test_resume_continues(self):
        """Clock should resume from paused position."""
        clock = SimulatedClock(speed_multiplier=1)
        clock.start()
        time.sleep(0.05)
        clock.pause()
        paused_elapsed = clock.elapsed_sim_seconds
        clock.resume()
        time.sleep(0.05)
        assert clock.elapsed_sim_seconds > paused_elapsed

    def test_reset_zeroes(self):
        """Reset should return clock to T+0."""
        clock = SimulatedClock(speed_multiplier=1)
        clock.start()
        time.sleep(0.05)
        clock.reset()
        assert clock.elapsed_sim_seconds == 0.0
        assert not clock.is_running

    def test_speed_multiplier(self):
        """10x speed should advance ~10x faster than 1x."""
        clock = SimulatedClock(speed_multiplier=10)
        clock.start()
        time.sleep(0.1)  # 100ms real time = ~1 sim second at 10x
        elapsed = clock.elapsed_sim_seconds
        assert elapsed > 0.5, f"Expected >0.5 sim-seconds at 10x, got {elapsed}"

    def test_format_sim_time(self):
        """format_sim_time should produce T+MM:SS strings."""
        clock = SimulatedClock()
        assert clock.format_sim_time(0) == "T+00:00"
        assert clock.format_sim_time(60) == "T+01:00"
        assert clock.format_sim_time(125) == "T+02:05"
        assert clock.format_sim_time(3661) == "T+61:01"

    def test_invalid_speed_raises(self):
        """Speed multipliers other than 1, 5, 10 should raise ValueError."""
        clock = SimulatedClock()
        with pytest.raises(ValueError):
            clock.set_speed(3)
        with pytest.raises(ValueError):
            clock.set_speed(0)
        with pytest.raises(ValueError):
            clock.set_speed(100)

    def test_valid_speeds(self):
        """Speed 1, 5, 10 should all be accepted."""
        clock = SimulatedClock()
        for s in (1, 5, 10):
            clock.set_speed(s)
            assert clock.speed_multiplier == s

    def test_double_start_idempotent(self):
        """Starting an already-running clock should not reset it."""
        clock = SimulatedClock(speed_multiplier=1)
        clock.start()
        time.sleep(0.05)
        elapsed_before = clock.elapsed_sim_seconds
        clock.start()  # Should be no-op
        time.sleep(0.02)
        assert clock.elapsed_sim_seconds > elapsed_before

    def test_pause_resume_preserves_elapsed(self):
        """Elapsed time accumulated before pause should be preserved after resume."""
        clock = SimulatedClock(speed_multiplier=10)
        clock.start()
        time.sleep(0.05)   # ~0.5 sim-seconds
        clock.pause()
        pre_pause = clock.elapsed_sim_seconds
        assert pre_pause > 0.1

        clock.resume()
        time.sleep(0.05)   # another ~0.5 sim-seconds
        post_resume = clock.elapsed_sim_seconds
        assert post_resume > pre_pause
