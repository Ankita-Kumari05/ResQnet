import type { Incident } from '../types/incident';

export const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'INC-2026-001',
    citizenId: 'CIT-KHARAR-44',
    citizenName: 'Simran Kaur',
    citizenPhone: '+91 98761-12345',
    location: {
      coordinate: [76.6430, 30.7440], // Near Kharar Bus Stand
      accuracyMeters: 8,
      landmark: 'Near Kharar Flyover / Bus Stand Junction',
      address: 'NH-5 Highway, Kharar, Punjab',
    },
    type: 'FLOOD_RESCUE',
    severity: 'HIGH',
    status: 'OPEN',
    source: 'CITIZEN_SOS',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    notes: 'Water level rising above 3 feet near service lane. 2 family members trapped in vehicle.',
  },
  {
    id: 'INC-2026-002',
    citizenId: 'CIT-SEC43-18',
    citizenName: 'Aman Sharma',
    citizenPhone: '+91 98140-54321',
    location: {
      coordinate: [76.7450, 30.7180], // Sector 43 ISBT, Chandigarh
      accuracyMeters: 5,
      landmark: 'Sector 43 Bus Terminus Exit Gate 2',
      address: 'Sector 43, Chandigarh',
    },
    type: 'MEDICAL_EMERGENCY',
    severity: 'CRITICAL',
    status: 'OPEN',
    source: 'CITIZEN_SOS',
    createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    notes: 'Elderly passenger collapsed with chest pain near terminal ticket counter.',
  },
];
