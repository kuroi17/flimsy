import readline from 'node:readline';
import {
  extractAIElementContext,
  readSelectionState,
  updateSourceFile,
} from 'flimsy-core';

const MCP_SERVER_INFO = {
  name: 'flimsy',
  version: '0.3.0',
};

const MCP_TOOLS = [
  {
    name: 'flimsy_get_selection',
    description:
      'Get the currently selected UI element(s) from the active Flimsy localhost studio (file, line, column, component, markup/JSX snippet, Tailwind classes, text), or inspect any supported frontend source file (.tsx, .jsx, .vue, .svelte, .astro, .html) when file and line are provided.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Optional relative or absolute path to a .tsx, .jsx, .vue, .svelte, .astro, or .html file' },
        line: { type: 'number', description: 'Optional 1-based line number of the element' },
        col: { type: 'number', description: 'Optional 0-based column number (defaults to 0)' },
        prompt: { type: 'string', description: 'Optional goal description for formatted context' },
      },
    },
  },
  {
    name: 'flimsy_update_classes',
    description:
      'Deterministically update Tailwind CSS classes on an element in .tsx, .jsx, .vue, .svelte, .astro, or .html source code via Flimsy reconciliation (preserves formatting, comments, cn(), clsx(), :class, class:*, [ngClass]). Defaults to active Flimsy browser selection if file/line are omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Optional path to source file (defaults to active selection)' },
        line: { type: 'number', description: 'Optional 1-based line number (defaults to active selection)' },
        col: { type: 'number', description: 'Optional 0-based column number (defaults to active selection or 0)' },
        newClasses: { type: 'string', description: 'Space-separated Tailwind classes to apply' },
        removeClasses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional exact Tailwind class tokens to remove',
        },
        mode: {
          type: 'string',
          enum: ['reconcile', 'append', 'replace'],
          description: 'Class update mode (defaults to reconcile)',
        },
      },
      required: ['newClasses'],
    },
  },
  {
    name: 'flimsy_update_text',
    description:
      'Update the visible text content of an element in .tsx, .jsx, .vue, .svelte, .astro, or .html source code while preserving template expressions ({expr}, {{ expr }}). Defaults to active Flimsy browser selection if file/line are omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Optional path to source file (defaults to active selection)' },
        line: { type: 'number', description: 'Optional 1-based line number (defaults to active selection)' },
        col: { type: 'number', description: 'Optional 0-based column number (defaults to active selection or 0)' },
        text: { type: 'string', description: 'New text content for the element' },
      },
      required: ['text'],
    },
  },
  {
    name: 'flimsy_paste_elements',
    description:
      'Insert one or more JSX or HTML/template element snippets after or inside a target element with pre-write syntax validation. Defaults to active Flimsy browser selection if file/line are omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Optional path to source file (defaults to active selection)' },
        line: { type: 'number', description: 'Optional 1-based line number (defaults to active selection)' },
        col: { type: 'number', description: 'Optional 0-based column number (defaults to active selection or 0)' },
        snippets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Clean JSX or markup element snippets to insert',
        },
        position: {
          type: 'string',
          enum: ['after', 'inside'],
          description: 'Insert as sibling after target or as child inside target (defaults to after)',
        },
      },
      required: ['snippets'],
    },
  },
];

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string };
}

async function resolveTargetCoords(
  rootDir: string,
  args: Record<string, any>
): Promise<{ file: string; line: number; col: number }> {
  if (typeof args.file === 'string' && args.file && typeof args.line === 'number') {
    return {
      file: args.file,
      line: args.line,
      col: typeof args.col === 'number' ? args.col : 0,
    };
  }

  const selection = await readSelectionState(rootDir);
  if (!selection || !selection.primary?.file) {
    throw new Error(
      'No active Flimsy browser selection found. Select an element on localhost (Alt+X) or pass explicit file and line arguments.'
    );
  }

  return {
    file: selection.primary.file,
    line: selection.primary.line,
    col: selection.primary.col || 0,
  };
}

function okContent(payload: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function errContent(message: string) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

export function createMcpHandler(rootDir: string = process.cwd()) {
  return async function handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const hasId = msg.id !== undefined && msg.id !== null;
    const id = msg.id ?? null;

    if (msg.method === 'initialize') {
      const requestedVersion =
        typeof msg.params?.protocolVersion === 'string'
          ? msg.params.protocolVersion
          : '2024-11-05';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: requestedVersion,
          capabilities: { tools: {} },
          serverInfo: MCP_SERVER_INFO,
        },
      };
    }

    if (msg.method === 'notifications/initialized' || msg.method === 'notifications/cancelled') {
      return null;
    }

    if (msg.method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (msg.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: MCP_TOOLS },
      };
    }

    if (msg.method === 'tools/call') {
      const toolName = msg.params?.name;
      const args = (msg.params?.arguments || {}) as Record<string, any>;

      try {
        if (toolName === 'flimsy_get_selection') {
          const selection = await readSelectionState(rootDir);
          const coords = await resolveTargetCoords(rootDir, args);
          const context = await extractAIElementContext({
            filePath: coords.file,
            line: coords.line,
            column: coords.col,
            rootDir,
            userPrompt: typeof args.prompt === 'string' ? args.prompt : undefined,
          });
          return {
            jsonrpc: '2.0',
            id,
            result: okContent({
              ...context,
              column: coords.col,
              selectedTargets: selection?.targets || [coords],
            }),
          };
        }

        if (toolName === 'flimsy_update_classes') {
          if (typeof args.newClasses !== 'string') {
            return { jsonrpc: '2.0', id, result: errContent('Missing required string argument: newClasses') };
          }
          const coords = await resolveTargetCoords(rootDir, args);
          const res = await updateSourceFile({
            filePath: coords.file,
            line: coords.line,
            column: coords.col,
            rootDir,
            force: true,
            action: {
              type: 'update-class',
              newClasses: args.newClasses,
              removeClasses: Array.isArray(args.removeClasses) ? args.removeClasses : undefined,
              mode: args.mode === 'append' || args.mode === 'replace' ? args.mode : 'reconcile',
            },
          });
          if (!res.success) {
            return { jsonrpc: '2.0', id, result: errContent(res.error || 'Failed to update classes') };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: okContent({
              success: true,
              file: coords.file,
              line: coords.line,
              col: coords.col,
              mtime: res.mtime,
            }),
          };
        }

        if (toolName === 'flimsy_update_text') {
          if (typeof args.text !== 'string') {
            return { jsonrpc: '2.0', id, result: errContent('Missing required string argument: text') };
          }
          const coords = await resolveTargetCoords(rootDir, args);
          const res = await updateSourceFile({
            filePath: coords.file,
            line: coords.line,
            column: coords.col,
            rootDir,
            force: true,
            action: { type: 'update-text', text: args.text },
          });
          if (!res.success) {
            return { jsonrpc: '2.0', id, result: errContent(res.error || 'Failed to update text') };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: okContent({
              success: true,
              file: coords.file,
              line: coords.line,
              col: coords.col,
              mtime: res.mtime,
            }),
          };
        }

        if (toolName === 'flimsy_paste_elements') {
          if (!Array.isArray(args.snippets) || args.snippets.length === 0) {
            return { jsonrpc: '2.0', id, result: errContent('Missing required non-empty array argument: snippets') };
          }
          const coords = await resolveTargetCoords(rootDir, args);
          const position = args.position === 'inside' ? 'inside' : 'after';
          const res = await updateSourceFile({
            filePath: coords.file,
            line: coords.line,
            column: coords.col,
            rootDir,
            force: true,
            action: {
              type: 'paste-elements',
              snippets: args.snippets.map(String),
              position,
            },
          });
          if (!res.success) {
            return { jsonrpc: '2.0', id, result: errContent(res.error || 'Failed to paste elements') };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: okContent({
              success: true,
              file: coords.file,
              line: coords.line,
              col: coords.col,
              inserted: args.snippets.length,
              position,
              mtime: res.mtime,
            }),
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: errContent(`Unknown tool: ${String(toolName)}`),
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          result: errContent(err?.message || String(err)),
        };
      }
    }

    if (!hasId) return null;
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${msg.method}` },
    };
  };
}

export function startMcpServer(rootDir: string = process.cwd()): void {
  const handleMessage = createMcpHandler(rootDir);
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  // Serialize incoming JSON-RPC messages to guarantee ordered responses and prevent same-file write races
  let queue = Promise.resolve();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    queue = queue.then(async () => {
      try {
        const msg = JSON.parse(trimmed) as JsonRpcRequest;
        const response = await handleMessage(msg);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err: any) {
        const parseErr: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err?.message || String(err)}` },
        };
        process.stdout.write(JSON.stringify(parseErr) + '\n');
      }
    });
  });
}
