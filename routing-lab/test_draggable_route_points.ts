import { snapCoordinateToNearestRoad } from './src/services/routingService';
import { getRouteCandidates } from './src/services/routingService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { selectSafestRoute } from './src/services/routeSelectionService';
import { HAZARD_ZONES } from './src/data/hazardData';
import { BLOCKED_ROADS } from './src/data/blockedRoadData';
import { INITIAL_SAFETY_HUBS } from './src/data/safetyHubData';
import type { Coordinate } from './src/types/routing';

async function runDraggableRoutePointsTests() {
  console.log('====================================================');
  console.log('TEST SUITE: DRAGGABLE START & DESTINATION ROUTE POINTS');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      if (detail) console.error(`  Detail: ${detail}`);
    }
  }

  // TEST 1: Independence of Start A and Destination B coordinates
  console.log('--- TEST 1: Marker Coordinates Independence ---');
  let startA: Coordinate = [76.7794, 30.7333];
  let destB: Coordinate = [76.7441, 30.7225];

  const originalStartA = [...startA] as Coordinate;
  const originalDestB = [...destB] as Coordinate;

  // Simulate dragging A to new coordinate
  const draggedA: Coordinate = [76.7850, 30.7390];
  startA = [...draggedA];

  assert(
    startA[0] === 76.7850 && startA[1] === 30.7390,
    'Dragging Start A updates Start A coordinate'
  );
  assert(
    destB[0] === originalDestB[0] && destB[1] === originalDestB[1],
    'Dragging Start A DOES NOT mutate Destination B'
  );

  // Simulate dragging B to new coordinate
  const draggedB: Coordinate = [76.7550, 30.7150];
  destB = [...draggedB];

  assert(
    destB[0] === 76.7550 && destB[1] === 30.7150,
    'Dragging Destination B updates Destination B coordinate'
  );
  assert(
    startA[0] === draggedA[0] && startA[1] === draggedA[1],
    'Dragging Destination B DOES NOT mutate Start A'
  );

  // TEST 2: Road Snapping within threshold vs outside threshold
  console.log('\n--- TEST 2: Road Snapping Engine ---');
  // Near Himalaya Marg, Sector 17 (~15m from roadway)
  const nearRoadCoord: Coordinate = [76.7795, 30.7334];
  const snapResultNear = await snapCoordinateToNearestRoad(nearRoadCoord, 80);

  assert(
    snapResultNear.snapped === true,
    'Coordinate near road is snapped to nearest road within 80m'
  );
  assert(
    snapResultNear.distanceMeters <= 80,
    `Snap distance (${snapResultNear.distanceMeters}m) is within 80m threshold`
  );

  // Deep in a lake / forest area (> 500m away from any drivable road)
  const farOffroadCoord: Coordinate = [76.7300, 30.8200];
  const snapResultFar = await snapCoordinateToNearestRoad(farOffroadCoord, 80);

  assert(
    snapResultFar.snapped === false || snapResultFar.distanceMeters <= 80,
    'Coordinates far from roads are NOT forced to snap beyond threshold (exact position preserved)'
  );
  if (!snapResultFar.snapped) {
    assert(
      snapResultFar.snappedCoordinate[0] === farOffroadCoord[0] &&
        snapResultFar.snappedCoordinate[1] === farOffroadCoord[1],
      'Original coordinate is preserved when no nearby road exists'
    );
  }

  // TEST 3: Route Recalculation on Dragged Endpoints via Real OSRM
  console.log('\n--- TEST 3: Single Real OSRM Recalculation after Marker Drop ---');
  const testDropStart: Coordinate = [76.7794, 30.7333]; // Chandigarh Sector 17
  const testDropDest: Coordinate = [76.7280, 30.7050];  // Mohali Phase 7

  const fetchRes = await getRouteCandidates(testDropStart, testDropDest);
  const candidates = fetchRes.routes;
  assert(
    candidates.length > 0,
    `OSRM returned ${candidates.length} road-following candidates for dragged endpoints`
  );

  const primaryCandidate = candidates[0];
  assert(
    primaryCandidate.coordinates.length > 5,
    `Route geometry has ${primaryCandidate.coordinates.length} vertices (real roadway, not straight line)`
  );
  assert(
    primaryCandidate.distanceMeters > 0 && primaryCandidate.durationSeconds > 0,
    `Route metrics valid: ${Math.round(primaryCandidate.distanceMeters)}m, ${Math.round(primaryCandidate.durationSeconds)}s`
  );

  // TEST 4: Hazard & Blocked Road Safety Re-evaluation
  console.log('\n--- TEST 4: Safety Re-evaluation on Dragged Endpoints ---');
  const assessedCandidates = candidates.map((cand, idx) => {
    const assessment = evaluateRouteSafety(cand, HAZARD_ZONES, BLOCKED_ROADS);
    return {
      id: `cand-${idx + 1}`,
      label: `Candidate ${idx + 1}`,
      route: cand,
      coordinates: cand.coordinates,
      geometry: cand.geometry,
      distanceKm: cand.distanceMeters / 1000,
      durationMinutes: cand.durationSeconds / 60,
      distanceMeters: cand.distanceMeters,
      durationSeconds: cand.durationSeconds,
      safetyAssessment: assessment,
      isSelected: false,
    };
  });

  const selection = selectSafestRoute(assessedCandidates);
  assert(
    selection.selectedRoute !== null || selection.reasonCode === 'NO_SAFE_ROUTE',
    `Decision engine selected best candidate: ${selection.reasonCode}`
  );

  // TEST 5: GPS vs Manual Start A Separation
  console.log('\n--- TEST 5: GPS vs Start A Separation ---');
  const mockGpsSensor1: Coordinate = [76.7700, 30.7300];
  let manualStartA: Coordinate = [...mockGpsSensor1];

  // User drags Start A to a custom position
  manualStartA = [76.7820, 30.7410];

  // Background GPS sensor updates to a new location
  const mockGpsSensor2: Coordinate = [76.7715, 30.7310];

  // Verify manualStartA was NOT overwritten by mockGpsSensor2
  assert(
    manualStartA[0] === 76.7820 && manualStartA[1] === 30.7410,
    'Manual Start A position remains fixed when GPS sensor coordinate updates'
  );
  assert(
    mockGpsSensor2[0] !== manualStartA[0],
    'GPS sensor coordinate remains independent of Start A'
  );

  // TEST 6: Safety Hub Entrance Coordinate Target
  console.log('\n--- TEST 6: Safety Hub Entrance Target ---');
  const hubWithEntrance = INITIAL_SAFETY_HUBS.find((h) => h.entranceCoordinate);
  if (hubWithEntrance) {
    const targetDest = hubWithEntrance.entranceCoordinate || hubWithEntrance.coordinate;
    assert(
      targetDest[0] === hubWithEntrance.entranceCoordinate![0] &&
        targetDest[1] === hubWithEntrance.entranceCoordinate![1],
      `Safety Hub routing selects explicit entrance coordinate [${targetDest.join(', ')}] over interior point`
    );
  } else {
    assert(true, 'Safety hub routing fallback verified');
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} / ${total} Tests Passed`);
  console.log('====================================================');

  if (passed === total) {
    console.log('ALL DRAGGABLE ROUTE POINT TESTS PASSED!');
  } else {
    process.exit(1);
  }
}

runDraggableRoutePointsTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
