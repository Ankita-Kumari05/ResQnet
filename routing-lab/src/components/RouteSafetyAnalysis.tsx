import React from 'react';
import type { RouteSafetyAssessment, SafetyStatus, HazardSeverity } from '../types/safety';

interface RouteSafetyAnalysisProps {
  assessment: RouteSafetyAssessment | null;
  isLoading: boolean;
}

export const RouteSafetyAnalysis: React.FC<RouteSafetyAnalysisProps> = ({
  assessment,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="safety-analysis-card card">
        <div className="safety-card-header">
          <span className="safety-title">ROUTE SAFETY ANALYSIS</span>
          <span className="safety-badge badge-evaluating">EVALUATING SPATIAL HAZARDS...</span>
        </div>
        <div className="safety-loading-body">
          <div className="spinner"></div>
          <span>Analyzing OSRM route geometry against disaster layers...</span>
        </div>
      </div>
    );
  }

  if (!assessment || !assessment.routeFound) {
    return (
      <div className="safety-analysis-card card">
        <div className="safety-card-header">
          <span className="safety-title">ROUTE SAFETY ANALYSIS</span>
          <span className="safety-badge badge-idle">STANDBY</span>
        </div>
        <div className="safety-idle-body">
          <p>
            Spatial disaster assessment will run automatically when an OSRM road route is calculated.
          </p>
          {assessment?.error && (
            <div className="safety-error-notice">
              <strong>Notice:</strong> {assessment.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const getStatusBadgeClass = (status: SafetyStatus): string => {
    switch (status) {
      case 'SAFE':
        return 'safety-status-safe';
      case 'RISKY':
        return 'safety-status-risky';
      case 'UNSAFE':
        return 'safety-status-unsafe';
      case 'BLOCKED':
        return 'safety-status-blocked';
      default:
        return '';
    }
  };

  const getSeverityBadgeClass = (severity: 'NONE' | HazardSeverity): string => {
    switch (severity) {
      case 'SAFE':
        return 'sev-safe';
      case 'MODERATE':
        return 'sev-moderate';
      case 'HIGH':
        return 'sev-high';
      case 'CRITICAL':
        return 'sev-critical';
      default:
        return 'sev-none';
    }
  };

  return (
    <div className="safety-analysis-card card" id="route-safety-analysis-panel">
      {/* Header with Main Classification Status */}
      <div className="safety-card-header">
        <div className="safety-title-group">
          <span className="safety-title">ROUTE SAFETY ANALYSIS</span>
          <span className="safety-subtitle">Post-OSRM Spatial Hazard & Closure Assessment</span>
        </div>
        <div className={`status-pill ${getStatusBadgeClass(assessment.safetyStatus)}`}>
          <span className="status-label">STATUS:</span>
          <span className="status-value" id="safety-status-badge">
            {assessment.safetyStatus}
          </span>
        </div>
      </div>

      {/* Core Safety Indicators Grid */}
      <div className="safety-metrics-grid">
        {/* Highest Hazard Severity */}
        <div className="safety-metric-item">
          <span className="metric-label">HIGHEST HAZARD</span>
          <span
            className={`severity-tag ${getSeverityBadgeClass(assessment.highestHazardSeverity)}`}
            id="highest-hazard-badge"
          >
            {assessment.highestHazardSeverity}
          </span>
        </div>

        {/* Blocked Road Presence */}
        <div className="safety-metric-item">
          <span className="metric-label">BLOCKED ROAD</span>
          <span
            className={`blocked-tag ${assessment.blockedRoad ? 'blocked-yes' : 'blocked-no'}`}
            id="blocked-road-flag"
          >
            {assessment.blockedRoad ? 'YES (IMPASSABLE)' : 'NO'}
          </span>
        </div>

        {/* Hazard Intersections Count */}
        <div className="safety-metric-item">
          <span className="metric-label">HAZARDS INTERSECTED</span>
          <span className="metric-counter" id="hazards-count">
            {assessment.hazardsIntersected} / {assessment.hazardsChecked}
          </span>
        </div>

        {/* Blocked Roads Count */}
        <div className="safety-metric-item">
          <span className="metric-label">ROAD CLOSURES</span>
          <span className="metric-counter" id="blocked-count">
            {assessment.blockedRoadsIntersected} / {assessment.blockedRoadsChecked}
          </span>
        </div>
      </div>

      {/* Detailed Intersected Hazards List */}
      {assessment.hazardIntersections.length > 0 && (
        <div className="intersections-section" id="detected-hazards-list">
          <div className="section-label">DETECTED HAZARD ZONES ({assessment.hazardIntersections.length})</div>
          <div className="intersections-list">
            {assessment.hazardIntersections.map((h) => (
              <div key={h.hazardId} className={`hazard-item-card hazard-border-${h.severity.toLowerCase()}`}>
                <div className="hazard-item-header">
                  <span className="hazard-id-tag">{h.hazardId}</span>
                  <span className={`hazard-sev-tag ${getSeverityBadgeClass(h.severity)}`}>
                    {h.severity}
                  </span>
                  <span className="hazard-name">{h.hazardName}</span>
                </div>
                <div className="hazard-item-desc">{h.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Blocked Road Closures List */}
      {assessment.blockedRoadIntersections.length > 0 && (
        <div className="intersections-section" id="detected-blocked-roads-list">
          <div className="section-label">DETECTED ROAD CLOSURES ({assessment.blockedRoadIntersections.length})</div>
          <div className="intersections-list">
            {assessment.blockedRoadIntersections.map((b) => (
              <div key={b.roadId} className="blocked-item-card">
                <div className="blocked-item-header">
                  <span className="blocked-id-tag">{b.roadId}</span>
                  <span className="blocked-status-tag">PHYSICALLY BLOCKED</span>
                  <span className="blocked-name">{b.roadName}</span>
                </div>
                <div className="blocked-item-reason">{b.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear Status Notice */}
      {assessment.safetyStatus === 'SAFE' && assessment.hazardIntersections.length === 0 && (
        <div className="safe-clear-notice">
          <span className="clear-badge">VERIFIED</span>
          <span>No disaster hazard zones or road closures intersect this OSRM route. Route is clear.</span>
        </div>
      )}
    </div>
  );
};
