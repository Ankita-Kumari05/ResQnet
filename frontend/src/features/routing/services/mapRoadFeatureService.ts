import type { Map as MapLibreMap, PointLike, MapGeoJSONFeature } from 'maplibre-gl';
import type { Coordinate } from '../types/routing';
import type { OperationalRoad } from '../data/roadNetworkData';
import { OPERATIONAL_ROADS } from '../data/roadNetworkData';
import { distanceMeters } from './geometryUtils';
import { projectPointOntoSegment, snapPointToRoadNetwork } from './roadSectionService';

export interface RoadClickDebugInfo {
  clickedLngLat: Coordinate;
  featuresDetected: number;
  selectedLayer: string;
  source: string;
  sourceLayer: string;
  properties: Record<string, unknown>;
  geometryType: string;
  distanceFromClickMeters: number;
}

export interface RoadIdentificationResult {
  road: OperationalRoad | null;
  candidateRoads: OperationalRoad[];
  debugInfo: RoadClickDebugInfo | null;
  source: 'vector_tile' | 'osrm_nearest' | 'operational_network' | 'none';
  error?: string;
}

/**
 * Common MapTiler / OpenMapTiles source-layer names for transportation and road lines.
 */
const ROAD_SOURCE_LAYERS = new Set([
  'transportation',
  'transportation_name',
  'road',
  'roads',
  'highway',
  'street',
  'transit',
]);

/**
 * Regex matching road-related layer IDs in various vector tile styles.
 */
const ROAD_LAYER_KEYWORDS = /(road|highway|street|bridge|tunnel|path|track|link|motorway|trunk|primary|secondary|tertiary|minor|service|residential|transportation)/i;

/**
 * Regex for non-road line layers that should be strictly excluded from road hit-testing.
 */
const NON_ROAD_KEYWORDS = /(label|symbol|text|shield|icon|boundary|admin|border|water|river|stream|canal|lake|ocean|coastline|ferry|contour|building|fence|landcover|landuse|railway_dash|resqnet|hazard|danger|drawing|candidate|route|blocked)/i;

/**
 * Dynamically discovers all line layer IDs from the currently loaded MapLibre style
 * that represent roads/transportation networks.
 */
export function getRoadLayerIds(map: MapLibreMap): string[] {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return [];

    const roadLayerIds: string[] = [];

    for (const layer of style.layers) {
      if (layer.type !== 'line') continue;
      if (layer.id.startsWith('resqnet-')) continue;
      if (
        layer.id.includes('hazards-') ||
        layer.id.includes('danger-') ||
        layer.id.includes('drawing-') ||
        layer.id.includes('section-preview-') ||
        layer.id.includes('candidates-') ||
        layer.id.includes('route-') ||
        layer.id.includes('selected-road-') ||
        layer.id.includes('hover-road-')
      ) {
        continue;
      }

      const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
      const isRoadSourceLayer = sourceLayer ? ROAD_SOURCE_LAYERS.has(sourceLayer.toLowerCase()) : false;
      const isRoadId = ROAD_LAYER_KEYWORDS.test(layer.id) && !NON_ROAD_KEYWORDS.test(layer.id);

      if (isRoadSourceLayer || isRoadId) {
        roadLayerIds.push(layer.id);
      }
    }

    return roadLayerIds;
  } catch (err) {
    console.warn('[ROAD IDENTIFICATION] Error extracting style layers:', err);
    return [];
  }
}

/**
 * Extracts a clean, human-readable road name from MapTiler/OSM vector feature properties.
 */
export function extractRoadNameFromProperties(
  props: Record<string, unknown> | null | undefined,
  fallbackCoords?: Coordinate
): string {
  if (!props) {
    return fallbackCoords
      ? `Road Segment near [${fallbackCoords[1].toFixed(4)}, ${fallbackCoords[0].toFixed(4)}]`
      : 'Selected Road';
  }

  const name =
    (props.name as string) ||
    (props['name:en'] as string) ||
    (props['name:latin'] as string) ||
    (props.name_en as string) ||
    (props.name_int as string);

  const ref = (props.ref as string) || (props.int_ref as string);
  const roadClass = (props.class as string) || (props.subclass as string) || (props.highway as string);

  if (name && ref) {
    return `${name} (${ref})`;
  }
  if (name) {
    return name;
  }
  if (ref) {
    return `Route ${ref}`;
  }
  if (roadClass) {
    const formattedClass = roadClass.charAt(0).toUpperCase() + roadClass.slice(1).replace(/_/g, ' ');
    return fallbackCoords
      ? `${formattedClass} Road near [${fallbackCoords[1].toFixed(4)}, ${fallbackCoords[0].toFixed(4)}]`
      : `${formattedClass} Road`;
  }

  return fallbackCoords
    ? `Road Segment near [${fallbackCoords[1].toFixed(4)}, ${fallbackCoords[0].toFixed(4)}]`
    : 'Selected Road';
}

/**
 * Extends a LineString if it is very short (< 140m) so that the Two-Closure-Gate handles
 * have sufficient room to be positioned and dragged comfortably.
 */
export function ensureUsableRoadLength(coords: Coordinate[], minLengthMeters: number = 140): Coordinate[] {
  if (!coords || coords.length < 2) return coords;

  let totalLen = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalLen += distanceMeters(coords[i], coords[i + 1]);
  }

  if (totalLen >= minLengthMeters) {
    return coords;
  }

  const deficit = minLengthMeters - totalLen;
  const extendEachEnd = deficit / 2 + 10;

  // Extend start
  const first = coords[0];
  const second = coords[1];
  const startDist = distanceMeters(first, second);
  const startRatio = startDist > 1e-6 ? extendEachEnd / startDist : 1;
  const extendedStart: Coordinate = [
    Number((first[0] + (first[0] - second[0]) * startRatio).toFixed(6)),
    Number((first[1] + (first[1] - second[1]) * startRatio).toFixed(6)),
  ];

  // Extend end
  const last = coords[coords.length - 1];
  const prevLast = coords[coords.length - 2];
  const endDist = distanceMeters(prevLast, last);
  const endRatio = endDist > 1e-6 ? extendEachEnd / endDist : 1;
  const extendedEnd: Coordinate = [
    Number((last[0] + (last[0] - prevLast[0]) * endRatio).toFixed(6)),
    Number((last[1] + (last[1] - prevLast[1]) * endRatio).toFixed(6)),
  ];

  return [extendedStart, ...coords, extendedEnd];
}

export interface IdentifyRoadParams {
  map: MapLibreMap;
  point: PointLike;
  clickedLngLat: Coordinate;
  isDevMode?: boolean;
}

/**
 * Finds the single closest road feature under the mouse cursor for hover highlighting.
 */
export function getHoverRoadGeometry(
  map: MapLibreMap,
  point: PointLike,
  cursorLngLat: Coordinate
): Coordinate[] | null {
  try {
    const roadLayerIds = getRoadLayerIds(map);
    const pxRadius = 12;
    const p = point as { x: number; y: number };
    const bbox: [PointLike, PointLike] = [
      [p.x - pxRadius, p.y - pxRadius],
      [p.x + pxRadius, p.y + pxRadius],
    ];

    let rawFeatures: MapGeoJSONFeature[] = [];
    if (roadLayerIds.length > 0) {
      rawFeatures = map.queryRenderedFeatures(bbox, { layers: roadLayerIds });
    }
    if (!rawFeatures || rawFeatures.length === 0) {
      return null;
    }

    let bestDist = Infinity;
    let bestCoords: Coordinate[] | null = null;

    for (const feat of rawFeatures) {
      if (!feat.geometry) continue;
      let lineCoordGroups: Coordinate[][] = [];
      if (feat.geometry.type === 'LineString') {
        lineCoordGroups = [(feat.geometry.coordinates as Coordinate[])];
      } else if (feat.geometry.type === 'MultiLineString') {
        lineCoordGroups = feat.geometry.coordinates as Coordinate[][];
      }

      for (const group of lineCoordGroups) {
        if (!group || group.length < 2) continue;
        for (let i = 0; i < group.length - 1; i++) {
          const segProj = projectPointOntoSegment(cursorLngLat, group[i], group[i + 1]);
          if (segProj.distanceMeters < bestDist) {
            bestDist = segProj.distanceMeters;
            bestCoords = group;
          }
        }
      }
    }

    if (bestCoords && bestDist <= 120) {
      return bestCoords;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Queries rendered MapTiler / MapLibre vector features around the clicked point
 * with tolerant spatial search and extracts the closest real Indian road(s).
 * Handles intersection ambiguity by returning all distinct nearby candidate roads.
 */
export async function identifyRoadFromMapClick({
  map,
  point,
  clickedLngLat,
  isDevMode = false,
}: IdentifyRoadParams): Promise<RoadIdentificationResult> {
  const roadLayerIds = getRoadLayerIds(map);

  // 1. Screen-space hit tolerance bounding box (16px radius for easy clicking/touch)
  const pxRadius = 16;
  const p = point as { x: number; y: number };
  const bbox: [PointLike, PointLike] = [
    [p.x - pxRadius, p.y - pxRadius],
    [p.x + pxRadius, p.y + pxRadius],
  ];

  let rawFeatures: MapGeoJSONFeature[] = [];

  try {
    if (roadLayerIds.length > 0) {
      rawFeatures = map.queryRenderedFeatures(bbox, { layers: roadLayerIds });
    }
    if (!rawFeatures || rawFeatures.length === 0) {
      const allBboxFeatures = map.queryRenderedFeatures(bbox);
      rawFeatures = allBboxFeatures.filter((f) => {
        if (!f.geometry || (f.geometry.type !== 'LineString' && f.geometry.type !== 'MultiLineString')) {
          return false;
        }
        const sourceLayer = f.sourceLayer ? f.sourceLayer.toLowerCase() : '';
        const layerId = f.layer.id.toLowerCase();
        return (
          ROAD_SOURCE_LAYERS.has(sourceLayer) ||
          (ROAD_LAYER_KEYWORDS.test(layerId) && !NON_ROAD_KEYWORDS.test(layerId))
        );
      });
    }
  } catch (err) {
    console.warn('[ROAD IDENTIFICATION] QueryRenderedFeatures error:', err);
  }

  // 2. Filter and rank candidate features by true geographic distance from clicked coordinate
  interface ScoredCandidate {
    feature: MapGeoJSONFeature;
    minDistanceMeters: number;
    coordinates: Coordinate[];
    layerId: string;
    source: string;
    sourceLayer: string;
    properties: Record<string, unknown>;
  }

  const scoredCandidates: ScoredCandidate[] = [];

  for (const feat of rawFeatures) {
    if (!feat.geometry) continue;

    let lineCoordGroups: Coordinate[][] = [];
    if (feat.geometry.type === 'LineString') {
      lineCoordGroups = [(feat.geometry.coordinates as Coordinate[])];
    } else if (feat.geometry.type === 'MultiLineString') {
      lineCoordGroups = feat.geometry.coordinates as Coordinate[][];
    }

    for (const group of lineCoordGroups) {
      if (!group || group.length < 2) continue;

      let minGroupDist = Infinity;
      for (let i = 0; i < group.length - 1; i++) {
        const segProj = projectPointOntoSegment(clickedLngLat, group[i], group[i + 1]);
        if (segProj.distanceMeters < minGroupDist) {
          minGroupDist = segProj.distanceMeters;
        }
      }

      if (minGroupDist !== Infinity) {
        scoredCandidates.push({
          feature: feat,
          minDistanceMeters: minGroupDist,
          coordinates: group,
          layerId: feat.layer.id,
          source: feat.source,
          sourceLayer: feat.sourceLayer || 'transportation',
          properties: (feat.properties as Record<string, unknown>) || {},
        });
      }
    }
  }

  // Sort by geographic distance
  scoredCandidates.sort((a, b) => a.minDistanceMeters - b.minDistanceMeters);

  // 3. Extract distinct candidate roads for intersection handling
  const candidateRoads: OperationalRoad[] = [];
  const seenNames = new Set<string>();

  for (const cand of scoredCandidates) {
    if (cand.minDistanceMeters > 150) continue;
    const name = extractRoadNameFromProperties(cand.properties, clickedLngLat);
    if (!seenNames.has(name)) {
      seenNames.add(name);
      candidateRoads.push({
        id: `ROAD-VT-${(cand.feature.id || Math.random()).toString().slice(-8)}`,
        name,
        geometry: {
          type: 'LineString',
          coordinates: ensureUsableRoadLength(cand.coordinates, 150),
        },
      });
    }
    if (candidateRoads.length >= 4) break;
  }

  // 4. If at least one vector feature is found within reasonable distance (< 150m)
  if (scoredCandidates.length > 0 && scoredCandidates[0].minDistanceMeters <= 150) {
    const best = scoredCandidates[0];
    const roadName = extractRoadNameFromProperties(best.properties, clickedLngLat);
    const usableCoords = ensureUsableRoadLength(best.coordinates, 150);

    const operationalRoad: OperationalRoad = {
      id: `ROAD-VT-${(best.feature.id || Date.now()).toString().slice(-8)}`,
      name: roadName,
      geometry: {
        type: 'LineString',
        coordinates: usableCoords,
      },
    };

    const debugInfo: RoadClickDebugInfo = {
      clickedLngLat,
      featuresDetected: rawFeatures.length,
      selectedLayer: best.layerId,
      source: best.source,
      sourceLayer: best.sourceLayer,
      properties: best.properties,
      geometryType: `${best.feature.geometry.type} (${usableCoords.length} points)`,
      distanceFromClickMeters: Math.round(best.minDistanceMeters * 10) / 10,
    };

    if (isDevMode) {
      console.log(`
==================================================
ROAD CLICK DEBUG (REAL VECTOR TILE FEATURE)
==================================================
Clicked: [lat: ${clickedLngLat[1].toFixed(6)}, lng: ${clickedLngLat[0].toFixed(6)}]
Features detected: ${rawFeatures.length}
Distinct roads at intersection: ${candidateRoads.length}
Selected layer: ${debugInfo.selectedLayer}
Source: ${debugInfo.source}
Source layer: ${debugInfo.sourceLayer}
Road properties: ${JSON.stringify(debugInfo.properties, null, 2)}
Geometry: ${debugInfo.geometryType}
Distance from click: ${debugInfo.distanceFromClickMeters} meters
Road Name Resolved: "${roadName}"
==================================================`);
    }

    return {
      road: operationalRoad,
      candidateRoads,
      debugInfo,
      source: 'vector_tile',
    };
  }

  // 5. Fallback A: Check local OPERATIONAL_ROADS
  const localSnap = snapPointToRoadNetwork(clickedLngLat, OPERATIONAL_ROADS, 150);
  if (localSnap) {
    const debugInfo: RoadClickDebugInfo = {
      clickedLngLat,
      featuresDetected: rawFeatures.length,
      selectedLayer: 'local_operational_network',
      source: 'operational_roads',
      sourceLayer: 'internal',
      properties: { name: localSnap.road.name, id: localSnap.road.id },
      geometryType: `LineString (${localSnap.road.geometry.coordinates.length} points)`,
      distanceFromClickMeters: Math.round(localSnap.distanceToRoadMeters * 10) / 10,
    };

    if (isDevMode) {
      console.log(`
==================================================
ROAD CLICK DEBUG (OPERATIONAL ROAD MATCH)
==================================================
Clicked: [lat: ${clickedLngLat[1].toFixed(6)}, lng: ${clickedLngLat[0].toFixed(6)}]
Matched Operational Road: ${localSnap.road.name}
Distance: ${debugInfo.distanceFromClickMeters} meters
==================================================`);
    }

    return {
      road: localSnap.road,
      candidateRoads: [localSnap.road],
      debugInfo,
      source: 'operational_network',
    };
  }

  // 6. Fallback B: Query OSRM /nearest API for real road snapping & name
  try {
    const osrmUrl = `https://router.project-osrm.org/nearest/v1/driving/${clickedLngLat[0]},${clickedLngLat[1]}?number=1`;
    const response = await fetch(osrmUrl, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.waypoints && data.waypoints.length > 0) {
        const wp = data.waypoints[0];
        const snappedCoord: Coordinate = [wp.location[0], wp.location[1]];
        const distFromClick = distanceMeters(clickedLngLat, snappedCoord);

        if (distFromClick <= 250) {
          const roadName = wp.name && wp.name.trim().length > 0 ? wp.name : `Road near [${snappedCoord[1].toFixed(4)}, ${snappedCoord[0].toFixed(4)}]`;

          const offsetLng = 0.0015;
          const offsetLat = 0.0008;
          const roadCoords: Coordinate[] = [
            [Number((snappedCoord[0] - offsetLng).toFixed(6)), Number((snappedCoord[1] - offsetLat).toFixed(6))],
            snappedCoord,
            [Number((snappedCoord[0] + offsetLng).toFixed(6)), Number((snappedCoord[1] + offsetLat).toFixed(6))],
          ];

          const operationalRoad: OperationalRoad = {
            id: `ROAD-OSRM-${Date.now().toString(36).toUpperCase().slice(-6)}`,
            name: roadName,
            geometry: {
              type: 'LineString',
              coordinates: roadCoords,
            },
          };

          const debugInfo: RoadClickDebugInfo = {
            clickedLngLat,
            featuresDetected: rawFeatures.length,
            selectedLayer: 'osrm_nearest_network',
            source: 'osrm',
            sourceLayer: 'driving_network',
            properties: { name: wp.name, distance: wp.distance, hint: wp.hint },
            geometryType: 'LineString (OSRM Snapped)',
            distanceFromClickMeters: Math.round(distFromClick * 10) / 10,
          };

          if (isDevMode) {
            console.log(`
==================================================
ROAD CLICK DEBUG (OSRM NEAREST ROAD MATCH)
==================================================
Clicked: [lat: ${clickedLngLat[1].toFixed(6)}, lng: ${clickedLngLat[0].toFixed(6)}]
OSRM Snapped Road: "${roadName}"
Distance: ${debugInfo.distanceFromClickMeters} meters
==================================================`);
          }

          return {
            road: operationalRoad,
            candidateRoads: [operationalRoad],
            debugInfo,
            source: 'osrm_nearest',
          };
        }
      }
    }
  } catch (err) {
    console.warn('[ROAD IDENTIFICATION] OSRM nearest fallback request failed:', err);
  }

  // 7. No road could be identified (e.g. building, park, water, blank ground)
  if (isDevMode) {
    console.log(`
==================================================
ROAD CLICK DEBUG (NO ROAD IDENTIFIED)
==================================================
Clicked: [lat: ${clickedLngLat[1].toFixed(6)}, lng: ${clickedLngLat[0].toFixed(6)}]
Features detected in bbox: ${rawFeatures.length}
Reason: No road feature found within 150m tolerance.
==================================================`);
  }

  return {
    road: null,
    candidateRoads: [],
    debugInfo: null,
    source: 'none',
    error: 'Could not identify a road near the clicked point. Please click closer to a road.',
  };
}
