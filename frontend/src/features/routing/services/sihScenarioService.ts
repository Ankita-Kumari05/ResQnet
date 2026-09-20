import type { SihScenario, SihScenarioStep } from '../types/scenario';
import type { Incident } from '../types/incident';
import type { Responder } from '../types/responder';
import type { Mission } from '../types/mission';
import { createIncident } from './incidentService';
import { executeDispatch } from './dispatchService';
import { transitionMissionState } from './missionService';

export interface SihExecutionState {
  scenario: SihScenario;
  currentStepIndex: number;
  activeIncidentId: string | null;
  activeMissionId: string | null;
  activeResponderId: string | null;
  isComplete: boolean;
  logMessages: string[];
}

export interface SihStepExecutionResult {
  nextExecutionState: SihExecutionState;
  updatedIncidents: Incident[];
  updatedResponders: Responder[];
  updatedMissions: Mission[];
  notification: string;
}

/**
 * Initializes a new scenario execution state.
 */
export function initSihScenarioExecution(scenario: SihScenario): SihExecutionState {
  return {
    scenario,
    currentStepIndex: 0,
    activeIncidentId: null,
    activeMissionId: null,
    activeResponderId: null,
    isComplete: false,
    logMessages: [`[${scenario.name}] Scenario ready at ${scenario.targetRegion}.`],
  };
}

/**
 * Executes a single step of the SIH scenario into the ResQnet core state.
 */
export function executeNextSihStep(
  execState: SihExecutionState,
  incidents: Incident[],
  responders: Responder[],
  missions: Mission[]
): SihStepExecutionResult {
  const { scenario, currentStepIndex } = execState;
  const step: SihScenarioStep | undefined = scenario.steps[currentStepIndex];

  if (!step) {
    return {
      nextExecutionState: { ...execState, isComplete: true },
      updatedIncidents: incidents,
      updatedResponders: responders,
      updatedMissions: missions,
      notification: 'Scenario already completed.',
    };
  }

  let nextIncidents = [...incidents];
  let nextResponders = [...responders];
  let nextMissions = [...missions];
  let activeIncId = execState.activeIncidentId;
  let activeMisId = execState.activeMissionId;
  let activeRespId = execState.activeResponderId;
  let notif = `[${step.timeOffsetLabel}] ${step.title}: ${step.description}`;

  switch (step.actionType) {
    case 'START':
      break;

    case 'CITIZEN_SOS': {
      const payload = step.payload;
      if (payload && payload.coordinate) {
        const { incident } = createIncident(
          {
            citizenId: 'CIT-SIH-DEMO',
            citizenName: payload.citizenName || 'SIH Demo Citizen',
            citizenPhone: payload.citizenPhone || '+91 98888-00000',
            coordinate: payload.coordinate,
            type: payload.incidentType || 'FLOOD_RESCUE',
            severity: payload.severity || 'HIGH',
            landmark: payload.landmark,
            source: 'SIH_SIMULATION',
            notes: payload.notes,
          },
          nextIncidents.filter((i) => i.status === 'RESOLVED') // allow fresh demo incident
        );

        if (incident) {
          nextIncidents = [incident, ...nextIncidents];
          activeIncId = incident.id;
          notif = `🚨 [${step.timeOffsetLabel}] SOS Created: ${incident.id} (${incident.type}) at ${payload.landmark}`;
        }
      }
      break;
    }

    case 'COORDINATOR_ACKNOWLEDGE': {
      if (activeIncId) {
        nextIncidents = nextIncidents.map((inc) =>
          inc.id === activeIncId ? { ...inc, status: 'ACKNOWLEDGED', updatedAt: new Date().toISOString() } : inc
        );
        notif = `📋 [${step.timeOffsetLabel}] Coordinator acknowledged incident ${activeIncId}.`;
      }
      break;
    }

    case 'DISPATCH_RESPONDER': {
      const inc = nextIncidents.find((i) => i.id === activeIncId) || nextIncidents[0];
      const respId = step.payload?.responderId || 'RESP-SDRF-02';
      const resp = nextResponders.find((r) => r.id === respId) || nextResponders[0];

      if (inc && resp) {
        const { mission, updatedIncident, updatedResponder } = executeDispatch(
          inc,
          resp,
          nextMissions,
          step.payload?.notes
        );

        nextIncidents = nextIncidents.map((i) => (i.id === updatedIncident.id ? updatedIncident : i));
        nextResponders = nextResponders.map((r) => (r.id === updatedResponder.id ? updatedResponder : r));
        nextMissions = [mission, ...nextMissions];
        activeMisId = mission.id;
        activeRespId = resp.id;
        notif = `🚀 [${step.timeOffsetLabel}] Dispatched ${resp.name} to ${inc.id}. Mission: ${mission.id}`;
      }
      break;
    }

    case 'RESPONDER_ACCEPT': {
      const msn = nextMissions.find((m) => m.id === activeMisId);
      const inc = nextIncidents.find((i) => i.id === activeIncId);
      const resp = nextResponders.find((r) => r.id === activeRespId);

      if (msn) {
        const { result } = transitionMissionState(msn, 'ACCEPTED', inc, resp);
        if (result) {
          nextMissions = nextMissions.map((m) => (m.id === result.mission.id ? result.mission : m));
          if (result.updatedIncident) {
            nextIncidents = nextIncidents.map((i) => (i.id === result.updatedIncident!.id ? result.updatedIncident! : i));
          }
          if (result.updatedResponder) {
            nextResponders = nextResponders.map((r) => (r.id === result.updatedResponder!.id ? result.updatedResponder! : r));
          }
          notif = `✅ [${step.timeOffsetLabel}] Responder accepted mission ${msn.id}.`;
        }
      }
      break;
    }

    case 'RESPONDER_START_EN_ROUTE': {
      const msn = nextMissions.find((m) => m.id === activeMisId);
      const inc = nextIncidents.find((i) => i.id === activeIncId);
      const resp = nextResponders.find((r) => r.id === activeRespId);

      if (msn) {
        const { result } = transitionMissionState(msn, 'EN_ROUTE', inc, resp);
        if (result) {
          nextMissions = nextMissions.map((m) => (m.id === result.mission.id ? result.mission : m));
          if (result.updatedIncident) {
            nextIncidents = nextIncidents.map((i) => (i.id === result.updatedIncident!.id ? result.updatedIncident! : i));
          }
          if (result.updatedResponder) {
            nextResponders = nextResponders.map((r) => (r.id === result.updatedResponder!.id ? result.updatedResponder! : r));
          }
          notif = `⚡ [${step.timeOffsetLabel}] Responder en route to emergency location.`;
        }
      }
      break;
    }

    case 'RESPONDER_ARRIVE': {
      const msn = nextMissions.find((m) => m.id === activeMisId);
      const inc = nextIncidents.find((i) => i.id === activeIncId);
      const resp = nextResponders.find((r) => r.id === activeRespId);

      if (msn) {
        const { result } = transitionMissionState(msn, 'ARRIVED', inc, resp);
        if (result) {
          nextMissions = nextMissions.map((m) => (m.id === result.mission.id ? result.mission : m));
          if (result.updatedIncident) {
            nextIncidents = nextIncidents.map((i) => (i.id === result.updatedIncident!.id ? result.updatedIncident! : i));
          }
          if (result.updatedResponder) {
            nextResponders = nextResponders.map((r) => (r.id === result.updatedResponder!.id ? result.updatedResponder! : r));
          }
          notif = `🎯 [${step.timeOffsetLabel}] Responder arrived on-scene at incident location.`;
        }
      }
      break;
    }

    case 'MISSION_RESOLVE': {
      const msn = nextMissions.find((m) => m.id === activeMisId);
      const inc = nextIncidents.find((i) => i.id === activeIncId);
      const resp = nextResponders.find((r) => r.id === activeRespId);

      if (msn) {
        const { result } = transitionMissionState(msn, 'RESOLVED', inc, resp);
        if (result) {
          nextMissions = nextMissions.map((m) => (m.id === result.mission.id ? result.mission : m));
          if (result.updatedIncident) {
            nextIncidents = nextIncidents.map((i) => (i.id === result.updatedIncident!.id ? result.updatedIncident! : i));
          }
          if (result.updatedResponder) {
            nextResponders = nextResponders.map((r) => (r.id === result.updatedResponder!.id ? result.updatedResponder! : r));
          }
          notif = `🏁 [${step.timeOffsetLabel}] Mission & Incident ${activeIncId} fully RESOLVED.`;
        }
      }
      break;
    }
  }

  const nextStepIdx = currentStepIndex + 1;
  const isDone = nextStepIdx >= scenario.steps.length;

  const nextExecutionState: SihExecutionState = {
    ...execState,
    currentStepIndex: nextStepIdx,
    activeIncidentId: activeIncId,
    activeMissionId: activeMisId,
    activeResponderId: activeRespId,
    isComplete: isDone,
    logMessages: [notif, ...execState.logMessages],
  };

  return {
    nextExecutionState,
    updatedIncidents: nextIncidents,
    updatedResponders: nextResponders,
    updatedMissions: nextMissions,
    notification: notif,
  };
}
