import type { Polygon, LineString, FeatureCollection } from 'geojson';
import type { Coordinate } from './routing';

export type HazardSeverity = 'LOW' | 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type SafetyStatus = 'SAFE' | 'RISKY' | 'UNSAFE' | 'BLOCKED';

export interface HazardZone {
  id: string;
  name: string;
  severity: HazardSeverity;
  description: string;
  geometry: Polygon;
  color?: string;
  isDangerZone?: boolean;
  isActive?: boolean;
  notes?: string;
  createdAt?: string;
}

export interface BlockedRoad {
  id: string;
  name: string;
  status: 'BLOCKED';
  reason: string;
  geometry: LineString;
  isActive?: boolean;
  notes?: string;
  distanceKm?: number;
  lengthMeters?: number;
  roadId?: string;
  isSection?: boolean;
  startPoint?: Coordinate;
  endPoint?: Coordinate;
  createdAt?: string;
}

export interface HazardIntersection {
  hazardId: string;
  hazardName: string;
  severity: HazardSeverity;
  description: string;
  intersectionPointsCount: number;
}

export interface BlockedRoadIntersection {
  roadId: string;
  roadName: string;
  reason: string;
  intersectionPointsCount: number;
}

export interface RouteSafetyAssessment {
  routeFound: boolean;
  distanceKm: number;
  durationMinutes: number;
  safetyStatus: SafetyStatus;
  highestHazardSeverity: 'NONE' | HazardSeverity;
  blockedRoad: boolean;
  hazardsChecked: number;
  hazardsIntersected: number;
  blockedRoadsChecked: number;
  blockedRoadsIntersected: number;
  hazardIntersections: HazardIntersection[];
  blockedRoadIntersections: BlockedRoadIntersection[];
  /** Sub-segments of the route that enter hazards or blocked corridors (for visual overlays) */
  hazardSegmentsGeoJSON?: FeatureCollection<LineString>;
  evaluatedAt: string;
  error?: string;
}

export interface SafetyScenario {
  id: string;
  scenarioNumber: number;
  name: string;
  shortLabel: string;
  description: string;
  expectedStatus: SafetyStatus;
  expectedHighestSeverity: 'NONE' | HazardSeverity;
  expectedBlockedRoad: boolean;
  start: Coordinate;
  destination: Coordinate;
  notes: string;
}
