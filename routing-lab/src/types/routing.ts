import type { LineString } from 'geojson';

/**
 * Coordinate in GeoJSON format: [longitude, latitude]
 * IMPORTANT: GeoJSON is [lng, lat], never [lat, lng].
 */
export type Coordinate = [number, number];

export type RoutingStatus = 'idle' | 'loading' | 'success' | 'error';

export interface RouteResult {
  coordinates: Coordinate[];
  geometry: LineString;
  distanceMeters: number;
  durationSeconds: number;
  status: RoutingStatus;
  error?: string;
}

export interface TestPreset {
  id: string;
  name: string;
  description: string;
  start: Coordinate;
  destination: Coordinate;
}

export type StartOriginType = 'CURRENT_LOCATION' | 'MAP_POINT';

export interface RoutingOrigin {
  type: StartOriginType;
  coordinate: Coordinate | null;
  accuracyMeters?: number | null;
  label?: string;
}

export interface SafetyHub {
  id: string;
  name: string;
  coordinate: Coordinate;
  description: string;
}

export const PRIMARY_SAFETY_HUB: SafetyHub = {
  id: 'HUB-SEC17',
  name: 'Sector 17 Emergency Staging Hub',
  coordinate: [76.7790, 30.7330],
  description: 'Designated civil emergency assembly & staging area with medical triage.',
};

export interface PointSelectionState {
  start: Coordinate | null;
  destination: Coordinate | null;
  originType?: StartOriginType;
}
