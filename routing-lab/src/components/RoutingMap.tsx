import React, { useEffect, useRef, useCallback } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  NavigationControl,
  ScaleControl,
  Popup,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Coordinate, RouteResult } from '../types/routing';
import { toLngLat } from '../utils/geoUtils';
import type { RouteSafetyAssessment, HazardZone, BlockedRoad } from '../types/safety';
import type { RouteSelectionResult, RouteCandidate } from '../types/candidates';
import type { RoutingDecision } from '../types/routingDecision';
import type { CoordinatorMode } from './CoordinatorControlPanel';
import type { OperationalRoad } from '../data/roadNetworkData';
import { HAZARD_ZONES, getHazardZonesGeoJSON } from '../data/hazardData';
import { BLOCKED_ROADS, getBlockedRoadsGeoJSON } from '../data/blockedRoadData';
import { pointToSegmentDistanceMeters, createCirclePolygon } from '../services/geometryUtils';
import { snapPointToSpecificRoad } from '../services/roadSectionService';
import { identifyRoadFromMapClick, getHoverRoadGeometry } from '../services/mapRoadFeatureService';
import { identifyFacilityFromMapClick } from '../services/mapFacilityFeatureService';
import { snapCoordinateToNearestRoad } from '../services/routingService';
import type { LiveLocationState } from '../types/location';
import type { SafetyHub, PotentialSafetyHub, OperationalArea } from '../types/safetyHub';
import { OPERATIONAL_AREA_TYPE_METAS } from '../types/safetyHub';
import {
  getSafetyHubShieldMarkup,
  getOperationalAreaIconMarkup,
  loadAllSafetyHubMapImages,
} from './SafetyHubIcons';
import type { MapInteractionMode } from '../types/interaction';
import { generateDirectionArrowFeatures } from '../services/routeProgressService';
import type { Incident } from '../types/incident';
import type { Responder } from '../types/responder';
import type { VisibleLayersState } from './RoleControlPanel';

interface RoutingMapProps {
  start: Coordinate | null;
  destination: Coordinate | null;
  routeResult: RouteResult | RouteCandidate | null;
  assessment: RouteSafetyAssessment | null;
  selectionResult: RouteSelectionResult | null;
  decision?: RoutingDecision | null;
  remainingRouteCoords?: Coordinate[] | null;
  onMapClick: (coord: Coordinate) => void;
  selectionMode?: 'start' | 'destination' | 'locked';
  interactionMode?: MapInteractionMode;
  isDeveloperMode?: boolean;
  hazards?: HazardZone[];
  blockedRoads?: BlockedRoad[];
  safetyHubs?: SafetyHub[];
  operationalAreas?: OperationalArea[];
  incidents?: Incident[];
  responders?: Responder[];
  visibleLayers?: VisibleLayersState;
  onSelectIncident?: (incident: Incident) => void;
  onSelectResponder?: (responder: Responder) => void;
  activeAreaDraft?: {
    hubId: string;
    hubName: string;
    name: string;
    type: import('../types/safetyHub').OperationalAreaType;
    format: import('../types/safetyHub').OperationalAreaFormat;
    status: import('../types/safetyHub').OperationalAreaStatus;
    color?: string;
  } | null;
  onSelectSafetyHubDestination?: (hub: SafetyHub) => void;
  onSelectPotentialSafetyHub?: (potential: PotentialSafetyHub) => void;
  onOpenAddOperationalAreaForHub?: (hub: SafetyHub) => void;
  onEditOperationalArea?: (area: OperationalArea) => void;
  onSavePlacedOperationalAreaPoint?: (coord: Coordinate) => void;
  coordinatorMode?: CoordinatorMode;
  drawingPoints?: Coordinate[];
  onSelectRoadToBlock?: (road: BlockedRoad) => void;
  focusedFeatureCoords?: Coordinate[] | null;
  selectedRoad?: OperationalRoad | null;
  sectionStartCoord?: Coordinate | null;
  sectionEndCoord?: Coordinate | null;
  sectionPreviewCoords?: Coordinate[] | null;
  onSelectRoadForSection?: (road: OperationalRoad | null, clickedCoord: Coordinate) => void;
  onUpdateSectionHandleDistance?: (handleType: 'start' | 'end', newDistanceMeters: number) => void;
  liveLocationState?: LiveLocationState | null;
  onDisableFollowMe?: () => void;
  recenterTrigger?: number;
  onPointDragStart?: (pointType: 'start' | 'destination') => void;
  onPointDragging?: (pointType: 'start' | 'destination', coord: Coordinate) => void;
  onPointDragEnd?: (pointType: 'start' | 'destination', finalCoord: Coordinate) => void;
  draftSafetyHubPoint?: Coordinate | null;
  draftSafetyHubPolygon?: Coordinate[] | null;
  draftEntranceCoord?: Coordinate | null;
  isSnapToRoadEnabled?: boolean;
  onRoadSnapFeedback?: (message: string) => void;
  isRoutePointsLocked?: boolean;
  fitRouteTrigger?: number;
}

export const ROUTE_SOURCE_ID = 'route-source';
export const ROUTE_LAYER_ID = 'route-layer';
export const ROUTE_CASING_LAYER_ID = 'route-casing-layer';
export const ROUTE_ARROWS_SOURCE_ID = 'route-arrows-source';
export const ROUTE_ARROWS_LAYER_ID = 'route-arrows-layer';

export const CANDIDATES_SOURCE_ID = 'candidates-source';
export const CANDIDATES_CASING_ID = 'candidates-casing';
export const CANDIDATES_LAYER_ID = 'candidates-layer';

export const HAZARDS_SOURCE_ID = 'hazards-source';
export const HAZARDS_FILL_LAYER_ID = 'hazards-fill-layer';
export const HAZARDS_LINE_LAYER_ID = 'hazards-line-layer';

export const DANGER_ZONES_SOURCE_ID = 'danger-zones-source';
export const DANGER_ZONES_FILL_LAYER_ID = 'danger-zones-fill-layer';
export const DANGER_ZONES_LINE_LAYER_ID = 'danger-zones-line-layer';

export const BLOCKED_ROADS_SOURCE_ID = 'blocked-roads-source';
export const BLOCKED_ROADS_CASING_ID = 'blocked-roads-casing';
export const BLOCKED_ROADS_LAYER_ID = 'blocked-roads-layer';

export const SAFETY_HUBS_SAVED_SOURCE_ID = 'safety-hubs-saved-source';
export const SAFETY_HUBS_CLUSTERS_LAYER_ID = 'safety-hubs-clusters-layer';
export const SAFETY_HUBS_CLUSTER_COUNT_LAYER_ID = 'safety-hubs-cluster-count-layer';
export const SAFETY_HUBS_UNCLUSTERED_LAYER_ID = 'safety-hubs-unclustered-layer';
export const SAFETY_HUBS_LABELS_LAYER_ID = 'safety-hubs-labels-layer';

export const SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID = 'safety-hubs-polygons-saved-source';
export const SAFETY_HUBS_POLYGONS_FILL_LAYER_ID = 'safety-hubs-polygons-fill-layer';
export const SAFETY_HUBS_POLYGONS_LINE_LAYER_ID = 'safety-hubs-polygons-line-layer';

export const SAFETY_HUB_DRAFT_SOURCE_ID = 'safety-hub-draft-source';
export const SAFETY_HUB_DRAFT_FILL_LAYER_ID = 'safety-hub-draft-fill-layer';
export const SAFETY_HUB_DRAFT_LINE_LAYER_ID = 'safety-hub-draft-line-layer';
export const SAFETY_HUB_DRAFT_POINTS_LAYER_ID = 'safety-hub-draft-points-layer';

export const SAFETY_HUB_SELECTION_SOURCE_ID = 'safety-hub-selection-source';
export const SAFETY_HUB_SELECTION_LAYER_ID = 'safety-hub-selection-layer';

export const OPERATIONAL_AREAS_SAVED_SOURCE_ID = 'operational-areas-saved-source';
export const OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID = 'operational-areas-saved-fill-layer';
export const OPERATIONAL_AREAS_SAVED_LINE_LAYER_ID = 'operational-areas-saved-line-layer';

export const OPERATIONAL_FACILITIES_POINTS_SOURCE_ID = 'operational-facilities-points-source';
export const OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID = 'operational-facilities-clusters-layer';
export const OPERATIONAL_FACILITIES_CLUSTER_COUNT_LAYER_ID = 'operational-facilities-cluster-count-layer';
export const OPERATIONAL_FACILITIES_POINTS_LAYER_ID = 'operational-facilities-points-layer';
export const OPERATIONAL_FACILITIES_LABELS_LAYER_ID = 'operational-facilities-labels-layer';

export const OPERATIONAL_AREA_DRAFT_SOURCE_ID = 'operational-area-draft-source';
export const OPERATIONAL_AREA_DRAFT_FILL_LAYER_ID = 'operational-area-draft-fill-layer';
export const OPERATIONAL_AREA_DRAFT_LINE_LAYER_ID = 'operational-area-draft-line-layer';
export const OPERATIONAL_AREA_DRAFT_POINTS_LAYER_ID = 'operational-area-draft-points-layer';

export const SELECTED_ROAD_SOURCE_ID = 'selected-road-source';
export const SELECTED_ROAD_CASING_ID = 'selected-road-casing';
export const SELECTED_ROAD_LAYER_ID = 'selected-road-layer';

export const HOVER_ROAD_SOURCE_ID = 'hover-road-source';
export const HOVER_ROAD_CASING_ID = 'hover-road-casing';
export const HOVER_ROAD_LAYER_ID = 'hover-road-layer';

export const HAZARD_OVERLAY_SOURCE_ID = 'hazard-overlay-source';
export const HAZARD_OVERLAY_LAYER_ID = 'hazard-overlay-layer';

export const DRAWING_SOURCE_ID = 'drawing-source';
export const DRAWING_FILL_LAYER_ID = 'drawing-fill-layer';
export const DRAWING_LINE_LAYER_ID = 'drawing-line-layer';
export const DRAWING_POINTS_LAYER_ID = 'drawing-points-layer';

export const SECTION_PREVIEW_SOURCE_ID = 'section-preview-source';
export const SECTION_PREVIEW_CASING_ID = 'section-preview-casing';
export const SECTION_PREVIEW_LAYER_ID = 'section-preview-layer';

export const GPS_ACCURACY_SOURCE_ID = 'gps-accuracy-source';
export const GPS_ACCURACY_FILL_LAYER_ID = 'gps-accuracy-fill-layer';
export const GPS_ACCURACY_LINE_LAYER_ID = 'gps-accuracy-line-layer';

export const RoutingMap: React.FC<RoutingMapProps> = ({
  start,
  destination,
  routeResult,
  assessment,
  selectionResult,
  decision,
  onMapClick,
  selectionMode: _selectionMode,
  remainingRouteCoords = null,
  isDeveloperMode = false,
  hazards = HAZARD_ZONES,
  blockedRoads = BLOCKED_ROADS,
  safetyHubs = [],
  operationalAreas = [],
  incidents = [],
  responders = [],
  visibleLayers,
  onSelectIncident,
  onSelectResponder,
  activeAreaDraft = null,
  onSelectSafetyHubDestination,
  onSelectPotentialSafetyHub,
  onOpenAddOperationalAreaForHub,
  onEditOperationalArea,
  onSavePlacedOperationalAreaPoint,
  coordinatorMode = 'none',
  drawingPoints = [],
  onSelectRoadToBlock,
  focusedFeatureCoords,
  selectedRoad = null,
  sectionStartCoord = null,
  sectionEndCoord = null,
  sectionPreviewCoords = null,
  onSelectRoadForSection,
  onUpdateSectionHandleDistance,
  liveLocationState = null,
  onDisableFollowMe,
  recenterTrigger = 0,
  onPointDragStart,
  onPointDragging,
  onPointDragEnd,
  draftSafetyHubPoint = null,
  draftSafetyHubPolygon = null,
  draftEntranceCoord = null,
  isSnapToRoadEnabled = true,
  onRoadSnapFeedback,
  isRoutePointsLocked = false,
  fitRouteTrigger = 0,
  interactionMode = 'EXPLORE',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const startMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const startHandleMarkerRef = useRef<Marker | null>(null);
  const endHandleMarkerRef = useRef<Marker | null>(null);
  const gpsMarkerRef = useRef<Marker | null>(null);
  const draftHubMarkerRef = useRef<Marker | null>(null);
  const draftEntranceMarkerRef = useRef<Marker | null>(null);
  const incidentsMarkersRef = useRef<Marker[]>([]);
  const respondersMarkersRef = useRef<Marker[]>([]);
  const onSelectIncidentRef = useRef(onSelectIncident);
  const onSelectResponderRef = useRef(onSelectResponder);
  const activeDraggingHandleRef = useRef<'start' | 'end' | null>(null);
  const activeDraggingPointRef = useRef<'start' | 'destination' | null>(null);
  const justFinishedDraggingRef = useRef<boolean>(false);
  const popupRef = useRef<Popup | null>(null);
  const activeFeaturePopupRef = useRef<Popup | null>(null);

  const [intersectionMenu, setIntersectionMenu] = React.useState<{
    roads: OperationalRoad[];
    clickedCoord: Coordinate;
    screenPos: { x: number; y: number };
  } | null>(null);

  const onMapClickRef = useRef(onMapClick);
  const onSelectRoadToBlockRef = useRef(onSelectRoadToBlock);
  const onSelectRoadForSectionRef = useRef(onSelectRoadForSection);
  const onUpdateSectionHandleDistanceRef = useRef(onUpdateSectionHandleDistance);
  const onSelectPotentialSafetyHubRef = useRef(onSelectPotentialSafetyHub);
  const onSelectSafetyHubDestinationRef = useRef(onSelectSafetyHubDestination);
  const onOpenAddOperationalAreaForHubRef = useRef(onOpenAddOperationalAreaForHub);
  const onEditOperationalAreaRef = useRef(onEditOperationalArea);
  const onSavePlacedOperationalAreaPointRef = useRef(onSavePlacedOperationalAreaPoint);
  const onDisableFollowMeRef = useRef(onDisableFollowMe);
  const onPointDragStartRef = useRef(onPointDragStart);
  const onPointDraggingRef = useRef(onPointDragging);
  const onPointDragEndRef = useRef(onPointDragEnd);
  const isSnapToRoadEnabledRef = useRef(isSnapToRoadEnabled);
  const onRoadSnapFeedbackRef = useRef(onRoadSnapFeedback);
  const isRoutePointsLockedRef = useRef(isRoutePointsLocked);
  const liveLocationStateRef = useRef<LiveLocationState | null | undefined>(liveLocationState);
  const startRef = useRef<Coordinate | null>(start);
  const destinationRef = useRef<Coordinate | null>(destination);
  const routeResultRef = useRef<RouteResult | RouteCandidate | null>(routeResult);
  const assessmentRef = useRef<RouteSafetyAssessment | null>(assessment);
  const selectionResultRef = useRef<RouteSelectionResult | null>(selectionResult);
  const decisionRef = useRef<RoutingDecision | null | undefined>(decision);
  const isDeveloperModeRef = useRef<boolean>(isDeveloperMode);
  const coordinatorModeRef = useRef<CoordinatorMode>(coordinatorMode);
  const interactionModeRef = useRef<MapInteractionMode>(interactionMode);
  const hazardsRef = useRef<HazardZone[]>(hazards);
  const blockedRoadsRef = useRef<BlockedRoad[]>(blockedRoads);
  const safetyHubsRef = useRef<SafetyHub[]>(safetyHubs);
  const operationalAreasRef = useRef<OperationalArea[]>(operationalAreas);
  const activeAreaDraftRef = useRef(activeAreaDraft);
  const drawingPointsRef = useRef<Coordinate[]>(drawingPoints);
  const selectedRoadRef = useRef<OperationalRoad | null>(selectedRoad);
  const sectionPreviewCoordsRef = useRef<Coordinate[] | null>(sectionPreviewCoords);
  const remainingRouteCoordsRef = useRef<Coordinate[] | null | undefined>(remainingRouteCoords);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onSelectRoadToBlockRef.current = onSelectRoadToBlock;
    onSelectRoadForSectionRef.current = onSelectRoadForSection;
    onUpdateSectionHandleDistanceRef.current = onUpdateSectionHandleDistance;
    onSelectPotentialSafetyHubRef.current = onSelectPotentialSafetyHub;
    onSelectSafetyHubDestinationRef.current = onSelectSafetyHubDestination;
    onOpenAddOperationalAreaForHubRef.current = onOpenAddOperationalAreaForHub;
    onEditOperationalAreaRef.current = onEditOperationalArea;
    onSavePlacedOperationalAreaPointRef.current = onSavePlacedOperationalAreaPoint;
    onDisableFollowMeRef.current = onDisableFollowMe;
    onPointDragStartRef.current = onPointDragStart;
    onPointDraggingRef.current = onPointDragging;
    onPointDragEndRef.current = onPointDragEnd;
    isSnapToRoadEnabledRef.current = isSnapToRoadEnabled;
    onRoadSnapFeedbackRef.current = onRoadSnapFeedback;
    isRoutePointsLockedRef.current = isRoutePointsLocked;
    liveLocationStateRef.current = liveLocationState;
    startRef.current = start;
    destinationRef.current = destination;
    routeResultRef.current = routeResult;
    assessmentRef.current = assessment;
    selectionResultRef.current = selectionResult;
    decisionRef.current = decision;
    isDeveloperModeRef.current = isDeveloperMode;
    coordinatorModeRef.current = coordinatorMode;
    interactionModeRef.current = interactionMode;
    hazardsRef.current = hazards;
    blockedRoadsRef.current = blockedRoads;
    safetyHubsRef.current = safetyHubs;
    operationalAreasRef.current = operationalAreas;
    activeAreaDraftRef.current = activeAreaDraft;
    drawingPointsRef.current = drawingPoints;
    selectedRoadRef.current = selectedRoad;
    sectionPreviewCoordsRef.current = sectionPreviewCoords;
    remainingRouteCoordsRef.current = remainingRouteCoords;
    onSelectIncidentRef.current = onSelectIncident;
    onSelectResponderRef.current = onSelectResponder;
  }, [
    onMapClick,
    onSelectRoadToBlock,
    onSelectRoadForSection,
    onUpdateSectionHandleDistance,
    onSelectPotentialSafetyHub,
    onSelectSafetyHubDestination,
    onOpenAddOperationalAreaForHub,
    onEditOperationalArea,
    onSavePlacedOperationalAreaPoint,
    onDisableFollowMe,
    onPointDragStart,
    onPointDragging,
    onPointDragEnd,
    isSnapToRoadEnabled,
    onRoadSnapFeedback,
    isRoutePointsLocked,
    liveLocationState,
    start,
    destination,
    routeResult,
    assessment,
    selectionResult,
    decision,
    isDeveloperMode,
    coordinatorMode,
    interactionMode,
    hazards,
    blockedRoads,
    safetyHubs,
    operationalAreas,
    activeAreaDraft,
    drawingPoints,
    selectedRoad,
    sectionPreviewCoords,
    remainingRouteCoords,
    onSelectIncident,
    onSelectResponder,
  ]);

  const createMarkerElement = (type: 'start' | 'destination') => {
    const el = document.createElement('div');
    el.className = `geo-pin-marker geo-pin-${type}`;
    el.id = `geo-pin-marker-${type}`;
    el.style.width = '32px';
    el.style.height = '42px';
    el.style.cursor = isRoutePointsLockedRef.current ? 'pointer' : 'grab';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${type === 'start' ? 'Start (A)' : 'Destination (B)'} marker`);
    el.setAttribute('title', `Drag ${type === 'start' ? 'Start (A)' : 'Destination (B)'} to adjust position precisely`);

    const color = type === 'start' ? '#10b981' : '#ef4444';
    const label = type === 'start' ? 'A' : 'B';

    el.innerHTML = `
      <div class="geo-pin-inner">
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 14.2 24.8 14.8 25.4.6.6 1.8.6 2.4 0C17.8 40.8 32 27.5 32 16 32 7.163 24.837 0 16 0z" fill="${color}"/>
          <circle cx="16" cy="16" r="11" fill="white"/>
          <text x="16" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="900" fill="${color}" text-anchor="middle">${label}</text>
        </svg>
      </div>
    `;
    return el;
  };

  const attachMarkerDragListeners = (
    pointType: 'start' | 'destination',
    marker: Marker,
    el: HTMLElement
  ) => {
    marker.on('dragstart', () => {
      activeDraggingPointRef.current = pointType;
      el.classList.add('is-dragging');
      onPointDragStartRef.current?.(pointType);
    });

    marker.on('drag', () => {
      if (activeDraggingPointRef.current !== pointType) return;
      const lngLat = marker.getLngLat();
      const coord: Coordinate = [lngLat.lng, lngLat.lat];
      onPointDraggingRef.current?.(pointType, coord);
    });

    marker.on('dragend', async () => {
      justFinishedDraggingRef.current = true;
      setTimeout(() => {
        justFinishedDraggingRef.current = false;
      }, 150);
      activeDraggingPointRef.current = null;
      el.classList.remove('is-dragging');
      const lngLat = marker.getLngLat();
      let finalCoord: Coordinate = [lngLat.lng, lngLat.lat];

      if (isSnapToRoadEnabledRef.current) {
        try {
          const snapRes = await snapCoordinateToNearestRoad(finalCoord, 80);
          if (snapRes.snapped) {
            finalCoord = snapRes.snappedCoordinate;
            marker.setLngLat(finalCoord);
            const label = pointType === 'start' ? 'Start (A)' : 'Destination (B)';
            onRoadSnapFeedbackRef.current?.(
              `${label} snapped to ${snapRes.roadName || 'road'} (${Math.round(snapRes.distanceMeters)}m)`
            );
          } else if (snapRes.distanceMeters > 80) {
            onRoadSnapFeedbackRef.current?.(
              `No nearby road within 80m (closest is ${Math.round(snapRes.distanceMeters)}m)`
            );
          }
        } catch (err) {
          console.warn('[ROUTING] Road snap error on dragend:', err);
        }
      }

      onPointDragEndRef.current?.(pointType, finalCoord);
    });
  };

  const createClosureHandleElement = (type: 'start' | 'end') => {
    const isGate1 = type === 'start';
    const gateLabel = isGate1 ? 'GATE 1' : 'GATE 2';
    const gateFullTitle = isGate1 ? 'Closure Gate 1' : 'Closure Gate 2';
    const primaryColor = isGate1 ? '#2563eb' : '#dc2626';
    const accentColor = isGate1 ? '#60a5fa' : '#f87171';

    const el = document.createElement('div');
    el.className = `geo-closure-gate-handle gate-${type}`;
    el.id = `closure-gate-${type}`;
    el.style.width = '72px';
    el.style.height = '34px';
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.style.pointerEvents = 'auto';
    el.style.userSelect = 'none';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.borderRadius = '6px';
    el.style.backgroundColor = primaryColor;
    el.style.border = `2px solid #ffffff`;
    el.style.boxShadow = `0 4px 14px rgba(0, 0, 0, 0.5), 0 0 0 1px ${accentColor}`;
    el.style.zIndex = '60';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', gateFullTitle);
    el.setAttribute('title', `Drag ${gateFullTitle} along road`);

    el.innerHTML = `
      <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 10px; font-weight: 900; color: #ffffff; letter-spacing: 0.8px; text-transform: uppercase; line-height: 1; pointer-events: none;">
        ${gateLabel}
      </div>
      <div style="display: flex; gap: 2px; margin-top: 3px; pointer-events: none;">
        <span style="width: 8px; height: 3px; background: #ffffff; border-radius: 1px; opacity: 0.9;"></span>
        <span style="width: 8px; height: 3px; background: rgba(0,0,0,0.4); border-radius: 1px;"></span>
        <span style="width: 8px; height: 3px; background: #ffffff; border-radius: 1px; opacity: 0.9;"></span>
        <span style="width: 8px; height: 3px; background: rgba(0,0,0,0.4); border-radius: 1px;"></span>
      </div>
    `;
    return el;
  };


  const createGpsMarkerElement = () => {
    const el = document.createElement('div');
    el.className = 'geo-gps-marker';
    el.id = 'geo-gps-live-marker';
    el.innerHTML = `
      <div class="gps-pulse-ring"></div>
      <div class="gps-heading-cone" style="display: none;"></div>
      <div class="gps-core-dot"></div>
    `;
    return el;
  };

  const createDraftSafetyHubMarkerElement = () => {
    const el = document.createElement('div');
    el.className = 'geo-pin-marker geo-pin-draft-hub';
    el.id = 'geo-pin-draft-hub';
    el.style.width = '34px';
    el.style.height = '44px';
    el.style.cursor = 'default';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Draft Safety Hub marker');
    el.setAttribute('title', 'Draft Safety Hub Location (Unsaved)');
    el.innerHTML = `
      <div class="geo-pin-inner geo-pin-pulse" style="position: relative;">
        <svg width="34" height="44" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 14.2 24.8 14.8 25.4.6.6 1.8.6 2.4 0C17.8 40.8 32 27.5 32 16 32 7.163 24.837 0 16 0z" fill="#059669" stroke="#34d399" stroke-width="2"/>
          <circle cx="16" cy="16" r="10" fill="#047857"/>
          <path d="M16 9l4 3v5c0 3-4 5-4 5s-4-2-4-5v-5l4-3z" fill="#ffffff"/>
        </svg>
      </div>
    `;
    return el;
  };

  const createDraftEntranceMarkerElement = () => {
    const el = document.createElement('div');
    el.className = 'geo-pin-marker geo-pin-entrance';
    el.id = 'geo-pin-entrance';
    el.style.width = '30px';
    el.style.height = '38px';
    el.style.cursor = 'default';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Safety Hub Entrance marker');
    el.setAttribute('title', 'Safety Hub Road Entrance / Access Gate');
    el.innerHTML = `
      <div class="geo-pin-inner" style="position: relative;">
        <svg width="30" height="38" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 14.2 24.8 14.8 25.4.6.6 1.8.6 2.4 0C17.8 40.8 32 27.5 32 16 32 7.163 24.837 0 16 0z" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
          <circle cx="16" cy="16" r="9" fill="#0369a1"/>
          <path d="M14 11l4 5-4 5" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    return el;
  };

  const createSafetyHubPopupHTML = (hub: SafetyHub, childAreas: OperationalArea[] = []) => {
    const isEligible =
      hub.verificationStatus === 'VERIFIED' &&
      hub.isActive !== false &&
      hub.status !== 'CLOSED' &&
      hub.status !== 'FULL' &&
      hub.availableCapacity > 0;

    const percent = Math.min(100, Math.round((hub.currentOccupancy / hub.totalCapacity) * 100));

    return `
      <div class="hub-map-popup-card">
        <div class="popup-hub-top">
          <span class="popup-hub-type" style="display: flex; align-items: center; gap: 4px;">
            ${getSafetyHubShieldMarkup('#60a5fa', 14)}
            ${hub.siteType}
          </span>
          <span class="status-pill pill-${hub.status.toLowerCase()}">${hub.status}</span>
        </div>
        <div class="popup-hub-title">${hub.name}</div>
        ${hub.address ? `<div class="popup-hub-addr">📍 ${hub.address}</div>` : ''}

        <div class="popup-cap-block">
          <div class="cap-bar-wrap">
            <div class="cap-bar-inner fill-${hub.status.toLowerCase()}" style="width: ${percent}%;"></div>
          </div>
          <div class="cap-meta-row">
            <span>${hub.currentOccupancy} / ${hub.totalCapacity} occupied</span>
            <strong class="${hub.availableCapacity > 0 ? 'text-ok' : 'text-danger'}">${hub.availableCapacity} available</strong>
          </div>
        </div>

        <div class="popup-caps-row">
          ${hub.capabilities.tents.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('RELIEF_TENT', '#38bdf8', 12)} Tents (${hub.capabilities.tents.tentCapacity})</span>` : ''}
          ${hub.capabilities.foodDistribution.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('FOOD_DISTRIBUTION', '#f59e0b', 12)} Food</span>` : ''}
          ${hub.capabilities.drinkingWater.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('WATER_POINT', '#06b6d4', 12)} Water</span>` : ''}
          ${hub.capabilities.medicalFirstAid.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('MEDICAL_FIRST_AID', '#ef4444', 12)} Medical</span>` : ''}
          ${hub.capabilities.sanitationToilets.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('SANITATION', '#8b5cf6', 12)} Sanitation</span>` : ''}
          ${hub.capabilities.powerCharging.enabled ? `<span class="cap-pill" style="display: inline-flex; align-items: center; gap: 3px;">${getOperationalAreaIconMarkup('COMMAND_COORDINATION', '#a855f7', 12)} Power</span>` : ''}
        </div>

        ${childAreas.length > 0 ? `
          <div class="popup-child-areas-section" style="margin-top: 8px; border-top: 1px solid #1e293b; padding-top: 6px;">
            <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">
              FACILITIES (${childAreas.length}):
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
              ${childAreas.map(a => `
                <span class="cap-pill" style="border-color: ${OPERATIONAL_AREA_TYPE_METAS[a.type]?.color || '#3b82f6'}; display: inline-flex; align-items: center; gap: 3px;">
                  ${getOperationalAreaIconMarkup(a.type, OPERATIONAL_AREA_TYPE_METAS[a.type]?.color || '#ffffff', 11)}
                  ${a.name.length > 18 ? `${a.name.slice(0, 16)}...` : a.name}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="popup-actions-row" style="display: flex; gap: 6px; margin-top: 10px;">
          <button id="btn-popup-nav-${hub.id}" class="btn-popup-nav ${!isEligible ? 'btn-nav-disabled' : ''}" ${!isEligible ? 'disabled' : ''} style="flex: 1;">
            ${isEligible ? '🧭 Route Here' : hub.status === 'CLOSED' ? 'Closed' : 'Full'}
          </button>
          <button id="btn-popup-add-area-${hub.id}" class="btn-popup-secondary" style="padding: 6px 10px; font-size: 11px; background: #1e293b; border: 1px solid #3b82f6; color: #93c5fd; border-radius: 4px; cursor: pointer; font-weight: 600;" title="Add an operational area inside this hub">
            + Facility
          </button>
        </div>
      </div>
    `;
  };

  const createOperationalAreaPopupHTML = (area: OperationalArea) => {
    const meta = OPERATIONAL_AREA_TYPE_METAS[area.type] || {
      color: '#3b82f6',
      label: area.type,
      description: '',
    };

    return `
      <div class="hub-map-popup-card op-area-popup-card">
        <div class="popup-hub-top">
          <span class="popup-hub-type" style="color: ${meta.color}; border-color: ${meta.color}; display: flex; align-items: center; gap: 4px;">
            ${getOperationalAreaIconMarkup(area.type, meta.color, 13)}
            ${meta.label}
          </span>
          <span class="status-pill pill-${area.status.toLowerCase()}">${area.status}</span>
        </div>
        <div class="popup-hub-title">${area.name}</div>
        <div class="popup-hub-addr" style="color: #94a3b8; font-size: 11px;">
          Safety Hub: <strong style="color: #f8fafc;">${area.hubName}</strong>
        </div>

        ${area.capacity ? `
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 6px;">
            Capacity: <strong>${area.occupancy || 0} / ${area.capacity} people</strong>
          </div>
        ` : ''}

        ${area.description ? `
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 4px; line-height: 1.3;">
            ${area.description}
          </div>
        ` : ''}

        ${area.resourceNotes ? `
          <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-style: italic;">
            Resource: ${area.resourceNotes}
          </div>
        ` : ''}

        <div class="popup-actions-row" style="margin-top: 8px; display: flex; justify-content: flex-end;">
          <button id="btn-popup-edit-area-${area.id}" class="btn-popup-secondary" style="padding: 5px 10px; font-size: 11px; background: #1e293b; border: 1px solid #3b82f6; color: #93c5fd; border-radius: 4px; cursor: pointer; font-weight: 600;">
            ✏️ Edit Facility
          </button>
        </div>
      </div>
    `;
  };

  const getPolygonCentroid = (coords: Coordinate[]): Coordinate => {
    if (!coords || coords.length === 0) return [0, 0];
    let sumLng = 0;
    let sumLat = 0;
    const count = coords.length;
    for (let i = 0; i < count; i++) {
      sumLng += coords[i][0];
      sumLat += coords[i][1];
    }
    return [sumLng / count, sumLat / count];
  };

  const applySafetyHubsData = useCallback((map: MapLibreMap, hubs: SafetyHub[]) => {
    // 1. Saved Hub Points (Clustered & Unclustered Markers)
    const src = map.getSource(SAFETY_HUBS_SAVED_SOURCE_ID) as GeoJSONSource | undefined;
    if (src) {
      const features: GeoJSON.Feature[] = hubs.map((hub) => ({
        type: 'Feature',
        id: hub.id,
        properties: {
          id: hub.id,
          name: hub.name,
          siteType: hub.siteType,
          status: hub.status,
          totalCapacity: hub.totalCapacity,
          currentOccupancy: hub.currentOccupancy,
          availableCapacity: hub.availableCapacity,
          address: hub.address || '',
          isVerified: hub.verificationStatus === 'VERIFIED',
          isActive: hub.isActive !== false,
          hasEntrance: Boolean(hub.entranceCoordinate),
        },
        geometry: {
          type: 'Point',
          coordinates: hub.coordinate,
        },
      }));

      src.setData({
        type: 'FeatureCollection',
        features,
      });
    }

    // 2. Saved Hub Operational Polygons
    const polySrc = map.getSource(SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID) as GeoJSONSource | undefined;
    if (polySrc) {
      const polyFeatures: GeoJSON.Feature[] = hubs
        .filter((h) => h.polygonCoordinates && h.polygonCoordinates.length >= 3)
        .map((h) => {
          const coords = h.polygonCoordinates!;
          const closed =
            coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
              ? coords
              : [...coords, coords[0]];

          return {
            type: 'Feature' as const,
            id: `poly-${h.id}`,
            properties: {
              id: h.id,
              name: h.name,
              status: h.status,
              isVerified: h.verificationStatus === 'VERIFIED',
            },
            geometry: {
              type: 'Polygon' as const,
              coordinates: [closed],
            },
          };
        });

      polySrc.setData({
        type: 'FeatureCollection',
        features: polyFeatures,
      });
    }
  }, []);

  const applySafetyHubDraft = useCallback((map: MapLibreMap, points: Coordinate[]) => {
    const src = map.getSource(SAFETY_HUB_DRAFT_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    if (!points || points.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features: GeoJSON.Feature[] = [];

    // Vertices points
    points.forEach((pt, idx) => {
      features.push({
        type: 'Feature',
        properties: { index: idx + 1, color: '#10b981' },
        geometry: { type: 'Point', coordinates: pt },
      });
    });

    // Line / Polygon
    if (points.length >= 2) {
      const closed =
        points.length >= 3
          ? points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
            ? points
            : [...points, points[0]]
          : points;

      features.push({
        type: 'Feature',
        properties: { isPolygon: points.length >= 3, color: '#10b981' },
        geometry:
          points.length >= 3
            ? { type: 'Polygon', coordinates: [closed] }
            : { type: 'LineString', coordinates: points },
      });
    }

    src.setData({ type: 'FeatureCollection', features });
  }, []);

  const applyOperationalAreasData = useCallback((map: MapLibreMap, areas: OperationalArea[]) => {
    const src = map.getSource(OPERATIONAL_AREAS_SAVED_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    const polygonFeatures = areas
      .filter((a) => a.format === 'POLYGON' && a.polygonCoordinates && a.polygonCoordinates.length >= 3)
      .map((a) => {
        const meta = OPERATIONAL_AREA_TYPE_METAS[a.type] || { color: '#3b82f6' };
        const coords = a.polygonCoordinates!;
        const closed =
          coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
            ? coords
            : [...coords, coords[0]];

        return {
          type: 'Feature' as const,
          properties: {
            id: a.id,
            name: a.name,
            type: a.type,
            status: a.status,
            color: meta.color,
            hubId: a.hubId,
            hubName: a.hubName,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [closed],
          },
        };
      });

    src.setData({
      type: 'FeatureCollection',
      features: polygonFeatures,
    });
  }, []);

  const applyOperationalFacilitiesPointsData = useCallback((map: MapLibreMap, areas: OperationalArea[]) => {
    const src = map.getSource(OPERATIONAL_FACILITIES_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    const pointFeatures: GeoJSON.Feature[] = areas.map((a) => {
      const meta = OPERATIONAL_AREA_TYPE_METAS[a.type] || { color: '#3b82f6', label: a.type };
      const coord =
        a.format === 'POLYGON' && a.polygonCoordinates && a.polygonCoordinates.length >= 3
          ? getPolygonCentroid(a.polygonCoordinates)
          : a.coordinate;

      return {
        type: 'Feature',
        id: a.id,
        properties: {
          id: a.id,
          name: a.name,
          type: a.type,
          format: a.format,
          status: a.status,
          color: meta.color,
          label: meta.label,
          hubId: a.hubId,
          hubName: a.hubName,
          capacity: a.capacity || 0,
          occupancy: a.occupancy || 0,
        },
        geometry: {
          type: 'Point',
          coordinates: coord,
        },
      };
    });

    src.setData({
      type: 'FeatureCollection',
      features: pointFeatures,
    });
  }, []);

  const applyOperationalAreaDraft = useCallback(
    (map: MapLibreMap, points: Coordinate[], color: string = '#3b82f6') => {
      const src = map.getSource(OPERATIONAL_AREA_DRAFT_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;

      if (!points || points.length === 0) {
        src.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      const features: GeoJSON.Feature[] = [];

      // Points vertices
      points.forEach((pt, idx) => {
        features.push({
          type: 'Feature',
          properties: { index: idx, color },
          geometry: { type: 'Point', coordinates: pt },
        });
      });

      // Line / Polygon
      if (points.length >= 2) {
        const closed =
          points.length >= 3
            ? points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
              ? points
              : [...points, points[0]]
            : points;

        features.push({
          type: 'Feature',
          properties: { isPolygon: points.length >= 3, color },
          geometry:
            points.length >= 3
              ? { type: 'Polygon', coordinates: [closed] }
              : { type: 'LineString', coordinates: points },
        });
      }

      src.setData({ type: 'FeatureCollection', features });
    },
    []
  );

  const attachHandlePointerDrag = (
    handleType: 'start' | 'end',
    element: HTMLElement,
    markerRef: React.MutableRefObject<Marker | null>
  ) => {
    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const map = mapRef.current;
      if (!map) return;

      activeDraggingHandleRef.current = handleType;
      try {
        element.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore if not supported
      }
      element.style.cursor = 'grabbing';
      map.dragPan.disable();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activeDraggingHandleRef.current !== handleType) return;
      const map = mapRef.current;
      const road = selectedRoadRef.current;
      if (!map || !road) return;

      e.stopPropagation();
      e.preventDefault();

      const rect = map.getContainer().getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const lngLat = map.unproject([screenX, screenY]);
      const snapped = snapPointToSpecificRoad([lngLat.lng, lngLat.lat], road);

      if (markerRef.current) {
        markerRef.current.setLngLat(snapped.snappedCoord);
      }

      if (onUpdateSectionHandleDistanceRef.current) {
        onUpdateSectionHandleDistanceRef.current(handleType, snapped.cumulativeDistanceMeters);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activeDraggingHandleRef.current === handleType) {
        justFinishedDraggingRef.current = true;
        setTimeout(() => {
          justFinishedDraggingRef.current = false;
        }, 150);
        activeDraggingHandleRef.current = null;
        try {
          if (element.hasPointerCapture(e.pointerId)) {
            element.releasePointerCapture(e.pointerId);
          }
        } catch (err) {
          // ignore
        }
        element.style.cursor = 'grab';
        const map = mapRef.current;
        if (map) {
          map.dragPan.enable();
        }
      }
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };
  };

  const applyHazardsData = useCallback((map: MapLibreMap, currentHazards: HazardZone[]) => {
    const src = map.getSource(HAZARDS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    const standardHazards = currentHazards.filter((h) => !h.isDangerZone && h.isActive !== false);
    src.setData({
      type: 'FeatureCollection',
      features: standardHazards.map((zone) => ({
        type: 'Feature',
        id: zone.id,
        properties: {
          id: zone.id,
          name: zone.name,
          severity: zone.severity,
          description: zone.description,
          color: zone.color || '#f59e0b',
        },
        geometry: zone.geometry,
      })),
    });
  }, []);

  const applyDangerZonesData = useCallback((map: MapLibreMap, currentHazards: HazardZone[]) => {
    const src = map.getSource(DANGER_ZONES_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    const dangerZones = currentHazards.filter((h) => h.isDangerZone && h.isActive !== false);
    src.setData({
      type: 'FeatureCollection',
      features: dangerZones.map((zone) => ({
        type: 'Feature',
        id: zone.id,
        properties: {
          id: zone.id,
          name: zone.name,
          severity: zone.severity,
          description: zone.description,
          color: zone.color || '#ea580c',
        },
        geometry: zone.geometry,
      })),
    });
  }, []);

  const applyBlockedRoadsData = useCallback((map: MapLibreMap, currentBlocked: BlockedRoad[]) => {
    const src = map.getSource(BLOCKED_ROADS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    const activeBlocked = currentBlocked.filter((r) => r.isActive !== false);
    src.setData({
      type: 'FeatureCollection',
      features: activeBlocked.map((road) => ({
        type: 'Feature',
        id: road.id,
        properties: {
          id: road.id,
          name: road.name,
          status: road.status,
          reason: road.reason,
          color: '#dc2626',
        },
        geometry: road.geometry,
      })),
    });
  }, []);

  const applyDrawingPreview = useCallback((map: MapLibreMap, points: Coordinate[]) => {
    const src = map.getSource(DRAWING_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    if (!points || points.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features: GeoJSON.Feature[] = [];

    // Vertices points
    points.forEach((pt, idx) => {
      features.push({
        type: 'Feature',
        properties: { index: idx + 1 },
        geometry: { type: 'Point', coordinates: pt },
      });
    });

    // Line / Polygon
    if (points.length >= 2) {
      const closed = points.length >= 3 ? [...points, points[0]] : points;
      features.push({
        type: 'Feature',
        properties: { isPolygon: points.length >= 3 },
        geometry:
          points.length >= 3
            ? { type: 'Polygon', coordinates: [closed] }
            : { type: 'LineString', coordinates: points },
      });
    }

    src.setData({
      type: 'FeatureCollection',
      features,
    });
  }, []);

  const applySectionPreview = useCallback((map: MapLibreMap, coords: Coordinate[] | null) => {
    const src = map.getSource(SECTION_PREVIEW_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    if (!coords || coords.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { isSectionPreview: true },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        },
      ],
    });
  }, []);

  const applySelectedRoadData = useCallback((map: MapLibreMap, road: OperationalRoad | null) => {
    const src = map.getSource(SELECTED_ROAD_SOURCE_ID) as GeoJSONSource | undefined;
    if (!src) return;

    if (!road) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: road.id, name: road.name },
          geometry: road.geometry,
        },
      ],
    });
  }, []);

  const applyGpsAccuracyCircle = useCallback(
    (map: MapLibreMap, coord: Coordinate | null, accuracyMeters: number | null) => {
      const src = map.getSource(GPS_ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;

      if (!coord || !accuracyMeters || accuracyMeters <= 0) {
        src.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      const ring = createCirclePolygon(coord, Math.max(6, accuracyMeters));
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          },
        ],
      });
    },
    []
  );

  const applyRoutesAndCandidates = useCallback(
    (
      map: MapLibreMap,
      currentRoute: RouteResult | RouteCandidate | null,
      currentSelection: RouteSelectionResult | null,
      currentDecision?: RoutingDecision | null,
      devMode?: boolean,
      _startPoint?: Coordinate | null,
      _destPoint?: Coordinate | null,
      activeRemainingCoords?: Coordinate[] | null
    ) => {
      const selectedSrc = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
      const arrowsSrc = map.getSource(ROUTE_ARROWS_SOURCE_ID) as GeoJSONSource | undefined;
      const candidatesSrc = map.getSource(CANDIDATES_SOURCE_ID) as GeoJSONSource | undefined;

      if (!selectedSrc || !candidatesSrc) return;

      // 1. Determine selected route geometry (Single Source of Truth)
      const selected = currentDecision !== undefined
        ? currentDecision?.selectedRoute
        : currentSelection?.selectedRoute;

      const fullRouteCoords = selected && selected.coordinates.length > 0
        ? selected.coordinates
        : (currentDecision === undefined && currentRoute && ('status' in currentRoute ? currentRoute.status === 'success' : true) && currentRoute.coordinates.length > 0)
        ? currentRoute.coordinates
        : null;

      let tier: 'SAFE' | 'LOWER_RISK' | 'UNSAFE_FALLBACK' | 'NONE' = 'SAFE';

      if (selected && selected.coordinates.length > 0) {
        tier = currentDecision?.visualTier || selected.visualTier || (
          selected.safetyAssessment.safetyStatus === 'SAFE'
            ? 'SAFE'
            : selected.safetyAssessment.highestHazardSeverity === 'HIGH'
            ? 'UNSAFE_FALLBACK'
            : 'LOWER_RISK'
        );
      }

      if (fullRouteCoords && fullRouteCoords.length >= 2) {
        // Full route line remains visible
        selectedSrc.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                id: selected?.id || 'selected-route',
                label: selected?.label || 'Route',
                distanceKm: selected?.distanceKm || 0,
                status: selected?.safetyAssessment.safetyStatus || 'SAFE',
                visualTier: tier,
              },
              geometry: {
                type: 'LineString',
                coordinates: fullRouteCoords,
              },
            },
          ],
        });

        // Direction arrows ONLY on the remaining route geometry
        if (arrowsSrc) {
          if (activeRemainingCoords && activeRemainingCoords.length === 0) {
            // ARRIVED: All arrows hidden
            arrowsSrc.setData({ type: 'FeatureCollection', features: [] });
          } else if (activeRemainingCoords && activeRemainingCoords.length >= 2) {
            // Navigating: Arrows strictly on remaining route ahead of GPS
            const arrowFeatures = generateDirectionArrowFeatures(activeRemainingCoords, 85, 35);
            arrowsSrc.setData(arrowFeatures);
          } else if (!activeRemainingCoords) {
            // Initial state / IDLE: Arrows across full route
            const arrowFeatures = generateDirectionArrowFeatures(fullRouteCoords, 85, 35);
            arrowsSrc.setData(arrowFeatures);
          } else {
            arrowsSrc.setData({ type: 'FeatureCollection', features: [] });
          }
        }
      } else {
        // STRICTLY EMPTY: If selectedRoute is null (e.g. NO_SAFE_ROUTE) or empty, clear both route and arrows!
        selectedSrc.setData({
          type: 'FeatureCollection',
          features: [],
        });
        if (arrowsSrc) {
          arrowsSrc.setData({
            type: 'FeatureCollection',
            features: [],
          });
        }
      }

      // 2. Candidates: ONLY render in developer mode
      if (devMode) {
        const candidatesList = currentDecision !== undefined
          ? (currentDecision?.selectedRoute
              ? currentDecision.allCandidates.filter((c) => !c.isSelected)
              : currentDecision?.allCandidates || [])
          : (currentSelection?.candidates && currentSelection.candidates.length > 1
              ? currentSelection.candidates.filter((c) => !c.isSelected)
              : []);

        if (candidatesList.length > 0) {
          candidatesSrc.setData({
            type: 'FeatureCollection',
            features: candidatesList.map((c) => ({
              type: 'Feature',
              properties: {
                id: c.id,
                label: c.label,
                distanceKm: c.distanceKm,
                status: c.safetyAssessment.safetyStatus,
                isOriginalRisky: Boolean(c.isOriginalRisky),
                isDetour: Boolean(c.isDetour),
              },
              geometry: c.geometry,
            })),
          });
        } else {
          candidatesSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      } else {
        // CITIZEN MODE: always clear candidate routes
        candidatesSrc.setData({ type: 'FeatureCollection', features: [] });
      }

      // Camera fitting is decoupled and handled exclusively via explicit user actions (fitRouteTrigger).
    },
    []
  );

  const applyHazardOverlay = useCallback(
    (map: MapLibreMap, currentAssessment: RouteSafetyAssessment | null, devMode?: boolean) => {
      const src = map.getSource(HAZARD_OVERLAY_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;

      // In citizen mode, keep map clean without extra overlay lines
      if (
        devMode &&
        currentAssessment?.hazardSegmentsGeoJSON &&
        currentAssessment.hazardSegmentsGeoJSON.features.length > 0
      ) {
        src.setData(currentAssessment.hazardSegmentsGeoJSON);
      } else {
        src.setData({
          type: 'FeatureCollection',
          features: [],
        });
      }
    },
    []
  );

  // 1. Initialize MapLibre instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;
    const mapStyle = mapTilerKey
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
      : {
          version: 8 as const,
          sources: {
            'osm': {
              type: 'raster' as const,
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap contributors',
            },
          },
          layers: [
            {
              id: 'osm-layer',
              type: 'raster' as const,
              source: 'osm',
            },
          ],
        };

    console.log('[MAP] Mounting MapLibre instance for Chandigarh/Mohali/Kharar...');
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [76.7794, 30.7333], // Chandigarh Sector 17
      zoom: 12.5,
    });


    map.addControl(new NavigationControl(), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.doubleClickZoom.disable();

    (window as unknown as { map: MapLibreMap }).map = map;

    map.on('load', async () => {
      console.log('[MAP] Map load event. Registering disaster and multi-candidate layers...');

      // Pre-load all Safety Hub and Operational Area Vector SVG Images
      await loadAllSafetyHubMapImages(map);

      // -------------------------------------------------------------
      // 1. HAZARD ZONES (Polygons)
      // -------------------------------------------------------------
      // -------------------------------------------------------------
      // 1. HAZARD ZONES (Polygons)
      // -------------------------------------------------------------
      if (!map.getSource(HAZARDS_SOURCE_ID)) {
        map.addSource(HAZARDS_SOURCE_ID, {
          type: 'geojson',
          data: getHazardZonesGeoJSON(),
        });
      }

      if (!map.getLayer(HAZARDS_FILL_LAYER_ID)) {
        map.addLayer({
          id: HAZARDS_FILL_LAYER_ID,
          type: 'fill',
          source: HAZARDS_SOURCE_ID,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.26,
          },
        });
      }

      if (!map.getLayer(HAZARDS_LINE_LAYER_ID)) {
        map.addLayer({
          id: HAZARDS_LINE_LAYER_ID,
          type: 'line',
          source: HAZARDS_SOURCE_ID,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2.5,
            'line-opacity': 0.9,
          },
        });
      }

      // -------------------------------------------------------------
      // 1B. DANGER ZONES (Polygons - Distinct Visualization)
      // -------------------------------------------------------------
      if (!map.getSource(DANGER_ZONES_SOURCE_ID)) {
        map.addSource(DANGER_ZONES_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(DANGER_ZONES_FILL_LAYER_ID)) {
        map.addLayer({
          id: DANGER_ZONES_FILL_LAYER_ID,
          type: 'fill',
          source: DANGER_ZONES_SOURCE_ID,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.35,
          },
        });
      }

      if (!map.getLayer(DANGER_ZONES_LINE_LAYER_ID)) {
        map.addLayer({
          id: DANGER_ZONES_LINE_LAYER_ID,
          type: 'line',
          source: DANGER_ZONES_SOURCE_ID,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-dasharray': [3, 2],
            'line-opacity': 0.95,
          },
        });
      }

      // -------------------------------------------------------------
      // 1C. LIVE COORDINATOR DRAWING PREVIEW (Points & Polygon)
      // -------------------------------------------------------------
      if (!map.getSource(DRAWING_SOURCE_ID)) {
        map.addSource(DRAWING_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(DRAWING_FILL_LAYER_ID)) {
        map.addLayer({
          id: DRAWING_FILL_LAYER_ID,
          type: 'fill',
          source: DRAWING_SOURCE_ID,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.25,
          },
        });
      }

      if (!map.getLayer(DRAWING_LINE_LAYER_ID)) {
        map.addLayer({
          id: DRAWING_LINE_LAYER_ID,
          type: 'line',
          source: DRAWING_SOURCE_ID,
          paint: {
            'line-color': '#2563eb',
            'line-width': 3,
            'line-dasharray': [2, 1],
          },
        });
      }

      if (!map.getLayer(DRAWING_POINTS_LAYER_ID)) {
        map.addLayer({
          id: DRAWING_POINTS_LAYER_ID,
          type: 'circle',
          source: DRAWING_SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6,
            'circle-color': '#1d4ed8',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      // -------------------------------------------------------------
      // 1D. OPERATIONAL AREAS (Saved Polygons)
      // -------------------------------------------------------------
      if (!map.getSource(OPERATIONAL_AREAS_SAVED_SOURCE_ID)) {
        map.addSource(OPERATIONAL_AREAS_SAVED_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID,
          type: 'fill',
          source: OPERATIONAL_AREAS_SAVED_SOURCE_ID,
          minzoom: 12,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 0.15,
              14, 0.28,
              17, 0.38
            ],
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_AREAS_SAVED_LINE_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_AREAS_SAVED_LINE_LAYER_ID,
          type: 'line',
          source: OPERATIONAL_AREAS_SAVED_SOURCE_ID,
          minzoom: 12,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 1.5,
              15, 2.5,
              18, 3.5
            ],
            'line-opacity': 0.95,
            'line-dasharray': [2, 1],
          },
        });
      }

      // -------------------------------------------------------------
      // 1E. OPERATIONAL FACILITIES (Points & Centroids with Clustering)
      // -------------------------------------------------------------
      if (!map.getSource(OPERATIONAL_FACILITIES_POINTS_SOURCE_ID)) {
        map.addSource(OPERATIONAL_FACILITIES_POINTS_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 40,
        });
      }

      if (!map.getLayer(OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID,
          type: 'circle',
          source: OPERATIONAL_FACILITIES_POINTS_SOURCE_ID,
          filter: ['has', 'point_count'],
          minzoom: 10,
          maxzoom: 14.5,
          paint: {
            'circle-color': '#1e293b',
            'circle-radius': ['step', ['get', 'point_count'], 14, 4, 18, 8, 22],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#38bdf8',
            'circle-opacity': 0.95,
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_FACILITIES_CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_FACILITIES_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: OPERATIONAL_FACILITIES_POINTS_SOURCE_ID,
          filter: ['has', 'point_count'],
          minzoom: 10,
          maxzoom: 14.5,
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 11,
          },
          paint: {
            'text-color': '#38bdf8',
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_FACILITIES_POINTS_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_FACILITIES_POINTS_LAYER_ID,
          type: 'symbol',
          source: OPERATIONAL_FACILITIES_POINTS_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          minzoom: 13.5,
          layout: {
            'icon-image': ['concat', 'op-marker-', ['downcase', ['get', 'type']]],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13.5, 0.65,
              15, 0.8,
              17, 0.95
            ],
            'icon-anchor': 'center',
            'icon-allow-overlap': false,
            'icon-ignore-placement': false,
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_FACILITIES_LABELS_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_FACILITIES_LABELS_LAYER_ID,
          type: 'symbol',
          source: OPERATIONAL_FACILITIES_POINTS_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          minzoom: 15.5,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 10.5,
            'text-offset': [0, 1.25],
            'text-anchor': 'top',
            'text-max-width': 9,
            'text-optional': true,
          },
          paint: {
            'text-color': '#cbd5e1',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2,
          },
        });
      }

      // -------------------------------------------------------------
      // 1F. SAFETY HUBS (Saved Points with Clustering)
      // -------------------------------------------------------------
      if (!map.getSource(SAFETY_HUBS_SAVED_SOURCE_ID)) {
        map.addSource(SAFETY_HUBS_SAVED_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 10,
          clusterRadius: 45,
        });
      }

      if (!map.getLayer(SAFETY_HUBS_CLUSTERS_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUBS_CLUSTERS_LAYER_ID,
          type: 'circle',
          source: SAFETY_HUBS_SAVED_SOURCE_ID,
          filter: ['has', 'point_count'],
          maxzoom: 11,
          paint: {
            'circle-color': ['step', ['get', 'point_count'], '#059669', 5, '#047857', 10, '#065f46'],
            'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 10, 26],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#34d399',
            'circle-opacity': 0.95,
          },
        });
      }

      if (!map.getLayer(SAFETY_HUBS_CLUSTER_COUNT_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUBS_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SAFETY_HUBS_SAVED_SOURCE_ID,
          filter: ['has', 'point_count'],
          maxzoom: 11,
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
          },
          paint: {
            'text-color': '#ffffff',
          },
        });
      }

      if (!map.getLayer(SAFETY_HUBS_UNCLUSTERED_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUBS_UNCLUSTERED_LAYER_ID,
          type: 'symbol',
          source: SAFETY_HUBS_SAVED_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          minzoom: 8.5,
          layout: {
            'icon-image': ['concat', 'hub-marker-', ['downcase', ['get', 'status']]],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9, 0.65,
              12, 0.78,
              15, 0.9,
              18, 1.05
            ],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
      }

      if (!map.getLayer(SAFETY_HUBS_LABELS_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUBS_LABELS_LAYER_ID,
          type: 'symbol',
          source: SAFETY_HUBS_SAVED_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          minzoom: 12.5,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12.5, 10.5,
              16, 12.5
            ],
            'text-offset': [0, 0.5],
            'text-anchor': 'top',
            'text-max-width': 10,
            'text-optional': true,
          },
          paint: {
            'text-halo-color': '#0f172a',
            'text-halo-width': 2,
          },
        });
      }

      // -------------------------------------------------------------
      // 1F-2. SAFETY HUBS SAVED OPERATIONAL POLYGONS
      // -------------------------------------------------------------
      if (!map.getSource(SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID)) {
        map.addSource(SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(SAFETY_HUBS_POLYGONS_FILL_LAYER_ID)) {
        map.addLayer(
          {
            id: SAFETY_HUBS_POLYGONS_FILL_LAYER_ID,
            type: 'fill',
            source: SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID,
            paint: {
              'fill-color': '#059669',
              'fill-opacity': 0.2,
            },
          },
          SAFETY_HUBS_CLUSTERS_LAYER_ID
        );
      }

      if (!map.getLayer(SAFETY_HUBS_POLYGONS_LINE_LAYER_ID)) {
        map.addLayer(
          {
            id: SAFETY_HUBS_POLYGONS_LINE_LAYER_ID,
            type: 'line',
            source: SAFETY_HUBS_POLYGONS_SAVED_SOURCE_ID,
            paint: {
              'line-color': '#10b981',
              'line-width': 2.5,
            },
          },
          SAFETY_HUBS_CLUSTERS_LAYER_ID
        );
      }

      // -------------------------------------------------------------
      // 1F-3. SAFETY HUB DRAFT (Manual Polygon / Area Drawing)
      // -------------------------------------------------------------
      if (!map.getSource(SAFETY_HUB_DRAFT_SOURCE_ID)) {
        map.addSource(SAFETY_HUB_DRAFT_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(SAFETY_HUB_DRAFT_FILL_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUB_DRAFT_FILL_LAYER_ID,
          type: 'fill',
          source: SAFETY_HUB_DRAFT_SOURCE_ID,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.28,
          },
        });
      }

      if (!map.getLayer(SAFETY_HUB_DRAFT_LINE_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUB_DRAFT_LINE_LAYER_ID,
          type: 'line',
          source: SAFETY_HUB_DRAFT_SOURCE_ID,
          paint: {
            'line-color': '#10b981',
            'line-width': 3,
            'line-dasharray': [2, 1],
          },
        });
      }

      if (!map.getLayer(SAFETY_HUB_DRAFT_POINTS_LAYER_ID)) {
        map.addLayer({
          id: SAFETY_HUB_DRAFT_POINTS_LAYER_ID,
          type: 'circle',
          source: SAFETY_HUB_DRAFT_SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6.5,
            'circle-color': '#10b981',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }
      // -------------------------------------------------------------
      if (!map.getSource(OPERATIONAL_AREA_DRAFT_SOURCE_ID)) {
        map.addSource(OPERATIONAL_AREA_DRAFT_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(OPERATIONAL_AREA_DRAFT_FILL_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_AREA_DRAFT_FILL_LAYER_ID,
          type: 'fill',
          source: OPERATIONAL_AREA_DRAFT_SOURCE_ID,
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.32,
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_AREA_DRAFT_LINE_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_AREA_DRAFT_LINE_LAYER_ID,
          type: 'line',
          source: OPERATIONAL_AREA_DRAFT_SOURCE_ID,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-dasharray': [2, 1],
          },
        });
      }

      if (!map.getLayer(OPERATIONAL_AREA_DRAFT_POINTS_LAYER_ID)) {
        map.addLayer({
          id: OPERATIONAL_AREA_DRAFT_POINTS_LAYER_ID,
          type: 'circle',
          source: OPERATIONAL_AREA_DRAFT_SOURCE_ID,
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6.5,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      }

      // -------------------------------------------------------------
      // 2. BLOCKED ROADS (LineStrings)
      // -------------------------------------------------------------
      if (!map.getSource(BLOCKED_ROADS_SOURCE_ID)) {
        map.addSource(BLOCKED_ROADS_SOURCE_ID, {
          type: 'geojson',
          data: getBlockedRoadsGeoJSON(),
        });
      }

      if (!map.getLayer(BLOCKED_ROADS_CASING_ID)) {
        map.addLayer({
          id: BLOCKED_ROADS_CASING_ID,
          type: 'line',
          source: BLOCKED_ROADS_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#020617',
            'line-width': 9,
            'line-opacity': 0.9,
          },
        });
      }

      if (!map.getLayer(BLOCKED_ROADS_LAYER_ID)) {
        map.addLayer({
          id: BLOCKED_ROADS_LAYER_ID,
          type: 'line',
          source: BLOCKED_ROADS_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ef4444',
            'line-width': 5.5,
            'line-dasharray': [2.5, 2],
            'line-opacity': 1.0,
          },
        });
      }

      // -------------------------------------------------------------
      // 2B. SELECTED ROAD HIGHLIGHT (When defining closure section)
      // -------------------------------------------------------------
      if (!map.getSource(SELECTED_ROAD_SOURCE_ID)) {
        map.addSource(SELECTED_ROAD_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(SELECTED_ROAD_CASING_ID)) {
        map.addLayer({
          id: SELECTED_ROAD_CASING_ID,
          type: 'line',
          source: SELECTED_ROAD_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#020617',
            'line-width': 12,
            'line-opacity': 0.85,
          },
        });
      }

      if (!map.getLayer(SELECTED_ROAD_LAYER_ID)) {
        map.addLayer({
          id: SELECTED_ROAD_LAYER_ID,
          type: 'line',
          source: SELECTED_ROAD_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#f59e0b',
            'line-width': 7,
            'line-opacity': 0.85,
          },
        });
      }

      // -------------------------------------------------------------
      // 2B-2. HOVER ROAD HIGHLIGHT (Interactive hover preview)
      // -------------------------------------------------------------
      if (!map.getSource(HOVER_ROAD_SOURCE_ID)) {
        map.addSource(HOVER_ROAD_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(HOVER_ROAD_CASING_ID)) {
        map.addLayer({
          id: HOVER_ROAD_CASING_ID,
          type: 'line',
          source: HOVER_ROAD_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#020617',
            'line-width': 10,
            'line-opacity': 0.7,
          },
        });
      }

      if (!map.getLayer(HOVER_ROAD_LAYER_ID)) {
        map.addLayer({
          id: HOVER_ROAD_LAYER_ID,
          type: 'line',
          source: HOVER_ROAD_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 6,
            'line-opacity': 0.9,
          },
        });
      }

      // -------------------------------------------------------------
      // 2C. ROAD SECTION BLOCK PREVIEW (Live closure section highlighting)
      // -------------------------------------------------------------
      if (!map.getSource(SECTION_PREVIEW_SOURCE_ID)) {
        map.addSource(SECTION_PREVIEW_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(SECTION_PREVIEW_CASING_ID)) {
        map.addLayer({
          id: SECTION_PREVIEW_CASING_ID,
          type: 'line',
          source: SECTION_PREVIEW_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#020617',
            'line-width': 13,
            'line-opacity': 0.9,
          },
        });
      }

      if (!map.getLayer(SECTION_PREVIEW_LAYER_ID)) {
        map.addLayer({
          id: SECTION_PREVIEW_LAYER_ID,
          type: 'line',
          source: SECTION_PREVIEW_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ef4444',
            'line-width': 7.5,
            'line-dasharray': [2, 1],
            'line-opacity': 1.0,
          },
        });
      }

      // -------------------------------------------------------------
      // 3. PHASE 3 NON-SELECTED CANDIDATE ROUTES (Muted Gray Dashed)
      // Rendered underneath the selected route
      // -------------------------------------------------------------
      if (!map.getSource(CANDIDATES_SOURCE_ID)) {
        map.addSource(CANDIDATES_SOURCE_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });
      }

      if (!map.getLayer(CANDIDATES_CASING_ID)) {
        map.addLayer({
          id: CANDIDATES_CASING_ID,
          type: 'line',
          source: CANDIDATES_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#020617',
            'line-width': 8,
            'line-opacity': 0.7,
          },
        });
      }

      if (!map.getLayer(CANDIDATES_LAYER_ID)) {
        map.addLayer({
          id: CANDIDATES_LAYER_ID,
          type: 'line',
          source: CANDIDATES_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#94a3b8',
            'line-width': 4.5,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        });
      }

      // -------------------------------------------------------------
      // 4. ACTIVE SELECTED ROUTE
      // -------------------------------------------------------------
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });
      }

      if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            visibility: 'visible',
          },
          paint: {
            'line-color': '#020617',
            'line-width': 13,
            'line-opacity': 0.95,
          },
        });
      }

      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            visibility: 'visible',
          },
          paint: {
            // Blue for SAFE, Green for safest available (lower risk), Pink for unsafe fallback
            'line-color': [
              'match',
              ['get', 'visualTier'],
              'SAFE',
              '#2563eb',
              'LOWER_RISK',
              '#10b981',
              'UNSAFE_FALLBACK',
              '#f43f5e',
              '#2563eb',
            ],
            'line-width': 7.5,
            'line-opacity': 1.0,
          },
        });
      }

      // -------------------------------------------------------------
      // 4B. ACTIVE SELECTED ROUTE DIRECTION ARROWS
      // -------------------------------------------------------------
      if (!map.getSource(ROUTE_ARROWS_SOURCE_ID)) {
        map.addSource(ROUTE_ARROWS_SOURCE_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });
      }

      if (!map.getLayer(ROUTE_ARROWS_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_ARROWS_LAYER_ID,
          type: 'symbol',
          source: ROUTE_ARROWS_SOURCE_ID,
          minzoom: 10,
          layout: {
            'icon-image': 'route-dir-arrow',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.52,
              13, 0.72,
              16, 0.88,
              18, 1.05
            ],
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
            'visibility': 'visible',
          },
        });
      }

      // -------------------------------------------------------------
      // 5. DEV MODE HAZARD OVERLAY (Disaster Hazard Segments Overlay)
      // -------------------------------------------------------------
      if (!map.getSource(HAZARD_OVERLAY_SOURCE_ID)) {
        map.addSource(HAZARD_OVERLAY_SOURCE_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });
      }

      if (!map.getLayer(HAZARD_OVERLAY_LAYER_ID)) {
        map.addLayer({
          id: HAZARD_OVERLAY_LAYER_ID,
          type: 'line',
          source: HAZARD_OVERLAY_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 7,
            'line-opacity': 0.95,
          },
        });
      }

      // -------------------------------------------------------------
      // 6. LIVE GPS LOCATION ACCURACY CIRCLE
      // -------------------------------------------------------------
      if (!map.getSource(GPS_ACCURACY_SOURCE_ID)) {
        map.addSource(GPS_ACCURACY_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(GPS_ACCURACY_FILL_LAYER_ID)) {
        map.addLayer({
          id: GPS_ACCURACY_FILL_LAYER_ID,
          type: 'fill',
          source: GPS_ACCURACY_SOURCE_ID,
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.12,
          },
        });
      }

      if (!map.getLayer(GPS_ACCURACY_LINE_LAYER_ID)) {
        map.addLayer({
          id: GPS_ACCURACY_LINE_LAYER_ID,
          type: 'line',
          source: GPS_ACCURACY_SOURCE_ID,
          paint: {
            'line-color': '#3b82f6',
            'line-width': 1.5,
            'line-opacity': 0.45,
            'line-dasharray': [3, 2],
          },
        });
      }

      // Apply initial state
      applyHazardsData(map, hazardsRef.current);
      applyDangerZonesData(map, hazardsRef.current);
      applyBlockedRoadsData(map, blockedRoadsRef.current);
      applySafetyHubsData(map, safetyHubsRef.current);
      applyOperationalAreasData(map, operationalAreasRef.current);
      applyOperationalFacilitiesPointsData(map, operationalAreasRef.current);
      applyOperationalAreaDraft(
        map,
        drawingPointsRef.current,
        activeAreaDraftRef.current?.color || '#3b82f6'
      );
      applyDrawingPreview(map, drawingPointsRef.current);
      applySelectedRoadData(map, selectedRoadRef.current);
      applySectionPreview(map, sectionPreviewCoordsRef.current);
      applyGpsAccuracyCircle(
        map,
        liveLocationStateRef.current?.coordinate || null,
        liveLocationStateRef.current?.accuracyMeters || null
      );

      applyRoutesAndCandidates(
        map,
        routeResultRef.current,
        selectionResultRef.current,
        decisionRef.current,
        isDeveloperModeRef.current,
        startRef.current,
        destinationRef.current,
        remainingRouteCoordsRef.current
      );
      if (assessmentRef.current) {
        applyHazardOverlay(map, assessmentRef.current, isDeveloperModeRef.current);
      }


      // Hazard popup
      map.on('mousemove', HAZARDS_FILL_LAYER_ID, (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties as { name: string; severity: string; description: string };

        if (!popupRef.current) {
          popupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        }
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: inherit; font-size: 11.5px; color: #0f172a; padding: 2px 4px;">
              <strong style="color: #1e293b;">${props.name}</strong><br/>
              <span style="font-weight: 700; color: #475569;">Severity: ${props.severity}</span><br/>
              <span style="font-size: 10.5px; color: #64748b;">${props.description}</span>
            </div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', HAZARDS_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      });

      // -------------------------------------------------------------
      // Safety Hub & Operational Area Native Layer Interaction Listeners
      // -------------------------------------------------------------
      // 1. Cluster Zoom: Safety Hubs
      map.on('click', SAFETY_HUBS_CLUSTERS_LAYER_ID, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [SAFETY_HUBS_CLUSTERS_LAYER_ID] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId != null) {
          const source = map.getSource(SAFETY_HUBS_SAVED_SOURCE_ID) as any;
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            map.easeTo({
              center: (features[0].geometry as any).coordinates,
              zoom: Math.min(zoom + 0.5, 15),
              duration: 500,
            });
          });
        }
      });

      // 2. Cluster Zoom: Operational Facilities
      map.on('click', OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId != null) {
          const source = map.getSource(OPERATIONAL_FACILITIES_POINTS_SOURCE_ID) as any;
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            map.easeTo({
              center: (features[0].geometry as any).coordinates,
              zoom: Math.min(zoom + 0.8, 17),
              duration: 500,
            });
          });
        }
      });

      // 3. Popup: Safety Hub Click
      map.on('click', SAFETY_HUBS_UNCLUSTERED_LAYER_ID, (e) => {
        if (coordinatorModeRef.current !== 'none') return;
        const features = map.queryRenderedFeatures(e.point, { layers: [SAFETY_HUBS_UNCLUSTERED_LAYER_ID] });
        if (!features || features.length === 0) return;
        const hubId = features[0]?.properties?.id;
        const hub = safetyHubsRef.current.find((h) => h.id === hubId);
        if (!hub) return;

        const childAreas = operationalAreasRef.current.filter((a) => a.hubId === hub.id);

        if (activeFeaturePopupRef.current) {
          activeFeaturePopupRef.current.remove();
        }

        const popup = new Popup({
          offset: [0, -30],
          closeButton: true,
          closeOnClick: false,
          maxWidth: '340px',
          className: 'custom-hub-popup',
        })
          .setLngLat(hub.coordinate)
          .setHTML(createSafetyHubPopupHTML(hub, childAreas))
          .addTo(map);

        activeFeaturePopupRef.current = popup;

        setTimeout(() => {
          const btn = document.getElementById(`btn-popup-nav-${hub.id}`);
          if (btn) {
            btn.onclick = () => {
              if (onSelectSafetyHubDestinationRef.current) {
                onSelectSafetyHubDestinationRef.current(hub);
              }
              popup.remove();
            };
          }
          const addAreaBtn = document.getElementById(`btn-popup-add-area-${hub.id}`);
          if (addAreaBtn) {
            addAreaBtn.onclick = () => {
              if (onOpenAddOperationalAreaForHubRef.current) {
                onOpenAddOperationalAreaForHubRef.current(hub);
              }
              popup.remove();
            };
          }
        }, 50);
      });

      // 4. Popup: Operational Facility Point Click
      map.on('click', OPERATIONAL_FACILITIES_POINTS_LAYER_ID, (e) => {
        if (coordinatorModeRef.current !== 'none') return;
        const features = map.queryRenderedFeatures(e.point, { layers: [OPERATIONAL_FACILITIES_POINTS_LAYER_ID] });
        if (!features || features.length === 0) return;
        const areaId = features[0]?.properties?.id;
        const area = operationalAreasRef.current.find((a) => a.id === areaId);
        if (!area) return;

        if (activeFeaturePopupRef.current) {
          activeFeaturePopupRef.current.remove();
        }

        const popup = new Popup({
          offset: [0, -18],
          closeButton: true,
          closeOnClick: false,
          maxWidth: '300px',
          className: 'custom-hub-popup',
        })
          .setLngLat(area.coordinate)
          .setHTML(createOperationalAreaPopupHTML(area))
          .addTo(map);

        activeFeaturePopupRef.current = popup;

        setTimeout(() => {
          const editBtn = document.getElementById(`btn-popup-edit-area-${area.id}`);
          if (editBtn) {
            editBtn.onclick = () => {
              if (onEditOperationalAreaRef.current) {
                onEditOperationalAreaRef.current(area);
              }
              popup.remove();
            };
          }
        }, 50);
      });

      // 5. Popup: Operational Area Polygon Fill Click
      map.on('click', OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID, (e) => {
        if (coordinatorModeRef.current !== 'none') return;
        const features = map.queryRenderedFeatures(e.point, { layers: [OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID] });
        if (!features || features.length === 0) return;
        const areaId = features[0]?.properties?.id;
        const area = operationalAreasRef.current.find((a) => a.id === areaId);
        if (!area) return;

        if (activeFeaturePopupRef.current) {
          activeFeaturePopupRef.current.remove();
        }

        const popup = new Popup({
          offset: [0, -18],
          closeButton: true,
          closeOnClick: false,
          maxWidth: '300px',
          className: 'custom-hub-popup',
        })
          .setLngLat(e.lngLat)
          .setHTML(createOperationalAreaPopupHTML(area))
          .addTo(map);

        activeFeaturePopupRef.current = popup;

        setTimeout(() => {
          const editBtn = document.getElementById(`btn-popup-edit-area-${area.id}`);
          if (editBtn) {
            editBtn.onclick = () => {
              if (onEditOperationalAreaRef.current) {
                onEditOperationalAreaRef.current(area);
              }
              popup.remove();
            };
          }
        }, 50);
      });

      // 6. Hover Pointer for all interactive layers
      const interactiveLayerIds = [
        SAFETY_HUBS_CLUSTERS_LAYER_ID,
        SAFETY_HUBS_UNCLUSTERED_LAYER_ID,
        OPERATIONAL_FACILITIES_CLUSTERS_LAYER_ID,
        OPERATIONAL_FACILITIES_POINTS_LAYER_ID,
        OPERATIONAL_AREAS_SAVED_FILL_LAYER_ID,
      ];

      interactiveLayerIds.forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          if (coordinatorModeRef.current === 'none') {
            map.getCanvas().style.cursor = 'pointer';
          }
        });
        map.on('mouseleave', layerId, () => {
          if (coordinatorModeRef.current === 'none') {
            map.getCanvas().style.cursor = '';
          }
        });
      });

      // -------------------------------------------------------------
      // Interactive Road Hover Highlighting in Block Road modes
      // -------------------------------------------------------------
      let hoverThrottled = false;
      map.on('mousemove', (e) => {
        if (hoverThrottled) return;
        hoverThrottled = true;
        setTimeout(() => {
          hoverThrottled = false;
        }, 35);

        const mode = coordinatorModeRef.current;
        const hoverSrc = map.getSource(HOVER_ROAD_SOURCE_ID) as GeoJSONSource | undefined;
        if (!hoverSrc) return;

        if (mode === 'section_select_road' || mode === 'select_road_to_block') {
          const coords = getHoverRoadGeometry(map, e.point, [e.lngLat.lng, e.lngLat.lat]);
          if (coords && coords.length >= 2) {
            map.getCanvas().style.cursor = 'crosshair';
            hoverSrc.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates: coords },
                },
              ],
            });
          } else {
            map.getCanvas().style.cursor = '';
            hoverSrc.setData({ type: 'FeatureCollection', features: [] });
          }
        } else {
          hoverSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      });
    });

    let isMapPanning = false;
    let mouseDownScreenPoint: { x: number; y: number } | null = null;
    let lastClickTime = 0;

    map.on('mousedown', (e) => {
      mouseDownScreenPoint = { x: e.point.x, y: e.point.y };
      isMapPanning = false;
    });

    map.on('touchstart', (e) => {
      if (e.points && e.points.length > 0) {
        mouseDownScreenPoint = { x: e.points[0].x, y: e.points[0].y };
      }
      isMapPanning = false;
    });

    map.on('movestart', () => {
      isMapPanning = true;
    });

    map.on('dragstart', () => {
      if (liveLocationStateRef.current?.isFollowMe && onDisableFollowMeRef.current) {
        onDisableFollowMeRef.current();
      }
    });

    map.on('moveend', () => {
      // Keep isMapPanning briefly so a click event immediately resolving right after pan is ignored
      setTimeout(() => {
        isMapPanning = false;
      }, 90);
    });

    map.on('click', (e: MapMouseEvent) => {
      // If currently dragging a closure handle or route marker, or just released, ignore map clicks
      if (activeDraggingHandleRef.current || activeDraggingPointRef.current || justFinishedDraggingRef.current) return;

      // If map was actively panning, ignore click
      if (isMapPanning) return;

      // If pointer moved more than 5px between mousedown and mouseup, consider it a pan
      if (mouseDownScreenPoint) {
        const distMoved = Math.hypot(e.point.x - mouseDownScreenPoint.x, e.point.y - mouseDownScreenPoint.y);
        if (distMoved > 5) return;
      }

      // Debounce duplicate rapid clicks
      const now = Date.now();
      if (now - lastClickTime < 100) return;
      lastClickTime = now;

      const clickedLngLat: Coordinate = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];

      const currentInteractionMode = interactionModeRef.current || 'EXPLORE';

      // HARD RULE: In default EXPLORE mode, clicks on empty map do NOTHING!
      // (Feature popups for hubs/facilities/hazards are handled by their own layer click listeners)
      if (currentInteractionMode === 'EXPLORE') {
        return;
      }

      // Coordinator: Select Road to Block Section
      if (currentInteractionMode === 'BLOCK_ROAD_SECTION' || coordinatorModeRef.current === 'section_select_road') {
        identifyRoadFromMapClick({
          map,
          point: e.point,
          clickedLngLat,
          isDevMode: isDeveloperModeRef.current,
        }).then((result) => {
          if (result.candidateRoads.length > 1) {
            // Show compact intersection disambiguation popup
            setIntersectionMenu({
              roads: result.candidateRoads,
              clickedCoord: clickedLngLat,
              screenPos: { x: e.point.x, y: e.point.y },
            });
          } else if (onSelectRoadForSectionRef.current) {
            onSelectRoadForSectionRef.current(result.road, clickedLngLat);
          }
        });
        return;
      }

      // Coordinator: Block Entire Road click detection with spatial tolerance & real map features
      if (currentInteractionMode === 'BLOCK_ROAD' || coordinatorModeRef.current === 'select_road_to_block') {
        identifyRoadFromMapClick({
          map,
          point: e.point,
          clickedLngLat,
          isDevMode: isDeveloperModeRef.current,
        }).then((result) => {
          if (result.candidateRoads.length > 1) {
            // Show compact intersection popup for entire road blocking
            setIntersectionMenu({
              roads: result.candidateRoads,
              clickedCoord: clickedLngLat,
              screenPos: { x: e.point.x, y: e.point.y },
            });
          } else if (result.road) {
            const roadId = `ROAD-BLOCK-${Date.now().toString(36).toUpperCase().slice(-5)}`;
            const newRoad: BlockedRoad = {
              id: roadId,
              name: `${result.road.name} (Full Road Closure)`,
              status: 'BLOCKED',
              reason: 'Emergency road closure by Coordinator',
              geometry: result.road.geometry,
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            if (onSelectRoadToBlockRef.current) {
              onSelectRoadToBlockRef.current(newRoad);
            }
          } else {
            // Fallback to active route segment if clicked near route
            const activeCoords = (decisionRef.current?.selectedRoute?.coordinates || routeResultRef.current?.coordinates) || [];
            let bestSeg: [Coordinate, Coordinate] | null = null;
            let minDist = Infinity;

            if (activeCoords.length >= 2) {
              for (let i = 0; i < activeCoords.length - 1; i++) {
                const dist = pointToSegmentDistanceMeters(clickedLngLat, activeCoords[i], activeCoords[i + 1]);
                if (dist < minDist) {
                  minDist = dist;
                  bestSeg = [activeCoords[i], activeCoords[i + 1]];
                }
              }
            }

            const segCoords: Coordinate[] = (minDist <= 150 && bestSeg)
              ? [bestSeg[0], bestSeg[1]]
              : [
                  [Number((clickedLngLat[0] - 0.0012).toFixed(6)), Number((clickedLngLat[1] - 0.0006).toFixed(6))],
                  clickedLngLat,
                  [Number((clickedLngLat[0] + 0.0012).toFixed(6)), Number((clickedLngLat[1] + 0.0006).toFixed(6))],
                ];

            const roadId = `ROAD-BLOCK-${Date.now().toString(36).toUpperCase().slice(-5)}`;
            const newRoad: BlockedRoad = {
              id: roadId,
              name: `Road Segment near [${clickedLngLat[1].toFixed(4)}, ${clickedLngLat[0].toFixed(4)}]`,
              status: 'BLOCKED',
              reason: 'Emergency road closure by Coordinator',
              geometry: {
                type: 'LineString',
                coordinates: segCoords,
              },
              isActive: true,
              createdAt: new Date().toISOString(),
            };

            if (onSelectRoadToBlockRef.current) {
              onSelectRoadToBlockRef.current(newRoad);
            }
          }
        });
        return;
      }

      // Coordinator: Select Public Facility for Safety Hub Creation
      if (currentInteractionMode === 'SAFETY_HUB_FACILITY_PICK' || coordinatorModeRef.current === 'select_safety_hub_location') {
        identifyFacilityFromMapClick({
          map,
          point: e.point,
          clickedLngLat,
          isDevMode: isDeveloperModeRef.current,
        }).then((result) => {
          if (result.potentialHub && onSelectPotentialSafetyHubRef.current) {
            onSelectPotentialSafetyHubRef.current(result.potentialHub);
          }
        });
        return;
      }

      // Coordinator: Place Operational Area Point Marker
      if (currentInteractionMode === 'FACILITY_POINT' || coordinatorModeRef.current === 'place_operational_area_point') {
        if (onSavePlacedOperationalAreaPointRef.current) {
          onSavePlacedOperationalAreaPointRef.current(clickedLngLat);
        }
        return;
      }

      // Delegate all active tool map clicks (PLACE_START, PLACE_DESTINATION, SAFETY_HUB_AREA, SAFETY_HUB_POINT, SAFETY_HUB_ENTRANCE, FACILITY_AREA, HAZARD_AREA, DANGER_AREA)
      onMapClickRef.current(clickedLngLat);
    });

    mapRef.current = map;

    return () => {
      if (startMarkerRef.current) startMarkerRef.current.remove();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (startHandleMarkerRef.current) startHandleMarkerRef.current.remove();
      if (endHandleMarkerRef.current) endHandleMarkerRef.current.remove();
      if (gpsMarkerRef.current) gpsMarkerRef.current.remove();
      if (popupRef.current) popupRef.current.remove();
      if (activeFeaturePopupRef.current) activeFeaturePopupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Manage Start Marker (Draggable)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (start) {
      if (!startMarkerRef.current) {
        const el = createMarkerElement('start');
        const marker = new Marker({
          element: el,
          anchor: 'bottom',
          draggable: !isRoutePointsLocked,
        })
          .setLngLat(start)
          .addTo(map);

        attachMarkerDragListeners('start', marker, el);
        startMarkerRef.current = marker;
      } else {
        startMarkerRef.current.setDraggable(!isRoutePointsLocked);
        if (activeDraggingPointRef.current !== 'start') {
          startMarkerRef.current.setLngLat(start);
        }
        const markerEl = startMarkerRef.current.getElement();
        markerEl.style.cursor = isRoutePointsLocked ? 'pointer' : 'grab';
        if (!markerEl.parentElement) {
          startMarkerRef.current.addTo(map);
        }
      }
    } else if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
  }, [start, isRoutePointsLocked]);

  // 3. Manage Destination Marker (Draggable)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (destination) {
      if (!destinationMarkerRef.current) {
        const el = createMarkerElement('destination');
        const marker = new Marker({
          element: el,
          anchor: 'bottom',
          draggable: !isRoutePointsLocked,
        })
          .setLngLat(destination)
          .addTo(map);

        attachMarkerDragListeners('destination', marker, el);
        destinationMarkerRef.current = marker;
      } else {
        destinationMarkerRef.current.setDraggable(!isRoutePointsLocked);
        if (activeDraggingPointRef.current !== 'destination') {
          destinationMarkerRef.current.setLngLat(destination);
        }
        const markerEl = destinationMarkerRef.current.getElement();
        markerEl.style.cursor = isRoutePointsLocked ? 'pointer' : 'grab';
        if (!markerEl.parentElement) {
          destinationMarkerRef.current.addTo(map);
        }
      }
    } else if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
  }, [destination, isRoutePointsLocked]);

  // 3B. Manage Closure Start Handle Marker (Draggable with Pointer Capture)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedRoad && sectionStartCoord) {
      if (!startHandleMarkerRef.current) {
        const el = createClosureHandleElement('start');
        const marker = new Marker({ element: el, draggable: false, anchor: 'center' })
          .setLngLat(sectionStartCoord)
          .addTo(map);

        attachHandlePointerDrag('start', el, startHandleMarkerRef);
        startHandleMarkerRef.current = marker;
      } else {
        if (activeDraggingHandleRef.current !== 'start') {
          startHandleMarkerRef.current.setLngLat(sectionStartCoord);
        }
      }
    } else if (startHandleMarkerRef.current) {
      startHandleMarkerRef.current.remove();
      startHandleMarkerRef.current = null;
    }
  }, [selectedRoad, sectionStartCoord]);

  // 3C. Manage Closure End Handle Marker (Draggable with Pointer Capture)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedRoad && sectionEndCoord) {
      if (!endHandleMarkerRef.current) {
        const el = createClosureHandleElement('end');
        const marker = new Marker({ element: el, draggable: false, anchor: 'center' })
          .setLngLat(sectionEndCoord)
          .addTo(map);

        attachHandlePointerDrag('end', el, endHandleMarkerRef);
        endHandleMarkerRef.current = marker;
      } else {
        if (activeDraggingHandleRef.current !== 'end') {
          endHandleMarkerRef.current.setLngLat(sectionEndCoord);
        }
      }
    } else if (endHandleMarkerRef.current) {
      endHandleMarkerRef.current.remove();
      endHandleMarkerRef.current = null;
    }
  }, [selectedRoad, sectionEndCoord]);

  // 3E. Manage GPS Live Location Marker & Accuracy Circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coord = liveLocationState?.coordinate;
    const isGpsActive = Boolean(
      coord &&
        (liveLocationState?.status === 'ACTIVE' || liveLocationState?.status === 'REQUESTING')
    );

    if (isGpsActive && coord) {
      console.log('[GPS] RoutingMap received location:', coord);
      if (!gpsMarkerRef.current) {
        const el = createGpsMarkerElement();
        gpsMarkerRef.current = new Marker({ element: el, anchor: 'center' })
          .setLngLat(coord)
          .addTo(map);
      } else {
        gpsMarkerRef.current.setLngLat(coord);
        const markerEl = gpsMarkerRef.current.getElement();
        if (!markerEl.parentElement) {
          gpsMarkerRef.current.addTo(map);
        }
      }

      // Update heading rotation if available
      const markerEl = gpsMarkerRef.current.getElement();
      const headingCone = markerEl.querySelector('.gps-heading-cone') as HTMLElement | null;
      if (headingCone) {
        if (
          liveLocationState?.headingDegrees !== null &&
          liveLocationState?.headingDegrees !== undefined &&
          !isNaN(liveLocationState.headingDegrees)
        ) {
          headingCone.style.display = 'block';
          headingCone.style.transform = `rotate(${liveLocationState.headingDegrees}deg)`;
        } else {
          headingCone.style.display = 'none';
        }
      }

      console.log('[GPS] Marker updated:', coord);

      if (liveLocationState?.isFollowMe) {
        map.easeTo({ center: coord, duration: 600 });
      }
    } else if (gpsMarkerRef.current) {
      gpsMarkerRef.current.remove();
      gpsMarkerRef.current = null;
    }

    if (map.getSource(GPS_ACCURACY_SOURCE_ID)) {
      applyGpsAccuracyCircle(
        map,
        isGpsActive && coord ? coord : null,
        liveLocationState?.accuracyMeters || null
      );
    }
  }, [liveLocationState, applyGpsAccuracyCircle]);

  // 3F. Recenter Camera to GPS
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !recenterTrigger) return;
    const coord = liveLocationState?.coordinate;
    if (coord) {
      map.flyTo({
        center: coord,
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 800,
      });
    }
  }, [recenterTrigger, liveLocationState?.coordinate]);

  // 3G. Sync Safety Hubs to MapLibre GeoJSON Source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SAFETY_HUBS_SAVED_SOURCE_ID)) {
      applySafetyHubsData(map, safetyHubs);
    }
  }, [safetyHubs, applySafetyHubsData]);

  // 3G-2. Manage Draft Safety Hub Point Marker on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (draftSafetyHubPoint) {
      if (!draftHubMarkerRef.current) {
        const el = createDraftSafetyHubMarkerElement();
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat(draftSafetyHubPoint)
          .addTo(map);
        draftHubMarkerRef.current = marker;
      } else {
        draftHubMarkerRef.current.setLngLat(draftSafetyHubPoint);
        const markerEl = draftHubMarkerRef.current.getElement();
        if (!markerEl.parentElement) {
          draftHubMarkerRef.current.addTo(map);
        }
      }
    } else if (draftHubMarkerRef.current) {
      draftHubMarkerRef.current.remove();
      draftHubMarkerRef.current = null;
    }
  }, [draftSafetyHubPoint]);

  // 3G-3. Manage Draft Entrance / Access Point Marker on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (draftEntranceCoord) {
      if (!draftEntranceMarkerRef.current) {
        const el = createDraftEntranceMarkerElement();
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat(draftEntranceCoord)
          .addTo(map);
        draftEntranceMarkerRef.current = marker;
      } else {
        draftEntranceMarkerRef.current.setLngLat(draftEntranceCoord);
        const markerEl = draftEntranceMarkerRef.current.getElement();
        if (!markerEl.parentElement) {
          draftEntranceMarkerRef.current.addTo(map);
        }
      }
    } else if (draftEntranceMarkerRef.current) {
      draftEntranceMarkerRef.current.remove();
      draftEntranceMarkerRef.current = null;
    }
  }, [draftEntranceCoord]);

  // 3G-4. Manage Draft Safety Hub Polygon Source on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SAFETY_HUB_DRAFT_SOURCE_ID)) {
      const polyToRender =
        draftSafetyHubPolygon && draftSafetyHubPolygon.length >= 3
          ? draftSafetyHubPolygon
          : coordinatorMode === 'draw_safety_hub'
          ? drawingPoints
          : [];
      applySafetyHubDraft(map, polyToRender);
    }
  }, [draftSafetyHubPolygon, coordinatorMode, drawingPoints, applySafetyHubDraft]);

  // 3H. Sync Operational Areas to MapLibre GeoJSON Sources (Polygons & Clustered Points)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(OPERATIONAL_AREAS_SAVED_SOURCE_ID)) {
      applyOperationalAreasData(map, operationalAreas);
    }
    if (map.getSource(OPERATIONAL_FACILITIES_POINTS_SOURCE_ID)) {
      applyOperationalFacilitiesPointsData(map, operationalAreas);
    }
  }, [operationalAreas, applyOperationalAreasData, applyOperationalFacilitiesPointsData]);

  // 3I. Update Operational Area Draft Drawing Geometry dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(OPERATIONAL_AREA_DRAFT_SOURCE_ID)) {
      if (coordinatorMode === 'draw_operational_area') {
        applyOperationalAreaDraft(map, drawingPoints, activeAreaDraft?.color || '#3b82f6');
      } else {
        applyOperationalAreaDraft(map, []);
      }
    }
  }, [coordinatorMode, drawingPoints, activeAreaDraft, applyOperationalAreaDraft]);

  // 3J. Update Safety Hub Draft Drawing Geometry dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SAFETY_HUB_DRAFT_SOURCE_ID)) {
      if (coordinatorMode === 'draw_safety_hub') {
        applySafetyHubDraft(map, drawingPoints);
      } else {
        applySafetyHubDraft(map, []);
      }
    }
  }, [coordinatorMode, drawingPoints, applySafetyHubDraft]);

  // 3D. Update Selected Road Layer Highlight dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SELECTED_ROAD_SOURCE_ID)) {
      applySelectedRoadData(map, selectedRoad);
    }
  }, [selectedRoad, applySelectedRoadData]);

  // 3D. Update Road Section Preview Line dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(SECTION_PREVIEW_SOURCE_ID)) {
      applySectionPreview(map, sectionPreviewCoords);
    }
  }, [sectionPreviewCoords, applySectionPreview]);

  // 3K. Manage Incidents / SOS HTML Markers on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing incident markers
    incidentsMarkersRef.current.forEach((m) => m.remove());
    incidentsMarkersRef.current = [];

    const showIncidents = visibleLayers ? visibleLayers.incidents !== false : true;
    if (!showIncidents || !incidents || incidents.length === 0) return;

    incidents.forEach((inc) => {
      const coord = toLngLat(inc.location.coordinate);
      if (!coord) return;
      const isCritical = inc.severity === 'CRITICAL';
      const isOpen = inc.status === 'OPEN' || inc.status === 'ACKNOWLEDGED';
      const bg = isCritical ? '#ef4444' : '#f59e0b';
      const el = document.createElement('div');
      el.className = `rme-map-pin-marker rme-incident-pin incident-${inc.severity.toLowerCase()} ${isOpen && isCritical ? 'pulse-sos' : ''}`;
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="rme-map-pin-inner">
          <div class="rme-map-pin-badge" style="background: ${bg}; color: #ffffff; padding: 3px 7px; border-radius: 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; border: 2px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <span>${isCritical ? '⚠️' : '🚨'}</span>
            <span>${inc.id}</span>
          </div>
          <div class="rme-map-pin-stem" style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${bg}; margin-top: -1px;"></div>
        </div>
      `;

      const popup = new Popup({ offset: [0, -28], closeButton: true, className: 'rme-custom-map-popup' })
        .setHTML(`
          <div style="background: #0f172a; color: #f8fafc; padding: 10px; border-radius: 6px; font-family: sans-serif; font-size: 12px; line-height: 1.4; border: 1px solid #334155; min-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: ${isCritical ? '#ef4444' : '#f59e0b'}; font-size: 13px;">${inc.id}</strong>
              <span style="background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${inc.status}</span>
            </div>
            <div style="font-weight: 600; color: #e2e8f0;">${inc.citizenName}</div>
            <div style="color: #94a3b8; font-size: 11px;">${inc.type.replace(/_/g, ' ')}</div>
            <div style="color: #64748b; font-size: 10px; margin-top: 4px;">${inc.location.landmark || inc.location.address || ''}</div>
            ${inc.notes ? `<div style="margin-top: 6px; font-size: 11px; color: #cbd5e1; font-style: italic;">"${inc.notes}"</div>` : ''}
          </div>
        `);

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coord)
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        if (onSelectIncidentRef.current) {
          onSelectIncidentRef.current(inc);
        }
      });

      incidentsMarkersRef.current.push(marker);
    });
  }, [incidents, visibleLayers?.incidents]);

  // 3L. Manage Responders HTML Markers on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing responder markers
    respondersMarkersRef.current.forEach((m) => m.remove());
    respondersMarkersRef.current = [];

    const showResponders = visibleLayers ? visibleLayers.responders !== false : true;
    if (!showResponders || !responders || responders.length === 0) return;

    responders.forEach((resp) => {
      const coord = toLngLat(resp.currentGpsPosition);
      if (!coord) return;
      const isAvailable = resp.status === 'AVAILABLE';
      const isBusy = resp.status === 'BUSY' || resp.status === 'EN_ROUTE' || resp.status === 'ON_SCENE';
      const bg = isAvailable ? '#10b981' : isBusy ? '#f59e0b' : '#64748b';

      const el = document.createElement('div');
      el.className = `rme-map-pin-marker rme-responder-pin responder-${resp.status.toLowerCase()}`;
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="rme-map-pin-inner">
          <div class="rme-map-pin-badge" style="background: ${bg}; color: #ffffff; padding: 3px 7px; border-radius: 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; border: 2px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <span>🚑</span>
            <span>${resp.id}</span>
          </div>
          <div class="rme-map-pin-stem" style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid ${bg}; margin-top: -1px;"></div>
        </div>
      `;

      const popup = new Popup({ offset: [0, -28], closeButton: true, className: 'rme-custom-map-popup' })
        .setHTML(`
          <div style="background: #0f172a; color: #f8fafc; padding: 10px; border-radius: 6px; font-family: sans-serif; font-size: 12px; line-height: 1.4; border: 1px solid #334155; min-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #38bdf8; font-size: 13px;">${resp.name}</strong>
              <span style="background: ${bg}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">${resp.status}</span>
            </div>
            <div style="color: #94a3b8; font-size: 11px;">${resp.unitCode} • ${resp.organization}</div>
            <div style="color: #64748b; font-size: 10px; margin-top: 4px;">${resp.stationName}</div>
            <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">📞 ${resp.contactNumber}</div>
          </div>
        `);

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coord)
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        if (onSelectResponderRef.current) {
          onSelectResponderRef.current(resp);
        }
      });

      respondersMarkersRef.current.push(marker);
    });
  }, [responders, visibleLayers?.responders]);

  // 3M. Sync Layer Visibility with visibleLayers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !visibleLayers) return;

    const setVisibility = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    // Hazards
    setVisibility(HAZARDS_FILL_LAYER_ID, visibleLayers.hazards !== false);
    setVisibility(HAZARDS_LINE_LAYER_ID, visibleLayers.hazards !== false);
    setVisibility(DANGER_ZONES_FILL_LAYER_ID, visibleLayers.hazards !== false);
    setVisibility(DANGER_ZONES_LINE_LAYER_ID, visibleLayers.hazards !== false);

    // Blocked Roads
    setVisibility(BLOCKED_ROADS_LAYER_ID, visibleLayers.blockedRoads !== false);
    setVisibility(BLOCKED_ROADS_CASING_ID, visibleLayers.blockedRoads !== false);

    // Safety Hubs
    setVisibility(SAFETY_HUBS_CLUSTERS_LAYER_ID, visibleLayers.safetyHubs !== false);
    setVisibility(SAFETY_HUBS_UNCLUSTERED_LAYER_ID, visibleLayers.safetyHubs !== false);
    setVisibility(SAFETY_HUBS_LABELS_LAYER_ID, visibleLayers.safetyHubs !== false);
    setVisibility(SAFETY_HUBS_POLYGONS_FILL_LAYER_ID, visibleLayers.safetyHubs !== false);
    setVisibility(SAFETY_HUBS_POLYGONS_LINE_LAYER_ID, visibleLayers.safetyHubs !== false);
  }, [visibleLayers]);

  // 4. Update Hazards & Danger Zones dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(HAZARDS_SOURCE_ID)) {
      applyHazardsData(map, hazards);
      applyDangerZonesData(map, hazards);
    }
  }, [hazards, applyHazardsData, applyDangerZonesData]);

  // 5. Update Blocked Roads dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(BLOCKED_ROADS_SOURCE_ID)) {
      applyBlockedRoadsData(map, blockedRoads);
    }
  }, [blockedRoads, applyBlockedRoadsData]);

  // 6. Update Drawing Preview dynamically
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getSource(DRAWING_SOURCE_ID)) {
      applyDrawingPreview(map, drawingPoints);
    }
  }, [drawingPoints, applyDrawingPreview]);

  // 7. Update Route and Candidates whenever decision, routeResult, selectionResult, or remainingRouteCoords changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getSource(ROUTE_SOURCE_ID) && map.getSource(CANDIDATES_SOURCE_ID)) {
      applyRoutesAndCandidates(map, routeResult, selectionResult, decision, isDeveloperMode, start, destination, remainingRouteCoords);
    } else {
      map.once('load', () => applyRoutesAndCandidates(map, routeResult, selectionResult, decision, isDeveloperMode, start, destination, remainingRouteCoords));
    }
  }, [routeResult, selectionResult, decision, isDeveloperMode, start, destination, remainingRouteCoords, applyRoutesAndCandidates]);

  // 8. Update Hazard Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeOverlay = decision !== undefined
      ? (decision?.selectedRoute?.safetyAssessment || decision?.finalSafety || decision?.initialSafety || null)
      : assessment;

    if (map.getSource(HAZARD_OVERLAY_SOURCE_ID)) {
      applyHazardOverlay(map, activeOverlay, isDeveloperMode);
    } else {
      map.once('load', () => applyHazardOverlay(map, activeOverlay, isDeveloperMode));
    }
  }, [assessment, decision, isDeveloperMode, applyHazardOverlay]);

  // 9. Focus / Locate feature on map when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedFeatureCoords || focusedFeatureCoords.length === 0) return;

    const bounds = new LngLatBounds();
    focusedFeatureCoords.forEach((coord) => bounds.extend(coord));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 140,
        maxZoom: 16,
        duration: 900,
      });
    }
  }, [focusedFeatureCoords]);

  // 10. Explicit route camera fitting - only fires when fitRouteTrigger changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRouteTrigger) return;
    if (coordinatorMode !== 'none' || activeDraggingPointRef.current !== null) return;

    const bounds = new LngLatBounds();
    let hasCoords = false;
    if (start) {
      bounds.extend(start);
      hasCoords = true;
    }
    if (destination) {
      bounds.extend(destination);
      hasCoords = true;
    }
    if (decision?.selectedRoute?.coordinates) {
      decision.selectedRoute.coordinates.forEach((c: Coordinate) => bounds.extend(c));
      hasCoords = true;
    } else if (routeResult?.coordinates) {
      routeResult.coordinates.forEach((c: Coordinate) => bounds.extend(c));
      hasCoords = true;
    }

    if (hasCoords && !bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 100,
        maxZoom: 16,
        duration: 800,
      });
    }
  }, [fitRouteTrigger, start, destination, decision, routeResult, coordinatorMode]);


  const handlePickIntersectionRoad = (road: OperationalRoad) => {
    if (!intersectionMenu) return;
    const coord = intersectionMenu.clickedCoord;
    setIntersectionMenu(null);
    if (coordinatorModeRef.current === 'select_road_to_block') {
      const roadId = `ROAD-BLOCK-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const newRoad: BlockedRoad = {
        id: roadId,
        name: `${road.name} (Full Road Closure)`,
        status: 'BLOCKED',
        reason: 'Emergency road closure by Coordinator',
        geometry: road.geometry,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      if (onSelectRoadToBlockRef.current) {
        onSelectRoadToBlockRef.current(newRoad);
      }
    } else if (onSelectRoadForSectionRef.current) {
      onSelectRoadForSectionRef.current(road, coord);
    }
  };

  return (
    <div className="map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainerRef}
        id="maplibre-container"
        className={`map-container cursor-${interactionMode.toLowerCase()} ${interactionMode !== 'EXPLORE' ? `mode-${interactionMode.toLowerCase()}` : 'mode-explore'}`}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Intersection Selection Menu for ambiguous crossroads */}
      {intersectionMenu && (
        <div
          className="intersection-select-popup"
          style={{
            position: 'absolute',
            left: `${Math.min(window.innerWidth - 270, Math.max(16, intersectionMenu.screenPos.x - 120))}px`,
            top: `${Math.max(16, intersectionMenu.screenPos.y - 140)}px`,
            zIndex: 120,
            backgroundColor: '#0f172a',
            border: '1.5px solid #3b82f6',
            borderRadius: '8px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.7)',
            padding: '10px 12px',
            minWidth: '240px',
            maxWidth: '320px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#93c5fd', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
              SELECT ROAD AT INTERSECTION
            </span>
            <button
              onClick={() => setIntersectionMenu(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
              title="Close menu"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {intersectionMenu.roads.map((r, idx) => (
              <button
                key={r.id || idx}
                onClick={() => handlePickIntersectionRoad(r)}
                style={{
                  textAlign: 'left',
                  padding: '7px 10px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#f8fafc',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                  e.currentTarget.style.borderColor = '#60a5fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.borderColor = '#334155';
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="map-legend-panel">
        <div className="legend-title">DISASTER ROUTING LAYERS</div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-swatch swatch-route-safe" style={{ background: '#2563eb' }}></span>
            <span className="legend-text">Safe Route (Blue)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-route-avail" style={{ background: '#16a34a' }}></span>
            <span className="legend-text">Safest Available (Green)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-route-fallback" style={{ background: '#ec4899' }}></span>
            <span className="legend-text">Unsafe Fallback (Pink)</span>
          </div>
          {isDeveloperMode && (
            <div className="legend-item">
              <span className="legend-swatch swatch-candidate"></span>
              <span className="legend-text">Alternative Candidate</span>
            </div>
          )}
          <div className="legend-item">
            <span className="legend-swatch swatch-safe"></span>
            <span className="legend-text">Safe Assembly Zone</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-moderate"></span>
            <span className="legend-text">Moderate Hazard Zone</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-high"></span>
            <span className="legend-text">High Hazard Zone</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-critical"></span>
            <span className="legend-text">Critical Evacuation Zone</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-blocked"></span>
            <span className="legend-text">Blocked Road Closure</span>
          </div>
        </div>
      </div>
    </div>
  );
};
