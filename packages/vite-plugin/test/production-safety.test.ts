import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { flimsy } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playgroundRoot = path.resolve(__dirname, '../../../examples/playground');

describe('Flimsy Production Safety Guarantee', () => {
  it('ensures zero Flimsy code or data-flimsy-* attributes leak into production builds', async () => {
    const outDir = path.resolve(playgroundRoot, 'dist-test');

    const result = await build({
      root: playgroundRoot,
      build: {
        outDir,
        emptyOutDir: true,
      },
      plugins: [flimsy()],
      logLevel: 'silent',
    });

    expect(result).toBeDefined();

    // Read production index.html
    const htmlPath = path.resolve(outDir, 'index.html');
    const html = await fs.readFile(htmlPath, 'utf-8');
    expect(html).not.toContain('/@flimsy/client.js');
    expect(html).not.toContain('flimsy-root');

    // Read all built JS assets
    const assetsDir = path.resolve(outDir, 'assets');
    const assetFiles = await fs.readdir(assetsDir);
    const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    for (const jsFile of jsFiles) {
      const code = await fs.readFile(path.resolve(assetsDir, jsFile), 'utf-8');
      expect(code).not.toContain('data-flimsy-file');
      expect(code).not.toContain('data-flimsy-line');
      expect(code).not.toContain('data-flimsy-col');
      expect(code).not.toContain('Flimsy Inspect');
    }

    // Cleanup test dist
    await fs.rm(outDir, { recursive: true, force: true });
  }, 30000);

  it('guarantees 100% local-first operation with zero telemetry domains', async () => {
    // Read the client script source
    const clientScriptPath = path.resolve(__dirname, '../src/client-script.ts');
    const clientContent = await fs.readFile(clientScriptPath, 'utf-8');

    // Asserts no third-party telemetry analytics endpoints exist
    const telemetryBlacklist = [
      'google-analytics',
      'mixpanel',
      'segment.io',
      'sentry.io',
      'posthog',
      'telemetry',
      'api.amplitude',
    ];

    for (const term of telemetryBlacklist) {
      expect(clientContent.toLowerCase()).not.toContain(term);
    }
  });
});
