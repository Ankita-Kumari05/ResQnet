import React, { useState } from 'react';
import type { HazardZone, BlockedRoad, HazardSeverity } from '../types/safety';
import type { Coordinate } from '../types/routing';
import type { LineString } from 'geojson';
import { distanceMeters } from '../services/geometryUtils';

interface ConfirmPolygonModalProps {
  type: 'hazard' | 'danger_zone';
  points: Coordinate[];
  onConfirm: (hazard: HazardZone) => void;
  onCancel: () => void;
}

export const ConfirmPolygonModal: React.FC<ConfirmPolygonModalProps> = ({
  type,
  points,
  onConfirm,
  onCancel,
}) => {
  const isDanger = type === 'danger_zone';
  const [hazardType, setHazardType] = useState(
    isDanger ? 'Evacuation Advisory Corridor' : 'Structural Collapse & Debris'
  );
  const [name, setName] = useState(
    isDanger
      ? `Operational Danger Area ${Math.floor(100 + Math.random() * 900)}`
      : `Disaster Hazard Zone ${Math.floor(100 + Math.random() * 900)}`
  );
  const [severity, setSeverity] = useState<HazardSeverity>(isDanger ? 'HIGH' : 'CRITICAL');
  const [status, setStatus] = useState<'ACTIVE' | 'PROVISIONAL'>('ACTIVE');
  const [description, setDescription] = useState(
    isDanger
      ? 'Operational warning: Area contains active hazard conditions and unstable structures.'
      : 'Severe structural debris and active physical hazards. Mandatory detour corridor.'
  );
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Ensure polygon is closed (first and last coordinate match)
    const closedCoords: Coordinate[] = [...points];
    const first = closedCoords[0];
    const last = closedCoords[closedCoords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closedCoords.push([...first]);
    }

    const id = `${isDanger ? 'DZ' : 'HZ'}-MANUAL-${Date.now().toString().slice(-4)}`;
    const color =
      severity === 'CRITICAL'
        ? '#9333ea'
        : severity === 'HIGH'
        ? '#ef4444'
        : severity === 'MODERATE'
        ? '#f59e0b'
        : severity === 'LOW'
        ? '#eab308'
        : '#10b981';

    const newZone: HazardZone = {
      id,
      name: `${name.trim()} (${hazardType})`,
      severity,
      description: description.trim(),
      geometry: {
        type: 'Polygon',
        coordinates: [closedCoords],
      },
      color,
      isDangerZone: isDanger,
      isActive: status === 'ACTIVE',
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    onConfirm(newZone);
  };

  return (
    <div className="modal-backdrop" id="modal-confirm-polygon" onClick={onCancel}>
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className={`modal-badge ${isDanger ? 'badge-danger-zone' : 'badge-hazard-zone'}`}>
              {isDanger ? 'DANGER ZONE' : 'HAZARD ZONE'}
            </span>
            <h3 className="modal-title">
              {isDanger ? 'ADD DANGER ZONE' : 'ADD HAZARD ZONE'}
            </h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row-grid">
            <div className="form-group">
              <label className="form-label">Hazard Type:</label>
              <select
                className="form-select"
                value={hazardType}
                onChange={(e) => setHazardType(e.target.value)}
              >
                <option value="Structural Collapse & Debris">Structural Collapse & Debris</option>
                <option value="Active Fire Front">Active Fire Front</option>
                <option value="Flash Flood Surge">Flash Flood Surge</option>
                <option value="Toxic Gas Release">Toxic Gas Release</option>
                <option value="Evacuation Advisory Corridor">Evacuation Advisory Corridor</option>
                <option value="Severe Infrastructure Damage">Severe Infrastructure Damage</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Severity Level:</label>
              <select
                className="form-select"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as HazardSeverity)}
              >
                <option value="CRITICAL">CRITICAL (No-Go / Mandatory Detour)</option>
                <option value="HIGH">HIGH (Severe Danger)</option>
                <option value="MODERATE">MODERATE (Pass with Caution)</option>
                <option value="LOW">LOW (Advisory Warning)</option>
                <option value="SAFE">SAFE (Assembly Area)</option>
              </select>
            </div>
          </div>

          <div className="form-row-grid">
            <div className="form-group">
              <label className="form-label">Zone Name / Title:</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Operational Status:</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'PROVISIONAL')}
              >
                <option value="ACTIVE">ACTIVE (Affects routing immediately)</option>
                <option value="PROVISIONAL">PROVISIONAL (Monitoring)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reason / Description:</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Operational Notes (Optional):</label>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Authorized by Field Unit 4 at 20:30"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-modal btn-cancel" onClick={onCancel}>
              CANCEL
            </button>
            <button type="submit" className={`btn-modal ${isDanger ? 'btn-confirm-danger' : 'btn-confirm-hazard'}`}>
              {isDanger ? 'CREATE DANGER ZONE' : 'CREATE HAZARD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ConfirmBlockRoadModalProps {
  road: BlockedRoad;
  onConfirm: (road: BlockedRoad) => void;
  onCancel: () => void;
}

export const ConfirmBlockRoadModal: React.FC<ConfirmBlockRoadModalProps> = ({
  road,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(road.name);
  const [reason, setReason] = useState(road.reason);
  const [notes, setNotes] = useState(road.notes || '');

  // Calculate approximate road segment length
  const coords = (road.geometry.coordinates || []) as Coordinate[];
  const lengthMeters = coords.reduce((acc, coord, idx, arr) => {
    if (idx === 0) return 0;
    return acc + distanceMeters(arr[idx - 1], coord);
  }, 0);

  const formattedLength =
    lengthMeters >= 1000
      ? `${(lengthMeters / 1000).toFixed(2)} km`
      : `${Math.round(lengthMeters)} m`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updatedRoad: BlockedRoad = {
      ...road,
      name: name.trim(),
      reason: reason.trim(),
      notes: notes.trim(),
      isActive: true,
      createdAt: road.createdAt || new Date().toISOString(),
    };

    onConfirm(updatedRoad);
  };

  return (
    <div className="modal-backdrop" id="modal-confirm-block-road" onClick={onCancel}>
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge badge-road-block">ROAD CLOSURE</span>
            <h3 className="modal-title">BLOCK ENTIRE ROAD</h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="static-segment-badge-row">
            <div className="seg-detail">
              <span className="seg-label">ROAD ID:</span>
              <span className="seg-val">{road.id}</span>
            </div>
            <div className="seg-detail">
              <span className="seg-label">ROAD LENGTH:</span>
              <span className="seg-val">{formattedLength}</span>
            </div>
            <div className="seg-detail">
              <span className="seg-label">CURRENT STATUS:</span>
              <span className="seg-val status-blocked-tag">BLOCKED</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Road Identifier / Street Name:</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Closure Reason:</label>
            <input
              type="text"
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Operational Notes (Optional):</label>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Police barricade placed at intersection"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-modal btn-cancel" onClick={onCancel}>
              CANCEL
            </button>
            <button type="submit" className="btn-modal btn-danger">
              BLOCK ROAD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export interface RoadSectionDraft {
  roadId: string;
  roadName: string;
  geometry: LineString;
  coordinates: Coordinate[];
  lengthMeters: number;
  startPoint: Coordinate;
  endPoint: Coordinate;
}

interface ConfirmBlockRoadSectionModalProps {
  section: RoadSectionDraft;
  onConfirm: (road: BlockedRoad) => void;
  onCancel: () => void;
}

export const ConfirmBlockRoadSectionModal: React.FC<ConfirmBlockRoadSectionModalProps> = ({
  section,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(`Section of ${section.roadName}`);
  const [reason, setReason] = useState('Localized hazard / structural closure between gates');
  const [notes, setNotes] = useState('Traffic diverted; remaining sections of road remain open.');

  const formattedLength =
    section.lengthMeters >= 1000
      ? `${(section.lengthMeters / 1000).toFixed(2)} km`
      : `${section.lengthMeters} m`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const blockId = `SECTION-BLOCK-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const newBlockedSection: BlockedRoad = {
      id: blockId,
      name: name.trim(),
      status: 'BLOCKED',
      reason: reason.trim(),
      notes: notes.trim(),
      geometry: section.geometry,
      isActive: true,
      roadId: section.roadId,
      isSection: true,
      lengthMeters: section.lengthMeters,
      startPoint: section.startPoint,
      endPoint: section.endPoint,
      createdAt: new Date().toISOString(),
    };

    onConfirm(newBlockedSection);
  };

  return (
    <div className="modal-backdrop" id="modal-confirm-block-section" onClick={onCancel}>
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge badge-road-block">ROAD SECTION CLOSURE</span>
            <h3 className="modal-title">BLOCK ROAD SECTION</h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="static-segment-badge-row">
            <div className="seg-detail">
              <span className="seg-label">ROAD ID:</span>
              <span className="seg-val">{section.roadId}</span>
            </div>
            <div className="seg-detail">
              <span className="seg-label">SECTION LENGTH:</span>
              <span className="seg-val">{formattedLength}</span>
            </div>
            <div className="seg-detail">
              <span className="seg-label">ROAD STATUS:</span>
              <span className="seg-val status-blocked-tag">SECTION BLOCKED</span>
            </div>
          </div>

          <div className="form-row-grid">
            <div className="form-group">
              <label className="form-label">Closure Gate 1:</label>
              <input
                type="text"
                className="form-input"
                readOnly
                value={`[${section.startPoint[0].toFixed(5)}, ${section.startPoint[1].toFixed(5)}]`}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Closure Gate 2:</label>
              <input
                type="text"
                className="form-input"
                readOnly
                value={`[${section.endPoint[0].toFixed(5)}, ${section.endPoint[1].toFixed(5)}]`}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Section Identifier / Street Name:</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Closure Reason:</label>
            <input
              type="text"
              className="form-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Operational Notes (Optional):</label>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Police barricades placed at Gate 1 and Gate 2"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-modal btn-cancel" onClick={onCancel}>
              CANCEL
            </button>
            <button type="submit" className="btn-modal btn-danger">
              BLOCK SECTION
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

