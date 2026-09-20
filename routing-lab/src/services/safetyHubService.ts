import type { Coordinate } from '../types/routing';
import type { SafetyHub, SafetyHubEligibility } from '../types/safetyHub';
import { checkSafetyHubEligibility } from '../types/safetyHub';
import type { HazardZone, BlockedRoad } from '../types/safety';
import { getRouteCandidates } from './routingService';
import { evaluateRouteSafety } from './routeSafetyService';
import { generateSafeDetours } from './detourService';
import { buildRoutingDecision } from './routingDecisionService';
import type { RouteCandidate } from '../types/candidates';
import type { RoutingDecision } from '../types/routingDecision';

export interface BestHubEvaluationItem {
  hub: SafetyHub;
  eligibility: SafetyHubEligibility;
  isReachable: boolean;
  distanceKm: number;
  durationMinutes: number;
  safetyStatus: 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED';
  score: number;
  decision?: RoutingDecision;
  rejectionReason?: string;
}

export interface BestHubSearchResult {
  selectedHub: SafetyHub | null;
  decision: RoutingDecision | null;
  evaluations: BestHubEvaluationItem[];
  eligibleCount: number;
  totalCount: number;
  summary: string;
}

/**
 * Evaluates all known Safety Hubs and finds the best eligible, reachable, and safe hub.
 */
export async function findBestSafeSafetyHub(
  originCoord: Coordinate,
  hubs: SafetyHub[],
  hazards: HazardZone[],
  blockedRoads: BlockedRoad[]
): Promise<BestHubSearchResult> {
  const totalCount = hubs.length;
  const eligibleHubs = hubs.filter((h) => checkSafetyHubEligibility(h).isEligible);
  const eligibleCount = eligibleHubs.length;

  if (eligibleCount === 0) {
    return {
      selectedHub: null,
      decision: null,
      evaluations: hubs.map((h) => ({
        hub: h,
        eligibility: checkSafetyHubEligibility(h),
        isReachable: false,
        distanceKm: 0,
        durationMinutes: 0,
        safetyStatus: 'BLOCKED',
        score: -999,
        rejectionReason: checkSafetyHubEligibility(h).rejectionReason || 'Ineligible hub',
      })),
      eligibleCount: 0,
      totalCount,
      summary: 'No eligible Safety Hubs found (all hubs are CLOSED, FULL, or UNVERIFIED).',
    };
  }

  const evaluations: BestHubEvaluationItem[] = [];

  for (const hub of eligibleHubs) {
    const eligibility = checkSafetyHubEligibility(hub);

    const destCoord = hub.entranceCoordinate || hub.coordinate;

    try {
      const candidatesFetch = await getRouteCandidates(originCoord, destCoord);

      if (candidatesFetch.status !== 'success' || candidatesFetch.routes.length === 0) {
        evaluations.push({
          hub,
          eligibility,
          isReachable: false,
          distanceKm: 999,
          durationMinutes: 999,
          safetyStatus: 'BLOCKED',
          score: -500,
          rejectionReason: 'No road route found via OSRM',
        });
        continue;
      }

      const initialCandidates = candidatesFetch.routes.map((r, idx) => {
        const safety = evaluateRouteSafety(r, hazards, blockedRoads);
        return {
          id: `candidate-${idx + 1}`,
          label: `Direct to ${hub.name}`,
          geometry: r.geometry,
          coordinates: r.coordinates,
          distanceMeters: r.distanceMeters,
          distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
          durationSeconds: r.durationSeconds,
          durationMinutes: Math.round(r.durationSeconds / 60),
          safetyAssessment: safety,
          isSelected: false,
          isOriginalRisky: safety.safetyStatus !== 'SAFE',
        };
      });

      const allBlockedRoadIds = new Set<string>();
      const allHazardIds = new Set<string>();
      initialCandidates.forEach((c) => {
        c.safetyAssessment.blockedRoadIntersections.forEach((b) => allBlockedRoadIds.add(b.roadId));
        c.safetyAssessment.hazardIntersections.forEach((h) => allHazardIds.add(h.hazardId));
      });

      let detourCandidates: RouteCandidate[] = [];
      let detourAttempts = 0;

      if (allBlockedRoadIds.size > 0 || allHazardIds.size > 0) {
        const detourGen = await generateSafeDetours(
          originCoord,
          destCoord,
          {
            hazardIds: Array.from(allHazardIds),
            blockedRoadIds: Array.from(allBlockedRoadIds),
          },
          hazards,
          blockedRoads
        );
        detourCandidates = detourGen.detourCandidates;
        detourAttempts = detourGen.attemptsCount;
      }

      const decision = buildRoutingDecision({
        start: originCoord,
        destination: destCoord,
        initialCandidates,
        detourAttempts,
        detourCandidates,
        isSyntheticFixture: false,
      });

      const selectedRoute = decision.selectedRoute;
      const isSafe = selectedRoute && selectedRoute.safetyAssessment.safetyStatus === 'SAFE';
      const isBlocked = !selectedRoute || selectedRoute.safetyAssessment.blockedRoad;
      const distKm = selectedRoute ? selectedRoute.distanceKm : 999;
      const durMin = selectedRoute ? selectedRoute.durationMinutes : 999;

      // Scoring formula:
      // High base for SAFE (+1000)
      // Available capacity bonus (+available / 10)
      // Distance penalty (-distKm * 10)
      let score = 0;
      if (isSafe) {
        score += 1000;
      } else if (!isBlocked) {
        score += 400;
      } else {
        score -= 200;
      }

      score += Math.min(100, hub.availableCapacity / 10);
      score -= distKm * 15;

      evaluations.push({
        hub,
        eligibility,
        isReachable: Boolean(selectedRoute),
        distanceKm: distKm,
        durationMinutes: durMin,
        safetyStatus: selectedRoute ? selectedRoute.safetyAssessment.safetyStatus : 'BLOCKED',
        score,
        decision,
      });
    } catch (err) {
      console.warn(`[SAFETY HUB SERVICE] Error routing to ${hub.name}:`, err);
      evaluations.push({
        hub,
        eligibility,
        isReachable: false,
        distanceKm: 999,
        durationMinutes: 999,
        safetyStatus: 'BLOCKED',
        score: -999,
        rejectionReason: 'Evaluation exception',
      });
    }
  }

  // Sort descending by score
  evaluations.sort((a, b) => b.score - a.score);

  const best = evaluations.find((e) => e.isReachable && e.decision?.selectedRoute);

  if (!best || !best.decision) {
    return {
      selectedHub: null,
      decision: null,
      evaluations,
      eligibleCount,
      totalCount,
      summary: 'No reachable safe route to any eligible Safety Hub.',
    };
  }

  return {
    selectedHub: best.hub,
    decision: best.decision,
    evaluations,
    eligibleCount,
    totalCount,
    summary: `Selected best safety hub: ${best.hub.name} (${best.distanceKm} km, ${best.hub.availableCapacity} available spaces, ${best.safetyStatus}).`,
  };
}
