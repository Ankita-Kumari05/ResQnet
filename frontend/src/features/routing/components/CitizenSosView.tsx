import React, { useState } from 'react';
import type { Incident, IncidentType, IncidentSeverity } from '../types/incident';
import type { CitizenProfile } from '../types/roles';
import type { LiveLocationState } from '../types/location';

interface CitizenSosViewProps {
  citizen: CitizenProfile;
  activeIncident: Incident | null;
  liveLocation: LiveLocationState;
  onTriggerSos: (params: {
    type: IncidentType;
    severity: IncidentSeverity;
    landmark?: string;
    notes?: string;
  }) => void;
  onCancelSos: (incidentId: string) => void;
  onRequestGps: () => void;
}

export const CitizenSosView: React.FC<CitizenSosViewProps> = ({
  citizen,
  activeIncident,
  liveLocation,
  onTriggerSos,
  onCancelSos,
  onRequestGps,
}) => {
  const [selectedType, setSelectedType] = useState<IncidentType>('SOS');
  const [selectedSeverity, setSelectedSeverity] = useState<IncidentSeverity>('HIGH');
  const [landmark, setLandmark] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasGps = liveLocation.status === 'ACTIVE' && liveLocation.coordinate !== null;

  const handleOpenSosDialog = () => {
    if (!hasGps) {
      setErrorMessage('GPS Location is required before triggering SOS. Enabling GPS tracking...');
      onRequestGps();
      return;
    }
    setErrorMessage(null);
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = () => {
    onTriggerSos({
      type: selectedType,
      severity: selectedSeverity,
      landmark: landmark.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setShowConfirmModal(false);
  };

  return (
    <div className="resq-citizen-container" id="resq-citizen-sos-panel">
      {/* Citizen Profile & GPS Readiness Card */}
      <div className="resq-card resq-citizen-card">
        <div className="resq-card-header">
          <div className="resq-citizen-avatar">👤</div>
          <div className="resq-citizen-meta">
            <h3 className="resq-citizen-name">{citizen.name}</h3>
            <span className="resq-citizen-phone">{citizen.phone}</span>
          </div>
          <div className="resq-gps-status-badge">
            {hasGps ? (
              <span className="badge-gps-active" title="GPS Accurate">
                ● GPS Locked ({liveLocation.coordinate![1].toFixed(4)}°N, {liveLocation.coordinate![0].toFixed(4)}°E)
              </span>
            ) : (
              <button
                className="badge-gps-request"
                onClick={onRequestGps}
                title="Click to activate browser GPS"
              >
                ⚠ Click to Enable GPS
              </button>
            )}
          </div>
        </div>

        {errorMessage && <div className="resq-alert-error">{errorMessage}</div>}

        {/* ACTIVE SOS STATUS VIEW */}
        {activeIncident ? (
          <div className="resq-active-sos-hud" id="active-sos-hud">
            <div className="sos-hud-header">
              <span className="sos-hud-pulsing-badge">EMERGENCY SOS ACTIVE</span>
              <span className="sos-hud-id">{activeIncident.id}</span>
            </div>

            <div className="sos-lifecycle-stepper">
              <div className={`step-item ${activeIncident.status !== 'CANCELLED' ? 'completed' : ''}`}>
                <div className="step-circle">1</div>
                <div className="step-label">SOS Sent</div>
              </div>
              <div
                className={`step-item ${
                  ['ACKNOWLEDGED', 'DISPATCHED', 'IN_PROGRESS', 'RESPONDER_ARRIVED', 'RESOLVED'].includes(
                    activeIncident.status
                  )
                    ? 'completed'
                    : ''
                }`}
              >
                <div className="step-circle">2</div>
                <div className="step-label">Reviewed</div>
              </div>
              <div
                className={`step-item ${
                  ['DISPATCHED', 'IN_PROGRESS', 'RESPONDER_ARRIVED', 'RESOLVED'].includes(
                    activeIncident.status
                  )
                    ? 'completed'
                    : ''
                }`}
              >
                <div className="step-circle">3</div>
                <div className="step-label">Dispatched</div>
              </div>
              <div
                className={`step-item ${
                  ['RESPONDER_ARRIVED', 'RESOLVED'].includes(activeIncident.status) ? 'completed' : ''
                }`}
              >
                <div className="step-circle">4</div>
                <div className="step-label">On-Scene</div>
              </div>
              <div className={`step-item ${activeIncident.status === 'RESOLVED' ? 'completed' : ''}`}>
                <div className="step-circle">5</div>
                <div className="step-label">Resolved</div>
              </div>
            </div>

            <div className="sos-hud-details">
              <div className="hud-detail-row">
                <span className="hud-lbl">Type:</span>
                <span className="hud-val font-bold">{activeIncident.type}</span>
              </div>
              <div className="hud-detail-row">
                <span className="hud-lbl">Severity:</span>
                <span className={`hud-val badge-sev-${activeIncident.severity.toLowerCase()}`}>
                  {activeIncident.severity}
                </span>
              </div>
              <div className="hud-detail-row">
                <span className="hud-lbl">Location:</span>
                <span className="hud-val">
                  {activeIncident.location.landmark || 'GPS Coordinates Anchored'}
                </span>
              </div>
              {activeIncident.assignedResponderName && (
                <div className="hud-detail-row responder-highlight">
                  <span className="hud-lbl">Assigned Unit:</span>
                  <span className="hud-val text-green font-bold">
                    🚑 {activeIncident.assignedResponderName}
                  </span>
                </div>
              )}
              <div className="hud-status-banner">
                {activeIncident.status === 'OPEN' && '⏳ SOS Transmitted. Waiting for Coordinator dispatch...'}
                {activeIncident.status === 'ACKNOWLEDGED' && '📋 Coordinator has reviewed and is assigning a responder...'}
                {activeIncident.status === 'DISPATCHED' && '🚀 Responder Dispatched! Unit is preparing departure.'}
                {activeIncident.status === 'IN_PROGRESS' && '⚡ Responder is En Route to your exact GPS location.'}
                {activeIncident.status === 'RESPONDER_ARRIVED' && '🎯 Responder has Arrived On Scene!'}
                {activeIncident.status === 'RESOLVED' && '🏁 Emergency Resolved. Stay safe.'}
              </div>
            </div>

            {activeIncident.status !== 'RESOLVED' && activeIncident.status !== 'CANCELLED' && (
              <button
                id="btn-cancel-citizen-sos"
                className="btn-cancel-sos"
                onClick={() => onCancelSos(activeIncident.id)}
              >
                Cancel SOS
              </button>
            )}
          </div>
        ) : (
          /* SOS TRIGGER BUTTON */
          <div className="resq-sos-trigger-box">
            <button
              id="btn-trigger-citizen-sos"
              className="btn-big-sos"
              onClick={handleOpenSosDialog}
              title="Click to trigger emergency SOS"
            >
              <span className="sos-pulse-ring"></span>
              <span className="sos-btn-text">SOS</span>
              <span className="sos-btn-sub">EMERGENCY ASSISTANCE</span>
            </button>
            <p className="sos-hint-text">
              Pressing SOS immediately captures your GPS coordinate and alerts the Emergency Coordinator.
            </p>
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="resq-modal-backdrop" id="citizen-sos-modal">
          <div className="resq-modal-card">
            <div className="resq-modal-header">
              <span className="resq-modal-icon">🚨</span>
              <h3>Confirm Emergency SOS Transmission</h3>
            </div>

            <div className="resq-modal-body">
              <div className="resq-form-group">
                <label className="resq-form-label">Emergency Category:</label>
                <select
                  className="resq-form-select"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as IncidentType)}
                >
                  <option value="SOS">General Emergency SOS</option>
                  <option value="FLOOD_RESCUE">Flash Flood / Water Rescue</option>
                  <option value="MEDICAL_EMERGENCY">Critical Medical Distress</option>
                  <option value="STRUCTURAL_COLLAPSE">Building / Structural Collapse</option>
                  <option value="FIRE_HAZARD">Fire / Smoke Hazard</option>
                  <option value="EVACUATION_ASSISTANCE">Civil Evacuation Assistance</option>
                </select>
              </div>

              <div className="resq-form-group">
                <label className="resq-form-label">Severity Level:</label>
                <div className="resq-severity-selector">
                  {(['CRITICAL', 'HIGH', 'MODERATE'] as IncidentSeverity[]).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      className={`sev-choice-btn sev-${sev.toLowerCase()} ${
                        selectedSeverity === sev ? 'active' : ''
                      }`}
                      onClick={() => setSelectedSeverity(sev)}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="resq-form-group">
                <label className="resq-form-label">Landmark / Specific Location (Optional):</label>
                <input
                  type="text"
                  className="resq-form-input"
                  placeholder="e.g. Near Bus Stand platform 4, Kharar NH-5"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                />
              </div>

              <div className="resq-form-group">
                <label className="resq-form-label">Emergency Details / Notes:</label>
                <textarea
                  className="resq-form-textarea"
                  rows={2}
                  placeholder="e.g. 2 people stranded with rising water level..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="resq-gps-preview-box">
                <span className="preview-lbl">Transmitting GPS Location:</span>
                <span className="preview-coords">
                  {liveLocation.coordinate
                    ? `${liveLocation.coordinate[1].toFixed(5)}°N, ${liveLocation.coordinate[0].toFixed(5)}°E`
                    : 'Awaiting coordinate lock'}
                </span>
              </div>
            </div>

            <div className="resq-modal-footer">
              <button
                id="btn-cancel-sos-modal"
                className="btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Back
              </button>
              <button
                id="btn-confirm-sos-transmit"
                className="btn-danger-transmit"
                onClick={handleConfirmSubmit}
              >
                Transmit SOS Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
