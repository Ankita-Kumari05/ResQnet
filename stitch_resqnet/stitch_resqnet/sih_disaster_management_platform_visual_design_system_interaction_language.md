# SIH Disaster Management & Emergency Response Platform
## Step 3: Shared Visual Design System & Interaction Language Specification

---

### 1. Design System Foundations & Personality

The design system is engineered for **mission-critical operational reliability**, **cognitive clarity under extreme stress**, and **uncompromising accessibility**. It strictly eschews consumer SaaS tropes (frivolous glassmorphism, heavy drop shadows, decorative neon gradients, and playful micro-animations) in favor of a crisp, authoritative, government-grade operational cockpit.

* **Personality:** Calm, Authoritative, Operational, Trustworthy, Mission-Centric.
* **Core Philosophy:** *"Visual urgency must be used selectively for actual life safety; all operational chrome remains calm, structured, and legible."*

---

### 2. Comprehensive Color Palette & Semantics

| Token Name | Hex Code | Purpose & Usage | Accessibility Rules |
| :--- | :--- | :--- | :--- |
| **Brand Navy Primary** | `#0F172A` / `#1E293B` | Global topbar, persistent sidebars, core branding, primary typography | 14:1+ contrast on white |
| **Action Blue** | `#0284C7` / `#0369A1` | Primary operational buttons, active navigation, links, focus rings | 4.5:1 contrast against neutral backgrounds |
| **Emergency / Critical** | `#DC2626` / `#991B1B` | Critical triage priority, active SOS triggers, life-safety broadcast banners | **Must include icon + label**; never color alone |
| **Emergency Light** | `#FEF2F2` / `#FEE2E2` | Critical card backgrounds, incident drawer highlights | Paired with `#991B1B` text |
| **Warning / High** | `#D97706` / `#B45309` | High-priority incidents, pending triage actions, equipment shortage warnings | Paired with warning triangle icon |
| **Warning Light** | `#FFFBEB` | Warning banner surfaces, pending review table rows | Paired with `#92400E` text |
| **Success / Verified** | `#16A34A` / `#15803D` | Verified incidents, accepted missions, available resources, completed actions | Paired with checkmark badge |
| **Success Light** | `#F0FDF4` | Resolved incident highlights, safe zone markers | Paired with `#166534` text |
| **Info / Telemetry** | `#0284C7` / `#0E7490` | Public safe zones, weather advisories, GPS route overlays | Paired with info icon |
| **Neutral Surface High** | `#F8FAFC` / `#F1F5F9` | Page background canvas, secondary container fills | Standard background |
| **Neutral Surface Card** | `#FFFFFF` | Primary card, modal, and drawer containers with `#E2E8F0` hairline border | Ultra-crisp card surfaces |
| **Neutral Text Primary** | `#0F172A` | Primary headings, table values, critical labels | WCAG AAA standard |
| **Neutral Text Muted** | `#64748B` | Metadata, timestamps, helper text, table column headers | WCAG AA standard |

---

### 3. Typography Scale & Hierarchy

Using clean, highly legible system-grade sans-serif (`Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`):

| Level | Font Size | Line Height | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display / HUD Metric** | `32px / 2rem` | `1.1` | Bold (`700`) / Monospace | EOC counter metrics, live casualty counters, telemetry |
| **Page Title (H1)** | `24px / 1.5rem` | `1.25` | SemiBold (`600`) | Top-level view header (e.g., "Emergency Operations Center", "Active Missions") |
| **Section Title (H2)**| `18px / 1.125rem` | `1.35` | SemiBold (`600`) | Card cluster headings, drawer titles, table section heads |
| **Card / Subsection (H3)** | `15px / 0.9375rem`| `1.4` | Medium (`500`) | Individual card headings, modal headers, timeline nodes |
| **Body Default** | `14px / 0.875rem` | `1.5` | Regular (`400`) | Standard descriptions, citizen reports, instructions |
| **Body Compact / Data**| `13px / 0.8125rem` | `1.45` | Regular / Medium | Table cell contents, metadata lists, filter labels |
| **Caption / Status Text**| `11px / 0.6875rem`| `1.3` | SemiBold (`600`) / Uppercase | Status badges, urgency tags, map callout tags |

---

### 4. Layout, Spacing & Elevation System

* **Spacing Grid:** Rigid 4px / 8px incremental scale (`p-1` [4px], `p-2` [8px], `p-3` [12px], `p-4` [16px], `p-6` [24px], `p-8` [32px]).
* **Corner Radius:** Subtle and modern (`rounded-md` [6px] for inputs, badges, and small buttons; `rounded-lg` [8px] for cards, drawers, and modal containers). *Strict ban on pill-shaped inputs or oversized 24px+ roundings.*
* **Elevation / Shadows:**
  * Base Cards: `border border-slate-200 shadow-sm` (Hairline 1px border with minimal 1px-offset drop shadow).
  * Drawers & Flyouts: `shadow-md border-l border-slate-200`.
  * Modals & Dialogs: `shadow-xl border border-slate-300 backdrop-blur-sm bg-slate-900/40`.

---

### 5. Standardized Status Badge & Priority Language

#### A. Dual-Coded Incident Lifecycle States (Icon + Text + Pill)
1. **Submitted:** Slate `[Clock Icon] Submitted` (Neutral `#64748B`)
2. **Pending Verification:** Amber `[Hourglass Icon] Pending Verification` (Warning `#D97706` / `#FFFBEB`)
3. **Verified:** Blue `[Shield-Check Icon] Verified` (Info `#0284C7` / `#F0F9FF`)
4. **Prioritized:** Purple `[Flag Icon] Prioritized` (`#7C3AED` / `#F5F3FF`)
5. **Assigned:** Cyan `[User-Plus Icon] Assigned` (`#0891B2` / `#ECFEFF`)
6. **En Route:** Indigo `[Navigation Icon] En Route` (`#4F46E5` / `#EEF2FF`)
7. **Arrived:** Sky `[Map-Pin Icon] Arrived on Scene` (`#0284C7` / `#F0F9FF`)
8. **In Progress:** Amber/Orange `[Activity Icon] In Progress` (`#EA580C` / `#FFF7ED`)
9. **Resolved:** Green `[Check-Circle Icon] Resolved` (`#16A34A` / `#F0FDF4`)
10. **Closed:** Dark Slate `[Lock Icon] Closed` (`#334155` / `#F1F5F9`)

#### B. Priority Indicator Standard (Non-Color Dependant)
* **CRITICAL:** High-contrast double-ring red indicator + `[!] Exclamation Triangle` + Bold Uppercase `"CRITICAL"` text + Subtle pulsed red beacon.
* **HIGH:** Amber dot indicator + `[^] Double Arrow Up` + `"HIGH"` text.
* **MEDIUM:** Blue circle indicator + `[-] Horizontal Dash` + `"MEDIUM"` text.
* **LOW:** Gray dot indicator + `[v] Down Arrow` + `"LOW"` text.

---

### 6. Component Interaction Specifications

#### A. Global Application Shell Framework
* **Top Header (Height 60px):**
  * Left: Platform Seal / Logo + Agency Title (`"NDRF / SDMA Disaster Response Network"`).
  * Center: Live Geo-Targeted Alert Ticker / Operational Mode indicator (`Normal` vs. `Active Disaster Response`).
  * Right: Role Badge (`[COORDINATOR - EOC]`, `[CITIZEN]`, `[RESPONDER]`, `[ADMIN]`), Quick Help / Emergency Line (`112 / 1078`), Notifications Bell with urgency counter, User Avatar & Profile menu.
* **Navigation Shell (Left Sidebar - 256px wide / Collapsible to 68px):**
  * High-density vertical navigation with role-specific item trees strictly bounded by RBAC.
  * Active item: Deep navy/blue accent with left 3px indicator line and distinct fill (`bg-slate-100 text-sky-700 font-semibold`).
  * Bottom utility block: Jurisdiction scope display, Network connectivity indicator (`Online - Low Latency`), and Secure Logout.

#### B. Form System & Multi-Step Wizards
* **Labels:** Always explicitly positioned above input fields with clear `*` required markers.
* **Validation:** Inline real-time validation with descriptive error strings (`"Please enter a valid 10-digit emergency contact number"`).
* **Step Indicators:** Numbered progress bars with completed checkmarks, current step callout, and clean back/forward navigation.
* **Emergency Action CTA:** Distinct, high-visibility styling (`bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm focus:ring-4 focus:ring-red-200`).

#### C. Operational Maps & GIS Telemetry
* **Map Container:** Dedicated GIS framing with top-right layer switchers (Incidents, Shelters, Responders, Flood Hazard Perimeters).
* **Marker Hierarchy:** 
  * Incidents: Hexagonal priority-colored badges with casualty count.
  * Responders: Directional vehicle/personnel icons with agency tag (e.g. `SDRF-04`).
  * Shelters: House/Tent icon with green/amber capacity bar (e.g., `82% Full`).
* **Map Legend & Controls:** Docked floating tactical cards with high-contrast background and standard zoom/fullscreen/re-center controls.

#### D. Operational Tables & Triage Queues
* **Structure:** Clean hairline borders (`border-b border-slate-200`), sticky table headers, hover row illumination (`hover:bg-slate-50/80`).
* **Capabilities:** Search input, multi-filter pill dropdowns (Status, Severity, District), sorting headers, clear pagination bar with row-count selectors.
* **Action Columns:** Compact button groups (`Review`, `Assign`, `View Map`) without clutter.

#### E. Destructive Action Confirmation Modals
* Required for: Incident Rejection, Account Suspension, Mission Reassignment, Disaster Closure.
* Structure: Warning badge header, explicit explanation of downstream consequences, mandatory reason selection or text rationale field, and two-button footer (`Cancel` vs. Red `Confirm Action`).

---

### 7. Role-Specific Visual Priority Adaptations

While retaining identical components, buttons, and tokens, each role's view adapts visual hierarchy:

1. **Citizen View:**
   * Visual Center: Large, prominent, unmissable `[🚨 REPORT EMERGENCY (SOS)]` banner.
   * Secondary Zone: Emergency broadcast ticker and "My Active Reports" tracking timeline.
   * Tertiary Zone: Nearby verified shelters & safe zones map preview and verified relief fund campaigns.
2. **Coordinator View (EOC):**
   * Visual Center: High-density EOC Incident Triage Queue and Split-Screen Tactical GIS Map.
   * Supporting Telemetry: Severity distribution bar, unassigned alerts counter, active responder fleet availability status.
3. **Responder / NGO View:**
   * Visual Center: Single primary "Current Active Mission" card with huge action transition button (`[ MARK EN ROUTE ]` ➔ `[ ARRIVED ON SCENE ]`).
   * Supporting Intel: Turn-by-turn navigation map, casualty briefing, coordinator audio/text instructions, and crew roll call.
4. **Admin View:**
   * Visual Center: Organization verification queue with document preview workbench and platform uptime/load metrics.
   * Supporting Tools: Unified user directory with strict audit-logged role elevation switches.

---

### 8. Concrete Prototype Demonstration Data Standards

All prototypes will use consistent, credible, high-impact demonstration data:
* **Disaster Scenarios:** Riverine Flood Inundation (Assam / Kerala context), Coastal Cyclone Alert (Odisha / Andhra context), Urban Building Collapse / Landslide.
* **Agency Units:** `NDRF 10th Bn - Team Delta`, `SDRF Quick Response Unit 2`, `Civil Defense Medical Auxiliary`, `Red Cross Disaster Relief Corps`.
* **Jurisdictions:** Kamrup Metro, Ernakulam District EOC, Cuttack Control Room.
* **Realistic IDs:** Incident IDs formatted as `#INC-2025-8941`, Missions as `#MSN-402-A`, Verification Requests as `#VRF-NGO-109`.
