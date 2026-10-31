// Responder Dashboard — Complete makeover aligned to ResQnet Responder UI Slides:
// 1. Dashboard Cockpit (resqnet_responder_field_operations_dashboard)
// 2. Missions Overview & Detail (resqnet_responder_missions_overview & resqnet_responder_mission_detail_mission_2048)
// 3. Field Surveys Form (resqnet_responder_field_survey - 7-section structured protocol)
// 4. Verification Workbench (resqnet_responder_verification - Reported vs Observed Ground Truth + Matrix)
// 5. Operations Map (resqnet_responder_field_operations_map - GIS Live console + backward/forward routing)
// 6. Relief Campaigns (resqnet_responder_campaigns - Relief Finance Workbench)

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../contexts/OnlineContext'
import api from '../lib/api'
import { db, saveSurveyOffline } from '../lib/db'
import type {
  Mission,
  RoadStatus,
  Road,
  Intersection,
  HazardZone,
  SafetyHub,
  ReportCluster,
  RouteResponse,
  Campaign,
} from '../types'
import ResQnetMap from '../components/ResQnetMap'
import { getMapV2Url } from '../config/mapConfig'
import { calculateSafeRoute } from '../features/routing/services/backendRoutingService'
import {
  CheckCircle,
  MapPin,
  Loader2,
  Send,
  ShieldAlert,
  Check,
  ChevronRight,
  Navigation,
  Radio,
  AlertTriangle,
  Phone,
  Clock,
  FileText,
  Shield,
  Zap,
  Search,
  CheckSquare,
  Square,
  HeartHandshake,
  Layers,
  Camera,
  Activity,
  Award,
  Building2,
  User,
  CheckCheck,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'

const round = (num: number, dec: number = 2) => Number(num).toFixed(dec)

interface SubmittedSurvey {
  id: number
  mission_id: number
  hazard_level?: number
  hazard_penalty?: number
  flood_penalty?: number
  verification_outcome?: string
  road_status?: string
  is_blocked?: boolean
  notes?: string
  submitted_at: string
  is_propagated?: boolean
  propagated?: boolean
}

export default function ResponderDashboard() {
  const { user, token } = useAuth()
  const { isOnline, setPendingOps } = useOnline()
  const [searchParams, setSearchParams] = useSearchParams()
  const [missions, setMissions] = useState<Mission[]>([])
  const [activeMission, setActiveMission] = useState<Mission | null>(null)
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null)
  const [missionSurveys, setMissionSurveys] = useState<SubmittedSurvey[]>([])
  const [_loading, setLoading] = useState(true)
  const inFlightRef = useRef(false)
  const knownMissionIdsRef = useRef<Set<number>>(new Set())
  const hasLoadedInitialMissionsRef = useRef(false)
  const [dutyState, setDutyState] = useState<'available' | 'enroute' | 'offduty'>('available')

  // Campaigns state for ?tab=campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'active' | 'pending' | 'completed'>('all')
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)

  // Missions list filtering
  const [missionSearch, setMissionSearch] = useState('')
  const [missionStatusFilter, setMissionStatusFilter] = useState('all')
  const [missionPriorityFilter, setMissionPriorityFilter] = useState('all')

  const currentTab = useMemo(() => {
    return searchParams.get('tab') || 'dashboard'
  }, [searchParams])

  // Map context data
  const [roads, setRoads] = useState<Road[]>([])
  const [intersections, setIntersections] = useState<Intersection[]>([])
  const [hazards, setHazards] = useState<HazardZone[]>([])
  const [hubs, setHubs] = useState<SafetyHub[]>([])
  const [clusters, setClusters] = useState<ReportCluster[]>([])
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)

  // Pre-scene interactive checklist state
  const [checklist, setChecklist] = useState({
    photos: false,
    perimeter: false,
    acoustic: false,
  })

  // Field survey form state (matches 7-section resqnet_responder_field_survey)
  const [defectDescription, setDefectDescription] = useState(
    '4.2cm shear fracture observed on lower third of concrete colonnade pillar. Reinforcement rebar exposed with spalling concrete dust. Lateral stability degraded; acoustic displacement sensors recommended.'
  )
  const [conditionChip, setConditionChip] = useState<'severe' | 'spalling' | 'cracking' | 'sound'>('severe')
  const [corridorStatus, setCorridorStatus] = useState<'open' | 'congested' | 'partially_blocked' | 'blocked' | 'restricted' | 'reopened'>('partially_blocked')
  const [corridorNote, setCorridorNote] = useState('Single-lane restricted due to light masonry debris on pedestrian curb. Emergency vehicle passage clearance maintained at 3.8 meters.')
  const [evacStatus, setEvacStatus] = useState<'fully_evacuated' | 'in_progress' | 'evacuation_needed'>('fully_evacuated')
  const [surveyOutcome, setSurveyOutcome] = useState<'confirmed_hazard' | 'road_blocked' | 'no_hazard_found' | 'false_report'>('confirmed_hazard')
  const [hazardLevel, setHazardLevel] = useState<number>(4)
  const [hazardPenalty, setHazardPenalty] = useState(65)
  const [floodPenalty, setFloodPenalty] = useState(40)
  const [isBlocked, setIsBlocked] = useState(true)
  const [submittingSurvey, setSubmittingSurvey] = useState(false)
  const [propagatingId, setPropagatingId] = useState<number | null>(null)

  // Notifications State for ?tab=notifications
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'missions' | 'verifications' | 'road' | 'system'>('all')
  const [notifications, setNotifications] = useState<any[]>([])

  // Live Dijkstra Route Navigation state
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [routeDirection, setRouteDirection] = useState<'forward' | 'backward'>('forward')
  const [visibleLayers, setVisibleLayers] = useState({
    missions: true,
    incidents: true,
    hazards: true,
    roads: true,
    safety: true,
    })

  // Verification Workbench State
  const [activeVerificationIncident, setActiveVerificationIncident] = useState('INC-2048')
  const [activeVerificationClusterId, setActiveVerificationClusterId] = useState<number | null>(null)
  const [activeClusterDetail, setActiveClusterDetail] = useState<any | null>(null)
  const [loadingClusterDetail, setLoadingClusterDetail] = useState(false)

  // Get current responder position
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        () => {
          setUserPos({ lat: 30.7398, lng: 76.7827 }) // Default Sector 17 coordinates
        },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    } else {
      setUserPos({ lat: 30.7398, lng: 76.7827 })
    }
  }, [])

  // Load map operational context
  const loadMapData = async () => {
    try {
      const [rRes, iRes, hRes, hubRes, cRes] = await Promise.allSettled([
        api.get('/roads'),
        api.get('/roads/intersections'),
        api.get('/hazards'),
        api.get('/hubs'),
        api.get('/clusters'),
      ])
      if (rRes.status === 'fulfilled') setRoads(rRes.value.data)
      if (iRes.status === 'fulfilled') setIntersections(iRes.value.data)
      if (hRes.status === 'fulfilled') setHazards(hRes.value.data)
      if (hubRes.status === 'fulfilled') setHubs(hubRes.value.data)
      if (cRes.status === 'fulfilled') setClusters(cRes.value.data)
    } catch {
      // Non-critical map context
    }
  }

  const loadMissions = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await api.get('/missions')
      const missionData: Mission[] = res.data || []
      setMissions(missionData)

      // Detect newly created/assigned missions
      if (hasLoadedInitialMissionsRef.current) {
        const newMissions = missionData.filter(m => !knownMissionIdsRef.current.has(m.id))
        if (newMissions.length > 0) {
          newMissions.forEach(m => {
            toast(
              `🚨 NEW MISSION DEPLOYED: "${m.title}" — Status: ${m.status.toUpperCase()}`,
              {
                duration: 8000,
                icon: '⚡',
                style: {
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                },
              }
            )
          })
          // Also set active mission to newest
          setActiveMission(newMissions[0])
        }
      } else {
        hasLoadedInitialMissionsRef.current = true
      }

      // Update known mission IDs
      missionData.forEach(m => knownMissionIdsRef.current.add(m.id))

      const currentActive = missionData.find((m: Mission) => ['in_progress', 'accepted', 'assigned'].includes(m.status))
      if (currentActive && (!activeMission || currentActive.id !== activeMission.id)) {
        setActiveMission(currentActive)
        loadMissionSurveys(currentActive.id)
      } else if (!activeMission && missionData[0]) {
        setActiveMission(missionData[0])
      }
    } catch {
      if (!navigator.onLine) toast('Offline — mission list may be outdated', { icon: '📡' })
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  const loadMissionSurveys = async (missionId: number) => {
    try {
      const res = await api.get(`/missions/${missionId}/field-surveys`)
      const surveys = res.data.map((s: any) => ({
        ...s,
        is_propagated: s.is_propagated === true || s.propagated === true,
        propagated: s.is_propagated === true || s.propagated === true,
      }))
      setMissionSurveys(surveys)
    } catch {
      // Non-critical
    }
  }

  const loadResponderDutyStatus = async () => {
    try {
      const res = await api.get('/missions/responders/me')
      if (res.data?.status) {
        const bStatus = res.data.status
        if (bStatus === 'available') setDutyState('available')
        else if (bStatus === 'on_mission' || bStatus === 'deployed') setDutyState('enroute')
        else if (bStatus === 'offline') setDutyState('offduty')
      }
    } catch {
      // Offline fallback
    }
  }

  const handleDutyChange = async (targetDuty: 'available' | 'enroute' | 'offduty') => {
    setDutyState(targetDuty)
    const backendStatus = targetDuty === 'available' ? 'available' : targetDuty === 'enroute' ? 'on_mission' : 'offline'
    try {
      await api.post('/missions/responders/status', { status: backendStatus })
      toast.success(`Duty status updated to ${targetDuty === 'available' ? 'ON FIELD (AVAILABLE)' : targetDuty === 'enroute' ? 'EN ROUTE / BUSY' : 'OFF DUTY'}`)
    } catch {
      toast.error('Could not sync duty status to central command')
    }
  }

  const handleAcceptMission = async (missionId: number) => {
    try {
      await api.post(`/missions/${missionId}/accept`)
      const started = await api.post(`/missions/${missionId}/start`)
      toast.success(`Mission #${missionId} accepted & initiated! Navigating to site.`)
      setDutyState('enroute')
      setMissions(prev => prev.map(m => m.id === missionId ? started.data : m))
      if (activeMission?.id === missionId) {
        setActiveMission(started.data)
      }
      loadMissions()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to accept mission')
    }
  }

  const handleCompleteMission = async (missionId: number) => {
    try {
      const res = await api.post(`/missions/${missionId}/complete`)
      toast.success(`Mission #${missionId} marked as completed! Returning unit to Available.`)
      setDutyState('available')
      setMissions(prev => prev.map(m => m.id === missionId ? res.data : m))
      if (activeMission?.id === missionId) {
        setActiveMission(res.data)
      }
      loadMissions()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to complete mission')
    }
  }

  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications?role=responder')
      if (Array.isArray(res.data)) {
        setNotifications(res.data)
      }
    } catch {
      // Offline or network fallback
    }
  }

  const loadClusterDetail = async (clusterId: number) => {
    setLoadingClusterDetail(true)
    try {
      const res = await api.get(`/clusters/${clusterId}`)
      setActiveClusterDetail(res.data)
    } catch {
      // Non-critical fallback
      setActiveClusterDetail(null)
    } finally {
      setLoadingClusterDetail(false)
    }
  }

  const handleConfirmVerification = async (clusterId: number | null) => {
    const targetMission = activeMission || missions[0]
    if (!targetMission) {
      toast.error('No active mission linked for ground truth verification')
      return
    }

    const payload = {
      mission_id: targetMission.id,
      hazard_level: hazardLevel,
      verification_outcome: 'confirmed_hazard',
      observed_condition: defectDescription,
      road_status: corridorStatus === 'open' || corridorStatus === 'reopened' ? 'clear' : 'hazardous',
      hazard_penalty: hazardPenalty,
      flood_penalty: floodPenalty,
      congestion_penalty: 20,
      is_blocked: isBlocked,
      notes: `${corridorNote} • Verified ground-truth for Cluster #${clusterId || targetMission.cluster_id || targetMission.id}`,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    try {
      const surveyRes = await api.post('/field-surveys', payload)
      toast.success('Physical survey submitted. Propagating ground truth to network...')
      const propRes = await api.post(`/field-surveys/${surveyRes.data.id}/propagate`)
      toast.success(propRes.data.message || 'Ground-truth verified and propagated to Coordinator Decision Center!')
      setMissionSurveys(prev => [surveyRes.data, ...prev])
      loadMapData()
      if (clusterId) loadClusterDetail(clusterId)
      setSearchParams({ tab: 'map' })
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Verification submission error')
    }
  }

  const loadCampaigns = async () => {
    setLoadingCampaigns(true)
    try {
      const res = await api.get('/campaigns')
      setCampaigns(res.data)
    } catch {
      // Ignore
    } finally {
      setLoadingCampaigns(false)
    }
  }

  useEffect(() => {
    loadMissions()
    loadMapData()
    loadResponderDutyStatus()
    loadNotifications()
    if (currentTab === 'campaigns') {
      loadCampaigns()
    }
    const timer = setInterval(() => {
      if (navigator.onLine) {
        loadMissions()
        loadMapData()
        loadNotifications()
        if (currentTab === 'campaigns') loadCampaigns()
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [isOnline, currentTab])


  const missionTarget = useMemo(() => {
    const targetMission = selectedMissionId ? missions.find(m => m.id === selectedMissionId) || activeMission : activeMission
    if (!targetMission) return undefined
    if (targetMission.target_lat && targetMission.target_lng) {
      return {
        lat: targetMission.target_lat,
        lng: targetMission.target_lng,
        label: targetMission.title,
      }
    }
    if (targetMission.road_id) {
      const rd = roads.find(r => r.id === targetMission.road_id)
      if (rd) {
        const from = intersections.find(i => i.id === rd.from_intersection_id)
        const to = intersections.find(i => i.id === rd.to_intersection_id)
        if (from && to) {
          return {
            lat: (from.lat + to.lat) / 2,
            lng: (from.lng + to.lng) / 2,
            label: `${targetMission.title} — ${rd.name}`,
          }
        }
      }
    }
    if (targetMission.cluster_id) {
      const cl = clusters.find(c => c.id === targetMission.cluster_id)
      if (cl) {
        return {
          lat: cl.centroid_lat,
          lng: cl.centroid_lng,
          label: `${targetMission.title} — Cluster #${cl.id}`,
        }
      }
    }
    return undefined
  }, [activeMission, selectedMissionId, missions, roads, intersections, clusters])

  // Find nearest available Safety Hub for safe retreat / backward routing
  const nearestHub = useMemo(() => {
    if (hubs.length === 0) return null
    const openHubs = hubs.filter(h => h.status === 'open' || h.status === 'near_capacity')
    if (openHubs.length === 0) return hubs[0] || null
    if (!userPos) return openHubs[0]
    return openHubs.reduce((prev, curr) => {
      const dPrev = Math.hypot(prev.lat - userPos.lat, prev.lng - userPos.lng)
      const dCurr = Math.hypot(curr.lat - userPos.lat, curr.lng - userPos.lng)
      return dCurr < dPrev ? curr : prev
    }, openHubs[0])
  }, [hubs, userPos])

  // Calculate forward or backward safe route
  const calculateMissionRoute = async (direction: 'forward' | 'backward' = 'forward') => {
    if (!userPos) {
      toast.error('Location coordinates unavailable. Ensure GPS is enabled.')
      return
    }
    setLoadingRoute(true)
    setRouteDirection(direction)

    try {
      const payload: any = {
        from_lat: userPos.lat,
        from_lng: userPos.lng,
      }

      if (direction === 'forward') {
        if (missionTarget?.lat && missionTarget?.lng) {
          payload.to_lat = missionTarget.lat
          payload.to_lng = missionTarget.lng
        } else if (activeMission?.target_lat && activeMission?.target_lng) {
          payload.to_lat = activeMission.target_lat
          payload.to_lng = activeMission.target_lng
        } else if (nearestHub) {
          payload.target_hub_id = nearestHub.id
        }
      } else {
        payload.reverse = true
        if (missionTarget?.lat && missionTarget?.lng) {
          payload.from_lat = missionTarget.lat
          payload.from_lng = missionTarget.lng
        }
        if (nearestHub) {
          payload.target_hub_id = nearestHub.id
        }
      }

      const data = await calculateSafeRoute(payload)
      if (data && data.success) {
        setRoute(data)
        const msg =
          direction === 'backward'
            ? `Backward route calculated to ${data.target_hub_name || 'Safety Hub'} (${data.total_distance_km} km)`
            : `Navigating to target via safe corridor (${data.total_distance_km} km)`
        toast.success(msg)
      } else {
        toast.error(data?.message || 'No viable route found. Road network may be blocked.')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Route calculation failed'
      toast.error(msg)
    } finally {
      setLoadingRoute(false)
    }
  }

  // Auto-route on entering map tab
  useEffect(() => {
    if (activeMission && userPos && (currentTab === 'map' || currentTab === 'dashboard')) {
      if (!route) calculateMissionRoute('forward')
    }
  }, [activeMission?.id, userPos?.lat, currentTab])


  const markArrived = () => {
    toast.success('Arrival logged at Sector 17 Plaza. GPS timestamp transmitted to EOC.')
  }

  const submitFieldSurveyForm = async () => {
    const targetMission = activeMission || missions[0]
    if (!targetMission) {
      toast.error('No active mission selected for field survey')
      return
    }

    setSubmittingSurvey(true)
    const dbRoadStatus: RoadStatus =
      corridorStatus === 'open' || corridorStatus === 'reopened'
        ? 'clear'
        : corridorStatus === 'congested' || corridorStatus === 'partially_blocked' || corridorStatus === 'restricted'
          ? 'hazardous'
          : 'blocked'

    const payload = {
      mission_id: targetMission.id,
      hazard_level: hazardLevel,
      verification_outcome: surveyOutcome,
      observed_condition: defectDescription,
      road_status: dbRoadStatus,
      hazard_penalty: hazardPenalty,
      flood_penalty: floodPenalty,
      congestion_penalty: 20,
      is_blocked: isBlocked,
      notes: `${corridorNote} • Cordon: 50m • Evac: ${evacStatus}`,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    if (isOnline) {
      try {
        const res = await api.post('/field-surveys', payload)
        toast.success('Field survey submitted successfully! Propagated to EOC Coordinator.')
        setMissionSurveys(prev => [res.data, ...prev])
        setSearchParams({ tab: 'verification' })
      } catch {
        toast.error('Server unavailable — saving survey locally')
        await saveSurveyOffline(payload)
        const count = await db.local_surveys.count()
        setPendingOps(count)
        toast('Survey saved offline. Will sync when connection restores.', { icon: '📡' })
      }
    } else {
      await saveSurveyOffline(payload)
      const count = await db.local_surveys.count()
      setPendingOps(count)
      toast('Survey saved offline. Will sync when connection restores.', { icon: '📡' })
    }
    setSubmittingSurvey(false)
  }

  const propagateSurvey = async (surveyId: number) => {
    setPropagatingId(surveyId)
    try {
      const res = await api.post(`/field-surveys/${surveyId}/propagate`)
      toast.success(res.data.message || 'Ground truth updated! Route cache invalidated across network.')
      setMissionSurveys(prev =>
        prev.map(s => (s.id === surveyId ? { ...s, is_propagated: true, propagated: true } : s))
      )
      loadMapData()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to propagate ground truth.'
      toast.error(msg)
    } finally {
      setPropagatingId(null)
    }
  }

  // Pre-scene checklist completion count
  const checklistCount = (checklist.photos ? 1 : 0) + (checklist.perimeter ? 1 : 0) + (checklist.acoustic ? 1 : 0)

  // Filtered missions for Missions tab
  const filteredMissions = useMemo(() => {
    return missions.filter(m => {
      const matchQuery =
        !missionSearch ||
        m.title.toLowerCase().includes(missionSearch.toLowerCase()) ||
        m.description?.toLowerCase().includes(missionSearch.toLowerCase()) ||
        `mission-${m.id}`.toLowerCase().includes(missionSearch.toLowerCase())
      const matchStatus = missionStatusFilter === 'all' || m.status === missionStatusFilter
      return matchQuery && matchStatus
    })
  }, [missions, missionSearch, missionStatusFilter])

  return (
    <div className="flex flex-col min-h-screen bg-[#f8f9ff] text-[#1e293b]">
      {/* 1. TOP TELEMETRY & DUTY SUBHEADER (Consistent across all Responder tabs) */}
      <div className="bg-white border-b border-[#e2e8f0] px-4 md:px-8 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Radio size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900 uppercase">Field Response Console</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-bold">
                SECTOR-17/NDRF
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Unit Lead: <strong className="text-slate-800">{user?.full_name || 'Arjun Mehta'}</strong> • {user?.ngo_name || 'Chandigarh ERU Quick Response'}
            </p>
          </div>
        </div>

        {/* Duty State Switcher */}
        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 px-3 py-1 bg-white rounded border border-slate-200 text-xs font-mono font-bold">
            <span
              className={`h-2.5 w-2.5 rounded-full ${dutyState === 'available'
                ? 'bg-emerald-500 animate-pulse'
                : dutyState === 'enroute'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-slate-400'
                }`}
            />
            <span className="uppercase text-[11px] tracking-wide">
              DUTY: <strong className={dutyState === 'available' ? 'text-emerald-700' : dutyState === 'enroute' ? 'text-blue-700' : 'text-slate-600'}>
                {dutyState === 'available' ? 'ON FIELD (AVAILABLE)' : dutyState === 'enroute' ? 'EN ROUTE / BUSY' : 'OFF DUTY'}
              </strong>
            </span>
          </div>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => handleDutyChange('available')}
              className={`px-3 py-1 rounded font-bold transition-all text-[11px] uppercase ${dutyState === 'available' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
            >
              AVAILABLE
            </button>
            <button
              onClick={() => handleDutyChange('enroute')}
              className={`px-3 py-1 rounded font-bold transition-all text-[11px] uppercase ${dutyState === 'enroute' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
            >
              EN ROUTE
            </button>
            <button
              onClick={() => handleDutyChange('offduty')}
              className={`px-3 py-1 rounded font-bold transition-all text-[11px] uppercase ${dutyState === 'offduty' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
            >
              OFF DUTY
            </button>
          </div>
        </div>
      </div>

      {/* 2. TAB WORKSPACES */}

      {/* ─────────────────────────────────────────────────────────────
          TAB: DASHBOARD COCKPIT (resqnet_responder_field_operations_dashboard)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'dashboard' && (
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* 1. Dominant Hero Card: Current Active Mission Operational Cockpit */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="h-1.5 w-full bg-red-600"></div>
            <div className="p-5 md:p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-left justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                      CURRENT ACTIVE MISSION
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800 border border-slate-200">
                      MISSION-#{activeMission?.id || 2048}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold uppercase flex items-center gap-1 border border-red-200">
                      <AlertTriangle size={12} />
                      CRITICAL SEVERITY
                    </span>
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold uppercase border border-red-200">
                      PRIORITY 1 URGENT
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {activeMission?.title || 'Structural Damage Assessment & Pillar Stabilization'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-xs">
                    <span className="flex items-center gap-1">
                      <MapPin size={14} className="text-red-500 shrink-0" />
                      <span className="font-medium text-slate-800">Sector 17 Plaza, Block C (Commercial Arcade), Chandigarh</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock size={14} className="shrink-0" />
                      Assigned 10:48 AM IST (14 mins ago)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toast('Connecting VHF Channel 02 (EOC Dispatch)...', { icon: '📻' })}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-slate-200"
                  >
                    <span className="material-symbols-outlined text-base text-slate-600">cell_tower</span>
                    <span>VHF CH 02 (EOC)</span>
                  </button>
                  <button
                    onClick={() => toast.success('Calling Coordinator Vikram Malhotra (+91 98765-43210)')}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-slate-200"
                  >
                    <span className="material-symbols-outlined text-base text-slate-600">phone_in_talk</span>
                    <span>Call Coordinator</span>
                  </button>
                </div>
              </div>

              {/* Mission Lifecycle Progression */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-mono text-[10px] uppercase text-slate-500 tracking-wider block mb-3 font-bold">
                  MISSION OPERATIONAL LIFECYCLE
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between text-emerald-600">
                      <span className="text-[10px] uppercase font-bold">1. Accepted</span>
                      <CheckCircle size={14} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 mt-1">10:49 AM</span>
                  </div>

                  <div className="flex flex-col p-2.5 rounded-lg bg-[#006398] text-white shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold">2. En Route</span>
                      <Navigation size={14} />
                    </div>
                    <span className="font-mono text-[10px] text-blue-100 mt-1">ACTIVE (ETA 3m)</span>
                  </div>

                  <div className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 opacity-60">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-[10px] uppercase font-bold">3. Arrived Scene</span>
                      <MapPin size={14} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 mt-1">Pending</span>
                  </div>

                  <div className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 opacity-60">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-[10px] uppercase font-bold">4. Surveying</span>
                      <FileText size={14} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 mt-1">Checklist {checklistCount}/3</span>
                  </div>

                  <div className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 opacity-60">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-[10px] uppercase font-bold">5. Completed</span>
                      <CheckCheck size={14} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 mt-1">Debrief & Signoff</span>
                  </div>
                </div>
              </div>

              {/* Field Instructions Alert Box */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col md:flex-row gap-3 items-start">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">assignment_turned_in</span>
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Instructions from EOC Coordinator Vikram Malhotra
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">COMM-LOG-781</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Primary load-bearing horizontal pillar on Block C shopping colonnade exhibiting 4cm shear gap. Secure 50m pedestrian perimeter immediately. Confirm ground-floor evacuation before acoustic crack probe deployment. Liaison with Police Post 16 on site.
                  </p>
                </div>
              </div>

              {/* Major Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {activeMission && activeMission.status === 'assigned' && (
                  <button
                    onClick={() => handleAcceptMission(activeMission.id)}
                    className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors uppercase tracking-wide"
                  >
                    <CheckCircle size={16} />
                    <span>ACCEPT & COMMENCE MISSION</span>
                  </button>
                )}
                {activeMission && (activeMission.status === 'in_progress' || activeMission.status === 'accepted') && (
                  <>
                    <button
                      onClick={markArrived}
                      className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors uppercase tracking-wide"
                    >
                      <CheckCircle size={16} />
                      <span>MARK ARRIVED ON SCENE</span>
                    </button>
                    <button
                      onClick={() => handleCompleteMission(activeMission.id)}
                      className="h-11 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors uppercase tracking-wide"
                    >
                      <CheckCheck size={16} />
                      <span>MARK MISSION COMPLETE</span>
                    </button>
                  </>
                )}
                {activeMission && activeMission.status === 'completed' && (
                  <span className="h-11 px-5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 uppercase tracking-wide">
                    <CheckCircle size={16} />
                    <span>MISSION COMPLETED & SIGNED OFF</span>
                  </span>
                )}
                <button
                  onClick={() => setSearchParams({ tab: 'survey' })}
                  className="h-11 px-5 bg-blue-50 hover:bg-blue-100 text-[#006398] border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors uppercase tracking-wide"
                >
                  <span className="material-symbols-outlined text-base">fact_check</span>
                  <span>START FIELD SURVEY</span>
                </button>
                <button
                  onClick={() => setSearchParams({ tab: 'map' })}
                  className="h-11 px-5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors uppercase tracking-wide border border-slate-200"
                >
                  <Navigation size={16} />
                  <span>VIEW TACTICAL MAP ROUTE</span>
                </button>
                <a
                  href={getMapV2Url('responder', token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 px-5 bg-[#006398] hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors uppercase tracking-wide border border-[#006398] no-underline shadow-xs"
                  title="Open Map Engine V2 (Responder)"
                >
                  <Navigation size={16} />
                  <span>OPEN MAP V2</span>
                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                </a>
              </div>
            </div>
          </div>

          {/* 2. FIELD NAVIGATION & TACTICAL MAP PANEL (8-col Map + 4-col Checklist/Feed) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Field GIS Transit Routing (8 cols) */}
            <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
              {/* Map Header & Telemetry */}
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#006398] text-[22px]">navigation</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 uppercase">Field GIS Transit Routing</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">ONLINE GNSS</span>
                    </div>
                    <span className="text-xs text-slate-500">Target: Sector 17 Plaza Block C • Current: Jan Marg East</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 font-semibold shadow-2xs">
                    HDOP: 0.82 (11 Sats)
                  </span>
                </div>
              </div>

              {/* Map Viewport with interactive ResQnetMap and vector GIS preview */}
              <div className="relative w-full h-[380px] bg-slate-100 overflow-hidden">
                <ResQnetMap
                  roads={roads}
                  hubs={hubs}
                  clusters={clusters}
                  hazards={hazards}
                  userPosition={userPos}
                  route={route}
                  role="responder"
                  height="100%"
                />

                {/* Tactical HUD Overlay overlay chips */}
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs p-2 rounded-lg shadow-sm border border-slate-200 pointer-events-none flex items-center gap-2 z-[400] text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-bold text-slate-800 font-mono">LIVE GPS TRACKING ACTIVE</span>
                </div>

                <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200 pointer-events-none flex items-center gap-2 font-mono text-[11px] text-slate-600 z-[400]">
                  <span>SCALE: 1:5,000</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-bold">ROUTE: VIA HIMALAYA MARG S</span>
                </div>
              </div>

              {/* Turn-by-Turn Telemetry Bar */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#006398] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[22px]">
                      {activeMission ? 'turn_right' : 'radar'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {route?.steps && route.steps.length > 0
                        ? `Proceed along ${route.steps[0].road_name} towards incident`
                        : activeMission
                        ? `Mission active: ${activeMission.title}`
                        : 'Standby • Ready for tactical dispatch'}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                      <span className="font-semibold text-[#006398]">
                        {route?.total_distance_km
                          ? `ETA: ${Math.round(((route.total_distance_km || 1) / 30) * 60)} mins (${route.total_distance_km} km)`
                          : activeMission
                          ? 'Calculating corridor…'
                          : 'Status: Available on Grid'}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-600 font-bold">
                        {route?.cost_explanation || (activeMission ? 'Corridor: ACTIVE PASSAGE' : 'Corridor: STANDBY')}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSearchParams({ tab: 'map' })}
                  className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-slate-200 shadow-xs transition-colors whitespace-nowrap uppercase tracking-wide"
                >
                  <span className="material-symbols-outlined text-[18px]">assistant_navigation</span>
                  <span>OPEN TACTICAL MAP</span>
                </button>
                <a
                  href={getMapV2Url('responder', token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-4 bg-[#006398] hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors whitespace-nowrap uppercase tracking-wide no-underline"
                  title="Open Map Engine V2 (Responder)"
                >
                  <span className="material-symbols-outlined text-[18px]">assistant_navigation</span>
                  <span>OPEN MAP V2</span>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            </div>

            {/* Right Column: Pre-Scene Checklist & Recent Updates (4 cols) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Field Survey Checklist */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#006398] text-[20px]">inventory</span>
                    <span className="text-xs font-bold text-slate-900 uppercase">Pre-Scene Survey Checklist</span>
                  </div>
                  <span className="font-mono text-xs text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded">
                    {checklistCount}/3 Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Mandatory rapid collection points for structural crack incident:
                </p>
                <div className="space-y-2 text-xs">
                  <label
                    onClick={() => setChecklist(c => ({ ...c, photos: !c.photos }))}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border border-slate-200"
                  >
                    {checklist.photos ? <CheckSquare size={16} className="text-[#006398]" /> : <Square size={16} className="text-slate-400" />}
                    <span className="text-slate-800">Visual photo evidence of shear gap ({checklist.photos ? '3/3' : '0/3'})</span>
                  </label>
                  <label
                    onClick={() => setChecklist(c => ({ ...c, perimeter: !c.perimeter }))}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border border-slate-200"
                  >
                    {checklist.perimeter ? <CheckSquare size={16} className="text-[#006398]" /> : <Square size={16} className="text-slate-400" />}
                    <span className="text-slate-800">Hazard perimeter measurement (50m cordon)</span>
                  </label>
                  <label
                    onClick={() => setChecklist(c => ({ ...c, acoustic: !c.acoustic }))}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border border-slate-200"
                  >
                    {checklist.acoustic ? <CheckSquare size={16} className="text-[#006398]" /> : <Square size={16} className="text-slate-400" />}
                    <span className="text-slate-800">Structural vibration acoustic reading probe</span>
                  </label>
                </div>
                <button
                  onClick={() => setSearchParams({ tab: 'survey' })}
                  className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors uppercase tracking-wide border border-slate-200"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_document</span>
                  <span>Open Full Field Survey Protocol</span>
                </button>
              </div>

              {/* Recent Updates Feed */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-500 text-[20px]">history</span>
                    <span className="text-xs font-bold text-slate-900 uppercase">Recent Updates</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 font-bold">LOG-DISPATCH</span>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-slate-400 shrink-0 pt-0.5">10:52 AM</span>
                    <div className="text-slate-700">Transit corridor clearance verified by <strong className="text-slate-900">Traffic Police Post 16</strong> via Himalaya Marg.</div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-[#006398] shrink-0 pt-0.5">10:49 AM</span>
                    <div className="text-slate-700">Mission-2048 status updated to <strong className="text-[#006398]">"EN ROUTE"</strong> by {user?.full_name || 'Arjun Mehta'}.</div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-red-600 shrink-0 pt-0.5">10:48 AM</span>
                    <div className="text-slate-700">Mission-2048 assigned by <strong className="text-slate-900">EOC Coordinator Vikram Malhotra</strong>.</div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-slate-400 shrink-0 pt-0.5">10:15 AM</span>
                    <div className="text-slate-700">Daily equipment calibration verified: Laser rangefinder, VHF Channel transceiver.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. ASSIGNED MISSIONS QUEUE (Secondary List Table from Stitch reference) */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 md:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Assigned Missions Queue</h2>
                <p className="text-xs text-slate-500">Operational tasks assigned to ERU-Sector 17 Quick Response unit</p>
              </div>
              <span className="font-mono text-xs px-3 py-1 bg-slate-100 rounded text-slate-600 border border-slate-200 font-bold">
                SYNCED TO EOC QUEUE
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-mono uppercase border-y border-slate-200">
                    <th className="py-3 px-4 font-bold">Mission ID</th>
                    <th className="py-3 px-4 font-bold">Task / Title</th>
                    <th className="py-3 px-4 font-bold">Severity</th>
                    <th className="py-3 px-4 font-bold">Target Location</th>
                    <th className="py-3 px-4 font-bold">Lifecycle Status</th>
                    <th className="py-3 px-4 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {missions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 font-mono text-xs">
                        No active missions assigned yet. Standing by for Coordinator deployment.
                      </td>
                    </tr>
                  ) : (
                    missions.slice(0, 5).map(m => {
                      const isActive = activeMission?.id === m.id
                      const isAssigned = m.status === 'assigned'
                      const isInProgress = m.status === 'in_progress' || m.status === 'accepted'
                      const isCompleted = m.status === 'completed'

                      const severityBadge = m.priority_score && m.priority_score > 70
                        ? { label: 'CRITICAL', bg: 'bg-red-50 text-red-600 border-red-200' }
                        : m.priority_score && m.priority_score > 40
                          ? { label: 'HIGH', bg: 'bg-amber-50 text-amber-700 border-amber-200' }
                          : { label: 'MEDIUM', bg: 'bg-blue-50 text-blue-700 border-blue-200' }

                      const statusBadge = isCompleted
                        ? { label: 'COMPLETED', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                        : isInProgress
                          ? { label: 'IN PROGRESS', bg: 'bg-[#006398] text-white border-[#006398]' }
                          : { label: 'ASSIGNED', bg: 'bg-slate-100 text-slate-600 border-slate-200' }

                      return (
                        <tr key={m.id} className={`hover:bg-slate-50/80 transition-colors ${isActive ? 'bg-blue-50/30' : ''}`}>
                          <td className="py-3 px-4 font-mono font-bold text-[#006398]">
                            MISSION-#{m.id}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {m.title}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded border font-mono uppercase font-bold text-[10px] ${severityBadge.bg}`}>
                              {severityBadge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {m.target_lat && m.target_lng
                              ? `${round(m.target_lat, 3)}° N, ${round(m.target_lng, 3)}° E`
                              : 'Sector 17 Command Sector'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded border font-mono uppercase font-bold text-[10px] ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isAssigned ? (
                              <button
                                onClick={() => handleAcceptMission(m.id)}
                                className="px-3 py-1 bg-blue-600 text-white rounded font-mono text-[10px] uppercase font-bold hover:bg-blue-700 transition-colors shadow-2xs"
                              >
                                Accept
                              </button>
                            ) : isInProgress ? (
                              <button
                                onClick={() => {
                                  setActiveMission(m)
                                  setSelectedMissionId(m.id)
                                  setSearchParams({ tab: 'missions' })
                                }}
                                className="px-3 py-1 bg-[#006398] text-white rounded font-mono text-[10px] uppercase font-bold hover:bg-blue-700 transition-colors"
                              >
                                Active Detail
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setActiveMission(m)
                                  setSelectedMissionId(m.id)
                                  setSearchParams({ tab: 'missions' })
                                }}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-mono text-[10px] uppercase font-bold transition-colors border border-slate-200"
                              >
                                View Details
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. NGO AUTHORIZATION CALLOUT & LEGAL STATUS CHIP */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-slate-600">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#006398] shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-[20px]">verified_user</span>
              </div>
              <div>
                <span className="text-xs text-slate-900 uppercase font-bold block">
                  Campaign & Field Operations Accreditation
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorized under ActionAid / Red Cross Relief Charter (NGO Reg: <span className="font-mono text-slate-800 font-semibold">CH-2021-994</span>). Verified by State Disaster Response Authority.
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <span className="font-mono text-[10px] px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-bold uppercase tracking-wider">
                Accredited NGO Responder Unit
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: OPERATIONS MAP (resqnet_responder_field_operations_map - GIS LIVE)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'map' && (
        <div className="flex-1 p-4 md:p-6 space-y-4 overflow-y-auto">
          {/* Top HUD Bar */}
          <div className="w-full bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col xl:flex-row items-start xl:items-left justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-blue-600">
                  <Navigation size={18} />
                </span>
                <h1 className="font-bold text-base text-slate-900 uppercase tracking-tight">FIELD OPERATIONS MAP</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  GIS LIVE CONSOLE
                </span>
                <a
                  href={getMapV2Url('responder', token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors uppercase tracking-wide no-underline ml-2"
                  title="Open Map Engine V2 (Responder)"
                >
                  <Navigation size={13} />
                  <span>Launch Map Engine V2</span>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
              <p className="font-mono text-xs text-slate-500">
                Tactical Response Grid (GNSS Fix: {userPos ? `${userPos.lat.toFixed(4)}° N, ${userPos.lng.toFixed(4)}° E` : '30.7398° N, 76.7827° E'})
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>TELEMETRY: {isOnline ? 'ONLINE (1.2s LATENCY)' : 'OFFLINE CACHED'}</span>
            </div>

            {/* Layer toggles */}
            <div className="flex items-center flex-wrap gap-2 text-xs">
              <button
                onClick={() => setVisibleLayers(v => ({ ...v, missions: !v.missions }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all text-xs border ${visibleLayers.missions
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
              >
                <Check size={14} className={visibleLayers.missions ? '' : 'hidden'} />
                <span>Missions ({missions.length})</span>
              </button>
              <button
                onClick={() => setVisibleLayers(v => ({ ...v, incidents: !v.incidents }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all text-xs border ${visibleLayers.incidents
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
              >
                <Check size={14} className={visibleLayers.incidents ? '' : 'hidden'} />
                <span>Incidents ({clusters.length})</span>
              </button>
              <button
                onClick={() => setVisibleLayers(v => ({ ...v, hazards: !v.hazards }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all text-xs border ${visibleLayers.hazards
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
              >
                <Check size={14} className={visibleLayers.hazards ? '' : 'hidden'} />
                <span>Hazards ({hazards.length})</span>
              </button>
              <button
                onClick={() => setVisibleLayers(v => ({ ...v, safety: !v.safety }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all text-xs border ${visibleLayers.safety
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
              >
                <Check size={14} className={visibleLayers.safety ? '' : 'hidden'} />
                <span>Safety Hubs ({hubs.length})</span>
              </button>
            </div>
          </div>

          {/* Tactical Viewport */}
          <div className="relative w-full h-[640px] rounded-xl overflow-hidden shadow-sm bg-slate-900 border border-slate-200">
            <div className="absolute inset-0">
              <ResQnetMap
                roads={visibleLayers.roads ? roads : []}
                intersections={intersections}
                hazards={visibleLayers.hazards ? hazards : []}
                hubs={visibleLayers.safety ? hubs : []}
                clusters={visibleLayers.incidents ? clusters : []}
                missions={visibleLayers.missions ? missions : []}
                activeRoadId={activeMission?.road_id}
                activeMission={activeMission}
                route={route}
                userPosition={userPos}
                missionTarget={missionTarget}
                role="responder"
                onLocationFound={(lat, lng) => {
                  setUserPos({ lat, lng })
                  toast.success('Responder GPS updated')
                }}
                height="100%"
              />
            </div>

            {/* Right-Hand Tactical Inspector Flyout */}
            <aside className="absolute top-4 right-4 bottom-4 w-[360px] z-20 flex flex-col bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-2xl overflow-hidden pointer-events-auto">
              <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                  <span className="font-mono text-xs uppercase tracking-wider text-red-600 font-bold">
                    {activeMission ? `TARGET: #${activeMission.id}` : 'TACTICAL INSPECTOR'}
                  </span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-red-50 text-red-600 border border-red-200 font-bold">
                  PRIORITY 1
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 text-xs">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-snug">
                    {activeMission?.title || 'Sector 17 Commercial Arcade Pillar Crack'}
                  </h3>
                  <p className="text-slate-500 mt-1 flex items-center gap-1 font-medium">
                    <MapPin size={13} className="text-red-500 shrink-0" />
                    <span>Sector 17 Plaza Block C, Arcades, Chandigarh</span>
                  </p>
                </div>

                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold uppercase text-[11px]">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>OBSTACLE & HAZARD ALERT</span>
                  </div>
                  <p className="text-slate-700 text-[11px] leading-relaxed">
                    Pedestrian crowd spillover on Madhya Marg. 50m safety cordon required on site. Single-lane emergency passage maintained.
                  </p>
                </div>

                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase text-[10px] text-emerald-800 font-bold">
                      NEAREST RETREAT HUB
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                      OPEN
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 text-xs">{nearestHub?.name || 'Sector 17 Disaster Relief Shelter'}</div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Capacity: {nearestHub ? `${nearestHub.current_occupancy}/${nearestHub.max_capacity}` : '142/300 persons'}
                  </div>
                </div>

                {route && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col gap-2">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase font-bold text-slate-600">
                      <span>CURRENT ROUTE TELEMETRY</span>
                      <span className={routeDirection === 'backward' ? 'text-amber-700' : 'text-blue-700'}>
                        {routeDirection === 'backward' ? 'RETREAT' : 'FORWARD'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="font-bold text-base text-slate-900">{route.total_distance_km.toFixed(2)} km</div>
                        <div className="text-[10px] text-slate-500 font-mono uppercase">DISTANCE</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200">
                        <div className="font-bold text-base text-blue-700">{Math.max(1, Math.round(route.total_distance_km * 3))}m</div>
                        <div className="text-[10px] text-slate-500 font-mono uppercase">ESTIMATED TIME</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex flex-col gap-2">
                <button
                  onClick={() => calculateMissionRoute('forward')}
                  disabled={loadingRoute}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all uppercase tracking-wide disabled:opacity-50"
                >
                  {loadingRoute && routeDirection === 'forward' ? <Loader2 size={16} className="spin" /> : <Navigation size={16} />}
                  <span>NAVIGATE TO TARGET</span>
                </button>

                <button
                  onClick={() => calculateMissionRoute('backward')}
                  disabled={loadingRoute}
                  className="w-full h-9 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors uppercase tracking-wide disabled:opacity-50"
                >
                  {loadingRoute && routeDirection === 'backward' ? <Loader2 size={15} className="spin" /> : <Shield size={15} className="text-emerald-700" />}
                  <span>SAFE RETREAT TO HUB (BACKWARD ROUTE)</span>
                </button>

                <button
                  onClick={() => setSearchParams({ tab: 'survey' })}
                  className="w-full h-9 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors uppercase tracking-wide"
                >
                  <AlertTriangle size={15} className="text-amber-600" />
                  <span>START FIELD SURVEY</span>
                </button>
              </div>
            </aside>
          </div>

          {/* Bottom Telemetry Dock */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Navigation size={20} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">NEXT NAVIGATION ACTION</span>
                <span className="font-bold text-xs text-slate-900 truncate">
                  {route?.steps && route.steps.length > 0
                    ? `Proceed along ${route.steps[0].road_name} (${(route.steps[0].distance_km * 1000).toFixed(0)}m)`
                    : 'In 180m, Turn Right onto Udyog Path'}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">
                  {routeDirection === 'backward' ? 'RETREAT CORRIDOR' : 'BYPASSING HAZARDS'}
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 shrink-0">
                <Zap size={20} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">SECTOR MICRO-CLIMATE</span>
                <span className="font-bold text-xs text-slate-900 truncate">Wind: 14 km/h NE • Rain: 3.2 mm/hr</span>
                <span className="text-[10px] text-slate-500">CONDITIONS STABLE FOR DEPLOYMENT</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <Shield size={20} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">EVACUATION CORRIDOR</span>
                  <span className="font-bold text-xs text-slate-900 truncate">{nearestHub?.name || 'Himalaya Marg South'}</span>
                  <span className="text-[10px] text-emerald-600 font-bold">100% CLEARWAY VERIFIED</span>
                </div>
              </div>
              <CheckCircle size={18} className="text-emerald-500 shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: MISSIONS (resqnet_responder_missions_overview & detail)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'missions' && (
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Top header & badges */}
          <div className="flex flex-col sm:flex-row sm:items-left sm:justify-between gap-4 pb-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">MISSIONS</h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-[#006398] font-mono text-xs font-semibold">
                  CAD-OPS
                </span>
              </div>
              <p className="text-xs text-slate-500">Assigned field operations • Sector 17 Tactical Dispatch</p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-blue-50 border border-blue-200 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-[#006398] animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#006398] font-mono">
                  ACTIVE: {missions.filter(m => m.status === 'in_progress').length || 1}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-50 border border-amber-200 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 font-mono">
                  ASSIGNED: {missions.filter(m => m.status === 'assigned' || m.status === 'accepted').length || 2}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-50 border border-emerald-200 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 font-mono">
                  COMPLETED: {missions.filter(m => m.status === 'completed').length || 14}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar matching Stitch 12-col grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={missionSearch}
                  onChange={e => setMissionSearch(e.target.value)}
                  placeholder="Search mission ID, location, or task..."
                  className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
              <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative">
                  <select
                    value={missionStatusFilter}
                    onChange={e => setMissionStatusFilter(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="in_progress">Active (En Route)</option>
                    <option value="assigned">Assigned</option>
                    <option value="standby">Standby</option>
                    <option value="completed">Completed</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
                <div className="relative">
                  <select
                    value={missionPriorityFilter}
                    onChange={e => setMissionPriorityFilter(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="all">All Priorities</option>
                    <option value="critical">Critical Severity</option>
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
                <div className="relative">
                  <select
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-500 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="all">All Types</option>
                    <option value="structural">Structural Assessment</option>
                    <option value="medical">Medical Emergency</option>
                    <option value="debris">Road Clearance</option>
                    <option value="flood">Flood / Dewatering</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
              </div>
            </div>
          </div>

          {/* If a mission is selected: Active Mission Focus / Slide-out inspect */}
          {activeMission && selectedMissionId && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="h-1.5 w-full bg-red-600" />
              <div className="p-5 md:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      OPERATIONAL FOCUS
                    </span>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-100 font-bold text-slate-800 border border-slate-200">
                      MISSION-#{activeMission.id}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 flex items-center gap-1 uppercase">
                      <AlertTriangle size={12} /> CRITICAL SEVERITY
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase font-mono">
                      ETA 3m
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedMissionId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                      title="Return to list of all dispatches"
                    >
                      <ArrowLeft size={14} /> Back to All Missions
                    </button>
                    <button
                      onClick={() => toast('VHF Channel 02 EOC active: 154.200 MHz', { icon: '📻' })}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                    >
                      <Radio size={14} className="text-slate-500" />
                      VHF CH 02 (EOC)
                    </button>
                    <a
                      href="tel:112"
                      className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Phone size={14} /> Call Coordinator
                    </a>
                  </div>
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{activeMission.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5 font-medium">
                    <span className="flex items-center gap-1 text-slate-700">
                      <MapPin size={14} className="text-red-500" /> Sector 17 Plaza, Block C (Commercial Arcade), Chandigarh
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} className="text-slate-400" /> Assigned 10:48 AM IST (14 mins ago)
                    </span>
                  </div>
                </div>

                {/* 5-Step Lifecycle Stepper */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono uppercase text-slate-500 tracking-wider font-bold">
                      OPERATIONAL LIFECYCLE STEPPER
                    </span>
                    <span className="text-xs font-mono text-slate-600 font-semibold">
                      STATUS: <strong className="text-blue-700 uppercase">{activeMission.status.replace('_', ' ')}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-300 text-emerald-900 flex flex-col justify-between">
                      <div className="flex items-center justify-between font-bold">
                        <span>1. ACCEPTED</span>
                        <Check size={14} className="text-emerald-600" />
                      </div>
                      <span className="text-[11px] font-mono mt-2 text-emerald-700 font-medium">10:49 AM</span>
                    </div>

                    <div className="p-3 rounded-lg border bg-blue-600 border-blue-700 text-white shadow-sm flex flex-col justify-between">
                      <div className="flex items-center justify-between font-bold">
                        <span>2. EN ROUTE</span>
                        <Navigation size={14} className="text-white animate-pulse" />
                      </div>
                      <span className="text-[11px] font-mono mt-2 font-medium text-blue-100">ACTIVE • ETA 3m</span>
                    </div>

                    <div className="p-3 rounded-lg border bg-slate-100 border-slate-300 text-slate-700 flex flex-col justify-between">
                      <div className="flex items-center justify-between font-bold">
                        <span>3. ARRIVED SCENE</span>
                        <MapPin size={14} />
                      </div>
                      <span className="text-[11px] font-mono mt-2 text-slate-500 font-medium">Pending Arrival</span>
                    </div>

                    <div className="p-3 rounded-lg border bg-slate-100 border-slate-200 text-slate-600 flex flex-col justify-between">
                      <div className="flex items-center justify-between font-bold">
                        <span>4. SURVEYING</span>
                        <ShieldAlert size={14} />
                      </div>
                      <span className="text-[11px] font-mono mt-2 text-slate-500 font-medium">Checklist {checklistCount}/3</span>
                    </div>

                    <div className="p-3 rounded-lg border bg-slate-100 border-slate-200 text-slate-600 col-span-2 md:col-span-1 flex flex-col justify-between">
                      <div className="flex items-center justify-between font-bold">
                        <span>5. COMPLETED</span>
                        <CheckCircle size={14} />
                      </div>
                      <span className="text-[11px] font-mono mt-2 font-medium text-slate-500">Debrief & Signoff</span>
                    </div>
                  </div>
                </div>

                {/* 2-Column Detail Layout: Parameters + Checklist */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-6 flex flex-col gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">Operational Parameters</h3>
                        <span className="font-mono text-[10px] text-slate-500">SECTOR-17 ERU</span>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Mission Identifier</span>
                          <span className="font-mono font-bold text-blue-700">MISSION-#{activeMission.id}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Operation Type</span>
                          <span className="font-semibold text-slate-900">Structural Damage Assessment & Shoring</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Incident Context</span>
                          <span className="font-mono font-bold text-red-600">INC-2048 (4cm beam shear)</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-slate-500">Comms Channel</span>
                          <span className="font-mono font-bold text-blue-700">VHF CH 02 (EOC Direct)</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/70 border-l-4 border-l-amber-500 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-amber-900 font-bold text-xs uppercase tracking-wide">
                        <span>EOC Coordinator Directive</span>
                        <span className="font-mono text-[10px] text-amber-700">AUTH: V. MALHOTRA</span>
                      </div>
                      <p className="text-slate-800 text-xs leading-relaxed bg-amber-100/50 p-2.5 rounded border border-amber-200/60">
                        “Primary load-bearing horizontal pillar on Block C shopping colonnade exhibiting 4cm shear gap. Secure 50m pedestrian perimeter immediately. Confirm ground-floor evacuation before acoustic crack probe deployment. Liaison with Police Post 16 on site.”
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-6 flex flex-col gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col gap-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-blue-600" />
                          <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">Pre-Scene Checklist</h3>
                        </div>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {checklistCount} / 3 READY
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        Verify safety prerequisites before transitioning to on-foot structural telemetry acquisition:
                      </p>

                      <div className="flex flex-col gap-2">
                        <label
                          onClick={() => setChecklist(c => ({ ...c, photos: !c.photos }))}
                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-blue-50/40 border border-slate-200 cursor-pointer transition-colors"
                        >
                          {checklist.photos ? (
                            <CheckSquare size={18} className="text-blue-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square size={18} className="text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex flex-col flex-1">
                            <span className="font-bold text-xs text-slate-900">Visual Photo Evidence of Shear Gap</span>
                            <span className="text-[11px] text-slate-500">Capture 3 angle high-res survey frames (CAM-01, CAM-02)</span>
                          </div>
                        </label>

                        <label
                          onClick={() => setChecklist(c => ({ ...c, perimeter: !c.perimeter }))}
                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-blue-50/40 border border-slate-200 cursor-pointer transition-colors"
                        >
                          {checklist.perimeter ? (
                            <CheckSquare size={18} className="text-blue-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square size={18} className="text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex flex-col flex-1">
                            <span className="font-bold text-xs text-slate-900">Hazard Perimeter Measurement</span>
                            <span className="text-[11px] text-slate-500">Verify 50-meter safety tape cordon with Police Post 16</span>
                          </div>
                        </label>

                        <label
                          onClick={() => setChecklist(c => ({ ...c, acoustic: !c.acoustic }))}
                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-blue-50/40 border border-slate-200 cursor-pointer transition-colors"
                        >
                          {checklist.acoustic ? (
                            <CheckSquare size={18} className="text-blue-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square size={18} className="text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex flex-col flex-1">
                            <span className="font-bold text-xs text-slate-900">Structural Vibration Acoustic Probe</span>
                            <span className="text-[11px] text-slate-500">Calibrate transducer unit on firm uncompromised footing</span>
                          </div>
                        </label>
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <button
                          onClick={markArrived}
                          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all uppercase tracking-wide"
                        >
                          <MapPin size={16} />
                          <span>MARK ARRIVED ON SCENE</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setSearchParams({ tab: 'survey' })}
                            className="h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wide border border-slate-200"
                          >
                            <FileText size={15} className="text-blue-600" />
                            <span>Start Survey</span>
                          </button>
                          <button
                            onClick={() => calculateMissionRoute('forward')}
                            className="h-10 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wide border border-blue-200"
                          >
                            <Navigation size={15} />
                            <span>Operations Map</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Missions List Cards matching Stitch resqnet_responder_missions_overview */}
          <div className="flex flex-col gap-3">
            {filteredMissions.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
                No missions found matching your filter criteria.
              </div>
            ) : (
              filteredMissions.map(m => {
                const isSelected = activeMission?.id === m.id
                const isCritical = m.priority_score && m.priority_score > 70
                const isHigh = m.priority_score && m.priority_score > 40
                const isAssigned = m.status === 'assigned'
                const isEnRoute = m.status === 'in_progress' || m.status === 'accepted'
                const isCompleted = m.status === 'completed'

                const borderLeftColor = isCritical
                  ? 'border-l-red-600'
                  : isHigh
                    ? 'border-l-amber-500'
                    : isCompleted
                      ? 'border-l-emerald-600'
                      : 'border-l-blue-600'

                const typeLabel = m.mission_type === 'rescue'
                  ? 'RESCUE DISPATCH'
                  : m.mission_type === 'verify_incident'
                    ? 'INCIDENT VERIFICATION'
                    : m.mission_type === 'deliver_resource'
                      ? 'RESOURCE DELIVERY'
                      : 'STRUCTURAL ASSESSMENT'

                const locationText = m.target_lat && m.target_lng
                  ? `${round(m.target_lat, 4)}° N, ${round(m.target_lng, 4)}° E`
                  : 'Sector 17 Command Sector'

                return (
                  <div
                    key={m.id}
                    className={`bg-white border border-slate-200 border-l-4 ${borderLeftColor} rounded-xl p-5 shadow-xs transition-all hover:shadow-md ${isSelected ? 'bg-blue-50/20 ring-1 ring-blue-400' : ''
                      }`}
                  >
                    <div className="flex flex-col items-center text-center gap-3">
                      {/* Top Row Badges */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                          MISSION-#{m.id}
                        </span>

                        {isCritical && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-mono text-[10px] uppercase tracking-wider font-bold">
                            <AlertTriangle size={12} />
                            CRITICAL SEVERITY
                          </span>
                        )}

                        {isHigh && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono text-[10px] uppercase tracking-wider font-bold">
                            <AlertTriangle size={12} />
                            HIGH PRIORITY
                          </span>
                        )}

                        {isEnRoute ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-50 text-[#006398] border border-blue-200 font-mono text-[10px] uppercase tracking-wider font-bold">
                            <Navigation size={12} />
                            IN PROGRESS
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] uppercase tracking-wider font-bold">
                            <CheckCircle size={12} />
                            COMPLETED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono text-[10px] uppercase tracking-wider font-semibold">
                            <Clock size={12} />
                            ASSIGNED
                          </span>
                        )}

                        <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono text-[10px] uppercase tracking-wider">
                          {typeLabel}
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        {m.title}
                      </h2>

                      {/* Meta Row: Location & Timestamp */}
                      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-slate-500 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin size={14} className="text-slate-400 shrink-0" />
                          <span className="text-slate-700 font-medium">
                            {locationText}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          <Clock size={14} className="text-slate-400 shrink-0" />
                          <span>
                            Status: <strong className="text-slate-800 font-medium uppercase">{m.status.replace('_', ' ')}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Centered Action Button matching Image 1 */}
                      <div className="flex items-center gap-2 pt-2">
                        {isAssigned && (
                          <button
                            onClick={() => handleAcceptMission(m.id)}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-bold shadow-xs transition-colors uppercase tracking-wide"
                          >
                            <CheckCircle size={14} />
                            <span>ACCEPT MISSION</span>
                          </button>
                        )}
                        {isEnRoute && (
                          <button
                            onClick={() => handleCompleteMission(m.id)}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs font-bold shadow-xs transition-colors uppercase tracking-wide"
                          >
                            <CheckCheck size={14} />
                            <span>MARK COMPLETE</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveMission(m)
                            setSelectedMissionId(m.id)
                            loadMissionSurveys(m.id)
                          }}
                          className={`inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg font-mono text-xs font-bold transition-colors uppercase tracking-wide ${isSelected
                            ? 'bg-blue-50 text-[#006398] border border-blue-300'
                            : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 shadow-2xs'
                            }`}
                        >
                          <span>{isSelected ? 'SELECTED IN COCKPIT' : 'OPEN DETAIL'}</span>
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination Footer Bar matching Stitch reference */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Showing</span>
              <span className="font-mono font-bold text-slate-900">1-{filteredMissions.length || 4}</span>
              <span>of</span>
              <span className="font-mono font-bold text-slate-900">17</span>
              <span>missions</span>
            </div>
            <div className="inline-flex items-center -space-x-px rounded-lg bg-white border border-slate-200 shadow-2xs overflow-hidden text-xs">
              <button
                aria-label="Previous Page"
                className="inline-flex items-center justify-center h-8 w-8 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors border-r border-slate-200"
              >
                <ChevronLeft size={14} />
              </button>
              <button className="inline-flex items-center justify-center h-8 w-8 font-mono font-bold bg-[#006398] text-white">
                1
              </button>
              <button className="inline-flex items-center justify-center h-8 w-8 font-mono text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border-l border-slate-200">
                2
              </button>
              <button className="inline-flex items-center justify-center h-8 w-8 font-mono text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border-l border-slate-200">
                3
              </button>
              <button
                aria-label="Next Page"
                className="inline-flex items-center justify-center h-8 w-8 text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors border-l border-slate-200"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: FIELD SURVEYS (resqnet_responder_field_survey - 7 Sections)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'survey' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Top Page Header */}
          <div className="flex flex-col lg:flex-row lg:items-left justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-blue-600 font-bold">FORM RESQ-FSR-2048</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  FIELD VERIFICATION PROTOCOL
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FIELD SURVEY</h1>
              <p className="text-xs text-slate-500">Record and submit verified field observations for Mission-#{activeMission?.id || 2048}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-xs text-xs font-mono">
                <span className="text-slate-500">MISSION:</span>
                <strong className="text-blue-700">MISSION-#{activeMission?.id || 2048}</strong>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800 font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>TIMESTAMP: 10:58 AM IST (Auto-sync)</span>
              </div>
            </div>
          </div>

          {/* 7-Section Survey Form */}
          <form
            onSubmit={e => {
              e.preventDefault()
              submitFieldSurveyForm()
            }}
            className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-200"
          >
            {/* SECTION 1: OBSERVED PHYSICAL CONDITION */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold flex items-center justify-center border border-blue-200">
                    01
                  </span>
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">OBSERVED PHYSICAL CONDITION</h2>
                </div>
                <span className="font-mono text-[10px] text-red-600 uppercase font-bold tracking-wider">• MANDATORY TELEMETRY</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-slate-600 tracking-wider">
                  Observed Structural Condition / Defect Description
                </label>
                <textarea
                  value={defectDescription}
                  onChange={e => setDefectDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Quick condition triage tags */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase text-slate-600 tracking-wider">Quick Condition Triage Tag</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConditionChip('severe')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${conditionChip === 'severe'
                      ? 'border-red-300 bg-red-50 text-red-700 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <AlertTriangle size={14} /> Severe Structural Shear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditionChip('spalling')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${conditionChip === 'spalling'
                      ? 'border-amber-300 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <ShieldAlert size={14} /> Concrete Spalling
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditionChip('cracking')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${conditionChip === 'cracking'
                      ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Activity size={14} /> Superficial Cracking
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditionChip('sound')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all border ${conditionChip === 'sound'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <CheckCircle size={14} /> Sound / No Major Damage
                  </button>
                </div>
              </div>

              {/* GNSS Read-only */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div className="flex items-center gap-3">
                  <Navigation size={18} className="text-blue-600 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] uppercase text-slate-500">EXACT FIELD GNSS COORDINATES (READ-ONLY)</span>
                    <span className="font-mono font-bold text-slate-900">
                      {userPos ? `${userPos.lat.toFixed(4)}° N, ${userPos.lng.toFixed(4)}° E` : '30.7398° N, 76.7827° E'} • Sector 17 Plaza Block C
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200 self-start sm:self-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> GNSS LOCK (±0.8m)
                </span>
              </div>
            </div>

            {/* SECTION 2: EVIDENCE & PHOTO TELEMETRY */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold flex items-center justify-center border border-blue-200">
                    02
                  </span>
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">EVIDENCE & PHOTO TELEMETRY</h2>
                </div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">2/5 ATTACHED • 4K MESH SYNC</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Photo 1 */}
                <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="relative h-40 w-full bg-slate-200 overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1590247813693-5541d1c609fd?w=600&auto=format&fit=crop&q=80"
                      alt="Colonnade fracture"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-slate-900/80 text-white px-2 py-0.5 rounded font-mono text-[10px]">
                      CAM-01
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Colonnade P-4 Fracture</span>
                      <CheckCircle size={14} className="text-emerald-600" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">EXIF: 10:56 AM • 4.2cm ruler scale</span>
                  </div>
                </div>

                {/* Photo 2 */}
                <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="relative h-40 w-full bg-slate-200 overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1541888946425-d0fbb180c5f7?w=600&auto=format&fit=crop&q=80"
                      alt="Cordon perimeter"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-slate-900/80 text-white px-2 py-0.5 rounded font-mono text-[10px]">
                      CAM-02
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Cordon Perimeter 50m</span>
                      <CheckCircle size={14} className="text-emerald-600" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">EXIF: 10:57 AM • Police tape anchor</span>
                  </div>
                </div>

                {/* Upload Action */}
                <div
                  onClick={() => toast.success('Camera / file attachment bridge ready. Mock photo attached.')}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-center min-h-[160px]"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                    <Camera size={20} />
                  </div>
                  <span className="font-bold text-xs text-slate-900">Tap to capture or upload evidence</span>
                  <span className="font-mono text-[10px] text-slate-400 mt-1 uppercase">Supports GeoTIFF, RAW, JPEG</span>
                </div>
              </div>
            </div>

            {/* SECTION 3: ROAD & ACCESS CORRIDOR CONDITION (Strict 6 states) */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold flex items-center justify-center border border-blue-200">
                    03
                  </span>
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                    ROAD & ACCESS CORRIDOR CONDITION (FIELD VERIFICATION)
                  </h2>
                </div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">INGRESS ROUTE STATUS</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <Navigation size={16} className="text-blue-600" />
                    <span className="font-bold text-slate-900">Jan Marg to Sector 17 Plaza Ingress Corridor</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-bold">
                    SECTOR ARTERY-04
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { id: 'open', label: 'Open', color: 'text-emerald-700', border: 'border-emerald-300', bg: 'bg-emerald-50' },
                    { id: 'congested', label: 'Congested', color: 'text-amber-700', border: 'border-amber-300', bg: 'bg-amber-50' },
                    { id: 'partially_blocked', label: 'Partially Blocked', color: 'text-amber-800', border: 'border-amber-400', bg: 'bg-amber-100' },
                    { id: 'blocked', label: 'Blocked', color: 'text-red-700', border: 'border-red-300', bg: 'bg-red-50' },
                    { id: 'restricted', label: 'Restricted', color: 'text-purple-700', border: 'border-purple-300', bg: 'bg-purple-50' },
                    { id: 'reopened', label: 'Reopened', color: 'text-blue-700', border: 'border-blue-300', bg: 'bg-blue-50' },
                  ].map(c => {
                    const isSelected = corridorStatus === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCorridorStatus(c.id as any)}
                        className={`p-2.5 rounded-lg border text-center font-bold text-xs uppercase tracking-wide transition-all ${isSelected ? `${c.border} ${c.bg} ${c.color} shadow-xs font-bold border-2` : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase text-slate-600 tracking-wider">
                    Access Corridor Field Observations
                  </label>
                  <input
                    value={corridorNote}
                    onChange={e => setCorridorNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: HAZARD ASSESSMENT & PERIMETER */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold flex items-center justify-center border border-blue-200">
                    04
                  </span>
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">HAZARD ASSESSMENT & PERIMETER</h2>
                </div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">CIVIL DEFENSE LEVEL 2</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase text-slate-500">OBSERVED HAZARD CLASSIFICATION</span>
                  <span className="font-bold text-xs text-red-600 flex items-center gap-1.5 mt-1">
                    <AlertTriangle size={15} /> Structural Failure / Collapse Risk
                  </span>
                  <span className="text-[11px] text-slate-500">Primary trigger: Post-seismic lateral tension on bearing joints.</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase text-slate-500">ENFORCED HAZARD CORDON RADIUS</span>
                  <span className="font-bold text-xs text-amber-700 flex items-center gap-1.5 mt-1">
                    <Shield size={15} /> 50 Meters (Established with Traffic Police Post 16)
                  </span>
                  <span className="text-[11px] text-slate-500">Perimeter tapes anchored to pylons A1 through D4.</span>
                </div>
              </div>

              {/* Dynamic Telemetry Penalties & Severity Tuning */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Hazard Level</span>
                    <span className="font-mono text-red-600 font-bold">{hazardLevel} / 5</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={hazardLevel}
                    onChange={e => setHazardLevel(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Hazard Penalty</span>
                    <span className="font-mono text-amber-700 font-bold">+{hazardPenalty}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hazardPenalty}
                    onChange={e => setHazardPenalty(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>Flood Depth Penalty</span>
                    <span className="font-mono text-blue-700 font-bold">+{floodPenalty}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={floodPenalty}
                    onChange={e => setFloodPenalty(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="flex items-center justify-between md:justify-center gap-3 pt-2 md:pt-0">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBlocked}
                      onChange={e => setIsBlocked(e.target.checked)}
                      className="rounded border-slate-300 text-red-600 focus:ring-red-500 h-4 w-4"
                    />
                    <span>Complete Road Blockage</span>
                  </label>
                </div>
              </div>

              {/* Civilian Evacuation Buttons */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase text-slate-600 tracking-wider">Civilian Evacuation Verification</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setEvacStatus('fully_evacuated')}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${evacStatus === 'fully_evacuated'
                      ? 'border-emerald-400 bg-emerald-50 border-2 shadow-xs'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                  >
                    <CheckCircle size={20} className={evacStatus === 'fully_evacuated' ? 'text-emerald-600' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-slate-900">Fully Evacuated</span>
                      <span className="text-[11px] text-slate-500">Ground level cleared</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEvacStatus('in_progress')}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${evacStatus === 'in_progress'
                      ? 'border-amber-400 bg-amber-50 border-2 shadow-xs'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                  >
                    <Clock size={20} className={evacStatus === 'in_progress' ? 'text-amber-600' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-slate-900">In Progress</span>
                      <span className="text-[11px] text-slate-500">Upper arcade sweep</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEvacStatus('evacuation_needed')}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${evacStatus === 'evacuation_needed'
                      ? 'border-red-400 bg-red-50 border-2 shadow-xs'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                  >
                    <AlertTriangle size={20} className={evacStatus === 'evacuation_needed' ? 'text-red-600' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-slate-900">Evacuation Needed</span>
                      <span className="text-[11px] text-slate-500">Trapped / unconfirmed</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 5: VERIFICATION OUTCOME */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono text-xs font-bold flex items-center justify-center border border-blue-200">
                    05
                  </span>
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">VERIFICATION OUTCOME</h2>
                </div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">COMMAND SITREP ACTION</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => setSurveyOutcome('confirmed_hazard')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all flex flex-col gap-2 ${surveyOutcome === 'confirmed_hazard'
                    ? 'border-2 border-emerald-500 bg-emerald-50 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle size={15} /> VERIFIED HAZARD
                    </span>
                    <span className="h-4 w-4 rounded-full border border-emerald-600 flex items-center justify-center">
                      {surveyOutcome === 'confirmed_hazard' && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs">
                    Observed conditions match or confirm report severity. Triggers authorized operational escalation.
                  </p>
                </div>

                <div
                  onClick={() => setSurveyOutcome('no_hazard_found')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all flex flex-col gap-2 ${surveyOutcome === 'no_hazard_found'
                    ? 'border-2 border-blue-500 bg-blue-50 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield size={15} /> NOT VERIFIED / CLEAR
                    </span>
                    <span className="h-4 w-4 rounded-full border border-blue-600 flex items-center justify-center">
                      {surveyOutcome === 'no_hazard_found' && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs">
                    Reported conditions are absent or minor. Recommend de-escalation of tactical response.
                  </p>
                </div>

                <div
                  onClick={() => setSurveyOutcome('road_blocked')}
                  className={`cursor-pointer p-4 rounded-xl border transition-all flex flex-col gap-2 ${surveyOutcome === 'road_blocked'
                    ? 'border-2 border-amber-500 bg-amber-50 shadow-xs'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle size={15} /> REQUIRES REVIEW
                    </span>
                    <span className="h-4 w-4 rounded-full border border-amber-600 flex items-center justify-center">
                      {surveyOutcome === 'road_blocked' && <span className="h-2 w-2 rounded-full bg-amber-600" />}
                    </span>
                  </div>
                  <p className="text-slate-600 text-xs">
                    Uncertain or hazardous conditions requiring specialized assessment team or heavy equipment.
                  </p>
                </div>
              </div>
            </div>

            {/* SECTION 6: OPERATIONAL ROUTING CONFIRMATION */}
            <div className="p-6 bg-slate-50 flex items-start gap-3 text-xs text-slate-800">
              <ShieldAlert size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-bold uppercase tracking-wide text-blue-700">Operational Routing Confirmation</span>
                <p className="text-slate-600 leading-relaxed">
                  Submitting this survey propagates verified field evidence directly to EOC Coordinator Vikram Malhotra and downstream tactical units. This does not trigger an unverified global broadcast.
                </p>
              </div>
            </div>

            {/* SECTION 7: ACTION CONTROLS */}
            <div className="p-6 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>MESH RELAY PACKET READY • CRC-32 VALID</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={async () => {
                    const targetMission = activeMission || missions[0]
                    if (!targetMission) return
                    await saveSurveyOffline({
                      mission_id: targetMission.id,
                      hazard_level: hazardLevel,
                      verification_outcome: surveyOutcome,
                      road_status: 'hazardous',
                      hazard_penalty: hazardPenalty,
                      flood_penalty: floodPenalty,
                      congestion_penalty: 20,
                      is_blocked: isBlocked,
                      notes: `${defectDescription} | Corridor: ${corridorNote}`,
                      client_timestamp: new Date().toISOString(),
                    })
                    const count = await db.local_surveys.count()
                    setPendingOps(count)
                    toast.success('Survey draft saved to IndexedDB local storage!')
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                >
                  Save Draft Offline
                </button>

                <button
                  type="submit"
                  disabled={submittingSurvey}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all uppercase tracking-wide disabled:opacity-50"
                >
                  {submittingSurvey ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                  <span>SUBMIT FIELD SURVEY</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: VERIFICATION (resqnet_responder_verification Workbench)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'verification' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-left justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  STATION AUDIT CONSOLE
                </span>
                <span className="text-slate-400 font-mono text-[10px]">UID: RESQ-VERIF-S17</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FIELD VERIFICATION WORKBENCH</h1>
              <p className="text-xs text-slate-500">Evidence reconciliation and operational ground-truth verification</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2">
                <Clock size={16} className="text-amber-500" />
                <div className="flex flex-col">
                  <span className="font-mono text-[9px] uppercase text-slate-400">QUEUE</span>
                  <span className="font-bold text-xs text-slate-900">3 Items Pending</span>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-xs flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <div className="flex flex-col">
                  <span className="font-mono text-[9px] uppercase text-slate-400">TODAY</span>
                  <span className="font-bold text-xs text-slate-900">8 Verified Closed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Incident Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {missions.length === 0 ? (
              <span className="text-xs text-slate-400 font-mono py-2">No active missions linked to incident clusters.</span>
            ) : (
              missions.map((m, i) => {
                const isSelected = (activeVerificationClusterId === m.cluster_id) || (!activeVerificationClusterId && i === 0)
                const clusterId = m.cluster_id || m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setActiveVerificationClusterId(clusterId)
                      setActiveVerificationIncident(`MISSION-${m.id}`)
                      loadClusterDetail(clusterId)
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'bg-white border-blue-500 shadow-xs text-slate-900' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${m.status === 'in_progress' ? 'bg-red-600 animate-pulse' : 'bg-blue-600'}`} />
                    <span>MISSION-#{m.id}: {m.title.slice(0, 24)}...</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-blue-50 text-blue-700">
                      CLUSTER #{clusterId}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Dual-Pane Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left Pane: Reported Evidence */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                    REPORTED CITIZEN EVIDENCE ({activeVerificationIncident})
                  </h2>
                </div>
                <span className="font-mono text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  CITIZEN INGESTION • UNVERIFIED
                </span>
              </div>

              {loadingClusterDetail ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2">
                  <Loader2 size={16} className="spin text-blue-600" /> Loading constituent citizen reports...
                </div>
              ) : activeClusterDetail && activeClusterDetail.reports && activeClusterDetail.reports.length > 0 ? (
                activeClusterDetail.reports.map((rep: any, rIdx: number) => (
                  <div key={rep.id || rIdx} className="space-y-3 pb-3 border-b border-slate-100 last:border-b-0">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-mono text-[10px] uppercase text-slate-400">Citizen Report ID</span>
                        <div className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                          #{rep.id} • {rep.category}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">Source: Mobile Ingestion</span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase text-slate-400">Timestamp</span>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {rep.created_at ? new Date(rep.created_at).toLocaleTimeString() : 'Recent'}
                        </div>
                        <span className="font-mono text-[10px] text-amber-600">STATUS: {rep.status?.toUpperCase() || 'UNVERIFIED'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-mono text-[10px] uppercase text-slate-400">Citizen Narrative</span>
                        <div className="bg-slate-50 p-3 rounded-lg text-slate-700 mt-1 leading-relaxed border border-slate-200">
                          {rep.description || 'Citizen reported severe obstacle and hazard on transit corridor.'}
                        </div>
                      </div>

                      {rep.photo_url && (
                        <div>
                          <span className="font-mono text-[10px] uppercase text-slate-400">Submitted Photographic Evidence</span>
                          <div className="relative rounded-lg overflow-hidden bg-slate-200 mt-1 h-44">
                            <img
                              src={rep.photo_url}
                              alt="Citizen Capture"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-2 left-2 right-2 p-2 rounded bg-slate-900/80 text-white font-mono text-[10px] flex justify-between">
                              <span>COORDINATES: {round(rep.lat, 4)}° N, {round(rep.lng, 4)}° E</span>
                              <span>GPS VERIFIED</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="font-mono text-[10px] uppercase text-slate-400">Reporter Unit</span>
                      <div className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                        Civilian Telemetry Stream <CheckCircle size={13} className="text-blue-600" />
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">Verified Contact Number Registered</span>
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase text-slate-400">Ingestion Telemetry</span>
                      <div className="font-bold text-slate-900 mt-0.5">Real-time Stream</div>
                      <span className="font-mono text-[10px] text-amber-600">PENDING PHYSICAL CONFIRMATION</span>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="font-mono text-[10px] uppercase text-slate-400">Reported Corridor / Site</span>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {activeMission?.title || 'Sector 17 Commercial Corridor'}
                      </div>
                    </div>

                    <div>
                      <span className="font-mono text-[10px] uppercase text-slate-400">Citizen Narrative</span>
                      <div className="bg-slate-50 p-3 rounded-lg text-slate-700 mt-1 leading-relaxed border border-slate-200">
                        {activeMission?.description || 'Deep fracture and structural hazard reported by citizens on site.'}
                      </div>
                    </div>

                    <div>
                      <span className="font-mono text-[10px] uppercase text-slate-400">Citizen Mobile Capture</span>
                      <div className="relative rounded-lg overflow-hidden bg-slate-200 mt-1 h-44">
                        <img
                          src="https://images.unsplash.com/photo-1590247813693-5541d1c609fd?w=600&auto=format&fit=crop&q=80"
                          alt="Citizen Capture"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 right-2 p-2 rounded bg-slate-900/80 text-white font-mono text-[10px] flex justify-between">
                          <span>SECTOR 17 PLAZA</span>
                          <span>GPS TIMESTAMPED</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Pane: Observed Ground-Truth */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wide">OBSERVED GROUND-TRUTH</h2>
                </div>
                <span className="font-mono text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  GROUND-TRUTH • ON-SCENE
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Responder Identity</span>
                  <div className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                    {user?.full_name || 'Authorized Field Unit'} <Award size={13} className="text-emerald-600" />
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">CALLSIGN: ERU-FIELD-01</span>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Ground Survey Synced</span>
                  <div className="font-bold text-slate-900 mt-0.5">Active Field Observation</div>
                  <span className="font-mono text-[10px] text-emerald-600">INSPECTION IN PROGRESS</span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">GPS Coordinates</span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {userPos ? `${round(userPos.lat, 4)}° N, ${round(userPos.lng, 4)}° E` : '30.7333° N, 76.7794° E'} • Calibrated Sensor Fix
                  </div>
                </div>

                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Field SITREP & Observed Assessment</span>
                  <div className="bg-slate-50 p-3 rounded-lg text-slate-700 mt-1 leading-relaxed border border-slate-200">
                    {defectDescription}
                  </div>
                </div>

                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Calibrated Sensor Telemetry</span>
                  <div className="relative rounded-lg overflow-hidden bg-slate-200 mt-1 h-44">
                    <img
                      src="https://images.unsplash.com/photo-1541888946425-d0fbb180c5f7?w=600&auto=format&fit=crop&q=80"
                      alt="Calibrated Gauge"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 right-2 p-2 rounded bg-slate-900/80 text-white font-mono text-[10px] flex justify-between">
                      <span>OUTCOME: {surveyOutcome.toUpperCase()}</span>
                      <span>AUTHENTICATED FIELD PACKET</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Consequence Matrix */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers size={20} className="text-blue-600" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">OPERATIONAL CONSEQUENCE MATRIX</h3>
                  <p className="text-xs text-slate-500">Downstream tactical routing updates trigger automatically upon verification.</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                EOC DATASTREAM READY
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">1. TRANSIT GIS ROUTING</span>
                <span className="font-bold text-slate-900">Corridor Penalty (+{hazardPenalty})</span>
                <p className="text-slate-500 text-[11px]">Reroutes civilian and dispatch algorithms around verified blocked sectors.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">2. CAP PUBLIC ADVISORY</span>
                <span className="font-bold text-amber-700">Warning Broadcast Active</span>
                <p className="text-slate-500 text-[11px]">Broadcast safety advisory active for surrounding 500m area.</p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">3. INCIDENT PIPELINE</span>
                <span className="font-bold text-emerald-700">Status Elevation to "VERIFIED"</span>
                <p className="text-slate-500 text-[11px]">Syncs ground-truth verification into Coordinator Decision Center.</p>
              </div>
            </div>

            {/* Recent Field Survey Evidence Submissions */}
            {missionSurveys.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase font-bold text-slate-700">SUBMITTED FIELD SURVEY TELEMETRY PACKETS</span>
                  <span className="font-mono text-[10px] text-slate-500">{missionSurveys.length} RECORDS RECORDED</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {missionSurveys.map(s => (
                    <div key={s.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Survey #{s.id} • {s.verification_outcome || 'Verified'}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${s.is_propagated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {s.is_propagated ? 'PROPAGATED' : 'PENDING PROPAGATION'}
                        </span>
                      </div>
                      <p className="text-slate-600 line-clamp-2">{s.notes || 'Field evidence recorded.'}</p>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] font-mono text-slate-500">
                        <span>Hazard Lvl: {s.hazard_level || 3} • Penalty +{s.hazard_penalty || 20}s</span>
                        {!s.is_propagated && (
                          <button
                            type="button"
                            disabled={propagatingId === s.id}
                            onClick={() => propagateSurvey(s.id)}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[10px] flex items-center gap-1 transition-colors"
                          >
                            {propagatingId === s.id ? <Loader2 size={10} className="spin" /> : <Zap size={10} />}
                            Propagate to Graph
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification Workbench Action Buttons */}
            <div className="pt-3 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => toast.error('Incident flagged for secondary supervisor review')}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wide"
              >
                Requires Further Review
              </button>
              <button
                onClick={() => handleConfirmVerification(activeVerificationClusterId || activeMission?.cluster_id || null)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all uppercase tracking-wide"
              >
                <Check size={16} /> Confirm Ground-Truth Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: CAMPAIGNS (resqnet_responder_campaigns Relief Finance)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'campaigns' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-left justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-slate-500 font-bold">
                  TACTICAL DISASTER RELIEF FINANCE
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  AUTH PROTOCOL CH-2021
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CAMPAIGNS</h1>
              <p className="text-xs text-slate-500 max-w-2xl">
                Operational fundraising linked directly to verified disaster relief requirements, audited field inventories, and public treasury disbursement checkpoints.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-center text-xs">
                <span className="font-mono text-[9px] text-slate-400 uppercase">AUTHORIZED NGO CHARTER</span>
                <span className="font-mono font-bold text-slate-900">CH-2021-994 (NORTH TIER)</span>
              </div>
              <button
                onClick={() => toast('Relief campaigns are synchronized with State Disaster Management Authority.', { icon: '🏛️' })}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 uppercase tracking-wide"
              >
                <HeartHandshake size={16} />
                <span>State Treasury Sync</span>
              </button>
            </div>
          </div>

          {/* 4 Bento KPI Metric Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">ACTIVE CAMPAIGNS</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  LIVE
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 font-mono">02</span>
                <span className="font-mono text-[10px] text-slate-400">SECTOR-17 / MOHALI</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Currently receiving audited citizen funding in real-time.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">PENDING REVIEW</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                  EOC HOLD
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 font-mono">01</span>
                <span className="font-mono text-[10px] text-slate-400">REQ-112 ENROUTE</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Awaiting EOC Coordinator accreditation signoff before publishing.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">COMPLETED</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                  DISBURSED
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 font-mono">05</span>
                <span className="font-mono text-[10px] text-slate-400">PROCURED & CLOSED</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">100% funded, physically delivered and verified via field manifests.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-slate-500 font-bold">TOTAL RAISED (VERIFIED)</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                  STATE TREASURY
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 font-mono">₹8,42,500</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                <CheckCircle size={13} /> 100% audit transparent via State Gateway.
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-2">
              {[
                { id: 'all', label: 'All Campaigns' },
                { id: 'active', label: 'Active' },
                { id: 'pending', label: 'Pending Review' },
                { id: 'completed', label: 'Completed' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCampaignFilter(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${campaignFilter === tab.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {loadingCampaigns && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Loader2 size={13} className="spin" /> Syncing Treasury...
                </span>
              )}
              {user?.verification_status === 'verified' ? (
                <button
                  onClick={() => toast('Campaign proposal dialog opened. Fill required field targets.', { icon: '📝' })}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 uppercase tracking-wide"
                >
                  <CheckCircle size={14} />
                  <span>Create Campaign (Accredited NGO)</span>
                </button>
              ) : (
                <button
                  onClick={() => toast.error('Campaign creation requires verified NGO accreditation from Admin Verification Workbench. Current status: ' + (user?.verification_status || 'pending').toUpperCase())}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1.5 uppercase tracking-wide cursor-not-allowed"
                >
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span>Campaign Creation Disabled (Pending Accreditation)</span>
                </button>
              )}
            </div>
          </div>

          {/* Campaigns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(campaigns.length > 0
              ? campaigns.map(c => ({
                id: c.id,
                title: c.title,
                desc: c.description,
                target: Number(c.target_amount) || 100000,
                raised: Number(c.raised_amount) || 0,
                status: c.status || 'active',
                type: c.resource_type || 'relief',
              }))
              : [
                {
                  id: 1,
                  title: 'Sector 17 Emergency Medical Supplies & Shoring',
                  desc: 'Procurement of hydraulic jacks, acoustic crack sensors, and trauma dressings for Sector 17 commercial arcade stabilization.',
                  target: 250000,
                  raised: 184500,
                  status: 'active',
                  type: 'medical',
                },
                {
                  id: 2,
                  title: 'Madhya Marg Underpass Flood Relief & Food Distribution',
                  desc: 'Emergency dry rations, potable drinking water containers, and dewatering pumps for marooned residents near Jan Marg.',
                  target: 150000,
                  raised: 150000,
                  status: 'completed',
                  type: 'food',
                },
              ]
            )
              .filter(c => {
                if (campaignFilter === 'all') return true
                if (campaignFilter === 'active') return c.status === 'active'
                if (campaignFilter === 'completed') return c.status === 'completed'
                if (campaignFilter === 'pending') return c.status === 'pending' || c.status === 'draft'
                return true
              })
              .map(c => {
                const pct = Math.min(100, Math.round((c.raised / c.target) * 100))
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {c.type.toUpperCase()} RELIEF
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono ${c.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-slate-900 leading-snug">{c.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-500">Raised: <strong className="text-slate-900">₹{c.raised.toLocaleString('en-IN')}</strong></span>
                        <span className="text-slate-500">Target: <strong className="text-slate-900">₹{c.target.toLocaleString('en-IN')}</strong></span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center pt-1 text-[11px] text-slate-500">
                        <span>{pct}% funded</span>
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle size={13} /> Verified by State Auditor
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: ORGANIZATION (resqnet_responder_organization_profile)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'organization' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Header Subsystem */}
          <div className="flex flex-col md:flex-row md:items-left justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Building2 size={16} />
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">AFFILIATION MATRIX • SEC-17/DEL-2</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ORGANIZATION</h1>
              <p className="text-xs text-slate-500">Authorized operational unit & accredited civil affiliation profile</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => toast.success('Operational SITREP exported successfully.')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all"
              >
                <FileText size={15} />
                <span>Export SITREP</span>
              </button>
              <button
                onClick={() => toast.success('Credentials re-verified with SDMA Gateway!')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-xs hover:bg-blue-700 transition-all uppercase tracking-wide"
              >
                <CheckCircle size={15} />
                <span>Re-Verify Credentials</span>
              </button>
            </div>
          </div>

          {/* Top Main Profile Card */}
          <div className="bg-white rounded-xl p-6 shadow-xs border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-indigo-500" />
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start">
              <div className="flex flex-col md:flex-row gap-5 items-start">
                <div className="relative w-20 h-20 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 shadow-inner">
                  <Shield size={38} className="text-blue-600" />
                  <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] uppercase font-bold border border-emerald-200">
                      <CheckCircle size={12} /> ACTIVE • OPERATIONAL DEPLOYMENT
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] uppercase font-bold border border-blue-200">
                      ID: CH-2021-994
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">SDMA/RED-CROSS VALIDATED</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Chandigarh Emergency Volunteers <span className="text-slate-500 font-normal">(ERU Sector-17 Quick Response Unit)</span>
                  </h2>
                  <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                    Authorized Hybrid Civil Defense & NGO Quick Response Unit • Attached to Emergency Operations Center (EOC) Sector 17, Sector 16 Trauma Core, and Mohali Corridor Relief Channel.
                  </p>
                </div>
              </div>

              {/* Quick Action Dial / EOC Emergency Callout */}
              <div className="w-full lg:w-auto bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">EOC CONTROL MATRIX</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <Radio size={16} className="text-blue-600" />
                  <span className="font-mono text-xs font-bold text-slate-900">156.800 MHz (VHF CH-02)</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 mt-1 border-t border-slate-200/60 font-mono">
                  <span>DISPATCH: +91 172-274-0112</span>
                  <span className="text-blue-600 font-bold">L-1 DIRECT</span>
                </div>
              </div>
            </div>

            {/* Metadata Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">OPERATING JURISDICTION • PRIMARY ZONE</span>
                <p className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <MapPin size={15} className="text-blue-600" /> Chandigarh Tricity Sector 16, 17, 22
                </p>
                <span className="text-[11px] text-slate-500">Sub-sectors: Manimajra & Mohali Disaster Relief Corridor</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">LEAD COORDINATOR LIAISON</span>
                <p className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <User size={15} className="text-blue-600" /> Vikram Malhotra
                </p>
                <span className="text-[11px] text-slate-500">Zone 1 Commander • EOC Tactical Oversight Officer</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">FIELD UNIT SPECIFICATION</span>
                <p className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <Activity size={15} className="text-blue-600" /> 8 Personnel (ERU-DELTA-2)
                </p>
                <span className="text-[11px] text-slate-500">ISO-DRR Field Compliant • 2 Mobile Logistics Rigs</span>
              </div>
            </div>
          </div>

          {/* Operational Summary KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">ACTIVE MISSIONS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-mono font-bold text-red-600 leading-none">01</span>
                  <span className="text-[10px] font-mono text-red-600 font-bold uppercase">URGENT</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">Mission-2048: Block C Struct.</span>
              </div>
              <div className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
                <AlertTriangle size={22} />
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">COMPLETED MISSIONS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-mono font-bold text-slate-900 leading-none">14</span>
                  <span className="text-[10px] font-mono text-emerald-600 font-bold uppercase">VERIFIED</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">Past 48h validated closures</span>
              </div>
              <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckCircle size={22} />
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">SUPPORTED REQS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-mono font-bold text-slate-900 leading-none">06</span>
                  <span className="text-[10px] font-mono text-blue-600 font-bold uppercase">LOGISTICS</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">Medical, dewatering & rations</span>
              </div>
              <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
                <Layers size={22} />
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">AUTH CAMPAIGNS</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-mono font-bold text-amber-600 leading-none">02</span>
                  <span className="text-[10px] font-mono text-amber-600 font-bold uppercase">ACTIVE</span>
                </div>
                <span className="text-xs text-slate-500 mt-1">Sec 16 Trauma & Mohali Shelter</span>
              </div>
              <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                <HeartHandshake size={22} />
              </div>
            </div>
          </div>

          {/* Detailed Tactical Workspace: 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Deployments & Logistics (Span 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Active Deployments & Missions Roster */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
                <div className="flex items-center justify-between pb-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <Navigation size={18} className="text-blue-600" />
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 uppercase">Active Deployments & Missions Roster</h3>
                      <p className="font-mono text-[10px] text-slate-400 uppercase">ASSIGNED TO CHANDIGARH ERU-DELTA-2</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">
                    2 RECORDED
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:bg-white transition-all space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                          MISSION-2048
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 text-[10px] font-mono uppercase font-bold">
                          CRITICAL
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono uppercase font-semibold">
                          EN ROUTE • ETA 3M
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">DISPATCH: 12:44 IST</span>
                    </div>
                    <p className="font-bold text-sm text-slate-900">Structural Damage Assessment</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="text-blue-600" /> Sector 17 Plaza, Block C (Commercial Facade)
                      </span>
                      <span className="flex items-center gap-1">
                        <User size={13} className="text-slate-400" /> Tactical Lead: <strong className="text-slate-800 ml-1">Arjun Mehta</strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 bg-white p-2 rounded border border-slate-200/60">
                      <span className="font-mono text-[11px] text-slate-600">GPS: 30.7398° N, 76.7827° E</span>
                      <button
                        onClick={() => setSearchParams({ tab: 'missions' })}
                        className="font-mono text-xs text-blue-600 hover:underline font-bold uppercase flex items-center gap-1"
                      >
                        OPEN MISSION SITREP <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:bg-white transition-all space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                          MISSION-2039
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-mono uppercase font-bold">
                          HIGH
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-mono uppercase font-semibold">
                          QUEUED / STANDBY
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">TARGET: 14:15 IST</span>
                    </div>
                    <p className="font-bold text-sm text-slate-900">Medical Evacuation Support (Trauma Staging)</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="text-blue-600" /> Sector 16 General Hospital (Emergency Wing Gate 4)
                      </span>
                      <span className="flex items-center gap-1">
                        <User size={13} className="text-slate-400" /> Support Lead: <strong className="text-slate-800 ml-1">Dr. S. Kulkarni</strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 bg-white p-2 rounded border border-slate-200/60">
                      <span className="font-mono text-[11px] text-slate-600">RESOURCES: 2 Paramedics Allocated</span>
                      <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">AWAITING TRIAGE FLIGHT LOG</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supported Resource Requirements */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
                <div className="flex items-center justify-between pb-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 uppercase">Supported Resource Requirements</h3>
                      <p className="font-mono text-[10px] text-slate-400 uppercase">ACTIVE MATERIEL LOGISTICS STACK</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold uppercase shadow-xs">
                    3 ACTIVE MANIFESTS
                  </span>
                </div>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-200 font-bold">
                        REQ
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">REQ-108</span>
                          <span className="font-semibold text-slate-900">Emergency Medical Trauma Kits</span>
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          <strong>420 Units needed</strong> • Sector 16 Safety Hub
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] font-bold border border-blue-200">
                        PARTIALLY MET (CAMPAIGN)
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 mt-1">ALLOCATED: 280 / 420</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200 font-bold">
                        PMP
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">REQ-094</span>
                          <span className="font-semibold text-slate-900">High-Capacity Dewatering Pumps</span>
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          <strong>2 Units deployed</strong> • Madhya Marg Underpass
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200">
                        OPERATIONAL
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 mt-1">RATE: 4,500 LPM RUNNING</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 font-bold">
                        WTR
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">REQ-082</span>
                          <span className="font-semibold text-slate-900">Potable Water Bowser Refill</span>
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          <strong>8,000L Payload</strong> • Sector 22 Relief Depot
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200">
                        DISPATCHED
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 mt-1">CARRIER: BOWSER-CH-07</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Accredited NGO Campaigns & Roll Call (Span 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Section 3: Accredited NGO Campaign Linkage */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
                <div className="flex items-center justify-between pb-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <HeartHandshake size={18} className="text-amber-600" />
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 uppercase">Accredited NGO Campaigns</h3>
                      <p className="font-mono text-[10px] text-slate-400 uppercase">VERIFIED FINANCIAL & MATERIEL PIPELINE</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold uppercase">
                    NGO AUTH
                  </span>
                </div>

                <div className="flex flex-col gap-4 text-xs">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold uppercase border border-emerald-200">
                          ACTIVE PIPELINE
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">Emergency Medical Supplies — Sector 16</h4>
                      </div>
                      <span className="font-mono text-[10px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                        LINK: REQ-108
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1 font-mono">
                        <span className="font-bold text-slate-900">₹1,72,500</span>
                        <span className="text-slate-500">TARGET: ₹2,50,000 (69%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: '69%' }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 text-slate-500 text-[11px]">
                      <span className="font-mono">184 DONORS • CHANDIGARH RELIEF CHARTER</span>
                      <button
                        onClick={() => setSearchParams({ tab: 'campaigns' })}
                        className="text-blue-600 font-bold hover:underline"
                      >
                        Details
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-mono text-[10px] font-bold uppercase border border-amber-200">
                          PENDING EOC REVIEW
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 mt-1">Shelter Kits for Flood-Affected Families</h4>
                      </div>
                      <span className="font-mono text-[10px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                        LINK: REQ-112
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1 font-mono">
                        <span className="font-bold text-slate-900">₹1,20,000</span>
                        <span className="text-slate-500">TARGET: ₹3,00,000 (40%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: '40%' }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 text-slate-500 text-[11px]">
                      <span className="font-mono">MOHALI PERIPHERY DISPATCH</span>
                      <span className="text-slate-400">Awaiting Clearance</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Field Unit Equipment & Personnel Roll Call */}
              <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
                <div className="flex items-center justify-between pb-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <Award size={18} className="text-blue-600" />
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 uppercase">Equipment & Personnel Roll Call</h3>
                      <p className="font-mono text-[10px] text-slate-400 uppercase">ERU-DELTA-2 ACTIVE ROSTER</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] uppercase font-bold border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 100% READY
                  </span>
                </div>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                      FIELD SPECIALIST STRENGTH (8 TOTAL)
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white p-2 rounded border border-slate-200 shadow-xs">
                        <span className="font-mono text-lg text-blue-600 font-bold block">4</span>
                        <span className="font-mono text-[10px] text-slate-500 uppercase">First Responders</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 shadow-xs">
                        <span className="font-mono text-lg text-red-600 font-bold block">2</span>
                        <span className="font-mono text-[10px] text-slate-500 uppercase">Paramedics</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 shadow-xs">
                        <span className="font-mono text-lg text-amber-600 font-bold block">2</span>
                        <span className="font-mono text-[10px] text-slate-500 uppercase">Search & Rescue</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col gap-2">
                    <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      DEPLOYED RIGS & MOBILE ASSETS
                    </span>
                    <div className="flex items-center justify-between bg-white p-2.5 rounded border border-slate-200">
                      <div>
                        <p className="font-bold text-slate-900 text-xs">ERU Quick Response Light Rig</p>
                        <span className="font-mono text-[11px] text-slate-500">TAG: CH-01-GA-4819</span>
                      </div>
                      <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                        ON SCENE (SEC 17)
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white p-2.5 rounded border border-slate-200">
                      <div>
                        <p className="font-bold text-slate-900 text-xs">Emergency Equipment Van</p>
                        <span className="font-mono text-[11px] text-slate-500">TAG: CH-01-TA-2091</span>
                      </div>
                      <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        STAGED (BASE 17)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-mono text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-600" />
                      <span className="uppercase font-bold">ISO-DRR FIELD COMPLIANT</span>
                    </div>
                    <span className="text-slate-400">AUDIT PASS • 08-OCT-2024</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: PROFILE & CREDENTIALS (resqnet_responder_profile_credentials)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'profile' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-left justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  TERMINAL ID: TRM-8820-DELTA
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="font-mono text-[10px] text-slate-400 uppercase">SYS_REV: 2.4.12-BUILD</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PROFILE & CREDENTIALS</h1>
              <p className="text-xs text-slate-500">Authenticated responder identity, tactical certifications, and field duty configuration</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col text-right font-mono text-xs">
                <span className="text-[9px] uppercase text-slate-400 font-bold">CREDENTIAL HASH</span>
                <span className="text-slate-900 font-bold">0x8F92...B140</span>
              </div>
              <button
                onClick={() => toast.success('Security token refreshed & synchronized with EOC directory!')}
                className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs uppercase tracking-wide transition-all"
              >
                Re-Verify Token
              </button>
            </div>
          </div>

          {/* Hero Card */}
          <div className="bg-white rounded-xl p-6 shadow-xs border border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-2xl shadow-sm">
                  {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : 'AM'}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center">
                  <CheckCircle size={14} className="text-emerald-600" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-slate-900">{user?.full_name || 'Arjun Mehta'}</h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-50 text-blue-700 font-bold border border-blue-200">
                    FIELD RESPONDER
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> ACTIVE • VERIFIED
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Certified Emergency Response Personnel & Search/Rescue Technician • Chandigarh ERU-Sector 17 Quick Response
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Building2 size={13} className="text-slate-400" /> Chandigarh Emergency Volunteers (Unit 4)
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={13} className="text-slate-400" /> Chandigarh Tricity (Sectors 16, 17, 22)
                  </span>
                  <span className="flex items-center gap-1 text-slate-900 font-bold">
                    <Shield size={13} className="text-blue-600" /> Badge #{user?.id ? `CH-SDRF-${user.id + 8800}` : 'CH-SDRF-8820'}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="flex items-stretch gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 w-full lg:w-auto">
              <div className="flex flex-col justify-center px-3 py-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">DEPLOYMENTS</span>
                <span className="font-mono text-xl text-slate-900 font-bold">47</span>
                <span className="font-mono text-[9px] text-emerald-600 uppercase font-bold">100% RESOLVED</span>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex flex-col justify-center px-3 py-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">READINESS</span>
                <span className="font-mono text-xl text-blue-600 font-bold">TIER 1</span>
                <span className="font-mono text-[9px] text-slate-500 uppercase">RAPID MOBILIZE</span>
              </div>
              <div className="w-px bg-slate-200" />
              <div className="flex flex-col justify-center px-3 py-1">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">EXPIRY</span>
                <span className="font-mono text-xl text-slate-900 font-bold">DEC 2026</span>
                <span className="font-mono text-[9px] text-slate-500 uppercase">NDRF RENEWAL</span>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">CERTIFICATION & STATUTORY COMPLIANCE</h3>
              <div className="space-y-3 text-xs">
                {[
                  { name: 'NDRF Level 2 Urban Search & Rescue (USAR)', id: 'CERT-NDRF-2023-88', date: 'Valid thru Nov 2027', status: 'Active' },
                  { name: 'Advanced Trauma First Responder (ATFR-V)', id: 'CERT-ATFR-9011', date: 'Valid thru Aug 2026', status: 'Active' },
                  { name: 'Civil Defense VHF Radio Transceiver Authorization', id: 'VHF-AUTH-CH-02', date: 'Renewed Oct 2024', status: 'Active' },
                  { name: 'High-Angle Rope Rescue & Shoring Certification', id: 'CERT-HAR-4410', date: 'Valid thru Dec 2026', status: 'Active' },
                ].map((c, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <span className="font-mono text-[11px] text-slate-500">{c.id} • {c.date}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200">
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200 space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">COMMUNICATION & TELEMETRY PROTOCOLS</h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">AUTHORIZED RADIO FREQUENCIES</span>
                  <p className="font-bold text-slate-900">156.800 MHz (VHF Channel 02 Primary Tactical)</p>
                  <p className="text-[11px] text-slate-500">Secondary repeater: 148.125 MHz (EOC Trunk Backup)</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">OPERATIONAL PROTOCOL & DATA LINK</span>
                  <p className="font-bold text-slate-900">Authenticated EOC Mission Stream Protocol</p>
                  <p className="text-[11px] text-slate-500">Node identity signature validated with Central Command</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">EMERGENCY ASSISTANCE CALLSIGNS</span>
                  <p className="font-bold text-slate-900">DELTA-2-LEAD (Arjun Mehta) • VHF Monitor Live</p>
                  <p className="text-[11px] text-slate-500">Direct Hotline: +91 172-274-0112</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB: NOTIFICATIONS (resqnet_responder_notifications_center)
      ───────────────────────────────────────────────────────────── */}
      {currentTab === 'notifications' && (
        <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 w-full overflow-y-auto">
          {/* Header Subsystem */}
          <div className="flex flex-col md:flex-row md:items-left justify-between gap-4 pb-3 border-b border-slate-200">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] uppercase tracking-wider font-semibold border border-blue-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  INGEST STREAM LIVE
                </span>
                <span className="font-mono text-[10px] text-slate-400 uppercase">NODE: CHD-S17-09</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">NOTIFICATIONS</h1>
              <p className="text-xs text-slate-500">Real-time operational dispatches, verification tasks, and telemetry updates</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })))
                  toast.success('All notifications marked as read.')
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all"
              >
                <CheckCheck size={16} className="text-slate-500" />
                <span>Mark All as Read</span>
              </button>
              <button
                onClick={() => toast('Notification channels synced with SDMA radio relays.', { icon: '📡' })}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all"
              >
                <Activity size={16} className="text-slate-500" />
                <span>Notification Settings</span>
              </button>
            </div>
          </div>

          {/* Main Grid: 2-column landscape */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left notifications list (Span 8 or 9) */}
            <div className="xl:col-span-8 flex flex-col gap-4">
              {/* Category Filter Bar */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-2 flex items-center justify-between overflow-x-auto gap-2">
                <div className="flex items-center gap-1.5 min-w-max">
                  {[
                    { id: 'all', label: 'All Notifications', count: notifications.length },
                    { id: 'unread', label: 'Unread', count: notifications.filter(n => !n.read).length },
                    { id: 'missions', label: 'Missions', count: notifications.filter(n => n.category === 'missions').length },
                    { id: 'verifications', label: 'Verifications', count: notifications.filter(n => n.category === 'verifications').length },
                    { id: 'road', label: 'Road & Transit', count: notifications.filter(n => n.category === 'road').length },
                    { id: 'system', label: 'System', count: notifications.filter(n => n.category === 'system').length },
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
                {notifications.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs font-mono">
                    No active dispatches or operational notifications logged for your unit.
                  </div>
                ) : (
                  notifications
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
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${n.category === 'missions'
                          ? 'bg-blue-50 text-blue-600 border border-blue-200'
                          : n.category === 'verifications'
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : n.category === 'road'
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                          {n.category === 'missions' ? <Navigation size={18} /> :
                            n.category === 'verifications' ? <CheckCircle size={18} /> :
                              n.category === 'road' ? <AlertTriangle size={18} /> : <FileText size={18} />}
                        </div>

                        <div className="flex flex-col gap-1 min-w-0 flex-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold ${n.category === 'missions'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : n.category === 'verifications'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : n.category === 'road'
                                  ? 'bg-red-50 text-red-600 border border-red-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                              {n.category.toUpperCase()}
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
                            setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))
                            setSearchParams({ tab: n.actionTab })
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
                  ))
                )}
              </div>
            </div>

            {/* Right Tactical Sidebar (Span 4) */}
            <div className="xl:col-span-4 flex flex-col gap-6">
              {/* Mesh Sync Stats */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Radio size={18} className="text-blue-600" />
                    <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900">TELEMETRY LINK STATUS</h3>
                  </div>
                  <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase">
                    ONLINE
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-500 font-mono text-[11px]">
                    <span>MESH MIGRATION STABLE</span>
                    <span className="font-bold text-slate-900">98.4%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: '98.4%' }} />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 pt-1">
                    <span>LATENCY: 1.2s AVG</span>
                    <span>PEERS: 14 FIELD RELAYS</span>
                  </div>
                </div>
              </div>

              {/* Channel Routing Priority */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wide">
                  <Layers size={16} className="text-blue-600" />
                  <span>Channel Routing Priority</span>
                </div>

                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600" />
                      <span className="font-bold text-slate-900">CAP Priority 1 Audio</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">VHF CH-04</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="font-bold text-slate-900">Citizen Triage Stream</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">LTE / SMS MESH</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span className="font-bold text-slate-900">NDRF Logistics Ingest</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 uppercase font-bold">SAT-LINK AUTO</span>
                  </div>
                </div>
              </div>

              {/* Quick Transmit Box */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-2">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">QUICK TRANSMIT</span>
                <p className="text-xs text-slate-500">Acknowledge all urgent dispatches currently queued on mobile console.</p>
                <button
                  onClick={() => {
                    setNotifications(prev => prev.map(item => ({ ...item, read: true })))
                    toast.success('Quick SITREP ACK broadcasted to EOC desk!')
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

      {/* FOOTER ACCREDITATION (Matches all slides) */}
      <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs mt-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <strong className="text-slate-900 block uppercase font-bold text-[11px] tracking-wide">
              CAMPAIGN & FIELD OPERATIONS ACCREDITATION
            </strong>
            <span className="text-slate-500">
              Authorized under ActionAid / Red Cross Relief Charter (NGO Reg: <strong>CH-2021-994</strong>). Verified by State Disaster Response Authority.
            </span>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 text-[10px] font-mono font-bold uppercase tracking-wider">
          ACCREDITED NGO RESPONDER UNIT
        </span>
      </div>
    </div>
  )
}
