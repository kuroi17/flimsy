import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  detectLanguage,
  isSupportedSourceFile,
  injectSourceLocations,
  updateSourceFile,
  extractJSXSnippets,
  extractAIElementContext,
} from '../src/index.js';

describe('@flimsy/core: multi-language detection', () => {
  it('detects all supported frontend languages and ignores non-template assets', () => {
    expect(detectLanguage('src/App.tsx')).toBe('jsx');
    expect(detectLanguage('src/Card.jsx')).toBe('jsx');
    expect(detectLanguage('src/Hero.vue')).toBe('vue');
    expect(detectLanguage('src/Hero.vue?vue&type=template')).toBe('vue');
    expect(detectLanguage('src/Banner.svelte')).toBe('svelte');
    expect(detectLanguage('src/Layout.astro')).toBe('astro');
    expect(detectLanguage('index.html')).toBe('html');
    expect(detectLanguage('src/card.component.html')).toBe('html');
    expect(detectLanguage('public/page.htm')).toBe('html');
    expect(detectLanguage('src/styles.css')).toBeNull();
    expect(detectLanguage('src/utils.ts')).toBeNull();
    expect(isSupportedSourceFile('src/Hero.vue')).toBe(true);
    expect(isSupportedSourceFile('src/main.ts')).toBe(false);
  });
});

describe('@flimsy/core: SolidJS / Preact / Qwik / Vue JSX (`class` attribute)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-lang-jsx-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reconciles `class` attributes natively and preserves `class` convention when adding styles', async () => {
    const filePath = path.join(tempDir, 'SolidCard.tsx');
    const source = `export function SolidCard() {
  return (
    <div class="p-4 bg-white rounded-md">
      <span>Unstyled Label</span>
    </div>
  );
}
`;
    await fs.writeFile(filePath, source, 'utf-8');

    const res1 = await updateSourceFile({
      filePath,
      line: 3,
      column: 4,
      action: { type: 'update-class', newClasses: 'p-8 bg-zinc-950 rounded-2xl', mode: 'reconcile' },
      rootDir: tempDir,
    });
    expect(res1.success).toBe(true);
    expect(res1.newCode).toContain('class="p-8 bg-zinc-950 rounded-2xl"');
    expect(res1.newCode).not.toContain('className=');

    // Adding classes to unstyled <span> inside a `class=` file must emit `class=`, not `className=`
    const res2 = await updateSourceFile({
      filePath,
      line: 4,
      column: 6,
      action: { type: 'update-class', newClasses: 'text-sm font-semibold' },
      rootDir: tempDir,
    });
    expect(res2.success).toBe(true);
    expect(res2.newCode).toContain('<span class="text-sm font-semibold">');
    expect(res2.newCode).not.toContain('className=');

    const ctx = await extractAIElementContext({
      filePath,
      line: 3,
      column: 4,
      rootDir: tempDir,
    });
    expect(ctx.currentClasses).toBe('p-8 bg-zinc-950 rounded-2xl');
  });
});

describe('@flimsy/core: Vue SFC (.vue)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-lang-vue-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleVue = `<script setup lang="ts">
const count = ref(0);
const isOk = count.value > 0 && count.value < 10;
</script>

<template>
  <section class="p-6 bg-white">
    <template v-if="isOk">
      <h2 class="text-xl font-bold" :class="{ active: isOk }">Hello {{ count }}</h2>
    </template>
    <p class="text-sm text-slate-500">Vue description</p>
    <div class="slot-box" />
  </section>
</template>

<style scoped>
.active { color: red; }
</style>
`;

  it('injects data-flimsy-* inside root <template> including nested <template v-if>, skipping <script>/<style>', () => {
    const res = injectSourceLocations(sampleVue, '/workspace/src/Card.vue', { rootDir: '/workspace' });
    expect(res.code).toContain('<section data-flimsy-file="src/Card.vue" data-flimsy-line="7"');
    expect(res.code).toContain('<h2 data-flimsy-file="src/Card.vue" data-flimsy-line="9"');
    expect(res.code).toContain('<p data-flimsy-file="src/Card.vue" data-flimsy-line="11"');
    expect(res.code).not.toContain('<script data-flimsy');
    expect(res.code).not.toContain('<style data-flimsy');
    expect(res.code).not.toContain('<template data-flimsy');
    expect(res.code).toContain('count.value > 0 && count.value < 10');
  });

  it('supports update-class, update-text (preserving {{ expr }}), duplicate, reorder, reparent, copy/paste, and AI context', async () => {
    const filePath = path.join(tempDir, 'Card.vue');
    await fs.writeFile(filePath, sampleVue, 'utf-8');

    // 1. Update class + text on <h2> preserving :class and {{ count }}
    const upRes = await updateSourceFile({
      filePath,
      line: 9,
      column: 6,
      actions: [
        { type: 'update-class', newClasses: 'text-3xl tracking-tight', mode: 'reconcile' },
        { type: 'update-text', text: 'Updated ' },
      ],
      rootDir: tempDir,
    });
    expect(upRes.success).toBe(true);
    expect(upRes.newCode).toContain('class="font-bold text-3xl tracking-tight"');
    expect(upRes.newCode).toContain(':class="{ active: isOk }"');
    expect(upRes.newCode).toContain('Updated {{ count }}');
    expect(upRes.newCode).toContain('<script setup lang="ts">');
    expect(upRes.newCode).toContain('<style scoped>');

    // 2. Copy snippet group (deduping descendant inside <section>)
    const copyRes = await extractJSXSnippets(
      [
        { filePath, line: 7, column: 2 },
        { filePath, line: 11, column: 4 },
      ],
      tempDir
    );
    expect(copyRes.success).toBe(true);
    expect(copyRes.snippets.length).toBe(1);
    expect(copyRes.snippets[0]).toContain('<section');

    // 3. Paste inside self-closing <div class="slot-box" /> (line 12)
    const pasteRes = await updateSourceFile({
      filePath,
      line: 12,
      column: 4,
      action: {
        type: 'paste-elements',
        snippets: ['<span class="badge">New</span>'],
        position: 'inside',
      },
      rootDir: tempDir,
    });
    expect(pasteRes.success).toBe(true);
    expect(pasteRes.newCode).toMatch(/<div class="slot-box">[\s\S]*<span class="badge">New<\/span>[\s\S]*<\/div>/);

    // 4. Reparent <p> inside <div class="slot-box"> and verify cycle guard prevents moving <section> into <div class="slot-box">
    const reparentRes = await updateSourceFile({
      filePath,
      line: 11,
      column: 4,
      action: { type: 'reparent-element', targetLine: 12, targetColumn: 4, position: 'inside' },
      rootDir: tempDir,
    });
    expect(reparentRes.success).toBe(true);
    expect(reparentRes.newCode).toMatch(/<div class="slot-box">[\s\S]*Vue description[\s\S]*<\/div>/);

    const beforeCycle = await fs.readFile(filePath, 'utf-8');
    const cycleRes = await updateSourceFile({
      filePath,
      line: 7,
      column: 2,
      action: { type: 'reparent-element', targetLine: 11, targetColumn: 4, position: 'inside' },
      rootDir: tempDir,
    });
    expect(cycleRes.success).toBe(true);
    expect(await fs.readFile(filePath, 'utf-8')).toBe(beforeCycle);

    // 5. AI Context extraction
    const ctx = await extractAIElementContext({
      filePath,
      line: 9,
      column: 6,
      rootDir: tempDir,
      userPrompt: 'Make it pop',
    });
    expect(ctx.tagName).toBe('h2');
    expect(ctx.currentClasses).toContain('text-3xl');
    expect(ctx.formattedPrompt).toContain('```vue');

    // 6. Safety abort on unbalanced markup paste
    const badPaste = await updateSourceFile({
      filePath,
      line: 9,
      column: 6,
      action: { type: 'paste-elements', snippets: ['<div><span>Broken'], position: 'after' },
      rootDir: tempDir,
    });
    expect(badPaste.success).toBe(false);
    expect(badPaste.error).toContain('Safety abort');
  });
});

describe('@flimsy/core: Svelte (.svelte)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-lang-svelte-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleSvelte = `<script lang="ts">
  let count = 1;
  let active = count > 0;
</script>

<svelte:window on:keydown={() => {}} />

{#if count > 0}
  <div class="p-4 bg-slate-900" class:active={active}>
    <button class="px-4 py-2 bg-sky-500" on:click={() => { if (count > 0) count++; }}>
      Count: {count}
    </button>
    <p class="text-sm">Footer</p>
  </div>
{/if}

<style>
  .active { border-color: white; }
</style>
`;

  it('handles balanced Svelte expressions with > operators, skips <script>/<style>/<svelte:*>, and reconciles classes/text', async () => {
    const injected = injectSourceLocations(sampleSvelte, '/workspace/src/Counter.svelte', { rootDir: '/workspace' });
    expect(injected.code).toContain('<div data-flimsy-file="src/Counter.svelte" data-flimsy-line="9"');
    expect(injected.code).toContain('<button data-flimsy-file="src/Counter.svelte" data-flimsy-line="10"');
    expect(injected.code).not.toContain('<svelte:window data-flimsy');
    expect(injected.code).not.toContain('<script data-flimsy');
    expect(injected.code).not.toContain('<style data-flimsy');

    const filePath = path.join(tempDir, 'Counter.svelte');
    await fs.writeFile(filePath, sampleSvelte, 'utf-8');

    const res = await updateSourceFile({
      filePath,
      line: 10,
      column: 4,
      actions: [
        { type: 'update-class', newClasses: 'px-6 bg-emerald-600 rounded-lg', mode: 'reconcile' },
        { type: 'update-text', text: 'Total: ' },
      ],
      rootDir: tempDir,
    });

    expect(res.success).toBe(true);
    expect(res.newCode).toContain('class="py-2 px-6 bg-emerald-600 rounded-lg"');
    expect(res.newCode).toContain('on:click={() => { if (count > 0) count++; }}');
    expect(res.newCode).toContain('Total: {count}');
    expect(res.newCode).toContain('class:active={active}');

    // Reorder <p> up before <button>
    const reorderRes = await updateSourceFile({
      filePath,
      line: 13,
      column: 4,
      action: { type: 'reorder-child', direction: 'up' },
      rootDir: tempDir,
    });
    expect(reorderRes.success).toBe(true);
    const pPos = reorderRes.newCode!.indexOf('<p class="text-sm">');
    const btnPos = reorderRes.newCode!.indexOf('<button ');
    expect(pPos).toBeLessThan(btnPos);
  });
});

describe('@flimsy/core: Astro (.astro)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-lang-astro-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleAstro = `---
const items: Array<string> = ['One', 'Two'];
const title = 'Astro Hero';
---

<section class="py-12 bg-zinc-950">
  <h1 class="text-4xl font-bold" class:list={['heading']}>Welcome {title}</h1>
  <button class="px-4 py-2 bg-white text-black">Launch</button>
</section>

<style>
  .heading { letter-spacing: -0.02em; }
</style>
`;

  it('skips TypeScript --- frontmatter with generics, preserves line numbers, and updates Astro markup cleanly', async () => {
    const injected = injectSourceLocations(sampleAstro, '/workspace/src/Hero.astro', { rootDir: '/workspace' });
    expect(injected.code).toContain('const items: Array<string>');
    expect(injected.code).toContain('<section data-flimsy-file="src/Hero.astro" data-flimsy-line="6"');
    expect(injected.code).toContain('<h1 data-flimsy-file="src/Hero.astro" data-flimsy-line="7"');
    expect(injected.code).not.toContain('<style data-flimsy');

    const filePath = path.join(tempDir, 'Hero.astro');
    await fs.writeFile(filePath, sampleAstro, 'utf-8');

    const res = await updateSourceFile({
      filePath,
      line: 7,
      column: 2,
      actions: [
        { type: 'update-class', newClasses: 'text-6xl text-white', mode: 'reconcile' },
        { type: 'update-text', text: 'Build ' },
      ],
      rootDir: tempDir,
    });
    expect(res.success).toBe(true);
    expect(res.newCode).toContain('class="font-bold text-6xl text-white"');
    expect(res.newCode).toContain("class:list={['heading']}");
    expect(res.newCode).toContain('Build {title}');
    expect(res.newCode).toContain('const items: Array<string>');

    // Duplicate <button>
    const dupRes = await updateSourceFile({
      filePath,
      line: 8,
      column: 2,
      action: { type: 'duplicate-element' },
      rootDir: tempDir,
    });
    expect(dupRes.success).toBe(true);
    expect(dupRes.newCode?.match(/Launch/g)?.length).toBe(2);
  });
});

describe('@flimsy/core: Vanilla HTML & Angular Templates (.html)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-lang-html-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('skips <head> and empty SPA #root mounts while stamping and editing Vanilla HTML documents', async () => {
    const spaHtml = `<!doctype html>
<html>
  <head><title>App</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    const spaRes = injectSourceLocations(spaHtml, '/workspace/index.html', { rootDir: '/workspace' });
    expect(spaRes.code).not.toContain('data-flimsy-file');

    const staticHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Landing</title>
  </head>
  <body class="bg-white">
    <main class="p-8">
      <h1 class="text-3xl font-bold">Vanilla HTML</h1>
      <img src="/hero.png" alt="Hero" class="w-64 rounded-lg" />
    </main>
  </body>
</html>`;
    const staticRes = injectSourceLocations(staticHtml, '/workspace/index.html', { rootDir: '/workspace' });
    expect(staticRes.code).toContain('<main data-flimsy-file="index.html" data-flimsy-line="8"');
    expect(staticRes.code).toContain('<h1 data-flimsy-file="index.html" data-flimsy-line="9"');
    expect(staticRes.code).toContain('<img data-flimsy-file="index.html" data-flimsy-line="10"');
    expect(staticRes.code).not.toContain('<meta data-flimsy');
    expect(staticRes.code).not.toContain('<body data-flimsy');

    const filePath = path.join(tempDir, 'index.html');
    await fs.writeFile(filePath, staticHtml, 'utf-8');
    const upRes = await updateSourceFile({
      filePath,
      line: 9,
      column: 6,
      actions: [
        { type: 'update-class', newClasses: 'text-5xl text-zinc-900', mode: 'reconcile' },
        { type: 'update-text', text: 'Updated Landing' },
      ],
      rootDir: tempDir,
    });
    expect(upRes.success).toBe(true);
    expect(upRes.newCode).toContain('class="font-bold text-5xl text-zinc-900"');
    expect(upRes.newCode).toContain('Updated Landing');
  });

  it('edits Angular component templates preserving [ngClass], (click), and {{ interpolation }}', async () => {
    const angularTpl = `<section class="p-4 bg-white" [ngClass]="{ selected: isSelected }">
  <button class="px-4 py-2 bg-indigo-600 text-white" (click)="save()">
    Save {{ itemName }}
  </button>
</section>
`;
    const filePath = path.join(tempDir, 'panel.component.html');
    await fs.writeFile(filePath, angularTpl, 'utf-8');

    const upRes = await updateSourceFile({
      filePath,
      line: 2,
      column: 2,
      actions: [
        { type: 'update-class', newClasses: 'bg-zinc-950 rounded-full', mode: 'reconcile' },
        { type: 'update-text', text: 'Publish ' },
      ],
      rootDir: tempDir,
    });
    expect(upRes.success).toBe(true);
    expect(upRes.newCode).toContain('class="px-4 py-2 text-white bg-zinc-950 rounded-full"');
    expect(upRes.newCode).toContain('(click)="save()"');
    expect(upRes.newCode).toContain('[ngClass]="{ selected: isSelected }"');
    expect(upRes.newCode).toContain('Publish {{ itemName }}');

    // Delete <button>
    const delRes = await updateSourceFile({
      filePath,
      line: 2,
      column: 2,
      action: { type: 'delete-element' },
      rootDir: tempDir,
    });
    expect(delRes.success).toBe(true);
    expect(delRes.newCode).not.toContain('<button');
  });
});
