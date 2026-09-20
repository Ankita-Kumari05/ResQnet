import type { Responder } from '../types/responder';

export const INITIAL_RESPONDERS: Responder[] = [
  {
    id: 'R01',
    name: 'Quick Response Unit Alpha',
    unitCode: 'QRU-ALPHA-01',
    organization: 'National Disaster Response Force (NDRF)',
    type: 'NDRF_RESCUE',
    contactNumber: '+91 94170-11223',
    status: 'AVAILABLE',
    currentGpsPosition: [76.8055, 30.7250], // Sector 26 Transport Area, Chandigarh
    stationName: 'Sector 26 Disaster Operations Base, Chandigarh',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'R02',
    name: 'Medical Rescue Bravo',
    unitCode: 'MED-BRAVO-02',
    organization: 'PGIMER Emergency Paramedic Services',
    type: 'PARAMEDIC_AMBULANCE',
    contactNumber: '+91 97800-33445',
    status: 'AVAILABLE',
    currentGpsPosition: [76.7760, 30.7650], // Sector 12 PGIMER, Chandigarh
    stationName: 'PGIMER Trauma & Critical Care Base, Chandigarh',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'R03',
    name: 'Evacuation Squad Charlie',
    unitCode: 'EVAC-CHARLIE-03',
    organization: 'State Disaster Response Force Punjab',
    type: 'SDRF_QUICK_RESPONSE',
    contactNumber: '+91 98150-22334',
    status: 'BUSY',
    currentGpsPosition: [76.7150, 30.7046], // Phase 7, SAS Nagar Mohali
    stationName: 'Mohali Emergency Command Post, Mohali',
    lastGpsUpdate: new Date().toISOString(),
    activeMissionId: 'MIS-2026-003',
    activeWorkload: 1,
  },
  {
    id: 'R04',
    name: 'NDRF Support Delta',
    unitCode: 'SUPP-DELTA-04',
    organization: 'District Civil Defense Administration',
    type: 'CIVIL_DEFENSE',
    contactNumber: '+91 98720-44556',
    status: 'OFFLINE',
    currentGpsPosition: [76.8520, 30.6980], // Sector 5, Panchkula
    stationName: 'Panchkula Civil Reserve Station, Panchkula',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
];
