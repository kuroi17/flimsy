import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  updateSourceFile,
  extractJSXSnippets,
  extractAIElementContext,
  resolveDesignHeuristic,
  writeSelectionState,
} from 'flimsy-core';
import { clientScript } from './client-script.js';

export interface FlimsyApiHandlerOptions {
  /** Enable CORS headers strictly for localhost / 127.0.0.1 origins (used by Next.js companion server). */
  corsLocalhost?: boolean;
  /** Optional API base URL prepended to client fetches when served cross-origin. */
  apiBase?: string;
}

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function applyLocalhostCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && LOCALHOST_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Shared local-first HTTP handler for Flimsy studio routes (`/@flimsy/client.js` and `/__flimsy/api/*`).
 * Reused identically by both `flimsy-dev/vite` and `flimsy-dev/next`.
 * Returns `true` if the request was handled, `false` to pass through.
 */
export async function handleFlimsyApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
  options: FlimsyApiHandlerOptions = {}
): Promise<boolean> {
  const urlStr = req.url || '';
  const isFlimsyRoute =
    urlStr === '/@flimsy/client.js' ||
    urlStr.startsWith('/@flimsy/client.js?') ||
    urlStr.startsWith('/__flimsy/api/');

  if (!isFlimsyRoute) {
    return false;
  }

  if (options.corsLocalhost) {
    applyLocalhostCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true;
    }
  }

  if (urlStr === '/@flimsy/client.js' || urlStr.startsWith('/@flimsy/client.js?')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const prefix = options.apiBase
      ? `window.__FLIMSY_API_BASE__ = ${JSON.stringify(options.apiBase)};\n`
      : '';
    res.end(prefix + clientScript);
    return true;
  }

  if (urlStr.startsWith('/__flimsy/api/inspect')) {
    const url = new URL(urlStr, 'http://localhost');
    const file = url.searchParams.get('file');
    if (file) {
      try {
        const fullPath = path.resolve(rootDir, file);
        const stats = await fs.stat(fullPath);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, mtime: stats.mtimeMs }));
      } catch (e: any) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return true;
    }
    return false;
  }

  if (urlStr === '/__flimsy/api/ai' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const context = await extractAIElementContext({
        filePath: data.file,
        line: Number(data.line),
        column: Number(data.col || 0),
        userPrompt: data.prompt,
        rootDir,
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
    return true;
  }

  if (urlStr === '/__flimsy/api/selection' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      if (data.primary && data.primary.file) {
        await writeSelectionState(rootDir, {
          primary: data.primary,
          targets: Array.isArray(data.targets) ? data.targets : [data.primary],
        });
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return true;
  }

  if (urlStr === '/__flimsy/api/copy' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const targets = Array.isArray(data.targets)
        ? data.targets.map((t: any) => ({
            filePath: t.file,
            line: Number(t.line),
            column: Number(t.col || 0),
          }))
        : [];
      const result = await extractJSXSnippets(targets, rootDir);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, snippets: [], error: err.message }));
    }
    return true;
  }

  if (urlStr === '/__flimsy/api/update' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);

      if (Array.isArray(data.updates)) {
        const results = [];
        let allSuccess = true;
        let latestMtime = 0;
        for (const item of data.updates) {
          const resItem = await updateSourceFile({
            filePath: item.file,
            line: Number(item.line),
            column: Number(item.col || 0),
            action: item.action,
            actions: item.actions,
            force: true,
            rootDir,
          });
          results.push(resItem);
          if (!resItem.success) allSuccess = false;
          if (resItem.mtime && resItem.mtime > latestMtime) latestMtime = resItem.mtime;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: allSuccess,
            results,
            mtime: latestMtime || Date.now(),
            error: allSuccess ? undefined : results.find((r) => !r.success)?.error,
          })
        );
        return true;
      }

      const result = await updateSourceFile({
        filePath: data.file,
        line: Number(data.line),
        column: Number(data.col || 0),
        action: data.action,
        actions: data.actions,
        expectedMtime: data.expectedMtime,
        force: Boolean(data.force),
        rootDir,
      });

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return true;
  }

  return false;
}
