import type { Coordinate, RouteResult, RouteStep } from '../types/routing';
import type { LineString } from 'geojson';
import { distanceMeters } from './geometryUtils';
import { snapPointToRoadNetwork } from './roadSectionService';
import { OPERATIONAL_ROADS } from '../data/roadNetworkData';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_NEAREST_URL = 'https://router.project-osrm.org/nearest/v1/driving';

export interface RoadSnapResult {
  snapped: boolean;
  originalCoordinate: Coordinate;
  snappedCoordinate: Coordinate;
  distanceMeters: number;
  roadName: string | null;
  source: 'OSRM_NEAREST' | 'LOCAL_ROAD_NETWORK' | 'NONE';
}

/**
 * Extracts and formats turn-by-turn steps from OSRM response legs without hardcoding.
 */
export function parseOsrmSteps(rawRoute: any): RouteStep[] {
  if (!rawRoute || !Array.isArray(rawRoute.legs)) return [];
  const steps: RouteStep[] = [];

  for (const leg of rawRoute.legs) {
    if (!Array.isArray(leg.steps)) continue;
    for (const rawStep of leg.steps) {
      const maneuver = rawStep.maneuver || {};
      const stepName = (rawStep.name || '').trim();
      const geom = rawStep.geometry as LineString;

      let instruction = '';
      const type = maneuver.type || 'turn';
      const mod = maneuver.modifier ? maneuver.modifier.replace('_', ' ') : '';

      if (type === 'depart') {
        instruction = stepName ? `Head onto ${stepName}` : 'Head forward';
      } else if (type === 'arrive') {
        instruction = stepName ? `Arrive at ${stepName}` : 'Arrive at destination';
      } else if (type === 'roundabout' || type === 'rotary') {
        const exitText = maneuver.exit ? `take exit ${maneuver.exit}` : 'enter';
        instruction = stepName ? `At roundabout, ${exitText} onto ${stepName}` : `At roundabout, ${exitText}`;
      } else if (type === 'exit roundabout' || type === 'exit rotary') {
        instruction = stepName ? `Exit roundabout onto ${stepName}` : 'Exit roundabout';
      } else if (type === 'merge' || type === 'on ramp' || type === 'off ramp' || type === 'fork') {
        instruction = stepName ? `${mod ? mod + ' ' : ''}${type} onto ${stepName}` : `${mod ? mod + ' ' : ''}${type}`;
      } else if (type === 'new name' || type === 'continue') {
        instruction = stepName ? `Continue straight onto ${stepName}` : 'Continue straight';
      } else if (type === 'turn') {
        const modText = mod ? `${mod} turn` : 'Turn';
        instruction = stepName ? `${modText} onto ${stepName}` : modText;
      } else {
        const modText = mod ? ` (${mod})` : '';
        instruction = stepName ? `${type}${modText} onto ${stepName}` : `${type}${modText}`;
      }

      steps.push({
        name: stepName,
        distanceMeters: typeof rawStep.distance === 'number' ? Math.round(rawStep.distance) : 0,
        durationSeconds: typeof rawStep.duration === 'number' ? Math.round(rawStep.duration) : 0,
        maneuver: {
          type,
          modifier: maneuver.modifier,
          location: Array.isArray(maneuver.location) ? [maneuver.location[0], maneuver.location[1]] : [0, 0],
          bearing_before: maneuver.bearing_before,
          bearing_after: maneuver.bearing_after,
          exit: maneuver.exit,
        },
        geometry: geom || { type: 'LineString', coordinates: [] },
        instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
      });
    }
  }

  return steps;
}

/**
 * Snaps a coordinate to the nearest real drivable road using OSRM's /nearest service.
 * Respects maxDistanceMeters (default: 80m). If nearest road is further than maxDistance,
 * keeps original coordinate without forcing a long-distance snap.
 */
export async function snapCoordinateToNearestRoad(
  coord: Coordinate,
  maxDistanceMeters: number = 80
): Promise<RoadSnapResult> {
  if (!isValidCoordinate(coord)) {
    return {
      snapped: false,
      originalCoordinate: coord,
      snappedCoordinate: coord,
      distanceMeters: 0,
      roadName: null,
      source: 'NONE',
    };
  }

  // 1. Try OSRM /nearest API
  try {
    const url = `${OSRM_NEAREST_URL}/${coord[0]},${coord[1]}?number=1`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && Array.isArray(data.waypoints) && data.waypoints.length > 0) {
        const wp = data.waypoints[0];
        const snappedCoord: Coordinate = [wp.location[0], wp.location[1]];
        const dist = typeof wp.distance === 'number' ? wp.distance : distanceMeters(coord, snappedCoord);

        if (dist <= maxDistanceMeters) {
          return {
            snapped: true,
            originalCoordinate: coord,
            snappedCoordinate: snappedCoord,
            distanceMeters: Math.round(dist * 10) / 10,
            roadName: wp.name && wp.name.trim().length > 0 ? wp.name : 'Routable Road',
            source: 'OSRM_NEAREST',
          };
        } else {
          // Road is further than max snapping distance - keep original coordinate
          return {
            snapped: false,
            originalCoordinate: coord,
            snappedCoordinate: coord,
            distanceMeters: Math.round(dist * 10) / 10,
            roadName: wp.name || null,
            source: 'NONE',
          };
        }
      }
    }
  } catch (err) {
    console.warn('[ROUTING] OSRM /nearest lookup failed, falling back to local road network:', err);
  }

  // 2. Fallback: Local Operational Road network
  try {
    const localSnap = snapPointToRoadNetwork(coord, OPERATIONAL_ROADS, maxDistanceMeters);
    if (localSnap && localSnap.distanceToRoadMeters <= maxDistanceMeters) {
      return {
        snapped: true,
        originalCoordinate: coord,
        snappedCoordinate: localSnap.snappedCoord,
        distanceMeters: Math.round(localSnap.distanceToRoadMeters * 10) / 10,
        roadName: localSnap.road.name,
        source: 'LOCAL_ROAD_NETWORK',
      };
    }
  } catch (err) {
    console.warn('[ROUTING] Local road snap failed:', err);
  }

  return {
    snapped: false,
    originalCoordinate: coord,
    snappedCoordinate: coord,
    distanceMeters: 0,
    roadName: null,
    source: 'NONE',
  };
}

/**
 * Validates coordinate pair [lng, lat].
 */
export function isValidCoordinate(coord: unknown): coord is Coordinate {
  if (!Array.isArray(coord) || coord.length !== 2) {
    return false;
  }
  const [lng, lat] = coord;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return false;
  }
  if (Number.isNaN(lng) || Number.isNaN(lat)) {
    return false;
  }
  if (lng < -180 || lng > 180) {
    return false;
  }
  if (lat < -90 || lat > 90) {
    return false;
  }
  return true;
}

/**
 * Communicates with the OSRM road routing engine.
 * Converts OSRM driving response into a standardized RouteResult.
 */
export async function getRoute(
  start: Coordinate,
  destination: Coordinate
): Promise<RouteResult> {
  // 1. Validate coordinates
  if (!isValidCoordinate(start)) {
    console.error('[ROUTING] Invalid start coordinates:', start);
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Invalid start coordinates: ${JSON.stringify(start)}. Must be [longitude, latitude].`,
    };
  }

  if (!isValidCoordinate(destination)) {
    console.error('[ROUTING] Invalid destination coordinates:', destination);
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Invalid destination coordinates: ${JSON.stringify(destination)}. Must be [longitude, latitude].`,
    };
  }

  // 2. Construct OSRM URL: lng1,lat1;lng2,lat2 with steps=true
  const coordinatesString = `${start[0]},${start[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_BASE_URL}/${coordinatesString}?overview=full&geometries=geojson&steps=true`;

  console.group('[ROUTING] OSRM Request Dispatch');
  console.log('1. Start Coordinates [lng, lat]:', start);
  console.log('2. Destination Coordinates [lng, lat]:', destination);
  console.log('3. Generated OSRM URL:', url);

  try {
    // 3. HTTP Request
    const response = await fetch(url);
    console.log('4. HTTP Status:', response.status, response.statusText);

    if (!response.ok) {
      console.groupEnd();
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: `OSRM server responded with HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // 4. Parse JSON
    const data = await response.json();

    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      console.warn('5. OSRM responded without usable routes. Code:', data.code);
      console.groupEnd();
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: `No road route found between these points (OSRM code: ${data.code || 'NO_ROUTE'}).`,
      };
    }

    const primaryRoute = data.routes[0];
    console.log('5. Routes Found:', true);
    console.log('6. Number of Routes:', data.routes.length);
    console.log('7. Distance (meters):', primaryRoute.distance);
    console.log('8. Duration (seconds):', primaryRoute.duration);

    // 5. Verify geometry
    const geometry = primaryRoute.geometry as LineString;
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
      console.error('Invalid route geometry received:', geometry);
      console.groupEnd();
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: 'Malformed route geometry received from OSRM.',
      };
    }

    if (geometry.coordinates.length < 2) {
      console.error('Route has fewer than 2 coordinates:', geometry.coordinates);
      console.groupEnd();
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: 'Route geometry must contain at least 2 road coordinate points.',
      };
    }

    const steps = parseOsrmSteps(primaryRoute);
    console.groupEnd();

    return {
      coordinates: geometry.coordinates as Coordinate[],
      geometry,
      distanceMeters: primaryRoute.distance,
      durationSeconds: primaryRoute.duration,
      status: 'success',
      steps,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ROUTING] Network/Fetch Error:', message);
    console.groupEnd();
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Network failure connecting to OSRM routing engine: ${message}`,
    };
  }
}

export interface RouteCandidatesFetchResult {
  routes: RouteResult[];
  count: number;
  status: 'success' | 'error';
  error?: string;
}

/**
 * Communicates with the OSRM road routing engine requesting route alternatives.
 * Preserves overview=full and geometries=geojson.
 * Returns all valid road route candidates provided by OSRM without fabricating any data.
 */
export async function getRouteCandidates(
  start: Coordinate,
  destination: Coordinate
): Promise<RouteCandidatesFetchResult> {
  if (!isValidCoordinate(start)) {
    return {
      routes: [],
      count: 0,
      status: 'error',
      error: `Invalid start coordinates: ${JSON.stringify(start)}. Must be [longitude, latitude].`,
    };
  }

  if (!isValidCoordinate(destination)) {
    return {
      routes: [],
      count: 0,
      status: 'error',
      error: `Invalid destination coordinates: ${JSON.stringify(destination)}. Must be [longitude, latitude].`,
    };
  }

  const coordinatesString = `${start[0]},${start[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_BASE_URL}/${coordinatesString}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  console.group('[ROUTING] OSRM Route Alternatives Dispatch');
  console.log('1. Start:', start);
  console.log('2. Destination:', destination);
  console.log('3. Request URL:', url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.groupEnd();
      return {
        routes: [],
        count: 0,
        status: 'error',
        error: `OSRM server responded with HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      console.warn('[ROUTING] OSRM responded without usable routes. Code:', data.code);
      console.groupEnd();
      return {
        routes: [],
        count: 0,
        status: 'error',
        error: `No road routes found between these points (OSRM code: ${data.code || 'NO_ROUTE'}).`,
      };
    }

    const candidates: RouteResult[] = [];
    for (let i = 0; i < data.routes.length; i++) {
      const rawRoute = data.routes[i];
      const geom = rawRoute.geometry as LineString;
      if (
        geom &&
        geom.type === 'LineString' &&
        Array.isArray(geom.coordinates) &&
        geom.coordinates.length >= 2
      ) {
        candidates.push({
          coordinates: geom.coordinates as Coordinate[],
          geometry: geom,
          distanceMeters: rawRoute.distance,
          durationSeconds: rawRoute.duration,
          status: 'success',
          steps: parseOsrmSteps(rawRoute),
        });
      }
    }

    console.log(`4. Valid Candidates Parsed: ${candidates.length} of ${data.routes.length}`);
    console.groupEnd();

    return {
      routes: candidates,
      count: candidates.length,
      status: candidates.length > 0 ? 'success' : 'error',
      error: candidates.length === 0 ? 'No valid LineString geometries in OSRM response.' : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ROUTING] Network/Fetch Error:', message);
    console.groupEnd();
    return {
      routes: [],
      count: 0,
      status: 'error',
      error: `Network failure connecting to OSRM routing engine: ${message}`,
    };
  }
}

/**
 * Communicates with OSRM driving engine to route through intermediate detour waypoints.
 * Produces real road-following geometry adhering to street directions and turn restrictions.
 */
export async function getRouteThroughWaypoints(
  start: Coordinate,
  waypoints: Coordinate[],
  destination: Coordinate
): Promise<RouteResult> {
  if (!isValidCoordinate(start)) {
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Invalid start coordinate: ${JSON.stringify(start)}`,
    };
  }

  if (!isValidCoordinate(destination)) {
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Invalid destination coordinate: ${JSON.stringify(destination)}`,
    };
  }

  const validWaypoints = waypoints.filter(isValidCoordinate);
  if (validWaypoints.length === 0) {
    // If no waypoints, fall back to direct routing
    return getRoute(start, destination);
  }

  const wpString = validWaypoints.map((w) => `${w[0]},${w[1]}`).join(';');
  const coordString = `${start[0]},${start[1]};${wpString};${destination[0]},${destination[1]}`;
  const url = `${OSRM_BASE_URL}/${coordString}?overview=full&geometries=geojson&steps=true`;

  console.log('[ROUTING] Requesting OSRM Route Through Detour Waypoints:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: `OSRM waypoint routing failed with HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: `No road route through specified waypoints (OSRM code: ${data.code || 'NO_ROUTE'}).`,
      };
    }

    const primaryRoute = data.routes[0];
    const geom = primaryRoute.geometry as LineString;
    if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      return {
        coordinates: [],
        geometry: { type: 'LineString', coordinates: [] },
        distanceMeters: 0,
        durationSeconds: 0,
        status: 'error',
        error: 'Malformed waypoint route geometry from OSRM.',
      };
    }

    return {
      coordinates: geom.coordinates as Coordinate[],
      geometry: geom,
      distanceMeters: primaryRoute.distance,
      durationSeconds: primaryRoute.duration,
      status: 'success',
      steps: parseOsrmSteps(primaryRoute),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      coordinates: [],
      geometry: { type: 'LineString', coordinates: [] },
      distanceMeters: 0,
      durationSeconds: 0,
      status: 'error',
      error: `Network failure connecting to OSRM waypoint routing: ${message}`,
    };
  }
}
