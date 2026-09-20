export type UserRole = 'CITIZEN' | 'COORDINATOR' | 'RESPONDER' | 'SIH_DEMO';

export interface CitizenProfile {
  id: string;
  name: string;
  phone: string;
  emergencyContact: string;
}

export const DEFAULT_CITIZEN_PROFILE: CitizenProfile = {
  id: 'CIT-CHANDIGARH-09',
  name: 'Gurpreet Singh',
  phone: '+91 98765-43210',
  emergencyContact: '+91 98123-45678 (Family)',
};
