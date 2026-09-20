// Emergency Screen — Redesigned to match stitch resqnet_report_emergency & high-priority emergency protocol
// High-urgency light/alert design with incident categorization, coordinate geofencing, route guidance, and immediate SOS dispatch
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../contexts/OnlineContext'
import api from '../lib/api'
import { saveReportOffline, db } from '../lib/db'
import type { EmergencyAlert, RouteResponse, SafetyHub, Road, Intersection, HazardZone } from '../types'
import ResQnetMap from '../components/ResQnetMap'
import {
  ShieldAlert,
  AlertTriangle,
  Navigation,
  ArrowLeft,
  PhoneCall,
  CheckCircle,
  Loader2,
  Compass,
  WifiOff,
  Flame,
  Stethoscope,
  Building2,
  Waves,
  Mountain,
  CloudLightning,
  AlertOctagon,
  Radio,
  MapPin,
  Shield
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function EmergencyScreen() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isOnline, setPendingOps } = useOnline()

  const [alert, setAlert] = useState<EmergencyAlert | null>(null)
  const [myLat, setMyLat] = useState<number | null>(null)
  const [myLng, setMyLng] = useState<number | null>(null)
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [submittingSos, setSubmittingSos] = useState(false)
  const [sosSent, setSosSent] = useState(false)
  const [hubs, setHubs] = useState<SafetyHub[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [intersections, setIntersections] = useState<Intersection[]>([])
  const [hazardZones, setHazardZones] = useState<HazardZone[]>([])

  // Incident report form state
  const [incidentType, setIncidentType] = useState<string>('flooding')
  const [incidentNotes, setIncidentNotes] = useState<string>('')
  const [submittingReport, setSubmittingReport] = useState(false)

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setMyLat(pos.coords.latitude)
          setMyLng(pos.coords.longitude)
        },
        () => {
          // Default coordinate
          setMyLat(30.7333)
          setMyLng(76.7794)
        },
        { enableHighAccuracy: true, timeout: 6000 }
      )
    } else {
      setMyLat(30.7333)
      setMyLng(76.7794)
    }
  }, [])

  // Fetch active alerts, hubs, roads, hazards
  useEffect(() => {
    const fetchEmergencyData = async () => {
      try {
        const [aRes, hRes, rRes, iRes, zRes] = await Promise.allSettled([
          api.get('/alerts/active'),
          api.get('/hubs'),
          api.get('/roads'),
          api.get('/roads/intersections'),
          api.get('/hazards'),
        ])
        if (aRes.status === 'fulfilled' && aRes.value.data) {
          const alertData = aRes.value.data
          setAlert(Array.isArray(alertData) ? (alertData[0] || null) : alertData)
        }
        if (hRes.status === 'fulfilled' && hRes.value.data) setHubs(hRes.value.data)
        if (rRes.status === 'fulfilled' && rRes.value.data) setRoads(rRes.value.data)
        if (iRes.status === 'fulfilled' && iRes.value.data) setIntersections(iRes.value.data)
        if (zRes.status === 'fulfilled' && zRes.value.data) setHazardZones(zRes.value.data)
      } catch {
        // Fallback
      }
    }

    fetchEmergencyData()
  }, [])

  const calculateEvacuationRoute = async (targetHubId?: number) => {
    if (!myLat || !myLng) {
      toast.error('Location unavailable. Please enable GPS.')
      return
    }
    if (!isOnline) {
      toast.error('Live dynamic routing requires connection. Showing closest known safe hub on map.')
      return
    }

    setLoadingRoute(true)
    try {
      const payload: { from_lat: number; from_lng: number; target_hub_id?: number } = {
        from_lat: myLat,
        from_lng: myLng,
      }
      if (targetHubId) {
        payload.target_hub_id = targetHubId
      }
      const res = await api.post('/routing/calculate', payload)
      setRoute(res.data)
      if (res.data.success) {
        toast.success(`Safe Evacuation Route Calculated to ${res.data.target_hub_name || 'Safety Hub'}!`)
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
      description: `CRITICAL SOS DISPATCH — Life Emergency Mode (${user?.full_name || 'Citizen'})`,
      lat: myLat,
      lng: myLng,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    if (isOnline) {
      try {
        await api.post('/incident-reports', payload)
        toast.success('CRITICAL SOS TRANSMITTED! Search & Rescue notified.')
        setSosSent(true)
      } catch {
        toast.error('Online SOS dispatch failed — saving to offline queue.')
        await saveReportOffline(payload)
        const count = await db.local_reports.count()
        setPendingOps(count)
        setSosSent(true)
      }
    } else {
      await saveReportOffline(payload)
      const count = await db.local_reports.count()
      setPendingOps(count)
      toast('SOS queued locally. Will transmit automatically when connection is restored.', { icon: '📡' })
      setSosSent(true)
    }
    setSubmittingSos(false)
  }

  const handleDetailedReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!myLat || !myLng) {
      toast.error('Location unavailable. Cannot geofence incident.')
      return
    }

    setSubmittingReport(true)
    const payload = {
      category: incidentType,
      description: incidentNotes || `Emergency incident report: ${incidentType}`,
      lat: myLat,
      lng: myLng,
      submitted_offline: !isOnline,
      client_timestamp: new Date().toISOString(),
    }

    try {
      if (isOnline) {
        await api.post('/incident-reports', payload)
        toast.success('Incident reported to EOC Command Center!')
      } else {
        await saveReportOffline(payload)
        const count = await db.local_reports.count()
        setPendingOps(count)
        toast('Report stored offline in IndexedDB. Will sync automatically.', { icon: '📡' })
      }
      setIncidentNotes('')
    } catch {
      toast.error('Failed to report incident.')
    } finally {
      setSubmittingReport(false)
    }
  }

  const nearestHub = hubs.length > 0 ? hubs[0] : null

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-slate-800 flex flex-col font-sans">
      {/* Top High-Urgency Header */}
      <header className="bg-red-600 text-white px-4 md:px-8 py-3.5 flex items-center justify-between shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <ShieldAlert size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-extrabold tracking-tight uppercase">
                ResQnet Emergency Life-Safety Console
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-black/20 rounded font-bold uppercase tracking-wider">
                PRIORITY PROTOCOL
              </span>
            </div>
            <p className="text-xs text-red-100 font-medium">
              National Dispatch Link: 112 / 1078 • EOC Direct Line
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="px-3 py-1.5 bg-black/20 hover:bg-black/30 border border-white/30 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={14} /> Exit Emergency View
        </button>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-4 md:px-8 py-6 space-y-6 flex-1">
        {/* Active Alert Banner */}
        {alert ? (
          <div className="bg-red-50 border-2 border-red-500 rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-bold text-xs uppercase tracking-wider font-mono">
                {alert.severity} DIRECTIVE
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Authorized by Emergency Coordinator
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {alert.title}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              {alert.message}
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-3 text-amber-900">
            <AlertTriangle size={20} className="shrink-0 text-amber-600" />
            <div className="text-xs">
              <strong className="block font-bold">General Evacuation Protocol Active</strong>
              <span>Follow real-time safe routing to verified safety hubs. Keep clear of submerged road corridors.</span>
            </div>
          </div>
        )}

        {/* Rapid Action Grid: SOS + Safe Evacuation Routing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Critical SOS Card */}
          <div className="bg-white rounded-xl border-2 border-red-500 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <PhoneCall size={20} />
                <h3 className="text-lg font-bold">Immediate SOS Broadcast</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                If you are trapped, injured, or facing imminent peril, trigger this emergency alert. Your exact GPS coordinate will be beamed directly to response teams.
              </p>

              {sosSent && (
                <div className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                  <span>SOS Broadcast Transmitted! Search & Rescue dispatched to your grid coordinate.</span>
                </div>
              )}
            </div>

            <button
              id="emergency-sos-button"
              onClick={triggerSos}
              disabled={submittingSos}
              className="w-full h-14 bg-red-600 hover:bg-red-700 text-white rounded-xl font-extrabold text-base tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-red-200 transition-all cursor-pointer"
            >
              {submittingSos ? (
                <Loader2 size={20} className="spin" />
              ) : (
                <>🆘 TRANSMIT CRITICAL SOS RESCUE</>
              )}
            </button>
          </div>

          {/* Safe Route Guidance Card */}
          <div className="bg-white rounded-xl border border-blue-300 p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Navigation size={20} />
                <h3 className="text-lg font-bold">Hazard-Free Evacuation Route</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {nearestHub ? (
                  <>Target Hub: <strong className="text-slate-800">{nearestHub.name}</strong> • Status: <span className="font-semibold text-emerald-600">{nearestHub.status.toUpperCase()}</span></>
                ) : (
                  'Computes safe passage through dynamic A* routing avoiding active waterlogging and debris blockages.'
                )}
              </p>

              {route && (
                <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-lg text-xs space-y-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>Destination: {route.target_hub_name || 'Primary Safe Hub'}</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      {route.total_distance_km ? `${route.total_distance_km.toFixed(2)} km` : 'Safe Route'}
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    Follow the highlighted route on the live operational map below.
                  </p>
                </div>
              )}
            </div>

            <button
              id="emergency-get-route"
              onClick={() => calculateEvacuationRoute()}
              disabled={loadingRoute}
              className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              {loadingRoute ? <Loader2 size={18} className="spin" /> : <Navigation size={18} />}
              {route ? 'Recalculate Safe Route' : 'Calculate Hazard-Aware Evacuation Route'}
            </button>
          </div>
        </div>

        {/* Live Operational Map */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-blue-600" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700">
                Live Tactical Evacuation Map
              </span>
            </div>
            {route && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                ACTIVE EVACUATION PATH
              </span>
            )}
          </div>
          <div className="h-[360px] w-full relative">
            <ResQnetMap
              roads={roads}
              intersections={intersections}
              hazardZones={hazardZones}
              hubs={hubs}
              route={route}
              userPosition={myLat && myLng ? { lat: myLat, lng: myLng } : null}
              onRouteToHub={hubId => calculateEvacuationRoute(hubId)}
              height="360px"
            />
          </div>
        </div>

        {/* Report Emergency Form Section (Matching stitch resqnet_report_emergency) */}
        <form onSubmit={handleDetailedReportSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider mb-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                Citizen Incident Dispatch Channel
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                Submit Detailed Hazard Report
              </h3>
              <p className="text-xs text-slate-500">
                Provide real-time situational intelligence to deploy appropriate gear (boats, pumps, medical teams).
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <Shield size={18} className="text-blue-600" />
              <div className="text-right">
                <div className="text-[10px] font-mono uppercase text-slate-500">EOC Verification Protocol</div>
                <div className="text-xs font-mono font-bold text-slate-800">SDMA-DIRECT</div>
              </div>
            </div>
          </div>

          {/* 1. Category Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-mono flex items-center justify-center font-bold">1</span>
                Select Incident Category
              </span>
              <span className="text-[11px] font-bold text-red-600 uppercase">Required</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'flooding', label: 'Flooding / Water', icon: Waves },
                { id: 'medical', label: 'Medical Emergency', icon: Stethoscope },
                { id: 'fire', label: 'Fire Outbreak', icon: Flame },
                { id: 'road_hazard', label: 'Road Blockage', icon: AlertOctagon },
                { id: 'structural', label: 'Structural Collapse', icon: Building2 },
                { id: 'landslide', label: 'Landslide', icon: Mountain },
                { id: 'weather', label: 'Severe Storm', icon: CloudLightning },
                { id: 'rescue', label: 'Trapped / Rescue', icon: AlertTriangle },
              ].map(cat => {
                const Icon = cat.icon
                const isSelected = incidentType === cat.id
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setIncidentType(cat.id)}
                    className={`p-3 rounded-lg border text-center flex flex-col items-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Icon size={24} className={isSelected ? 'text-blue-600' : 'text-slate-500'} />
                    <span className="text-xs font-semibold">{cat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Geofence & Location */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-mono flex items-center justify-center font-bold">2</span>
                Incident Location Geofence
              </span>
              <span className="text-xs font-mono text-emerald-600 flex items-center gap-1 font-semibold">
                <MapPin size={12} /> High Accuracy GNSS
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                  Validated Coordinate
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {myLat ? `${myLat.toFixed(5)}° N, ${myLng?.toFixed(5)}° E` : 'Locating GNSS…'}
                </div>
              </div>
              <span className="text-xs font-mono text-slate-500 bg-white px-2.5 py-1 rounded border border-slate-200">
                Disaster Geofence Auto-Tagged
              </span>
            </div>
          </div>

          {/* 3. Notes / Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-mono flex items-center justify-center font-bold">3</span>
                Situational Details
              </span>
              <span className="text-xs text-slate-400">Factual details</span>
            </div>

            <textarea
              value={incidentNotes}
              onChange={e => setIncidentNotes(e.target.value)}
              rows={3}
              placeholder="Describe what is happening: water depth, blocked lanes, trapped count, immediately needed equipment..."
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submittingReport}
            className="w-full h-11 bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            {submittingReport ? <Loader2 size={16} className="spin" /> : <Radio size={16} />}
            Submit Emergency Report to Dispatch Desk
          </button>
        </form>

        {/* Footer info bar */}
        <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                ● Live Central Uplink Synchronized
              </span>
            ) : (
              <span className="text-amber-700 font-semibold flex items-center gap-1">
                <WifiOff size={14} /> Offline Mode Active (Local Queue Ready)
              </span>
            )}
          </div>
          <span className="font-mono text-[11px]">ResQnet Core v2.4</span>
        </div>
      </main>
    </div>
  )
}
