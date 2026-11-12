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
    if (server) {
      await server.close();
    }
    if (originalHeroContent) {
      // Restore original file
      await fs.writeFile(heroFilePath, originalHeroContent, 'utf-8');
    }
  });

  it('injects client script into HTML', async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/@flimsy/client.js');
  });

  it('serves client overlay script at /@flimsy/client.js', async () => {
    const res = await fetch(`${serverUrl}/@flimsy/client.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    const script = await res.text();
    expect(script).toContain('Flimsy Inspector');
  });

  it('transforms TSX module and stamps data-flimsy-* coordinates', async () => {
    const res = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    expect(res.status).toBe(200);
    const code = await res.text();
    expect(code).toContain('"data-flimsy-file": "src/components/Hero.tsx"');
    expect(code).toContain('"data-flimsy-line"');
    expect(code).toContain('"data-flimsy-col"');
  });

  it('performs full round-trip: /__flimsy/api/update modifies physical TSX file', async () => {
    // Read transformed code to find the exact line for the button
    const resModule = await fetch(`${serverUrl}/src/components/Hero.tsx`);
    const code = await resModule.text();

    const lineMatch = code.match(/"button",\s*\{[^}]*"data-flimsy-file":\s*"src\/components\/Hero\.tsx",\s*"data-flimsy-line":\s*"(\d+)",\s*"data-flimsy-col":\s*"(\d+)"/);
    expect(lineMatch).not.toBeNull();
    const line = parseInt(lineMatch![1], 10);
    const col = parseInt(lineMatch![2], 10);

    // Call update API
    const updateRes = await fetch(`${serverUrl}/__flimsy/api/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: 'src/components/Hero.tsx',
        line,
        col,
        action: {
          type: 'update-text',
          text: 'Synced By Flimsy PoC',
        },
      }),
    });

    expect(updateRes.status).toBe(200);
    const data = await updateRes.json();
    expect(data.success).toBe(true);

    // Verify physical file on disk was modified
    const updatedDiskContent = await fs.readFile(heroFilePath, 'utf-8');
    expect(updatedDiskContent).toContain('Synced By Flimsy PoC');
  });
});
