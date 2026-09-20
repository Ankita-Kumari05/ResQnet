/**
 * ResQnet Backend Routing Service
 * Connects directly to the disaster-aware Dijkstra engine on PostGIS (/api/routing/safe-route and /api/routing/calculate).
 */
import api from '../../../lib/api';
import type { RouteResponse } from '../../../types';

export interface SafeRouteParams {
  from_lat: number;
  from_lng: number;
  target_hub_id?: number;
  to_lat?: number;
  to_lng?: number;
  reverse?: boolean;
}

export interface GraphSummaryResponse {
  nodes: Array<{
    id: number;
    name: string;
    lat: number;
    lng: number;
    is_hub: boolean;
    hub_id?: number;
  }>;
  edges: Array<{
    from_node: number;
    to_node: number;
    road_id: number;
    road_name: string;
    distance_km: number;
    cost: number;
    hazard_penalty: number;
    flood_penalty: number;
    congestion_penalty: number;
    spatial_hazard_penalty: number;
  }>;
  hubs: Array<{
    id: number;
    name: string;
    status: string;
    max_capacity: number;
    current_occupancy: number;
    available_capacity: number;
  }>;
  active_hazard_count: number;
  total_nodes: number;
  total_edges: number;
}

/**
 * Calculates a disaster-aware safe route using Dijkstra's algorithm on the PostGIS road graph.
 * Automatically accounts for blocked roads, active hazard perimeters, and safety hub capacity.
 */
export async function calculateSafeRoute(params: SafeRouteParams): Promise<RouteResponse> {
  const res = await api.post<RouteResponse>('/routing/safe-route', params);
  return res.data;
}

/**
 * Fetches the road graph summary including nodes, edges, and capacities.
 */
export async function getRoadGraphSummary(): Promise<GraphSummaryResponse> {
  const res = await api.get<GraphSummaryResponse>('/routing/graph');
  return res.data;
}
