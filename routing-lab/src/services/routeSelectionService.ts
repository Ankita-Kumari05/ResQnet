import type { RouteCandidate, RouteSelectionResult, SelectionReasonCode } from '../types/candidates';

/**
 * Pure Functional Route Selection Service.
 * Implements Phase 3 Lexicographic Decision Engine:
 *   SAFETY FIRST. DISTANCE SECOND.
 *
 * Rules:
 *  1. Reject BLOCKED and UNSAFE (CRITICAL) routes completely.
 *  2. If SAFE candidate(s) exist, choose the shortest SAFE route.
 *     - Flag saferDespiteLonger = true if a shorter risky candidate exists.
 *  3. If no SAFE route exists, choose shortest MODERATE-risk candidate.
 *  4. If only HIGH-risk, CRITICAL, or BLOCKED candidates exist, return NO_SAFE_ROUTE.
 *  5. Never claim multiple-candidate comparison when only one was provided.
 */
export function selectSafestRoute(
  candidates: RouteCandidate[],
  isSyntheticFixture: boolean = false
): RouteSelectionResult {
  if (!candidates || candidates.length === 0) {
    return {
      candidates: [],
      selectedRoute: null,
      safeCandidatesCount: 0,
      moderateRiskCandidatesCount: 0,
      highRiskCandidatesCount: 0,
      rejectedCandidatesCount: 0,
      reasonCode: 'NO_SAFE_ROUTE',
      explanation: 'No route candidates provided for evaluation.',
      saferDespiteLonger: false,
      isSyntheticFixture,
    };
  }

  // 1. Categorize candidates into safety tiers
  const safeCandidates: RouteCandidate[] = [];
  const moderateCandidates: RouteCandidate[] = [];
  const highRiskCandidates: RouteCandidate[] = [];
  const rejectedCandidates: RouteCandidate[] = [];

  for (const c of candidates) {
    const status = c.safetyAssessment.safetyStatus;
    const highestSev = c.safetyAssessment.highestHazardSeverity;

    if (status === 'BLOCKED' || status === 'UNSAFE' || highestSev === 'CRITICAL' || c.safetyAssessment.blockedRoad) {
      rejectedCandidates.push(c);
    } else if (status === 'SAFE' && (highestSev === 'NONE' || highestSev === 'SAFE')) {
      safeCandidates.push(c);
    } else if (status === 'RISKY' && (highestSev === 'MODERATE' || highestSev === 'NONE' || highestSev === 'SAFE')) {
      moderateCandidates.push(c);
    } else if (status === 'RISKY' && highestSev === 'HIGH') {
      highRiskCandidates.push(c);
    } else {
      // Any other uncategorized risky route
      highRiskCandidates.push(c);
    }
  }

  // Sort each tier by distance ascending (shortest first)
  safeCandidates.sort((a, b) => a.distanceKm - b.distanceKm);
  moderateCandidates.sort((a, b) => a.distanceKm - b.distanceKm);
  highRiskCandidates.sort((a, b) => a.distanceKm - b.distanceKm);
  rejectedCandidates.sort((a, b) => a.distanceKm - b.distanceKm);

  let selected: RouteCandidate | null = null;
  let visualTier: 'SAFE' | 'LOWER_RISK' | 'UNSAFE_FALLBACK' | 'NONE' = 'NONE';
  let reasonCode: SelectionReasonCode = 'NO_USABLE_ROUTE';
  let explanation = '';
  let saferDespiteLonger = false;
  let distanceDifferenceKm: number | undefined = undefined;

  // 2. Decision Logic
  // STEP 1 — CHECK SAFE ROUTES: Shortest SAFE route wins -> BLUE
  if (safeCandidates.length > 0) {
    selected = safeCandidates[0];
    visualTier = 'SAFE';

    // Check if there is any shorter candidate in a risky/rejected tier
    const otherCandidates = [...moderateCandidates, ...highRiskCandidates, ...rejectedCandidates];
    const shorterRisky = otherCandidates.filter((r) => r.distanceKm < selected!.distanceKm);

    if (selected.isDetour) {
      reasonCode = 'SAFE_DETOUR_SELECTED';
      saferDespiteLonger = true;
      if (shorterRisky.length > 0) {
        const shortestOther = shorterRisky.sort((a, b) => a.distanceKm - b.distanceKm)[0];
        distanceDifferenceKm = Number((selected.distanceKm - shortestOther.distanceKm).toFixed(2));
      }
      explanation = `Safe detour selected. Route ${selected.label} (${selected.distanceKm} km, SAFE) routes safely around disaster hazards.`;
    } else if (shorterRisky.length > 0) {
      const shortestOther = shorterRisky.sort((a, b) => a.distanceKm - b.distanceKm)[0];
      reasonCode = 'SAFE_ROUTE_SELECTED';
      saferDespiteLonger = true;
      distanceDifferenceKm = Number((selected.distanceKm - shortestOther.distanceKm).toFixed(2));
      explanation = `Safer route selected despite longer distance. Route ${selected.label} (${selected.distanceKm} km, SAFE) prioritizes life safety over shorter hazardous options (${shortestOther.distanceKm} km, ${shortestOther.safetyAssessment.safetyStatus}).`;
    } else if (candidates.length === 1) {
      reasonCode = 'ONLY_CANDIDATE_AVAILABLE';
      saferDespiteLonger = false;
      explanation = `Direct road route (${selected.distanceKm} km, SAFE) selected.`;
    } else if (safeCandidates.length > 1) {
      reasonCode = 'SAFE_ROUTE_SHORTER';
      saferDespiteLonger = false;
      explanation = `Shortest safe route selected. Route ${selected.label} (${selected.distanceKm} km) is the most efficient among ${safeCandidates.length} SAFE alternatives.`;
    } else {
      reasonCode = 'SAFE_ROUTE_SELECTED';
      saferDespiteLonger = false;
      explanation = `Route ${selected.label} (${selected.distanceKm} km, SAFE) selected as the verified safe corridor.`;
    }
  }
  // STEP 2 — IF NO SAFE ROUTE: Lowest-risk usable route (LOW > MODERATE) -> GREEN
  else if (moderateCandidates.length > 0) {
    selected = moderateCandidates[0];
    visualTier = 'LOWER_RISK';
    reasonCode = 'MODERATE_RISK_ROUTE_SELECTED';
    explanation = `Safest available route selected. Route ${selected.label} (${selected.distanceKm} km, MODERATE risk) is the best available lower-risk option when no completely safe route exists.`;
    saferDespiteLonger = false;
  }
  // STEP 3 — IF NO SAFE OR LOWER-RISK ROUTE: Shortest physically usable unsafe fallback -> PINK
  else if (highRiskCandidates.length > 0) {
    selected = highRiskCandidates[0];
    visualTier = 'UNSAFE_FALLBACK';
    reasonCode = 'UNSAFE_FALLBACK_SELECTED';
    explanation = `No safe route is currently available. Route ${selected.label} (${selected.distanceKm} km, HIGH risk) is the shortest usable option and may contain hazards.`;
    saferDespiteLonger = false;
  }
  // STEP 4 — ALL ROUTES ARE BLOCKED OR CRITICAL -> NO USABLE ROUTE
  else {
    selected = null;
    visualTier = 'NONE';
    reasonCode = 'NO_USABLE_ROUTE';
    saferDespiteLonger = false;
    explanation = 'No usable road route is currently available. All corridors traverse critical hazard zones or physical road closures.';
  }

  // Find least-risk candidate for operator diagnostics if no safe route was selected
  const leastRiskCandidate =
    selected ??
    (moderateCandidates.length > 0
      ? moderateCandidates[0]
      : highRiskCandidates.length > 0
      ? highRiskCandidates[0]
      : rejectedCandidates.length > 0
      ? rejectedCandidates[0]
      : null);

  // 3. Mark isSelected, visualTier, and selectionRank across all candidates
  const orderedList: RouteCandidate[] = [
    ...safeCandidates,
    ...moderateCandidates,
    ...highRiskCandidates,
    ...rejectedCandidates,
  ];

  const candidateMap = new Map<string, { rank: number; isSelected: boolean }>();
  orderedList.forEach((c, idx) => {
    candidateMap.set(c.id, {
      rank: idx + 1,
      isSelected: selected !== null && c.id === selected.id,
    });
  });

  const updatedCandidates: RouteCandidate[] = candidates.map((c) => {
    const meta = candidateMap.get(c.id);
    const isThisSelected = meta?.isSelected ?? false;
    return {
      ...c,
      isSelected: isThisSelected,
      selectionRank: meta?.rank,
      visualTier: isThisSelected ? visualTier : undefined,
    };
  });

  const finalSelected = updatedCandidates.find((c) => c.isSelected) ?? null;

  return {
    candidates: updatedCandidates,
    selectedRoute: finalSelected,
    visualTier,
    safeCandidatesCount: safeCandidates.length,
    moderateRiskCandidatesCount: moderateCandidates.length,
    highRiskCandidatesCount: highRiskCandidates.length,
    rejectedCandidatesCount: rejectedCandidates.length,
    reasonCode,
    explanation,
    saferDespiteLonger,
    distanceDifferenceKm,
    isSyntheticFixture,
    leastRiskCandidate,
  };
}
