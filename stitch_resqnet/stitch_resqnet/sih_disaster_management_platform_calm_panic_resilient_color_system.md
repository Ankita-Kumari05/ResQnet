# SIH Disaster Management & Emergency Response Platform
## Calm & User-Friendly, Panic-Resilient Color System Specification

---

### 1. Core Visual Philosophy: "Calm First, Urgent Only When Necessary"

In emergency, disaster, and life-safety response, users—whether terrified citizens reporting a flash flood or high-stress coordinators triaging multi-district incidents—experience cognitive overload and adrenaline spikes. 

**The design system is engineered to actively lower stress levels and restore clarity:**
* **70–80% Neutral Canvas & Surfaces:** Large portions of the screen remain visually quiet, clean, and spacious (`#F8FAFC` page background, crisp `#FFFFFF` cards with `#E2E8F0` hairline borders).
* **10–15% Calm Brand Blue:** Dependable, steadying primary blue (`#2563EB`) and soft tints (`#EFF6FF`, `#DBEAFE`) for interactive controls, tabs, and brand posture.
* **5–10% Semantic Accents:** Controlled, purposeful status accents. Critical Red (`#DC2626`) is strictly quarantined to genuine life-safety emergencies, destructive actions, and active critical alerts.
* **Zero Visual Alarmism:** Normal states feel serene and organized. Emergency states feel unmistakably clear and actionable—never chaotic.

---

### 2. Comprehensive Semantic Color Palette

| Semantic Token | Primary Hex | Soft Background | Border Token | Usage Scope | Stress & Accessibility Rule |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Brand Blue** | `#2563EB` | `#EFF6FF` | `#BFDBFE` | Primary buttons, active nav, focus rings, selected cards | 4.5:1+ contrast against white; soothing and authoritative |
| **Deep Nav / Header** | `#1E3A5F` / `#0F172A` | `#F1F5F9` | `#334155` | Topbars, dark chrome, high-contrast primary typography | High-legibility 14:1+ contrast |
| **Neutral Surface** | `#F8FAFC` | `#FFFFFF` (Card) | `#E2E8F0` | Page canvas, card surfaces, table rows, modal backgrounds | Low eye fatigue, zero glare |
| **Neutral Text Primary** | `#1E293B` | N/A | N/A | Main headings, table data values, form inputs | Deep slate, WCAG AAA compliant |
| **Neutral Text Secondary**| `#64748B` | N/A | N/A | Metadata, timestamps, helper text, table column headers | Clear readability without high visual weight |
| **Neutral Text Muted** | `#94A3B8` | N/A | N/A | Inactive icons, subtle breadcrumbs, placeholders | Non-distracting secondary context |
| **Critical / Emergency** | `#DC2626` | `#FEF2F2` | `#FECACA` | Critical triage priority, life-safety alerts, destructive modals | **Must include icon + bold label**; never applied as full-screen flood |
| **Warning / Attention** | `#D97706` | `#FFFBEB` | `#FDE68A` | Pending verification, vehicle shortage alert, high priority | Restrained amber; avoids hyper-saturated orange |
| **Success / Verified** | `#16A34A` | `#F0FDF4` | `#BBF7D0` | Verified incidents, completed missions, resolved states, shelters | Reassuring soft green; communicates resolution and safe zones |
| **Info / Telemetry** | `#2563EB` | `#EFF6FF` | `#BFDBFE` | Public safe advisories, weather telemetry, system notices | Harmonious with brand blue; avoids introducing extra loud hues |

---

### 3. Dual-Coded Status & Priority Indicators (Accessibility Certified)

Color is **never** the sole carrier of meaning. Every status and priority token integrates:
1. Standardized Iconography
2. Explicit Text Label
3. Soft Badge Fill & Border Tone

#### A. Priority Levels (Controlled Escalation)
* **CRITICAL:** `[!] Exclamation Triangle` + Bold `"CRITICAL"` text + `#DC2626` text on `#FEF2F2` (border `#FECACA`). Reserved for immediate life threat.
* **HIGH:** `[^] Double Arrow Up` + `"HIGH"` text + `#D97706` text on `#FFFBEB` (border `#FDE68A`).
* **MEDIUM:** `[-] Horizontal Dash` + `"MEDIUM"` text + `#2563EB` text on `#EFF6FF` (border `#BFDBFE`).
* **LOW:** `[v] Down Arrow` + `"LOW"` text + `#64748B` text on `#F1F5F9` (border `#E2E8F0`).

#### B. Incident & Mission Lifecycle States
| Lifecycle State | Icon | Text Label | Pill Styling |
| :--- | :--- | :--- | :--- |
| **Submitted** | Clock | `Submitted` | `#475569` text on `#F1F5F9` (Neutral Gray) |
| **Pending Verification** | Hourglass | `Pending Verification` | `#B45309` text on `#FFFBEB` (Soft Amber) |
| **Verified** | Shield-Check | `Verified` | `#15803D` text on `#F0FDF4` (Soft Green) |
| **Assigned** | User-Plus | `Assigned` | `#1D4ED8` text on `#EFF6FF` (Soft Blue) |
| **Accepted** | Check-Circle | `Accepted` | `#1D4ED8` text on `#EFF6FF` (Soft Blue) |
| **En Route** | Navigation | `En Route` | `#1D4ED8` text on `#EFF6FF` (Soft Blue) |
| **Arrived** | Map-Pin | `Arrived on Scene` | `#0E7490` text on `#ECFEFF` (Soft Cyan/Teal) |
| **In Progress** | Activity | `In Progress` | `#1D4ED8` text on `#EFF6FF` (Soft Blue) |
| **Resolved** | Check-Circle2 | `Resolved` | `#15803D` text on `#F0FDF4` (Soft Green) |
| **Closed** | Lock | `Closed` | `#475569` text on `#F1F5F9` (Neutral Gray) |

---

### 4. Component Color Application Rules

#### A. Buttons & Actions
* **Primary Button:** Calm Blue (`bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-4 focus:ring-blue-100`).
* **Secondary Button:** Clean White/Neutral (`bg-white hover:bg-slate-50 text-slate-700 border border-slate-300`).
* **Emergency Action:** Red (`bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm focus:ring-4 focus:ring-red-100`) — *Used ONLY when the action triggers a genuine emergency action or life-safety SOS report.*
* **Destructive Action:** Red Outline or Subdued Red (`text-red-700 bg-red-50 hover:bg-red-100 border border-red-200`).
* **Success Action:** Muted Green (`bg-emerald-600 hover:bg-emerald-700 text-white`).

#### B. Emergency Alerts (Non-Overwhelming Architecture)
Critical alerts use a restrained banner design that captures attention through structural clarity rather than garish full-page red fills:
```
┌────────────────────────────────────────────────────────────────────────┐
│ [!] CRITICAL ALERT — Ernakulam District Disaster Management Authority  │
│ Flash flood warning issued for Aluva / Periyar basin (Sector 12).      │
│ Water levels exceeding danger mark. Evacuate to designated shelters.   │
│ [VIEW NEARBY SHELTERS]    [DISMISS]               10m ago • Verified   │
└────────────────────────────────────────────────────────────────────────┘
Styling: bg-red-50/90 border-l-4 border-l-red-600 border border-red-200 text-slate-900
```

#### C. Operational GIS Map Hierarchy
* Base Map: Subdued, low-saturation neutral vector tiles (roads and topography in gentle slates).
* Safe Zones / Shelters: Soft Green pins with capacity fill indicators.
* Warning Perimeters: Subdued Amber translucent boundary hatching (`rgba(217, 119, 6, 0.15)`).
* Critical Incidents: High-contrast red circular beacons with white emergency icons.
* Responders: Deep navy directional icons with callsign chips.

---

### 5. Final Psychological Guardrail: The Visual Escalation Rule
1. **NORMAL SCREEN:** 80% soft neutral + 15% dependable calm blue. Users feel steady, clear-headed, and in control.
2. **WARNING STATE:** Controlled amber chips and banners. Noticeable, informative, but never alarming.
3. **CRITICAL STATE:** Surgical application of red to specific alerts or incident cards. Because the rest of the canvas is calm, the critical element immediately commands the user's focus without inducing panic.
