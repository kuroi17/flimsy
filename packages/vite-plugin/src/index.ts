import type { Plugin } from 'vite';
import { injectSourceLocations, isSupportedSourceFile } from 'flimsy-core';
import { handleFlimsyApiRequest } from './api-handler.js';

export { handleFlimsyApiRequest, type FlimsyApiHandlerOptions } from './api-handler.js';
export { clientScript } from './client-script.js';

export interface FlimsyOptions {
  /**
   * Whether Flimsy inspection is enabled. Defaults to true in development.
   */
  enabled?: boolean;
}

export function flimsy(options: FlimsyOptions = {}): Plugin {
  let root = process.cwd();
  let isDuplicate = false;

  const plugin: Plugin = {
    name: 'vite-plugin-flimsy',
    apply: 'serve', // Only active during local development
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      const firstIdx = config.plugins.findIndex((p) => p && p.name === 'vite-plugin-flimsy');
      const selfIdx = config.plugins.indexOf(plugin);
      if (firstIdx !== -1 && selfIdx !== -1 && selfIdx !== firstIdx) {
        isDuplicate = true;
      }
    },

    transform(code, id) {
      if (options.enabled === false || isDuplicate) return null;
      if (id.includes('node_modules')) return null;

      // Skip Vite/framework virtual sub-modules (e.g. ?vue&type=style, ?vue&type=script, ?raw, ?url, ?inline)
      if (/[?&](type=(style|script)|raw|url|inline)\b/i.test(id)) {
        return null;
      }

      const cleanId = id.split('?')[0];
      if (!isSupportedSourceFile(cleanId)) {
        return null;
      }

      return injectSourceLocations(code, cleanId, { rootDir: root });
    },

    configureServer(server) {
      if (options.enabled === false || isDuplicate) return;

      server.middlewares.use(async (req, res, next) => {
        const handled = await handleFlimsyApiRequest(req, res, root);
        if (!handled) next();
      });
    },

    transformIndexHtml(html, ctx) {
      if (options.enabled === false || isDuplicate) return html;

      // Stamp static elements in Vanilla HTML / HTMX / Alpine pages (skips empty SPA #root/#app mounts)
      let stampedHtml = html;
      if (ctx?.filename && /\.html?$/i.test(ctx.filename)) {
        const res = injectSourceLocations(html, ctx.filename, { rootDir: root });
        if (res.code) stampedHtml = res.code;
      }

      return {
        html: stampedHtml,
        tags: [
          {
            tag: 'script',
            attrs: {
              type: 'module',
              src: '/@flimsy/client.js',
            },
            injectTo: 'body',
          },
        ],
      };
    },
  };

  return plugin;
}

export default flimsy;
