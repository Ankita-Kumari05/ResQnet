// EmergencyAlertBanner — top-of-screen alert strip for Citizen Dashboard
// Updated 6.18-B: pulse animation, accessible, cleaner layout
import React from 'react'
import type { EmergencyAlert } from '../types'
import { ShieldAlert, AlertTriangle, Info, ArrowRight, WifiOff } from 'lucide-react'

interface EmergencyAlertBannerProps {
  alert: EmergencyAlert | null
  isOfflineCached?: boolean
  cachedAt?: string
  onOpenEmergencyMode: () => void
}

export const EmergencyAlertBanner: React.FC<EmergencyAlertBannerProps> = ({
  alert,
  isOfflineCached = false,
  cachedAt,
  onOpenEmergencyMode,
}) => {
  if (!alert) return null

  const severityConfig = {
    EMERGENCY: { bg: '#dc2626', icon: <ShieldAlert size={16} style={{ animation: 'pulse-alert 1.5s infinite' }} />, label: 'EMERGENCY' },
    WARNING:   { bg: '#d97706', icon: <AlertTriangle size={16} />, label: 'WARNING' },
    ADVISORY:  { bg: '#2563eb', icon: <Info size={16} />, label: 'ADVISORY' },
  }
  const config = severityConfig[alert.severity] || severityConfig.ADVISORY

  return (
    <div
      className={`alert-banner ${alert.severity}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{ backgroundColor: config.bg, color: '#fff' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>{config.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.03em' }}>
              {config.label}: {alert.title}
            </span>
            {isOfflineCached && (
              <span style={{
                background: 'rgba(0,0,0,0.25)', color: '#fef08a',
                fontSize: '0.65rem', fontWeight: 700,
                padding: '0.1rem 0.4rem', borderRadius: '4px',
                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
              }}>
                <WifiOff size={9} />
                CACHED {cachedAt ? new Date(cachedAt).toLocaleTimeString() : ''}
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.78rem', opacity: 0.9, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 600,
          }}>
            {alert.message}
          </p>
        </div>
      </div>

      <button
        onClick={onOpenEmergencyMode}
        aria-label="Open emergency mode"
        style={{
          background: 'rgba(0,0,0,0.25)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.3)',
          padding: '0.35rem 0.85rem',
          borderRadius: '6px',
          fontWeight: 700,
          fontSize: '0.78rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          flexShrink: 0,
          transition: 'background 0.15s',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.25)')}
      >
        EMERGENCY MODE <ArrowRight size={13} />
      </button>
    </div>
  )
}
