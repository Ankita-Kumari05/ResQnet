import type { Coordinate } from './routing';
import type { IncidentType, IncidentSeverity } from './incident';

export interface SihScenarioStep {
  stepIndex: number;
  timeOffsetLabel: string; // e.g. "T+00s", "T+05s"
  title: string;
  description: string;
  actionType:
    | 'START'
    | 'CITIZEN_SOS'
    | 'COORDINATOR_ACKNOWLEDGE'
    | 'DISPATCH_RESPONDER'
    | 'RESPONDER_ACCEPT'
    | 'RESPONDER_START_EN_ROUTE'
    | 'RESPONDER_ARRIVE'
    | 'MISSION_RESOLVE';
  payload?: {
    incidentType?: IncidentType;
    severity?: IncidentSeverity;
    coordinate?: Coordinate;
    landmark?: string;
    citizenName?: string;
    citizenPhone?: string;
    responderId?: string;
    notes?: string;
  };
}

export interface SihScenario {
  id: string;
  name: string;
  description: string;
  targetRegion: string;
  steps: SihScenarioStep[];
}
