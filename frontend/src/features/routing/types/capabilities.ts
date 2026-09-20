// Centralized Role Normalization & Capability Model for ResQnet Map Engine
// Defines clean RBAC boundaries between Citizen, Coordinator, and Responder roles.

import type { UserRole } from '../../../types';

export type MapRole = 'citizen' | 'coordinator' | 'responder';

export interface RoleCapabilities {
  // Navigation & Location
  canUseGps: boolean;
  canPlanManualAB: boolean;
  canLiveNavigate: boolean;
  canSimulateGpsProgress: boolean;

  // Safety Hubs
  canViewSafetyHubs: boolean;
  canRouteToSafetyHubEntrance: boolean;
  canManageSafetyHubs: boolean;
  canAddOperationalAreas: boolean;

  // Hazards & Danger Zones
  canViewHazards: boolean;
  canDrawHazardPolygons: boolean;
  canManageDangerZones: boolean;

  // Road Network & Closures
  canViewBlockedRoads: boolean;
  canBlockRoads: boolean;
  canAdjustRoadSectionHandles: boolean;

  // Tactical Operations & SOS
  canSendSos: boolean;
  canViewResponders: boolean;
  canViewTriageClusters: boolean;
  canDispatchMissions: boolean;
  canNavigateAssignedMission: boolean;
}

/**
 * Normalizes any backend UserRole into one of the 3 canonical MapRoles.
 * Defaults to 'citizen' for safe fallback.
 */
export function normalizeMapRole(rawRole?: string | UserRole | null): MapRole {
  if (!rawRole) return 'citizen';
  const r = String(rawRole).toLowerCase().trim();

  if (r === 'coordinator' || r === 'admin') {
    return 'coordinator';
  }
  if (r === 'responder') {
    return 'responder';
  }
  return 'citizen';
}

/**
 * Returns the exact capability matrix for the resolved map role.
 */
export function getRoleCapabilities(role: MapRole): RoleCapabilities {
  switch (role) {
    case 'coordinator':
      return {
        canUseGps: true,
        canPlanManualAB: true,
        canLiveNavigate: false, // Coordinator uses route preview and operational analysis
        canSimulateGpsProgress: false,

        canViewSafetyHubs: true,
        canRouteToSafetyHubEntrance: true,
        canManageSafetyHubs: true,
        canAddOperationalAreas: true,

        canViewHazards: true,
        canDrawHazardPolygons: true,
        canManageDangerZones: true,

        canViewBlockedRoads: true,
        canBlockRoads: true,
        canAdjustRoadSectionHandles: true,

        canSendSos: false,
        canViewResponders: true,
        canViewTriageClusters: true,
        canDispatchMissions: true,
        canNavigateAssignedMission: false,
      };

    case 'responder':
      return {
        canUseGps: true,
        canPlanManualAB: true,
        canLiveNavigate: true,
        canSimulateGpsProgress: true,

        canViewSafetyHubs: true,
        canRouteToSafetyHubEntrance: true,
        canManageSafetyHubs: false,
        canAddOperationalAreas: false,

        canViewHazards: true,
        canDrawHazardPolygons: false,
        canManageDangerZones: false,

        canViewBlockedRoads: true,
        canBlockRoads: false,
        canAdjustRoadSectionHandles: false,

        canSendSos: false,
        canViewResponders: false,
        canViewTriageClusters: false,
        canDispatchMissions: false,
        canNavigateAssignedMission: true,
      };

    case 'citizen':
    default:
      return {
        canUseGps: true,
        canPlanManualAB: true,
        canLiveNavigate: true,
        canSimulateGpsProgress: false,

        canViewSafetyHubs: true,
        canRouteToSafetyHubEntrance: true,
        canManageSafetyHubs: false,
        canAddOperationalAreas: false,

        canViewHazards: true,
        canDrawHazardPolygons: false,
        canManageDangerZones: false,

        canViewBlockedRoads: true,
        canBlockRoads: false,
        canAdjustRoadSectionHandles: false,

        canSendSos: true,
        canViewResponders: false,
        canViewTriageClusters: false,
        canDispatchMissions: false,
        canNavigateAssignedMission: false,
      };
  }
}
