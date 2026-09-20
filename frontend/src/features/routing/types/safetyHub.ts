import type { Coordinate } from './routing';

export type SafetyHubSiteType =
  | 'Government School'
  | 'Government College'
  | 'University / Campus'
  | 'Community Centre'
  | 'Sports Complex'
  | 'Stadium'
  | 'Government Facility'
  | 'Public Building'
  | 'Open Ground'
  | 'General Emergency Hub'
  | 'Relief / Camp Hub'
  | 'Medical Support Hub'
  | 'Food Distribution Hub'
  | 'Evacuation Assembly Hub'
  | 'Community Relief Hub'
  | 'Other Public Space';

export type SafetyHubStatus = 'OPEN' | 'NEAR_CAPACITY' | 'FULL' | 'CLOSED';

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED';

export interface TentCapability {
  enabled: boolean;
  tentUnits: number;
  peoplePerTent: number;
  tentCapacity: number; // tentUnits * peoplePerTent
}

export interface FoodCapability {
  enabled: boolean;
  mealsPerCycle: number;
  serviceStatus?: string;
}

export interface WaterCapability {
  enabled: boolean;
  availableLiters: number;
  requirementLiters: number;
}

export interface MedicalCapability {
  enabled: boolean;
  staffCount: number;
  hasAmbulanceBay?: boolean;
}

export interface SanitationCapability {
  enabled: boolean;
  toiletUnits: number;
}

export interface SafetyHubCapabilities {
  tents: TentCapability;
  foodDistribution: FoodCapability;
  drinkingWater: WaterCapability;
  medicalFirstAid: MedicalCapability;
  sanitationToilets: SanitationCapability;
  powerCharging: { enabled: boolean; generatorBackup?: boolean };
  registrationHelpDesk: { enabled: boolean };
  specialNeedsSupport: { enabled: boolean };
}

export interface HubResource {
  id: string;
  type: 'WATER' | 'FOOD' | 'MEDICAL' | 'BEDDING' | 'POWER' | 'SANITATION' | 'OTHER';
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  updatedAt?: string;
}

export interface ResourceRequirement {
  id: string;
  type: 'WATER' | 'FOOD' | 'MEDICAL' | 'BEDDING' | 'POWER' | 'SANITATION' | 'OTHER';
  name: string;
  requiredQuantity: number;
  unit: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notes?: string;
  createdAt?: string;
}

export interface SafetyHub {
  id: string;
  name: string;
  siteType: SafetyHubSiteType;
  coordinate: Coordinate;
  polygonCoordinates?: Coordinate[];
  entranceCoordinate?: Coordinate;
  hubFormat?: 'POINT' | 'POLYGON';
  address?: string;
  description?: string;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  status: SafetyHubStatus;
  totalCapacity: number;
  currentOccupancy: number;
  availableCapacity: number;
  nearCapacityThresholdRatio?: number; // e.g. 0.15 (15% capacity remaining)
  capabilities: SafetyHubCapabilities;
  resources: HubResource[];
  requirements: ResourceRequirement[];
  disasterSuitability?: string[];
  mapFeatureSource?: string;
  mapSourceLayer?: string;
  createdAt: string;
  updatedAt: string;
}

export type OperationalAreaType =
  | 'RELIEF_TENT'
  | 'MEDICAL_FIRST_AID'
  | 'FOOD_DISTRIBUTION'
  | 'WATER_POINT'
  | 'SANITATION'
  | 'REGISTRATION_DESK'
  | 'GENERAL_SHELTER'
  | 'COMMAND_COORDINATION';

export type OperationalAreaFormat = 'POINT' | 'POLYGON';

export type OperationalAreaStatus = 'ACTIVE' | 'INACTIVE' | 'FULL' | 'CLOSED';

export interface OperationalArea {
  id: string;
  hubId: string;
  hubName: string;
  name: string;
  type: OperationalAreaType;
  format: OperationalAreaFormat;
  coordinate: Coordinate;
  polygonCoordinates?: Coordinate[];
  status: OperationalAreaStatus;
  capacity?: number;
  occupancy?: number;
  description?: string;
  resourceCategory?: 'WATER' | 'FOOD' | 'MEDICAL' | 'BEDDING' | 'POWER' | 'SANITATION' | 'OTHER';
  resourceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalAreaTypeMeta {
  type: OperationalAreaType;
  label: string;
  description: string;
  defaultFormat: OperationalAreaFormat;
  color: string;
  resourceCategory: 'WATER' | 'FOOD' | 'MEDICAL' | 'BEDDING' | 'POWER' | 'SANITATION' | 'OTHER';
}

export const OPERATIONAL_AREA_TYPE_METAS: Record<OperationalAreaType, OperationalAreaTypeMeta> = {
  RELIEF_TENT: {
    type: 'RELIEF_TENT',
    label: 'Relief / Tent Area',
    description: 'Temporary modular living tents & emergency sleeping shelter.',
    defaultFormat: 'POLYGON',
    color: '#3b82f6',
    resourceCategory: 'BEDDING',
  },
  MEDICAL_FIRST_AID: {
    type: 'MEDICAL_FIRST_AID',
    label: 'Medical / First Aid Area',
    description: 'Emergency triage clinic, first aid supply point & paramedic station.',
    defaultFormat: 'POINT',
    color: '#ef4444',
    resourceCategory: 'MEDICAL',
  },
  FOOD_DISTRIBUTION: {
    type: 'FOOD_DISTRIBUTION',
    label: 'Food Distribution Area',
    description: 'Community kitchen, hot meal distribution & dry ration kits.',
    defaultFormat: 'POINT',
    color: '#f59e0b',
    resourceCategory: 'FOOD',
  },
  WATER_POINT: {
    type: 'WATER_POINT',
    label: 'Water Distribution Point',
    description: 'Potable water tankers, purified dispensing taps & filtration units.',
    defaultFormat: 'POINT',
    color: '#06b6d4',
    resourceCategory: 'WATER',
  },
  SANITATION: {
    type: 'SANITATION',
    label: 'Sanitation Area',
    description: 'Mobile chemical toilets, hygiene facilities & waste disposal.',
    defaultFormat: 'POINT',
    color: '#8b5cf6',
    resourceCategory: 'SANITATION',
  },
  REGISTRATION_DESK: {
    type: 'REGISTRATION_DESK',
    label: 'Registration / Help Desk',
    description: 'Citizen intake, missing person desk & dispatch registration.',
    defaultFormat: 'POINT',
    color: '#10b981',
    resourceCategory: 'OTHER',
  },
  GENERAL_SHELTER: {
    type: 'GENERAL_SHELTER',
    label: 'General Evacuation / Shelter Area',
    description: 'Reinforced indoor community hall for mass civil shelter.',
    defaultFormat: 'POLYGON',
    color: '#ec4899',
    resourceCategory: 'BEDDING',
  },
  COMMAND_COORDINATION: {
    type: 'COMMAND_COORDINATION',
    label: 'Command / Coordination Area',
    description: 'On-site incident commander desk, radio relays & operational command.',
    defaultFormat: 'POINT',
    color: '#6366f1',
    resourceCategory: 'POWER',
  },
};

export const ALL_OPERATIONAL_AREA_TYPES: OperationalAreaType[] = [
  'RELIEF_TENT',
  'MEDICAL_FIRST_AID',
  'FOOD_DISTRIBUTION',
  'WATER_POINT',
  'SANITATION',
  'REGISTRATION_DESK',
  'GENERAL_SHELTER',
  'COMMAND_COORDINATION',
];

export interface PotentialSafetyHub {
  name: string;
  siteType: SafetyHubSiteType;
  coordinate: Coordinate;
  polygonCoordinates?: Coordinate[];
  address?: string;
  sourceLayer?: string;
  osmType?: string;
  properties?: Record<string, unknown>;
  isIdentifiedFromMap?: boolean;
}

export interface SafetyHubEligibility {
  hubId: string;
  hubName: string;
  isEligible: boolean;
  isVerified: boolean;
  isActive: boolean;
  status: SafetyHubStatus;
  availableCapacity: number;
  rejectionReason?: string;
}

/**
 * Calculates dynamic hub status based on manual override or capacity numbers.
 */
export function computeSafetyHubStatus(
  totalCapacity: number,
  currentOccupancy: number,
  manualStatus?: SafetyHubStatus,
  nearCapacityThresholdRatio = 0.15
): SafetyHubStatus {
  if (manualStatus === 'CLOSED') {
    return 'CLOSED';
  }

  const safeCapacity = Math.max(1, totalCapacity);
  const safeOccupancy = Math.max(0, Math.min(currentOccupancy, safeCapacity));
  const available = safeCapacity - safeOccupancy;

  if (available <= 0 || safeOccupancy >= safeCapacity) {
    return 'FULL';
  }

  const thresholdSpaces = Math.max(15, Math.round(safeCapacity * nearCapacityThresholdRatio));
  if (available <= thresholdSpaces) {
    return 'NEAR_CAPACITY';
  }

  return 'OPEN';
}

/**
 * Validates whether a Safety Hub is currently eligible as a citizen routing destination.
 */
export function checkSafetyHubEligibility(hub: SafetyHub): SafetyHubEligibility {
  const isVerified = hub.verificationStatus === 'VERIFIED';
  const isActive = hub.isActive !== false;
  const status = hub.status;
  const available = hub.availableCapacity;

  if (!isVerified) {
    return {
      hubId: hub.id,
      hubName: hub.name,
      isEligible: false,
      isVerified: false,
      isActive,
      status,
      availableCapacity: available,
      rejectionReason: 'Hub is UNVERIFIED. Coordinator verification required.',
    };
  }

  if (!isActive) {
    return {
      hubId: hub.id,
      hubName: hub.name,
      isEligible: false,
      isVerified: true,
      isActive: false,
      status,
      availableCapacity: available,
      rejectionReason: 'Hub is inactive.',
    };
  }

  if (status === 'CLOSED') {
    return {
      hubId: hub.id,
      hubName: hub.name,
      isEligible: false,
      isVerified: true,
      isActive: true,
      status: 'CLOSED',
      availableCapacity: available,
      rejectionReason: 'Hub is manually CLOSED for intake.',
    };
  }

  if (status === 'FULL' || available <= 0) {
    return {
      hubId: hub.id,
      hubName: hub.name,
      isEligible: false,
      isVerified: true,
      isActive: true,
      status: 'FULL',
      availableCapacity: 0,
      rejectionReason: 'Hub has reached FULL capacity (0 available spaces).',
    };
  }

  return {
    hubId: hub.id,
    hubName: hub.name,
    isEligible: true,
    isVerified: true,
    isActive: true,
    status,
    availableCapacity: available,
  };
}
