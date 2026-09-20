import type { Incident, IncidentType } from '../types/incident';
import type { Responder, ResponderType } from '../types/responder';
import type { Mission } from '../types/mission';
import { distanceMeters } from './geometryUtils';

export interface RankedResponder {
  responder: Responder;
  distanceKm: number;
  score: number;
  suitabilityReason: string;
  isAvailable: boolean;
}

/**
 * Returns a suitability bonus score (0-40) and explanation for a given incident type and responder type.
 * Deterministic and explainable (NO AI / ML).
 */
export function getSuitabilityScore(
  incidentType: IncidentType,
  responderType: ResponderType
): { bonus: number; reason: string } {
  switch (incidentType) {
    case 'MEDICAL_EMERGENCY':
      if (responderType === 'PARAMEDIC_AMBULANCE') {
        return { bonus: 40, reason: 'Specialized Medical & Trauma Life Support Equipment' };
      }
      if (responderType === 'SDRF_QUICK_RESPONSE' || responderType === 'NDRF_RESCUE') {
        return { bonus: 20, reason: 'First-Aid & Emergency Evacuation Trained' };
      }
      return { bonus: 10, reason: 'General Civil Support Unit' };

    case 'FLOOD_RESCUE':
      if (responderType === 'NDRF_RESCUE' || responderType === 'SDRF_QUICK_RESPONSE') {
        return { bonus: 40, reason: 'Specialized Inflatable Boats & Water Rescue Gear' };
      }
      if (responderType === 'CIVIL_DEFENSE') {
        return { bonus: 25, reason: 'Local Evacuation & Shore Support' };
      }
      return { bonus: 10, reason: 'Secondary Support' };

    case 'STRUCTURAL_COLLAPSE':
      if (responderType === 'NDRF_RESCUE') {
        return { bonus: 40, reason: 'Heavy Urban Search & Rescue (USAR) Cutters & Sensors' };
      }
      if (responderType === 'FIRE_RESCUE' || responderType === 'SDRF_QUICK_RESPONSE') {
        return { bonus: 30, reason: 'Structural Breach & Shoring Equipment' };
      }
      return { bonus: 10, reason: 'Auxiliary Support' };

    case 'FIRE_HAZARD':
      if (responderType === 'FIRE_RESCUE') {
        return { bonus: 40, reason: 'Primary Fire Extinguishment Tender' };
      }
      if (responderType === 'NDRF_RESCUE' || responderType === 'SDRF_QUICK_RESPONSE') {
        return { bonus: 20, reason: 'Perimeter Evacuation & Secondary Foam Support' };
      }
      return { bonus: 10, reason: 'Civil Defense Team' };

    case 'EVACUATION_ASSISTANCE':
    case 'SOS':
    default:
      if (responderType === 'SDRF_QUICK_RESPONSE' || responderType === 'NDRF_RESCUE') {
        return { bonus: 30, reason: 'Rapid Deployment Evacuation Unit' };
      }
      if (responderType === 'CIVIL_DEFENSE') {
        return { bonus: 30, reason: 'Local Community Evacuation Squad' };
      }
      return { bonus: 20, reason: 'Available First Responder' };
  }
}

/**
 * Deterministically ranks all responders for an incident.
 * Criteria:
 *   + 100 Base score if status is 'AVAILABLE' (0 if busy/dispatched/offline)
 *   + 0-40 Unit Suitability Bonus
 *   - 4 points per km distance (proximity)
 *   - 20 points per active ongoing task (workload)
 */
export function rankRespondersForIncident(
  incident: Incident,
  responders: Responder[]
): RankedResponder[] {
  const incCoord = incident.location.coordinate;

  const ranked: RankedResponder[] = responders.map((responder) => {
    const distMeters = distanceMeters(responder.currentGpsPosition, incCoord);
    const distanceKm = Number((distMeters / 1000).toFixed(1));

    const isAvailable = responder.status === 'AVAILABLE';
    const availabilityScore = isAvailable ? 100 : responder.status === 'EN_ROUTE' ? 20 : 0;
    const { bonus, reason } = getSuitabilityScore(incident.type, responder.type);
    const distancePenalty = Math.min(60, distanceKm * 4);
    const workloadPenalty = responder.activeWorkload * 20;

    const totalScore = Math.max(0, Math.round(availabilityScore + bonus - distancePenalty - workloadPenalty));

    return {
      responder,
      distanceKm,
      score: totalScore,
      suitabilityReason: reason,
      isAvailable,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export interface DispatchResult {
  mission: Mission;
  updatedIncident: Incident;
  updatedResponder: Responder;
}

/**
 * Performs coordinator dispatch:
 * 1. Creates a linked Mission
 * 2. Updates Incident to DISPATCHED
 * 3. Updates Responder to DISPATCHED
 */
export function executeDispatch(
  incident: Incident,
  responder: Responder,
  existingMissions: Mission[],
  customNotes?: string
): DispatchResult {
  const timestamp = new Date().toISOString();
  const sequenceNum = existingMissions.length + 1;
  const missionId = `MIS-${new Date().getFullYear()}-${String(sequenceNum).padStart(3, '0')}`;

  const mission: Mission = {
    id: missionId,
    incidentId: incident.id,
    responderId: responder.id,
    responderName: responder.name,
    responderUnit: responder.unitCode,
    citizenName: incident.citizenName,
    citizenPhone: incident.citizenPhone,
    priority: incident.severity === 'CRITICAL' ? 'URGENT' : incident.severity === 'HIGH' ? 'HIGH' : 'STANDARD',
    status: 'ASSIGNED',
    startLocation: responder.currentGpsPosition,
    destination: incident.location.coordinate,
    notes: customNotes || incident.notes,
    assignedAt: timestamp,
  };

  const updatedIncident: Incident = {
    ...incident,
    status: 'DISPATCHED',
    assignedResponderId: responder.id,
    assignedResponderName: responder.name,
    assignedMissionId: missionId,
    dispatchedAt: timestamp,
    updatedAt: timestamp,
  };

  const updatedResponder: Responder = {
    ...responder,
    status: 'DISPATCHED',
    activeMissionId: missionId,
    activeIncidentId: incident.id,
    activeWorkload: responder.activeWorkload + 1,
  };

  return { mission, updatedIncident, updatedResponder };
}
