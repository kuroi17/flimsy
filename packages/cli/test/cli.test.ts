import { describe, it, expect } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flimsy as namedFlimsy, default as defaultFlimsy } from '../src/index.js';
import { injectSourceLocations, updateSourceFile, writeSelectionState } from '../src/index.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));

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
    expect(stdout).toContain(`v${pkg.version}`);
  });

  it('runs opt-in MCP stdio server cleanly with live selection bridge and AST tools', async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'flimsy-mcp-test-'));
    const samplePath = path.join(tempDir, 'Card.tsx');
    await fsp.writeFile(
      samplePath,
      `export function Card() {\n  return (\n    <div className="p-4 bg-white">\n      <button className="px-4 py-2 bg-blue-500 text-white">Click Me</button>\n    </div>\n  );\n}\n`,
      'utf-8'
    );

    // Simulate active selection written by live Flimsy browser studio
    await writeSelectionState(tempDir, {
      primary: {
        file: 'Card.tsx',
        line: 4,
        col: 6,
        tagName: 'button',
        componentName: 'Card',
      },
      targets: [{ file: 'Card.tsx', line: 4, col: 6, tagName: 'button', componentName: 'Card' }],
    });

    const binPath = path.resolve(__dirname, '../bin/flimsy.js');
    const child = spawn(process.execPath, [binPath, 'mcp', '--root', tempDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses: any[] = [];
    let rawStdout = '';
    child.stdout.on('data', (chunk) => {
      rawStdout += chunk.toString('utf-8');
    });

    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'flimsy_get_selection', arguments: {} } },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'flimsy_update_classes', arguments: { newClasses: 'bg-zinc-950 rounded-xl' } },
      },
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'flimsy_update_text', arguments: { text: 'Synced via MCP' } },
      },
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'flimsy_paste_elements',
          arguments: { snippets: ['<span className="text-xs">Badge</span>'], position: 'after' },
        },
      },
    ];

    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + '\n');
    }
    child.stdin.end();

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', () => resolve());
    });

    try {
      const lines = rawStdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // Stdout must contain strictly valid JSON-RPC lines (6 requests with id; notification emits none)
      expect(lines.length).toBe(6);
      for (const l of lines) {
        responses.push(JSON.parse(l));
      }

      const initRes = responses.find((r) => r.id === 1);
      expect(initRes.result.serverInfo.name).toBe('flimsy');

      const listRes = responses.find((r) => r.id === 2);
      const toolNames = listRes.result.tools.map((t: any) => t.name);
      expect(toolNames).toEqual([
        'flimsy_get_selection',
        'flimsy_update_classes',
        'flimsy_update_text',
        'flimsy_paste_elements',
      ]);

      const selRes = responses.find((r) => r.id === 3);
      const selPayload = JSON.parse(selRes.result.content[0].text);
      expect(selPayload.tagName).toBe('button');
      expect(selPayload.currentText).toBe('Click Me');

      expect(responses.find((r) => r.id === 4).result.isError).toBeUndefined();
      expect(responses.find((r) => r.id === 5).result.isError).toBeUndefined();
      expect(responses.find((r) => r.id === 6).result.isError).toBeUndefined();

      const updatedDisk = await fsp.readFile(samplePath, 'utf-8');
      expect(updatedDisk).toContain('bg-zinc-950');
      expect(updatedDisk).toContain('rounded-xl');
      expect(updatedDisk).not.toContain('bg-blue-500');
      expect(updatedDisk).toContain('Synced via MCP');
      expect(updatedDisk).toContain('<span className="text-xs">Badge</span>');
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });
});
