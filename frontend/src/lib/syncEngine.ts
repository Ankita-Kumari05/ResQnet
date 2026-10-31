// Sync Engine for ResQnet Step 6.14
// Manages batch synchronization of IndexedDB local queues with server /api/v1/sync/replay
import { db, type LocalReport, type LocalSurvey } from './db'

const BATCH_SIZE = 50
const API_BASE = '/api/v1'

export interface SyncEngineResult {
  totalProcessed: number
  acceptedCount: number
  conflictCount: number
  rejectedCount: number
  authError: boolean
}

export async function flushSyncQueue(token: string | null): Promise<SyncEngineResult> {
  const result: SyncEngineResult = {
    totalProcessed: 0,
    acceptedCount: 0,
    conflictCount: 0,
    rejectedCount: 0,
    authError: false,
  }

  if (!token) {
    // Auth token missing — DO NOT delete or mark local items as failed!
    // Retain offline queue for when auth is restored.
    result.authError = true
    return result
  }

  // Fetch pending reports and surveys
  const pendingReports = await db.local_reports.where('status').equals('pending').limit(BATCH_SIZE).toArray()
  const pendingSurveys = await db.local_surveys.where('status').equals('pending').limit(BATCH_SIZE - pendingReports.length).toArray()

  if (pendingReports.length === 0 && pendingSurveys.length === 0) {
    return result
  }

  // Mark status as 'syncing' locally
  const reportIds = pendingReports.map(r => r.id!).filter(Boolean)
  const surveyIds = pendingSurveys.map(s => s.id!).filter(Boolean)
  
  await db.local_reports.where('id').anyOf(reportIds).modify({ status: 'syncing' })
  await db.local_surveys.where('id').anyOf(surveyIds).modify({ status: 'syncing' })

  // Construct batch operations
  const operations: Array<{
    operation_id: string
    operation_type: string
    client_timestamp: string
    payload: Record<string, unknown>
  }> = []

  const opIdToLocalMap = new Map<string, { type: 'report' | 'survey'; localId: number }>()

  for (const r of pendingReports) {
    operations.push({
      operation_id: r.operation_id,
      operation_type: 'submit_report',
      client_timestamp: r.client_timestamp,
      payload: {
        category: r.category,
        description: r.description,
        lat: r.lat,
        lng: r.lng,
        photo_url: r.photo_url,
      },
    })
    if (r.id) opIdToLocalMap.set(r.operation_id, { type: 'report', localId: r.id })
  }

  for (const s of pendingSurveys) {
    operations.push({
      operation_id: s.operation_id,
      operation_type: 'field_survey',
      client_timestamp: s.client_timestamp,
      payload: {
        mission_id: s.mission_id,
        road_id: s.road_id,
        cluster_id: s.cluster_id,
        road_status: s.road_status,
        hazard_penalty: s.hazard_penalty,
        flood_penalty: s.flood_penalty,
        congestion_penalty: s.congestion_penalty,
        is_blocked: s.is_blocked,
        hazard_level: s.hazard_level,
        verification_outcome: s.verification_outcome,
        notes: s.notes,
      },
    })
    if (s.id) opIdToLocalMap.set(s.operation_id, { type: 'survey', localId: s.id })
  }

  let clientId = localStorage.getItem('resqnet_client_id')
  if (!clientId) {
    clientId = crypto.randomUUID()
    localStorage.setItem('resqnet_client_id', clientId)
  }

  try {
    const response = await fetch(`${API_BASE}/sync/replay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        operations,
      }),
    })

    if (response.status === 401) {
      // Token expired/unauthenticated — revert syncing status to pending, retain data
      await db.local_reports.where('id').anyOf(reportIds).modify({ status: 'pending' })
      await db.local_surveys.where('id').anyOf(surveyIds).modify({ status: 'pending' })
      result.authError = true
      return result
    }

    if (!response.ok) {
      // 5xx Server Error or non-401 error — handle transient retry
      await handleTransientFailure(pendingReports, pendingSurveys)
      return result
    }

    const data = await response.json()
    result.totalProcessed = data.total || 0
    result.acceptedCount = data.accepted || 0
    result.conflictCount = data.conflicts || 0
    result.rejectedCount = data.rejected || 0

    // Process per-operation outcomes
    for (const item of (data.results || [])) {
      const local = opIdToLocalMap.get(item.operation_id)
      if (!local) continue

      if (item.status === 'accepted') {
        if (local.type === 'report') {
          await db.local_reports.update(local.localId, { status: 'synced', synced: true })
        } else {
          await db.local_surveys.update(local.localId, { status: 'synced', synced: true })
        }
      } else if (item.status === 'conflict') {
        if (local.type === 'report') {
          await db.local_reports.update(local.localId, { status: 'conflict', last_error: item.conflict_notes || 'Server conflict' })
        } else {
          await db.local_surveys.update(local.localId, { status: 'conflict', last_error: item.conflict_notes || 'Server conflict' })
        }
      } else {
        // rejected
        if (local.type === 'report') {
          await db.local_reports.update(local.localId, { status: 'failed', last_error: item.conflict_notes || 'Server rejected operation' })
        } else {
          await db.local_surveys.update(local.localId, { status: 'failed', last_error: item.conflict_notes || 'Server rejected operation' })
        }
      }
    }

    return result
  } catch (error) {
    // Network failure (FetchException) -> handle transient retry
    await handleTransientFailure(pendingReports, pendingSurveys)
    return result
  }
}

async function handleTransientFailure(reports: LocalReport[], surveys: LocalSurvey[]) {
  for (const r of reports) {
    if (!r.id) continue
    const newRetry = (r.retry_count || 0) + 1
    if (newRetry >= 5) {
      await db.local_reports.update(r.id, { status: 'failed', retry_count: newRetry, last_error: 'Max retries reached' })
    } else {
      await db.local_reports.update(r.id, { status: 'pending', retry_count: newRetry })
    }
  }

  for (const s of surveys) {
    if (!s.id) continue
    const newRetry = (s.retry_count || 0) + 1
    if (newRetry >= 5) {
      await db.local_surveys.update(s.id, { status: 'failed', retry_count: newRetry, last_error: 'Max retries reached' })
    } else {
      await db.local_surveys.update(s.id, { status: 'pending', retry_count: newRetry })
    }
  }
}
