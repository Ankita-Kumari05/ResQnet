import React, { useState } from 'react'
import {
  prepareAndQueueSmsAlert,
  acquireDeviceGpsLocation,
  generateAlertUid,
  type AlertLocationData,
  type PreparedSmsResult,
} from '../lib/smsService'
import { isCoordinatorSmsConfigured, getCoordinatorSmsNumber } from '../config/smsConfig'
import toast from 'react-hot-toast'

interface SmsFallbackModalProps {
  isOpen: boolean
  onClose: () => void
  category: string
  severity: string
  description: string
  currentLat: number | null
  currentLng: number | null
  existingAlertUid?: string
  onSmsPrepared?: (alertUid: string) => void
}

export const SmsFallbackModal: React.FC<SmsFallbackModalProps> = ({
  isOpen,
  onClose,
  category,
  severity,
  description,
  currentLat,
  currentLng,
  existingAlertUid,
  onSmsPrepared,
}) => {
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [manualLandmark, setManualLandmark] = useState('')
  const [peopleCount, setPeopleCount] = useState<string>('1')
  const [preparedResult, setPreparedResult] = useState<PreparedSmsResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [useManualLocationOnly, setUseManualLocationOnly] = useState(false)
  const [cachedAlertUid] = useState<string>(existingAlertUid || generateAlertUid())

  if (!isOpen) return null

  const isConfigured = isCoordinatorSmsConfigured()
  const recipientNumber = isConfigured ? getCoordinatorSmsNumber() : 'NOT_CONFIGURED'

  const handlePrepareAndLaunchSms = async () => {
    if (!isConfigured) {
      toast.error('Coordinator SMS recipient number is missing or not configured in environment/settings.')
      return
    }

    setLoading(true)
    setStatusText('Acquiring high-accuracy GPS coordinates...')
    setGpsError(null)

    let locationData: AlertLocationData = {
      lat: null,
      lng: null,
      accuracyMeters: null,
      timestamp: null,
      landmark: manualLandmark.trim() || undefined,
    }

    if (!useManualLocationOnly) {
      try {
        const { coords, error } = await acquireDeviceGpsLocation(5000)
        if (coords.lat !== null && coords.lng !== null) {
          locationData = {
            ...coords,
            landmark: manualLandmark.trim() || undefined,
          }
        } else if (currentLat !== null && currentLng !== null) {
          // Fallback to last known position from dashboard state
          locationData = {
            lat: Number(currentLat.toFixed(5)),
            lng: Number(currentLng.toFixed(5)),
            accuracyMeters: null,
            timestamp: new Date().toISOString(),
            isLastKnown: true,
            landmark: manualLandmark.trim() || undefined,
          }
          if (error) setGpsError(`${error} Using last-known dashboard coordinates.`)
        } else {
          if (error) setGpsError(error)
        }
      } catch (err: any) {
        setGpsError('GPS acquisition failed. Proceeding with landmark or UNKNOWN location.')
      }
    } else {
      locationData.landmark = manualLandmark.trim() || 'Manual position'
    }

    setStatusText('Formatting compact RESQ1 message & saving to offline queue...')

    try {
      const prepared = await prepareAndQueueSmsAlert({
        alertUid: cachedAlertUid,
        category,
        severity,
        description,
        peopleAffected: peopleCount || '1',
        location: locationData,
      })

      setPreparedResult(prepared)
      onSmsPrepared?.(prepared.alertUid)

      // If mobile device, automatically attempt to trigger native SMS application
      if (prepared.isMobileDevice) {
        setStatusText('Launching device SMS app...')
        window.location.href = prepared.smsUri
        toast.success('SMS Composer opened! Please review and tap Send.')
      } else {
        toast('Ready for review & copy on desktop.', { icon: '📋' })
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to prepare SMS alert')
    } finally {
      setLoading(false)
      setStatusText('')
    }
  }

  const handleCopyMessage = async () => {
    if (!preparedResult) return
    try {
      await navigator.clipboard.writeText(preparedResult.rawMessage)
      setCopied(true)
      toast.success('SMS content copied to clipboard!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Could not copy automatically. Please select and copy manually.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">sms</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                Emergency Alert via SMS Fallback
              </h3>
              <p className="text-[11px] text-slate-400">
                Cellular protocol when internet or data network is unavailable
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
          {/* Status banner */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-600 text-[18px] shrink-0 mt-0.5">
              signal_cellular_alt
            </span>
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold">Important Notice: </span>
              SMS alerts operate over cellular standard messaging (GSM/LTE voice/SMS carriers). Opening the SMS
              app does <strong>NOT</strong> automatically transmit or guarantee delivery — you must review and
              tap <strong>Send</strong> in your device's messaging app.
            </div>
          </div>

          {!isConfigured && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0 mt-0.5">
                error
              </span>
              <div>
                <p className="font-bold text-xs">Coordinator Number Unconfigured</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  The ResQnet emergency recipient phone number is missing in the configuration. Please contact your
                  system administrator or coordinator.
                </p>
              </div>
            </div>
          )}

          {/* Form details preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-medium">Alert UID:</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {cachedAlertUid}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-medium">Recipient EOC Desk:</span>
              <span className="font-mono font-bold text-blue-700">{recipientNumber}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-500 font-medium">Category / Severity:</span>
              <span className="font-bold text-slate-800">
                {category} • <span className="text-red-600">{severity}</span>
              </span>
            </div>
          </div>

          {/* Additional GPS & Manual Landmark inputs */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Estimated People Affected
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={peopleCount}
                onChange={e => setPeopleCount(e.target.value)}
                placeholder="Number of persons trapped or affected"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Landmark or Cross-Street (Recommended if GPS is poor)
              </label>
              <input
                type="text"
                value={manualLandmark}
                onChange={e => setManualLandmark(e.target.value)}
                placeholder="e.g. Near Sector 17 Post Office, 2nd floor"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skipGps"
                checked={useManualLocationOnly}
                onChange={e => setUseManualLocationOnly(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              <label htmlFor="skipGps" className="text-[11px] text-slate-600 cursor-pointer select-none">
                Do not wait for GPS fix (rely on landmark / manual location)
              </label>
            </div>

            {gpsError && (
              <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-[11px]">
                {gpsError}
              </div>
            )}
          </div>

          {/* Prepared Result / Desktop Fallback Preview */}
          {preparedResult && (
            <div className="mt-3 p-3.5 bg-slate-900 text-white rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Formatted SMS Ready (RESQ1)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {preparedResult.rawMessage.length} chars
                </span>
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] break-all select-all text-slate-200">
                {preparedResult.rawMessage}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'Copied!' : 'Copy SMS Text'}</span>
                </button>
                <a
                  href={preparedResult.smsUri}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <span className="material-symbols-outlined text-[15px]">send</span>
                  <span>Open SMS App</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handlePrepareAndLaunchSms}
            disabled={loading || !isConfigured}
            className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>{statusText || 'Preparing SMS...'}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">sms</span>
                <span>{preparedResult ? 'Regenerate SMS' : 'Send Alert via SMS'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
