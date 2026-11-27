import MagicString from 'magic-string';
import path from 'node:path';
import type { FlimsyMarkupLanguage } from './languages.js';
import {
  parseMarkupTemplate,
  findMarkupElementByLocation,
  isMarkupDescendant,
  type MarkupElement,
} from './markup-parser.js';
import type { InjectOptions, UpdateAction } from './types.js';
import type { AIContextOptions, ElementAIContext } from './ai.js';
import { buildInsertElementSnippet } from './presets.js';

type ReconcileFn = (
  existingClasses: string,
  newClasses: string,
  removeClasses?: string[],
  mode?: 'replace' | 'append' | 'reconcile'
) => string;

const SKIP_INJECT_TAGS = new Set([
  'template',
  'slot',
  'script',
  'style',
  'head',
  'html',
  'body',
  'meta',
  'link',
  'title',
  'base',
  'noscript',
  'fragment',
]);

const SPA_MOUNT_IDS = new Set(['root', 'app', '__nuxt', '__next', 'svelte']);

function getStaticAttr(el: MarkupElement, name: string) {
  return el.attrs.find(
    (a) => a.name === name && (a.quote === '"' || a.quote === "'")
  );
}

function getLineIndent(code: string, offset: number): string {
  const nl = code.lastIndexOf('\n', Math.max(0, offset - 1));
  const lineStart = nl === -1 ? 0 : nl + 1;
  let indent = '';
  for (let i = lineStart; i < offset; i++) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t') indent += ch;
    else break;
  }
  return indent;
}

/**
 * Stamps `data-flimsy-*` source location coordinates into Vue, Svelte, Astro, and HTML templates.
 */
export function injectMarkupSourceLocations(
  code: string,
  id: string,
  lang: FlimsyMarkupLanguage,
  options: InjectOptions = {}
): { code: string; map: any } {
  const cleanId = id.split('?')[0];
  const root = options.rootDir || process.cwd();
  const relFile = path.relative(root, cleanId).replace(/\\/g, '/');
  const compName = path
    .basename(relFile)
    .replace(/\.(component\.html|vue|svelte|astro|html|htm)$/i, '');

  const parsed = parseMarkupTemplate(code, lang);
  if (parsed.all.length === 0) {
    return { code, map: null };
  }

  const s = new MagicString(code);
  let modified = false;

  for (const el of parsed.all) {
    const lowerTag = el.tagName.toLowerCase();
    if (SKIP_INJECT_TAGS.has(lowerTag) || lowerTag.startsWith('svelte:')) {
      continue;
    }

    // In Vanilla HTML / Vite index.html, skip empty SPA mount shells like <div id="root"></div>
    if (lang === 'html') {
      const idAttr = getStaticAttr(el, 'id');
      const hasBodyText = el.textSegments.some((seg) => seg.text.trim().length > 0);
      if (idAttr?.value && SPA_MOUNT_IDS.has(idAttr.value) && el.children.length === 0 && !hasBodyText) {
        continue;
      }
    }

    // Skip if already tagged
    if (el.attrs.some((a) => a.name === 'data-flimsy-file')) {
      continue;
    }

    const isComponent = /^[A-Z]/.test(el.tagName);
    const elemType = isComponent ? 'component' : 'element';
    const injectedAttrs = ` data-flimsy-file="${relFile}" data-flimsy-line="${el.line}" data-flimsy-col="${el.column}" data-flimsy-name="${el.tagName}" data-flimsy-comp="${compName}" data-flimsy-type="${elemType}"`;
    s.appendRight(el.tagNameEnd, injectedAttrs);
    modified = true;
  }

  if (!modified) {
    return { code, map: null };
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: cleanId }),
  };
}

function applySingleMarkupAction(
  code: string,
  lang: FlimsyMarkupLanguage,
  line: number,
  column: number,
  action: UpdateAction,
  reconcileClasses: ReconcileFn
): { code: string; error?: string } {
  const parsed = parseMarkupTemplate(code, lang);
  const el = findMarkupElementByLocation(parsed.all, line, column);
  if (!el) {
    return {
      code,
      error: `Could not find ${lang.toUpperCase()} element at line ${line}, column ${column}`,
    };
  }

  const s = new MagicString(code);

  if (action.type === 'update-class') {
    const classAttr = getStaticAttr(el, 'class');
    if (classAttr) {
      const updated = reconcileClasses(
        classAttr.value || '',
        action.newClasses,
        action.removeClasses,
        action.mode
      );
      s.overwrite(classAttr.valueStart, classAttr.valueEnd, updated);
    } else {
      const updated = reconcileClasses('', action.newClasses, action.removeClasses, action.mode);
      if (updated) {
        s.appendRight(el.tagNameEnd, ` class="${updated}"`);
      }
    }
    return { code: s.toString() };
  }

  if (action.type === 'update-text') {
    if (el.isVoid || el.selfClosing) {
      return { code };
    }
    const nonEmptySeg = el.textSegments.find((seg) => seg.text.trim().length > 0);
    if (nonEmptySeg) {
      const leading = /^\s/.test(action.text) ? '' : (nonEmptySeg.text.match(/^(\s*)/)?.[1] || '');
      const trailing = /\s$/.test(action.text) ? '' : (nonEmptySeg.text.match(/(\s*)$/)?.[1] || '');
      s.overwrite(nonEmptySeg.start, nonEmptySeg.end, `${leading}${action.text}${trailing}`);
    } else {
      s.appendLeft(el.closeStart, action.text);
    }
    return { code: s.toString() };
  }

  if (action.type === 'delete-element') {
    let delStart = el.start;
    let delEnd = el.end;
    const prevNl = code.lastIndexOf('\n', Math.max(0, delStart - 1));
    const linePrefix = code.slice(prevNl === -1 ? 0 : prevNl + 1, delStart);
    const nextChar = code[delEnd];
    if (/^[ \t]*$/.test(linePrefix) && (nextChar === '\n' || nextChar === '\r')) {
      delStart = prevNl === -1 ? 0 : prevNl + 1;
      if (code[delEnd] === '\r' && code[delEnd + 1] === '\n') delEnd += 2;
      else if (code[delEnd] === '\n') delEnd += 1;
    }
    s.remove(delStart, delEnd);
    return { code: s.toString() };
  }

  if (action.type === 'duplicate-element') {
    const indent = getLineIndent(code, el.start);
    const clone = code.slice(el.start, el.end);
    s.appendRight(el.end, `\n${indent}${clone}`);
    return { code: s.toString() };
  }

  if (action.type === 'reorder-child') {
    const siblings = el.parent ? el.parent.children : parsed.roots;
    const idx = siblings.indexOf(el);
    if (idx === -1) return { code };
    const swapIdx = action.direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return { code };

    const target = siblings[swapIdx];
    const elCode = code.slice(el.start, el.end);
    const targetCode = code.slice(target.start, target.end);
    s.overwrite(el.start, el.end, targetCode);
    s.overwrite(target.start, target.end, elCode);
    return { code: s.toString() };
  }

  if (action.type === 'reparent-element') {
    const dest = findMarkupElementByLocation(parsed.all, action.targetLine, action.targetColumn);
    if (!dest || dest === el) return { code };
    if (isMarkupDescendant(dest, el)) return { code };

    const movingCode = code.slice(el.start, el.end);
    const destIndent = getLineIndent(code, dest.start);

    // Remove moving node from its original span (with clean line trim if alone on line)
    let remStart = el.start;
    let remEnd = el.end;
    const prevNl = code.lastIndexOf('\n', Math.max(0, remStart - 1));
    const linePrefix = code.slice(prevNl === -1 ? 0 : prevNl + 1, remStart);
    if (/^[ \t]*$/.test(linePrefix) && (code[remEnd] === '\n' || code[remEnd] === '\r')) {
      remStart = prevNl === -1 ? 0 : prevNl + 1;
      if (code[remEnd] === '\r' && code[remEnd + 1] === '\n') remEnd += 2;
      else if (code[remEnd] === '\n') remEnd += 1;
    }

    if (action.position === 'inside') {
      if (dest.isVoid) return { code };
      s.remove(remStart, remEnd);
      if (dest.selfClosing) {
        // Expand `<div class="x" />` into `<div class="x">\n  ...\n</div>`
        const openWithoutSelfClose = code.slice(dest.openStart, dest.openEnd).replace(/\s*\/\s*>$/, '>');
        s.overwrite(
          dest.openStart,
          dest.openEnd,
          `${openWithoutSelfClose}\n${destIndent}  ${movingCode}\n${destIndent}</${dest.tagName}>`
        );
      } else {
        s.appendLeft(dest.closeStart, `\n${destIndent}  ${movingCode}\n${destIndent}`);
      }
      return { code: s.toString() };
    }

    s.remove(remStart, remEnd);
    if (action.position === 'before') {
      s.appendLeft(dest.start, `${movingCode}\n${destIndent}`);
    } else {
      s.appendRight(dest.end, `\n${destIndent}${movingCode}`);
    }
    return { code: s.toString() };
  }

  if (action.type === 'paste-elements') {
    if (!Array.isArray(action.snippets) || action.snippets.length === 0) return { code };
    const cleanSnippets = action.snippets.map((sn) => sn.trim()).filter(Boolean);
    if (cleanSnippets.length === 0) return { code };

    const indent = getLineIndent(code, el.start);
    if (action.position === 'inside') {
      if (el.isVoid) return { code };
      const body = cleanSnippets.map((sn) => `${indent}  ${sn}`).join('\n');
      if (el.selfClosing) {
        const openWithoutSelfClose = code.slice(el.openStart, el.openEnd).replace(/\s*\/\s*>$/, '>');
        s.overwrite(
          el.openStart,
          el.openEnd,
          `${openWithoutSelfClose}\n${body}\n${indent}</${el.tagName}>`
        );
      } else {
        s.appendLeft(el.closeStart, `\n${body}\n${indent}`);
      }
      return { code: s.toString() };
    }

    const block = cleanSnippets.map((sn) => `\n${indent}${sn}`).join('');
    s.appendRight(el.end, block);
    return { code: s.toString() };
  }

  if (action.type === 'insert-element') {
    const snippet = buildInsertElementSnippet(action.preset, {
      attrName: 'class',
      text: action.text,
      classes: action.classes,
      src: action.src,
      alt: action.alt,
    });
    const indent = getLineIndent(code, el.start);
    const effectivePos = action.position === 'inside' && el.isVoid ? 'after' : action.position;

    if (effectivePos === 'inside') {
      if (el.selfClosing) {
        const openWithoutSelfClose = code
          .slice(el.openStart, el.openEnd)
          .replace(/\s*\/\s*>$/, '>');
        s.overwrite(
          el.openStart,
          el.openEnd,
          `${openWithoutSelfClose}\n${indent}  ${snippet}\n${indent}</${el.tagName}>`
        );
      } else {
        s.appendLeft(el.closeStart, `\n${indent}  ${snippet}\n${indent}`);
      }
      return { code: s.toString() };
    }

    if (effectivePos === 'before') {
      s.appendLeft(el.start, `${snippet}\n${indent}`);
      return { code: s.toString() };
    }

    s.appendRight(el.end, `\n${indent}${snippet}`);
    return { code: s.toString() };
  }

  return { code };
}

export function applyMarkupActions(
  code: string,
  lang: FlimsyMarkupLanguage,
  line: number,
  column: number,
  actions: UpdateAction[],
  reconcileClasses: ReconcileFn
): { success: boolean; newCode?: string; error?: string } {
  let currentCode = code;

  for (const act of actions) {
    const step = applySingleMarkupAction(currentCode, lang, line, column, act, reconcileClasses);
    if (step.error) {
      return { success: false, error: step.error };
    }
    currentCode = step.code;
  }

  // Pre-write Safety Validation: re-parse to guarantee balanced tags & clean template syntax
  const validated = parseMarkupTemplate(currentCode, lang);
  if (validated.errors.length > 0) {
    return {
      success: false,
      error: `Safety abort: Generated ${lang.toUpperCase()} markup failed validation (${validated.errors[0]}). Original file was preserved.`,
    };
  }

  return { success: true, newCode: currentCode };
}

export function extractMarkupSnippets(
  code: string,
  lang: FlimsyMarkupLanguage,
  locs: Array<{ line: number; column: number }>
): string[] {
  const parsed = parseMarkupTemplate(code, lang);
  const found: MarkupElement[] = [];

  for (const loc of locs) {
    const el = findMarkupElementByLocation(parsed.all, loc.line, loc.column);
    if (el && !found.includes(el)) {
      found.push(el);
    }
  }

  // Deduplicate descendants whose ancestor is already selected
  const topLevel = found.filter(
    (el) => !found.some((other) => other !== el && isMarkupDescendant(el, other))
  );

  return topLevel.map((el) => code.slice(el.start, el.end));
}

export function extractMarkupAIContext(
  code: string,
  lang: FlimsyMarkupLanguage,
  relPath: string,
  options: AIContextOptions
): ElementAIContext {
  const parsed = parseMarkupTemplate(code, lang);
  const el = findMarkupElementByLocation(parsed.all, options.line, options.column);
  if (!el) {
    throw new Error(
      `Could not find ${lang.toUpperCase()} element at line ${options.line}, col ${options.column} in ${options.filePath}`
    );
  }

  const compName = path
    .basename(relPath)
    .replace(/\.(component\.html|vue|svelte|astro|html|htm)$/i, '');
  const targetSnippet = code.slice(el.start, el.end);
  const parentSnippet = el.parent
    ? code.slice(el.parent.start, el.parent.end).slice(0, 300) + '...'
    : '';
  const classAttr = getStaticAttr(el, 'class');
  const currentClasses = classAttr?.value || '';
  const currentText = el.textSegments
    .map((seg) => seg.text.trim())
    .filter(Boolean)
    .join(' ');
  const userPrompt =
    options.userPrompt || 'Enhance the design and visual styling of this element.';

  const formattedPrompt = `You are a modern UI/UX and Tailwind CSS engineer.

Context:
- File: ${relPath} (Line ${options.line})
- Language: ${lang}
- Component: <${compName} />
- Target Element: <${el.tagName}>
- Current Tailwind Classes: "${currentClasses}"
- Current Text: "${currentText}"

Parent Container Context:
\`\`\`${lang}
${parentSnippet}
\`\`\`

Target Element Code:
\`\`\`${lang}
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
    tagName: el.tagName,
    componentName: compName,
    targetSnippet,
    parentSnippet,
    currentClasses,
    currentText,
    formattedPrompt,
  };
}
