import { describe, it, expect } from 'vitest';
import {
  buildPreviewRule,
  getClientClassCategory,
  parseRotationDeg,
  parseTranslatePx,
  parseInsetPx,
  rgbToHsv,
  hsvToRgb,
  rgbToHex,
  buildClassUpdateAction,
} from '../src/client/tailwind-preview.js';

describe('Modular browser studio: tailwind-preview utilities', () => {
  it('resolves arbitrary font sizes and border widths ahead of color brackets', () => {
    expect(buildPreviewRule('text-[52px]')).toContain('font-size: 52px');
    expect(buildPreviewRule('text-[52px]')).not.toContain('color:');
    expect(buildPreviewRule('border-[3px]')).toContain('border-width: 3px');
    expect(buildPreviewRule('bg-[#09090b]/80')).toBe('background-color: rgba(9,9,11,0.8);');
    expect(buildPreviewRule('text-[#ffffff]')).toBe('color: #ffffff;');
    expect(buildPreviewRule('absolute')).toBe('position: absolute;');
    expect(buildPreviewRule('left-[64px]')).toBe('left: 64px;');
    expect(buildPreviewRule('translate-x-[-40px]')).toContain('--flimsy-tx: -40px');
  });

  it('classifies Tailwind utilities and parses transform/inset/color values accurately', () => {
    expect(getClientClassCategory('text-[48px]')).toBe('font-size');
    expect(getClientClassCategory('text-white')).toBe('text-color');
    expect(getClientClassCategory('absolute')).toBe('position');
    expect(getClientClassCategory('left-[24px]')).toBe('inset-left');
    expect(parseRotationDeg('p-4 rotate-[15deg]')).toBe(15);
    expect(parseTranslatePx('translate-x-[-32px] translate-y-[12px]', 'x')).toBe(-32);
    expect(parseInsetPx('absolute left-[80px] top-[20px]', 'left')).toBe(80);

    const [h, s, v] = rgbToHsv(14, 165, 233);
    const [r, g, b] = hsvToRgb(h, s, v);
    expect(rgbToHex(r, g, b)).toMatch(/^#[0-9a-f]{6}$/);

    const diff = buildClassUpdateAction('p-4 bg-white text-4xl sm:text-5xl', 'p-8 bg-zinc-950 text-[64px]');
    expect(diff.newClasses).toBe('p-8 bg-zinc-950 text-[64px]');
    expect(diff.removeClasses).toEqual(['p-4', 'bg-white', 'text-4xl', 'sm:text-5xl']);
  });
});
