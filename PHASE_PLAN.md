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

## Phase 2: Visual Property Controls & Live Preview (Weeks 4–5)
**Goal:** Provide an intuitive property panel (similar to Figma/DevTools) that lets developers visually tweak common UI styling.

- [ ] **Typography Controls**
  - Direct double-click text editing (inline contentEditable preview).
  - Font size, weight, text alignment, line height.
  - Color picker (Hex, RGBA, Tailwind color palette swatches).
- [ ] **Spacing & Sizing (Box Model)**
  - Interactive box model inspector: visual margin, padding, width, height controls.
  - Visual nudge handles (click & drag edge handles to adjust padding/margin/width).
- [ ] **Styling & Layout Controls**
  - Background color, border radius (sliders: `rounded-sm`, `rounded-lg`, `rounded-full`), border width, border color.
  - Opacity and box shadows.
  - Flexbox / Grid toggles: flex direction, alignment (`items-center`), justification (`justify-between`), gap.
- [ ] **Instant Optimistic Preview**
  - Apply changes instantly in-memory to the live DOM node for zero-lag preview while dragging or selecting values.

---

## Phase 3: AST Transformation & Code Synchronization Engine (Weeks 6–7)
**Goal:** Cleanly, deterministically update physical `.tsx` / `.jsx` files without breaking code structure, formatting, or comments.

- [ ] **AST Parsing & Formatting Preservation**
  - Use `recast` or `@babel/parser` + `@babel/generator` with exact source mapping to preserve code formatting, indentation, and comments.
- [ ] **Smart Tailwind Class Reconciler**
  - Parse existing `className` attributes.
  - Intelligent conflict resolution:
    - If user sets padding to `p-6`, remove conflicting classes (`p-2`, `px-4`, `py-1`).
    - If user updates background color, replace `bg-red-500` with `bg-blue-600` without removing hover/focus variants (`hover:bg-red-700`).
  - Class name format support:
    - String literals: `className="bg-white p-4"`
    - Template strings: `className={`text-sm ${active ? '...' : ''}`}`
    - Utility helpers: Handle `cn(...)` / `clsx(...)` array/object arguments safely.
- [ ] **Text Node AST Sync**
  - Safely replace JSXText child nodes when text is edited inline, preserving expressions (`{user.name}`).
- [ ] **Atomic File Writing**
  - Safe writes with backup/rollback if parse or AST write fails.

---

## Phase 4: Change Management, Diff Review & Safety (Week 8)
**Goal:** Give developers full visibility and trust over the changes applied to their code.

- [ ] **Pending Changes & Diff Preview Drawer**
  - Bottom/side drawer listing all queued edits.
  - Side-by-side git-style code diff preview before hitting "Apply".
- [ ] **Undo / Redo Buffer**
  - Standard `Ctrl+Z` / `Ctrl+Y` support during the visual editing session.
- [ ] **Multiple Instance Warning**
  - If an edited element belongs to a shared component used in multiple places, warn the user:
    *"Editing `Card.tsx` will affect 4 instances on this page."*
- [ ] **External File Modification Detection**
  - Detect if file was changed in VS Code while editing in Flimsy to prevent overwriting newer changes.

---

## Phase 5: Distribution, NPX Packaging & Polish (Weeks 9–10)
**Goal:** Provide a seamless 5-second developer setup experience.

- [ ] **Zero-Config CLI (`npx flimsy dev`)**
  - Detects project root, reads `vite.config.ts`, and launches with plugin auto-injected.
- [ ] **Standalone Vite Plugin Option (`@flimsy/vite`)**
  - For projects that prefer an installed devDependency:
    ```ts
    // vite.config.ts
    import { flimsy } from '@flimsy/vite';
    export default defineConfig({
      plugins: [react(), flimsy()]
    });
    ```
- [ ] **Compatibility Testing**
  - Test suites covering:
    - Standard Vite + React + Tailwind 3 / 4
    - shadcn/ui components
    - Next.js (experimental/alpha compatibility)
- [ ] **Telemetry-Free, Local-First Guarantee**
  - 100% offline-ready, no telemetry, no cloud requirement.

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

