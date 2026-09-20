import React, { useState, useMemo } from 'react';
import type { Incident } from '../types/incident';
import type { Responder } from '../types/responder';
import type { Mission } from '../types/mission';
import { rankRespondersForIncident, type RankedResponder } from '../services/dispatchService';

interface CoordinatorDashboardProps {
  incidents: Incident[];
  responders: Responder[];
  missions: Mission[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string | null) => void;
  onAcknowledgeIncident: (incidentId: string) => void;
  onDispatchResponder: (incident: Incident, responder: Responder, notes?: string) => void;
}

export const CoordinatorDashboard: React.FC<CoordinatorDashboardProps> = ({
  incidents,
  responders,
  missions,
  selectedIncidentId,
  onSelectIncident,
  onAcknowledgeIncident,
  onDispatchResponder,
}) => {
  const [filterTab, setFilterTab] = useState<'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('OPEN');
  const [selectedResponderForDispatch, setSelectedResponderForDispatch] = useState<string | null>(null);
  const [dispatchNotes, setDispatchNotes] = useState<string>('');

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (filterTab === 'OPEN') return inc.status === 'OPEN' || inc.status === 'ACKNOWLEDGED';
      if (filterTab === 'IN_PROGRESS') {
        return ['DISPATCHED', 'IN_PROGRESS', 'RESPONDER_ARRIVED'].includes(inc.status);
      }
      return inc.status === 'RESOLVED' || inc.status === 'CANCELLED';
    });
  }, [incidents, filterTab]);

  const activeIncident = useMemo(() => {
    if (!selectedIncidentId) return filteredIncidents[0] || null;
    return incidents.find((i) => i.id === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId, filteredIncidents]);

  const rankedResponders: RankedResponder[] = useMemo(() => {
    if (!activeIncident) return [];
    return rankRespondersForIncident(activeIncident, responders);
  }, [activeIncident, responders]);

  const activeMissionForIncident = useMemo(() => {
    if (!activeIncident || !activeIncident.assignedMissionId) return null;
    return missions.find((m) => m.id === activeIncident.assignedMissionId) || null;
  }, [activeIncident, missions]);

  const handleDispatch = () => {
    if (!activeIncident || !selectedResponderForDispatch) return;
    const responder = responders.find((r) => r.id === selectedResponderForDispatch);
    if (!responder) return;

    onDispatchResponder(activeIncident, responder, dispatchNotes.trim() || undefined);
    setDispatchNotes('');
    setSelectedResponderForDispatch(null);
  };

  return (
    <div className="resq-coordinator-container" id="resq-coordinator-panel">
      {/* Left Column: Incidents Queue */}
      <div className="resq-incidents-queue">
        <div className="queue-tabs-bar">
          <button
            id="tab-queue-open"
            className={`queue-tab ${filterTab === 'OPEN' ? 'active' : ''}`}
            onClick={() => setFilterTab('OPEN')}
          >
            Open Queue (
            {incidents.filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED').length})
          </button>
          <button
            id="tab-queue-inprogress"
            className={`queue-tab ${filterTab === 'IN_PROGRESS' ? 'active' : ''}`}
            onClick={() => setFilterTab('IN_PROGRESS')}
          >
            In-Flight (
            {incidents.filter((i) => ['DISPATCHED', 'IN_PROGRESS', 'RESPONDER_ARRIVED'].includes(i.status)).length})
          </button>
          <button
            id="tab-queue-resolved"
            className={`queue-tab ${filterTab === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setFilterTab('RESOLVED')}
          >
            Resolved (
            {incidents.filter((i) => i.status === 'RESOLVED' || i.status === 'CANCELLED').length})
          </button>
        </div>

        <div className="queue-list">
          {filteredIncidents.length === 0 ? (
            <div className="queue-empty-msg">No incidents in this view.</div>
          ) : (
            filteredIncidents.map((inc) => (
              <div
                key={inc.id}
                className={`queue-item-card ${activeIncident?.id === inc.id ? 'selected' : ''}`}
                onClick={() => onSelectIncident(inc.id)}
              >
                <div className="queue-item-header">
                  <span className="queue-item-id">{inc.id}</span>
                  <span className={`badge-sev badge-sev-${inc.severity.toLowerCase()}`}>
                    {inc.severity}
                  </span>
                </div>
                <div className="queue-item-title">{inc.type.replace(/_/g, ' ')}</div>
                <div className="queue-item-meta">
                  <span>📍 {inc.location.landmark || 'GPS Location'}</span>
                  <span className="queue-item-time">
                    {new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="queue-item-status-pill status-${inc.status.toLowerCase()}">
                  Status: {inc.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Selected Incident Review & Dispatch */}
      <div className="resq-incident-detail-panel">
        {activeIncident ? (
          <div className="incident-detail-content">
            <div className="detail-header">
              <div>
                <span className="detail-badge-type">{activeIncident.type}</span>
                <h2 className="detail-title">{activeIncident.id}</h2>
              </div>
              <span className={`detail-sev-badge badge-sev-${activeIncident.severity.toLowerCase()}`}>
                Severity: {activeIncident.severity}
              </span>
            </div>

            <div className="detail-grid">
              <div className="detail-cell">
                <span className="cell-label">Citizen:</span>
                <span className="cell-value font-bold">{activeIncident.citizenName}</span>
                <span className="cell-sub">{activeIncident.citizenPhone}</span>
              </div>
              <div className="detail-cell">
                <span className="cell-label">Geographic Location:</span>
                <span className="cell-value">
                  {activeIncident.location.coordinate[1].toFixed(5)}°N, {activeIncident.location.coordinate[0].toFixed(5)}°E
                </span>
                <span className="cell-sub">{activeIncident.location.landmark}</span>
              </div>
              <div className="detail-cell">
                <span className="cell-label">Current Status:</span>
                <span className="cell-value status-highlight">{activeIncident.status}</span>
              </div>
              <div className="detail-cell">
                <span className="cell-label">Created At:</span>
                <span className="cell-value">
                  {new Date(activeIncident.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {activeIncident.notes && (
              <div className="detail-notes-box">
                <strong>Citizen Emergency Notes:</strong> {activeIncident.notes}
              </div>
            )}

            {/* Acknowledge Button if OPEN */}
            {activeIncident.status === 'OPEN' && (
              <div className="acknowledge-banner">
                <span>Incident is unacknowledged.</span>
                <button
                  id="btn-ack-incident"
                  className="btn-secondary"
                  onClick={() => onAcknowledgeIncident(activeIncident.id)}
                >
                  Acknowledge Incident
                </button>
              </div>
            )}

            {/* If Dispatched, show active Mission info */}
            {activeMissionForIncident ? (
              <div className="active-mission-card">
                <div className="mission-card-title">
                  <span>🚀 Active Mission: {activeMissionForIncident.id}</span>
                  <span className="mission-status-pill">{activeMissionForIncident.status}</span>
                </div>
                <div className="mission-card-body">
                  <div>
                    <strong>Assigned Unit:</strong> {activeMissionForIncident.responderName} (
                    {activeMissionForIncident.responderUnit})
                  </div>
                  <div>
                    <strong>Dispatched:</strong>{' '}
                    {new Date(activeMissionForIncident.assignedAt).toLocaleTimeString()}
                  </div>
                  {activeMissionForIncident.notes && (
                    <div>
                      <strong>Coordinator Notes:</strong> {activeMissionForIncident.notes}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* RESPONDER SELECTION & DISPATCH SECTION */
              <div className="dispatch-section">
                <h3 className="section-heading">Deterministic Responder Selection Roster</h3>
                <p className="section-sub">
                  Ranked by Availability + Equipment Suitability + Road Proximity + Current Workload.
                </p>

                <div className="responders-table-container">
                  <table className="resq-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Responder Unit</th>
                        <th>Type & Equipment</th>
                        <th>Distance</th>
                        <th>Status</th>
                        <th>Rank Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedResponders.map((item) => (
                        <tr
                          key={item.responder.id}
                          className={selectedResponderForDispatch === item.responder.id ? 'row-selected' : ''}
                          onClick={() => setSelectedResponderForDispatch(item.responder.id)}
                        >
                          <td>
                            <input
                              type="radio"
                              name="selectedResponder"
                              checked={selectedResponderForDispatch === item.responder.id}
                              onChange={() => setSelectedResponderForDispatch(item.responder.id)}
                            />
                          </td>
                          <td>
                            <strong>{item.responder.name}</strong>
                            <div className="sub-text">{item.responder.unitCode} ({item.responder.stationName})</div>
                          </td>
                          <td>
                            <span className="unit-type-pill">{item.responder.type.replace(/_/g, ' ')}</span>
                            <div className="suitability-reason">{item.suitabilityReason}</div>
                          </td>
                          <td>{item.distanceKm} km</td>
                          <td>
                            <span className={`status-tag status-${item.responder.status.toLowerCase()}`}>
                              {item.responder.status}
                            </span>
                          </td>
                          <td>
                            <span className="score-badge">{item.score} pts</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="dispatch-action-row">
                  <input
                    type="text"
                    className="dispatch-notes-input"
                    placeholder="Optional coordinator dispatch instructions..."
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                  />
                  <button
                    id="btn-dispatch-responder"
                    className="btn-primary-dispatch"
                    disabled={!selectedResponderForDispatch}
                    onClick={handleDispatch}
                  >
                    Dispatch Selected Responder
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="no-selection-msg">
            <span>Select an incident from the queue to review and dispatch.</span>
          </div>
        )}
      </div>
    </div>
  );
};
