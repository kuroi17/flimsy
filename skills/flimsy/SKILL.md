---
name: flimsy
description: Launch and work with Flimsy, a local-first visual editor and AST sync studio for React, Preact, SolidJS, Qwik, Vue, Svelte, Astro, Angular HTML, and Vanilla HTML with Tailwind CSS. Use when the user wants to visually edit UI on localhost, install or configure flimsy-dev, or refine an element selected in the Flimsy browser studio via MCP.
---

# Flimsy Visual-to-Code Workflow

Flimsy lets developers visually move, resize, scale, style, duplicate, and reparent elements on localhost and write deterministic AST/markup changes directly into `.tsx`, `.jsx`, `.vue`, `.svelte`, `.astro`, and `.html` source files with zero AI tokens for standard edits.

## 1. Launch Visual Studio (Zero Install)

Inside any React + Vite + Tailwind project:

```bash
npx flimsy-dev@latest dev
```

Or install permanently as a dev dependency and register the Vite plugin:

```bash
npm install -D flimsy-dev
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flimsy } from 'flimsy-dev/vite';

export default defineConfig({
  plugins: [flimsy(), react()],
});
```

For **Next.js** (`next.config.mjs` / `next.config.ts`):

```js
import { withFlimsy } from 'flimsy-dev/next';

export default withFlimsy({});
```

In the browser, press `Alt + X` to toggle inspect mode and `Shift + S` (or `Ctrl + S`) to commit visual edits to `.tsx`.

## 2. Optional MCP Integration (Manual First, AI When Needed)

Register the built-in stdio MCP server in Cursor, Claude Code, or Antigravity:

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

### When the user references an element selected in Flimsy

1. Call `flimsy_get_selection` first (with no arguments) to read the exact file, line, column, component, JSX snippet, Tailwind classes, and text of the active browser selection.
2. Prefer Flimsy's deterministic AST tools for targeted visual edits instead of rewriting entire files:
   - `flimsy_update_classes` — reconciles Tailwind utility classes cleanly while preserving `cn()`, `clsx()`, comments, and formatting.
   - `flimsy_update_text` — updates visible text while preserving inline `{expressions}`.
   - `flimsy_paste_elements` — inserts Babel-validated JSX snippets `after` or `inside` the selected element.
3. Never inject `data-flimsy-*` attributes manually; the Vite plugin handles them in dev mode only and strips zero-footprint in production builds.
