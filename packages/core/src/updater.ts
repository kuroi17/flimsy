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

  // Apply action
  applyAction(targetElementNode, targetOpeningNode, options.action);

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
      } else if (
        classAttr.value?.type === 'JSXExpressionContainer' &&
        classAttr.value.expression?.type === 'StringLiteral'
      ) {
        const existingClasses = classAttr.value.expression.value || '';
        const updated = reconcileClasses(
          existingClasses,
          action.newClasses,
          action.removeClasses,
          action.mode
        );
        classAttr.value.expression.value = updated;
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
        filtered = filtered.filter(
          (token) => getTailwindPropertyPrefix(token) !== prefix
        );
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
 * Helper to identify conflicting Tailwind utility prefixes
 */
function getTailwindPropertyPrefix(cls: string): string | null {
  // Strip variants like hover:, focus:, md:
  const parts = cls.split(':');
  const base = parts[parts.length - 1];

  const prefixes = [
    'bg-',
    'text-',
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
    'rounded',
    'w-',
    'h-',
    'flex-',
    'justify-',
    'items-',
    'gap-',
    'border',
    'shadow',
    'opacity-',
  ];

  for (const p of prefixes) {
    if (base.startsWith(p)) {
      // Include any variant prefix so `hover:bg-blue-500` replaces `hover:bg-red-500`
      const variantPrefix = parts.slice(0, -1).join(':');
      return variantPrefix ? `${variantPrefix}:${p}` : p;
    }
  }

  return null;
}
