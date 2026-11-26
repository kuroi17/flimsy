import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const coreRoot = path.resolve(__dirname, '../core');
const viteRoot = path.resolve(__dirname, '../vite-plugin');

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const external = [
  'node:*',
  '@babel/parser',
  '@babel/traverse',
  '@babel/types',
  'magic-string',
  'recast',
  'vite',
];

const workspaceAliasPlugin = {
  name: 'flimsy-workspace-alias',
  setup(b) {
    b.onResolve({ filter: /^flimsy-core$/ }, () => ({
      path: path.join(coreRoot, 'src/index.ts'),
    }));
    b.onResolve({ filter: /^flimsy-vite$/ }, () => ({
      path: path.join(viteRoot, 'src/index.ts'),
    }));
  },
};

await build({
  entryPoints: [
    path.join(__dirname, 'src/index.ts'),
    path.join(__dirname, 'src/vite.ts'),
    path.join(__dirname, 'src/mcp.ts'),
  ],
  outdir: distDir,
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  external,
  plugins: [workspaceAliasPlugin],
});

// Bundle TypeScript declarations cleanly so end users need zero external sub-packages
const coreTypesDir = path.join(distDir, '_core');
const viteTypesDir = path.join(distDir, '_vite');
await fs.mkdir(coreTypesDir, { recursive: true });
await fs.mkdir(viteTypesDir, { recursive: true });

async function copyDeclarations(srcDir, destDir, transform) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      let content = await fs.readFile(path.join(srcDir, entry.name), 'utf-8');
      if (transform) content = transform(content, entry.name);
      await fs.writeFile(path.join(destDir, entry.name), content, 'utf-8');
    }
  }
}

await copyDeclarations(path.join(coreRoot, 'dist'), coreTypesDir);
await copyDeclarations(path.join(viteRoot, 'dist'), viteTypesDir, (content) =>
  content.replace(/from ['"]flimsy-core['"]/g, "from '../_core/index.js'")
);

await fs.writeFile(
  path.join(distDir, 'index.d.ts'),
  `export * from './_core/index.js';\nexport * from './_vite/index.js';\nexport { flimsy as default } from './_vite/index.js';\n`,
  'utf-8'
);

await fs.writeFile(
  path.join(distDir, 'vite.d.ts'),
  `export * from './_vite/index.js';\nexport { flimsy as default } from './_vite/index.js';\n`,
  'utf-8'
);

console.log('✓ Unified flimsy-dev bundle & declarations built in dist/');
