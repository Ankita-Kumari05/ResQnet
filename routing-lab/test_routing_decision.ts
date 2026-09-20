import { buildRoutingDecision, createIdleRoutingDecision } from './src/services/routingDecisionService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { checkLineStringPolygonIntersection } from './src/services/geometryUtils';
import { getRouteThroughWaypoints } from './src/services/routingService';
import type { RouteCandidate } from './src/types/candidates';
import type { RouteSafetyAssessment } from './src/types/safety';
import type { Coordinate, RouteResult } from './src/types/routing';

console.log('====================================================');
console.log('PHASE 4 ACTIVE HAZARD AVOIDANCE & DETOUR SUITE');
console.log('12 COMPREHENSIVE INVARIANT & ROUTING TESTS');
console.log('====================================================\n');

function createCandidate(
  id: string,
  label: string,
  distanceKm: number,
  safetyStatus: 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED',
  highestHazardSeverity: 'NONE' | 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL',
  isDetour: boolean = false,
  blockedRoad: boolean = false
): RouteCandidate {
  const assessment: RouteSafetyAssessment = {
    routeFound: true,
    distanceKm,
    durationMinutes: Math.round(distanceKm * 2.5),
    safetyStatus,
    highestHazardSeverity,
    blockedRoad,
    hazardsChecked: 4,
    hazardsIntersected: safetyStatus === 'SAFE' ? 0 : 1,
    blockedRoadsChecked: 2,
    blockedRoadsIntersected: blockedRoad ? 1 : 0,
    hazardIntersections:
      safetyStatus !== 'SAFE' && highestHazardSeverity !== 'NONE'
        ? [
            {
              hazardId: `HZ-${highestHazardSeverity}`,
              hazardName: `${highestHazardSeverity} Zone`,
              severity: highestHazardSeverity === 'NONE' ? 'SAFE' : highestHazardSeverity,
              description: 'Test hazard',
              intersectionPointsCount: 2,
            },
          ]
        : [],
    blockedRoadIntersections: blockedRoad
      ? [
          {
            roadId: 'ROAD-BLOCK-01',
            roadName: 'Blocked Segment',
            reason: 'Road closure',
            intersectionPointsCount: 2,
          },
        ]
      : [],
    evaluatedAt: new Date().toISOString(),
  };

  return {
    id,
    label,
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    coordinates: [[0, 0], [1, 1]],
    distanceMeters: distanceKm * 1000,
    distanceKm,
    durationSeconds: distanceKm * 150,
    durationMinutes: Math.round(distanceKm * 2.5),
    safetyAssessment: assessment,
    isSelected: false,
    isDetour,
  };
}

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

// Sample hazard polygon: box from [0, 0] to [10, 10]
const sampleHazardPoly: Coordinate[][] = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
];

// ----------------------------------------------------
// TEST 1: Route clearly outside hazard -> SAFE
// ----------------------------------------------------
const routeOutsideCoords: Coordinate[] = [[-5, 15], [15, 15]];
const intersectOut = checkLineStringPolygonIntersection(routeOutsideCoords, sampleHazardPoly);
assert(!intersectOut.intersects, 'TEST 1: Route clearly outside hazard has 0 polygon intersections');

const routeOutside: RouteResult = {
  status: 'success',
  coordinates: routeOutsideCoords,
  distanceMeters: 2000,
  durationSeconds: 300,
  geometry: { type: 'LineString', coordinates: routeOutsideCoords },
};
const safetyOut = evaluateRouteSafety(routeOutside);
assert(safetyOut.safetyStatus === 'SAFE', 'TEST 1: evaluateRouteSafety reports SAFE for outside route');

// ----------------------------------------------------
// TEST 2: Route through hazard -> RISKY/UNSAFE
// ----------------------------------------------------
const routeThroughCoords: Coordinate[] = [[-5, 5], [15, 5]];
const intersectThrough = checkLineStringPolygonIntersection(routeThroughCoords, sampleHazardPoly);
assert(intersectThrough.intersects, 'TEST 2: Route through hazard detects geometric intersection');

// ----------------------------------------------------
// TEST 3: Single waypoint still intersects hazard -> REJECT
// ----------------------------------------------------
// A single waypoint north of center [5, 11] where route cuts back through corner
const singleWpRoute: RouteResult = {
  status: 'success',
  coordinates: [[-2, 2], [5, 11], [12, 2]], // from [5, 11] to [12, 2] crosses [10, 10]-[10, 0]
  distanceMeters: 3000,
  durationSeconds: 400,
  geometry: { type: 'LineString', coordinates: [[-2, 2], [5, 11], [12, 2]] },
};
const singleWpIntersect = checkLineStringPolygonIntersection(singleWpRoute.coordinates, sampleHazardPoly);
assert(singleWpIntersect.intersects, 'TEST 3: Single-waypoint route cutting through corner is rejected');

// ----------------------------------------------------
// TEST 4: Two-waypoint north bypass -> SAFE
// ----------------------------------------------------
// Two waypoints along north perimeter: [-2, 12] -> [12, 12]
const northBypassRoute: RouteResult = {
  status: 'success',
  coordinates: [[-2, 2], [-2, 12], [12, 12], [12, 2]],
  distanceMeters: 4000,
  durationSeconds: 500,
  geometry: { type: 'LineString', coordinates: [[-2, 2], [-2, 12], [12, 12], [12, 2]] },
};
const northBypassIntersect = checkLineStringPolygonIntersection(northBypassRoute.coordinates, sampleHazardPoly);
assert(!northBypassIntersect.intersects, 'TEST 4: Two-waypoint north bypass completely clears hazard (SAFE)');

// ----------------------------------------------------
// TEST 5: Two-waypoint south bypass -> SAFE
// ----------------------------------------------------
// Two waypoints along south perimeter: [-2, -2] -> [12, -2]
const southBypassRoute: RouteResult = {
  status: 'success',
  coordinates: [[-2, 2], [-2, -2], [12, -2], [12, 2]],
  distanceMeters: 4000,
  durationSeconds: 500,
  geometry: { type: 'LineString', coordinates: [[-2, 2], [-2, -2], [12, -2], [12, 2]] },
};
const southBypassIntersect = checkLineStringPolygonIntersection(southBypassRoute.coordinates, sampleHazardPoly);
assert(!southBypassIntersect.intersects, 'TEST 5: Two-waypoint south bypass completely clears hazard (SAFE)');

// ----------------------------------------------------
// TEST 6: Short risky vs longer safe -> SAFE wins
// ----------------------------------------------------
const shortRisky = createCandidate('init-1', 'Initial Short Route', 2.0, 'RISKY', 'HIGH', false);
const longerSafeDetour = createCandidate('detour-1', 'North Safe Detour', 3.8, 'SAFE', 'NONE', true);
const decision6 = buildRoutingDecision({
  start: [76.7794, 30.7333],
  destination: [76.7179, 30.7046],
  initialCandidates: [shortRisky],
  detourAttempts: 2,
  detourCandidates: [longerSafeDetour],
  isSyntheticFixture: false,
});
assert(decision6.routingMode === 'HAZARD_AVOIDING_DETOUR', 'TEST 6: routingMode === HAZARD_AVOIDING_DETOUR');
assert(decision6.selectedRoute?.id === 'detour-1', 'TEST 6: Longer safe detour selected over short risky');
assert(decision6.saferDespiteLonger === true, 'TEST 6: saferDespiteLonger flagged true');

// ----------------------------------------------------
// ----------------------------------------------------
// TEST 7: Critical hazard -> reject
// ----------------------------------------------------
const critInitial = createCandidate('init-crit', 'Initial Critical Chemical Hazard', 2.0, 'UNSAFE', 'CRITICAL', false);
const critDetour = createCandidate('detour-crit', 'Toxic Gas Corridor', 3.0, 'UNSAFE', 'CRITICAL', true);
const decision7 = buildRoutingDecision({
  start: [76.7794, 30.7333],
  destination: [76.7179, 30.7046],
  initialCandidates: [critInitial],
  detourAttempts: 1,
  detourCandidates: [critDetour],
  isSyntheticFixture: false,
});
assert(decision7.routingMode === 'NO_SAFE_ROUTE', 'TEST 7: Critical hazard detour rejected -> NO_SAFE_ROUTE');
assert(decision7.selectedRoute === null, 'TEST 7: selectedRoute is null');

// ----------------------------------------------------
// TEST 8: Blocked detour -> reject
// ----------------------------------------------------
const blockedInitial = createCandidate('init-blk', 'Initial Sinkhole Closure', 2.0, 'BLOCKED', 'NONE', false, true);
const blockedDetour = createCandidate('detour-blk', 'Sinkhole Road Closure', 3.2, 'BLOCKED', 'NONE', true, true);
const decision8 = buildRoutingDecision({
  start: [76.7794, 30.7333],
  destination: [76.7179, 30.7046],
  initialCandidates: [blockedInitial],
  detourAttempts: 1,
  detourCandidates: [blockedDetour],
  isSyntheticFixture: false,
});
assert(decision8.routingMode === 'NO_SAFE_ROUTE', 'TEST 8: Blocked road detour rejected -> NO_SAFE_ROUTE');
assert(decision8.selectedRoute === null, 'TEST 8: selectedRoute is null');

// ----------------------------------------------------
// TEST 9: Multiple hazards -> entire route evaluated
// ----------------------------------------------------
const multiHazardRoute: RouteResult = {
  status: 'success',
  coordinates: [
    [76.795, 30.695], // Enters HZ-MOD-01 (Tribune Chowk)
    [76.815, 30.715], // Enters HZ-HIGH-01 (Sukhna Choe)
    [76.700, 30.692], // Enters HZ-CRIT-01 (Mohali Phase 8B)
  ],
  distanceMeters: 4500,
  durationSeconds: 700,
  geometry: {
    type: 'LineString',
    coordinates: [
      [76.795, 30.695],
      [76.815, 30.715],
      [76.700, 30.692],
    ],
  },
};
const safetyMulti = evaluateRouteSafety(multiHazardRoute);
assert(safetyMulti.hazardsIntersected >= 2, 'TEST 9: Multiple hazard zones detected along route');
assert(safetyMulti.highestHazardSeverity === 'CRITICAL', 'TEST 9: Highest severity resolved to CRITICAL');
assert(safetyMulti.safetyStatus === 'UNSAFE', 'TEST 9: Overall safetyStatus correctly resolved to UNSAFE');

// ----------------------------------------------------
// TEST 10: No safe candidate -> NO_SAFE_ROUTE
// ----------------------------------------------------
const decision10 = buildRoutingDecision({
  start: [76.7794, 30.7333],
  destination: [76.7179, 30.7046],
  initialCandidates: [critInitial],
  detourAttempts: 4,
  detourCandidates: [critDetour, blockedDetour],
  isSyntheticFixture: false,
});
assert(decision10.routingMode === 'NO_SAFE_ROUTE', 'TEST 10: routingMode === NO_SAFE_ROUTE');
assert(decision10.status === 'NO_SAFE_ROUTE', 'TEST 10: decision status === NO_SAFE_ROUTE');
assert(decision10.selectedRoute === null, 'TEST 10: selectedRoute is null');
assert(decision10.safeDetoursCount === 0, 'TEST 10: safeDetoursCount === 0');

// ----------------------------------------------------
// TEST 11: Real OSRM waypoint route -> geometry returned
// ----------------------------------------------------
async function testOSRMReal() {
  const start: Coordinate = [76.7794, 30.7333]; // Sector 17, Chandigarh
  const waypoints: Coordinate[] = [[76.7600, 30.7250]]; // Sector 35, Chandigarh
  const dest: Coordinate = [76.7441, 30.7225]; // Sector 43 ISBT, Chandigarh
  const osrmRes = await getRouteThroughWaypoints(start, waypoints, dest);
  assert(osrmRes.status === 'success', 'TEST 11: OSRM waypoint query returns success');
  assert(osrmRes.coordinates.length > 10, 'TEST 11: Real road-following coordinates returned (>10 coords)');
  assert(osrmRes.distanceMeters > 1000, 'TEST 11: Real distance returned (>1 km)');

  const osrmSafety = evaluateRouteSafety(osrmRes);
  assert(osrmSafety.safetyStatus === 'SAFE', 'TEST 11: Real OSRM waypoint route is confirmed SAFE');
}

// ----------------------------------------------------
// TEST 12: New route after NO_SAFE_ROUTE -> old state cleared
// ----------------------------------------------------
const prevNoSafe = decision10;
assert(prevNoSafe.routingMode === 'NO_SAFE_ROUTE', 'TEST 12.1: Previous decision was NO_SAFE_ROUTE');

const idleReset = createIdleRoutingDecision([76.78, 30.73], [76.72, 30.70]);
assert(idleReset.status === 'IDLE', 'TEST 12.2: State cleanly reset to IDLE');
assert(idleReset.selectedRoute === null, 'TEST 12.3: Selected route reset to null');

const newSafeInitial = createCandidate('new-safe-1', 'Direct Safe Route', 1.8, 'SAFE', 'NONE', false);
const newDecision = buildRoutingDecision({
  start: [76.78, 30.73],
  destination: [76.72, 30.70],
  initialCandidates: [newSafeInitial],
  detourAttempts: 0,
  detourCandidates: [],
  isSyntheticFixture: false,
});
assert(newDecision.routingMode === 'NORMAL_ROUTE', 'TEST 12.4: New decision cleanly becomes NORMAL_ROUTE');
assert(newDecision.status === 'ROUTE_FOUND', 'TEST 12.5: Status is ROUTE_FOUND');
assert(newDecision.selectedRoute?.id === 'new-safe-1', 'TEST 12.6: Correct new safe route selected');

async function main() {
  await testOSRMReal();
  console.log('\n====================================================');
  console.log('ALL 12 DETOUR INVARIANT TESTS PASSED (12/12)');
  console.log('====================================================');
}

main();
