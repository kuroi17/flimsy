<p align="center">
  <img src="./assets/logo.webp" alt="Flimsy Logo" width="140" />
</p>

<h1 align="center">Flimsy</h1>

<p align="center">
  <strong>Direct visual-to-code synchronization for React, Vite, and Tailwind CSS.</strong><br />
  If you can visually fix a UI faster than explaining the fix to an LLM, Flimsy belongs in your workflow.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flimsy-dev"><img src="https://img.shields.io/npm/v/flimsy-dev.svg" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="#privacy--local-first-guarantee"><img src="https://img.shields.io/badge/telemetry-none-brightgreen.svg" alt="Zero Telemetry" /></a>
</p>

---

**Flimsy** embeds an isolated, glassmorphic visual studio directly on your running Vite localhost server. Edit Tailwind spacing, typography, layout, colors, and inline text directly in the browser, preview the exact diff, and write deterministic AST changes straight back into your `.tsx` source files with zero AI token overhead.

## Why Flimsy

- **Zero AI Tokens for Standard Visual Edits:** Modifies your `.tsx` files directly via deterministic AST reconciliation (`recast` + `magic-string`), preserving formatting, comments, and dynamic expressions.
- **Minimalist Floating Studio:** Frosted glass dock, collapsible Layers tree, and compact Inspector inspired by Figma's spatial clarity.
- **Isolated Shadow DOM:** Mounted inside an open Shadow DOM host so Flimsy styles never bleed into or break your application CSS.
- **Smart Tailwind Conflict Resolution:** Category-aware reconciliation (`p-6` cleanly overrides `px-4 py-2`, `text-sm` never collides with `text-white` or `dark:` variants).
- **Compatible with `cn()`, `clsx()`, and Template Literals:** Safely edits utility helper calls and dynamic class expressions without stripping logic.
- **Optional Zero-Token AI Assist:** Collapsible heuristic style presets plus one-click context-aware prompt packaging for Cursor or Claude Code.

---

## Quickstart

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

### Option 2: Install as a Dev Dependency

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

Start your normal Vite server:

```bash
npm run dev
```

---

## Shortcuts & Studio Controls

| Shortcut / Action | Behavior |
|---|---|
| `Alt + X` | Toggle visual inspection mode on or off anywhere on the page. |
| `Esc` | Deselect active element, or close inspection mode when idle. |
| `Double-Click` | Edit element text directly inline (`contentEditable`) on the live page. |
| `Ctrl + Z` / `Cmd + Z` | Undo the last visual modification in your current session. |
| `Ctrl + Y` / `Cmd + Shift + Z` | Redo a previously undone modification. |
| Bottom Floating Pill | Switch inspect cursor, inline text tool, Layers tree, AI Assist, and Undo/Redo. |

---

## Privacy & Local-First Guarantee

- **100% Local-First:** Source AST reads and writes happen strictly on your local machine.
- **Zero Telemetry:** Flimsy makes zero external tracking, analytics, or network requests.
- **Production-Safe:** The Vite plugin only runs during local development (`apply: 'serve'`). Running `vite build` bundles zero bytes of Flimsy runtime scripts or `data-flimsy-*` attributes.

---

## Architecture

Published as one unified package (**[`flimsy-dev`](packages/cli)**) bundling:

- **CLI Runner (`npx flimsy-dev dev`):** Zero-config development launcher ([`packages/cli`](packages/cli)).
- **Vite Plugin (`flimsy-dev/vite`):** Development server plugin, Shadow DOM visual studio, and update API ([`packages/vite-plugin`](packages/vite-plugin)).
- **AST Sync Engine:** JSX source coordinate injector (`magic-string`), deterministic file reconciler (`recast`), and external edit conflict guard ([`packages/core`](packages/core)).

---

## License

MIT — [kuroi17](https://github.com/kuroi17)
