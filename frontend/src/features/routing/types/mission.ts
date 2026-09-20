import type { Coordinate } from './routing';

export type MissionStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'RESOLVED'
  | 'ABORTED';

export type MissionPriority = 'URGENT' | 'HIGH' | 'STANDARD';

export interface Mission {
  id: string; // e.g. "MIS-2026-001"
  incidentId: string;
  responderId: string;
  responderName: string;
  responderUnit: string;
  citizenName: string;
  citizenPhone: string;
  priority: MissionPriority;
  status: MissionStatus;
  startLocation: Coordinate; // Responder initial location [lng, lat]
  destination: Coordinate; // Incident location [lng, lat]
  notes?: string;
  assignedAt: string;
  acceptedAt?: string;
  enRouteAt?: string;
  arrivedAt?: string;
  resolvedAt?: string;
  abortedAt?: string;
}
