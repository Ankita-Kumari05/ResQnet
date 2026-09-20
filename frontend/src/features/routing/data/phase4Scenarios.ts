import type { Phase4Scenario } from '../types/detour';
import type { Coordinate } from '../types/routing';

// Realistic Chandigarh / Mohali street corridors for deterministic detour fixtures
// Start: Chandigarh Sector 17 [76.7794, 30.7333]
// Destination: Mohali Phase 7 [76.7179, 30.7046]
const DIRECT_THROUGH_HIGH_HAZARD: Coordinate[] = [
  [76.7794, 30.7333], // Sector 17
  [76.7580, 30.7290], // Dakshin Marg
  [76.7179, 30.7046], // Mohali Phase 7 (Traverses hazard corridor)
];

// Verified SAFE road bypass: Jan Marg -> Sector 38 West -> Mohali Phase 7
const NORTH_BYPASS_SAFE_DETOUR: Coordinate[] = [
  [76.7794, 30.7333], // Sector 17
  [76.7600, 30.7160], // Jan Marg
  [76.7350, 30.7150], // Sector 38 West bypass
  [76.7179, 30.7046], // Mohali Phase 7
];

// Verified second SAFE corridor: Himalaya Marg -> Sector 43 -> Mohali Phase 7
const EXTENDED_NORTH_SAFE_DETOUR: Coordinate[] = [
  [76.7794, 30.7333], // Sector 17
  [76.7750, 30.7370], // Himalaya Marg
  [76.7480, 30.7060], // Sector 43 ISBT
  [76.7179, 30.7046], // Mohali Phase 7
];

export const PHASE4_SCENARIOS: Phase4Scenario[] = [
  {
    id: 'p4-scenario-1',
    scenarioNumber: 1,
    name: 'Scenario 1: Fixture Safe Detour (HIGH Hazard)',
    shortLabel: 'P4-1: SAFE DETOUR',
    description: 'Initial route enters HZ-HIGH-01 (7.5 km, HIGH risk). ResQnet selects SAFE detour (8.8 km) around the hazard. Mode: HAZARD_AVOIDING_DETOUR. Blue route shown.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'SAFE_DETOUR_SELECTED',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Direct Route (Debris Corridor)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour 1 (Jan Marg / Sec 38 Bypass)',
        distanceKm: 8.8,
        durationMinutes: 18,
        safetyStatus: 'SAFE',
        highestHazardSeverity: 'NONE',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-2',
    scenarioNumber: 2,
    name: 'Scenario 2: Safe Detour vs Short Risky',
    shortLabel: 'P4-2: SAFE DETOUR > SHORT RISKY',
    description: 'Initial route is short (7.2 km) but HIGH risk. Detour is longer (8.8 km) but completely SAFE. Life safety strictly beats travel distance.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'SAFE_DETOUR_SELECTED',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (Short Dangerous)',
      distanceKm: 7.2,
      durationMinutes: 14,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour 1 (Safe Road Bypass)',
        distanceKm: 8.8,
        durationMinutes: 18,
        safetyStatus: 'SAFE',
        highestHazardSeverity: 'NONE',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-3',
    scenarioNumber: 3,
    name: 'Scenario 3: Multiple Safe Detours (Shorter Wins)',
    shortLabel: 'P4-3: MULTIPLE DETOURS',
    description: 'Initial route is HIGH risk. Two safe detours generated: Detour A (8.8 km) and Detour B (9.4 km). Detour A wins as shortest safe path.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'SAFE_DETOUR_SELECTED',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (High Debris)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour A (Northern Jan Marg Bypass)',
        distanceKm: 8.8,
        durationMinutes: 18,
        safetyStatus: 'SAFE',
        highestHazardSeverity: 'NONE',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
      {
        id: 'detour-2',
        label: 'Detour B (Extended Himalaya Marg Perimeter)',
        distanceKm: 9.4,
        durationMinutes: 20,
        safetyStatus: 'SAFE',
        highestHazardSeverity: 'NONE',
        blockedRoad: false,
        coordinates: EXTENDED_NORTH_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-4',
    scenarioNumber: 4,
    name: 'Scenario 4: Detour Still Risky (Lowest Risk Fallback)',
    shortLabel: 'P4-4: DETOUR STILL RISKY',
    description: 'No SAFE detour exists. Detour A is MODERATE risk (8.0 km); Detour B is HIGH risk (8.5 km). Moderate risk selected as lowest available risk tier.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'MODERATE_RISK_ROUTE_SELECTED',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (High Debris Corridor)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour A (Moderate Waterlogging Fringe)',
        distanceKm: 8.0,
        durationMinutes: 16,
        safetyStatus: 'RISKY',
        highestHazardSeverity: 'MODERATE',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
      {
        id: 'detour-2',
        label: 'Detour B (Severe Debris Spillway)',
        distanceKm: 8.5,
        durationMinutes: 18,
        safetyStatus: 'RISKY',
        highestHazardSeverity: 'HIGH',
        blockedRoad: false,
        coordinates: EXTENDED_NORTH_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-5',
    scenarioNumber: 5,
    name: 'Scenario 5: Detour Blocked by Road Closure',
    shortLabel: 'P4-5: DETOUR BLOCKED',
    description: 'Initial route is HIGH risk. Generated detour bypasses hazard but traverses a physically BLOCKED road closure. Candidate rejected -> NO_SAFE_ROUTE.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'NO_SAFE_ROUTE',
    expectedSelectedId: null,
    expectedReasonCode: 'NO_SAFE_ROUTE',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (High Debris)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour 1 (Traverses Sinkhole Closure)',
        distanceKm: 8.2,
        durationMinutes: 17,
        safetyStatus: 'BLOCKED',
        highestHazardSeverity: 'NONE',
        blockedRoad: true,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-6',
    scenarioNumber: 6,
    name: 'Scenario 6: Detour Enters Critical Hazard',
    shortLabel: 'P4-6: DETOUR CRITICAL',
    description: 'Initial route is HIGH risk. Detour bypasses debris but crosses CRITICAL toxic industrial zone (UNSAFE). Unsafe candidate rejected -> NO_SAFE_ROUTE.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'NO_SAFE_ROUTE',
    expectedSelectedId: null,
    expectedReasonCode: 'NO_SAFE_ROUTE',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (High Debris)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour 1 (Enters Chemical Spill Zone)',
        distanceKm: 8.4,
        durationMinutes: 18,
        safetyStatus: 'UNSAFE',
        highestHazardSeverity: 'CRITICAL',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-7',
    scenarioNumber: 7,
    name: 'Scenario 7: No Safe Detour Available (Fixture)',
    shortLabel: 'P4-7: NO SAFE ROUTE',
    description: 'All generated detours remain HIGH risk, CRITICAL, or BLOCKED. System reports NO SAFE ROUTE. Mode: NO_SAFE_ROUTE. No route line shown.',
    isRealOSRM: false,
    start: [76.7794, 30.7333],
    destination: [76.7179, 30.7046],
    expectedRoutingMode: 'NO_SAFE_ROUTE',
    expectedSelectedId: null,
    expectedReasonCode: 'NO_SAFE_ROUTE',
    initialRouteFixture: {
      id: 'initial-route',
      label: 'Initial Route (High Debris)',
      distanceKm: 7.5,
      durationMinutes: 15,
      safetyStatus: 'RISKY',
      highestHazardSeverity: 'HIGH',
      blockedRoad: false,
      coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      intersectedHazards: ['HZ-HIGH-01'],
    },
    detourFixtures: [
      {
        id: 'detour-1',
        label: 'Detour 1 (Severe Debris Zone)',
        distanceKm: 8.2,
        durationMinutes: 17,
        safetyStatus: 'RISKY',
        highestHazardSeverity: 'HIGH',
        blockedRoad: false,
        coordinates: DIRECT_THROUGH_HIGH_HAZARD,
      },
      {
        id: 'detour-2',
        label: 'Detour 2 (Toxic Chemical Plume)',
        distanceKm: 8.8,
        durationMinutes: 18,
        safetyStatus: 'UNSAFE',
        highestHazardSeverity: 'CRITICAL',
        blockedRoad: false,
        coordinates: NORTH_BYPASS_SAFE_DETOUR,
      },
    ],
  },
  {
    id: 'p4-scenario-8',
    scenarioNumber: 8,
    name: 'Scenario 8: Live OSRM Mohali Detour',
    shortLabel: 'P4-8: LIVE MOHALI DETOUR',
    description: 'Live OSRM query in Chandigarh-Mohali. HZ-CRIT-01 blocks direct corridor. ResQnet finds verified safe bypass when viable.',
    isRealOSRM: true,
    start: [76.7794, 30.7333],       // Sector 17, Chandigarh
    destination: [76.7179, 30.7046], // Mohali Phase 7
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'SAFE_DETOUR_SELECTED',
  },
  {
    id: 'p4-scenario-9',
    scenarioNumber: 9,
    name: 'Scenario 9: Guaranteed Safe Detour (Kharar NH-5 Bypass)',
    shortLabel: 'P4-9: SAFE DETOUR DEMO',
    description: 'Live OSRM. Mohali Phase 7 -> Kharar. Direct NH-5 crosses HZ-CHD-01 (Kharar Flyover Debris, HIGH risk). ResQnet finds safe bypass.',
    isRealOSRM: true,
    start: [76.7179, 30.7046],       // Mohali Phase 7
    destination: [76.6433, 30.7454], // Kharar Bus Stand
    expectedRoutingMode: 'HAZARD_AVOIDING_DETOUR',
    expectedSelectedId: 'detour-1',
    expectedReasonCode: 'SAFE_DETOUR_SELECTED',
  },
];

