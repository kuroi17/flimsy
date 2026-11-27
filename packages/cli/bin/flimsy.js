#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const options = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  port: { type: 'string', short: 'p' },
  host: { type: 'boolean', short: 'H' },
  open: { type: 'boolean', short: 'o' },
  root: { type: 'string', short: 'r' },
};

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options,
  allowPositionals: true,
});

const command = positionals[0] || 'dev';

// MCP stdio mode MUST keep stdout strictly reserved for JSON-RPC 2.0 messages
if (command === 'mcp' && !values.help && !values.version) {
  const { startMcpServer } = await import('../dist/mcp.js');
  const rootDir = values.root ? path.resolve(values.root) : process.cwd();
  startMcpServer(rootDir);
} else {
  console.log('\x1b[36m%s\x1b[0m', 'Flimsy: Direct UI changes synced to codebase.');

  if (values.version) {
    try {
      const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      console.log(`v${pkg.version}`);
    } catch {
      console.log('v0.5.0');
    }
    process.exit(0);
  }

  if (values.help || command === 'help') {
    console.log(`
Usage:
  npx flimsy-dev [command] [options]

Commands:
  dev               Launch development server with Flimsy visual editor (default)
  mcp               Start optional MCP stdio server for AI coding agents
  help              Show this help message

Options:
  -p, --port <port> Specify dev server port (e.g. 5173)
  -H, --host        Expose dev server to local network
  -o, --open        Open browser on server startup
  -r, --root <dir>  Project root directory (used by mcp)
  -v, --version     Show version number
  -h, --help        Show help
`);
    process.exit(0);
  }

  if (command === 'dev') {
    try {
      const cwd = process.cwd();

      // Check if current directory has a Vite config or package.json
      const hasPkg = fs.existsSync(path.resolve(cwd, 'package.json'));
      if (!hasPkg) {
        console.warn('\x1b[33m%s\x1b[0m', 'Notice: No package.json detected in the current directory. Launching in current folder.');
      }

      // Try to load Vite from project node_modules or resolution
      let viteModule;
      const projectVitePath = path.resolve(cwd, 'node_modules/vite/dist/node/index.js');
      if (fs.existsSync(projectVitePath)) {
        viteModule = await import(pathToFileURL(projectVitePath).href);
      } else {
        try {
          viteModule = await import('vite');
        } catch {
          console.error('\x1b[31m%s\x1b[0m', 'Error: Vite not found in the current project. Run `npm install` or `pnpm install` first.');
          process.exit(1);
        }
      }

      const { createServer } = viteModule;
      const { flimsy } = await import('../dist/vite.js');

      const port = values.port ? parseInt(values.port, 10) : undefined;
      const server = await createServer({
        root: cwd,
        server: {
          port,
          host: values.host ? true : undefined,
          open: values.open ? true : undefined,
        },
        plugins: [flimsy()],
      });

      await server.listen();
      server.printUrls();
      console.log('\x1b[32m%s\x1b[0m', 'Flimsy visual inspection overlay is active. (Press Alt+X in browser to inspect)');

      const cleanExit = async () => {
        console.log('\nClosing Flimsy dev server...');
        await server.close();
        process.exit(0);
      };

      process.on('SIGINT', cleanExit);
      process.on('SIGTERM', cleanExit);
    } catch (err) {
      console.error('\x1b[31m%s\x1b[0m', 'Failed to launch dev server with Flimsy: ' + (err.message || err));
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
