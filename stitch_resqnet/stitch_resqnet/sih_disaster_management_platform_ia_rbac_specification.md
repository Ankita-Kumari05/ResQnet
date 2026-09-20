# Smart Disaster Management & Emergency Response Platform (SIH)
## Information Architecture, Navigation Structure & Role-Based Access Control (RBAC) Specification

---

### 1. Global System Architecture & Routing Map

```
                                  [ PUBLIC ENTRY & AUTH ]
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
           [ Login ]              [ Role Registrations ]        [ Account Recovery ]
                                  ├── Citizen Reg                ├── Forgot Password
                                  ├── Coordinator Reg            └── Password Reset
                                  └── NGO / Responder Reg
                                            │
                                            ▼
                           [ Verification Pending / Gate ]
                                            │
                           (Role Validation / Session Routing)
                                            │
       ┌────────────────────┬───────────────┴───────────────┬────────────────────┐
       ▼                    ▼                               ▼                    ▼
[ CITIZEN SHELL ]   [ COORDINATOR SHELL ]        [ RESPONDER/NGO SHELL ]   [ ADMIN SHELL ]
├── Dashboard       ├── Dashboard (EOC)          ├── Mission Dashboard     ├── System Dashboard
├── Report Incident ├── Incident Management      ├── Assigned Missions     ├── User Directory
├── My Reports      ├── Response Teams & NGOs    ├── Available Missions    ├── Coordinator Mgmt
├── Live Public Map ├── Resource Telemetry       ├── Field Navigation Map  ├── NGO Verification
├── Shelters & Safe ├── Operations GIS Map       ├── Team & Crew Roster    ├── Platform Health
├── Relief Campaigns├── Broadcast Alerts         ├── NGO Logistics/Equip   ├── Audit Logs
├── Alerts Inbox    ├── Response Analytics       ├── Mission History       ├── Broadcast Config
└── Citizen Profile └── Operations Profile       └── Unit Profile          └── Governance/Profile
```

---

### 2. Detailed Navigation Trees & Page Catalog

#### A. Authentication & Public Gateways (Unauthenticated / Semi-Authenticated)
* `/auth/login` — Unified role-aware authentication with identifier, password, and multi-factor/OTP verification.
* `/auth/register/citizen` — Frictionless registration (Full name, phone, email, home address, emergency contacts).
* `/auth/register/coordinator` — Official credential intake (Department, official ID, state/district jurisdiction, badge/emp ID).
* `/auth/register/responder-ngo` — Organization intake (Trust/NGO Reg No., operating regions, disaster capabilities, fleet & personnel count, document upload).
* `/auth/verification-pending` — Quarantine state for Coordinators & NGOs awaiting verification by State/Central Admins.
* `/auth/forgot-password` & `/auth/reset-password` — Secure credential reset flow.

#### B. Citizen Experience (Safety, Self-Reporting & Relief Support)
*Primary Navigation Archetype:* Horizontal Top Bar + Focused Safe Action HUD (Minimal cognitive overhead under panic).

1. **Dashboard (`/citizen/dashboard`)**
   * Urgent SOS / Quick Report banner.
   * Active emergency broadcast ticker (Geo-targeted).
   * Active submitted report tracking carousel.
   * Nearby shelter availability quick-cards.
   * Verified relief campaigns snippet.
2. **Report Emergency (`/citizen/report`)**
   * Multi-step wizard: Disaster category ➔ GPS Pinpoint / Landmark ➔ Casualty / Urgency assessment ➔ Media evidence upload ➔ Emergency contact confirmation ➔ Confirmation with Instant Tracking ID.
3. **My Reports (`/citizen/reports`)**
   * Filterable incident list (All, Under Review, Verified, Dispatched, Resolved).
   * Detail view (`/citizen/reports/:id`): Public-safe timeline, assigned unit status, advisory notes. *Strictly NO internal coordinator dispatch notes.*
4. **Live Public Safety Map (`/citizen/map`)**
   * Read-only public hazard zones, flood perimeters, shelter pins, safe evacuation routes. *Responders' live tactical GPS positions are hidden.*
5. **Shelters & Safe Locations (`/citizen/shelters`)**
   * Directory & map of verified relief camps, real-time bed/food capacity, medical facilities, route directions.
6. **Relief & Donations (`/citizen/donations`)**
   * Verified disaster relief funds, transparent target vs. raised progress bars, designated receiving NGOs, integrated payment gateway.
7. **Notifications & Alerts (`/citizen/alerts`)**
   * Official district advisories, weather warnings, report progress notifications.
8. **Citizen Profile (`/citizen/profile`)**
   * Personal details, primary/secondary emergency contacts, medical notes (blood group, mobility assistance needs).

#### C. Coordinator Experience (Emergency Operations Center / EOC)
*Primary Navigation Archetype:* High-Density Operational Sidebar + Tactical HUD (Real-time telemetry, zero decorative fluff).

1. **EOC Dashboard (`/coordinator/dashboard`)**
   * Incident triage velocity counter, critical severity tickers, unassigned alert queue, active responder fleet count, regional readiness index, live mini-GIS tactical radar.
2. **Incident Management (`/coordinator/incidents`)**
   * Segmented views: `All`, `Pending Verification`, `Prioritized`, `Assigned`, `In Progress`, `Resolved`, `Closed`.
   * Incident Triage Drawer / Detail (`/coordinator/incidents/:id`):
     - Citizen report metadata & uploaded media validation.
     - Severity re-classification (Critical, High, Medium, Low).
     - Dual-coded visual priority tagging.
     - Responder recommendation engine (proximity, equipment match, availability).
     - Dispatch action modal & internal operational log.
3. **Response Teams & NGOs (`/coordinator/teams`)**
   * Searchable roster of active SDRF, NDRF, Fire & Rescue, and verified NGO response units.
   * Operational readiness, capabilities, active deployments, contact channels.
4. **Resource Management (`/coordinator/resources`)**
   * Live inventory: Rescue boats, earthmovers, ambulances, mobile water purifiers, food packets, oxygen units.
   * Stock tracking by district/depot, requisition dispatch, shortage alerts.
5. **Operations GIS Map (`/coordinator/map`)**
   * Full-screen tactical GIS: Layer toggles (Incidents by priority, Responder live GPS tracks, Hazard zones, Evacuation corridors, Resource depots, Shelters).
6. **Broadcast Alerts (`/coordinator/alerts`)**
   * Geo-fenced broadcast creator (CAP standard), severity level selector, delivery channels (SMS, Push, Citizen Portal).
7. **Reports & Operational Analytics (`/coordinator/analytics`)**
   * Mean Time to Respond (MTTR), incident resolution curves, resource burn rates, district load distribution charts.
8. **Coordinator Profile (`/coordinator/profile`)**
   * Jurisdiction scope, operational credentials, shift logs.

#### D. Responder / NGO Field Operations (Mission Dispatch & Field Updates)
*Primary Navigation Archetype:* Action-Centric Header + Mobile/Field-Optimized Mission Deck.

1. **Field Dashboard (`/responder/dashboard`)**
   * Primary Active Mission Card with quick-action status transition (`Accept` ➔ `En Route` ➔ `Arrived` ➔ `In Progress` ➔ `Completed`).
   * Turn-by-turn navigation shortcut, immediate mission objectives, coordinator audio/text instructions.
2. **My Missions (`/responder/missions`)**
   * Active, Scheduled, and Completed missions archive.
   * Mission Detail View (`/responder/missions/:id`): Incident details, affected casualty count, specific hazards (electrical, structural), required equipment checklist.
3. **Available Missions Queue (`/responder/available`)**
   * Unassigned or open-call incidents matching the organization's certified capabilities (e.g., Water Rescue, Medical Evac).
4. **Field Navigation Map (`/responder/map`)**
   * Tactical route planning with avoid-hazard zones, nearby operational units, designated medical relief centers.
5. **Unit / Crew Roster (`/responder/team`)**
   * Crew member roll call, duty status, skill tags (Paramedic, Diver, Heavy Equipment Operator).
6. **Organization Resources (`/responder/resources`)**
   * Equipment deployed in the field vs. available at base; maintenance and requisition logs.
7. **Mission History (`/responder/history`)**
   * Historical operational logs, after-action reports (AAR), post-incident photo verification.
8. **Profile & Credentials (`/responder/profile`)**
   * NGO registration credentials, certified domain capabilities, base camp address.

#### E. Platform Administration (Governance, Verification & Auditing)
*Primary Navigation Archetype:* Compact Administrative Control Console.

1. **Admin Console (`/admin/dashboard`)**
   * Total system users, coordinator roster by state/district, pending NGO certifications, system uptime, security telemetry.
2. **User Management (`/admin/users`)**
   * Unified directory across all roles; status toggles (Active, Suspended, Flagged); 2FA enforcement; account modification with strict confirmation modals.
3. **Coordinator Verification & Management (`/admin/coordinators`)**
   * Government credential validation, administrative authority assignment by district/region.
4. **NGO / Responder Verification Queue (`/admin/verification`)**
   * Verification review workbench: NGO 12A/80G/FCRA docs, government accreditation review, capability verification, action suite (Approve, Reject with Reason, Request Clarification).
5. **System Telemetry & Health (`/admin/monitoring`)**
   * API health, database latency, push notification delivery throughput, map tile service uptime.
6. **Platform Analytics (`/admin/analytics`)**
   * Macro-level disaster trends, inter-agency efficiency metrics, relief fund audit summaries.
7. **System Audit Logs (`/admin/audit-logs`)**
   * Immutable read-only event stream (Timestamp, Operator, IP, Resource ID, Operation Type, Mutation Result).
8. **System Broadcasts & Config (`/admin/announcements`)**
   * System maintenance advisories, global SOP configuration.

---

### 3. Role-Based Access Control (RBAC) Matrix

| Operational Capability | Citizen | Coordinator (EOC) | Responder / NGO | System Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Submit Emergency Report** | **YES** (Own) | **YES** (On behalf of) | NO | NO |
| **View Incident Reports** | Own Reports Only | **YES** (Jurisdiction) | Assigned / Open Queue | **YES** (All) |
| **Verify / Triage Incident** | NO | **YES** | NO | **YES** (Super-admin override) |
| **Prioritize (Critical/High/Med/Low)** | NO | **YES** | NO | **YES** |
| **Assign / Reassign Response Mission** | NO | **YES** | NO | NO |
| **Accept / Decline Mission** | NO | NO | **YES** | NO |
| **Update Field Mission State** | NO | NO | **YES** (Assigned) | NO |
| **Access Tactical Operations Map** | NO (Public Layer Only) | **YES** (Full GIS telemetry)| Restricted (Mission Scope) | **YES** |
| **Manage Resource Allocation** | NO | **YES** (District/Regional) | **YES** (Own Organization) | **YES** (System-wide) |
| **Send Geo-Fenced Alerts (CAP)** | NO | **YES** (Authorized EOC) | NO | **YES** |
| **Contribute to Relief Campaigns** | **YES** | **YES** (Personal) | NO | Oversight Only |
| **Verify Coordinator Credentials** | NO | NO | NO | **YES** |
| **Verify NGO / Responder Orgs** | NO | NO | NO | **YES** |
| **Manage Users & Role Permissions** | NO | NO | Team Only (NGO Admin) | **YES** |
| **Inspect Immutable Audit Logs** | NO | NO | NO | **YES** (Read-Only) |

---

### 4. Screen Transition & Operational Flow Hierarchies

```
[ FLOW 1: Citizen SOS to Resolution Tracking ]
Citizen Dashboard 
  └──> "Report Emergency" Form 
         └──> Step Wizard (Category -> Geo -> Media -> Severity) 
                └──> Submission Confirmation Modal (Instant ID Generated)
                       └──> "My Reports" Tracker View 
                              └──> Report Details & Live Public Milestones

[ FLOW 2: Coordinator Triage & Dispatch ]
EOC Dashboard 
  └──> Incoming Incident Queue (Pending Verification) 
         └──> Triage & Verification Drawer 
                └──> Priority Setting (Critical/High) + Media Review
                       └──> Match & Assign Responder Modal (Distance/Capability Filter)
                              └──> Operations GIS Map (Monitoring live unit convergence)
                                     └──> Incident Closure & After-Action Signoff

[ FLOW 3: Responder Mission Execution ]
Field Dashboard 
  └──> Incoming Mission Banner ("Critical Incident Assigned")
         └──> Review Mission Objectives & Tactical Briefing
                └──> Action: "Accept Mission"
                       └──> Action: "Mark En Route" (Navigation map activated)
                              └──> Action: "Arrived on Scene" (Safety checklist)
                                     └──> Action: "In Progress" (Field notes/casualty updates)
                                            └──> Action: "Mission Completed" (Resolution report)

[ FLOW 4: Admin NGO Accreditation ]
Admin Console 
  └──> Verification Queue 
         └──> Organization Profile & Document Inspection (Trust Deed, 80G, Capabilities)
                └──> Decision Modal (Approve / Reject / Request Supporting Evidence)
                       └──> Automated Credential Activation & Audit Log Recording
```

---

### 5. Information Isolation & Security Boundaries

1. **Citizen Privacy:** Citizens can only view their own submissions. Citizen identity and telephone numbers are masked from the public view; only assigned Coordinators and responding field teams receive emergency contact information for rescue purposes.
2. **Tactical Concealment:** Responders' exact real-time GPS locations and police/paramilitary frequencies are concealed from public/citizen map views to preserve operational security.
3. **Coordinator Discretion:** Internal notes, triage suspicion logs, and preliminary unverified disaster flags remain strictly within the Coordinator and Admin domain until verified.
4. **Audit Immutability:** Audit logs have zero write or delete endpoints for any role; events are logged chronologically with cryptographic integrity.
