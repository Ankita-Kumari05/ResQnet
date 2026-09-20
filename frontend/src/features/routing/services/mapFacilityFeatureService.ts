import type { Map as MapLibreMap, PointLike, MapGeoJSONFeature } from 'maplibre-gl';
import type { Coordinate } from '../types/routing';
import type { PotentialSafetyHub, SafetyHubSiteType } from '../types/safetyHub';

export interface FacilityClickDebugInfo {
  clickedLngLat: Coordinate;
  featuresDetected: number;
  selectedLayer: string;
  source: string;
  sourceLayer?: string;
  properties: Record<string, unknown>;
  geometryType: string;
}

export interface FacilityIdentificationResult {
  potentialHub: PotentialSafetyHub | null;
  debugInfo: FacilityClickDebugInfo | null;
  footprintCoordinates?: Coordinate[] | null;
  error?: string;
}

/**
 * Common MapTiler / OpenMapTiles source-layers that contain public facilities, buildings, and POIs.
 */
const FACILITY_SOURCE_LAYERS = new Set([
  'poi',
  'poi_label',
  'building',
  'landuse',
  'landcover',
  'park',
  'aeroway',
  'place',
]);

/**
 * Regex matching POI, building, and facility-related layer IDs in MapLibre styles.
 */
const FACILITY_LAYER_KEYWORDS = /(poi|building|landuse|park|amenity|school|college|university|stadium|sport|hospital|civic|place)/i;

/**
 * Regex for non-facility layers that should be excluded.
 */
const EXCLUDED_LAYER_KEYWORDS = /(road|highway|transportation|bridge|tunnel|boundary|admin|water|river|contour|resqnet|hazard|danger|drawing|route|candidate)/i;

/**
 * Dynamically discovers all MapLibre style layers representing POIs, buildings, and public facilities.
 */
export function getFacilityLayerIds(map: MapLibreMap): string[] {
  try {
    const style = map.getStyle();
    if (!style || !style.layers) return [];

    const layerIds: string[] = [];

    for (const layer of style.layers) {
      if (layer.id.startsWith('resqnet-')) continue;
      if (
        layer.id.includes('hazards-') ||
        layer.id.includes('danger-') ||
        layer.id.includes('drawing-') ||
        layer.id.includes('section-preview-') ||
        layer.id.includes('candidates-') ||
        layer.id.includes('route-') ||
        layer.id.includes('selected-road-') ||
        layer.id.includes('hover-')
      ) {
        continue;
      }

      const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
      const isFacilitySourceLayer = sourceLayer ? FACILITY_SOURCE_LAYERS.has(sourceLayer.toLowerCase()) : false;
      const isFacilityId = FACILITY_LAYER_KEYWORDS.test(layer.id) && !EXCLUDED_LAYER_KEYWORDS.test(layer.id);

      if (isFacilitySourceLayer || isFacilityId) {
        layerIds.push(layer.id);
      }
    }

    return layerIds;
  } catch (err) {
    console.warn('[FACILITY IDENTIFICATION] Error extracting style layers:', err);
    return [];
  }
}

/**
 * Infers a clean site type from MapTiler/OSM feature properties.
 */
export function inferSiteTypeFromProperties(
  props: Record<string, unknown> | null | undefined,
  name = ''
): SafetyHubSiteType {
  if (!props && !name) return 'Other Public Space';

  const p = props || {};
  const subclass = String(p.subclass || p.class || p.amenity || p.building || p.landuse || '').toLowerCase();
  const nameLower = name.toLowerCase();

  // 1. Schools & Educational Institutions
  if (
    subclass.includes('school') ||
    subclass.includes('kindergarten') ||
    nameLower.includes('school') ||
    nameLower.includes('vidyalaya') ||
    nameLower.includes('shiksha')
  ) {
    return 'Government School';
  }

  if (
    subclass.includes('college') ||
    nameLower.includes('college') ||
    nameLower.includes('polytechnic') ||
    nameLower.includes('institute')
  ) {
    return 'Government College';
  }

  if (
    subclass.includes('university') ||
    subclass.includes('campus') ||
    nameLower.includes('university') ||
    nameLower.includes('campus') ||
    nameLower.includes('panjab university')
  ) {
    return 'University / Campus';
  }

  // 2. Stadiums & Sports Facilities
  if (
    subclass.includes('stadium') ||
    nameLower.includes('stadium') ||
    nameLower.includes('arena')
  ) {
    return 'Stadium';
  }

  if (
    subclass.includes('sports') ||
    subclass.includes('pitch') ||
    subclass.includes('track') ||
    nameLower.includes('sports complex') ||
    nameLower.includes('athletic') ||
    nameLower.includes('gymnasium')
  ) {
    return 'Sports Complex';
  }

  // 3. Community Centers & Civic Spaces
  if (
    subclass.includes('community') ||
    subclass.includes('townhall') ||
    subclass.includes('civic') ||
    subclass.includes('library') ||
    nameLower.includes('community centre') ||
    nameLower.includes('bhawan') ||
    nameLower.includes('samiti') ||
    nameLower.includes('hall')
  ) {
    return 'Community Centre';
  }

  // 4. Open Grounds & Parks
  if (
    subclass.includes('park') ||
    subclass.includes('recreation') ||
    subclass.includes('grass') ||
    subclass.includes('ground') ||
    nameLower.includes('ground') ||
    nameLower.includes('park') ||
    nameLower.includes('parade ground')
  ) {
    return 'Open Ground';
  }

  // 5. Government Buildings & Facilities
  if (
    subclass.includes('government') ||
    subclass.includes('public_building') ||
    subclass.includes('hospital') ||
    subclass.includes('clinic') ||
    nameLower.includes('secretariat') ||
    nameLower.includes('court') ||
    nameLower.includes('hospital') ||
    nameLower.includes('police') ||
    nameLower.includes('office')
  ) {
    return 'Government Facility';
  }

  return 'Public Building';
}

/**
 * Extracts a human-readable name from feature properties or returns null if unnamed.
 */
export function extractFacilityNameFromProperties(
  props: Record<string, unknown> | null | undefined
): string | null {
  if (!props) return null;

  const rawName =
    props.name ||
    props['name:en'] ||
    props['name_en'] ||
    props['name_int'] ||
    props['name:latin'] ||
    props.title ||
    props.label ||
    props.ref;

  if (typeof rawName === 'string' && rawName.trim().length > 0) {
    return rawName.trim();
  }

  return null;
}

/**
 * Computes a representative center coordinate from MapLibre feature geometry.
 */
export function extractFeatureCenterCoordinate(feature: MapGeoJSONFeature, clickedLngLat: Coordinate): Coordinate {
  const geom = feature.geometry;
  if (!geom) return clickedLngLat;

  if (geom.type === 'Point') {
    const coords = geom.coordinates as [number, number];
    return [Number(coords[0].toFixed(6)), Number(coords[1].toFixed(6))];
  }

  if (geom.type === 'Polygon') {
    const ring = (geom.coordinates[0] || []) as Coordinate[];
    if (ring.length === 0) return clickedLngLat;
    let sumLng = 0;
    let sumLat = 0;
    ring.forEach((c) => {
      sumLng += c[0];
      sumLat += c[1];
    });
    return [
      Number((sumLng / ring.length).toFixed(6)),
      Number((sumLat / ring.length).toFixed(6)),
    ];
  }

  return clickedLngLat;
}

/**
 * Queries MapLibre rendered features at click point to identify potential public facilities.
 */
export async function identifyFacilityFromMapClick({
  map,
  point,
  clickedLngLat,
  isDevMode = false,
}: {
  map: MapLibreMap;
  point: PointLike;
  clickedLngLat: Coordinate;
  isDevMode?: boolean;
}): Promise<FacilityIdentificationResult> {
  try {
    const layerIds = getFacilityLayerIds(map);
    const boxRadius = 24;
    const px = Array.isArray(point) ? point[0] : (point as { x: number; y: number }).x;
    const py = Array.isArray(point) ? point[1] : (point as { x: number; y: number }).y;
    const bbox: [PointLike, PointLike] = [
      [px - boxRadius, py - boxRadius],
      [px + boxRadius, py + boxRadius],
    ];

    let renderedFeatures: MapGeoJSONFeature[] = [];

    if (layerIds.length > 0) {
      renderedFeatures = map.queryRenderedFeatures(bbox, { layers: layerIds });
    }

    // Fallback: query all rendered features if specific layers yielded 0
    if (renderedFeatures.length === 0) {
      renderedFeatures = map.queryRenderedFeatures(bbox);
    }

    // Filter out road and infrastructure noise
    const filteredFeatures = renderedFeatures.filter((f) => {
      const layerId = f.layer?.id || '';
      return !EXCLUDED_LAYER_KEYWORDS.test(layerId);
    });

    if (filteredFeatures.length === 0) {
      // Return clicked point as an unverified/unidentified location without inventing a name
      const fallbackHub: PotentialSafetyHub = {
        name: '',
        siteType: 'Other Public Space',
        coordinate: clickedLngLat,
        address: `Location [${clickedLngLat[1].toFixed(5)}° N, ${clickedLngLat[0].toFixed(5)}° E]`,
        isIdentifiedFromMap: false,
      };

      return {
        potentialHub: fallbackHub,
        debugInfo: {
          clickedLngLat,
          featuresDetected: 0,
          selectedLayer: 'none',
          source: 'map_click_fallback',
          properties: {},
          geometryType: 'Point',
        },
      };
    }

    // Find best feature: prioritize features that have a valid name or building/poi class
    let bestFeature: MapGeoJSONFeature = filteredFeatures[0];
    let bestName: string | null = null;

    for (const feat of filteredFeatures) {
      const name = extractFacilityNameFromProperties(feat.properties);
      if (name) {
        bestFeature = feat;
        bestName = name;
        break;
      }
    }

    const featureProps = (bestFeature.properties || {}) as Record<string, unknown>;
    const hasIdentifiedName = Boolean(bestName && bestName.trim().length > 0);
    const finalName = bestName || '';
    const siteType = inferSiteTypeFromProperties(featureProps, finalName);

    let footprintCoords: Coordinate[] | null = null;
    if (bestFeature.geometry?.type === 'Polygon') {
      footprintCoords = (bestFeature.geometry.coordinates[0] || []) as Coordinate[];
    }

    const potentialHub: PotentialSafetyHub = {
      name: finalName,
      siteType,
      coordinate: clickedLngLat, // Exact clicked coordinate without silent shifting
      polygonCoordinates: footprintCoords || undefined,
      address: hasIdentifiedName
        ? `Near ${finalName} [${clickedLngLat[1].toFixed(5)}° N, ${clickedLngLat[0].toFixed(5)}° E]`
        : `Location [${clickedLngLat[1].toFixed(5)}° N, ${clickedLngLat[0].toFixed(5)}° E]`,
      sourceLayer: bestFeature.sourceLayer,
      properties: isDevMode ? featureProps : undefined,
      isIdentifiedFromMap: hasIdentifiedName,
    };

    const debugInfo: FacilityClickDebugInfo = {
      clickedLngLat,
      featuresDetected: filteredFeatures.length,
      selectedLayer: bestFeature.layer?.id || 'unknown',
      source: bestFeature.source || 'maptiler',
      sourceLayer: bestFeature.sourceLayer,
      properties: featureProps,
      geometryType: bestFeature.geometry?.type || 'unknown',
    };

    return {
      potentialHub,
      debugInfo,
      footprintCoordinates: footprintCoords,
    };
  } catch (err: unknown) {
    console.warn('[FACILITY IDENTIFICATION] Exception during feature query:', err);
    const fallbackHub: PotentialSafetyHub = {
      name: '',
      siteType: 'Other Public Space',
      coordinate: clickedLngLat,
      address: `Location [${clickedLngLat[1].toFixed(5)}° N, ${clickedLngLat[0].toFixed(5)}° E]`,
      isIdentifiedFromMap: false,
    };
    return {
      potentialHub: fallbackHub,
      debugInfo: null,
      error: 'Failed to inspect map features.',
    };
  }
}
