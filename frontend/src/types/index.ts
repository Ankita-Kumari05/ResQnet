// ResQnet TypeScript type definitions — mirrors backend Pydantic schemas

export type UserRole = 'citizen' | 'responder' | 'coordinator' | 'fundraiser' | 'admin'
export type ResponderStatus = 'available' | 'deployed' | 'on_mission' | 'offline'
export type ReportStatus = 'unverified' | 'verified' | 'rejected'
export type RoadStatus = 'clear' | 'hazardous' | 'flooded' | 'blocked'
export type HubStatus = 'open' | 'near_capacity' | 'full' | 'closed'
export type MissionType = 'verify_incident' | 'survey_road' | 'deliver_resource' | 'rescue'
export type MissionStatus = 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'
export type CampaignStatus = 'active' | 'fulfilled' | 'closed'
export type ResourceType = 'food' | 'water' | 'medical' | 'shelter_kit'

export interface User {
  id: number
  email: string
  full_name: string
  role: UserRole
  ngo_name?: string
  responder_status?: ResponderStatus
  verification_status?: string
}

export interface ResponderProfile {
  id: number
  user_id: number
  full_name: string
  ngo_name?: string
  status: ResponderStatus
}

export interface Intersection {
  id: number
  name: string
  lat: number
  lng: number
  is_hub: boolean
  hub_id?: number
}

export interface Road {
  id: number
  name: string
  from_intersection_id: number
  to_intersection_id: number
  distance_km: number
  hazard_penalty: number
  flood_penalty: number
  congestion_penalty: number
  is_blocked: boolean
  is_bidirectional: boolean
  status: RoadStatus
  confidence_score: number
  last_verified_at?: string
}

export type HazardSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface HazardZone {
  id: number
  name: string
  hazard_type: string
  severity: HazardSeverity
  is_active: boolean
  last_verified_survey_id?: number
  geometry?: Record<string, unknown>
  geom?: Record<string, unknown>
}

export interface SafetyHub {
  id: number
  name: string
  address?: string
  lat: number
  lng: number
  max_capacity: number
  current_occupancy: number
  available_capacity: number
  status: HubStatus
  food_units: number
  water_units: number
  medical_units: number
  food_critical: boolean
  water_critical: boolean
  medical_critical: boolean
  capacity_critical: boolean
  updated_at?: string
}

export interface IncidentReport {
  id: number
  category: string
  description?: string
  lat: number
  lng: number
  status: ReportStatus
  photo_url?: string
  cluster_id?: number
  created_at: string
  submitted_offline: boolean
}

export type ReportClusterStatus = 'open' | 'mission_assigned' | 'verified' | 'resolved' | 'dismissed'

export interface ReportCluster {
  id: number
  centroid_lat: number
  centroid_lng: number
  report_count: number
  priority_score: number
  dominant_category?: string
  status: ReportClusterStatus
  created_at: string
}

export interface Mission {
  id: number
  mission_type: MissionType
  status: MissionStatus
  title: string
  description?: string
  priority_score?: number
  responder_id?: number
  assignee_id?: number
  cluster_id?: number
  road_id?: number
  hub_id?: number
  target_lat?: number
  target_lng?: number
  created_at: string
  accepted_at?: string
  completed_at?: string
  notes?: string
}

export interface RouteStep {
  road_id: number
  road_name: string
  from_node: number
  to_node: number
  from_name: string
  to_name: string
  distance_km: number
  hazard_penalty: number
  flood_penalty: number
  congestion_penalty: number
  edge_cost: number
  is_blocked: boolean
}

export interface RouteResponse {
  success: boolean
  message: string
  from_intersection_id?: number
  target_hub_id?: number
  target_hub_name?: string
  total_cost: number
  total_distance_km: number
  waypoints: Array<{ id: number; name: string; lat: number; lng: number }>
  steps: RouteStep[]
  cost_explanation: string
}

export interface Campaign {
  id: number
  title: string
  description?: string
  status: CampaignStatus
  hub_id?: number
  resource_type?: ResourceType
  target_amount: number
  raised_amount: number
  share_slug?: string
  progress_percent: number
  created_at: string
}

export interface Donation {
  id: number
  campaign_id: number
  donor_name?: string
  amount: number
  message?: string
  created_at: string
}

export type AlertSeverity = 'ADVISORY' | 'WARNING' | 'EMERGENCY'

export interface EmergencyAlert {
  id: number
  title: string
  message: string
  severity: AlertSeverity

  alert_type: string
  affected_area_geojson?: Record<string, unknown>
  is_active: boolean
  issued_by_id?: number
  created_at: string
  expires_at?: string
  is_fresh?: boolean
  is_expired?: boolean
  is_offline_cached?: boolean
  cached_at?: string
}

export type VerificationOutcome = 'confirmed_hazard' | 'road_blocked' | 'no_hazard_found' | 'false_report'

