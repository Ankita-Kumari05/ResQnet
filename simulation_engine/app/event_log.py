"""
Simulation Engine Event Log
Thread-safe in-memory event log — no database required.

Each entry records what was sent, what ResQnet responded, and the full
cause-and-effect chain for demonstration purposes.
"""
import threading
from datetime import datetime, timezone
from typing import List, Optional

from app.models import (
    EventLogEntry,
    EventStatus,
    EventType,
    SimSeverity,
    SimulatedEvent,
    SourceType,
)


class EventLog:
    """
    Thread-safe in-memory log of simulation events.

    Provides ordered, append-only storage with idempotency checking.
    Duplicate event_ids are rejected (prevents re-delivery on retry).
    """

    def __init__(self):
        self._entries: List[EventLogEntry] = []
        self._seen_ids: set = set()
        self._lock = threading.Lock()

    def is_already_delivered(self, event_id: str) -> bool:
        """True if an event with this ID was already acknowledged or sent."""
        with self._lock:
            if event_id not in self._seen_ids:
                return False
            for e in self._entries:
                if e.event_id == event_id and e.status in (
                    EventStatus.ACKNOWLEDGED, EventStatus.SENT
                ):
                    return True
            return False

    def record_pending(self, event: SimulatedEvent, sim_time: str) -> None:
        """Register event as PENDING before delivery attempt."""
        with self._lock:
            if event.event_id in self._seen_ids:
                return
            self._seen_ids.add(event.event_id)
            entry = EventLogEntry(
                sim_time=sim_time,
                event_id=event.event_id,
                source_type=event.source_type,
                source_label=event.source_label,
                event_type=event.event_type,
                lat=event.latitude,
                lng=event.longitude,
                severity=event.severity,
                confidence=event.confidence,
                description=event.description,
                api_target=event.api_target,
                status=EventStatus.PENDING,
                chain_notes=event.chain_notes,
                chain_warning=event.chain_warning,
            )
            self._entries.append(entry)

    def update_status(
        self,
        event_id: str,
        status: EventStatus,
        resqnet_response_summary: Optional[str] = None,
        error_detail: Optional[str] = None,
    ) -> None:
        """Update delivery status for a recorded event."""
        with self._lock:
            for entry in self._entries:
                if entry.event_id == event_id:
                    entry.status = status
                    if resqnet_response_summary is not None:
                        entry.resqnet_response_summary = resqnet_response_summary
                    if error_detail is not None:
                        entry.error_detail = error_detail
                    if status in (EventStatus.ACKNOWLEDGED, EventStatus.SENT):
                        entry.delivered_at = datetime.now(timezone.utc)
                    break

    def get_entries(self) -> List[EventLogEntry]:
        """Return a snapshot of all log entries (newest last)."""
        with self._lock:
            return list(self._entries)

    def get_entry(self, event_id: str) -> Optional[EventLogEntry]:
        """Return a specific entry by event_id."""
        with self._lock:
            for e in self._entries:
                if e.event_id == event_id:
                    return e
            return None

    def clear(self) -> None:
        """Clear log for scenario reset. Does NOT affect ResQnet data."""
        with self._lock:
            self._entries.clear()
            self._seen_ids.clear()

    def summary(self) -> dict:
        """Return counts by status."""
        with self._lock:
            counts = {s.value: 0 for s in EventStatus}
            for e in self._entries:
                counts[e.status.value] += 1
            return counts


# Singleton event log
event_log = EventLog()
