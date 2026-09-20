import type { Coordinate } from '../types/routing';
import type { Incident, IncidentType, IncidentSeverity } from '../types/incident';

export interface CreateIncidentParams {
  citizenId: string;
  citizenName: string;
  citizenPhone: string;
  coordinate: Coordinate;
  accuracyMeters?: number;
  landmark?: string;
  address?: string;
  type: IncidentType;
  severity: IncidentSeverity;
  source?: 'CITIZEN_SOS' | 'COORDINATOR_ENTRY' | 'SIH_SIMULATION';
  notes?: string;
}

/**
 * Validates coordinate bounds for geographic sanity.
 * Supports realistic Indian/Tri-City bounding area (and valid global coordinates).
 */
export function isValidCoordinate(coord: Coordinate | null | undefined): boolean {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (isNaN(lng) || isNaN(lat)) return false;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return false;
  return true;
}

/**
 * Checks if a citizen already has an active unresolved incident.
 */
export function hasActiveIncidentForCitizen(
  incidents: Incident[],
  citizenId: string
): boolean {
  return incidents.some(
    (inc) =>
      inc.citizenId === citizenId &&
      inc.status !== 'RESOLVED' &&
      inc.status !== 'CANCELLED'
  );
}

/**
 * Creates a validated new incident in the system.
 */
export function createIncident(
  params: CreateIncidentParams,
  existingIncidents: Incident[]
): { incident: Incident | null; error?: string } {
  if (!params.citizenId || !params.citizenName) {
    return { incident: null, error: 'Citizen identification is required.' };
  }

  if (!isValidCoordinate(params.coordinate)) {
    return {
      incident: null,
      error: 'Invalid or missing GPS coordinates. Unable to establish emergency location.',
    };
  }

  if (hasActiveIncidentForCitizen(existingIncidents, params.citizenId)) {
    return {
      incident: null,
      error: 'You already have an active emergency SOS. Please await coordinator response.',
    };
  }

  const timestamp = new Date().toISOString();
  const sequenceNum = existingIncidents.length + 1;
  const id = `INC-${new Date().getFullYear()}-${String(sequenceNum).padStart(3, '0')}`;

  const incident: Incident = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    citizenPhone: params.citizenPhone,
    location: {
      coordinate: [
        Number(params.coordinate[0].toFixed(6)),
        Number(params.coordinate[1].toFixed(6)),
      ],
      accuracyMeters: params.accuracyMeters,
      landmark: params.landmark || 'Identified via GPS',
      address: params.address,
    },
    type: params.type,
    severity: params.severity,
    status: 'OPEN',
    source: params.source || 'CITIZEN_SOS',
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: params.notes,
  };

  return { incident };
}

/**
 * Transitions incident status with validation.
 */
export function updateIncidentStatus(
  incident: Incident,
  newStatus: Incident['status'],
  additionalData?: Partial<Incident>
): Incident {
  return {
    ...incident,
    ...additionalData,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}
