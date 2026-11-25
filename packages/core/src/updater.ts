import fs from 'node:fs/promises';
import path from 'node:path';
import * as recast from 'recast';
import * as babelParser from '@babel/parser';
import traversePkg from '@babel/traverse';
import type { UpdateAction, UpdateResult, UpdateSourceOptions } from './types.js';

const traverse = (traversePkg as any).default || traversePkg;
const b = recast.types.builders;

export async function extractJSXSnippets(
  targets: Array<{ filePath: string; line: number; column: number }>,
  rootDir?: string
): Promise<{ success: boolean; snippets: string[]; error?: string }> {
  const root = rootDir || process.cwd();
  const snippets: string[] = [];
  const byFile = new Map<string, Array<{ line: number; column: number }>>();

  for (const t of targets) {
    const resolved = path.isAbsolute(t.filePath) ? t.filePath : path.resolve(root, t.filePath);
    const list = byFile.get(resolved) || [];
    list.push({ line: t.line, column: t.column });
    byFile.set(resolved, list);
  }

  try {
    for (const [resolvedPath, locs] of byFile.entries()) {
      const code = await fs.readFile(resolvedPath, 'utf-8');
      const ast = recast.parse(code, {
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

      const foundPaths: any[] = [];
      for (const loc of locs) {
        const p = findJSXPathByLocation(ast, loc.line, loc.column);
        if (p && !foundPaths.some((fp) => fp.node === p.node)) {
          foundPaths.push(p);
        }
      }

      // Exclude descendants whose ancestor is already included in the copy group
      const topLevelPaths = foundPaths.filter(
        (p) => !foundPaths.some((other) => other !== p && isDescendantPath(p, other.node))
      );

      for (const p of topLevelPaths) {
        snippets.push(recast.print(p.node).code);
      }
    }

    return { success: true, snippets };
  } catch (err: any) {
    return { success: false, snippets: [], error: err.message };
  }
}

function parseJSXSnippetNode(snippet: string): any {
  const parsed = recast.parse(snippet.trim(), {
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
  return parsed.program.body[0]?.expression || null;
}

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
      applyAction(ast, targetElementNode, targetOpeningNode, targetPathNode, act);
    }
  } else if (options.action) {
    applyAction(ast, targetElementNode, targetOpeningNode, targetPathNode, options.action);
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

function findJSXPathByLocation(ast: any, line: number, column: number): any {
  let matched: any = null;
  let minColDiff = Infinity;

  traverse(ast, {
    JSXElement(pathNode: any) {
      const opening = pathNode.node.openingElement;
      if (!opening || !opening.loc) return;
      if (opening.loc.start.line === line) {
        const colDiff = Math.abs(opening.loc.start.column - column);
        if (colDiff < minColDiff) {
          minColDiff = colDiff;
          matched = pathNode;
        }
      }
    },
  });

  if (!matched) {
    traverse(ast, {
      JSXElement(pathNode: any) {
        const opening = pathNode.node.openingElement;
        if (!opening || !opening.loc) return;
        if (Math.abs(opening.loc.start.line - line) <= 1) {
          const colDiff = Math.abs(opening.loc.start.column - column);
          if (colDiff < minColDiff) {
            minColDiff = colDiff;
            matched = pathNode;
          }
        }
      },
    });
  }

  return matched;
}

function isDescendantPath(possibleDescendant: any, ancestorNode: any): boolean {
  let cur = possibleDescendant;
  while (cur) {
    if (cur.node === ancestorNode) return true;
    cur = cur.parentPath;
  }
  return false;
}

function applyAction(
  ast: any,
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

  if (action.type === 'reparent-element') {
    if (!targetPathNode || !ast) return;
    const destPath = findJSXPathByLocation(ast, action.targetLine, action.targetColumn);
    if (!destPath || destPath.node === targetPathNode.node) return;
    // Prevent moving a parent into itself or one of its own descendants
    if (isDescendantPath(destPath, targetPathNode.node)) return;

    const movingNode = targetPathNode.node;

    if (action.position === 'inside') {
      const destNode = destPath.node;
      // Convert self-closing JSX element into open/close element if needed
      if (destNode.openingElement?.selfClosing) {
        destNode.openingElement.selfClosing = false;
        destNode.closingElement = b.jsxClosingElement(destNode.openingElement.name);
      }
      if (!Array.isArray(destNode.children)) {
        destNode.children = [];
      }
      // Remove from current parent first, then append inside destination
      targetPathNode.remove();
      destNode.children.push(movingNode);
    } else if (destPath.parent && Array.isArray(destPath.parent.children)) {
      targetPathNode.remove();
      const destChildren = destPath.parent.children;
      const destIdx = destChildren.indexOf(destPath.node);
      if (destIdx !== -1) {
        const insertIdx = action.position === 'before' ? destIdx : destIdx + 1;
        destChildren.splice(insertIdx, 0, movingNode);
      }
    }
    return;
  }

  if (action.type === 'paste-elements') {
    if (!Array.isArray(action.snippets) || action.snippets.length === 0) return;
    const clonedNodes: any[] = [];
    for (const snippet of action.snippets) {
      try {
        const node = parseJSXSnippetNode(snippet);
        if (node) clonedNodes.push(node);
      } catch {}
    }
    if (clonedNodes.length === 0) return;

    if (action.position === 'inside') {
      if (elementNode.openingElement?.selfClosing) {
        elementNode.openingElement.selfClosing = false;
        elementNode.closingElement = b.jsxClosingElement(elementNode.openingElement.name);
      }
      if (!Array.isArray(elementNode.children)) {
        elementNode.children = [];
      }
      for (const node of clonedNodes) {
        elementNode.children.push(b.jsxText('\n'));
        elementNode.children.push(node);
      }
    } else if (targetPathNode?.parent && Array.isArray(targetPathNode.parent.children)) {
      const children = targetPathNode.parent.children;
      const idx = children.indexOf(targetPathNode.node);
      if (idx !== -1) {
        const toInsert: any[] = [];
        for (const node of clonedNodes) {
          toInsert.push(b.jsxText('\n'));
          toInsert.push(node);
        }
        children.splice(idx + 1, 0, ...toInsert);
      }
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
        // CallExpression: className={cn('p-4 bg-white', isSpecial && '...')} or clsx(base, 'p-4')
        else if (expr?.type === 'CallExpression' && Array.isArray(expr.arguments)) {
          const strArg = expr.arguments.find((arg: any) => arg?.type === 'StringLiteral');
          if (strArg) {
            const existingClasses = strArg.value || '';
            const updated = reconcileClasses(
              existingClasses,
              action.newClasses,
              action.removeClasses,
              action.mode
            );
            strArg.value = updated;
            if (strArg.extra) {
              strArg.extra.raw = JSON.stringify(updated);
            }
          } else {
            const tplArg = expr.arguments.find(
              (arg: any) => arg?.type === 'TemplateLiteral' && arg.quasis?.length > 0
            );
            if (tplArg) {
              const firstQuasi = tplArg.quasis[0];
              const existingClasses = firstQuasi.value.raw || '';
              const updated = reconcileClasses(
                existingClasses,
                action.newClasses,
                action.removeClasses,
                action.mode
              );
              firstQuasi.value.raw = updated ? (updated + ' ') : '';
              firstQuasi.value.cooked = firstQuasi.value.raw;
            } else {
              const cleaned = reconcileClasses(
                '',
                action.newClasses,
                action.removeClasses,
                action.mode
              );
              if (cleaned) {
                expr.arguments.unshift(b.stringLiteral(cleaned));
              }
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

  // 2. Font sizes (including arbitrary px like text-[28px])
  if (/^text-([0-9]?xl|xs|sm|base|lg|(\[\d+(px|rem|em)\]))$/.test(base)) {
    return withVariant('font-size');
  }

  // 3. Text colors (e.g. text-white, text-sky-400, text-transparent, text-[#...])
  if (base.startsWith('text-')) {
    return withVariant('text-color');
  }

  // 4. Font families (e.g. font-sans, font-mono, font-['Inter'])
  if (/^font-(sans|serif|mono|(\[[^\]]+\]))$/.test(base)) {
    return withVariant('font-family');
  }

  // 5. Font weights
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) {
    return withVariant('font-weight');
  }

  // 5b. Line height, letter spacing, text transform
  if (/^leading-/.test(base)) {
    return withVariant('line-height');
  }
  if (/^tracking-/.test(base)) {
    return withVariant('letter-spacing');
  }
  if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(base)) {
    return withVariant('text-transform');
  }

  // 6. Border radius (independent corners vs master)
  if (/^rounded-(tl|tr|br|bl|t|b|l|r)(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full|(\[[^\]]+\]))?$/.test(base)) {
    const corner = base.match(/^rounded-(tl|tr|br|bl|t|b|l|r)/)?.[1];
    return withVariant(`border-radius-${corner}`);
  }
  if (/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full|(\[[^\]]+\]))?$/.test(base)) {
    return withVariant('border-radius');
  }

  // 7. Box shadow & Blur
  if (/^shadow(-none|-sm|-md|-lg|-xl|-2xl|-inner)?$/.test(base)) {
    return withVariant('box-shadow');
  }
  if (base.startsWith('backdrop-blur')) {
    return withVariant('backdrop-blur');
  }
  if (/^blur(-none|-sm|-md|-lg|-xl|-2xl|-3xl|(\[[^\]]+\]))?$/.test(base)) {
    return withVariant('layer-blur');
  }

  // 8. Flex display, direction & wrap
  if (/^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden)$/.test(base)) {
    return withVariant('display');
  }
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

  // 10. Border styling & individual sides
  if (/^border-(solid|dashed|dotted|double|none)$/.test(base)) {
    return withVariant('border-style');
  }
  if (/^border-([trbl])(-[0-9]+|(\[[0-9]+px\]))?$/.test(base)) {
    const side = base.match(/^border-([trbl])/)?.[1];
    return withVariant(`border-width-${side}`);
  }
  if (/^border(-[0-9]+|(\[[0-9]+px\]))?$/.test(base) || base === 'border') {
    return withVariant('border-width');
  }
  if (base.startsWith('border-')) {
    return withVariant('border-color');
  }

  // 11. Positioning & Transforms (absolute/relative, top/left/right/bottom, rotate & translate)
  if (/^(static|fixed|absolute|relative|sticky)$/.test(base)) return withVariant('position');
  if (/^-?left-/.test(base)) return withVariant('inset-left');
  if (/^-?right-/.test(base)) return withVariant('inset-right');
  if (/^-?top-/.test(base)) return withVariant('inset-top');
  if (/^-?bottom-/.test(base)) return withVariant('inset-bottom');
  if (/^-?rotate-/.test(base)) return withVariant('rotate');
  if (/^-?translate-x-/.test(base)) return withVariant('translate-x');
  if (/^-?translate-y-/.test(base)) return withVariant('translate-y');

  // 12. Dimensions & Spacing
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

