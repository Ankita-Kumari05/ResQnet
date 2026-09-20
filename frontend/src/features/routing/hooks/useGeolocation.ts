// Clean GPS Geolocation Hook for ResQnet Map Engine
// Manages a single active watchPosition listener with automatic cleanup.

import { useState, useEffect } from 'react';
import { INITIAL_LIVE_LOCATION_STATE, type LiveLocationState } from '../types/location';

export function useGeolocation(enabled: boolean = true): LiveLocationState {
  const [state, setState] = useState<LiveLocationState>(INITIAL_LIVE_LOCATION_STATE);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_LIVE_LOCATION_STATE);
      return;
    }

    if (!navigator.geolocation) {
      setState({
        ...INITIAL_LIVE_LOCATION_STATE,
        status: 'UNAVAILABLE',
        errorMessage: 'Geolocation is not supported by your browser.',
      });
      return;
    }

    setState(prev => ({ ...prev, status: 'REQUESTING', errorMessage: null }));

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const { longitude, latitude, accuracy, heading, speed } = pos.coords;
        setState({
          status: 'ACTIVE',
          coordinate: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
          accuracyMeters: typeof accuracy === 'number' ? Math.round(accuracy) : null,
          headingDegrees: typeof heading === 'number' ? Math.round(heading) : null,
          speedMps: typeof speed === 'number' ? Math.round(speed * 10) / 10 : null,
          timestamp: pos.timestamp,
          watchId,
          errorMessage: null,
          isFollowMe: false,
        });
      },
      err => {
        let msg = 'Failed to retrieve GPS fix.';
        let status: LiveLocationState['status'] = 'ERROR';

        if (err.code === err.PERMISSION_DENIED) {
          status = 'DENIED';
          msg = 'Location permission is required for live map tracking.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          status = 'UNAVAILABLE';
          msg = 'Location signal unavailable.';
        } else if (err.code === err.TIMEOUT) {
          status = 'ERROR';
          msg = 'Location request timed out.';
        }

        setState(prev => ({
          ...prev,
          status,
          errorMessage: msg,
          watchId,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return state;
}
