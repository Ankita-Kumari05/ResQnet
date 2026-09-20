import React from 'react';
import type { Responder } from '../types/responder';
import type { Mission } from '../types/mission';
import type { Incident } from '../types/incident';

interface ResponderMissionViewProps {
  responder: Responder;
  missions: Mission[];
  incidents: Incident[];
  onAcceptMission: (missionId: string) => void;
  onStartEnRoute: (missionId: string) => void;
  onMarkArrived: (missionId: string) => void;
  onResolveMission: (missionId: string) => void;
}

export const ResponderMissionView: React.FC<ResponderMissionViewProps> = ({
  responder,
  missions,
  incidents,
  onAcceptMission,
  onStartEnRoute,
  onMarkArrived,
  onResolveMission,
}) => {
  // RBAC Filtering: Responder ONLY receives missions assigned to their responderId
  const assignedMissions = missions.filter(
    (m) => m.responderId === responder.id && m.status !== 'ABORTED'
  );

  const activeMission = assignedMissions.find(
    (m) => m.status !== 'RESOLVED'
  );

  const relatedIncident = activeMission
    ? incidents.find((i) => i.id === activeMission.incidentId)
    : null;

  return (
    <div className="resq-responder-container" id="resq-responder-panel">
      {/* Responder Unit Header */}
      <div className="resq-card responder-status-card">
        <div className="responder-profile-header">
          <div className="responder-badge-icon">🚑</div>
          <div className="responder-info">
            <h3 className="responder-title">{responder.name}</h3>
            <span className="responder-unit-code">
              Unit: {responder.unitCode} | Station: {responder.stationName}
            </span>
          </div>
          <div className="responder-status-indicator">
            <span className={`status-pill status-${responder.status.toLowerCase()}`}>
              ● {responder.status}
            </span>
          </div>
        </div>

        <div className="responder-gps-info">
          <span>GPS Position:</span>
          <strong>
            {responder.currentGpsPosition[1].toFixed(5)}°N, {responder.currentGpsPosition[0].toFixed(5)}°E
          </strong>
        </div>
      </div>

      {/* ACTIVE MISSION DISPLAY */}
      {activeMission && relatedIncident ? (
        <div className="resq-card active-mission-panel" id="active-responder-mission-card">
          <div className="mission-hud-header">
            <div>
              <span className="mission-priority-badge">{activeMission.priority} PRIORITY</span>
              <h2 className="mission-id-heading">{activeMission.id}</h2>
            </div>
            <span className={`mission-stage-badge stage-${activeMission.status.toLowerCase()}`}>
              Stage: {activeMission.status}
            </span>
          </div>

          <div className="mission-details-grid">
            <div className="mission-cell">
              <span className="cell-lbl">Incident Type:</span>
              <span className="cell-val text-red font-bold">{relatedIncident.type}</span>
            </div>
            <div className="mission-cell">
              <span className="cell-lbl">Citizen Name & Contact:</span>
              <span className="cell-val font-bold">{activeMission.citizenName}</span>
              <span className="cell-sub">{activeMission.citizenPhone}</span>
            </div>
            <div className="mission-cell">
              <span className="cell-lbl">Target Destination:</span>
              <span className="cell-val">
                {activeMission.destination[1].toFixed(5)}°N, {activeMission.destination[0].toFixed(5)}°E
              </span>
              <span className="cell-sub">{relatedIncident.location.landmark}</span>
            </div>
            <div className="mission-cell">
              <span className="cell-lbl">Assigned Time:</span>
              <span className="cell-val">
                {new Date(activeMission.assignedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {activeMission.notes && (
            <div className="mission-notes-callout">
              <strong>Coordinator Instructions:</strong> {activeMission.notes}
            </div>
          )}

          {/* MISSION PROGRESSION ACTION BUTTONS */}
          <div className="mission-action-bar">
            {activeMission.status === 'ASSIGNED' && (
              <button
                id="btn-accept-mission"
                className="btn-action-accept"
                onClick={() => onAcceptMission(activeMission.id)}
              >
                ✓ Accept Mission Assignment
              </button>
            )}

            {activeMission.status === 'ACCEPTED' && (
              <button
                id="btn-start-en-route"
                className="btn-action-enroute"
                onClick={() => onStartEnRoute(activeMission.id)}
              >
                ⚡ Start Mission (En Route)
              </button>
            )}

            {activeMission.status === 'EN_ROUTE' && (
              <button
                id="btn-mark-arrived"
                className="btn-action-arrived"
                onClick={() => onMarkArrived(activeMission.id)}
              >
                🎯 Mark Arrived On-Scene
              </button>
            )}

            {activeMission.status === 'ARRIVED' && (
              <button
                id="btn-resolve-mission"
                className="btn-action-resolve"
                onClick={() => onResolveMission(activeMission.id)}
              >
                🏁 Complete & Resolve Mission
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="resq-card empty-mission-state">
          <div className="empty-icon">🛡️</div>
          <h3>No Active Mission Assigned</h3>
          <p>
            Unit <strong>{responder.unitCode}</strong> is currently on standby.
            When the Coordinator dispatches an emergency to this unit, the operational mission will appear here.
          </p>
        </div>
      )}

      {/* MISSION HISTORY */}
      {assignedMissions.filter((m) => m.status === 'RESOLVED').length > 0 && (
        <div className="resq-card mission-history-card">
          <h4>Completed Missions Log</h4>
          <div className="history-list">
            {assignedMissions
              .filter((m) => m.status === 'RESOLVED')
              .map((m) => (
                <div key={m.id} className="history-item">
                  <span className="hist-id">{m.id}</span>
                  <span className="hist-type">{m.citizenName} ({m.priority})</span>
                  <span className="hist-status text-green">RESOLVED</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
