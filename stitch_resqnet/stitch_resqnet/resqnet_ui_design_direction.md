# ResQnet — UI Design Direction & Core Principles Specification

---

### 1. Platform Identity & Name
* **Platform Name:** **ResQnet**
* **Core Tagline:** *Centralized Disaster Management & Emergency Response Network*
* **Core Mission Statement:** *"Simple enough for a citizen. Powerful enough for a coordinator. Action-oriented enough for a responder. Controlled enough for an admin."*

---

### 2. The Core Philosophy: "Make the Right Action Obvious"
ResQnet is engineered for crisis conditions. Under adrenaline, confusion, or severe stress, users must never search, pause, or deliberate over where to click.

#### What We Eliminate:
* ❌ Statistical clutter (no grids of 12–20 metric cards)
* ❌ Dense, unparsed data tables when a clear list/card suffices
* ❌ Over-engineered charts, gauges, and micro-analytics
* ❌ Decorative glassmorphism, heavy drop shadows, neon accents, or dark disaster-movie palettes
* ❌ Flashing, pulsing, or aggressive visual alarms for non-critical states

#### What We Champion:
* ✅ **70–80% Tranquil Neutral Surfaces:** Low eye-strain, spacious canvas (`#F8FAFC`), crisp white cards (`#FFFFFF`), and clean hairline borders (`#E2E8F0`).
* ✅ **Calm Brand Blue (`#2563EB`):** Authoritative, reliable, human-friendly for interactive controls and guidance.
* ✅ **Surgical Urgency:** Critical Red (`#DC2626`) is strictly restricted to life-safety alerts and destructive actions.
* ✅ **Role-Specific Simplicity:**
  - **Citizen:** Frictionless safety. Prominent `[🚨 REPORT EMERGENCY]`, active report tracking, nearby shelters, and verified broadcasts.
  - **Coordinator:** Situational cockpit. Prioritized incident triage, response unit availability, tactical GIS map, and CAP alert broadcasting.
  - **Responder / NGO:** Action-first mission card (`ACCEPT` ➔ `EN ROUTE` ➔ `ARRIVED` ➔ `IN PROGRESS` ➔ `COMPLETED`), route navigation, and team roll-call.
  - **Admin:** Trust & verification workbench, NGO accreditation reviews, user directory, and immutable audit telemetry.

---

### 3. Component & Button Hierarchy Standards
1. **Primary Action:** Solid Calm Blue (`bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm`). Exactly **one** dominant primary action per visual section.
2. **Secondary Action:** Crisp Neutral Outlined (`bg-white hover:bg-slate-50 text-slate-700 border border-slate-300`).
3. **Tertiary Action:** Subtle Text / Ghost button (`text-slate-600 hover:text-slate-900 font-medium`).
4. **Critical / Life-Safety Emergency Action:** Solid Muted Red (`bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-4 focus:ring-red-100`).

---

### 4. Demonstrative Realistic Indian Prototype Datasets
* **Authorities & Units:** NDRF 10th Battalion (Bhubaneswar/Patna), Kerala SDMA (Trivandrum SEOC), Kamrup District Disaster Management Authority (Guwahati), Civil Defense Rapid Triage Unit 4.
* **Incidents & Context:** Riverine flood alerts (Periyar Basin / Brahmaputra Reach 3), coastal cyclone preparedness (Paradip / Puri Sector 4), urban structural evacuations.
* **Emergency Helplines:** Integrated `112` (Unified National Emergency) & `1078` (Disaster Management Toll-Free).
