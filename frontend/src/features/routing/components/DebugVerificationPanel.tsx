import React from 'react';
import type { Coordinate } from '../types/routing';
import type { RoutingDecision } from '../types/routingDecision';
import type { LiveLocationState } from '../types/location';
import type { SafetyHub } from '../types/safetyHub';
import { checkSafetyHubEligibility } from '../types/safetyHub';

interface DebugVerificationPanelProps {
  decision: RoutingDecision | null;
  start?: Coordinate | null;
  destination?: Coordinate | null;
  startOriginType?: string;
  liveLocationState?: LiveLocationState | null;
  safetyHubs?: SafetyHub[];
  onDebugBlockedRoute?: () => void;
}

export const DebugVerificationPanel: React.FC<DebugVerificationPanelProps> = ({
  decision,
  start,
  destination,
  startOriginType = 'MAP_POINT',
  liveLocationState,
  safetyHubs = [],
  onDebugBlockedRoute,
}) => {
  const isStandby = !decision || decision.status === 'IDLE';
  const selectedRoute = decision?.selectedRoute;
  const isLineString = selectedRoute?.geometry?.type === 'LineString';
  const coordCount = selectedRoute?.coordinates?.length || 0;

  const candidateCount = decision?.allCandidates?.length || 0;
  const reason = decision?.reasonCode || 'STANDBY';
  const saferLonger = decision?.saferDespiteLonger ? 'YES' : 'NO';
  const routingMode = decision?.routingMode || 'NO_SAFE_ROUTE';
  const initialSafety = decision?.initialSafety;

  const gpsTime = liveLocationState?.timestamp
    ? new Date(liveLocationState.timestamp).toLocaleTimeString()
    : 'N/A';

  const currentDestHub = safetyHubs.find(
    (h) =>
      destination &&
      Math.abs(destination[0] - h.coordinate[0]) < 0.0001 &&
      Math.abs(destination[1] - h.coordinate[1]) < 0.0001
  );
  const hubEligibility = currentDestHub ? checkSafetyHubEligibility(currentDestHub) : null;
  const eligibleHubsCount = safetyHubs.filter((h) => checkSafetyHubEligibility(h).isEligible).length;

  return (
    <div id="debug-verification-panel" className="debug-verification-panel">
      <div className="debug-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="debug-title">DEVELOPER SPATIAL VERIFICATION</span>
          <span className="debug-badge">PHASE 4 ENGINE</span>
        </div>
        {onDebugBlockedRoute && (
          <button
            id="btn-debug-blocked-route"
            className="btn btn-sm"
            onClick={onDebugBlockedRoute}
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              background: '#f59e0b',
              color: '#000',
              fontWeight: 700,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
            }}
            title="Execute complete step-by-step routing trace for current points and road closures"
          >
            🔍 DEBUG BLOCKED ROUTE
          </button>
        )}
      </div>

      <div className="debug-sections-grid">
        {/* Origin Mode & GPS Telemetry Block (Dev Mode) */}
        <div className="debug-block" id="debug-gps-block">
          <div className="debug-block-title">ORIGIN &amp; GPS TELEMETRY</div>
          <div className="debug-row">
            <span>Origin Type:</span>
            <strong
              className={startOriginType === 'CURRENT_LOCATION' ? 'text-ok' : 'text-info'}
              id="debug-origin-type"
            >
              {startOriginType}
            </strong>
          </div>
          <div className="debug-row">
            <span>GPS Status:</span>
            <strong
              className={
                liveLocationState?.status === 'ACTIVE'
                  ? 'text-ok'
                  : liveLocationState?.status === 'REQUESTING'
                  ? 'text-warn'
                  : 'text-wait'
              }
              id="debug-gps-status"
            >
              {liveLocationState?.status || 'IDLE'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Latitude:</span>
            <strong className="text-info" style={{ fontSize: '9.5px', fontFamily: 'monospace' }}>
              {liveLocationState?.coordinate ? liveLocationState.coordinate[1].toFixed(6) : 'N/A'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Longitude:</span>
            <strong className="text-info" style={{ fontSize: '9.5px', fontFamily: 'monospace' }}>
              {liveLocationState?.coordinate ? liveLocationState.coordinate[0].toFixed(6) : 'N/A'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Accuracy:</span>
            <strong className="text-highlight">
              {liveLocationState?.accuracyMeters !== null && liveLocationState?.accuracyMeters !== undefined
                ? `${Math.round(liveLocationState.accuracyMeters)} m`
                : 'N/A'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Speed / Heading:</span>
            <span className="text-info" style={{ fontSize: '9px' }}>
              {liveLocationState?.speedMps !== null && liveLocationState?.speedMps !== undefined
                ? `${liveLocationState.speedMps.toFixed(1)} m/s`
                : '0 m/s'}{' '}
              /{' '}
              {liveLocationState?.headingDegrees !== null && liveLocationState?.headingDegrees !== undefined
                ? `${Math.round(liveLocationState.headingDegrees)}°`
                : 'N/A'}
            </span>
          </div>
          <div className="debug-row">
            <span>Last Update:</span>
            <span className="text-info" style={{ fontSize: '9px' }}>
              {gpsTime} (Watch: {liveLocationState?.watchId !== null && liveLocationState?.watchId !== undefined ? 'active' : 'none'})
            </span>
          </div>
        </div>

        {/* 0. Start Marker A & Destination B Status (Dev Mode Only) */}
        <div className="debug-block">
          <div className="debug-block-title">POINTS A &amp; B</div>
          <div className="debug-row">
            <span>Start Origin:</span>
            <strong className="text-ok" id="debug-start-marker-status">
              {startOriginType === 'CURRENT_LOCATION'
                ? liveLocationState?.coordinate
                  ? `GPS [${liveLocationState.coordinate[1].toFixed(4)}, ${liveLocationState.coordinate[0].toFixed(4)}]`
                  : 'GPS (Acquiring...)'
                : start
                ? `Map [${start[1].toFixed(4)}, ${start[0].toFixed(4)}]`
                : 'MISSING'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Dest B:</span>
            <strong className={destination ? 'text-ok' : 'text-wait'} id="debug-dest-marker-status">
              {destination ? `${destination[1].toFixed(4)}, ${destination[0].toFixed(4)}` : 'MISSING'}
            </strong>
          </div>
        </div>

        {/* 0B. Safety Hub Telemetry & Eligibility Block */}
        <div className="debug-block" id="debug-hub-block">
          <div className="debug-block-title">SAFETY HUB TELEMETRY</div>
          <div className="debug-row">
            <span>Known Hubs:</span>
            <strong className="text-info">
              {safetyHubs.length} total ({eligibleHubsCount} eligible)
            </strong>
          </div>
          {currentDestHub ? (
            <>
              <div className="debug-row">
                <span>Selected Hub:</span>
                <strong className="text-ok" style={{ fontSize: '10px' }}>
                  {currentDestHub.name.split(',')[0]}
                </strong>
              </div>
              <div className="debug-row">
                <span>Verification:</span>
                <strong className={currentDestHub.verificationStatus === 'VERIFIED' ? 'text-ok' : 'text-danger'}>
                  {currentDestHub.verificationStatus}
                </strong>
              </div>
              <div className="debug-row">
                <span>Capacity / Free:</span>
                <strong className="text-highlight">
                  {currentDestHub.currentOccupancy} / {currentDestHub.totalCapacity} ({currentDestHub.availableCapacity} free)
                </strong>
              </div>
              <div className="debug-row">
                <span>Eligibility:</span>
                <strong className={hubEligibility?.isEligible ? 'text-ok' : 'text-danger'}>
                  {hubEligibility?.isEligible ? 'ELIGIBLE' : `REJECTED (${hubEligibility?.status})`}
                </strong>
              </div>
            </>
          ) : (
            <div className="debug-row">
              <span>Target:</span>
              <span className="text-secondary" style={{ fontSize: '10px' }}>Manual map point (not a hub)</span>
            </div>
          )}
        </div>

        {/* 1. OSRM / Candidates Debug */}
        <div className="debug-block">
          <div className="debug-block-title">ROUTE CANDIDATES</div>
          <div className="debug-row">
            <span>Candidates:</span>
            <strong className="text-highlight" id="debug-candidates-count">
              {candidateCount}
            </strong>
          </div>
          <div className="debug-row">
            <span>Mode:</span>
            <strong className="text-info">
              {decision?.isSyntheticFixture ? 'Synthetic' : 'Live OSRM'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Geometry:</span>
            <strong className={isLineString ? 'text-ok' : selectedRoute ? 'text-wait' : 'text-danger'}>
              {isLineString
                ? `LineString (${coordCount} nodes)`
                : isStandby
                ? 'Standby'
                : 'None (No Safe Route)'}
            </strong>
          </div>
        </div>

        {/* 2. Hazard Spatial Analysis */}
        <div className="debug-block">
          <div className="debug-block-title">HAZARD ANALYSIS</div>
          <div className="debug-row">
            <span>Checked:</span>
            <strong className="text-info">{initialSafety?.hazardsChecked ?? 4}</strong>
          </div>
          <div className="debug-row">
            <span>Intersected:</span>
            <strong className={(initialSafety?.hazardsIntersected || 0) > 0 ? 'text-warn' : 'text-ok'}>
              {initialSafety?.hazardsIntersected ?? 0}
            </strong>
          </div>
          <div className="debug-row">
            <span>Highest Sev:</span>
            <strong className="text-sev" id="debug-highest-severity">
              {initialSafety?.highestHazardSeverity ?? 'NONE'}
            </strong>
          </div>
        </div>

        {/* 3. Multi-Candidate Breakdown */}
        <div className="debug-block">
          <div className="debug-block-title">SELECTION BREAKDOWN</div>
          <div className="debug-row">
            <span>Safe Candidates:</span>
            <strong className="text-ok" id="debug-safe-candidates-count">
              {decision?.safeCandidatesCount ?? 0}
            </strong>
          </div>
          <div className="debug-row">
            <span>Moderate Risk:</span>
            <strong className="text-warn">
              {decision?.moderateRiskCandidatesCount ?? 0}
            </strong>
          </div>
          <div className="debug-row">
            <span>High Risk:</span>
            <strong className="text-danger">
              {decision?.highRiskCandidatesCount ?? 0}
            </strong>
          </div>
          <div className="debug-row">
            <span>Rejected (Crit/Blk):</span>
            <strong className="text-danger">
              {decision?.rejectedCandidatesCount ?? 0}
            </strong>
          </div>
        </div>

        {/* 4. Phase 4 Active Detour Diagnostics */}
        <div className="debug-block">
          <div className="debug-block-title">PHASE 4 DETOURS</div>
          <div className="debug-row">
            <span>Mode:</span>
            <strong
              id="debug-routing-mode"
              className={
                routingMode === 'NORMAL_ROUTE'
                  ? 'text-ok'
                  : routingMode === 'HAZARD_AVOIDING_DETOUR'
                  ? 'text-warn'
                  : 'text-danger'
              }
            >
              {routingMode === 'NORMAL_ROUTE' && 'NORMAL'}
              {routingMode === 'HAZARD_AVOIDING_DETOUR' && 'DETOUR'}
              {routingMode === 'NO_SAFE_ROUTE' && 'NO_SAFE_ROUTE'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Attempts:</span>
            <strong id="debug-detour-attempts" className="text-info">
              {decision?.detourAttempts ?? 0}
            </strong>
          </div>
          <div className="debug-row">
            <span>Safe Detours:</span>
            <strong
              id="debug-safe-detours"
              className={(decision?.safeDetoursCount || 0) > 0 ? 'text-ok' : 'text-wait'}
            >
              {decision?.safeDetoursCount ?? 0}
            </strong>
          </div>
        </div>

        {/* 5. Final Decision Result */}
        <div className="debug-block final-block">
          <div className="debug-block-title">ROUTE DECISION</div>
          <div className="debug-row">
            <span>Selected:</span>
            <strong
              id="debug-selected-route"
              className={selectedRoute ? 'text-ok' : 'text-danger'}
            >
              {selectedRoute ? `${selectedRoute.id} (${selectedRoute.distanceKm} km)` : 'NONE'}
            </strong>
          </div>
          <div className="debug-row">
            <span>Reason:</span>
            <strong id="debug-selection-reason" className="text-info">
              {reason}
            </strong>
          </div>
          <div className="debug-row">
            <span>Safer &gt; Longer:</span>
            <strong
              id="debug-safer-longer"
              className={decision?.saferDespiteLonger ? 'text-warn' : 'text-wait'}
            >
              {saferLonger}
            </strong>
          </div>
        </div>

        {/* 6. Candidate Safety Audit: Why each candidate succeeded or failed */}
        {decision?.allCandidates && decision.allCandidates.length > 0 && (
          <div className="debug-block audit-block">
            <div className="debug-block-title">
              CANDIDATE SAFETY AUDIT ({decision.allCandidates.length})
            </div>
            <div className="debug-candidates-list">
              {decision.allCandidates.map((c, idx) => {
                const isWinner = c.id === selectedRoute?.id;
                const status = c.safetyAssessment.safetyStatus;
                const critCount = c.safetyAssessment.hazardIntersections.filter(
                  (h) => h.severity === 'CRITICAL'
                ).length;
                return (
                  <div
                    key={c.id}
                    className={`debug-candidate-item ${isWinner ? 'winner-candidate' : ''}`}
                  >
                    <div className="cand-header">
                      <strong className="cand-id">
                        {isWinner ? '★ ' : `${idx + 1}. `}
                        {c.label}
                      </strong>
                      <span className={`cand-status status-${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </div>
                    <div className="cand-details-row">
                      <span>
                        Dist: <strong>{c.distanceKm} km</strong> ({c.durationMinutes} min)
                      </span>
                      <span>
                        Nodes: <strong>{c.coordinates?.length || 0}</strong>
                      </span>
                      {c.bufferMeters !== undefined && (
                        <span>
                          Buf: <strong>{c.bufferMeters}m</strong>
                        </span>
                      )}
                      <span>
                        OSRM:{' '}
                        <strong
                          className={c.osrmStatus === 'FAILED' ? 'text-danger' : 'text-ok'}
                        >
                          {c.osrmStatus || 'OK'}
                        </strong>
                      </span>
                    </div>
                    <div className="cand-details-row">
                      <span>
                        Blocked:{' '}
                        <strong
                          className={
                            c.safetyAssessment.blockedRoad
                              ? 'text-danger'
                              : 'text-ok'
                          }
                        >
                          {c.safetyAssessment.blockedRoad
                            ? `YES (${c.safetyAssessment.blockedRoadIntersections.map(b => b.roadId).join(', ')})`
                            : 'NO'}
                        </strong>
                      </span>
                      <span>
                        Hazard:{' '}
                        <strong className={c.safetyAssessment.highestHazardSeverity === 'CRITICAL' || c.safetyAssessment.highestHazardSeverity === 'HIGH' ? 'text-danger' : c.safetyAssessment.highestHazardSeverity === 'MODERATE' ? 'text-warn' : 'text-ok'}>
                          {c.safetyAssessment.highestHazardSeverity}
                        </strong>
                      </span>
                      <span>
                        Decision:{' '}
                        <strong className={isWinner ? 'text-ok' : c.safetyAssessment.blockedRoad || critCount > 0 ? 'text-danger' : 'text-wait'}>
                          {isWinner ? 'ACCEPTED (SELECTED)' : c.safetyAssessment.blockedRoad ? 'REJECTED (BLOCKED)' : critCount > 0 ? 'REJECTED (CRITICAL)' : 'EVALUATED'}
                        </strong>
                      </span>
                    </div>
                    {c.rejectionReason && (
                      <div className="cand-rejection-reason text-danger">
                        Rejection: {c.rejectionReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
