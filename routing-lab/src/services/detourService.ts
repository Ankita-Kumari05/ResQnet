import type { Coordinate, RouteResult } from '../types/routing';
import type { HazardZone, BlockedRoad } from '../types/safety';
import type { RouteCandidate } from '../types/candidates';
import { getRouteThroughWaypoints } from './routingService';
import { evaluateRouteSafety } from './routeSafetyService';
import { HAZARD_ZONES } from '../data/hazardData';
import { BLOCKED_ROADS } from '../data/blockedRoadData';

/**
 * Deterministic buffer tiers (in meters) for active detour generation.
 * ResQnet attempts tightest viable road bypasses first, escalating to wider corridors
 * if tight corridors remain blocked or hazardous.
 */
export const DETOUR_BUFFER_TIERS = [500, 1000, 1800, 2600];

/**
 * Maximum total detour routes to query from OSRM to keep execution bounded and fast.
 */
export const MAX_DETOUR_ATTEMPTS = 16;

const METERS_PER_DEG_LAT = 111040;

export function getBufferDegrees(latDeg: number, bufferMeters: number) {
  const rad = (latDeg * Math.PI) / 180;
  const metersLng = 111320 * Math.cos(rad);
  return {
    dLat: bufferMeters / METERS_PER_DEG_LAT,
    dLng: bufferMeters / metersLng,
  };
}

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function getPolygonBoundingBox(coordinates: Coordinate[][]): BoundingBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const ring = coordinates[0] || [];
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLng, minLat, maxLng, maxLat };
}

export interface DetourCorridor {
  label: string;
  waypoints: Coordinate[];
  bufferMeters: number;
}

/**
 * Generates lateral and cardinal road-bypass corridor waypoints around a blocked road LineString.
 * Computes normal vectors perpendicular to the road segment and places lateral and cardinal bypass waypoints
 * at escalating buffer distances to steer OSRM onto open parallel streets / alternative avenues.
 */
export function generateBlockedRoadDetourCorridors(
  blockedRoad: BlockedRoad,
  bufferMeters: number,
  _start: Coordinate,
  _destination: Coordinate
): DetourCorridor[] {
  const coords = blockedRoad.geometry.coordinates as Coordinate[];
  if (!coords || coords.length < 2) return [];

  const first = coords[0];
  const last = coords[coords.length - 1];
  const midIdx = Math.floor(coords.length / 2);
  const mid = coords[midIdx];

  const avgLat = (first[1] + last[1]) / 2;
  const { dLat, dLng } = getBufferDegrees(avgLat, bufferMeters);

  // Bounding box of the closure
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;

  // Road direction vector (from first to last)
  const dX = last[0] - first[0];
  const dY = last[1] - first[1];
  const len = Math.hypot(dX, dY);

  // Unit vector along road
  const ux = len > 1e-7 ? dX / len : 0;
  const uy = len > 1e-7 ? dY / len : 0;

  // Normal unit vectors (left and right)
  const nx = len > 1e-7 ? -dY / len : 0;
  const ny = len > 1e-7 ? dX / len : 1;

  // Longitudinal lead-in and lead-out offset (60% of buffer)
  const leadLng = ux * dLng * 0.6;
  const leadLat = uy * dLat * 0.6;

  const corridors: DetourCorridor[] = [];

  // 1. Dual-waypoint Parallel Corridor (Left Flank with lead-in/lead-out)
  const leftStart: Coordinate = [
    Number((first[0] - leadLng + nx * dLng).toFixed(6)),
    Number((first[1] - leadLat + ny * dLat).toFixed(6)),
  ];
  const leftEnd: Coordinate = [
    Number((last[0] + leadLng + nx * dLng).toFixed(6)),
    Number((last[1] + leadLat + ny * dLat).toFixed(6)),
  ];
  corridors.push({
    label: `Parallel Left Corridor of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [leftStart, leftEnd],
  });

  // 2. Dual-waypoint Parallel Corridor (Right Flank with lead-in/lead-out)
  const rightStart: Coordinate = [
    Number((first[0] - leadLng - nx * dLng).toFixed(6)),
    Number((first[1] - leadLat - ny * dLat).toFixed(6)),
  ];
  const rightEnd: Coordinate = [
    Number((last[0] + leadLng - nx * dLng).toFixed(6)),
    Number((last[1] + leadLat - ny * dLat).toFixed(6)),
  ];
  corridors.push({
    label: `Parallel Right Corridor of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [rightStart, rightEnd],
  });

  // 3. Left Lateral Midpoint Bypass
  const leftMid: Coordinate = [
    Number((mid[0] + nx * dLng).toFixed(6)),
    Number((mid[1] + ny * dLat).toFixed(6)),
  ];
  corridors.push({
    label: `Left Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [leftMid],
  });

  // 4. Right Lateral Midpoint Bypass
  const rightMid: Coordinate = [
    Number((mid[0] - nx * dLng).toFixed(6)),
    Number((mid[1] - ny * dLat).toFixed(6)),
  ];
  corridors.push({
    label: `Right Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [rightMid],
  });

  // 5. Cardinal Bounding-Box Bypasses (North & South)
  corridors.push({
    label: `North Grid Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [
      [Number((centerLng - dLng * 0.4).toFixed(6)), Number((maxLat + dLat).toFixed(6))],
      [Number((centerLng + dLng * 0.4).toFixed(6)), Number((maxLat + dLat).toFixed(6))],
    ],
  });

  corridors.push({
    label: `South Grid Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [
      [Number((centerLng - dLng * 0.4).toFixed(6)), Number((minLat - dLat).toFixed(6))],
      [Number((centerLng + dLng * 0.4).toFixed(6)), Number((minLat - dLat).toFixed(6))],
    ],
  });

  // 6. Cardinal Bounding-Box Bypasses (West & East)
  corridors.push({
    label: `West Grid Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [
      [Number((minLng - dLng).toFixed(6)), Number((centerLat - dLat * 0.4).toFixed(6))],
      [Number((minLng - dLng).toFixed(6)), Number((centerLat + dLat * 0.4).toFixed(6))],
    ],
  });

  corridors.push({
    label: `East Grid Bypass of ${blockedRoad.name} (${bufferMeters}m)`,
    bufferMeters,
    waypoints: [
      [Number((maxLng + dLng).toFixed(6)), Number((centerLat - dLat * 0.4).toFixed(6))],
      [Number((maxLng + dLng).toFixed(6)), Number((centerLat + dLat * 0.4).toFixed(6))],
    ],
  });

  return corridors;
}

/**
 * Generates 4 cardinal road-bypass corridor waypoints around a hazard polygon bounding box.
 * Cardinal corridors: North, South, East, West bypasses.
 * Uses polygon centroid relative to start/destination orientation to generate realistic,
 * road-reachable bypass waypoints.
 */
export function generateDetourCorridors(
  hazard: HazardZone,
  bufferMeters: number,
  start: Coordinate,
  destination: Coordinate
): DetourCorridor[] {
  const bbox = getPolygonBoundingBox(hazard.geometry.coordinates as Coordinate[][]);
  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const { dLat, dLng } = getBufferDegrees(avgLat, bufferMeters);

  const centerLng = (bbox.minLng + bbox.maxLng) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;

  const corridors: DetourCorridor[] = [];

  // Determine primary travel direction (X vs Y dominant)
  const dx = destination[0] - start[0];
  const dy = destination[1] - start[1];
  const isNorthSouth = Math.abs(dy) >= Math.abs(dx);

  if (isNorthSouth) {
    corridors.push({
      label: `West Flank Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.minLng - dLng, bbox.minLat + dLat * 0.2],
        [bbox.minLng - dLng, bbox.maxLat - dLat * 0.2],
      ],
    });

    corridors.push({
      label: `East Flank Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.maxLng + dLng, bbox.minLat + dLat * 0.2],
        [bbox.maxLng + dLng, bbox.maxLat - dLat * 0.2],
      ],
    });

    corridors.push({
      label: `North Loop Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [centerLng - dLng * 0.5, bbox.maxLat + dLat],
        [centerLng + dLng * 0.5, bbox.maxLat + dLat],
      ],
    });

    corridors.push({
      label: `South Loop Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [centerLng - dLng * 0.5, bbox.minLat - dLat],
        [centerLng + dLng * 0.5, bbox.minLat - dLat],
      ],
    });
  } else {
    corridors.push({
      label: `North Flank Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.minLng + dLng * 0.2, bbox.maxLat + dLat],
        [bbox.maxLng - dLng * 0.2, bbox.maxLat + dLat],
      ],
    });

    corridors.push({
      label: `South Flank Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.minLng + dLng * 0.2, bbox.minLat - dLat],
        [bbox.maxLng - dLng * 0.2, bbox.minLat - dLat],
      ],
    });

    corridors.push({
      label: `West Loop Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.minLng - dLng, centerLat - dLat * 0.5],
        [bbox.minLng - dLng, centerLat + dLat * 0.5],
      ],
    });

    corridors.push({
      label: `East Loop Bypass (${bufferMeters}m)`,
      bufferMeters,
      waypoints: [
        [bbox.maxLng + dLng, centerLat - dLat * 0.5],
        [bbox.maxLng + dLng, centerLat + dLat * 0.5],
      ],
    });
  }

  return corridors;
}

export interface DetourTargets {
  hazardIds?: string[];
  blockedRoadIds?: string[];
}

export interface DetourGenerationResult {
  detourCandidates: RouteCandidate[];
  attemptsCount: number;
  hazardsAvoided: string[];
}

/**
 * Phase 4 Engine: Active Road Detour Generation.
 * When an initial OSRM route crosses a disaster hazard OR a blocked road closure,
 * this service creates bypass corridors using normal vectors & buffer escalation,
 * queries OSRM for real road-following geometry, and validates every generated detour.
 */
export async function generateSafeDetours(
  start: Coordinate,
  destination: Coordinate,
  targets: string[] | DetourTargets,
  allHazards: HazardZone[] = HAZARD_ZONES,
  allBlockedRoads: BlockedRoad[] = BLOCKED_ROADS
): Promise<DetourGenerationResult> {
  const hazardIds: string[] = Array.isArray(targets)
    ? targets
    : (targets.hazardIds || []);
  const blockedRoadIds: string[] = Array.isArray(targets)
    ? []
    : (targets.blockedRoadIds || []);

  if (hazardIds.length === 0 && blockedRoadIds.length === 0) {
    return {
      detourCandidates: [],
      attemptsCount: 0,
      hazardsAvoided: [],
    };
  }

  const detourCandidates: RouteCandidate[] = [];
  let attemptsCount = 0;
  let candidateSeq = 1;
  const avoidedItems: string[] = [];

  console.group('[DETOUR ENGINE] Starting Active Road Closure & Hazard Avoidance');
  console.log('Start:', start, 'Destination:', destination);
  console.log('Blocked Road Targets:', blockedRoadIds);
  console.log('Hazard Targets:', hazardIds);

  // Collect corridors from blocked roads first
  const allCorridorsToAttempt: DetourCorridor[] = [];

  for (const roadId of blockedRoadIds) {
    const road = allBlockedRoads.find((r) => r.id === roadId);
    if (road) {
      avoidedItems.push(road.name);
      for (const bufferMeters of DETOUR_BUFFER_TIERS) {
        const roadCorridors = generateBlockedRoadDetourCorridors(road, bufferMeters, start, destination);
        allCorridorsToAttempt.push(...roadCorridors);
      }
    }
  }

  // Collect corridors from hazards
  for (const hazardId of hazardIds) {
    const hazard = allHazards.find((h) => h.id === hazardId);
    if (hazard) {
      avoidedItems.push(hazard.name);
      for (const bufferMeters of DETOUR_BUFFER_TIERS) {
        const hzCorridors = generateDetourCorridors(hazard, bufferMeters, start, destination);
        allCorridorsToAttempt.push(...hzCorridors);
      }
    }
  }

  // Deduplicate corridors by waypoint coordinates
  const seenWaypoints = new Set<string>();
  const uniqueCorridors = allCorridorsToAttempt.filter((c) => {
    const key = c.waypoints.map((w) => `${w[0].toFixed(5)},${w[1].toFixed(5)}`).join(';');
    if (seenWaypoints.has(key)) return false;
    seenWaypoints.add(key);
    return true;
  });

  for (const corridor of uniqueCorridors) {
    if (attemptsCount >= MAX_DETOUR_ATTEMPTS) {
      break;
    }
    attemptsCount++;
    const cid = `detour-${candidateSeq++}`;

    try {
      console.log(`[DETOUR] Attempt ${attemptsCount}: ${corridor.label}`);
      const routeRes: RouteResult = await getRouteThroughWaypoints(
        start,
        corridor.waypoints,
        destination
      );

      if (routeRes.status !== 'success' || !routeRes.coordinates || routeRes.coordinates.length < 2) {
        continue;
      }

      // Evaluate the real OSRM detour route
      const safety = evaluateRouteSafety(routeRes, allHazards, allBlockedRoads);
      const distKm = Number((routeRes.distanceMeters / 1000).toFixed(2));
      const isSafe =
        safety.safetyStatus === 'SAFE' &&
        (safety.highestHazardSeverity === 'NONE' || safety.highestHazardSeverity === 'SAFE') &&
        !safety.blockedRoad;

      let rejectionReason: string | undefined = undefined;
      if (safety.blockedRoad) {
        rejectionReason = `BLOCKED_ROAD (${safety.blockedRoadIntersections.map((b) => b.roadId).join(', ')})`;
      } else if (safety.highestHazardSeverity === 'CRITICAL') {
        rejectionReason = `CRITICAL_HAZARD (${safety.hazardIntersections
          .filter((h) => h.severity === 'CRITICAL')
          .map((h) => h.hazardId)
          .join(', ')})`;
      } else if (safety.highestHazardSeverity === 'HIGH') {
        rejectionReason = `HIGH_HAZARD (${safety.hazardIntersections.map((h) => h.hazardId).join(', ')})`;
      } else if (safety.highestHazardSeverity === 'MODERATE') {
        rejectionReason = `MODERATE_HAZARD (${safety.hazardIntersections.map((h) => h.hazardId).join(', ')})`;
      }

      if (isSafe) {
        console.log(`[DETOUR] >>> VIABLE SAFE DETOUR FOUND: ${corridor.label} (${distKm} km) <<<`);
      } else {
        console.log(`[DETOUR] Candidate rejected: ${corridor.label} -> ${rejectionReason}`);
      }

      detourCandidates.push({
        id: cid,
        label: `${corridor.label}`,
        geometry: routeRes.geometry,
        coordinates: routeRes.coordinates,
        distanceMeters: routeRes.distanceMeters,
        distanceKm: distKm,
        durationSeconds: routeRes.durationSeconds,
        durationMinutes: Math.round(routeRes.durationSeconds / 60),
        safetyAssessment: safety,
        isSelected: false,
        isDetour: true,
        detourCorridor: corridor.label,
        bufferMeters: corridor.bufferMeters,
        waypointsCount: corridor.waypoints.length,
        osrmStatus: 'OK',
        rejectionReason: isSafe ? undefined : rejectionReason,
      });

      // If we found at least 2 distinct safe routes, we have sufficient alternatives
      const safeFoundCount = detourCandidates.filter(
        (c) => c.safetyAssessment.safetyStatus === 'SAFE' && !c.safetyAssessment.blockedRoad
      ).length;
      if (safeFoundCount >= 2) {
        console.log(`[DETOUR] Found ${safeFoundCount} valid safe detour alternatives. Stopping early.`);
        break;
      }
    } catch (err: unknown) {
      console.warn(`[DETOUR] Exception querying ${corridor.label}:`, err);
    }
  }

  console.log(
    `[DETOUR ENGINE] Completed: Evaluated ${detourCandidates.length} bypass routes (${attemptsCount} attempts).`
  );
  console.groupEnd();

  return {
    detourCandidates,
    attemptsCount,
    hazardsAvoided: avoidedItems,
  };
}
