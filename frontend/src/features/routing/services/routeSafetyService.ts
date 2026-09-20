import type { RouteResult, Coordinate } from '../types/routing';
import type {
  HazardZone,
  BlockedRoad,
  HazardSeverity,
  SafetyStatus,
  RouteSafetyAssessment,
  HazardIntersection,
  BlockedRoadIntersection,
} from '../types/safety';
import {
  checkLineStringPolygonIntersection,
  checkLineStringBlockedRoadIntersection,
  extractHazardRouteSegments,
} from './geometryUtils';
import { HAZARD_ZONES } from '../data/hazardData';
import { BLOCKED_ROADS } from '../data/blockedRoadData';

export interface SafetyAnalysisOptions {
  blockedRoadToleranceMeters?: number;
}

const SEVERITY_RANK: Record<HazardSeverity, number> = {
  SAFE: 1,
  LOW: 1.5,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Pure function: Evaluates an OSRM road route LineString against disaster hazard zones
 * and physical blocked-road closures.
 *
 * Implements Phase 2 Precedence:
 *   1. Blocked road intersection -> BLOCKED
 *   2. Critical hazard intersection -> UNSAFE
 *   3. High or Moderate hazard intersection -> RISKY
 *   4. Clear route (or only safe assembly zones) -> SAFE
 *
 * Never discards detected hazards when a blocked road is present.
 */
export function evaluateRouteSafety(
  route: RouteResult | null,
  hazards: HazardZone[] = HAZARD_ZONES,
  blockedRoads: BlockedRoad[] = BLOCKED_ROADS,
  options: SafetyAnalysisOptions = {}
): RouteSafetyAssessment {
  const evaluatedAt = new Date().toISOString();
  const tolerance = options.blockedRoadToleranceMeters ?? 25;

  const activeHazards = hazards.filter((h) => h.isActive !== false);
  const activeBlockedRoads = blockedRoads.filter((r) => r.isActive !== false);

  // 1. Guard against null or failed routes
  if (!route || route.status !== 'success' || !route.coordinates || route.coordinates.length < 2) {
    const isErrorState = route?.status === 'error';
    return {
      routeFound: false,
      distanceKm: route?.distanceMeters ? Number((route.distanceMeters / 1000).toFixed(2)) : 0,
      durationMinutes: route?.durationSeconds ? Math.round(route.durationSeconds / 60) : 0,
      safetyStatus: 'SAFE',
      highestHazardSeverity: 'NONE',
      blockedRoad: false,
      hazardsChecked: activeHazards.length,
      hazardsIntersected: 0,
      blockedRoadsChecked: activeBlockedRoads.length,
      blockedRoadsIntersected: 0,
      hazardIntersections: [],
      blockedRoadIntersections: [],
      evaluatedAt,
      error: isErrorState
        ? `Cannot analyze safety: Route calculation failed (${route?.error || 'Unknown route error'}).`
        : 'No route available for safety evaluation.',
    };
  }

  const routeCoords = route.coordinates;
  const distanceKm = Number((route.distanceMeters / 1000).toFixed(2));
  const durationMinutes = Math.round(route.durationSeconds / 60);

  const detectedHazards: HazardIntersection[] = [];
  const detectedBlockedRoads: BlockedRoadIntersection[] = [];

  // 2. Geometric Spatial Analysis: Route vs. Active Hazard Zones
  for (const zone of activeHazards) {
    const polyCoords = zone.geometry?.coordinates as Coordinate[][];
    if (!polyCoords || polyCoords.length === 0) {
      console.warn(`[SAFETY] Malformed polygon geometry for hazard ${zone.id}`);
      continue;
    }

    const result = checkLineStringPolygonIntersection(routeCoords, polyCoords);
    if (result.intersects) {
      detectedHazards.push({
        hazardId: zone.id,
        hazardName: zone.name,
        severity: zone.severity,
        description: zone.description,
        intersectionPointsCount: result.totalIntersectionEvidence,
      });
    }
  }

  // 3. Geometric Spatial Analysis: Route vs. Active Blocked Road Closures
  for (const road of activeBlockedRoads) {
    const roadCoords = road.geometry?.coordinates as Coordinate[];
    if (!roadCoords || roadCoords.length < 2) {
      console.warn(`[SAFETY] Malformed LineString geometry for blocked road ${road.id}`);
      continue;
    }

    const result = checkLineStringBlockedRoadIntersection(routeCoords, roadCoords, tolerance);
    if (result.intersects) {
      detectedBlockedRoads.push({
        roadId: road.id,
        roadName: road.name,
        reason: road.reason,
        intersectionPointsCount: result.intersectionCount,
      });
    }
  }

  // 4. Resolve Highest Hazard Severity (independent of blocked road status)
  let highestSeverity: 'NONE' | HazardSeverity = 'NONE';
  let highestRank = 0;

  for (const h of detectedHazards) {
    const rank = SEVERITY_RANK[h.severity] || 0;
    if (rank > highestRank) {
      highestRank = rank;
      highestSeverity = h.severity;
    }
  }

  // 5. Apply Precedence Rules
  let finalStatus: SafetyStatus = 'SAFE';
  const hasBlocked = detectedBlockedRoads.length > 0;
  const hasCritical = detectedHazards.some((h) => h.severity === 'CRITICAL');
  const hasHighOrMod = detectedHazards.some(
    (h) => h.severity === 'HIGH' || h.severity === 'MODERATE'
  );

  if (hasBlocked) {
    // RULE 1: Blocked road physical unavailability
    finalStatus = 'BLOCKED';
  } else if (hasCritical) {
    // RULE 2: Critical danger evacuation no-go zone
    finalStatus = 'UNSAFE';
  } else if (hasHighOrMod) {
    // RULE 3: Moderate or High danger warning
    finalStatus = 'RISKY';
  } else {
    // RULE 4: No meaningful hazard or only SAFE assembly zones
    finalStatus = 'SAFE';
  }

  // 6. Extract hazardous route subsegments for high-contrast map overlay
  const hazardSegmentsGeoJSON = extractHazardRouteSegments(
    routeCoords,
    hazards,
    blockedRoads,
    tolerance
  );

  console.group('[SAFETY] Spatial Safety Assessment Completed');
  console.log('Final Safety Status:', finalStatus);
  console.log('Highest Hazard Severity:', highestSeverity);
  console.log('Blocked Roads Intersected:', detectedBlockedRoads.length);
  console.log('Hazards Intersected:', detectedHazards.length);
  console.groupEnd();

  return {
    routeFound: true,
    distanceKm,
    durationMinutes,
    safetyStatus: finalStatus,
    highestHazardSeverity: highestSeverity,
    blockedRoad: hasBlocked,
    hazardsChecked: hazards.length,
    hazardsIntersected: detectedHazards.length,
    blockedRoadsChecked: blockedRoads.length,
    blockedRoadsIntersected: detectedBlockedRoads.length,
    hazardIntersections: detectedHazards,
    blockedRoadIntersections: detectedBlockedRoads,
    hazardSegmentsGeoJSON,
    evaluatedAt,
  };
}
