import { INITIAL_INCIDENTS } from './src/data/incidentData';
import { INITIAL_RESPONDERS } from './src/data/responderData';
import { SIH_SCENARIOS } from './src/data/sihScenarioData';
import { createIncident, hasActiveIncidentForCitizen } from './src/services/incidentService';
import { rankRespondersForIncident, executeDispatch } from './src/services/dispatchService';
import { transitionMissionState } from './src/services/missionService';
import { initSihScenarioExecution, executeNextSihStep } from './src/services/sihScenarioService';
import type { Incident } from './src/types/incident';
import type { Responder } from './src/types/responder';
import type { Mission } from './src/types/mission';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

console.log('========================================================');
console.log('RESQNET EMERGENCY LIFECYCLE & DISPATCH VERIFICATION');
console.log('========================================================');

// --- TEST 1: Citizen SOS Incident Creation ---
console.log('\n--- TEST 1: Citizen SOS Creation ---');
let incidents: Incident[] = [...INITIAL_INCIDENTS];
const { incident: newSos, error } = createIncident(
  {
    citizenId: 'CIT-TEST-01',
    citizenName: 'Karanvir Singh',
    citizenPhone: '+91 98765-11111',
    coordinate: [76.6430, 30.7440], // Kharar NH-5
    type: 'FLOOD_RESCUE',
    severity: 'HIGH',
    landmark: 'Kharar Flyover Service Lane',
    notes: 'Rising water level trapped family vehicle.',
  },
  incidents
);

assert(newSos !== null, 'SOS Incident successfully created');
assert(newSos?.status === 'OPEN', 'Initial SOS status is OPEN');
assert(newSos?.source === 'CITIZEN_SOS', 'Source is CITIZEN_SOS');
assert(newSos?.location.coordinate[0] === 76.643, 'Longitude correctly anchored');
assert(newSos?.location.coordinate[1] === 30.744, 'Latitude correctly anchored');

if (newSos) incidents = [newSos, ...incidents];

// Duplicate SOS check
const duplicateCheck = hasActiveIncidentForCitizen(incidents, 'CIT-TEST-01');
assert(duplicateCheck === true, 'Duplicate active SOS correctly detected and blocked');

// --- TEST 2: Coordinator Review & Deterministic Responder Ranking ---
console.log('\n--- TEST 2: Coordinator Review & Deterministic Ranking ---');
let responders: Responder[] = [...INITIAL_RESPONDERS];
let missions: Mission[] = [];

const ranked = rankRespondersForIncident(newSos!, responders);
assert(ranked.length === responders.length, 'All responders ranked deterministically');
assert(ranked[0].score > ranked[ranked.length - 1].score, 'Top ranked responder has highest deterministic score');
console.log(`Top ranked responder for Kharar Flood: ${ranked[0].responder.name} (${ranked[0].distanceKm} km, Score: ${ranked[0].score}, Reason: ${ranked[0].suitabilityReason})`);

// --- TEST 3: Coordinator Dispatches Responder ---
console.log('\n--- TEST 3: Coordinator Dispatches Responder ---');
const selectedResponder = ranked[0].responder;
const dispatchResult = executeDispatch(newSos!, selectedResponder, missions, 'Deploy water rescue raft');

assert(dispatchResult.mission !== null, 'Mission created upon dispatch');
assert(dispatchResult.mission.status === 'ASSIGNED', 'Mission initial status is ASSIGNED');
assert(dispatchResult.updatedIncident.status === 'DISPATCHED', 'Incident status transitioned to DISPATCHED');
assert(dispatchResult.updatedResponder.status === 'DISPATCHED', 'Responder status transitioned to DISPATCHED');
assert(dispatchResult.updatedIncident.assignedResponderId === selectedResponder.id, 'Incident correctly bound to responder');

missions = [dispatchResult.mission, ...missions];
incidents = incidents.map((i) => (i.id === dispatchResult.updatedIncident.id ? dispatchResult.updatedIncident : i));
responders = responders.map((r) => (r.id === dispatchResult.updatedResponder.id ? dispatchResult.updatedResponder : r));

// --- TEST 4: Responder Accepts Mission ---
console.log('\n--- TEST 4: Responder Accepts Mission ---');
const activeMission = missions[0];
const acceptRes = transitionMissionState(
  activeMission,
  'ACCEPTED',
  incidents.find((i) => i.id === activeMission.incidentId),
  responders.find((r) => r.id === activeMission.responderId)
);

assert(acceptRes.result !== null, 'Mission transition to ACCEPTED succeeded');
assert(acceptRes.result?.mission.status === 'ACCEPTED', 'Mission is ACCEPTED');
assert(acceptRes.result?.updatedIncident?.status === 'IN_PROGRESS', 'Incident status is IN_PROGRESS');

missions = missions.map((m) => (m.id === acceptRes.result!.mission.id ? acceptRes.result!.mission : m));
if (acceptRes.result?.updatedIncident) {
  incidents = incidents.map((i) => (i.id === acceptRes.result!.updatedIncident!.id ? acceptRes.result!.updatedIncident! : i));
}

// --- TEST 5: Responder Starts En Route ---
console.log('\n--- TEST 5: Responder Starts En Route ---');
const enRouteRes = transitionMissionState(
  missions[0],
  'EN_ROUTE',
  incidents.find((i) => i.id === activeMission.incidentId),
  responders.find((r) => r.id === activeMission.responderId)
);

assert(enRouteRes.result !== null, 'Mission transition to EN_ROUTE succeeded');
assert(enRouteRes.result?.mission.status === 'EN_ROUTE', 'Mission is EN_ROUTE');
assert(enRouteRes.result?.updatedResponder?.status === 'EN_ROUTE', 'Responder status is EN_ROUTE');

missions = missions.map((m) => (m.id === enRouteRes.result!.mission.id ? enRouteRes.result!.mission : m));

// --- TEST 6: Responder Arrives On Scene ---
console.log('\n--- TEST 6: Responder Arrives On Scene ---');
const arriveRes = transitionMissionState(
  missions[0],
  'ARRIVED',
  incidents.find((i) => i.id === activeMission.incidentId),
  responders.find((r) => r.id === activeMission.responderId)
);

assert(arriveRes.result !== null, 'Mission transition to ARRIVED succeeded');
assert(arriveRes.result?.mission.status === 'ARRIVED', 'Mission is ARRIVED');
assert(arriveRes.result?.updatedIncident?.status === 'RESPONDER_ARRIVED', 'Incident status is RESPONDER_ARRIVED');
assert(arriveRes.result?.updatedResponder?.status === 'ON_SCENE', 'Responder status is ON_SCENE');

missions = missions.map((m) => (m.id === arriveRes.result!.mission.id ? arriveRes.result!.mission : m));

// --- TEST 7: Mission Resolution ---
console.log('\n--- TEST 7: Mission Resolution ---');
const resolveRes = transitionMissionState(
  missions[0],
  'RESOLVED',
  incidents.find((i) => i.id === activeMission.incidentId),
  responders.find((r) => r.id === activeMission.responderId)
);

assert(resolveRes.result !== null, 'Mission transition to RESOLVED succeeded');
assert(resolveRes.result?.mission.status === 'RESOLVED', 'Mission is RESOLVED');
assert(resolveRes.result?.updatedIncident?.status === 'RESOLVED', 'Incident is RESOLVED');
assert(resolveRes.result?.updatedResponder?.status === 'AVAILABLE', 'Responder becomes AVAILABLE again');

// --- TEST 8: SIH Scenario Generator Execution ---
console.log('\n--- TEST 8: SIH Scenario Generator Stepper ---');
const testScenario = SIH_SCENARIOS[0];
let sihState = initSihScenarioExecution(testScenario);
let sihIncidents = [...INITIAL_INCIDENTS];
let sihResponders = [...INITIAL_RESPONDERS];
let sihMissions: Mission[] = [];

while (!sihState.isComplete) {
  const stepRes = executeNextSihStep(sihState, sihIncidents, sihResponders, sihMissions);
  sihState = stepRes.nextExecutionState;
  sihIncidents = stepRes.updatedIncidents;
  sihResponders = stepRes.updatedResponders;
  sihMissions = stepRes.updatedMissions;
}

assert(sihState.isComplete === true, 'SIH Scenario completed all steps');
assert(sihState.logMessages.length >= testScenario.steps.length, 'SIH Event stream logged all timeline events');

console.log('\n========================================================');
console.log('✅ ALL EMERGENCY LIFECYCLE TESTS COMPLETED SUCCESSFULLY!');
console.log('========================================================');
