"""
Simulation Engine API Client
Handles authentication and HTTP delivery of simulated events to ResQnet.

ARCHITECTURE CONTRACT:
  All methods in this module make REAL HTTP requests to ResQnet APIs.
  No database access. No SQL. No direct model manipulation.
  Every simulated event enters ResQnet through its public HTTP/API interface.

CHAIN VERIFICATION (per event type):
  FLOOD_WARNING        → POST /api/v1/alerts (alerts service → EmergencyAlert → AuditLog)
  WATER_LEVEL_HIGH     → POST /api/simulation/events/flood (hazard zone activation → routing cache dirty)
  CITIZEN_REPORT       → POST /api/simulation/events/reports/generate (IncidentReport UNVERIFIED → cluster pipeline)
  ROAD_BLOCKED         → POST /api/simulation/events/road/block (Road.is_blocked=True → routing excludes edge)
  RESPONDER_DISPATCH   → POST /api/v1/missions (create_mission_service → ASSIGNED → AuditLog → cluster status update)
  SHELTER_CAPACITY     → PATCH /api/v1/hubs/{id}/occupancy (update_occupancy_service → SELECT FOR UPDATE → derive_hub_status)
  SITUATION_UPDATE     → POST /api/v1/alerts (same chain as FLOOD_WARNING)

IDEMPOTENCY:
  Each event has a deterministic event_id from the scenario JSON.
  The EventLog tracks delivered events and prevents re-delivery.
  ResQnet does not provide idempotency keys for most endpoints — the engine
  prevents duplicate sends by checking EventStatus before retrying.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

from app.models import EventType, SimulatedEvent

logger = logging.getLogger("sim.api_client")


class ResQnetClient:
    """
    HTTP client for ResQnet API communication.

    Manages JWT tokens for coordinator and citizen roles.
    Tokens are fetched once and cached for the session.
    Credentials are loaded from environment — never hardcoded.
    """

    def __init__(
        self,
        base_url: str,
        coordinator_email: str,
        coordinator_password: str,
        citizen_email: str,
        citizen_password: str,
        timeout: float = 15.0,
    ):
        self.base_url = base_url.rstrip("/")
        self._coordinator_email = coordinator_email
        self._coordinator_password = coordinator_password
        self._citizen_email = citizen_email
        self._citizen_password = citizen_password
        self._timeout = timeout
        self._coordinator_token: Optional[str] = None
        self._citizen_token: Optional[str] = None
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._http = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(self, *args):
        if self._http:
            await self._http.aclose()
            self._http = None

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            raise RuntimeError("ResQnetClient must be used as async context manager")
        return self._http

    async def authenticate(self) -> None:
        """Fetch JWT tokens for coordinator and citizen roles."""
        self._coordinator_token = await self._login(
            self._coordinator_email, self._coordinator_password
        )
        logger.info(f"Authenticated coordinator: {self._coordinator_email}")

        self._citizen_token = await self._login(
            self._citizen_email, self._citizen_password
        )
        logger.info(f"Authenticated citizen: {self._citizen_email}")

    async def _login(self, email: str, password: str) -> str:
        """POST /api/v1/auth/login — returns JWT access token."""
        resp = await self._client().post(
            f"{self.base_url}/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"Authentication failed for {email}: "
                f"HTTP {resp.status_code} — {resp.text[:200]}"
            )
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise RuntimeError(f"No access_token in login response: {data}")
        return token

    def _coordinator_headers(self) -> Dict[str, str]:
        if not self._coordinator_token:
            raise RuntimeError("Coordinator token not available — call authenticate() first")
        return {"Authorization": f"Bearer {self._coordinator_token}"}

    def _citizen_headers(self) -> Dict[str, str]:
        if not self._citizen_token:
            raise RuntimeError("Citizen token not available — call authenticate() first")
        return {"Authorization": f"Bearer {self._citizen_token}"}

    async def deliver_event(
        self,
        event: SimulatedEvent,
        resolved_cluster_id: Optional[int] = None,
        resolved_responder_id: Optional[int] = None,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Deliver a single SimulatedEvent to the appropriate ResQnet API.

        Returns
        -------
        (success: bool, response_body: dict, error_detail: Optional[str])
        """
        try:
            if event.event_type in (
                EventType.FLOOD_WARNING,
                EventType.EARTHQUAKE_WARNING,
                EventType.LANDSLIDE_WARNING,
                EventType.GEOLOGICAL_WARNING,
                EventType.OFFICIAL_ALERT,
            ):
                return await self._deliver_flood_warning(event)
            elif event.event_type in (
                EventType.WATER_LEVEL_HIGH,
                EventType.SEISMIC_EVENT,
                EventType.SLOPE_FAILURE,
            ):
                return await self._deliver_water_level_high(event)
            elif event.event_type == EventType.CITIZEN_REPORT:
                return await self._deliver_citizen_report(event)
            elif event.event_type in (
                EventType.ROAD_BLOCKED,
                EventType.STRUCTURAL_DAMAGE,
                EventType.ROAD_BLOCKAGE,
            ):
                return await self._deliver_road_blocked(event)
            elif event.event_type == EventType.RESPONDER_DISPATCH:
                return await self._deliver_responder_dispatch(
                    event,
                    resolved_cluster_id=resolved_cluster_id,
                    resolved_responder_id=resolved_responder_id,
                )
            elif event.event_type == EventType.SHELTER_CAPACITY_CHANGED:
                return await self._deliver_shelter_capacity(event)
            elif event.event_type == EventType.SITUATION_UPDATE:
                return await self._deliver_situation_update(event)
            else:
                return False, {}, f"Unknown event type: {event.event_type}"
        except Exception as exc:
            logger.exception(f"Exception delivering event {event.event_id}: {exc}")
            err_msg = str(exc).strip() or f"{type(exc).__name__}"
            return False, {}, err_msg

    # ── Event Delivery Methods ────────────────────────────────────────────────

    async def _deliver_flood_warning(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        FLOOD_WARNING → POST /api/v1/alerts

        CHAIN:
          SIMULATED_OFFICIAL source
          → HTTP POST /api/v1/alerts (coordinator JWT)
          → alerts.service.create_emergency_alert()
          → EmergencyAlert inserted into DB (title "[SIM] ...")
          → AuditLog entry EMERGENCY_ALERT_CREATED
          → Alert visible on /api/v1/alerts/active
          → Dashboard shows flood warning with [SIM] attribution label
        """
        payload = dict(event.api_payload)
        resp = await self._client().post(
            f"{self.base_url}/api/v1/alerts",
            json=payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "alert created", expected_status=201)

    async def _deliver_water_level_high(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        WATER_LEVEL_HIGH → POST /api/simulation/events/flood

        CHAIN:
          SIMULATED_SENSOR source (observation, not verified ground truth)
          → HTTP POST /api/simulation/events/flood (coordinator JWT)
          → simulation.router.sim_start_flood()
          → HazardZone.is_active = True, severity updated
          → DB committed
          → routing cache dirty flag set on next route calculation (lazy rebuild)
          → Roads intersecting this zone get spatial penalties via ST_Intersects

        NOTE: This activates a hazard zone. The routing engine does NOT
        automatically recalculate routes — it rebuilds the graph on the next
        call to /routing/calculate. No routing result is fabricated here.
        """
        payload = dict(event.api_payload)
        resp = await self._client().post(
            f"{self.base_url}/api/simulation/events/flood",
            json=payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "hazard zone activated")

    async def _deliver_citizen_report(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        CITIZEN_REPORT → POST /api/simulation/events/reports/generate

        CHAIN:
          SIMULATED_CITIZEN source
          → HTTP POST /api/simulation/events/reports/generate (coordinator JWT)
          → simulation.router.sim_generate_reports()
          → find_or_create_cluster() → spatial cluster lookup/creation
          → IncidentReport created with status=UNVERIFIED (Tier-1 signal)
          → Report enters cluster pipeline — NOT verified ground truth
          → Coordinator can see unverified cluster on dashboard
          → Cluster is available for mission dispatch at coordinator discretion

        NOTE: Reports are explicitly unverified. The simulation engine does NOT
        fabricate a verified incident. Verification requires a responder field survey.
        """
        payload = dict(event.api_payload)
        resp = await self._client().post(
            f"{self.base_url}/api/simulation/events/reports/generate",
            json=payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "citizen reports generated")

    async def _deliver_road_blocked(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        ROAD_BLOCKED → POST /api/simulation/events/road/block

        CHAIN:
          SIMULATED_RESPONDER source (coordinator acting on responder field observation)
          → HTTP POST /api/simulation/events/road/block (coordinator JWT)
          → simulation.router.sim_block_road()
          → Road.is_blocked = True, Road.status = 'blocked', last_verified_at updated
          → DB committed
          → Next /routing/calculate call rebuilds graph — blocked road excluded from edges
          → Alternative routes are used (e.g. via Central Spine roads)

        DOCUMENTED SHORTCUT: In full production workflow, road blocking is established
        via FieldSurvey → verification_outcome = road_blocked → road.status update.
        This simulation shortcut represents the coordinator applying a responder
        radio report directly. This gap is flagged in event chain_warning.
        """
        payload = dict(event.api_payload)
        resp = await self._client().post(
            f"{self.base_url}/api/simulation/events/road/block",
            json=payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "road blocked")

    async def _deliver_responder_dispatch(
        self,
        event: SimulatedEvent,
        resolved_cluster_id: Optional[int],
        resolved_responder_id: Optional[int],
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        RESPONDER_DISPATCH → POST /api/v1/missions (ONE call only)

        CHAIN:
          SIMULATED_COORDINATOR source
          → HTTP POST /api/v1/missions (coordinator JWT)
          → missions.service.create_mission_service()
          → Validates cluster exists and is open
          → Validates responder exists and is NOT offline or on_mission
          → Creates Mission (status=ASSIGNED)
          → ReportCluster.status → mission_assigned
          → AuditLog entry MISSION_CREATED
          → Mission visible on coordinator dashboard
          → Responder receives assignment notification

        IMPORTANT: ONLY /api/v1/missions is called. /api/simulation/events/dispatch
        is NOT called separately — that would create a DUPLICATE mission with
        contradictory state. The /api/v1/missions path exercises the full business
        logic service layer including audit logging.

        If resolved_cluster_id is None, falls back to coordinates-only mission
        (survey_road type) to avoid a 400 error from missing cluster_id.
        """
        # Build payload from scenario template, resolving dynamic IDs
        base_template = dict(event.api_payload) if event.api_payload else {}
        mission_payload: Dict[str, Any] = {}

        # 1. Mission Type
        m_type = base_template.get("mission_type")
        if not m_type:
            m_type = "verify_incident" if resolved_cluster_id else "survey_road"
        mission_payload["mission_type"] = m_type

        # 2. Title & Description
        mission_payload["title"] = base_template.get(
            "title", f"[SIM] Responder Mission — {event.scenario_id or 'SIMULATION'}"
        )
        mission_payload["description"] = base_template.get(
            "description", f"[SIMULATED COORDINATOR DISPATCH] Field mission for {event.scenario_id}"
        )

        # 3. Location & Notes
        mission_payload["target_lat"] = base_template.get("target_lat", event.latitude)
        mission_payload["target_lng"] = base_template.get("target_lng", event.longitude)
        if "notes" in base_template:
            mission_payload["notes"] = base_template["notes"]
        else:
            mission_payload["notes"] = f"Simulation scenario {event.scenario_id} — dispatch event"

        # 4. Optional entity links (road_id, hub_id)
        if "road_id" in base_template and isinstance(base_template["road_id"], int):
            mission_payload["road_id"] = base_template["road_id"]
        if "hub_id" in base_template and isinstance(base_template["hub_id"], int):
            mission_payload["hub_id"] = base_template["hub_id"]

        # 5. Responder ID
        if resolved_responder_id is not None:
            mission_payload["responder_id"] = resolved_responder_id
        elif isinstance(base_template.get("responder_id"), int):
            mission_payload["responder_id"] = base_template["responder_id"]

        # 6. Cluster ID
        if resolved_cluster_id is not None:
            mission_payload["cluster_id"] = resolved_cluster_id
        elif isinstance(base_template.get("cluster_id"), int):
            mission_payload["cluster_id"] = base_template["cluster_id"]
        elif mission_payload["mission_type"] == "verify_incident" and resolved_cluster_id is None:
            # Fallback to survey_road if no cluster resolved to avoid 400 error
            logger.warning(
                "RESPONDER_DISPATCH: No cluster_id resolved — "
                "fallback to survey_road mission"
            )
            mission_payload["mission_type"] = "survey_road"
            if "road_id" not in mission_payload:
                mission_payload["road_id"] = 12

        resp = await self._client().post(
            f"{self.base_url}/api/v1/missions",
            json=mission_payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "mission created", expected_status=201)

    async def _deliver_shelter_capacity(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        SHELTER_CAPACITY_CHANGED → PATCH /api/v1/hubs/{hub_id}/occupancy

        CHAIN:
          SIMULATED_SENSOR source (shelter registration sensor simulation)
          → HTTP PATCH /api/v1/hubs/1/occupancy (coordinator JWT)
          → hubs.service.update_occupancy_service()
          → SELECT FOR UPDATE row lock acquired
          → new_occupancy = current + delta (validated: cannot exceed max_capacity)
          → derive_hub_status() called → status derived from occupancy ratio
          → AuditLog entry SAFETY_HUB_OCCUPANCY_UPDATED
          → Hub state visible on dashboard (occupancy, status, available_capacity)

        Hub Alpha seed state: max_capacity=400, current_occupancy=120
        After delta=+180: occupancy=300, ratio=0.75, status=OPEN (below 0.85 threshold)

        NOTE: Full business logic path including SELECT FOR UPDATE locking.
        No direct DB access.
        """
        hub_id = event.api_payload.get("hub_id", 1)
        delta = event.api_payload.get("delta", 180)
        resp = await self._client().patch(
            f"{self.base_url}/api/v1/hubs/{hub_id}/occupancy",
            json={"delta": delta},
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, f"hub {hub_id} occupancy updated")

    async def _deliver_situation_update(
        self, event: SimulatedEvent
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        SITUATION_UPDATE → POST /api/v1/alerts

        Same chain as FLOOD_WARNING:
          SIMULATION_ENGINE source
          → HTTP POST /api/v1/alerts (coordinator JWT)
          → alerts.service.create_emergency_alert()
          → EmergencyAlert (alert_type="situation_update")
          → AuditLog entry EMERGENCY_ALERT_CREATED
          → Both alerts visible on /api/v1/alerts/active
        """
        payload = dict(event.api_payload)
        resp = await self._client().post(
            f"{self.base_url}/api/v1/alerts",
            json=payload,
            headers=self._coordinator_headers(),
        )
        return self._parse_response(resp, "situation update alert created", expected_status=201)

    # ── State Queries ─────────────────────────────────────────────────────────

    async def get_responder_profile_id(self, user_id: int = 1) -> Optional[int]:
        """
        Query /api/v1/missions/responders to resolve responder profile ID.
        Returns the first available responder's profile ID.
        """
        try:
            resp = await self._client().get(
                f"{self.base_url}/api/v1/missions/responders",
                headers=self._coordinator_headers(),
            )
            if resp.status_code == 200:
                responders = resp.json()
                # Find first available responder
                for r in responders:
                    if r.get("status") == "available":
                        logger.info(f"Resolved responder profile ID: {r['id']}")
                        return r["id"]
                # If none available, return the first one anyway (coordinator override)
                if responders:
                    logger.warning(
                        "No available responders — using first responder anyway"
                    )
                    return responders[0]["id"]
        except Exception as e:
            logger.warning(f"Could not resolve responder profile ID: {e}")
        return None

    async def get_latest_cluster_id(self) -> Optional[int]:
        """
        Query /api/simulation/state to find the most recently created open cluster.
        Used to resolve cluster_id for RESPONDER_DISPATCH event.
        """
        try:
            resp = await self._client().get(
                f"{self.base_url}/api/simulation/state",
                headers=self._coordinator_headers(),
            )
            if resp.status_code == 200:
                state = resp.json()
                clusters = state.get("clusters", [])
                # Find most recent open cluster (highest id with open status)
                open_clusters = [c for c in clusters if c.get("status") == "open"]
                if open_clusters:
                    latest = max(open_clusters, key=lambda c: c["id"])
                    logger.info(f"Resolved cluster ID: {latest['id']}")
                    return latest["id"]
                # Fallback: any cluster
                if clusters:
                    latest = max(clusters, key=lambda c: c["id"])
                    logger.info(f"Resolved cluster ID (fallback): {latest['id']}")
                    return latest["id"]
        except Exception as e:
            logger.warning(f"Could not resolve cluster ID: {e}")
        return None

    async def health_check(self) -> bool:
        """Check if ResQnet backend is reachable."""
        try:
            resp = await self._client().get(
                f"{self.base_url}/health", timeout=5.0
            )
            return resp.status_code == 200
        except Exception:
            return False

    # ── Response Parser ───────────────────────────────────────────────────────

    @staticmethod
    def _parse_response(
        resp: httpx.Response,
        success_label: str,
        expected_status: int = 200,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """Parse HTTP response into (success, body, error_detail)."""
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text[:500]}

        if resp.status_code in (expected_status, 200, 201):
            logger.info(f"✓ {success_label} (HTTP {resp.status_code})")
            return True, body, None
        else:
            error_msg = (
                f"HTTP {resp.status_code}: "
                f"{body.get('detail') or body.get('error', {}).get('message', resp.text[:200])}"
            )
            logger.warning(f"✗ {success_label} failed — {error_msg}")
            return False, body, error_msg
