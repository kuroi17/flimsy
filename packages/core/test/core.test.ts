import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { injectSourceLocations, updateSourceFile, reconcileClasses } from '../src/index.js';

describe('@flimsy/core: injectSourceLocations', () => {
  it('injects data-flimsy-* attributes into JSX elements', () => {
    const input = `export function Button() {
  return <button className="p-2 bg-blue-500">Click me</button>;
}`;
    const result = injectSourceLocations(input, '/workspace/src/Button.tsx', {
      rootDir: '/workspace',
    });

    expect(result.code).toContain('data-flimsy-file="src/Button.tsx"');
    expect(result.code).toContain('data-flimsy-line="2"');
    expect(result.code).toContain('data-flimsy-col="9"');
    expect(result.code).toContain('data-flimsy-name="button"');
    expect(result.code).toContain('data-flimsy-comp="Button"');
    expect(result.code).toContain('data-flimsy-type="element"');
    expect(result.code).toContain('className="p-2 bg-blue-500"');
  });

  it('detects custom component boundaries', () => {
    const input = `export function App() {
  return <Hero title="Welcome" />;
}`;
    const result = injectSourceLocations(input, '/workspace/src/App.tsx', {
      rootDir: '/workspace',
    });

    expect(result.code).toContain('data-flimsy-file="src/App.tsx"');
    expect(result.code).toContain('data-flimsy-name="Hero"');
    expect(result.code).toContain('data-flimsy-comp="App"');
    expect(result.code).toContain('data-flimsy-type="component"');
  });

  it('skips fragments and node_modules', () => {
    const fragmentCode = `export function App() { return <><div>Hello</div></>; }`;
    const res = injectSourceLocations(fragmentCode, '/workspace/src/App.tsx', { rootDir: '/workspace' });
    expect(res.code).not.toContain('<> data-flimsy');
    expect(res.code).toContain('data-flimsy-file="src/App.tsx"');

    const nodeModuleCode = `export const X = () => <div>Vendor</div>;`;
    const resVendor = injectSourceLocations(nodeModuleCode, '/workspace/node_modules/pkg/index.tsx', { rootDir: '/workspace' });
    expect(resVendor.code).toBe(nodeModuleCode);
  });
});

describe('@flimsy/core: reconcileClasses', () => {
  it('reconciles conflicting Tailwind classes', () => {
    const existing = 'px-4 py-2 bg-red-500 text-white rounded-md';
    const result = reconcileClasses(existing, 'bg-blue-600 rounded-lg');
    expect(result).toContain('px-4');
    expect(result).toContain('py-2');
    expect(result).toContain('text-white');
    expect(result).toContain('bg-blue-600');
    expect(result).toContain('rounded-lg');
    expect(result).not.toContain('bg-red-500');
    expect(result).not.toContain('rounded-md');
  });
});

describe('@flimsy/core: updateSourceFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flimsy-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('updates text content in TSX file preserving formatting', async () => {
    const sampleFilePath = path.join(tempDir, 'Button.tsx');
    const initialContent = `import React from 'react';

// Custom header comment
export function Button() {
  return (
    <button className="px-4 py-2 bg-blue-500">
      Original Text
    </button>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const updateRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 6,
      column: 4,
      action: {
        type: 'update-text',
        text: 'Updated By Flimsy',
      },
    });

    expect(updateRes.success).toBe(true);
    const updatedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(updatedContent).toContain('Updated By Flimsy');
    expect(updatedContent).toContain('// Custom header comment');
  });

  it('updates Tailwind classes in TSX file', async () => {
    const sampleFilePath = path.join(tempDir, 'Card.tsx');
    const initialContent = `export function Card() {
  return <div className="p-4 bg-white shadow">Card Content</div>;
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const updateRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 2,
      column: 9,
      action: {
        type: 'update-class',
        newClasses: 'p-8 bg-emerald-500 shadow-xl',
      },
    });

    expect(updateRes.success).toBe(true);
    const updatedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(updatedContent).toContain('p-8');
    expect(updatedContent).toContain('bg-emerald-500');
    expect(updatedContent).toContain('shadow-xl');
    expect(updatedContent).not.toContain('p-4');
    expect(updatedContent).not.toContain('bg-white');
  });
});

