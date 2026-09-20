import type { HazardZone } from '../types/safety';
import type { FeatureCollection, Polygon } from 'geojson';

/**
 * Deterministic Hazard Zones for Chandigarh – Mohali – Kharar – Zirakpur – Panchkula.
 * All coordinates are strictly [longitude, latitude] in GeoJSON format.
 * Polygons are closed rings (first and last coordinate identical).
 */
export const HAZARD_ZONES: HazardZone[] = [
  {
    id: 'HZ-CHD-01',
    name: 'Kharar NH-5 Flyover Drainage Failure & Structural Debris Zone',
    severity: 'HIGH',
    description: 'Major drainage rupture and structural barrier debris blocking NH-5 flyover corridor in Kharar. Direct flyover impassable. Use Kharar-Landran bypass or service corridor.',
    color: '#ef4444', // Red (HIGH severity)
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [76.6500, 30.7490],
          [76.6620, 30.7490],
          [76.6620, 30.7430],
          [76.6500, 30.7430],
          [76.6500, 30.7490], // Close ring
        ],
      ],
    },
  },
  {
    id: 'HZ-SAFE-01',
    name: 'Sector 17 Parade Ground Emergency Staging Area (Green / Safe)',
    severity: 'SAFE',
    description: 'Designated civil emergency assembly and logistics hub. Normal driving conditions with emergency personnel present.',
    color: '#10b981', // Green
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [76.7760, 30.7360],
          [76.7820, 30.7360],
          [76.7820, 30.7300],
          [76.7760, 30.7300],
          [76.7760, 30.7360],
        ],
      ],
    },
  },
  {
    id: 'HZ-MOD-01',
    name: 'Tribune Chowk Stormwater Waterlogging Zone',
    severity: 'MODERATE',
    description: 'Monsoon stormwater accumulation up to 25cm along underpass and slip roads. Passable with caution; safety penalty applied.',
    color: '#f59e0b', // Vibrant Orange
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [76.7910, 30.6980],
          [76.7990, 30.6980],
          [76.7990, 30.6920],
          [76.7910, 30.6920],
          [76.7910, 30.6980],
        ],
      ],
    },
  },
  {
    id: 'HZ-HIGH-01',
    name: 'Sukhna Choe Overflow & Flash Flood Corridor',
    severity: 'HIGH',
    description: 'Severe seasonal flash flood surge across Industrial Area Phase 1 and Railway link road. High risk hazard.',
    color: '#ef4444', // Red
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [76.8100, 30.7180],
          [76.8220, 30.7180],
          [76.8220, 30.7100],
          [76.8100, 30.7100],
          [76.8100, 30.7180],
        ],
      ],
    },
  },
  {
    id: 'HZ-CRIT-01',
    name: 'Mohali Phase 8B Industrial Chemical Spill & Collapse Zone',
    severity: 'CRITICAL',
    description: 'Active toxic industrial vapor leak and building structural failure in Phase 8B Industrial Focal Point. MANDATORY NO-GO ZONE.',
    color: '#9333ea', // Deep Purple / Crimson warning
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [76.6960, 30.6960],
          [76.7060, 30.6960],
          [76.7060, 30.6880],
          [76.6960, 30.6880],
          [76.6960, 30.6960],
        ],
      ],
    },
  },
];

/**
 * Converts HazardZone array to GeoJSON FeatureCollection for MapLibre rendering.
 */
export function getHazardZonesGeoJSON(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: HAZARD_ZONES.map((zone) => ({
      type: 'Feature',
      id: zone.id,
      properties: {
        id: zone.id,
        name: zone.name,
        severity: zone.severity,
        description: zone.description,
        color: zone.color || '#f59e0b',
      },
      geometry: zone.geometry,
    })),
  };
}

