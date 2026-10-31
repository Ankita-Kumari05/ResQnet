/**
 * ResQnet SMS Emergency Fallback Service
 *
 * Implements compact, versioned SMS formatting, GPS location extraction with accuracy metadata,
 * native SMS composer URI generation (Android & iOS compliant), desktop clipboard fallback,
 * and integration with IndexedDB offline queue.
 */
import { getCoordinatorSmsNumber, isCoordinatorSmsConfigured } from '../config/smsConfig'
import { db } from './db'

export interface AlertLocationData {
  lat: number | null
  lng: number | null
  accuracyMeters: number | null
  timestamp: string | null
  isLastKnown?: boolean
  landmark?: string
}

export interface SmsAlertPayload {
  alertUid: string
  category: string
  severity: string
  description: string
  peopleAffected?: number | string
  location: AlertLocationData
}

export interface PreparedSmsResult {
  alertUid: string
  recipientNumber: string
  rawMessage: string
  smsUri: string
  isMobileDevice: boolean
}

/**
 * Checks if the backend API is truly reachable, beyond navigator.onLine.
 */
export async function checkBackendReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false
  }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    const res = await fetch('/api/v1/health', {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Acquires the current high-accuracy GPS coordinates using browser Geolocation API.
 * Never invents coordinates; returns nulls if permission is denied or device lacks fix.
 */
export async function acquireDeviceGpsLocation(timeoutMs = 6000): Promise<{
  coords: AlertLocationData
  error?: string
}> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      coords: { lat: null, lng: null, accuracyMeters: null, timestamp: null },
      error: 'Geolocation is not supported by your browser or device.',
    }
  }

  return new Promise(resolve => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve({
          coords: { lat: null, lng: null, accuracyMeters: null, timestamp: null },
          error: 'GPS acquisition timed out. Satellite fix was not received.',
        })
      }
    }, timeoutMs)

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve({
          coords: {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            accuracyMeters: Math.round(pos.coords.accuracy),
            timestamp: new Date(pos.timestamp).toISOString(),
            isLastKnown: false,
          },
        })
      },
      err => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        let msg = 'Unable to acquire current location.'
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. You can still send the alert with manual landmark or UNKNOWN location.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location signals currently unavailable (e.g., inside dense basement or no GNSS coverage).'
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out waiting for GNSS response.'
        }
        resolve({
          coords: { lat: null, lng: null, accuracyMeters: null, timestamp: null },
          error: msg,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    )
  })
}

/**
 * Generates a clean, compact Alert UID: e.g. "RQN" + timestamp slice + 3 hex chars.
 */
export function generateAlertUid(): string {
  const timeHex = Date.now().toString(36).toUpperCase().slice(-5)
  const randomHex = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `RQN-${timeHex}-${randomHex}`
}

/**
 * Sanitizes input string to prevent delimiter collision (escapes or replaces pipe '|').
 */
function sanitizeField(value: string | undefined | null, defaultValue = 'NA'): string {
  if (!value) return defaultValue
  return value
    .replace(/[|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || defaultValue
}

/**
 * Builds the compact, versioned SMS emergency alert string according to specification:
 * RESQ1|ALERT_UID|ALERT_TYPE|LAT|LON|ACCURACY|PEOPLE_AFFECTED|DESCRIPTION|TIMESTAMP
 */
export function formatCompactSms(payload: SmsAlertPayload): string {
  const version = 'RESQ1'
  const uid = sanitizeField(payload.alertUid, 'RQN-ALERT')
  
  // Format Alert Type / Category
  const alertType = sanitizeField(
    `${payload.severity.toUpperCase()}_${payload.category.toUpperCase().replace(/\s+/g, '_')}`
  )

  // Coordinates formatting
  let latStr = 'UNKNOWN'
  let lonStr = 'UNKNOWN'
  let accuracyStr = 'NA'

  if (payload.location.lat !== null && payload.location.lng !== null) {
    latStr = payload.location.lat.toString()
    lonStr = payload.location.lng.toString()
    accuracyStr = payload.location.accuracyMeters !== null ? `${payload.location.accuracyMeters}m` : 'NA'
  }

  // People affected
  const people = payload.peopleAffected !== undefined && payload.peopleAffected !== ''
    ? String(payload.peopleAffected).replace(/[|]/g, '')
    : 'NA'

  // Description & landmark notes
  let desc = payload.description || ''
  if (payload.location.landmark) {
    desc = `[Near: ${payload.location.landmark}] ${desc}`
  }
  if (payload.location.isLastKnown && payload.location.timestamp) {
    desc = `[LastKnown ${payload.location.timestamp.substring(11, 16)}Z] ${desc}`
  }
  const descStr = sanitizeField(desc, 'EMERGENCY_ALERT')

  // Timestamp format YYYYMMDDTHHMM
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const hour = String(now.getUTCHours()).padStart(2, '0')
  const min = String(now.getUTCMinutes()).padStart(2, '0')
  const timestampStr = `${year}${month}${day}T${hour}${min}`

  return `${version}|${uid}|${alertType}|${latStr}|${lonStr}|${accuracyStr}|${people}|${descStr}|${timestampStr}`
}

/**
 * Detects whether the current client is a mobile device (Android, iOS).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
}

/**
 * Detects whether the device is running iOS.
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

/**
 * Constructs an RFC-compliant sms: URI handling platform variations:
 * - iOS: sms:RECIPIENT&body=ENCODED_MESSAGE
 * - Android / RFC 5724: sms:RECIPIENT?body=ENCODED_MESSAGE
 */
export function buildSmsUri(recipient: string, message: string): string {
  const cleanedRecipient = recipient.replace(/[\s-]/g, '')
  const encodedBody = encodeURIComponent(message)
  
  // iOS Safari historically requires '&body=' delimiter
  const delimiter = isIosDevice() ? '&body=' : '?body='
  return `sms:${cleanedRecipient}${delimiter}${encodedBody}`
}

/**
 * Prepares the complete SMS, stores the alert locally in Dexie IndexedDB (reusing the same Alert UID/operation_id),
 * and returns the URI and message.
 */
export async function prepareAndQueueSmsAlert(payload: SmsAlertPayload): Promise<PreparedSmsResult> {
  if (!isCoordinatorSmsConfigured()) {
    throw new Error('Coordinator SMS receiving number is not configured in settings.')
  }

  const recipientNumber = getCoordinatorSmsNumber()
  const rawMessage = formatCompactSms(payload)
  const smsUri = buildSmsUri(recipientNumber, rawMessage)

  // Save to Dexie IndexedDB with operation_id matching the alert UID
  // so that when network returns, duplicate detection prevents double-processing!
  const mappedLat = payload.location.lat ?? 30.7333
  const mappedLng = payload.location.lng ?? 76.7794

  const offlineReportData = {
    operation_id: payload.alertUid,
    category: payload.category.toLowerCase().includes('fire')
      ? 'fire'
      : payload.category.toLowerCase().includes('medical')
      ? 'injury'
      : payload.category.toLowerCase().includes('flood')
      ? 'flood'
      : payload.category.toLowerCase().includes('collapse')
      ? 'road_block'
      : 'other',
    description: `[SMS_FALLBACK][${payload.severity.toUpperCase()}] ${payload.description || 'Emergency alert via SMS'} (Raw: ${rawMessage})`,
    lat: mappedLat,
    lng: mappedLng,
    client_timestamp: new Date().toISOString(),
    status: 'pending' as const,
    retry_count: 0,
    synced: false,
  }

  try {
    // Check if an existing report with this operation_id exists
    const existing = await db.local_reports.where('operation_id').equals(payload.alertUid).first()
    if (!existing) {
      await db.local_reports.add(offlineReportData)
    }
  } catch (err) {
    console.warn('[smsService] Could not cache to local IndexedDB:', err)
  }

  return {
    alertUid: payload.alertUid,
    recipientNumber,
    rawMessage,
    smsUri,
    isMobileDevice: isMobileDevice(),
  }
}
