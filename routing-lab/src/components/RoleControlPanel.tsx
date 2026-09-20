import React, { useState } from 'react';
import type { Coordinate, StartOriginType, TestPreset } from '../types/routing';
import type { SafetyHub } from '../types/safetyHub';
import type { RoutingDecision } from '../types/routingDecision';
import type { Incident, IncidentType } from '../types/incident';
import type { Responder } from '../types/responder';
import type { Mission } from '../types/mission';
import type { UserRole, CitizenProfile } from '../types/roles';
import type { LiveLocationState } from '../types/location';
import type { MapInteractionMode } from '../types/interaction';
import type { GpsNavigationEvaluation } from '../services/routeProgressService';
import type { CoordinatorMode } from './CoordinatorControlPanel';
import { rankRespondersForIncident } from '../services/dispatchService';
import {
  UserIcon,
  ShieldIcon,
  AmbulanceIcon,
  NavigationIcon,
  MapPinIcon,
  AlertTriangleIcon,
  CrosshairIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  SlashIcon,
  RefreshCwIcon,
  SendIcon,
  RouteIcon,
  SettingsIcon,
  CompassIcon,
} from './Icons';

export interface VisibleLayersState {
  safetyHubs: boolean;
  hazards: boolean;
  blockedRoads: boolean;
  incidents: boolean;
  responders: boolean;
}

interface RoleControlPanelProps {
  userRole: UserRole;
  // Routing State
  start: Coordinate | null;
  destination: Coordinate | null;
  startSource?: 'gps' | 'manual';
  onUseGpsAsStart?: () => void;
  startOriginType: StartOriginType;
  onSetStartOriginType: (type: StartOriginType) => void;
  interactionMode: MapInteractionMode;
  onSetInteractionMode: (mode: MapInteractionMode) => void;
  onClearStart: () => void;
  onClearDestination: () => void;
  onCalculateRoute: () => void;
  onResetRoute: () => void;
  isLoading: boolean;
  decision: RoutingDecision;
  navEvaluation: GpsNavigationEvaluation | null;
  // Presets & Hub Routing
  presets: TestPreset[];
  onSelectPreset: (preset: TestPreset) => void;
  safetyHubs: SafetyHub[];
  onSelectSafetyHub: (hub: SafetyHub) => void;
  onFindBestSafeHub: () => void;
  // Layers State
  visibleLayers: VisibleLayersState;
  onToggleLayer: (layer: keyof VisibleLayersState) => void;
  // Live GPS
  liveLocationState: LiveLocationState;
  onToggleLiveLocation: () => void;
  onRecenterGps: () => void;
  onSimulateGpsStep: () => void;
  onSimulateGpsDeviate: () => void;
  onSimulateGpsArrive: () => void;
  onRerouteFromGps: () => void;
  isSimulatingWalk: boolean;
  onToggleSimulateWalk: () => void;
  // Citizen SOS
  citizenProfile: CitizenProfile;
  onTriggerSos: (notes: string, type: IncidentType) => void;
  // Coordinator
  coordinatorMode: CoordinatorMode;
  onSetCoordinatorMode: (mode: CoordinatorMode) => void;
  onOpenCreateHubChoice: () => void;
  onOpenManageDrawer: () => void;
  drawingPointsCount: number;
  onUndoDrawingPoint: () => void;
  onCompleteDrawing: () => void;
  onCancelDrawing: () => void;
  onOpenConfirmSectionModal?: () => void;
  incidents: Incident[];
  responders: Responder[];
  missions: Mission[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string | null) => void;
  onDispatchResponder: (incidentId: string, responderId: string, notes?: string) => void;
  // Responder
  activeResponderId: string;
  onSelectResponder: (id: string) => void;
  onAcceptMission: (missionId: string) => void;
  onStartEnRoute: (missionId: string) => void;
  onMarkArrived: (missionId: string) => void;
  onResolveMission: (missionId: string) => void;
  onNavigateToMission: (mission: Mission) => void;
  // Dev Mode
  isDeveloperMode: boolean;
}

export const RoleControlPanel: React.FC<RoleControlPanelProps> = ({
  userRole,
  start,
  destination,
  startSource = 'manual',
  onUseGpsAsStart,
  startOriginType,
  interactionMode,
  onSetInteractionMode,
  onClearStart,
  onClearDestination,
  onCalculateRoute,
  isLoading,
  decision,
  navEvaluation,
  presets,
  onSelectPreset,
  safetyHubs,
  onSelectSafetyHub,
  onFindBestSafeHub,
  visibleLayers,
  onToggleLayer,
  liveLocationState,
  onToggleLiveLocation,
  onRecenterGps,
  onSimulateGpsStep,
  onSimulateGpsDeviate,
  onSimulateGpsArrive,
  onRerouteFromGps,
  isSimulatingWalk,
  onToggleSimulateWalk,
  citizenProfile,
  onTriggerSos,
  coordinatorMode,
  onSetCoordinatorMode,
  onOpenCreateHubChoice,
  onOpenManageDrawer,
  drawingPointsCount,
  onUndoDrawingPoint,
  onCompleteDrawing,
  onCancelDrawing,
  onOpenConfirmSectionModal,
  incidents,
  responders,
  missions,
  selectedIncidentId,
  onSelectIncident,
  onDispatchResponder,
  activeResponderId,
  onSelectResponder,
  onAcceptMission,
  onStartEnRoute,
  onMarkArrived,
  onResolveMission,
  onNavigateToMission,
}) => {
  const [sosNotes, setSosNotes] = useState('');
  const [sosType, setSosType] = useState<IncidentType>('FLOOD_RESCUE');
  const [showSosModal, setShowSosModal] = useState(false);
  const [selectedResponderForDispatch, setSelectedResponderForDispatch] = useState<string>('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isManualRoutingInResponder, setIsManualRoutingInResponder] = useState(false);

  const selectedRoute = decision.selectedRoute;
  const hasRoute = Boolean(selectedRoute && selectedRoute.coordinates.length > 0);

  const activeResponder = responders.find((r) => r.id === activeResponderId) || responders[0];
  const activeMissionForResponder = missions.find(
    (m) =>
      m.responderId === activeResponderId &&
      m.status !== 'RESOLVED' &&
      m.status !== 'ABORTED'
  );

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);
  const rankedRespondersForSelected = selectedIncident
    ? rankRespondersForIncident(selectedIncident, responders)
    : [];

  return (
    <aside className="rme-control-panel" id="rme-role-control-panel">
      {/* ─────────────────────────────────────────────────────────────
          ROLE = CITIZEN
      ───────────────────────────────────────────────────────────── */}
      {userRole === 'CITIZEN' && (
        <div className="rme-role-view citizen-view">
          <div className="rme-panel-header">
            <div className="rme-panel-title">
              <UserIcon size={18} color="#38bdf8" />
              <span>Citizen Safe Evacuation & SOS</span>
            </div>
            <span className="rme-user-badge">{citizenProfile.name}</span>
          </div>

          {/* Dedicated Live Location Control Card for Citizen */}
          <div className="rme-section rme-gps-card" id="citizen-live-gps-card">
            <div className="rme-gps-card-header">
              <div className="rme-gps-title-wrap">
                <CrosshairIcon size={16} color={liveLocationState.status === 'ACTIVE' ? '#10b981' : '#94a3b8'} />
                <span className="rme-gps-title">Live Location</span>
              </div>
              <button
                id="btn-citizen-toggle-live-gps"
                type="button"
                className={`rme-btn-live-toggle ${liveLocationState.status === 'ACTIVE' ? 'active' : liveLocationState.status === 'REQUESTING' ? 'requesting' : ''}`}
                onClick={onToggleLiveLocation}
                title={liveLocationState.status === 'ACTIVE' ? 'Turn OFF Live GPS tracking' : 'Turn ON Live GPS tracking'}
              >
                <span className={`live-dot ${liveLocationState.status === 'ACTIVE' ? 'dot-active' : liveLocationState.status === 'REQUESTING' ? 'dot-requesting' : 'dot-off'}`}></span>
                <span className="live-btn-text">
                  {liveLocationState.status === 'ACTIVE'
                    ? 'Live Location ● ON'
                    : liveLocationState.status === 'REQUESTING'
                    ? 'Locating...'
                    : 'Live Location ● OFF'}
                </span>
              </button>
            </div>

            {/* GPS Telemetry Metrics when Active */}
            {liveLocationState.status === 'ACTIVE' && liveLocationState.coordinate && (
              <div className="rme-gps-metrics-row">
                <div className="gps-metric-item">
                  <span className="gps-metric-lbl">GPS Position</span>
                  <span className="gps-metric-val">
                    {liveLocationState.coordinate[1].toFixed(5)}°N, {liveLocationState.coordinate[0].toFixed(5)}°E
                  </span>
                </div>
                <div className="gps-metric-item">
                  <span className="gps-metric-lbl">Accuracy</span>
                  <span className="gps-metric-val">
                    {liveLocationState.accuracyMeters != null ? `±${Math.round(liveLocationState.accuracyMeters)}m` : 'N/A'}
                  </span>
                </div>
                {liveLocationState.headingDegrees != null && (
                  <div className="gps-metric-item">
                    <span className="gps-metric-lbl">Heading</span>
                    <span className="gps-metric-val">{Math.round(liveLocationState.headingDegrees)}°</span>
                  </div>
                )}
                <div className="gps-metric-actions">
                  {onUseGpsAsStart && startSource !== 'gps' && (
                    <button
                      id="btn-citizen-use-gps-as-a"
                      type="button"
                      className="rme-btn-xs rme-btn-use-gps"
                      onClick={onUseGpsAsStart}
                      title="Set Start (A) to current live GPS position"
                    >
                      <MapPinIcon size={12} />
                      <span>Use GPS as A</span>
                    </button>
                  )}
                  <button
                    id="btn-citizen-recenter-gps"
                    type="button"
                    className="rme-btn-xs rme-btn-recenter"
                    onClick={onRecenterGps}
                    title="Center map camera on my live GPS location"
                  >
                    <CrosshairIcon size={12} />
                    <span>Center on Me</span>
                  </button>
                </div>
              </div>
            )}

            {/* Status & Error Feedback */}
            {liveLocationState.status === 'REQUESTING' && (
              <div className="rme-gps-status-msg msg-requesting">
                <RefreshCwIcon size={13} className="spin-icon" />
                <span>Acquiring browser GPS lock...</span>
              </div>
            )}

            {liveLocationState.status === 'DENIED' && (
              <div className="rme-gps-status-msg msg-denied">
                <AlertTriangleIcon size={14} color="#ef4444" />
                <div className="msg-text">
                  <strong>Location Permission Denied</strong>
                  <span>Please allow location permissions in your browser to enable live tracking.</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}

            {liveLocationState.status === 'UNAVAILABLE' && (
              <div className="rme-gps-status-msg msg-error">
                <AlertTriangleIcon size={14} color="#f59e0b" />
                <div className="msg-text">
                  <strong>GPS Signal Unavailable</strong>
                  <span>Unable to acquire GPS signal.</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}

            {liveLocationState.status === 'ERROR' && (
              <div className="rme-gps-status-msg msg-error">
                <AlertTriangleIcon size={14} color="#ef4444" />
                <div className="msg-text">
                  <strong>GPS Error</strong>
                  <span>{liveLocationState.errorMessage || 'Location request failed or timed out.'}</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Location & Routing Setup */}
          <div className="rme-section">
            <div className="rme-section-header">
              <span className="rme-section-title">Evacuation Endpoints</span>
            </div>

            {/* Start (A) */}
            <div className="rme-input-group">
              <div className="rme-input-label">
                <span className="rme-pin-a">A</span>
                <span>Start Origin</span>
              </div>
              <div className="rme-input-row">
                <div className="rme-coord-display">
                  {startSource === 'gps' || startOriginType === 'CURRENT_LOCATION' ? (
                    <span className="text-emerald font-mono font-bold">
                      Live GPS ({start ? start.map((n) => n.toFixed(4)).join(', ') : 'Locating...'}) [GPS]
                    </span>
                  ) : start ? (
                    <span>
                      {start.map((n) => n.toFixed(4)).join(', ')}{' '}
                      <span className="text-xs text-muted">[Manual]</span>
                    </span>
                  ) : (
                    <span className="text-muted">Not Set</span>
                  )}
                </div>
                {onUseGpsAsStart && liveLocationState.coordinate && startSource !== 'gps' && (
                  <button
                    type="button"
                    className="rme-btn-xs rme-btn-use-gps"
                    onClick={onUseGpsAsStart}
                    title="Set Start (A) to current live GPS position"
                  >
                    Use GPS
                  </button>
                )}
                <button
                  type="button"
                  className={`rme-btn-sm ${interactionMode === 'PLACE_START' ? 'btn-active' : ''}`}
                  onClick={() => onSetInteractionMode(interactionMode === 'PLACE_START' ? 'EXPLORE' : 'PLACE_START')}
                  title="Click map to set Start"
                >
                  <MapPinIcon size={13} />
                  <span>{interactionMode === 'PLACE_START' ? 'Click Map...' : 'Set A'}</span>
                </button>
                {start && (
                  <button type="button" className="rme-btn-icon" onClick={onClearStart} title="Clear Start">
                    <XCircleIcon size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Destination (B) */}
            <div className="rme-input-group">
              <div className="rme-input-label">
                <span className="rme-pin-b">B</span>
                <span>Safe Destination</span>
              </div>
              <div className="rme-input-row">
                <div className="rme-coord-display">
                  {destination ? (
                    <span>{destination.map((n) => n.toFixed(4)).join(', ')}</span>
                  ) : (
                    <span className="text-muted">Not Set</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`rme-btn-sm ${interactionMode === 'PLACE_DESTINATION' ? 'btn-active' : ''}`}
                  onClick={() => onSetInteractionMode(interactionMode === 'PLACE_DESTINATION' ? 'EXPLORE' : 'PLACE_DESTINATION')}
                  title="Click map to set Destination"
                >
                  <MapPinIcon size={13} />
                  <span>{interactionMode === 'PLACE_DESTINATION' ? 'Click Map...' : 'Set B'}</span>
                </button>
                {destination && (
                  <button type="button" className="rme-btn-icon" onClick={onClearDestination} title="Clear Destination">
                    <XCircleIcon size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Presets & Safety Hub Routing */}
            <div className="rme-preset-grid">
              <div className="rme-select-wrapper">
                <label className="rme-micro-label">Quick Region Corridor:</label>
                <select
                  className="rme-select"
                  onChange={(e) => {
                    const preset = presets.find((p) => p.id === e.target.value);
                    if (preset) onSelectPreset(preset);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select Preset Route...</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="rme-select-wrapper">
                <label className="rme-micro-label">Nearest Verified Shelter:</label>
                <div className="rme-hub-actions">
                  <select
                    className="rme-select"
                    onChange={(e) => {
                      const hub = safetyHubs.find((h) => h.id === e.target.value);
                      if (hub) onSelectSafetyHub(hub);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Select Safety Hub...</option>
                    {safetyHubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.status})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rme-btn-xs btn-highlight"
                    onClick={onFindBestSafeHub}
                    title="Find nearest OPEN hub avoiding hazards"
                  >
                    Auto Hub
                  </button>
                </div>
              </div>
            </div>

            {/* Safe Route Button */}
            <button
              id="btn-calculate-safe-route"
              type="button"
              className="rme-btn-primary"
              onClick={onCalculateRoute}
              disabled={isLoading || !start || !destination}
            >
              <NavigationIcon size={16} />
              <span>{isLoading ? 'Calculating Safe Route...' : 'Calculate Safe Route'}</span>
            </button>
          </div>

          {/* Operational Layer Toggles */}
          <div className="rme-section">
            <span className="rme-section-title">Safety Layers</span>
            <div className="rme-layer-pills">
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.safetyHubs ? 'active hub-active' : ''}`}
                onClick={() => onToggleLayer('safetyHubs')}
              >
                <ShieldIcon size={12} />
                <span>Safety Hubs ({safetyHubs.length})</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.hazards ? 'active hazard-active' : ''}`}
                onClick={() => onToggleLayer('hazards')}
              >
                <AlertTriangleIcon size={12} />
                <span>Hazards</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.blockedRoads ? 'active road-active' : ''}`}
                onClick={() => onToggleLayer('blockedRoads')}
              >
                <SlashIcon size={12} />
                <span>Blocked Roads</span>
              </button>
            </div>
          </div>

          {/* Route Active Card */}
          {hasRoute && (
            <div className="rme-section rme-route-card">
              <div className="rme-route-header">
                <RouteIcon size={16} color="#38bdf8" />
                <span className="rme-route-title">Active Route Summary</span>
                <span className={`rme-safety-badge ${decision.finalSafety?.safetyStatus === 'SAFE' ? 'badge-safe' : 'badge-warn'}`}>
                  {decision.finalSafety?.safetyStatus || 'SAFE'}
                </span>
              </div>
              <div className="rme-route-metrics">
                <div className="metric-box">
                  <span className="metric-val">{((selectedRoute?.distanceMeters || 0) / 1000).toFixed(2)} km</span>
                  <span className="metric-lbl">Total Distance</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">{Math.round((selectedRoute?.durationSeconds || 0) / 60)} min</span>
                  <span className="metric-lbl">Est. Duration</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">
                    {navEvaluation?.remainingDistanceMeters != null
                      ? `${(navEvaluation.remainingDistanceMeters / 1000).toFixed(2)} km`
                      : `${((selectedRoute?.distanceMeters || 0) / 1000).toFixed(2)} km`}
                  </span>
                  <span className="metric-lbl">Remaining</span>
                </div>
              </div>

              {decision.explanation && (
                <div className="rme-route-explanation">
                  <p>{decision.explanation}</p>
                </div>
              )}

              {/* Navigation Progress Controls */}
              <div className="rme-nav-stepper">
                <div className="rme-progress-bar-bg">
                  <div
                    className="rme-progress-bar-fill"
                    style={{
                      width: `${
                        navEvaluation?.progressFraction != null
                          ? Math.round(navEvaluation.progressFraction * 100)
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
                <div className="rme-nav-buttons">
                  <button
                    type="button"
                    className="rme-btn-xs"
                    onClick={onSimulateGpsStep}
                    title="Simulate moving along route"
                  >
                    Step Forward
                  </button>
                  <button
                    type="button"
                    className={`rme-btn-xs ${isSimulatingWalk ? 'active' : ''}`}
                    onClick={onToggleSimulateWalk}
                    title="Simulate walking progress"
                  >
                    {isSimulatingWalk ? 'Pause Walk' : 'Auto Walk'}
                  </button>
                  <button
                    type="button"
                    className="rme-btn-xs btn-success"
                    onClick={onSimulateGpsArrive}
                    title="Simulate reaching destination"
                  >
                    Arrive
                  </button>
                </div>
                {navEvaluation?.status === 'ARRIVED' && (
                  <div className="rme-arrival-banner">
                    <CheckCircleIcon size={16} color="#10b981" />
                    <span>ARRIVED AT SAFE DESTINATION</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Emergency SOS Trigger Button */}
          <div className="rme-section rme-sos-card">
            <div className="rme-sos-header">
              <AlertTriangleIcon size={16} color="#ef4444" />
              <span>Emergency Assistance</span>
            </div>
            <p className="rme-sos-desc">
              If you are stranded or trapped in high-risk floods/debris, broadcast an SOS alert directly to the Operations Command.
            </p>
            <button
              id="btn-trigger-citizen-sos"
              type="button"
              className="rme-btn-sos"
              onClick={() => setShowSosModal(true)}
            >
              <AlertTriangleIcon size={18} />
              <span>TRIGGER EMERGENCY SOS</span>
            </button>
          </div>

          {/* SOS Modal */}
          {showSosModal && (
            <div className="rme-modal-backdrop">
              <div className="rme-modal-card">
                <div className="rme-modal-header">
                  <AlertTriangleIcon size={20} color="#ef4444" />
                  <h3>Broadcast Emergency SOS</h3>
                </div>
                <div className="rme-modal-body">
                  <div className="rme-input-group">
                    <label className="rme-micro-label">Emergency Category:</label>
                    <select
                      className="rme-select"
                      value={sosType}
                      onChange={(e) => setSosType(e.target.value as IncidentType)}
                    >
                      <option value="FLOOD_RESCUE">Flood / Waterlogging Rescue</option>
                      <option value="MEDICAL_EMERGENCY">Critical Medical Emergency</option>
                      <option value="STRUCTURAL_COLLAPSE">Building / Debris Collapse</option>
                      <option value="FIRE_HAZARD">Fire Hazard</option>
                      <option value="EVACUATION_ASSISTANCE">Elderly / Evacuation Support</option>
                    </select>
                  </div>
                  <div className="rme-input-group">
                    <label className="rme-micro-label">Emergency Notes & Details:</label>
                    <textarea
                      className="rme-textarea"
                      rows={3}
                      placeholder="Describe your situation, number of people trapped, landmarks..."
                      value={sosNotes}
                      onChange={(e) => setSosNotes(e.target.value)}
                    ></textarea>
                  </div>
                  <div className="rme-modal-location-info">
                    <MapPinIcon size={14} color="#38bdf8" />
                    <span>
                      Broadcast Location:{' '}
                      {liveLocationState.coordinate
                        ? `GPS [${liveLocationState.coordinate.map((n) => n.toFixed(4)).join(', ')}]`
                        : start
                        ? `Start Pin [${start.map((n) => n.toFixed(4)).join(', ')}]`
                        : citizenProfile.coordinate
                        ? `Profile [${citizenProfile.coordinate.map((n) => n.toFixed(4)).join(', ')}]`
                        : 'Sector 17, Chandigarh [76.7750, 30.7350]'}
                    </span>
                  </div>
                </div>
                <div className="rme-modal-actions">
                  <button type="button" className="rme-btn-sm" onClick={() => setShowSosModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rme-btn-sos"
                    onClick={() => {
                      onTriggerSos(sosNotes || 'Emergency assistance requested via citizen SOS', sosType);
                      setShowSosModal(false);
                      setSosNotes('');
                    }}
                  >
                    <SendIcon size={14} />
                    <span>Transmit SOS</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ROLE = COORDINATOR
      ───────────────────────────────────────────────────────────── */}
      {userRole === 'COORDINATOR' && (
        <div className="rme-role-view coordinator-view">
          <div className="rme-panel-header">
            <div className="rme-panel-title">
              <ShieldIcon size={18} color="#f59e0b" />
              <span>Operations Command & Dispatch</span>
            </div>
            <button
              type="button"
              className="rme-btn-xs btn-highlight"
              onClick={onOpenManageDrawer}
              title="Manage Active Infrastructure & Layers"
            >
              <SettingsIcon size={13} />
              <span>Manage Layers</span>
            </button>
          </div>

          {/* Operational Layer Toggles */}
          <div className="rme-section">
            <span className="rme-section-title">Operational GIS Layers</span>
            <div className="rme-layer-pills">
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.incidents ? 'active alert-active' : ''}`}
                onClick={() => onToggleLayer('incidents')}
              >
                <AlertTriangleIcon size={12} />
                <span>Incidents ({incidents.length})</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.responders ? 'active responder-active' : ''}`}
                onClick={() => onToggleLayer('responders')}
              >
                <AmbulanceIcon size={12} />
                <span>Responders ({responders.length})</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.safetyHubs ? 'active hub-active' : ''}`}
                onClick={() => onToggleLayer('safetyHubs')}
              >
                <ShieldIcon size={12} />
                <span>Safety Hubs ({safetyHubs.length})</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.hazards ? 'active hazard-active' : ''}`}
                onClick={() => onToggleLayer('hazards')}
              >
                <AlertTriangleIcon size={12} />
                <span>Hazards</span>
              </button>
              <button
                type="button"
                className={`rme-layer-pill ${visibleLayers.blockedRoads ? 'active road-active' : ''}`}
                onClick={() => onToggleLayer('blockedRoads')}
              >
                <SlashIcon size={12} />
                <span>Blocked Roads</span>
              </button>
            </div>
          </div>

          {/* Operational GIS Action Tools */}
          <div className="rme-section">
            <span className="rme-section-title">GIS Management Tools</span>
            <div className="rme-tools-grid">
              <button
                type="button"
                className={`rme-tool-btn ${coordinatorMode === 'draw_hazard' ? 'active' : ''}`}
                onClick={() => onSetCoordinatorMode(coordinatorMode === 'draw_hazard' ? 'none' : 'draw_hazard')}
                title="Draw Polygon Hazard on Map"
              >
                <PlusIcon size={14} />
                <span>+ Hazard Area</span>
              </button>

              <button
                type="button"
                className={`rme-tool-btn ${coordinatorMode === 'select_road_to_block' ? 'active' : ''}`}
                onClick={() => onSetCoordinatorMode(coordinatorMode === 'select_road_to_block' ? 'none' : 'select_road_to_block')}
                title="Click road on map to block entire street"
              >
                <SlashIcon size={14} />
                <span>Block Road</span>
              </button>

              <button
                type="button"
                className={`rme-tool-btn ${coordinatorMode === 'section_select_road' ? 'active' : ''}`}
                onClick={() => onSetCoordinatorMode(coordinatorMode === 'section_select_road' ? 'none' : 'section_select_road')}
                title="Block partial section of road using closure handles"
              >
                <SlashIcon size={14} />
                <span>Block Road Section</span>
              </button>

              <button
                type="button"
                className="rme-tool-btn"
                onClick={onOpenCreateHubChoice}
                title="Create or Verify Safety Hub Facility"
              >
                <ShieldIcon size={14} />
                <span>+ Safety Hub</span>
              </button>
            </div>

            {/* Drawing Feedback / Completion bar */}
            {(coordinatorMode === 'draw_hazard' || coordinatorMode === 'draw_danger_zone' || coordinatorMode === 'draw_safety_hub' || coordinatorMode === 'draw_operational_area') && (
              <div className="rme-drawing-banner">
                <span>
                  {coordinatorMode === 'draw_safety_hub'
                    ? `Draw Safety Hub Area (${drawingPointsCount} vertices)`
                    : `Polygon Points: ${drawingPointsCount}`}
                </span>
                <div className="rme-drawing-actions">
                  <button type="button" className="rme-btn-xs" onClick={onUndoDrawingPoint} disabled={drawingPointsCount === 0}>
                    Undo
                  </button>
                  <button
                    type="button"
                    className="rme-btn-xs btn-primary"
                    onClick={onCompleteDrawing}
                    disabled={drawingPointsCount < 3}
                    id="btn-complete-drawing-area"
                  >
                    {coordinatorMode === 'draw_safety_hub' ? 'Complete Area' : 'Finish Polygon'}
                  </button>
                  <button type="button" className="rme-btn-xs" onClick={onCancelDrawing} id="btn-cancel-drawing-area">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {coordinatorMode === 'select_road_to_block' && (
              <div className="rme-drawing-banner">
                <span>Click any road on map to block entire street...</span>
                <div className="rme-drawing-actions">
                  <button type="button" className="rme-btn-xs" onClick={onCancelDrawing}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {coordinatorMode === 'section_select_road' && (
              <div className="rme-drawing-banner">
                <span>Click road on map to select for section closure...</span>
                <div className="rme-drawing-actions">
                  <button type="button" className="rme-btn-xs" onClick={onCancelDrawing}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {coordinatorMode === 'section_adjust_handles' && (
              <div className="rme-drawing-banner">
                <span>Drag Closure Start & End handles along the road</span>
                <div className="rme-drawing-actions">
                  <button type="button" className="rme-btn-xs btn-primary" onClick={onOpenConfirmSectionModal}>
                    Review & Block Section
                  </button>
                  <button type="button" className="rme-btn-xs" onClick={onCancelDrawing}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(coordinatorMode === 'select_safety_hub_location' || coordinatorMode === 'place_safety_hub_point' || coordinatorMode === 'set_safety_hub_entrance' || coordinatorMode === 'place_operational_area_point') && (
              <div className="rme-drawing-banner">
                <span>
                  {coordinatorMode === 'select_safety_hub_location'
                    ? 'Click public facility (school/hospital/shelter) on map...'
                    : coordinatorMode === 'set_safety_hub_entrance'
                    ? 'Click entrance / access point on map...'
                    : coordinatorMode === 'place_safety_hub_point'
                    ? 'Click the map to place Safety Hub'
                    : 'Click location on map to place point...'}
                </span>
                <div className="rme-drawing-actions">
                  <button type="button" className="rme-btn-xs" onClick={onCancelDrawing} id="btn-cancel-placement">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Incidents & SOS Review Card */}
          <div className="rme-section">
            <div className="rme-section-header">
              <span className="rme-section-title">Emergency Incidents ({incidents.length})</span>
            </div>
            <div className="rme-incident-list">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className={`rme-incident-item ${selectedIncidentId === inc.id ? 'selected' : ''} ${
                    inc.severity === 'CRITICAL' ? 'severity-critical' : inc.severity === 'HIGH' ? 'severity-high' : ''
                  }`}
                  onClick={() => {
                    onSelectIncident(selectedIncidentId === inc.id ? null : inc.id);
                    setSelectedResponderForDispatch('');
                  }}
                >
                  <div className="incident-top">
                    <span className="incident-id">{inc.id}</span>
                    <span className={`incident-status-badge status-${inc.status.toLowerCase()}`}>
                      {inc.status}
                    </span>
                  </div>
                  <div className="incident-citizen">
                    <strong>{inc.citizenName}</strong> ({inc.type.replace(/_/g, ' ')})
                  </div>
                  <div className="incident-loc text-muted">
                    {inc.location.landmark || inc.location.address || `[${inc.location.coordinate.join(', ')}]`}
                  </div>
                  {inc.notes && <div className="incident-notes text-muted">{inc.notes}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Incident Dispatch Action */}
          {selectedIncident && selectedIncident.status !== 'RESOLVED' && selectedIncident.status !== 'CANCELLED' && (
            <div className="rme-section rme-dispatch-box">
              <div className="rme-section-header">
                <span className="rme-section-title">Dispatch Unit for {selectedIncident.id}</span>
              </div>
              <div className="rme-input-group">
                <label className="rme-micro-label">Assign Available Responder:</label>
                <select
                  className="rme-select"
                  value={selectedResponderForDispatch}
                  onChange={(e) => setSelectedResponderForDispatch(e.target.value)}
                >
                  <option value="">Select Responder to Dispatch...</option>
                  {rankedRespondersForSelected.map(({ responder, score, distanceKm, suitabilityReason }) => (
                    <option key={responder.id} value={responder.id} disabled={responder.status === 'OFFLINE'}>
                      {responder.name} ({responder.status}) — {distanceKm}km [Score: {score}] - {suitabilityReason}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rme-input-group">
                <label className="rme-micro-label">Dispatch Directives:</label>
                <input
                  type="text"
                  className="rme-input"
                  placeholder="e.g. Deploy water rescue raft, proceed via safe route"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="rme-btn-primary"
                disabled={!selectedResponderForDispatch}
                onClick={() => {
                  onDispatchResponder(selectedIncident.id, selectedResponderForDispatch, dispatchNotes);
                  setDispatchNotes('');
                  setSelectedResponderForDispatch('');
                }}
              >
                <SendIcon size={14} />
                <span>Confirm & Dispatch Mission</span>
              </button>
            </div>
          )}

          {/* Responders Fleet Overview */}
          <div className="rme-section">
            <span className="rme-section-title">Responders Fleet ({responders.length})</span>
            <div className="rme-responder-list">
              {responders.map((r) => (
                <div key={r.id} className="rme-responder-item">
                  <div className="responder-top">
                    <strong>{r.name}</strong>
                    <span className={`responder-status-badge status-${r.status.toLowerCase()}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="responder-meta text-muted">
                    {r.unitCode} • {r.stationName}
                  </div>
                  <div className="responder-coord text-muted">
                    GPS: [{r.currentGpsPosition.map((n) => n.toFixed(4)).join(', ')}]
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ROLE = RESPONDER
      ───────────────────────────────────────────────────────────── */}
      {userRole === 'RESPONDER' && (
        <div className="rme-role-view responder-view">
          <div className="rme-panel-header">
            <div className="rme-panel-title">
              <AmbulanceIcon size={18} color="#10b981" />
              <span>Responder Mission Navigation</span>
            </div>
            <select
              className="rme-select-xs"
              value={activeResponderId}
              onChange={(e) => onSelectResponder(e.target.value)}
            >
              {responders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}: {r.name} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {/* Active Unit Profile Card */}
          <div className="rme-section rme-responder-profile-card">
            <div className="profile-top">
              <div className="profile-name">
                <strong>{activeResponder.name}</strong>
                <span className="profile-code">{activeResponder.unitCode}</span>
              </div>
              <span className={`responder-status-badge status-${activeResponder.status.toLowerCase()}`}>
                {activeResponder.status}
              </span>
            </div>
            <div className="profile-meta text-muted">
              <span>Station: {activeResponder.stationName}</span>
              <span>Unit GPS: [{activeResponder.currentGpsPosition.map((n) => n.toFixed(4)).join(', ')}]</span>
            </div>
          </div>

          {/* Dedicated Live Location Control Card */}
          <div className="rme-section rme-gps-card" id="responder-live-gps-card">
            <div className="rme-gps-card-header">
              <div className="rme-gps-title-wrap">
                <CrosshairIcon size={16} color={liveLocationState.status === 'ACTIVE' ? '#10b981' : '#94a3b8'} />
                <span className="rme-gps-title">Live Location</span>
              </div>
              <button
                id="btn-responder-toggle-live-gps"
                type="button"
                className={`rme-btn-live-toggle ${liveLocationState.status === 'ACTIVE' ? 'active' : liveLocationState.status === 'REQUESTING' ? 'requesting' : ''}`}
                onClick={onToggleLiveLocation}
                title={liveLocationState.status === 'ACTIVE' ? 'Turn OFF Live GPS tracking' : 'Turn ON Live GPS tracking'}
              >
                <span className={`live-dot ${liveLocationState.status === 'ACTIVE' ? 'dot-active' : liveLocationState.status === 'REQUESTING' ? 'dot-requesting' : 'dot-off'}`}></span>
                <span className="live-btn-text">
                  {liveLocationState.status === 'ACTIVE'
                    ? 'Live Location ● ON'
                    : liveLocationState.status === 'REQUESTING'
                    ? 'Locating...'
                    : 'Live Location ● OFF'}
                </span>
              </button>
            </div>

            {/* GPS Telemetry Metrics when Active */}
            {liveLocationState.status === 'ACTIVE' && liveLocationState.coordinate && (
              <div className="rme-gps-metrics-row">
                <div className="gps-metric-item">
                  <span className="gps-metric-lbl">GPS Position</span>
                  <span className="gps-metric-val">
                    {liveLocationState.coordinate[1].toFixed(5)}°N, {liveLocationState.coordinate[0].toFixed(5)}°E
                  </span>
                </div>
                <div className="gps-metric-item">
                  <span className="gps-metric-lbl">Accuracy</span>
                  <span className="gps-metric-val">
                    {liveLocationState.accuracyMeters != null ? `±${Math.round(liveLocationState.accuracyMeters)}m` : 'N/A'}
                  </span>
                </div>
                {liveLocationState.headingDegrees != null && (
                  <div className="gps-metric-item">
                    <span className="gps-metric-lbl">Heading</span>
                    <span className="gps-metric-val">{Math.round(liveLocationState.headingDegrees)}°</span>
                  </div>
                )}
                <div className="gps-metric-actions">
                  {onUseGpsAsStart && startSource !== 'gps' && (
                    <button
                      id="btn-responder-use-gps-as-a"
                      type="button"
                      className="rme-btn-xs rme-btn-use-gps"
                      onClick={onUseGpsAsStart}
                      title="Set Start (A) to current live GPS position"
                    >
                      <MapPinIcon size={12} />
                      <span>Use GPS as A</span>
                    </button>
                  )}
                  <button
                    id="btn-responder-recenter-gps"
                    type="button"
                    className="rme-btn-xs rme-btn-recenter"
                    onClick={onRecenterGps}
                    title="Center map camera on my live GPS location"
                  >
                    <CrosshairIcon size={12} />
                    <span>Center on Me</span>
                  </button>
                </div>
              </div>
            )}

            {/* Status & Error Feedback */}
            {liveLocationState.status === 'REQUESTING' && (
              <div className="rme-gps-status-msg msg-requesting">
                <RefreshCwIcon size={13} className="spin-icon" />
                <span>Acquiring browser GPS lock...</span>
              </div>
            )}

            {liveLocationState.status === 'DENIED' && (
              <div className="rme-gps-status-msg msg-denied">
                <AlertTriangleIcon size={14} color="#ef4444" />
                <div className="msg-text">
                  <strong>Location Permission Denied</strong>
                  <span>Please allow location permissions in your browser to enable live tracking.</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}

            {liveLocationState.status === 'UNAVAILABLE' && (
              <div className="rme-gps-status-msg msg-error">
                <AlertTriangleIcon size={14} color="#f59e0b" />
                <div className="msg-text">
                  <strong>GPS Signal Unavailable</strong>
                  <span>Unable to acquire GPS signal.</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}

            {liveLocationState.status === 'ERROR' && (
              <div className="rme-gps-status-msg msg-error">
                <AlertTriangleIcon size={14} color="#ef4444" />
                <div className="msg-text">
                  <strong>GPS Error</strong>
                  <span>{liveLocationState.errorMessage || 'Location request failed or timed out.'}</span>
                </div>
                <button type="button" className="rme-btn-xs btn-gps-retry" onClick={onToggleLiveLocation}>
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Mode Switch: Active Mission vs Manual A -> B */}
          <div className="rme-section">
            <div className="rme-tab-group">
              <button
                type="button"
                className={`rme-tab-btn ${!isManualRoutingInResponder ? 'active' : ''}`}
                onClick={() => setIsManualRoutingInResponder(false)}
              >
                <NavigationIcon size={13} />
                <span>Active Mission</span>
              </button>
              <button
                type="button"
                className={`rme-tab-btn ${isManualRoutingInResponder ? 'active' : ''}`}
                onClick={() => setIsManualRoutingInResponder(true)}
              >
                <RouteIcon size={13} />
                <span>Manual A → B</span>
              </button>
            </div>
          </div>

          {/* ACTIVE MISSION VIEW */}
          {!isManualRoutingInResponder && (
            <>
              {activeMissionForResponder ? (
                <div className="rme-section rme-active-mission-card">
                  <div className="mission-card-header">
                    <span className="mission-badge-priority">{activeMissionForResponder.priority}</span>
                    <span className="mission-id">{activeMissionForResponder.id}</span>
                    <span className={`mission-status-pill status-${activeMissionForResponder.status.toLowerCase()}`}>
                      {activeMissionForResponder.status}
                    </span>
                  </div>

                  <div className="mission-details">
                    <div className="detail-row">
                      <span className="detail-label">Citizen:</span>
                      <span className="detail-val">{activeMissionForResponder.citizenName} ({activeMissionForResponder.citizenPhone})</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Incident Ref:</span>
                      <span className="detail-val">{activeMissionForResponder.incidentId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Target Location:</span>
                      <span className="detail-val">
                        [{activeMissionForResponder.destination.map((n) => n.toFixed(4)).join(', ')}]
                      </span>
                    </div>
                    {activeMissionForResponder.notes && (
                      <div className="mission-notes">
                        <em>"{activeMissionForResponder.notes}"</em>
                      </div>
                    )}
                  </div>

                  {/* GPS Warning if not active */}
                  {liveLocationState.status !== 'ACTIVE' && (
                    <div className="rme-gps-warning-banner" style={{ background: '#7f1d1d33', border: '1px solid #ef444455', borderRadius: '6px', padding: '8px 10px', margin: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#fca5a5' }}>
                        <AlertTriangleIcon size={14} color="#ef4444" />
                        <span>Live location is required for mission navigation.</span>
                      </div>
                      <button
                        type="button"
                        className="rme-btn-xs"
                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onClick={onToggleLiveLocation}
                      >
                        Enable Live Location
                      </button>
                    </div>
                  )}

                  {/* Mission Navigation Action */}
                  <div className="mission-actions">
                    <button
                      id="btn-navigate-to-mission"
                      type="button"
                      className="rme-btn-primary"
                      onClick={() => onNavigateToMission(activeMissionForResponder)}
                      disabled={isLoading}
                    >
                      <NavigationIcon size={16} />
                      <span>{isLoading ? 'Routing...' : 'Navigate to Mission'}</span>
                    </button>

                    {/* Mission Lifecycle Buttons */}
                    <div className="mission-lifecycle-row">
                      {activeMissionForResponder.status === 'ASSIGNED' && (
                        <button
                          type="button"
                          className="rme-btn-sm btn-primary"
                          onClick={() => onAcceptMission(activeMissionForResponder.id)}
                        >
                          Accept Mission
                        </button>
                      )}
                      {activeMissionForResponder.status === 'ACCEPTED' && (
                        <button
                          type="button"
                          className="rme-btn-sm btn-primary"
                          onClick={() => onStartEnRoute(activeMissionForResponder.id)}
                        >
                          Start En Route
                        </button>
                      )}
                      {activeMissionForResponder.status === 'EN_ROUTE' && (
                        <button
                          type="button"
                          className="rme-btn-sm btn-success"
                          onClick={() => onMarkArrived(activeMissionForResponder.id)}
                        >
                          Mark Arrived
                        </button>
                      )}
                      {activeMissionForResponder.status === 'ARRIVED' && (
                        <button
                          type="button"
                          className="rme-btn-sm btn-highlight"
                          onClick={() => onResolveMission(activeMissionForResponder.id)}
                        >
                          Complete / Resolve Mission
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rme-section rme-empty-card text-muted">
                  <AmbulanceIcon size={24} color="#64748b" />
                  <p>No active assigned mission for {activeResponder.name}.</p>
                  <p className="text-xs">Coordinator can assign and dispatch incidents to this unit.</p>
                </div>
              )}
            </>
          )}

          {/* MANUAL A -> B ROUTING IN RESPONDER */}
          {isManualRoutingInResponder && (
            <div className="rme-section">
              <div className="rme-input-group">
                <div className="rme-input-label">
                  <span className="rme-pin-a">A</span>
                  <span>Origin</span>
                </div>
                <div className="rme-input-row">
                  <div className="rme-coord-display">
                    {startSource === 'gps' ? (
                      <span className="text-emerald font-mono font-bold">
                        Live GPS ({start ? start.map((n) => n.toFixed(4)).join(', ') : 'Locating...'}) [GPS]
                      </span>
                    ) : start ? (
                      <span>
                        {start.map((n) => n.toFixed(4)).join(', ')}{' '}
                        <span className="text-xs text-muted">[Manual]</span>
                      </span>
                    ) : (
                      <span className="text-muted">Not Set</span>
                    )}
                  </div>
                  {onUseGpsAsStart && liveLocationState.coordinate && startSource !== 'gps' && (
                    <button
                      type="button"
                      className="rme-btn-xs rme-btn-use-gps"
                      onClick={onUseGpsAsStart}
                      title="Set Start (A) to current live GPS position"
                    >
                      Use GPS
                    </button>
                  )}
                  <button
                    type="button"
                    className={`rme-btn-sm ${interactionMode === 'PLACE_START' ? 'btn-active' : ''}`}
                    onClick={() => onSetInteractionMode(interactionMode === 'PLACE_START' ? 'EXPLORE' : 'PLACE_START')}
                  >
                    Set A
                  </button>
                </div>
              </div>

              <div className="rme-input-group">
                <div className="rme-input-label">
                  <span className="rme-pin-b">B</span>
                  <span>Destination</span>
                </div>
                <div className="rme-input-row">
                  <div className="rme-coord-display">
                    {destination ? destination.map((n) => n.toFixed(4)).join(', ') : 'Not Set'}
                  </div>
                  <button
                    type="button"
                    className={`rme-btn-sm ${interactionMode === 'PLACE_DESTINATION' ? 'btn-active' : ''}`}
                    onClick={() => onSetInteractionMode(interactionMode === 'PLACE_DESTINATION' ? 'EXPLORE' : 'PLACE_DESTINATION')}
                  >
                    Set B
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="rme-btn-primary"
                onClick={onCalculateRoute}
                disabled={isLoading || !start || !destination}
              >
                <NavigationIcon size={16} />
                <span>Calculate Safe Route</span>
              </button>
            </div>
          )}

          {/* ACTIVE ROUTE / NAVIGATION TELEMETRY */}
          {hasRoute && (
            <div className="rme-section rme-route-card">
              <div className="rme-route-header">
                <CompassIcon size={16} color="#10b981" />
                <span className="rme-route-title">Mission Navigation Telemetry</span>
                <span className={`rme-safety-badge ${decision.finalSafety?.safetyStatus === 'SAFE' ? 'badge-safe' : 'badge-warn'}`}>
                  {decision.finalSafety?.safetyStatus || 'SAFE'}
                </span>
              </div>

              <div className="rme-route-metrics">
                <div className="metric-box">
                  <span className="metric-val">{((selectedRoute?.distanceMeters || 0) / 1000).toFixed(2)} km</span>
                  <span className="metric-lbl">Total Dist</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">
                    {navEvaluation?.remainingDistanceMeters != null
                      ? `${(navEvaluation.remainingDistanceMeters / 1000).toFixed(2)} km`
                      : `${((selectedRoute?.distanceMeters || 0) / 1000).toFixed(2)} km`}
                  </span>
                  <span className="metric-lbl">Remaining</span>
                </div>
                <div className="metric-box">
                  <span className="metric-val">
                    {navEvaluation?.progressFraction != null
                      ? `${Math.round(navEvaluation.progressFraction * 100)}%`
                      : '0%'}
                  </span>
                  <span className="metric-lbl">Progress</span>
                </div>
              </div>

              {/* Off-Route Alert & Reroute Button */}
              {navEvaluation?.status === 'OFF_ROUTE' && (
                <div className="rme-off-route-alert">
                  <AlertTriangleIcon size={16} color="#ef4444" />
                  <span>DEVIATED FROM ROUTE ({Math.round(navEvaluation.distanceToRouteMeters || 0)}m off-route)</span>
                  <button
                    type="button"
                    className="rme-btn-xs btn-highlight"
                    onClick={onRerouteFromGps}
                  >
                    <RefreshCwIcon size={12} />
                    <span>Recalculate Route</span>
                  </button>
                </div>
              )}

              {/* Test GPS / Simulation Tools (Clearly Separated) */}
              <div className="rme-nav-stepper">
                <div className="rme-stepper-label">
                  <span>Test GPS / Simulated Movement (Dev Mode)</span>
                </div>
                <div className="rme-nav-buttons">
                  <button type="button" className="rme-btn-xs" onClick={onSimulateGpsStep} title="Step along route for testing">
                    Step Forward
                  </button>
                  <button type="button" className="rme-btn-xs" onClick={onSimulateGpsDeviate} title="Simulate deviating off route">
                    Simulate Deviate
                  </button>
                  <button
                    type="button"
                    className={`rme-btn-xs ${isSimulatingWalk ? 'active' : ''}`}
                    onClick={onToggleSimulateWalk}
                    title="Simulate continuous walking"
                  >
                    {isSimulatingWalk ? 'Pause Walk' : 'Auto Walk'}
                  </button>
                  <button type="button" className="rme-btn-xs btn-success" onClick={onSimulateGpsArrive} title="Simulate arrival">
                    Arrive
                  </button>
                </div>

                {navEvaluation?.status === 'ARRIVED' && (
                  <div className="rme-arrival-banner">
                    <CheckCircleIcon size={16} color="#10b981" />
                    <span>ARRIVED ON SCENE</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
