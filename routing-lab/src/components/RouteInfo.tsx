import React from 'react';
import type { RouteResult } from '../types/routing';

interface RouteInfoProps {
  routeResult: RouteResult | null;
  isLoading: boolean;
}

export const RouteInfo: React.FC<RouteInfoProps> = ({ routeResult, isLoading }) => {
  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours} hr ${remainingMins} min`;
  };

  return (
    <div className="route-info-panel card">
      <div className="info-header">
        <span className="info-title">ROUTE METRICS & DIAGNOSTICS</span>
        <div className="status-badge-container">
          {isLoading && <span className="badge badge-loading">Calculating...</span>}
          {!isLoading && !routeResult && <span className="badge badge-idle">Ready</span>}
          {!isLoading && routeResult?.status === 'success' && (
            <span className="badge badge-success">✓ Route Found</span>
          )}
          {!isLoading && routeResult?.status === 'error' && (
            <span className="badge badge-error">✕ Error</span>
          )}
        </div>
      </div>

      {/* Error state display */}
      {routeResult?.status === 'error' && (
        <div className="error-alert">
          <div className="error-title">Routing Error Encountered</div>
          <div className="error-message">{routeResult.error || 'Failed to fetch road route.'}</div>
          <div className="error-hint">
            Troubleshooting: Verify coordinates are on or near a drivable road. Check console logs for network details.
          </div>
        </div>
      )}

      {/* Success metrics */}
      {routeResult?.status === 'success' && (
        <div className="metrics-grid">
          <div className="metric-box">
            <span className="metric-icon">📏</span>
            <div className="metric-data">
              <span className="metric-label">Road Distance</span>
              <span className="metric-value">{formatDistance(routeResult.distanceMeters)}</span>
            </div>
          </div>

          <div className="metric-box">
            <span className="metric-icon">⏱️</span>
            <div className="metric-data">
              <span className="metric-label">Travel Time</span>
              <span className="metric-value">{formatDuration(routeResult.durationSeconds)}</span>
            </div>
          </div>

          <div className="metric-box">
            <span className="metric-icon">📍</span>
            <div className="metric-data">
              <span className="metric-label">Geometry Coordinates</span>
              <span className="metric-value">{routeResult.coordinates.length} nodes</span>
            </div>
          </div>
        </div>
      )}

      {/* Road verification banner */}
      {routeResult?.status === 'success' && (
        <div className="verification-notice">
          <div className="notice-icon">ℹ️</div>
          <div className="notice-text">
            <strong>Road-Following Verification:</strong> The line geometry is drawn directly from{' '}
            <code>{routeResult.coordinates.length}</code> road segments provided by OSRM. It traces actual
            street turns rather than an artificial straight line.
          </div>
        </div>
      )}

      {/* Idle state prompt */}
      {!isLoading && !routeResult && (
        <div className="empty-prompt">
          <p>Select Start and Destination on the map or pick a Verification Preset to test real road routing.</p>
        </div>
      )}
    </div>
  );
};
