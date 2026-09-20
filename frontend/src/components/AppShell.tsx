import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../contexts/OnlineContext'
import { MAP_V2_URL } from '../config/mapConfig'
import type { ReactNode } from 'react'

interface NavItem {
  icon: string   // material-symbols-outlined name
  label: string
  path: string
  badge?: number | string
  external?: boolean
}

const CITIZEN_NAV: NavItem[] = [
  { icon: 'map',          label: 'Safety Map',    path: '/' },
  { icon: 'campaign',     label: 'Alerts',         path: '/alerts' },
  { icon: 'volunteer_activism', label: 'Relief',  path: '/fundraising' },
]

const COORDINATOR_NAV: NavItem[] = [
  { icon: 'grid_view',    label: 'Dashboard',       path: '/coordinator?tab=overview' },
  { icon: 'warning',      label: 'Incidents',        path: '/coordinator?tab=incidents' },
  { icon: 'groups',       label: 'Response Teams',   path: '/coordinator?tab=missions' },
  { icon: 'map',          label: 'Operations Map',   path: `${MAP_V2_URL}?role=coordinator`, badge: 'MAP V2', external: true },
  { icon: 'inventory_2',  label: 'Resources',        path: '/coordinator?tab=resources' },
  { icon: 'night_shelter',label: 'Safety Hubs',      path: '/coordinator?tab=hubs' },
  { icon: 'traffic',      label: 'Hazards & Roads',  path: '/coordinator?tab=hazards-and-roads' },
  { icon: 'campaign',     label: 'Alerts',           path: '/coordinator?tab=alerts' },
  { icon: 'monitoring',   label: 'Analytics',        path: '/coordinator?tab=analytics' },
  { icon: 'terminal',     label: 'Simulation Engine',path: '/coordinator?tab=simulation', badge: 'SIM LIVE' },
]

const RESPONDER_NAV: NavItem[] = [
  { icon: 'dashboard',            label: 'Dashboard',        path: '/missions?tab=dashboard' },
  { icon: 'task_alt',             label: 'Missions',          path: '/missions?tab=missions' },
  { icon: 'content_paste_search', label: 'Field Surveys',     path: '/missions?tab=survey' },
  { icon: 'verified_user',        label: 'Verification',      path: '/missions?tab=verification' },
  { icon: 'map',                  label: 'Operations Map',    path: `${MAP_V2_URL}?role=responder`, badge: 'MAP V2', external: true },
  { icon: 'corporate_fare',       label: 'Organization',      path: '/missions?tab=organization' },
  { icon: 'account_circle',       label: 'Profile',           path: '/missions?tab=profile' },
  { icon: 'campaign',             label: 'Campaigns',         path: '/missions?tab=campaigns' },
]

const FUNDRAISER_NAV: NavItem[] = [
  { icon: 'volunteer_activism', label: 'Campaigns', path: '/fundraising' },
  { icon: 'leaderboard',        label: 'Impact',    path: '/fundraising' },
]

const ADMIN_NAV: NavItem[] = [
  { icon: 'dashboard',         label: 'Dashboard',             path: '/admin?tab=dashboard' },
  { icon: 'groups',            label: 'Users Directory',       path: '/admin?tab=users' },
  { icon: 'security',          label: 'Roles & Permissions',   path: '/admin?tab=roles' },
  { icon: 'badge',             label: 'Coordinators',          path: '/admin?tab=coordinators' },
  { icon: 'engineering',       label: 'Responders Fleet',      path: '/admin?tab=responders' },
  { icon: 'corporate_fare',    label: 'Organizations & NGOs',  path: '/admin?tab=organizations' },
  { icon: 'verified_user',     label: 'Verification Queue',    path: '/admin?tab=verification', badge: '5' },
  { icon: 'campaign',          label: 'Announcements',         path: '/admin?tab=announcements' },
  { icon: 'monitor_heart',     label: 'Platform Health',       path: '/admin?tab=monitoring' },
  { icon: 'history',           label: 'Audit Logs',            path: '/admin?tab=audit' },
  { icon: 'settings',          label: 'Security Governance',   path: '/admin?tab=config' },
]

function getRoleNav(role?: string, email?: string): NavItem[] {
  if (role === 'admin' || email === 'admin@resqnet.in') return ADMIN_NAV
  if (role === 'coordinator') return COORDINATOR_NAV
  if (role === 'responder')   return RESPONDER_NAV
  if (role === 'fundraiser')  return FUNDRAISER_NAV
  return CITIZEN_NAV
}

function getRoleLabel(role?: string, email?: string): string {
  if (role === 'admin' || email === 'admin@resqnet.in') return 'Central NDMA Governance'
  if (role === 'coordinator') return 'Emergency Coordinator'
  if (role === 'responder')   return 'Field Responder'
  if (role === 'fundraiser')  return 'Verified NGO'
  return 'Citizen Network'
}

function getRoleTag(role?: string, email?: string): string {
  if (role === 'admin' || email === 'admin@resqnet.in') return 'ROOT ADMIN'
  if (role === 'coordinator') return 'EOC'
  if (role === 'responder')   return 'FIELD'
  if (role === 'fundraiser')  return 'NGO'
  return 'CIV'
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

interface Props {
  children: ReactNode
  /** Override the page title shown in header */
  pageTitle?: string
  /** Extra header right content */
  headerExtra?: ReactNode
  /** Show live grid indicator */
  showLive?: boolean
  /** Suppress sidebar (used for Citizen map view) */
  noSidebar?: boolean
  /** Suppress header (used for full-bleed slide layouts like Citizen portal) */
  noHeader?: boolean
}

export default function AppShell({ children, pageTitle, headerExtra, showLive = true, noSidebar = false, noHeader = false }: Props) {
  const { user, logout } = useAuth()
  const { isOnline, pendingOpsCount } = useOnline()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = getRoleNav(user?.role, user?.email)
  const roleLabel = getRoleLabel(user?.role, user?.email)
  const roleTag   = getRoleTag(user?.role, user?.email)
  const initials  = getInitials(user?.full_name)
  const isAdmin   = user?.role === 'admin' || user?.email === 'admin@resqnet.in'
  const canOpenMap = Boolean(user && !isAdmin)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const currentPath = location.pathname + location.search

  return (
    <div className="app-shell relative overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────── */}
      {!noSidebar && (
        <aside className="sidebar" role="complementary" aria-label="Navigation">
          {/* Logo */}
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>shield_with_heart</span>
            </div>
            <div className="sidebar-logo-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="sidebar-logo-title">ResQnet</span>
                <span className="badge badge-cap1" style={{ fontSize: '0.55rem', padding: '0.1rem 0.3rem' }}>{roleTag}</span>
              </div>
              <span className="sidebar-logo-role">{roleLabel}</span>
            </div>
          </div>

          {/* Nav section label */}
          <div className="sidebar-section-label">Command Modules</div>

          {/* Nav items */}
          <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
            {navItems.map((item) => {
              const [itemBase, itemQuery] = item.path.split('?')
              const [currentBase, currentQuery] = currentPath.split('?')

              let isActive = false
              if (itemBase === '/' && (currentBase === '/' || currentBase === '')) {
                if (!itemQuery) {
                  isActive = !currentQuery || currentQuery === ''
                } else {
                  isActive = currentQuery === itemQuery
                }
              } else if (itemBase === currentBase) {
                if (!itemQuery) {
                  isActive = !currentQuery || currentQuery === ''
                } else {
                  isActive = currentQuery === itemQuery
                }
              }

              if (item.external) {
                return (
                  <a
                    key={item.label}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-nav-item"
                    title={`Open ${item.label} in Map Engine V2`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0, color: '#006398' }}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="nav-badge" style={{ background: '#006398', color: '#ffffff' }}>{item.badge}</span>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: 15, opacity: 0.6, marginLeft: '0.2rem' }}>
                      open_in_new
                    </span>
                  </a>
                )
              }

              return (
                <button
                  key={item.label}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Bottom user section */}
          <div className="sidebar-bottom">
            {/* Notifications tab placed in bottom-left just over user profile block */}
            <button
              className={`sidebar-nav-item ${currentPath.includes('tab=notifications') ? 'active' : ''}`}
              style={{ marginBottom: '0.35rem' }}
              onClick={() => {
                if (user?.role === 'responder') {
                  navigate('/missions?tab=notifications')
                } else if (user?.role === 'coordinator') {
                  navigate('/coordinator?tab=notifications')
                } else if (user?.role === 'admin' || user?.email === 'admin@resqnet.in') {
                  navigate('/admin?tab=notifications')
                } else {
                  navigate('/alerts')
                }
              }}
              aria-label="Notifications"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>notifications</span>
                <span style={{ flex: 1 }}>Notifications</span>
                {user?.role !== 'admin' && user?.email !== 'admin@resqnet.in' && (
                  <span className="nav-badge" style={{ background: 'var(--color-danger, #ef4444)' }}>3</span>
                )}
              </div>
            </button>

            {/* User profile block */}
            <div
              className={`sidebar-user ${currentPath.includes('tab=profile') ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''}`}
              style={{ cursor: user?.role === 'responder' ? 'pointer' : 'default' }}
              onClick={() => {
                if (user?.role === 'responder') {
                  navigate('/missions?tab=profile')
                }
              }}
              title={user?.role === 'responder' ? 'View Profile & Credentials' : undefined}
            >
              <div className="sidebar-user-avatar">{initials}</div>
              <div className="sidebar-user-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.full_name || 'Arjun Mehta'}
                </div>
                <div className="sidebar-user-role" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.ngo_name || (user?.role === 'responder' ? 'Field Responder' : roleLabel)}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={(e) => {
                  e.stopPropagation()
                  handleLogout()
                }}
                title="Log out"
                aria-label="Log out"
                style={{ flexShrink: 0, padding: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="main-content">
        {/* Top Header */}
        {!noHeader && (
          <header className="top-header" role="banner">
            <div className="top-header-left">
              {noSidebar && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 20, height: 20, background: 'var(--color-danger)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#fff' }}>shield_with_heart</span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.9375rem', letterSpacing: '-0.01em', color: 'var(--color-text)' }}>ResQnet</span>
                </div>
              )}

              {pageTitle && (
                <>
                  <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    {pageTitle}
                  </span>
                </>
              )}

              {showLive && (
                <div className="live-indicator">
                  <span className="live-dot" />
                  {isOnline ? 'Live Grid Online' : 'Offline'}
                  {pendingOpsCount > 0 && (
                    <span className="badge badge-warning-sev" style={{ fontSize: '0.6rem', marginLeft: '0.25rem' }}>
                      {pendingOpsCount} queued
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="top-header-right">
              {headerExtra}

              {/* Helpline */}
              <div className="helpline-badge" style={{ fontSize: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-danger)' }}>call</span>
                <span style={{ color: 'var(--color-muted)', fontFamily: 'inherit', fontSize: '0.6875rem' }}>HELPLINE:</span>
                <span>112 / 1078</span>
              </div>

              {/* User chip */}
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.6rem', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{initials}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{user.full_name.split(' ')[0]}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5625rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {(user.role === 'admin' || user.email === 'admin@resqnet.in') ? 'administrator' : user.role} active
                    </span>
                  </div>
                </div>
              )}


              {noSidebar && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
                </button>
              )}
            </div>
          </header>
        )}

        {/* Page Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>

      {/* Bottom-anchored Open Map Button for Coordinator and Responder */}
      {canOpenMap && user && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.5rem', zIndex: 45 }}>
          <a
            href={`${MAP_V2_URL}?role=${user.role.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary shadow-lg"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
            title="Open Map Engine V2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>map</span>
            <span>Open Map</span>
          </a>
        </div>
      )}
    </div>
  )
}
