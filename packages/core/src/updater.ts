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
  let stats: any;
  try {
    stats = await fs.stat(resolvedPath);
    if (options.expectedMtime && !options.force && stats.mtimeMs > options.expectedMtime + 50) {
      return {
        success: false,
        filePath: resolvedPath,
        conflict: true,
        mtime: stats.mtimeMs,
        error: `File was modified externally on disk since last inspected. Please review changes before overwriting.`,
      };
    }
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
  let targetPathNode: any = null;
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
          targetPathNode = pathNode;
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
            targetPathNode = pathNode;
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
      applyAction(targetElementNode, targetOpeningNode, targetPathNode, act);
    }
  } else if (options.action) {
    applyAction(targetElementNode, targetOpeningNode, targetPathNode, options.action);
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

  let newMtime = Date.now();
  try {
    const newStats = await fs.stat(resolvedPath);
    newMtime = newStats.mtimeMs;
  } catch {}

  return {
    success: true,
    filePath: resolvedPath,
    oldCode,
    newCode,
    mtime: newMtime,
  };
}

/**
 * Generates human-readable diff items between original and pending values
 */
export function generateDiffPreview(
  filePath: string,
  line: number,
  originalClasses: string,
  newClasses: string,
  originalText: string,
  newText: string | null
) {
  const changes = [];
  if (originalClasses !== newClasses) {
    changes.push({
      type: 'class' as const,
      oldValue: originalClasses,
      newValue: newClasses,
    });
  }
  if (newText !== null && originalText !== newText) {
    changes.push({
      type: 'text' as const,
      oldValue: originalText,
      newValue: newText,
    });
  }
  return {
    filePath,
    line,
    originalClasses,
    newClasses,
    originalText,
    newText: newText || originalText,
    changes,
  };
}

function applyAction(
  elementNode: any,
  openingNode: any,
  targetPathNode: any,
  action: UpdateAction
): void {
  if (action.type === 'delete-element') {
    if (targetPathNode && typeof targetPathNode.remove === 'function') {
      targetPathNode.remove();
    }
    return;
  }

  if (action.type === 'duplicate-element') {
    if (targetPathNode && typeof targetPathNode.insertAfter === 'function') {
      try {
        const printed = recast.print(targetPathNode.node).code;
        const parsedClone = recast.parse(printed, {
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
        const clonedNode = parsedClone.program.body[0]?.expression || targetPathNode.node;
        targetPathNode.insertAfter(clonedNode);
      } catch {
        targetPathNode.insertAfter(targetPathNode.node);
      }
    }
    return;
  }

  if (action.type === 'reorder-child') {
    if (targetPathNode && targetPathNode.parent && Array.isArray(targetPathNode.parent.children)) {
      const children = targetPathNode.parent.children;
      const idx = children.indexOf(targetPathNode.node);
      if (idx !== -1) {
        if (action.direction === 'up' && idx > 0) {
          let prevIdx = idx - 1;
          while (prevIdx >= 0 && children[prevIdx].type === 'JSXText' && !children[prevIdx].value.trim()) {
            prevIdx--;
          }
          if (prevIdx >= 0) {
            const temp = children[idx];
            children[idx] = children[prevIdx];
            children[prevIdx] = temp;
          }
        } else if (action.direction === 'down' && idx < children.length - 1) {
          let nextIdx = idx + 1;
          while (nextIdx < children.length && children[nextIdx].type === 'JSXText' && !children[nextIdx].value.trim()) {
            nextIdx++;
          }
          if (nextIdx < children.length) {
            const temp = children[idx];
            children[idx] = children[nextIdx];
            children[nextIdx] = temp;
          }
        }
      }
    }
    return;
  }

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

  // 3. Text colors (e.g. text-white, text-sky-400, text-transparent, text-[#...])
  if (base.startsWith('text-')) {
    return withVariant('text-color');
  }

  // 4. Font weights
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) {
    return withVariant('font-weight');
  }

  // 5. Border radius (independent corners vs master)
  if (/^rounded-(tl|tr|br|bl|t|b|l|r)(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full|(\[[^\]]+\]))?$/.test(base)) {
    const corner = base.match(/^rounded-(tl|tr|br|bl|t|b|l|r)/)?.[1];
    return withVariant(`border-radius-${corner}`);
  }
  if (/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full|(\[[^\]]+\]))?$/.test(base)) {
    return withVariant('border-radius');
  }

  // 6. Box shadow
  if (/^shadow(-none|-sm|-md|-lg|-xl|-2xl|inner)?$/.test(base)) {
    return withVariant('box-shadow');
  }

  // 7. Backdrop blur
  if (base.startsWith('backdrop-blur')) {
    return withVariant('backdrop-blur');
  }

  // 8. Flex direction & wrap
  if (/^flex-(row|col|row-reverse|col-reverse)$/.test(base)) {
    return withVariant('flex-direction');
  }
  if (/^flex-(wrap|nowrap|wrap-reverse)$/.test(base)) {
    return withVariant('flex-wrap');
  }

  // 9. Align items & Justify content
  if (/^items-(start|center|end|baseline|stretch)$/.test(base)) {
    return withVariant('align-items');
  }
  if (/^justify-(start|center|end|between|around|evenly|normal)$/.test(base)) {
    return withVariant('justify-content');
  }

  // 10. Border styling
  if (/^border-(solid|dashed|dotted|double|none)$/.test(base)) {
    return withVariant('border-style');
  }
  if (/^border(-[0-9]+|(\[[0-9]+px\]))?$/.test(base) || base === 'border') {
    return withVariant('border-width');
  }
  if (base.startsWith('border-')) {
    return withVariant('border-color');
  }

  // 11. Dimensions & Spacing
  if (/^w-/.test(base)) return withVariant('width');
  if (/^h-/.test(base)) return withVariant('height');
  if (/^gap-/.test(base)) return withVariant('gap');
  if (/^opacity-/.test(base)) return withVariant('opacity');

  // 12. Standard utility prefixes
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
  ];

  for (const p of standardPrefixes) {
    if (base.startsWith(p)) {
      return withVariant(p);
    }
  }

  return null;
}

