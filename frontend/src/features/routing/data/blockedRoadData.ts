import type { BlockedRoad } from '../types/safety';
import type { FeatureCollection, LineString } from 'geojson';

/**
 * Deterministic Blocked Roads for Chandigarh – Mohali – Kharar – Zirakpur – Panchkula.
 * A blocked road represents a physical road closure where passage is impossible.
 * Coordinates are strictly [longitude, latitude] aligned with real Indian street centerlines.
 */
export const BLOCKED_ROADS: BlockedRoad[] = [
  {
    id: 'ROAD-BLOCK-01',
    name: 'Madhya Marg Sector 26 Water Main Collapse & Deep Sinkhole',
    status: 'BLOCKED',
    reason: 'Major municipal water main rupture caused deep asphalt collapse across all lanes. Physically impassable.',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7920, 30.7405],
        [76.7950, 30.7365],
        [76.7980, 30.7325],
      ],
    },
  },
  {
    id: 'ROAD-BLOCK-02',
    name: 'Kharar-Balongi Service Road Embankment Rupture',
    status: 'BLOCKED',
    reason: 'Culvert structural collapse and downed high-tension utility poles blocking traffic passage.',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.6780, 30.7470],
        [76.6820, 30.7470],
        [76.6860, 30.7470],
      ],
    },
  },
];

/**
 * Converts BlockedRoad array to GeoJSON FeatureCollection for MapLibre rendering.
 */
export function getBlockedRoadsGeoJSON(): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: BLOCKED_ROADS.map((road) => ({
      type: 'Feature',
      id: road.id,
      properties: {
        id: road.id,
        name: road.name,
        status: road.status,
        reason: road.reason,
        color: '#dc2626', // High-contrast Red hazard styling
      },
      geometry: road.geometry,
    })),
  };
}

