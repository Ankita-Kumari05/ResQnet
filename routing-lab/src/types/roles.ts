import type { Coordinate } from './routing';

export type UserRole = 'CITIZEN' | 'COORDINATOR' | 'RESPONDER';

export interface CitizenProfile {
  id: string;
  name: string;
  phone: string;
  emergencyContact: string;
  address?: string;
  coordinate?: Coordinate;
}

export interface CoordinatorProfile {
  id: string;
  name: string;
  role: string;
  jurisdiction: string;
  station: string;
  contact: string;
}

export const INITIAL_CITIZENS: CitizenProfile[] = [
  {
    id: 'CIT-01',
    name: 'Aarav Sharma',
    phone: '+91 98765-01001',
    emergencyContact: '+91 98111-22334 (Brother)',
    address: 'Sector 17-C, Chandigarh',
    coordinate: [76.7750, 30.7350],
  },
  {
    id: 'CIT-02',
    name: 'Simran Kaur',
    phone: '+91 98765-02002',
    emergencyContact: '+91 98222-33445 (Parent)',
    address: 'Phase 7, SAS Nagar Mohali',
    coordinate: [76.7150, 30.7050],
  },
  {
    id: 'CIT-03',
    name: 'Gurpreet Singh',
    phone: '+91 98765-03003',
    emergencyContact: '+91 98333-44556 (Spouse)',
    address: 'Sector 20, Panchkula',
    coordinate: [76.8606, 30.6942],
  },
];

export const DEFAULT_CITIZEN_PROFILE: CitizenProfile = INITIAL_CITIZENS[0];

export const INITIAL_COORDINATOR: CoordinatorProfile = {
  id: 'CO-01',
  name: 'State Disaster Operations Command',
  role: 'Chief Dispatch Commander',
  jurisdiction: 'Chandigarh – Mohali – Kharar – Zirakpur – Panchkula',
  station: 'Tri-City Central Disaster Operations Center, Chandigarh',
  contact: '+91 172-2740000',
};
