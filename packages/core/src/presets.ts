import type { InsertElementPreset } from './types.js';

function escapeAttrValue(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeTextContent(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

export function buildInsertElementSnippet(
  preset: InsertElementPreset,
  options: {
    attrName?: 'className' | 'class';
    text?: string;
    classes?: string;
    src?: string;
    alt?: string;
  } = {}
): string {
  const attrName = options.attrName || 'className';
  if (preset === 'text') {
    const cls = escapeAttrValue((options.classes || 'text-base text-zinc-900').trim());
    const text = escapeTextContent((options.text ?? 'New text').trim() || 'New text');
    return `<p ${attrName}="${cls}">${text}</p>`;
  }
  if (preset === 'button') {
    const cls = escapeAttrValue(
      (
        options.classes ||
        'px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium'
      ).trim()
    );
    const text = escapeTextContent((options.text ?? 'Button').trim() || 'Button');
    return `<button type="button" ${attrName}="${cls}">${text}</button>`;
  }
  if (preset === 'image') {
    const cls = escapeAttrValue((options.classes || 'w-64 h-40 object-cover rounded-xl').trim());
    const src = escapeAttrValue((options.src || 'https://placehold.co/320x200').trim());
    const alt = escapeAttrValue((options.alt || 'Placeholder').trim());
    return `<img src="${src}" alt="${alt}" ${attrName}="${cls}" />`;
  }
  const cls = escapeAttrValue(
    (
      options.classes ||
      'p-6 rounded-xl bg-zinc-100 border border-zinc-200 min-h-[80px]'
    ).trim()
  );
  const text = options.text ? escapeTextContent(options.text) : '';
  return `<div ${attrName}="${cls}">${text}</div>`;
}
