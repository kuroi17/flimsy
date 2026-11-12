import { describe, it, expect } from 'vitest';
import { flimsy as namedFlimsy, default as defaultFlimsy } from '../src/index.js';
import { injectSourceLocations, updateSourceFile } from '../src/index.js';

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
});
