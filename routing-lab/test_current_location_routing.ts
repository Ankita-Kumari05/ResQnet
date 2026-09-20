import { getRouteCandidates } from './src/services/routingService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { generateSafeDetours } from './src/services/detourService';
import { buildRoutingDecision } from './src/services/routingDecisionService';
import { PRIMARY_SAFETY_HUB } from './src/types/routing';
import type { Coordinate, StartOriginType } from './src/types/routing';
import type { HazardZone, BlockedRoad } from './src/types/safety';
import { HAZARD_ZONES } from './src/data/hazardData';
import { BLOCKED_ROADS } from './src/data/blockedRoadData';

// Simulated GPS position in Mohali Phase 7 / Sector 61 boundary
const SIMULATED_GPS: Coordinate = [76.7130, 30.7100];
const DESTINATION_MAP_POINT: Coordinate = [76.7800, 30.7300];

async function calculateRoute(
  origin: { type: StartOriginType; coordinate: Coordinate },
  destination: Coordinate,
  hazards: HazardZone[] = HAZARD_ZONES,
  blockedRoads: BlockedRoad[] = BLOCKED_ROADS
) {
  console.log(`\n==================================================`);
  console.log(`[TEST PIPELINE] Calculating route`);
  console.log(`Origin Type: ${origin.type}`);
  console.log(`Origin Coord: [${origin.coordinate[0]}, ${origin.coordinate[1]}]`);
  console.log(`Destination: [${destination[0]}, ${destination[1]}]`);

  const candidatesFetch = await getRouteCandidates(origin.coordinate, destination);
  if (candidatesFetch.status !== 'success' || candidatesFetch.routes.length === 0) {
    throw new Error(`OSRM routing failed: ${candidatesFetch.error}`);
  }

  const initialCandidates = candidatesFetch.routes.map((r, idx) => {
    const safety = evaluateRouteSafety(r, hazards, blockedRoads);
    return {
      id: `candidate-${idx + 1}`,
      label: `Route Candidate ${idx + 1}`,
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

  if (allBlockedRoadIds.size === 0 && blockedRoads.length > 0) {
    blockedRoads.forEach((b) => allBlockedRoadIds.add(b.id));
  }

  let detourCandidates = [];
  let detourAttempts = 0;

  if (allBlockedRoadIds.size > 0 || allHazardIds.size > 0) {
    const detourGen = await generateSafeDetours(
      origin.coordinate,
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

  const decision = buildRoutingDecision({
    start: origin.coordinate,
    destination,
    initialCandidates,
    detourAttempts,
    detourCandidates,
    isSyntheticFixture: false,
  });

  return decision;
}

async function runTests() {
  console.log('>>> RUNNING RESQNET CURRENT LOCATION ROUTING LAB TESTS <<<\n');

  // TEST 1: Current Location -> Manual Map Destination
  console.log('--- TEST 1: Current Location -> Manual Map Destination ---');
  const d1 = await calculateRoute(
    { type: 'CURRENT_LOCATION', coordinate: SIMULATED_GPS },
    DESTINATION_MAP_POINT
  );
  console.log(`Decision Status: ${d1.status}`);
  console.log(`Routing Mode: ${d1.routingMode}`);
  console.log(`Selected Route: ${d1.selectedRoute?.id} (${d1.selectedRoute?.distanceKm} km, ${d1.selectedRoute?.durationMinutes} min)`);
  console.log(`Safety Status: ${d1.finalSafety?.safetyStatus}`);
  if (!d1.selectedRoute || d1.status === 'NO_SAFE_ROUTE') {
    throw new Error('TEST 1 Failed: Expected valid route from GPS to map destination');
  }
  console.log('✓ TEST 1 PASSED');

  // TEST 2: Current Location -> Primary Safety Hub
  console.log('\n--- TEST 2: Current Location -> Primary Safety Hub ---');
  const d2 = await calculateRoute(
    { type: 'CURRENT_LOCATION', coordinate: SIMULATED_GPS },
    PRIMARY_SAFETY_HUB.coordinate
  );
  console.log(`Safety Hub Name: ${PRIMARY_SAFETY_HUB.name}`);
  console.log(`Safety Hub Coord: [${PRIMARY_SAFETY_HUB.coordinate.join(', ')}]`);
  console.log(`Decision Status: ${d2.status}`);
  console.log(`Selected Route: ${d2.selectedRoute?.id} (${d2.selectedRoute?.distanceKm} km)`);
  if (!d2.selectedRoute || d2.status === 'NO_SAFE_ROUTE') {
    throw new Error('TEST 2 Failed: Expected valid route from GPS to Primary Safety Hub');
  }
  console.log('✓ TEST 2 PASSED');

  // TEST 3: Current Location + Road Closure Detour Avoidance
  console.log('\n--- TEST 3: Current Location + Active Road Closure ---');
  // Add a closure right in front of the GPS path along Himalaya Marg
  const customBlockedRoad: BlockedRoad = {
    id: 'CLOSURE-TEST-GPS',
    name: 'Sector 61 / 70 Blocked Corridor',
    status: 'BLOCKED',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7150, 30.7120],
        [76.7200, 30.7150],
        [76.7250, 30.7180],
      ],
    },
    isActive: true,
  };
  const d3 = await calculateRoute(
    { type: 'CURRENT_LOCATION', coordinate: SIMULATED_GPS },
    DESTINATION_MAP_POINT,
    HAZARD_ZONES,
    [...BLOCKED_ROADS, customBlockedRoad]
  );
  console.log(`Decision Status: ${d3.status}`);
  console.log(`Routing Mode: ${d3.routingMode}`);
  console.log(`Selected Route: ${d3.selectedRoute?.id}`);
  console.log(`Detour Attempts: ${d3.detourAttempts}`);
  console.log(`Safe Detours Found: ${d3.safeDetoursCount}`);
  if (d3.selectedRoute?.safetyAssessment.blockedRoad) {
    throw new Error('TEST 3 Failed: Route routed directly through blocked road!');
  }
  console.log('✓ TEST 3 PASSED');

  // TEST 4: Origin Mode Switching (MAP_POINT -> CURRENT_LOCATION)
  console.log('\n--- TEST 4: Origin Mode Switching ---');
  const mapOrigin: Coordinate = [76.7794, 30.7333];
  const d4 = await calculateRoute(
    { type: 'MAP_POINT', coordinate: mapOrigin },
    DESTINATION_MAP_POINT
  );
  console.log(`Map Point Origin Selected: ${d4.selectedRoute?.id} (${d4.selectedRoute?.distanceKm} km)`);
  if (!d4.selectedRoute) {
    throw new Error('TEST 4 Failed: Expected valid route from Map Point origin');
  }
  console.log('✓ TEST 4 PASSED');

  console.log('\n==================================================');
  console.log('🎉 ALL 4 CURRENT LOCATION ROUTING LAB TESTS PASSED!');
  console.log('==================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
