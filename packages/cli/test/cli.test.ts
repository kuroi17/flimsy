import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flimsy as namedFlimsy, default as defaultFlimsy } from '../src/index.js';
import { injectSourceLocations, updateSourceFile } from '../src/index.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('flimsy CLI package exports', () => {
  it('correctly exports the Vite plugin and core utilities', () => {
    expect(namedFlimsy).toBeDefined();
    expect(typeof namedFlimsy).toBe('function');
    expect(defaultFlimsy).toBe(namedFlimsy);

    expect(injectSourceLocations).toBeDefined();
    expect(typeof injectSourceLocations).toBe('function');

    expect(updateSourceFile).toBeDefined();
    expect(typeof updateSourceFile).toBe('function');

    const plugin = namedFlimsy();
    expect(plugin.name).toBe('vite-plugin-flimsy');
    expect(plugin.apply).toBe('serve');
  });

  it('prints current version via CLI binary', async () => {
    const binPath = path.resolve(__dirname, '../bin/flimsy.js');
    const { stdout } = await execFileAsync(process.execPath, [binPath, '--version']);
    expect(stdout).toContain('v0.1.2');
  });
});

