import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleFlimsyApiRequest } from 'flimsy-vite';

export interface FlimsyNextOptions {
  /** Enable Flimsy in Next.js development mode. Defaults to true when NODE_ENV !== 'production'. */
  enabled?: boolean;
  /** Local companion API port bound strictly to 127.0.0.1. Defaults to 4193. */
  port?: number;
  /** Project root directory for resolving relative source paths. Defaults to process.cwd(). */
  rootDir?: string;
}

export interface FlimsyNextServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_NEXT_PORT = 4193;

function getDistDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function getFlimsyLoaderPath(): string {
  return path.join(getDistDir(), 'next-loader.cjs');
}

export function getFlimsyClientBootstrapPath(): string {
  return path.join(getDistDir(), 'next-client-bootstrap.js');
}

export function getFlimsyClientScriptUrl(port: number = DEFAULT_NEXT_PORT): string {
  return `http://127.0.0.1:${port}/@flimsy/client.js`;
}

/**
 * Starts the local-first companion HTTP server bound strictly to 127.0.0.1
 * for Next.js development sessions (reusing the exact same API handler as Vite).
 */
export async function startFlimsyNextServer(
  options: { rootDir?: string; port?: number } = {}
): Promise<FlimsyNextServerHandle> {
  const rootDir = options.rootDir || process.cwd();
  const requestedPort = options.port ?? DEFAULT_NEXT_PORT;

  let actualPort = requestedPort;
  const server = http.createServer(async (req, res) => {
    const apiBase = `http://127.0.0.1:${actualPort}`;
    const handled = await handleFlimsyApiRequest(req, res, rootDir, {
      corsLocalhost: true,
      apiBase,
    });
    if (!handled) {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && requestedPort !== 0) {
        server.off('error', onError);
        server.listen(0, '127.0.0.1', () => resolve());
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(requestedPort, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const addr = server.address();
  if (addr && typeof addr === 'object') {
    actualPort = addr.port;
  }

  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function ensureSingletonCompanionServer(rootDir: string, port: number): void {
  const g = globalThis as any;
  if (g.__FLIMSY_NEXT_SERVER_STARTED__) return;
  g.__FLIMSY_NEXT_SERVER_STARTED__ = true;

  startFlimsyNextServer({ rootDir, port }).catch(() => {
    g.__FLIMSY_NEXT_SERVER_STARTED__ = false;
  });
}

function injectBootstrapIntoWebpackEntry(originalEntry: any, bootstrapPath: string) {
  return async () => {
    const entries =
      typeof originalEntry === 'function' ? await originalEntry() : originalEntry;
    if (!entries || typeof entries !== 'object') return entries;

    const targetKeys = ['main-app', 'main'];
    let injected = false;

    for (const key of targetKeys) {
      if (entries[key]) {
        if (Array.isArray(entries[key])) {
          if (!entries[key].includes(bootstrapPath)) {
            entries[key].unshift(bootstrapPath);
          }
          injected = true;
        } else if (typeof entries[key] === 'string') {
          entries[key] = [bootstrapPath, entries[key]];
          injected = true;
        } else if (entries[key].import) {
          const imp = entries[key].import;
          if (Array.isArray(imp) && !imp.includes(bootstrapPath)) {
            imp.unshift(bootstrapPath);
          } else if (typeof imp === 'string') {
            entries[key].import = [bootstrapPath, imp];
          }
          injected = true;
        }
      }
    }

    if (!injected) {
      const firstKey = Object.keys(entries)[0];
      if (firstKey && Array.isArray(entries[firstKey]) && !entries[firstKey].includes(bootstrapPath)) {
        entries[firstKey].unshift(bootstrapPath);
      }
    }

    return entries;
  };
}

/**
 * Wraps a Next.js config (`next.config.mjs` / `next.config.ts`) to enable Flimsy visual editing
 * in local development with zero production bundle overhead.
 */
export function withFlimsy<T extends Record<string, any> = Record<string, any>>(
  nextConfig: T = {} as T,
  options: FlimsyNextOptions = {}
): T {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd || options.enabled === false) {
    return nextConfig;
  }

  const rootDir = options.rootDir || process.cwd();
  const port = options.port ?? DEFAULT_NEXT_PORT;
  const loaderPath = getFlimsyLoaderPath();
  const bootstrapPath = getFlimsyClientBootstrapPath();

  ensureSingletonCompanionServer(rootDir, port);

  const userWebpack = nextConfig.webpack;
  const existingTurbopack = nextConfig.turbopack || {};
  const existingTurboRules = existingTurbopack.rules || {};

  return {
    ...nextConfig,
    env: {
      ...(nextConfig.env || {}),
      NEXT_PUBLIC_FLIMSY_URL: `http://127.0.0.1:${port}`,
    },
    turbopack: {
      ...existingTurbopack,
      rules: {
        ...existingTurboRules,
        '*.tsx': {
          loaders: [{ loader: loaderPath, options: { rootDir } }],
        },
        '*.jsx': {
          loaders: [{ loader: loaderPath, options: { rootDir } }],
        },
      },
    },
    webpack(config: any, ctx: any) {
      const resolvedConfig = typeof userWebpack === 'function' ? userWebpack(config, ctx) : config;

      if (ctx?.dev) {
        resolvedConfig.module = resolvedConfig.module || {};
        resolvedConfig.module.rules = resolvedConfig.module.rules || [];
        resolvedConfig.module.rules.push({
          test: /\.[jt]sx$/,
          exclude: /node_modules/,
          enforce: 'pre',
          use: [{ loader: loaderPath, options: { rootDir } }],
        });

        if (!ctx.isServer && resolvedConfig.entry) {
          resolvedConfig.entry = injectBootstrapIntoWebpackEntry(
            resolvedConfig.entry,
            bootstrapPath
          );
        }
      }

      return resolvedConfig;
    },
  };
}

export default withFlimsy;
