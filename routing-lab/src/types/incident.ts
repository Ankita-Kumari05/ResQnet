import type { Coordinate } from './routing';

export type IncidentType =
  | 'SOS'
  | 'MEDICAL_EMERGENCY'
  | 'FLOOD_RESCUE'
  | 'STRUCTURAL_COLLAPSE'
  | 'FIRE_HAZARD'
  | 'EVACUATION_ASSISTANCE';

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export type IncidentStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'RESPONDER_ARRIVED'
  | 'RESOLVED'
  | 'CANCELLED';

export interface IncidentLocation {
  coordinate: Coordinate; // [lng, lat]
  accuracyMeters?: number;
  landmark?: string;
  address?: string;
}

export interface Incident {
  id: string; // e.g. "INC-2026-001"
  citizenId: string;
  citizenName: string;
  citizenPhone: string;
  location: IncidentLocation;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: 'CITIZEN_SOS' | 'COORDINATOR_ENTRY' | 'SIH_SIMULATION';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  notes?: string;
  assignedResponderId?: string;
  assignedResponderName?: string;
  assignedMissionId?: string;
  dispatchedAt?: string;
  arrivedAt?: string;
  resolvedAt?: string;
}
