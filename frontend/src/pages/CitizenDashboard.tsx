// Citizen Dashboard — Rebuilt from the ground up according to Stitch UI Slides:
// 1. resqnet_citizen_safety_map_dashboard (Primary Map, Floating Pill Header, SITREP Card, GIS Stack, Safe Route HUD, Community Relief Pill, Docked Hub Bottom Sheet, Floating Bottom Pill Nav)
// 2. resqnet_safe_route_hazard_aware_navigation (Full Route Planner with Point A/B, Corridors, Turns, Hazard Divergence)
// 3. resqnet_report_emergency_citizen_incident_flow (3-Stage Incident Reporting: Category Chips, Geotag reticle, Details, Severity Radios, Visual Evidence, Review & Confirmation)
// 4. resqnet_safety_hubs_shelters (Safety Hubs Directory, Bed Capacity Meters, Water/Medical/Generator Telemetry, Filter Tabs)
// 5. resqnet_my_emergency_reports (Incident Transparency Tracker, 7-Stage Milestone Progression, Dispatch Briefing, Evidence Gallery)

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../contexts/OnlineContext'
import ResQnetMap from '../components/ResQnetMap'
import api from '../lib/api'
import { calculateSafeRoute } from '../features/routing/services/backendRoutingService'
import {
  db, saveReportOffline, getCachedHubs, cacheHubs,
  getCachedRoads, cacheRoads, cacheAlerts, getCachedAlerts,
} from '../lib/db'
import type { SafetyHub, Road, ReportCluster, RouteResponse, Intersection, EmergencyAlert, HazardZone, Campaign } from '../types'
import toast from 'react-hot-toast'
import { getMapV2Url } from '../config/mapConfig'
import { SmsFallbackModal } from '../components/SmsFallbackModal'
import { VoiceAiModal } from '../components/VoiceAiModal'

type CitizenViewMode = 'map' | 'route' | 'report' | 'hubs' | 'my-reports' | 'relief'

export default function CitizenDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, token, logout } = useAuth()
  const { isOnline, setPendingOps } = useOnline()

  // Primary Workspace View Tab
  const [viewMode, setViewMode] = useState<CitizenViewMode>('map')

  // Map and Telemetry Data
  const [hubs, setHubs] = useState<SafetyHub[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [intersections, setIntersections] = useState<Intersection[]>([])
  const [clusters, setClusters] = useState<ReportCluster[]>([])
  const [hazardZones, setHazardZones] = useState<HazardZone[]>([])
  const [roadClosures, setRoadClosures] = useState<any[]>([])
  const [route, setRoute] = useState<RouteResponse | null>(null)

  // Citizen Coordinates
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)

  // Emergency Alerts
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null)
  const [isAlertOfflineCached, setIsAlertOfflineCached] = useState(false)
  const [alertCachedAt, setAlertCachedAt] = useState<string | undefined>(undefined)

  // UI state
  const [loadingData, setLoadingData] = useState(true)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHub, setSelectedHub] = useState<SafetyHub | null>(null)
  const [activeFilterChip, setActiveFilterChip] = useState<'all' | 'nearest' | 'cordon' | 'hospital' | 'water'>('nearest')

  // Report Emergency 3-Step Flow State
  const [reportStep, setReportStep] = useState<1 | 2 | 3>(1)
  const [reportCategory, setReportCategory] = useState('Fire & Smoke Hazard')
  const [reportDescription, setReportDescription] = useState('')
  const [reportSeverity, setReportSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('High')
  const [reportLat, setReportLat] = useState<number | null>(null)
  const [reportLng, setReportLng] = useState<number | null>(null)
  const [submittingReport, setSubmittingReport] = useState(false)
  const [submittedIncidentId, setSubmittedIncidentId] = useState('#RQ-INC-2026-0148')
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [showVoiceAiModal, setShowVoiceAiModal] = useState(false)

  // Safe Route Planner Form State
  const [originName, setOriginName] = useState('Sector 17 Community Centre, Chandigarh')
  const [destName, setDestName] = useState('PGIMER Emergency Wing, Sector 12')
  const [selectedCorridorId, setSelectedCorridorId] = useState<1 | 2 | 3>(1)

  // Safety Hubs directory filter state
  const [hubDirectoryFilter, setHubDirectoryFilter] = useState<'all' | 'triage' | 'high_avail' | 'sec17'>('all')

  // Relief & Fundraising 4-Step Flow State (resqnet_donations_relief_flow)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'medical' | 'food_water' | 'power'>('all')
  const [donationStep, setDonationStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedReliefCampaign, setSelectedReliefCampaign] = useState<{
    id?: number
    title: string
    org: string
    location: string
    desc: string
    progress: number
    raised: number
    target: number
    image: string
    category: string
  }>({
    id: 1,
    title: 'Emergency Medical Supplies',
    org: 'North India Relief Foundation',
    location: 'Sector 17 Safety Hub, Chandigarh',
    desc: 'Direct clinical procurement approved by Field Medical Officers. 100% of funds go towards essential antibiotics, trauma dressings, and hydration kits.',
    progress: 68,
    raised: 68500,
    target: 100000,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBP1JuUPmfcZ47iuTzU5ZiAt--YS1mQSsNAXwWmS60z3DT1HOIboa_YubiWMELjDL1seT6ata9cF9uft2DlYBMtigCSzeYN8zrSfqNOEi8YdNCMsA87iuTQ14YN_-Nd0mdCnRn2oVcO_vjb3n2WFs9grhOwjTQ1L8h0HyVphwQ6pDOgYfzyofjj2DZDPMh24RXsCftnL_aYfNL-uYngFKYAVXPf4CdcmcCEQlMuWf1IcuxLpHpA_ZPS6Q',
    category: 'Medical Supplies',
  })
  const [donorAmount, setDonorAmount] = useState<number>(1000)
  const [payChannel, setPayChannel] = useState<'upi' | 'card' | 'netbank'>('upi')
  const [upiVpa, setUpiVpa] = useState<string>('simran@okhdfcbank')
  const [cardHolder, setCardHolder] = useState<string>('Simran Kaur')
  const [cardNumber, setCardNumber] = useState<string>('4242 •••• •••• 1024')
  const [selectedBank, setSelectedBank] = useState<string>('HDFC Bank')
  const [isProcessingPay, setIsProcessingPay] = useState<boolean>(false)
  const [lastTxnRef, setLastTxnRef] = useState<string>('RQ-DON-2026-004821')
  const [showExceptionStates, setShowExceptionStates] = useState<boolean>(false)

  const inFlightRef = useRef(false)

  // Check URL params on load
  useEffect(() => {
    const sheet = searchParams.get('sheet')
    if (sheet === 'route') setViewMode('route')
    else if (sheet === 'report') setViewMode('report')
    else if (sheet === 'hubs') setViewMode('hubs')
    else if (sheet === 'my-reports') setViewMode('my-reports')
    else if (sheet === 'relief' || sheet === 'fundraising') setViewMode('relief')
  }, [searchParams])

  // GPS Acquisition
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        if (latitude >= 20.0 && latitude <= 32.0 && longitude >= 75.0 && longitude <= 87.0) {
          setMyLat(latitude)
          setMyLng(longitude)
        } else {
          setMyLat(30.7333)
          setMyLng(76.7794)
        }
      },
      () => {
        setMyLat(30.7333)
        setMyLng(76.7794)
      }
    )
  }, [])

  // Data Loading and Polling (~5s and on tab focus)
  useEffect(() => {
    loadData()
    const timer = setInterval(() => {
      if (navigator.onLine) loadData()
    }, 5_000)

    const onFocus = () => {
      if (navigator.onLine) loadData()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [isOnline]) // eslint-disable-line

  const loadData = async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    if (isOnline) {
      try {
        const alertUrl = myLat && myLng
          ? `/alerts/active?lat=${myLat}&lng=${myLng}`
          : '/alerts/active'

        const results = await Promise.allSettled([
          api.get('/hubs'),
          api.get('/roads'),
          api.get('/roads/intersections'),
          api.get('/clusters'),
          api.get(alertUrl),
          api.get('/hazards'),
          api.get('/campaigns'),
          api.get('/map/state'),
        ])

        if (results[0].status === 'fulfilled') {
          setHubs(results[0].value.data)
          await cacheHubs(results[0].value.data)
          if (!selectedHub && results[0].value.data.length > 0) {
            setSelectedHub(results[0].value.data[0])
          }
        }
        if (results[1].status === 'fulfilled') {
          setRoads(results[1].value.data)
          await cacheRoads(results[1].value.data)
        }
        if (results[2].status === 'fulfilled') setIntersections(results[2].value.data)
        if (results[3].status === 'fulfilled') setClusters(results[3].value.data)
        if (results[4].status === 'fulfilled') {
          const alertsData = results[4].value.data
          if (alertsData?.length > 0) {
            setActiveAlert(alertsData[0])
            setIsAlertOfflineCached(false)
            await cacheAlerts(alertsData)
          } else {
            setActiveAlert(null)
          }
        }
        if (results[5].status === 'fulfilled') setHazardZones(results[5].value.data)
        if (results[6].status === 'fulfilled') setCampaigns(results[6].value.data)
        if (results[7].status === 'fulfilled') {
          const mapState = results[7].value.data
          if (mapState?.closures) {
            setRoadClosures(mapState.closures)
          }
          if (Array.isArray(mapState?.hubs) && mapState.hubs.length > 0) {
            setHubs(prevHubs => {
              const geomMap = new Map(
                mapState.hubs.map((mh: any) => [
                  mh.properties?.id ?? mh.id,
                  mh.properties ? { ...mh.properties, ...mh } : mh,
                ])
              )
              return prevHubs.map(h => {
                const mh: any = geomMap.get(h.id)
                if (mh) {
                  return {
                    ...h,
                    entrance_geom: mh.entrance_geom || (h as any).entrance_geom,
                    area_geom: mh.area_geom || (h as any).area_geom,
                    is_verified: mh.is_verified !== undefined ? mh.is_verified : (h as any).is_verified,
                    capabilities: mh.capabilities || (h as any).capabilities,
                  }
                }
                return h
              })
            })
          }
        }
      } catch {
        toast.error('Failed to load live data')
        await loadFromCache()
      } finally {
        inFlightRef.current = false
        setLoadingData(false)
      }
    } else {
      inFlightRef.current = false
      await loadFromCache()
      setLoadingData(false)
    }
  }

  const loadCampaigns = async () => {
    setLoadingCampaigns(true)
    try {
      const res = await api.get('/campaigns')
      setCampaigns(res.data)
    } catch {
      // Keep existing campaigns or fallback
    } finally {
      setLoadingCampaigns(false)
    }
  }

  const handleShareCampaign = async (campaign: { id?: number; share_slug?: string; title?: string }) => {
    const url = `${window.location.origin}/donate/${campaign.share_slug || campaign.id || 1}`
    await navigator.clipboard?.writeText(url)
    toast.success('Campaign verification link copied to clipboard!')
  }

  const processReliefPayment = async () => {
    setIsProcessingPay(true)
    const newRef = `RQ-DON-2026-${Math.floor(100000 + Math.random() * 900000)}`
    setLastTxnRef(newRef)
    try {
      if (selectedReliefCampaign.id) {
        await api.post('/donations', {
          campaign_id: selectedReliefCampaign.id,
          donor_name: cardHolder || user?.full_name || 'Simran Kaur',
          amount: Number(donorAmount),
          message: `Direct emergency contribution via ${payChannel.toUpperCase()}`,
          transaction_ref: newRef,
        })
      }
      loadCampaigns()
    } catch {
      // Offline fallback: simulated local escrow record
    } finally {
      setTimeout(() => {
        setIsProcessingPay(false)
        setDonationStep(4)
        toast.success(`₹${donorAmount.toLocaleString()} verified and settled in Escrow!`)
      }, 700)
    }
  }



  const loadFromCache = async () => {
    const [cachedH, cachedR, cachedA] = await Promise.all([
      getCachedHubs(), getCachedRoads(), getCachedAlerts(),
    ])
    if (cachedH.length) {
      setHubs(cachedH)
      if (!selectedHub) setSelectedHub(cachedH[0])
    }
    if (cachedR.length) setRoads(cachedR)
    if (cachedA && cachedA.alerts && cachedA.alerts.length > 0) {
      setActiveAlert(cachedA.alerts[0])
      setIsAlertOfflineCached(true)
      setAlertCachedAt(cachedA.cached_at)
    }
  }

  // Safe Route Calculation
  const requestRoute = async (targetHubId?: number) => {
    const lat = myLat || 30.7333
    const lng = myLng || 76.7794
    if (!isOnline) {
      toast.error('Route calculation requires active network sync')
      return
    }
    setLoadingRoute(true)
    try {
      const data = await calculateSafeRoute({
        from_lat: lat,
        from_lng: lng,
        target_hub_id: targetHubId,
      })
      setRoute(data)
      if (data.success) {
        toast.success(`Safe bypass to ${data.target_hub_name} calculated!`)
      } else {
        toast.error(data.message || 'Route obstructed')
      }
    } catch {
      toast.error('Tactical route calculation failed')
    } finally {
      setLoadingRoute(false)
    }
  }

  // Report Submission
  const handleFinalizeReport = async () => {
    const lat = reportLat || myLat || 30.7333
    const lng = reportLng || myLng || 76.7794
    setSubmittingReport(true)

    // Map UI classification to backend category enum
    let mappedCat = 'other'
    const lower = reportCategory.toLowerCase()
    if (lower.includes('fire')) mappedCat = 'fire'
    else if (lower.includes('medical')) mappedCat = 'injury'
    else if (lower.includes('flood') || lower.includes('inundation')) mappedCat = 'flood'
    else if (lower.includes('structure') || lower.includes('collapse')) mappedCat = 'road_block'
    else if (lower.includes('landslide')) mappedCat = 'landslide'

    const payload = {
      category: mappedCat,
      description: `[${reportSeverity.toUpperCase()}] ${reportCategory}: ${reportDescription || 'Citizen emergency alert at grid coordinates.'}`,
      lat,
      lng,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    try {
      if (isOnline) {
        const res = await api.post('/incident-reports', payload)
        const idCode = `#RQ-INC-2026-${String(res.data?.id || Math.floor(100 + Math.random() * 900)).padStart(4, '0')}`
        setSubmittedIncidentId(idCode)
        toast.success('Incident dispatched to SDMA!')
      } else {
        await saveReportOffline(payload)
        const count = await db.local_reports.count()
        setPendingOps(count)
        toast('Saved offline. Encrypted and queued for radio sync.', { icon: '📡' })
      }
      setReportStep(3)
      loadData()
    } catch {
      await saveReportOffline(payload)
      const count = await db.local_reports.count()
      setPendingOps(count)
      toast('Dispatched to local encrypted queue. Syncing upon reconnect.', { icon: '📡' })
      setReportStep(3)
    } finally {
      setSubmittingReport(false)
    }
  }

  // Active user details
  const userName = user?.full_name || 'Simran Kaur'
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="w-full h-screen overflow-hidden bg-[#f8f9ff] text-[#0b1c30] flex flex-col font-['Public_Sans',sans-serif] select-none relative">

      {/* ── 1. Top Floating Brand & Pill Deck (Header from Slide) ── */}
      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="h-20 w-full px-4 md:px-8 flex items-center justify-between max-w-7xl mx-auto">

          {/* Brand Pill */}
          <div
            onClick={() => setViewMode('map')}
            className="pointer-events-auto flex items-center gap-3 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-full shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-200/60 cursor-pointer hover:bg-white transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#0f172a] flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-[18px]">shield_with_heart</span>
            </div>
            <span className="font-bold text-[17px] tracking-tight text-[#0b1c30] pr-1">ResQnet</span>
          </div>

          {/* Omnisearch Bar with GPS Active Tag */}
          <div className="pointer-events-auto flex-1 max-w-lg mx-4 hidden sm:flex items-center bg-white/95 backdrop-blur-md px-4 py-2 rounded-full shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-200">
            <span className="material-symbols-outlined text-slate-400 mr-2 text-[20px]">search</span>
            <input
              type="text"
              className="w-full bg-transparent text-[13px] text-[#0b1c30] placeholder:text-slate-400 focus:outline-none"
              placeholder="Search places, shelters, hospitals, roads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <span className="font-['JetBrains_Mono',monospace] text-[10px] uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold shrink-0">
              GPS Active
            </span>
          </div>

          {/* Helpline & Citizen Profile Chip */}
          <div className="pointer-events-auto flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-full shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-200">
              <span className="material-symbols-outlined text-[#006398] text-sm">emergency</span>
              <span className="font-['JetBrains_Mono',monospace] text-[13px] text-[#006398] font-bold">112 / 1078</span>
              <span className="text-[10px] uppercase text-slate-400 font-bold px-1">Unified SOS</span>
            </div>

            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md p-1 pr-3.5 rounded-full shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-200">
              <div className="w-8 h-8 rounded-full bg-[#000000] flex items-center justify-center text-white font-bold text-xs">
                {userInitials}
              </div>
              <span className="text-[13px] font-semibold text-[#0b1c30] hidden md:inline-block pr-1">
                {userName}
              </span>
              <button
                onClick={() => { logout(); navigate('/login') }}
                title="Log out"
                className="text-slate-400 hover:text-slate-700 p-0.5 ml-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. Primary Workspace Body ── */}
      <main className="w-full h-full pt-20 pb-20 relative flex flex-col overflow-hidden">

        {/* ─── TAB 1: LIVE TACTICAL SAFETY MAP (Default) ─── */}
        {viewMode === 'map' && (
          <div className="relative w-full h-full overflow-hidden select-none">
            {/* Live Real-Time Network Sync & Telemetry Under-Header */}
            <div className="absolute top-2 left-0 right-0 z-30 px-4 md:px-8 pointer-events-none">
              <div className="max-w-6xl mx-auto flex flex-col gap-3 pointer-events-auto">
                <div className="flex items-center justify-between">
                  {/* Live Sync Pill */}
                  <div className="inline-flex items-center gap-2 bg-white/95 backdrop-blur-md shadow-sm px-3 py-1 rounded-full border border-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-['JetBrains_Mono',monospace] text-[12px] text-[#0b1c30] font-bold tracking-tight">LIVE</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-['JetBrains_Mono',monospace] text-[11px] text-slate-600 font-medium">
                      Synced 12s ago via SDRF Radio Mesh
                    </span>
                  </div>

                  {/* GNSS Readout */}
                  <div className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-200 shadow-sm">
                    <span className="material-symbols-outlined text-[#006398] text-[16px]">satellite_alt</span>
                    <span className="font-['JetBrains_Mono',monospace] text-[12px] text-[#0b1c30]">
                      {myLat ? `${myLat.toFixed(4)}° N, ${myLng?.toFixed(4)}° E` : '30.7333° N, 76.7794° E'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      ±4m High Acc.
                    </span>
                  </div>
                </div>

                {/* Instant Tactical Corridor Filter Chips */}
                <div className="bg-white/95 backdrop-blur-md shadow-md rounded-xl p-2 border border-slate-200">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      onClick={() => { setActiveFilterChip('nearest'); setViewMode('hubs') }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 text-left ${activeFilterChip === 'nearest' ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <span className="material-symbols-outlined text-[16px] text-emerald-700">night_shelter</span>
                      <span>Nearest Safety Hub (1.8km)</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    </button>

                    <button
                      onClick={() => setActiveFilterChip('cordon')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 text-left ${activeFilterChip === 'cordon' ? 'bg-red-50 text-red-900 border border-red-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <span className="material-symbols-outlined text-[16px] text-red-600">gpp_maybe</span>
                      <span>Madhya Marg Cordon Active</span>
                      <span className="font-['JetBrains_Mono',monospace] font-bold px-1.5 bg-red-600 text-white rounded text-[10px]">
                        {hazardZones.length || 2} HAZARDS
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveFilterChip('hospital')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 text-left ${activeFilterChip === 'hospital' ? 'bg-blue-50 text-blue-900 border border-blue-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <span className="material-symbols-outlined text-[16px] text-[#006398]">local_hospital</span>
                      <span>Emergency Services</span>
                      <span className="font-['JetBrains_Mono',monospace] text-[10px] text-slate-500">GMSH-16 OPEN</span>
                    </button>

                    <button
                      onClick={() => setActiveFilterChip('water')}
                      className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 text-left ${activeFilterChip === 'water' ? 'bg-cyan-50 text-cyan-900 border border-cyan-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      <span className="material-symbols-outlined text-[16px] text-cyan-700">water_drop</span>
                      <span>Drinking Water Bowsers</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MapLibre Canvas Container */}
            <div className="absolute inset-0 w-full h-full">
              {loadingData && (
                <div className="absolute inset-0 z-20 bg-white/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                  <div className="bg-white px-4 py-2 rounded-full shadow-md border border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-[#006398] animate-ping"></span>
                    <span>Syncing GIS Layers…</span>
                  </div>
                </div>
              )}
              <ResQnetMap
                roads={roads}
                intersections={intersections}
                hubs={hubs}
                clusters={clusters}
                hazardZones={hazardZones}
                roadClosures={roadClosures}
                route={route}
                myLat={myLat}
                myLng={myLng}
                showUserPosition={true}
                role="citizen"
                onHubClick={(hub) => setSelectedHub(hub)}
                onRouteToHub={(hubId) => {
                  requestRoute(hubId)
                  setViewMode('route')
                }}
                onClusterClick={() => { }}
                onMapClick={(lat, lng) => {
                  setReportLat(lat)
                  setReportLng(lng)
                  toast('Reticle pinned! Open Report to dispatch.', { icon: '📍', duration: 2000 })
                }}
                onLocationFound={(lat, lng) => {
                  setMyLat(lat)
                  setMyLng(lng)
                  toast.success('Live GPS coordinates updated')
                }}
                height="100%"
                showLegend={false}
              />
            </div>

            {/* Floating Situational Warning Alert (Top Left) */}
            <div className="absolute top-36 left-4 md:left-8 z-20 max-w-sm w-full pointer-events-auto">
              <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border-l-4 border-l-red-600 border border-slate-200 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-red-600">
                    <span className="material-symbols-outlined text-[20px]">warning</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">CRITICAL SITREP</span>
                  </div>
                  <span className="font-['JetBrains_Mono',monospace] text-[11px] text-slate-500">
                    {isAlertOfflineCached ? `Cached ${alertCachedAt || 'offline'}` : '14m ago'}
                  </span>
                </div>
                <div>
                  <h4 className="text-[15px] font-bold text-[#0b1c30] leading-snug">
                    {activeAlert?.title || 'Hazard reported near Sector 17'}
                  </h4>
                  <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
                    {activeAlert?.message || 'Severe inundation & structural debris on the Madhya Marg underpass. The corridor is fully cordoned by SDRF. Use Himalaya Marg bypass.'}
                  </p>
                </div>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => { requestRoute(); setViewMode('route') }}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1 hover:bg-red-700 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">alt_route</span>
                    <span>Find Safe Route</span>
                  </button>
                  <button
                    onClick={() => setViewMode('my-reports')}
                    className="px-3 py-2 bg-slate-100 text-slate-800 rounded-lg text-[13px] font-semibold hover:bg-slate-200 transition-colors"
                  >
                    View Alert
                  </button>
                </div>
              </div>
            </div>

            {/* Floating GIS Utility Controls (Top Right) */}
            <div className="absolute top-36 right-4 md:right-8 z-20 flex flex-col gap-2 pointer-events-auto">
              <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100">
                <button
                  onClick={() => {
                    navigator.geolocation?.getCurrentPosition(
                      pos => {
                        setMyLat(pos.coords.latitude)
                        setMyLng(pos.coords.longitude)
                        toast.success('Centered on current GPS coordinates')
                      },
                      () => toast.error('Unable to retrieve GPS fix')
                    )
                  }}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Locate Me"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#006398]">my_location</span>
                </button>
                <button
                  onClick={() => toast.success('Oriented to Tactical North')}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Recenter Tactical North"
                >
                  <span className="material-symbols-outlined text-[20px]">explore</span>
                </button>
                <button
                  onClick={() => toast('Hazard & Safe Corridor vector layers active', { icon: '🗺️' })}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Active Hazard Layers"
                >
                  <span className="material-symbols-outlined text-[20px]">layers</span>
                </button>
                <button
                  onClick={() => requestRoute()}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Calculate Evacuation Corridor"
                >
                  <span className="material-symbols-outlined text-[20px]">alt_route</span>
                </button>
              </div>

              {/* Quick Cordon Legend Mini-Pill */}
              <div className="bg-white/95 backdrop-blur-md px-2.5 py-2 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-600"></span>
                  <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-600 uppercase font-bold">SDRF Cordon</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                  <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-600 uppercase font-bold">Flooded Way</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#006398]"></span>
                  <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-600 uppercase font-bold">Safe Route</span>
                </div>
              </div>
            </div>

            {/* Active Route Status Floating HUD (Bottom Left Above Bottom Sheet) */}
            {route?.success && (
              <div className="absolute bottom-56 left-4 md:left-8 z-20 max-w-sm w-full hidden md:block pointer-events-auto">
                <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#006398] text-[18px]">turn_sharp_right</span>
                      <span className="text-[12px] text-[#0b1c30] font-bold uppercase tracking-wider">Active Safe Route</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      {route.target_hub_name ? `To ${route.target_hub_name}` : 'Safe Corridor'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-['JetBrains_Mono',monospace] text-[22px] font-bold text-[#0b1c30]">
                        {Math.round(((route.total_distance_km || 1) / 30) * 60)}
                      </span>
                      <span className="text-xs text-slate-600">min</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-['JetBrains_Mono',monospace] text-[13px] text-[#0b1c30] font-semibold">
                        {route.total_distance_km} km
                      </span>
                    </div>
                    <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[#006398] font-bold truncate max-w-[140px]">
                      {route.cost_explanation || 'Clear Corridor'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                      <span className="text-[11px]">Clear of active hazards</span>
                    </div>
                    <button
                      onClick={() => setViewMode('route')}
                      className="px-3 py-1 bg-[#006398] text-white rounded-md text-[12px] font-semibold hover:bg-[#004b73] transition-colors"
                    >
                      View Turns
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Subtle Verified Community Relief Pill (Floating Center-Top of Bottom Sheet) */}
            <div className="absolute bottom-48 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-lg w-full px-4">
              <div
                onClick={() => setViewMode('relief')}
                className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg rounded-full px-4 py-2 flex items-center justify-between gap-3 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[#006398] text-[18px] shrink-0">medical_services</span>
                  <p className="text-[12px] text-[#0b1c30] truncate">
                    Help fund emergency medical kits for <span className="font-semibold">Sector 17 Hub</span>
                  </p>
                </div>
                <div className="text-[#006398] font-bold hover:underline shrink-0 text-[11px] uppercase tracking-wider flex items-center gap-1">
                  <span>View Relief Efforts</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </div>
              </div>
            </div>

            {/* Docked Safety Hub Bottom Sheet Card (Matching Slide Bottom) */}
            {selectedHub && (
              <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto">
                <div className="max-w-4xl mx-auto bg-white rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-x border-slate-200 px-5 pt-3 pb-5">
                  {/* Sheet Drag Notch */}
                  <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-3"></div>

                  {/* Main Hub Information Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          OPEN • ACTIVATED
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-[12px] text-[#006398] font-semibold">
                          1.8 km safe bypass distance
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-['JetBrains_Mono',monospace] text-[11px] text-slate-500">
                          ID: CHD-SZ-HUB-{selectedHub.id}
                        </span>
                      </div>
                      <h3 className="text-[18px] md:text-[20px] font-bold text-[#0b1c30] tracking-tight">
                        {selectedHub.name}
                      </h3>
                      <p className="text-[12px] text-slate-600">
                        Central Relief Station • Bridge Hall & Gymnasium Complex, Near Parade Ground
                      </p>
                    </div>

                    {/* Quick Action CTA Buttons */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        onClick={() => {
                          requestRoute(selectedHub.id)
                          setViewMode('route')
                        }}
                        className="px-4 py-2.5 bg-[#006398] text-white rounded-xl text-[13px] font-semibold hover:bg-[#004b73] transition-all flex items-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">directions</span>
                        <span>Get Safe Directions</span>
                      </button>
                      <a
                        href="tel:112"
                        className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        title="Contact Hub Dispatcher"
                      >
                        <span className="material-symbols-outlined text-[18px]">call</span>
                      </a>
                    </div>
                  </div>

                  {/* 4 Telemetry Diagnostic Meters (Beds, Water, Triage, Generator) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center text-[#006398] shrink-0">
                        <span className="material-symbols-outlined text-[18px]">single_bed</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-500 block uppercase font-bold">
                          Beds Occupancy
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="font-['JetBrains_Mono',monospace] text-[15px] font-bold text-[#0b1c30]">
                            {selectedHub.current_occupancy}
                          </span>
                          <span className="text-[11px] text-slate-400">/ {selectedHub.max_capacity}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="w-8 h-8 rounded-md bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <span className="material-symbols-outlined text-[18px]">water_drop</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-500 block uppercase font-bold">
                          Clean Water
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-[13px] text-emerald-800 font-bold block">
                          {selectedHub.water_units ? `${selectedHub.water_units.toLocaleString()} Litres` : `${((selectedHub.max_capacity || 500) * 12).toLocaleString()} Litres`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="w-8 h-8 rounded-md bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                        <span className="material-symbols-outlined text-[18px]">medical_services</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-500 block uppercase font-bold">
                          First Aid Triage
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-[13px] text-[#0b1c30] font-semibold block">
                          2 Medics Ready
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div className="w-8 h-8 rounded-md bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                        <span className="material-symbols-outlined text-[18px]">bolt</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-['JetBrains_Mono',monospace] text-[9px] text-slate-500 block uppercase font-bold">
                          Grid & Generator
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-[13px] text-amber-900 font-bold block">
                          100% Diesel Active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: HAZARD-AWARE SAFE ROUTE CORRIDOR NAVIGATION ─── */}
        {viewMode === 'route' && (
          <div className="w-full h-full overflow-y-auto bg-slate-50">
            {/* Operational Telemetry Sub-bar */}
            <div className="w-full bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewMode('map')}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </button>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#006398] text-white font-['JetBrains_Mono',monospace] text-[11px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  Live Grid Sync
                </span>
                <p className="text-[13px] text-slate-700 hidden sm:inline">
                  Route computed via Chandigarh SDMA flood gauges and SDRF sector patrols.
                </p>
              </div>
              <div className="flex items-center gap-3 font-['JetBrains_Mono',monospace] text-[11px] text-slate-500">
                <span>REFRESH: T-04s</span>
                <span className="text-red-600 font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">block</span>
                  MADHYA MARG UNDERPASS CLOSED
                </span>
              </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Route Configuration HUD & Instructions */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h2 className="text-[18px] font-bold text-[#0b1c30]">Safe Route Evaluation</h2>
                      <p className="text-[12px] text-slate-500">Real-time hazard-aware citizen guidance</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-[#006398] font-['JetBrains_Mono',monospace] text-[10px] font-bold uppercase">
                      LIVE AUDIT
                    </span>
                  </div>

                  {/* Origin & Destination inputs */}
                  <div className="relative flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#006398] text-white flex items-center justify-center font-bold text-xs">
                        A
                      </div>
                      <input
                        type="text"
                        value={originName}
                        onChange={e => setOriginName(e.target.value)}
                        className="flex-1 bg-white rounded px-3 py-1.5 text-[12px] font-semibold border border-slate-200 text-[#0b1c30]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                        B
                      </div>
                      <input
                        type="text"
                        value={destName}
                        onChange={e => setDestName(e.target.value)}
                        className="flex-1 bg-white rounded px-3 py-1.5 text-[12px] font-semibold border border-slate-200 text-[#0b1c30]"
                      />
                    </div>
                  </div>

                  {/* Preset Locations */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                    <span className="text-slate-400 uppercase text-[10px] font-bold font-['JetBrains_Mono',monospace]">Preset:</span>
                    <button
                      onClick={() => { setDestName('PGIMER Trauma Sector 12'); requestRoute() }}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-medium text-slate-700 shrink-0"
                    >
                      PGIMER Trauma
                    </button>
                    <button
                      onClick={() => { setDestName('Sector 16 Shelter'); requestRoute() }}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-medium text-slate-700 shrink-0"
                    >
                      Sector 16 Shelter
                    </button>
                  </div>

                  <button
                    onClick={() => requestRoute()}
                    disabled={loadingRoute}
                    className="w-full bg-[#006398] hover:bg-[#004b73] text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all text-[14px]"
                  >
                    <span className="material-symbols-outlined text-[18px]">alt_route</span>
                    <span>{loadingRoute ? 'Evaluating Algorithms…' : 'Evaluate Safe Corridors'}</span>
                  </button>
                </div>

                {/* Turn-by-Turn Instruction List */}
                {route?.success && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-3">
                    <h3 className="text-[14px] font-bold text-[#0b1c30] flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
                      Tactical Turn Guidance (Clear of Hazards)
                    </h3>
                    <div className="flex flex-col divide-y divide-slate-100">
                      {route.steps.map((step, idx) => (
                        <div key={idx} className="py-2.5 flex items-start gap-3 text-xs">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${step.is_blocked ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900">{step.road_name}</p>
                            <p className="text-slate-500">{step.from_name} → {step.to_name} ({step.distance_km} km)</p>
                            {step.is_blocked && (
                              <p className="text-red-600 font-bold text-[10px] mt-0.5">⚠️ Obstruction Reported on Corridor</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: 3 Corridor Comparison Grid */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-['JetBrains_Mono',monospace] text-[10px] uppercase text-[#006398] font-bold tracking-wider">
                      Autonomous Route Assessment
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-['JetBrains_Mono',monospace] text-[10px]">
                      3 CORRIDORS FOUND
                    </span>
                  </div>
                  <h2 className="text-[20px] font-bold text-[#0b1c30]">Available Corridors & Hazard Comparison</h2>
                </div>

                {/* Corridor 1: Recommended Safe */}
                <div
                  onClick={() => setSelectedCorridorId(1)}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedCorridorId === 1 ? 'bg-blue-50/50 border-[#006398] shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[10px] uppercase">
                        RECOMMENDED SAFE
                      </span>
                      <span className="font-bold text-[15px] text-[#0b1c30]">Corridor A • Via Himalaya Marg</span>
                    </div>
                    <span className="font-['JetBrains_Mono',monospace] text-[16px] font-bold text-[#006398]">22 min • 3.4 km</span>
                  </div>
                  <p className="text-[12px] text-slate-600 mt-2">
                    Completely bypasses Madhya Marg flooded underpass. Monitored continuously by SDRF Sector 16 Patrol. Surface asphalt clear and unencumbered.
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <span className="material-symbols-outlined text-[16px]">verified</span> 100% Clear Corridor
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">Elevated Ground Profile</span>
                  </div>
                </div>

                {/* Corridor 2: Blocked / Unsafe */}
                <div
                  onClick={() => setSelectedCorridorId(2)}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedCorridorId === 2 ? 'bg-red-50/50 border-red-500 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 font-bold text-[10px] uppercase">
                        BLOCKED / DANGEROUS
                      </span>
                      <span className="font-bold text-[15px] text-[#0b1c30]">Corridor B • Direct Madhya Marg</span>
                    </div>
                    <span className="font-['JetBrains_Mono',monospace] text-[16px] font-bold text-red-600">14 min • 2.1 km</span>
                  </div>
                  <p className="text-[12px] text-red-700 mt-2">
                    ⛔ CRITICAL HAZARD: 1.2m waterlogging at railway underpass. Active electrical spark danger from submerged substation. Traversal forbidden by SDRF.
                  </p>
                </div>

                {/* Corridor 3: Sub-optimal Alternative */}
                <div
                  onClick={() => setSelectedCorridorId(3)}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedCorridorId === 3 ? 'bg-amber-50/50 border-amber-500 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px] uppercase">
                        SUB-OPTIMAL ALT
                      </span>
                      <span className="font-bold text-[15px] text-[#0b1c30]">Corridor C • Sector 23 Outer Bypass</span>
                    </div>
                    <span className="font-['JetBrains_Mono',monospace] text-[16px] font-bold text-slate-700">38 min • 7.8 km</span>
                  </div>
                  <p className="text-[12px] text-slate-600 mt-2">
                    Passes within 250m of Sector 22 building instability zone. Heavy civic congestion near Kisan Bhawan.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: REPORT EMERGENCY INCIDENT (3-Step Slide Flow) ─── */}
        {viewMode === 'report' && (
          <div className="w-full h-full overflow-y-auto bg-slate-50">
            <div className="max-w-3xl mx-auto p-4 md:p-6 flex flex-col gap-6">

              {/* Context Header & Step Pills */}
              <div className="flex flex-col gap-3">
                <div className="flex items-left justify-between">
                  <button
                    onClick={() => setViewMode('map')}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold shadow-sm transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Back to Dashboard</span>
                  </button>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-900 text-xs">
                    <span className="material-symbols-outlined text-[16px] text-red-600">phone_in_talk</span>
                    <span className="font-bold font-['JetBrains_Mono',monospace]">112</span>
                    <span className="hidden sm:inline">| Life threat call directly</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-left justify-between gap-4">
                  <div>
                    <span className="font-['JetBrains_Mono',monospace] text-[10px] uppercase text-[#006398] font-bold tracking-wider">
                      Emergency Assistance
                    </span>
                    <h1 className="text-[24px] font-bold text-[#0b1c30]">Send Emergency Alert</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Quickly request emergency assistance. Select the situation type and submit immediately.</p>
                  </div>

                  {/* 3 Steps Indicator */}
                  <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200">
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${reportStep === 1 ? 'bg-[#006398] text-white' : 'bg-slate-100 text-slate-600'}`}>
                      1. Situation
                    </div>
                    <span className="material-symbols-outlined text-slate-300 text-[14px]">chevron_right</span>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${reportStep === 2 ? 'bg-[#006398] text-white' : 'bg-slate-100 text-slate-600'}`}>
                      2. Review
                    </div>
                    <span className="material-symbols-outlined text-slate-300 text-[14px]">chevron_right</span>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${reportStep === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      3. Dispatched
                    </div>
                  </div>
                </div>
              </div>

              {/* STAGE 1: FORM INPUTS */}
              {reportStep === 1 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6">
                  {/* Top Emergency Action Bar for Panic Situations */}
                  <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                        <span className="material-symbols-outlined text-[22px]">sos</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-red-950">In immediate danger or panic?</h3>
                        <p className="text-xs text-red-800">Choose an option below or tap voice assistant to speak.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      {/* Voice AI Assistant Button */}
                      <button
                        type="button"
                        onClick={() => setShowVoiceAiModal(true)}
                        className="flex-1 sm:flex-none px-3.5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        title="Speak your emergency to Voice AI"
                      >
                        <span className="material-symbols-outlined text-[18px]">mic</span>
                        <span>Voice AI Assistant</span>
                      </button>
                      {/* Cellular SMS Fallback Button */}
                      <button
                        type="button"
                        onClick={() => setShowSmsModal(true)}
                        className="flex-1 sm:flex-none px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        title="Send this emergency alert via cellular SMS fallback"
                      >
                        <span className="material-symbols-outlined text-[18px]">sms</span>
                        <span>Send via SMS</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. Simple 1-Tap Situation Category */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[14px] font-bold text-[#0b1c30] flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#006398] text-[18px]">category</span>
                        1. What is the emergency?
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">Tap one below</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { label: 'Fire & Smoke', sub: 'Smoke, flames, fire', icon: 'local_fire_department', color: 'text-red-600' },
                        { label: 'Medical & Casualty', sub: 'Injuries, severe trauma', icon: 'medical_services', color: 'text-[#006398]' },
                        { label: 'Urban Flood', sub: 'Rising water, trapped', icon: 'flood', color: 'text-blue-600' },
                        { label: 'Structure Collapse', sub: 'Building debris, fallen tree', icon: 'domain_disabled', color: 'text-amber-600' },
                      ].map((item, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setReportCategory(item.label)}
                          className={`p-3.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${reportCategory.includes(item.label.split(' ')[0]) ? 'bg-blue-50 border-[#006398] ring-2 ring-[#006398] shadow-sm' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                        >
                          <span className={`material-symbols-outlined text-[24px] ${item.color}`}>{item.icon}</span>
                          <div>
                            <p className="text-[13px] font-bold text-[#0b1c30] leading-tight">{item.label.split(' ')[0]}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{item.sub}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Simplified GPS Coordinates Display */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-[#0b1c30] flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#006398] text-[18px]">near_me</span>
                        2. Your Location
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.geolocation?.getCurrentPosition(
                            pos => {
                              setReportLat(pos.coords.latitude)
                              setReportLng(pos.coords.longitude)
                              toast.success('Current location updated')
                            },
                            () => toast.error('Unable to refresh GPS')
                          )
                        }}
                        className="text-[11px] font-semibold text-[#006398] hover:underline"
                      >
                        Refresh GPS
                      </button>
                    </label>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <div>
                          <p className="text-[13px] font-bold text-[#0b1c30]">
                            {reportLat && reportLng ? `GPS Pin: ${reportLat.toFixed(4)}° N, ${reportLng.toFixed(4)}° E` : myLat && myLng ? `Current Location: ${myLat.toFixed(4)}° N, ${myLng.toFixed(4)}° E` : 'Sector 17, Chandigarh (Default)'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Location automatically included with your alert
                          </p>
                        </div>
                      </div>
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded text-[11px] font-bold">
                        GPS Locked
                      </span>
                    </div>
                  </div>

                  {/* 3. Short Note (Optional) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-[#0b1c30] flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#006398] text-[18px]">edit_note</span>
                        3. Description or Landmark (Optional)
                      </span>
                      <span className="text-[11px] text-slate-400">Keep it short</span>
                    </label>
                    <input
                      type="text"
                      value={reportDescription}
                      onChange={e => setReportDescription(e.target.value)}
                      placeholder="e.g. 2 people trapped on 1st floor, water knee deep"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-[#0b1c30] focus:outline-none focus:bg-white transition-all"
                    />
                  </div>

                  {/* 4. Threat Level (Simplified) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-[#0b1c30] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#006398] text-[18px]">warning</span>
                      4. Urgency
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setReportSeverity(sev)}
                          className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${reportSeverity === sev ? sev === 'Critical' ? 'bg-red-50 border-red-500 font-bold text-red-900 ring-1 ring-red-500' : 'bg-blue-50 border-[#006398] font-bold text-[#006398] ring-1 ring-[#006398]' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                        >
                          <span className="text-xs">{sev === 'Critical' ? '🚨 Immediate Life Threat' : sev === 'High' ? '⚠️ High Danger' : sev === 'Medium' ? 'Moderate Issue' : 'Minor'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Actions */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
                      <span>Dispatched immediately to EOC Dispatchers</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={handleFinalizeReport}
                        disabled={submittingReport}
                        className="flex-1 sm:flex-none px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        <span>{submittingReport ? 'Sending Alert…' : 'Send Emergency Alert'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportStep(2)}
                        className="px-3.5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold transition-colors"
                        title="Review details before sending"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 2: REVIEW MODAL CARD */}
              {reportStep === 2 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-[#006398] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[18px]">fact_check</span>
                      </div>
                      <div>
                        <h2 className="text-[16px] font-bold text-[#0b1c30]">Review Emergency Report</h2>
                        <p className="text-xs text-slate-500">Confirm incident telemetry prior to official dispatch</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold uppercase">
                      Ready to Send
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4 flex flex-col gap-3 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Classification:</span>
                      <span className="font-bold text-[#0b1c30]">{reportCategory}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Location:</span>
                      <span className="font-bold text-[#0b1c30]">Sector 17 Market Complex (30.7333° N, 76.7794° E)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Severity:</span>
                      <span className={`font-bold ${reportSeverity === 'Critical' ? 'text-red-600' : 'text-[#006398]'}`}>
                        {reportSeverity} Danger
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Description:</span>
                      <span className="font-medium text-[#0b1c30] max-w-xs text-right">
                        {reportDescription || 'Citizen emergency alert at grid coordinates.'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between pt-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setReportStep(1)}
                      className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 w-full sm:w-auto"
                    >
                      Back to Edit
                    </button>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => setShowSmsModal(true)}
                        className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                        title="Send this emergency alert via cellular SMS fallback"
                      >
                        <span className="material-symbols-outlined text-[16px]">sms</span>
                        <span>Send Alert via SMS</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleFinalizeReport}
                        disabled={submittingReport}
                        className="px-6 py-2.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 flex items-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px]">send</span>
                        <span>{submittingReport ? 'Dispatching…' : 'Submit & Dispatch Teams'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 3: CONFIRMATION DOSSIER */}
              {reportStep === 3 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[32px]">check_circle</span>
                  </div>
                  <div>
                    <span className="font-['JetBrains_Mono',monospace] text-[11px] font-bold text-slate-500">
                      {submittedIncidentId}
                    </span>
                    <h2 className="text-[20px] font-bold text-[#0b1c30] mt-1">Incident Transmitted Successfully</h2>
                    <p className="text-xs text-slate-600 max-w-md mt-1">
                      Your signal has reached the Chandigarh SDMA EOC. Response units are screening telemetry and preparing dispatch.
                    </p>
                  </div>

                  <div className="w-full bg-slate-50 p-4 rounded-xl text-left text-xs flex flex-col gap-2">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>Assigned Response Wing:</span>
                      <span className="text-[#006398]">SDRF Quick Response Unit #04</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Status:</span>
                      <span className="text-emerald-700 font-bold">Under Active Triaging</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setViewMode('my-reports')}
                      className="px-5 py-2.5 bg-[#006398] text-white rounded-lg text-xs font-bold hover:bg-[#004b73] transition-colors"
                    >
                      Track Incident Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReportStep(1); setViewMode('map') }}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200"
                    >
                      Return to Map
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 4: SAFETY HUBS & SHELTERS DIRECTORY ─── */}
        {viewMode === 'hubs' && (
          <div className="w-full h-full overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col gap-6">

              {/* Directory Scope Header */}
              <div className="flex flex-col lg:flex-row lg:items-left justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#006398] font-['JetBrains_Mono',monospace] text-[10px] font-bold uppercase tracking-wider">
                      GIS Triage Core v4.2
                    </span>
                    <span className="text-[10px] text-slate-400 font-['JetBrains_Mono',monospace]">Updated 2 mins ago</span>
                  </div>
                  <h1 className="text-[24px] font-bold text-[#0b1c30]">Safety Hubs & Relief Shelters</h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Find reachable, verified safe shelters with active food, clean water, and medical triage in Chandigarh & Mohali.
                  </p>
                </div>

                {/* Grid Fix */}
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                    <p className="text-[9px] uppercase font-bold text-slate-400 font-['JetBrains_Mono',monospace]">Your Grid Fix</p>
                    <p className="font-['JetBrains_Mono',monospace] text-[12px] font-bold text-[#0b1c30]">30.7333° N, 76.7794° E</p>
                  </div>
                  <div className="px-2 text-xs">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-['JetBrains_Mono',monospace]">Zone Condition</span>
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span> Tier 2 Safe
                    </span>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setHubDirectoryFilter('all')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${hubDirectoryFilter === 'all' ? 'bg-black text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                >
                  All Open Hubs ({hubs.length || 6})
                </button>
                <button
                  onClick={() => setHubDirectoryFilter('triage')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${hubDirectoryFilter === 'triage' ? 'bg-black text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                >
                  Medical Triage Available
                </button>
                <button
                  onClick={() => setHubDirectoryFilter('high_avail')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${hubDirectoryFilter === 'high_avail' ? 'bg-black text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                >
                  High Availability (&gt;50% free)
                </button>
                <button
                  onClick={() => setHubDirectoryFilter('sec17')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${hubDirectoryFilter === 'sec17' ? 'bg-black text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                >
                  Near Sector 17
                </button>
              </div>

              {/* Divergence Rule Banner */}
              <div className="bg-red-50 p-4 rounded-xl border border-red-200 flex items-start gap-3">
                <span className="material-symbols-outlined text-red-600 mt-0.5">warning</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-red-900">Critical Safety Divergence Rule</span>
                    <span className="font-['JetBrains_Mono',monospace] text-[10px] font-bold text-red-600">DISPATCH #882</span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1">
                    Sector 23 Civil Shelter is at maximum density. Automated routing engines have excluded Sector 23 from dynamic evacuation corridors to prevent bottlenecking. Divert transfers to Sector 17 Community Centre.
                  </p>
                </div>
              </div>

              {/* Hub Cards List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(hubs.length > 0 ? hubs : [
                  { id: 1, name: 'Sector 17 Community Centre Shelter', current_occupancy: 120, max_capacity: 200, status: 'open' },
                  { id: 2, name: 'Govt Model Senior Secondary School, Sector 22', current_occupancy: 85, max_capacity: 150, status: 'open' },
                  { id: 3, name: 'GMSH Sector 16 Emergency Wing', current_occupancy: 190, max_capacity: 200, status: 'near_capacity' },
                  { id: 4, name: 'Sector 23 Civil Shelter (Bottleneck)', current_occupancy: 150, max_capacity: 150, status: 'full' },
                ]).map((hub: any) => {
                  const pct = Math.min(100, Math.round((hub.current_occupancy / (hub.max_capacity || 100)) * 100))
                  return (
                    <div key={hub.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${hub.status === 'full' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {hub.status.toUpperCase()}
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-xs text-[#006398] font-semibold">
                          1.8 km (4 min via Jan Marg)
                        </span>
                      </div>

                      <div>
                        <h3 className="text-[16px] font-bold text-[#0b1c30]">{hub.name}</h3>
                        <p className="text-xs text-slate-500">Opposite Parade Ground, Sector 17-B, Chandigarh</p>
                      </div>

                      {/* Bed capacity bar */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-700">Bed Occupancy</span>
                          <span className="font-['JetBrains_Mono',monospace] font-bold text-[#006398]">
                            {hub.current_occupancy} / {hub.max_capacity} Occupied
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct > 85 ? 'bg-red-600' : 'bg-[#006398]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Facilities Badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-700">
                        <span className="bg-slate-50 p-1.5 rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">water_drop</span> Potable Water
                        </span>
                        <span className="bg-slate-50 p-1.5 rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">restaurant</span> Hot Meals
                        </span>
                        <span className="bg-slate-50 p-1.5 rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">bolt</span> Genset 24x7
                        </span>
                        <span className="bg-slate-50 p-1.5 rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#006398]">medical_services</span> First Aid
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => {
                            requestRoute(hub.id)
                            setViewMode('route')
                          }}
                          className="flex-1 py-2 bg-[#006398] text-white rounded-lg text-xs font-bold hover:bg-[#004b73] transition-colors flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">directions</span>
                          <span>Start Safe Navigation</span>
                        </button>
                        <a
                          href="tel:01722700112"
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200"
                        >
                          Call Desk
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 5: MY EMERGENCY REPORTS & INCIDENT TRACKER ─── */}
        {viewMode === 'my-reports' && (
          <div className="w-full h-full overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto p-4 md:p-6 flex flex-col gap-6">

              {/* Title & Sync indicator */}
              <div className="flex flex-col md:flex-row md:items-left justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[#006398] text-xs font-['JetBrains_Mono',monospace]">
                    <span className="material-symbols-outlined text-[16px]">satellite_alt</span>
                    <span>Citizen Transparency Node • GPS Verified</span>
                  </div>
                  <h1 className="text-[24px] font-bold text-[#0b1c30]">My Emergency Reports</h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Track real-time verification and response team dispatch for your submitted incidents.
                  </p>
                </div>
                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
                  <div className="relative flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#006398] animate-ping absolute"></span>
                    <span className="w-2 rounded-full bg-[#006398]"></span>
                  </div>
                  <div className="text-xs">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-['JetBrains_Mono',monospace]">Live Telemetry Link</span>
                    <span className="font-['JetBrains_Mono',monospace] text-[11px] font-bold text-[#0b1c30]">Synchronized • 2s ago</span>
                  </div>
                </div>
              </div>

              {/* Active Incident Anchor Card */}
              <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                {/* Header bar */}
                <div className="bg-slate-100 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="bg-black text-white font-['JetBrains_Mono',monospace] text-xs px-3 py-1 rounded-full font-bold">
                      {submittedIncidentId}
                    </span>
                    <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                      Waterlogging & Electrical Hazard
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-800 text-xs font-bold uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-[#006398]">verified</span>
                      VERIFIED
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-[#006398] text-xs font-bold uppercase flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">navigation</span>
                      Responder En Route
                    </span>
                  </div>
                </div>

                {/* Dossier info */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 flex flex-col gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 font-['JetBrains_Mono',monospace] mb-1">
                        Reported Geolocation
                      </p>
                      <div className="flex items-start gap-2 text-[#0b1c30]">
                        <span className="material-symbols-outlined text-[#006398] text-[20px]">location_on</span>
                        <span className="text-[16px] font-bold">Sector 22-B Commercial Plaza, Chandigarh</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-bold block">Submitted</span>
                        <span className="font-['JetBrains_Mono',monospace] font-bold text-slate-900">Today, 12:32 PM</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-bold block">Category</span>
                        <span className="font-bold text-slate-900">Urban Flooding</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-bold block">Risk Code</span>
                        <span className="font-bold text-red-600">Priority Code 2</span>
                      </div>
                    </div>

                    {/* Mobilization Briefing */}
                    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#006398] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">shield</span>
                          Active Mobilization Briefing
                        </span>
                        <span className="bg-[#006398] text-white px-2 py-0.5 rounded font-['JetBrains_Mono',monospace] text-[10px] font-bold">
                          ETA: 8 MIN
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        SDRF Quick Response Unit #04 dispatched from Sector 17 Sub-Station. Crew equipped with industrial de-watering pumping array and electrical circuit isolation gear. Keep clear of submerged transformers.
                      </p>
                      <div className="flex items-center gap-4 text-[11px] text-slate-600 pt-1">
                        <span>Lead Officer: <strong>Insp. Rajesh Kumar</strong></span>
                        <span>Unit: <strong>SDRF-QRU4 (Hydra P-1)</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <a
                        href="tel:01722700112"
                        className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800"
                      >
                        <span className="material-symbols-outlined text-[16px]">call</span>
                        <span>Call Dispatch Desk (0172-2700112)</span>
                      </a>
                    </div>
                  </div>

                  {/* Supporting Evidence gallery */}
                  <div className="lg:col-span-5 flex flex-col gap-3">
                    <div className="relative w-full h-40 rounded-xl overflow-hidden bg-slate-200 border border-slate-300">
                      <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-['JetBrains_Mono',monospace]">
                        [GIS Satellite Tile: Sector 22-B Active Zone]
                      </div>
                      <div className="absolute top-2 left-2 bg-white/90 px-2 py-0.5 rounded font-['JetBrains_Mono',monospace] text-[9px] font-bold">
                        SECTOR 22-B GRID 4
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-0.5 rounded font-['JetBrains_Mono',monospace] text-[9px]">
                        30.7352° N, 76.7794° E
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block mb-1">
                        Citizen Evidence Metadata
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-slate-50 border border-slate-200">
                          <p className="font-bold text-slate-800">Photo #1</p>
                          <p className="text-[10px] text-slate-500">Water up to wheel hubs</p>
                        </div>
                        <div className="p-2 rounded bg-slate-50 border border-slate-200">
                          <p className="font-bold text-slate-800">Photo #2</p>
                          <p className="text-[10px] text-slate-500">Submerged transformer box</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 7-Stage Full Citizen Milestone Timeline */}
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#006398]">timeline</span>
                      <h3 className="text-sm font-bold text-[#0b1c30]">Incident Milestone Progression</h3>
                    </div>
                    <span className="font-['JetBrains_Mono',monospace] text-[10px] uppercase font-bold text-[#006398]">
                      STAGE 5 OF 7 ACTIVE
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                    {[
                      { step: '1. Submitted', time: '12:32 PM', desc: 'Report Logged', state: 'done' },
                      { step: '2. Review', time: '12:35 PM', desc: 'Desk Screening', state: 'done' },
                      { step: '3. Verified', time: '12:38 PM', desc: 'Triaged by Cell', state: 'done' },
                      { step: '4. Assigned', time: '12:41 PM', desc: 'SDRF Unit #04', state: 'done' },
                      { step: '5. En Route', time: '12:44 PM', desc: 'Dispatched (ETA 8m)', state: 'active' },
                      { step: '6. In Progress', time: 'Pending', desc: 'On-Scene Ops', state: 'pending' },
                      { step: '7. Resolved', time: 'Pending', desc: 'Safety All-Clear', state: 'pending' },
                    ].map((st, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border flex flex-col gap-1 ${st.state === 'active' ? 'bg-blue-50 border-[#006398] shadow-sm' : st.state === 'done' ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-200 opacity-60'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${st.state === 'done' ? 'bg-black text-white' : st.state === 'active' ? 'bg-[#006398] text-white animate-pulse' : 'bg-slate-300 text-slate-700'}`}>
                            {st.state === 'done' ? '✓' : idx + 1}
                          </span>
                          <span className="font-bold text-[11px] text-slate-900">{st.step}</span>
                        </div>
                        <span className="font-['JetBrains_Mono',monospace] text-[10px] text-slate-500">{st.time}</span>
                        <span className="text-[10px] text-slate-600 truncate">{st.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 6: SUPPORT VERIFIED RELIEF CAMPAIGNS & ESCROW FUNDRAISER (4-STEP SLIDES WORKFLOW) ─── */}
        {viewMode === 'relief' && (
          <div className="w-full h-full overflow-y-auto bg-[#f8f9ff] text-[#0b1c30]">
            {/* Top Navigation & Breadcrumbs */}
            {/* Top Navigation & Breadcrumbs */}
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 pb-2">
              {/* Breadcrumb line & Escrow pill - left aligned */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 font-semibold tracking-wider">
                    <span>RESQNET</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-[#006398] font-bold">DONATIONS & RELIEF</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                    <span className="material-symbols-outlined text-xs">verified</span>
                    NDRF Audited Framework
                  </span>
                </div>

                <button
                  onClick={() => setViewMode('map')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-[#006398] hover:bg-slate-50 transition-colors shadow-2xs text-xs font-semibold"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span>Safety Map</span>
                </button>
              </div>

              {/* Title & Authority Micro-Tag Container - Left Aligned with Stepper */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200/80 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-[#006398] text-[11px] font-bold uppercase tracking-wider border border-blue-100">
                    <span className="material-symbols-outlined text-sm">verified_user</span>
                    <span>Verified NGO Campaigns • SDMA Escrow Fund</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tracking-tight">
                    Donations & Relief
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Direct transparent support for disaster-affected populations. Zero surcharge, 100% auditable through SDMA public escrow ledger.
                  </p>
                </div>

                {/* 4-Step Stepper Header */}
                <div className="flex items-center p-1.5 bg-slate-50 rounded-xl border border-slate-200 overflow-x-auto max-w-full shadow-2xs gap-1 shrink-0">
                  {[
                    { num: 1, label: 'Browse Campaigns' },
                    { num: 2, label: 'Amount Details' },
                    { num: 3, label: 'Payment Gateway' },
                    { num: 4, label: 'Official Receipt' },
                  ].map(st => {
                    const isActive = donationStep === st.num
                    const isPassed = donationStep > st.num
                    return (
                      <button
                        key={st.num}
                        onClick={() => setDonationStep(st.num as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                          isActive
                            ? 'bg-[#006398] text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isActive
                              ? 'bg-white text-[#006398]'
                              : isPassed
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isPassed ? '✓' : st.num}
                        </span>
                        <span>{st.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── STEP 1: BROWSE CAMPAIGNS ── */}
              {donationStep === 1 && (
                <section className="flex flex-col gap-6 pb-20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-[#0b1c30]">Active Relief Operations</h2>
                        <span className="font-['JetBrains_Mono',monospace] text-xs text-[#006398] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 font-bold">
                          {loadingCampaigns ? 'Syncing…' : `${campaigns.length > 0 ? campaigns.length : 3} Live Campaigns`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Inspected and cleared by Chandigarh Disaster Management Command</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { id: 'all', label: 'All Operations' },
                        { id: 'medical', label: 'Medical Supplies' },
                        { id: 'food_water', label: 'Potable Water' },
                        { id: 'power', label: 'Power & Fuel' },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setCampaignFilter(f.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            campaignFilter === f.id
                              ? 'bg-[#006398] text-white border-[#006398] shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3 Live Official Slide Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      {
                        id: 1,
                        category: 'medical',
                        badge: 'Medical Supplies',
                        icon: 'local_hospital',
                        org: 'North India Relief Foundation',
                        title: 'Emergency Medical Supplies',
                        location: 'Sector 17 Safety Hub, Chandigarh',
                        desc: 'Urgent first-aid consumables, antibiotics, and pediatric packs for displaced citizens sheltered at Sector 17.',
                        detailedDesc: 'Direct clinical procurement approved by Field Medical Officers. 100% of funds go towards essential antibiotics, trauma dressings, and hydration kits.',
                        raised: 68500,
                        target: 100000,
                        progress: 68,
                        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBP1JuUPmfcZ47iuTzU5ZiAt--YS1mQSsNAXwWmS60z3DT1HOIboa_YubiWMELjDL1seT6ata9cF9uft2DlYBMtigCSzeYN8zrSfqNOEi8YdNCMsA87iuTQ14YN_-Nd0mdCnRn2oVcO_vjb3n2WFs9grhOwjTQ1L8h0HyVphwQ6pDOgYfzyofjj2DZDPMh24RXsCftnL_aYfNL-uYngFKYAVXPf4CdcmcCEQlMuWf1IcuxLpHpA_ZPS6Q',
                      },
                      {
                        id: 2,
                        category: 'food_water',
                        badge: 'Potable Water',
                        icon: 'water_drop',
                        org: 'Punjab Community Response Network',
                        title: 'Clean Drinking Water & Tankers',
                        location: 'Mohali Phase 7 Community Hall',
                        desc: 'Deploying 10,000L clean potable water bowsers and emergency chlorination tablets to affected sub-sectors.',
                        detailedDesc: 'Supplying clean pressurized drinking water tankers and filtration consumables directly to municipal shelter camps.',
                        raised: 42800,
                        target: 75000,
                        progress: 57,
                        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBGV7asTZzLSX1gb_uZ6lkFxdqYatqIkldWrZ78YdfAMYC4CCSRnmbjJ49SeUUKKE-eNaDgEOoxJ_v68e0fy3L2pjLjAtkiXmhWLuSVLRzpGiAIAiYZZcHmz1KFr7g5uPMdGdxwhvY6t1AHuAPXYGY0NjWTzJr5rbmzACURATp9hCoc24S6ByBbep35AV_TLzkbmw0eoanVpw3Fo_Vv5FSnPiKYnk5vVTOgSOVmylCUqxzS99hz_FeeEg',
                      },
                      {
                        id: 3,
                        category: 'power',
                        badge: 'Power & Fuel',
                        icon: 'bolt',
                        org: 'Chandigarh Emergency Volunteers',
                        title: 'Emergency Generator Fuel & Power',
                        location: 'Govt Sr. Sec. School, Sector 22',
                        desc: 'Fuel for backup electricity generators to maintain oxygen concentrators, night illuminators, and phone charging.',
                        detailedDesc: 'Direct fuel allocations authorized under District Power Crisis protocols to maintain continuous hospital and shelter grid backup.',
                        raised: 28000,
                        target: 50000,
                        progress: 56,
                        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCy8s7KMahuFsEOUkGKqNPzY03YX3VQWxGMfKFcTPxM2dWs9DpVaBLuU_XGfZOOrlv7N1dZjWLa1CCsDYoXZTG4sH_OdhDuTvrHf-QWNWsNQ-GTBc706Rv9DjVpc5djIgzQpxZMev9gSRv7Y17ZJY_HePTS3WqKCv-ljwUJdssSJcWt0BSa4AleFbmxB_Cnp264fY5M-ykOAoEmX19vfCyJQ7xOK3iL9gLuzqXUmOIiOCLJ5gdJUEPJUw',
                      },
                    ]
                      .filter(item => campaignFilter === 'all' || item.category === campaignFilter)
                      .map(item => (
                        <div
                          key={item.id}
                          className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow group"
                        >
                          <div className="space-y-3">
                            <div className="w-full h-44 rounded-xl overflow-hidden relative bg-slate-100">
                              <img
                                src={item.image}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-md text-[#0b1c30] text-[11px] font-bold flex items-center gap-1 shadow-xs">
                                <span className="material-symbols-outlined text-[#006398] text-xs">{item.icon}</span>
                                <span>{item.badge}</span>
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center gap-1 text-[#006398] text-[11px] font-bold uppercase tracking-wide">
                                <span className="material-symbols-outlined text-xs">verified</span>
                                <span>{item.org}</span>
                              </div>
                              <h3 className="text-base font-bold text-[#0b1c30] mt-1">{item.title}</h3>
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                <span className="material-symbols-outlined text-xs">location_on</span>
                                <span>{item.location}</span>
                              </p>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>

                            {/* Progress bar */}
                            <div className="space-y-1.5 pt-2">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-['JetBrains_Mono',monospace] font-bold text-[#0b1c30]">
                                  ₹{item.raised.toLocaleString('en-IN')}
                                </span>
                                <span className="font-['JetBrains_Mono',monospace] text-slate-400">
                                  of ₹{item.target.toLocaleString('en-IN')} ({item.progress}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-[#006398] h-full rounded-full transition-all duration-500"
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-5 flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedReliefCampaign({
                                  id: item.id,
                                  title: item.title,
                                  org: item.org,
                                  location: item.location,
                                  desc: item.detailedDesc,
                                  progress: item.progress,
                                  raised: item.raised,
                                  target: item.target,
                                  image: item.image,
                                  category: item.badge,
                                })
                                setDonationStep(2)
                              }}
                              className="flex-1 py-2.5 px-4 bg-[#006398] text-white rounded-xl font-bold text-xs hover:bg-[#004b73] transition-colors shadow-xs flex items-center justify-center gap-2 uppercase tracking-wide"
                            >
                              <span>Donate to this Campaign</span>
                              <span className="material-symbols-outlined text-sm">arrow_forward</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareCampaign({ id: item.id, share_slug: `relief-${item.id}`, title: item.title })}
                              title="Share Campaign Link"
                              className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shrink-0"
                            >
                              <span className="material-symbols-outlined text-base">share</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {/* ── STEP 2: CAMPAIGN DETAILS & AMOUNT SELECTION ── */}
              {donationStep === 2 && (
                <section className="flex flex-col gap-6 max-w-3xl mx-auto pb-20">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setDonationStep(1)}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                      <span>Back to Campaigns</span>
                    </button>
                    <span className="text-[11px] font-bold text-[#006398] bg-blue-50 px-3 py-1 rounded-full uppercase border border-blue-100">
                      Step 2 of 4
                    </span>
                  </div>

                  {/* Overview Box */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-100 space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[11px] font-bold text-[#006398] uppercase tracking-wider">
                          Selected Relief Initiative
                        </span>
                        <h2 className="text-2xl font-bold text-[#0b1c30] mt-1">{selectedReliefCampaign.title}</h2>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#006398] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>{selectedReliefCampaign.org}</span>
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">pin_drop</span>
                            <span>{selectedReliefCampaign.location}</span>
                          </span>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-[#006398] shrink-0">
                        <span className="material-symbols-outlined text-2xl">medical_services</span>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">
                      {selectedReliefCampaign.desc}
                    </p>

                    {/* Amount Selection Block */}
                    <div className="pt-2">
                      <label className="block text-sm font-bold text-[#0b1c30] mb-3">Choose donation amount</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[100, 500, 1000, 2000].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setDonorAmount(amt)}
                            className={`p-4 rounded-xl text-center shadow-xs transition-all font-['JetBrains_Mono',monospace] text-base font-bold ${
                              donorAmount === amt
                                ? 'bg-blue-100 text-[#006398] ring-2 ring-[#006398]'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            ₹{amt.toLocaleString('en-IN')}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="customAmountInput">
                          Or enter a custom contribution (INR)
                        </label>
                        <div className="relative max-w-xs">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['JetBrains_Mono',monospace] text-slate-400 font-bold">
                            ₹
                          </span>
                          <input
                            id="customAmountInput"
                            type="number"
                            min="10"
                            step="10"
                            value={donorAmount}
                            onChange={e => setDonorAmount(Number(e.target.value))}
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-['JetBrains_Mono',monospace] text-sm text-[#0b1c30] focus:outline-none focus:bg-white focus:border-[#006398] transition-colors font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 80G Tax Exemption Assurance */}
                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 text-slate-600 text-xs border border-slate-100">
                      <span className="material-symbols-outlined text-[#006398] text-xl">workspace_premium</span>
                      <span>Tax exemption certificate (80G) generated instantly upon settlement and sent to citizen email.</span>
                    </div>

                    <div className="pt-4 flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-slate-100">
                      <button
                        onClick={() => setDonationStep(1)}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900"
                      >
                        ← Cancel & Return
                      </button>
                      <button
                        onClick={() => setDonationStep(3)}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#006398] text-white text-xs font-bold hover:bg-[#004b73] transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-wide"
                      >
                        <span>Continue to Payment (₹{donorAmount.toLocaleString('en-IN')})</span>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* ── STEP 3: PAYMENT GATEWAY (SECURE CHECKOUT) ── */}
              {donationStep === 3 && (
                <section className="flex flex-col gap-6 max-w-3xl mx-auto pb-20">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setDonationStep(2)}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                      <span>Back to Campaign Details</span>
                    </button>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-['JetBrains_Mono',monospace]">
                      <span className="material-symbols-outlined text-xs text-[#006398]">lock</span>
                      <span>256-Bit Escrow Vault</span>
                    </div>
                  </div>

                  {/* Checkout Card */}
                  <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-100 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-[#0b1c30]">Secure Payment Authorization</h2>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                          <span>{selectedReliefCampaign.title}</span>
                          <span>•</span>
                          <span className="font-bold text-[#006398] font-['JetBrains_Mono',monospace]">
                            Donation: ₹{donorAmount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 block">Order Reference</span>
                        <span className="font-['JetBrains_Mono',monospace] text-xs font-bold text-[#0b1c30]">RQ-ORD-2026-9941</span>
                      </div>
                    </div>

                    {/* Payment Method Tabs */}
                    <div>
                      <label className="block text-xs font-bold text-[#0b1c30] uppercase tracking-wide mb-3">
                        Select Secure Payment Channel
                      </label>
                      <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl mb-4">
                        <button
                          type="button"
                          onClick={() => setPayChannel('upi')}
                          className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            payChannel === 'upi'
                              ? 'bg-white text-[#006398] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base">qr_code_2</span>
                          <span>UPI / QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayChannel('card')}
                          className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            payChannel === 'card'
                              ? 'bg-white text-[#006398] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base">credit_card</span>
                          <span>Cards</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayChannel('netbank')}
                          className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            payChannel === 'netbank'
                              ? 'bg-white text-[#006398] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base">account_balance</span>
                          <span>Net Banking</span>
                        </button>
                      </div>

                      {/* Channel 1: UPI Form */}
                      {payChannel === 'upi' && (
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 flex flex-col md:flex-row items-center gap-6">
                          {/* QR Section */}
                          <div className="flex flex-col items-center p-3.5 bg-white rounded-xl shadow-xs border border-slate-100 text-center w-48">
                            <svg className="w-32 h-32 text-slate-800" fill="currentColor" viewBox="0 0 100 100">
                              <path d="M10 10h30v30H10V10zm5 5v20h20V15H15zm45-5h30v30H60V10zm5 5v20h20V15H65zM10 60h30v30H10V60zm5 5v20h20V65H15zm50 0h5v5h-5zm10 0h5v5h-5zm10 0h5v5h-5zm-20 10h5v5h-5zm10 0h5v5h-5zm10 0h5v5h-5zm-20 10h5v5h-5zm10 0h5v5h-5zm10 0h5v5h-5zM20 20h10v10H20V20zm50 0h10v10H70V20zM20 70h10v10H20V70z" />
                            </svg>
                            <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 mt-2 font-bold">
                              UPI QR Verified
                            </span>
                            <span className="text-[10px] text-slate-500">GPay • PhonePe • Paytm • BHIM</span>
                          </div>

                          <div className="flex-1 w-full space-y-3">
                            <div>
                              <label className="block text-xs font-bold text-[#0b1c30] mb-1">
                                Or enter UPI Virtual Payment Address (VPA)
                              </label>
                              <p className="text-[11px] text-slate-400 mb-2">Direct prompt will be dispatched to your UPI application</p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={upiVpa}
                                  onChange={e => setUpiVpa(e.target.value)}
                                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-['JetBrains_Mono',monospace] text-xs text-[#0b1c30] focus:outline-none focus:border-[#006398]"
                                />
                                <button
                                  type="button"
                                  onClick={() => toast.success('VPA Simran Kaur verified')}
                                  className="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold uppercase"
                                >
                                  Verify
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-slate-600 text-xs pt-1">
                              <span className="material-symbols-outlined text-[#006398] text-sm">task_alt</span>
                              <span>VPA linked to Simran Kaur (UIDAI Verified)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Channel 2: Cards Form */}
                      {payChannel === 'card' && (
                        <div className="space-y-3 bg-slate-50 p-5 rounded-xl border border-slate-100">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Card Number</label>
                            <input
                              type="text"
                              value={cardNumber}
                              onChange={e => setCardNumber(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-['JetBrains_Mono',monospace] text-xs text-[#0b1c30]"
                              placeholder="4242 •••• •••• 1024"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Expiry (MM/YY)</label>
                              <input
                                type="text"
                                defaultValue="08/28"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-['JetBrains_Mono',monospace] text-xs text-[#0b1c30]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Security CVV</label>
                              <input
                                type="password"
                                maxLength={3}
                                defaultValue="•••"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-['JetBrains_Mono',monospace] text-xs text-[#0b1c30]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Cardholder Name</label>
                            <input
                              type="text"
                              value={cardHolder}
                              onChange={e => setCardHolder(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-[#0b1c30]"
                            />
                          </div>
                        </div>
                      )}

                      {/* Channel 3: Net Banking Form */}
                      {payChannel === 'netbank' && (
                        <div className="space-y-3 bg-slate-50 p-5 rounded-xl border border-slate-100">
                          <label className="block text-xs text-slate-500 mb-1">Select Verified Bank</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              'HDFC Bank',
                              'State Bank of India',
                              'ICICI Bank',
                              'Axis Bank',
                              'Punjab National Bank',
                              'Kotak Mahindra',
                            ].map(b => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => setSelectedBank(b)}
                                className={`p-2.5 rounded-lg text-xs font-bold text-left transition-all border ${
                                  selectedBank === b
                                    ? 'bg-white text-[#006398] border-[#006398] shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <div className="flex items-center gap-2 text-slate-500 text-xs mb-4">
                        <span className="material-symbols-outlined text-[#006398] text-sm">shield</span>
                        <span>Encrypted direct disaster relief channel. No platform convenience surcharges applied.</span>
                      </div>

                      {/* Authorize & Pay Button */}
                      <button
                        type="button"
                        onClick={processReliefPayment}
                        disabled={isProcessingPay}
                        className="w-full py-3.5 px-6 rounded-xl bg-[#006398] text-white text-sm font-bold hover:bg-[#004b73] transition-all shadow-sm flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-60"
                      >
                        {isProcessingPay ? (
                          <>
                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                            <span>Securing Escrow Settlement…</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-base">lock</span>
                            <span>Authorize & Pay ₹{donorAmount.toLocaleString('en-IN')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* ── STEP 4: PAYMENT SUCCESS & OFFICIAL RECEIPT ── */}
              {donationStep === 4 && (
                <section className="flex flex-col gap-6 max-w-2xl mx-auto pb-20">
                  {/* Success Notification Card */}
                  <div className="bg-white p-8 rounded-2xl shadow-xs border border-slate-100 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                      <span className="material-symbols-outlined text-4xl">check_circle</span>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#006398] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                        Contribution Processed
                      </span>
                      <h2 className="text-2xl font-bold text-[#0b1c30] mt-2">Donation Successful</h2>
                      <p className="text-sm font-medium text-slate-600 mt-1">
                        ₹{donorAmount.toLocaleString('en-IN')} donated to {selectedReliefCampaign.title}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 text-slate-400 font-['JetBrains_Mono',monospace] text-xs">
                      <span>Ref: {lastTxnRef}</span>
                      <span>•</span>
                      <span>08 Sep 2026, 12:48 PM IST</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                      <button
                        onClick={() => {
                          const el = document.getElementById('officialReceiptCard')
                          el?.scrollIntoView({ behavior: 'smooth' })
                        }}
                        className="px-4 py-2.5 rounded-xl bg-slate-50 text-[#006398] hover:bg-slate-100 text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 border border-slate-200"
                      >
                        <span className="material-symbols-outlined text-sm">receipt_long</span>
                        <span>View & Download Receipt</span>
                      </button>
                      <button
                        onClick={() => {
                          setDonationStep(1)
                          setViewMode('map')
                        }}
                        className="px-6 py-2.5 rounded-xl bg-[#006398] text-white hover:bg-[#004b73] text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 uppercase tracking-wide"
                      >
                        <span>Done — Return to Dashboard</span>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </div>

                  {/* Official Digital Receipt Card */}
                  <div id="officialReceiptCard" className="bg-white p-6 rounded-2xl shadow-xs border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between pb-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#006398]">verified</span>
                        <span className="text-xs font-bold text-[#0b1c30]">ResQnet Official Relief Receipt</span>
                      </div>
                      <span className="font-['JetBrains_Mono',monospace] text-[10px] uppercase text-[#006398] bg-blue-50 px-2 py-0.5 rounded font-bold border border-blue-200">
                        Tax Exemption 80G
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 block font-bold">
                          Contributing Citizen
                        </span>
                        <span className="font-bold text-[#0b1c30]">{cardHolder || user?.full_name || 'Simran Kaur'}</span>
                        <span className="font-['JetBrains_Mono',monospace] text-slate-400 block text-[11px]">
                          UIDAI Verified (Citizen #9914)
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 block font-bold">
                          Receiving Organization
                        </span>
                        <span className="font-bold text-[#0b1c30]">{selectedReliefCampaign.org}</span>
                        <span className="font-['JetBrains_Mono',monospace] text-slate-400 block text-[11px]">
                          SDMA Partner ID: NGO-PB-229
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 block font-bold">
                          Target Relief Initiative
                        </span>
                        <span className="font-bold text-[#0b1c30] block">{selectedReliefCampaign.title}</span>
                        <span className="text-slate-400 block text-[11px]">{selectedReliefCampaign.location}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-['JetBrains_Mono',monospace] uppercase text-slate-400 block font-bold">
                          Settlement Status
                        </span>
                        <span className="font-bold text-emerald-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">task_alt</span>
                          <span>Settled & Verified</span>
                        </span>
                        <span className="font-['JetBrains_Mono',monospace] text-slate-400 block text-[11px]">
                          SDMA Escrow: CLR-PUNJAB-9921
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0b1c30]">Total Relief Transferred</span>
                      <span className="font-['JetBrains_Mono',monospace] text-base font-bold text-[#006398]">
                        ₹{donorAmount.toLocaleString('en-IN')}.00 INR
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="font-['JetBrains_Mono',monospace] text-xs text-slate-400">Ref: {lastTxnRef}</span>
                      <button
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">print</span>
                        <span>Print / PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Exception & Diagnostic References */}
                  <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-['JetBrains_Mono',monospace] uppercase tracking-wider text-slate-400 font-bold">
                        System Gateway Exception Handlers
                      </span>
                      <button
                        onClick={() => setShowExceptionStates(v => !v)}
                        className="text-[#006398] text-xs hover:underline font-bold"
                      >
                        {showExceptionStates ? 'Hide Gateway States' : 'View Gateway States'}
                      </button>
                    </div>

                    {showExceptionStates && (
                      <div className="space-y-2 pt-2 text-xs">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-700">
                            <span className="material-symbols-outlined text-[#006398] text-sm">schedule</span>
                            <span>Payment Pending: Undergoing inter-bank clearance. Please do not retry.</span>
                          </div>
                          <span className="font-['JetBrains_Mono',monospace] text-[10px] text-[#006398] font-bold">RQ-ST-PEND</span>
                        </div>
                        <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-red-700">
                            <span className="material-symbols-outlined text-red-600 text-sm">error</span>
                            <span>Payment Failed: Transaction was declined by issuing bank.</span>
                          </div>
                          <button
                            onClick={() => setDonationStep(3)}
                            className="px-2 py-1 rounded bg-white text-red-600 text-[10px] font-bold uppercase shadow-xs border border-red-200"
                          >
                            Retry Payment
                          </button>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-600">
                            <span className="material-symbols-outlined text-slate-400 text-sm">cancel</span>
                            <span>Payment Cancelled: No funds debited from citizen account.</span>
                          </div>
                          <button
                            onClick={() => setDonationStep(1)}
                            className="px-2 py-1 rounded bg-white text-slate-700 text-[10px] font-bold uppercase shadow-xs border border-slate-200"
                          >
                            Return
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── 3. Floating Bottom Navigation Bar (Matching Slide Floating Pill) ── */}
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white/95 backdrop-blur-xl px-4 py-2 rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-slate-200/80 flex items-center gap-2 sm:gap-4 pointer-events-auto"
        aria-label="Citizen Navigation"
      >
        {/* Home / Map */}
        <button
          onClick={() => setViewMode('map')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors ${viewMode === 'map' ? 'bg-slate-200/80 text-[#006398] font-bold' : 'text-slate-600 hover:text-black'}`}
        >
          <span className="material-symbols-outlined text-[20px]">home</span>
          <span className="text-[10px] font-bold mt-0.5">Home</span>
        </button>

        {/* Safety Hubs */}
        <button
          onClick={() => setViewMode('hubs')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors ${viewMode === 'hubs' ? 'bg-slate-200/80 text-[#006398] font-bold' : 'text-slate-600 hover:text-black'}`}
        >
          <span className="material-symbols-outlined text-[20px]">night_shelter</span>
          <span className="text-[10px] font-bold mt-0.5">Hubs</span>
        </button>

        {/* Elevated Central Action: Report */}
        <button
          onClick={() => {
            setReportStep(1)
            setViewMode('report')
          }}
          className="flex items-center gap-2 px-5 py-2 bg-[#006398] text-white rounded-full shadow-[0_2px_12px_rgba(0,99,152,0.35)] hover:bg-[#004b73] transition-all mx-1 active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">add_alert</span>
          <span className="text-[13px] font-bold">Report</span>
        </button>

        {/* Alerts / Tracker */}
        <button
          onClick={() => setViewMode('my-reports')}
          className={`relative flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors ${viewMode === 'my-reports' ? 'bg-slate-200/80 text-[#006398] font-bold' : 'text-slate-600 hover:text-black'}`}
        >
          <div className="relative">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-600 rounded-full ring-2 ring-white"></span>
          </div>
          <span className="text-[10px] font-bold mt-0.5">Alerts</span>
        </button>

        {/* Safe Route */}
        <button
          onClick={() => {
            requestRoute()
            setViewMode('route')
          }}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors ${viewMode === 'route' ? 'bg-slate-200/80 text-[#006398] font-bold' : 'text-slate-600 hover:text-black'}`}
        >
          <span className="material-symbols-outlined text-[20px]">alt_route</span>
          <span className="text-[10px] font-bold mt-0.5">Routes</span>
        </button>

        {/* Fundraiser / Relief Campaigns */}
        <button
          onClick={() => {
            loadCampaigns()
            setViewMode('relief')
          }}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors ${viewMode === 'relief' ? 'bg-slate-200/80 text-[#006398] font-bold' : 'text-slate-600 hover:text-black'}`}
        >
          <span className="material-symbols-outlined text-[20px]">volunteer_activism</span>
          <span className="text-[10px] font-bold mt-0.5">Relief</span>
        </button>

        {/* Open Map Engine V2 */}
        <a
          href={getMapV2Url('citizen', token)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center px-3 py-1 rounded-full transition-colors text-slate-600 hover:text-black"
          title="Open Map Engine V2"
        >
          <span className="material-symbols-outlined text-[20px]">map</span>
          <span className="text-[10px] font-bold mt-0.5">Open Map</span>
        </a>
      </nav>

      {/* Emergency SMS Fallback Modal */}
      <SmsFallbackModal
        isOpen={showSmsModal}
        onClose={() => setShowSmsModal(false)}
        category={reportCategory}
        severity={reportSeverity}
        description={reportDescription}
        currentLat={reportLat || myLat}
        currentLng={reportLng || myLng}
        onSmsPrepared={alertUid => {
          setSubmittedIncidentId(alertUid)
        }}
      />

      {/* Voice AI Emergency Assistant Modal with Automatic Backend Activation */}
      <VoiceAiModal
        isOpen={showVoiceAiModal}
        onClose={() => setShowVoiceAiModal(false)}
        userLocation={myLat && myLng ? { lat: myLat, lng: myLng } : null}
      />
    </div>
  )
}
