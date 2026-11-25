import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { flimsy } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playgroundRoot = path.resolve(__dirname, '../../../examples/playground');
const heroFilePath = path.resolve(playgroundRoot, 'src/components/Hero.tsx');

describe('Vite Plugin Round-trip Integration', () => {
  let server: ViteDevServer | undefined;
  let serverUrl: string;
  let originalHeroContent = '';

  beforeAll(async () => {
    originalHeroContent = await fs.readFile(heroFilePath, 'utf-8');

    server = await createServer({
      root: playgroundRoot,
      server: { port: 5199, host: '127.0.0.1' },
      plugins: [flimsy()],
    });
    await server.listen();
    serverUrl = 'http://127.0.0.1:5199';
  });

  afterAll(async () => {
    if (originalHeroContent) {
      // Restore original file
      await fs.writeFile(heroFilePath, originalHeroContent, 'utf-8');
    }
    if (server) {
      server.httpServer?.closeAllConnections?.();
      await Promise.race([
        server.close(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  });

  it('injects client script into HTML', async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/@flimsy/client.js');
  });

  it('serves client overlay script with modern property controls, undo/redo, and diff review', async () => {
    const res = await fetch(`${serverUrl}/@flimsy/client.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    const script = await res.text();
    expect(script).toContain('Studio active');
    expect(script).toContain('flimsy-undo-btn');
    expect(script).toContain('flimsy-redo-btn');
    expect(script).toContain('flimsy-diff-box');
    expect(script).toContain('flimsy-instance-badge');
    expect(script).toContain('flimsy-discard-btn');
    expect(script).toContain('flimsy-ai-toggle');
    expect(script).toContain('flimsy-ai-copy');
    expect(script).toContain('contentEditable');
    expect(script).toContain('flimsy-rotate-handle');
    expect(script).toContain('flimsy-measure-layer');
    expect(script).toContain('flimsy-snap-toggle');
    expect(script).toContain('flimsy-opacity-slider');
    expect(script).toContain('flimsy-border-side-btn');
    expect(script).toContain('seg-leading');
    expect(script).toContain('seg-tracking');
    expect(script).toContain('seg-text-transform');
    expect(script).toContain('reparent-element');
  });

  it('inspects file metadata at /__flimsy/api/inspect', async () => {
    const res = await fetch(`${serverUrl}/__flimsy/api/inspect?file=src/components/Hero.tsx`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.mtime).toBe('number');
  });

  it('transforms TSX module and stamps data-flimsy-* coordinates with component context', async () => {
    const res = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    expect(res.status).toBe(200);
    const code = await res.text();
    expect(code).toContain('"data-flimsy-file": "src/components/Hero.tsx"');
    expect(code).toContain('"data-flimsy-line"');
    expect(code).toContain('"data-flimsy-col"');
    expect(code).toContain('"data-flimsy-name"');
    expect(code).toContain('"data-flimsy-comp": "Hero"');
  });

  it('performs full round-trip: /__flimsy/api/update modifies physical TSX file', async () => {
    // Read transformed code to find the exact line for the button
    const resModule = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    const code = await resModule.text();

    const lineMatch = code.match(/"button",\s*\{[^}]*"data-flimsy-file":\s*"src\/components\/Hero\.tsx",\s*"data-flimsy-line":\s*"(\d+)",\s*"data-flimsy-col":\s*"(\d+)"/);
    expect(lineMatch).not.toBeNull();
    const line = parseInt(lineMatch![1], 10);
    const col = parseInt(lineMatch![2], 10);

    // Call update API with multiple atomic actions
    const updateRes = await fetch(`${serverUrl}/__flimsy/api/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: 'src/components/Hero.tsx',
        line,
        col,
        actions: [
          {
            type: 'update-text',
            text: 'Live Studio Verified',
          },
          {
            type: 'update-class',
            newClasses: 'px-8 py-4 bg-emerald-500 rounded-xl text-lg font-bold',
            mode: 'reconcile',
          },
        ],
      }),
    });

    expect(updateRes.status).toBe(200);
    const data = await updateRes.json();
    expect(data.success).toBe(true);

    // Verify physical file on disk was modified
    const updatedDiskContent = await fs.readFile(heroFilePath, 'utf-8');
    expect(updatedDiskContent).toContain('Live Studio Verified');
    expect(updatedDiskContent).toContain('bg-emerald-500');
    expect(updatedDiskContent).toContain('rounded-xl');
  });

  it('handles atomic batch updates for multi-selected elements in the same file', async () => {
    // Restore clean Hero first
    await fs.writeFile(heroFilePath, originalHeroContent, 'utf-8');
    const resModule = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    const code = await resModule.text();

    const h1Match = code.match(/"h1",\s*\{[^}]*"data-flimsy-file":\s*"src\/components\/Hero\.tsx",\s*"data-flimsy-line":\s*"(\d+)",\s*"data-flimsy-col":\s*"(\d+)"/);
    const pMatch = code.match(/"p",\s*\{[^}]*"data-flimsy-file":\s*"src\/components\/Hero\.tsx",\s*"data-flimsy-line":\s*"(\d+)",\s*"data-flimsy-col":\s*"(\d+)"/);
    expect(h1Match).not.toBeNull();
    expect(pMatch).not.toBeNull();

    const batchRes = await fetch(`${serverUrl}/__flimsy/api/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: [
          {
            file: 'src/components/Hero.tsx',
            line: parseInt(h1Match![1], 10),
            col: parseInt(h1Match![2], 10),
            actions: [{ type: 'update-class', newClasses: 'uppercase tracking-widest', mode: 'reconcile' }],
          },
          {
            file: 'src/components/Hero.tsx',
            line: parseInt(pMatch![1], 10),
            col: parseInt(pMatch![2], 10),
            actions: [{ type: 'update-class', newClasses: 'leading-loose opacity-75', mode: 'reconcile' }],
          },
        ],
      }),
    });

    expect(batchRes.status).toBe(200);
    const data = await batchRes.json();
    expect(data.success).toBe(true);

    const disk = await fs.readFile(heroFilePath, 'utf-8');
    expect(disk).toContain('uppercase');
    expect(disk).toContain('tracking-widest');
    expect(disk).toContain('leading-loose');
    expect(disk).toContain('opacity-75');
  });

  it('provides AI context packaging and offline heuristics at /__flimsy/api/ai', async () => {
    const resModule = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    const code = await resModule.text();

    const lineMatch = code.match(/"button",\s*\{[^}]*"data-flimsy-file":\s*"src\/components\/Hero\.tsx",\s*"data-flimsy-line":\s*"(\d+)",\s*"data-flimsy-col":\s*"(\d+)"/);
    expect(lineMatch).not.toBeNull();
    const line = parseInt(lineMatch![1], 10);
    const col = parseInt(lineMatch![2], 10);

    const aiRes = await fetch(`${serverUrl}/__flimsy/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: 'src/components/Hero.tsx',
        line,
        col,
        prompt: 'Add glassmorphism style',
      }),
    });

    expect(aiRes.status).toBe(200);
    const data = await aiRes.json();
    expect(data.success).toBe(true);
    expect(data.context.tagName).toBe('button');
    expect(data.suggestion.suggestedClasses).toContain('backdrop-blur-md');
    expect(data.copyPrompt).toContain('Add glassmorphism style');
  });

  it('guards against duplicate flimsy() plugin registrations', async () => {
    const dupServer = await createServer({
      root: playgroundRoot,
      server: { port: 5198, host: '127.0.0.1' },
      plugins: [flimsy(), flimsy()],
    });
    await dupServer.listen();
    try {
      const res = await fetch('http://127.0.0.1:5198/');
      const html = await res.text();
      const matches = html.match(/\/@flimsy\/client\.js/g) || [];
      expect(matches.length).toBe(1);
    } finally {
      dupServer.httpServer?.closeAllConnections?.();
      await Promise.race([
        dupServer.close(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  });
});
