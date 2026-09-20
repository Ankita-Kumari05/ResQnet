import type { RouteCandidate, SelectionReasonCode } from './candidates';
import type { RouteSafetyAssessment, HazardIntersection } from './safety';
import type { Coordinate } from './routing';

export type RoutingMode = 'NORMAL_ROUTE' | 'HAZARD_AVOIDING_DETOUR' | 'NO_SAFE_ROUTE';
export type DecisionStatus = 'IDLE' | 'CALCULATING' | 'ROUTE_FOUND' | 'NO_SAFE_ROUTE' | 'ERROR';

/**
 * Single Authoritative Routing Decision State for ResQnet.
 * All UI panels, map rendering, and debug diagnostics must consume this canonical object.
 */
export interface RoutingDecision {
  status: DecisionStatus;
  routingMode: RoutingMode;
  start: Coordinate | null;
  destination: Coordinate | null;

  // Initial road route analysis (Phase 1 & 2)
  initialRoute: RouteCandidate | null;
  initialSafety: RouteSafetyAssessment | null;
  hazardsIntersected: HazardIntersection[];
  isInitialSafe: boolean;

  // Active Detour Evaluation (Phase 4)
  detourAttempts: number;
  detourCandidates: RouteCandidate[];
  safeDetoursCount: number;

  // Multi-candidate Selection Breakdown (Phase 3)
  allCandidates: RouteCandidate[];
  safeCandidatesCount: number;
  moderateRiskCandidatesCount: number;
  highRiskCandidatesCount: number;
  rejectedCandidatesCount: number;

  // Final Decision (Single Source of Truth)
  selectedRoute: RouteCandidate | null;
  visualTier?: 'SAFE' | 'LOWER_RISK' | 'UNSAFE_FALLBACK' | 'NONE';
  finalSafety: RouteSafetyAssessment | null;
  reasonCode: SelectionReasonCode;
  explanation: string;
  saferDespiteLonger: boolean;
  isSyntheticFixture: boolean;
}
