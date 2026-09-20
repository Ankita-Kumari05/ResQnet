import type { Coordinate } from '../types/routing';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Validates a GeoJSON coordinate [lng, lat].
 * Rejects undefined, null, non-numbers, NaN, out-of-range, and (0,0).
 */
export function isValidCoordinate(coord: any): coord is Coordinate {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (Number.isNaN(lng) || Number.isNaN(lat)) return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (Math.abs(lng) < 1e-6 && Math.abs(lat) < 1e-6) return false;
  return true;
}

/**
 * Normalizes any coordinate representation (LatLng object, array, or GeolocationCoordinates)
 * into a strict GeoJSON [longitude, latitude] pair for MapLibre.
 */
export function toLngLat(
  input: LatLng | Coordinate | GeolocationCoordinates | null | undefined
): Coordinate | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    if (isValidCoordinate(input)) {
      return [input[0], input[1]];
    }
    return null;
  }

  if (typeof input === 'object') {
    const lat = 'latitude' in input ? (input as GeolocationCoordinates).latitude : (input as LatLng).lat;
    const lng = 'longitude' in input ? (input as GeolocationCoordinates).longitude : (input as LatLng).lng;

    if (typeof lng === 'number' && typeof lat === 'number' && !Number.isNaN(lng) && !Number.isNaN(lat)) {
      const coord: Coordinate = [lng, lat];
      if (isValidCoordinate(coord)) {
        return coord;
      }
    }
  }

  return null;
}

/**
 * Normalizes any coordinate representation into an internal application object { lat, lng }.
 */
export function toLatLng(
  input: Coordinate | LatLng | GeolocationCoordinates | null | undefined
): LatLng | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    if (isValidCoordinate(input)) {
      return { lng: input[0], lat: input[1] };
    }
    return null;
  }

  if (typeof input === 'object') {
    const lat = 'latitude' in input ? (input as GeolocationCoordinates).latitude : (input as LatLng).lat;
    const lng = 'longitude' in input ? (input as GeolocationCoordinates).longitude : (input as LatLng).lng;

    if (typeof lng === 'number' && typeof lat === 'number' && !Number.isNaN(lng) && !Number.isNaN(lat)) {
      return { lat, lng };
    }
  }

  return null;
}
