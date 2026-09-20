import type { Coordinate } from '../types/routing';
import type { FeatureCollection, Feature, Point } from 'geojson';

const METERS_PER_DEG_LAT = 111040;

function getMetersPerDegLng(latDeg: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return 111320 * Math.cos(rad);
}

/**
 * Computes planar distance in meters between two coordinates.
 */
export function calculateDistanceMeters(p1: Coordinate, p2: Coordinate): number {
  const avgLat = (p1[1] + p2[1]) / 2;
  const metersLng = getMetersPerDegLng(avgLat);
  const dx = (p2[0] - p1[0]) * metersLng;
  const dy = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes geodetic forward bearing (azimuth) from p1 to p2 in degrees (0..360, clockwise from North).
 */
export function calculateBearingDegrees(p1: Coordinate, p2: Coordinate): number {
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLngRad = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLngRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLngRad);

  const bearingRad = Math.atan2(y, x);
  const bearingDeg = (bearingRad * 180) / Math.PI;
  return (bearingDeg + 360) % 360;
}

export interface RouteProjectionResult {
  nearestPoint: Coordinate;
  segmentIndex: number;
  segmentT: number;
  distanceToRouteMeters: number;
  distanceAlongRouteMeters: number;
  totalRouteDistanceMeters: number;
  progressFraction: number;
}

/**
 * Computes the total cumulative length of a route LineString in meters.
 */
export function calculateRouteTotalLengthMeters(routeCoords: Coordinate[]): number {
  if (!routeCoords || routeCoords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    total += calculateDistanceMeters(routeCoords[i], routeCoords[i + 1]);
  }
  return total;
}

/**
 * Projects a GPS coordinate onto the closest segment of a route LineString.
 * Calculates both the perpendicular distance to the route and the distance along the route.
 */
export function projectPointOntoRoute(
  point: Coordinate,
  routeCoords: Coordinate[]
): RouteProjectionResult {
  if (!routeCoords || routeCoords.length < 2) {
    const p = routeCoords && routeCoords.length === 1 ? routeCoords[0] : point;
    return {
      nearestPoint: p,
      segmentIndex: 0,
      segmentT: 0,
      distanceToRouteMeters: calculateDistanceMeters(point, p),
      distanceAlongRouteMeters: 0,
      totalRouteDistanceMeters: 0,
      progressFraction: 0,
    };
  }

  let minPerpDist = Infinity;
  let bestSegIndex = 0;
  let bestT = 0;
  let bestNearestPoint: Coordinate = routeCoords[0];
  let bestDistAlong = 0;

  let cumulativeDistance = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segA = routeCoords[i];
    const segB = routeCoords[i + 1];
    const segLen = calculateDistanceMeters(segA, segB);
    segmentLengths.push(segLen);

    const avgLat = (segA[1] + segB[1]) / 2;
    const metersLng = getMetersPerDegLng(avgLat);

    const px = (point[0] - segA[0]) * metersLng;
    const py = (point[1] - segA[1]) * METERS_PER_DEG_LAT;
    const bx = (segB[0] - segA[0]) * metersLng;
    const by = (segB[1] - segA[1]) * METERS_PER_DEG_LAT;

    const segLenSq = bx * bx + by * by;
    let t = 0;
    if (segLenSq > 1e-6) {
      t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
    }

    const projX = t * bx;
    const projY = t * by;
    const dx = px - projX;
    const dy = py - projY;
    const perpDist = Math.sqrt(dx * dx + dy * dy);

    if (perpDist < minPerpDist) {
      minPerpDist = perpDist;
      bestSegIndex = i;
      bestT = t;
      bestNearestPoint = [
        segA[0] + t * (segB[0] - segA[0]),
        segA[1] + t * (segB[1] - segA[1]),
      ];
      bestDistAlong = cumulativeDistance + t * segLen;
    }

    cumulativeDistance += segLen;
  }

  const totalRouteLength = cumulativeDistance;
  const progressFraction = totalRouteLength > 0 ? Math.min(1, bestDistAlong / totalRouteLength) : 0;

  return {
    nearestPoint: bestNearestPoint,
    segmentIndex: bestSegIndex,
    segmentT: bestT,
    distanceToRouteMeters: minPerpDist,
    distanceAlongRouteMeters: bestDistAlong,
    totalRouteDistanceMeters: totalRouteLength,
    progressFraction,
  };
}

/**
 * Extracts the remaining route LineString starting from a given distance along the route.
 * Replaces the travelled section with the exact projected start coordinate.
 */
export function calculateRemainingRoute(
  routeCoords: Coordinate[],
  distanceAlongRoute: number
): Coordinate[] {
  if (!routeCoords || routeCoords.length < 2) return routeCoords || [];
  if (distanceAlongRoute <= 0) return [...routeCoords];

  let accumulatedDist = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segA = routeCoords[i];
    const segB = routeCoords[i + 1];
    const segLen = calculateDistanceMeters(segA, segB);

    if (accumulatedDist + segLen >= distanceAlongRoute) {
      // The split point lies on this segment
      const remainingOnSeg = distanceAlongRoute - accumulatedDist;
      const t = segLen > 0 ? Math.max(0, Math.min(1, remainingOnSeg / segLen)) : 0;

      const splitPoint: Coordinate = [
        segA[0] + t * (segB[0] - segA[0]),
        segA[1] + t * (segB[1] - segA[1]),
      ];

      // Return splitPoint followed by all remaining route vertices
      return [splitPoint, ...routeCoords.slice(i + 1)];
    }

    accumulatedDist += segLen;
  }

  // If distanceAlongRoute exceeds route length, return just the final destination point
  return [routeCoords[routeCoords.length - 1]];
}

export interface DirectionArrowFeatureProperties {
  bearing: number;
  segmentIndex: number;
  distanceAlongMeters: number;
}

/**
 * Generates directional arrow Point features along the given route LineString.
 * Arrows follow the actual road geometry and are oriented along local segment bearings.
 *
 * @param routeCoords LineString vertices (usually the remaining route)
 * @param spacingMeters Interval between directional arrows in meters (default: 85m)
 * @param startOffsetMeters Initial margin from the start of the line (default: 35m)
 */
export function generateDirectionArrowFeatures(
  routeCoords: Coordinate[],
  spacingMeters: number = 85,
  startOffsetMeters: number = 35
): FeatureCollection<Point, DirectionArrowFeatureProperties> {
  const features: Feature<Point, DirectionArrowFeatureProperties>[] = [];

  if (!routeCoords || routeCoords.length < 2) {
    return {
      type: 'FeatureCollection',
      features,
    };
  }

  const totalLength = calculateRouteTotalLengthMeters(routeCoords);
  if (totalLength < startOffsetMeters + 20) {
    // If route is very short, place a single arrow at the midpoint if length > 25m
    if (totalLength >= 25) {
      const midBearing = calculateBearingDegrees(routeCoords[0], routeCoords[routeCoords.length - 1]);
      const midPoint: Coordinate = [
        (routeCoords[0][0] + routeCoords[routeCoords.length - 1][0]) / 2,
        (routeCoords[0][1] + routeCoords[routeCoords.length - 1][1]) / 2,
      ];
      features.push({
        type: 'Feature',
        properties: {
          bearing: midBearing,
          segmentIndex: 0,
          distanceAlongMeters: totalLength / 2,
        },
        geometry: {
          type: 'Point',
          coordinates: midPoint,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  let nextTargetDistance = startOffsetMeters;
  let accumulatedDist = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segA = routeCoords[i];
    const segB = routeCoords[i + 1];
    const segLen = calculateDistanceMeters(segA, segB);

    if (segLen < 1e-3) continue;

    const segBearing = calculateBearingDegrees(segA, segB);

    while (
      nextTargetDistance >= accumulatedDist &&
      nextTargetDistance <= accumulatedDist + segLen &&
      nextTargetDistance <= totalLength - 20
    ) {
      const distOnSeg = nextTargetDistance - accumulatedDist;
      const t = distOnSeg / segLen;
      const arrowPoint: Coordinate = [
        segA[0] + t * (segB[0] - segA[0]),
        segA[1] + t * (segB[1] - segA[1]),
      ];

      features.push({
        type: 'Feature',
        properties: {
          bearing: segBearing,
          segmentIndex: i,
          distanceAlongMeters: Math.round(nextTargetDistance),
        },
        geometry: {
          type: 'Point',
          coordinates: arrowPoint,
        },
      });

      nextTargetDistance += spacingMeters;
    }

    accumulatedDist += segLen;
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export type LiveNavigationStatus = 'IDLE' | 'ON_ROUTE' | 'OFF_ROUTE' | 'ARRIVED';

export interface GpsNavigationEvaluation {
  status: LiveNavigationStatus;
  nearestPointOnRoute: Coordinate;
  distanceToRouteMeters: number;
  distanceToDestinationMeters: number;
  currentProgressMeters: number;
  maxProgressMeters: number;
  progressFraction: number;
  remainingCoordinates: Coordinate[];
  remainingDistanceMeters: number;
  arrowFeatures: FeatureCollection<Point, DirectionArrowFeatureProperties>;
  isOffRoute: boolean;
  isArrived: boolean;
  explanation: string;
}

export const NAV_CONFIG = {
  OFF_ROUTE_THRESHOLD_METERS: 65, // Max distance from route before marking OFF_ROUTE
  ARRIVAL_THRESHOLD_METERS: 30, // Distance to destination to declare ARRIVED
  ARROW_SPACING_METERS: 85, // Spatial interval between arrows
  ARROW_START_OFFSET_METERS: 35, // Distance from front before first arrow
};

/**
 * Evaluates live GPS position against active route geometry with monotonic progress smoothing.
 *
 * @param gpsCoord Current GPS position [lng, lat]
 * @param routeCoords Full active route LineString coordinates
 * @param previousMaxProgressMeters Furthest progress distance achieved on this trip
 * @param options Configurable tolerances
 */
export function evaluateGpsRouteProgress(
  gpsCoord: Coordinate,
  routeCoords: Coordinate[],
  previousMaxProgressMeters: number = 0,
  options?: {
    offRouteThresholdMeters?: number;
    arrivalThresholdMeters?: number;
    arrowSpacingMeters?: number;
  }
): GpsNavigationEvaluation {
  const offRouteThreshold = options?.offRouteThresholdMeters ?? NAV_CONFIG.OFF_ROUTE_THRESHOLD_METERS;
  const arrivalThreshold = options?.arrivalThresholdMeters ?? NAV_CONFIG.ARRIVAL_THRESHOLD_METERS;
  const arrowSpacing = options?.arrowSpacingMeters ?? NAV_CONFIG.ARROW_SPACING_METERS;

  if (!routeCoords || routeCoords.length < 2) {
    return {
      status: 'IDLE',
      nearestPointOnRoute: gpsCoord,
      distanceToRouteMeters: 0,
      distanceToDestinationMeters: 0,
      currentProgressMeters: 0,
      maxProgressMeters: 0,
      progressFraction: 0,
      remainingCoordinates: routeCoords || [],
      remainingDistanceMeters: 0,
      arrowFeatures: { type: 'FeatureCollection', features: [] },
      isOffRoute: false,
      isArrived: false,
      explanation: 'No active route to evaluate progress against.',
    };
  }

  const destinationCoord = routeCoords[routeCoords.length - 1];
  const distanceToDest = calculateDistanceMeters(gpsCoord, destinationCoord);
  const totalLength = calculateRouteTotalLengthMeters(routeCoords);

  // 1. Destination Arrival Check
  if (distanceToDest <= arrivalThreshold) {
    return {
      status: 'ARRIVED',
      nearestPointOnRoute: destinationCoord,
      distanceToRouteMeters: 0,
      distanceToDestinationMeters: distanceToDest,
      currentProgressMeters: totalLength,
      maxProgressMeters: totalLength,
      progressFraction: 1.0,
      remainingCoordinates: [],
      remainingDistanceMeters: 0,
      arrowFeatures: { type: 'FeatureCollection', features: [] },
      isOffRoute: false,
      isArrived: true,
      explanation: 'You have arrived at your destination.',
    };
  }

  // 2. Project GPS onto route
  const projection = projectPointOntoRoute(gpsCoord, routeCoords);

  // 3. Off-Route Check
  if (projection.distanceToRouteMeters > offRouteThreshold) {
    // Keep previously calculated remaining route or full route, do not shrink based on unrelated point
    const remainingCoords = calculateRemainingRoute(routeCoords, previousMaxProgressMeters);
    const remainingDist = calculateRouteTotalLengthMeters(remainingCoords);
    const arrows = generateDirectionArrowFeatures(remainingCoords, arrowSpacing, NAV_CONFIG.ARROW_START_OFFSET_METERS);

    return {
      status: 'OFF_ROUTE',
      nearestPointOnRoute: projection.nearestPoint,
      distanceToRouteMeters: projection.distanceToRouteMeters,
      distanceToDestinationMeters: distanceToDest,
      currentProgressMeters: projection.distanceAlongRouteMeters,
      maxProgressMeters: previousMaxProgressMeters,
      progressFraction: totalLength > 0 ? previousMaxProgressMeters / totalLength : 0,
      remainingCoordinates: remainingCoords,
      remainingDistanceMeters: remainingDist,
      arrowFeatures: arrows,
      isOffRoute: true,
      isArrived: false,
      explanation: `GPS is ${Math.round(projection.distanceToRouteMeters)}m from the planned route (threshold: ${offRouteThreshold}m).`,
    };
  }

  // 4. On-Route Normal Progress with Monotonic Smoothing
  // Small backward GPS fluctuations (e.g. 5m noise) do not move progress backward
  const monotonicProgressMeters = Math.max(previousMaxProgressMeters, projection.distanceAlongRouteMeters);

  // Check if monotonic progress reaches the destination
  if (totalLength > 0 && monotonicProgressMeters >= totalLength - 15) {
    return {
      status: 'ARRIVED',
      nearestPointOnRoute: destinationCoord,
      distanceToRouteMeters: 0,
      distanceToDestinationMeters: distanceToDest,
      currentProgressMeters: totalLength,
      maxProgressMeters: totalLength,
      progressFraction: 1.0,
      remainingCoordinates: [],
      remainingDistanceMeters: 0,
      arrowFeatures: { type: 'FeatureCollection', features: [] },
      isOffRoute: false,
      isArrived: true,
      explanation: 'You have arrived at your destination.',
    };
  }

  const remainingCoordinates = calculateRemainingRoute(routeCoords, monotonicProgressMeters);
  const remainingDistanceMeters = calculateRouteTotalLengthMeters(remainingCoordinates);
  const arrowFeatures = generateDirectionArrowFeatures(
    remainingCoordinates,
    arrowSpacing,
    NAV_CONFIG.ARROW_START_OFFSET_METERS
  );

  return {
    status: 'ON_ROUTE',
    nearestPointOnRoute: projection.nearestPoint,
    distanceToRouteMeters: projection.distanceToRouteMeters,
    distanceToDestinationMeters: distanceToDest,
    currentProgressMeters: projection.distanceAlongRouteMeters,
    maxProgressMeters: monotonicProgressMeters,
    progressFraction: totalLength > 0 ? monotonicProgressMeters / totalLength : 0,
    remainingCoordinates,
    remainingDistanceMeters,
    arrowFeatures,
    isOffRoute: false,
    isArrived: false,
    explanation: `On route. Remaining: ${(remainingDistanceMeters / 1000).toFixed(2)} km (${Math.round(
      (monotonicProgressMeters / (totalLength || 1)) * 100
    )}% completed).`,
  };
}
