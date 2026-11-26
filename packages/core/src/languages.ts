export type FlimsyLanguage = 'jsx' | 'vue' | 'svelte' | 'astro' | 'html';

export type FlimsyMarkupLanguage = Exclude<FlimsyLanguage, 'jsx'>;

export const SUPPORTED_EXTENSIONS = [
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.astro',
  '.html',
  '.htm',
] as const;

/**
 * Maps a source file path to its Flimsy template language family.
 * - jsx:    React, Next.js, Preact, SolidJS, Qwik, Vue JSX (.tsx, .jsx)
 * - vue:    Vue 2 / Vue 3 / Nuxt Single File Components (.vue)
 * - svelte: Svelte 4 / Svelte 5 / SvelteKit components (.svelte)
 * - astro:  Astro components (.astro)
 * - html:   Vanilla HTML, Angular (.component.html), HTMX, Alpine.js (.html, .htm)
 */
export function detectLanguage(filePath: string): FlimsyLanguage | null {
  const clean = filePath.split('?')[0].toLowerCase();
  if (clean.endsWith('.tsx') || clean.endsWith('.jsx')) return 'jsx';
  if (clean.endsWith('.vue')) return 'vue';
  if (clean.endsWith('.svelte')) return 'svelte';
  if (clean.endsWith('.astro')) return 'astro';
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return 'html';
  return null;
}

export function isSupportedSourceFile(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

export function isMarkupLanguage(
  lang: FlimsyLanguage | null
): lang is FlimsyMarkupLanguage {
  return lang === 'vue' || lang === 'svelte' || lang === 'astro' || lang === 'html';
}
