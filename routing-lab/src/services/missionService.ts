import type { Mission, MissionStatus } from '../types/mission';
import type { Incident } from '../types/incident';
import type { Responder } from '../types/responder';

export interface MissionTransitionResult {
  mission: Mission;
  updatedIncident?: Incident;
  updatedResponder?: Responder;
}

/**
 * Validates whether a requested transition is permitted by the state machine.
 */
export function isValidMissionTransition(
  currentStatus: MissionStatus,
  targetStatus: MissionStatus
): boolean {
  switch (currentStatus) {
    case 'ASSIGNED':
      return targetStatus === 'ACCEPTED' || targetStatus === 'EN_ROUTE' || targetStatus === 'ABORTED';
    case 'ACCEPTED':
      return targetStatus === 'EN_ROUTE' || targetStatus === 'ABORTED';
    case 'EN_ROUTE':
      return targetStatus === 'ARRIVED' || targetStatus === 'RESOLVED' || targetStatus === 'ABORTED';
    case 'ARRIVED':
      return targetStatus === 'RESOLVED' || targetStatus === 'ABORTED';
    case 'RESOLVED':
    case 'ABORTED':
    default:
      return false; // Terminal states
  }
}

/**
 * Executes a mission state transition, synchronizing incident and responder states.
 */
export function transitionMissionState(
  mission: Mission,
  targetStatus: MissionStatus,
  incident?: Incident,
  responder?: Responder
): { result: MissionTransitionResult | null; error?: string } {
  if (!isValidMissionTransition(mission.status, targetStatus)) {
    return {
      result: null,
      error: `Invalid mission state transition from ${mission.status} to ${targetStatus}.`,
    };
  }

  const timestamp = new Date().toISOString();
  const updatedMission: Mission = {
    ...mission,
    status: targetStatus,
  };

  let updatedIncident = incident ? { ...incident, updatedAt: timestamp } : undefined;
  let updatedResponder = responder ? { ...responder } : undefined;

  switch (targetStatus) {
    case 'ACCEPTED':
      updatedMission.acceptedAt = timestamp;
      if (updatedIncident) {
        updatedIncident.status = 'IN_PROGRESS';
      }
      break;

    case 'EN_ROUTE':
      updatedMission.enRouteAt = timestamp;
      if (updatedIncident) {
        updatedIncident.status = 'IN_PROGRESS';
      }
      if (updatedResponder) {
        updatedResponder.status = 'EN_ROUTE';
      }
      break;

    case 'ARRIVED':
      updatedMission.arrivedAt = timestamp;
      if (updatedIncident) {
        updatedIncident.status = 'RESPONDER_ARRIVED';
        updatedIncident.arrivedAt = timestamp;
      }
      if (updatedResponder) {
        updatedResponder.status = 'ON_SCENE';
      }
      break;

    case 'RESOLVED':
      updatedMission.resolvedAt = timestamp;
      if (updatedIncident) {
        updatedIncident.status = 'RESOLVED';
        updatedIncident.resolvedAt = timestamp;
      }
      if (updatedResponder) {
        updatedResponder.status = 'AVAILABLE';
        updatedResponder.activeMissionId = undefined;
        updatedResponder.activeIncidentId = undefined;
        updatedResponder.activeWorkload = Math.max(0, updatedResponder.activeWorkload - 1);
      }
      break;

    case 'ABORTED':
      updatedMission.abortedAt = timestamp;
      if (updatedIncident) {
        updatedIncident.status = 'OPEN';
        updatedIncident.assignedResponderId = undefined;
        updatedIncident.assignedResponderName = undefined;
        updatedIncident.assignedMissionId = undefined;
      }
      if (updatedResponder) {
        updatedResponder.status = 'AVAILABLE';
        updatedResponder.activeMissionId = undefined;
        updatedResponder.activeIncidentId = undefined;
        updatedResponder.activeWorkload = Math.max(0, updatedResponder.activeWorkload - 1);
      }
      break;
  }

  return {
    result: {
      mission: updatedMission,
      updatedIncident,
      updatedResponder,
    },
  };
}
