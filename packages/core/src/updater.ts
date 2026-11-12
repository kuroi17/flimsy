import fs from 'node:fs/promises';
import path from 'node:path';
import * as recast from 'recast';
import * as babelParser from '@babel/parser';
import traversePkg from '@babel/traverse';
import type { UpdateAction, UpdateResult, UpdateSourceOptions } from './types.js';

const traverse = (traversePkg as any).default || traversePkg;
const b = recast.types.builders;

export async function updateSourceFile(
  options: UpdateSourceOptions
): Promise<UpdateResult> {
  const root = options.rootDir || process.cwd();
  const resolvedPath = path.isAbsolute(options.filePath)
    ? options.filePath
    : path.resolve(root, options.filePath);

  let oldCode: string;
  try {
    oldCode = await fs.readFile(resolvedPath, 'utf-8');
  } catch (err: any) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Failed to read file ${resolvedPath}: ${err.message}`,
    };
  }

  let ast: any;
  try {
    ast = recast.parse(oldCode, {
      parser: {
        parse(source: string) {
          return babelParser.parse(source, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript'],
            tokens: true,
          });
        },
      },
    });
  } catch (err: any) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Failed to parse file ${resolvedPath}: ${err.message}`,
    };
  }

  // Find target element by line and column
  let targetElementNode: any = null;
  let targetOpeningNode: any = null;
  let minColDiff = Infinity;

  traverse(ast, {
    JSXElement(pathNode: any) {
      const opening = pathNode.node.openingElement;
      if (!opening || !opening.loc) return;

      const startLine = opening.loc.start.line;
      if (startLine === options.line) {
        const colDiff = Math.abs(opening.loc.start.column - options.column);
        if (colDiff < minColDiff) {
          minColDiff = colDiff;
          targetElementNode = pathNode.node;
          targetOpeningNode = opening;
        }
      }
    },
  });

  // If exact line was not matched, search for nearest element within +/- 1 line
  if (!targetOpeningNode) {
    traverse(ast, {
      JSXElement(pathNode: any) {
        const opening = pathNode.node.openingElement;
        if (!opening || !opening.loc) return;

        const lineDiff = Math.abs(opening.loc.start.line - options.line);
        if (lineDiff <= 1) {
          const colDiff = Math.abs(opening.loc.start.column - options.column);
          if (colDiff < minColDiff) {
            minColDiff = colDiff;
            targetElementNode = pathNode.node;
            targetOpeningNode = opening;
          }
        }
      },
    });
  }

  if (!targetOpeningNode) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Could not find JSX element at line ${options.line}, column ${options.column} in ${options.filePath}`,
    };
  }

  // Apply action(s)
  if (options.actions && Array.isArray(options.actions)) {
    for (const act of options.actions) {
      applyAction(targetElementNode, targetOpeningNode, act);
    }
  } else if (options.action) {
    applyAction(targetElementNode, targetOpeningNode, options.action);
  }

  let newCode: string;
  try {
    newCode = recast.print(ast).code;
  } catch (err: any) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Failed to serialize modified AST: ${err.message}`,
    };
  }

  // Pre-write Safety Validation: Verify syntax before touching disk
  try {
    babelParser.parse(newCode, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
  } catch (validationErr: any) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Safety abort: Generated code failed syntax validation (${validationErr.message}). Original file was preserved.`,
    };
  }

  try {
    await fs.writeFile(resolvedPath, newCode, 'utf-8');
  } catch (err: any) {
    return {
      success: false,
      filePath: resolvedPath,
      error: `Failed to write file ${resolvedPath}: ${err.message}`,
    };
  }

  return {
    success: true,
    filePath: resolvedPath,
    oldCode,
    newCode,
  };
}

function applyAction(
  elementNode: any,
  openingNode: any,
  action: UpdateAction
): void {
  if (action.type === 'update-text') {
    // If element has JSXText child, update it
    let foundText = false;
    if (elementNode.children && elementNode.children.length > 0) {
      for (const child of elementNode.children) {
        if (child.type === 'JSXText') {
          child.value = action.text;
          if (child.extra) child.extra.raw = action.text;
          foundText = true;
          break;
        }
      }
    }

    if (!foundText) {
      // If no text child, replace or prepend child with new JSXText
      const newTextNode = b.jsxText(action.text);
      if (!elementNode.children) {
        elementNode.children = [];
      }
      elementNode.children.push(newTextNode);
    }
  } else if (action.type === 'update-class') {
    let classAttr = openingNode.attributes?.find(
      (attr: any) =>
        attr.type === 'JSXAttribute' &&
        attr.name &&
        attr.name.name === 'className'
    );

    if (classAttr) {
      if (classAttr.value?.type === 'StringLiteral') {
        const existingClasses = classAttr.value.value || '';
        const updated = reconcileClasses(
          existingClasses,
          action.newClasses,
          action.removeClasses,
          action.mode
        );
        classAttr.value.value = updated;
        if (classAttr.value.extra) {
          classAttr.value.extra.raw = JSON.stringify(updated);
        }
      } else if (classAttr.value?.type === 'JSXExpressionContainer') {
        const expr = classAttr.value.expression;

        // StringLiteral inside container: className={'...'}
        if (expr?.type === 'StringLiteral') {
          const existingClasses = expr.value || '';
          const updated = reconcileClasses(
            existingClasses,
            action.newClasses,
            action.removeClasses,
            action.mode
          );
          expr.value = updated;
        }
        // TemplateLiteral: className={`p-4 bg-white ${active ? '...' : ''}`}
        else if (expr?.type === 'TemplateLiteral' && expr.quasis?.length > 0) {
          const firstQuasi = expr.quasis[0];
          const existingClasses = firstQuasi.value.raw || '';
          const updated = reconcileClasses(
            existingClasses,
            action.newClasses,
            action.removeClasses,
            action.mode
          );
          firstQuasi.value.raw = updated ? (updated + ' ') : '';
          firstQuasi.value.cooked = firstQuasi.value.raw;
        }
        // CallExpression: className={cn('p-4 bg-white', isSpecial && '...')}
        else if (expr?.type === 'CallExpression' && expr.arguments?.length > 0) {
          const firstArg = expr.arguments[0];
          if (firstArg.type === 'StringLiteral') {
            const existingClasses = firstArg.value || '';
            const updated = reconcileClasses(
              existingClasses,
              action.newClasses,
              action.removeClasses,
              action.mode
            );
            firstArg.value = updated;
            if (firstArg.extra) {
              firstArg.extra.raw = JSON.stringify(updated);
            }
          }
        }
      }
    } else {
      // Add new className attribute
      if (!openingNode.attributes) {
        openingNode.attributes = [];
      }
      const newAttr = b.jsxAttribute(
        b.jsxIdentifier('className'),
        b.stringLiteral(action.newClasses.trim())
      );
      openingNode.attributes.push(newAttr);
    }
  }
}

/**
 * Reconciles Tailwind classes (e.g. handles removeClasses and additions/replacements).
 */
export function reconcileClasses(
  existingClasses: string,
  newClasses: string,
  removeClasses: string[] = [],
  mode: 'replace' | 'append' | 'reconcile' = 'reconcile'
): string {
  if (mode === 'replace') {
    return newClasses.trim();
  }

  const existingTokens = existingClasses.split(/\s+/).filter(Boolean);
  const removeSet = new Set(removeClasses);
  const newTokens = newClasses.split(/\s+/).filter(Boolean);

  // Filter out explicit removals
  let filtered = existingTokens.filter((token) => !removeSet.has(token));

  if (mode === 'reconcile') {
    // For each new class, detect if it conflicts with an existing class prefix
    // (e.g., bg-*, p-*, text-*, rounded-*)
    for (const newClass of newTokens) {
      const prefix = getTailwindPropertyPrefix(newClass);
      if (prefix) {
        const isMasterPadding = /^([^:]+:)?p-/.test(prefix) && !/^([^:]+:)?p[xytrbl]-/.test(prefix);
        const isMasterMargin = /^([^:]+:)?m-/.test(prefix) && !/^([^:]+:)?m[xytrbl]-/.test(prefix);

        filtered = filtered.filter((token) => {
          const tokenPrefix = getTailwindPropertyPrefix(token);
          if (!tokenPrefix) return true;
          if (tokenPrefix === prefix) return false;
          if (isMasterPadding && /^([^:]+:)?p[xytrbl]-/.test(tokenPrefix)) return false;
          if (isMasterMargin && /^([^:]+:)?m[xytrbl]-/.test(tokenPrefix)) return false;
          return true;
        });
      }
      filtered.push(newClass);
    }
    return Array.from(new Set(filtered)).join(' ');
  }

  // Default append
  for (const newClass of newTokens) {
    if (!filtered.includes(newClass)) {
      filtered.push(newClass);
    }
  }

  return filtered.join(' ');
}

/**
 * Helper to identify conflicting Tailwind utility prefixes with category awareness
 */
export function getTailwindPropertyPrefix(cls: string): string | null {
  const parts = cls.split(':');
  const base = parts[parts.length - 1];
  const variantPrefix = parts.slice(0, -1).join(':');

  const withVariant = (cat: string) => (variantPrefix ? `${variantPrefix}:${cat}` : cat);

  // 1. Text alignments
  if (/^text-(left|center|right|justify|start|end)$/.test(base)) {
    return withVariant('text-align');
  }

  // 2. Font sizes
  if (/^text-([0-9]?xl|xs|sm|base|lg)$/.test(base)) {
    return withVariant('font-size');
  }

  // 3. Text colors (e.g. text-white, text-sky-400, text-transparent)
  if (base.startsWith('text-')) {
    return withVariant('text-color');
  }

  // 4. Font weights
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) {
    return withVariant('font-weight');
  }

  // 5. Border radius
  if (/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/.test(base)) {
    return withVariant('border-radius');
  }

  // 6. Box shadow
  if (/^shadow(-none|-sm|-md|-lg|-xl|-2xl|inner)?$/.test(base)) {
    return withVariant('box-shadow');
  }

  // 7. Flex direction
  if (/^flex-(row|col|row-reverse|col-reverse)$/.test(base)) {
    return withVariant('flex-direction');
  }

  // 8. Align items & Justify content
  if (/^items-(start|center|end|baseline|stretch)$/.test(base)) {
    return withVariant('align-items');
  }
  if (/^justify-(start|center|end|between|around|evenly|normal)$/.test(base)) {
    return withVariant('justify-content');
  }

  // 9. Standard utility prefixes
  const standardPrefixes = [
    'bg-',
    'p-',
    'px-',
    'py-',
    'pt-',
    'pr-',
    'pb-',
    'pl-',
    'm-',
    'mx-',
    'my-',
    'mt-',
    'mr-',
    'mb-',
    'ml-',
    'w-',
    'h-',
    'gap-',
    'border-',
    'opacity-',
  ];

  for (const p of standardPrefixes) {
    if (base.startsWith(p)) {
      return withVariant(p);
    }
  }

  // Base border toggle
  if (base === 'border') {
    return withVariant('border-width');
  }

  return null;
}

