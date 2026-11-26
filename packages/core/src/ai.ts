import fs from 'node:fs/promises';
import path from 'node:path';
import * as recast from 'recast';
import * as babelParser from '@babel/parser';
import traversePkg from '@babel/traverse';
import { detectLanguage, isMarkupLanguage } from './languages.js';
import { extractMarkupAIContext } from './markup-updater.js';

const traverse = (traversePkg as any).default || traversePkg;

export interface AIContextOptions {
  filePath: string;
  line: number;
  column: number;
  rootDir?: string;
  userPrompt?: string;
}

export interface ElementAIContext {
  filePath: string;
  line: number;
  tagName: string;
  componentName: string;
  targetSnippet: string;
  parentSnippet: string;
  currentClasses: string;
  currentText: string;
  formattedPrompt: string;
}

export interface AISuggestion {
  suggestedClasses?: string;
  suggestedText?: string;
  explanation: string;
}

/**
 * Extracts rich contextual information about a selected JSX element for AI models
 */
export async function extractAIElementContext(
  options: AIContextOptions
): Promise<ElementAIContext> {
  const root = options.rootDir || process.cwd();
  const resolvedPath = path.isAbsolute(options.filePath)
    ? options.filePath
    : path.resolve(root, options.filePath);
  const relPath = path.relative(root, resolvedPath).replace(/\\/g, '/');
  const compName = path.basename(relPath).replace(/\.[jt]sx?$/, '');

  const code = await fs.readFile(resolvedPath, 'utf-8');
  const lang = detectLanguage(resolvedPath);
  if (isMarkupLanguage(lang)) {
    return extractMarkupAIContext(code, lang, relPath, options);
  }

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

  let targetElementNode: any = null;
  let targetParentNode: any = null;
  let minColDiff = Infinity;

  traverse(ast, {
    JSXElement(pathNode: any) {
      const opening = pathNode.node.openingElement;
      if (!opening || !opening.loc) return;

      if (opening.loc.start.line === options.line) {
        const colDiff = Math.abs(opening.loc.start.column - options.column);
        if (colDiff < minColDiff) {
          minColDiff = colDiff;
          targetElementNode = pathNode.node;
          targetParentNode = pathNode.parentPath?.node || null;
        }
      }
    },
  });

  if (!targetElementNode) {
    throw new Error(
      `Could not find JSX element at line ${options.line}, col ${options.column} in ${options.filePath}`
    );
  }

  const targetSnippet = recast.print(targetElementNode).code;
  const parentSnippet =
    targetParentNode && targetParentNode.type === 'JSXElement'
      ? recast.print(targetParentNode).code.slice(0, 300) + '...'
      : '';

  // Extract current classes (supports both React `className` and SolidJS/Preact/Qwik `class`)
  let currentClasses = '';
  const classAttr = targetElementNode.openingElement.attributes?.find(
    (attr: any) =>
      attr.type === 'JSXAttribute' &&
      attr.name &&
      (attr.name.name === 'className' || attr.name.name === 'class')
  );
  if (classAttr) {
    if (classAttr.value?.type === 'StringLiteral') {
      currentClasses = classAttr.value.value || '';
    } else if (
      classAttr.value?.type === 'JSXExpressionContainer' &&
      classAttr.value.expression?.type === 'StringLiteral'
    ) {
      currentClasses = classAttr.value.expression.value || '';
    }
  }

  // Extract current text
  let currentText = '';
  if (targetElementNode.children) {
    for (const child of targetElementNode.children) {
      if (child.type === 'JSXText') {
        currentText += child.value;
      }
    }
  }
  currentText = currentText.trim();

  const tagName =
    targetElementNode.openingElement.name?.name ||
    targetElementNode.openingElement.name?.property?.name ||
    'element';

  const userPrompt = options.userPrompt || 'Enhance the design and visual styling of this element.';

  const formattedPrompt = `You are a modern UI/UX and Tailwind CSS engineer.

Context:
- File: ${relPath} (Line ${options.line})
- Component: <${compName} />
- Target Element: <${tagName}>
- Current Tailwind Classes: "${currentClasses}"
- Current Text: "${currentText}"

Parent Container Context:
\`\`\`tsx
${parentSnippet}
\`\`\`

Target Element Code:
\`\`\`tsx
${targetSnippet}
\`\`\`

User Request:
"${userPrompt}"

Instructions:
1. Provide improved Tailwind utility classes that achieve the request cleanly.
2. Maintain existing responsive and functional styling where appropriate.
3. Return your response in clean JSON format:
{
  "suggestedClasses": "<updated-tailwind-classes>",
  "suggestedText": "<updated-text-if-requested-or-null>",
  "explanation": "<brief-1-sentence-explanation>"
}`;

  return {
    filePath: relPath,
    line: options.line,
    tagName,
    componentName: compName,
    targetSnippet,
    parentSnippet,
    currentClasses,
    currentText,
    formattedPrompt,
  };
}

/**
 * Built-in design heuristic solver for zero-token, offline smart styling
 */
export function resolveDesignHeuristic(
  currentClasses: string,
  userPrompt: string
): AISuggestion {
  const p = userPrompt.toLowerCase();

  if (p.includes('glass') || p.includes('glassmorphism')) {
    return {
      suggestedClasses: `${currentClasses} backdrop-blur-md bg-white/10 dark:bg-slate-900/40 border border-white/20 shadow-xl`,
      explanation: 'Applied modern glassmorphism with backdrop blur, semi-transparent background, and luminous border.',
    };
  }

  if (p.includes('glow') || p.includes('neon')) {
    return {
      suggestedClasses: `${currentClasses} shadow-[0_0_20px_rgba(56,189,248,0.5)] border border-sky-400 ring-2 ring-sky-400/20`,
      explanation: 'Added luminous neon glow shadow and accent ring.',
    };
  }

  if (p.includes('gradient')) {
    return {
      suggestedClasses: `${currentClasses} bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 text-white shadow-lg`,
      explanation: 'Transformed into a vibrant modern gradient background.',
    };
  }

  if (p.includes('pill') || p.includes('rounded')) {
    return {
      suggestedClasses: `${currentClasses} rounded-full px-6 py-2.5`,
      explanation: 'Updated to a sleek pill container with balanced horizontal padding.',
    };
  }

  if (p.includes('dark') || p.includes('night')) {
    return {
      suggestedClasses: `${currentClasses} bg-slate-950 text-slate-100 border border-slate-800 shadow-2xl`,
      explanation: 'Applied high-contrast dark theme styling with subtle border definition.',
    };
  }

  if (p.includes('modern') || p.includes('card') || p.includes('clean')) {
    return {
      suggestedClasses: `${currentClasses} rounded-2xl p-6 bg-slate-900/80 border border-slate-800 shadow-xl transition-all hover:scale-[1.01]`,
      explanation: 'Modernized card with rounded-2xl geometry, subtle border, and hover scale micro-interaction.',
    };
  }

  // Default subtle enhancement
  return {
    suggestedClasses: `${currentClasses} transition-all duration-200 hover:shadow-lg active:scale-95`,
    explanation: 'Enhanced with smooth hover shadow transitions and tactile active feedback.',
  };
}
