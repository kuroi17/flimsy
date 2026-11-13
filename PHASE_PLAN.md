# Phase Plan: Flimsy (Visual-to-Code Synchronization Tool)

**Product Vision:** A Figma-grade visual editor directly on localhost that deterministically writes UI edits back into your JSX/Tailwind codebase with zero AI prompt overhead.  
**Target Stack:** React + Vite + TypeScript + Tailwind CSS  
**Distribution Model:** Unified NPM Package (`flimsy-dev`) & NPX CLI runner (`npx flimsy-dev@latest dev`)

---

## Architecture Overview

```
+-------------------------------------------------------------+
|                      Browser (Localhost)                    |
|                                                             |
|  +-----------------------+       +-----------------------+  |
|  | User Web Application  |       |  Flimsy Visual Client |  |
|  | (Rendered React App)  |<----->| (Shadow DOM Overlay)  |  |
|  +-----------------------+       +-----------+-----------+  |
+----------------------------------------------|--------------+
                                               | WebSocket / RPC
+----------------------------------------------|--------------+
|  Vite Dev Server Plugin / Node CLI Companion |              |
|                                              v              |
|  +-------------------------+   +-------------------------+  |
|  | Babel/SWC JSX Injector  |   |  AST Sync Engine        |  |
|  | (data-source-loc tags)  |   |  (Recast / ts-morph)    |  |
|  +-------------------------+   +-------------+-----------+  |
|                                              v              |
|                                +-------------------------+  |
|                                | Physical Source Files   |  |
|                                | (*.tsx, *.jsx)          |  |
|                                +-------------------------+  |
+-------------------------------------------------------------+
```

---

## Foundation Phases (Completed)

### Phase 0: Groundwork & Architecture Validation [COMPLETED]
- Repository setup with unified `flimsy-dev` package.
- Proof of concept: Source location injection (`data-flimsy-*`).
- Round-trip pipeline validation (DOM selection -> file coordinates -> AST update -> HMR refresh).

### Phase 1: Injected Visual Overlay & DOM Inspector [COMPLETED]
- Shadow DOM UI isolation (`attachShadow({ mode: 'open' })`).
- Deep element selection and boundary highlighting.
- Nested component hierarchy breadcrumb.
- Global activation shortcuts (`Alt + X`, `Esc`).

### Phase 2: Visual Property Controls & Live Preview [COMPLETED]
- In-situ inline text editing via `contentEditable`.
- Discrete controls for typography, padding presets, and basic layout.
- Real-time optimistic client preview with single atomic "Sync to Code".

### Phase 3: AST Transformation & Code Synchronization Engine [COMPLETED]
- AST parsing and formatting preservation using `recast`.
- Smart Tailwind class conflict reconciliation.
- Multi-format support: string literals, template strings, and `cn()` / `clsx()` utility helpers.
- Pre-write syntax validation guarding against file corruption.

### Phase 4: Change Management, Diff Review & Safety [COMPLETED]
- Studio Diff review block showing pending Tailwind class additions and deletions.
- Full session Undo/Redo buffer (`Ctrl+Z` / `Ctrl+Y`).
- Multi-instance component detection and warning.
- External file modification detection.

### Phase 5: Distribution & Packaging [COMPLETED]
- Zero-config CLI (`npx flimsy-dev@latest dev`).
- Standalone Vite plugin registration (`flimsy-dev/vite`).
- Telemetry-free, 100% local-first architecture.
- Production safety verification (zero bytes leaked in production builds).

### Phase 6: Optional AI Enhancement Layer [COMPLETED]
- Context-aware element prompt extractor (`extractAIElementContext`).
- Offline design heuristics and preset style injection into live diff preview.

---

## Figma-Grade Parity Phases [COMPLETED]

### Phase 7: Interactive Canvas Transform & 8-Point Bounding Box [COMPLETED]
**Goal:** Enable direct on-canvas stretching and resizing of any DOM element matching Figma's selection behavior.

- [x] **8-Point Handle Overlay:**
  - Added 8 interactive resize handles to `.flimsy-select-box` (North, South, East, West, corners).
  - Dynamic cursor mapping (`nwse-resize`, `nesw-resize`, `ew-resize`, `ns-resize`).
- [x] **Drag-to-Resize Math & Snapping:**
  - Coordinate tracking on pointer events calculating real-time delta width and height.
  - Snap-to-grid mapping against Tailwind scale (`w-16`, `w-24`, `w-32`, `w-48`, `w-64`, `w-full`, etc.).
  - Freeform mode with arbitrary values (`w-[280px]`, `h-[120px]`).
- [x] **Optimistic High-FPS Canvas Updates:**
  - Updates element styles directly during active drag for 60fps performance without re-parsing AST every frame.
  - Reconciles final dimensions to Tailwind classes and stages AST write on pointer release.

---

### Phase 8: Universal Color System & Property Targeting [COMPLETED]
**Goal:** Eliminate the 7-swatch limitation with a complete color spectrum picker and dedicated property targets.

- [x] **Figma-Style Color Popover:**
  - Spectrum saturation-lightness box, hue bar, and hex/rgb input.
  - Native browser eyedropper tool integration (`window.EyeDropper`).
- [x] **Dedicated Property Targets:**
  - Fill (`bg-[color]`, `bg-[color]/[alpha]`).
  - Stroke (`border-[color]`, `border-[color]/[alpha]`).
  - Text (`text-[color]`, `text-[color]/[alpha]`).
- [x] **Full Tailwind Palette Browser:**
  - Curated palette chips supporting cream, gold, charcoal, sky, emerald, rose, indigo, amber, and white.
- [x] **Alpha Opacity Slider:**
  - Direct manipulation of Tailwind opacity modifiers (e.g. `bg-amber-500/80`).

---

### Phase 9: Figma Auto Layout 5.0 Engine [COMPLETED]
**Goal:** Replace rigid layout pills with Figma's industry-standard Auto Layout controls.

- [x] **9-Point Alignment Grid Box:**
  - Interactive 3x3 alignment matrix mapping directly to flexbox combinations (`items-*` and `justify-*`).
- [x] **Direction & Wrap Controls:**
  - Row, Column, and Flex Wrap toggles.
- [x] **Gap Scrubber:**
  - Segmented buttons for container gaps (`gap-0` to `gap-8`).
- [x] **Sizing Constraints:**
  - Hug Contents (`w-fit`), Fill Container (`w-full`), and Auto (`w-auto`).
- [x] **Per-Side Padding & Margin:**
  - 4-way box inputs (Top, Right, Bottom, Left) with linked/unlinked toggle.

---

### Phase 10: Borders, Independent Radii & Visual Effects [COMPLETED]
**Goal:** Precision controls for curves, strokes, and glassmorphic elevations.

- [x] **Independent 4-Corner Radius:**
  - Individual inputs for Top-Left (`rounded-tl-*`), Top-Right (`rounded-tr-*`), Bottom-Right (`rounded-br-*`), and Bottom-Left (`rounded-bl-*`).
- [x] **Border Stroke Controls:**
  - Stroke width (0px, 1px, 2px, 4px) and style (solid, dashed, dotted).
- [x] **Visual Effects:**
  - Drop Shadow elevation presets (`shadow-none` through `shadow-2xl`).
  - Backdrop Blur slider (`backdrop-blur-none` through `backdrop-blur-lg`).
  - Layer Opacity slider (`opacity-0` through `opacity-100`).

---

### Phase 11: Interactive Layers Tree & AST Actions [COMPLETED]
**Goal:** Turn the Layers panel into an active JSX hierarchy management tool.

- [x] **Reorder Sibling Layers:**
  - Move Up and Move Down actions swapping physical `JSXElement` nodes within parent children array in `.tsx` file.
- [x] **Layer Action Toolbar:**
  - Delete action (`Delete` icon and `Delete` / `Backspace` key removes JSX element from AST).
  - Duplicate action (`Duplicate` icon and `Ctrl+D` / `Cmd+D` clones JSX element in AST).
- [x] **Direct Editor Deep Link:**
  - Displays source file and line in breadcrumb with click navigation.

---

### Phase 12: On-Canvas Spacing Scrubbers & Smart Guides [COMPLETED]
**Goal:** Direct visual feedback on the live rendered DOM.

- [x] **Dynamic Dimension & Coordinate Guides:**
  - Live dimension badge updating dynamically during drag.
- [x] **Distance Measurement Guides:**
  - Holding `Alt` while hovering over another element displays distance lines and pixel measurements.

---

## Milestone Summary

| Milestone | Deliverable | Success Criteria |
|---|---|---|
| **Phase 7** | 8-Point Canvas Stretch Handles | Drag handles stretch elements smoothly and generate clean Tailwind width/height classes. |
| **Phase 8** | Full Color Picker + Targeting | Pick any custom hex/alpha color for background, border, or text. |
| **Phase 9** | Auto Layout Matrix & Sizing | 9-point alignment box, Hug/Fill constraints, and per-side padding. |
| **Phase 10** | Independent Radii & Effects | Configure 4 independent corner curves, borders, and drop shadows. |
| **Phase 11** | Interactive AST Layers Actions | Drag layers to reorder JSX in `.tsx`, duplicate, or delete elements. |
| **Phase 12** | On-Canvas Spacing Guides | Drag padding directly on the live canvas with distance guides. |
