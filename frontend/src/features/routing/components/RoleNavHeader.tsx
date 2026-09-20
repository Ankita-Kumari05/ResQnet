import React from 'react';
import type { UserRole } from '../types/roles';
import type { Responder } from '../types/responder';
import type { Incident } from '../types/incident';
import type { Mission } from '../types/mission';

interface RoleNavHeaderProps {
  activeRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  responders: Responder[];
  activeResponderId: string;
  onSelectResponder: (id: string) => void;
  incidents: Incident[];
  missions: Mission[];
}

export const RoleNavHeader: React.FC<RoleNavHeaderProps> = ({
  activeRole,
  onSelectRole,
  responders,
  activeResponderId,
  onSelectResponder,
  incidents,
  missions,
}) => {
  const openIncidentsCount = incidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED'
  ).length;
  const inProgressCount = incidents.filter(
    (i) => i.status === 'DISPATCHED' || i.status === 'IN_PROGRESS' || i.status === 'RESPONDER_ARRIVED'
  ).length;
  const activeMissionsCount = missions.filter((m) => m.status !== 'RESOLVED' && m.status !== 'ABORTED').length;

  return (
    <header className="resq-role-header" id="resq-role-nav-header">
      <div className="resq-role-brand">
        <div className="resq-brand-badge">
          <span className="resq-brand-dot"></span>
          <span className="resq-brand-name">ResQnet</span>
        </div>
        <span className="resq-brand-subtitle">Emergency Operations Hub</span>
      </div>

      {/* Role Switcher Tabs */}
      <nav className="resq-role-nav" aria-label="Operational Role Selection">
        <button
          id="btn-role-citizen"
          className={`resq-role-tab ${activeRole === 'CITIZEN' ? 'active' : ''}`}
          onClick={() => onSelectRole('CITIZEN')}
        >
          <span className="role-icon">🚨</span>
          <span className="role-label">Citizen SOS</span>
        </button>

        <button
          id="btn-role-coordinator"
          className={`resq-role-tab ${activeRole === 'COORDINATOR' ? 'active' : ''}`}
          onClick={() => onSelectRole('COORDINATOR')}
        >
          <span className="role-icon">🛡️</span>
          <span className="role-label">Coordinator</span>
          {openIncidentsCount > 0 && (
            <span className="resq-badge-alert" title={`${openIncidentsCount} Open SOS Alerts`}>
              {openIncidentsCount}
            </span>
          )}
        </button>

        <button
          id="btn-role-responder"
          className={`resq-role-tab ${activeRole === 'RESPONDER' ? 'active' : ''}`}
          onClick={() => onSelectRole('RESPONDER')}
        >
          <span className="role-icon">🚑</span>
          <span className="role-label">Responder</span>
          {activeMissionsCount > 0 && (
            <span className="resq-badge-info" title={`${activeMissionsCount} Active Missions`}>
              {activeMissionsCount}
            </span>
          )}
        </button>

        <button
          id="btn-role-sih-demo"
          className={`resq-role-tab ${activeRole === 'SIH_DEMO' ? 'active' : ''}`}
          onClick={() => onSelectRole('SIH_DEMO')}
        >
          <span className="role-icon">⚡</span>
          <span className="role-label">SIH Demo</span>
        </button>
      </nav>

      {/* Role-Specific Secondary Controls */}
      <div className="resq-role-context">
        {activeRole === 'RESPONDER' && (
          <div className="resq-responder-selector">
            <label htmlFor="responder-select-dropdown" className="resq-selector-label">
              Active Unit (RBAC):
            </label>
            <select
              id="responder-select-dropdown"
              className="resq-select-input"
              value={activeResponderId}
              onChange={(e) => onSelectResponder(e.target.value)}
            >
              {responders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.unitCode}) — {r.status}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Global Operational Status Stats */}
        <div className="resq-live-stats">
          <span className="stat-pill" title="Unassigned Open SOS Incidents">
            <span className="stat-label">Open:</span>
            <span className={`stat-val ${openIncidentsCount > 0 ? 'text-red' : ''}`}>
              {openIncidentsCount}
            </span>
          </span>
          <span className="stat-pill" title="Missions In Progress">
            <span className="stat-label">Active:</span>
            <span className="stat-val text-amber">{inProgressCount}</span>
          </span>
        </div>
      </div>
    </header>
  );
};
