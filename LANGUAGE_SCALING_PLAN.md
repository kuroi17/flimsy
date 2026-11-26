# Flimsy Multi-Language Scaling Plan

**Goal:** Scale Flimsy from a React-only (`.tsx`/`.jsx`) visual-to-code engine to a universal, zero-bloat frontend visual synchronization engine supporting all major frontend languages and frameworks while preserving deterministic AST/span rewrites, zero external compiler bloat, and zero production footprint.

---

## 1. Current Bottleneck Audit

Prior to this milestone, Flimsy hardcoded JSX/React assumptions across four layers:

1. **Injector (`packages/core/src/injector.ts`):** Restricted to `/\.[jt]sx$/` and parsed exclusively via `@babel/parser`. Non-JSX templates (`.vue`, `.svelte`, `.astro`, `.html`) were ignored.
2. **Updater (`packages/core/src/updater.ts`):** Parsed files exclusively via `recast` + `@babel/parser` and only inspected `className` attributes — missing `class` attributes used by SolidJS, Preact, Qwik, Vue, Svelte, Astro, Angular, and Vanilla HTML.
3. **AI & MCP Context (`packages/core/src/ai.ts`, `packages/cli/src/mcp.ts`):** Extracted element snippets and class lists only from Babel JSX ASTs, preventing MCP tools (`flimsy_get_selection`, `flimsy_update_classes`, `flimsy_update_text`, `flimsy_paste_elements`) from operating on Vue, Svelte, Astro, or HTML files.
4. **Vite Plugin (`packages/vite-plugin/src/index.ts`):** `transform()` rejected any file outside `.[jt]sx`, and `transformIndexHtml()` injected `/@flimsy/client.js` without stamping static HTML elements for Vanilla HTML / HTMX / Alpine apps.

---

## 2. Frontend Language Coverage Matrix

The entire modern frontend ecosystem cleanly maps onto **two** deterministic template families behind one unified language router (`detectLanguage()`):

| Language Family | Extensions | Frameworks / Stacks Covered | Class Attribute Convention | Dynamic Class Bindings Preserved |
|---|---|---|---|---|
| **JSX / TSX** (`jsx`) | `.tsx`, `.jsx` | **React**, **Next.js (JSX)**, **Preact**, **SolidJS**, **Qwik**, **Vue JSX** | Auto-detected per element/file (`className` or `class`) | `cn()`, `clsx()`, `twMerge()`, template literals, `classList` |
| **Vue SFC** (`vue`) | `.vue` | **Vue 3**, **Vue 2**, **Nuxt (SFC)** | `class` inside top-level `<template>` | `:class`, `v-bind:class`, directives (`v-if`, `v-for`, `@click`) |
| **Svelte** (`svelte`) | `.svelte` | **Svelte 4**, **Svelte 5**, **SvelteKit** | `class` outside `<script>` / `<style>` | `class:active={...}`, `{#if}`, `{#each}`, `{expr}`, `on:*` |
| **Astro** (`astro`) | `.astro` | **Astro 4 / 5** | `class` after `---` frontmatter, outside `<script>` / `<style>` | `class:list={...}`, `{expr}`, client directives |
| **HTML Templates** (`html`) | `.html`, `.htm` | **Vanilla HTML**, **Angular** (`.component.html`), **HTMX**, **Alpine.js**, **Web Components** | `class` inside `<body>` or template fragment | `[ngClass]`, `[class.x]`, `x-bind:class`, `:class`, `hx-*`, `{{ expr }}` |

---

## 3. Architecture: Zero-Dependency Unified Adapter Layer

Adding heavy framework-specific compilers (`@vue/compiler-sfc`, `svelte/compiler`, `@astrojs/compiler`, `parse5`) would bloat `flimsy-dev` from ~300 KB to 25+ MB and introduce major-version coupling across framework releases.

Instead, `flimsy-core` introduces a compact, deterministic **language router + span-accurate markup parser** with zero new dependencies:

```text
                      +-----------------------------------+
                      |   flimsy-core Public API          |
                      |   - injectSourceLocations()       |
                      |   - updateSourceFile()            |
                      |   - extractJSXSnippets()          |
                      |   - extractAIElementContext()     |
                      +-----------------+-----------------+
                                        |
                             detectLanguage(filePath)
                                        |
                 +----------------------+----------------------+
                 |                                             |
          'jsx' (.tsx, .jsx)                      'vue' | 'svelte' | 'astro' | 'html'
                 |                                             |
     +-----------v-----------+                    +------------v------------+
     | Babel + Recast Engine |                    | Markup Template Engine  |
     | (React/Solid/Preact/  |                    | (markup-parser.ts +     |
     |  Qwik/Vue JSX)        |                    |  markup-updater.ts)     |
     | - className & class   |                    | - Region scoping        |
     | - cn()/clsx()/tpl     |                    | - Balanced {} tracking  |
     | - Babel syntax guard  |                    | - MagicString rewrites  |
     +-----------------------+                    | - Balanced tag guard    |
                                                  +-------------------------+
```

### Core Modules

1. **`packages/core/src/languages.ts`**
   - Single source of truth for `FlimsyLanguage = 'jsx' | 'vue' | 'svelte' | 'astro' | 'html'`.
   - `detectLanguage(filePath)`, `isSupportedSourceFile(filePath)`, `isMarkupLanguage(lang)`.
2. **`packages/core/src/markup-parser.ts`**
   - Deterministic character-level tokenizer and tree builder producing span-accurate `MarkupElement` nodes (`start`, `end`, `openStart`, `openEnd`, `tagNameEnd`, `closeStart`, `line`, `column`, `attrs`, `children`, `parent`, `textSegments`).
   - **Language-aware region scoping:**
     - **Vue:** Locates the root `<template>...</template>` block while correctly counting nested `<template v-if>` / `<template #slot>` tags; ignores `<script>` and `<style>`.
     - **Astro:** Skips leading `--- ... ---` frontmatter fence; ignores `<script>` and `<style>`.
     - **Svelte:** Parses template markup; treats `<script>` and `<style>` as opaque raw text; tracks nested `{...}` blocks (with string/comment awareness) so `>` inside expressions like `on:click={() => a > b}` or `{#if count > 0}` never terminates a tag prematurely.
     - **HTML / Angular:** Skips `<!DOCTYPE>`, HTML comments `<!-- ... -->`, `<head>...</head>`, `<script>`, and `<style>`; supports both full HTML documents and component template fragments (`.component.html`).
   - **Void tag handling:** Full HTML5 void element set (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`).
   - **Structural validator (`validateMarkupSyntax`):** Verifies balanced tags and clean parsing before any disk write so malformed output is aborted before touching user source files.
3. **`packages/core/src/markup-updater.ts`**
   - Implements full operation parity on `MarkupElement` trees using `MagicString` and shared `reconcileClasses()`:
     - `injectMarkupSourceLocations(code, id, lang, options)`
     - `updateMarkupSourceFile(code, lang, options)`
     - `extractMarkupSnippets(code, lang, locs)`
     - `extractMarkupAIContext(code, lang, options)`
4. **JSX Adapter Enhancements (`packages/core/src/updater.ts`, `packages/core/src/ai.ts`)**
   - Supports both `className` (React) and `class` (SolidJS, Preact, Qwik, Vue JSX).
   - Auto-detects existing attribute name on the target element, falling back to the file's dominant convention (`class` vs `className`) when adding classes to an unstyled element.

---

## 4. Full Operation Parity Across All Languages

Every Flimsy studio action and MCP tool must behave identically regardless of source language:

| Operation | JSX / TSX (`React`, `Solid`, `Preact`, `Qwik`) | Vue (`.vue`) | Svelte (`.svelte`) | Astro (`.astro`) | HTML / Angular (`.html`, `.htm`) |
|---|---|---|---|---|---|
| **Source Injection (`data-flimsy-*`)** | Babel + MagicString | `<template>` root only | Outside `<script>`/`<style>` | Post-`---` markup | Body / fragment (skips SPA `#root`/`#app` mounts) |
| **Tailwind Class Reconcile (`update-class`)** | `className` or `class`, `cn()`, `clsx()`, tpl | Static `class`, preserves `:class` | Static `class`, preserves `class:*` | Static `class`, preserves `class:list` | Static `class`, preserves `[ngClass]`/`x-bind:class` |
| **Inline Text Edit (`update-text`)** | Preserves `{expr}` | Preserves `{{ expr }}` | Preserves `{expr}` / `{#if}` | Preserves `{expr}` | Preserves `{{ expr }}` & child elements |
| **Delete Element (`delete-element`)** | AST remove | Span remove | Span remove | Span remove | Span remove |
| **Duplicate Element (`duplicate-element`)** | AST clone | Span slice clone | Span slice clone | Span slice clone | Span slice clone |
| **Reorder Sibling (`reorder-child`)** | Parent children swap | Sibling span swap | Sibling span swap | Sibling span swap | Sibling span swap |
| **Reparent (`reparent-element`)** | `before`/`after`/`inside` + cycle guard | `before`/`after`/`inside` + cycle guard | `before`/`after`/`inside` + cycle guard | `before`/`after`/`inside` + cycle guard | `before`/`after`/`inside` + cycle guard |
| **Group Copy / Paste (`Ctrl+C` / `Ctrl+V`)** | Deduped JSX snippets | Deduped markup snippets | Deduped markup snippets | Deduped markup snippets | Deduped markup snippets |
| **AI Context & MCP (`flimsy-dev mcp`)** | Full 4-tool support | Full 4-tool support | Full 4-tool support | Full 4-tool support | Full 4-tool support |
| **Pre-Write Safety Validation** | Babel parse check | Balanced markup check | Balanced markup check | Balanced markup check | Balanced markup check |

---

## 5. Vite Plugin & Framework Pipeline Integration

1. **`enforce: 'pre'` Pre-Compilation Stamping:**
   - `flimsy()` runs before `@vitejs/plugin-react`, `@vitejs/plugin-vue`, `@sveltejs/vite-plugin-svelte`, `vite-plugin-solid`, and `@preact/preset-vite`.
   - `transform(code, id)` routes any `isSupportedSourceFile(cleanId)` through `injectSourceLocations()` while skipping virtual sub-module queries (`?vue&type=style`, `?vue&type=script`, `?svelte&type=style`, `?raw`, `?url`, `?inline`).
2. **Vanilla HTML Support in `transformIndexHtml(html, ctx)`:**
   - When `ctx.filename` resolves to an `.html` file on disk, stamps visible content elements inside `<body>` while skipping empty SPA mount shells (`<div id="root"></div>`, `<div id="app"></div>`, `<div id="__nuxt"></div>`, `<div id="__next"></div>`, `<div id="svelte"></div>`) so React/Vue/Svelte SPAs never get spurious wrapper layers.
3. **Production Safety Guarantee:**
   - `apply: 'serve'` ensures zero Flimsy runtime code or `data-flimsy-*` attributes are ever emitted in `vite build` for any language.
4. **Client Studio Compatibility:**
   - Browser DOM inspection reads `data-flimsy-*` attributes uniformly across all frameworks; SVG elements (`SVGAnimatedString`) are safely guarded when reading/writing class strings.

---

## 6. Verification & Acceptance Criteria

Implementation is complete only when all of the following pass:

1. **Core Multi-Language Unit Tests (`packages/core/test/`):**
   - Full round-trip coverage (`inject`, `update-class`, `update-text`, `duplicate`, `delete`, `reorder`, `reparent` + cycle guard, `extract` + ancestor dedup, `paste` `after`/`inside` + self-closing expansion, `extractAIElementContext`, syntax safety abort) across:
     - SolidJS / Preact / Qwik JSX (`class="..."` preservation)
     - Vue SFC (`.vue` with nested `<template v-if>`, `:class`, `{{ expr }}`, `<script setup>`, `<style scoped>`)
     - Svelte (`.svelte` with `class:active={...}`, `{#if count > 0}`, `on:click={() => a > b}`, `<script>`, `<style>`)
     - Astro (`.astro` with `---` TypeScript frontmatter, `class:list`, `{expr}`, `<style>`)
     - Vanilla HTML & Angular (`.html` / `.component.html` with `<!DOCTYPE>`, `<head>`, `[ngClass]`, `(click)`, `{{ title }}`, void `<img>`/`<input>`)
2. **Vite Plugin Integration Tests (`packages/vite-plugin/test/`):**
   - Verified `transform` injection for `.tsx`, `.vue`, `.svelte`, `.astro` and virtual sub-module skipping (`?vue&type=style`).
   - Verified `transformIndexHtml` stamps static Vanilla HTML elements while keeping React `#root` mount clean.
   - Verified production build (`vite build`) leaks zero Flimsy attributes or scripts.
3. **MCP End-to-End Tests (`packages/cli/test/cli.test.ts`):**
   - Verified `flimsy-dev mcp` inspects and edits non-JSX files (`.vue`, `.svelte`, `.html`) cleanly over stdio JSON-RPC.
4. **Full Monorepo Build & Test Suite:**
   - `pnpm run build` and `pnpm test` pass 100% with zero regressions and zero emojis.
