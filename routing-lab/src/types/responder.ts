import type { Coordinate } from './routing';

export type ResponderStatus =
  | 'AVAILABLE'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'ON_SCENE'
  | 'BUSY'
  | 'OFFLINE';

export type ResponderType =
  | 'NDRF_RESCUE'
  | 'SDRF_QUICK_RESPONSE'
  | 'PARAMEDIC_AMBULANCE'
  | 'FIRE_RESCUE'
  | 'CIVIL_DEFENSE';

export interface Responder {
  id: string; // e.g. "RESP-NDRF-01"
  name: string;
  unitCode: string;
  organization: string;
  type: ResponderType;
  contactNumber: string;
  status: ResponderStatus;
  currentGpsPosition: Coordinate; // [lng, lat]
  stationName: string;
  lastGpsUpdate: string;
  activeMissionId?: string;
  activeIncidentId?: string;
  activeWorkload: number; // count of currently assigned ongoing tasks
}
