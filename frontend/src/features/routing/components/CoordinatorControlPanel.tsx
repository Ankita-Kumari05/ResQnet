import React, { useState, useRef, useEffect } from 'react';

export type CoordinatorMode =
  | 'none'
  | 'draw_hazard'
  | 'draw_danger_zone'
  | 'select_road_to_block'
  | 'section_select_road'
  | 'section_adjust_handles'
  | 'select_safety_hub_location'
  | 'draw_safety_hub'
  | 'place_safety_hub_point'
  | 'set_safety_hub_entrance'
  | 'draw_operational_area'
  | 'place_operational_area_point';

interface CoordinatorControlPanelProps {
  coordinatorMode: CoordinatorMode;
  onSetCoordinatorMode: (mode: CoordinatorMode) => void;
  drawingPointsCount: number;
  onUndoPoint: () => void;
  onCompleteDrawing: () => void;
  onCancelDrawing: () => void;
  onOpenManageDrawer: () => void;
  onOpenCreateHubChoice?: () => void;
  onOpenCreateOperationalArea?: () => void;
  activeHazardsCount: number;
  activeDangerZonesCount: number;
  activeBlockedRoadsCount: number;
  activeSafetyHubsCount?: number;
  activeOperationalAreasCount?: number;
  activeAreaDraftMeta?: {
    hubName: string;
    name: string;
    type: string;
    color?: string;
  } | null;
  sectionRoadName?: string;
  sectionRoadId?: string;
  sectionLengthMeters?: number;
  onConfirmSectionHandles?: () => void;
  sectionErrorMessage?: string | null;
}

export const CoordinatorControlPanel: React.FC<CoordinatorControlPanelProps> = ({
  coordinatorMode,
  onSetCoordinatorMode,
  drawingPointsCount,
  onUndoPoint,
  onCompleteDrawing,
  onCancelDrawing,
  onOpenManageDrawer,
  onOpenCreateHubChoice,
  onOpenCreateOperationalArea,
  activeHazardsCount,
  activeDangerZonesCount,
  activeBlockedRoadsCount,
  activeSafetyHubsCount = 0,
  activeOperationalAreasCount = 0,
  activeAreaDraftMeta = null,
  sectionRoadName,
  sectionRoadId,
  sectionLengthMeters,
  onConfirmSectionHandles,
  sectionErrorMessage,
}) => {
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState<boolean>(false);
  const blockMenuRef = useRef<HTMLDivElement>(null);

  const isDrawingHazard = coordinatorMode === 'draw_hazard';
  const isDrawingDanger = coordinatorMode === 'draw_danger_zone';
  const isDrawingSafetyHub = coordinatorMode === 'draw_safety_hub';
  const isPlacingSafetyHubPoint = coordinatorMode === 'place_safety_hub_point';
  const isSettingHubEntrance = coordinatorMode === 'set_safety_hub_entrance';
  const isDrawingOperationalArea = coordinatorMode === 'draw_operational_area';
  const isPlacingOperationalAreaPoint = coordinatorMode === 'place_operational_area_point';
  const isDrawing = isDrawingHazard || isDrawingDanger;
  const isSelectingEntireRoad = coordinatorMode === 'select_road_to_block';
  const isSelectingSectionRoad = coordinatorMode === 'section_select_road';
  const isAdjustingHandles = coordinatorMode === 'section_adjust_handles';
  const isSelectingSafetyHub = coordinatorMode === 'select_safety_hub_location';
  const isSectionMode = isSelectingSectionRoad || isAdjustingHandles;

  const isAnySafetyHubMode =
    isSelectingSafetyHub || isDrawingSafetyHub || isPlacingSafetyHubPoint || isSettingHubEntrance;

  const totalControls =
    activeHazardsCount +
    activeDangerZonesCount +
    activeBlockedRoadsCount +
    (activeSafetyHubsCount || 0) +
    (activeOperationalAreasCount || 0);

  // Close block menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target as Node)) {
        setIsBlockMenuOpen(false);
      }
    };
    if (isBlockMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isBlockMenuOpen]);

  const handleToggleBlockMenu = () => {
    if (isSelectingEntireRoad || isSectionMode) {
      onCancelDrawing();
    } else {
      setIsBlockMenuOpen((prev) => !prev);
    }
  };

  const handleSelectEntireRoad = () => {
    setIsBlockMenuOpen(false);
    onSetCoordinatorMode('select_road_to_block');
  };

  const handleSelectSectionBlock = () => {
    setIsBlockMenuOpen(false);
    onSetCoordinatorMode('section_select_road');
  };

  const formattedSectionLength =
    sectionLengthMeters !== undefined && sectionLengthMeters !== null
      ? sectionLengthMeters >= 1000
        ? `${(sectionLengthMeters / 1000).toFixed(2)} km`
        : `${Math.round(sectionLengthMeters)} m`
      : '0 m';

  return (
    <>
      {/* Primary Floating Emergency Operations Toolbar */}
      <div className="coordinator-toolbar-container" id="coordinator-toolbar">
        <div className="coordinator-toolbar-header">
          <div className="toolbar-status-dot"></div>
          <span className="toolbar-title">OPERATIONAL CONTROLS</span>
        </div>

        <div className="coordinator-buttons-group">
          {/* Action 1: Add Hazard */}
          <button
            type="button"
            className={`btn-coord-tool btn-tool-hazard ${isDrawingHazard ? 'active' : ''}`}
            id="btn-coord-add-hazard"
            onClick={() => {
              setIsBlockMenuOpen(false);
              onSetCoordinatorMode(isDrawingHazard ? 'none' : 'draw_hazard');
            }}
            title="Draw a polygon hazard zone (Flood, Fire, Debris, Collapse) on the map"
          >
            <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10 8V12M10 14.5V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="tool-label">+ HAZARD</span>
          </button>

          {/* Action 2: Add Danger Zone */}
          <button
            type="button"
            className={`btn-coord-tool btn-tool-danger ${isDrawingDanger ? 'active' : ''}`}
            id="btn-coord-add-danger"
            onClick={() => {
              setIsBlockMenuOpen(false);
              onSetCoordinatorMode(isDrawingDanger ? 'none' : 'draw_danger_zone');
            }}
            title="Draw an operational danger zone (Advisory, Risk Perimeter) on the map"
          >
            <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
              <path d="M10 7V10M10 13V13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="tool-label">⚠ DANGER</span>
          </button>

          {/* Action 3: Block Road Menu Anchor */}
          <div className="block-road-menu-wrapper" ref={blockMenuRef}>
            <button
              type="button"
              className={`btn-coord-tool btn-tool-block ${isSelectingEntireRoad || isSectionMode ? 'active' : ''}`}
              id="btn-coord-block-road"
              onClick={handleToggleBlockMenu}
              title="Block an entire road or select a specific road section"
            >
              <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M5 15L15 5" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="tool-label">BLOCK ROAD</span>
              <span className="menu-arrow-icon">▾</span>
            </button>

            {/* Compact Dropdown Popover */}
            {isBlockMenuOpen && (
              <div className="block-road-popover animate-fade-in" id="block-road-dropdown">
                <div className="popover-header">BLOCK ROAD</div>
                <button
                  type="button"
                  className="popover-item"
                  id="btn-block-entire-road-opt"
                  onClick={handleSelectEntireRoad}
                >
                  <span className="item-icon-svg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  </span>
                  <span className="item-title">Block Entire Road</span>
                </button>
                <button
                  type="button"
                  className="popover-item popover-item-highlight"
                  id="btn-block-section-opt"
                  onClick={handleSelectSectionBlock}
                >
                  <span className="item-icon-svg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="6" width="18" height="12" rx="2" />
                      <line x1="9" y1="6" x2="9" y2="18" />
                      <line x1="15" y1="6" x2="15" y2="18" />
                    </svg>
                  </span>
                  <span className="item-title">Block Road Section</span>
                </button>
              </div>
            )}
          </div>

          {/* Action 4: Add Safety Hub */}
          <button
            type="button"
            className={`btn-coord-tool btn-tool-hub ${isAnySafetyHubMode ? 'active' : ''}`}
            id="btn-coord-add-safety-hub"
            onClick={() => {
              setIsBlockMenuOpen(false);
              if (isAnySafetyHubMode) {
                onCancelDrawing();
              } else if (onOpenCreateHubChoice) {
                onOpenCreateHubChoice();
              } else {
                onSetCoordinatorMode('draw_safety_hub');
              }
            }}
            title="Create a new Safety Hub by drawing an operational area, placing a point, or inspecting a public facility"
          >
            <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2L3 5V10C3 14.5 6 18 10 19C14 18 17 14.5 17 10V5L10 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10 7V13M7 10H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="tool-label">+ SAFETY HUB</span>
          </button>

          {/* Action 5: Add Operational Area */}
          {onOpenCreateOperationalArea && (
            <button
              type="button"
              className={`btn-coord-tool btn-tool-area ${isDrawingOperationalArea || isPlacingOperationalAreaPoint ? 'active' : ''}`}
              id="btn-coord-add-op-area"
              onClick={() => {
                setIsBlockMenuOpen(false);
                if (isDrawingOperationalArea || isPlacingOperationalAreaPoint) {
                  onCancelDrawing();
                } else {
                  onOpenCreateOperationalArea();
                }
              }}
              title="Add a relief tent camp, medical triage, water tap, or food station to a Safety Hub"
            >
              <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 16 10 3 4 16h12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M10 3v13" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="tool-label">+ FACILITY / AREA</span>
            </button>
          )}

          {/* Action 6: Manage Controls */}
          <button
            type="button"
            className="btn-coord-tool btn-tool-manage"
            id="btn-coord-manage"
            onClick={() => {
              setIsBlockMenuOpen(false);
              onOpenManageDrawer();
            }}
            title="Manage, inspect, toggle or delete active operational controls"
          >
            <svg className="tool-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="tool-label">MANAGE · {totalControls}</span>
          </button>
        </div>
      </div>

      {/* Floating Active Drawing / Road Selection / Hub Mode Banner */}
      {(isDrawing ||
        isSelectingEntireRoad ||
        isSectionMode ||
        isSelectingSafetyHub ||
        isDrawingSafetyHub ||
        isPlacingSafetyHubPoint ||
        isSettingHubEntrance ||
        isDrawingOperationalArea ||
        isPlacingOperationalAreaPoint) && (
        <div className="floating-mode-banner animate-slide-down" id="coordinator-active-mode-banner">
          <div
            className={`banner-indicator-pulse ${
              isSectionMode
                ? 'pulse-amber'
                : isAnySafetyHubMode || isDrawingOperationalArea || isPlacingOperationalAreaPoint
                ? 'pulse-emerald'
                : ''
            }`}
            style={activeAreaDraftMeta?.color ? { backgroundColor: activeAreaDraftMeta.color } : {}}
          ></div>

          <div className="banner-content">
            <div className="banner-heading">
              {isDrawingHazard && 'HAZARD ZONE'}
              {isDrawingDanger && 'DANGER ZONE'}
              {isSelectingEntireRoad && 'BLOCK ENTIRE ROAD'}
              {isSelectingSectionRoad && 'BLOCK ROAD SECTION'}
              {isAdjustingHandles && 'BLOCK ROAD SECTION — TWO CLOSURE GATES'}
              {isDrawingSafetyHub && 'DRAW SAFETY HUB OPERATIONAL AREA'}
              {isPlacingSafetyHubPoint && 'MARK SAFETY HUB POINT'}
              {isSettingHubEntrance && 'SET SAFETY HUB ENTRANCE / ACCESS POINT'}
              {isSelectingSafetyHub && 'SELECT PUBLIC FACILITY (SHORTCUT)'}
              {isDrawingOperationalArea && `DRAW OPERATIONAL AREA — ${activeAreaDraftMeta?.name?.toUpperCase() || 'POLYGON'}`}
              {isPlacingOperationalAreaPoint && `PLACE OPERATIONAL POINT — ${activeAreaDraftMeta?.name?.toUpperCase() || 'POINT'}`}
            </div>

            <div className="banner-instruction">
              {(isDrawingHazard || isDrawingDanger) && 'Navigate to the affected area, then click the map to draw the boundary.'}
              {isSelectingEntireRoad && 'Click near a road to block it entirely'}
              {isSelectingSectionRoad && 'Click a road on the map to place two closure gates'}
              {isAdjustingHandles && (
                <span>
                  <strong>{sectionRoadName || 'Road'}</strong> {sectionRoadId ? `(${sectionRoadId})` : ''} · Drag <strong>Closure Gate 1</strong> and <strong>Closure Gate 2</strong> along the road to adjust section
                </span>
              )}
              {isDrawingSafetyHub && (
                <span>
                  Click points on the map to manually define the usable perimeter of the Safety Hub (school playground, stadium ground, open campus). <strong>Pan &amp; Zoom freely.</strong>
                </span>
              )}
              {isPlacingSafetyHubPoint && 'Click a point on the map to place a compact emergency Safety Hub.'}
              {isSettingHubEntrance && 'Click on or near an accessible road to define the vehicle/citizen evacuation entrance.'}
              {isSelectingSafetyHub && 'Click any Government school, college, stadium, community centre, or public open ground on the map to inspect and configure as a Safety Hub.'}
              {isPlacingOperationalAreaPoint && (
                <span>
                  Click on the map to place <strong>{activeAreaDraftMeta?.name}</strong> at <strong>{activeAreaDraftMeta?.hubName}</strong>.
                </span>
              )}
              {isDrawingOperationalArea && (
                <span>
                  Click vertices around <strong>{activeAreaDraftMeta?.hubName}</strong> to define the <strong>{activeAreaDraftMeta?.name}</strong> boundary.
                </span>
              )}
              {(isDrawing || isDrawingOperationalArea || isDrawingSafetyHub) && (
                <span className="vertices-badge" id="drawing-vertices-badge">
                  {drawingPointsCount} {drawingPointsCount === 1 ? 'vertex' : 'vertices'}
                </span>
              )}
            </div>

            {isAdjustingHandles && (
              <div className="banner-closure-info" style={{ marginTop: '4px', fontSize: '11px', color: '#fca5a5' }}>
                Blocked Section Length: <strong style={{ color: '#ffffff' }}>{formattedSectionLength}</strong>
              </div>
            )}

            {sectionErrorMessage && (
              <div className="banner-error-text" id="banner-section-error">
                {sectionErrorMessage}
              </div>
            )}
          </div>

          <div className="banner-actions">
            {(isDrawing || isDrawingOperationalArea || isDrawingSafetyHub) && (
              <>
                <button
                  type="button"
                  className="btn-banner btn-banner-undo"
                  onClick={onUndoPoint}
                  disabled={drawingPointsCount === 0}
                  title="Remove the last placed vertex"
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="btn-banner btn-banner-finish"
                  id="btn-complete-drawing"
                  onClick={onCompleteDrawing}
                  disabled={drawingPointsCount < 3}
                  title="Complete boundary and proceed to configuration (minimum 3 points required)"
                >
                  {isDrawingSafetyHub ? 'COMPLETE AREA' : 'Save Area'} {drawingPointsCount >= 3 ? '' : '(Min 3)'}
                </button>
              </>
            )}

            {isAdjustingHandles && onConfirmSectionHandles && (
              <button
                type="button"
                className="btn-banner btn-banner-finish"
                id="btn-confirm-section-handles"
                onClick={onConfirmSectionHandles}
                title="Review and confirm closure section"
                style={{ background: '#ef4444', borderColor: '#f87171' }}
              >
                BLOCK SECTION
              </button>
            )}

            <button
              type="button"
              className="btn-banner btn-banner-cancel"
              onClick={onCancelDrawing}
              title="Cancel current operation (ESC)"
            >
              Cancel (ESC)
            </button>
          </div>
        </div>
      )}
    </>
  );
};


