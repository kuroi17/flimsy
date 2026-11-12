# Phase Plan: Flimsy (Visual-to-Code Synchronization Tool)

**Product Vision:** A Figma-like visual editor directly on localhost that deterministically writes UI edits back into your JSX/Tailwind codebase with zero AI prompt overhead.  
**Target MVP Stack:** React + Vite + TypeScript + Tailwind CSS  
**Distribution Model:** NPM Package (`@flimsy/core`, `@flimsy/vite`) & NPX CLI runner (`npx flimsy`)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Localhost)                    │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ User Web Application  │       │  Flimsy Visual Client │  │
│  │ (Rendered React App)  │◄─────►│ (Shadow DOM Overlay)  │  │
│  └───────────────────────┘       └───────────┬───────────┘  │
└──────────────────────────────────────────────┼──────────────┘
                                               │ WebSocket / RPC
┌──────────────────────────────────────────────┼──────────────┐
│  Vite Dev Server Plugin / Node CLI Companion │              │
│                                              ▼              │
│  ┌─────────────────────────┐   ┌─────────────────────────┐  │
│  │ Babel/SWC JSX Injector  │   │  AST Sync Engine        │  │
│  │ (data-source-loc tags)  │   │  (Recast / ts-morph)    │  │
│  └─────────────────────────┘   └─────────────┬───────────┘  │
│                                              ▼              │
│                                ┌─────────────────────────┐  │
│                                │ Physical Source Files   │  │
│                                │ (*.tsx, *.jsx)          │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Groundwork & Architecture Validation (Week 1) [COMPLETED]
**Goal:** Prove the round-trip pipeline from DOM selection $\to$ file coordinates $\to$ AST update $\to$ HMR refresh.

- [x] **Repository Setup & Monorepo Scaffold**
  - Setup package structure:
    - `packages/cli`: CLI launcher (`npx flimsy dev`).
    - `packages/vite-plugin`: Vite middleware & transform hooks.
    - `packages/core`: AST parser, Tailwind reconciler, file I/O engine.
    - `packages/overlay`: Web UI overlay (vanilla Web Component in Shadow DOM).
  - Setup a sample testbed app: React 19 + Vite 6 + Tailwind CSS 3.
- [x] **Proof of Concept: Source Location Injection**
  - Implement a Babel/SWC AST transform during Vite dev build.
  - Automatically stamp JSX elements with metadata:
    ```html
    <button data-flimsy-file="src/components/Hero.tsx" data-flimsy-line="16" data-flimsy-col="8">
    ```
- [x] **Proof of Concept: The Round Trip**
  - Verified that clicking a tagged element, reading `data-flimsy-*`, sending a POST payload to Vite server, mutating the target file with text/classes, and seeing Vite HMR update works seamlessly without page refresh.

---

## Phase 1: Injected Visual Overlay & DOM Inspector (Weeks 2–3) [COMPLETED]
**Goal:** Build a non-destructive, Figma-like selection and inspection experience in the browser.

- [x] **Shadow DOM UI Isolation**
  - Mounted Flimsy UI inside an isolated Shadow DOM container (`attachShadow({ mode: 'open' })`) preventing any style leakage to or from the host application.
- [x] **Interactive Hover & Click Selector**
  - Deep element picker: hover highlights element bounds with smooth outline, dimension badge ($W \times H$), and corner handles.
  - Element info badge: displays tag name, component context, dimensions ($W \times H$), and source file + line.
  - Nested hierarchy breadcrumb: computes full parent hierarchy trail (`App:<main> › Hero:<div> › <button>`), allowing one-click selection of ancestor containers.
  - Global toggle shortcut (`Alt + X` or floating toggle pill) to enable/disable visual inspect mode seamlessly; `Esc` to close or deselect.
- [x] **Component Boundary Detection**
  - Distinguishes between native HTML element (`<button>`) and custom component boundary (`<Hero />`).
  - Displays component context and scope (`Component Definition` vs invocation layout).

---

## Phase 2: Visual Property Controls & Live Preview (Weeks 4–5) [COMPLETED]
**Goal:** Provide an intuitive property panel (similar to Figma/DevTools) that lets developers visually tweak common UI styling.

- [x] **Typography Controls**
  - Direct double-click text editing (enables in-situ `contentEditable` directly on the webpage element).
  - Clean typography controls: font size (`xs` to `2xl`), weight (`Regular` to `Bold`), alignment (`Left`, `Center`, `Right`).
  - Swatch-based color theme palette with instant contrast matching.
- [x] **Spacing & Sizing (Box Model)**
  - Segmented controls for padding (`p-0` through `p-8`) and border radius (`none`, `md`, `lg`, `xl`, `full`).
  - Real-time dimension badge updating dynamically on element mutation.
- [x] **Styling & Layout Controls**
  - Instant theme color swatches (`slate`, `sky`, `emerald`, `indigo`, `rose`, `white`, `transparent`).
  - Layout & flex toggles: direction (`row`, `col`), justification (`start`, `center`, `between`).
- [x] **Instant Optimistic Preview**
  - Zero-lag, category-aware client preview: class and text mutations apply immediately in-memory to the live DOM before syncing.
- [x] **Multi-Action Atomic Sync**
  - Single unified "Sync to Code" action supporting combined text and class mutations in one atomic AST write.

---

## Phase 3: AST Transformation & Code Synchronization Engine (Weeks 6–7) [COMPLETED]
**Goal:** Cleanly, deterministically update physical `.tsx` / `.jsx` files without breaking code structure, formatting, or comments.

- [x] **AST Parsing & Formatting Preservation**
  - Uses `recast` with Babel TSX/JSX parser ensuring 100% of untouched code, comments, and whitespace remain identical.
- [x] **Smart Tailwind Class Reconciler**
  - Parses existing `className` attributes with category awareness.
  - Intelligent multi-axis conflict resolution:
    - Master padding (`p-6`) cleans up directional padding (`px-4`, `py-2`).
    - Updating background color (`bg-emerald-500`) preserves hover variants (`hover:bg-blue-600`) and text colors (`text-white`).
  - Class name format support:
    - String literals: `className="bg-white p-4"`
    - Template strings: `className={`p-4 bg-white ${active ? '...' : ''}`}` (safely updating static quasi strings without corrupting `${...}` expressions).
    - Utility helpers: Native support for `cn(...)`, `clsx(...)`, and `cva(...)` function call arguments (shadcn/ui compatibility).
- [x] **Text Node AST Sync**
  - Safely replaces target `JSXText` nodes while preserving all surrounding `JSXExpressionContainer` dynamic expressions (e.g. `Hello, {name}!`).
- [x] **Atomic File Writing with Pre-write Syntax Validation**
  - Validates AST output against Babel parser before disk write; automatically aborts with safety rollback if syntax validation fails, ensuring developer files are never corrupted.

---

## Phase 4: Change Management, Diff Review & Safety (Week 8) [COMPLETED]
**Goal:** Give developers full visibility and trust over the changes applied to their code.

- [x] **Pending Changes & Diff Preview Drawer**
  - Integrated, expandable diff block inside the Studio Panel showing real-time added/deleted Tailwind classes and text changes.
  - Dedicated "Reset" action to discard pending changes with one click.
- [x] **Undo / Redo Buffer**
  - Full session history stack supporting `Ctrl+Z` / `Cmd+Z` (Undo) and `Ctrl+Y` / `Cmd+Shift+Z` (Redo).
  - Minimalist `↶` and `↷` toolbar buttons with dynamic active/disabled states.
- [x] **Multiple Instance Warning**
  - Automatically scans the live DOM for shared component usages (`document.querySelectorAll('[data-flimsy-file="..."]')`).
  - Alerts developer with a subtle amber badge when modifying a component rendered in multiple places (e.g. `⚠️ 2 instances on page`).
- [x] **External File Modification Detection**
  - Records file `mtime` upon selection and inspects disk state prior to writing.
  - Warns developer if the file was modified in VS Code or externally while Flimsy was open, providing "Force Overwrite" safety gates.

---

## Phase 5: Distribution, NPX Packaging & Polish (Weeks 9–10) [COMPLETED]
**Goal:** Provide a seamless 5-second developer setup experience.

- [x] **Zero-Config CLI (`npx flimsy dev`)**
  - Enhanced CLI executable (`packages/cli/bin/flimsy.js`) supporting `--port`, `--host`, `--open`, and graceful termination.
  - Automatically locates Vite in the project root and launches the dev server with Flimsy visual editing pre-configured.
- [x] **Standalone Vite Plugin Option (`@flimsy/vite`)**
  - Fully typed package manifests (`package.json`), dual exports, MIT license, and publishing configurations across all monorepo packages.
- [x] **Compatibility Testing & Production Safety Guarantee**
  - Automated production build tests (`packages/vite-plugin/test/production-safety.test.ts`) guaranteeing zero Flimsy code or debug attributes in production bundles.
- [x] **Telemetry-Free, Local-First Guarantee**
  - 100% offline-ready, zero telemetry, zero analytics tracking. Comprehensive root `README.md` and documentation.

---

## Phase 6: Optional AI Enhancement Layer (Future / Post-MVP)
**Goal:** Enable contextual AI queries for complex tasks without forcing AI into simple edits.

- [ ] **Context-Aware Prompting**
  - User selects element $\to$ clicks "Ask AI".
  - Flimsy packages the exact AST snippet, parent container context, and computed CSS.
  - Developer inputs prompt: *"Make this card responsive for mobile"* or *"Add a smooth glassmorphism style"*.
- [ ] **AI Diff Preview & Approval**
  - Streams AI code modification into the standard Flimsy Diff Preview drawer for user review and 1-click apply.

---

## Milestone Summary

| Milestone | Deliverable | Success Criteria |
|---|---|---|
| **M0 (PoC)** | Round-trip pipeline | Click button $\to$ update file $\to$ HMR reloads in < 200ms. |
| **M1 (Inspector)** | Shadow DOM overlay | Inspect elements without style bleeding or breaking app state. |
| **M2 (Controls)** | Property panel | Visual controls for typography, padding/margin, and colors. |
| **M3 (AST Sync)** | AST engine | Clean Tailwind class updates in `.tsx` files without corrupting code. |
| **M4 (Safety)** | Diff & Undo | Diff viewer and multi-instance guard. |
| **M5 (MVP Release)** | NPX CLI | `npx flimsy dev` works out of the box on a fresh React + Tailwind project. |

