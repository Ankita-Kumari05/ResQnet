import type { Coordinate } from './routing';

export type LiveLocationStatus =
  | 'IDLE'
  | 'REQUESTING'
  | 'ACTIVE'
  | 'DENIED'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface LiveLocationState {
  status: LiveLocationStatus;
  coordinate: Coordinate | null; // [lng, lat]
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  timestamp: number | null;
  errorMessage: string | null;
  watchId: number | null;
  isFollowMe: boolean;
}

export const INITIAL_LIVE_LOCATION_STATE: LiveLocationState = {
  status: 'IDLE',
  coordinate: null,
  accuracyMeters: null,
  headingDegrees: null,
  speedMps: null,
  timestamp: null,
  errorMessage: null,
  watchId: null,
  isFollowMe: false,
};
