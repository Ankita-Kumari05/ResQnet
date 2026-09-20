import { getRouteCandidates, getRouteThroughWaypoints } from './src/services/routingService';
import { generateSafeDetours } from './src/services/detourService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { buildRoutingDecision } from './src/services/routingDecisionService';
import type { Coordinate } from './src/types/routing';
import type { BlockedRoad } from './src/types/safety';

async function test() {
  console.log('--- STARTING DIAGNOSTIC ROUTING PIPELINE TEST ---');
  // Chandigarh Sector 17 -> Sector 43 ISBT
  const start: Coordinate = [76.7794, 30.7333];
  const dest: Coordinate = [76.7441, 30.7225];

  console.log('1. Querying OSRM for route candidates from', start, 'to', dest);
  const candidatesFetch = await getRouteCandidates(start, dest);
  console.log('OSRM candidate status:', candidatesFetch.status, 'Count:', candidatesFetch.routes.length);

  if (candidatesFetch.routes.length === 0) {
    console.error('No OSRM routes found!');
    return;
  }

  const primary = candidatesFetch.routes[0];
  console.log('Primary route length:', primary.distanceMeters, 'm, points count:', primary.coordinates.length);

  // Take a segment of the primary route (middle 10 points) as the blocked road
  const mid = Math.floor(primary.coordinates.length / 2);
  const blockedCoords = primary.coordinates.slice(mid - 3, mid + 3);
  console.log('Blocked coordinates:', blockedCoords);

  const blockedRoad: BlockedRoad = {
    id: 'TEST-BLOCKED-ROAD',
    name: 'Sector 35 Main Arterial Section Closure',
    status: 'BLOCKED',
    reason: 'Emergency testing closure',
    geometry: {
      type: 'LineString',
      coordinates: blockedCoords,
    },
    isActive: true,
  };

  // Evaluate primary safety
  const safety1 = evaluateRouteSafety(primary, [], [blockedRoad]);
  console.log('Primary route evaluation -> safetyStatus:', safety1.safetyStatus, 'blockedRoad:', safety1.blockedRoad);
  console.log('Blocked road intersections:', safety1.blockedRoadIntersections);

  // Generate detours
  console.log('2. Calling generateSafeDetours with blockedRoadIds: [TEST-BLOCKED-ROAD]');
  const detourRes = await generateSafeDetours(
    start,
    dest,
    { blockedRoadIds: ['TEST-BLOCKED-ROAD'] },
    [],
    [blockedRoad]
  );

  console.log('Detour result: attemptsCount =', detourRes.attemptsCount, 'detourCandidates count =', detourRes.detourCandidates.length);

  for (let i = 0; i < detourRes.detourCandidates.length; i++) {
    const dc = detourRes.detourCandidates[i];
    console.log(`Detour #${i + 1}: ${dc.label} | status: ${dc.safetyAssessment.safetyStatus} | blocked: ${dc.safetyAssessment.blockedRoad} | dist: ${dc.distanceKm} km | rejection: ${dc.rejectionReason || 'NONE'}`);
  }

  // Build decision
  const initialCandidates = candidatesFetch.routes.map((r, idx) => ({
    id: `candidate-${idx + 1}`,
    label: `Initial ${idx + 1}`,
    geometry: r.geometry,
    coordinates: r.coordinates,
    distanceMeters: r.distanceMeters,
    distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
    durationSeconds: r.durationSeconds,
    durationMinutes: Math.round(r.durationSeconds / 60),
    safetyAssessment: evaluateRouteSafety(r, [], [blockedRoad]),
    isSelected: false,
  }));

  const decision = buildRoutingDecision({
    start,
    destination: dest,
    initialCandidates,
    detourAttempts: detourRes.attemptsCount,
    detourCandidates: detourRes.detourCandidates,
    isSyntheticFixture: false,
  });

  console.log('=== FINAL DECISION ===');
  console.log('Status:', decision.status);
  console.log('Routing Mode:', decision.routingMode);
  console.log('Selected Route:', decision.selectedRoute?.label, decision.selectedRoute?.distanceKm, 'km');
  console.log('Visual Tier:', decision.visualTier);
  console.log('Reason Code:', decision.reasonCode);
  console.log('Explanation:', decision.explanation);

  console.log('\n--- TESTING CASE WHERE ALL INITIAL CANDIDATES ARE BLOCKED ---');
  const allBlockedInitials = candidatesFetch.routes.map((r, idx) => ({
    id: `candidate-${idx + 1}`,
    label: `Initial Candidate ${idx + 1}`,
    geometry: r.geometry,
    coordinates: r.coordinates,
    distanceMeters: r.distanceMeters,
    distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
    durationSeconds: r.durationSeconds,
    durationMinutes: Math.round(r.durationSeconds / 60),
    safetyAssessment: {
      routeFound: true,
      distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
      durationMinutes: Math.round(r.durationSeconds / 60),
      safetyStatus: 'BLOCKED' as const,
      highestHazardSeverity: 'NONE' as const,
      blockedRoad: true,
      hazardsChecked: 4,
      hazardsIntersected: 0,
      blockedRoadsChecked: 1,
      blockedRoadsIntersected: 1,
      hazardIntersections: [],
      blockedRoadIntersections: [
        { roadId: 'TEST-BLOCKED-ROAD', roadName: 'Sector 35 Main Arterial Section Closure', reason: 'Blocked', intersectionPointsCount: 15 },
      ],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
    rejectionReason: 'BLOCKED_ROAD (TEST-BLOCKED-ROAD)',
  }));

  const decisionDetourOnly = buildRoutingDecision({
    start,
    destination: dest,
    initialCandidates: allBlockedInitials,
    detourAttempts: detourRes.attemptsCount,
    detourCandidates: detourRes.detourCandidates,
    isSyntheticFixture: false,
  });

  console.log('=== DECISION WHEN ALL INITIALS ARE BLOCKED ===');
  console.log('Status:', decisionDetourOnly.status);
  console.log('Routing Mode:', decisionDetourOnly.routingMode);
  console.log('Selected Route:', decisionDetourOnly.selectedRoute?.label, decisionDetourOnly.selectedRoute?.distanceKm, 'km');
  console.log('Visual Tier:', decisionDetourOnly.visualTier);
  console.log('Reason Code:', decisionDetourOnly.reasonCode);
  console.log('Explanation:', decisionDetourOnly.explanation);
}

test().catch(console.error);
