import React from 'react';
import type { OperationalAreaType } from '../types/safetyHub';

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Main Safety Hub Shield Badge Icon (Emergency Shelter Shield)
 */
export const SafetyHubShieldIcon: React.FC<IconProps> = ({
  size = 20,
  color = '#ffffff',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12h6" />
    <path d="M12 9v6" />
  </svg>
);

/**
 * 1. Relief / Tent Area Icon
 */
export const ReliefTentIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M19 20 12 4 5 20h14z" />
    <path d="M12 4v16" />
    <path d="m9 20 3-8 3 8" />
  </svg>
);

/**
 * 2. Medical / First Aid Area Icon
 */
export const MedicalCrossIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <rect width="20" height="16" x="2" y="4" rx="3" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </svg>
);

/**
 * 3. Food Distribution Area Icon
 */
export const FoodUtensilsIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
    <path d="M15 11v11" />
    <path d="M5 2v20" />
    <path d="M2 2h6v5a3 3 0 0 1-6 0V2z" />
  </svg>
);

/**
 * 4. Water Distribution Point Icon
 */
export const WaterDropletIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

/**
 * 5. Sanitation Area Icon
 */
export const SanitationRestroomIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <circle cx="7" cy="4" r="2" />
    <path d="M5 21v-7a2 2 0 0 1 4 0v7" />
    <path d="M5 10h4" />
    <circle cx="17" cy="4" r="2" />
    <path d="m14 14 2 7" />
    <path d="m20 14-2 7" />
    <path d="M14 10h6l-1 4h-4z" />
  </svg>
);

/**
 * 6. Registration / Help Desk Icon
 */
export const RegistrationBadgeIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </svg>
);

/**
 * 7. General Evacuation / Shelter Area Icon
 */
export const GeneralShelterHomeIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

/**
 * 8. Command / Coordination Area Icon
 */
export const CommandOperationsIcon: React.FC<IconProps> = ({
  size = 18,
  color = 'currentColor',
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`resq-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    <path d="M4.93 19.07A10 10 0 0 1 12 2a10 10 0 0 1 7.07 17.07" />
    <path d="M7.76 16.24A6 6 0 0 1 12 6a6 6 0 0 1 4.24 10.24" />
    <circle cx="12" cy="18" r="3" />
    <path d="M12 15v3" />
  </svg>
);

/**
 * Unified Component Selector for Operational Area Icons
 */
export const OperationalAreaIcon: React.FC<{
  type: OperationalAreaType;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ type, size = 18, color = 'currentColor', className = '', style = {} }) => {
  switch (type) {
    case 'RELIEF_TENT':
      return <ReliefTentIcon size={size} color={color} className={className} style={style} />;
    case 'MEDICAL_FIRST_AID':
      return <MedicalCrossIcon size={size} color={color} className={className} style={style} />;
    case 'FOOD_DISTRIBUTION':
      return <FoodUtensilsIcon size={size} color={color} className={className} style={style} />;
    case 'WATER_POINT':
      return <WaterDropletIcon size={size} color={color} className={className} style={style} />;
    case 'SANITATION':
      return <SanitationRestroomIcon size={size} color={color} className={className} style={style} />;
    case 'REGISTRATION_DESK':
      return <RegistrationBadgeIcon size={size} color={color} className={className} style={style} />;
    case 'GENERAL_SHELTER':
      return <GeneralShelterHomeIcon size={size} color={color} className={className} style={style} />;
    case 'COMMAND_COORDINATION':
      return <CommandOperationsIcon size={size} color={color} className={className} style={style} />;
    default:
      return <SafetyHubShieldIcon size={size} color={color} className={className} style={style} />;
  }
};

/**
 * Generates raw SVG HTML markup for use inside MapLibre DOM markers and HTML Popups.
 */
export function getOperationalAreaIconMarkup(
  type: OperationalAreaType,
  color: string = '#ffffff',
  size: number = 18
): string {
  switch (type) {
    case 'RELIEF_TENT':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20 12 4 5 20h14z"/><path d="M12 4v16"/><path d="m9 20 3-8 3 8"/></svg>`;
    case 'MEDICAL_FIRST_AID':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>`;
    case 'FOOD_DISTRIBUTION':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 11v11"/><path d="M5 2v20"/><path d="M2 2h6v5a3 3 0 0 1-6 0V2z"/></svg>`;
    case 'WATER_POINT':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    case 'SANITATION':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="4" r="2"/><path d="M5 21v-7a2 2 0 0 1 4 0v7"/><path d="M5 10h4"/><circle cx="17" cy="4" r="2"/><path d="m14 14 2 7"/><path d="m20 14-2 7"/><path d="M14 10h6l-1 4h-4z"/></svg>`;
    case 'REGISTRATION_DESK':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`;
    case 'GENERAL_SHELTER':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    case 'COMMAND_COORDINATION':
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.93 19.07A10 10 0 0 1 12 2a10 10 0 0 1 7.07 17.07"/><path d="M7.76 16.24A6 6 0 0 1 12 6a6 6 0 0 1 4.24 10.24"/><circle cx="12" cy="18" r="3"/><path d="M12 15v3"/></svg>`;
    default:
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>`;
  }
}

/**
 * Main Safety Hub Shield icon markup for MapLibre HTML marker
 */
export function getSafetyHubShieldMarkup(color: string = '#ffffff', size: number = 22): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>`;
}

/**
 * Creates a standalone SVG string for a Safety Hub pin marker (MapLibre icon image)
 */
export function createSafetyHubPinSvg(status: 'OPEN' | 'NEAR_CAPACITY' | 'FULL' | 'CLOSED'): string {
  const statusColor =
    status === 'OPEN'
      ? '#10b981'
      : status === 'NEAR_CAPACITY'
      ? '#f59e0b'
      : status === 'FULL'
      ? '#ef4444'
      : '#6b7280';

  return `<svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 0C9 0 0 9 0 20c0 14.5 18 29 18.8 29.5a1.98 1.98 0 002.4 0C22 49 40 34.5 40 20 40 9 31 0 20 0z" fill="${statusColor}"/><circle cx="20" cy="20" r="14.5" fill="#0f172a"/><g transform="translate(8, 8)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg></g></svg>`;
}

/**
 * Creates a standalone SVG string for an Operational Area badge marker (MapLibre icon image)
 */
export function createOperationalAreaBadgeSvg(type: OperationalAreaType, color: string): string {
  const innerMarkup = getOperationalAreaIconMarkup(type, color, 20);
  return `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="16.5" fill="#0f172a" stroke="${color}" stroke-width="2.5"/><g transform="translate(8, 8)">${innerMarkup}</g></svg>`;
}

/**
 * Creates a standalone SVG string for the route directional arrow / chevron
 */
export function createRouteDirectionArrowSvg(): string {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 16.5L12 9.5L18.5 16.5L12 13.5L5.5 16.5Z" fill="#020617" fill-opacity="0.65" stroke="#020617" stroke-width="2" stroke-linejoin="round"/><path d="M6 16L12 9L18 16L12 13L6 16Z" fill="#ffffff" fill-opacity="0.96"/></svg>`;
}

/**
 * Pre-loads and registers all Safety Hub & Operational Area vector icons into MapLibre GL instance
 */
export async function loadAllSafetyHubMapImages(map: any): Promise<void> {
  const imagesToLoad: { id: string; svg: string; width: number; height: number }[] = [
    { id: 'hub-marker-open', svg: createSafetyHubPinSvg('OPEN'), width: 40, height: 50 },
    { id: 'hub-marker-near_capacity', svg: createSafetyHubPinSvg('NEAR_CAPACITY'), width: 40, height: 50 },
    { id: 'hub-marker-full', svg: createSafetyHubPinSvg('FULL'), width: 40, height: 50 },
    { id: 'hub-marker-closed', svg: createSafetyHubPinSvg('CLOSED'), width: 40, height: 50 },
    { id: 'route-dir-arrow', svg: createRouteDirectionArrowSvg(), width: 24, height: 24 },
  ];

  const types: { type: OperationalAreaType; color: string }[] = [
    { type: 'RELIEF_TENT', color: '#d97706' },
    { type: 'MEDICAL_FIRST_AID', color: '#dc2626' },
    { type: 'FOOD_DISTRIBUTION', color: '#ea580c' },
    { type: 'WATER_POINT', color: '#0284c7' },
    { type: 'SANITATION', color: '#0891b2' },
    { type: 'REGISTRATION_DESK', color: '#4f46e5' },
    { type: 'GENERAL_SHELTER', color: '#7c3aed' },
    { type: 'COMMAND_COORDINATION', color: '#475569' },
  ];

  types.forEach((item) => {
    imagesToLoad.push({
      id: `op-marker-${item.type.toLowerCase()}`,
      svg: createOperationalAreaBadgeSvg(item.type, item.color),
      width: 36,
      height: 36,
    });
  });

  await Promise.all(
    imagesToLoad.map(
      (imgDef) =>
        new Promise<void>((resolve) => {
          if (map.hasImage(imgDef.id)) {
            resolve();
            return;
          }
          const img = new Image(imgDef.width, imgDef.height);
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            if (!map.hasImage(imgDef.id)) {
              try {
                map.addImage(imgDef.id, img, { pixelRatio: 1 });
              } catch {
                // Ignore if racing
              }
            }
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(imgDef.svg);
        })
    )
  );
}

