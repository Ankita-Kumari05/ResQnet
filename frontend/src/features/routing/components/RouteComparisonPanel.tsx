import React from 'react';
import type { RouteSelectionResult } from '../types/candidates';

interface RouteComparisonPanelProps {
  selectionResult: RouteSelectionResult | null;
  isLoading: boolean;
}

export const RouteComparisonPanel: React.FC<RouteComparisonPanelProps> = ({
  selectionResult,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="route-comparison-card card" id="route-comparison-panel">
        <div className="comparison-header">
          <div className="comparison-title-group">
            <span className="comparison-title">ROUTE COMPARISON & SELECTION</span>
            <span className="comparison-subtitle">Evaluating candidate safety profiles...</span>
          </div>
          <span className="comparison-status-badge badge-evaluating">EVALUATING...</span>
        </div>
        <div className="comparison-loading-body">
          <div className="spinner"></div>
          <span>Comparing route candidates against disaster safety rules...</span>
        </div>
      </div>
    );
  }

  if (!selectionResult || selectionResult.candidates.length === 0) {
    return (
      <div className="route-comparison-card card" id="route-comparison-panel">
        <div className="comparison-header">
          <div className="comparison-title-group">
            <span className="comparison-title">ROUTE COMPARISON & SELECTION</span>
            <span className="comparison-subtitle">Multi-Route Disaster Optimization</span>
          </div>
          <span className="comparison-status-badge badge-idle">STANDBY</span>
        </div>
        <div className="comparison-empty-body">
          <p>Compute an A → B route or select a Phase 3 verification scenario to compare candidates.</p>
        </div>
      </div>
    );
  }

  const {
    candidates,
    selectedRoute,
    reasonCode,
    explanation,
    saferDespiteLonger,
    isSyntheticFixture,
  } = selectionResult;

  return (
    <div className="route-comparison-card card" id="route-comparison-panel">
      {/* Header */}
      <div className="comparison-header">
        <div className="comparison-title-group">
          <div className="header-badges-row">
            <span className="comparison-title">ROUTE COMPARISON & SELECTION</span>
            <span
              className={`test-type-badge ${isSyntheticFixture ? 'badge-synthetic' : 'badge-live-osrm'}`}
            >
              {isSyntheticFixture ? 'Deterministic Selection Fixture' : 'Live OSRM Candidate Response'}
            </span>
          </div>
          <span className="comparison-subtitle">
            {candidates.length === 1
              ? '1 route candidate available'
              : `${candidates.length} route candidates evaluated`}
          </span>
        </div>
        <div className="decision-status-pill">
          {reasonCode === 'NO_SAFE_ROUTE' ? (
            <span className="pill-no-safe" id="selection-decision-badge">
              NO SAFE ROUTE
            </span>
          ) : (
            <span className="pill-route-selected" id="selection-decision-badge">
              ✓ {selectedRoute?.id || 'ROUTE SELECTED'}
            </span>
          )}
        </div>
      </div>

      {/* Standout Callout Banner: Safer Route Selected Despite Longer Distance */}
      {saferDespiteLonger && (
        <div className="safer-despite-longer-callout" id="safer-longer-banner">
          <div className="callout-icon">🛡️</div>
          <div className="callout-content">
            <strong className="callout-headline">Safer route selected despite longer distance.</strong>
            <span className="callout-text">
              ResQnet prioritizes citizen life safety over travel speed. A longer SAFE corridor was chosen
              over a shorter hazardous alternative.
            </span>
          </div>
        </div>
      )}

      {/* Other Contextual Banners */}
      {!saferDespiteLonger && reasonCode === 'SAFE_ROUTE_SHORTER' && (
        <div className="selection-notice notice-safe-shorter" id="selection-notice-banner">
          <strong>Efficiency Selection:</strong> Shortest safe route selected among equivalent SAFE alternatives.
        </div>
      )}

      {!saferDespiteLonger && reasonCode === 'MODERATE_RISK_ROUTE_SELECTED' && (
        <div className="selection-notice notice-moderate-risk" id="selection-notice-banner">
          <strong>Degraded Selection:</strong> Moderate-risk route selected because no safe route was available.
        </div>
      )}

      {reasonCode === 'ONLY_CANDIDATE_AVAILABLE' && (
        <div className="selection-notice notice-single-candidate" id="selection-notice-banner">
          <strong>Single Candidate:</strong> Only 1 route candidate returned by OSRM; no alternative comparison available.
        </div>
      )}

      {reasonCode === 'NO_SAFE_ROUTE' && (
        <div className="selection-notice notice-no-safe" id="selection-notice-banner">
          <strong>CRITICAL WARNING:</strong> No safe route available. All available road corridors traverse
          unacceptable disaster hazards or road closures.
        </div>
      )}

      {/* Candidates List */}
      <div className="candidates-list" id="route-candidates-list">
        {candidates.map((cand, idx) => {
          const isWinner = cand.isSelected;
          const status = cand.safetyAssessment.safetyStatus;
          const isBlocked = status === 'BLOCKED';
          const isUnsafe = status === 'UNSAFE';

          return (
            <div
              key={cand.id}
              id={`candidate-card-${cand.id}`}
              className={`candidate-card ${isWinner ? 'candidate-selected' : ''} ${
                isBlocked || isUnsafe ? 'candidate-rejected' : ''
              }`}
            >
              <div className="candidate-card-top">
                <div className="candidate-name-group">
                  <span className="candidate-index">#{idx + 1}</span>
                  <span className="candidate-label">{cand.label}</span>
                </div>

                <div className="candidate-tags-group">
                  {isWinner && <span className="winner-badge" id="selected-route-indicator">✓ SELECTED</span>}
                  {!isWinner && (isBlocked || isUnsafe) && (
                    <span className="rejected-badge">REJECTED</span>
                  )}
                  {!isWinner && !isBlocked && !isUnsafe && (
                    <span className="not-selected-badge">NOT SELECTED</span>
                  )}
                </div>
              </div>

              <div className="candidate-metrics-row">
                <div className="cand-metric">
                  <span className="cand-metric-lbl">Distance:</span>
                  <span className="cand-metric-val">{cand.distanceKm} km</span>
                </div>
                <div className="cand-metric">
                  <span className="cand-metric-lbl">ETA:</span>
                  <span className="cand-metric-val">{cand.durationMinutes} min</span>
                </div>
                <div className="cand-metric">
                  <span className="cand-metric-lbl">Safety:</span>
                  <span
                    className={`cand-status-tag status-${status.toLowerCase()}`}
                  >
                    {status}
                  </span>
                </div>
                <div className="cand-metric">
                  <span className="cand-metric-lbl">Hazard:</span>
                  <span className="cand-sev-val">
                    {cand.safetyAssessment.highestHazardSeverity}
                  </span>
                </div>
              </div>

              {/* Hazard details if detected */}
              {cand.safetyAssessment.hazardIntersections.length > 0 && (
                <div className="cand-hazards-summary">
                  Traverses:{' '}
                  {cand.safetyAssessment.hazardIntersections
                    .map((h) => `${h.hazardId} (${h.severity})`)
                    .join(', ')}
                </div>
              )}

              {cand.safetyAssessment.blockedRoad && (
                <div className="cand-blocked-summary">
                  Road Blocked:{' '}
                  {cand.safetyAssessment.blockedRoadIntersections.map((b) => b.roadId).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Decision Explanation Box */}
      <div className="decision-explanation-box">
        <span className="decision-label">REASON:</span>
        <span className="decision-text" id="selection-explanation-text">{explanation}</span>
      </div>
    </div>
  );
};
