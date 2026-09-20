export type MapInteractionMode =
  | 'EXPLORE'
  | 'PLACE_START'
  | 'PLACE_DESTINATION'
  | 'DRAG_START'
  | 'DRAG_DESTINATION'
  | 'SAFETY_HUB_AREA'
  | 'SAFETY_HUB_POINT'
  | 'SAFETY_HUB_FACILITY_PICK'
  | 'SAFETY_HUB_ENTRANCE'
  | 'FACILITY_AREA'
  | 'FACILITY_POINT'
  | 'HAZARD_AREA'
  | 'DANGER_AREA'
  | 'BLOCK_ROAD'
  | 'BLOCK_ROAD_SECTION'
  | 'SECTION_ADJUST_HANDLES';

export interface InteractionStateIndicator {
  mode: MapInteractionMode;
  title: string;
  instruction: string;
  badge?: string;
  color?: string;
  allowUndo?: boolean;
  allowComplete?: boolean;
  canCancel?: boolean;
}
