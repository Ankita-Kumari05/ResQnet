import { TEST_PRESETS } from './src/data/testPresets';
import { SAFETY_SCENARIOS } from './src/data/safetyScenarios';
import { HAZARD_ZONES } from './src/data/hazardData';
import { BLOCKED_ROADS } from './src/data/blockedRoadData';
import { getRouteCandidates } from './src/services/routingService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { generateSafeDetours } from './src/services/detourService';
import { buildRoutingDecision } from './src/services/routingDecisionService';

async function checkAll() {
  console.log('=== CHECKING ALL PRESETS ===');
  for (const p of TEST_PRESETS) {
    console.log(`\nTesting Preset: ${p.name} [${p.id}]`);
    const cands = await getRouteCandidates(p.start, p.destination);
    console.log(`  OSRM returned: ${cands.routes.length} routes`);

    const initialCandidates = cands.routes.map((r, i) => ({
      id: `c-${i}`,
      label: `Candidate ${i + 1}`,
      geometry: r.geometry,
      coordinates: r.coordinates,
      distanceMeters: r.distanceMeters,
      distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
      durationSeconds: r.durationSeconds,
      durationMinutes: Math.round(r.durationSeconds / 60),
      safetyAssessment: evaluateRouteSafety(r, HAZARD_ZONES, BLOCKED_ROADS),
      isSelected: false,
    }));

    const blockedRoadIds = new Set<string>();
    const hazardIds = new Set<string>();
    initialCandidates.forEach((c) => {
      c.safetyAssessment.blockedRoadIntersections.forEach((b) => blockedRoadIds.add(b.roadId));
      c.safetyAssessment.hazardIntersections.forEach((h) => hazardIds.add(h.hazardId));
    });

    console.log(`  Blocked roads intersected: ${Array.from(blockedRoadIds).join(', ') || 'NONE'}`);
    console.log(`  Hazards intersected: ${Array.from(hazardIds).join(', ') || 'NONE'}`);

    const detours = await generateSafeDetours(
      p.start,
      p.destination,
      {
        hazardIds: Array.from(hazardIds),
        blockedRoadIds: Array.from(blockedRoadIds),
      },
      HAZARD_ZONES,
      BLOCKED_ROADS
    );

    const dec = buildRoutingDecision({
      start: p.start,
      destination: p.destination,
      initialCandidates,
      detourAttempts: detours.attemptsCount,
      detourCandidates: detours.detourCandidates,
      isSyntheticFixture: false,
    });

    console.log(`  Decision -> Status: ${dec.status}, Mode: ${dec.routingMode}, VisualTier: ${dec.visualTier}`);
    console.log(`  Selected Route: ${dec.selectedRoute ? `${dec.selectedRoute.label} (${dec.selectedRoute.distanceKm} km)` : 'NONE'}`);
    console.log(`  Reason: ${dec.reasonCode} - ${dec.explanation}`);
  }
}

checkAll().catch(console.error);
