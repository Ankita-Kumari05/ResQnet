import type { Mission } from '../types/mission';

export const INITIAL_MISSIONS: Mission[] = [
  {
    id: 'MIS-2026-001',
    incidentId: 'INC-001',
    responderId: 'R01',
    responderName: 'Quick Response Unit Alpha',
    responderUnit: 'QRU-ALPHA-01',
    citizenName: 'Aarav Sharma',
    citizenPhone: '+91 98765-01001',
    priority: 'URGENT',
    status: 'EN_ROUTE',
    startLocation: [76.8055, 30.7250], // Sector 26 Base
    destination: [76.7750, 30.7350], // Sector 17 SOS
    notes: 'Primary flood extraction mission. Approaching Sector 17 flooded zone with rescue raft.',
    assignedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    acceptedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    enRouteAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'MIS-2026-003',
    incidentId: 'INC-002',
    responderId: 'R03',
    responderName: 'Evacuation Squad Charlie',
    responderUnit: 'EVAC-CHARLIE-03',
    citizenName: 'Simran Kaur',
    citizenPhone: '+91 98765-02002',
    priority: 'STANDARD',
    status: 'RESOLVED',
    startLocation: [76.7150, 30.7046],
    destination: [76.7150, 30.7050],
    notes: 'Citizen relocated safely to community shelter.',
    assignedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    acceptedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    enRouteAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
];
