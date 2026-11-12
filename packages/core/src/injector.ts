import * as babelParser from '@babel/parser';
import traversePkg from '@babel/traverse';
import MagicString from 'magic-string';
import path from 'node:path';
import type { InjectOptions } from './types.js';

// Handle Babel ESM / CJS interop
const traverse = (traversePkg as any).default || traversePkg;

export function injectSourceLocations(
  code: string,
  id: string,
  options: InjectOptions = {}
): { code: string; map: any } {
  // Only process JSX and TSX files
  const cleanId = id.split('?')[0];
  if (!/\.[jt]sx$/.test(cleanId) || cleanId.includes('node_modules')) {
    return { code, map: null };
  }

  const root = options.rootDir || process.cwd();
  const relFile = path.relative(root, cleanId).replace(/\\/g, '/');
  const compName = path.basename(relFile).replace(/\.[jt]sx?$/, '');

  let ast: any;
  try {
    ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      tokens: true,
    });
  } catch (err) {
    // If syntax parsing fails (e.g. malformed or experimental syntax), fallback to original code
    return { code, map: null };
  }

  const s = new MagicString(code);

  traverse(ast, {
    JSXOpeningElement(pathNode: any) {
      const node = pathNode.node;
      if (!node || !node.loc || !node.name) return;

      // Skip if already tagged
      const hasFlimsyAttr = node.attributes?.some(
        (attr: any) =>
          attr.type === 'JSXAttribute' &&
          attr.name &&
          attr.name.name === 'data-flimsy-file'
      );
      if (hasFlimsyAttr) return;

      const line = node.loc.start.line;
      const col = node.loc.start.column;

      let tagName = '';
      if (node.name.type === 'JSXIdentifier') {
        tagName = node.name.name;
      } else if (node.name.type === 'JSXMemberExpression') {
        const obj = node.name.object?.name || '';
        const prop = node.name.property?.name || '';
        tagName = `${obj}.${prop}`;
      }

      const isComponent = /^[A-Z]/.test(tagName);
      const elemType = isComponent ? 'component' : 'element';

      const insertPos = node.name.end;
      if (typeof insertPos === 'number') {
        const injectedAttrs = ` data-flimsy-file="${relFile}" data-flimsy-line="${line}" data-flimsy-col="${col}" data-flimsy-name="${tagName}" data-flimsy-comp="${compName}" data-flimsy-type="${elemType}"`;
        s.appendRight(insertPos, injectedAttrs);
      }
    },
  });

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: cleanId }),
  };
}

