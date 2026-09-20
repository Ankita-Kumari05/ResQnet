import type { LineString } from 'geojson';
import type { Coordinate } from './routing';
import type { RouteSafetyAssessment } from './safety';

export interface RouteCandidate {
  id: string;
  label: string;
  geometry: LineString;
  coordinates: Coordinate[];
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  safetyAssessment: RouteSafetyAssessment;
  isSelected: boolean;
  selectionRank?: number;
  isDetour?: boolean;
  isOriginalRisky?: boolean;
  detourCorridor?: string;
  // Phase 4 Detour Diagnostics
  bufferMeters?: number;
  waypointsCount?: number;
  osrmStatus?: 'OK' | 'FAILED';
  rejectionReason?: string;
  // Visual Safety Tier: SAFE (Blue), LOWER_RISK (Green), UNSAFE_FALLBACK (Pink), NONE (No line)
  visualTier?: 'SAFE' | 'LOWER_RISK' | 'UNSAFE_FALLBACK' | 'NONE';
}

export type SelectionReasonCode =
  | 'SAFE_DETOUR_SELECTED'
  | 'SAFE_ROUTE_SELECTED'
  | 'SAFE_ROUTE_SHORTER'
  | 'MODERATE_RISK_ROUTE_SELECTED'
  | 'UNSAFE_FALLBACK_SELECTED'
  | 'ONLY_CANDIDATE_AVAILABLE'
  | 'NO_SAFE_ROUTE'
  | 'NO_USABLE_ROUTE';

export interface RouteSelectionResult {
  candidates: RouteCandidate[];
  selectedRoute: RouteCandidate | null;
  visualTier?: 'SAFE' | 'LOWER_RISK' | 'UNSAFE_FALLBACK' | 'NONE';
  safeCandidatesCount: number;
  moderateRiskCandidatesCount: number;
  highRiskCandidatesCount: number;
  rejectedCandidatesCount: number;
  reasonCode: SelectionReasonCode;
  explanation: string;
  saferDespiteLonger: boolean;
  distanceDifferenceKm?: number;
  isSyntheticFixture: boolean;
  leastRiskCandidate?: RouteCandidate | null;
}

export interface Phase3Scenario {
  id: string;
  scenarioNumber: number;
  name: string;
  shortLabel: string;
  description: string;
  isRealOSRM: boolean;
  start: Coordinate;
  destination: Coordinate;
  expectedSelectedId: string | null;
  expectedReasonCode: SelectionReasonCode;
  expectedSaferDespiteLonger: boolean;
  candidateFixtures?: Array<{
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
