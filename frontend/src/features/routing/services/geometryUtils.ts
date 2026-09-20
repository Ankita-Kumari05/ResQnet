import type { Coordinate } from '../types/routing';
import type { HazardZone, BlockedRoad } from '../types/safety';
import type { FeatureCollection, LineString } from 'geojson';

/**
 * Approximate conversion factors for NYC latitude (~40.75° N)
 * 1 degree latitude ~ 111,040 meters
 * 1 degree longitude ~ 111,320 * cos(40.75°) ~ 84,330 meters
 */
const METERS_PER_DEG_LAT = 111040;

function getMetersPerDegLng(latDeg: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return 111320 * Math.cos(rad);
}

/**
 * Computes planar distance in meters between two [lng, lat] coordinates.
 */
export function distanceMeters(p1: Coordinate, p2: Coordinate): number {
  const avgLat = (p1[1] + p2[1]) / 2;
  const metersLng = getMetersPerDegLng(avgLat);
  const dx = (p2[0] - p1[0]) * metersLng;
  const dy = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2D Orientation test for three points (A, B, C).
 * Returns:
 *  0 -> Colinear
 *  1 -> Clockwise
 *  2 -> Counterclockwise
 */
function orientation(p: Coordinate, q: Coordinate, r: Coordinate): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * Checks if point q lies on segment pr (when p, q, r are colinear).
 */
function onSegment(p: Coordinate, q: Coordinate, r: Coordinate): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-11 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-11 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-11 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-11
  );
}

/**
 * Robust 2D Line-Segment Intersection test between p1-q1 and p2-q2.
 */
export function doSegmentsIntersect(
  p1: Coordinate,
  q1: Coordinate,
  p2: Coordinate,
  q2: Coordinate
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  // General intersection case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Special colinear cases
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

/**
 * Ray-Casting algorithm to determine if a point [lng, lat] is inside a GeoJSON Polygon ring.
 * Point-on-edge is considered inside.
 */
export function isPointInPolygonRing(point: Coordinate, ring: Coordinate[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Check if point is exactly on vertex
    if (Math.abs(x - xi) < 1e-9 && Math.abs(y - yi) < 1e-9) return true;

    // Check if point is on segment
    if (orientation([xi, yi], [xj, yj], point) === 0 && onSegment([xi, yi], point, [xj, yj])) {
      return true;
    }

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Checks if a point lies inside a full GeoJSON Polygon (outer ring minus holes).
 */
export function isPointInPolygon(point: Coordinate, polygonCoordinates: Coordinate[][]): boolean {
  if (!polygonCoordinates || polygonCoordinates.length === 0) return false;

  // Must be inside outer ring
  const inOuterRing = isPointInPolygonRing(point, polygonCoordinates[0]);
  if (!inOuterRing) return false;

  // Must NOT be inside any inner hole rings
  for (let i = 1; i < polygonCoordinates.length; i++) {
    if (isPointInPolygonRing(point, polygonCoordinates[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Calculates perpendicular distance from a point to a line segment in meters.
 */
export function pointToSegmentDistanceMeters(
  point: Coordinate,
  segA: Coordinate,
  segB: Coordinate
): number {
  const avgLat = (segA[1] + segB[1]) / 2;
  const metersLng = getMetersPerDegLng(avgLat);

  // Convert to local metric coordinates centered at segA
  const px = (point[0] - segA[0]) * metersLng;
  const py = (point[1] - segA[1]) * METERS_PER_DEG_LAT;
  const bx = (segB[0] - segA[0]) * metersLng;
  const by = (segB[1] - segA[1]) * METERS_PER_DEG_LAT;

  const segLengthSq = bx * bx + by * by;
  if (segLengthSq < 1e-6) {
    return Math.sqrt(px * px + py * py);
  }

  // Projection scalar t onto segment [0, 1]
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLengthSq));
  const projX = t * bx;
  const projY = t * by;

  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes minimum distance in meters between two line segments.
 */
export function segmentToSegmentDistanceMeters(
  p1: Coordinate,
  q1: Coordinate,
  p2: Coordinate,
  q2: Coordinate
): number {
  if (doSegmentsIntersect(p1, q1, p2, q2)) {
    return 0;
  }

  return Math.min(
    pointToSegmentDistanceMeters(p1, p2, q2),
    pointToSegmentDistanceMeters(q1, p2, q2),
    pointToSegmentDistanceMeters(p2, p1, q1),
    pointToSegmentDistanceMeters(q2, p1, q1)
  );
}

export interface PolygonIntersectionResult {
  intersects: boolean;
  boundaryCrossings: number;
  verticesInside: number;
  totalIntersectionEvidence: number;
}

/**
 * Evaluates a route LineString against a GeoJSON polygon.
 * Tests both:
 *  A. Route crossing the polygon boundary
 *  B. Route vertices (or interpolated segment samples) lying inside the polygon
 */
export function checkLineStringPolygonIntersection(
  routeCoords: Coordinate[],
  polygonCoordinates: Coordinate[][]
): PolygonIntersectionResult {
  if (routeCoords.length < 2 || !polygonCoordinates || polygonCoordinates.length === 0) {
    return {
      intersects: false,
      boundaryCrossings: 0,
      verticesInside: 0,
      totalIntersectionEvidence: 0,
    };
  }

  let boundaryCrossings = 0;
  let verticesInside = 0;

  // 1. Check all route vertices
  for (let i = 0; i < routeCoords.length; i++) {
    if (isPointInPolygon(routeCoords[i], polygonCoordinates)) {
      verticesInside++;
    }
  }

  // 2. Check segment boundary crossings and interpolate long segments
  const outerRing = polygonCoordinates[0];
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const rStart = routeCoords[i];
    const rEnd = routeCoords[i + 1];

    // Test segment crossing polygon outer ring segments
    for (let j = 0; j < outerRing.length - 1; j++) {
      if (doSegmentsIntersect(rStart, rEnd, outerRing[j], outerRing[j + 1])) {
        boundaryCrossings++;
      }
    }

    // If segment is longer than 50 meters, sample midpoint to prevent tunnel-through false negatives
    const segDist = distanceMeters(rStart, rEnd);
    if (segDist > 50) {
      const midPoint: Coordinate = [(rStart[0] + rEnd[0]) / 2, (rStart[1] + rEnd[1]) / 2];
      if (isPointInPolygon(midPoint, polygonCoordinates)) {
        verticesInside++;
      }
    }
  }

  const totalIntersectionEvidence = boundaryCrossings + verticesInside;
  return {
    intersects: totalIntersectionEvidence > 0,
    boundaryCrossings,
    verticesInside,
    totalIntersectionEvidence,
  };
}

export interface BlockedRoadIntersectionResult {
  intersects: boolean;
  minDistanceMeters: number;
  intersectionCount: number;
}

/**
 * Evaluates a route LineString against a blocked-road LineString.
 * Uses a small, clearly documented configurable spatial tolerance (meters).
 * Urban roads can have slight centerline variance (~10-25m) between OSRM and mock data.
 *
 * @param routeCoords OSRM route vertices
 * @param blockedRoadCoords Blocked road vertices
 * @param toleranceMeters Maximum distance in meters to consider the route intersecting the blocked road (default: 25m)
 */
export function checkLineStringBlockedRoadIntersection(
  routeCoords: Coordinate[],
  blockedRoadCoords: Coordinate[],
  toleranceMeters: number = 25
): BlockedRoadIntersectionResult {
  if (routeCoords.length < 2 || blockedRoadCoords.length < 2) {
    return {
      intersects: false,
      minDistanceMeters: Infinity,
      intersectionCount: 0,
    };
  }

  let minDistance = Infinity;
  let intersectionCount = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const rStart = routeCoords[i];
    const rEnd = routeCoords[i + 1];

    for (let j = 0; j < blockedRoadCoords.length - 1; j++) {
      const bStart = blockedRoadCoords[j];
      const bEnd = blockedRoadCoords[j + 1];

      const dist = segmentToSegmentDistanceMeters(rStart, rEnd, bStart, bEnd);
      if (dist < minDistance) {
        minDistance = dist;
      }

      if (dist <= toleranceMeters) {
        intersectionCount++;
      }
    }
  }

  return {
    intersects: intersectionCount > 0,
    minDistanceMeters: minDistance,
    intersectionCount,
  };
}

/**
 * Extracts segments of the route that fall inside hazard zones or near blocked roads.
 * Used for high-visibility visual overlays on the map.
 */
export function extractHazardRouteSegments(
  routeCoords: Coordinate[],
  hazards: HazardZone[],
  blockedRoads: BlockedRoad[],
  toleranceMeters: number = 25
): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>['features'] = [];

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const p1 = routeCoords[i];
    const p2 = routeCoords[i + 1];
    const midPoint: Coordinate = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

    // Check if segment touches any blocked road
    let segmentBlocked = false;
    let blockedRoadId = '';
    for (const road of blockedRoads) {
      const roadCoords = road.geometry.coordinates as Coordinate[];
      for (let j = 0; j < roadCoords.length - 1; j++) {
        if (segmentToSegmentDistanceMeters(p1, p2, roadCoords[j], roadCoords[j + 1]) <= toleranceMeters) {
          segmentBlocked = true;
          blockedRoadId = road.id;
          break;
        }
      }
      if (segmentBlocked) break;
    }

    if (segmentBlocked) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'BLOCKED',
          severity: 'CRITICAL',
          id: blockedRoadId,
          color: '#ef4444',
          casingColor: '#000000',
        },
        geometry: {
          type: 'LineString',
          coordinates: [p1, p2],
        },
      });
      continue;
    }

    // Check if segment touches or lies inside any hazard
    for (const hz of hazards) {
      const polyCoords = hz.geometry.coordinates as Coordinate[][];
      const inPoly =
        isPointInPolygon(p1, polyCoords) ||
        isPointInPolygon(p2, polyCoords) ||
        isPointInPolygon(midPoint, polyCoords);

      let crosses = false;
      if (!inPoly) {
        const outer = polyCoords[0];
        for (let j = 0; j < outer.length - 1; j++) {
          if (doSegmentsIntersect(p1, p2, outer[j], outer[j + 1])) {
            crosses = true;
            break;
          }
        }
      }

      if (inPoly || crosses) {
        const colorMap: Record<string, string> = {
          SAFE: '#10b981',
          MODERATE: '#f59e0b',
          HIGH: '#ef4444',
          CRITICAL: '#a855f7',
        };

        features.push({
          type: 'Feature',
          properties: {
            type: 'HAZARD',
            severity: hz.severity,
            id: hz.id,
            color: colorMap[hz.severity] || '#f59e0b',
            casingColor: '#020617',
          },
          geometry: {
            type: 'LineString',
            coordinates: [p1, p2],
          },
        });
        break; // Match highest or first relevant hazard
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Creates a closed circular polygon coordinate ring around a [lng, lat] point with given radius in meters.
 */
export function createCirclePolygon(
  center: Coordinate,
  radiusMeters: number,
  points: number = 36
): Coordinate[] {
  const [lng, lat] = center;
  const metersLng = getMetersPerDegLng(lat);
  const ring: Coordinate[] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const pLng = lng + dx / metersLng;
    const pLat = lat + dy / METERS_PER_DEG_LAT;
    ring.push([Number(pLng.toFixed(6)), Number(pLat.toFixed(6))]);
  }

  return ring;
}

