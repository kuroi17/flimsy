import type { Plugin } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { injectSourceLocations, updateSourceFile } from '@flimsy/core';
import { clientScript } from './client-script.js';

export interface FlimsyOptions {
  /**
   * Whether Flimsy inspection is enabled. Defaults to true in development.
   */
  enabled?: boolean;
}

export function flimsy(options: FlimsyOptions = {}): Plugin {
  let root = process.cwd();

  return {
    name: 'vite-plugin-flimsy',
    apply: 'serve', // Only active during local development
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
    },

    transform(code, id) {
      if (options.enabled === false) return null;

      const cleanId = id.split('?')[0];
      if (!/\.[jt]sx$/.test(cleanId) || cleanId.includes('node_modules')) {
        return null;
      }

      return injectSourceLocations(code, cleanId, { rootDir: root });
    },

    configureServer(server) {
      if (options.enabled === false) return;

      // Middleware: Serve client script & handle update API
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/@flimsy/client.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(clientScript);
          return;
        }

        if (req.url?.startsWith('/__flimsy/api/inspect')) {
          const url = new URL(req.url, 'http://localhost');
          const file = url.searchParams.get('file');
          if (file) {
            try {
              const fullPath = path.resolve(root, file);
              const stats = await fs.stat(fullPath);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, mtime: stats.mtimeMs }));
              return;
            } catch (e: any) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: e.message }));
              return;
            }
          }
        }

        if (req.url === '/__flimsy/api/ai' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const { extractAIElementContext, resolveDesignHeuristic } = await import('@flimsy/core');
              const context = await extractAIElementContext({
                filePath: data.file,
                line: Number(data.line),
                column: Number(data.col || 0),
                userPrompt: data.prompt,
                rootDir: root,
              });

              const suggestion = resolveDesignHeuristic(context.currentClasses, data.prompt || '');

              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  context,
                  suggestion,
                  copyPrompt: context.formattedPrompt,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        if (req.url === '/__flimsy/api/update' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const result = await updateSourceFile({
                filePath: data.file,
                line: Number(data.line),
                column: Number(data.col || 0),
                action: data.action,
                actions: data.actions,
                expectedMtime: data.expectedMtime,
                force: Boolean(data.force),
                rootDir: root,
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },

    transformIndexHtml(html) {
      if (options.enabled === false) return html;
      return [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: '/@flimsy/client.js',
          },
          injectTo: 'body',
        },
      ];
    },
  };
}

export default flimsy;

