---
name: Geodetic Operations Matrix
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf4'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d5e3fd'
  on-surface: '#0d1c2f'
  on-surface-variant: '#43474d'
  inverse-surface: '#233144'
  inverse-on-surface: '#ebf1ff'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#49607c'
  primary: '#001428'
  on-primary: '#ffffff'
  primary-container: '#0f2942'
  on-primary-container: '#7991af'
  inverse-primary: '#b0c9e8'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#000e3b'
  on-tertiary: '#ffffff'
  tertiary-container: '#002069'
  on-tertiary-container: '#728adf'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9e8'
  on-primary-fixed: '#011d35'
  on-primary-fixed-variant: '#314863'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#dce1ff'
  tertiary-fixed-dim: '#b6c4ff'
  on-tertiary-fixed: '#00164e'
  on-tertiary-fixed-variant: '#264191'
  background: '#f8f9ff'
  on-background: '#0d1c2f'
  surface-variant: '#d5e3fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  ui-action:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.5rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system targets survey engineers, field topographers, geodetic data analysts, and operational coordinators managing survey workflows across the Dominican Republic. The visual tone balances industrial engineering discipline with real-time field utility. It avoids consumer decorative tropes in favor of an ergonomic, data-dense interface capable of direct sunlight legibility on ruggedized tablets and rapid desktop keyboard navigation.

The design style merges **Corporate/Modern Technical Utility** with elements of **High-Information Density & Minimalist Grid Systems**:
- **Utilitarian Clarity:** High visual hierarchy with zero arbitrary embellishments. Layouts are optimized for raw throughput, technical readings, coordinate validation, and status visibility.
- **Field Resilience:** Clear visual signaling for offline/sync states, high-contrast operational badges, and prominent warnings prevent catastrophic data overwrites under poor network connectivity.
- **National Context:** Engineered specifically for the Dominican cadastral and geodesic ecosystem (RD$ currency formatting, `America/Santo_Domingo` time formatting [AST/UTC-4], UTM Zone 19N WGS84 conventions, and local land metrics such as tareas, m², and hectáreas).

## Colors

The palette establishes visual authority through deep marine blues and technical steel grays, complemented by semantic signals calibrated for surveying clarity.

### Functional Palette
- **Primary Navy (`#0F2942`):** Primary command surfaces, primary actions, dense table headers, and structural sidebars.
- **Secondary Sky (`#0284C7`):** Active data points, GPS lock indicators, interactive links, map vector focus, and primary button hover states.
- **Tertiary Cobalt (`#1E3A8A`):** Administrative controls, secondary focus states, and geodetic reference highlights.
- **Neutral Steel Slate (`#334155`):** Text hierarchy base, structural borders (`#E2E8F0`), background app canvas (`#F8FAFC`), and card surfaces (`#FFFFFF`).

### Operational Status Palette
- **Success / Completed (`#16A34A`):** Fully synchronized records, closed projects, approved geodetic points. Background: `#DCFCE7`, Border: `#86EFAC`.
- **Warning / Alert (`#D97706`):** Resource overlaps, GPS degradation, unverified control networks. Background: `#FEF3C7`, Border: `#FCD34D`.
- **Critical / Conflict (`#DC2626`):** Coordinate boundary collisions, offline sync failure, unassigned equipment conflicts. Background: `#FEE2E2`, Border: `#FCA5A5`.
- **Cadastral Workflow States:**
  - *Cotizado:* Surface `#F1F5F9`, Text `#475569`, Border `#CBD5E1`.
  - *Aprobado:* Surface `#EFF6FF`, Text `#1D4ED8`, Border `#BFDBFE`.
  - *Programado:* Surface `#F5F3FF`, Text `#6D28D9`, Border `#DDD6FE`.
  - *En Campo:* Surface `#FEF9C3`, Text `#A16207`, Border `#FDE047`.
  - *Procesando:* Surface `#E0F2FE`, Text `#0369A1`, Border `#7DD3FC`.
  - *Entregado:* Surface `#ECFDF5`, Text `#047857`, Border `#A7F3D0`.
  - *Cobrado:* Surface `#F0FDF4`, Text `#15803D`, Border `#86EFAC`.

## Typography

Typography prioritizes tabular alignment, unambiguous numeral differentiation, and vertical rhythm across high-density data matrices:

- **Primary Interface (Inter):** Applied across all standard UI labels, body text, dialogs, operational controls, and navigational structures. Tabular lining figures (`font-variant-numeric: tabular-nums`) must be enabled globally for proper data scanning.
- **Geodetic & Technical Figures (JetBrains Mono):** Reserved for technical identifiers: Northing/Easting UTM coordinates, geodetic latitude/longitude, elevation marks ($Z$), cadastral parcel IDs (e.g., `DC-04-PARC-2024-0891`), raw equipment serials, and timestamp readouts.
- **Numerical Formatting Standards:**
  - Currencies must format consistently as `RD$ #,##0.00`.
  - Dates and timestamps must adopt ISO 8601 or standard localized formatting tied strictly to `America/Santo_Domingo` (`DD/MM/YYYY HH:mm:ss AST`).

## Layout & Spacing

The layout model is governed by an 8px base rhythm (with 4px micro-increments for high-density tabular viewports), using a fluid, responsive 12-column grid.

- **Desktop (1024px+):** Fluid 12-column grid, 1.5rem (`space-xl`) outer margins, 1rem (`gutter`) column gaps. Sidebar navigation collapses to technical icons on utility viewports to maximize geodetic spreadsheet and map surface area.
- **Tablet / Rugged PWA (768px - 1023px):** 8-column layout, 1rem outer margins, 0.75rem gaps. Action surfaces expand touch targets to a minimum of 44px for field glove compliance while retaining compact table row height (36px).
- **Mobile (320px - 767px):** 4-column layout, 0.75rem (`margin-mobile`) margins. Tables collapse into stacked technical cards displaying parcel, coordinates, status, and quick sync action triggers.
- **Z-Index Layer Hierarchy:**
  - Baseline Canvas: `0`
  - Sticky Filter Panels & Table Headers: `10`
  - Floating Offline/Sync PWA Banner: `40`
  - Overlays / Resource Conflict Modals: `50`
  - Toast & Hardware Status Notifications: `60`

## Elevation & Depth

This system intentionally departs from soft, consumer-oriented shadows in favor of **Tonal Layers** and **Low-Contrast Technical Outlines** to preserve readability under ambient outdoor light:

- **Surface Depth Hierarchy:**
  - Level 0 (Canvas): Background `#F8FAFC`.
  - Level 1 (Panels & Cards): Surface `#FFFFFF` enclosed by a 1px border of `#E2E8F0`.
  - Level 2 (Sticky Headers & Filter Bars): Surface `#FFFFFF` with a 1px border of `#CBD5E1` and an ambient technical floor shadow: `0 1px 3px 0 rgba(15, 41, 66, 0.08)`.
  - Level 3 (Modals & Drawers): Surface `#FFFFFF` with outline `#94A3B8` and a structural projection shadow: `0 10px 25px -5px rgba(15, 41, 66, 0.2), 0 8px 10px -6px rgba(15, 41, 66, 0.1)`.
- **Sync & Conflict Highlighting:** Depth for critical warnings is achieved via saturated left boundary indicators (4px solid `#DC2626` or `#D97706`) rather than blurry drop shadows, maintaining crisp geometric definition.

## Shapes

The design system enforces a **Soft Technical (0.25rem / 4px base)** shape language. The low radius evokes precision, architectural blueprints, and rugged field instruments:

- **Buttons, Inputs, Table Cells, and Badges:** `rounded-sm` (4px / 0.25rem).
- **Cards, Panels, and Data Blocks:** `rounded-md` (8px / 0.5rem).
- **Modals and Flyout Sheets:** `rounded-md` (8px / 0.5rem).
- **Pills / Status Chips:** Restricted exclusively to status badges using full rounded styling (`rounded-full` / 9999px) to clearly differentiate categorical project states from interactive, rectangular action buttons.

## Components

### 1. Persistent PWA Offline & Synchronization Banner
- **Placement:** Fixed sticky bar directly beneath the top utility navigation or pinned at the very top of the screen viewport.
- **States:**
  - *Online / Synchronized:* Height collapses to 3px solid `#16A34A` (green line) or hidden, with an optional compact status dot in the header (`● Conectado (Sync OK)`).
  - *Offline Active:* Deep slate `#0F2942` background with `#F8FAFC` text, amber warning icon (`#D97706`), text: *"Modo Sin Conexión — 14 modificaciones locales pendientes de sincronización"*, accompanied by a secondary action button *"Forzar Reintento"*.
  - *Conflict State:* Crimson background (`#DC2626`), white text, prompting immediate resolution of unsynced survey points.

### 2. Dense Data Tables with Advanced Filters
- **Header:** Background `#0F2942`, typography `ui-action` in uppercase, text `#FFFFFF`, with integrated sort order glyphs and inline column-width handles.
- **Row Architecture:** Standard height 36px (compact) or 44px (field/touch). Alternate rows striping: `#FFFFFF` and `#F8FAFC`. Border bottom 1px `#E2E8F0`. Hover state: `#F1F5F9`.
- **Filter Row:** Embedded input fields for cadastral query, date range (`America/Santo_Domingo`), surveyor selector, and multi-select status pills.

### 3. Workflow Status Badges
- Pill-shaped (`rounded-full`), padding `2px 8px`, typography `label-code-sm`.
- Displays strictly defined phases:
  - `[COTIZADO]`: Gray `#475569` on `#F1F5F9`
  - `[APROBADO]`: Blue `#1D4ED8` on `#EFF6FF`
  - `[PROGRAMADO]`: Violet `#6D28D9` on `#F5F3FF`
  - `[EN CAMPO]`: Amber `#A16207` on `#FEF9C3` (with pulsating ping indicator)
  - `[PROCESANDO]`: Cerulean `#0369A1` on `#E0F2FE`
  - `[ENTREGADO]`: Emerald `#047857` on `#ECFDF5`
  - `[COBRADO]`: Forest `#15803D` on `#F0FDF4`

### 4. Technical Geodetic Cards & Unit Conversion Engine
- Structured card with a 1px border `#CBD5E1`, header containing Project Code (JetBrains Mono, bold) and Surveyor in charge.
- **Coordinate Matrix:** 2-column or 3-column micro-grid displaying `X (Este)`, `Y (Norte)`, and `Z (Elevación)` in `JetBrains Mono` with unit indicators fixed at suffix.
- **Cadastral Measurement Segment:** Dynamic unit switcher:
  - Metric Area: `m²`
  - Hectares: `ha` ($1\text{ ha} = 10{,}000\text{ m}²$)
  - Dominican Traditional Unit: `Tareas` ($1\text{ Tarea} = 628.86\text{ m}²$)
  - Linear Perimeter: `m` or `km`

### 5. Resource Conflict Warning Modal
- **Backdrop:** `#0F2942` with 60% opacity.
- **Container:** High-contrast 1px border in `#DC2626`, rounded-md, top visual anchor consisting of a solid 4px red highlight strip.
- **Content:** Header *"Conflicto Crítico de Asignación"*, explicitly listing overlapping surveyor teams, shared GPS RTK rover base units, or boundary parcel overlap percentages.
- **Actions:** Dual button layout: Primary Destructive *"Sobrescribir Asignación"*, Secondary Neutral *"Reasignar Recursos"*.

### 6. Primary Action Control ("Nuevo Proyecto / Trabajo")
- Restricted to Admin and Coordinator roles via explicit authorization checks.
- Solid `#0F2942` background, white label `ui-action`, hover transition to `#0284C7`, leading vector icon (`+` geodetic point marker), height 40px, padding `0 16px`, corner radius `4px`.