import React from 'react';
import type { UserRole } from '../types/roles';
import type { Incident } from '../types/incident';
import type { Mission } from '../types/mission';
import { UserIcon, ShieldIcon, AmbulanceIcon, AlertTriangleIcon } from './Icons';

interface RoleNavHeaderProps {
  activeRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  incidents: Incident[];
  missions: Mission[];
  isDeveloperMode: boolean;
  onToggleDeveloperMode: () => void;
}

export const RoleNavHeader: React.FC<RoleNavHeaderProps> = ({
  activeRole,
  onSelectRole,
  incidents,
  missions,
  isDeveloperMode,
  onToggleDeveloperMode,
}) => {
  const openSosCount = incidents.filter(
    (i) => (i.status === 'OPEN' || i.status === 'ACKNOWLEDGED') && i.severity === 'CRITICAL'
  ).length;
  const activeIncidentsCount = incidents.filter(
    (i) => i.status !== 'RESOLVED' && i.status !== 'CANCELLED'
  ).length;
  const activeMissionsCount = missions.filter(
    (m) => m.status !== 'RESOLVED' && m.status !== 'ABORTED'
  ).length;

  return (
    <header className="rme-header" id="rme-main-header">
      <div className="rme-brand">
        <div className="rme-logo-mark">
          <ShieldIcon size={20} color="#38bdf8" />
        </div>
        <div className="rme-title-group">
          <h1 className="rme-title">RESQNET MAP ENGINE</h1>
          <span className="rme-subtitle">Standalone Tactical GIS & Routing System</span>
        </div>
      </div>

      {/* Exactly Three Role Switcher Buttons */}
      <nav className="rme-role-tabs" aria-label="Operational Role Switcher">
        <button
          id="btn-role-citizen"
          type="button"
          className={`rme-role-btn ${activeRole === 'CITIZEN' ? 'active citizen-active' : ''}`}
          onClick={() => onSelectRole('CITIZEN')}
          title="Switch to Citizen Mode"
        >
          <UserIcon size={16} />
          <span className="rme-role-text">CITIZEN</span>
        </button>

        <button
          id="btn-role-coordinator"
          type="button"
          className={`rme-role-btn ${activeRole === 'COORDINATOR' ? 'active coordinator-active' : ''}`}
          onClick={() => onSelectRole('COORDINATOR')}
          title="Switch to Coordinator Mode"
        >
          <ShieldIcon size={16} />
          <span className="rme-role-text">COORDINATOR</span>
          {activeIncidentsCount > 0 && (
            <span className="rme-badge alert-badge" title={`${activeIncidentsCount} Active Incidents`}>
              {activeIncidentsCount}
            </span>
          )}
        </button>

        <button
          id="btn-role-responder"
          type="button"
          className={`rme-role-btn ${activeRole === 'RESPONDER' ? 'active responder-active' : ''}`}
          onClick={() => onSelectRole('RESPONDER')}
          title="Switch to Responder Mode"
        >
          <AmbulanceIcon size={16} />
          <span className="rme-role-text">RESPONDER</span>
          {activeMissionsCount > 0 && (
            <span className="rme-badge info-badge" title={`${activeMissionsCount} Active Missions`}>
              {activeMissionsCount}
            </span>
          )}
        </button>
      </nav>

      {/* Header Quick Status & Dev Toggle */}
      <div className="rme-header-right">
        {openSosCount > 0 && (
          <div className="rme-sos-banner" title="Active SOS Alert in Progress">
            <span className="rme-pulse-dot"></span>
            <AlertTriangleIcon size={14} color="#ef4444" />
            <span className="rme-sos-text">{openSosCount} SOS ACTIVE</span>
          </div>
        )}

        <button
          id="btn-toggle-dev-mode"
          type="button"
          className={`rme-dev-btn ${isDeveloperMode ? 'active' : ''}`}
          onClick={onToggleDeveloperMode}
          title={isDeveloperMode ? 'Exit Dev Metrics' : 'Enable Dev Metrics'}
        >
          <span>DEV</span>
        </button>
      </div>
    </header>
  );
};
