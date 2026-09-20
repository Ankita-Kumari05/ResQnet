import type { LineString } from 'geojson';

export interface OperationalRoad {
  id: string;
  name: string;
  geometry: LineString;
}

/**
 * Deterministic Road Network for Chandigarh – Mohali – Kharar – Zirakpur – Panchkula.
 * Aligned with real Indian OpenStreetMap centerlines and OSRM coordinates.
 */
export const OPERATIONAL_ROADS: OperationalRoad[] = [
  {
    id: 'ROAD-IN-01',
    name: 'Madhya Marg (East-West Arterial)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7735, 30.7645], // PGI / Sector 12
        [76.7810, 30.7550], // Sector 10 / 11
        [76.7915, 30.7410], // Matka Chowk / Sector 17
        [76.8040, 30.7280], // Sector 26 Transport Chowk
        [76.8200, 30.7150], // Railway Station / Panchkula Border
      ],
    },
  },
  {
    id: 'ROAD-IN-02',
    name: 'Dakshin Marg (Chandigarh-Mohali Arterial)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7410, 30.7480], // Sector 38 West / Maloya
        [76.7580, 30.7290], // Sector 35 / 36 Chowk
        [76.7750, 30.7100], // Sector 33 / 20
        [76.7950, 30.6950], // Tribune Chowk
        [76.8120, 30.6800], // Hallomajra / Chandigarh South
      ],
    },
  },
  {
    id: 'ROAD-IN-03',
    name: 'Himalaya Marg (Central Corridor)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7850, 30.7490], // Sector 9 / 17
        [76.7750, 30.7370], // Sector 17 / 22 Aroma Chowk
        [76.7620, 30.7220], // Sector 34 / 35
        [76.7480, 30.7060], // Sector 43 ISBT / Mohali Sector 52
      ],
    },
  },
  {
    id: 'ROAD-IN-04',
    name: 'Jan Marg (Secretariat to Sector 42)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.8020, 30.7600], // Punjab / Haryana Civil Secretariat
        [76.7890, 30.7470], // Rose Garden / Sector 16
        [76.7760, 30.7330], // Sector 17 / 22
        [76.7600, 30.7160], // Sector 36 / 42 Lake
      ],
    },
  },
  {
    id: 'ROAD-IN-05',
    name: 'NH-5 Chandigarh-Kharar Highway',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7350, 30.7490], // Chandigarh Sec 39 / Mohali Border
        [76.7110, 30.7480], // Balongi Junction
        [76.6850, 30.7470], // Sunny Enclave Flyover Approach
        [76.6580, 30.7460], // Kharar Flyover Core
        [76.6433, 30.7454], // Kharar Bus Stand / Kurali Junction
      ],
    },
  },
  {
    id: 'ROAD-IN-06',
    name: 'Airport Road / PR-7 (Mohali Arterial)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.6920, 30.6890], // Kharar-Landran Link
        [76.7150, 30.6920], // Sector 79 / 80 Chowk
        [76.7380, 30.6810], // PCA Stadium / Sector 68
        [76.7720, 30.6650], // Sector 82 / IT City / Aerocity
        [76.8120, 30.6480], // Zirakpur Highway Junction
      ],
    },
  },
  {
    id: 'ROAD-IN-07',
    name: 'Vikas Marg (Mohali Urban Corridor)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7120, 30.7190], // Mohali Phase 3B2
        [76.7179, 30.7046], // Mohali Phase 7 / PCA Stadium
        [76.7230, 30.6940], // Sector 70
        [76.7300, 30.6830], // Sector 71 / Sohana
      ],
    },
  },
  {
    id: 'ROAD-IN-08',
    name: 'NH-7 Chandigarh-Panchkula Link',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7950, 30.6950], // Tribune Chowk
        [76.8180, 30.6900], // Hallomajra
        [76.8390, 30.6920], // Industrial Area Phase 2 / Housing Board
        [76.8606, 30.6942], // Panchkula Sector 5 / Majri Chowk
      ],
    },
  },
  {
    id: 'ROAD-IN-09',
    name: 'Chandigarh-Zirakpur Highway (NH-152)',
    geometry: {
      type: 'LineString',
      coordinates: [
        [76.7950, 30.6950], // Tribune Chowk
        [76.8060, 30.6720], // Airport Light Point
        [76.8140, 30.6550], // Zirakpur Barrier
        [76.8173, 30.6425], // Zirakpur Flyover / VIP Road
      ],
    },
  },
];

