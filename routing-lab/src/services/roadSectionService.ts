import type { Coordinate } from '../types/routing';
import type { LineString } from 'geojson';
import { distanceMeters } from './geometryUtils';
import { OPERATIONAL_ROADS, type OperationalRoad } from '../data/roadNetworkData';

export const MIN_BLOCK_SECTION_LENGTH_METERS = 20;

/**
 * Metric conversion for NYC latitude (~40.75° N)
 */
const METERS_PER_DEG_LAT = 111040;

function getMetersPerDegLng(latDeg: number): number {
  const rad = (latDeg * Math.PI) / 180;
  return 111320 * Math.cos(rad);
}

export interface SnappedRoadPoint {
  road: OperationalRoad;
  snappedCoord: Coordinate;
  segmentIndex: number;
  t: number;
  cumulativeDistanceMeters: number;
  distanceToRoadMeters: number;
}

/**
 * Projects a point onto a 2D line segment and returns the snapped coordinate,
 * scalar projection factor t in [0, 1], and perpendicular distance in meters.
 */
export function projectPointOntoSegment(
  point: Coordinate,
  segA: Coordinate,
  segB: Coordinate
): { projected: Coordinate; t: number; distanceMeters: number } {
  const avgLat = (segA[1] + segB[1]) / 2;
  const metersLng = getMetersPerDegLng(avgLat);

  // Local metric coordinates centered at segA
  const px = (point[0] - segA[0]) * metersLng;
  const py = (point[1] - segA[1]) * METERS_PER_DEG_LAT;
  const bx = (segB[0] - segA[0]) * metersLng;
  const by = (segB[1] - segA[1]) * METERS_PER_DEG_LAT;

  const segLengthSq = bx * bx + by * by;
  if (segLengthSq < 1e-6) {
    const dist = Math.sqrt(px * px + py * py);
    return { projected: [...segA], t: 0, distanceMeters: dist };
  }

  // Projection scalar t clamped to segment [0, 1]
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLengthSq));
  const projLng = Number((segA[0] + (segB[0] - segA[0]) * t).toFixed(6));
  const projLat = Number((segA[1] + (segB[1] - segA[1]) * t).toFixed(6));
  const projected: Coordinate = [projLng, projLat];

  const dist = distanceMeters(point, projected);
  return { projected, t, distanceMeters: dist };
}

/**
 * Snaps a clicked map coordinate to the nearest road in the road network
 * within a spatial tolerance of maxToleranceMeters (default: 150m).
 */
export function snapPointToRoadNetwork(
  clickedCoord: Coordinate,
  customRoads: OperationalRoad[] = OPERATIONAL_ROADS,
  maxToleranceMeters: number = 150
): SnappedRoadPoint | null {
  let bestResult: SnappedRoadPoint | null = null;
  let minDistance = Infinity;

  for (const road of customRoads) {
    const coords = road.geometry.coordinates as Coordinate[];
    if (!coords || coords.length < 2) continue;

    let cumDistBeforeSeg = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const segA = coords[i];
      const segB = coords[i + 1];
      const segLength = distanceMeters(segA, segB);

      const proj = projectPointOntoSegment(clickedCoord, segA, segB);

      if (proj.distanceMeters < minDistance) {
        minDistance = proj.distanceMeters;
        const totalCumDist = cumDistBeforeSeg + segLength * proj.t;

        bestResult = {
          road,
          snappedCoord: proj.projected,
          segmentIndex: i,
          t: proj.t,
          cumulativeDistanceMeters: totalCumDist,
          distanceToRoadMeters: proj.distanceMeters,
        };
      }

      cumDistBeforeSeg += segLength;
    }
  }

  if (bestResult && bestResult.distanceToRoadMeters <= maxToleranceMeters) {
    return bestResult;
  }

  return null;
}

/**
 * Calculates total length of an OperationalRoad in meters.
 */
export function getRoadTotalLengthMeters(road: OperationalRoad): number {
  const coords = road.geometry.coordinates as Coordinate[];
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += distanceMeters(coords[i], coords[i + 1]);
  }
  return total;
}

/**
 * Snaps a coordinate strictly onto a specific OperationalRoad geometry.
 */
export function snapPointToSpecificRoad(
  clickedCoord: Coordinate,
  road: OperationalRoad
): SnappedRoadPoint {
  const coords = road.geometry.coordinates as Coordinate[];
  let bestResult: SnappedRoadPoint | null = null;
  let minDistance = Infinity;
  let cumDistBeforeSeg = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const segA = coords[i];
    const segB = coords[i + 1];
    const segLength = distanceMeters(segA, segB);
    const proj = projectPointOntoSegment(clickedCoord, segA, segB);

    if (proj.distanceMeters < minDistance) {
      minDistance = proj.distanceMeters;
      const totalCumDist = cumDistBeforeSeg + segLength * proj.t;
      bestResult = {
        road,
        snappedCoord: proj.projected,
        segmentIndex: i,
        t: proj.t,
        cumulativeDistanceMeters: totalCumDist,
        distanceToRoadMeters: proj.distanceMeters,
      };
    }
    cumDistBeforeSeg += segLength;
  }

  if (bestResult) {
    return bestResult;
  }

  // Fallback to first coordinate if empty
  return {
    road,
    snappedCoord: coords[0],
    segmentIndex: 0,
    t: 0,
    cumulativeDistanceMeters: 0,
    distanceToRoadMeters: 0,
  };
}

/**
 * Gets a SnappedRoadPoint at a specific cumulative distance along an OperationalRoad.
 */
export function getPointAtDistanceAlongRoad(
  road: OperationalRoad,
  targetDistanceMeters: number
): SnappedRoadPoint {
  const coords = road.geometry.coordinates as Coordinate[];
  const totalLength = getRoadTotalLengthMeters(road);
  const clampedDist = Math.max(0, Math.min(totalLength, targetDistanceMeters));

  let cumDist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const segA = coords[i];
    const segB = coords[i + 1];
    const segLength = distanceMeters(segA, segB);

    if (cumDist + segLength >= clampedDist || i === coords.length - 2) {
      const remaining = clampedDist - cumDist;
      const t = segLength > 1e-6 ? Math.max(0, Math.min(1, remaining / segLength)) : 0;
      const projLng = Number((segA[0] + (segB[0] - segA[0]) * t).toFixed(6));
      const projLat = Number((segA[1] + (segB[1] - segA[1]) * t).toFixed(6));
      return {
        road,
        snappedCoord: [projLng, projLat],
        segmentIndex: i,
        t,
        cumulativeDistanceMeters: clampedDist,
        distanceToRoadMeters: 0,
      };
    }
    cumDist += segLength;
  }

  return {
    road,
    snappedCoord: coords[coords.length - 1],
    segmentIndex: coords.length - 2,
    t: 1,
    cumulativeDistanceMeters: totalLength,
    distanceToRoadMeters: 0,
  };
}

export interface RoadSectionExtractionResult {
  success: boolean;
  error?: string;
  road?: OperationalRoad;
  geometry?: LineString;
  coordinates?: Coordinate[];
  lengthMeters?: number;
  startPoint?: Coordinate;
  endPoint?: Coordinate;
}

/**
 * Extracts the real road-following LineString geometry between two handle distances
 * along a chosen OperationalRoad.
 */
export function extractRoadSectionFromHandles(
  road: OperationalRoad,
  dist1Meters: number,
  dist2Meters: number
): RoadSectionExtractionResult {
  const snap1 = getPointAtDistanceAlongRoad(road, dist1Meters);
  const snap2 = getPointAtDistanceAlongRoad(road, dist2Meters);

  const isFirstA = snap1.cumulativeDistanceMeters <= snap2.cumulativeDistanceMeters;
  const firstSnap = isFirstA ? snap1 : snap2;
  const secondSnap = isFirstA ? snap2 : snap1;

  const lengthMeters = Math.abs(secondSnap.cumulativeDistanceMeters - firstSnap.cumulativeDistanceMeters);
  const roadCoords = road.geometry.coordinates as Coordinate[];

  if (lengthMeters < MIN_BLOCK_SECTION_LENGTH_METERS) {
    return {
      success: false,
      error: `Closure section is too short (${Math.round(lengthMeters)}m). Minimum length is ${MIN_BLOCK_SECTION_LENGTH_METERS}m.`,
      road,
      lengthMeters: Math.round(lengthMeters),
      startPoint: firstSnap.snappedCoord,
      endPoint: secondSnap.snappedCoord,
    };
  }

  const sectionCoords: Coordinate[] = [];
  sectionCoords.push([...firstSnap.snappedCoord]);

  if (firstSnap.segmentIndex === secondSnap.segmentIndex) {
    sectionCoords.push([...secondSnap.snappedCoord]);
  } else {
    for (let i = firstSnap.segmentIndex + 1; i <= secondSnap.segmentIndex; i++) {
      sectionCoords.push([...roadCoords[i]]);
    }
    sectionCoords.push([...secondSnap.snappedCoord]);
  }

  return {
    success: true,
    road,
    geometry: {
      type: 'LineString',
      coordinates: sectionCoords,
    },
    coordinates: sectionCoords,
    lengthMeters: Math.round(lengthMeters),
    startPoint: firstSnap.snappedCoord,
    endPoint: secondSnap.snappedCoord,
  };
}

/**
 * Extracts the real road-following LineString geometry between Point A and Point B
 * along the given road geometry, regardless of click order.
 */
export function extractRoadSection(
  snapA: SnappedRoadPoint,
  snapB: SnappedRoadPoint
): RoadSectionExtractionResult {
  return extractRoadSectionFromHandles(
    snapA.road,
    snapA.cumulativeDistanceMeters,
    snapB.cumulativeDistanceMeters
  );
}
