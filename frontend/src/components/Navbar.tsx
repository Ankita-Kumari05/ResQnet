// Navbar — shared across all authenticated pages
// Updated 6.18-B: alert dot, role-specific badge colors, live pulse indicator
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../contexts/OnlineContext'
import { Shield, LogOut, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

interface NavbarProps {
  alertActive?: boolean
  onAlertClick?: () => void
}

export default function Navbar({ alertActive = false, onAlertClick }: NavbarProps) {
  const { user, logout } = useAuth()
  const { isOnline, pendingOpsCount } = useOnline()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Role → badge class mapping
  const roleBadgeClass: Record<string, string> = {
    citizen:     'badge-citizen',
    responder:   'badge-responder',
    coordinator: 'badge-coordinator',
    fundraiser:  'badge-fundraiser',
  }

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      {/* Logo */}
      <button
        style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          cursor: 'pointer', background: 'none', border: 'none', padding: 0,
        }}
        onClick={() => navigate('/')}
        aria-label="ResQnet home"
      >
        <div style={{
          width: 28, height: 28,
          background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
          borderRadius: '7px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Shield size={14} color="white" />
        </div>
        <span style={{
          fontWeight: 800, fontSize: '1.05rem',
          background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          ResQnet
        </span>
      </button>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Alert indicator — only shown when active alert */}
        {alertActive && onAlertClick && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onAlertClick}
            aria-label="View active emergency alert"
            style={{
              color: 'var(--color-danger)',
              borderColor: 'rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            <div className="alert-dot" aria-hidden="true" />
            <AlertTriangle size={13} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>ALERT</span>
          </button>
        )}

        {/* Connectivity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600 }}>
          {isOnline ? (
            <>
              <span className="status-dot online pulse" aria-hidden="true" />
              <Wifi size={13} color="var(--color-success)" />
              <span style={{ color: 'var(--color-success)' }}>Online</span>
            </>
          ) : (
            <>
              <WifiOff size={13} color="var(--color-warning)" />
              <span style={{ color: 'var(--color-warning)' }}>Offline</span>
              {pendingOpsCount > 0 && (
                <span style={{
                  background: 'var(--color-warning)', color: '#000',
                  borderRadius: '999px', padding: '0.1rem 0.5rem',
                  fontSize: '0.68rem', fontWeight: 700,
                }}>
                  {pendingOpsCount} queued
                </span>
              )}
            </>
          )}
        </div>

        {/* Role + Name */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`badge ${roleBadgeClass[user.role] || 'badge-citizen'}`}>
              {user.role}
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
              {user.full_name}
            </span>
          </div>
        )}

        {/* Logout */}
        <button
          id="nav-logout"
          className="btn btn-ghost btn-icon"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </nav>
  )
}
