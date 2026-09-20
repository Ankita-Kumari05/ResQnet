import type { Coordinate } from '../types/routing';
import type { RouteCandidate } from '../types/candidates';
import type { RoutingDecision } from '../types/routingDecision';
import { selectSafestRoute } from './routeSelectionService';

/**
 * Creates an empty/idle routing decision (used on reset or before calculation).
 */
export function createIdleRoutingDecision(
  start: Coordinate | null = null,
  destination: Coordinate | null = null
): RoutingDecision {
  return {
    status: 'IDLE',
    routingMode: 'NO_SAFE_ROUTE',
    start,
    destination,
    initialRoute: null,
    initialSafety: null,
    hazardsIntersected: [],
    isInitialSafe: false,
    detourAttempts: 0,
    detourCandidates: [],
    safeDetoursCount: 0,
    allCandidates: [],
    safeCandidatesCount: 0,
    moderateRiskCandidatesCount: 0,
    highRiskCandidatesCount: 0,
    rejectedCandidatesCount: 0,
    selectedRoute: null,
    visualTier: 'NONE',
    finalSafety: null,
    reasonCode: 'NO_SAFE_ROUTE',
    explanation: 'Standby. Select Start (A) and Destination (B) points.',
    saferDespiteLonger: false,
    isSyntheticFixture: false,
  };
}

export interface BuildDecisionParams {
  start: Coordinate | null;
  destination: Coordinate | null;
  initialCandidates: RouteCandidate[];
  detourAttempts: number;
  detourCandidates: RouteCandidate[];
  isSyntheticFixture: boolean;
}

/**
 * Pure function: Canonical Route Decision Engine.
 *
 * Implements strict ResQnet decision hierarchy:
 *  1. If initial route is SAFE -> visualTier = 'SAFE' (BLUE)
 *  2. If detour or alternative is SAFE -> visualTier = 'SAFE' (BLUE)
 *  3. If no safe route, but moderate/low risk -> visualTier = 'LOWER_RISK' (GREEN)
 *  4. If only high-risk usable fallback -> visualTier = 'UNSAFE_FALLBACK' (PINK)
 *  5. If all blocked or critical -> visualTier = 'NONE', selectedRoute = null
 */
export function buildRoutingDecision({
  start,
  destination,
  initialCandidates,
  detourAttempts,
  detourCandidates,
  isSyntheticFixture,
}: BuildDecisionParams): RoutingDecision {
  if (!start || !destination || initialCandidates.length === 0) {
    return createIdleRoutingDecision(start, destination);
  }

  const primaryInitial = initialCandidates[0];
  const initialSafety = primaryInitial.safetyAssessment;
  const isInitialSafe =
    initialSafety.safetyStatus === 'SAFE' &&
    initialSafety.highestHazardSeverity === 'NONE' &&
    !initialSafety.blockedRoad;

  // =========================================================================
  // 1. SAFE INITIAL ROUTE
  // =========================================================================
  if (isInitialSafe) {
    const selected: RouteCandidate = {
      ...primaryInitial,
      isSelected: true,
      visualTier: 'SAFE',
    };

    return {
      status: 'ROUTE_FOUND',
      routingMode: 'NORMAL_ROUTE',
      start,
      destination,
      initialRoute: primaryInitial,
      initialSafety,
      hazardsIntersected: [],
      isInitialSafe: true,
      detourAttempts: 0,
      detourCandidates: [],
      safeDetoursCount: 0,
      allCandidates: [selected],
      safeCandidatesCount: 1,
      moderateRiskCandidatesCount: 0,
      highRiskCandidatesCount: 0,
      rejectedCandidatesCount: 0,
      selectedRoute: selected,
      visualTier: 'SAFE',
      finalSafety: initialSafety,
      reasonCode: initialCandidates.length === 1 ? 'ONLY_CANDIDATE_AVAILABLE' : 'SAFE_ROUTE_SHORTER',
      explanation: 'Direct road route is safe. No detour required.',
      saferDespiteLonger: false,
      isSyntheticFixture,
    };
  }

  // =========================================================================
  // 2. MULTI-CANDIDATE / DETOUR EVALUATION
  // =========================================================================
  const evaluatedInitials = initialCandidates.map((c) => ({
    ...c,
    isOriginalRisky: true,
  }));

  const allCandidates = [...evaluatedInitials, ...detourCandidates];
  const selection = selectSafestRoute(allCandidates, isSyntheticFixture);

  // A usable route was chosen (Safe = Blue, Lower-Risk = Green, Unsafe Fallback = Pink)
  if (selection.selectedRoute) {
    const isSafe = selection.selectedRoute.safetyAssessment.safetyStatus === 'SAFE';
    return {
      status: 'ROUTE_FOUND',
      routingMode: selection.selectedRoute.isDetour
        ? 'HAZARD_AVOIDING_DETOUR'
        : isSafe
        ? 'NORMAL_ROUTE'
        : 'HAZARD_AVOIDING_DETOUR',
      start,
      destination,
      initialRoute: primaryInitial,
      initialSafety,
      hazardsIntersected: initialSafety.hazardIntersections,
      isInitialSafe: false,
      detourAttempts,
      detourCandidates,
      safeDetoursCount: selection.safeCandidatesCount,
      allCandidates: selection.candidates,
      safeCandidatesCount: selection.safeCandidatesCount,
      moderateRiskCandidatesCount: selection.moderateRiskCandidatesCount,
      highRiskCandidatesCount: selection.highRiskCandidatesCount,
      rejectedCandidatesCount: selection.rejectedCandidatesCount,
      selectedRoute: selection.selectedRoute,
      visualTier: selection.visualTier || (isSafe ? 'SAFE' : 'LOWER_RISK'),
      finalSafety: selection.selectedRoute.safetyAssessment,
      reasonCode: selection.reasonCode,
      explanation: selection.explanation,
      saferDespiteLonger: selection.saferDespiteLonger,
      isSyntheticFixture,
    };
  }

  // =========================================================================
  // 3. NO USABLE ROUTE AVAILABLE
  // =========================================================================
  return {
    status: 'NO_SAFE_ROUTE',
    routingMode: 'NO_SAFE_ROUTE',
    start,
    destination,
    initialRoute: primaryInitial,
    initialSafety,
    hazardsIntersected: initialSafety.hazardIntersections,
    isInitialSafe: false,
    detourAttempts,
    detourCandidates,
    safeDetoursCount: 0,
    allCandidates: selection.candidates,
    safeCandidatesCount: 0,
    moderateRiskCandidatesCount: 0,
    highRiskCandidatesCount: selection.highRiskCandidatesCount,
    rejectedCandidatesCount: selection.rejectedCandidatesCount,
    selectedRoute: null,
    visualTier: 'NONE',
    finalSafety: selection.leastRiskCandidate?.safetyAssessment ?? initialSafety,
    reasonCode: 'NO_USABLE_ROUTE',
    explanation: 'No usable road route is currently available. All available corridors traverse critical hazard zones or physical road closures.',
    saferDespiteLonger: false,
    isSyntheticFixture,
  };
}

import type { Phase4Scenario } from '../types/detour';
import type { Phase3Scenario } from '../types/candidates';
import type { DecisionStatus, RoutingMode } from '../types/routingDecision';

/**
 * Builds canonical RoutingDecision from deterministic Phase 4 scenario fixtures.
 */
export function buildPhase4ScenarioDecision(scenario: Phase4Scenario): RoutingDecision {
  if (!scenario.initialRouteFixture || !scenario.detourFixtures) {
    return createIdleRoutingDecision(scenario.start, scenario.destination);
  }

  const initFix = scenario.initialRouteFixture;
  const initCandidate: RouteCandidate = {
    id: initFix.id,
    label: initFix.label,
    geometry: { type: 'LineString', coordinates: initFix.coordinates },
    coordinates: initFix.coordinates,
    distanceMeters: initFix.distanceKm * 1000,
    distanceKm: initFix.distanceKm,
    durationSeconds: initFix.durationMinutes * 60,
    durationMinutes: initFix.durationMinutes,
    safetyAssessment: {
      routeFound: true,
      distanceKm: initFix.distanceKm,
      durationMinutes: initFix.durationMinutes,
      safetyStatus: initFix.safetyStatus,
      highestHazardSeverity: initFix.highestHazardSeverity,
      blockedRoad: initFix.blockedRoad,
      hazardsChecked: 4,
      hazardsIntersected: initFix.safetyStatus === 'SAFE' ? 0 : 1,
      blockedRoadsChecked: 2,
      blockedRoadsIntersected: initFix.blockedRoad ? 1 : 0,
      hazardIntersections:
        initFix.safetyStatus !== 'SAFE' && !initFix.blockedRoad && initFix.highestHazardSeverity !== 'NONE'
          ? [
              {
                hazardId: initFix.intersectedHazards[0] || 'HZ-HIGH-01',
                hazardName: 'Garment District Structural Debris Zone',
                severity: initFix.highestHazardSeverity,
                description: 'Severe structural debris hazard zone.',
                intersectionPointsCount: 4,
              },
            ]
          : [],
      blockedRoadIntersections: initFix.blockedRoad
        ? [
            {
              roadId: 'ROAD-BLOCK-01',
              roadName: 'Physical Road Closure Segment',
              reason: 'Severe damage.',
              intersectionPointsCount: 2,
            },
          ]
        : [],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
    isOriginalRisky: initFix.safetyStatus !== 'SAFE',
  };

  const detourCandidates: RouteCandidate[] = scenario.detourFixtures.map((df) => ({
    id: df.id,
    label: df.label,
    geometry: { type: 'LineString', coordinates: df.coordinates },
    coordinates: df.coordinates,
    distanceMeters: df.distanceKm * 1000,
    distanceKm: df.distanceKm,
    durationSeconds: df.durationMinutes * 60,
    durationMinutes: df.durationMinutes,
    safetyAssessment: {
      routeFound: true,
      distanceKm: df.distanceKm,
      durationMinutes: df.durationMinutes,
      safetyStatus: df.safetyStatus,
      highestHazardSeverity: df.highestHazardSeverity,
      blockedRoad: df.blockedRoad,
      hazardsChecked: 4,
      hazardsIntersected: df.safetyStatus === 'SAFE' ? 0 : 1,
      blockedRoadsChecked: 2,
      blockedRoadsIntersected: df.blockedRoad ? 1 : 0,
      hazardIntersections:
        df.safetyStatus !== 'SAFE' && !df.blockedRoad && df.highestHazardSeverity !== 'NONE'
          ? [
              {
                hazardId: `HZ-${df.highestHazardSeverity}-DETOUR`,
                hazardName: `${df.highestHazardSeverity} Hazard on Detour`,
                severity: df.highestHazardSeverity,
                description: `Detour enters ${df.highestHazardSeverity} zone.`,
                intersectionPointsCount: 3,
              },
            ]
          : [],
      blockedRoadIntersections: df.blockedRoad
        ? [
            {
              roadId: 'ROAD-BLOCK-DETOUR',
              roadName: 'Sinkhole / Road Closure',
              reason: 'Road physically impassable.',
              intersectionPointsCount: 2,
            },
          ]
        : [],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
    isDetour: true,
    detourCorridor: df.label,
  }));

  return buildRoutingDecision({
    start: scenario.start,
    destination: scenario.destination,
    initialCandidates: [initCandidate],
    detourAttempts: detourCandidates.length,
    detourCandidates,
    isSyntheticFixture: true,
  });
}

/**
 * Builds canonical RoutingDecision from deterministic Phase 3 scenario fixtures.
 */
export function buildPhase3ScenarioDecision(scenario: Phase3Scenario): RoutingDecision {
  if (!scenario.candidateFixtures || scenario.candidateFixtures.length === 0) {
    return createIdleRoutingDecision(scenario.start, scenario.destination);
  }

  const candidates: RouteCandidate[] = scenario.candidateFixtures.map((f) => ({
    id: f.id,
    label: f.label,
    geometry: { type: 'LineString', coordinates: f.coordinates },
    coordinates: f.coordinates,
    distanceMeters: f.distanceKm * 1000,
    distanceKm: f.distanceKm,
    durationSeconds: f.durationMinutes * 60,
    durationMinutes: f.durationMinutes,
    safetyAssessment: {
      routeFound: true,
      distanceKm: f.distanceKm,
      durationMinutes: f.durationMinutes,
      safetyStatus: f.safetyStatus,
      highestHazardSeverity: f.highestHazardSeverity,
      blockedRoad: f.blockedRoad,
      hazardsChecked: 4,
      hazardsIntersected: f.safetyStatus === 'SAFE' ? 0 : 1,
      blockedRoadsChecked: 2,
      blockedRoadsIntersected: f.blockedRoad ? 1 : 0,
      hazardIntersections:
        f.safetyStatus !== 'SAFE' && !f.blockedRoad && f.highestHazardSeverity !== 'NONE'
          ? [
              {
                hazardId: `HZ-${f.highestHazardSeverity}-01`,
                hazardName: `${f.highestHazardSeverity} Hazard Corridor`,
                severity: f.highestHazardSeverity,
                description: `Corridor traversing ${f.highestHazardSeverity} hazard.`,
                intersectionPointsCount: 4,
              },
            ]
          : [],
      blockedRoadIntersections: f.blockedRoad
        ? [
            {
              roadId: 'ROAD-BLOCK-01',
              roadName: 'Physical Road Closure Segment',
              reason: 'Severe asphalt collapse.',
              intersectionPointsCount: 2,
            },
          ]
        : [],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
  }));

  const selection = selectSafestRoute(candidates, true);
  const primary = candidates[0];

  const routingMode: RoutingMode = selection.selectedRoute
    ? (selection.selectedRoute.isDetour
        ? 'HAZARD_AVOIDING_DETOUR'
        : selection.selectedRoute.safetyAssessment.safetyStatus === 'SAFE'
        ? 'NORMAL_ROUTE'
        : 'HAZARD_AVOIDING_DETOUR')
    : 'NO_SAFE_ROUTE';

  const status: DecisionStatus = selection.selectedRoute ? 'ROUTE_FOUND' : 'NO_SAFE_ROUTE';

  return {
    status,
    routingMode,
    start: scenario.start,
    destination: scenario.destination,
    initialRoute: primary,
    initialSafety: primary.safetyAssessment,
    hazardsIntersected: primary.safetyAssessment.hazardIntersections,
    isInitialSafe: primary.safetyAssessment.safetyStatus === 'SAFE',
    detourAttempts: 0,
    detourCandidates: [],
    safeDetoursCount: 0,
    allCandidates: selection.candidates,
    safeCandidatesCount: selection.safeCandidatesCount,
    moderateRiskCandidatesCount: selection.moderateRiskCandidatesCount,
    highRiskCandidatesCount: selection.highRiskCandidatesCount,
    rejectedCandidatesCount: selection.rejectedCandidatesCount,
    selectedRoute: selection.selectedRoute,
    visualTier: selection.visualTier || (selection.selectedRoute?.safetyAssessment.safetyStatus === 'SAFE' ? 'SAFE' : 'NONE'),
    finalSafety:
      selection.selectedRoute?.safetyAssessment ??
      selection.leastRiskCandidate?.safetyAssessment ??
      primary.safetyAssessment,
    reasonCode: selection.reasonCode,
    explanation: selection.explanation,
    saferDespiteLonger: selection.saferDespiteLonger,
    isSyntheticFixture: true,
  };
}
