import type { FlimsyMarkupLanguage } from './languages.js';

export interface MarkupAttr {
  name: string;
  nameStart: number;
  nameEnd: number;
  value: string | null;
  valueStart: number;
  valueEnd: number;
  quote: '"' | "'" | '{' | null;
  start: number;
  end: number;
}

export interface MarkupTextSegment {
  start: number;
  end: number;
  text: string;
}

export interface MarkupElement {
  tagName: string;
  start: number;
  end: number;
  openStart: number;
  openEnd: number;
  tagNameEnd: number;
  closeStart: number;
  selfClosing: boolean;
  isVoid: boolean;
  line: number;
  column: number;
  attrs: MarkupAttr[];
  children: MarkupElement[];
  parent: MarkupElement | null;
  textSegments: MarkupTextSegment[];
}

export interface MarkupParseResult {
  roots: MarkupElement[];
  all: MarkupElement[];
  errors: string[];
  regionStart: number;
  regionEnd: number;
}

export const HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_OPAQUE_TAGS = new Set(['script', 'style']);

function buildLineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToLineCol(lineStarts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const lineIdx = Math.max(0, high);
  return { line: lineIdx + 1, column: offset - lineStarts[lineIdx] };
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function isTagNameStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isTagNameChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9') ||
    ch === '-' ||
    ch === '_' ||
    ch === ':' ||
    ch === '.'
  );
}

/**
 * Reads a balanced `{ ... }` expression (handling strings, template literals, and JS comments)
 * so operators like `>` or `<` inside Svelte/Astro expressions never break tag scanning.
 */
function readBalancedBraces(code: string, start: number, limit: number): number {
  let depth = 0;
  let i = start;
  while (i < limit) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < limit) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === '/' && i + 1 < limit && code[i + 1] === '/') {
      i += 2;
      while (i < limit && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && i + 1 < limit && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 || end + 2 > limit ? limit : end + 2;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return limit;
}

/**
 * Skips leading Astro `--- ... ---` frontmatter fence.
 */
function findAstroBodyStart(code: string): number {
  let i = 0;
  while (i < code.length && isWhitespace(code[i])) i++;
  if (!code.startsWith('---', i)) return 0;
  const firstNl = code.indexOf('\n', i + 3);
  if (firstNl === -1) return 0;

  let pos = firstNl + 1;
  while (pos < code.length) {
    const lineEnd = code.indexOf('\n', pos);
    const sliceEnd = lineEnd === -1 ? code.length : lineEnd;
    if (code.slice(pos, sliceEnd).trim() === '---') {
      return lineEnd === -1 ? code.length : lineEnd + 1;
    }
    if (lineEnd === -1) break;
    pos = lineEnd + 1;
  }
  return 0;
}

/**
 * Finds the inner bounds `[start, end)` of the root `<template>...</template>` block in a Vue SFC,
 * properly tracking nested `<template v-if>` / `<template #slot>` blocks.
 */
function findVueTemplateRegion(code: string): { start: number; end: number } | null {
  let i = 0;
  const len = code.length;
  let rootOpenEnd = -1;
  let templateDepth = 0;

  while (i < len) {
    const lt = code.indexOf('<', i);
    if (lt === -1) break;

    if (code.startsWith('<!--', lt)) {
      const end = code.indexOf('-->', lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }

    // Skip top-level <script> and <style> blocks when outside <template>
    if (templateDepth === 0) {
      const lowerHead = code.slice(lt + 1, lt + 9).toLowerCase();
      if (lowerHead.startsWith('script') && (lt + 7 >= len || isWhitespace(code[lt + 7]) || code[lt + 7] === '>')) {
        const closeRe = /<\/script\s*>/gi;
        closeRe.lastIndex = lt + 7;
        const m = closeRe.exec(code);
        i = m ? m.index + m[0].length : len;
        continue;
      }
      if (lowerHead.startsWith('style') && (lt + 6 >= len || isWhitespace(code[lt + 6]) || code[lt + 6] === '>')) {
        const closeRe = /<\/style\s*>/gi;
        closeRe.lastIndex = lt + 6;
        const m = closeRe.exec(code);
        i = m ? m.index + m[0].length : len;
        continue;
      }
    }

    const isClose = code[lt + 1] === '/';
    let p = isClose ? lt + 2 : lt + 1;
    while (p < len && isWhitespace(code[p])) p++;
    const nameStart = p;
    while (p < len && isTagNameChar(code[p])) p++;
    const tag = code.slice(nameStart, p).toLowerCase();

    if (tag === 'template') {
      // Advance to closing '>' respecting quoted strings
      let q = p;
      let selfClosing = false;
      while (q < len) {
        const c = code[q];
        if (c === '"' || c === "'") {
          const endQ = code.indexOf(c, q + 1);
          q = endQ === -1 ? len : endQ + 1;
          continue;
        }
        if (c === '>') {
          selfClosing = q > p && code[q - 1] === '/';
          q++;
          break;
        }
        q++;
      }

      if (isClose) {
        if (templateDepth > 0) {
          templateDepth--;
          if (templateDepth === 0 && rootOpenEnd !== -1) {
            return { start: rootOpenEnd, end: lt };
          }
        }
      } else if (!selfClosing) {
        if (templateDepth === 0) {
          rootOpenEnd = q;
        }
        templateDepth++;
      }
      i = q;
      continue;
    }

    i = lt + 1;
  }

  return null;
}

function readOpeningTag(
  code: string,
  lt: number,
  limit: number,
  allowBraceExpr: boolean
): {
  tagName: string;
  tagNameEnd: number;
  openEnd: number;
  selfClosing: boolean;
  attrs: MarkupAttr[];
  error?: string;
} | null {
  let i = lt + 1;
  if (i >= limit || !isTagNameStart(code[i])) return null;

  const nameStart = i;
  while (i < limit && isTagNameChar(code[i])) i++;
  const tagName = code.slice(nameStart, i);
  const tagNameEnd = i;
  const attrs: MarkupAttr[] = [];

  while (i < limit) {
    while (i < limit && isWhitespace(code[i])) i++;
    if (i >= limit) {
      return {
        tagName,
        tagNameEnd,
        openEnd: limit,
        selfClosing: false,
        attrs,
        error: `Unclosed opening tag <${tagName}>`,
      };
    }

    if (code[i] === '>') {
      return { tagName, tagNameEnd, openEnd: i + 1, selfClosing: false, attrs };
    }
    if (code[i] === '/' && i + 1 < limit && code[i + 1] === '>') {
      return { tagName, tagNameEnd, openEnd: i + 2, selfClosing: true, attrs };
    }

    // Svelte / Astro shorthand attribute: {disabled} or {...props}
    if (allowBraceExpr && code[i] === '{') {
      const exprStart = i;
      const exprEnd = readBalancedBraces(code, i, limit);
      attrs.push({
        name: code.slice(exprStart + 1, Math.max(exprStart + 1, exprEnd - 1)).trim(),
        nameStart: exprStart,
        nameEnd: exprEnd,
        value: code.slice(exprStart, exprEnd),
        valueStart: exprStart,
        valueEnd: exprEnd,
        quote: '{',
        start: exprStart,
        end: exprEnd,
      });
      i = exprEnd;
      continue;
    }

    const attrStart = i;
    while (
      i < limit &&
      !isWhitespace(code[i]) &&
      code[i] !== '=' &&
      code[i] !== '>' &&
      !(code[i] === '/' && i + 1 < limit && code[i + 1] === '>')
    ) {
      i++;
    }
    const attrNameEnd = i;
    const attrName = code.slice(attrStart, attrNameEnd);
    if (!attrName) {
      i++;
      continue;
    }

    while (i < limit && isWhitespace(code[i])) i++;
    if (i < limit && code[i] === '=') {
      i++; // skip '='
      while (i < limit && isWhitespace(code[i])) i++;
      if (i < limit && (code[i] === '"' || code[i] === "'")) {
        const quote = code[i] as '"' | "'";
        const valueStart = i + 1;
        i++;
        while (i < limit && code[i] !== quote) {
          if (code[i] === '\\' && i + 1 < limit) {
            i += 2;
            continue;
          }
          i++;
        }
        const valueEnd = i;
        if (i < limit && code[i] === quote) i++;
        attrs.push({
          name: attrName,
          nameStart: attrStart,
          nameEnd: attrNameEnd,
          value: code.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          quote,
          start: attrStart,
          end: i,
        });
      } else if (allowBraceExpr && i < limit && code[i] === '{') {
        const valueStart = i;
        const valueEnd = readBalancedBraces(code, i, limit);
        i = valueEnd;
        attrs.push({
          name: attrName,
          nameStart: attrStart,
          nameEnd: attrNameEnd,
          value: code.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          quote: '{',
          start: attrStart,
          end: i,
        });
      } else {
        const valueStart = i;
        while (
          i < limit &&
          !isWhitespace(code[i]) &&
          code[i] !== '>' &&
          !(code[i] === '/' && i + 1 < limit && code[i + 1] === '>')
        ) {
          i++;
        }
        const valueEnd = i;
        attrs.push({
          name: attrName,
          nameStart: attrStart,
          nameEnd: attrNameEnd,
          value: code.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          quote: null,
          start: attrStart,
          end: i,
        });
      }
    } else {
      attrs.push({
        name: attrName,
        nameStart: attrStart,
        nameEnd: attrNameEnd,
        value: null,
        valueStart: attrNameEnd,
        valueEnd: attrNameEnd,
        quote: null,
        start: attrStart,
        end: attrNameEnd,
      });
    }
  }

  return {
    tagName,
    tagNameEnd,
    openEnd: limit,
    selfClosing: false,
    attrs,
    error: `Unclosed opening tag <${tagName}>`,
  };
}

/**
 * Deterministic, zero-dependency template markup parser for Vue SFC, Svelte, Astro,
 * Angular templates, and Vanilla HTML. Preserves exact character offsets and 1-based line/col.
 */
export function parseMarkupTemplate(
  code: string,
  lang: FlimsyMarkupLanguage
): MarkupParseResult {
  const lineStarts = buildLineStarts(code);
  let regionStart = 0;
  let regionEnd = code.length;

  if (lang === 'vue') {
    const region = findVueTemplateRegion(code);
    if (!region) {
      return { roots: [], all: [], errors: [], regionStart: 0, regionEnd: 0 };
    }
    regionStart = region.start;
    regionEnd = region.end;
  } else if (lang === 'astro') {
    regionStart = findAstroBodyStart(code);
  }

  const allowBraceExpr = lang === 'svelte' || lang === 'astro';
  const roots: MarkupElement[] = [];
  const all: MarkupElement[] = [];
  const errors: string[] = [];
  const stack: MarkupElement[] = [];

  let i = regionStart;
  let textStart = regionStart;

  const flushText = (endOffset: number) => {
    if (stack.length > 0 && endOffset > textStart) {
      const text = code.slice(textStart, endOffset);
      stack[stack.length - 1].textSegments.push({
        start: textStart,
        end: endOffset,
        text,
      });
    }
  };

  while (i < regionEnd) {
    const ch = code[i];

    // Skip template interpolation / control-flow braces so expressions are preserved intact
    if (allowBraceExpr && ch === '{') {
      flushText(i);
      i = readBalancedBraces(code, i, regionEnd);
      textStart = i;
      continue;
    }

    // Vue / Angular mustache interpolation {{ ... }}
    if ((lang === 'vue' || lang === 'html') && ch === '{' && i + 1 < regionEnd && code[i + 1] === '{') {
      const closeMustache = code.indexOf('}}', i + 2);
      if (closeMustache !== -1 && closeMustache + 2 <= regionEnd) {
        flushText(i);
        i = closeMustache + 2;
        textStart = i;
        continue;
      }
    }

    if (ch !== '<') {
      i++;
      continue;
    }

    // HTML comments <!-- ... -->
    if (code.startsWith('<!--', i)) {
      flushText(i);
      const endComment = code.indexOf('-->', i + 4);
      i = endComment === -1 || endComment + 3 > regionEnd ? regionEnd : endComment + 3;
      textStart = i;
      continue;
    }

    // Doctype / CDATA / directives <! ... >
    if (i + 1 < regionEnd && code[i + 1] === '!') {
      flushText(i);
      const endDecl = code.indexOf('>', i + 2);
      i = endDecl === -1 || endDecl + 1 > regionEnd ? regionEnd : endDecl + 1;
      textStart = i;
      continue;
    }

    // Closing tag </tag>
    if (i + 1 < regionEnd && code[i + 1] === '/') {
      flushText(i);
      let p = i + 2;
      while (p < regionEnd && isWhitespace(code[p])) p++;
      const nameStart = p;
      while (p < regionEnd && isTagNameChar(code[p])) p++;
      const closeName = code.slice(nameStart, p);
      const gt = code.indexOf('>', p);
      const closeEnd = gt === -1 || gt + 1 > regionEnd ? regionEnd : gt + 1;

      if (closeName) {
        const lowerClose = closeName.toLowerCase();
        // Match top of stack (or walk back if an optional HTML tag was unclosed)
        let matchIdx = -1;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].tagName.toLowerCase() === lowerClose) {
            matchIdx = s;
            break;
          }
        }
        if (matchIdx === -1) {
          errors.push(`Unexpected closing tag </${closeName}>`);
        } else {
          if (matchIdx !== stack.length - 1) {
            for (let u = stack.length - 1; u > matchIdx; u--) {
              errors.push(`Unclosed tag <${stack[u].tagName}>`);
              stack[u].closeStart = i;
              stack[u].end = i;
              stack.pop();
            }
          }
          const closed = stack.pop()!;
          closed.closeStart = i;
          closed.end = closeEnd;
        }
      }

      i = closeEnd;
      textStart = i;
      continue;
    }

    // Opening tag <tag ...>
    if (i + 1 < regionEnd && isTagNameStart(code[i + 1])) {
      flushText(i);
      const parsedOpen = readOpeningTag(code, i, regionEnd, allowBraceExpr);
      if (!parsedOpen) {
        i++;
        continue;
      }
      if (parsedOpen.error) {
        errors.push(parsedOpen.error);
      }

      const lowerTag = parsedOpen.tagName.toLowerCase();

      // Skip opaque <script>, <style>, and (for HTML docs) <head> blocks entirely
      if (RAW_OPAQUE_TAGS.has(lowerTag) || (lang === 'html' && lowerTag === 'head')) {
        if (parsedOpen.selfClosing) {
          i = parsedOpen.openEnd;
          textStart = i;
          continue;
        }
        const closeRe = new RegExp(`</${lowerTag}\\s*>`, 'gi');
        closeRe.lastIndex = parsedOpen.openEnd;
        const m = closeRe.exec(code);
        if (m && m.index + m[0].length <= regionEnd) {
          i = m.index + m[0].length;
        } else {
          errors.push(`Unclosed <${lowerTag}> block`);
          i = regionEnd;
        }
        textStart = i;
        continue;
      }

      const isVoid = HTML_VOID_TAGS.has(lowerTag);
      const { line, column } = offsetToLineCol(lineStarts, i);
      const parent = stack.length > 0 ? stack[stack.length - 1] : null;

      const el: MarkupElement = {
        tagName: parsedOpen.tagName,
        start: i,
        end: parsedOpen.openEnd,
        openStart: i,
        openEnd: parsedOpen.openEnd,
        tagNameEnd: parsedOpen.tagNameEnd,
        closeStart: parsedOpen.openEnd,
        selfClosing: parsedOpen.selfClosing,
        isVoid,
        line,
        column,
        attrs: parsedOpen.attrs,
        children: [],
        parent,
        textSegments: [],
      };

      if (parent) {
        parent.children.push(el);
      } else {
        roots.push(el);
      }
      all.push(el);

      if (!parsedOpen.selfClosing && !isVoid) {
        stack.push(el);
      }

      i = parsedOpen.openEnd;
      textStart = i;
      continue;
    }

    i++;
  }

  flushText(regionEnd);

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push(`Unclosed tag <${unclosed.tagName}>`);
    unclosed.closeStart = regionEnd;
    unclosed.end = regionEnd;
  }

  return { roots, all, errors, regionStart, regionEnd };
}

export function findMarkupElementByLocation(
  elements: MarkupElement[],
  line: number,
  column: number
): MarkupElement | null {
  let matched: MarkupElement | null = null;
  let minColDiff = Infinity;

  for (const el of elements) {
    if (el.line === line) {
      const diff = Math.abs(el.column - column);
      if (diff < minColDiff) {
        minColDiff = diff;
        matched = el;
      }
    }
  }

  if (!matched) {
    for (const el of elements) {
      if (Math.abs(el.line - line) <= 1) {
        const diff = Math.abs(el.column - column);
        if (diff < minColDiff) {
          minColDiff = diff;
          matched = el;
        }
      }
    }
  }

  return matched;
}

export function isMarkupDescendant(
  possibleDescendant: MarkupElement,
  ancestor: MarkupElement
): boolean {
  let cur: MarkupElement | null = possibleDescendant;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}
