// Pure Tailwind CSS live preview engine, class category reconciler, color & transform utilities

export const TW_SPACING: Record<string, string> = {
  '0': '0px', 'px': '1px', '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
  '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem', '3.5': '0.875rem', '4': '1rem',
  '5': '1.25rem', '6': '1.5rem', '7': '1.75rem', '8': '2rem', '9': '2.25rem',
  '10': '2.5rem', '11': '2.75rem', '12': '3rem', '14': '3.5rem', '16': '4rem',
  '20': '5rem', '24': '6rem', '28': '7rem', '32': '8rem', '36': '9rem', '40': '10rem',
  '44': '11rem', '48': '12rem', '52': '13rem', '56': '14rem', '60': '15rem', '64': '16rem',
  '72': '18rem', '80': '20rem', '96': '24rem',
};

export const TW_FONT_SIZE: Record<string, string> = {
  xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem',
  '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem',
  '6xl': '3.75rem', '7xl': '4.5rem', '8xl': '6rem', '9xl': '8rem',
};

export const TW_FONT_WEIGHT: Record<string, string> = {
  thin: '100', extralight: '200', light: '300', normal: '400', medium: '500',
  semibold: '600', bold: '700', extrabold: '800', black: '900',
};

export const TW_LEADING: Record<string, string> = {
  none: '1', tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625', loose: '2',
};

export const TW_TRACKING: Record<string, string> = {
  tighter: '-0.05em', tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em', widest: '0.1em',
};

export const TW_RADIUS: Record<string, string> = {
  none: '0px', sm: '0.125rem', '': '0.25rem', md: '0.375rem', lg: '0.5rem',
  xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem', full: '9999px',
};

export const TW_SHADOW: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  '': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.25)',
};

export const TW_BLUR: Record<string, string> = {
  none: '0px', sm: '4px', '': '8px', md: '12px', lg: '16px', xl: '24px',
};

export function hexAlphaToCss(rawColor, alphaStr) {
  if (!alphaStr) return rawColor;
  const alpha = Math.max(0, Math.min(100, parseInt(alphaStr, 10))) / 100;
  if (rawColor.startsWith('#') && (rawColor.length === 7 || rawColor.length === 4)) {
    let hex = rawColor.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  return rawColor;
}

export function resolveTwLength(val) {
  if (!val) return null;
  if (val.startsWith('[') && val.endsWith(']')) return val.slice(1, -1);
  if (val === 'full') return '100%';
  if (val === 'fit') return 'fit-content';
  if (val === 'auto') return 'auto';
  if (val === 'screen') return '100vw';
  if (TW_SPACING[val]) return TW_SPACING[val];
  return null;
}

export function buildPreviewRule(cls) {
  if (!cls || cls.includes(':')) return null;

  // Length-based arbitrary utilities MUST be checked before generic color brackets (e.g. text-[52px], border-[3px])
  let m = cls.match(/^text-\[(\d+(?:\.\d+)?(?:px|rem|em))\]$/);
  if (m) return 'font-size: ' + m[1] + '; line-height: 1.15;';
  m = cls.match(/^text-(xs|sm|base|lg|xl|[2-9]xl)$/);
  if (m && TW_FONT_SIZE[m[1]]) return 'font-size: ' + TW_FONT_SIZE[m[1]] + ';';
  m = cls.match(/^border-\[(\d+(?:\.\d+)?(?:px|rem|em))\]$/);
  if (m) return 'border-width: ' + m[1] + '; border-style: solid;';

  m = cls.match(/^(bg|text|border)-\[([^\]]+)\](?:\/(\d+))?$/);
  if (m && !/^\d/.test(m[2])) {
    const prop = m[1] === 'bg' ? 'background-color' : (m[1] === 'text' ? 'color' : 'border-color');
    return prop + ': ' + hexAlphaToCss(m[2], m[3]) + ';';
  }
  if (cls === 'bg-transparent') return 'background-color: transparent;';
  if (cls === 'text-transparent') return 'color: transparent;';
  if (cls === 'border-transparent') return 'border-color: transparent;';

  m = cls.match(/^w-(.+)$/);
  if (m) {
    const len = resolveTwLength(m[1]);
    if (len) return 'width: ' + len + ';';
  }
  m = cls.match(/^h-(.+)$/);
  if (m) {
    const len = m[1] === 'screen' ? '100vh' : resolveTwLength(m[1]);
    if (len) return 'height: ' + len + ';';
  }

  if (/^text-(left|center|right|justify)$/.test(cls)) return 'text-align: ' + cls.slice(5) + ';';
  if (cls === 'uppercase') return 'text-transform: uppercase;';
  if (cls === 'lowercase') return 'text-transform: lowercase;';
  if (cls === 'capitalize') return 'text-transform: capitalize;';
  if (cls === 'normal-case') return 'text-transform: none;';

  m = cls.match(/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/);
  if (m) return 'font-weight: ' + TW_FONT_WEIGHT[m[1]] + ';';
  if (cls === 'font-sans') return 'font-family: ui-sans-serif, system-ui, sans-serif;';
  if (cls === 'font-serif') return 'font-family: ui-serif, Georgia, Cambria, serif;';
  if (cls === 'font-mono') return 'font-family: ui-monospace, SFMono-Regular, monospace;';
  m = cls.match(/^font-\['?([^\]']+)'?\]$/);
  if (m) return 'font-family: "' + m[1].replace(/_/g, ' ') + '", sans-serif;';

  m = cls.match(/^leading-(.+)$/);
  if (m) {
    if (m[1].startsWith('[') && m[1].endsWith(']')) return 'line-height: ' + m[1].slice(1, -1) + ';';
    if (TW_LEADING[m[1]]) return 'line-height: ' + TW_LEADING[m[1]] + ';';
  }
  m = cls.match(/^tracking-(.+)$/);
  if (m) {
    if (m[1].startsWith('[') && m[1].endsWith(']')) return 'letter-spacing: ' + m[1].slice(1, -1) + ';';
    if (TW_TRACKING[m[1]]) return 'letter-spacing: ' + TW_TRACKING[m[1]] + ';';
  }

  if (cls === 'flex') return 'display: flex;';
  if (cls === 'inline-flex') return 'display: inline-flex;';
  if (cls === 'block') return 'display: block;';
  if (cls === 'grid') return 'display: grid;';
  if (cls === 'flex-row') return 'flex-direction: row;';
  if (cls === 'flex-col') return 'flex-direction: column;';
  if (cls === 'flex-row-reverse') return 'flex-direction: row-reverse;';
  if (cls === 'flex-col-reverse') return 'flex-direction: column-reverse;';
  if (cls === 'flex-wrap') return 'flex-wrap: wrap;';
  if (cls === 'flex-nowrap') return 'flex-wrap: nowrap;';
  m = cls.match(/^items-(start|center|end|baseline|stretch)$/);
  if (m) {
    const map = { start: 'flex-start', center: 'center', end: 'flex-end', baseline: 'baseline', stretch: 'stretch' };
    return 'align-items: ' + map[m[1]] + ';';
  }
  m = cls.match(/^justify-(start|center|end|between|around|evenly)$/);
  if (m) {
    const map = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };
    return 'justify-content: ' + map[m[1]] + ';';
  }
  m = cls.match(/^gap-(.+)$/);
  if (m) {
    const len = resolveTwLength(m[1]);
    if (len) return 'gap: ' + len + ';';
  }

  m = cls.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(.+)$/);
  if (m) {
    const len = resolveTwLength(m[2]);
    if (len) {
      const map = {
        p: 'padding: ' + len + ';',
        px: 'padding-left: ' + len + '; padding-right: ' + len + ';',
        py: 'padding-top: ' + len + '; padding-bottom: ' + len + ';',
        pt: 'padding-top: ' + len + ';', pr: 'padding-right: ' + len + ';',
        pb: 'padding-bottom: ' + len + ';', pl: 'padding-left: ' + len + ';',
        m: 'margin: ' + len + ';',
        mx: 'margin-left: ' + len + '; margin-right: ' + len + ';',
        my: 'margin-top: ' + len + '; margin-bottom: ' + len + ';',
        mt: 'margin-top: ' + len + ';', mr: 'margin-right: ' + len + ';',
        mb: 'margin-bottom: ' + len + ';', ml: 'margin-left: ' + len + ';',
      };
      return map[m[1]];
    }
  }

  m = cls.match(/^rounded(?:-(tl|tr|br|bl))?(?:-(.+))?$/);
  if (m) {
    const corner = m[1];
    const val = m[2] || '';
    const rad = val.startsWith('[') && val.endsWith(']') ? val.slice(1, -1) : TW_RADIUS[val];
    if (rad) {
      if (!corner) return 'border-radius: ' + rad + ';';
      const cMap = { tl: 'border-top-left-radius', tr: 'border-top-right-radius', br: 'border-bottom-right-radius', bl: 'border-bottom-left-radius' };
      return cMap[corner] + ': ' + rad + ';';
    }
  }

  if (/^border-(solid|dashed|dotted|double|none)$/.test(cls)) return 'border-style: ' + cls.slice(7) + ';';
  if (cls === 'border') return 'border-width: 1px; border-style: solid;';
  m = cls.match(/^border-(\d+)$/);
  if (m) return 'border-width: ' + m[1] + 'px;';
  m = cls.match(/^border-\[([^\]]+)\]$/);
  if (m && /^\d/.test(m[1])) return 'border-width: ' + m[1] + ';';
  m = cls.match(/^border-([trbl])(?:-(\d+|\[[^\]]+\]))?$/);
  if (m) {
    const sideMap = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
    const wVal = !m[2] ? '1px' : (m[2].startsWith('[') ? m[2].slice(1, -1) : m[2] + 'px');
    return 'border-' + sideMap[m[1]] + '-width: ' + wVal + '; border-' + sideMap[m[1]] + '-style: solid;';
  }

  m = cls.match(/^opacity-(\d+)$/);
  if (m) return 'opacity: ' + (parseInt(m[1], 10) / 100) + ';';
  m = cls.match(/^opacity-\[([^\]]+)\]$/);
  if (m) {
    const v = m[1].endsWith('%') ? (parseFloat(m[1]) / 100) : m[1];
    return 'opacity: ' + v + ';';
  }

  // Position & Inset offsets (for Freeform Absolute Drag & Layout Positioning)
  if (/^(static|relative|absolute|fixed|sticky)$/.test(cls)) return 'position: ' + cls + ';';
  m = cls.match(/^(-)?(left|right|top|bottom)-(.+)$/);
  if (m) {
    const len = resolveTwLength(m[3]);
    if (len) {
      const val = m[1] ? ('-' + len.replace(/^-/, '')) : len;
      return m[2] + ': ' + val + ';';
    }
  }

  m = cls.match(/^(-)?rotate-(?:\[([^\]]+)\]|(\d+))$/);
  if (m) {
    const neg = m[1] ? '-' : '';
    const deg = m[2] ? m[2] : (neg + m[3] + 'deg');
    return '--flimsy-rot: ' + deg + '; transform: translate(var(--flimsy-tx, 0px), var(--flimsy-ty, 0px)) rotate(var(--flimsy-rot, 0deg));';
  }
  m = cls.match(/^(-)?translate-(x|y)-\[([^\]]+)\]$/);
  if (m) {
    const neg = m[1] ? '-' : '';
    const val = neg ? ('-' + m[3].replace(/^-/, '')) : m[3];
    const varName = m[2] === 'x' ? '--flimsy-tx' : '--flimsy-ty';
    return varName + ': ' + val + '; transform: translate(var(--flimsy-tx, 0px), var(--flimsy-ty, 0px)) rotate(var(--flimsy-rot, 0deg));';
  }

  m = cls.match(/^shadow(?:-(none|sm|md|lg|xl|2xl|inner))?$/);
  if (m) {
    const sh = TW_SHADOW[m[1] || ''];
    if (sh) return 'box-shadow: ' + sh + ';';
  }
  m = cls.match(/^backdrop-blur(?:-(none|sm|md|lg|xl))?$/);
  if (m) {
    const bVal = TW_BLUR[m[1] || ''];
    if (bVal !== undefined) return 'backdrop-filter: blur(' + bVal + '); -webkit-backdrop-filter: blur(' + bVal + ');';
  }
  m = cls.match(/^blur(?:-(none|sm|md|lg|xl))?$/);
  if (m) {
    const bVal = TW_BLUR[m[1] || ''];
    if (bVal !== undefined) return 'filter: blur(' + bVal + ');';
  }

  return null;
}


export function getClientClassCategory(base) {
  if (/^text-([0-9]?xl|xs|sm|base|lg|(\[\d+(?:\.\d+)?(px|rem|em)\]))$/.test(base)) return 'font-size';
  if (/^text-(left|center|right|justify|start|end)$/.test(base)) return 'text-align';
  if (base.startsWith('text-')) return 'text-color';
  if (/^font-(sans|serif|mono|(\[[^\]]+\]))$/.test(base)) return 'font-family';
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) return 'font-weight';
  if (/^leading-/.test(base)) return 'line-height';
  if (/^tracking-/.test(base)) return 'letter-spacing';
  if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(base)) return 'text-transform';
  if (/^rounded-(tl|tr|br|bl)-/.test(base)) return base.match(/^rounded-(tl|tr|br|bl)/)?.[0];
  if (base.startsWith('rounded')) return 'border-radius';
  if (/^shadow(-none|-sm|-md|-lg|-xl|-2xl|-inner)?$/.test(base)) return 'box-shadow';
  if (base.startsWith('backdrop-blur')) return 'backdrop-blur';
  if (/^blur(-none|-sm|-md|-lg|-xl|-2xl|-3xl|(\[[^\]]+\]))?$/.test(base)) return 'layer-blur';
  if (/^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden)$/.test(base)) return 'display';
  if (/^flex-(row|col|row-reverse|col-reverse)$/.test(base)) return 'flex-dir';
  if (/^flex-(wrap|nowrap|wrap-reverse)$/.test(base)) return 'flex-wrap';
  if (base.startsWith('items-')) return 'items';
  if (base.startsWith('justify-')) return 'justify';
  if (base.startsWith('gap-')) return 'gap';
  if (base.startsWith('pt-')) return 'pt';
  if (base.startsWith('pr-')) return 'pr';
  if (base.startsWith('pb-')) return 'pb';
  if (base.startsWith('pl-')) return 'pl';
  if (base.startsWith('p-')) return 'padding';
  if (base.startsWith('m-')) return 'margin';
  if (base.startsWith('bg-')) return 'bg-color';
  if (base.startsWith('w-')) return 'width';
  if (base.startsWith('h-')) return 'height';
  if (/^border-(solid|dashed|dotted|double|none)$/.test(base)) return 'border-style';
  if (/^border-([trbl])(-[0-9]+|(\[[0-9]+px\]))?$/.test(base)) return 'border-width-' + base.match(/^border-([trbl])/)[1];
  if (/^border(-[0-9]+|(\[[0-9]+px\]))?$/.test(base) || base === 'border') return 'border-width';
  if (base.startsWith('border-')) return 'border-color';
  if (base.startsWith('opacity-')) return 'opacity';
  if (/^(static|fixed|absolute|relative|sticky)$/.test(base)) return 'position';
  if (/^-?left-/.test(base)) return 'inset-left';
  if (/^-?right-/.test(base)) return 'inset-right';
  if (/^-?top-/.test(base)) return 'inset-top';
  if (/^-?bottom-/.test(base)) return 'inset-bottom';
  if (/^-?rotate-/.test(base)) return 'rotate';
  if (/^-?translate-x-/.test(base)) return 'translate-x';
  if (/^-?translate-y-/.test(base)) return 'translate-y';
  return '';
}


export function rgbStringToHexAndAlpha(cssColor) {
  if (!cssColor || cssColor === 'transparent') return null;
  const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  if (a === 0) return null;
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { r, g, b, hex, alpha: Math.round(a * 100) };
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(v * 100)];
}


export function parseRotationDeg(classesStr) {
  const tokens = (classesStr || '').split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(/^(-)?rotate-(?:\[(-?\d+(?:\.\d+)?)deg\]|(\d+))$/);
    if (m) {
      if (m[2] !== undefined) return parseFloat(m[2]);
      const v = parseFloat(m[3]);
      return m[1] ? -v : v;
    }
  }
  return 0;
}

export function parseTranslatePx(classesStr, axis) {
  const tokens = (classesStr || '').split(/\s+/);
  const re = new RegExp('^(-)?translate-' + axis + '-(?:\\[(-?\\d+(?:\\.\\d+)?)px\\]|(\\d+))$');
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(re);
    if (m) {
      if (m[2] !== undefined) {
        const raw = parseFloat(m[2]);
        return m[1] ? -Math.abs(raw) : raw;
      }
      const scalePx = parseFloat(m[3]) * 4;
      return m[1] ? -scalePx : scalePx;
    }
  }
  return 0;
}

export function parseInsetPx(classesStr, side) {
  const tokens = (classesStr || '').split(/\s+/);
  const re = new RegExp('^(-)?' + side + '-(?:\\[(-?\\d+(?:\\.\\d+)?)px\\]|(\\d+))$');
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(re);
    if (m) {
      if (m[2] !== undefined) {
        const raw = parseFloat(m[2]);
        return m[1] ? -Math.abs(raw) : raw;
      }
      const scalePx = parseFloat(m[3]) * 4;
      return m[1] ? -scalePx : scalePx;
    }
  }
  return 0;
}


export function hsvToRgb(h, s, v) {
  s = s / 100;
  v = v / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h <= 360) { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}


export function buildClassUpdateAction(origCls, nextCls) {
  const oldTokens = (origCls || '').split(/\s+/).filter(Boolean);
  const newTokens = (nextCls || '').split(/\s+/).filter(Boolean);
  const added = newTokens.filter((t) => !oldTokens.includes(t));
  const removed = oldTokens.filter((t) => !newTokens.includes(t));
  return {
    type: 'update-class',
    newClasses: added.join(' '),
    removeClasses: removed,
    mode: 'reconcile',
  };
}

