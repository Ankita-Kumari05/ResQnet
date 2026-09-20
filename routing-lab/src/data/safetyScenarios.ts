import type { SafetyScenario } from '../types/safety';

/**
 * Seven Deterministic Phase 2 Verification Scenarios (Chandigarh / Mohali / Kharar).
 * Each scenario specifies fixed coordinates, expected safety classification,
 * expected highest hazard severity, and blocked-road detection flags.
 */
export const SAFETY_SCENARIOS: SafetyScenario[] = [
  {
    id: 'scenario-1-safe',
    scenarioNumber: 1,
    name: 'Scenario 1: Safe Corridor',
    shortLabel: 'SCENARIO 1 — SAFE',
    description: 'Clear route along unobstructed arterial streets avoiding all disaster hazard polygons and blocked segments.',
    expectedStatus: 'SAFE',
    expectedHighestSeverity: 'NONE',
    expectedBlockedRoad: false,
    start: [76.7794, 30.7333],       // Sector 17 Staging Area
    destination: [76.7620, 30.7220], // Sector 34 / 35 Chowk
    notes: 'Verifies normal routing with zero hazard/block intersections -> SAFE.',
  },
  {
    id: 'scenario-2-moderate',
    scenarioNumber: 2,
    name: 'Scenario 2: Moderate Hazard Zone',
    shortLabel: 'SCENARIO 2 — MODERATE',
    description: 'Route traverses HZ-MOD-01 (Tribune Chowk Stormwater Waterlogging zone, orange severity).',
    expectedStatus: 'RISKY',
    expectedHighestSeverity: 'MODERATE',
    expectedBlockedRoad: false,
    start: [76.7750, 30.7100],       // Sector 33 / 20 Dakshin Marg
    destination: [76.8120, 30.6800], // Hallomajra
    notes: 'Verifies moderate hazard polygon detection -> RISKY (severity MODERATE).',
  },
  {
    id: 'scenario-3-high',
    scenarioNumber: 3,
    name: 'Scenario 3: High Hazard Zone',
    shortLabel: 'SCENARIO 3 — HIGH',
    description: 'Route cuts through HZ-HIGH-01 (Sukhna Choe Overflow corridor, red severity).',
    expectedStatus: 'RISKY',
    expectedHighestSeverity: 'HIGH',
    expectedBlockedRoad: false,
    start: [76.8040, 30.7280],       // Transport Chowk / Sector 26
    destination: [76.8390, 30.6920], // Industrial Area Phase 2
    notes: 'Verifies high hazard polygon detection -> RISKY (severity HIGH).',
  },
  {
    id: 'scenario-4-critical',
    scenarioNumber: 4,
    name: 'Scenario 4: Critical Hazard Zone',
    shortLabel: 'SCENARIO 4 — CRITICAL',
    description: 'Route intersects HZ-CRIT-01 (Mohali Phase 8 Industrial Chemical Spill, purple/crimson mandatory no-go zone).',
    expectedStatus: 'UNSAFE',
    expectedHighestSeverity: 'CRITICAL',
    expectedBlockedRoad: false,
    start: [76.7120, 30.7190],       // Mohali Phase 3B2
    destination: [76.7230, 30.6940], // Sector 70 Mohali
    notes: 'Verifies critical hazard polygon detection -> UNSAFE (Rule 1 / Rule 2).',
  },
  {
    id: 'scenario-5-blocked',
    scenarioNumber: 5,
    name: 'Scenario 5: Blocked Road Closure',
    shortLabel: 'SCENARIO 5 — BLOCKED',
    description: 'Route follows Madhya Marg directly over ROAD-BLOCK-01 (Sector 26 water main sinkhole collapse).',
    expectedStatus: 'BLOCKED',
    expectedHighestSeverity: 'NONE',
    expectedBlockedRoad: true,
    start: [76.7915, 30.7410],       // Matka Chowk / Sector 17
    destination: [76.8040, 30.7280], // Sector 26 Transport Chowk
    notes: 'Verifies physical road closure LineString intersection with spatial tolerance -> BLOCKED.',
  },
  {
    id: 'scenario-6-multiple',
    scenarioNumber: 6,
    name: 'Scenario 6: Multiple Hazards',
    shortLabel: 'SCENARIO 6 — MULTIPLE',
    description: 'Route traverses both Moderate (Tribune Chowk) and High (Sukhna Choe) disaster zones.',
    expectedStatus: 'RISKY',
    expectedHighestSeverity: 'HIGH',
    expectedBlockedRoad: false,
    start: [76.7750, 30.7100],       // Sector 33
    destination: [76.8390, 30.6920], // Industrial Area Phase 2
    notes: 'Verifies highest-severity resolution: MODERATE + HIGH -> Highest: HIGH, Status: RISKY.',
  },
  {
    id: 'scenario-7-alternative',
    scenarioNumber: 7,
    name: 'Scenario 7: Safe Alternative Need',
    shortLabel: 'SCENARIO 7 — DETOUR NEED',
    description: 'Direct route is evaluated as dangerous (traversing HZ-CHD-01 Kharar Flyover) requiring bypass.',
    expectedStatus: 'RISKY',
    expectedHighestSeverity: 'HIGH',
    expectedBlockedRoad: false,
    start: [76.7179, 30.7046],       // Mohali Phase 7
    destination: [76.6433, 30.7454], // Kharar Bus Stand
    notes: 'Proves OSRM returns valid road routes that are unsafe during disasters without claiming auto-routing yet.',
  },
];

