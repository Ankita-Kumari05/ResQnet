import React, { useState } from 'react'
import type { EmergencyAlert, RouteResponse } from '../types'
import { Navigation, WifiOff, X, PhoneCall, CheckCircle, Loader2 } from 'lucide-react'

import api from '../lib/api'
import { saveReportOffline, db } from '../lib/db'
import toast from 'react-hot-toast'

interface EmergencyModeModalProps {
  alert: EmergencyAlert | null
  isOnline: boolean
  isOfflineCached?: boolean
  cachedAt?: string
  myLat: number | null
  myLng: number | null
  setPendingOps: (count: number) => void
  onClose: () => void
}

export const EmergencyModeModal: React.FC<EmergencyModeModalProps> = ({
  alert,
  isOnline,
  isOfflineCached = false,
  cachedAt,
  myLat,
  myLng,
  setPendingOps,
  onClose,
}) => {
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [submittingSos, setSubmittingSos] = useState(false)
  const [sosSent, setSosSent] = useState(false)

  if (!alert) return null

  const calculateEvacuationRoute = async () => {
    if (!myLat || !myLng) {
      toast.error('Location unavailable. Please enable GPS location.')
      return
    }
    if (!isOnline) {
      toast.error('Live route calculation requires internet connection. Showing cached hub guidance.')
      return
    }

    setLoadingRoute(true)
    try {
      const res = await api.post('/routing/calculate', { from_lat: myLat, from_lng: myLng })
      setRoute(res.data)
      if (res.data.success) {
        toast.success(`Evacuation route to ${res.data.target_hub_name} calculated!`)
      } else {
        toast.error(res.data.message || 'Evacuation route calculation failed.')
      }
    } catch {
      toast.error('Failed to calculate evacuation route.')
    } finally {
      setLoadingRoute(false)
    }
  }

  const triggerSos = async () => {
    if (!myLat || !myLng) {
      toast.error('Location unavailable for SOS dispatch.')
      return
    }

    setSubmittingSos(true)
    const payload = {
      category: 'rescue',
      description: `EMERGENCY SOS TRIGGERED VIA CITIZEN EMERGENCY MODE — Alert: ${alert.title}`,
      lat: myLat,
      lng: myLng,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    if (isOnline) {
      try {
        await api.post('/incident-reports', payload)
        toast.success('EMERGENCY SOS TRANSMITTED! Responders notified.')
        setSosSent(true)
      } catch {
        toast.error('Online SOS transmission failed — queuing locally.')
        await saveReportOffline(payload)
        const count = await db.local_reports.count()
        setPendingOps(count)
        setSosSent(true)
      }
    } else {
      await saveReportOffline(payload)
      const count = await db.local_reports.count()
      setPendingOps(count)
      toast('SOS saved offline locally. Will sync upon reconnection.', { icon: '📡' })
      setSosSent(true)
    }
    setSubmittingSos(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          border: '2px solid #ef4444',
          borderRadius: '12px',
          maxWidth: '650px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.4)',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span
            style={{
              backgroundColor: alert.severity === 'EMERGENCY' ? '#dc2626' : '#d97706',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.75rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              letterSpacing: '0.05em',
            }}
          >
            {alert.severity} ALERT
          </span>
          <span style={{ backgroundColor: '#1e293b', color: '#94a3b8', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
            Type: {alert.alert_type}
          </span>
          {isOfflineCached ? (
            <span style={{ backgroundColor: '#854d0e', color: '#fef08a', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <WifiOff className="w-3 h-3" /> OFFLINE CACHED ({cachedAt ? new Date(cachedAt).toLocaleTimeString() : 'cached'})
            </span>
          ) : (
            <span style={{ backgroundColor: '#065f46', color: '#a7f3d0', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              LIVE SERVER BROADCAST
            </span>
          )}
        </div>

        {/* Alert Title & Message */}
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '0.5rem' }}>
          {alert.title}
        </h2>
        <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          {alert.message}
        </p>

        {/* Action 1: One-tap Evacuation Route */}
        <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Navigation className="w-5 h-5 text-blue-400" /> Disaster-Aware Evacuation Route
            </h3>
            <button
              onClick={calculateEvacuationRoute}
              disabled={loadingRoute}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {loadingRoute ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              Find Nearest Hub Route
            </button>
          </div>

          {route && route.success && (
            <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>Destination: {route.target_hub_name}</span>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Distance: {route.total_distance_km} km</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                {route.cost_explanation}
              </p>
              {route.steps && route.steps.length > 0 && (
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid #334155', paddingTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.25rem' }}>ROUTE STEPS:</p>
                  <ol style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                    {route.steps.map((step, idx) => (
                      <li key={idx} style={{ marginBottom: '0.2rem' }}>
                        {step.road_name}: {step.from_name} → {step.to_name} ({step.distance_km} km)
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action 2: Immediate SOS Trigger */}
        <div style={{ backgroundColor: '#450a0a', border: '1px solid #dc2626', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#fca5a5', margin: '0 0 0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <PhoneCall className="w-5 h-5 text-red-400" /> IMMEDIATE SOS / RESCUE DISPATCH
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#fecaca', margin: 0 }}>
                Transmits immediate unverified Tier-1 rescue report to response center.
              </p>
            </div>

            <button
              onClick={triggerSos}
              disabled={submittingSos || sosSent}
              style={{
                backgroundColor: sosSent ? '#166534' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '0.6rem 1.2rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: sosSent ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.5)',
              }}
            >
              {submittingSos ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : sosSent ? (
                <>
                  <CheckCircle className="w-4 h-4" /> SOS SENT
                </>
              ) : (
                'SEND SOS NOW'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
