import React, { useState } from 'react';
import type { HazardZone, BlockedRoad } from '../types/safety';
import type { SafetyHub, OperationalArea } from '../types/safetyHub';
import { OPERATIONAL_AREA_TYPE_METAS } from '../types/safetyHub';
import type { Coordinate } from '../types/routing';
import { OperationalAreaIcon, SafetyHubShieldIcon } from './SafetyHubIcons';

interface CoordinatorManageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  hazards: HazardZone[];
  dangerZones: HazardZone[];
  blockedRoads: BlockedRoad[];
  safetyHubs?: SafetyHub[];
  operationalAreas?: OperationalArea[];
  onToggleHazardActive: (id: string) => void;
  onDeleteHazard: (id: string) => void;
  onToggleBlockedRoadActive: (id: string) => void;
  onDeleteBlockedRoad: (id: string) => void;
  onToggleSafetyHubActive?: (id: string) => void;
  onEditSafetyHub?: (hub: SafetyHub) => void;
  onDeleteSafetyHub?: (id: string) => void;
  onAddSafetyHubFromMap?: () => void;
  onAddOperationalAreaForHub?: (hub: SafetyHub) => void;
  onOpenCreateOperationalAreaForHub?: (hub: SafetyHub) => void;
  onEditOperationalArea?: (area: OperationalArea) => void;
  onDeleteOperationalArea?: (id: string) => void;
  onToggleOperationalAreaActive?: (id: string) => void;
  onResetToDefaults: () => void;
  onFocusFeature?: (coords: Coordinate[]) => void;
}

export const CoordinatorManageDrawer: React.FC<CoordinatorManageDrawerProps> = ({
  isOpen,
  onClose,
  hazards,
  dangerZones,
  blockedRoads,
  safetyHubs = [],
  operationalAreas = [],
  onToggleHazardActive,
  onDeleteHazard,
  onToggleBlockedRoadActive,
  onDeleteBlockedRoad,
  onToggleSafetyHubActive,
  onEditSafetyHub,
  onDeleteSafetyHub,
  onAddSafetyHubFromMap,
  onAddOperationalAreaForHub,
  onOpenCreateOperationalAreaForHub,
  onEditOperationalArea,
  onDeleteOperationalArea,
  onToggleOperationalAreaActive,
  onResetToDefaults,
  onFocusFeature,
}) => {
  const [activeTab, setActiveTab] = useState<'safety_hubs' | 'operational_areas' | 'hazards' | 'danger_zones' | 'blocked_roads'>('safety_hubs');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalHazards = hazards.length;
  const totalDangerZones = dangerZones.length;
  const totalBlocked = blockedRoads.length;
  const totalHubs = safetyHubs.length;
  const totalAreas = operationalAreas.length;

  const openHubsCount = safetyHubs.filter((h) => h.status === 'OPEN').length;
  const nearCapHubsCount = safetyHubs.filter((h) => h.status === 'NEAR_CAPACITY').length;
  const fullHubsCount = safetyHubs.filter((h) => h.status === 'FULL').length;
  const closedHubsCount = safetyHubs.filter((h) => h.status === 'CLOSED').length;

  const activeAreasCount = operationalAreas.filter((a) => a.status === 'ACTIVE').length;

  const handleItemClick = (id: string, coords: Coordinate[]) => {
    setSelectedItemId(id);
    if (onFocusFeature && coords.length > 0) {
      onFocusFeature(coords);
    }
  };

  return (
    <div className="drawer-overlay" id="coordinator-manage-drawer-overlay" onClick={onClose}>
      <div className="drawer-panel compact-drawer" id="coordinator-manage-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-badge">COORDINATOR CONTROL</span>
            <h3 className="drawer-title">OPERATIONAL MANAGEMENT</h3>
          </div>
          <button className="btn-drawer-close" onClick={onClose} title="Close Drawer (ESC)">
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="drawer-tabs" style={{ display: 'flex', overflowX: 'auto', gap: '4px' }}>
          <button
            type="button"
            className={`drawer-tab ${activeTab === 'safety_hubs' ? 'drawer-tab-active' : ''}`}
            onClick={() => setActiveTab('safety_hubs')}
            id="tab-manage-safety-hubs"
          >
            SAFETY HUBS ({totalHubs})
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === 'operational_areas' ? 'drawer-tab-active' : ''}`}
            onClick={() => setActiveTab('operational_areas')}
            id="tab-manage-op-areas"
          >
            FACILITIES ({totalAreas})
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === 'hazards' ? 'drawer-tab-active' : ''}`}
            onClick={() => setActiveTab('hazards')}
            id="tab-manage-hazards"
          >
            HAZARDS ({totalHazards})
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === 'danger_zones' ? 'drawer-tab-active' : ''}`}
            onClick={() => setActiveTab('danger_zones')}
            id="tab-manage-danger-zones"
          >
            DANGER ({totalDangerZones})
          </button>
          <button
            type="button"
            className={`drawer-tab ${activeTab === 'blocked_roads' ? 'drawer-tab-active' : ''}`}
            onClick={() => setActiveTab('blocked_roads')}
            id="tab-manage-blocked-roads"
          >
            ROADS ({totalBlocked})
          </button>
        </div>

        {/* Drawer Content */}
        <div className="drawer-body">
          {/* 0. Safety Hubs Tab */}
          {activeTab === 'safety_hubs' && (
            <div className="drawer-items-list">
              <div className="hubs-summary-metrics-bar">
                <div className="hub-metric-badge badge-open">
                  <span className="dot dot-open"></span>
                  <span>Open: <strong>{openHubsCount}</strong></span>
                </div>
                <div className="hub-metric-badge badge-near">
                  <span className="dot dot-near"></span>
                  <span>Near Cap: <strong>{nearCapHubsCount}</strong></span>
                </div>
                <div className="hub-metric-badge badge-full">
                  <span className="dot dot-full"></span>
                  <span>Full: <strong>{fullHubsCount}</strong></span>
                </div>
                <div className="hub-metric-badge badge-closed">
                  <span className="dot dot-closed"></span>
                  <span>Closed: <strong>{closedHubsCount}</strong></span>
                </div>
              </div>

              {onAddSafetyHubFromMap && (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-add-hub-drawer"
                  onClick={() => {
                    onClose();
                    onAddSafetyHubFromMap();
                  }}
                  id="btn-add-hub-from-drawer"
                  style={{
                    width: '100%',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <SafetyHubShieldIcon size={16} color="#60a5fa" />
                  <span>+ Select &amp; Add Safety Hub from Map</span>
                </button>
              )}

              {safetyHubs.length === 0 ? (
                <div className="drawer-empty">No active safety hubs configured.</div>
              ) : (
                safetyHubs.map((hub) => {
                  const isSelected = selectedItemId === hub.id;
                  const isVerified = hub.verificationStatus === 'VERIFIED';
                  const available = hub.availableCapacity;
                  const childAreas = operationalAreas.filter((a) => a.hubId === hub.id);

                  return (
                    <div
                      key={hub.id}
                      className={`drawer-item-card ${hub.status === 'CLOSED' ? 'item-inactive' : ''} ${isSelected ? 'item-focused' : ''}`}
                      onClick={() => handleItemClick(hub.id, [hub.coordinate])}
                    >
                      <div className="item-header">
                        <span className="item-id-tag">{hub.id}</span>
                        <span className="badge-site-type" style={{ fontSize: '10px' }}>
                          {hub.siteType}
                        </span>
                        <span className={`item-status-tag status-hub-pill pill-${hub.status.toLowerCase()}`}>
                          {hub.status}
                        </span>
                        {isVerified && (
                          <span className="badge-verified-tiny" title="Coordinator Verified Site">
                            ✓ VERIFIED
                          </span>
                        )}
                      </div>

                      <div className="item-name" style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <SafetyHubShieldIcon size={16} color="#3b82f6" />
                        <span>{hub.name}</span>
                      </div>

                      {hub.address && (
                        <div className="item-desc" style={{ fontSize: '11px', color: '#94a3b8' }}>
                          📍 {hub.address}
                        </div>
                      )}

                      {/* Capacity Progress Bar */}
                      <div className="hub-drawer-capacity-bar" style={{ marginTop: '8px' }}>
                        <div className="capacity-bar-container" style={{ height: '6px' }}>
                          <div
                            className={`capacity-bar-fill fill-${hub.status.toLowerCase()}`}
                            style={{
                              width: `${Math.min(100, Math.round((hub.currentOccupancy / hub.totalCapacity) * 100))}%`,
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginTop: '3px' }}>
                          <span style={{ color: '#cbd5e1' }}>
                            {hub.currentOccupancy} / {hub.totalCapacity} occupied
                          </span>
                          <strong className={available > 0 ? 'text-ok' : 'text-danger'}>
                            {available} spaces available
                          </strong>
                        </div>
                      </div>

                      {/* Child Operational Facilities List */}
                      {childAreas.length > 0 && (
                        <div
                          style={{
                            marginTop: '10px',
                            backgroundColor: '#0a0f1d',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid #1e293b',
                          }}
                        >
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
                            OPERATIONAL FACILITIES ({childAreas.length}):
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {childAreas.map((area) => {
                              const meta = OPERATIONAL_AREA_TYPE_METAS[area.type];
                              return (
                                <div
                                  key={area.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '11px',
                                    padding: '4px 6px',
                                    backgroundColor: '#111827',
                                    borderRadius: '4px',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const coords = area.polygonCoordinates || [area.coordinate];
                                    handleItemClick(area.id, coords);
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f8fafc' }}>
                                    <OperationalAreaIcon type={area.type} size={14} color={meta.color} />
                                    <span>{area.name}</span>
                                  </div>
                                  <span style={{ fontSize: '9.5px', color: meta.color, fontWeight: 600 }}>
                                    {area.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="item-actions" onClick={(e) => e.stopPropagation()} style={{ marginTop: '10px' }}>
                        <button
                          type="button"
                          className="btn-action btn-locate"
                          onClick={() => handleItemClick(hub.id, [hub.coordinate])}
                          title="Focus map on safety hub location"
                        >
                          Locate
                        </button>

                        {(onAddOperationalAreaForHub || onOpenCreateOperationalAreaForHub) && (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ background: '#0284c7', color: '#fff' }}
                            onClick={() => {
                              onClose();
                              if (onAddOperationalAreaForHub) {
                                onAddOperationalAreaForHub(hub);
                              } else if (onOpenCreateOperationalAreaForHub) {
                                onOpenCreateOperationalAreaForHub(hub);
                              }
                            }}
                            title="Add operational area / facility to this hub"
                          >
                            + Facility
                          </button>
                        )}

                        {onEditSafetyHub && (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ background: '#3b82f6', color: '#fff' }}
                            onClick={() => onEditSafetyHub(hub)}
                            title="Edit capacity and capabilities"
                          >
                            Edit
                          </button>
                        )}

                        {onToggleSafetyHubActive && (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ background: hub.status === 'CLOSED' ? '#10b981' : '#f59e0b', color: '#fff' }}
                            onClick={() => onToggleSafetyHubActive(hub.id)}
                            title={hub.status === 'CLOSED' ? 'Open hub for intake' : 'Close hub for intake'}
                          >
                            {hub.status === 'CLOSED' ? 'Open' : 'Close'}
                          </button>
                        )}

                        {onDeleteSafetyHub && (
                          <button
                            type="button"
                            className="btn-action btn-delete"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to remove Safety Hub "${hub.name}"?`)) {
                                onDeleteSafetyHub(hub.id);
                              }
                            }}
                            title="Delete safety hub"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 1. Operational Areas Tab */}
          {activeTab === 'operational_areas' && (
            <div className="drawer-items-list">
              <div className="hubs-summary-metrics-bar">
                <div className="hub-metric-badge badge-open">
                  <span className="dot dot-open"></span>
                  <span>Active: <strong>{activeAreasCount}</strong></span>
                </div>
                <div className="hub-metric-badge badge-near">
                  <span className="dot dot-near"></span>
                  <span>Total: <strong>{totalAreas}</strong></span>
                </div>
              </div>

              {operationalAreas.length === 0 ? (
                <div className="drawer-empty">No operational facilities added yet.</div>
              ) : (
                operationalAreas.map((area) => {
                  const isSelected = selectedItemId === area.id;
                  const meta = OPERATIONAL_AREA_TYPE_METAS[area.type];
                  const coords = area.polygonCoordinates || [area.coordinate];

                  return (
                    <div
                      key={area.id}
                      className={`drawer-item-card ${area.status === 'INACTIVE' || area.status === 'CLOSED' ? 'item-inactive' : ''} ${isSelected ? 'item-focused' : ''}`}
                      onClick={() => handleItemClick(area.id, coords)}
                    >
                      <div className="item-header">
                        <span className="item-id-tag">{area.id}</span>
                        <span className="badge-site-type" style={{ fontSize: '10px', color: meta.color, borderColor: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="badge-site-type" style={{ fontSize: '10px' }}>
                          {area.format}
                        </span>
                        <span className={`item-status-tag status-hub-pill pill-${area.status.toLowerCase()}`}>
                          {area.status}
                        </span>
                      </div>

                      <div className="item-name" style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <OperationalAreaIcon type={area.type} size={16} color={meta.color} />
                        <span>{area.name}</span>
                      </div>

                      <div className="item-desc" style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Hub: <strong style={{ color: '#cbd5e1' }}>{area.hubName}</strong>
                      </div>

                      {area.capacity !== undefined && (
                        <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                          Capacity: <strong>{area.occupancy || 0} / {area.capacity} people</strong>
                        </div>
                      )}

                      {area.resourceNotes && (
                        <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                          Resource: {area.resourceNotes}
                        </div>
                      )}

                      <div className="item-actions" onClick={(e) => e.stopPropagation()} style={{ marginTop: '10px' }}>
                        <button
                          type="button"
                          className="btn-action btn-locate"
                          onClick={() => handleItemClick(area.id, coords)}
                          title="Focus map on operational facility"
                        >
                          Locate
                        </button>

                        {onEditOperationalArea && (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ background: '#3b82f6', color: '#fff' }}
                            onClick={() => onEditOperationalArea(area)}
                            title="Edit operational details"
                          >
                            Edit
                          </button>
                        )}

                        {onToggleOperationalAreaActive && (
                          <button
                            type="button"
                            className="btn-action"
                            style={{ background: area.status === 'INACTIVE' ? '#10b981' : '#f59e0b', color: '#fff' }}
                            onClick={() => onToggleOperationalAreaActive(area.id)}
                            title={area.status === 'INACTIVE' ? 'Activate facility' : 'Set facility inactive'}
                          >
                            {area.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                          </button>
                        )}

                        {onDeleteOperationalArea && (
                          <button
                            type="button"
                            className="btn-action btn-delete"
                            onClick={() => {
                              if (window.confirm(`Delete operational facility "${area.name}"?`)) {
                                onDeleteOperationalArea(area.id);
                              }
                            }}
                            title="Delete facility"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 2. Hazards Tab */}
          {activeTab === 'hazards' && (
            <div className="drawer-items-list">
              {hazards.length === 0 ? (
                <div className="drawer-empty">No active disaster hazards.</div>
              ) : (
                hazards.map((h) => {
                  const isSelected = selectedItemId === h.id;
                  const coords = h.geometry.coordinates[0] as Coordinate[];
                  return (
                    <div
                      key={h.id}
                      className={`drawer-item-card ${h.isActive === false ? 'item-inactive' : ''} ${isSelected ? 'item-focused' : ''}`}
                      onClick={() => handleItemClick(h.id, coords)}
                    >
                      <div className="item-header">
                        <span className="item-id-tag">{h.id}</span>
                        <span className={`item-severity-tag severity-${h.severity.toLowerCase()}`}>
                          {h.severity}
                        </span>
                        {h.isActive === false && <span className="item-disabled-tag">INACTIVE</span>}
                      </div>
                      <div className="item-name">{h.name}</div>
                      <div className="item-desc">{h.description}</div>
                      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-action btn-locate"
                          onClick={() => handleItemClick(h.id, coords)}
                          title="Center and zoom to this hazard"
                        >
                          Locate
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-toggle"
                          onClick={() => onToggleHazardActive(h.id)}
                          title={h.isActive === false ? 'Enable hazard for routing' : 'Disable hazard'}
                        >
                          {h.isActive === false ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-delete"
                          onClick={() => onDeleteHazard(h.id)}
                          title="Delete hazard zone permanently"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 3. Danger Zones Tab */}
          {activeTab === 'danger_zones' && (
            <div className="drawer-items-list">
              {dangerZones.length === 0 ? (
                <div className="drawer-empty">No active danger zones.</div>
              ) : (
                dangerZones.map((d) => {
                  const isSelected = selectedItemId === d.id;
                  const coords = d.geometry.coordinates[0] as Coordinate[];
                  return (
                    <div
                      key={d.id}
                      className={`drawer-item-card ${d.isActive === false ? 'item-inactive' : ''} ${isSelected ? 'item-focused' : ''}`}
                      onClick={() => handleItemClick(d.id, coords)}
                    >
                      <div className="item-header">
                        <span className="item-id-tag">{d.id}</span>
                        <span className="item-severity-tag severity-danger">DANGER</span>
                        {d.isActive === false && <span className="item-disabled-tag">INACTIVE</span>}
                      </div>
                      <div className="item-name">{d.name}</div>
                      <div className="item-desc">{d.description}</div>
                      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-action btn-locate"
                          onClick={() => handleItemClick(d.id, coords)}
                          title="Center and zoom to this danger zone"
                        >
                          Locate
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-toggle"
                          onClick={() => onToggleHazardActive(d.id)}
                          title={d.isActive === false ? 'Enable danger zone' : 'Disable danger zone'}
                        >
                          {d.isActive === false ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-delete"
                          onClick={() => onDeleteHazard(d.id)}
                          title="Delete danger zone permanently"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 4. Blocked Roads Tab */}
          {activeTab === 'blocked_roads' && (
            <div className="drawer-items-list">
              {blockedRoads.length === 0 ? (
                <div className="drawer-empty">No blocked road closures active.</div>
              ) : (
                blockedRoads.map((r) => {
                  const isSelected = selectedItemId === r.id;
                  const coords = r.geometry.coordinates as Coordinate[];
                  return (
                    <div
                      key={r.id}
                      className={`drawer-item-card ${r.isActive === false ? 'item-inactive' : ''} ${isSelected ? 'item-focused' : ''}`}
                      onClick={() => handleItemClick(r.id, coords)}
                    >
                      <div className="item-header">
                        <span className="item-id-tag">{r.id}</span>
                        <span className="item-severity-tag severity-blocked">BLOCKED</span>
                        {r.isActive === false && <span className="item-disabled-tag">INACTIVE</span>}
                      </div>
                      <div className="item-name">{r.name}</div>
                      <div className="item-desc">{r.reason}</div>
                      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-action btn-locate"
                          onClick={() => handleItemClick(r.id, coords)}
                          title="Center and zoom to this blocked road"
                        >
                          Locate
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-toggle"
                          onClick={() => onToggleBlockedRoadActive(r.id)}
                          title={r.isActive === false ? 'Enable road closure' : 'Disable closure'}
                        >
                          {r.isActive === false ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-delete"
                          onClick={() => onDeleteBlockedRoad(r.id)}
                          title="Remove road closure permanently"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="drawer-footer">
          <button
            type="button"
            className="btn btn-secondary btn-reset-defaults"
            onClick={() => {
              if (window.confirm('Reset all operational controls, hazards, and road blocks to system defaults?')) {
                onResetToDefaults();
              }
            }}
          >
            Reset All to Defaults
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
