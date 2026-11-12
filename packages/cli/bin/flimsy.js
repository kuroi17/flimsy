#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

console.log('\\x1b[36m%s\\x1b[0m', '⚡ Flimsy: Direct UI changes synced to codebase.');

const options = {
  help: { type: 'boolean', short: 'h' },
  port: { type: 'string', short: 'p' },
};

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Usage:
  npx flimsy [command] [options]

Commands:
  dev       Launch development server with Flimsy visual editor (default)
  help      Show this help message

Options:
  -p, --port <port>   Specify server port
  -h, --help          Show help
`);
  process.exit(0);
}

const command = positionals[0] || 'dev';

if (command === 'dev') {
  try {
    // Try to load Vite from current project or global
    const projectVitePath = path.resolve(process.cwd(), 'node_modules/vite/dist/node/index.js');
    let viteModule;
    try {
      viteModule = await import(pathToFileURL(projectVitePath).href);
    } catch {
      viteModule = await import('vite');
    }

    const { createServer } = viteModule;
    const { flimsy } = await import('../dist/vite.js');

    const port = values.port ? parseInt(values.port, 10) : undefined;
    const server = await createServer({
      configFile: true,
      server: { port },
      plugins: [flimsy()],
    });

    await server.listen();
    server.printUrls();
    console.log('\\x1b[32m%s\\x1b[0m', '✓ Flimsy visual inspection overlay is active.');
  } catch (err) {
    console.error('\\x1b[31m%s\\x1b[0m', 'Failed to launch dev server with Flimsy: ' + err.message);
    process.exit(1);
  }
} else {
  console.error(`Unknown command: \${command}`);
  process.exit(1);
}
