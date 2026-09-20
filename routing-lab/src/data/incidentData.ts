import type { Incident } from '../types/incident';

export const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'INC-001',
    citizenId: 'CIT-01',
    citizenName: 'Aarav Sharma',
    citizenPhone: '+91 98765-01001',
    location: {
      coordinate: [76.7750, 30.7350], // Sector 17, Chandigarh
      accuracyMeters: 5,
      landmark: 'Near Sector 17 Plaza Fountain & Bank Square',
      address: 'Sector 17-C, Chandigarh',
    },
    type: 'FLOOD_RESCUE',
    severity: 'CRITICAL',
    status: 'OPEN',
    source: 'CITIZEN_SOS',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    notes: 'Severe stormwater inundation. Water level approaching 3.5 feet. Trapped with elderly person.',
  },
  {
    id: 'INC-002',
    citizenId: 'CIT-02',
    citizenName: 'Simran Kaur',
    citizenPhone: '+91 98765-02002',
    location: {
      coordinate: [76.7150, 30.7050], // Phase 7, Mohali
      accuracyMeters: 8,
      landmark: 'Phase 7 Market Main Road',
      address: 'Phase 7, SAS Nagar Mohali',
    },
    type: 'EVACUATION_ASSISTANCE',
    severity: 'MODERATE',
    status: 'RESOLVED',
    source: 'CITIZEN_SOS',
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    notes: 'Citizen evacuated safely to Phase 9 shelter. Mission completed.',
    assignedResponderId: 'R03',
    assignedResponderName: 'Evacuation Squad Charlie',
    assignedMissionId: 'MIS-2026-003',
    resolvedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'INC-003',
    citizenId: 'CIT-03',
    citizenName: 'Gurpreet Singh',
    citizenPhone: '+91 98765-03003',
    location: {
      coordinate: [76.6430, 30.7440], // Kharar NH-5
      accuracyMeters: 10,
      landmark: 'Kharar Flyover Service Lane / Junction',
      address: 'NH-5 Highway Corridor, Kharar, Punjab',
    },
    type: 'STRUCTURAL_COLLAPSE',
    severity: 'HIGH',
    status: 'ACKNOWLEDGED',
    source: 'COORDINATOR_ENTRY',
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    notes: 'Highway culvert wall collapse and electrical wire hazard. Area cordoned off; requires NDRF rescue unit.',
  },
];
