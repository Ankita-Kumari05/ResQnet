import { buildRoutingDecision } from './src/services/routingDecisionService';
import { generateSafeDetours } from './src/services/detourService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { getRouteCandidates, getRouteThroughWaypoints } from './src/services/routingService';
import type { Coordinate } from './src/types/routing';
import type { RouteCandidate } from './src/types/candidates';
import type { BlockedRoad } from './src/types/safety';

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
  } else {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}

console.log('====================================================');
console.log('BLOCKED ROAD REROUTING & ALTERNATIVE CORRIDOR TESTS');
console.log('====================================================');

async function runTests() {
  // Test 1: Blocked Road hard constraint - Route 1 is blocked, Route 2 (Alternative) is SAFE
  const start: Coordinate = [76.7794, 30.7333]; // Sector 17, Chandigarh
  const dest: Coordinate = [76.7179, 30.7046]; // Mohali Sector 70

  const blockedRoad: BlockedRoad = {
    id: 'ROAD-BLOCK-MADHYA',
    name: 'Madhya Marg Central Collapse',
    status: 'BLOCKED',
    reason: 'Emergency sinkhole closure',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7810, 30.7550],
        [76.7915, 30.7410],
      ],
    },
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const cand1Blocked: RouteCandidate = {
    id: 'cand-1',
    label: 'Direct Route via Madhya Marg',
    geometry: { type: 'LineString', coordinates: [[76.7794, 30.7333], [76.7850, 30.7450], [76.7179, 30.7046]] },
    coordinates: [[76.7794, 30.7333], [76.7850, 30.7450], [76.7179, 30.7046]],
    distanceMeters: 4000,
    distanceKm: 4.0,
    durationSeconds: 500,
    durationMinutes: 8,
    safetyAssessment: {
      routeFound: true,
      distanceKm: 4.0,
      durationMinutes: 8,
      safetyStatus: 'BLOCKED',
      highestHazardSeverity: 'NONE',
      blockedRoad: true,
      hazardsChecked: 4,
      hazardsIntersected: 0,
      blockedRoadsChecked: 1,
      blockedRoadsIntersected: 1,
      hazardIntersections: [],
      blockedRoadIntersections: [
        { roadId: 'ROAD-BLOCK-MADHYA', roadName: 'Madhya Marg Central Collapse', reason: 'Sinkhole', intersectionPointsCount: 2 },
      ],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
    rejectionReason: 'BLOCKED_ROAD (ROAD-BLOCK-MADHYA)',
  };

  const cand2AlternativeSafe: RouteCandidate = {
    id: 'cand-2',
    label: 'Alternative Route via Himalaya Marg',
    geometry: { type: 'LineString', coordinates: [[76.7794, 30.7333], [76.7600, 30.7200], [76.7179, 30.7046]] },
    coordinates: [[76.7794, 30.7333], [76.7600, 30.7200], [76.7179, 30.7046]],
    distanceMeters: 5200,
    distanceKm: 5.2,
    durationSeconds: 650,
    durationMinutes: 11,
    safetyAssessment: {
      routeFound: true,
      distanceKm: 5.2,
      durationMinutes: 11,
      safetyStatus: 'SAFE',
      highestHazardSeverity: 'NONE',
      blockedRoad: false,
      hazardsChecked: 4,
      hazardsIntersected: 0,
      blockedRoadsChecked: 1,
      blockedRoadsIntersected: 0,
      hazardIntersections: [],
      blockedRoadIntersections: [],
      evaluatedAt: new Date().toISOString(),
    },
    isSelected: false,
  };

  const decision = buildRoutingDecision({
    start,
    destination: dest,
    initialCandidates: [cand1Blocked, cand2AlternativeSafe],
    detourAttempts: 0,
    detourCandidates: [],
    isSyntheticFixture: false,
  });

  assert(decision.status === 'ROUTE_FOUND', 'Decision status is ROUTE_FOUND (not prematurely NO_SAFE_ROUTE)');
  assert(decision.selectedRoute?.id === 'cand-2', 'Safe alternative Route 2 is selected when Route 1 is blocked');
  assert(decision.visualTier === 'SAFE', 'Visual tier is SAFE (Blue)');

  // Test 2: Real OSRM Detour Generation around a Blocked Road
  console.log('\n[TEST 2] Testing real OSRM detour bypass around a blocked road...');
  const activeBlockedRoads: BlockedRoad[] = [
    {
      id: 'ROAD-BLOCK-SEC35',
      name: 'Sector 35/36 Arterial Road Closure',
      status: 'BLOCKED',
      reason: 'Flooding & debris',
      geometry: {
        type: 'LineString',
        coordinates: [
          [76.7580, 30.7290],
          [76.7620, 30.7220],
        ],
      },
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const detourResult = await generateSafeDetours(
    [76.7794, 30.7333], // Sector 17
    [76.7441, 30.7225], // Sector 43 ISBT
    { blockedRoadIds: ['ROAD-BLOCK-SEC35'] },
    [],
    activeBlockedRoads
  );

  console.log(`Detour candidates generated: ${detourResult.detourCandidates.length}`);
  assert(detourResult.detourCandidates.length > 0, 'OSRM generated valid detour candidates around blocked road');

  const safeDetours = detourResult.detourCandidates.filter(
    (c) => c.safetyAssessment.safetyStatus === 'SAFE' && !c.safetyAssessment.blockedRoad
  );
  console.log(`Safe detour routes found: ${safeDetours.length}`);
  assert(safeDetours.length > 0, 'At least one real-road detour completely clears the blocked road closure');

  console.log('\n====================================================');
  console.log('ALL BLOCKED ROAD REROUTING TESTS PASSED');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
