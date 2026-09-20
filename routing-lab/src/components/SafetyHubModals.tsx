import React, { useState } from 'react';
import type { Coordinate } from '../types/routing';
import type {
  SafetyHub,
  PotentialSafetyHub,
  SafetyHubSiteType,
  SafetyHubStatus,
  HubResource,
  ResourceRequirement,
  VerificationStatus,
} from '../types/safetyHub';
import { computeSafetyHubStatus } from '../types/safetyHub';

const SITE_TYPES: SafetyHubSiteType[] = [
  'General Emergency Hub',
  'Relief / Camp Hub',
  'Medical Support Hub',
  'Food Distribution Hub',
  'Evacuation Assembly Hub',
  'Community Relief Hub',
  'Government School',
  'Government College',
  'University / Campus',
  'Community Centre',
  'Sports Complex',
  'Stadium',
  'Government Facility',
  'Public Building',
  'Open Ground',
  'Other Public Space',
];

const DISASTER_TYPES = ['Flood', 'Earthquake', 'Storm', 'Civil Emergency', 'Landslide', 'Fire'];

// Vector SVG Icons (Strictly No Emoji)
const HubIconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const HubIconPolygon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 22 8.5 18 20 6 20 2 8.5 12 2" />
  </svg>
);

const HubIconPoint = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const HubIconFacility = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 7v14M21 7v14M6 3h12a2 2 0 0 1 2 2v2H4V5a2 2 0 0 1 2-2zM9 10h1v2H9zM14 10h1v2h-1zM9 15h1v2H9zM14 15h1v2h-1z" />
  </svg>
);

const HubIconTent = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 20 10 4 1 20h18zM10 4v16M14 20l-4-7-4 7" />
  </svg>
);

const HubIconFood = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
  </svg>
);

const HubIconWater = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

const HubIconMedical = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const HubIconSanitation = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4" />
    <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
  </svg>
);

const HubIconPower = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const HubIconRegistration = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 12h6M9 16h6" />
  </svg>
);

const HubIconSpecialNeeds = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2" />
    <path d="m14 12-1.5-3.5L9 10v4h2v5h2v-6l2-1" />
    <path d="M18 19a5 5 0 1 1-10 0" />
  </svg>
);

const HubIconEntrance = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
  </svg>
);

// -------------------------------------------------------------
// 1. CREATE SAFETY HUB CHOICE MODAL
// -------------------------------------------------------------
interface CreateSafetyHubChoiceModalProps {
  onSelectChoice: (choice: 'draw_area' | 'mark_point' | 'select_facility') => void;
  onCancel: () => void;
}

export const CreateSafetyHubChoiceModal: React.FC<CreateSafetyHubChoiceModalProps> = ({
  onSelectChoice,
  onCancel,
}) => {
  return (
    <div className="modal-backdrop" id="modal-create-safety-hub-choice" onClick={onCancel}>
      <div className="modal-card choice-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge badge-hub-active">OPERATIONAL SAFETY HUB</span>
            <h3 className="modal-title">CREATE SAFETY HUB</h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <p className="text-secondary" style={{ fontSize: '13px', marginBottom: '18px', lineHeight: '1.4' }}>
            The Coordinator manually defines the exact operational area on the real Indian map. Choose your creation workflow:
          </p>

          <div className="creation-choices-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Choice 1: Select Public Facility */}
            <button
              type="button"
              className="creation-choice-card"
              id="btn-choice-select-facility"
              onClick={() => onSelectChoice('select_facility')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.65)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                color: '#ffffff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                  flexShrink: 0,
                }}
              >
                <HubIconFacility />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', color: '#ffffff', display: 'block', marginBottom: '3px' }}>
                  Select Public Facility
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                  Click a recognized school, college, stadium, or community center on the map style to inspect map data and configure as a hub.
                </p>
              </div>
            </button>

            {/* Choice 2: Draw Safety Hub Area */}
            <button
              type="button"
              className="creation-choice-card choice-recommended"
              id="btn-choice-draw-area"
              onClick={() => onSelectChoice('draw_area')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '16px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 78, 59, 0.25) 100%)',
                border: '1.5px solid #10b981',
                color: '#ffffff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.25)',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  flexShrink: 0,
                }}
              >
                <HubIconPolygon />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '15px', color: '#ffffff' }}>Draw Safety Hub Area</strong>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#d1fae5', lineHeight: '1.4' }}>
                  Click polygon vertices on the map to define the exact usable perimeter (school playground, stadium ground, open campus).
                </p>
              </div>
            </button>

            {/* Choice 3: Mark Safety Hub Point */}
            <button
              type="button"
              className="creation-choice-card"
              id="btn-choice-mark-point"
              onClick={() => onSelectChoice('mark_point')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.65)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                color: '#ffffff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  flexShrink: 0,
                }}
              >
                <HubIconPoint />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '14px', color: '#ffffff', display: 'block', marginBottom: '3px' }}>
                  Mark Safety Hub Point
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                  Click once on the map to place a compact emergency facility, temporary relief shelter, or triage point.
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(148, 163, 184, 0.15)', padding: '12px 24px' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 2. POTENTIAL SAFETY HUB INSPECTION / UNKNOWN LOCATION MODAL
// -------------------------------------------------------------
interface PotentialSafetyHubModalProps {
  potentialHub: PotentialSafetyHub;
  onProceedToConfig: (potential: PotentialSafetyHub) => void;
  onProceedToDrawArea?: (potential: PotentialSafetyHub) => void;
  onCancel: () => void;
}

export const PotentialSafetyHubModal: React.FC<PotentialSafetyHubModalProps> = ({
  potentialHub,
  onProceedToConfig,
  onProceedToDrawArea,
  onCancel,
}) => {
  const isIdentified = potentialHub.isIdentifiedFromMap !== false && Boolean(potentialHub.name);

  return (
    <div className="modal-backdrop" id="modal-potential-hub" onClick={onCancel}>
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className={`modal-badge ${isIdentified ? 'badge-hub-active' : 'badge-hazard-zone'}`}>
              {isIdentified ? 'PUBLIC FACILITY IDENTIFIED' : 'LOCATION SELECTED'}
            </span>
            <h3 className="modal-title">
              {isIdentified ? potentialHub.name : 'MANUAL SAFETY HUB LOCATION'}
            </h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px' }}>
          <div className="potential-hub-card">
            {isIdentified ? (
              <>
                <div className="potential-field-row">
                  <span className="field-label">Detected Site Name:</span>
                  <strong className="field-value text-info" style={{ fontSize: '14px' }}>
                    {potentialHub.name}
                  </strong>
                </div>

                <div className="potential-field-row">
                  <span className="field-label">Inferred Facility Type:</span>
                  <span className="badge-site-type">{potentialHub.siteType}</span>
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                No public map feature was identified at this point. You can still create a fully operational Safety Hub here.
              </div>
            )}

            <div className="potential-field-row">
              <span className="field-label">Exact Coordinates:</span>
              <span className="field-coords" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                {potentialHub.coordinate[1].toFixed(5)}° N, {potentialHub.coordinate[0].toFixed(5)}° E
              </span>
            </div>

            {potentialHub.sourceLayer && (
              <div className="potential-field-row">
                <span className="field-label">MapTiler Layer:</span>
                <span className="text-secondary" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                  {potentialHub.sourceLayer}
                </span>
              </div>
            )}
          </div>

          <div className="verification-notice-box" style={{ marginTop: '14px' }}>
            <div className="notice-icon">
              <HubIconShield />
            </div>
            <div className="notice-text">
              <strong>Coordinator Operational Definition:</strong>
              <p>
                The Coordinator defines the usable operational boundary, configured capacity, and emergency capabilities before activating for citizen evacuation routing.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          {onProceedToDrawArea && (
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => onProceedToDrawArea(potentialHub)}
              id="btn-draw-area-around-hub"
              title="Manually draw the exact usable polygon boundary on the map"
            >
              Draw Area
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-action-glow"
            onClick={() => onProceedToConfig(potentialHub)}
            id="btn-verify-configure-hub"
          >
            {isIdentified ? '✓ Use Location' : '✓ Use Point'}
          </button>
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 3. CONFIGURE & ACTIVATE SAFETY HUB MODAL
// -------------------------------------------------------------
export interface ConfigureSafetyHubModalProps {
  initialHub?: SafetyHub | null;
  potentialHub?: PotentialSafetyHub | null;
  draftPolygon?: Coordinate[] | null;
  pointCoord?: Coordinate | null;
  entranceCoord?: Coordinate | null;
  existingHubs?: SafetyHub[];
  onSetEntranceOnMap?: (currentDraft: Partial<SafetyHub>) => void;
  onClearEntrance?: () => void;
  onSave: (hub: SafetyHub) => void;
  onCancel: () => void;
}

const generateNextHubId = (hubs?: SafetyHub[]): string => {
  if (!hubs || hubs.length === 0) return 'H01';
  let maxNum = 0;
  hubs.forEach((h) => {
    const match = h.id.match(/^H(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  if (maxNum > 0) {
    const next = maxNum + 1;
    return `H${next < 10 ? '0' + next : next}`;
  }
  const next = hubs.length + 1;
  return `H${next < 10 ? '0' + next : next}`;
};

export const ConfigureSafetyHubModal: React.FC<ConfigureSafetyHubModalProps> = ({
  initialHub,
  potentialHub,
  draftPolygon,
  pointCoord,
  entranceCoord,
  existingHubs,
  onSetEntranceOnMap,
  onClearEntrance,
  onSave,
  onCancel,
}) => {
  const polygonCoordinates =
    draftPolygon && draftPolygon.length >= 3
      ? draftPolygon
      : initialHub?.polygonCoordinates && initialHub.polygonCoordinates.length >= 3
      ? initialHub.polygonCoordinates
      : potentialHub?.polygonCoordinates;

  const isPolygonMode = Boolean(polygonCoordinates && polygonCoordinates.length >= 3);

  // Compute representative centroid if polygon or use direct point
  let defaultCoord: Coordinate = [76.779, 30.733];
  if (initialHub) {
    defaultCoord = initialHub.coordinate;
  } else if (pointCoord) {
    defaultCoord = pointCoord;
  } else if (polygonCoordinates && polygonCoordinates.length >= 3) {
    const avgLng = polygonCoordinates.reduce((s, p) => s + p[0], 0) / polygonCoordinates.length;
    const avgLat = polygonCoordinates.reduce((s, p) => s + p[1], 0) / polygonCoordinates.length;
    defaultCoord = [Number(avgLng.toFixed(6)), Number(avgLat.toFixed(6))];
  } else if (potentialHub?.coordinate) {
    defaultCoord = potentialHub.coordinate;
  }

  const defaultName =
    initialHub?.name ||
    potentialHub?.name ||
    (isPolygonMode ? 'Designated Safety Hub Ground' : 'Emergency Safety Hub Point');

  const defaultType: SafetyHubSiteType =
    initialHub?.siteType ||
    (potentialHub?.siteType && potentialHub.siteType !== 'Other Public Space'
      ? potentialHub.siteType
      : isPolygonMode
      ? 'General Emergency Hub'
      : 'General Emergency Hub');

  const [name, setName] = useState<string>(defaultName);
  const [siteType, setSiteType] = useState<SafetyHubSiteType>(defaultType);
  const [address, setAddress] = useState<string>(
    initialHub?.address ||
      potentialHub?.address ||
      `Sector ${Math.floor(10 + Math.random() * 60)}, Chandigarh`
  );
  const [description, setDescription] = useState<string>(
    initialHub?.description ||
      'Designated civil emergency relief center with verified ground perimeter and essential intake services.'
  );

  const [entranceCoordinate, setEntranceCoordinate] = useState<Coordinate | undefined>(
    entranceCoord || initialHub?.entranceCoordinate
  );

  const [totalCapacity, setTotalCapacity] = useState<number>(initialHub?.totalCapacity || 500);
  const [currentOccupancy, setCurrentOccupancy] = useState<number>(initialHub?.currentOccupancy || 0);
  const [manualStatus, setManualStatus] = useState<SafetyHubStatus>(initialHub?.status || 'OPEN');
  const [isVerified, setIsVerified] = useState<boolean>(
    initialHub ? initialHub.verificationStatus === 'VERIFIED' : true
  );

  // Capabilities state
  const [tentsEnabled, setTentsEnabled] = useState<boolean>(initialHub?.capabilities.tents.enabled ?? true);
  const [tentUnits, setTentUnits] = useState<number>(initialHub?.capabilities.tents.tentUnits ?? 20);
  const [peoplePerTent, setPeoplePerTent] = useState<number>(initialHub?.capabilities.tents.peoplePerTent ?? 10);

  const [foodEnabled, setFoodEnabled] = useState<boolean>(initialHub?.capabilities.foodDistribution.enabled ?? true);
  const [mealsPerCycle, setMealsPerCycle] = useState<number>(
    initialHub?.capabilities.foodDistribution.mealsPerCycle ?? 800
  );

  const [waterEnabled, setWaterEnabled] = useState<boolean>(initialHub?.capabilities.drinkingWater.enabled ?? true);
  const [waterAvailableLiters, setWaterAvailableLiters] = useState<number>(
    initialHub?.capabilities.drinkingWater.availableLiters ?? 3000
  );
  const [waterReqLiters, setWaterReqLiters] = useState<number>(
    initialHub?.capabilities.drinkingWater.requirementLiters ?? 1000
  );

  const [medicalEnabled, setMedicalEnabled] = useState<boolean>(
    initialHub?.capabilities.medicalFirstAid.enabled ?? true
  );
  const [medicalStaffCount, setMedicalStaffCount] = useState<number>(
    initialHub?.capabilities.medicalFirstAid.staffCount ?? 4
  );
  const [hasAmbulanceBay, setHasAmbulanceBay] = useState<boolean>(
    initialHub?.capabilities.medicalFirstAid.hasAmbulanceBay ?? true
  );

  const [sanitationEnabled, setSanitationEnabled] = useState<boolean>(
    initialHub?.capabilities.sanitationToilets.enabled ?? true
  );
  const [toiletUnits, setToiletUnits] = useState<number>(
    initialHub?.capabilities.sanitationToilets.toiletUnits ?? 16
  );

  const [powerEnabled, setPowerEnabled] = useState<boolean>(
    initialHub?.capabilities.powerCharging.enabled ?? true
  );
  const [generatorBackup, setGeneratorBackup] = useState<boolean>(
    initialHub?.capabilities.powerCharging.generatorBackup ?? true
  );

  const [regDeskEnabled, setRegDeskEnabled] = useState<boolean>(
    initialHub?.capabilities.registrationHelpDesk.enabled ?? true
  );
  const [specialNeedsEnabled, setSpecialNeedsEnabled] = useState<boolean>(
    initialHub?.capabilities.specialNeedsSupport.enabled ?? true
  );

  // Resources & Requirements lists
  const [resources, setResources] = useState<HubResource[]>(
    initialHub?.resources || [
      { id: 'RES-01', type: 'WATER', name: 'Potable Water Tankers', quantity: 3000, unit: 'Liters' },
      { id: 'RES-02', type: 'FOOD', name: 'Meal Rations', quantity: 800, unit: 'Meals' },
    ]
  );
  const [requirements, setRequirements] = useState<ResourceRequirement[]>(
    initialHub?.requirements || [
      { id: 'REQ-01', type: 'WATER', name: 'Water Tanker Refill', requiredQuantity: 1000, unit: 'Liters', priority: 'HIGH' },
    ]
  );

  const [selectedDisasters, setSelectedDisasters] = useState<string[]>(
    initialHub?.disasterSuitability || ['Flood', 'Earthquake', 'Storm']
  );

  const [activeConfigTab, setActiveConfigTab] = useState<'basics' | 'capabilities' | 'resources'>('basics');

  // Dynamic calculations
  const safeCapacity = Math.max(1, totalCapacity);
  const safeOccupancy = Math.max(0, Math.min(currentOccupancy, safeCapacity));
  const availableCapacity = Math.max(0, safeCapacity - safeOccupancy);
  const computedStatus = computeSafetyHubStatus(safeCapacity, safeOccupancy, manualStatus);
  const tentCapacity = tentUnits * peoplePerTent;

  const handleToggleDisaster = (type: string) => {
    setSelectedDisasters((prev) =>
      prev.includes(type) ? prev.filter((d) => d !== type) : [...prev, type]
    );
  };

  const handleAddResource = () => {
    const newRes: HubResource = {
      id: `RES-${Date.now().toString().slice(-4)}`,
      type: 'OTHER',
      name: 'Emergency Supply Item',
      quantity: 100,
      unit: 'Units',
      updatedAt: new Date().toISOString(),
    };
    setResources((prev) => [...prev, newRes]);
  };

  const handleRemoveResource = (id: string) => {
    setResources((prev) => prev.filter((r) => r.id !== id));
  };

  const handleAddRequirement = () => {
    const newReq: ResourceRequirement = {
      id: `REQ-${Date.now().toString().slice(-4)}`,
      type: 'OTHER',
      name: 'Urgent Logistics Need',
      requiredQuantity: 50,
      unit: 'Units',
      priority: 'HIGH',
      createdAt: new Date().toISOString(),
    };
    setRequirements((prev) => [...prev, newReq]);
  };

  const handleRemoveRequirement = (id: string) => {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (safeCapacity <= 0) return;
    if (safeOccupancy < 0 || safeOccupancy > safeCapacity) return;

    const hubId = initialHub?.id || generateNextHubId(existingHubs);
    const verificationStatus: VerificationStatus = isVerified ? 'VERIFIED' : 'UNVERIFIED';

    const savedHub: SafetyHub = {
      id: hubId,
      name: name.trim(),
      siteType,
      coordinate: defaultCoord,
      polygonCoordinates: polygonCoordinates && polygonCoordinates.length >= 3 ? [...polygonCoordinates] : undefined,
      entranceCoordinate: entranceCoordinate ? [...entranceCoordinate] : undefined,
      hubFormat: isPolygonMode ? 'POLYGON' : 'POINT',
      address: address.trim(),
      description: description.trim(),
      verificationStatus,
      isActive: true,
      status: computedStatus,
      totalCapacity: safeCapacity,
      currentOccupancy: safeOccupancy,
      availableCapacity,
      nearCapacityThresholdRatio: 0.15,
      capabilities: {
        tents: {
          enabled: tentsEnabled,
          tentUnits: tentsEnabled ? tentUnits : 0,
          peoplePerTent: tentsEnabled ? peoplePerTent : 0,
          tentCapacity: tentsEnabled ? tentCapacity : 0,
        },
        foodDistribution: {
          enabled: foodEnabled,
          mealsPerCycle: foodEnabled ? mealsPerCycle : 0,
          serviceStatus: foodEnabled ? 'ACTIVE' : 'DISABLED',
        },
        drinkingWater: {
          enabled: waterEnabled,
          availableLiters: waterEnabled ? waterAvailableLiters : 0,
          requirementLiters: waterReqLiters,
        },
        medicalFirstAid: {
          enabled: medicalEnabled,
          staffCount: medicalEnabled ? medicalStaffCount : 0,
          hasAmbulanceBay: medicalEnabled && hasAmbulanceBay,
        },
        sanitationToilets: {
          enabled: sanitationEnabled,
          toiletUnits: sanitationEnabled ? toiletUnits : 0,
        },
        powerCharging: {
          enabled: powerEnabled,
          generatorBackup: powerEnabled && generatorBackup,
        },
        registrationHelpDesk: {
          enabled: regDeskEnabled,
        },
        specialNeedsSupport: {
          enabled: specialNeedsEnabled,
        },
      },
      resources,
      requirements,
      disasterSuitability: selectedDisasters,
      createdAt: initialHub?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(savedHub);
  };

  return (
    <div className="modal-backdrop" id="modal-configure-safety-hub" onClick={onCancel}>
      <div className="modal-card wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge badge-hub-active">
              {initialHub ? 'EDIT SAFETY HUB' : 'NEW SAFETY HUB ACTIVATION'}
            </span>
            <h3 className="modal-title">{name || 'Configure Safety Hub'}</h3>
          </div>
          <button className="btn-modal-close" onClick={onCancel} title="Close (ESC)">
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        <div className="modal-nav-tabs">
          <button
            type="button"
            className={`modal-nav-tab ${activeConfigTab === 'basics' ? 'tab-active' : ''}`}
            onClick={() => setActiveConfigTab('basics')}
          >
            1. Site &amp; Capacity
          </button>
          <button
            type="button"
            className={`modal-nav-tab ${activeConfigTab === 'capabilities' ? 'tab-active' : ''}`}
            onClick={() => setActiveConfigTab('capabilities')}
          >
            2. Disaster Capabilities
          </button>
          <button
            type="button"
            className={`modal-nav-tab ${activeConfigTab === 'resources' ? 'tab-active' : ''}`}
            onClick={() => setActiveConfigTab('resources')}
          >
            3. Resources &amp; Shortages ({resources.length}/{requirements.length})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-body-scrollable">
            {/* TAB 1: Basics & Capacity */}
            {activeConfigTab === 'basics' && (
              <div className="tab-pane">
                {/* Format Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: isPolygonMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                    border: `1px solid ${isPolygonMode ? '#10b981' : '#3b82f6'}`,
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: isPolygonMode ? '#34d399' : '#60a5fa' }}>
                      {isPolygonMode ? <HubIconPolygon /> : <HubIconPoint />}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      Operational Geometry:{' '}
                      <strong style={{ color: isPolygonMode ? '#34d399' : '#60a5fa' }}>
                        {isPolygonMode
                          ? `Polygon Area (${polygonCoordinates!.length} vertices)`
                          : 'Point Marker'}
                      </strong>
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {defaultCoord[1].toFixed(5)}° N, {defaultCoord[0].toFixed(5)}° E
                  </span>
                </div>

                <div className="form-row-grid">
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Safety Hub Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Government Senior Secondary School, Sector 16"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Operational Hub Type</label>
                    <select
                      className="form-select"
                      value={siteType}
                      onChange={(e) => setSiteType(e.target.value as SafetyHubSiteType)}
                    >
                      {SITE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Representative Coordinate</label>
                    <input
                      type="text"
                      className="form-input form-input-readonly"
                      value={`${defaultCoord[1].toFixed(5)}° N, ${defaultCoord[0].toFixed(5)}° E`}
                      readOnly
                    />
                  </div>
                </div>

                {/* Road Entrance / Access Point Section */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.65)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#38bdf8' }}><HubIconEntrance /></span>
                      <strong style={{ fontSize: '13px', color: '#ffffff' }}>Evacuation Entrance / Road Access Point</strong>
                    </div>
                    {entranceCoordinate ? (
                      <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace' }}>
                        {entranceCoordinate[1].toFixed(5)}° N, {entranceCoordinate[0].toFixed(5)}° E
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Optional (Centroid used by default)</span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                    Set the exact road-access gate for evacuation vehicles and citizens. Routing will navigate directly to this entrance on an accessible road.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {onSetEntranceOnMap && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => {
                          onSetEntranceOnMap({
                            name,
                            siteType,
                            address,
                            description,
                            totalCapacity: safeCapacity,
                            currentOccupancy: safeOccupancy,
                            status: computedStatus,
                            verificationStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED',
                            polygonCoordinates: polygonCoordinates ? [...polygonCoordinates] : undefined,
                            coordinate: defaultCoord,
                          });
                        }}
                      >
                        {entranceCoordinate ? 'Change Entrance Point on Map' : 'Set Access / Entrance Point on Road'}
                      </button>
                    )}
                    {entranceCoordinate && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => {
                          setEntranceCoordinate(undefined);
                          if (onClearEntrance) onClearEntrance();
                        }}
                      >
                        Clear Entrance
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-row-grid">
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Address / Sector Area</label>
                    <input
                      type="text"
                      className="form-input"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Sector 16-D, Chandigarh"
                    />
                  </div>
                </div>

                {/* Capacity & Operational Status Card */}
                <div className="capacity-calc-card">
                  <div className="calc-header">
                    <span className="calc-title">SHELTER CAPACITY &amp; INTAKE STATUS</span>
                    <span className={`status-pill pill-${computedStatus.toLowerCase()}`}>
                      STATUS: {computedStatus}
                    </span>
                  </div>

                  <div className="capacity-inputs-row">
                    <div className="cap-input-group">
                      <label>Total Capacity (people)</label>
                      <input
                        type="number"
                        min="1"
                        max="20000"
                        className="form-input num-input"
                        value={totalCapacity}
                        onChange={(e) => setTotalCapacity(Number(e.target.value))}
                        required
                      />
                    </div>

                    <div className="cap-input-group">
                      <label>Current Occupancy</label>
                      <input
                        type="number"
                        min="0"
                        max={totalCapacity}
                        className="form-input num-input"
                        value={currentOccupancy}
                        onChange={(e) => setCurrentOccupancy(Number(e.target.value))}
                        required
                      />
                    </div>

                    <div className="cap-input-group">
                      <label>Available Capacity</label>
                      <div className="available-display-box">
                        <strong className={availableCapacity > 0 ? 'text-ok' : 'text-danger'}>
                          {availableCapacity}
                        </strong>
                        <span>spaces remaining</span>
                      </div>
                    </div>
                  </div>

                  <div className="capacity-bar-container">
                    <div
                      className={`capacity-bar-fill fill-${computedStatus.toLowerCase()}`}
                      style={{
                        width: `${Math.min(100, Math.round((safeOccupancy / safeCapacity) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="capacity-bar-labels">
                    <span>0</span>
                    <span>
                      {safeOccupancy} / {safeCapacity} occupied (
                      {Math.round((safeOccupancy / safeCapacity) * 100)}%)
                    </span>
                    <span>{safeCapacity} max</span>
                  </div>

                  <div className="manual-status-row">
                    <label className="manual-status-label">Manual Status Override:</label>
                    <div className="status-radio-group">
                      <label className="radio-pill">
                        <input
                          type="radio"
                          name="hubStatus"
                          checked={manualStatus !== 'CLOSED'}
                          onChange={() => setManualStatus('OPEN')}
                        />
                        <span>Auto / Active Intake</span>
                      </label>
                      <label className="radio-pill">
                        <input
                          type="radio"
                          name="hubStatus"
                          checked={manualStatus === 'CLOSED'}
                          onChange={() => setManualStatus('CLOSED')}
                        />
                        <span className="text-danger">Manually Closed</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="checkbox-control">
                    <input
                      type="checkbox"
                      checked={isVerified}
                      onChange={(e) => setIsVerified(e.target.checked)}
                    />
                    <span className="checkbox-text">
                      <strong>Coordinator Verified Ground Facility</strong> (Required for citizen routing eligibility)
                    </span>
                  </label>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Operational Notes / Facility Description:</label>
                  <textarea
                    rows={2}
                    className="form-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter staging details, entrance gates, contact info..."
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Capabilities */}
            {activeConfigTab === 'capabilities' && (
              <div className="tab-pane">
                <div className="capabilities-grid">
                  {/* Tents Capability */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={tentsEnabled}
                          onChange={(e) => setTentsEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#3b82f6' }}><HubIconTent /></span>
                          Temporary Tents / Shelter
                        </span>
                      </label>
                    </div>
                    {tentsEnabled && (
                      <div className="cap-details-grid">
                        <div className="form-group">
                          <label className="field-sublabel">Tent Units:</label>
                          <input
                            type="number"
                            min="1"
                            max="500"
                            className="form-input form-input-sm"
                            value={tentUnits}
                            onChange={(e) => setTentUnits(Number(e.target.value))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="field-sublabel">People / Tent:</label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            className="form-input form-input-sm"
                            value={peoplePerTent}
                            onChange={(e) => setPeoplePerTent(Number(e.target.value))}
                          />
                        </div>
                        <div className="tent-cap-summary">
                          Tent Capacity: <strong>{tentCapacity}</strong> people (site infrastructure)
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Food Distribution */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={foodEnabled}
                          onChange={(e) => setFoodEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#f59e0b' }}><HubIconFood /></span>
                          Food &amp; Community Kitchen
                        </span>
                      </label>
                    </div>
                    {foodEnabled && (
                      <div className="cap-details-grid">
                        <div className="form-group">
                          <label className="field-sublabel">Meals / Service Cycle:</label>
                          <input
                            type="number"
                            min="50"
                            max="10000"
                            className="form-input form-input-sm"
                            value={mealsPerCycle}
                            onChange={(e) => setMealsPerCycle(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Drinking Water */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={waterEnabled}
                          onChange={(e) => setWaterEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#06b6d4' }}><HubIconWater /></span>
                          Drinking Water Supply
                        </span>
                      </label>
                    </div>
                    {waterEnabled && (
                      <div className="cap-details-grid">
                        <div className="form-group">
                          <label className="field-sublabel">Available (Liters):</label>
                          <input
                            type="number"
                            min="100"
                            max="50000"
                            className="form-input form-input-sm"
                            value={waterAvailableLiters}
                            onChange={(e) => setWaterAvailableLiters(Number(e.target.value))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="field-sublabel">Required Refill (L):</label>
                          <input
                            type="number"
                            min="0"
                            max="50000"
                            className="form-input form-input-sm"
                            value={waterReqLiters}
                            onChange={(e) => setWaterReqLiters(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Medical / First Aid */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={medicalEnabled}
                          onChange={(e) => setMedicalEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#ef4444' }}><HubIconMedical /></span>
                          Medical &amp; First Aid Triage
                        </span>
                      </label>
                    </div>
                    {medicalEnabled && (
                      <div className="cap-details-grid">
                        <div className="form-group">
                          <label className="field-sublabel">Staff / Volunteers:</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            className="form-input form-input-sm"
                            value={medicalStaffCount}
                            onChange={(e) => setMedicalStaffCount(Number(e.target.value))}
                          />
                        </div>
                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '14px' }}>
                          <label className="checkbox-control">
                            <input
                              type="checkbox"
                              checked={hasAmbulanceBay}
                              onChange={(e) => setHasAmbulanceBay(e.target.checked)}
                            />
                            <span className="checkbox-text" style={{ fontSize: '11px' }}>Ambulance Staging Bay</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sanitation / Toilets */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={sanitationEnabled}
                          onChange={(e) => setSanitationEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#8b5cf6' }}><HubIconSanitation /></span>
                          Sanitation &amp; Mobile Toilets
                        </span>
                      </label>
                    </div>
                    {sanitationEnabled && (
                      <div className="cap-details-grid">
                        <div className="form-group">
                          <label className="field-sublabel">Toilet Units:</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            className="form-input form-input-sm"
                            value={toiletUnits}
                            onChange={(e) => setToiletUnits(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Power & Charging */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={powerEnabled}
                          onChange={(e) => setPowerEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#eab308' }}><HubIconPower /></span>
                          Power &amp; Mobile Charging
                        </span>
                      </label>
                    </div>
                    {powerEnabled && (
                      <div className="cap-details-grid">
                        <label className="checkbox-control" style={{ marginTop: '6px' }}>
                          <input
                            type="checkbox"
                            checked={generatorBackup}
                            onChange={(e) => setGeneratorBackup(e.target.checked)}
                          />
                          <span className="checkbox-text" style={{ fontSize: '11px' }}>Diesel Generator Backup Active</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Registration / Help Desk */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={regDeskEnabled}
                          onChange={(e) => setRegDeskEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#10b981' }}><HubIconRegistration /></span>
                          Registration &amp; Help Desk
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Special Needs Support */}
                  <div className="capability-card">
                    <div className="cap-header">
                      <label className="checkbox-control">
                        <input
                          type="checkbox"
                          checked={specialNeedsEnabled}
                          onChange={(e) => setSpecialNeedsEnabled(e.target.checked)}
                        />
                        <span className="cap-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#ec4899' }}><HubIconSpecialNeeds /></span>
                          Special Needs &amp; Elderly Support
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Disaster Suitability Tags */}
                <div className="disaster-tags-section" style={{ marginTop: '16px' }}>
                  <label className="form-label">Disaster Suitability:</label>
                  <div className="disaster-chips-row">
                    {DISASTER_TYPES.map((dtype) => {
                      const isSelected = selectedDisasters.includes(dtype);
                      return (
                        <button
                          key={dtype}
                          type="button"
                          className={`disaster-chip ${isSelected ? 'chip-selected' : ''}`}
                          onClick={() => handleToggleDisaster(dtype)}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {dtype}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Resources vs Requirements */}
            {activeConfigTab === 'resources' && (
              <div className="tab-pane">
                <div className="res-req-grid">
                  {/* Available Resources Box */}
                  <div className="res-req-box">
                    <div className="box-header">
                      <span className="box-title">AVAILABLE RESOURCES ({resources.length})</span>
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={handleAddResource}>
                        + Add Resource
                      </button>
                    </div>
                    <div className="res-list">
                      {resources.length === 0 ? (
                        <div className="text-secondary" style={{ fontSize: '11px', padding: '12px' }}>
                          No specific resources logged yet.
                        </div>
                      ) : (
                        resources.map((res) => (
                          <div key={res.id} className="res-item-row">
                            <div className="res-fields">
                              <input
                                type="text"
                                className="form-input form-input-sm"
                                value={res.name}
                                onChange={(e) => {
                                  const updated = resources.map((r) =>
                                    r.id === res.id ? { ...r, name: e.target.value } : r
                                  );
                                  setResources(updated);
                                }}
                                placeholder="Resource name"
                              />
                              <input
                                type="number"
                                className="form-input form-input-sm num-input"
                                value={res.quantity}
                                onChange={(e) => {
                                  const updated = resources.map((r) =>
                                    r.id === res.id ? { ...r, quantity: Number(e.target.value) } : r
                                  );
                                  setResources(updated);
                                }}
                              />
                              <input
                                type="text"
                                className="form-input form-input-sm unit-input"
                                value={res.unit}
                                onChange={(e) => {
                                  const updated = resources.map((r) =>
                                    r.id === res.id ? { ...r, unit: e.target.value } : r
                                  );
                                  setResources(updated);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn-item-delete"
                              onClick={() => handleRemoveResource(res.id)}
                              title="Delete Resource"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Resource Requirements / Shortages Box */}
                  <div className="res-req-box">
                    <div className="box-header">
                      <span className="box-title text-warn">OPERATIONAL SHORTAGES &amp; NEEDS ({requirements.length})</span>
                      <button type="button" className="btn btn-sm btn-outline-warn" onClick={handleAddRequirement}>
                        + Add Requirement
                      </button>
                    </div>
                    <div className="res-list">
                      {requirements.length === 0 ? (
                        <div className="text-secondary" style={{ fontSize: '11px', padding: '12px' }}>
                          No outstanding resource requirements reported.
                        </div>
                      ) : (
                        requirements.map((req) => (
                          <div key={req.id} className="res-item-row">
                            <div className="res-fields">
                              <input
                                type="text"
                                className="form-input form-input-sm"
                                value={req.name}
                                onChange={(e) => {
                                  const updated = requirements.map((r) =>
                                    r.id === req.id ? { ...r, name: e.target.value } : r
                                  );
                                  setRequirements(updated);
                                }}
                                placeholder="Requirement name"
                              />
                              <input
                                type="number"
                                className="form-input form-input-sm num-input"
                                value={req.requiredQuantity}
                                onChange={(e) => {
                                  const updated = requirements.map((r) =>
                                    r.id === req.id ? { ...r, requiredQuantity: Number(e.target.value) } : r
                                  );
                                  setRequirements(updated);
                                }}
                              />
                              <input
                                type="text"
                                className="form-input form-input-sm unit-input"
                                value={req.unit}
                                onChange={(e) => {
                                  const updated = requirements.map((r) =>
                                    r.id === req.id ? { ...r, unit: e.target.value } : r
                                  );
                                  setRequirements(updated);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn-item-delete"
                              onClick={() => handleRemoveRequirement(req.id)}
                              title="Delete Requirement"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} id="btn-cancel-safety-hub">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-action-glow" id="btn-save-safety-hub">
              Confirm Safety Hub
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
