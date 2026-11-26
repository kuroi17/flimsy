import { injectSourceLocations } from 'flimsy-core';

interface WebpackLoaderContext {
  resourcePath: string;
  getOptions?: () => { rootDir?: string };
}

/**
 * Webpack / Turbopack pre-loader that stamps `data-flimsy-*` source coordinates
 * onto JSX/TSX elements during Next.js development builds only.
 */
function flimsyNextLoader(this: WebpackLoaderContext, source: string): string {
  const resourcePath = this?.resourcePath || '';
  if (!resourcePath || resourcePath.includes('node_modules')) {
    return source;
  }

  const opts = typeof this?.getOptions === 'function' ? this.getOptions() : {};
  const rootDir = opts?.rootDir || process.cwd();
  const result = injectSourceLocations(source, resourcePath, { rootDir });
  return result.code;
}

module.exports = flimsyNextLoader;
