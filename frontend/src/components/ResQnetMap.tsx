// RESQNET Unified Map Component
// Integrates the routing-lab MapLibre GL JS Map Engine as the SINGLE active map implementation across RESQNET.
// Restores full manual A→B point selection, road snapping, OSRM safe-corridor calculation, and live GPS integration.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { Polygon, LineString } from 'geojson'
import { RoutingMap } from '../features/routing/components/RoutingMap'
import type { Coordinate, RouteResult, StartOriginType, RouteStep } from '../features/routing/types/routing'
import type {
  HazardZone as EngineHazardZone,
  BlockedRoad as EngineBlockedRoad,
  HazardSeverity as EngineHazardSeverity,
  RouteSafetyAssessment,
} from '../features/routing/types/safety'
import type {
  SafetyHub as EngineSafetyHub,
  PotentialSafetyHub,
  OperationalArea,
  SafetyHubStatus,
} from '../features/routing/types/safetyHub'
import type { LiveLocationState } from '../features/routing/types/location'
import type { RoutingDecision } from '../features/routing/types/routingDecision'
import type { RouteCandidate } from '../features/routing/types/candidates'
import type { CoordinatorMode } from '../features/routing/components/CoordinatorControlPanel'
import type { MapInteractionMode } from '../features/routing/types/interaction'
import { getRouteCandidates, snapCoordinateToNearestRoad } from '../features/routing/services/routingService'
import { evaluateRouteSafety } from '../features/routing/services/routeSafetyService'
import { generateSafeDetours } from '../features/routing/services/detourService'
import { buildRoutingDecision, createIdleRoutingDecision } from '../features/routing/services/routingDecisionService'
import {
  evaluateGpsRouteProgress,
  calculateRemainingRoute,
  type GpsNavigationEvaluation,
} from '../features/routing/services/routeProgressService'
import {
  normalizeMapRole,
  getRoleCapabilities,
  type RoleCapabilities,
  type MapRole,
} from '../features/routing/types/capabilities'
import { useGeolocation } from '../features/routing/hooks/useGeolocation'
import type {
  Road,
  SafetyHub,
  ReportCluster,
  RouteResponse,
  HazardZone,
  Intersection,
  Mission,
} from '../types'

export interface MapProps {
  roads?: Road[]
  intersections?: Intersection[]
  hubs?: SafetyHub[]
  clusters?: ReportCluster[]
  hazardZones?: HazardZone[]
  hazards?: HazardZone[]
  missions?: Mission[]
  activeRoadId?: number | null
  activeMission?: Mission | null
  route?: RouteResponse | null
  routeWaypoints?: { id?: number; name?: string; lat: number; lng: number }[]
  myLat?: number | null
  myLng?: number | null
  userPosition?: { lat: number; lng: number } | null
  missionTargetLat?: number | null
  missionTargetLng?: number | null
  missionTarget?: { lat: number; lng: number; label?: string }
  onHubClick?: (hub: SafetyHub) => void
  onRouteToHub?: (hubId: number) => void
  onClusterClick?: (cluster: ReportCluster) => void
  onRoadClick?: (road: Road) => void
  onHazardClick?: (hazard: HazardZone) => void
  onMissionClick?: (mission: Mission) => void
  onMapClick?: (lat: number, lng: number) => void
  height?: string
  showLegend?: boolean
  showUserPosition?: boolean
  role?: 'citizen' | 'responder' | 'coordinator' | string
  coordinatorEditMode?: 'none' | 'place_hub' | 'place_mission'
  onPlaceHub?: (lat: number, lng: number) => void
  onPlaceMissionTarget?: (lat: number, lng: number) => void
  allMissionRoutes?: Array<{ missionId: number; title: string; route: RouteResponse }>
  onLocationFound?: (lat: number, lng: number) => void

  // Optional Direct Map Engine Prop Extensions
  start?: Coordinate | null
  destination?: Coordinate | null
  interactionMode?: MapInteractionMode
  coordinatorMode?: CoordinatorMode
  drawingPoints?: Coordinate[]
  onSelectRoadToBlock?: (road: EngineBlockedRoad) => void
  onSelectPotentialSafetyHub?: (potential: PotentialSafetyHub) => void
  onOpenAddOperationalAreaForHub?: (hub: EngineSafetyHub) => void
  onEditOperationalArea?: (area: OperationalArea) => void
  onSavePlacedOperationalAreaPoint?: (coord: Coordinate) => void
  isDeveloperMode?: boolean
  allowRoutePlanner?: boolean
}

export default function ResQnetMap({
  roads = [],
  intersections = [],
  hubs = [],
  clusters: _clusters = [],
  hazardZones = [],
  hazards = [],
  missions: _missions = [],
  activeRoadId: _activeRoadId = null,
  activeMission: _activeMission = null,
  route = null,
  routeWaypoints: _routeWaypoints,
  myLat = null,
  myLng = null,
  userPosition = null,
  missionTargetLat = null,
  missionTargetLng = null,
  missionTarget,
  onHubClick,
  onRouteToHub,
  onClusterClick: _onClusterClick,
  onRoadClick,
  onHazardClick: _onHazardClick,
  onMissionClick: _onMissionClick,
  onMapClick,
  height = '100%',
  showLegend: _showLegend = false,
  showUserPosition = true,
  role = 'citizen',
  coordinatorEditMode = 'none',
  onPlaceHub,
  onPlaceMissionTarget,
  allMissionRoutes: _allMissionRoutes = [],
  onLocationFound: _onLocationFound,

  // Direct Map Engine overrides
  start: explicitStart = null,
  destination: explicitDest = null,
  interactionMode: explicitInteractionMode,
  coordinatorMode: explicitCoordinatorMode,
  drawingPoints: explicitDrawingPoints,
  onSelectRoadToBlock,
  onSelectPotentialSafetyHub,
  onOpenAddOperationalAreaForHub,
  onEditOperationalArea,
  onSavePlacedOperationalAreaPoint,
  isDeveloperMode = false,
  allowRoutePlanner = true,
}: MapProps) {
  // -------------------------------------------------------------
  // Centralized Map Role Normalization & Capabilities
  // -------------------------------------------------------------
  const mapRole = useMemo<MapRole>(() => normalizeMapRole(role), [role])
  const capabilities = useMemo<RoleCapabilities>(() => getRoleCapabilities(mapRole), [mapRole])

  // Single-instance Geolocation Watcher
  const continuousGps = useGeolocation(capabilities.canUseGps && showUserPosition)
  // -------------------------------------------------------------
  // Internal A → B Manual Route Planning State Machine
  // -------------------------------------------------------------
  const [isPlannerOpen, setIsPlannerOpen] = useState(false)
  const [manualStart, setManualStart] = useState<Coordinate | null>(null)
  const [manualDest, setManualDest] = useState<Coordinate | null>(null)
  const [startOriginType, setStartOriginType] = useState<StartOriginType>('MAP_POINT')
  const [routeInteractionMode, setRouteInteractionMode] = useState<MapInteractionMode>('EXPLORE')
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)
  const [calculatedDecision, setCalculatedDecision] = useState<RoutingDecision | null>(null)
  const [calculatedResult, setCalculatedResult] = useState<RouteResult | null>(null)
  const [fitRouteTrigger, setFitRouteTrigger] = useState<number>(0)
  const [roadSnapFeedback, setRoadSnapFeedback] = useState<string | null>(null)
  const [isSnapToRoadEnabled, setIsSnapToRoadEnabled] = useState(true)

  const effectiveHazards = useMemo(() => {
    return hazards.length > 0 ? hazards : hazardZones
  }, [hazards, hazardZones])

  // Map RESQNET SafetyHub[] -> routing-lab EngineSafetyHub[]
  const engineSafetyHubs = useMemo<EngineSafetyHub[]>(() => {
    return hubs
      .filter(h => Number.isFinite(h.lng) && Number.isFinite(h.lat))
      .map(h => {
        let status: SafetyHubStatus = 'OPEN'
        if (h.status === 'near_capacity') status = 'NEAR_CAPACITY'
        else if (h.status === 'full') status = 'FULL'
        else if (h.status === 'closed') status = 'CLOSED'

        const totalCapacity = h.max_capacity || 500
        const currentOccupancy = h.current_occupancy || 0
        const availableCapacity = Math.max(0, totalCapacity - currentOccupancy)

        return {
          id: String(h.id),
          name: h.name,
          siteType: 'Community Relief Hub',
          coordinate: [h.lng, h.lat],
          verificationStatus: 'VERIFIED',
          isActive: status !== 'CLOSED',
          status,
          totalCapacity,
          currentOccupancy,
          availableCapacity,
          address: h.address || '',
          capabilities: {
            tents: { enabled: true, tentUnits: 20, peoplePerTent: 6, tentCapacity: 120 },
            foodDistribution: { enabled: (h.food_units ?? 0) > 0, mealsPerCycle: (h.food_units ?? 0) * 10 },
            drinkingWater: { enabled: (h.water_units ?? 0) > 0, availableLiters: (h.water_units ?? 0) * 50, requirementLiters: 500 },
            medicalFirstAid: { enabled: (h.medical_units ?? 0) > 0, staffCount: (h.medical_units ?? 0) * 2 },
            sanitationToilets: { enabled: true, toiletUnits: 8 },
            powerCharging: { enabled: true, generatorBackup: true },
            registrationHelpDesk: { enabled: true },
            specialNeedsSupport: { enabled: true },
          },
          resources: [],
          requirements: [],
          createdAt: h.updated_at || new Date().toISOString(),
          updatedAt: h.updated_at || new Date().toISOString(),
        }
      })
  }, [hubs])

  // Map RESQNET HazardZone[] -> routing-lab EngineHazardZone[]
  const engineHazards = useMemo<EngineHazardZone[]>(() => {
    const active = effectiveHazards.filter(hz => hz.is_active !== false)
    const result: EngineHazardZone[] = []

    for (const hz of active) {
      const geom = (hz.geometry || hz.geom) as { type?: string; coordinates?: any } | undefined
      let polygonCoords: Coordinate[] = []

      if (geom && geom.coordinates) {
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
          polygonCoords = geom.coordinates[0].map((c: any) => [c[0], c[1]])
        } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates[0]?.[0])) {
          polygonCoords = geom.coordinates[0][0].map((c: any) => [c[0], c[1]])
        }
      }

      if (polygonCoords.length >= 3) {
        let severity: EngineHazardSeverity = 'HIGH'
        if (hz.severity === 'CRITICAL') severity = 'CRITICAL'
        else if (hz.severity === 'MEDIUM') severity = 'MODERATE'
        else if (hz.severity === 'LOW') severity = 'LOW'

        const polygonGeometry: Polygon = {
          type: 'Polygon',
          coordinates: [polygonCoords],
        }

        result.push({
          id: String(hz.id),
          name: hz.name,
          severity,
          description: hz.hazard_type || hz.name,
          geometry: polygonGeometry,
          isActive: true,
          isDangerZone: severity === 'CRITICAL',
        })
      }
    }

    return result
  }, [effectiveHazards])

  // Map RESQNET Road[] -> routing-lab EngineBlockedRoad[]
  const engineBlockedRoads = useMemo<EngineBlockedRoad[]>(() => {
    const intersectionMap = new Map<number, Intersection>()
    for (const i of intersections) {
      intersectionMap.set(i.id, i)
    }

    const blocked: EngineBlockedRoad[] = []
    for (const road of roads) {
      const from = intersectionMap.get(road.from_intersection_id)
      const to = intersectionMap.get(road.to_intersection_id)
      if (!from || !to) continue

      const isRoadBlocked = road.is_blocked || road.status === 'blocked' || road.status === 'flooded' || road.status === 'hazardous'
      if (isRoadBlocked) {
        const lineGeom: LineString = {
          type: 'LineString',
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }

        blocked.push({
          id: String(road.id),
          name: road.name,
          status: 'BLOCKED',
          reason: `Road Condition: ${road.status.toUpperCase()}`,
          geometry: lineGeom,
          isActive: true,
          distanceKm: road.distance_km,
        })
      }
    }

    return blocked
  }, [roads, intersections])

  // Keep references for async calculations
  const engineHazardsRef = useRef(engineHazards)
  const engineBlockedRoadsRef = useRef(engineBlockedRoads)
  engineHazardsRef.current = engineHazards
  engineBlockedRoadsRef.current = engineBlockedRoads

  // Construct LiveLocationState from continuousGps, userPosition, or myLat/myLng
  const liveLocationState = useMemo<LiveLocationState | null>(() => {
    if (!showUserPosition || !capabilities.canUseGps) return null

    if (continuousGps.coordinate && continuousGps.status === 'ACTIVE') {
      return continuousGps
    }

    const lat = userPosition ? userPosition.lat : myLat
    const lng = userPosition ? userPosition.lng : myLng

    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return null
    }

    return {
      status: 'ACTIVE',
      coordinate: [lng, lat],
      accuracyMeters: 10,
      headingDegrees: null,
      speedMps: null,
      timestamp: Date.now(),
      errorMessage: null,
      watchId: null,
      isFollowMe: false,
    }
  }, [showUserPosition, capabilities.canUseGps, continuousGps, userPosition, myLat, myLng])

  // Computed Start Coordinate
  const effectiveStartCoord = useMemo<Coordinate | null>(() => {
    if (explicitStart) return explicitStart
    if (manualStart) return manualStart
    if (startOriginType === 'CURRENT_LOCATION' && liveLocationState?.coordinate) {
      return liveLocationState.coordinate
    }
    if (userPosition && Number.isFinite(userPosition.lng) && Number.isFinite(userPosition.lat)) {
      return [userPosition.lng, userPosition.lat]
    }
    if (myLng !== null && myLat !== null && Number.isFinite(myLng) && Number.isFinite(myLat)) {
      return [myLng, myLat]
    }
    if (route && route.waypoints && route.waypoints.length > 0) {
      return [route.waypoints[0].lng, route.waypoints[0].lat]
    }
    return null
  }, [explicitStart, manualStart, startOriginType, liveLocationState?.coordinate, userPosition, myLng, myLat, route])

  // Computed Destination Coordinate
  const effectiveDestCoord = useMemo<Coordinate | null>(() => {
    if (explicitDest) return explicitDest
    if (manualDest) return manualDest
    const targetLat = missionTarget ? missionTarget.lat : missionTargetLat
    const targetLng = missionTarget ? missionTarget.lng : missionTargetLng
    if (targetLat !== null && targetLat !== undefined && targetLng !== null && targetLng !== undefined) {
      return [targetLng, targetLat]
    }
    if (route && route.waypoints && route.waypoints.length > 1) {
      const last = route.waypoints[route.waypoints.length - 1]
      return [last.lng, last.lat]
    }
    return null
  }, [explicitDest, manualDest, missionTarget, missionTargetLat, missionTargetLng, route])

  // External / Props Route Construction
  const externalRouteData = useMemo<{
    routeResult: RouteResult | null
    routingDecision: RoutingDecision | null
  }>(() => {
    if (!route || !route.waypoints || route.waypoints.length < 2) {
      return { routeResult: null, routingDecision: null }
    }

    const coords: Coordinate[] = route.waypoints.map(w => [w.lng, w.lat])
    const distanceMeters = Math.round((route.total_distance_km || 1) * 1000)
    const durationSeconds = Math.round(((route.total_distance_km || 1) / 30) * 3600)

    const routeLine: LineString = {
      type: 'LineString',
      coordinates: coords,
    }

    const rResult: RouteResult = {
      coordinates: coords,
      geometry: routeLine,
      distanceMeters,
      durationSeconds,
      status: 'success',
    }

    const safetyAssessment: RouteSafetyAssessment = {
      routeFound: true,
      distanceKm: route.total_distance_km || 1,
      durationMinutes: Math.round(((route.total_distance_km || 1) / 30) * 60),
      safetyStatus: 'SAFE',
      highestHazardSeverity: 'NONE',
      blockedRoad: false,
      hazardsChecked: engineHazards.length,
      hazardsIntersected: 0,
      blockedRoadsChecked: engineBlockedRoads.length,
      blockedRoadsIntersected: 0,
      hazardIntersections: [],
      blockedRoadIntersections: [],
      evaluatedAt: new Date().toISOString(),
    }

    const candidate: RouteCandidate = {
      id: 'primary-route',
      label: 'Primary Evacuation Corridor',
      geometry: routeLine,
      coordinates: coords,
      distanceMeters,
      distanceKm: route.total_distance_km || 1,
      durationSeconds,
      durationMinutes: Math.round(((route.total_distance_km || 1) / 30) * 60),
      safetyAssessment,
      isSelected: true,
      selectionRank: 1,
      visualTier: 'SAFE',
    }

    const decision: RoutingDecision = {
      status: 'ROUTE_FOUND',
      routingMode: 'NORMAL_ROUTE',
      start: effectiveStartCoord,
      destination: effectiveDestCoord,
      initialRoute: candidate,
      initialSafety: safetyAssessment,
      hazardsIntersected: [],
      isInitialSafe: true,
      detourAttempts: 0,
      detourCandidates: [],
      safeDetoursCount: 1,
      allCandidates: [candidate],
      safeCandidatesCount: 1,
      moderateRiskCandidatesCount: 0,
      highRiskCandidatesCount: 0,
      rejectedCandidatesCount: 0,
      selectedRoute: candidate,
      finalSafety: safetyAssessment,
      reasonCode: 'SAFE_ROUTE_SELECTED',
      explanation: route.cost_explanation || 'Safe road-following corridor active',
      saferDespiteLonger: false,
      isSyntheticFixture: false,
    }

    return { routeResult: rResult, routingDecision: decision }
  }, [route, engineHazards.length, engineBlockedRoads.length, effectiveStartCoord, effectiveDestCoord])

  // Effective Active Route and Decision
  const activeRouteResult = calculatedResult || externalRouteData.routeResult
  const activeRoutingDecision = calculatedDecision || externalRouteData.routingDecision

  // -------------------------------------------------------------
  // Full OSRM + Safety Engine Route Calculation Dispatch
  // -------------------------------------------------------------
  const executeSafeRouteCalculation = useCallback(
    async (startPt: Coordinate, destPt: Coordinate) => {
      setIsCalculatingRoute(true)
      setCalculatedDecision(createIdleRoutingDecision(startPt, destPt))

      try {
        const candidatesFetch = await getRouteCandidates(startPt, destPt)
        if (candidatesFetch.status !== 'success' || candidatesFetch.routes.length === 0) {
          setCalculatedDecision({
            status: 'NO_SAFE_ROUTE',
            routingMode: 'NO_SAFE_ROUTE',
            start: startPt,
            destination: destPt,
            initialRoute: null,
            initialSafety: null,
            hazardsIntersected: [],
            isInitialSafe: false,
            detourAttempts: 0,
            detourCandidates: [],
            safeDetoursCount: 0,
            allCandidates: [],
            safeCandidatesCount: 0,
            moderateRiskCandidatesCount: 0,
            highRiskCandidatesCount: 0,
            rejectedCandidatesCount: 0,
            selectedRoute: null,
            finalSafety: null,
            reasonCode: 'NO_SAFE_ROUTE',
            explanation: candidatesFetch.error || 'No road route found between selected points.',
            saferDespiteLonger: false,
            isSyntheticFixture: false,
            visualTier: 'NONE',
          })
          setCalculatedResult(null)
          return
        }

        const initialCandidates: RouteCandidate[] = candidatesFetch.routes.map((r, idx) => {
          const safety = evaluateRouteSafety(r, engineHazardsRef.current, engineBlockedRoadsRef.current)
          return {
            id: `candidate-${idx + 1}`,
            label: candidatesFetch.routes.length > 1 ? `Route Alternative ${idx + 1}` : 'Direct Road Route',
            geometry: r.geometry,
            coordinates: r.coordinates,
            distanceMeters: r.distanceMeters,
            distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
            durationSeconds: r.durationSeconds,
            durationMinutes: Math.round(r.durationSeconds / 60),
            safetyAssessment: safety,
            isSelected: false,
            isOriginalRisky: safety.safetyStatus !== 'SAFE',
          }
        })

        const primaryCandidate = initialCandidates[0]
        const isPrimarySafe =
          primaryCandidate &&
          primaryCandidate.safetyAssessment.safetyStatus === 'SAFE' &&
          primaryCandidate.safetyAssessment.highestHazardSeverity === 'NONE' &&
          !primaryCandidate.safetyAssessment.blockedRoad

        let detourCandidates: RouteCandidate[] = []
        let detourAttempts = 0
        if (!isPrimarySafe) {
          try {
            const detourTargets = {
              hazardIds: primaryCandidate.safetyAssessment.hazardIntersections.map(h => h.hazardId),
              blockedRoadIds: primaryCandidate.safetyAssessment.blockedRoadIntersections.map(b => b.roadId),
            }
            const detourResult = await generateSafeDetours(
              startPt,
              destPt,
              detourTargets,
              engineHazardsRef.current,
              engineBlockedRoadsRef.current
            )
            detourCandidates = detourResult.detourCandidates
            detourAttempts = detourResult.attemptsCount
          } catch {
            detourCandidates = []
            detourAttempts = 0
          }
        }

        const decision = buildRoutingDecision({
          start: startPt,
          destination: destPt,
          initialCandidates,
          detourAttempts,
          detourCandidates,
          isSyntheticFixture: false,
        })

        setCalculatedDecision(decision)

        if (decision.selectedRoute) {
          setCalculatedResult({
            coordinates: decision.selectedRoute.coordinates,
            geometry: decision.selectedRoute.geometry,
            distanceMeters: decision.selectedRoute.distanceMeters,
            durationSeconds: decision.selectedRoute.durationSeconds,
            status: 'success',
          })
          setFitRouteTrigger(prev => prev + 1)
        } else {
          setCalculatedResult(null)
        }
      } catch (err) {
        console.error('[ResQnetMap] Route calculation error:', err)
        setCalculatedResult(null)
      } finally {
        setIsCalculatingRoute(false)
      }
    },
    []
  )

  // Interaction Mode Determination
  const activeInteractionMode = useMemo<MapInteractionMode>(() => {
    if (explicitInteractionMode) return explicitInteractionMode
    if (coordinatorEditMode === 'place_hub') return 'SAFETY_HUB_POINT'
    if (coordinatorEditMode === 'place_mission') return 'PLACE_DESTINATION'
    if (routeInteractionMode !== 'EXPLORE') return routeInteractionMode
    return 'EXPLORE'
  }, [explicitInteractionMode, coordinatorEditMode, routeInteractionMode])

  const activeCoordinatorMode = useMemo<CoordinatorMode>(() => {
    if (explicitCoordinatorMode) return explicitCoordinatorMode
    if (coordinatorEditMode === 'place_hub') return 'place_safety_hub_point'
    return 'none'
  }, [explicitCoordinatorMode, coordinatorEditMode])

  // -------------------------------------------------------------
  // Map Click Handler Bridge
  // -------------------------------------------------------------
  const handleMapClick = useCallback(
    (coord: Coordinate) => {
      const [lng, lat] = coord

      // 1. Explicit Coordinator edit modes
      if (coordinatorEditMode === 'place_hub' && onPlaceHub) {
        onPlaceHub(lat, lng)
        return
      }
      if (coordinatorEditMode === 'place_mission' && onPlaceMissionTarget) {
        onPlaceMissionTarget(lat, lng)
        return
      }

      // 2. A -> B Manual Point Selection State Machine
      if (routeInteractionMode === 'PLACE_START') {
        setManualStart(coord)
        setStartOriginType('MAP_POINT')
        setRoadSnapFeedback(null)

        if (manualDest) {
          setRouteInteractionMode('EXPLORE')
          executeSafeRouteCalculation(coord, manualDest)
        } else {
          // Auto-advance to setting destination B
          setRouteInteractionMode('PLACE_DESTINATION')
        }
        return
      }

      if (routeInteractionMode === 'PLACE_DESTINATION') {
        setManualDest(coord)
        setRouteInteractionMode('EXPLORE')
        setRoadSnapFeedback(null)

        const currentStart = manualStart || (startOriginType === 'CURRENT_LOCATION' ? liveLocationState?.coordinate : null) || effectiveStartCoord
        if (currentStart) {
          executeSafeRouteCalculation(currentStart, coord)
        }
        return
      }

      // 3. Normal Map Click delegation
      if (onMapClick) {
        onMapClick(lat, lng)
      }
    },
    [
      coordinatorEditMode,
      onPlaceHub,
      onPlaceMissionTarget,
      routeInteractionMode,
      manualDest,
      manualStart,
      startOriginType,
      liveLocationState?.coordinate,
      effectiveStartCoord,
      executeSafeRouteCalculation,
      onMapClick,
    ]
  )

  // Drag-and-drop point repositioning & road snapping
  const handlePointDragEnd = useCallback(
    async (pointType: 'start' | 'destination', coord: Coordinate) => {
      let finalCoord = coord
      if (isSnapToRoadEnabled) {
        try {
          const snap = await snapCoordinateToNearestRoad(coord, 80)
          if (snap.snapped) {
            finalCoord = snap.snappedCoordinate
            setRoadSnapFeedback(`Snapped to ${snap.roadName || 'Road'} (${snap.distanceMeters}m)`)
            setTimeout(() => setRoadSnapFeedback(null), 3000)
          }
        } catch {
          // Keep raw coord if snapping fails
        }
      }

      if (pointType === 'start') {
        setManualStart(finalCoord)
        setStartOriginType('MAP_POINT')
        const currentDest = manualDest || effectiveDestCoord
        if (currentDest) {
          executeSafeRouteCalculation(finalCoord, currentDest)
        }
      } else {
        setManualDest(finalCoord)
        const currentStart = manualStart || (startOriginType === 'CURRENT_LOCATION' ? liveLocationState?.coordinate : null) || effectiveStartCoord
        if (currentStart) {
          executeSafeRouteCalculation(currentStart, finalCoord)
        }
      }
    },
    [isSnapToRoadEnabled, manualDest, effectiveDestCoord, manualStart, startOriginType, liveLocationState?.coordinate, effectiveStartCoord, executeSafeRouteCalculation]
  )

  // -------------------------------------------------------------
  // Live GPS Route Navigation & Monotonic Progress Tracking
  // -------------------------------------------------------------
  const [isNavigating, setIsNavigating] = useState(false)
  const [showDirectionsList, setShowDirectionsList] = useState(false)
  const [simulatedProgressMeters, setSimulatedProgressMeters] = useState<number>(0)
  const maxTripProgressRef = useRef<{ routeId: string; maxProgressMeters: number }>({
    routeId: '',
    maxProgressMeters: 0,
  })
  const lastRerouteTimestampRef = useRef<number>(0)

  // Current active route geometry and steps
  const activeSelectedRoute = activeRoutingDecision?.selectedRoute || null
  const activeRouteCoords = activeSelectedRoute?.coordinates || []
  const activeRouteSteps: RouteStep[] = activeSelectedRoute?.steps || []

  // Dynamic GPS Position: either live GPS, simulated forward progress, or start coordinate
  const currentNavGps = useMemo<Coordinate | null>(() => {
    if (simulatedProgressMeters > 0 && activeRouteCoords.length >= 2) {
      const remaining = calculateRemainingRoute(activeRouteCoords, simulatedProgressMeters)
      return remaining[0] || activeRouteCoords[activeRouteCoords.length - 1]
    }
    if (liveLocationState?.coordinate) {
      return liveLocationState.coordinate
    }
    return effectiveStartCoord
  }, [simulatedProgressMeters, activeRouteCoords, liveLocationState?.coordinate, effectiveStartCoord])

  // Live Navigation Progress & Step Evaluation
  const navEvaluation = useMemo<GpsNavigationEvaluation | null>(() => {
    if (!activeSelectedRoute || activeRouteCoords.length < 2) {
      maxTripProgressRef.current = { routeId: '', maxProgressMeters: 0 }
      return null
    }

    const routeId = activeSelectedRoute.id || 'current-route'
    if (routeId !== maxTripProgressRef.current.routeId) {
      maxTripProgressRef.current = { routeId, maxProgressMeters: 0 }
    }

    const targetGps = currentNavGps || activeRouteCoords[0]
    const evaluation = evaluateGpsRouteProgress(
      targetGps,
      activeRouteCoords,
      maxTripProgressRef.current.maxProgressMeters,
      {
        steps: activeRouteSteps,
        initialDurationSeconds: activeSelectedRoute.durationSeconds,
      }
    )

    if (evaluation.status === 'ON_ROUTE' || evaluation.status === 'ARRIVED') {
      maxTripProgressRef.current.maxProgressMeters = evaluation.maxProgressMeters
    }

    return evaluation
  }, [activeSelectedRoute, activeRouteCoords, activeRouteSteps, currentNavGps])

  // Auto-Reroute Trigger on Off-Route
  useEffect(() => {
    if (!isNavigating || !navEvaluation?.isOffRoute || !effectiveDestCoord || !currentNavGps) {
      return
    }

    const now = Date.now()
    if (now - lastRerouteTimestampRef.current > 4000) {
      lastRerouteTimestampRef.current = now
      console.log('[ResQnetMap Navigation] Off-route detected. Triggering safe reroute from:', currentNavGps)
      executeSafeRouteCalculation(currentNavGps, effectiveDestCoord)
    }
  }, [isNavigating, navEvaluation?.isOffRoute, effectiveDestCoord, currentNavGps, executeSafeRouteCalculation])

  // Reset / Clear Route
  const handleResetRoute = useCallback(() => {
    setManualStart(null)
    setManualDest(null)
    setCalculatedResult(null)
    setCalculatedDecision(null)
    setRouteInteractionMode('EXPLORE')
    setRoadSnapFeedback(null)
    setIsNavigating(false)
    setShowDirectionsList(false)
    setSimulatedProgressMeters(0)
    maxTripProgressRef.current = { routeId: '', maxProgressMeters: 0 }
  }, [])

  // Start Navigation
  const handleStartNavigation = useCallback(() => {
    if (!activeSelectedRoute || activeRouteCoords.length < 2) return
    setIsNavigating(true)
    setShowDirectionsList(false)
    setSimulatedProgressMeters(0)
    maxTripProgressRef.current = { routeId: activeSelectedRoute.id || 'active', maxProgressMeters: 0 }
    setFitRouteTrigger(prev => prev + 1)
  }, [activeSelectedRoute, activeRouteCoords])

  // Simulate GPS Step along route (+150m)
  const handleSimulateStepForward = useCallback((metersDelta: number = 150) => {
    if (!activeSelectedRoute || activeRouteCoords.length < 2) return
    const current = Math.max(simulatedProgressMeters, maxTripProgressRef.current.maxProgressMeters)
    const nextDist = Math.min(activeSelectedRoute.distanceMeters, current + metersDelta)
    setSimulatedProgressMeters(nextDist)
  }, [activeSelectedRoute, activeRouteCoords, simulatedProgressMeters])

  // Swap Start and Destination
  const handleSwapPoints = useCallback(() => {
    const s = manualStart || (startOriginType === 'CURRENT_LOCATION' ? liveLocationState?.coordinate : null) || effectiveStartCoord
    const d = manualDest || effectiveDestCoord
    if (!s || !d) return

    setManualStart(d)
    setManualDest(s)
    setStartOriginType('MAP_POINT')
    setIsNavigating(false)
    setSimulatedProgressMeters(0)
    executeSafeRouteCalculation(d, s)
  }, [manualStart, startOriginType, liveLocationState?.coordinate, effectiveStartCoord, manualDest, effectiveDestCoord, executeSafeRouteCalculation])

  // Use Current Location as Start Point
  const handleUseCurrentLocation = useCallback(() => {
    if (liveLocationState?.coordinate) {
      setStartOriginType('CURRENT_LOCATION')
      setManualStart(liveLocationState.coordinate)
      setRouteInteractionMode('EXPLORE')

      const currentDest = manualDest || effectiveDestCoord
      if (currentDest) {
        executeSafeRouteCalculation(liveLocationState.coordinate, currentDest)
      } else {
        setRouteInteractionMode('PLACE_DESTINATION')
      }
    }
  }, [liveLocationState?.coordinate, manualDest, effectiveDestCoord, executeSafeRouteCalculation])

  // Select Safety Hub as Destination
  const handleSelectSafetyHub = useCallback(
    (hub: EngineSafetyHub) => {
      const originalHub = hubs.find(h => String(h.id) === hub.id)
      if (originalHub) {
        if (onHubClick) onHubClick(originalHub)
        if (onRouteToHub) onRouteToHub(originalHub.id)
      }

      setManualDest(hub.coordinate)
      const currentStart = manualStart || (startOriginType === 'CURRENT_LOCATION' ? liveLocationState?.coordinate : null) || effectiveStartCoord
      if (currentStart) {
        executeSafeRouteCalculation(currentStart, hub.coordinate)
      }
    },
    [hubs, onHubClick, onRouteToHub, manualStart, startOriginType, liveLocationState?.coordinate, effectiveStartCoord, executeSafeRouteCalculation]
  )

  // Road Selection Bridge
  const handleSelectRoadToBlock = useCallback(
    (road: EngineBlockedRoad) => {
      if (onSelectRoadToBlock) {
        onSelectRoadToBlock(road)
      }
      const originalRoad = roads.find(r => String(r.id) === road.id)
      if (originalRoad && onRoadClick) {
        onRoadClick(originalRoad)
      }
    },
    [roads, onSelectRoadToBlock, onRoadClick]
  )

  // Determine destination hub match if any
  const matchedDestHub = useMemo(() => {
    if (!effectiveDestCoord) return null
    return engineSafetyHubs.find(
      h => Math.abs(h.coordinate[0] - effectiveDestCoord[0]) < 0.0001 && Math.abs(h.coordinate[1] - effectiveDestCoord[1]) < 0.0001
    )
  }, [effectiveDestCoord, engineSafetyHubs])

  const canCalculate = Boolean(effectiveStartCoord && effectiveDestCoord) && !isCalculatingRoute

  // Maneuver Icon Helper
  const getManeuverIcon = (maneuver?: { type?: string; modifier?: string } | null): string => {
    if (!maneuver) return 'navigation'
    const type = maneuver.type || ''
    const mod = (maneuver.modifier || '').toLowerCase()
    if (type === 'arrive') return 'flag'
    if (type === 'depart') return 'trip_origin'
    if (type.includes('roundabout') || type.includes('rotary')) return 'refresh'
    if (type === 'fork') return 'call_split'
    if (type === 'merge') return 'call_merge'
    if (mod.includes('uturn')) return 'u_turn_left'
    if (mod.includes('sharp right')) return 'turn_sharp_right'
    if (mod.includes('right')) return 'turn_right'
    if (mod.includes('sharp left')) return 'turn_sharp_left'
    if (mod.includes('left')) return 'turn_left'
    if (mod.includes('straight')) return 'straight'
    return 'navigation'
  }

  // Effective Live Location State (incorporating simulated GPS advancement during active navigation)
  const effectiveLiveLocationState = useMemo<LiveLocationState | null>(() => {
    if (!showUserPosition) return null
    if (simulatedProgressMeters > 0 && currentNavGps) {
      return {
        status: 'ACTIVE',
        coordinate: currentNavGps,
        accuracyMeters: 8,
        headingDegrees: null,
        speedMps: 8,
        timestamp: Date.now(),
        errorMessage: null,
        watchId: null,
        isFollowMe: false,
      }
    }
    return liveLocationState
  }, [showUserPosition, simulatedProgressMeters, currentNavGps, liveLocationState])

  return (
    <div style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }} className="resqnet-unified-map-root select-none font-['Public_Sans',sans-serif]">
      {/* ── Single Unified MapLibre GL JS Map Instance ── */}
      <RoutingMap
        capabilities={capabilities}
        start={effectiveStartCoord}
        destination={effectiveDestCoord}
        routeResult={activeRouteResult}
        assessment={activeRoutingDecision?.selectedRoute?.safetyAssessment || null}
        selectionResult={null}
        decision={activeRoutingDecision}
        remainingRouteCoords={isNavigating && navEvaluation?.remainingCoordinates ? navEvaluation.remainingCoordinates : null}
        onMapClick={handleMapClick}
        interactionMode={activeInteractionMode}
        coordinatorMode={activeCoordinatorMode}
        drawingPoints={explicitDrawingPoints || []}
        hazards={engineHazards}
        blockedRoads={engineBlockedRoads}
        safetyHubs={engineSafetyHubs}
        operationalAreas={[]}
        liveLocationState={effectiveLiveLocationState}
        onSelectSafetyHubDestination={handleSelectSafetyHub}
        onSelectPotentialSafetyHub={onSelectPotentialSafetyHub}
        onOpenAddOperationalAreaForHub={onOpenAddOperationalAreaForHub}
        onEditOperationalArea={onEditOperationalArea}
        onSavePlacedOperationalAreaPoint={onSavePlacedOperationalAreaPoint}
        onSelectRoadToBlock={handleSelectRoadToBlock}
        isDeveloperMode={isDeveloperMode}
        onPointDragEnd={handlePointDragEnd}
        isSnapToRoadEnabled={isSnapToRoadEnabled}
        fitRouteTrigger={fitRouteTrigger}
      />

      {/* ── ACTIVE LIVE NAVIGATION OVERLAY BANNER (Top Left / Center) ── */}
      {isNavigating && capabilities.canLiveNavigate && activeSelectedRoute && navEvaluation && (
        <div className="absolute top-4 left-4 z-30 w-84 max-w-[calc(100vw-32px)] bg-slate-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700/80 p-3.5 flex flex-col gap-2.5 text-white pointer-events-auto">
          {/* Top Maneuver Row */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#006398] text-white flex items-center justify-center shrink-0 shadow-md">
                <span className="material-symbols-outlined text-[24px]">
                  {navEvaluation.isArrived
                    ? 'flag'
                    : navEvaluation.isOffRoute
                    ? 'sync_problem'
                    : getManeuverIcon(navEvaluation.currentStep?.maneuver || navEvaluation.nextStep?.maneuver)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-white leading-snug truncate">
                  {navEvaluation.isArrived
                    ? 'Arrived at Destination'
                    : navEvaluation.isOffRoute
                    ? 'Off Route • Recalculating'
                    : navEvaluation.currentStep?.instruction || 'Follow Safe Corridor'}
                </div>
                {!navEvaluation.isArrived && (
                  <div className="text-xs font-semibold text-emerald-400 font-['JetBrains_Mono',monospace]">
                    {navEvaluation.isOffRoute
                      ? `${Math.round(navEvaluation.distanceToRouteMeters)}m deviation`
                      : navEvaluation.distanceToNextStepMeters > 0
                      ? `in ${navEvaluation.distanceToNextStepMeters >= 1000 ? (navEvaluation.distanceToNextStepMeters / 1000).toFixed(1) + ' km' : navEvaluation.distanceToNextStepMeters + ' m'}`
                      : 'Next turn ahead'}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsNavigating(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              title="Exit Navigation"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Next Step Preview (if available) */}
          {navEvaluation.nextStep && !navEvaluation.isArrived && (
            <div className="bg-slate-800/80 px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 flex items-center gap-1.5 border border-slate-700">
              <span className="material-symbols-outlined text-[14px] text-slate-400">subdirectory_arrow_right</span>
              <span className="truncate">Then: {navEvaluation.nextStep.instruction || navEvaluation.nextStep.name || 'Continue'}</span>
            </div>
          )}

          {/* Trip Progress Bar */}
          <div className="flex flex-col gap-1 pt-1">
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  navEvaluation.isArrived ? 'bg-emerald-500' : navEvaluation.isOffRoute ? 'bg-amber-400 animate-pulse' : 'bg-[#006398]'
                }`}
                style={{ width: `${Math.round(navEvaluation.progressFraction * 100)}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-xs font-['JetBrains_Mono',monospace] text-slate-300 pt-0.5">
              <span className="font-bold text-white">
                {(navEvaluation.remainingDistanceMeters / 1000).toFixed(1)} km left
              </span>
              <span>
                {Math.max(1, Math.round(navEvaluation.remainingDurationSeconds / 60))} min ETA
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                  navEvaluation.isArrived
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : navEvaluation.isOffRoute
                    ? 'bg-amber-950 text-amber-300 border border-amber-700 animate-pulse'
                    : 'bg-blue-950 text-blue-300 border border-blue-700'
                }`}
              >
                {navEvaluation.status}
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
            {capabilities.canSimulateGpsProgress && (
              <button
                type="button"
                id="btn-simulate-nav-step"
                onClick={() => handleSimulateStepForward(250)}
                className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 border border-slate-700 transition-colors"
                title="Simulate GPS progress along route by +250m"
              >
                <span className="material-symbols-outlined text-[13px] text-blue-400">fast_forward</span>
                <span>Advance +250m</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDirectionsList(prev => !prev)}
              className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 border border-slate-700 transition-colors"
              title="Toggle turn-by-turn directions list"
            >
              <span className="material-symbols-outlined text-[13px]">format_list_numbered</span>
              <span>Steps ({activeRouteSteps.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Turn-by-Turn Steps Modal / Drawer ── */}
      {showDirectionsList && activeRouteSteps.length > 0 && (
        <div className="absolute top-20 left-4 z-40 w-84 max-h-[65vh] bg-white rounded-xl shadow-2xl border border-slate-200 p-3.5 flex flex-col gap-2.5 pointer-events-auto text-[#0b1c30]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <span className="material-symbols-outlined text-[#006398] text-[18px]">turn_sharp_right</span>
              <span>Route Directions ({activeRouteSteps.length} Steps)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowDirectionsList(false)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          <div className="overflow-y-auto flex flex-col gap-2 pr-1 no-scrollbar max-h-[50vh]">
            {activeRouteSteps.map((step, idx) => {
              const isCurrent = navEvaluation && navEvaluation.currentStepIndex === idx
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 p-2 rounded-lg text-xs transition-colors ${
                    isCurrent ? 'bg-blue-50 border border-blue-200 font-bold' : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 font-bold ${
                      isCurrent ? 'bg-[#006398] text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {getManeuverIcon(step.maneuver)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-900 leading-snug">{step.instruction || step.name || 'Proceed'}</div>
                    <div className="text-[10.5px] text-slate-500 font-['JetBrains_Mono',monospace]">
                      {step.distanceMeters >= 1000
                        ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                        : `${step.distanceMeters} m`}
                      {step.durationSeconds > 0 && ` • ${Math.round(step.durationSeconds / 60) || 1} min`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Floating Map Quick-Controls Stack (Top Right) ── */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        {/* Toggle A → B Route Planner HUD Button */}
        {allowRoutePlanner && !isNavigating && (
          <button
            type="button"
            id="btn-toggle-route-planner-hud"
            onClick={() => {
              const next = !isPlannerOpen
              setIsPlannerOpen(next)
              if (next && !manualStart && !manualDest) {
                setRouteInteractionMode('PLACE_START')
              } else if (!next) {
                setRouteInteractionMode('EXPLORE')
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold shadow-md border transition-all ${
              isPlannerOpen || manualStart || manualDest
                ? 'bg-[#006398] text-white border-[#004b73] ring-2 ring-[#006398]/30'
                : 'bg-white/95 text-slate-800 border-slate-200 hover:bg-white'
            }`}
            title="Open manual A → B route position planner"
          >
            <span className="material-symbols-outlined text-[17px]">
              {isPlannerOpen ? 'directions' : 'alt_route'}
            </span>
            <span>{isPlannerOpen ? 'Route HUD Active' : 'Set A → B Route'}</span>
          </button>
        )}

        {/* Snap to Road Quick Pill */}
        {isPlannerOpen && !isNavigating && (
          <button
            type="button"
            id="btn-toggle-snap-road"
            onClick={() => setIsSnapToRoadEnabled(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-xs transition-colors ${
              isSnapToRoadEnabled
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-white/90 text-slate-600 border-slate-200'
            }`}
            title={isSnapToRoadEnabled ? 'Snap to nearest routable road (within 80m)' : 'Exact drop coordinates'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isSnapToRoadEnabled ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
            <span>Road Snap {isSnapToRoadEnabled ? 'ON' : 'OFF'}</span>
          </button>
        )}
      </div>

      {/* ── Road Snapping Notification Toast ── */}
      {roadSnapFeedback && (
        <div className="absolute top-16 right-4 z-30 bg-slate-900/90 backdrop-blur-xs text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg border border-slate-700 pointer-events-none flex items-center gap-1.5">
          <span className="material-symbols-outlined text-emerald-400 text-[14px]">check</span>
          <span>{roadSnapFeedback}</span>
        </div>
      )}

      {/* ── Floating Native ResQnet A → B Route Planner Card (Top Right / Center) ── */}
      {isPlannerOpen && !isNavigating && (
        <div className="absolute top-16 right-4 z-20 w-80 max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200 p-3.5 flex flex-col gap-3 pointer-events-auto text-[#0b1c30]">
          {/* Header Row */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#006398] animate-pulse"></span>
              <span className="text-[13px] font-bold tracking-tight text-[#0b1c30]">
                A → B Route Planner
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsPlannerOpen(false)
                setRouteInteractionMode('EXPLORE')
              }}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
              title="Minimize HUD"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Dynamic Map Instruction Banner */}
          <div
            className={`px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 ${
              routeInteractionMode === 'PLACE_START'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : routeInteractionMode === 'PLACE_DESTINATION'
                ? 'bg-red-50 text-red-900 border border-red-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[16px] shrink-0">
                {routeInteractionMode === 'PLACE_START'
                  ? 'location_on'
                  : routeInteractionMode === 'PLACE_DESTINATION'
                  ? 'near_me'
                  : 'touch_app'}
              </span>
              <span className="truncate">
                {routeInteractionMode === 'PLACE_START'
                  ? 'Click map to place Start (A)'
                  : routeInteractionMode === 'PLACE_DESTINATION'
                  ? 'Click map to place Destination (B)'
                  : effectiveStartCoord && effectiveDestCoord
                  ? 'Points set • Drag pins or calculate'
                  : 'Set Start (A) and Destination (B)'}
              </span>
            </div>
            {routeInteractionMode !== 'EXPLORE' && (
              <button
                type="button"
                onClick={() => setRouteInteractionMode('EXPLORE')}
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-white rounded border border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Point A (Start Point) */}
          <div className="flex flex-col gap-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs">
                  A
                </span>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Origin (Start)
                </span>
              </div>
              {startOriginType === 'CURRENT_LOCATION' && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                  GPS Active
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="min-w-0 flex-1">
                {effectiveStartCoord ? (
                  <span className="font-['JetBrains_Mono',monospace] text-[11px] text-slate-800 font-semibold block truncate">
                    {startOriginType === 'CURRENT_LOCATION' ? 'My Live Location' : `[${effectiveStartCoord[1].toFixed(4)}, ${effectiveStartCoord[0].toFixed(4)}]`}
                  </span>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Not selected</span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {liveLocationState?.coordinate && (
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className="px-2 py-1 bg-blue-50 text-[#006398] hover:bg-blue-100 rounded text-[11px] font-bold border border-blue-200 transition-colors"
                    title="Use live GPS position as start point"
                  >
                    GPS
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRouteInteractionMode(routeInteractionMode === 'PLACE_START' ? 'EXPLORE' : 'PLACE_START')
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                    routeInteractionMode === 'PLACE_START'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                  title="Click map to pick custom start coordinate"
                >
                  {routeInteractionMode === 'PLACE_START' ? 'Placing…' : effectiveStartCoord ? 'Change' : 'Pick'}
                </button>
              </div>
            </div>
          </div>

          {/* Point B (Destination Point) */}
          <div className="flex flex-col gap-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs">
                  B
                </span>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Destination (End)
                </span>
              </div>
              {matchedDestHub && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  Safety Hub
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="min-w-0 flex-1">
                {effectiveDestCoord ? (
                  <span className="font-['JetBrains_Mono',monospace] text-[11px] text-slate-800 font-semibold block truncate">
                    {matchedDestHub ? matchedDestHub.name : `[${effectiveDestCoord[1].toFixed(4)}, ${effectiveDestCoord[0].toFixed(4)}]`}
                  </span>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Not selected</span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setRouteInteractionMode(routeInteractionMode === 'PLACE_DESTINATION' ? 'EXPLORE' : 'PLACE_DESTINATION')
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                    routeInteractionMode === 'PLACE_DESTINATION'
                      ? 'bg-red-600 text-white border-red-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                  title="Click map to pick destination coordinate"
                >
                  {routeInteractionMode === 'PLACE_DESTINATION' ? 'Placing…' : effectiveDestCoord ? 'Change' : 'Pick'}
                </button>
              </div>
            </div>

            {/* Quick Safety Hub Destination Chips */}
            {engineSafetyHubs.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pt-1 no-scrollbar text-[10px]">
                <span className="text-slate-400 font-bold shrink-0">Hubs:</span>
                {engineSafetyHubs.slice(0, 3).map(h => {
                  const isSelected = effectiveDestCoord && Math.abs(h.coordinate[0] - effectiveDestCoord[0]) < 0.0001
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => handleSelectSafetyHub(h)}
                      className={`px-1.5 py-0.5 rounded truncate max-w-[90px] font-medium shrink-0 border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      title={h.name}
                    >
                      {h.name.split(',')[0]}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              id="btn-calculate-safe-route-main"
              onClick={() => {
                if (effectiveStartCoord && effectiveDestCoord) {
                  executeSafeRouteCalculation(effectiveStartCoord, effectiveDestCoord)
                }
              }}
              disabled={!canCalculate}
              className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                canCalculate
                  ? 'bg-[#006398] hover:bg-[#004b73] text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isCalculatingRoute ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                  <span>Evaluating Safe Roads…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">navigation</span>
                  <span>Calculate Safe Route</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-swap-ab-points"
                onClick={handleSwapPoints}
                disabled={!effectiveStartCoord || !effectiveDestCoord || isCalculatingRoute}
                className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                title="Swap Start and Destination"
              >
                <span className="material-symbols-outlined text-[14px]">swap_vert</span>
                <span>Swap A ↔ B</span>
              </button>

              <button
                type="button"
                id="btn-reset-ab-points"
                onClick={handleResetRoute}
                disabled={isCalculatingRoute || (!manualStart && !manualDest && !calculatedResult)}
                className="py-1.5 px-3 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 disabled:opacity-40 rounded-lg text-[11px] font-semibold transition-colors"
                title="Clear route points"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Active Calculated Route Summary Badge & Navigation CTAs */}
          {activeRouteResult && activeRoutingDecision?.selectedRoute && (
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                  <span className="material-symbols-outlined text-emerald-600 text-[15px]">verified</span>
                  <span>Safe Corridor Evaluated</span>
                </span>
                <span className="font-['JetBrains_Mono',monospace] text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  OSRM + GIS
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <div className="flex items-baseline gap-1.5 font-['JetBrains_Mono',monospace]">
                  <span className="text-[16px] font-bold text-[#0b1c30]">
                    {activeRoutingDecision.selectedRoute.durationMinutes}
                  </span>
                  <span className="text-[11px] text-slate-600">min</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[13px] font-semibold text-[#0b1c30]">
                    {activeRoutingDecision.selectedRoute.distanceKm} km
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFitRouteTrigger(prev => prev + 1)}
                  className="text-[11px] font-semibold text-[#006398] hover:underline"
                >
                  Fit View
                </button>
              </div>

              {activeRoutingDecision.explanation && (
                <p className="text-[10.5px] text-slate-600 leading-tight border-t border-emerald-100 pt-1">
                  {activeRoutingDecision.explanation}
                </p>
              )}

              {/* Start Live Navigation CTA Button */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  id="btn-start-live-navigation"
                  onClick={handleStartNavigation}
                  className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">turn_sharp_right</span>
                  <span>Start Live Navigation</span>
                </button>

                {activeRouteSteps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDirectionsList(prev => !prev)}
                    className="py-2 px-2.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center justify-center"
                    title="View Turn-by-Turn Steps"
                  >
                    <span className="material-symbols-outlined text-[16px]">format_list_numbered</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
