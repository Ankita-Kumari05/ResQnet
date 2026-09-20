import React from 'react';
import type { LiveLocationState } from '../types/location';
import type { GpsNavigationEvaluation } from '../services/routeProgressService';

interface LiveLocationBarProps {
  locationState: LiveLocationState;
  onToggleLiveLocation: () => void;
  onRecenter: () => void;
  onToggleFollowMe: () => void;
  isDeveloperMode?: boolean;
  navEvaluation?: GpsNavigationEvaluation | null;
  onRerouteFromGps?: () => void;
  onSimulateGpsStep?: (metersDelta: number) => void;
  onSimulateGpsNoise?: () => void;
  onSimulateGpsDeviate?: () => void;
  onSimulateGpsArrive?: () => void;
  isSimulatingWalk?: boolean;
  onToggleSimulateWalk?: () => void;
}

export const LiveLocationBar: React.FC<LiveLocationBarProps> = ({
  locationState,
  onToggleLiveLocation,
  onRecenter,
  onToggleFollowMe,
  isDeveloperMode = false,
  navEvaluation = null,
  onRerouteFromGps,
  onSimulateGpsStep,
  onSimulateGpsNoise,
  onSimulateGpsDeviate,
  onSimulateGpsArrive,
  isSimulatingWalk = false,
  onToggleSimulateWalk,
}) => {
  const isTracking = locationState.status === 'ACTIVE' || locationState.status === 'REQUESTING';
  const hasCoords = Boolean(locationState.coordinate);

  const formattedTime = locationState.timestamp
    ? new Date(locationState.timestamp).toLocaleTimeString()
    : null;

  const percentCompleted = navEvaluation
    ? Math.min(100, Math.round(navEvaluation.progressFraction * 100))
    : 0;

  return (
    <div className="live-location-widget card" id="live-location-widget">
      <div className="live-location-main-row">
        {/* Toggle Live Location Button */}
        <button
          type="button"
          id="btn-toggle-live-location"
          className={`btn-live-location ${isTracking ? 'btn-live-active' : ''}`}
          onClick={onToggleLiveLocation}
          title={isTracking ? 'Turn Off Live Location' : 'Start Live GPS Location Tracking'}
        >
          <span className={`live-status-dot dot-${locationState.status.toLowerCase()}`}></span>
          <span className="live-btn-label">
            {locationState.status === 'REQUESTING'
              ? 'LOCATING...'
              : isTracking
              ? 'LIVE LOCATION'
              : 'LIVE LOCATION'}
          </span>
        </button>

        {/* When tracking, show action buttons */}
        {isTracking && (
          <div className="live-location-actions-row">
            <button
              type="button"
              id="btn-recenter-gps"
              className="btn-gps-action"
              onClick={onRecenter}
              disabled={!hasCoords}
              title="Recenter map camera to current GPS position"
            >
              ⌖ RECENTER
            </button>

            <button
              type="button"
              id="btn-follow-me"
              className={`btn-gps-action ${locationState.isFollowMe ? 'btn-follow-active' : ''}`}
              onClick={onToggleFollowMe}
              disabled={!hasCoords}
              title={locationState.isFollowMe ? 'Disable Follow Me Camera' : 'Enable Follow Me Camera'}
            >
              {locationState.isFollowMe ? 'FOLLOW ME ON' : 'FOLLOW ME'}
            </button>
          </div>
        )}
      </div>

      {/* Status Details / Error Feedback */}
      {locationState.status === 'REQUESTING' && (
        <div className="live-location-status-text status-amber" id="gps-status-requesting">
          ● SEARCHING FOR LOCATION...
        </div>
      )}

      {locationState.status === 'ACTIVE' && (
        <div className="live-location-status-text status-emerald" id="gps-status-active">
          <span className="status-live-tag">● LIVE</span>
          {locationState.accuracyMeters !== null && (
            <span className="live-accuracy-tag">
              Accuracy: {Math.round(locationState.accuracyMeters)} m
            </span>
          )}
          {locationState.isFollowMe && (
            <span className="live-follow-tag">
              Follow Me Active
            </span>
          )}
        </div>
      )}

      {locationState.status === 'DENIED' && (
        <div className="live-location-status-text status-rose" id="gps-status-denied">
          ⚠ Location permission is required for live tracking.
        </div>
      )}

      {locationState.status === 'UNAVAILABLE' && (
        <div className="live-location-status-text status-rose" id="gps-status-unavailable">
          ⚠ Location signal unavailable.
        </div>
      )}

      {locationState.status === 'ERROR' && (
        <div className="live-location-status-text status-rose" id="gps-status-error">
          ⚠ {locationState.errorMessage || 'Location request failed.'}
        </div>
      )}

      {/* Live Route Navigation Progress Panel */}
      {navEvaluation && navEvaluation.status !== 'IDLE' && (
        <div
          className={`nav-progress-card ${
            navEvaluation.status === 'OFF_ROUTE'
              ? 'nav-off-route'
              : navEvaluation.status === 'ARRIVED'
              ? 'nav-arrived'
              : ''
          }`}
          id="nav-progress-card"
        >
          <div className="nav-progress-header">
            <span
              className={`nav-status-badge ${
                navEvaluation.status === 'ON_ROUTE'
                  ? 'badge-on-route'
                  : navEvaluation.status === 'OFF_ROUTE'
                  ? 'badge-off-route'
                  : 'badge-arrived'
              }`}
            >
              {navEvaluation.status === 'ON_ROUTE' && '🧭 ON ROUTE'}
              {navEvaluation.status === 'OFF_ROUTE' && '⚠ OFF ROUTE'}
              {navEvaluation.status === 'ARRIVED' && '🎉 ARRIVED'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
              {percentCompleted}%
            </span>
          </div>

          <div className="nav-progress-bar-bg">
            <div
              className={`nav-progress-bar-fill ${
                navEvaluation.status === 'ARRIVED' ? 'fill-arrived' : ''
              }`}
              style={{ width: `${percentCompleted}%` }}
            />
          </div>

          <div className="nav-metrics-row">
            {navEvaluation.status === 'ARRIVED' ? (
              <span style={{ color: '#34d399', fontWeight: 700 }}>
                Destination reached.
              </span>
            ) : (
              <>
                <span>
                  Remaining:{' '}
                  <strong style={{ color: '#f8fafc' }}>
                    {(navEvaluation.remainingDistanceMeters / 1000).toFixed(2)} km
                  </strong>
                </span>
                <span>
                  {Math.round(navEvaluation.currentProgressMeters)}m travelled
                </span>
              </>
            )}
          </div>

          {navEvaluation.status === 'OFF_ROUTE' && (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '10.5px', color: '#fbbf24', marginBottom: '4px' }}>
                {navEvaluation.explanation}
              </div>
              {onRerouteFromGps && (
                <button
                  type="button"
                  id="btn-recalculate-route-gps"
                  className="btn-nav-reroute"
                  onClick={onRerouteFromGps}
                  title="Recalculate route from current GPS location to destination"
                >
                  🔄 RECALCULATE FROM GPS
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Developer Mode Extended Telemetry & GPS Simulator */}
      {isDeveloperMode && (
        <div className="live-location-dev-card" id="gps-dev-telemetry">
          {isTracking && hasCoords && (
            <>
              <div className="dev-telemetry-header">GPS TELEMETRY (DEV)</div>
              <div className="dev-telemetry-grid">
                <div className="dev-field">
                  <span className="dev-label">LAT:</span>{' '}
                  <span className="dev-val">{locationState.coordinate![1].toFixed(6)}</span>
                </div>
                <div className="dev-field">
                  <span className="dev-label">LNG:</span>{' '}
                  <span className="dev-val">{locationState.coordinate![0].toFixed(6)}</span>
                </div>
                <div className="dev-field">
                  <span className="dev-label">ACCURACY:</span>{' '}
                  <span className="dev-val">
                    {locationState.accuracyMeters !== null ? `${Math.round(locationState.accuracyMeters)} m` : 'N/A'}
                  </span>
                </div>
                <div className="dev-field">
                  <span className="dev-label">SPEED:</span>{' '}
                  <span className="dev-val">
                    {locationState.speedMps !== null ? `${locationState.speedMps.toFixed(1)} m/s` : '0 m/s'}
                  </span>
                </div>
                <div className="dev-field">
                  <span className="dev-label">HEADING:</span>{' '}
                  <span className="dev-val">
                    {locationState.headingDegrees !== null ? `${Math.round(locationState.headingDegrees)}°` : 'N/A'}
                  </span>
                </div>
                <div className="dev-field">
                  <span className="dev-label">UPDATED:</span>{' '}
                  <span className="dev-val">{formattedTime || 'N/A'}</span>
                </div>
              </div>
            </>
          )}

          {/* GPS Simulation Toolbar for testing */}
          <div className="gps-sim-toolbar">
            <div className="gps-sim-title">⚡ GPS ROUTE SIMULATOR (DEV)</div>
            <div className="gps-sim-buttons-grid">
              <button
                type="button"
                id="btn-sim-walk"
                className={`btn-sim-action ${isSimulatingWalk ? 'sim-active' : ''}`}
                onClick={onToggleSimulateWalk}
                title="Automatically step GPS forward along the route"
              >
                {isSimulatingWalk ? '⏸ PAUSE SIM' : '▶ WALK SIM'}
              </button>
              <button
                type="button"
                id="btn-sim-step-100"
                className="btn-sim-action"
                onClick={() => onSimulateGpsStep?.(100)}
                title="Step GPS 100m forward along route"
              >
                ⏩ STEP +100M
              </button>
              <button
                type="button"
                id="btn-sim-noise"
                className="btn-sim-action"
                onClick={onSimulateGpsNoise}
                title="Simulate noisy backward fluctuation to test monotonic filter"
              >
                ↩ NOISE (-15M)
              </button>
              <button
                type="button"
                id="btn-sim-deviate"
                className="btn-sim-action"
                onClick={onSimulateGpsDeviate}
                title="Deviate GPS 90m off road to test off-route detection"
              >
                ↗ DEVIATE (90M)
              </button>
              <button
                type="button"
                id="btn-sim-arrive"
                className="btn-sim-action"
                onClick={onSimulateGpsArrive}
                title="Place GPS right at destination to test arrival"
                style={{ gridColumn: 'span 2' }}
              >
                🏁 JUMP TO DESTINATION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
