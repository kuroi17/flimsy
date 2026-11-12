# ⚡ Flimsy

> **"If I can visually fix my UI faster than I can explain the fix to AI, your tool has a reason to exist."**  
> *Direct UI changes synced directly to your codebase.*

[![CI](https://github.com/kuroi17/flimsy/actions/workflows/ci.yml/badge.svg)](https://github.com/kuroi17/flimsy)
[![npm version](https://img.shields.io/npm/v/flimsy.svg)](https://www.npmjs.com/package/flimsy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Telemetry](https://img.shields.io/badge/telemetry-none-brightgreen.svg)](#privacy--local-first-guarantee)

**Flimsy** is a lightweight, local-first visual editor for React and Vite projects. It brings a Figma-like direct manipulation layer straight into your running localhost browser—modifying Tailwind classes, text, and components with deterministic AST code sync.

---

## 🎯 Why Flimsy?

Current developer workflows often require taking screenshots, writing verbose prompts to an LLM, waiting for generations, and reviewing whole-file diffs just to nudge padding or change a background color.

* **Zero AI Tokens for Standard Edits:** Visual changes write directly to your physical `.tsx` files via AST manipulation using `recast`.
* **Zero Cognitive Overload:** Modern, minimalist studio dock that stays completely out of your way until you press `Alt + X`.
* **Isolated Shadow DOM:** 100% isolated inside a closed Shadow DOM container so host app styles never clash with Flimsy.
* **Smart Tailwind Reconciliation:** Category-aware conflict resolution (e.g. `p-6` cleanly overrides `px-4 py-2`, while preserving hover variants and text colors).
* **Compatible with shadcn/ui & Template Strings:** Safely modifies `cn(...)`, `clsx(...)`, and template literals without destroying dynamic expressions.

---

## 🚀 Quickstart

### Option 1: Zero-Config NPX Runner (Recommended)

Run Flimsy in your existing React + Vite project with zero installation:

```bash
npx flimsy dev
```

### Option 2: Standalone Vite Plugin

Install Flimsy as a development dependency:

```bash
pnpm add -D flimsy
# or
npm install -D flimsy
```

Add to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flimsy } from 'flimsy/vite';

export default defineConfig({
  plugins: [
    flimsy(),
    react(),
  ],
});
```

Run your development server as usual:

```bash
pnpm dev
```

---

## ⌨️ Shortcuts & Controls

| Shortcut | Action |
|---|---|
| **`Alt + X`** | Toggle Flimsy inspection mode on/off anywhere on the screen. |
| **`Esc`** | Deselect active element or dismiss the studio panel. |
| **Double Click** | Direct in-situ text editing directly on the web page element. |
| **`Ctrl + Z` / `Cmd + Z`** | Undo last visual modification. |
| **`Ctrl + Y` / `Cmd + Shift + Z`** | Redo last visual modification. |

---

## 🛡️ Privacy & Local-First Guarantee

* **100% Local-First:** Your code stays strictly on your computer.
* **Zero Telemetry:** Flimsy does not send analytics, telemetry, or tracking requests.
* **Production-Safe:** Flimsy transforms only activate in Vite's development mode (`apply: 'serve'`). In production builds, zero bytes of Flimsy code or debug attributes are ever bundled.

---

## 📦 Packages in Monorepo

* **[`flimsy`](packages/cli)**: Main CLI runner and package exports (`npx flimsy dev`).
* **[`@flimsy/vite`](packages/vite-plugin)**: Vite development server plugin, overlay injector, and dev update API.
* **[`@flimsy/core`](packages/core)**: AST location injector (`magic-string`), deterministic file reconciler (`recast`), and conflict solver.

---

## 📄 License

MIT © [kuroi17](https://github.com/kuroi17)
