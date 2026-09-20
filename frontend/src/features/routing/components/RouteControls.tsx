import React, { useState } from 'react';
import type { Coordinate, StartOriginType } from '../types/routing';
import type { LiveLocationState } from '../types/location';
import type { SafetyHub } from '../types/safetyHub';
import { checkSafetyHubEligibility } from '../types/safetyHub';
import type { MapInteractionMode } from '../types/interaction';
import { TEST_PRESETS } from '../data/testPresets';
import { SAFETY_SCENARIOS } from '../data/safetyScenarios';
import { PHASE3_SCENARIOS } from '../data/phase3Scenarios';
import { PHASE4_SCENARIOS } from '../data/phase4Scenarios';

interface RouteControlsProps {
  start: Coordinate | null;
  destination: Coordinate | null;
  startOriginType: StartOriginType;
  onSetStartOriginType: (type: StartOriginType) => void;
  liveLocationState: LiveLocationState;
  onToggleLiveLocation: () => void;
  safetyHubs?: SafetyHub[];
  selectedSafetyHub?: SafetyHub | null;
  onSelectSafetyHub: (hub: SafetyHub) => void;
  onFindBestSafeHub?: () => void;
  isLoading: boolean;
  onCalculateRoute: () => void;
  onReset: () => void;
  onSwap: () => void;
  onSelectPreset: (presetId: string) => void;
  onSelectPhase2Scenario: (scenarioId: string) => void;
  onSelectPhase3Scenario: (scenarioId: string) => void;
  onSelectPhase4Scenario: (scenarioId: string) => void;
  activePhase2ScenarioId: string | null;
  activePhase3ScenarioId: string | null;
  activePhase4ScenarioId: string | null;
  selectionMode?: 'start' | 'destination' | 'locked';
  interactionMode?: MapInteractionMode;
  onSetInteractionMode?: (mode: MapInteractionMode) => void;
  onClearStart?: () => void;
  onClearDestination?: () => void;
  isDeveloperMode?: boolean;
  isSnapToRoadEnabled?: boolean;
  onToggleSnapToRoad?: () => void;
  isRoutePointsLocked?: boolean;
  onToggleRoutePointsLocked?: () => void;
  roadSnapFeedback?: string | null;
  onFitRoute?: () => void;
}

export const RouteControls: React.FC<RouteControlsProps> = ({
  start,
  destination,
  startOriginType,
  onSetStartOriginType,
  liveLocationState,
  onToggleLiveLocation,
  safetyHubs = [],
  selectedSafetyHub = null,
  onSelectSafetyHub,
  onFindBestSafeHub,
  isLoading,
  onCalculateRoute,
  onReset,
  onSwap,
  onSelectPreset,
  onSelectPhase2Scenario,
  onSelectPhase3Scenario,
  onSelectPhase4Scenario,
  activePhase2ScenarioId,
  activePhase3ScenarioId,
  activePhase4ScenarioId,
  interactionMode = 'EXPLORE',
  onSetInteractionMode,
  onClearStart,
  onClearDestination,
  isDeveloperMode = false,
  isSnapToRoadEnabled = true,
  onToggleSnapToRoad,
  isRoutePointsLocked = false,
  onToggleRoutePointsLocked,
  roadSnapFeedback = null,
  onFitRoute,
}) => {
  const [activeDevTab, setActiveDevTab] = useState<'presets' | 'phase4' | 'phase3' | 'phase2'>('presets');

  const isGpsActive = liveLocationState.status === 'ACTIVE' && Boolean(liveLocationState.coordinate);
  const effectiveStart = startOriginType === 'CURRENT_LOCATION' ? liveLocationState.coordinate : start;
  const isAccuracyLow = (liveLocationState.accuracyMeters || 0) > 250;

  const canCalculate = Boolean(effectiveStart && destination) && !isLoading;
  const canSwap = Boolean(effectiveStart || destination) && !isLoading;

  const currentDestHub =
    selectedSafetyHub ||
    safetyHubs.find(
      (h) =>
        destination &&
        Math.abs(destination[0] - h.coordinate[0]) < 0.0001 &&
        Math.abs(destination[1] - h.coordinate[1]) < 0.0001
    );

  const eligibleHubs = safetyHubs.filter((h) => checkSafetyHubEligibility(h).isEligible);

  const isPlacingStart = interactionMode === 'PLACE_START';
  const isPlacingDest = interactionMode === 'PLACE_DESTINATION';

  const handleTogglePlaceStart = () => {
    if (!onSetInteractionMode) return;
    if (isPlacingStart) {
      onSetInteractionMode('EXPLORE');
    } else {
      onSetStartOriginType('MAP_POINT');
      onSetInteractionMode('PLACE_START');
    }
  };

  const handleTogglePlaceDest = () => {
    if (!onSetInteractionMode) return;
    if (isPlacingDest) {
      onSetInteractionMode('EXPLORE');
    } else {
      onSetInteractionMode('PLACE_DESTINATION');
    }
  };

  return (
    <div className="controls-panel card">
      <div className="panel-header">
        <div className="lab-badge">RESQNET ROUTING LAB</div>
        <h2 className="panel-title">Tricity Road Network</h2>
        <p className="panel-subtitle">
          Chandigarh – Mohali – Kharar – Zirakpur – Panchkula
        </p>
      </div>

      {/* Point Dragging & Road Snap Quick Settings */}
      <div className="route-point-options-row">
        {onToggleSnapToRoad && (
          <button
            type="button"
            id="btn-toggle-snap-road"
            className={`option-chip-btn ${isSnapToRoadEnabled ? 'option-chip-active' : ''}`}
            onClick={onToggleSnapToRoad}
            title={isSnapToRoadEnabled ? 'Snap to nearest routable road on release (within 80m)' : 'Road snapping disabled (uses exact drop coordinates)'}
          >
            <span className="option-chip-dot"></span>
            <span>Snap to Road {isSnapToRoadEnabled ? 'ON' : 'OFF'}</span>
          </button>
        )}

        {onToggleRoutePointsLocked && (
          <button
            type="button"
            id="btn-toggle-points-lock"
            className={`option-chip-btn ${isRoutePointsLocked ? 'option-chip-locked' : ''}`}
            onClick={onToggleRoutePointsLocked}
            title={isRoutePointsLocked ? 'Pins are locked to prevent movement' : 'Pins can be freely dragged on map'}
          >
            <span>{isRoutePointsLocked ? '🔒 Locked' : '🔓 Draggable'}</span>
          </button>
        )}

        {onFitRoute && (start || destination) && (
          <button
            type="button"
            id="btn-fit-route-camera"
            className="option-chip-btn"
            onClick={onFitRoute}
            title="Fit map camera to view full route and endpoints"
          >
            <span>🔍 Fit View</span>
          </button>
        )}
      </div>

      {roadSnapFeedback && (
        <div className="road-snap-feedback-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{roadSnapFeedback}</span>
        </div>
      )}

      {/* Start Origin Mode Selector (Google Maps Style) */}
      <div className="origin-selector-container">
        <div className="origin-selector-label">ROUTING ORIGIN (START)</div>
        <div className="origin-mode-pills">
          <button
            type="button"
            id="btn-origin-current-location"
            className={`origin-pill-btn ${startOriginType === 'CURRENT_LOCATION' ? 'active-origin-pill' : ''}`}
            onClick={() => {
              onSetStartOriginType('CURRENT_LOCATION');
              if (interactionMode === 'PLACE_START' && onSetInteractionMode) {
                onSetInteractionMode('EXPLORE');
              }
              if (liveLocationState.status === 'IDLE' || liveLocationState.status === 'UNAVAILABLE') {
                onToggleLiveLocation();
              }
            }}
          >
            <span className="origin-pill-icon">◎</span>
            <span>Current Location</span>
          </button>

          <button
            type="button"
            id="btn-origin-map-point"
            className={`origin-pill-btn ${startOriginType === 'MAP_POINT' ? 'active-origin-pill' : ''}`}
            onClick={() => onSetStartOriginType('MAP_POINT')}
          >
            <span className="origin-pill-pin">A</span>
            <span>Set on Map</span>
          </button>
        </div>
      </div>

      {/* Map Click Instructions / Selection Status */}
      <div className={`instruction-banner ${isPlacingStart ? 'banner-start' : isPlacingDest ? 'banner-destination' : 'banner-explore'}`}>
        {isPlacingStart ? (
          <div className="instruction-active-row">
            <span>📍 <strong>Set Start Point</strong> — Click on the map to place A</span>
            <button type="button" className="btn-banner-mini-cancel" onClick={handleTogglePlaceStart}>
              Cancel
            </button>
          </div>
        ) : isPlacingDest ? (
          <div className="instruction-active-row">
            <span>🎯 <strong>Set Destination</strong> — Click on the map to place B</span>
            <button type="button" className="btn-banner-mini-cancel" onClick={handleTogglePlaceDest}>
              Cancel
            </button>
          </div>
        ) : startOriginType === 'CURRENT_LOCATION' ? (
          !destination ? (
            <span>Origin is <strong>Live GPS</strong>. Press <strong>[Set Destination]</strong> or pick a Safety Hub below.</span>
          ) : (
            <span>GPS Origin and Destination set. Drag pins to adjust or press Calculate.</span>
          )
        ) : !start && !destination ? (
          <span>Map in <strong>Explore Mode</strong>. Press <strong>[Set Start]</strong> or <strong>[Set Destination]</strong> to mark points.</span>
        ) : !start ? (
          <span>Destination (B) set. Press <strong>[Set Start]</strong> to place origin point.</span>
        ) : !destination ? (
          <span>Start (A) set. Press <strong>[Set Destination]</strong> to place destination point.</span>
        ) : (
          <span>Points set. <strong>Drag A or B</strong> to adjust positions. Normal map clicks will not alter points.</span>
        )}
      </div>

      {/* Points Container */}
      <div className="points-container">
        {/* Origin Card (GPS or Manual Point A) */}
        {startOriginType === 'CURRENT_LOCATION' ? (
          <div className={`point-card point-gps-origin ${isGpsActive ? 'point-set' : 'point-empty'}`}>
            <div className="point-header">
              <span className="point-pin pin-gps">◎</span>
              <span className="point-label">START — CURRENT LOCATION</span>
              {liveLocationState.status === 'ACTIVE' && (
                <span className="point-status-tag status-tag-live">GPS Active</span>
              )}
              {liveLocationState.status === 'REQUESTING' && (
                <span className="point-status-tag status-tag-wait">Locating...</span>
              )}
              {liveLocationState.status === 'DENIED' && (
                <span className="point-status-tag status-tag-warn">Denied</span>
              )}
            </div>

            <div className="point-coords">
              {liveLocationState.status === 'ACTIVE' && liveLocationState.coordinate ? (
                <>
                  <div className="coord-row">
                    <span className="coord-label">Lng:</span>
                    <span className="coord-value">{liveLocationState.coordinate[0].toFixed(5)}</span>
                  </div>
                  <div className="coord-row">
                    <span className="coord-label">Lat:</span>
                    <span className="coord-value">{liveLocationState.coordinate[1].toFixed(5)}</span>
                  </div>
                  <div className="coord-row" style={{ marginTop: '3px' }}>
                    <span className="coord-label">Accuracy:</span>
                    <span className={`coord-value ${isAccuracyLow ? 'text-warn' : 'text-ok'}`} style={{ fontWeight: 700 }}>
                      {liveLocationState.accuracyMeters !== null ? `${Math.round(liveLocationState.accuracyMeters)} m` : 'N/A'}
                    </span>
                  </div>
                  {isAccuracyLow && (
                    <div className="gps-warning-inline">
                      <span>⚠️ Accuracy low (&gt; 250m).</span>
                      <button type="button" className="btn-link-action" onClick={onToggleLiveLocation}>
                        Try Again
                      </button>
                    </div>
                  )}
                </>
              ) : liveLocationState.status === 'REQUESTING' ? (
                <div className="coord-placeholder text-warn">
                  <span className="spinner-inline"></span> Locating your GPS position...
                </div>
              ) : liveLocationState.status === 'DENIED' ? (
                <div className="gps-error-inline">
                  <span>Location permission denied.</span>
                  <div className="gps-error-actions">
                    <button type="button" className="btn-gps-retry" onClick={onToggleLiveLocation}>
                      Allow Location
                    </button>
                    <button type="button" className="btn-gps-fallback" onClick={() => onSetStartOriginType('MAP_POINT')}>
                      Set Start on Map
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gps-idle-inline">
                  <span>GPS location not active.</span>
                  <button type="button" className="btn-gps-start" onClick={onToggleLiveLocation}>
                    📡 Use Current Location
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={`point-card ${start ? 'point-set' : 'point-empty'} ${isPlacingStart ? 'point-card-placing' : ''}`}>
            <div className="point-header">
              <span className="point-pin pin-start">A</span>
              <span className="point-label">START POINT (A)</span>
              {start && <span className="point-status-tag">Set</span>}
              {start && !isRoutePointsLocked && <span className="point-drag-badge">⇄ Draggable</span>}
            </div>
            <div className="point-coords">
              {start ? (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div className="coord-row">
                      <span className="coord-label">Lng:</span>
                      <span className="coord-value">{start[0].toFixed(isDeveloperMode ? 7 : 5)}</span>
                    </div>
                    <div className="coord-row">
                      <span className="coord-label">Lat:</span>
                      <span className="coord-value">{start[1].toFixed(isDeveloperMode ? 7 : 5)}</span>
                    </div>
                  </div>
                  <div className="point-action-buttons-row">
                    <button
                      type="button"
                      id="btn-change-start-point"
                      className={`btn-point-mini ${isPlacingStart ? 'btn-point-mini-active' : ''}`}
                      onClick={handleTogglePlaceStart}
                      title="Click map to relocate Start Point (A)"
                    >
                      {isPlacingStart ? '✕ Cancel' : '📍 Change Start'}
                    </button>
                    {onClearStart && (
                      <button
                        type="button"
                        id="btn-clear-start-point"
                        className="btn-point-mini btn-point-mini-clear"
                        onClick={onClearStart}
                        title="Clear Start Point"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="point-empty-action-wrap">
                  <span className="coord-placeholder">Not Set</span>
                  <button
                    type="button"
                    id="btn-set-start-point"
                    className={`btn-explicit-place btn-place-start ${isPlacingStart ? 'btn-placing-active' : ''}`}
                    onClick={handleTogglePlaceStart}
                  >
                    {isPlacingStart ? '🎯 Click Map to Place A' : '+ Set Start'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Point B (Destination) */}
        <div className={`point-card ${destination ? 'point-set' : 'point-empty'} ${isPlacingDest ? 'point-card-placing' : ''}`}>
          <div className="point-header">
            <span className="point-pin pin-destination">B</span>
            <span className="point-label">
              {currentDestHub ? 'DESTINATION (SAFETY HUB)' : 'DESTINATION (B)'}
            </span>
            {destination && (
              <span className={`point-status-tag ${currentDestHub ? `status-tag-hub-${currentDestHub.status.toLowerCase()}` : ''}`}>
                {currentDestHub ? `🛡 ${currentDestHub.status}` : 'Set'}
              </span>
            )}
            {destination && !isRoutePointsLocked && <span className="point-drag-badge">⇄ Draggable</span>}
          </div>
          <div className="point-coords">
            {destination ? (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="coord-row">
                    <span className="coord-label">Lng:</span>
                    <span className="coord-value">{destination[0].toFixed(isDeveloperMode ? 7 : 5)}</span>
                  </div>
                  <div className="coord-row">
                    <span className="coord-label">Lat:</span>
                    <span className="coord-value">{destination[1].toFixed(isDeveloperMode ? 7 : 5)}</span>
                  </div>
                </div>
                {currentDestHub && (
                  <div className="safety-hub-inline-desc">
                    <strong style={{ color: '#60a5fa' }}>{currentDestHub.name}</strong>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                      {currentDestHub.siteType} · {currentDestHub.availableCapacity} / {currentDestHub.totalCapacity} spaces free
                      {currentDestHub.entranceCoordinate && (
                        <span style={{ display: 'block', color: '#38bdf8', fontSize: '10px' }}>
                          ✓ Routed to accessible road entrance
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="point-action-buttons-row">
                  <button
                    type="button"
                    id="btn-change-dest-point"
                    className={`btn-point-mini ${isPlacingDest ? 'btn-point-mini-active' : ''}`}
                    onClick={handleTogglePlaceDest}
                    title="Click map to relocate Destination Point (B)"
                  >
                    {isPlacingDest ? '✕ Cancel' : '🎯 Change Destination'}
                  </button>
                  {onClearDestination && (
                    <button
                      type="button"
                      id="btn-clear-dest-point"
                      className="btn-point-mini btn-point-mini-clear"
                      onClick={onClearDestination}
                      title="Clear Destination Point"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="point-empty-action-wrap">
                <span className="coord-placeholder">Not Set</span>
                <button
                  type="button"
                  id="btn-set-dest-point"
                  className={`btn-explicit-place btn-place-dest ${isPlacingDest ? 'btn-placing-active' : ''}`}
                  onClick={handleTogglePlaceDest}
                >
                  {isPlacingDest ? '🎯 Click Map to Place B' : '+ Set Destination'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Safety Hubs Quick Selector Bar & Smart Router */}
      <div className="safety-hubs-controls-block">
        <div className="hubs-controls-header">
          <span className="hubs-header-title">SAFETY HUBS ({eligibleHubs.length} Active / Free)</span>
          {onFindBestSafeHub && (
            <button
              type="button"
              id="btn-find-best-safe-hub"
              className="btn-find-best-hub"
              onClick={onFindBestSafeHub}
              disabled={isLoading || (!effectiveStart && !start)}
              title="Automatically calculate and select the best open safety hub with a reachable safe route"
            >
              🎯 Find Best Safe Hub
            </button>
          )}
        </div>

        {safetyHubs.length > 0 && (
          <div className="safety-hubs-chips-scroll">
            {safetyHubs.map((hub) => {
              const isSelected =
                destination &&
                Math.abs(destination[0] - hub.coordinate[0]) < 0.0001 &&
                Math.abs(destination[1] - hub.coordinate[1]) < 0.0001;

              const isEligible = checkSafetyHubEligibility(hub).isEligible;

              return (
                <button
                  key={hub.id}
                  type="button"
                  id={`btn-select-hub-${hub.id}`}
                  className={`hub-select-chip ${isSelected ? 'chip-active' : ''} ${!isEligible ? 'chip-ineligible' : ''}`}
                  onClick={() => onSelectSafetyHub(hub)}
                  title={isEligible ? `Route to ${hub.name}` : `Ineligible: ${checkSafetyHubEligibility(hub).rejectionReason}`}
                >
                  <span className="hub-chip-icon">🛡️</span>
                  <span className="hub-chip-name">{hub.name.split(',')[0]}</span>
                  <span className={`hub-chip-status pill-${hub.status.toLowerCase()}`}>
                    {hub.status === 'NEAR_CAPACITY' ? 'NEAR CAP' : hub.status}
                  </span>
                  {hub.availableCapacity > 0 && (
                    <span className="hub-chip-cap">{hub.availableCapacity} free</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Primary Action Buttons */}
      <div className="actions-group">
        <button
          id="btn-calculate-route"
          className="btn btn-primary"
          onClick={onCalculateRoute}
          disabled={!canCalculate}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              <span>Evaluating Routes...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              <span>Calculate Route</span>
            </>
          )}
        </button>

        <div className="secondary-buttons">
          <button
            id="btn-swap-points"
            className="btn btn-secondary"
            onClick={onSwap}
            disabled={!canSwap}
            title={
              startOriginType === 'CURRENT_LOCATION'
                ? 'Swap Live GPS Origin to Destination'
                : 'Swap Start and Destination (B ↔ A)'
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Swap A ↔ B</span>
          </button>

          <button
            id="btn-reset-points"
            className="btn btn-secondary btn-danger-hover"
            onClick={onReset}
            disabled={isLoading || (!effectiveStart && !destination)}
            title="Clear route and destination points (keeps GPS active)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Presets / Development Locations Section */}
      <div className="presets-section">
        {isDeveloperMode ? (
          <div className="tab-buttons-container">
            <button
              id="tab-btn-presets"
              className={`tab-button ${activeDevTab === 'presets' ? 'active-tab' : ''}`}
              onClick={() => setActiveDevTab('presets')}
            >
              Indian Presets ({TEST_PRESETS.length})
            </button>
            <button
              id="tab-btn-phase4"
              className={`tab-button ${activeDevTab === 'phase4' ? 'active-tab' : ''}`}
              onClick={() => setActiveDevTab('phase4')}
            >
              Detours ({PHASE4_SCENARIOS.length})
            </button>
            <button
              id="tab-btn-phase3"
              className={`tab-button ${activeDevTab === 'phase3' ? 'active-tab' : ''}`}
              onClick={() => setActiveDevTab('phase3')}
            >
              Selection ({PHASE3_SCENARIOS.length})
            </button>
            <button
              id="tab-btn-phase2"
              className={`tab-button ${activeDevTab === 'phase2' ? 'active-tab' : ''}`}
              onClick={() => setActiveDevTab('phase2')}
            >
              Hazards ({SAFETY_SCENARIOS.length})
            </button>
          </div>
        ) : (
          <div className="section-title-bar" style={{ marginBottom: '8px', fontSize: '11.5px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
            Development Presets (Tricity)
          </div>
        )}

        {/* Indian Presets List (Standard View & Tab View) */}
        {(!isDeveloperMode || activeDevTab === 'presets') && (
          <div className="presets-list" id="phase1-presets-list">
            {TEST_PRESETS.map((preset) => (
              <button
                key={preset.id}
                id={`preset-${preset.id}`}
                className="preset-button"
                onClick={() => onSelectPreset(preset.id)}
                disabled={isLoading}
              >
                <div className="preset-name">{preset.name}</div>
                <div className="preset-desc">{preset.description}</div>
              </button>
            ))}
          </div>
        )}

        {/* Developer Mode Scenarios */}
        {isDeveloperMode && activeDevTab === 'phase4' && (
          <div className="presets-list" id="phase4-scenarios-list">
            {PHASE4_SCENARIOS.map((scenario) => {
              const isActive = activePhase4ScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  id={`p4-scenario-btn-${scenario.scenarioNumber}`}
                  className={`scenario-button ${isActive ? 'scenario-active' : ''}`}
                  onClick={() => onSelectPhase4Scenario(scenario.id)}
                  disabled={isLoading}
                >
                  <div className="scenario-button-header">
                    <span className="scenario-tag">{scenario.shortLabel}</span>
                    <span className={`scenario-expected-pill ${scenario.isRealOSRM ? 'pill-safe' : 'pill-risky'}`}>
                      {scenario.isRealOSRM ? 'LIVE OSRM' : 'FIXTURE'}
                    </span>
                  </div>
                  <div className="scenario-desc">{scenario.description}</div>
                </button>
              );
            })}
          </div>
        )}

        {isDeveloperMode && activeDevTab === 'phase3' && (
          <div className="presets-list" id="phase3-scenarios-list">
            {PHASE3_SCENARIOS.map((scenario) => {
              const isActive = activePhase3ScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  id={`p3-scenario-btn-${scenario.scenarioNumber}`}
                  className={`scenario-button ${isActive ? 'scenario-active' : ''}`}
                  onClick={() => onSelectPhase3Scenario(scenario.id)}
                  disabled={isLoading}
                >
                  <div className="scenario-button-header">
                    <span className="scenario-tag">{scenario.shortLabel}</span>
                    <span className={`scenario-expected-pill ${scenario.isRealOSRM ? 'pill-safe' : 'pill-risky'}`}>
                      {scenario.isRealOSRM ? 'LIVE OSRM' : 'FIXTURE'}
                    </span>
                  </div>
                  <div className="scenario-desc">{scenario.description}</div>
                </button>
              );
            })}
          </div>
        )}

        {isDeveloperMode && activeDevTab === 'phase2' && (
          <div className="presets-list" id="safety-scenarios-list">
            {SAFETY_SCENARIOS.map((scenario) => {
              const isActive = activePhase2ScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  id={`scenario-btn-${scenario.scenarioNumber}`}
                  className={`scenario-button ${isActive ? 'scenario-active' : ''}`}
                  onClick={() => onSelectPhase2Scenario(scenario.id)}
                  disabled={isLoading}
                >
                  <div className="scenario-button-header">
                    <span className="scenario-tag">{scenario.shortLabel}</span>
                    <span className={`scenario-expected-pill pill-${scenario.expectedStatus.toLowerCase()}`}>
                      Expect: {scenario.expectedStatus}
                    </span>
                  </div>
                  <div className="scenario-desc">{scenario.description}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

