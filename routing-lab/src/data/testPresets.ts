import type { TestPreset } from '../types/routing';

/**
 * Curated Indian Development Presets with verified road connectivity.
 * Region: Chandigarh – Mohali – Kharar – Zirakpur – Panchkula
 * Note: Coordinate format is strictly [longitude, latitude].
 */
export const TEST_PRESETS: TestPreset[] = [
  {
    id: 'test-1-chd-mohali',
    name: 'Preset 1: Chandigarh → Mohali',
    description: 'Arterial route from Chandigarh Sector 17 to Mohali Phase 7 (~7.5 km).',
    start: [76.7794, 30.7333],       // Sector 17, Chandigarh
    destination: [76.7179, 30.7046], // Phase 7, Mohali
  },
  {
    id: 'test-2-mohali-kharar',
    name: 'Preset 2: Mohali → Kharar',
    description: 'Highway corridor from Mohali Phase 7 to Kharar Bus Stand via NH-5 (~8.2 km).',
    start: [76.7179, 30.7046],       // Phase 7, Mohali
    destination: [76.6433, 30.7454], // Kharar Bus Stand / NH-5
  },
  {
    id: 'test-3-kharar-chd',
    name: 'Preset 3: Kharar → Chandigarh',
    description: 'Connecting Kharar to Panjab University and PGIMER Sector 12 (~11.5 km).',
    start: [76.6433, 30.7454],       // Kharar Bus Stand
    destination: [76.7865, 30.7600], // PGIMER / Panjab University, Chandigarh
  },
  {
    id: 'test-4-mohali-zirakpur',
    name: 'Preset 4: Mohali → Zirakpur',
    description: 'Connecting Mohali to Zirakpur via Airport Road / PR-7 (~10.8 km).',
    start: [76.7179, 30.7046],       // Mohali Phase 7
    destination: [76.8173, 30.6425], // Zirakpur Flyover / NH-152
  },
  {
    id: 'test-5-chd-panchkula',
    name: 'Preset 5: Chandigarh → Panchkula',
    description: 'Connecting Chandigarh Sector 17 to Panchkula Sector 5 (~9.2 km).',
    start: [76.7794, 30.7333],       // Sector 17, Chandigarh
    destination: [76.8606, 30.6942], // Sector 5, Panchkula
  },
];

