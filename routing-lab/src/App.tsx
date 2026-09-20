import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Coordinate, StartOriginType, TestPreset } from './types/routing';
import type {
  SafetyHub,
  PotentialSafetyHub,
  OperationalArea,
} from './types/safetyHub';
import type { RouteCandidate } from './types/candidates';
import type { RoutingDecision } from './types/routingDecision';
import type { HazardZone, BlockedRoad } from './types/safety';
import type { MapInteractionMode } from './types/interaction';
import type { LiveLocationState, LiveLocationStatus } from './types/location';
import { INITIAL_LIVE_LOCATION_STATE } from './types/location';
import type { Incident, IncidentType } from './types/incident';
import type { Responder } from './types/responder';
import type { Mission } from './types/mission';
import type { UserRole, CitizenProfile } from './types/roles';
import { DEFAULT_CITIZEN_PROFILE } from './types/roles';
import { INITIAL_SAFETY_HUBS, INITIAL_OPERATIONAL_AREAS } from './data/safetyHubData';
import { INITIAL_INCIDENTS } from './data/incidentData';
import { INITIAL_RESPONDERS } from './data/responderData';
import { INITIAL_MISSIONS } from './data/missionData';
import { HAZARD_ZONES } from './data/hazardData';
import { BLOCKED_ROADS } from './data/blockedRoadData';
import { TEST_PRESETS } from './data/testPresets';
import { PHASE4_SCENARIOS } from './data/phase4Scenarios';

import { RoutingMap } from './components/RoutingMap';
import { RoleNavHeader } from './components/RoleNavHeader';
import { RoleControlPanel, type VisibleLayersState } from './components/RoleControlPanel';
import { ConfirmPolygonModal, ConfirmBlockRoadModal, ConfirmBlockRoadSectionModal, type RoadSectionDraft } from './components/CoordinatorModals';
import { PotentialSafetyHubModal, ConfigureSafetyHubModal, CreateSafetyHubChoiceModal } from './components/SafetyHubModals';
import { CreateOperationalAreaModal, EditOperationalAreaModal } from './components/OperationalAreaModals';
import { CoordinatorManageDrawer } from './components/CoordinatorManageDrawer';
import type { CoordinatorMode } from './components/CoordinatorControlPanel';

import { getRouteCandidates } from './services/routingService';
import { evaluateRouteSafety } from './services/routeSafetyService';
import { generateSafeDetours } from './services/detourService';
import { findBestSafeSafetyHub } from './services/safetyHubService';
import type { OperationalRoad } from './data/roadNetworkData';
import {
  getPointAtDistanceAlongRoad,
  snapPointToRoadNetwork,
  snapPointToSpecificRoad,
  getRoadTotalLengthMeters,
  extractRoadSectionFromHandles,
} from './services/roadSectionService';
import {
  buildRoutingDecision,
  createIdleRoutingDecision,
  buildPhase4ScenarioDecision,
} from './services/routingDecisionService';
import {
  evaluateGpsRouteProgress,
  generateDirectionArrowFeatures,
  type GpsNavigationEvaluation,
} from './services/routeProgressService';
import { createIncident } from './services/incidentService';
import { executeDispatch } from './services/dispatchService';
import { transitionMissionState } from './services/missionService';

/**
 * Computes complete authoritative routing decision:
 * 1. Queries OSRM candidate routes
 * 2. Evaluates hazard intersections & blocked roads
 * 3. Generates detours if hazards / closures encountered
 * 4. Selects optimal safe route via decision engine
 */
async function computeFullRoutingDecision(
  start: Coordinate,
  destination: Coordinate,
  hazards: HazardZone[],
  blockedRoads: BlockedRoad[]
): Promise<RoutingDecision> {
  const candidatesFetch = await getRouteCandidates(start, destination);
  if (candidatesFetch.status !== 'success' || candidatesFetch.routes.length === 0) {
    return createIdleRoutingDecision(start, destination);
  }

  const initialCandidates: RouteCandidate[] = candidatesFetch.routes.map((r, idx) => {
    const safety = evaluateRouteSafety(r, hazards, blockedRoads);
    return {
      id: `cand-${idx + 1}`,
      label: `Route Option ${idx + 1}`,
      geometry: r.geometry,
      coordinates: r.coordinates,
      distanceMeters: r.distanceMeters,
      distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
      durationSeconds: r.durationSeconds,
      durationMinutes: Math.round(r.durationSeconds / 60),
      safetyAssessment: safety,
      isSelected: false,
      isOriginalRisky: safety.safetyStatus !== 'SAFE',
    };
  });

  const allBlockedRoadIds = new Set<string>();
  const allHazardIds = new Set<string>();
  initialCandidates.forEach((c) => {
    c.safetyAssessment.blockedRoadIntersections.forEach((b) => allBlockedRoadIds.add(b.roadId));
    c.safetyAssessment.hazardIntersections.forEach((h) => allHazardIds.add(h.hazardId));
  });

  let detourCandidates: RouteCandidate[] = [];
  let detourAttempts = 0;

  if (allBlockedRoadIds.size > 0 || allHazardIds.size > 0) {
    const detourGen = await generateSafeDetours(
      start,
      destination,
      {
        hazardIds: Array.from(allHazardIds),
        blockedRoadIds: Array.from(allBlockedRoadIds),
      },
      hazards,
      blockedRoads
    );
    detourCandidates = detourGen.detourCandidates;
    detourAttempts = detourGen.attemptsCount;
  }

  return buildRoutingDecision({
    start,
    destination,
    initialCandidates,
    detourAttempts,
    detourCandidates,
    isSyntheticFixture: false,
  });
}

export function App() {
  // ─── Authoritative operational dataset state ──────────────────────────────
  const [hazards, setHazards] = useState<HazardZone[]>(HAZARD_ZONES);
  const [blockedRoads, setBlockedRoads] = useState<BlockedRoad[]>(BLOCKED_ROADS);
  const [safetyHubs, setSafetyHubs] = useState<SafetyHub[]>(INITIAL_SAFETY_HUBS);
  const [operationalAreas, setOperationalAreas] = useState<OperationalArea[]>(INITIAL_OPERATIONAL_AREAS);
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_INCIDENTS);
  const [responders, setResponders] = useState<Responder[]>(INITIAL_RESPONDERS);
  const [missions, setMissions] = useState<Mission[]>(INITIAL_MISSIONS);

  // ─── Active Role Selector (CITIZEN | COORDINATOR | RESPONDER) ─────────────
  const [userRole, setUserRole] = useState<UserRole>('CITIZEN');
  const [citizenProfile] = useState<CitizenProfile>(DEFAULT_CITIZEN_PROFILE);
  const [activeResponderId, setActiveResponderId] = useState<string>(INITIAL_RESPONDERS[0].id);
  const [selectedIncidentIdForReview, setSelectedIncidentIdForReview] = useState<string | null>(null);

  // ─── Layer Visibility Toggles ─────────────────────────────────────────────
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayersState>({
    safetyHubs: true,
    hazards: true,
    blockedRoads: true,
    incidents: true,
    responders: true,
  });

  const handleToggleLayer = useCallback((layer: keyof VisibleLayersState) => {
    setVisibleLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // ─── Authoritative Map Interaction Mode (Default: EXPLORE) ─────────────────
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('EXPLORE');

  // ─── Live GPS Location State ──────────────────────────────────────────────
  const [liveLocationState, setLiveLocationState] = useState<LiveLocationState>(INITIAL_LIVE_LOCATION_STATE);
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [startOriginType, setStartOriginType] = useState<StartOriginType>('MAP_POINT');

  // ─── Routing State ────────────────────────────────────────────────────────
  const [start, setStart] = useState<Coordinate | null>(() => TEST_PRESETS[0].start);
  const [destination, setDestination] = useState<Coordinate | null>(() => TEST_PRESETS[0].destination);
  const [startSource, setStartSource] = useState<'gps' | 'manual'>('manual');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(false);
  const [isSnapToRoadEnabled] = useState<boolean>(true);
  const [isRoutePointsLocked] = useState<boolean>(false);
  const [fitRouteTrigger] = useState<number>(1);

  // Authoritative routing decision (Single Source of Truth)
  const [decision, setDecision] = useState<RoutingDecision>(() =>
    buildPhase4ScenarioDecision(PHASE4_SCENARIOS[0])
  );

  // Authoritative GPS Watcher Ref & Tracking Management
  const watchIdRef = useRef<number | null>(null);
  const activeResponderIdRef = useRef<string>(activeResponderId);
  const liveLocationStateRef = useRef<LiveLocationState>(liveLocationState);
  const startSourceRef = useRef<'gps' | 'manual'>('manual');
  const startRef = useRef<Coordinate | null>(start);

  useEffect(() => {
    activeResponderIdRef.current = activeResponderId;
  }, [activeResponderId]);

  useEffect(() => {
    liveLocationStateRef.current = liveLocationState;
  }, [liveLocationState]);

  useEffect(() => {
    startSourceRef.current = startSource;
  }, [startSource]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // Clean unmount of authoritative GPS watcher
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        console.log('[GPS] GPS disabled (unmount cleanup)');
        watchIdRef.current = null;
      }
    };
  }, []);

  const handleToggleLiveLocation = useCallback(() => {
    const isCurrentlyTracking =
      liveLocationStateRef.current.status === 'ACTIVE' ||
      liveLocationStateRef.current.status === 'REQUESTING' ||
      watchIdRef.current !== null;

    if (isCurrentlyTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      console.log('[GPS] GPS disabled');
      setLiveLocationState(INITIAL_LIVE_LOCATION_STATE);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.error('[GPS] position error: Geolocation not supported by this browser.');
      setLiveLocationState({
        ...INITIAL_LIVE_LOCATION_STATE,
        status: 'UNAVAILABLE',
        errorMessage: 'Geolocation is not supported by this browser.',
      });
      return;
    }

    console.log('[GPS] watch started');
    setLiveLocationState((prev) => ({
      ...prev,
      status: 'REQUESTING',
      errorMessage: null,
    }));

    try {
      let isFirstPosition = true;
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // Coordinate validation
          if (
            typeof lat !== 'number' ||
            typeof lng !== 'number' ||
            isNaN(lat) ||
            isNaN(lng) ||
            (lat === 0 && lng === 0) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180
          ) {
            console.warn('[GPS] Invalid/zero coordinates received, rejecting:', { lat, lng });
            return;
          }

          if (isFirstPosition) {
            console.log('[GPS] permission result: granted');
            isFirstPosition = false;
          }

          console.log('[GPS] position received:', {
            latitude: lat,
            longitude: lng,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
          });

          // MapLibre Coordinate: [longitude, latitude]
          const coord: Coordinate = [
            Number(lng.toFixed(6)),
            Number(lat.toFixed(6)),
          ];

          setLiveLocationState({
            status: 'ACTIVE',
            coordinate: coord,
            accuracyMeters: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
            headingDegrees: typeof pos.coords.heading === 'number' ? pos.coords.heading : null,
            speedMps: typeof pos.coords.speed === 'number' ? pos.coords.speed : null,
            timestamp: pos.timestamp || Date.now(),
            watchId,
            errorMessage: null,
            isFollowMe: false,
          });
          console.log('[GPS] liveLocation updated');

          // Initialize or update A from GPS if startSource is 'gps' or A is not set
          if (startSourceRef.current === 'gps' || !startRef.current) {
            const isFirstInit = startSourceRef.current !== 'gps';
            setStart(coord);
            setStartSource('gps');
            setStartOriginType('CURRENT_LOCATION');
            if (isFirstInit) {
              console.log('[GPS] A initialized from GPS:', coord);
            } else {
              console.log('[GPS] A updated from GPS:', coord);
            }
          }

          // Update the active responder's GPS location
          const currentActiveRespId = activeResponderIdRef.current;
          setResponders((prev) =>
            prev.map((r) =>
              r.id === currentActiveRespId
                ? { ...r, currentGpsPosition: coord }
                : r
            )
          );
        },
        (err) => {
          let status: LiveLocationStatus = 'ERROR';
          let msg = 'Failed to retrieve GPS location.';
          if (err.code === 1 /* PERMISSION_DENIED */) {
            status = 'DENIED';
            msg = 'Location permission is required for live tracking.';
          } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
            status = 'UNAVAILABLE';
            msg = 'Location signal unavailable.';
          } else if (err.code === 3 /* TIMEOUT */) {
            status = 'ERROR';
            msg = 'Location request timed out.';
          }
          console.error('[GPS] permission result:', status);
          console.error('[GPS] position error:', { code: err.code, message: msg, raw: err.message });
          setLiveLocationState((prev) => ({
            ...prev,
            status,
            errorMessage: msg,
            watchId,
          }));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );

      watchIdRef.current = watchId;
      setLiveLocationState((prev) => ({ ...prev, watchId }));
    } catch (err: any) {
      console.error('[GPS] position error: Exception while initiating watchPosition:', err);
      setLiveLocationState({
        ...INITIAL_LIVE_LOCATION_STATE,
        status: 'ERROR',
        errorMessage: err?.message || 'Failed to start GPS watcher.',
      });
    }
  }, []);

  const handleUseGpsAsStart = useCallback(() => {
    if (liveLocationStateRef.current.coordinate) {
      const coord = liveLocationStateRef.current.coordinate;
      setStart(coord);
      setStartSource('gps');
      setStartOriginType('CURRENT_LOCATION');
      console.log('[GPS] A initialized from GPS:', coord);
    }
  }, []);

  const handleRecenterGps = useCallback(() => {
    setRecenterTrigger((v) => v + 1);
  }, []);

  const handleDisableFollowMe = useCallback(() => {
    setLiveLocationState((prev) => (prev.isFollowMe ? { ...prev, isFollowMe: false } : prev));
  }, []);

  // ─── GPS Route Navigation & Monotonic Progress Tracking ───────────────────
  const maxTripProgressRef = useRef<{ routeId: string; maxProgressMeters: number }>({
    routeId: '',
    maxProgressMeters: 0,
  });
  const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);
  const simWalkIntervalRef = useRef<number | null>(null);

  const navEvaluation = useMemo<GpsNavigationEvaluation | null>(() => {
    const route = decision.selectedRoute;
    if (!route || route.coordinates.length < 2) {
      maxTripProgressRef.current = { routeId: '', maxProgressMeters: 0 };
      return null;
    }

    if (route.id !== maxTripProgressRef.current.routeId) {
      maxTripProgressRef.current = { routeId: route.id, maxProgressMeters: 0 };
    }

    const currentGps = liveLocationState.coordinate;
    if (currentGps && liveLocationState.status === 'ACTIVE') {
      const evaluation = evaluateGpsRouteProgress(
        currentGps,
        route.coordinates,
        maxTripProgressRef.current.maxProgressMeters
      );

      if (evaluation.status === 'ON_ROUTE') {
        maxTripProgressRef.current.maxProgressMeters = evaluation.maxProgressMeters;
      }
      return evaluation;
    }

    const arrows = generateDirectionArrowFeatures(route.coordinates, 85, 35);
    return {
      status: 'IDLE',
      nearestPointOnRoute: route.coordinates[0],
      distanceToRouteMeters: 0,
      distanceToDestinationMeters: route.distanceMeters,
      currentProgressMeters: 0,
      maxProgressMeters: 0,
      progressFraction: 0,
      remainingCoordinates: route.coordinates,
      remainingDistanceMeters: route.distanceMeters,
      arrowFeatures: arrows,
      isOffRoute: false,
      isArrived: false,
      explanation: 'Route active. Ready for navigation telemetry.',
    };
  }, [decision.selectedRoute, liveLocationState.coordinate, liveLocationState.status]);

  const remainingRouteCoords = useMemo<Coordinate[] | null>(() => {
    if (!navEvaluation) {
      return null;
    }
    if (navEvaluation.status === 'ARRIVED') {
      return [];
    }
    if (navEvaluation.status === 'IDLE') {
      return null;
    }
    return navEvaluation.remainingCoordinates;
  }, [navEvaluation]);

  // ─── Coordinator Tools & Modals State ─────────────────────────────────────
  const [coordinatorMode, setCoordinatorMode] = useState<CoordinatorMode>('none');
  const [drawingPoints, setDrawingPoints] = useState<Coordinate[]>([]);
  const [polygonToConfirm, setPolygonToConfirm] = useState<{
    type: 'hazard' | 'danger_zone';
    points: Coordinate[];
  } | null>(null);
  const [roadToConfirm, setRoadToConfirm] = useState<BlockedRoad | null>(null);
  const [selectedSectionRoad, setSelectedSectionRoad] = useState<OperationalRoad | null>(null);
  const [sectionStartDist, setSectionStartDist] = useState<number>(0);
  const [sectionEndDist, setSectionEndDist] = useState<number>(0);
  const [sectionDraft, setSectionDraft] = useState<RoadSectionDraft | null>(null);
  const [isConfirmSectionModalOpen, setIsConfirmSectionModalOpen] = useState<boolean>(false);
  const [isManageDrawerOpen, setIsManageDrawerOpen] = useState<boolean>(false);
  const [focusedFeatureCoords, setFocusedFeatureCoords] = useState<Coordinate[] | null>(null);

  // Safety Hub Modal State
  const [isCreateHubChoiceOpen, setIsCreateHubChoiceOpen] = useState<boolean>(false);
  const [potentialHubToVerify, setPotentialHubToVerify] = useState<PotentialSafetyHub | null>(null);
  const [hubToConfigure, setHubToConfigure] = useState<SafetyHub | null>(null);
  const [isConfiguringNewFromPotential, setIsConfiguringNewFromPotential] = useState<boolean>(false);
  const [draftSafetyHubPolygon, setDraftSafetyHubPolygon] = useState<Coordinate[] | null>(null);
  const [draftSafetyHubPoint, setDraftSafetyHubPoint] = useState<Coordinate | null>(null);
  const [draftEntranceCoord, setDraftEntranceCoord] = useState<Coordinate | null>(null);
  const [savedHubDraftForEntrance, setSavedHubDraftForEntrance] = useState<Partial<SafetyHub> | null>(null);

  // Operational Area Modal State
  const [isCreateAreaModalOpen, setIsCreateAreaModalOpen] = useState<boolean>(false);
  const [selectedHubForNewArea, setSelectedHubForNewArea] = useState<SafetyHub | null>(null);
  const [editingOperationalArea, setEditingOperationalArea] = useState<OperationalArea | null>(null);

  // Active Hazards / Blockages computed filters
  const activeHazardsList = useMemo(() => hazards.filter((h) => h.isActive !== false), [hazards]);
  const activeBlockedRoadsList = useMemo(() => blockedRoads.filter((b) => b.isActive !== false), [blockedRoads]);

  // ─── Main Route Calculation Pipeline (Auto-Calculates on endpoint / hazard / blockage changes) ───
  const handleCalculateRoute = useCallback(async () => {
    const origin = startOriginType === 'CURRENT_LOCATION' && liveLocationState.coordinate
      ? liveLocationState.coordinate
      : start;

    if (!origin || !destination) return;

    setIsLoading(true);
    try {
      const dec = await computeFullRoutingDecision(origin, destination, activeHazardsList, activeBlockedRoadsList);
      setDecision(dec);
    } catch (err) {
      console.error('Route calculation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [start, destination, startOriginType, liveLocationState.coordinate, activeHazardsList, activeBlockedRoadsList]);

  // Reactive automatic route recalculation
  useEffect(() => {
    const origin = startOriginType === 'CURRENT_LOCATION' && liveLocationState.coordinate
      ? liveLocationState.coordinate
      : start;

    if (!origin || !destination) return;

    let isCancelled = false;
    setIsLoading(true);

    computeFullRoutingDecision(origin, destination, activeHazardsList, activeBlockedRoadsList)
      .then((dec) => {
        if (!isCancelled) {
          setDecision(dec);
        }
      })
      .catch((err) => {
        console.error('Route calculation error:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [start, destination, startOriginType, liveLocationState.coordinate, activeHazardsList, activeBlockedRoadsList]);

  // ─── Responder Mission Navigation ─────────────────────────────────────────
  const handleNavigateToMission = useCallback(async (mission: Mission) => {
    const responder = responders.find((r) => r.id === mission.responderId);
    const hasLiveGps = liveLocationStateRef.current.status === 'ACTIVE' && Boolean(liveLocationStateRef.current.coordinate);
    const origin = hasLiveGps
      ? liveLocationStateRef.current.coordinate!
      : responder
      ? responder.currentGpsPosition
      : mission.startLocation;
    const dest = mission.destination;

    console.log('[NAV] mission navigation started:', { origin, destination: dest, usingLiveGps: hasLiveGps });

    setStart(origin);
    setDestination(dest);
    setStartSource(hasLiveGps ? 'gps' : 'manual');
    setStartOriginType(hasLiveGps ? 'CURRENT_LOCATION' : 'MAP_POINT');

    setIsLoading(true);
    try {
      const dec = await computeFullRoutingDecision(origin, dest, activeHazardsList, activeBlockedRoadsList);
      setDecision(dec);
    } catch (err) {
      console.error('Mission navigation routing error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [responders, activeHazardsList, activeBlockedRoadsList]);

  // ─── Citizen SOS Trigger ──────────────────────────────────────────────────
  const handleCitizenTriggerSos = useCallback((notes: string, type: IncidentType) => {
    const coord: Coordinate = liveLocationState.coordinate
      ? liveLocationState.coordinate
      : start
      ? start
      : citizenProfile.coordinate
      ? citizenProfile.coordinate
      : [76.7750, 30.7350];

    const { incident: newSos } = createIncident(
      {
        citizenId: citizenProfile.id,
        citizenName: citizenProfile.name,
        citizenPhone: citizenProfile.phone,
        coordinate: coord,
        type,
        severity: 'CRITICAL',
        source: 'CITIZEN_SOS',
        notes,
      },
      incidents
    );

    if (newSos) {
      setIncidents((prev) => [newSos, ...prev]);
      setSelectedIncidentIdForReview(newSos.id);
    }
  }, [citizenProfile, liveLocationState.coordinate, start, incidents]);

  // ─── Coordinator Dispatch ─────────────────────────────────────────────────
  const handleCoordinatorDispatch = useCallback((incidentId: string, responderId: string, notes?: string) => {
    const inc = incidents.find((i) => i.id === incidentId);
    const resp = responders.find((r) => r.id === responderId);
    if (!inc || !resp) return;

    const dispatchResult = executeDispatch(inc, resp, missions, notes);
    setMissions((prev) => [dispatchResult.mission, ...prev]);
    setIncidents((prev) => prev.map((i) => (i.id === dispatchResult.updatedIncident.id ? dispatchResult.updatedIncident : i)));
    setResponders((prev) => prev.map((r) => (r.id === dispatchResult.updatedResponder.id ? dispatchResult.updatedResponder : r)));
    setActiveResponderId(resp.id);
  }, [incidents, responders, missions]);

  // ─── Responder Mission State Transitions ──────────────────────────────────
  const handleResponderAcceptMission = useCallback((missionId: string) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    const res = transitionMissionState(
      mission,
      'ACCEPTED',
      incidents.find((i) => i.id === mission.incidentId),
      responders.find((r) => r.id === mission.responderId)
    );
    if (res.result) {
      setMissions((prev) => prev.map((m) => (m.id === missionId ? res.result!.mission : m)));
      if (res.result.updatedIncident) {
        setIncidents((prev) => prev.map((i) => (i.id === res.result!.updatedIncident!.id ? res.result!.updatedIncident! : i)));
      }
    }
  }, [missions, incidents, responders]);

  const handleResponderStartEnRoute = useCallback((missionId: string) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    const res = transitionMissionState(
      mission,
      'EN_ROUTE',
      incidents.find((i) => i.id === mission.incidentId),
      responders.find((r) => r.id === mission.responderId)
    );
    if (res.result) {
      setMissions((prev) => prev.map((m) => (m.id === missionId ? res.result!.mission : m)));
      if (res.result.updatedResponder) {
        setResponders((prev) => prev.map((r) => (r.id === res.result!.updatedResponder!.id ? res.result!.updatedResponder! : r)));
      }
    }
  }, [missions, incidents, responders]);

  const handleResponderMarkArrived = useCallback((missionId: string) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    const res = transitionMissionState(
      mission,
      'ARRIVED',
      incidents.find((i) => i.id === mission.incidentId),
      responders.find((r) => r.id === mission.responderId)
    );
    if (res.result) {
      setMissions((prev) => prev.map((m) => (m.id === missionId ? res.result!.mission : m)));
      if (res.result.updatedIncident) {
        setIncidents((prev) => prev.map((i) => (i.id === res.result!.updatedIncident!.id ? res.result!.updatedIncident! : i)));
      }
      if (res.result.updatedResponder) {
        setResponders((prev) => prev.map((r) => (r.id === res.result!.updatedResponder!.id ? res.result!.updatedResponder! : r)));
      }
    }
  }, [missions, incidents, responders]);

  const handleResponderResolveMission = useCallback((missionId: string) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;
    const res = transitionMissionState(
      mission,
      'RESOLVED',
      incidents.find((i) => i.id === mission.incidentId),
      responders.find((r) => r.id === mission.responderId)
    );
    if (res.result) {
      setMissions((prev) => prev.map((m) => (m.id === missionId ? res.result!.mission : m)));
      if (res.result.updatedIncident) {
        setIncidents((prev) => prev.map((i) => (i.id === res.result!.updatedIncident!.id ? res.result!.updatedIncident! : i)));
      }
      if (res.result.updatedResponder) {
        setResponders((prev) => prev.map((r) => (r.id === res.result!.updatedResponder!.id ? res.result!.updatedResponder! : r)));
      }
    }
  }, [missions, incidents, responders]);

  // ─── Step Simulation & Rerouting Handlers ─────────────────────────────────
  const handleSimulateGpsStep = useCallback(() => {
    const route = decision.selectedRoute;
    if (!route || route.coordinates.length < 2) return;
    const currentProgress = navEvaluation?.maxProgressMeters || 0;
    const nextProgress = currentProgress + 250;
    const nextPoint = getPointAtDistanceAlongRoad(
      { id: 'temp-road', name: 'Active Route', geometry: { type: 'LineString', coordinates: route.coordinates } },
      nextProgress
    );
    if (nextPoint && nextPoint.snappedCoord) {
      setLiveLocationState({
        status: 'ACTIVE',
        coordinate: nextPoint.snappedCoord,
        accuracyMeters: 5,
        headingDegrees: 90,
        speedMps: 4.5,
        timestamp: Date.now(),
        watchId: null,
        errorMessage: null,
        isFollowMe: false,
      });
    }
  }, [decision.selectedRoute, navEvaluation]);

  const handleSimulateGpsDeviate = useCallback(() => {
    const route = decision.selectedRoute;
    if (!route || route.coordinates.length < 2) return;
    const midPoint = route.coordinates[Math.floor(route.coordinates.length / 2)];
    const deviated: Coordinate = [midPoint[0] + 0.008, midPoint[1] + 0.008];
    setLiveLocationState({
      status: 'ACTIVE',
      coordinate: deviated,
      accuracyMeters: 5,
      headingDegrees: 45,
      speedMps: 3.5,
      timestamp: Date.now(),
      watchId: null,
      errorMessage: null,
      isFollowMe: false,
    });
  }, [decision.selectedRoute]);

  const handleSimulateGpsArrive = useCallback(() => {
    const route = decision.selectedRoute;
    if (!route || route.coordinates.length < 2) return;
    const lastPoint = route.coordinates[route.coordinates.length - 1];
    setLiveLocationState({
      status: 'ACTIVE',
      coordinate: lastPoint,
      accuracyMeters: 3,
      headingDegrees: 0,
      speedMps: 0,
      timestamp: Date.now(),
      watchId: null,
      errorMessage: null,
      isFollowMe: false,
    });
  }, [decision.selectedRoute]);

  const handleToggleSimulateWalk = useCallback(() => {
    if (isSimulatingWalk) {
      if (simWalkIntervalRef.current) clearInterval(simWalkIntervalRef.current);
      setIsSimulatingWalk(false);
    } else {
      setIsSimulatingWalk(true);
      simWalkIntervalRef.current = window.setInterval(() => {
        handleSimulateGpsStep();
      }, 1500);
    }
  }, [isSimulatingWalk, handleSimulateGpsStep]);

  const handleRerouteFromGps = useCallback(() => {
    if (liveLocationState.coordinate) {
      setStart(liveLocationState.coordinate);
      handleCalculateRoute();
    }
  }, [liveLocationState.coordinate, handleCalculateRoute]);

  // ─── Safety Hub Selection & Auto Find ─────────────────────────────────────
  const handleSelectSafetyHub = useCallback((hub: SafetyHub) => {
    const dest = hub.entranceCoordinate || hub.coordinate;
    setDestination(dest);
  }, []);

  const handleFindBestSafeHub = useCallback(async () => {
    const origin = startOriginType === 'CURRENT_LOCATION' && liveLocationState.coordinate
      ? liveLocationState.coordinate
      : start || [76.7794, 30.7333];

    const result = await findBestSafeSafetyHub(origin, safetyHubs, activeHazardsList, activeBlockedRoadsList);
    if (result && result.selectedHub) {
      handleSelectSafetyHub(result.selectedHub);
    }
  }, [startOriginType, liveLocationState.coordinate, start, safetyHubs, activeHazardsList, activeBlockedRoadsList, handleSelectSafetyHub]);

  // ─── Preset Selection ─────────────────────────────────────────────────────
  const handleSelectPreset = useCallback((preset: TestPreset) => {
    setStart(preset.start);
    setDestination(preset.destination);
    setStartSource('manual');
    setStartOriginType('MAP_POINT');
    console.log('[GPS] manual A override');
  }, []);

  // ─── Map Interaction Mode Handlers ────────────────────────────────────────
  const handleSetInteractionMode = useCallback((mode: MapInteractionMode) => {
    setInteractionMode(mode);
    if (mode === 'PLACE_START' || mode === 'PLACE_DESTINATION') {
      setCoordinatorMode('none');
    }
  }, []);

  const handleMapClick = useCallback((coord: Coordinate) => {
    if (interactionMode === 'PLACE_START') {
      setStart(coord);
      setStartSource('manual');
      setStartOriginType('MAP_POINT');
      console.log('[GPS] manual A override');
      setInteractionMode('EXPLORE');
    } else if (interactionMode === 'PLACE_DESTINATION') {
      setDestination(coord);
      setInteractionMode('EXPLORE');
    } else if (
      coordinatorMode === 'draw_hazard' ||
      coordinatorMode === 'draw_danger_zone' ||
      coordinatorMode === 'draw_safety_hub' ||
      coordinatorMode === 'draw_operational_area' ||
      interactionMode === 'HAZARD_AREA' ||
      interactionMode === 'DANGER_AREA' ||
      interactionMode === 'SAFETY_HUB_AREA' ||
      interactionMode === 'FACILITY_AREA'
    ) {
      setDrawingPoints((prev) => [...prev, coord]);
    } else if (coordinatorMode === 'place_safety_hub_point' || interactionMode === 'SAFETY_HUB_POINT') {
      setDraftSafetyHubPoint(coord);
      setDraftSafetyHubPolygon(null);
      setDraftEntranceCoord(null);
      setHubToConfigure(null);
      setIsConfiguringNewFromPotential(true);
      setCoordinatorMode('none');
      setInteractionMode('EXPLORE');
    } else if (coordinatorMode === 'set_safety_hub_entrance' || interactionMode === 'SAFETY_HUB_ENTRANCE') {
      setDraftEntranceCoord(coord);
      if (savedHubDraftForEntrance) {
        setHubToConfigure({
          ...savedHubDraftForEntrance,
          entranceCoordinate: coord,
        } as SafetyHub);
        setIsConfiguringNewFromPotential(true);
        setSavedHubDraftForEntrance(null);
      }
      setCoordinatorMode('none');
      setInteractionMode('EXPLORE');
    }
  }, [interactionMode, coordinatorMode, savedHubDraftForEntrance]);

  // ─── Coordinator Tools Handlers ───────────────────────────────────────────
  const handleSetCoordinatorMode = useCallback((mode: CoordinatorMode) => {
    setCoordinatorMode(mode);
    setDrawingPoints([]);
    if (mode === 'draw_hazard') {
      setInteractionMode('HAZARD_AREA');
    } else if (mode === 'draw_danger_zone') {
      setInteractionMode('DANGER_AREA');
    } else if (mode === 'draw_safety_hub') {
      setInteractionMode('SAFETY_HUB_AREA');
    } else if (mode === 'place_safety_hub_point') {
      setInteractionMode('SAFETY_HUB_POINT');
    } else if (mode === 'select_safety_hub_location') {
      setInteractionMode('SAFETY_HUB_FACILITY_PICK');
    } else if (mode === 'set_safety_hub_entrance') {
      setInteractionMode('SAFETY_HUB_ENTRANCE');
    } else if (mode === 'draw_operational_area') {
      setInteractionMode('FACILITY_AREA');
    } else if (mode === 'place_operational_area_point') {
      setInteractionMode('FACILITY_POINT');
    } else if (mode === 'select_road_to_block') {
      setInteractionMode('BLOCK_ROAD');
    } else if (mode === 'section_select_road' || mode === 'section_adjust_handles') {
      setInteractionMode('BLOCK_ROAD_SECTION');
    } else {
      setInteractionMode('EXPLORE');
    }
  }, []);

  const handleSelectRoadForSection = useCallback((road: OperationalRoad | null, clickedCoord: Coordinate) => {
    let targetRoad = road;
    if (!targetRoad) {
      const snappedNetwork = snapPointToRoadNetwork(clickedCoord);
      if (snappedNetwork) {
        targetRoad = snappedNetwork.road;
      }
    }
    if (!targetRoad) return;

    const snapped = snapPointToSpecificRoad(clickedCoord, targetRoad);
    const totalLength = getRoadTotalLengthMeters(targetRoad);
    const startDist = Math.max(0, snapped.cumulativeDistanceMeters - 120);
    const endDist = Math.min(totalLength, snapped.cumulativeDistanceMeters + 120);
    const extraction = extractRoadSectionFromHandles(targetRoad, startDist, endDist);

    setSelectedSectionRoad(targetRoad);
    setSectionStartDist(startDist);
    setSectionEndDist(endDist);

    if (extraction.success && extraction.coordinates && extraction.geometry) {
      setSectionDraft({
        roadId: targetRoad.id,
        roadName: targetRoad.name,
        geometry: extraction.geometry,
        coordinates: extraction.coordinates,
        lengthMeters: extraction.lengthMeters || Math.round(endDist - startDist),
        startPoint: extraction.startPoint || extraction.coordinates[0],
        endPoint: extraction.endPoint || extraction.coordinates[extraction.coordinates.length - 1],
      });
    }

    setCoordinatorMode('section_adjust_handles');
    setInteractionMode('BLOCK_ROAD_SECTION');
  }, []);

  const handleUpdateSectionHandleDistance = useCallback((handleType: 'start' | 'end', newDistanceMeters: number) => {
    if (!selectedSectionRoad) return;

    const newStart = handleType === 'start' ? newDistanceMeters : sectionStartDist;
    const newEnd = handleType === 'end' ? newDistanceMeters : sectionEndDist;

    setSectionStartDist(newStart);
    setSectionEndDist(newEnd);

    const extraction = extractRoadSectionFromHandles(selectedSectionRoad, newStart, newEnd);
    if (extraction.success && extraction.coordinates && extraction.geometry) {
      setSectionDraft({
        roadId: selectedSectionRoad.id,
        roadName: selectedSectionRoad.name,
        geometry: extraction.geometry,
        coordinates: extraction.coordinates,
        lengthMeters: extraction.lengthMeters || Math.round(Math.abs(newEnd - newStart)),
        startPoint: extraction.startPoint || extraction.coordinates[0],
        endPoint: extraction.endPoint || extraction.coordinates[extraction.coordinates.length - 1],
      });
    }
  }, [selectedSectionRoad, sectionStartDist, sectionEndDist]);

  const handleCompleteDrawing = useCallback(() => {
    if (drawingPoints.length < 3) return;
    if (coordinatorMode === 'draw_hazard' || interactionMode === 'HAZARD_AREA') {
      setPolygonToConfirm({
        type: 'hazard',
        points: drawingPoints,
      });
    } else if (coordinatorMode === 'draw_danger_zone' || interactionMode === 'DANGER_AREA') {
      setPolygonToConfirm({
        type: 'danger_zone',
        points: drawingPoints,
      });
    } else if (coordinatorMode === 'draw_safety_hub' || interactionMode === 'SAFETY_HUB_AREA') {
      const avgLng = drawingPoints.reduce((s, p) => s + p[0], 0) / drawingPoints.length;
      const avgLat = drawingPoints.reduce((s, p) => s + p[1], 0) / drawingPoints.length;
      const centroid: Coordinate = [Number(avgLng.toFixed(6)), Number(avgLat.toFixed(6))];

      setDraftSafetyHubPolygon(drawingPoints);
      setDraftSafetyHubPoint(centroid);
      setDraftEntranceCoord(null);
      setHubToConfigure(null);
      setIsConfiguringNewFromPotential(true);
    }
    setDrawingPoints([]);
    setCoordinatorMode('none');
    setInteractionMode('EXPLORE');
  }, [drawingPoints, coordinatorMode, interactionMode]);

  const handleCancelDrawing = useCallback(() => {
    if (coordinatorMode === 'set_safety_hub_entrance' && savedHubDraftForEntrance) {
      setHubToConfigure(savedHubDraftForEntrance as SafetyHub);
      setIsConfiguringNewFromPotential(true);
      setSavedHubDraftForEntrance(null);
    }
    setDrawingPoints([]);
    setCoordinatorMode('none');
    setInteractionMode('EXPLORE');
  }, [coordinatorMode, savedHubDraftForEntrance]);

  const handleUndoDrawingPoint = useCallback(() => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirmPolygon = useCallback((hazard: HazardZone) => {
    setHazards((prev) => [hazard, ...prev]);
    setPolygonToConfirm(null);
  }, []);

  const handleConfirmBlockRoad = useCallback((road: BlockedRoad) => {
    setBlockedRoads((prev) => [road, ...prev]);
    setRoadToConfirm(null);
  }, []);

  const handleConfirmBlockSection = useCallback((road: BlockedRoad) => {
    setBlockedRoads((prev) => [road, ...prev]);
    setIsConfirmSectionModalOpen(false);
    setSelectedSectionRoad(null);
    setSectionDraft(null);
    setCoordinatorMode('none');
    setInteractionMode('EXPLORE');
  }, []);

  // Safety Hub Creation Handlers
  const handleSelectHubCreationChoice = useCallback((choice: 'select_facility' | 'draw_area' | 'mark_point') => {
    setIsCreateHubChoiceOpen(false);
    if (choice === 'select_facility') {
      handleSetCoordinatorMode('select_safety_hub_location');
    } else if (choice === 'draw_area') {
      handleSetCoordinatorMode('draw_safety_hub');
    } else if (choice === 'mark_point') {
      handleSetCoordinatorMode('place_safety_hub_point');
    }
  }, [handleSetCoordinatorMode]);

  const handleSaveSafetyHub = useCallback((savedHub: SafetyHub) => {
    setSafetyHubs((prev) => {
      const exists = prev.some((h) => h.id === savedHub.id);
      if (exists) {
        return prev.map((h) => (h.id === savedHub.id ? savedHub : h));
      }
      return [savedHub, ...prev];
    });
    setHubToConfigure(null);
    setIsConfiguringNewFromPotential(false);
    setDraftSafetyHubPolygon(null);
    setDraftSafetyHubPoint(null);
    setDraftEntranceCoord(null);
    setSavedHubDraftForEntrance(null);
  }, []);

  // Operational Area Handlers
  const handleSaveOperationalArea = useCallback((area: OperationalArea) => {
    setOperationalAreas((prev) => {
      const exists = prev.some((a) => a.id === area.id);
      if (exists) {
        return prev.map((a) => (a.id === area.id ? area : a));
      }
      return [area, ...prev];
    });
    setEditingOperationalArea(null);
  }, []);

  const handleDeleteOperationalArea = useCallback((areaId: string) => {
    setOperationalAreas((prev) => prev.filter((a) => a.id !== areaId));
    setEditingOperationalArea(null);
  }, []);

  return (
    <div className="rme-app-root" id="rme-application-container">
      {/* ─── Top Role Switcher Header ────────────────────────────────────────── */}
      <RoleNavHeader
        activeRole={userRole}
        onSelectRole={setUserRole}
        incidents={incidents}
        missions={missions}
        isDeveloperMode={isDeveloperMode}
        onToggleDeveloperMode={() => setIsDeveloperMode((v) => !v)}
      />

      {/* ─── Main Unified Workspace (Controls + Map) ─────────────────────────── */}
      <main className="rme-main-layout">
        {/* Role-Specific Non-Overlapping Control Dock */}
        <RoleControlPanel
          userRole={userRole}
          start={start}
          destination={destination}
          startSource={startSource}
          onUseGpsAsStart={handleUseGpsAsStart}
          startOriginType={startOriginType}
          onSetStartOriginType={setStartOriginType}
          interactionMode={interactionMode}
          onSetInteractionMode={handleSetInteractionMode}
          onClearStart={() => {
            setStart(null);
            setStartSource('manual');
            setStartOriginType('MAP_POINT');
          }}
          onClearDestination={() => setDestination(null)}
          onCalculateRoute={handleCalculateRoute}
          onResetRoute={() => {
            setStart(null);
            setDestination(null);
            setStartSource('manual');
            setStartOriginType('MAP_POINT');
          }}
          isLoading={isLoading}
          decision={decision}
          navEvaluation={navEvaluation}
          presets={TEST_PRESETS}
          onSelectPreset={handleSelectPreset}
          safetyHubs={safetyHubs}
          onSelectSafetyHub={handleSelectSafetyHub}
          onFindBestSafeHub={handleFindBestSafeHub}
          visibleLayers={visibleLayers}
          onToggleLayer={handleToggleLayer}
          liveLocationState={liveLocationState}
          onToggleLiveLocation={handleToggleLiveLocation}
          onRecenterGps={handleRecenterGps}
          onSimulateGpsStep={handleSimulateGpsStep}
          onSimulateGpsDeviate={handleSimulateGpsDeviate}
          onSimulateGpsArrive={handleSimulateGpsArrive}
          onRerouteFromGps={handleRerouteFromGps}
          isSimulatingWalk={isSimulatingWalk}
          onToggleSimulateWalk={handleToggleSimulateWalk}
          citizenProfile={citizenProfile}
          onTriggerSos={handleCitizenTriggerSos}
          coordinatorMode={coordinatorMode}
          onSetCoordinatorMode={handleSetCoordinatorMode}
          onOpenCreateHubChoice={() => setIsCreateHubChoiceOpen(true)}
          onOpenManageDrawer={() => setIsManageDrawerOpen(true)}
          drawingPointsCount={drawingPoints.length}
          onUndoDrawingPoint={handleUndoDrawingPoint}
          onCompleteDrawing={handleCompleteDrawing}
          onCancelDrawing={handleCancelDrawing}
          onOpenConfirmSectionModal={() => setIsConfirmSectionModalOpen(true)}
          incidents={incidents}
          responders={responders}
          missions={missions}
          selectedIncidentId={selectedIncidentIdForReview}
          onSelectIncident={setSelectedIncidentIdForReview}
          onDispatchResponder={handleCoordinatorDispatch}
          activeResponderId={activeResponderId}
          onSelectResponder={setActiveResponderId}
          onAcceptMission={handleResponderAcceptMission}
          onStartEnRoute={handleResponderStartEnRoute}
          onMarkArrived={handleResponderMarkArrived}
          onResolveMission={handleResponderResolveMission}
          onNavigateToMission={handleNavigateToMission}
          isDeveloperMode={isDeveloperMode}
        />

        {/* Primary Map Instance (Always Mounted, Zero Remounts) */}
        <div className="rme-map-viewport">
          <RoutingMap
            start={start}
            destination={destination}
            routeResult={decision.selectedRoute}
            assessment={decision.finalSafety}
            selectionResult={{
              candidates: decision.allCandidates,
              selectedRoute: decision.selectedRoute,
              safeCandidatesCount: decision.safeCandidatesCount,
              moderateRiskCandidatesCount: decision.moderateRiskCandidatesCount,
              highRiskCandidatesCount: decision.highRiskCandidatesCount,
              rejectedCandidatesCount: decision.rejectedCandidatesCount,
              reasonCode: decision.reasonCode,
              explanation: decision.explanation,
              saferDespiteLonger: decision.saferDespiteLonger,
              isSyntheticFixture: decision.isSyntheticFixture,
            }}
            decision={decision}
            remainingRouteCoords={remainingRouteCoords}
            onMapClick={handleMapClick}
            interactionMode={interactionMode}
            isDeveloperMode={isDeveloperMode}
            hazards={hazards}
            blockedRoads={blockedRoads}
            safetyHubs={safetyHubs}
            operationalAreas={operationalAreas}
            incidents={incidents}
            responders={responders}
            visibleLayers={visibleLayers}
            onSelectIncident={(inc) => setSelectedIncidentIdForReview(inc.id)}
            onSelectResponder={(resp) => setActiveResponderId(resp.id)}
            coordinatorMode={coordinatorMode}
            drawingPoints={drawingPoints}
            onSelectRoadToBlock={(road) => setRoadToConfirm(road)}
            focusedFeatureCoords={focusedFeatureCoords}
            selectedRoad={selectedSectionRoad}
            sectionStartCoord={
              selectedSectionRoad
                ? getPointAtDistanceAlongRoad(selectedSectionRoad, sectionStartDist).snappedCoord
                : null
            }
            sectionEndCoord={
              selectedSectionRoad
                ? getPointAtDistanceAlongRoad(selectedSectionRoad, sectionEndDist).snappedCoord
                : null
            }
            sectionPreviewCoords={sectionDraft?.coordinates || null}
            onSelectRoadForSection={handleSelectRoadForSection}
            onUpdateSectionHandleDistance={handleUpdateSectionHandleDistance}
            onSelectSafetyHubDestination={handleSelectSafetyHub}
            onSelectPotentialSafetyHub={(potential) => setPotentialHubToVerify(potential)}
            onOpenAddOperationalAreaForHub={(hub) => {
              setSelectedHubForNewArea(hub);
              setIsCreateAreaModalOpen(true);
            }}
            onEditOperationalArea={(area) => setEditingOperationalArea(area)}
            onSavePlacedOperationalAreaPoint={(coord) => {
              if (selectedHubForNewArea) {
                const newArea: OperationalArea = {
                  id: `AREA-${Date.now()}`,
                  hubId: selectedHubForNewArea.id,
                  hubName: selectedHubForNewArea.name,
                  name: `${selectedHubForNewArea.name} Facility`,
                  type: 'FOOD_DISTRIBUTION',
                  format: 'POINT',
                  status: 'ACTIVE',
                  coordinate: coord,
                  description: 'Placed operational area facility',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                handleSaveOperationalArea(newArea);
              }
              setCoordinatorMode('none');
              setInteractionMode('EXPLORE');
            }}
            liveLocationState={liveLocationState}
            onDisableFollowMe={handleDisableFollowMe}
            recenterTrigger={recenterTrigger}
            onPointDragStart={() => {}}
            onPointDragging={() => {}}
            onPointDragEnd={(pointType, coord) => {
              if (pointType === 'start') {
                setStart(coord);
                setStartSource('manual');
                setStartOriginType('MAP_POINT');
                console.log('[GPS] manual A override');
              }
              if (pointType === 'destination') {
                setDestination(coord);
              }
            }}
            isSnapToRoadEnabled={isSnapToRoadEnabled}
            isRoutePointsLocked={isRoutePointsLocked}
            fitRouteTrigger={fitRouteTrigger}
            draftSafetyHubPoint={draftSafetyHubPoint}
            draftSafetyHubPolygon={draftSafetyHubPolygon}
            draftEntranceCoord={draftEntranceCoord}
          />
        </div>
      </main>

      {/* ─── Coordinator Operational Modals & Drawers ────────────────────────── */}
      {polygonToConfirm && (
        <ConfirmPolygonModal
          type={polygonToConfirm.type}
          points={polygonToConfirm.points}
          onConfirm={handleConfirmPolygon}
          onCancel={() => setPolygonToConfirm(null)}
        />
      )}

      {roadToConfirm && (
        <ConfirmBlockRoadModal
          road={roadToConfirm}
          onConfirm={handleConfirmBlockRoad}
          onCancel={() => setRoadToConfirm(null)}
        />
      )}

      {isConfirmSectionModalOpen && sectionDraft && (
        <ConfirmBlockRoadSectionModal
          section={sectionDraft}
          onConfirm={handleConfirmBlockSection}
          onCancel={() => setIsConfirmSectionModalOpen(false)}
        />
      )}

      {isCreateHubChoiceOpen && (
        <CreateSafetyHubChoiceModal
          onSelectChoice={handleSelectHubCreationChoice}
          onCancel={() => setIsCreateHubChoiceOpen(false)}
        />
      )}

      {potentialHubToVerify && (
        <PotentialSafetyHubModal
          potentialHub={potentialHubToVerify}
          onProceedToConfig={() => {
            setHubToConfigure({
              id: `HUB-${Date.now()}`,
              name: potentialHubToVerify.name,
              siteType: potentialHubToVerify.siteType,
              coordinate: potentialHubToVerify.coordinate,
              polygonCoordinates: potentialHubToVerify.polygonCoordinates,
              address: potentialHubToVerify.address || 'Identified Public Facility',
              description: 'Verified emergency civil shelter and relief hub.',
              verificationStatus: 'VERIFIED',
              isActive: true,
              status: 'OPEN',
              totalCapacity: 500,
              currentOccupancy: 0,
              availableCapacity: 500,
              nearCapacityThresholdRatio: 0.15,
              capabilities: {
                tents: { enabled: true, tentUnits: 20, peoplePerTent: 8, tentCapacity: 160 },
                foodDistribution: { enabled: true, mealsPerCycle: 500, serviceStatus: 'ACTIVE' },
                drinkingWater: { enabled: true, availableLiters: 3000, requirementLiters: 1000 },
                medicalFirstAid: { enabled: true, staffCount: 3, hasAmbulanceBay: true },
                sanitationToilets: { enabled: true, toiletUnits: 10 },
                powerCharging: { enabled: true, generatorBackup: true },
                registrationHelpDesk: { enabled: true },
                specialNeedsSupport: { enabled: true },
              },
              resources: [],
              requirements: [],
              disasterSuitability: ['Flood', 'Earthquake', 'Civil Emergency'],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            setPotentialHubToVerify(null);
          }}
          onProceedToDrawArea={() => {
            setDraftSafetyHubPoint(potentialHubToVerify.coordinate);
            handleSetCoordinatorMode('draw_safety_hub');
            setPotentialHubToVerify(null);
          }}
          onCancel={() => setPotentialHubToVerify(null)}
        />
      )}

      {(hubToConfigure || isConfiguringNewFromPotential) && (
        <ConfigureSafetyHubModal
          initialHub={hubToConfigure}
          potentialHub={potentialHubToVerify}
          draftPolygon={draftSafetyHubPolygon}
          pointCoord={draftSafetyHubPoint}
          entranceCoord={draftEntranceCoord}
          existingHubs={safetyHubs}
          onSetEntranceOnMap={(currentDraft) => {
            setSavedHubDraftForEntrance(currentDraft);
            setHubToConfigure(null);
            setIsConfiguringNewFromPotential(false);
            handleSetCoordinatorMode('set_safety_hub_entrance');
          }}
          onClearEntrance={() => setDraftEntranceCoord(null)}
          onSave={handleSaveSafetyHub}
          onCancel={() => {
            setHubToConfigure(null);
            setIsConfiguringNewFromPotential(false);
            setDraftSafetyHubPolygon(null);
            setDraftSafetyHubPoint(null);
            setDraftEntranceCoord(null);
            setSavedHubDraftForEntrance(null);
          }}
        />
      )}

      {isCreateAreaModalOpen && (
        <CreateOperationalAreaModal
          safetyHubs={safetyHubs}
          preselectedHubId={selectedHubForNewArea?.id}
          onProceedToMapPlacement={(draft) => {
            setIsCreateAreaModalOpen(false);
            if (draft.format === 'POLYGON') {
              handleSetCoordinatorMode('draw_operational_area');
            } else {
              handleSetCoordinatorMode('place_operational_area_point');
            }
          }}
          onCancel={() => setIsCreateAreaModalOpen(false)}
        />
      )}

      {editingOperationalArea && (
        <EditOperationalAreaModal
          area={editingOperationalArea}
          safetyHubs={safetyHubs}
          onSave={handleSaveOperationalArea}
          onDelete={handleDeleteOperationalArea}
          onCancel={() => setEditingOperationalArea(null)}
        />
      )}

      <CoordinatorManageDrawer
        isOpen={isManageDrawerOpen}
        onClose={() => setIsManageDrawerOpen(false)}
        hazards={hazards.filter((h) => !h.isDangerZone)}
        dangerZones={hazards.filter((h) => h.isDangerZone)}
        blockedRoads={blockedRoads}
        safetyHubs={safetyHubs}
        operationalAreas={operationalAreas}
        onToggleHazardActive={(id) =>
          setHazards((prev) => prev.map((h) => (h.id === id ? { ...h, isActive: h.isActive === false } : h)))
        }
        onDeleteHazard={(id) => setHazards((prev) => prev.filter((h) => h.id !== id))}
        onToggleBlockedRoadActive={(id) =>
          setBlockedRoads((prev) => prev.map((b) => (b.id === id ? { ...b, isActive: b.isActive === false } : b)))
        }
        onDeleteBlockedRoad={(id) => setBlockedRoads((prev) => prev.filter((b) => b.id !== id))}
        onToggleSafetyHubActive={(id) =>
          setSafetyHubs((prev) => prev.map((h) => (h.id === id ? { ...h, isActive: h.isActive === false } : h)))
        }
        onEditSafetyHub={(hub) => setHubToConfigure(hub)}
        onDeleteSafetyHub={(id) => setSafetyHubs((prev) => prev.filter((h) => h.id !== id))}
        onAddSafetyHubFromMap={() => setIsCreateHubChoiceOpen(true)}
        onToggleOperationalAreaActive={(id) =>
          setOperationalAreas((prev) => prev.map((a) => (a.id === id ? { ...a, status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } : a)))
        }
        onEditOperationalArea={(area) => setEditingOperationalArea(area)}
        onDeleteOperationalArea={handleDeleteOperationalArea}
        onAddOperationalAreaForHub={(hub) => {
          setSelectedHubForNewArea(hub);
          setIsCreateAreaModalOpen(true);
        }}
        onResetToDefaults={() => {
          setHazards(HAZARD_ZONES);
          setBlockedRoads(BLOCKED_ROADS);
          setSafetyHubs(INITIAL_SAFETY_HUBS);
          setOperationalAreas(INITIAL_OPERATIONAL_AREAS);
          setIncidents(INITIAL_INCIDENTS);
          setResponders(INITIAL_RESPONDERS);
          setMissions(INITIAL_MISSIONS);
        }}
        onFocusFeature={(coords) => setFocusedFeatureCoords(coords)}
      />
    </div>
  );
}

export default App;
