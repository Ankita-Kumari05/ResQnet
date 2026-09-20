"""
Tests: API Client (unit tests with mocked HTTP responses)
Verifies authentication handling, response parsing, and delivery routing.
Does NOT require a live ResQnet instance.
"""
import pytest
import httpx
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.api_client import ResQnetClient
from app.models import EventStatus, EventType, SimulatedEvent, SourceType, SimSeverity


BASE_URL = "http://localhost:8000"


def make_client():
    return ResQnetClient(
        base_url=BASE_URL,
        coordinator_email="coordinator@resqnet.in",
        coordinator_password="coord123",
        citizen_email="citizen1@resqnet.in",
        citizen_password="citizen123",
    )


def make_event(event_type: EventType, payload: dict = None) -> SimulatedEvent:
    return SimulatedEvent(
        event_id=f"TEST_{event_type.value}",
        scenario_id="FLOOD_DEMO_01",
        source_type=SourceType.SIMULATED_OFFICIAL,
        source_label="SIMULATED TEST",
        event_type=event_type,
        sim_offset_seconds=0,
        latitude=20.5,
        longitude=85.8,
        severity=SimSeverity.HIGH,
        confidence=0.9,
        title="Test",
        description="Test",
        api_target="POST /api/test",
        api_role="coordinator",
        api_payload=payload or {},
    )


def mock_response(status_code: int, json_data: dict) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = MagicMock(return_value=json_data)
    resp.text = str(json_data)
    return resp


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestResQnetClient:

    def test_parse_response_success(self):
        """_parse_response with 201 should return success=True."""
        resp = mock_response(201, {"id": 1, "severity": "EMERGENCY"})
        success, body, error = ResQnetClient._parse_response(resp, "alert created", expected_status=201)
        assert success is True
        assert body["id"] == 1
        assert error is None

    def test_parse_response_failure(self):
        """_parse_response with 400 should return success=False."""
        resp = mock_response(400, {"detail": "Bad request"})
        success, body, error = ResQnetClient._parse_response(resp, "test", expected_status=201)
        assert success is False
        assert error is not None
        assert "400" in error

    def test_parse_response_500(self):
        """_parse_response with 500 should return success=False."""
        resp = mock_response(500, {"error": {"message": "Internal error"}})
        success, body, error = ResQnetClient._parse_response(resp, "test")
        assert success is False

    def test_coordinator_headers_before_auth_raises(self):
        """Accessing coordinator headers before auth should raise RuntimeError."""
        client = make_client()
        with pytest.raises(RuntimeError, match="Coordinator token not available"):
            client._coordinator_headers()

    def test_citizen_headers_before_auth_raises(self):
        """Accessing citizen headers before auth should raise RuntimeError."""
        client = make_client()
        with pytest.raises(RuntimeError, match="Citizen token not available"):
            client._citizen_headers()

    def test_deliver_event_flood_warning(self):
        """FLOOD_WARNING event should POST to /api/v1/alerts."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()

            event = make_event(EventType.FLOOD_WARNING, {
                "title": "[SIM] Test alert",
                "message": "[SIM] Test message",
                "severity": "EMERGENCY",
                "alert_type": "flood_warning",
            })

            mock_resp = mock_response(201, {"id": 5, "severity": "EMERGENCY"})
            client._http.post = AsyncMock(return_value=mock_resp)

            success, body, error = await client.deliver_event(event)
            assert success is True
            client._http.post.assert_called_once()
            call_args = client._http.post.call_args
            assert "/api/v1/alerts" in call_args[0][0]

        run(_run())

    def test_deliver_event_road_blocked(self):
        """ROAD_BLOCKED event should POST to /api/simulation/events/road/block."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()

            event = make_event(EventType.ROAD_BLOCKED, {"road_id": 12, "block": True})

            mock_resp = mock_response(200, {"event": "road_blocked", "road_id": 12, "blocked": True})
            client._http.post = AsyncMock(return_value=mock_resp)

            success, body, error = await client.deliver_event(event)
            assert success is True
            call_args = client._http.post.call_args
            assert "/api/simulation/events/road/block" in call_args[0][0]

        run(_run())

    def test_deliver_event_shelter_capacity(self):
        """SHELTER_CAPACITY_CHANGED should PATCH /api/v1/hubs/{id}/occupancy."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()

            event = make_event(EventType.SHELTER_CAPACITY_CHANGED, {"hub_id": 1, "delta": 180})

            mock_resp = mock_response(200, {"id": 1, "current_occupancy": 300, "status": "open"})
            client._http.patch = AsyncMock(return_value=mock_resp)

            success, body, error = await client.deliver_event(event)
            assert success is True
            call_args = client._http.patch.call_args
            assert "/api/v1/hubs/1/occupancy" in call_args[0][0]

        run(_run())

    def test_deliver_dispatch_without_cluster_uses_fallback(self):
        """RESPONDER_DISPATCH with no cluster_id should create a road survey mission."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()

            event = make_event(EventType.RESPONDER_DISPATCH)

            mock_resp = mock_response(201, {"id": 9, "status": "assigned", "mission_type": "survey_road"})
            client._http.post = AsyncMock(return_value=mock_resp)

            # No cluster_id — should fallback to road survey
            success, body, error = await client.deliver_event(
                event,
                resolved_cluster_id=None,
                resolved_responder_id=1,
            )
            assert success is True
            call_args = client._http.post.call_args
            payload_sent = call_args[1]["json"]
            assert payload_sent["mission_type"] == "survey_road"

        run(_run())

    def test_deliver_dispatch_with_cluster_creates_verify_mission(self):
        """RESPONDER_DISPATCH with cluster_id should create a verify_incident mission."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()

            event = make_event(EventType.RESPONDER_DISPATCH)

            mock_resp = mock_response(201, {"id": 10, "status": "assigned", "mission_type": "verify_incident"})
            client._http.post = AsyncMock(return_value=mock_resp)

            success, body, error = await client.deliver_event(
                event,
                resolved_cluster_id=42,
                resolved_responder_id=1,
            )
            assert success is True
            payload_sent = client._http.post.call_args[1]["json"]
            assert payload_sent["mission_type"] == "verify_incident"
            assert payload_sent["cluster_id"] == 42

        run(_run())

    def test_health_check_success(self):
        """health_check() returns True when ResQnet is reachable."""
        async def _run():
            client = make_client()
            client._http = AsyncMock()
            mock_resp = mock_response(200, {"status": "healthy"})
            client._http.get = AsyncMock(return_value=mock_resp)
            result = await client.health_check()
            assert result is True

        run(_run())

    def test_health_check_failure(self):
        """health_check() returns False when ResQnet is unreachable."""
        async def _run():
            client = make_client()
            client._http = AsyncMock()
            client._http.get = AsyncMock(side_effect=Exception("Connection refused"))
            result = await client.health_check()
            assert result is False

        run(_run())

    def test_api_failure_handled_gracefully(self):
        """Network errors during delivery should return success=False with error detail."""
        async def _run():
            client = make_client()
            client._coordinator_token = "fake_token"
            client._citizen_token = "fake_citizen_token"
            client._http = AsyncMock()
            client._http.post = AsyncMock(side_effect=Exception("Connection refused"))

            event = make_event(EventType.FLOOD_WARNING, {"title": "test", "message": "test", "severity": "EMERGENCY", "alert_type": "flood_warning"})

            success, body, error = await client.deliver_event(event)
            assert success is False
            assert error is not None

        run(_run())
