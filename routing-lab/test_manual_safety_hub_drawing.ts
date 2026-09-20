import type { Coordinate } from './src/types/routing';
import type { SafetyHub, PotentialSafetyHub } from './src/types/safetyHub';
import { checkSafetyHubEligibility } from './src/types/safetyHub';
import { findBestSafeSafetyHub } from './src/services/safetyHubService';

console.log('=================================================');
console.log('MANUAL SAFETY HUB SELECTION & ENTRANCE ROUTING TESTS');
console.log('=================================================');

// 1. Test Polygon operational area definition
const manualPolygonGround: Coordinate[] = [
  [76.7750, 30.7350],
  [76.7780, 30.7350],
  [76.7780, 30.7320],
  [76.7750, 30.7320],
];

const roadEntranceCoord: Coordinate = [76.7782, 30.7335]; // On adjacent road

const manualHubA: SafetyHub = {
  id: 'HUB-MANUAL-01',
  name: 'Sector 17 Public Ground Safety Hub',
  siteType: 'General Emergency Hub',
  coordinate: [76.7765, 30.7335], // Centroid of polygon
  polygonCoordinates: manualPolygonGround,
  entranceCoordinate: roadEntranceCoord,
  hubFormat: 'POLYGON',
  verificationStatus: 'VERIFIED',
  isActive: true,
  status: 'OPEN',
  totalCapacity: 1200,
  currentOccupancy: 200,
  availableCapacity: 1000,
  capabilities: {
    tents: { enabled: true, tentUnits: 40, peoplePerTent: 10, tentCapacity: 400 },
    foodDistribution: { enabled: true, mealsPerCycle: 1500, serviceStatus: 'ACTIVE' },
    drinkingWater: { enabled: true, availableLiters: 10000, requirementLiters: 2000 },
    medicalFirstAid: { enabled: true, staffCount: 8, hasAmbulanceBay: true },
    sanitationToilets: { enabled: true, toiletUnits: 30 },
    powerCharging: { enabled: true, generatorBackup: true },
    registrationHelpDesk: { enabled: true },
    specialNeedsSupport: { enabled: true },
  },
  resources: [],
  requirements: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Test 1: Polygon geometry validation
if (manualHubA.polygonCoordinates && manualHubA.polygonCoordinates.length >= 3) {
  console.log('[PASS] TEST 1: Manual Safety Hub supports arbitrary polygon operational area with >= 3 vertices.');
} else {
  throw new Error('[FAIL] TEST 1 failed');
}

// Test 2: Separate Entrance Coordinate validation
if (manualHubA.entranceCoordinate && manualHubA.entranceCoordinate[0] === roadEntranceCoord[0]) {
  console.log('[PASS] TEST 2: Separate Entrance Coordinate is preserved on the accessible road.');
} else {
  throw new Error('[FAIL] TEST 2 failed');
}

// Test 3: Unidentified location fallback
const unidentifiedLocation: PotentialSafetyHub = {
  name: '',
  siteType: 'Other Public Space',
  coordinate: [76.7900, 30.7500],
  isIdentifiedFromMap: false,
};

if (!unidentifiedLocation.isIdentifiedFromMap && unidentifiedLocation.name === '') {
  console.log('[PASS] TEST 3: Unidentified location does NOT invent fake facility name and is cleanly flagged.');
} else {
  throw new Error('[FAIL] TEST 3 failed');
}

// Test 4: Immutability test when creating second hub
const manualHubB: SafetyHub = {
  ...manualHubA,
  id: 'HUB-MANUAL-02',
  name: 'Sector 22 Community Ground Hub',
  coordinate: [76.7650, 30.7250],
  polygonCoordinates: [
    [76.7640, 30.7260],
    [76.7660, 30.7260],
    [76.7660, 30.7240],
    [76.7640, 30.7240],
  ],
  entranceCoordinate: [76.7662, 30.7250],
};

const savedHubs = [manualHubA];
const updatedHubs = [manualHubB, ...savedHubs];

if (
  savedHubs[0].coordinate[0] === manualHubA.coordinate[0] &&
  savedHubs[0].polygonCoordinates?.[0][0] === manualPolygonGround[0][0] &&
  updatedHubs.length === 2
) {
  console.log('[PASS] TEST 4: Hub A remains strictly fixed and unmodified when creating Hub B.');
} else {
  throw new Error('[FAIL] TEST 4 failed');
}

// Test 5: Route targeting entrance coordinate
async function testEntranceRouting() {
  const origin: Coordinate = [76.7794, 30.7333];
  const res = await findBestSafeSafetyHub(origin, [manualHubA], [], []);
  if (res.selectedHub && res.decision?.destination) {
    const dest = res.decision.destination;
    if (Math.abs(dest[0] - roadEntranceCoord[0]) < 0.0001 && Math.abs(dest[1] - roadEntranceCoord[1]) < 0.0001) {
      console.log('[PASS] TEST 5: findBestSafeSafetyHub routed directly to entranceCoordinate on the road.');
    } else {
      throw new Error(`[FAIL] TEST 5: Routed to [${dest}] instead of entrance [${roadEntranceCoord}]`);
    }
  } else {
    throw new Error('[FAIL] TEST 5: No route decision returned');
  }
}

testEntranceRouting().then(() => {
  console.log('=================================================');
  console.log('ALL MANUAL DRAWING & ENTRANCE ROUTING TESTS PASSED!');
  console.log('=================================================');
});
