---
name: Resilience Operations
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#410002'
  on-tertiary-container: '#f63a35'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ab'
  on-tertiary-fixed: '#410002'
  on-tertiary-fixed-variant: '#93000b'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-hud:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.04em
  display-hud-mobile:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Public Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Public Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-badge:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-0: 0px
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-8: 32px
  space-10: 40px
  space-12: 48px
  space-16: 64px
  gutter-dense: 8px
  gutter-standard: 16px
  gutter-expanded: 24px
  margin-mobile: 16px
  margin-tablet: 24px
  margin-desktop: 32px
---

## Brand & Style

This design system is engineered for mission-critical command centers, field responders, and citizens under acute distress. Its visual character is austere, authoritative, calm, and unmistakably functional. During catastrophic incidents—floods, seismic shifts, cyclones, and industrial failures—every millisecond and micro-interaction directly influences life-safety outcomes. The platform eschews consumer-facing SaaS trends such as decorative gradients, noisy glassmorphic blurs, and hyper-saturated novelty accents. Instead, it prioritizes optical clarity, instant cognitive parsing, zero sensory overload, and absolute structural dependability.

The design movement is **Tactical Modernism**: a synthesis of strict Swiss grid discipline, industrial utility, and mission telemetry. It communicates institutional authority and unwavering readiness while remaining humane and panic-reductive. Information is arranged with relentless visual order, utilizing dual-coding (iconography plus explicit text labels) across all functional triggers and diagnostic indicators to prevent operational failure under extreme physical fatigue or degraded lighting conditions.

## Colors

The color architecture is built strictly around operational semantics and WCAG AAA accessibility thresholds. Tinted backgrounds are paired with darkened, high-contrast foreground strokes and text to guarantee outdoor sunlight readability for field tablets and uncompromised clarity on ambient incident room video walls.

- **Primary Command (Slate Navy):**
  - Anchor Base: `#0F172A` (Slate 900)
  - Surface Elevation / Header: `#1E293B` (Slate 800)
  - Secondary Stroke / Subdued Text: `#475569` (Slate 600)
- **Operational Focus & Telemetry (Cyan / Ocean):**
  - Interactive & Data Accent: `#0284C7` (Sky 600)
  - Dark Active / Deep Focus: `#0369A1` (Sky 700)
  - Soft Surface / Pill Backing: `#F0F9FF` (Sky 50)
- **Life-Safety & Critical Alert (Emergency Red):**
  - Primary Critical Trigger / Alert: `#DC2626` (Red 600)
  - Deep Text & Border Contrast: `#991B1B` (Red 800)
  - Alert Fill Canvas: `#FEF2F2` (Red 50)
- **Warning & Heightened Vigilance (Safety Amber):**
  - Severe Risk State: `#D97706` (Amber 600)
  - Deep Accessible Foreground: `#92400E` (Amber 800)
  - Container Tint: `#FFFBEB` (Amber 50)
- **Verified & Operational Clearance (Emerald):**
  - Resolved / Validated Asset: `#16A34A` (Green 600)
  - Deep Accessible Border: `#15803D` (Green 700)
  - Clear Field Backing: `#F0FDF4` (Green 50)
- **Neutrals & Structured Canvas (Engineered Slate):**
  - App Canvas: `#F8FAFC` (Slate 50)
  - Primary Container / Surface: `#FFFFFF`
  - Secondary Container / Inactive Canvas: `#F1F5F9` (Slate 100)
  - Structural Hairline Dividers: `#E2E8F0` (Slate 200)
  - Inactive Borders & Icons: `#CBD5E1` (Slate 300)
  - Body Text: `#334155` (Slate 700)
  - Primary Headings & Critical Labels: `#0F172A` (Slate 900)

Never use color as the sole signifier of state; every status, alert, and map vector must pair its semantic color with a standardized lucide-standard operational icon and bold alphanumeric label.

## Typography

Typography prioritizes uncompromised parsing under critical incident pressures. **Public Sans** is chosen for narrative, institutional structure, UI controls, and instructions due to its clinical, government-grade readability, rigid baseline alignment, and open counters. **JetBrains Mono** is reserved strictly for operational metadata: coordinates, timestamps, casualties counters, resource allocation tallies, CAP message identifiers, and telemetry status streams.

Key guidelines:
- Apply tabular lining numbers (`font-variant-numeric: tabular-nums`) globally across all data tables, situational counters, and coordinates to prevent visual jitter during live updates.
- All badge labels and operational codes are uppercase with intentional tracking (`0.06em` to `0.08em`) to enforce spatial separation between adjacent glyphs.
- Maintain a minimum contrast ratio of 7:1 for all primary body text and 4.5:1 for interactive states and metadata.

## Layout & Spacing

The spatial model employs an authoritative 8px grid foundation with an internal 4px micro-increment for tight information density in dispatch displays and multi-layer maps.

- **Desktop (>= 1280px):** 12-column dynamic grid with 24px gutters and 32px safe outer margins. Command consoles leverage fluid, dockable multi-panel layouts (Left: Incident Stream; Center: GIS Map / Live Telemetry; Right: Tactical Details / Dispatch Action Stack).
- **Tablet (768px - 1279px):** 8-column layout with 16px gutters and 24px margins. Panels collapse into vertical side-drawers or persistent bottom sheets for field logistics and ground inspections.
- **Mobile (< 768px):** 4-column layout with 12px gutters and 16px margins. Dense tactical rows switch to stacked emergency action cards. Floating touch targets (e.g., SOS button, Quick Dispatch) require a minimum tap target of 48x48px with 8px clearance.

Density rules:
- **Tactical Dense (Command & Data Grid):** 4px to 8px internal padding on cell data, badge tags, and sub-nav filters to maximize viewport capacity.
- **Citizen Safety & Actionable Flow:** 16px to 24px container padding to isolate critical life-safety advisories, eliminate mis-clicks, and mitigate cognitive fatigue.

## Elevation & Depth

This system avoids expressive drop shadows and skeuomorphic gradients in favor of **Tonal Layering and Low-Contrast Structural Outlines**. Visual hierarchy is governed by strict plane shifts, borders, and functional contrast:

- **Level 0 (App Canvas):** `#F8FAFC` (Slate 50). Continuous base background for all dashboards and dispatch monitors.
- **Level 1 (Structural Cards & Tables):** `#FFFFFF` with a 1px solid hairline border in `#E2E8F0` (Slate 200). Flat depth with zero shadow.
- **Level 2 (Active Focus & Flyout Panes):** `#FFFFFF` with 1px border in `#CBD5E1` (Slate 300) paired with an ambient utility shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Tactical Floating Elements & GIS Controls):** `#FFFFFF` with an elevated hairline outline `#0F172A` (10% opacity) and directional shadow: `0 10px 15px -3px rgba(15, 23, 42, 0.10), 0 4px 6px -4px rgba(15, 23, 42, 0.05)`.
- **Level 4 (Critical Modals & Emergency Overlays):** `#FFFFFF` surrounded by a darkened backdrop scrim (`#0F172A` at 60% opacity) and elevated structural shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.20), 0 8px 10px -6px rgba(15, 23, 42, 0.10)`.

Life-critical alerts (CAP level alerts) sit at the absolute top tier with a solid 4px left-anchor border in `#DC2626` and an active pulse border without obscuring system status indicators.

## Shapes

The geometric signature uses **Soft Industrial Precision (Roundedness Level 1)**. Sharp, technical corners are gently chamfered to humanize the interface while retaining strict, institutional firmness.

- **Base Radius (`rounded`, 4px):** Checkboxes, status badges, telemetry counters, data table cell tags, and GIS overlay toolbars.
- **Medium Radius (`rounded-md`, 6px):** Primary tactical buttons, text input fields, segmented view-switches, dropdown sheets, and step wizard nodes.
- **Large Radius (`rounded-lg`, 8px):** Incident summary cards, operational panels, safety alert callouts, and multi-tier operational dialogs.
- **Full Radius (`rounded-full`, 9999px):** Live radio-dispatch status pills, active beacon markers on vector maps, and notification counter pips.

## Components

### Buttons
- **SOS / Emergency Trigger:** Dedicated high-urgency component. `#DC2626` background, `#FFFFFF` text, bold `label-badge` styling, 48px minimum height, dual-coded with an emergency flare or life-ring icon. On hover: `#B91C1C`. Focus state: 3px solid outline in `#EF4444` offset by 2px.
- **Primary Operational:** `#0F172A` solid background with `#FFFFFF` text. Used for primary non-emergency workflows (e.g., "Assign Team", "Generate SITREP"). Hover: `#1E293B`. Active: `#0284C7`.
- **Secondary / Tactical:** `#FFFFFF` background with 1px border in `#CBD5E1`, text in `#1E293B`. Hover: `#F1F5F9` background, border in `#94A3B8`.
- **Destructive / Abort:** Border in `#DC2626` (1.5px), background `#FEF2F2`, text `#991B1B`.

### Status Badges (Dual-Coded Incident Pipeline)
Every badge combines a 12px operational vector icon, capitalized text in `label-badge`, and a 1px solid high-contrast border:
- **Submitted / Unassigned:** Slate 100 base (`#F1F5F9`), Slate 600 text (`#475569`), Inbox Icon.
- **Pending Verification:** Amber 50 base (`#FFFBEB`), Amber 800 text (`#92400E`), AlertCircle Icon.
- **Verified / Escalated:** Sky 50 base (`#F0F9FF`), Sky 800 text (`#075985`), CheckCircle2 Icon.
- **Prioritized (Critical):** Red 50 base (`#FEF2F2`), Red 800 text (`#991B1B`), Flame Icon.
- **En Route / Mobilized:** Cyan 50 base (`#ECFEFF`), Cyan 800 text (`#155E75`), Navigation Icon.
- **Arrived on Scene:** Indigo 50 base (`#EEF2FF`), Indigo 800 text (`#3730A3`), MapPin Icon.
- **In Progress:** Violet 50 base (`#F5F3FF`), Violet 800 text (`#5B21B6`), Activity Icon.
- **Resolved / Closed:** Emerald 50 base (`#F0FDF4`), Emerald 800 text (`#166534`), ShieldCheck Icon.

### Emergency Alert Banners (CAP Compliant)
Spans 100% width with an assertive 4px solid left indicator.
- Red Banner (Immediate Evacuation / Severe Risk): `#FEF2F2` background, `#991B1B` primary text, `#DC2626` left bar, paired with timestamp and CAP message identifier in `JetBrains Mono`.
- Amber Banner (Advisory / Rising Water Level): `#FFFBEB` background, `#92400E` text, `#D97706` left bar.
- Action triggers are embedded directly inside the banner as compact, high-contrast buttons.

### Tactical Data Tables
- Header: 36px height, uppercase `label-badge` text, `#F8FAFC` background, 1px bottom border in `#CBD5E1`.
- Rows: 44px fixed height (dense) or 56px (standard). Alternating zebra lines strictly forbidden; rows separated by 1px hairline border (`#F1F5F9`). Hover row highlight: `#F8FAFC`.
- Cells containing coordinates, units, or casualty counts render in `data-mono-md`.

### GIS Map Controls
- Floating dockable widget blocks with `#FFFFFF` background, 1px `#E2E8F0` border, `rounded-md` (6px).
- Active layer toggles display a 2px left accent in `#0284C7`.
- Hover/Selected polygon styles: 2px solid `#DC2626` (Red Zone / Inundation) or `#0284C7` (Rescue Sector) with 15% opacity inner fill.

### Input Fields & Verification Wizards
- Input Fields: `#FFFFFF` surface, 1px border `#CBD5E1`, 8px horizontal padding, 10px vertical padding. Focus ring: 2px solid `#0284C7` with zero blur.
- Wizard Steppers: Connected linear pipeline with numbered circular nodes (28px). Completed: `#16A34A` with white checkmark. Current: `#0F172A` with bold white number and pulse ring. Pending: `#F1F5F9` border with `#64748B` text.
- Critical Operation Confirmation: Requires explicit input matching (e.g., typing the incident number or "CONFIRM EVACUATION") before unlocking destructive dispatch triggers.