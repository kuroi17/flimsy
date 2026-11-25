import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  injectSourceLocations,
  updateSourceFile,
  extractJSXSnippets,
  reconcileClasses,
  generateDiffPreview,
  extractAIElementContext,
  resolveDesignHeuristic,
} from '../src/index.js';

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

  it('disambiguates text color, font size, and text alignment without collision', () => {
    const existing = 'text-white text-base text-left font-medium bg-slate-900';
    const result = reconcileClasses(existing, 'text-xl text-center bg-sky-500');
    expect(result).toContain('text-white'); // text color preserved!
    expect(result).toContain('text-xl'); // font size replaced
    expect(result).not.toContain('text-base');
    expect(result).toContain('text-center'); // text align replaced
    expect(result).not.toContain('text-left');
    expect(result).toContain('font-medium'); // font weight preserved
    expect(result).toContain('bg-sky-500'); // bg color replaced
    expect(result).not.toContain('bg-slate-900');
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

  it('reconciles master padding over directional padding', () => {
    const existing = 'px-4 py-2 bg-red-500';
    const result = reconcileClasses(existing, 'p-6');
    expect(result).toContain('p-6');
    expect(result).toContain('bg-red-500');
    expect(result).not.toContain('px-4');
    expect(result).not.toContain('py-2');
  });

  it('updates TemplateLiteral className preserving expressions', async () => {
    const sampleFilePath = path.join(tempDir, 'TemplateComponent.tsx');
    const initialContent = `export function Nav({ active }: { active: boolean }) {
  return <div className={\`p-4 bg-white \${active ? 'text-blue-500' : 'text-gray-500'}\`}>Menu</div>;
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const updateRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 2,
      column: 9,
      action: {
        type: 'update-class',
        newClasses: 'p-8 bg-slate-900',
        mode: 'reconcile',
      },
    });

    expect(updateRes.success).toBe(true);
    const updatedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(updatedContent).toContain('p-8');
    expect(updatedContent).toContain('bg-slate-900');
    expect(updatedContent).toContain("${active ? 'text-blue-500' : 'text-gray-500'}");
    expect(updatedContent).not.toContain('p-4');
    expect(updatedContent).not.toContain('bg-white');
  });

  it('updates cn() / clsx() CallExpression className safely (shadcn/ui support)', async () => {
    const sampleFilePath = path.join(tempDir, 'ShadcnButton.tsx');
    const initialContent = `import { cn } from './utils';

export function Button({ isPrimary }: { isPrimary: boolean }) {
  return (
    <button className={cn('px-4 py-2 bg-blue-500 text-sm', isPrimary && 'shadow-lg')}>
      Click
    </button>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const updateRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 5,
      column: 4,
      action: {
        type: 'update-class',
        newClasses: 'px-6 py-3 bg-emerald-600 rounded-lg',
        mode: 'reconcile',
      },
    });

    expect(updateRes.success).toBe(true);
    const updatedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(updatedContent).toContain('px-6');
    expect(updatedContent).toContain('py-3');
    expect(updatedContent).toContain('bg-emerald-600');
    expect(updatedContent).toContain('rounded-lg');
    expect(updatedContent).toContain("isPrimary && 'shadow-lg'");
    expect(updatedContent).not.toContain('bg-blue-500');
  });

  it('updates text while preserving inline JSX expressions', async () => {
    const sampleFilePath = path.join(tempDir, 'Greeting.tsx');
    const initialContent = `export function Greeting({ name }: { name: string }) {
  return <h1>Welcome back, {name}!</h1>;
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const updateRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 2,
      column: 9,
      action: {
        type: 'update-text',
        text: 'Hello again, ',
      },
    });

    expect(updateRes.success).toBe(true);
    const updatedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(updatedContent).toContain('Hello again, ');
    expect(updatedContent).toContain('{name}');
  });

  it('detects external file modifications and warns of conflict', async () => {
    const sampleFilePath = path.join(tempDir, 'ExternalEdit.tsx');
    const initialContent = `export function Box() { return <div>Original</div>; }`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    // Simulate an older expectedMtime from before external modification
    const pastMtime = Date.now() - 5000;

    const conflictRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 1,
      column: 32,
      expectedMtime: pastMtime,
      action: { type: 'update-text', text: 'Overwritten' },
    });

    expect(conflictRes.success).toBe(false);
    expect(conflictRes.conflict).toBe(true);
    expect(conflictRes.error).toContain('modified externally');

    // Verify original content was untouched
    const diskContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(diskContent).toBe(initialContent);

    // Verify force: true allows explicit overwrite
    const forceRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 1,
      column: 32,
      expectedMtime: pastMtime,
      force: true,
      action: { type: 'update-text', text: 'Forced Update' },
    });
    expect(forceRes.success).toBe(true);
    const forcedContent = await fs.readFile(sampleFilePath, 'utf-8');
    expect(forcedContent).toContain('Forced Update');
  });

  it('generates accurate diff preview objects', () => {
    const diff = generateDiffPreview(
      'src/Button.tsx',
      12,
      'p-2 bg-blue-500',
      'p-6 bg-emerald-500 rounded-lg',
      'Old Text',
      'New Text'
    );

    expect(diff.filePath).toBe('src/Button.tsx');
    expect(diff.changes.length).toBe(2);
    expect(diff.changes[0]).toEqual({
      type: 'class',
      oldValue: 'p-2 bg-blue-500',
      newValue: 'p-6 bg-emerald-500 rounded-lg',
    });
    expect(diff.changes[1]).toEqual({
      type: 'text',
      oldValue: 'Old Text',
      newValue: 'New Text',
    });
  });

  it('reconciles width, height, borders, and independent corners without collision', () => {
    const existing = 'w-32 h-10 border border-slate-300 border-solid rounded-md p-4';
    const updated = reconcileClasses(
      existing,
      'w-64 h-16 border-2 border-dashed border-[#d9b25f] rounded-tl-lg'
    );
    expect(updated).toContain('w-64');
    expect(updated).not.toContain('w-32');
    expect(updated).toContain('h-16');
    expect(updated).not.toContain('h-10');
    expect(updated).toContain('border-2');
    expect(updated).toContain('border-dashed');
    expect(updated).toContain('border-[#d9b25f]');
    expect(updated).toContain('rounded-tl-lg');
    expect(updated).toContain('rounded-md'); // master preserved alongside independent corner
    expect(updated).toContain('p-4');
  });

  it('performs structural AST operations: duplicate, reorder, and delete element', async () => {
    const sampleFilePath = path.join(tempDir, 'List.tsx');
    const initialContent = `export function List() {
  return (
    <div>
      <span className="first">Item 1</span>
      <span className="second">Item 2</span>
    </div>
  );
}`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    // 1. Duplicate "Item 1"
    const dupRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 4,
      column: 6,
      action: { type: 'duplicate-element' },
      rootDir: tempDir,
    });
    expect(dupRes.success).toBe(true);
    expect(dupRes.newCode).toContain('Item 1');
    const matches = dupRes.newCode?.match(/Item 1/g);
    expect(matches?.length).toBe(2);

    // 2. Delete "Item 2"
    const delRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 6,
      column: 6,
      action: { type: 'delete-element' },
      rootDir: tempDir,
    });
    expect(delRes.success).toBe(true);
    expect(delRes.newCode).not.toContain('Item 2');
  });

  it('extracts structured AI element context and formats prompt', async () => {
    const sampleFilePath = path.join(tempDir, 'Card.tsx');
    const initialContent = `export function Card() {
  return (
    <div className="p-4 bg-white">
      <button className="px-4 py-2 bg-blue-500 text-white">Submit</button>
    </div>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const ctx = await extractAIElementContext({
      filePath: sampleFilePath,
      line: 4,
      column: 6,
      rootDir: tempDir,
      userPrompt: 'Make it glassmorphism',
    });

    expect(ctx.tagName).toBe('button');
    expect(ctx.componentName).toBe('Card');
    expect(ctx.currentClasses).toBe('px-4 py-2 bg-blue-500 text-white');
    expect(ctx.currentText).toBe('Submit');
    expect(ctx.formattedPrompt).toContain('Make it glassmorphism');
    expect(ctx.formattedPrompt).toContain('<button');
    expect(ctx.formattedPrompt).toContain('<Card />');
  });

  it('resolves offline design heuristics cleanly', () => {
    const glass = resolveDesignHeuristic('p-4', 'Make it glassmorphism');
    expect(glass.suggestedClasses).toContain('backdrop-blur-md');
    expect(glass.explanation).toContain('glassmorphism');

    const glow = resolveDesignHeuristic('bg-slate-900', 'Add neon glow');
    expect(glow.suggestedClasses).toContain('ring-2');

    const grad = resolveDesignHeuristic('p-2', 'Vibrant gradient background');
    expect(grad.suggestedClasses).toContain('bg-gradient-to-r');
  });

  it('reconciles advanced typography, transforms, per-side borders, and effects cleanly', () => {
    const existing = 'leading-normal tracking-tight uppercase rotate-6 translate-x-[4px] border-t-2 border-solid border-slate-500 shadow-md blur-sm backdrop-blur-md opacity-100';
    const updated = reconcileClasses(
      existing,
      'leading-loose tracking-widest capitalize -rotate-12 translate-x-[14px] translate-y-[-8px] border-t-4 border-b-2 shadow-inner blur-lg opacity-50'
    );
    expect(updated).toContain('leading-loose');
    expect(updated).not.toContain('leading-normal');
    expect(updated).toContain('tracking-widest');
    expect(updated).not.toContain('tracking-tight');
    expect(updated).toContain('capitalize');
    expect(updated).not.toContain('uppercase');
    expect(updated).toContain('-rotate-12');
    expect(updated).not.toContain('rotate-6');
    expect(updated).toContain('translate-x-[14px]');
    expect(updated).not.toContain('translate-x-[4px]');
    expect(updated).toContain('translate-y-[-8px]');
    expect(updated).toContain('border-t-4');
    expect(updated).not.toContain('border-t-2');
    expect(updated).toContain('border-b-2');
    expect(updated).toContain('border-solid');
    expect(updated).toContain('border-slate-500');
    expect(updated).toContain('shadow-inner');
    expect(updated).not.toContain('shadow-md');
    expect(updated).toContain('blur-lg');
    expect(updated).not.toContain('blur-sm');
    expect(updated).toContain('backdrop-blur-md');
    expect(updated).toContain('opacity-50');
    expect(updated).not.toContain('opacity-100');
  });

  it('updates cn() / clsx() even when StringLiteral is not the first argument or missing', async () => {
    const sampleFilePath = path.join(tempDir, 'DynamicCn.tsx');
    const initialContent = `import { cn } from './utils';

export function Box({ className, active }: { className?: string; active: boolean }) {
  return (
    <div className={cn(className, 'p-4 bg-white', active && 'ring-2')}>
      <span className={cn(active && 'text-blue-500')}>Label</span>
    </div>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    const res1 = await updateSourceFile({
      filePath: sampleFilePath,
      line: 5,
      column: 4,
      action: { type: 'update-class', newClasses: 'p-8 bg-slate-900', removeClasses: ['p-4', 'bg-white'], mode: 'reconcile' },
    });
    expect(res1.success).toBe(true);
    expect(res1.newCode).toContain('p-8');
    expect(res1.newCode).toContain('bg-slate-900');
    expect(res1.newCode).toContain("active && 'ring-2'");
    expect(res1.newCode).not.toContain('bg-white');

    const res2 = await updateSourceFile({
      filePath: sampleFilePath,
      line: 6,
      column: 6,
      action: { type: 'update-class', newClasses: 'font-bold uppercase', mode: 'reconcile' },
    });
    expect(res2.success).toBe(true);
    expect(res2.newCode).toContain('"font-bold uppercase"');
    expect(res2.newCode).toContain("active && 'text-blue-500'");
  });

  it('reparents JSX elements inside containers and guards against parent-into-descendant cycles', async () => {
    const sampleFilePath = path.join(tempDir, 'Tree.tsx');
    const initialContent = `export function Tree() {
  return (
    <section>
      <div className="box-a"><span>Child</span></div>
      <p className="loose">Move Me</p>
    </section>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    // Nest <p className="loose"> inside <div className="box-a">
    const nestRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 5,
      column: 6,
      action: {
        type: 'reparent-element',
        targetLine: 4,
        targetColumn: 6,
        position: 'inside',
      },
    });
    expect(nestRes.success).toBe(true);
    expect(nestRes.newCode).toMatch(/<div className="box-a">[\s\S]*<p className="loose">Move Me<\/p>[\s\S]*<\/div>/);

    // Attempt cycle: move <section> (line 3) inside its own descendant <div className="box-a"> (line 4)
    const beforeCycle = await fs.readFile(sampleFilePath, 'utf-8');
    const cycleRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 3,
      column: 4,
      action: {
        type: 'reparent-element',
        targetLine: 4,
        targetColumn: 6,
        position: 'inside',
      },
    });
    expect(cycleRes.success).toBe(true);
    const afterCycle = await fs.readFile(sampleFilePath, 'utf-8');
    expect(afterCycle).toBe(beforeCycle);
  });

  it('reconciles position and inset classes cleanly without collision', () => {
    const existing = 'relative left-4 top-2 right-0 bg-white';
    const updated = reconcileClasses(existing, 'absolute left-[64px] top-[-12px]');
    expect(updated).toContain('absolute');
    expect(updated).not.toContain('relative');
    expect(updated).toContain('left-[64px]');
    expect(updated).not.toContain('left-4');
    expect(updated).toContain('top-[-12px]');
    expect(updated).not.toContain('top-2');
    expect(updated).toContain('right-0');
    expect(updated).toContain('bg-white');
  });

  it('extracts multi-element JSX snippets deduplicating nested descendants and pastes them cleanly', async () => {
    const sampleFilePath = path.join(tempDir, 'GroupPaste.tsx');
    const initialContent = `export function GroupPaste() {
  return (
    <main>
      <div className="group-a">
        <span className="inner">Inside A</span>
      </div>
      <p className="sibling">Sibling B</p>
      <section className="slot" />
    </main>
  );
}
`;
    await fs.writeFile(sampleFilePath, initialContent, 'utf-8');

    // Select group-a (line 4), its descendant inner span (line 5), and sibling p (line 7)
    const copyRes = await extractJSXSnippets(
      [
        { filePath: sampleFilePath, line: 4, column: 6 },
        { filePath: sampleFilePath, line: 5, column: 8 },
        { filePath: sampleFilePath, line: 7, column: 6 },
      ],
      tempDir
    );

    expect(copyRes.success).toBe(true);
    // Descendant <span className="inner"> must be deduplicated because <div className="group-a"> is selected
    expect(copyRes.snippets.length).toBe(2);
    expect(copyRes.snippets[0]).toContain('group-a');
    expect(copyRes.snippets[0]).toContain('Inside A');
    expect(copyRes.snippets[1]).toContain('Sibling B');

    // Paste after <p className="sibling"> (line 7)
    const pasteAfterRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: 7,
      column: 6,
      action: {
        type: 'paste-elements',
        snippets: copyRes.snippets,
        position: 'after',
      },
      rootDir: tempDir,
    });

    expect(pasteAfterRes.success).toBe(true);
    expect(pasteAfterRes.newCode?.match(/Inside A/g)?.length).toBe(2);
    expect(pasteAfterRes.newCode?.match(/Sibling B/g)?.length).toBe(2);

    // Paste inside self-closing <section className="slot" /> (find its current line)
    const lines = (pasteAfterRes.newCode || '').split('\n');
    const slotLine = lines.findIndex((l) => l.includes('className="slot"')) + 1;
    expect(slotLine).toBeGreaterThan(0);

    const pasteInsideRes = await updateSourceFile({
      filePath: sampleFilePath,
      line: slotLine,
      column: 6,
      action: {
        type: 'paste-elements',
        snippets: ['<span className="pasted-child">Nested Copy</span>'],
        position: 'inside',
      },
      rootDir: tempDir,
    });

    expect(pasteInsideRes.success).toBe(true);
    expect(pasteInsideRes.newCode).toMatch(/<section className="slot">[\s\S]*Nested Copy[\s\S]*<\/section>/);
  });
});

