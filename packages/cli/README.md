<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/flimsy-dev@0.2.0/assets/logo.jpg" alt="Flimsy Logo" width="140" />
</p>

<h1 align="center">Flimsy</h1>

<p align="center">
  <strong>Direct visual-to-code synchronization for modern frontend frameworks and Tailwind CSS.</strong><br />
  If you can visually fix a UI faster than explaining the fix to an LLM, Flimsy belongs in your workflow.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flimsy-dev"><img src="https://img.shields.io/npm/v/flimsy-dev.svg" alt="npm version" /></a>
  <a href="https://github.com/kuroi17/flimsy/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="#privacy--local-first-guarantee"><img src="https://img.shields.io/badge/telemetry-none-brightgreen.svg" alt="Zero Telemetry" /></a>
</p>

---

**Flimsy** embeds an isolated, glassmorphic visual studio directly on your running Vite localhost server. Move, resize, scale, style, duplicate, and reparent React/Tailwind elements directly in the browser, preview the exact diff, and write deterministic AST changes straight back into your `.tsx` source files with zero AI token overhead.

## Key Capabilities

- **Multi-Language Frontend Support:** Works deterministically across **React, Preact, SolidJS, Qwik, Vue JSX** (`.tsx`/`.jsx` with `className` and `class`), **Vue SFC** (`.vue`), **Svelte** (`.svelte`), **Astro** (`.astro`), and **Vanilla HTML / Angular / HTMX / Alpine** (`.html`/`.htm`).
- **Zero AI Tokens for Standard Visual Edits:** Writes directly to your source files via deterministic AST & span reconciliation (`recast` + `magic-string`), preserving formatting, comments, directives, and dynamic expressions.
- **Figma-Style Direct Manipulation:** Freeform canvas drag-to-move (`Rel` / `Abs`), 8-point resize with aspect-ratio lock (`Shift`), Canva/Figma corner text scaling, rotation handle, `Alt` distance measurement guides, and `Alt + Drag` live DOM reparenting.
- **Viewport Zoom & Pan Camera:** Smooth cursor-anchored zoom (`Ctrl + Scroll` / pinch, `25%–300%`) and canvas panning (`Space + Drag`, Hand tool `H`, middle-mouse drag) without polluting user source code.
- **Multi-Select & Group Copy/Paste:** Marquee select, `Shift + Click`, or `Ctrl + A` to select sibling elements/frames, then drag, style, or `Ctrl + C` / `Ctrl + V` cloned JSX cleanly into target `.tsx` files.
- **Full Visual Studio Controls:** 2D HSV rainbow color picker with alpha + eyedropper (Fill, Text, Stroke), searchable Google Fonts picker, Auto Layout alignment matrix, individual border sides & corners, opacity, and collapsible Layers tree with drag-and-drop reparenting.
- **Isolated Shadow DOM & Tailwind Reconciliation:** Mounted in an open Shadow DOM so Flimsy styles never leak into your app; works seamlessly with `cn()`, `clsx()`, and template literal `className` expressions.
- **Optional Zero-Token AI Assist:** Collapsible offline heuristic presets plus one-click context-aware prompt packaging for Cursor, Claude Code, or other coding agents.

---

## Installation & Quickstart

### Option 1: Zero-Install CLI (`npx`)

Run Flimsy inside any existing React + Vite + Tailwind project:

```bash
npx flimsy-dev@latest dev
```

Useful CLI flags:

```bash
npx flimsy-dev@latest dev --open        # Automatically launch browser
npx flimsy-dev@latest dev --port 5173   # Custom Vite dev port
npx flimsy-dev@latest dev --host        # Expose server on local network
npx flimsy-dev@latest --version       # Check CLI version
```

### Option 2: Install as a Dev Dependency (`npm` / `pnpm`)

Install the unified `flimsy-dev` package (includes CLI, Vite plugin, and AST engine):

```bash
npm install -D flimsy-dev
# or
pnpm add -D flimsy-dev
```

Register the plugin in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flimsy } from 'flimsy-dev/vite';

export default defineConfig({
  plugins: [
    flimsy(),
    react(),
  ],
});
```

Start your normal Vite dev server:

```bash
npm run dev
```

### Option 3: Optional MCP Server (Manual First, AI When Needed)

Flimsy ships an opt-in, zero-bloat stdio MCP server (`flimsy-dev mcp`) for Cursor, Claude Code, or Antigravity when you want an AI agent to inspect or edit the exact element you selected in the browser:

```json
{
  "mcpServers": {
    "flimsy": {
      "command": "npx",
      "args": ["-y", "flimsy-dev@latest", "mcp", "--root", "/path/to/your/project"]
    }
  }
}
```

Exposed MCP tools:
- `flimsy_get_selection` — Reads the currently selected element(s) from your live Flimsy browser session (file, line, column, JSX snippet, Tailwind classes, text), or inspects any explicit `{ file, line, col }`.
- `flimsy_update_classes` — Reconciles Tailwind classes deterministically via Flimsy AST (preserving `cn()`, `clsx()`, and formatting).
- `flimsy_update_text` — Updates element text content while preserving inline JSX expressions.
- `flimsy_paste_elements` — Inserts validated JSX snippets `after` or `inside` a target element.

### Option 4: Install Agent Skill (`npx skills`)

Teach Claude Code, Cursor, Codex, or Antigravity how to launch Flimsy and consume live browser selections:

```bash
npx skills add kuroi17/flimsy
```

---

## Shortcuts & Studio Controls

| Shortcut / Action | Behavior |
|---|---|
| `Alt + X` | Toggle visual inspection mode on or off anywhere on the page. |
| `V` / `H` | Switch between Select cursor (`V`) and Hand pan tool (`H`). |
| `Space + Drag` / Middle-Click | Temporarily pan the viewport horizontally and vertically. |
| `Ctrl + Scroll` / Pinch | Zoom in or out anchored to the cursor (`25%–300%`). |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | Zoom in, zoom out, or reset viewport to `100%`. |
| `Drag Element` (`Shift` lock) | Move selected element(s) on canvas (`Rel` translate or `Abs` left/top). |
| `Alt + Drag Element` | Live canvas DOM reparenting (move before, after, or inside a container). |
| `Corner Drag` (`Shift` ratio) | Resize boxes or pull text corners to scale font size directly. |
| `Arrow Keys` (`Shift` 10px) | Nudge selected element(s) by `1px` or `10px`. |
| `Alt + Hover` | Show pixel distance measurement guides to surrounding elements. |
| `Shift + Click` / Marquee Drag | Select multiple elements for batch styling, dragging, or copy/paste. |
| `Ctrl + A` / `Cmd + A` | Select all sibling elements in the current container (press again to expand up). |
| `Ctrl + C` / `Ctrl + V` | Copy and paste selected element(s) as clean JSX synced into `.tsx` via HMR. |
| `Ctrl + D` / `Delete` | Duplicate or delete selected JSX element directly in AST. |
| `Double-Click` | Edit element text inline (`contentEditable`) on the live page. |
| `Shift + S` / `Ctrl + S` | Commit all pending visual edits atomically to `.tsx` source files. |
| `Ctrl + Z` / `Ctrl + Y` | Undo or redo visual changes in the current session. |
| `Esc` | Close active popover, deselect element(s), or exit inspect mode. |

---

## Privacy & Local-First Guarantee

- **100% Local-First:** Source AST reads and writes happen strictly on your local machine.
- **Zero Telemetry:** Flimsy makes zero external tracking, analytics, or network requests.
- **Production-Safe:** The Vite plugin only runs during local development (`apply: 'serve'`). Running `vite build` bundles zero bytes of Flimsy runtime scripts or `data-flimsy-*` attributes.

---

## Architecture

Published as one unified npm package (**[`flimsy-dev`](https://www.npmjs.com/package/flimsy-dev)**) bundling:

- **CLI Runner (`npx flimsy-dev dev`):** Zero-config development launcher.
- **Vite Plugin (`flimsy-dev/vite`):** Development server plugin, Shadow DOM visual studio, and live sync API.
- **AST Sync Engine:** JSX source coordinate injector (`magic-string`), deterministic file reconciler (`recast`), snippet extractor, and external edit conflict guard.

---

## License

MIT — [kuroi17](https://github.com/kuroi17)
