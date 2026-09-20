import type { RouteCandidate } from './candidates';
import type { Coordinate } from './routing';
import type { RoutingMode } from './routingDecision';
export type { RoutingMode };

export interface DetourAttempt {
  hazardId: string;
  corridorLabel: string;
  waypoints: Coordinate[];
  generatedRoute: RouteCandidate | null;
  status: 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED' | 'FAILED';
}

export interface DetourExecutionResult {
  routingMode: RoutingMode;
  initialCandidates: RouteCandidate[];
  detourCandidates: RouteCandidate[];
  allCandidates: RouteCandidate[];
  selectedRoute: RouteCandidate | null;
  hazardsRequiringAvoidance: string[];
  attemptsCount: number;
  safeDetoursCount: number;
  reason: string;
  isSyntheticFixture: boolean;
}

export interface Phase4Scenario {
  id: string;
  scenarioNumber: number;
  name: string;
  shortLabel: string;
  description: string;
  isRealOSRM: boolean;
  start: Coordinate;
  destination: Coordinate;
  expectedRoutingMode: RoutingMode;
  expectedSelectedId: string | null;
  expectedReasonCode: string;
  initialRouteFixture?: {
    id: string;
    label: string;
    distanceKm: number;
    durationMinutes: number;
    safetyStatus: 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED';
    highestHazardSeverity: 'NONE' | 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    blockedRoad: boolean;
    coordinates: Coordinate[];
    intersectedHazards: string[];
  };
  detourFixtures?: Array<{
    id: string;
    label: string;
    distanceKm: number;
    durationMinutes: number;
    safetyStatus: 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED';
    highestHazardSeverity: 'NONE' | 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    blockedRoad: boolean;
    coordinates: Coordinate[];
  }>;
}
