// Dexie.js IndexedDB store for offline-first functionality — Step 6.14 Policy Reconciled
import Dexie, { type Table } from 'dexie'

export interface LocalReport {
  id?: number
  operation_id: string
  category: string
  description?: string
  lat: number
  lng: number
  photo_url?: string
  client_timestamp: string
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
  retry_count: number
  last_error?: string
  synced: boolean
}

export interface LocalSurvey {
  id?: number
  operation_id: string
  mission_id?: number
  road_id?: number
  cluster_id?: number
  road_status?: string
  hazard_penalty: number
  flood_penalty: number
  congestion_penalty: number
  is_blocked: boolean
  hazard_level?: number
  verification_outcome?: 'confirmed_hazard' | 'road_blocked' | 'no_hazard_found' | 'false_report'
  notes?: string
  client_timestamp: string
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
  retry_count: number
  last_error?: string
  synced: boolean
}

export interface CachedHubs {
  id: number
  data: string // JSON stringified hub array
  cached_at: string
}

export interface CachedRoads {
  id: number
  data: string
  cached_at: string
}

export interface CachedRoute {
  id: number
  from_lat: number
  from_lng: number
  data: string
  cached_at: string
}

export interface CachedAlerts {
  id: number
  data: string // JSON stringified EmergencyAlert array
  cached_at: string
}

class ResQnetDB extends Dexie {
  local_reports!: Table<LocalReport>
  local_surveys!: Table<LocalSurvey>
  cached_hubs!: Table<CachedHubs>
  cached_roads!: Table<CachedRoads>
  cached_routes!: Table<CachedRoute>
  cached_alerts!: Table<CachedAlerts>

  constructor() {
    super('ResQnetDB')
    this.version(1).stores({
      local_reports: '++id, synced, client_timestamp',
      local_surveys: '++id, synced, client_timestamp',
      cached_hubs: 'id',
      cached_roads: 'id',
      cached_routes: '++id, from_lat, from_lng',
      cached_alerts: 'id',
    })

    this.version(2).stores({
      local_reports: '++id, operation_id, status, synced, client_timestamp',
      local_surveys: '++id, operation_id, status, synced, client_timestamp',
      cached_hubs: 'id',
      cached_roads: 'id',
      cached_routes: '++id, from_lat, from_lng',
      cached_alerts: 'id',
    }).upgrade(tx => {
      return tx.table('local_reports').toCollection().modify(report => {
        if (!report.operation_id) report.operation_id = crypto.randomUUID()
        if (!report.status) report.status = report.synced ? 'synced' : 'pending'
        if (report.retry_count === undefined) report.retry_count = 0
      }).then(() => {
        return tx.table('local_surveys').toCollection().modify(survey => {
          if (!survey.operation_id) survey.operation_id = crypto.randomUUID()
          if (!survey.status) survey.status = survey.synced ? 'synced' : 'pending'
          if (survey.retry_count === undefined) survey.retry_count = 0
        })
      })
    })
  }
}

export const db = new ResQnetDB()

// ─── Helper Functions ───────────────────────────────────────────────────────

export async function saveReportOffline(report: Omit<LocalReport, 'id' | 'operation_id' | 'status' | 'retry_count' | 'synced'>) {
  const operation_id = crypto.randomUUID()
  await db.local_reports.add({
    ...report,
    operation_id,
    status: 'pending',
    retry_count: 0,
    synced: false,
  })
}

export async function saveSurveyOffline(survey: Omit<LocalSurvey, 'id' | 'operation_id' | 'status' | 'retry_count' | 'synced'>) {
  const operation_id = crypto.randomUUID()
  await db.local_surveys.add({
    ...survey,
    operation_id,
    status: 'pending',
    retry_count: 0,
    synced: false,
  })
}

export async function getPendingOpsCount(): Promise<number> {
  const reports = await db.local_reports.where('status').equals('pending').count()
  const surveys = await db.local_surveys.where('status').equals('pending').count()
  return reports + surveys
}

export async function cacheHubs(hubs: unknown[]) {
  await db.cached_hubs.put({ id: 1, data: JSON.stringify(hubs), cached_at: new Date().toISOString() })
}

export async function getCachedHubs() {
  const record = await db.cached_hubs.get(1)
  return record ? JSON.parse(record.data) : []
}

export async function cacheRoads(roads: unknown[]) {
  await db.cached_roads.put({ id: 1, data: JSON.stringify(roads), cached_at: new Date().toISOString() })
}

export async function getCachedRoads() {
  const record = await db.cached_roads.get(1)
  return record ? JSON.parse(record.data) : []
}

export async function cacheAlerts(alerts: unknown[]) {
  await db.cached_alerts.put({ id: 1, data: JSON.stringify(alerts), cached_at: new Date().toISOString() })
}

export async function getCachedAlerts() {
  const record = await db.cached_alerts.get(1)
  return record ? { alerts: JSON.parse(record.data), cached_at: record.cached_at } : null
}
