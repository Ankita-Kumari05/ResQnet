import React, { useState } from 'react';
import type {
  OperationalArea,
  OperationalAreaType,
  OperationalAreaFormat,
  OperationalAreaStatus,
  SafetyHub,
} from '../types/safetyHub';
import { OPERATIONAL_AREA_TYPE_METAS } from '../types/safetyHub';
import { OperationalAreaIcon } from './SafetyHubIcons';

interface CreateOperationalAreaModalProps {
  safetyHubs: SafetyHub[];
  preselectedHubId?: string;
  onCancel: () => void;
  onProceedToMapPlacement: (draft: {
    hubId: string;
    hubName: string;
    name: string;
    type: OperationalAreaType;
    format: OperationalAreaFormat;
    status: OperationalAreaStatus;
    capacity?: number;
    occupancy?: number;
    description?: string;
    resourceCategory?: 'WATER' | 'FOOD' | 'MEDICAL' | 'BEDDING' | 'POWER' | 'SANITATION' | 'OTHER';
    resourceNotes?: string;
  }) => void;
}

export const CreateOperationalAreaModal: React.FC<CreateOperationalAreaModalProps> = ({
  safetyHubs,
  preselectedHubId,
  onCancel,
  onProceedToMapPlacement,
}) => {
  const initialHub =
    safetyHubs.find((h) => h.id === preselectedHubId) ||
    (safetyHubs.length > 0 ? safetyHubs[0] : null);
  const [selectedHubId, setSelectedHubId] = useState<string>(initialHub?.id || '');
  const [selectedType, setSelectedType] = useState<OperationalAreaType>('RELIEF_TENT');
  const [format, setFormat] = useState<OperationalAreaFormat>('POLYGON');
  const [name, setName] = useState<string>('');
  const [capacity, setCapacity] = useState<number>(100);
  const [occupancy, setOccupancy] = useState<number>(0);
  const [status, setStatus] = useState<OperationalAreaStatus>('ACTIVE');
  const [description, setDescription] = useState<string>('');
  const [resourceNotes, setResourceNotes] = useState<string>('');

  const currentHub = safetyHubs.find((h) => h.id === selectedHubId) || initialHub;
  const meta = OPERATIONAL_AREA_TYPE_METAS[selectedType];

  const handleTypeSelect = (type: OperationalAreaType) => {
    setSelectedType(type);
    const m = OPERATIONAL_AREA_TYPE_METAS[type];
    setFormat(m.defaultFormat);
    if (!name || name.includes('Area') || name.includes('Point') || name.includes('Station')) {
      setName(`${currentHub?.name ? `${currentHub.name.split(',')[0]} ` : ''}${m.label}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHub) return;

    const finalName = name.trim() || `${currentHub.name.split(',')[0]} ${meta.label}`;

    onProceedToMapPlacement({
      hubId: currentHub.id,
      hubName: currentHub.name,
      name: finalName,
      type: selectedType,
      format,
      status,
      capacity: capacity > 0 ? capacity : undefined,
      occupancy: occupancy >= 0 ? occupancy : undefined,
      description: description.trim() || meta.description,
      resourceCategory: meta.resourceCategory,
      resourceNotes: resourceNotes.trim() || undefined,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content hub-config-modal" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="modal-badge-verified">OPERATIONAL FACILITY</span>
            <h2>Add Safety Hub Operational Area</h2>
          </div>
          <button className="modal-close-btn" onClick={onCancel} type="button">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            {/* Parent Safety Hub Selection */}
            <div className="form-group">
              <label className="form-label">Associated Safety Hub:</label>
              <select
                className="form-input"
                value={selectedHubId}
                onChange={(e) => {
                  setSelectedHubId(e.target.value);
                  const h = safetyHubs.find((item) => item.id === e.target.value);
                  if (h) {
                    setName(`${h.name.split(',')[0]} ${meta.label}`);
                  }
                }}
                required
              >
                {safetyHubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.siteType} — {h.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Area Type Grid */}
            <div className="form-group" style={{ marginTop: '14px' }}>
              <label className="form-label">Select Operational Area Type:</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                  marginTop: '6px',
                }}
              >
                {(Object.keys(OPERATIONAL_AREA_TYPE_METAS) as OperationalAreaType[]).map((typeKey) => {
                  const m = OPERATIONAL_AREA_TYPE_METAS[typeKey];
                  const isSelected = selectedType === typeKey;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => handleTypeSelect(typeKey)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        backgroundColor: isSelected ? '#1e293b' : '#0f172a',
                        border: `1.5px solid ${isSelected ? m.color : '#334155'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          backgroundColor: `${m.color}22`,
                          border: `1px solid ${m.color}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: m.color,
                        }}
                      >
                        <OperationalAreaIcon type={typeKey} size={18} color={m.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                          {m.label}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px', lineHeight: 1.25 }}>
                          {m.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Placement Format Selection */}
            <div className="form-group" style={{ marginTop: '14px' }}>
              <label className="form-label">Map Placement Format:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: format === 'POINT' ? '#1e293b' : '#0f172a',
                    border: format === 'POINT' ? '1.5px solid #3b82f6' : '1px solid #334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    checked={format === 'POINT'}
                    onChange={() => setFormat('POINT')}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '11.5px', color: '#f8fafc' }}>
                      📍 Point Marker
                    </strong>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      Click exact single location (e.g. Water tap, Medical desk)
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: format === 'POLYGON' ? '#1e293b' : '#0f172a',
                    border: format === 'POLYGON' ? '1.5px solid #3b82f6' : '1px solid #334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    checked={format === 'POLYGON'}
                    onChange={() => setFormat('POLYGON')}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '11.5px', color: '#f8fafc' }}>
                      📐 Area / Polygon
                    </strong>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      Draw operational boundary (e.g. Tent camp, Shelter hall)
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Name, Capacity & Status Row */}
            <div className="form-row" style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Facility / Area Name:</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`e.g. ${meta.label}`}
                  required
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Capacity (People):</label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  className="form-input"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Occupancy:</label>
                <input
                  type="number"
                  min="0"
                  max={capacity}
                  className="form-input"
                  value={occupancy}
                  onChange={(e) => setOccupancy(Number(e.target.value))}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Initial Status:</label>
                <select
                  className="form-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OperationalAreaStatus)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="FULL">FULL</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
            </div>

            {/* Description & Resource Notes */}
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Operational Notes &amp; Assigned Volunteer Teams:</label>
              <textarea
                rows={2}
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter staging notes, assigned volunteer teams, equipment installed..."
              />
            </div>

            <div className="form-group" style={{ marginTop: '10px' }}>
              <label className="form-label">Resource Inventory Reference:</label>
              <input
                type="text"
                className="form-input"
                value={resourceNotes}
                onChange={(e) => setResourceNotes(e.target.value)}
                placeholder="e.g. 2x 5000L water bowsers, 4 volunteer medics"
              />
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {format === 'POINT' ? '📍 Proceed to Place Point on Map' : '📐 Proceed to Draw Area on Map'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface EditOperationalAreaModalProps {
  isOpen?: boolean;
  area: OperationalArea;
  safetyHubs?: SafetyHub[];
  onCancel: () => void;
  onSave: (updatedArea: OperationalArea) => void;
  onDelete: (id: string) => void;
}

export const EditOperationalAreaModal: React.FC<EditOperationalAreaModalProps> = ({
  isOpen = true,
  area,
  onCancel,
  onSave,
  onDelete,
}) => {
  // Local state initialized with deep copy
  const [name, setName] = useState<string>(area?.name || '');
  const [status, setStatus] = useState<OperationalAreaStatus>(area?.status || 'OPERATIONAL');
  const [capacity, setCapacity] = useState<number>(area?.capacity || 0);
  const [occupancy, setOccupancy] = useState<number>(area?.occupancy || 0);
  const [description, setDescription] = useState<string>(area?.description || '');
  const [resourceNotes, setResourceNotes] = useState<string>(area?.resourceNotes || '');

  if (!isOpen || !area) return null;

  const meta = OPERATIONAL_AREA_TYPE_METAS[area.type];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: OperationalArea = {
      ...JSON.parse(JSON.stringify(area)),
      name: name.trim() || area.name,
      status,
      capacity: capacity > 0 ? capacity : undefined,
      occupancy: occupancy >= 0 ? occupancy : undefined,
      description: description.trim() || undefined,
      resourceNotes: resourceNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    onSave(updated);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content hub-config-modal" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="modal-badge-verified" style={{ backgroundColor: meta.color }}>
              {meta.label.toUpperCase()}
            </span>
            <h2>Edit Operational Facility</h2>
          </div>
          <button className="modal-close-btn" onClick={onCancel} type="button">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div
              style={{
                backgroundColor: '#0f172a',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #334155',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Parent Safety Hub:</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>{area.hubName}</div>
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                Format: {area.format === 'POINT' ? 'Point Marker' : 'Polygon Boundary'} — Primary Coord: [
                {area.coordinate[1].toFixed(5)}, {area.coordinate[0].toFixed(5)}]
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Facility Name:</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-row" style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Operational Status:</label>
                <select
                  className="form-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OperationalAreaStatus)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="NEAR_CAPACITY">NEAR CAPACITY</option>
                  <option value="FULL">FULL</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Capacity (People):</label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  className="form-input"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Occupancy:</label>
                <input
                  type="number"
                  min="0"
                  max={capacity}
                  className="form-input"
                  value={occupancy}
                  onChange={(e) => setOccupancy(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Operational Notes:</label>
              <textarea
                rows={2}
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Resource Allocation Notes:</label>
              <input
                type="text"
                className="form-input"
                value={resourceNotes}
                onChange={(e) => setResourceNotes(e.target.value)}
                placeholder="e.g. 5,000L stored, refilled every 4 hours"
              />
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Remove operational facility "${area.name}"?`)) {
                  onDelete(area.id);
                }
              }}
            >
              Delete Facility
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
