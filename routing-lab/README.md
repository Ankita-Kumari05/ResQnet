# ResQnet Routing Laboratory — Phase 1

> **IMPORTANT NOTICE:**
> This is a standalone routing laboratory and is not yet integrated with ResQnet.

## 1. Purpose
The objective of this standalone routing laboratory is to prove that the application can calculate and display a **REAL road-following route** from Point A (Start) to Point B (Destination) across actual street networks with multiple turns, bends, and accurate road geometry, without using straight-line interpolations.

## 2. Architecture & Technology Stack
- **Framework:** React 19 + TypeScript + Vite
- **Map Rendering:** [MapLibre GL JS](https://maplibre.org/)
- **Map Style / Tiles:** MapTiler (with automatic OpenStreetMap fallback)
- **Routing Engine:** [OSRM (Open Source Routing Machine)](https://project-osrm.org/) Driving API
- **Route Geometry:** GeoJSON (`LineString`)

```
User Selection (Map Click or Presets)
                │
                ▼
        [RouteControls.tsx]
                │
                ▼
       [routingService.ts]
                │
                ▼ (HTTP GET)
  OSRM API (router.project-osrm.org)
                │
                ▼ (GeoJSON coordinates)
        [RoutingMap.tsx]
      MapLibre GL JS Source & Layer
                │
                ▼
    Road-Following Route Rendered
```

### Separation of Responsibilities
- `src/types/routing.ts`: Strict TypeScript interfaces (`RouteResult`, `Coordinate`, `TestPreset`).
- `src/services/routingService.ts`: Pure OSRM communication, coordinate validation, GeoJSON extraction, and step-by-step debug logging.
- `src/components/RoutingMap.tsx`: Pure MapLibre rendering, stable canvas lifecycle, SVG pin markers, GeoJSON layer updates, and camera bounding box fitting.
- `src/components/RouteControls.tsx`: Point management (Start / Destination), Calculate Route action, Swap A ↔ B, Reset, and Test Presets.
- `src/components/RouteInfo.tsx`: Status indicator, formatted distance (meters/km), duration (mins/hours), and road node metrics.
- `src/data/testPresets.ts`: Predefined multi-turn and nearby routes for repeatable verification.

## 3. MapTiler Configuration
MapTiler styles are supported via the environment variable `VITE_MAPTILER_KEY`.
- If `VITE_MAPTILER_KEY` is present in `.env`: The app loads `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`.
- If `VITE_MAPTILER_KEY` is absent or empty: The app seamlessly falls back to OpenStreetMap raster tiles, ensuring out-of-the-box operation without requiring an API key.

## 4. OSRM Configuration
The service queries the public OSRM driving endpoint:
`https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson`
- Request parameter `geometries=geojson` ensures that full road-following geometry is returned directly as a GeoJSON `LineString`.
- Coordinate ordering is strictly `[longitude, latitude]`.

## 5. Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
cd routing-lab
npm install
```

### Environment Variables
Copy `.env.example` to `.env` (optional):
```bash
cp .env.example .env
```

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

## 6. Verification Tests Included
1. **Nearby A → B (Chelsea to Madison Sq):** Short urban route across avenues (~1.5 km).
2. **Multi-Turn Route (Columbus Circle to Grand Central):** Visual proof of road-following with multiple 90° turns through Manhattan street grid.
3. **Longer Route (Uptown to Downtown ~11 km):** Demonstrates camera bounds fitting and arterial avenue navigation.
4. **European Curving Roads (London West End):** Demonstrates non-grid organic road geometry and roundabout handling.
5. **Interactive Selection:** Click anywhere on the map to set Start (green pin A), click again to set Destination (red pin B), and calculate on-demand.
6. **Swap (A ↔ B):** Reverses points and enables directional recalculation.
7. **Reset:** Completely clears markers and route while keeping map responsive.

## 7. Known Limitations
- The public demo OSRM server (`router.project-osrm.org`) is rate-limited for high-frequency automated batch queries; for heavy production loads, a dedicated self-hosted OSRM docker instance or managed endpoint is recommended.
- Phase 1 does not include real-time hazard avoidance, dynamic rerouting, or live GPS telemetry—these are reserved for subsequent ResQnet integration phases.
