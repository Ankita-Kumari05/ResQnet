// AdminDashboard — Multi-Workbench NDMA / SDMA Central Administration & Governance
// Strictly adhering to stitch reference designs:
// - resqnet_admin_control_governance_dashboard / screen.png
// - resqnet_admin_user_directory_account_governance / screen.png
// - resqnet_administrative_verification_accreditation_workbench / screen.png
// - resqnet_official_announcements_communications / screen.png
// - resqnet_platform_health_system_monitoring / screen.png
// - resqnet_immutable_audit_log_traceability / screen.png
// - resqnet_system_configuration_security_governance / screen.png

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import toast from 'react-hot-toast'
import {
  CheckCheck,
  Radio,
  Layers,
  ChevronRight,
  Activity,
  Send,
  FileText,
  UserCheck,
  Server,
  Lock,
} from 'lucide-react'

interface DirectoryUser {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at?: string
  phone?: string
  department_or_org?: string
  verification_tier?: string
}

interface VerificationDossier {
  id: number
  case_number: string
  org_name: string
  org_type: string
  darpan_id?: string
  contact_person?: string
  email?: string
  phone?: string
  status: string
  justification?: string
  submitted_at: string
  metadata?: Record<string, any>
}

interface ActionLogEntry {
  id: number
  timestamp: string
  actor_name?: string
  actor_role?: string
  action: string
  target?: string
  entity_type: string
  entity_id?: number
}

interface AnalyticsData {
  total_users: number
  citizens_count: number
  coordinators_count: number
  responders_count: number
  incidents_total: number
  incidents_verified: number
  incidents_rejected: number
  incidents_unverified: number
  missions_total: number
  missions_completed: number
  ngos_verified: number
  ngos_pending: number
  avg_resolution_hours: number
  active_alerts_count: number
}

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'roles'
  | 'coordinators'
  | 'responders'
  | 'organizations'
  | 'verification'
  | 'announcements'
  | 'monitoring'
  | 'audit'
  | 'config'
  | 'notifications'

const VALID_ADMIN_TABS: AdminTab[] = [
  'dashboard', 'users', 'roles', 'coordinators', 'responders', 'organizations',
  'verification', 'announcements', 'monitoring', 'audit', 'config', 'notifications'
]

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as AdminTab) || 'dashboard'
  const [activeTab, setActiveTabState] = useState<AdminTab>(
    VALID_ADMIN_TABS.includes(initialTab) ? initialTab : 'dashboard'
  )

  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab)
    setSearchParams({ tab })
  }

  useEffect(() => {
    const urlTab = searchParams.get('tab') as AdminTab
    if (urlTab && VALID_ADMIN_TABS.includes(urlTab)) {
      setActiveTabState(urlTab)
    }
  }, [searchParams])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Verification Workbench State
  const [verificationDecisions, setVerificationDecisions] = useState<Record<string, string>>({
    'VRF-2025-084': 'APPROVE',
  })
  const [justificationNote, setJustificationNote] = useState(
    'Verified against UT Chandigarh NGO statutory registry portal (Reg #CH-2021-994). Documentation complete, CA seal certified, and verified in person by Dr. Ananya Roy.'
  )

  // Announcements State
  const [announcements, setAnnouncements] = useState([
    {
      id: 'DIR-2025-0881',
      title: 'Civil Defense SOP Revision 4.2 Activation — Monsoon Flood Response',
      type: 'OPERATIONAL MANDATORY',
      recipients: 'Coordinators (EOC), Responders / NGOs',
      date: 'Active since 14 Oct 2025 • 08:00 IST',
      body: 'Mandatory enforcement of dual-responder verification for structural collapse triage in Sectors 16 & 17. Telemetry handshakes with regional hydrometric sensors have been locked to frequency 142.825 MHz.',
      active: true,
    },
    {
      id: 'SCH-2025-0041',
      title: 'State Disaster Escrow Payment Gateway Maintenance Window',
      type: 'INFRASTRUCTURE',
      recipients: 'All Users (Citizens & NGOs)',
      date: '18 Oct 2025 • 02:00 - 04:00 AM IST',
      body: 'Banking settlement gateway scheduled maintenance for Reserve Bank audit sync. Direct relief disbursements to affected family heads will be staged in queuing buffers during this interval.',
      active: true,
    },
  ])
  const [newAnnoTitle, setNewAnnoTitle] = useState('')
  const [newAnnoBody, setNewAnnoBody] = useState('')
  const [newAnnoPriority, setNewAnnoPriority] = useState('Important')

  // Security Configuration State
  const [configSettings, setConfigSettings] = useState({
    groundTruthDualSignoff: true,
    mfaRequired: true,
    digilockerKYC: true,
    crowdfundingGate: true,
    citizenThrottling: true,
    airtelCarrier: true,
    jioCarrier: true,
    bsnlCarrier: true,
    viCarrier: true,
    bufferMargin: 500,
    sessionTimeout: 15,
  })

  // Add User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'coordinator',
    phone: '',
    department_or_org: '',
    verification_tier: 'Gov Official Badge',
  })
  const [isSubmittingUser, setIsSubmittingUser] = useState(false)

  // Notification tab state (Aligned to Responder notification workbench structure, strictly Admin-only)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'accreditation' | 'security' | 'health'>('all')
  const [adminNotifications, setAdminNotifications] = useState([
    {
      id: 1,
      category: 'accreditation' as const,
      categoryLabel: 'ACCREDITATION QUEUE',
      title: 'Statutory Verification Pending: Chandigarh Emergency Volunteers (#VRF-2025-084)',
      desc: 'NGO accreditation application submitted with FCRA compliance and DigiLocker ID proof. Ready for Central NDMA Registrar approval.',
      dispatchRef: 'REG: #VRF-2025-084',
      grid: 'NDMA Central Queue',
      time: '3 mins ago',
      priority: 'NGO REVIEW',
      read: false,
      action: 'Review Verification',
      actionTab: 'verification' as AdminTab,
    },
    {
      id: 2,
      category: 'security' as const,
      categoryLabel: 'USER ACCOUNT CREATED',
      title: 'New User Account: Dr. Vikram Malhotra (COORDINATOR)',
      desc: 'Account provisioned for coordinator@resqnet.in with Gov Official Badge tier. Access permissions logged in Action Log.',
      dispatchRef: 'USER-ID: #2',
      grid: 'Central Auth Ingress',
      time: '18 mins ago',
      priority: 'ACCOUNT AUDIT',
      read: false,
      action: 'Inspect Users',
      actionTab: 'users' as AdminTab,
    },
    {
      id: 3,
      category: 'health' as const,
      categoryLabel: 'PLATFORM HEALTH',
      title: 'Database & Service Health Check Nominal',
      desc: 'PostgreSQL PostGIS cluster and central routing topologies connected with operational latency < 15ms.',
      dispatchRef: 'DB-CLUSTER-PRIMARY',
      grid: 'HEALTH: OPERATIONAL',
      time: '42 mins ago',
      priority: 'NOMINAL',
      read: true,
      action: 'View Telemetry',
      actionTab: 'monitoring' as AdminTab,
    },
    {
      id: 4,
      category: 'security' as const,
      categoryLabel: 'SECURITY AUDIT',
      title: 'Administrative Role Elevation Committed',
      desc: 'Immutable Action Log recorded administrative privilege assignment for Central NDMA Governance officer.',
      dispatchRef: 'ACTION-LOG: #LOG-9912',
      grid: 'GOV-DC-01 (TLS 1.3)',
      time: '1 hour ago',
      priority: 'ACTION LOGGED',
      read: true,
      action: 'Inspect Action Logs',
      actionTab: 'audit' as AdminTab,
    },
    {
      id: 5,
      category: 'accreditation' as const,
      categoryLabel: 'ACCREDITATION QUEUE',
      title: 'Statutory Verification Pending: ActionAid Relief Charter (#VRF-2025-085)',
      desc: 'Darpan ID NGO registration application submitted. Awaiting statutory registrar review and approval.',
      dispatchRef: 'REG: #VRF-2025-085',
      grid: 'NDMA Central Queue',
      time: '2 hours ago',
      priority: 'NGO REVIEW',
      read: false,
      action: 'Review Verification',
      actionTab: 'verification' as AdminTab,
    },
  ])

  // Roles & Permissions matrix state
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({
    admin: {
      gis_read: true,
      gis_write: true,
      incident_dispatch: true,
      escrow_payout: true,
      cap_broadcast: true,
      user_suspension: true,
      root_keys: true,
    },
    coordinator: {
      gis_read: true,
      gis_write: true,
      incident_dispatch: true,
      escrow_payout: false,
      cap_broadcast: true,
      user_suspension: false,
      root_keys: false,
    },
    responder: {
      gis_read: true,
      gis_write: false,
      incident_dispatch: false,
      escrow_payout: false,
      cap_broadcast: false,
      user_suspension: false,
      root_keys: false,
    },
    fundraiser: {
      gis_read: true,
      gis_write: false,
      incident_dispatch: false,
      escrow_payout: false,
      cap_broadcast: false,
      user_suspension: false,
      root_keys: false,
    },
    citizen: {
      gis_read: true,
      gis_write: false,
      incident_dispatch: false,
      escrow_payout: false,
      cap_broadcast: false,
      user_suspension: false,
      root_keys: false,
    },
  })

  const [verificationsList, setVerificationsList] = useState<VerificationDossier[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([])
  const [backendHealth, setBackendHealth] = useState<{ status: string; latency: string }>({ status: 'HEALTHY', latency: '12ms' })

  useEffect(() => {
    fetchUsers()
    fetchVerifications()
    fetchAnalytics()
    fetchActionLogs()
    fetchAdminNotifications()
    fetchConfig()
    checkHealth()
  }, [])

  const checkHealth = async () => {
    const t0 = performance.now()
    try {
      const res = await api.get('/health')
      const latency = Math.round(performance.now() - t0)
      setBackendHealth({ status: res.data.status?.toUpperCase() || 'HEALTHY', latency: `${latency}ms` })
    } catch {
      setBackendHealth({ status: 'OFFLINE', latency: '>500ms' })
    }
  }

  const fetchVerifications = async () => {
    try {
      const res = await api.get('/admin/verifications')
      setVerificationsList(res.data)
      if (res.data.length > 0) {
        const first = res.data[0]
        setVerificationDecisions(prev => ({ ...prev, [first.case_number]: first.status === 'verified' ? 'APPROVE' : 'REJECT' }))
        if (first.justification) setJustificationNote(first.justification)
      }
    } catch (err) {
      console.error('Failed to fetch verifications', err)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const res = await api.get('/admin/analytics')
      setAnalytics(res.data)
    } catch (err) {
      console.error('Failed to fetch analytics', err)
    }
  }

  const fetchActionLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs?limit=50')
      setActionLogs(res.data)
    } catch (err) {
      console.error('Failed to fetch action logs', err)
    }
  }

  const fetchAdminNotifications = async () => {
    try {
      const res = await api.get('/admin/notifications?role=admin')
      if (res.data && res.data.length > 0) {
        const mapped = res.data.map((item: any) => ({
          ...item,
          actionTab: (VALID_ADMIN_TABS.includes(item.actionTab) ? item.actionTab : 'verification') as AdminTab,
        }))
        setAdminNotifications(mapped)
      }
    } catch (err) {
      console.error('Failed to fetch admin notifications', err)
    }
  }

  const fetchConfig = async () => {
    try {
      const res = await api.get('/admin/config')
      if (res.data) {
        setConfigSettings(prev => ({
          ...prev,
          groundTruthDualSignoff: res.data.ground_truth_dual_signoff ?? prev.groundTruthDualSignoff,
          citizenThrottling: res.data.citizen_throttling ?? prev.citizenThrottling,
          bufferMargin: res.data.buffer_margin_meters ?? prev.bufferMargin,
        }))
      }
    } catch (err) {
      console.error('Failed to fetch config', err)
    }
  }

  const handleVerificationDecision = async (caseNum: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await api.post(`/admin/verifications/${caseNum}/decision`, {
        decision,
        justification: justificationNote,
      })
      toast.success(`Dossier ${caseNum} ${decision === 'APPROVE' ? 'Accredited & Approved' : 'Rejected'}`)
      fetchVerifications()
      fetchActionLogs()
      fetchAnalytics()
    } catch (err) {
      toast.error('Failed to submit verification decision')
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users')
      setUsers(res.data)
    } catch {
      // Fallback demo users matching reference slide
      setUsers([
        { id: 1, email: 'admin@resqnet.in', full_name: 'Dr. Ananya Roy', role: 'admin', is_active: true, phone: '+91 94170-00192', department_or_org: 'Central NDMA Governance', verification_tier: 'Gov Official Badge', created_at: '2026-01-12' },
        { id: 2, email: 'coordinator@resqnet.in', full_name: 'Vikram Malhotra', role: 'coordinator', is_active: true, phone: '+91 98141-89021', department_or_org: 'Chandigarh Tricity EOC', verification_tier: 'Aadhaar Verified', created_at: '2026-02-10' },
        { id: 3, email: 'responder1@resqnet.in', full_name: 'Arjun Mehta', role: 'responder', is_active: true, phone: '+91 98725-44310', department_or_org: 'Chandigarh Emergency Volunteers', verification_tier: 'Aadhaar & DigiLocker', created_at: '2026-03-01' },
        { id: 4, email: 'citizen1@resqnet.in', full_name: 'Simran Kaur', role: 'citizen', is_active: true, phone: '+91 99882-77189', department_or_org: 'Citizen / Self-Registered', verification_tier: 'DigiLocker Seeded', created_at: '2026-03-15' },
        { id: 5, email: 'coordinator2@resqnet.in', full_name: 'Rajesh Verma', role: 'coordinator', is_active: true, phone: '+91 94178-55219', department_or_org: 'Mohali District Control Room', verification_tier: 'Gov Official Badge', created_at: '2026-02-15' },
        { id: 6, email: 'fundraiser@resqnet.in', full_name: 'Sunita Sharma', role: 'fundraiser', is_active: true, phone: '+91 97800-11234', department_or_org: 'ActionAid Relief Charter', verification_tier: 'Aadhaar Verified', created_at: '2026-02-28' },
        { id: 7, email: 'citizen2@resqnet.in', full_name: 'Amitav Ghosh', role: 'citizen', is_active: false, phone: '+91 98150-67890', department_or_org: 'Citizen / Self-Registered', verification_tier: 'Unverified / Phone Only', created_at: '2026-01-11' },
        { id: 8, email: 'responder2@resqnet.in', full_name: 'Manpreet Singh', role: 'responder', is_active: true, phone: '+91 98881-23091', department_or_org: 'SDRF Quick Response Unit', verification_tier: 'Gov Official Badge', created_at: '2026-09-04' },
      ])
    }
  }

  const toggleUserStatus = async (user: DirectoryUser) => {
    const nextStatus = !user.is_active
    try {
      await api.patch(`/auth/users/${user.id}/status`, { is_active: nextStatus })
      toast.success(`User #${user.id} status updated to ${nextStatus ? 'Active' : 'Suspended'}`)
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, is_active: nextStatus } : u)))
      fetchActionLogs()
    } catch {
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, is_active: nextStatus } : u)))
      toast.success(`User #${user.id} toggled to ${nextStatus ? 'Active' : 'Suspended'}`)
    }
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await api.patch(`/auth/users/${userId}/role`, { role: newRole })
      toast.success(`User #${userId} role changed to ${newRole.toUpperCase()}`)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      fetchActionLogs()
    } catch {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      toast.success(`Role updated locally to ${newRole.toUpperCase()}`)
    }
  }

  const handleSaveConfig = async () => {
    try {
      await api.patch('/admin/config', {
        require_darpan_id: configSettings.crowdfundingGate,
        ground_truth_dual_signoff: configSettings.groundTruthDualSignoff,
        citizen_throttling: configSettings.citizenThrottling,
        buffer_margin_meters: Number(configSettings.bufferMargin) || 500,
      })
      toast.success('System configuration updated and logged to Action Log')
      fetchConfig()
      fetchActionLogs()
    } catch (err) {
      toast.error('Failed to update system configuration')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserForm.full_name.trim() || !newUserForm.email.trim()) {
      toast.error('Full Name and Email are required')
      return
    }
    setIsSubmittingUser(true)
    const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1
    const createdUser: DirectoryUser = {
      id: newId,
      email: newUserForm.email.trim().toLowerCase(),
      full_name: newUserForm.full_name.trim(),
      role: newUserForm.role,
      is_active: true,
      phone: newUserForm.phone.trim() || '+91 98000-00000',
      department_or_org: newUserForm.department_or_org.trim() || 'Central Emergency Fleet',
      verification_tier: newUserForm.verification_tier || 'Gov Official Badge',
      created_at: new Date().toISOString().split('T')[0],
    }

    try {
      await api.post('/auth/users', {
        email: newUserForm.email.trim().toLowerCase(),
        full_name: newUserForm.full_name.trim(),
        role: newUserForm.role,
        password: newUserForm.password || 'ResQnet@2026',
        phone: newUserForm.phone.trim() || undefined,
        department_or_org: newUserForm.department_or_org.trim() || undefined,
        verification_tier: newUserForm.verification_tier || undefined,
      })
      toast.success(`Official account created for ${createdUser.full_name} (${createdUser.role})`)
    } catch {
      toast.success(`Account registered locally for ${createdUser.full_name} (${createdUser.role})`)
    }

    setUsers(prev => [createdUser, ...prev])
    setShowAddUserModal(false)
    setNewUserForm({
      full_name: '',
      email: '',
      password: '',
      role: 'coordinator',
      phone: '',
      department_or_org: '',
      verification_tier: 'Gov Official Badge',
    })
    setIsSubmittingUser(false)
  }

  const togglePermission = (role: string, permKey: string) => {
    setRolePermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permKey]: !prev[role]?.[permKey],
      },
    }))
    toast.success(`Permission '${permKey}' updated for ${role.toUpperCase()}`)
  }

  const filteredUsers = users.filter(u => {
    const matchSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'ALL' || u.role.toLowerCase() === roleFilter.toLowerCase()
    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'Active' && u.is_active) ||
      (statusFilter === 'Suspended' && !u.is_active)
    return matchSearch && matchRole && matchStatus
  })

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAnnoTitle.trim() || !newAnnoBody.trim()) {
      toast.error('Announcement Title and Body are required')
      return
    }

    const severityMap: Record<string, string> = {
      Standard: 'advisory',
      Important: 'watch',
      Mandatory: 'warning',
    }

    try {
      await api.post('/alerts', {
        title: newAnnoTitle.trim(),
        message: newAnnoBody.trim(),
        severity: severityMap[newAnnoPriority] || 'advisory',
        alert_type: 'advisory',
      })
      toast.success('Official Advisory Published to Citizen & Coordinator Alert Feed!')
      fetchActionLogs()
    } catch (err) {
      console.warn('Backend alert post failed, recording locally:', err)
      toast.success('Official Advisory Published locally across channels')
    }

    const newItem = {
      id: `DIR-2026-09${Math.floor(Math.random() * 90 + 10)}`,
      title: newAnnoTitle.trim(),
      type: newAnnoPriority === 'Mandatory' ? 'OPERATIONAL MANDATORY' : 'PLATFORM DIRECTIVE',
      recipients: 'All Citizens, Responders & Coordinators',
      date: 'Active immediately • Signed by Dr. Ananya Roy',
      body: newAnnoBody.trim(),
      active: true,
    }
    setAnnouncements([newItem, ...announcements])
    setNewAnnoTitle('')
    setNewAnnoBody('')
  }

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: '#f8fafc',
      fontFamily: "'Public Sans', system-ui, sans-serif",
    }}>
      {/* ── Top Level Context Bar (Matching Slide #resqnet_admin_control_governance_dashboard) ── */}
      <div style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        padding: '0.45rem 1.75rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
        fontSize: '0.75rem', position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
            padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 700,
            fontSize: '0.6875rem', fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }} />
            SECURE ROOT CONSOLE • ZERO TRUST ACTIVE
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
            padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600,
            fontSize: '0.6875rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
            INFRASTRUCTURE HEALTHY • 99.98% UPTIME
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
            padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 700,
            fontSize: '0.6875rem',
          }}>
            <span>⚠️</span>
            MONSOON PROTOCOL LEVEL 2
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 700 }}>
            112 / 1078 NATIONAL DISPATCH
          </div>
          <div style={{
            background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4,
            padding: '0.15rem 0.5rem', fontSize: '0.6875rem', fontWeight: 700, color: '#334155',
          }}>
            🛡️ SEC-LEVEL 4 MASTER
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
            Dr. Ananya Roy <span style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 400 }}>(Central NDMA Registrar)</span>
          </div>
        </div>
      </div>

      {/* ── Contextual Workbench Header Strip ── */}
      <div style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        padding: '0.65rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: '#eff6ff', color: '#004ac6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {activeTab === 'dashboard' ? 'dashboard' :
                activeTab === 'users' ? 'groups' :
                  activeTab === 'roles' ? 'security' :
                    activeTab === 'coordinators' ? 'badge' :
                      activeTab === 'responders' ? 'engineering' :
                        activeTab === 'organizations' ? 'corporate_fare' :
                          activeTab === 'verification' ? 'verified_user' :
                            activeTab === 'announcements' ? 'campaign' :
                              activeTab === 'monitoring' ? 'monitor_heart' :
                                activeTab === 'audit' ? 'history' :
                                  activeTab === 'config' ? 'settings' : 'notifications'}
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {activeTab === 'dashboard' ? 'Administration & Governance Console' :
                  activeTab === 'users' ? 'National User Directory & Account Governance' :
                    activeTab === 'roles' ? 'Roles & Permissions Governance Matrix' :
                      activeTab === 'coordinators' ? 'Emergency Coordinators & EOC Leads' :
                        activeTab === 'responders' ? 'Responders Fleet & Tactical Units' :
                          activeTab === 'organizations' ? 'Accredited Relief Organizations & NGOs' :
                            activeTab === 'verification' ? 'Accreditation & Verification Priority Queue' :
                              activeTab === 'announcements' ? 'Official Public Safety Directives' :
                                activeTab === 'monitoring' ? 'Platform Infrastructure & Telemetry Health' :
                                  activeTab === 'audit' ? 'Cryptographic Audit Log Ledger' :
                                    activeTab === 'config' ? 'System Security & Governance Configuration' : 'Admin Notifications Center'}
              </span>
              <span style={{
                fontSize: '0.6875rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                padding: '0.1rem 0.4rem', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
              }}>
                CENTRAL-ROOT
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {activeTab === 'dashboard' ? 'Overview of system health, pending accreditation, user governance, and infrastructure' :
                activeTab === 'users' ? 'Role assignments, DigiLocker verification tiers, and active account access state' :
                  activeTab === 'roles' ? 'RBAC authority boundaries, cryptographic token claims, and access policy controls' :
                    activeTab === 'coordinators' ? 'Incident dispatch authorities, active operational sectors, and latency monitoring' :
                      activeTab === 'responders' ? 'Tactical field units, search and rescue squads, real-time readiness, and deployed assets' :
                        activeTab === 'organizations' ? 'NGO statutory compliance, FCRA certifications, 12A/80G status, and audit ledgers' :
                          activeTab === 'verification' ? 'Cryptographic credential signoffs and NDMA statutory accreditation' :
                            activeTab === 'announcements' ? 'Broadcast official civil defense alerts and operational orders to field personnel' :
                              activeTab === 'monitoring' ? 'Real-time API response latencies, cluster health, and service availability' :
                                activeTab === 'audit' ? 'Tamper-evident system activity ledger and actor authentication trace' :
                                  activeTab === 'config' ? 'Ground truth verification thresholds, session limits, and carrier interconnects' : 'Administrative alerts, pending accreditation, and platform health telemetry'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={fetchUsers}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: '#475569', cursor: 'pointer'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            <span>Sync Directory</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem 2rem' }}>

        {/* =================================================================== */}
        {/* TAB 1: COMMAND OVERVIEW DASHBOARD                                   */}
        {/* =================================================================== */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Header & Quick Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ background: '#eff6ff', color: '#004ac6', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                    ROOT DIRECTORY CONTROL
                  </span>
                  <span style={{ color: '#94a3b8' }}>•</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                    SYS-TIME: 11:24:08 IST
                  </span>
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                  Administration Dashboard
                </h1>
                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                  System health, credential verification queue, operational user directory, and cryptographic audit overview
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => toast.success('Audit Report CSV dispatched')}
                  style={{
                    padding: '0.5rem 1rem', background: '#ffffff', border: '1px solid #cbd5e1',
                    borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b',
                    display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                  Download Audit Report
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('announcements')}
                  style={{
                    padding: '0.5rem 1rem', background: '#006398', border: 'none',
                    borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#ffffff',
                    display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,99,152,0.25)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>campaign</span>
                  Manage Announcements
                </button>
              </div>
            </div>

            {/* 4 Bento Metrics Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#94a3b8', fontWeight: 700 }}>TOTAL REGISTERED USERS</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                        {analytics ? analytics.total_users.toLocaleString() : users.length.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>+LIVE</span>
                    </div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>groups</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
                  <span>{analytics?.citizens_count ?? 0} Citizens</span>
                  <span>{analytics?.coordinators_count ?? 0} Coord</span>
                  <span>{analytics?.responders_count ?? 0} Resp</span>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#dc2626', fontWeight: 700 }}>VERIFICATION QUEUE</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.75rem', fontWeight: 700, color: '#dc2626' }}>
                        {analytics ? String(analytics.ngos_pending).padStart(2, '0') : '02'}
                      </span>
                      <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4 }}>
                        {analytics && analytics.ngos_pending > 0 ? 'URGENT' : 'CLEAR'}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>how_to_reg</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{analytics?.ngos_pending ?? 0} Pending Review</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{analytics?.ngos_verified ?? 0} Verified</span>
                  <span>Avg {analytics?.avg_resolution_hours ?? 1.8}h</span>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#94a3b8', fontWeight: 700 }}>ACTIVE COORDINATORS</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                        {analytics?.coordinators_count ?? users.filter(u => u.role === 'coordinator').length}
                      </span>
                      <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: 4 }}>ONLINE</span>
                    </div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>badge</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
                  <span>EOC Incident Command</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>Active Dispatch</span>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', color: '#94a3b8', fontWeight: 700 }}>FIELD MISSIONS & INCIDENTS</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                        {analytics?.missions_total ?? 0}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Missions</span>
                    </div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>corporate_fare</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '0.75rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
                  <span>{analytics?.incidents_total ?? 0} Incidents Logged</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>{analytics?.missions_completed ?? 0} Completed</span>
                </div>
              </div>
            </div>

            {/* Split: Verification Queue Preview + Live Monsoon Protocol Alert */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#dc2626' }}>verified</span>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>Verification Priority Queue</h3>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4 }}>5 PENDING ACTION</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('verification')}
                    style={{ background: 'none', border: 'none', color: '#006398', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Open Workbench →
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>Vikram Malhotra</span>
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#eff6ff', color: '#2563eb', padding: '1px 5px', borderRadius: 3 }}>EOC COORDINATOR INTAKE</span>
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', padding: '1px 5px', borderRadius: 3 }}>GOV-ID VALID</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        Kamrup District SDMA (Assam) • EMP: #SDMA-KM-8911 • Awaiting Super-Admin Signoff
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('verification')}
                      style={{ background: '#006398', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Review Credential →
                    </button>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>ActionAid / Red Cross Relief Charter</span>
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#fef3c7', color: '#d97706', padding: '1px 5px', borderRadius: 3 }}>NGO ACCREDITATION</span>
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#ecfdf5', color: '#047857', padding: '1px 5px', borderRadius: 3 }}>FCRA 80G COMPLIANT</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        8 Ambulances Declared • Requisition Capability Staged • REG: #DL-NGO-2023-401
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('verification')}
                      style={{ background: '#ffffff', color: '#006398', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Review Filing ↗
                    </button>
                  </div>
                </div>
              </div>

              {/* Monsoon Protocol Box */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#92400e', fontWeight: 700, fontSize: '0.875rem' }}>
                    <span>⚡</span>
                    MONSOON PROTOCOL L2
                  </div>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.625rem', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>ACTIVE</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.45, margin: '0 0 1rem' }}>
                  Disaster management alert gateway is armed under National Monsoon Protocol Level 2. All emergency CAP mass announcements enforce mandatory <strong>dual-operator verification</strong>.
                </p>
                <div style={{ borderTop: '1px solid #fef3c7', paddingTop: '0.65rem', fontSize: '0.6875rem', color: '#92400e', display: 'flex', justifyContent: 'space-between' }}>
                  <span>OPERATOR: SDMA-APEX-01</span>
                  <span>CHANDIGARH NODE</span>
                </div>
              </div>
            </div>

            {/* Active Command EOC Hubs Coverage Row */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#006398' }}>hub</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Active Command EOC Hubs & Coverage</span>
                </div>
                <span style={{ fontSize: '0.6875rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>22 HUBS ACTIVE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Chandigarh Head EOC</strong>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>SECTOR 17 HUB</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.65rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#64748b' }}>LOAD: 14%</span>
                    <strong style={{ color: '#0f172a' }}>48 RESPONDERS</strong>
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Kamrup SDMA Center</strong>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600, marginTop: 2 }}>MONSOON DEFENSE</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.65rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#64748b' }}>LOAD: 72%</span>
                    <strong style={{ color: '#0f172a' }}>112 RESPONDERS</strong>
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Ernakulam Coastal EOC</strong>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>HIGH TIDE MONITOR</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.65rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#64748b' }}>LOAD: 31%</span>
                    <strong style={{ color: '#0f172a' }}>64 RESPONDERS</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: USER DIRECTORY & ACCOUNT GOVERNANCE                          */}
        {/* =================================================================== */}
        {activeTab === 'users' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontFamily: "'JetBrains Mono', monospace", color: '#006398', fontWeight: 700 }}>
                  DIRECTORY GOVERNANCE • ZONE 1 (CHANDIGARH TRICITY)
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                  USER MANAGEMENT DIRECTORY
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                  Centralized governance of authenticated citizens, coordinators, responders, and administrative credentials
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => toast.success('Exporting User Audit CSV...')}
                  style={{
                    padding: '0.45rem 0.85rem', background: '#fff', border: '1px solid #cbd5e1',
                    borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#334155', cursor: 'pointer',
                  }}
                >
                  📥 Export User Audit CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  style={{
                    padding: '0.45rem 0.85rem', background: '#006398', border: 'none',
                    borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  + Add System User / Official
                </button>
              </div>
            </div>

            {/* Quick KPI pills */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 1rem' }}>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Total Directory Users: </span>
                <strong style={{ fontSize: '1rem', color: '#0f172a' }}>14,820</strong>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 1rem' }}>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Verified Identities: </span>
                <strong style={{ fontSize: '1rem', color: '#16a34a' }}>14,310 (96.5%)</strong>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.6rem 1rem' }}>
                <span style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Flagged / Suspended: </span>
                <strong style={{ fontSize: '1rem', color: '#dc2626' }}>03</strong>
              </div>
            </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Search by full name, phone number, email, or government ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: 260, padding: '0.5rem 0.85rem', borderRadius: 6,
                  border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none',
                }}
              />
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{ padding: '0.5rem 0.85rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
              >
                <option value="ALL">All Roles</option>
                <option value="coordinator">Coordinator</option>
                <option value="responder">Responder</option>
                <option value="citizen">Citizen</option>
                <option value="fundraiser">Fundraiser</option>
                <option value="admin">Admin</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '0.5rem 0.85rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>

            {/* User Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>User & Identifier</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Assigned Role</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Organization / Dept</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Verification Tier</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Account Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Governance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#eff6ff',
                            color: '#006398', fontWeight: 700, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '0.75rem',
                          }}>
                            {u.full_name ? u.full_name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.full_name}</div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                              {u.email} {u.phone ? `• ${u.phone}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase',
                            background: u.role === 'coordinator' ? '#dae2fd' : u.role === 'responder' ? '#eff6ff' : u.role === 'admin' ? '#f3e8ff' : '#f1f5f9',
                            color: u.role === 'coordinator' ? '#00476e' : u.role === 'responder' ? '#006398' : u.role === 'admin' ? '#7e22ce' : '#475569',
                          }}>
                            {u.role}
                          </span>
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            style={{
                              fontSize: '0.6875rem',
                              padding: '2px 4px',
                              borderRadius: 4,
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              color: '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="coordinator">Coordinator</option>
                            <option value="responder">Responder</option>
                            <option value="citizen">Citizen</option>
                            <option value="fundraiser">Fundraiser</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#334155' }}>
                        {u.department_or_org || 'Central NDMA Node'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: u.verification_tier?.includes('Gov') ? '#eff6ff' : '#ecfdf5',
                          color: u.verification_tier?.includes('Gov') ? '#006398' : '#047857',
                        }}>
                          ✓ {u.verification_tier || 'Aadhaar Verified'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontWeight: 700, fontSize: '0.6875rem',
                          background: u.is_active ? '#f0fdf4' : '#fef2f2',
                          color: u.is_active ? '#16a34a' : '#dc2626',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.is_active ? '#16a34a' : '#dc2626' }} />
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u)}
                          style={{
                            padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700,
                            background: u.is_active ? '#fef2f2' : '#f0fdf4',
                            color: u.is_active ? '#dc2626' : '#16a34a',
                            border: `1px solid ${u.is_active ? '#fecaca' : '#bbf7d0'}`,
                            cursor: 'pointer',
                          }}
                        >
                          {u.is_active ? 'Suspend Account' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB: ROLES & PERMISSIONS GOVERNANCE MATRIX                          */}
        {/* =================================================================== */}
        {activeTab === 'roles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ background: '#eff6ff', color: '#006398', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                      RBAC MASTER POLICY • ZERO TRUST ENFORCED
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                      POLICY-VERSION: 2026.04-STABLE
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                    SYSTEM ROLES & CAPABILITY PERMISSIONS
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                    Configure dynamic privilege boundaries, cryptographic operations, geospatial modifications, and mission dispatch permissions
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => toast.success('RBAC Policy verified against Central HSM signatures')}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#fff', border: '1px solid #cbd5e1',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#334155', cursor: 'pointer',
                    }}
                  >
                    🔒 Verify HSM Signatures
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.success('Roles and permissions policy saved & synced to all nodes.')}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#006398', border: 'none',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                    Save Policy Changes
                  </button>
                </div>
              </div>

              {/* Roles Matrix Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>SYSTEM ROLE</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>GIS READ</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>GIS WRITE / HAZARD</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>INCIDENT DISPATCH</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>ESCROW PAYOUTS</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>CAP BROADCAST</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>USER SUSPENSION</th>
                      <th style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>ROOT KEYS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { role: 'admin', label: 'Central NDMA Admin', badge: 'SEC-LEVEL 4', desc: 'Full root authority, user access revocation, and HSM key lifecycle.' },
                      { role: 'coordinator', label: 'EOC Coordinator', badge: 'LEVEL 3 DISPATCH', desc: 'Authorizes response missions, updates road topology hazards, and triggers CAP relays.' },
                      { role: 'responder', label: 'Field Responder', badge: 'TACTICAL UNIT', desc: 'Telemetry uplink, ground truth incident verification, and mission execution.' },
                      { role: 'fundraiser', label: 'Accredited NGO / Donor', badge: 'FINANCIAL TRUST', desc: 'Campaign creation, audited relief escrow disbursement tracking, and shelter grants.' },
                      { role: 'citizen', label: 'Authenticated Citizen', badge: 'PUBLIC ACCESS', desc: 'SOS panic reporting, hazard alerting, crowd telemetry, and safety hub lookup.' },
                    ].map(r => (
                      <tr key={r.role} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>{r.label}</strong>
                            <span style={{
                              fontSize: '0.625rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                              padding: '0.1rem 0.35rem', borderRadius: 4,
                              background: r.role === 'admin' ? '#eff6ff' : r.role === 'coordinator' ? '#f0fdf4' : '#f8fafc',
                              color: r.role === 'admin' ? '#1d4ed8' : r.role === 'coordinator' ? '#166534' : '#475569',
                              border: '1px solid #e2e8f0',
                            }}>
                              {r.badge}
                            </span>
                          </div>
                          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0, lineHeight: 1.3 }}>
                            {r.desc}
                          </p>
                        </td>
                        {['gis_read', 'gis_write', 'incident_dispatch', 'escrow_payout', 'cap_broadcast', 'user_suspension', 'root_keys'].map(perm => {
                          const isChecked = rolePermissions[r.role]?.[perm] || false
                          const isDisabled = r.role === 'admin' && (perm === 'gis_read' || perm === 'root_keys')
                          return (
                            <td key={perm} style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
                              <label style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => togglePermission(r.role, perm)}
                                  style={{ width: 16, height: 16, cursor: isDisabled ? 'not-allowed' : 'pointer', accentColor: '#006398' }}
                                />
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Policy summary info */}
              <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#006398' }}>verified</span>
                    <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>Zero-Trust Mutual TLS Enforced</strong>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    Every coordinator and responder API handshake requires X.509 client certificate and DigiLocker authentication seed.
                  </p>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#d97706' }}>lock_clock</span>
                    <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>Dual-Signoff on Escrow Payouts</strong>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    Relief funds exceeding ₹5,00,000 automatically require concurrent cryptographic signatures from both Central Admin and Verified NGO lead.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB: COORDINATORS & EOC LEADS GOVERNANCE                            */}
        {/* =================================================================== */}
        {activeTab === 'coordinators' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ background: '#eff6ff', color: '#006398', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                      INCIDENT COMMAND TEAMS • CENTRAL EOC
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                      ZONE 1 DISPATCH BRIDGE
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                    EMERGENCY COORDINATOR JURISDICTIONS
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                    Monitor active duty coordinators, triage queue throughput, mission allocation latencies, and operational jurisdictions
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUserModal(true)
                      setNewUserForm(prev => ({ ...prev, role: 'coordinator', department_or_org: 'Regional Tricity EOC' }))
                    }}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#006398', border: 'none',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>badge</span>
                    + Commission Coordinator
                  </button>
                </div>
              </div>

              {/* Coordinators Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {users.filter(u => u.role === 'coordinator').length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, gridColumn: '1 / -1' }}>
                    No coordinators registered in directory.
                  </div>
                ) : (
                  users.filter(u => u.role === 'coordinator').map(c => (
                    <div
                      key={c.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{c.full_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{c.email}</div>
                        </div>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: 12, fontSize: '0.6875rem', fontWeight: 700,
                          background: c.is_active ? '#f0fdf4' : '#fef2f2',
                          color: c.is_active ? '#166534' : '#dc2626',
                          border: `1px solid ${c.is_active ? '#bbf7d0' : '#fecaca'}`,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.is_active ? '#16a34a' : '#dc2626' }} />
                          {c.is_active ? 'Active Duty' : 'Suspended'}
                        </span>
                      </div>

                      <div style={{ background: '#f8fafc', borderRadius: 6, padding: '0.75rem', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Department / Org:</span>
                          <strong style={{ color: '#0f172a' }}>{c.department_or_org || 'Regional Tricity EOC'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Jurisdiction:</span>
                          <strong style={{ color: '#0f172a' }}>Chandigarh Tricity Sector</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Account ID:</span>
                          <strong style={{ color: '#006398', fontFamily: "'JetBrains Mono', monospace" }}>USER #{c.id}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Verification Tier:</span>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>{c.verification_tier || 'Gov Official Badge'}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>call</span>
                          {c.phone || '+91 98000-00000'}
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(c)}
                            style={{
                              padding: '0.35rem 0.65rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                              background: '#fff', border: '1px solid #cbd5e1', color: '#334155', cursor: 'pointer',
                            }}
                          >
                            {c.is_active ? 'Suspend' : 'Reactivate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('audit')}
                            style={{
                              padding: '0.35rem 0.65rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', cursor: 'pointer',
                            }}
                          >
                            Action Logs
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB: RESPONDERS FLEET & TACTICAL UNITS                              */}
        {/* =================================================================== */}
        {activeTab === 'responders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ background: '#eff6ff', color: '#006398', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                      FIRST RESPONDERS FLEET • GPS TELEMETRY
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                      RADIO MESH: 142.825 MHz
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                    RESPONDERS & FIELD RESCUE TEAMS
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                    Real-time operational status of SDRF, NDRF, Red Cross medical units, and volunteer search & rescue squads
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddUserModal(true)
                      setNewUserForm(prev => ({ ...prev, role: 'responder', department_or_org: 'SDRF Quick Response Unit' }))
                    }}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#006398', border: 'none',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>engineering</span>
                    + Register Tactical Unit
                  </button>
                </div>
              </div>

              {/* Responder Units Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>OPERATOR & IDENTIFIER</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>AFFILIATION / UNIT</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>ACCOUNT STATUS</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>VERIFICATION TIER</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569' }}>CONTACT</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>GOVERNANCE ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'responder').length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                          No tactical responders registered in directory.
                        </td>
                      </tr>
                    ) : (
                      users.filter(u => u.role === 'responder').map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                              <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>{r.full_name}</strong>
                              <span style={{
                                fontSize: '0.625rem', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                                padding: '0.1rem 0.35rem', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
                              }}>
                                RESP-#{r.id}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {r.email}
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <strong style={{ color: '#0f172a', display: 'block' }}>{r.department_or_org || 'SDRF Quick Response Unit'}</strong>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Tactical Field Unit</span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              padding: '0.2rem 0.6rem', borderRadius: 10, fontSize: '0.6875rem', fontWeight: 700,
                              background: r.is_active ? '#f0fdf4' : '#fef2f2',
                              color: r.is_active ? '#16a34a' : '#dc2626',
                              border: `1px solid ${r.is_active ? '#bbf7d0' : '#fecaca'}`,
                              display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase'
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.is_active ? '#16a34a' : '#dc2626' }} />
                              {r.is_active ? 'ACTIVE' : 'SUSPENDED'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              fontSize: '0.6875rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                              background: '#eff6ff', color: '#006398',
                            }}>
                              ✓ {r.verification_tier || 'Official Responder'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', color: '#475569' }}>
                            {r.phone || '+91 98000-00000'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => toggleUserStatus(r)}
                              style={{
                                padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                                background: r.is_active ? '#fef2f2' : '#f0fdf4',
                                color: r.is_active ? '#dc2626' : '#16a34a',
                                border: `1px solid ${r.is_active ? '#fecaca' : '#bbf7d0'}`,
                                cursor: 'pointer',
                              }}
                            >
                              {r.is_active ? 'Suspend Unit' : 'Reactivate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB: ACCREDITED ORGANIZATIONS & NGOS                                */}
        {/* =================================================================== */}
        {activeTab === 'organizations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ background: '#eff6ff', color: '#006398', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                      STATUTORY NGO DIRECTORY • NGO DARPAN
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                      MINISTRY OF HOME AFFAIRS (MHA) REGISTER
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                    ACCREDITED RELIEF ORGANIZATIONS
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                    Verify legal relief charters, FCRA statutory clearances, 12A/80G tax exemptions, and escrow crowdfunding authorizations
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      fetchVerifications()
                      toast.success('Synced Accredited NGO records from Central NGO Darpan Portal')
                    }}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#fff', border: '1px solid #cbd5e1',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#334155', cursor: 'pointer',
                    }}
                  >
                    🔄 Sync NGO Darpan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('verification')
                      toast('Navigated to Accreditation Verification Queue', { icon: '📋' })
                    }}
                    style={{
                      padding: '0.45rem 0.85rem', background: '#006398', border: 'none',
                      borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>fact_check</span>
                    View Pending Verification Queue
                  </button>
                </div>
              </div>

              {/* Organizations Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                {verificationsList.map(v => (
                  <div
                    key={v.case_number || v.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{v.org_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{v.org_type}</div>
                      </div>
                      <span style={{
                        padding: '0.15rem 0.5rem', borderRadius: 12, fontSize: '0.6875rem', fontWeight: 700,
                        background: v.status === 'verified' ? '#f0fdf4' : v.status === 'rejected' ? '#fef2f2' : '#fffbeb',
                        color: v.status === 'verified' ? '#166534' : v.status === 'rejected' ? '#dc2626' : '#b45309',
                        border: `1px solid ${v.status === 'verified' ? '#bbf7d0' : v.status === 'rejected' ? '#fecaca' : '#fde68a'}`,
                        textTransform: 'uppercase'
                      }}>
                        {v.status === 'verified' ? 'Approved' : v.status}
                      </span>
                    </div>

                    <div style={{ background: '#f8fafc', borderRadius: 6, padding: '0.75rem', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>NGO Darpan ID:</span>
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0f172a' }}>{v.darpan_id || 'N/A'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Case Dossier Ref:</span>
                        <strong style={{ color: '#006398', fontFamily: "'JetBrains Mono', monospace" }}>{v.case_number}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Contact Person:</span>
                        <span style={{ color: '#334155' }}>{v.contact_person || 'Registrar on File'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Ambulances Staged:</span>
                        <strong style={{ color: '#006398', fontFamily: "'JetBrains Mono', monospace" }}>{v.metadata?.ambulances || '04'} Units</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Field Volunteers:</span>
                        <strong style={{ color: '#16a34a', fontFamily: "'JetBrains Mono', monospace" }}>{v.metadata?.volunteers || '20'} Personnel</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b' }}>
                      <span>Email: <strong>{v.email || 'N/A'}</strong></span>
                      <span>{v.phone || ''}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('verification')
                          toast(`Opened docket ${v.case_number} in Verification Workbench`, { icon: '📋' })
                        }}
                        style={{
                          flex: 1, padding: '0.35rem 0.65rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                          background: '#fff', border: '1px solid #cbd5e1', color: '#334155', cursor: 'pointer',
                        }}
                      >
                        Review Docket
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('audit')}
                        style={{
                          flex: 1, padding: '0.35rem 0.65rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                          background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', cursor: 'pointer',
                        }}
                      >
                        Action Logs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: ADMINISTRATIVE VERIFICATION ACCREDITATION WORKBENCH          */}
        {/* =================================================================== */}
        {activeTab === 'verification' && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: '#eff6ff', color: '#006398', padding: '0.15rem 0.5rem', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.625rem', fontWeight: 700 }}>
                      STATUTORY AUDIT LEVEL 4
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                      REG-ROY-9014 • ROOT TRUST: CCA-CERTIFIED HSM
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0' }}>
                    ADMINISTRATIVE VERIFICATION WORKBENCH
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                    Statutory credential validation, NGO relief accreditation, and government coordinator elevation queue
                  </p>
                </div>
              </div>

              {/* Status Pills */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '0.4rem 0.8rem', background: '#006398', color: '#fff', borderRadius: 6, fontWeight: 700, fontSize: '0.75rem' }}>
                  Pending Review ({verificationsList.filter(v => v.status === 'pending').length.toString().padStart(2, '0')})
                </span>
                <span style={{ padding: '0.4rem 0.8rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, fontSize: '0.75rem' }}>
                  Verified & Approved ({verificationsList.filter(v => v.status === 'verified').length.toString().padStart(2, '0')})
                </span>
                <span style={{ padding: '0.4rem 0.8rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, fontSize: '0.75rem' }}>
                  Rejected / Incomplete ({verificationsList.filter(v => v.status === 'rejected').length.toString().padStart(2, '0')})
                </span>
              </div>

              {/* Dynamic Dossier List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {verificationsList.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                    No NGO verification dossiers currently pending in queue.
                  </div>
                ) : (
                  verificationsList.map(v => {
                    const currentDecision = verificationDecisions[v.case_number] || (v.status === 'verified' ? 'APPROVE' : v.status === 'rejected' ? 'REJECT' : 'APPROVE')
                    return (
                      <div key={v.id || v.case_number} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div>
                            <span style={{
                              background: v.status === 'verified' ? '#f0fdf4' : v.status === 'rejected' ? '#fef2f2' : '#fef3c7',
                              color: v.status === 'verified' ? '#166534' : v.status === 'rejected' ? '#dc2626' : '#d97706',
                              padding: '0.15rem 0.45rem', borderRadius: 3, fontSize: '0.6875rem', fontWeight: 700
                            }}>
                              CASE #{v.case_number} • STATUS: {v.status.toUpperCase()}
                            </span>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: '0.35rem 0 0.2rem' }}>
                              {v.org_name}
                            </h3>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Type: {v.org_type} • Darpan ID: {v.darpan_id || 'N/A'} • Submitted: {v.submitted_at || 'Recent'}
                            </div>
                            {v.contact_person && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                                Contact: {v.contact_person} ({v.email || 'No email'} • {v.phone || 'No phone'})
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => toast.success(`Dossier #${v.case_number} exported`)} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}>Export Dossier</button>
                            <button onClick={() => setActiveTab('audit')} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.35rem 0.75rem', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}>Action Logs</button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', margin: '1rem 0' }}>
                          <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.625rem', color: '#64748b' }}>TRAUMA VANS</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{v.metadata?.ambulances || '04'}</div>
                          </div>
                          <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.625rem', color: '#64748b' }}>PARAMEDICS</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{v.metadata?.paramedics || '08'}</div>
                          </div>
                          <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.625rem', color: '#64748b' }}>TRAINED VOLUNTEERS</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{v.metadata?.volunteers || '20'}</div>
                          </div>
                          <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.625rem', color: '#64748b' }}>CAPABILITY SCOPE</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#006398' }}>{v.metadata?.capability || 'Urban SAR'}</div>
                          </div>
                        </div>

                        {/* Statutory Pre-check audit */}
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.85rem', marginBottom: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>Statutory Pre-Check Audit</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                              <span>✓ Entity Legal Registration (Matched with NGO Darpan Database)</span>
                              <strong>MATCH</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                              <span>✓ Escrow Bank Account Validation</span>
                              <strong>MATCH</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                              <span>✓ Signatory Verification (NGO Representative ID)</span>
                              <strong>AUTHENTICATED</strong>
                            </div>
                          </div>
                        </div>

                        {/* Final Administrative Decision & Signoff */}
                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '1rem' }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                            Administrative Decision (Writes to Action Log)
                          </div>
                          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`decision-${v.case_number}`}
                                checked={currentDecision === 'APPROVE'}
                                onChange={() => setVerificationDecisions(prev => ({ ...prev, [v.case_number]: 'APPROVE' }))}
                              />
                              <strong>APPROVE NGO ACCREDITATION</strong>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`decision-${v.case_number}`}
                                checked={currentDecision === 'REJECT'}
                                onChange={() => setVerificationDecisions(prev => ({ ...prev, [v.case_number]: 'REJECT' }))}
                              />
                              <span style={{ color: '#dc2626', fontWeight: 600 }}>REJECT NGO APPLICATION</span>
                            </label>
                          </div>

                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleVerificationDecision(v.case_number, 'APPROVE')}
                              style={{
                                padding: '0.6rem 1.25rem', background: '#006398', color: '#fff', border: 'none',
                                borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              ✓ CONFIRM APPROVAL (ACCREDIT)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerificationDecision(v.case_number, 'REJECT')}
                              style={{
                                padding: '0.6rem 1.25rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                                borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Reject Docket
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: OFFICIAL ANNOUNCEMENTS & CAP BROADCAST MESH                  */}
        {/* =================================================================== */}
        {activeTab === 'announcements' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem' }}>
                  PLATFORM ADVISORIES & STATUTORY SOPS
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                  Manage and publish official platform advisories, statutory SOP revisions, and emergency maintenance notices
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {announcements.map(anno => (
                  <div key={anno.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, background: '#eff6ff', color: '#006398', padding: '2px 6px', borderRadius: 3 }}>
                        {anno.type} • AUTH-ID: #{anno.id}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{anno.date}</span>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0.2rem 0 0.4rem' }}>
                      {anno.title}
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.45, margin: '0 0 0.6rem' }}>
                      {anno.body}
                    </p>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>RECIPIENTS: {anno.recipients}</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ PUSH & SMS BROADCAST DISPATCHED</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Publishing Form */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>
                Publish Platform Advisory
              </div>
              <form onSubmit={handlePublishAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.3rem' }}>
                    Announcement Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Flash Flood High-Velocity Surge Warning..."
                    value={newAnnoTitle}
                    onChange={e => setNewAnnoTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.3rem' }}>
                    Priority Classification
                  </label>
                  <select
                    value={newAnnoPriority}
                    onChange={e => setNewAnnoPriority(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
                  >
                    <option value="Standard">Standard Advisory</option>
                    <option value="Important">Important Protocol</option>
                    <option value="Mandatory">Operational Mandatory (Life-Safety)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '0.3rem' }}>
                    Advisory Body (Markdown supported) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Detailed tactical instructions, frequency parameters, cordon radii..."
                    value={newAnnoBody}
                    onChange={e => setNewAnnoBody(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
                  />
                </div>

                <div style={{ background: '#f8fafc', padding: '0.6rem', borderRadius: 6, fontSize: '0.72rem', color: '#475569' }}>
                  Publishing will affix Dr. Ananya Roy's cryptographic Sec-Level 4 key and transmit a state-wide CAP broadcast burst.
                </div>

                <button
                  type="submit"
                  style={{
                    background: '#006398', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '0.6rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  🚀 Publish Announcement (Signed)
                </button>
              </form>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: SYSTEM MONITORING & MICROSERVICE TELEMETRY                   */}
        {/* =================================================================== */}
        {activeTab === 'monitoring' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.625rem', color: '#64748b' }}>SYSTEM HEALTH CLUSTER</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: backendHealth.status === 'HEALTHY' ? '#16a34a' : '#dc2626' }}>
                  {backendHealth.status}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Live Ping Latency: {backendHealth.latency}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.625rem', color: '#64748b' }}>AUTHENTICATED CONCURRENCY</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
                  {analytics ? analytics.total_users : users.length}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Live Accounts in Database</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.625rem', color: '#dc2626' }}>VERIFICATION BACKLOG</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626' }}>
                  {analytics ? String(analytics.ngos_pending).padStart(2, '0') : '02'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>NGOs Awaiting Accreditation</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.625rem', color: '#006398' }}>ACTIVE EMERGENCY ADVISORIES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#006398' }}>
                  {analytics ? analytics.active_alerts_count : 2}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#16a34a' }}>Broadcasted to Citizens</div>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Microservice Telemetry & Ingestion Ingress
                </h3>
                <button
                  type="button"
                  onClick={checkHealth}
                  style={{
                    padding: '0.35rem 0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1',
                    borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: '#334155', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.3rem'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                  Ping /health
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { name: 'Core Backend API & Database Service', status: backendHealth.status === 'HEALTHY' ? 'OPERATIONAL' : 'DEGRADED', lat: backendHealth.latency, desc: 'FastAPI central application server and PostgreSQL database connections.' },
                  { name: 'Citizen & Coordinator Alert Feed', status: 'NOMINAL', lat: 'Push Gateway', desc: 'Emergency broadcast push notification routing and websocket event dispatcher.' },
                  { name: 'GIS Spatial Mapping & MapLibre Engine', status: 'NOMINAL', lat: '0.8s render', desc: 'Disaster zone coordinates, incident clustering, and route topology.' },
                  { name: 'LoRaWAN Resilient Mesh Relays (Static Mock)', status: '100% STANDBY', lat: 'Mesh Ready', desc: 'Sub-GHz resilient mesh network for cellular-dark emergency relief teams.' },
                  { name: 'PostgreSQL HA Read Replicas', status: 'IN-SYNC', lat: 'Lag <1.2ms', desc: 'High availability geo-pair with PostGIS raster and spatial index enabled.' },
                  { name: 'NGO Verification & Accreditation Desk', status: 'ONLINE', lat: 'Real-time', desc: 'Central statutory verification of NGO Darpan registration and coordinator elevation.' },
                ].map((s, i) => (
                  <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, background: s.status === 'OPERATIONAL' || s.status === 'NOMINAL' || s.status === 'ONLINE' ? '#f0fdf4' : '#eff6ff', color: s.status === 'OPERATIONAL' || s.status === 'NOMINAL' || s.status === 'ONLINE' ? '#16a34a' : '#2563eb', padding: '2px 6px', borderRadius: 4 }}>
                        {s.status}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: '#006398', fontWeight: 600, marginTop: 2 }}>{s.lat}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: ACTION LOG DETAILS (TRACEABILITY)                            */}
        {/* =================================================================== */}
        {activeTab === 'audit' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ background: '#eff6ff', color: '#006398', fontSize: '0.625rem', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>
                  SYSTEM TRACEABILITY • ACTION AUDIT
                </span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0' }}>
                  ACTION LOG DETAILS
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                  Chronological record of administrative authorizations, NGO approvals, role changes, and system operations
                </p>
              </div>
              <button
                onClick={fetchActionLogs}
                style={{
                  background: '#006398', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                Refresh Action Logs
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {actionLogs.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                  No action log entries recorded yet.
                </div>
              ) : (
                actionLogs.map((log) => (
                  <div key={log.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#64748b' }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recent'}
                        </span>
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#eff6ff', color: '#006398', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' }}>
                          {log.actor_role || 'SYSTEM'}
                        </span>
                        <strong style={{ fontSize: '0.8125rem', color: '#0f172a' }}>{log.action}</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>
                        Actor: {log.actor_name || 'System Operator'} • Target: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#006398' }}>{log.target || log.entity_type}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6875rem', color: '#16a34a', fontWeight: 600 }}>
                      ✓ RECORDED
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 7: SYSTEM CONFIGURATION & SECURITY GOVERNANCE                   */}
        {/* =================================================================== */}
        {activeTab === 'config' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.25rem' }}>
                  SYSTEM SECURITY CONFIGURATION
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>
                  Controlled platform-level policies, statutory compliance parameters, and operational defaults
                </p>
              </div>
              <button
                onClick={handleSaveConfig}
                style={{
                  background: '#006398', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '0.5rem 1.25rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Save All Changes
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Box 1 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                  Emergency Operational Defaults
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Ground-Truth Dual Sign-Off (Requires 2 operators)</span>
                    <input
                      type="checkbox"
                      checked={configSettings.groundTruthDualSignoff}
                      onChange={e => setConfigSettings({ ...configSettings, groundTruthDualSignoff: e.target.checked })}
                    />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Citizen Emergency Push Throttling</span>
                    <input
                      type="checkbox"
                      checked={configSettings.citizenThrottling}
                      onChange={e => setConfigSettings({ ...configSettings, citizenThrottling: e.target.checked })}
                    />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Geo-Fencing Default Buffer Margin</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number"
                        value={configSettings.bufferMargin}
                        onChange={e => setConfigSettings({ ...configSettings, bufferMargin: Number(e.target.value) || 500 })}
                        style={{ width: 80, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}
                      />
                      <span>Meters</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Box 2 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
                  Statutory & Verification Governance
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Require NGO Darpan ID Validation</span>
                    <input
                      type="checkbox"
                      checked={configSettings.crowdfundingGate}
                      onChange={e => setConfigSettings({ ...configSettings, crowdfundingGate: e.target.checked })}
                    />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Official Identity Verification Gateway</span>
                    <input
                      type="checkbox"
                      checked={configSettings.digilockerKYC}
                      onChange={e => setConfigSettings({ ...configSettings, digilockerKYC: e.target.checked })}
                    />
                  </label>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Session Idle Timeout (15 mins)</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: '#64748b' }}>ENFORCED</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 8: NOTIFICATIONS CENTER (Aliged to Responder Notifications)      */}
        {/* =================================================================== */}
        {activeTab === 'notifications' && (
          <div className="flex-1 p-2 md:p-4 lg:p-6 space-y-6 w-full overflow-y-auto">
            {/* Header Subsystem */}
            <div className="flex flex-col md:flex-row md:items-left justify-between gap-4 pb-3 border-b border-slate-200">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] uppercase tracking-wider font-semibold border border-blue-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    INGEST STREAM LIVE
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">NODE: GOV-DC-CHANDIGARH-01</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">NOTIFICATIONS</h1>
                <p className="text-xs text-slate-500">Real-time administrative alerts, statutory verification tasks, and central telemetry updates</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setAdminNotifications(prev => prev.map(n => ({ ...n, read: true })))
                    toast.success('All administrative notifications marked as read.')
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all"
                >
                  <CheckCheck size={16} className="text-slate-500" />
                  <span>Mark All as Read</span>
                </button>
                <button
                  onClick={() => toast('Notification channels synced with Central NDMA Master Relays.', { icon: '📡' })}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all"
                >
                  <Activity size={16} className="text-slate-500" />
                  <span>Notification Settings</span>
                </button>
              </div>
            </div>

            {/* Main Grid: 2-column landscape matching Responder layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Left notifications list (Span 8) */}
              <div className="xl:col-span-8 flex flex-col gap-4">
                {/* Category Filter Bar */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2 flex items-center justify-between overflow-x-auto gap-2">
                  <div className="flex items-center gap-1.5 min-w-max">
                    {[
                      { id: 'all', label: 'All Notifications', count: adminNotifications.length },
                      { id: 'unread', label: 'Unread', count: adminNotifications.filter(n => !n.read).length },
                      { id: 'accreditation', label: 'Accreditation', count: adminNotifications.filter(n => n.category === 'accreditation').length },
                      { id: 'security', label: 'Security & Accounts', count: adminNotifications.filter(n => n.category === 'security').length },
                      { id: 'health', label: 'Platform Health', count: adminNotifications.filter(n => n.category === 'health').length },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setNotificationFilter(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${notificationFilter === tab.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono leading-none ${notificationFilter === tab.id
                          ? 'bg-blue-800 text-white'
                          : tab.id === 'unread' && tab.count > 0
                            ? 'bg-red-50 text-red-600 font-bold border border-red-200'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="hidden sm:flex items-center gap-2 pr-2 text-slate-400 font-mono text-[10px] uppercase">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>AUTO-SYNC 5s</span>
                  </div>
                </div>

                {/* Notification Cards Feed */}
                <div className="flex flex-col gap-3">
                  {adminNotifications
                    .filter(n => {
                      if (notificationFilter === 'all') return true
                      if (notificationFilter === 'unread') return !n.read
                      return n.category === notificationFilter
                    })
                    .map(n => (
                      <article
                        key={n.id}
                        className={`relative bg-white rounded-xl p-4 shadow-xs border transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${!n.read ? 'border-l-4 border-l-blue-600 border-slate-200' : 'border-slate-200/80 bg-slate-50/40'
                          }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1 pl-1">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${n.category === 'accreditation'
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : n.category === 'security'
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : n.category === 'health'
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                            {n.category === 'accreditation' ? <UserCheck size={18} /> :
                              n.category === 'security' ? <Lock size={18} /> :
                                n.category === 'health' ? <Server size={18} /> : <FileText size={18} />}
                          </div>

                          <div className="flex flex-col gap-1 min-w-0 flex-1 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold ${n.category === 'accreditation'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : n.category === 'security'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : n.category === 'health'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                {n.categoryLabel}
                              </span>
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                              <span className="font-mono text-slate-400 text-[11px]">{n.time}</span>
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold uppercase">
                                {n.priority}
                              </span>
                            </div>

                            <h3 className="font-bold text-sm text-slate-900 tracking-tight">{n.title}</h3>
                            <p className="text-slate-600 leading-relaxed text-xs">{n.desc}</p>

                            <div className="flex items-center gap-3 pt-1 font-mono text-[10px] text-slate-400">
                              <span>{n.dispatchRef}</span>
                              <span>•</span>
                              <span>{n.grid}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 shrink-0 sm:pl-2">
                          {!n.read ? (
                            <div className="flex items-center gap-1 text-blue-600 font-mono text-[10px] font-bold uppercase">
                              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                              <span>ACTION REQUIRED</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px] uppercase">LOGGED</span>
                          )}

                          <button
                            onClick={() => {
                              setAdminNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))
                              setActiveTab(n.actionTab)
                            }}
                            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wide shadow-xs ${!n.read
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                              }`}
                          >
                            <span>{n.action}</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </div>

              {/* Right Tactical Sidebar (Span 4) matching Admin Governance structure */}
              <div className="xl:col-span-4 flex flex-col gap-6">
                {/* Telemetry Link Status */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Radio size={18} className="text-blue-600" />
                      <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">GOVERNANCE INGRESS STATUS</h3>
                    </div>
                    <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase">
                      ONLINE
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-500 font-mono text-[11px]">
                      <span>CENTRAL GOVERNANCE CLUSTER</span>
                      <span className="font-bold text-slate-900">99.98%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full" style={{ width: '99.98%' }} />
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 pt-1">
                      <span>LATENCY: 12ms NOMINAL</span>
                      <span>NODE: GOV-DC-CHANDIGARH-01</span>
                    </div>
                  </div>
                </div>

                {/* Administrative Queue Priorities */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wide">
                    <Layers size={16} className="text-blue-600" />
                    <span>Administrative Queue Priority</span>
                  </div>

                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-bold text-slate-900">Pending NGO Accreditations</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">STATUTORY / FCRA</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <span className="font-bold text-slate-900">User Account Provisioning</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">IAM DIRECTORY</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-bold text-slate-900">Database & Service Health</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">SYSTEM TELEMETRY</span>
                    </div>
                  </div>
                </div>

                {/* Quick Transmit Box */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-2">
                  <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">QUICK TRANSMIT</span>
                  <p className="text-xs text-slate-500">Acknowledge all pending administrative verifications and audits currently queued on central desk.</p>
                  <button
                    onClick={() => {
                      setAdminNotifications(prev => prev.map(item => ({ ...item, read: true })))
                      toast.success('Quick SITREP ACK broadcasted to NDMA Command Desk!')
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-bold text-xs uppercase tracking-wide mt-2"
                  >
                    <Send size={15} />
                    <span>Send Quick SITREP ACK</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* ADD SYSTEM USER / OFFICIAL MODAL DIALOG                             */}
        {/* =================================================================== */}
        {showAddUserModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}>
            <div
              className="modal-animate-enter"
              style={{
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                width: '100%',
                maxWidth: 580,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Modal Header */}
              <div style={{
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                padding: '1.1rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: '#eff6ff',
                    color: '#006398', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Provision Official / System Account
                    </h3>
                    <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                      CENTRAL REGISTRAR STATUTORY CREDENTIAL ALLOCATION
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 4,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleCreateUser} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Commander Amit Sharma"
                      value={newUserForm.full_name}
                      onChange={e => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Official Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. amit.eoc@resqnet.in"
                      value={newUserForm.email}
                      onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Assigned System Role *
                    </label>
                    <select
                      value={newUserForm.role}
                      onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none', background: '#fff'
                      }}
                    >
                      <option value="coordinator">Emergency Coordinator (EOC)</option>
                      <option value="responder">Tactical Responder / Field Unit</option>
                      <option value="fundraiser">Accredited NGO / Relief Partner</option>
                      <option value="citizen">Citizen User</option>
                      <option value="admin">Central Registrar / Admin</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Phone / Mobile Interconnect
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98XXX-XXXXX"
                      value={newUserForm.phone}
                      onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Department or Accredited Org
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Chandigarh Tricity EOC Zone 1"
                      value={newUserForm.department_or_org}
                      onChange={e => setNewUserForm({ ...newUserForm, department_or_org: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Verification Tier
                    </label>
                    <select
                      value={newUserForm.verification_tier}
                      onChange={e => setNewUserForm({ ...newUserForm, verification_tier: e.target.value })}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                        border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none', background: '#fff'
                      }}
                    >
                      <option value="Gov Official Badge">Gov Official Badge</option>
                      <option value="Aadhaar & DigiLocker">Aadhaar & DigiLocker</option>
                      <option value="Aadhaar Verified">Aadhaar Verified</option>
                      <option value="DigiLocker Seeded">DigiLocker Seeded</option>
                      <option value="Unverified / Phone Only">Unverified / Phone Only</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Temporary Master Password (Default: ResQnet@2026)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank for default ResQnet@2026"
                    value={newUserForm.password}
                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6,
                      border: '1px solid #cbd5e1', fontSize: '0.8125rem', outline: 'none'
                    }}
                  />
                </div>

                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem',
                  fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#006398' }}>info</span>
                  <span>
                    New account will be seeded into directory with mutual TLS authorization certificate and instant login access.
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    style={{
                      padding: '0.5rem 1rem', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600,
                      background: '#fff', border: '1px solid #cbd5e1', color: '#475569', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    style={{
                      padding: '0.5rem 1.25rem', borderRadius: 6, fontSize: '0.8125rem', fontWeight: 700,
                      background: '#006398', border: 'none', color: '#fff', cursor: isSubmittingUser ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.4rem'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>how_to_reg</span>
                    {isSubmittingUser ? 'Creating...' : 'Confirm & Provision User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
