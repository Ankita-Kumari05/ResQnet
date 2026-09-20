import React from 'react';
import type { RoutingDecision } from '../types/routingDecision';

interface DetourAnalysisPanelProps {
  decision: RoutingDecision | null;
  isLoading: boolean;
  isDeveloperMode?: boolean;
}

export const DetourAnalysisPanel: React.FC<DetourAnalysisPanelProps> = ({
  decision,
  isLoading,
  isDeveloperMode = false,
}) => {
  if (isLoading) {
    return (
      <div className="detour-analysis-card card" id="detour-analysis-panel">
        <div className="detour-header">
          <div className="detour-title-group">
            <span className="detour-title">ACTIVE HAZARD AVOIDANCE</span>
            <span className="detour-subtitle">Generating road-following bypasses...</span>
          </div>
          <span className="badge-evaluating">EVALUATING...</span>
        </div>
        <div className="detour-loading-body">
          <div className="spinner"></div>
          <span>Computing OSRM road detour corridors around hazard zones...</span>
        </div>
      </div>
    );
  }

  if (!decision || decision.status === 'IDLE') {
    return (
      <div className="detour-analysis-card card" id="detour-analysis-panel">
        <div className="detour-header">
          <div className="detour-title-group">
            <span className="detour-title">ACTIVE HAZARD AVOIDANCE</span>
            <span className="detour-subtitle">Real Road-Following Safe Detour Engine</span>
          </div>
          <span className="detour-badge-idle">STANDBY</span>
        </div>
        <div className="detour-empty-body">
          <p>Compute an A → B route or select a verification scenario to activate detour avoidance.</p>
        </div>
      </div>
    );
  }

  const {
    routingMode,
    selectedRoute,
    detourAttempts,
    safeDetoursCount,
    detourCandidates,
    saferDespiteLonger,
    visualTier: decisionVisualTier,
  } = decision;

  const isSafe = selectedRoute?.safetyAssessment.safetyStatus === 'SAFE';
  const isDetour = Boolean(selectedRoute?.isDetour);
  const tier = decisionVisualTier || selectedRoute?.visualTier || (
    !selectedRoute
      ? 'NONE'
      : isSafe
      ? 'SAFE'
      : selectedRoute.safetyAssessment.highestHazardSeverity === 'HIGH'
      ? 'UNSAFE_FALLBACK'
      : 'LOWER_RISK'
  );

  return (
    <div className="detour-analysis-card card" id="detour-analysis-panel">
      {/* Header with Canonical Routing Mode Badge */}
      <div className="detour-header">
        <div className="detour-title-group">
          <div className="header-badges-row">
            <span className="detour-title">ROUTE RECOMMENDATION</span>
            <span
              id="routing-mode-badge"
              className={`routing-mode-badge ${
                tier === 'SAFE'
                  ? 'mode-normal'
                  : tier === 'LOWER_RISK'
                  ? 'mode-safest-available'
                  : tier === 'UNSAFE_FALLBACK'
                  ? 'mode-unsafe-fallback'
                  : 'mode-no-safe'
              }`}
            >
              {tier === 'SAFE' && (isDetour ? '✓ HAZARD-AVOIDING SAFE ROUTE' : '✓ SAFE ROUTE')}
              {tier === 'LOWER_RISK' && '⚠ SAFEST AVAILABLE ROUTE'}
              {tier === 'UNSAFE_FALLBACK' && '⚠ UNSAFE — SHORTEST AVAILABLE'}
              {tier === 'NONE' && '⛔ NO USABLE ROUTE'}
            </span>
          </div>
          <span className="detour-subtitle" id="detour-subtitle-text">
            {tier === 'SAFE' && (isDetour ? 'Follow the highlighted route around the hazard.' : 'Follow the highlighted route.')}
            {tier === 'LOWER_RISK' && 'No completely safe route is available. This is the best available lower-risk option.'}
            {tier === 'UNSAFE_FALLBACK' && 'No safe route is currently available. This is the shortest usable option and may contain hazards.'}
            {tier === 'NONE' && 'No usable road route is currently available.'}
          </span>
        </div>
      </div>

      {/* Case A: Verified Safe Route Banner (Blue) */}
      {tier === 'SAFE' && !isDetour && (
        <div className="detour-success-banner" id="safe-route-callout">
          <div className="callout-icon">✓</div>
          <div className="callout-content">
            <strong className="callout-headline">Safe Route Verified</strong>
            <span className="callout-text">
              Direct corridor is clear of active hazards. Follow the highlighted blue route.
            </span>
          </div>
        </div>
      )}

      {/* Case B: Safe Detour Selected Banner (Blue) */}
      {tier === 'SAFE' && isDetour && (
        <div className="detour-success-banner" id="detour-success-callout">
          <div className="callout-icon">🧭</div>
          <div className="callout-content">
            <strong className="callout-headline">
              {saferDespiteLonger
                ? 'Hazard-avoiding safe route selected.'
                : 'Safe detour corridor verified.'}
            </strong>
            <span className="callout-text">
              Follow the highlighted blue route around the hazard zone.
            </span>
          </div>
        </div>
      )}

      {/* Case C: Safest Available Route (Lower Risk) Banner (Green) */}
      {tier === 'LOWER_RISK' && (
        <div className="detour-warn-banner" id="safest-available-callout" style={{ background: 'rgba(16, 185, 129, 0.12)', borderLeft: '4px solid #10b981', padding: '10px 12px', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '8px 0' }}>
          <div className="callout-icon" style={{ fontSize: '18px' }}>⚠️</div>
          <div className="callout-content" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong className="callout-headline" style={{ color: '#059669', fontSize: '13px' }}>
              Safest Available Route (Lower Risk)
            </strong>
            <span className="callout-text" style={{ color: '#047857', fontSize: '12px' }}>
              No completely safe route is available. This is the best available lower-risk option. Follow the highlighted green route.
            </span>
          </div>
        </div>
      )}

      {/* Case D: Unsafe Fallback Route Banner (Pink) */}
      {tier === 'UNSAFE_FALLBACK' && (
        <div className="detour-danger-banner" id="unsafe-fallback-callout" style={{ background: 'rgba(236, 72, 153, 0.12)', borderLeft: '4px solid #ec4899', padding: '10px 12px', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '8px 0' }}>
          <div className="callout-icon" style={{ fontSize: '18px' }}>⚠️</div>
          <div className="callout-content" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <strong className="callout-headline" style={{ color: '#be185d', fontSize: '13px' }}>
              Unsafe — Shortest Available Fallback
            </strong>
            <span className="callout-text" style={{ color: '#9d174d', fontSize: '12px' }}>
              No safe route is currently available. This route is the shortest usable option and may contain hazards. Proceed with extreme caution.
            </span>
          </div>
        </div>
      )}

      {/* Case E: No Usable Route Warning Banner */}
      {tier === 'NONE' && (
        <div className="detour-danger-banner" id="no-safe-detour-banner">
          <div className="callout-icon">⛔</div>
          <div className="callout-content">
            <strong className="callout-headline">No usable route available.</strong>
            <span className="callout-text">
              No usable road route is currently available. All available corridors traverse severe hazards or closures.
            </span>
          </div>
        </div>
      )}

      {/* Detour Engine Metrics Grid - only in developer mode */}
      {isDeveloperMode && (
        <div className="detour-metrics-grid">
          <div className="detour-metric-item">
            <span className="metric-label">Routing Mode:</span>
            <strong
              id="metric-routing-mode"
              className={
                routingMode === 'NORMAL_ROUTE'
                  ? 'text-ok'
                  : routingMode === 'HAZARD_AVOIDING_DETOUR'
                  ? 'text-warn'
                  : 'text-danger'
              }
            >
              {routingMode}
            </strong>
          </div>

          <div className="detour-metric-item">
            <span className="metric-label">Bypass Attempts:</span>
            <strong id="metric-detour-attempts" className="text-info">
              {detourAttempts}
            </strong>
          </div>

          <div className="detour-metric-item">
            <span className="metric-label">Safe Detours Found:</span>
            <strong
              id="metric-safe-detours"
              className={safeDetoursCount > 0 ? 'text-ok' : 'text-danger'}
            >
              {safeDetoursCount}
            </strong>
          </div>

          <div className="detour-metric-item">
            <span className="metric-label">Engine:</span>
            <strong className="text-highlight">OSRM Multi-Point</strong>
          </div>
        </div>
      )}

      {/* Detour Corridor Breakdown - only in developer mode */}
      {isDeveloperMode && detourCandidates.length > 0 && (
        <div className="detour-corridors-list">
          <div className="corridors-title">EVALUATED BYPASS CORRIDORS</div>
          {detourCandidates.map((cand) => {
            const isWinner = cand.id === selectedRoute?.id;
            const status = cand.safetyAssessment.safetyStatus;
            return (
              <div
                key={cand.id}
                className={`corridor-item ${isWinner ? 'corridor-winner' : ''}`}
              >
                <div className="corridor-item-left">
                  <span className="corridor-badge">{isWinner ? '★' : '•'}</span>
                  <div className="corridor-info-col">
                    <span className="corridor-name">
                      {cand.detourCorridor || cand.label}
                    </span>
                    {cand.rejectionReason && (
                      <span className="corridor-rejection-note text-danger">
                        ↳ {cand.rejectionReason}
                      </span>
                    )}
                  </div>
                </div>
                <div className="corridor-item-right">
                  <span className="corridor-dist">{cand.distanceKm} km</span>
                  <span className={`cand-status-tag status-${status.toLowerCase()}`}>
                    {status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
