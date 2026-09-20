"""
Tests: Event Log
Verifies idempotency, thread safety, status updates, and clear behavior.
"""
import threading
import pytest

from app.event_log import EventLog
from app.models import (
    EventLogEntry,
    EventStatus,
    EventType,
    SimSeverity,
    SimulatedEvent,
    SourceType,
)


def _make_event(event_id: str, event_type: str = "FLOOD_WARNING") -> SimulatedEvent:
    return SimulatedEvent(
        event_id=event_id,
        scenario_id="FLOOD_DEMO_01",
        source_type=SourceType.SIMULATED_OFFICIAL,
        source_label="SIMULATED OFFICIAL",
        event_type=EventType(event_type),
        sim_offset_seconds=0,
        latitude=20.5,
        longitude=85.8,
        severity=SimSeverity.HIGH,
        confidence=0.9,
        title="Test event",
        description="Test description",
        api_target="POST /api/v1/alerts",
        api_role="coordinator",
        api_payload={},
    )


class TestEventLog:

    def test_record_pending(self):
        """Recording a pending event should add it to the log."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        entries = log.get_entries()
        assert len(entries) == 1
        assert entries[0].event_id == "E001"
        assert entries[0].status == EventStatus.PENDING

    def test_idempotent_record(self):
        """Recording the same event_id twice should not duplicate it."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        log.record_pending(event, "T+00:00")  # duplicate
        entries = log.get_entries()
        assert len(entries) == 1

    def test_update_status_acknowledged(self):
        """Updating status to ACKNOWLEDGED should mark the entry and set delivered_at."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        log.update_status("E001", EventStatus.ACKNOWLEDGED, resqnet_response_summary="Alert #1 created")
        entry = log.get_entry("E001")
        assert entry.status == EventStatus.ACKNOWLEDGED
        assert entry.resqnet_response_summary == "Alert #1 created"
        assert entry.delivered_at is not None

    def test_update_status_failed(self):
        """Updating status to FAILED should record the error detail."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        log.update_status("E001", EventStatus.FAILED, error_detail="HTTP 500: Internal Server Error")
        entry = log.get_entry("E001")
        assert entry.status == EventStatus.FAILED
        assert entry.error_detail == "HTTP 500: Internal Server Error"

    def test_is_already_delivered(self):
        """is_already_delivered should return True only after ACKNOWLEDGED."""
        log = EventLog()
        event = _make_event("E001")
        assert not log.is_already_delivered("E001")
        log.record_pending(event, "T+00:00")
        assert not log.is_already_delivered("E001")
        log.update_status("E001", EventStatus.ACKNOWLEDGED)
        assert log.is_already_delivered("E001")

    def test_is_not_delivered_after_failed(self):
        """is_already_delivered should return False for FAILED events (allow retry)."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        log.update_status("E001", EventStatus.FAILED, error_detail="Network error")
        assert not log.is_already_delivered("E001")

    def test_clear_resets_log(self):
        """clear() should remove all entries and allow re-recording."""
        log = EventLog()
        event = _make_event("E001")
        log.record_pending(event, "T+00:00")
        log.update_status("E001", EventStatus.ACKNOWLEDGED)
        assert log.is_already_delivered("E001")
        log.clear()
        assert len(log.get_entries()) == 0
        assert not log.is_already_delivered("E001")

    def test_summary_counts(self):
        """summary() should correctly count events by status."""
        log = EventLog()
        events = [_make_event(f"E{i:03d}") for i in range(4)]
        for i, evt in enumerate(events):
            log.record_pending(evt, f"T+0{i}:00")
        log.update_status("E000", EventStatus.ACKNOWLEDGED)
        log.update_status("E001", EventStatus.FAILED)
        summary = log.summary()
        assert summary["ACKNOWLEDGED"] == 1
        assert summary["FAILED"] == 1
        assert summary["PENDING"] == 2

    def test_multiple_events_ordering(self):
        """Events should be returned in insertion order."""
        log = EventLog()
        for i in range(5):
            evt = _make_event(f"E{i:03d}", "FLOOD_WARNING" if i % 2 == 0 else "ROAD_BLOCKED")
            log.record_pending(evt, f"T+0{i}:00")
        entries = log.get_entries()
        ids = [e.event_id for e in entries]
        assert ids == ["E000", "E001", "E002", "E003", "E004"]

    def test_thread_safety(self):
        """Concurrent writes should not cause data corruption."""
        log = EventLog()
        errors = []

        def write(i):
            try:
                evt = _make_event(f"THREAD_{i:03d}")
                log.record_pending(evt, f"T+{i:02d}:00")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=write, args=(i,)) for i in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert len(log.get_entries()) == 50
