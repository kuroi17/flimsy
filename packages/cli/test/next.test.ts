import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { withFlimsy, startFlimsyNextServer } from '../dist/next.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distLoaderPath = path.resolve(__dirname, '../dist/next-loader.cjs');

describe('flimsy-dev/next: Next.js Adapter', () => {
  let tempDir: string;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-next-test-'));
    process.env.NODE_ENV = 'development';
  });

  afterEach(async () => {
    process.env.NODE_ENV = origNodeEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('is a zero-overhead no-op in production builds', () => {
    process.env.NODE_ENV = 'production';
    const baseConfig = { reactStrictMode: true };
    const wrapped = withFlimsy(baseConfig);
    expect(wrapped).toBe(baseConfig);
    expect((wrapped as any).webpack).toBeUndefined();
    expect((wrapped as any).turbopack).toBeUndefined();
  });

  it('wires webpack loader, turbopack rules, and client bootstrap in development', async () => {
    const wrapped = withFlimsy(
      { reactStrictMode: true },
      { rootDir: tempDir, port: 4199 }
    );

    expect(wrapped.env.NEXT_PUBLIC_FLIMSY_URL).toBe('http://127.0.0.1:4199');
    expect(wrapped.turbopack.rules['*.tsx'].loaders[0].loader).toContain('next-loader.cjs');

    const fakeWebpackConfig: any = {
      module: { rules: [] },
      entry: async () => ({ 'main-app': ['./src/app-entry.js'] }),
    };

    const mutated = wrapped.webpack(fakeWebpackConfig, { dev: true, isServer: false });
    expect(mutated.module.rules.length).toBe(1);
    expect(mutated.module.rules[0].enforce).toBe('pre');
    expect(mutated.module.rules[0].use[0].loader).toContain('next-loader.cjs');

    const resolvedEntries = await mutated.entry();
    expect(resolvedEntries['main-app'][0]).toContain('next-client-bootstrap.js');
  });

  it('stamps data-flimsy-* via compiled CJS next-loader.cjs and skips node_modules', () => {
    const loader = require(distLoaderPath);
    expect(typeof loader).toBe('function');

    const pageSource = `export default function Page() {\n  return <main className="p-6"><h1 className="text-2xl">Next App</h1></main>;\n}\n`;
    const stamped = loader.call(
      {
        resourcePath: path.join(tempDir, 'app/page.tsx'),
        getOptions: () => ({ rootDir: tempDir }),
      },
      pageSource
    );
    expect(stamped).toContain('data-flimsy-file="app/page.tsx"');
    expect(stamped).toContain('data-flimsy-name="h1"');

    const vendorOut = loader.call(
      {
        resourcePath: path.join(tempDir, 'node_modules/pkg/Button.tsx'),
        getOptions: () => ({ rootDir: tempDir }),
      },
      pageSource
    );
    expect(vendorOut).toBe(pageSource);
  });

  it('runs companion API server with localhost-only CORS and syncs Next.js TSX edits to disk', async () => {
    const appDir = path.join(tempDir, 'app');
    await fs.mkdir(appDir, { recursive: true });
    const pagePath = path.join(appDir, 'page.tsx');
    await fs.writeFile(
      pagePath,
      `export default function Page() {\n  return <button className="px-4 py-2 bg-blue-500">Next CTA</button>;\n}\n`,
      'utf-8'
    );

    const server = await startFlimsyNextServer({ rootDir: tempDir, port: 0 });
    try {
      // 1. Localhost origin receives CORS header & injected API_BASE
      const scriptRes = await fetch(`${server.url}/@flimsy/client.js`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(scriptRes.status).toBe(200);
      expect(scriptRes.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      const scriptBody = await scriptRes.text();
      expect(scriptBody).toContain(`window.__FLIMSY_API_BASE__ = "${server.url}"`);
      expect(scriptBody).toContain('flimsy-hand-tool');

      // 2. Untrusted remote origin does NOT receive Access-Control-Allow-Origin
      const evilRes = await fetch(`${server.url}/@flimsy/client.js`, {
        headers: { Origin: 'https://evil.example.com' },
      });
      expect(evilRes.headers.get('access-control-allow-origin')).toBeNull();

      // 3. Round-trip AST sync into Next.js app/page.tsx
      const updateRes = await fetch(`${server.url}/__flimsy/api/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          file: 'app/page.tsx',
          line: 2,
          col: 9,
          actions: [
            { type: 'update-class', newClasses: 'bg-zinc-950 rounded-xl', mode: 'reconcile' },
            { type: 'update-text', text: 'Synced Next CTA' },
          ],
        }),
      });
      expect(updateRes.status).toBe(200);
      const data = await updateRes.json();
      expect(data.success).toBe(true);

      const disk = await fs.readFile(pagePath, 'utf-8');
      expect(disk).toContain('bg-zinc-950');
      expect(disk).toContain('rounded-xl');
      expect(disk).not.toContain('bg-blue-500');
      expect(disk).toContain('Synced Next CTA');
    } finally {
      await server.close();
    }
  });
});
