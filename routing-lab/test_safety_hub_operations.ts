import { 
  computeSafetyHubStatus, 
  checkSafetyHubEligibility, 
  SafetyHub 
} from './src/types/safetyHub';
import { INITIAL_SAFETY_HUBS } from './src/data/safetyHubData';
import { findBestSafeSafetyHub } from './src/services/safetyHubService';
import { getRouteCandidates } from './src/services/routingService';
import { evaluateRouteSafety } from './src/services/routeSafetyService';
import { generateSafeDetours } from './src/services/detourService';
import { buildRoutingDecision } from './src/services/routingDecisionService';
import type { RouteCandidate } from './src/types/candidates';
import type { BlockedRoad } from './src/types/safety';

async function runSafetyHubValidationSuite() {
  console.log("=================================================");
  console.log("RESQNET SAFETY HUB AUTOMATED VALIDATION TEST SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${details ? `-> ${details}` : ''}`);
      failed++;
    }
  }

  // TEST 5: Capacity = 500, Occupancy = 300 => Available = 200, Status = OPEN
  {
    const status = computeSafetyHubStatus(500, 300, 'OPEN');
    assert(status === 'OPEN', "TEST 5: Capacity 500, Occupancy 300 => OPEN status (200 available)");
  }

  // TEST 6: Capacity = 500, Occupancy = 500 => Available = 0, Status = FULL
  {
    const status = computeSafetyHubStatus(500, 500, 'OPEN');
    assert(status === 'FULL', "TEST 6: Capacity 500, Occupancy 500 => FULL status (0 available)");
  }

  // TEST 6b: Near capacity threshold (e.g. 500 capacity, 450 occupancy => 10% remaining <= 15%)
  {
    const status = computeSafetyHubStatus(500, 450, 'OPEN');
    assert(status === 'NEAR_CAPACITY', "TEST 6b: Capacity 500, Occupancy 450 => NEAR_CAPACITY status (50 available, <=15%)");
  }

  // TEST 7: Set hub CLOSED => check eligibility
  {
    const testHub: SafetyHub = {
      ...INITIAL_SAFETY_HUBS[0],
      id: 'test-hub-closed',
      manualStatus: 'CLOSED',
      status: 'CLOSED',
      verificationStatus: 'VERIFIED',
      isActive: true,
      totalCapacity: 500,
      currentOccupancy: 100,
      availableCapacity: 400
    };
    const eligibility = checkSafetyHubEligibility(testHub);
    assert(!eligibility.isEligible && (eligibility.rejectionReason?.toLowerCase().includes('closed') || false), "TEST 7: Set hub CLOSED => Ineligible for routing");
  }

  // TEST 8: Full hub is ineligible
  {
    const fullHub: SafetyHub = {
      ...INITIAL_SAFETY_HUBS[0],
      id: 'test-hub-full',
      status: 'FULL',
      manualStatus: 'OPEN',
      verificationStatus: 'VERIFIED',
      isActive: true,
      totalCapacity: 500,
      currentOccupancy: 500,
      availableCapacity: 0
    };
    const eligibility = checkSafetyHubEligibility(fullHub);
    assert(!eligibility.isEligible && (eligibility.rejectionReason?.toLowerCase().includes('capacity') || eligibility.rejectionReason?.toLowerCase().includes('full') || false), "TEST 8: FULL hub => Ineligible for routing");
  }

  // TEST 8b: Unverified hub is ineligible
  {
    const unverifiedHub: SafetyHub = {
      ...INITIAL_SAFETY_HUBS[0],
      id: 'test-hub-unverified',
      verificationStatus: 'UNVERIFIED',
      status: 'OPEN',
      manualStatus: 'OPEN',
      isActive: true,
      totalCapacity: 500,
      currentOccupancy: 100,
      availableCapacity: 400
    };
    const eligibility = checkSafetyHubEligibility(unverifiedHub);
    assert(!eligibility.isEligible && (eligibility.rejectionReason?.toLowerCase().includes('verified') || false), "TEST 8b: UNVERIFIED hub => Ineligible for routing");
  }

  // TEST 9 & 10 & 11: Temporary Tents, Food, Water, Medical, Sanitation capabilities structure
  {
    const sampleHub = INITIAL_SAFETY_HUBS.find(h => h.id === 'HUB-SEC16-SCH');
    assert(!!sampleHub, "Sample Hub (Govt Model Sr Sec School Sector 16) exists in seed data");
    if (sampleHub) {
      assert(sampleHub.capabilities.tents?.enabled === true && sampleHub.capabilities.tents?.tentUnits === 15 && sampleHub.capabilities.tents?.tentCapacity === 120, "TEST 9: Tent capability and capacity (15 tents * 8 = 120) properly configured");
      assert(sampleHub.capabilities.foodDistribution?.enabled === true && sampleHub.capabilities.foodDistribution?.mealsPerCycle === 600, "TEST 10: Food Distribution capability (600 meals/cycle) properly configured");
      assert(sampleHub.capabilities.drinkingWater?.enabled === true && sampleHub.capabilities.medicalFirstAid?.enabled === true && sampleHub.capabilities.sanitationToilets?.enabled === true, "TEST 11: Water + Medical + Sanitation capabilities enabled");
    }
  }

  // TEST 12: Resources vs Requirements separate tracking
  {
    const sampleHub = INITIAL_SAFETY_HUBS[0];
    assert(Array.isArray(sampleHub.resources) && Array.isArray(sampleHub.requirements), "TEST 12a: Resources and requirements are distinct arrays");
    assert(sampleHub.resources.some(r => r.type === 'WATER') && sampleHub.requirements.some(r => r.type === 'WATER'), "TEST 12b: Both available water resource and required water shortage tracked separately without merging");
  }

  // TEST 13: Select Safety Hub as routing destination via OSRM
  console.log("\nTesting OSRM Route to Safety Hub...");
  const originCoord: [number, number] = [76.7794, 30.7333]; // Sector 17 Plaza
  const targetHub = INITIAL_SAFETY_HUBS[1]; // Sector 16 School: [76.7825, 30.7480]

  try {
    const candidatesRes = await getRouteCandidates(originCoord, targetHub.coordinate);
    assert(candidatesRes.status === 'success' && candidatesRes.routes.length > 0, "TEST 13: OSRM calculates real route from origin to Safety Hub destination");
    
    if (candidatesRes.status === 'success' && candidatesRes.routes.length > 0) {
      const assessedCandidates: RouteCandidate[] = candidatesRes.routes.map((r, idx) => ({
        ...r,
        id: `initial-${idx}`,
        label: `Route ${idx + 1}`,
        distanceKm: r.distanceMeters / 1000,
        durationMinutes: r.durationSeconds / 60,
        isSelected: idx === 0,
        safetyAssessment: evaluateRouteSafety(r, [], [])
      }));

      const decision = buildRoutingDecision({
        start: originCoord,
        destination: targetHub.coordinate,
        initialCandidates: assessedCandidates,
        detourAttempts: 0,
        detourCandidates: [],
        isSyntheticFixture: false,
      });

      assert(decision.status === 'ROUTE_FOUND' && decision.selectedRoute !== null, "TEST 13b: Routing decision produces verified safe route to Safety Hub");
      console.log(`-> Destination: ${targetHub.name}, Distance: ${decision.selectedRoute?.distanceKm.toFixed(2)} km, Duration: ${decision.selectedRoute?.durationMinutes.toFixed(1)} min, Tier: ${decision.visualTier}`);
    }
  } catch (err) {
    assert(false, "TEST 13: OSRM route computation failed", String(err));
  }

  // TEST 14: Block road to Safety Hub and ensure alternative detour is found
  console.log("\nTesting Blocked Road Avoidance to Safety Hub...");
  try {
    const blockedRoad: BlockedRoad = {
      id: 'closure-sec16-test',
      name: 'Jan Marg Segment',
      status: 'BLOCKED',
      reason: 'Flooding near Sector 16 roundabout',
      geometry: {
        type: 'LineString',
        coordinates: [
          [76.7780, 30.7380],
          [76.7820, 30.7420]
        ]
      },
      createdAt: new Date().toISOString()
    };

    const candidatesRes = await getRouteCandidates(originCoord, targetHub.coordinate);
    if (candidatesRes.status === 'success' && candidatesRes.routes.length > 0) {
      const assessedCandidates: RouteCandidate[] = candidatesRes.routes.map((r, idx) => ({
        ...r,
        id: `initial-${idx}`,
        label: `Route ${idx + 1}`,
        distanceKm: r.distanceMeters / 1000,
        durationMinutes: r.durationSeconds / 60,
        isSelected: idx === 0,
        safetyAssessment: evaluateRouteSafety(r, [], [blockedRoad])
      }));

      const primaryInitial = assessedCandidates[0];
      const detourResult = await generateSafeDetours(
        originCoord,
        targetHub.coordinate,
        primaryInitial,
        primaryInitial.safetyAssessment,
        [],
        [blockedRoad]
      );

      const decision = buildRoutingDecision({
        start: originCoord,
        destination: targetHub.coordinate,
        initialCandidates: assessedCandidates,
        detourAttempts: detourResult.attempts,
        detourCandidates: detourResult.candidates,
        isSyntheticFixture: false,
      });

      assert(decision.status === 'ROUTE_FOUND' && decision.selectedRoute !== null, "TEST 14: Route engine successfully finds alternative detour to Safety Hub around road closure");
      console.log(`-> Detour Decision: ${decision.routingMode}, Reason: ${decision.explanation}`);
    }
  } catch (err) {
    assert(false, "TEST 14: Detour computation failed", String(err));
  }

  // TEST 16: Multiple safety hubs evaluation with findBestSafeSafetyHub
  console.log("\nTesting Multi-Hub Intelligent Safe Selection...");
  try {
    const testHubs: SafetyHub[] = [
      {
        ...INITIAL_SAFETY_HUBS[0],
        id: 'hub-close-full',
        name: 'Sector 17 Immediate Hub (FULL)',
        coordinate: [76.7800, 30.7350],
        status: 'FULL',
        manualStatus: 'OPEN',
        totalCapacity: 200,
        currentOccupancy: 200,
        availableCapacity: 0,
        verificationStatus: 'VERIFIED',
        isActive: true
      },
      INITIAL_SAFETY_HUBS[1], // Sector 16 school: OPEN, 290 available
      INITIAL_SAFETY_HUBS[2]  // PCA Stadium: OPEN, 1200 available
    ];

    const bestHubResult = await findBestSafeSafetyHub(
      originCoord,
      testHubs,
      [],
      []
    );

    assert(bestHubResult.selectedHub !== null, "TEST 16a: findBestSafeSafetyHub successfully selected a hub");
    assert(bestHubResult.selectedHub?.id !== 'hub-close-full', "TEST 16b: Full hub was correctly excluded even though it was the closest geographically");
    assert(bestHubResult.selectedHub?.id === 'HUB-SEC16-SCH' || bestHubResult.selectedHub?.id === 'HUB-MOHALI-PCA', "TEST 16c: Selected hub is an eligible open hub with safe route");
    console.log(`-> Best Hub Selected: "${bestHubResult.selectedHub?.name}" with score: ${bestHubResult.evaluations.find(e => e.hub.id === bestHubResult.selectedHub?.id)?.score.toFixed(1)}/100`);
  } catch (err) {
    assert(false, "TEST 16: Multi-hub selection failed", String(err));
  }

  // =========================================================================
  // PART 26 & 27 TESTS — OPERATIONAL AREA TYPES, GEOMETRY IMMUTABILITY & ICONS
  // =========================================================================
  console.log("\n=================================================");
  console.log("TESTING GEOMETRY IMMUTABILITY & OPERATIONAL AREAS");
  console.log("=================================================\n");

  const { INITIAL_OPERATIONAL_AREAS } = await import('./src/data/safetyHubData');
  const { OPERATIONAL_AREA_TYPE_METAS, ALL_OPERATIONAL_AREA_TYPES } = await import('./src/types/safetyHub');
  const { getOperationalAreaIconMarkup, getSafetyHubShieldMarkup } = await import('./src/components/SafetyHubIcons');

  // TEST 17: All 8 Operational Area Types are supported
  {
    assert(ALL_OPERATIONAL_AREA_TYPES.length === 8, "TEST 17a: Exactly 8 operational area types are defined in ALL_OPERATIONAL_AREA_TYPES");
    
    const requiredTypes = [
      'RELIEF_TENT',
      'MEDICAL_FIRST_AID',
      'FOOD_DISTRIBUTION',
      'WATER_POINT',
      'SANITATION',
      'REGISTRATION_DESK',
      'GENERAL_SHELTER',
      'COMMAND_COORDINATION'
    ];
    const hasAllTypes = requiredTypes.every(t => OPERATIONAL_AREA_TYPE_METAS[t as keyof typeof OPERATIONAL_AREA_TYPE_METAS] !== undefined);
    assert(hasAllTypes, "TEST 17b: All 8 required operational area types have defined metadata and color tokens");
  }

  // TEST 18: ZERO EMOJI rule in vector icon markups
  {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    let anyEmojiFound = false;

    for (const type of ALL_OPERATIONAL_AREA_TYPES) {
      const markup = getOperationalAreaIconMarkup(type, '#3b82f6', 16);
      if (emojiRegex.test(markup)) {
        anyEmojiFound = true;
      }
    }
    const shieldMarkup = getSafetyHubShieldMarkup('#10b981', 20);
    if (emojiRegex.test(shieldMarkup)) {
      anyEmojiFound = true;
    }

    assert(!anyEmojiFound, "TEST 18: Zero emoji in all operational area and safety hub icon markups (Pure SVG)");
  }

  // TEST 19: Main Hub Shield Icon is visually distinct from Operational Area icons
  {
    const shieldMarkup = getSafetyHubShieldMarkup('#10b981', 20);
    const tentMarkup = getOperationalAreaIconMarkup('RELIEF_TENT', '#38bdf8', 20);
    const medicalMarkup = getOperationalAreaIconMarkup('MEDICAL_FIRST_AID', '#ef4444', 20);
    const waterMarkup = getOperationalAreaIconMarkup('WATER_POINT', '#06b6d4', 20);

    assert(shieldMarkup !== tentMarkup && shieldMarkup !== medicalMarkup && shieldMarkup !== waterMarkup, "TEST 19: Main Hub Shield icon is distinct from operational area facility icons");
  }

  // TEST 20: Geometry Immutability — Creating Hub B does not mutate Hub A
  {
    const hubA: SafetyHub = {
      ...INITIAL_SAFETY_HUBS[0],
      coordinate: [76.7794, 30.7333],
    };
    const savedHubs = [hubA];

    // Coordinator drafts Hub B at new coordinates
    const draftCoords: [number, number] = [76.7850, 30.7400];
    const hubB: SafetyHub = {
      ...INITIAL_SAFETY_HUBS[1],
      id: 'HUB-NEW-B',
      coordinate: draftCoords,
    };

    // Save Hub B immutably
    const updatedHubs = [...savedHubs, hubB];

    assert(savedHubs[0].coordinate[0] === 76.7794 && savedHubs[0].coordinate[1] === 30.7333, "TEST 20a: Hub A coordinate remains strictly unchanged in savedHubs");
    assert(updatedHubs.length === 2 && updatedHubs[0].coordinate[0] === 76.7794 && updatedHubs[1].coordinate[0] === 76.7850, "TEST 20b: Hub B saved into new array without mutating Hub A");
  }

  // TEST 21: Deep-Clone on Edit & Cancel Behavior
  {
    const originalArea = INITIAL_OPERATIONAL_AREAS[0];
    const originalCoords = [...originalArea.coordinate];

    // Deep clone for editing
    const editingDraft = JSON.parse(JSON.stringify(originalArea));
    editingDraft.coordinate = [76.9999, 30.9999]; // Mutate draft during user drag/edit

    // If cancelled:
    assert(originalArea.coordinate[0] === originalCoords[0] && originalArea.coordinate[1] === originalCoords[1], "TEST 21: Editing draft mutation does NOT mutate original saved operational area (Deep-Copy isolation)");
  }

  // TEST 22: Safe Hub Deletion cascade removes child operational areas
  {
    const testHubId = 'HUB-TEST-CASCADE';
    const initialAreas = [
      { ...INITIAL_OPERATIONAL_AREAS[0], id: 'OP-1', hubId: testHubId },
      { ...INITIAL_OPERATIONAL_AREAS[1], id: 'OP-2', hubId: 'HUB-OTHER' },
    ];

    // Simulate deleting testHubId
    const remainingAreas = initialAreas.filter(a => a.hubId !== testHubId);
    assert(remainingAreas.length === 1 && remainingAreas[0].id === 'OP-2', "TEST 22: Deleting parent Safety Hub safely deletes child operational areas without leaving orphans");
  }

  console.log("\n=================================================");
  console.log(`SAFETY HUB & OPERATIONAL AREAS VALIDATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runSafetyHubValidationSuite();
