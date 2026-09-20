import type { Responder } from '../types/responder';

export const INITIAL_RESPONDERS: Responder[] = [
  {
    id: 'RESP-NDRF-01',
    name: 'NDRF 7th Battalion Unit A',
    unitCode: 'NDRF-ALPHA',
    organization: 'National Disaster Response Force',
    type: 'NDRF_RESCUE',
    contactNumber: '+91 94170-11223',
    status: 'AVAILABLE',
    currentGpsPosition: [76.8055, 30.7250], // Sector 26 Transport Area, Chandigarh
    stationName: 'Sector 26 Disaster Relief Base',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'RESP-SDRF-02',
    name: 'Punjab SDRF Quick Response Team 3',
    unitCode: 'SDRF-MOHALI-QRT',
    organization: 'State Disaster Response Force Punjab',
    type: 'SDRF_QUICK_RESPONSE',
    contactNumber: '+91 98150-22334',
    status: 'AVAILABLE',
    currentGpsPosition: [76.7150, 30.7046], // Phase 7, SAS Nagar Mohali
    stationName: 'Mohali Emergency Command Post',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'RESP-MED-03',
    name: 'PGIMER Advanced Trauma Ambulance 12',
    unitCode: 'AMB-PGI-12',
    organization: 'PGIMER Emergency Services',
    type: 'PARAMEDIC_AMBULANCE',
    contactNumber: '+91 97800-33445',
    status: 'AVAILABLE',
    currentGpsPosition: [76.7760, 30.7650], // Sector 12 PGIMER, Chandigarh
    stationName: 'PGI Trauma Hub',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'RESP-CIVIL-04',
    name: 'Kharar Civil Rescue Squad 2',
    unitCode: 'CIVIL-KHARAR-02',
    organization: 'District Administration SAS Nagar',
    type: 'CIVIL_DEFENSE',
    contactNumber: '+91 98720-44556',
    status: 'AVAILABLE',
    currentGpsPosition: [76.6450, 30.7480], // NH-5 Sunny Enclave, Kharar
    stationName: 'Kharar Sub-Divisional Rescue Post',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
  {
    id: 'RESP-FIRE-05',
    name: 'Panchkula Sector 5 Emergency Fire Tender',
    unitCode: 'FIRE-PKL-05',
    organization: 'Haryana Fire & Emergency Services',
    type: 'FIRE_RESCUE',
    contactNumber: '+91 94630-55667',
    status: 'AVAILABLE',
    currentGpsPosition: [76.8520, 30.6980], // Sector 5, Panchkula
    stationName: 'Panchkula Central Fire Station',
    lastGpsUpdate: new Date().toISOString(),
    activeWorkload: 0,
  },
];
