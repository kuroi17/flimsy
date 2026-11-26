export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Studio active. Alt+X to toggle inspect. Shift+S to sync to code.');

  // --- Core State ---
  let isInspectActive = false;
  let isLayersOpen = true;
  let isSnapEnabled = true;
  let isAltPressed = false;

  // Viewport Camera (Zoom & Pan) + Hand Tool + Clipboard State
  let canvasZoom = 1;
  let panX = 0;
  let panY = 0;
  let isHandTool = false;
  let isSpacePressed = false;
  let isPanning = false;
  let isMovingElements = false;
  let copiedSnippets = [];
  let copiedSourceKeys = new Set();

  let hoveredTarget = null;
  let selectedTarget = null;
  let selectedTargets = [];
  const targetStates = new WeakMap();

  let originalClasses = '';
  let originalText = '';
  let pendingText = null;
  let pendingClasses = '';
  let fileMtime = 0;

  let draggedElement = null;
  let activeDropPosition = 'after';
  const collapsedLayerKeys = new Set();

  // Active color target & panel disclosure state
  let activeColorTarget = 'fill';
  let currentColorHsv = [217, 49, 23];
  let currentColorAlpha = 100;
  let isPaddingLinked = true;
  let isRadiusLinked = true;
  let isBorderSidesLinked = true;
  let isBorderSectionOpen = false;
  let isEffectsSectionOpen = false;

  // History buffer for Undo/Redo
  let history = [];
  let historyIdx = -1;

  // --- Custom Flimsy Monochrome SVG Icon Registry (20x20 optical grid, bold 1.95px weight + subtle duotone depth) ---
  const ICONS = {
    // Flimsy Logo Mark: bold curled ivory sheet peeling over matte obsidian base
    brand: '<svg viewBox="0 0 20 20" fill="none"><path d="M4.2 10.8 11.8 8l5.5 4.2-7.6 3.9-5.5-5.3Z" fill="#09090b"/><path d="M2.6 8 11.4 4.2c1.1 3.4 3 5 5.6 5.6L9.2 14.4c-2.8-.5-4.9-2.6-6.6-6.4Z" fill="#faf7ef" stroke="#09090b" stroke-width="1.45" stroke-linejoin="round"/><path d="M11.4 4.2c.4 3 1.9 4.8 4.7 5.6" stroke="#09090b" stroke-width="1.35" stroke-linecap="round"/></svg>',
    // Custom Inspect Pointer (faceted arrow with duotone core & notched tail)
    cursor: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 3.2 8.7 16.2l2.1-4.6 4.8-1.9L4.2 3.2Z" fill="currentColor" fill-opacity="0.16"/><path d="m10.9 11.7 4 4"/></svg>',
    // Custom Hand Pan Tool (sculpted open palm with subtle fill weight)
    hand: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 9.2V5.6a1.25 1.25 0 0 0-2.5 0v3.2V4.4a1.25 1.25 0 0 0-2.5 0v4.4V5.2a1.25 1.25 0 0 0-2.5 0v6L6.3 9.9a1.3 1.3 0 0 0-1.9 1.8l3.1 4.2a3.5 3.5 0 0 0 2.8 1.4h1.9a3.8 3.8 0 0 0 3.8-3.8V9.2a1.25 1.25 0 0 0-2.5 0" fill="currentColor" fill-opacity="0.14"/></svg>',
    // Custom Editorial Text Glyph (strong vertical stem + structured serifs)
    text: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 6V4.2h11.6V6"/><path d="M10 4.2v11.6"/><path d="M7.2 15.8h5.6"/></svg>',
    // Custom Flimsy Layers (two stacked peeling sheets echoing brand mark)
    layers: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.2 10 4.5l7 3.7-7 3.7-7-3.7Z" fill="currentColor" fill-opacity="0.16"/><path d="m3 12.2 7 3.7 7-3.7"/><path d="M13 6c-.2 1.4.6 2.2 1.9 2.6"/></svg>',
    // Custom Precision Snap Grid with solid center anchor
    snap: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7 3.5v13"/><path d="M13 3.5v13"/><path d="M3.5 7h13"/><path d="M3.5 13h13"/><circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none"/></svg>',
    undo: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.6 5.8 3.8 9.5l3.8 3.7"/><path d="M4.4 9.5H12a3.7 3.7 0 0 1 0 7.4h-2"/></svg>',
    redo: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.4 5.8 3.8 3.7-3.8 3.7"/><path d="M15.6 9.5H8a3.7 3.7 0 0 0 0 7.4h2"/></svg>',
    ai: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3 11.4 7.8 16.2 9.7l-4.8 1.9-1.9 4.8-1.9-4.8-4.8-1.9 4.8-1.9L9.5 3Z" fill="currentColor" fill-opacity="0.16"/><circle cx="15.8" cy="4.4" r="1.2" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M14.8 5.2 5.2 14.8"/><path d="m5.2 5.2 9.6 9.6"/></svg>',
    refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 10a6.5 6.5 0 1 0-1.9 4.6"/><path d="M16.5 4.8V10h-5.2"/></svg>',
    chevronDown: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5.8 8 4.2 4.2L14.2 8"/></svg>',
    plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M10 4.5v11"/><path d="M4.5 10h11"/></svg>',
    minus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M4.5 10h11"/></svg>',
    flowRow: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12"/><path d="m11.8 6 4.2 4-4.2 4"/></svg>',
    flowCol: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v12"/><path d="m6 11.8 4 4.2 4-4.2"/></svg>',
    flowWrap: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.8h13"/><path d="M3.5 10h10.2a2.6 2.6 0 1 1 0 5.2h-2.8"/><path d="m12.8 13-2.2 2.2 2.2 2.2"/></svg>',
    alignL: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"><path d="M3.5 5.5h13"/><path d="M3.5 10h8.2"/><path d="M3.5 14.5h10.8"/></svg>',
    alignC: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"><path d="M3.5 5.5h13"/><path d="M5.9 10h8.2"/><path d="M4.6 14.5h10.8"/></svg>',
    alignR: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"><path d="M3.5 5.5h13"/><path d="M8.3 10h8.2"/><path d="M5.7 14.5h10.8"/></svg>',
    alignJ: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"><path d="M3.5 5.5h13"/><path d="M3.5 10h13"/><path d="M3.5 14.5h13"/></svg>',
    sides: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3.5h8"/><path d="M6 16.5h8"/><path d="M3.5 6v8"/><path d="M16.5 6v8"/></svg>',
    corners: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7.5V5.4A1.4 1.4 0 0 1 5.4 4h2.1"/><path d="M12.5 4h2.1A1.4 1.4 0 0 1 16 5.4v2.1"/><path d="M16 12.5v2.1a1.4 1.4 0 0 1-1.4 1.4h-2.1"/><path d="M7.5 16H5.4A1.4 1.4 0 0 1 4 14.6v-2.1"/></svg>',
    eyedropper: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5.4 2.6 2.6"/><path d="m14.6 3.2 2.2 2.2-8 8-3.2.8.8-3.2 8.2-7.8Z" fill="currentColor" fill-opacity="0.14"/></svg>',
    copy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="7.5" width="9" height="9" rx="1.8" fill="currentColor" fill-opacity="0.14"/><path d="M4.5 12.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h7A1.5 1.5 0 0 1 12.5 4v.5"/></svg>',
    trash: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.8 5.5h12.4"/><path d="M8 3.2h4"/><path d="M5.5 5.5v9.8a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V5.5" fill="currentColor" fill-opacity="0.12"/></svg>',
    up: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.2 12-4.2-4.2L5.8 12"/></svg>',
    down: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5.8 8 4.2 4.2L14.2 8"/></svg>',
    compDiamond: '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 1.3 10.7 6 6 10.7 1.3 6 6 1.3Z" fill="currentColor" fill-opacity="0.24"/></svg>',
    frameBracket: '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"><path d="M2 4.5V2.3h2.2"/><path d="M7.8 2.3H10v2.2"/><path d="M10 7.5v2.2H7.8"/><path d="M4.2 9.7H2V7.5"/></svg>',
  };

  // --- Live Optimistic Tailwind CSS Preview Engine ---
  let liveStyleEl = document.getElementById('flimsy-live-preview');
  if (!liveStyleEl) {
    liveStyleEl = document.createElement('style');
    liveStyleEl.id = 'flimsy-live-preview';
    document.head.appendChild(liveStyleEl);
  }
  const injectedPreviewClasses = new Set();

  const TW_SPACING = {
    '0': '0px', 'px': '1px', '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
    '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem', '3.5': '0.875rem', '4': '1rem',
    '5': '1.25rem', '6': '1.5rem', '7': '1.75rem', '8': '2rem', '9': '2.25rem',
    '10': '2.5rem', '11': '2.75rem', '12': '3rem', '14': '3.5rem', '16': '4rem',
    '20': '5rem', '24': '6rem', '28': '7rem', '32': '8rem', '36': '9rem', '40': '10rem',
    '44': '11rem', '48': '12rem', '52': '13rem', '56': '14rem', '60': '15rem', '64': '16rem',
    '72': '18rem', '80': '20rem', '96': '24rem',
  };

  const TW_FONT_SIZE = {
    xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem',
    '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem',
    '6xl': '3.75rem', '7xl': '4.5rem', '8xl': '6rem', '9xl': '8rem',
  };

  const TW_FONT_WEIGHT = {
    thin: '100', extralight: '200', light: '300', normal: '400', medium: '500',
    semibold: '600', bold: '700', extrabold: '800', black: '900',
  };

  const TW_LEADING = {
    none: '1', tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625', loose: '2',
  };

  const TW_TRACKING = {
    tighter: '-0.05em', tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em', widest: '0.1em',
  };

  const TW_RADIUS = {
    none: '0px', sm: '0.125rem', '': '0.25rem', md: '0.375rem', lg: '0.5rem',
    xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem', full: '9999px',
  };

  const TW_SHADOW = {
    none: 'none',
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    '': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.25)',
  };

  const TW_BLUR = {
    none: '0px', sm: '4px', '': '8px', md: '12px', lg: '16px', xl: '24px',
  };

  function hexAlphaToCss(rawColor, alphaStr) {
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

  function resolveTwLength(val) {
    if (!val) return null;
    if (val.startsWith('[') && val.endsWith(']')) return val.slice(1, -1);
    if (val === 'full') return '100%';
    if (val === 'fit') return 'fit-content';
    if (val === 'auto') return 'auto';
    if (val === 'screen') return '100vw';
    if (TW_SPACING[val]) return TW_SPACING[val];
    return null;
  }

  function buildPreviewRule(cls) {
    if (!cls || cls.includes(':')) return null;

    // Length-based arbitrary utilities MUST be checked before generic color brackets (e.g. text-[52px], border-[3px])
    let m = cls.match(/^text-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]$/);
    if (m) return 'font-size: ' + m[1] + '; line-height: 1.15;';
    m = cls.match(/^text-(xs|sm|base|lg|xl|[2-9]xl)$/);
    if (m && TW_FONT_SIZE[m[1]]) return 'font-size: ' + TW_FONT_SIZE[m[1]] + ';';
    m = cls.match(/^border-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]$/);
    if (m) return 'border-width: ' + m[1] + '; border-style: solid;';

    m = cls.match(/^(bg|text|border)-\\[([^\\]]+)\\](?:\\/(\\d+))?$/);
    if (m && !/^\\d/.test(m[2])) {
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
    m = cls.match(/^font-\\['?([^\\]']+)'?\\]$/);
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
    m = cls.match(/^border-(\\d+)$/);
    if (m) return 'border-width: ' + m[1] + 'px;';
    m = cls.match(/^border-\\[([^\\]]+)\\]$/);
    if (m && /^\\d/.test(m[1])) return 'border-width: ' + m[1] + ';';
    m = cls.match(/^border-([trbl])(?:-(\\d+|\\[[^\\]]+\\]))?$/);
    if (m) {
      const sideMap = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
      const wVal = !m[2] ? '1px' : (m[2].startsWith('[') ? m[2].slice(1, -1) : m[2] + 'px');
      return 'border-' + sideMap[m[1]] + '-width: ' + wVal + '; border-' + sideMap[m[1]] + '-style: solid;';
    }

    m = cls.match(/^opacity-(\\d+)$/);
    if (m) return 'opacity: ' + (parseInt(m[1], 10) / 100) + ';';
    m = cls.match(/^opacity-\\[([^\\]]+)\\]$/);
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

    m = cls.match(/^(-)?rotate-(?:\\[([^\\]]+)\\]|(\\d+))$/);
    if (m) {
      const neg = m[1] ? '-' : '';
      const deg = m[2] ? m[2] : (neg + m[3] + 'deg');
      return '--flimsy-rot: ' + deg + '; transform: translate(var(--flimsy-tx, 0px), var(--flimsy-ty, 0px)) rotate(var(--flimsy-rot, 0deg));';
    }
    m = cls.match(/^(-)?translate-(x|y)-\\[([^\\]]+)\\]$/);
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

  function ensurePreviewRulesForClasses(classesStr) {
    if (!classesStr) return;
    const tokens = classesStr.split(/\\s+/).filter(Boolean);
    let newCss = '';
    for (const cls of tokens) {
      if (injectedPreviewClasses.has(cls)) continue;
      const body = buildPreviewRule(cls);
      if (body) {
        injectedPreviewClasses.add(cls);
        newCss += '[data-flimsy-file].' + CSS.escape(cls) + ' { ' + body + ' }\\n';
      }
    }
    if (newCss) {
      liveStyleEl.textContent += newCss;
    }
  }

  // --- Helpers for Typing Focus Guard (Document + Shadow DOM) ---
  function isTypingInField(e) {
    const path = e && typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (node && node.nodeType === 1) {
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable) {
          return true;
        }
      }
    }
    const activeDoc = document.activeElement;
    if (activeDoc && (activeDoc.tagName === 'INPUT' || activeDoc.tagName === 'TEXTAREA' || activeDoc.tagName === 'SELECT' || activeDoc.isContentEditable)) {
      return true;
    }
    const activeShadow = shadow && shadow.activeElement;
    if (activeShadow && (activeShadow.tagName === 'INPUT' || activeShadow.tagName === 'TEXTAREA' || activeShadow.tagName === 'SELECT' || activeShadow.isContentEditable)) {
      return true;
    }
    return false;
  }

  function getOrInitTargetState(el) {
    let st = targetStates.get(el);
    if (!st) {
      const curClasses = el.className || '';
      const curText = el.innerText ? el.innerText.trim() : '';
      st = {
        originalClasses: curClasses,
        originalText: curText,
        pendingClasses: curClasses,
        pendingText: null,
        fileMtime: 0,
      };
      targetStates.set(el, st);
    }
    return st;
  }

  function hasAnyUnsavedChanges() {
    for (const el of selectedTargets) {
      const st = targetStates.get(el);
      if (!st) continue;
      if (st.pendingClasses !== st.originalClasses || (st.pendingText !== null && st.pendingText !== st.originalText)) {
        return true;
      }
    }
    return (pendingClasses !== originalClasses) || (pendingText !== null && pendingText !== originalText);
  }

  function pushHistory() {
    if (selectedTargets.length === 0) return;
    if (historyIdx < history.length - 1) {
      history = history.slice(0, historyIdx + 1);
    }
    const snapshot = selectedTargets.map((el) => {
      const st = getOrInitTargetState(el);
      return { el, classes: st.pendingClasses, text: st.pendingText };
    });
    history.push(snapshot);
    historyIdx = history.length - 1;
    updateUndoRedoUI();
    renderDiff();
    updateSyncBadge();
  }

  function undo() {
    if (historyIdx > 0 && selectedTarget) {
      historyIdx--;
      applyHistorySnapshot(history[historyIdx]);
    }
  }

  function redo() {
    if (historyIdx < history.length - 1 && selectedTarget) {
      historyIdx++;
      applyHistorySnapshot(history[historyIdx]);
    }
  }

  function applyHistorySnapshot(snapshot) {
    if (!Array.isArray(snapshot) || !selectedTarget) return;
    snapshot.forEach((entry) => {
      const st = getOrInitTargetState(entry.el);
      st.pendingClasses = entry.classes;
      st.pendingText = entry.text;
      ensurePreviewRulesForClasses(st.pendingClasses);
      entry.el.className = st.pendingClasses;
      if (entry.text !== null) {
        entry.el.innerText = entry.text;
      } else if (entry.el === selectedTarget && st.originalText !== entry.el.innerText.trim()) {
        entry.el.innerText = st.originalText;
      }
    });
    const primary = getOrInitTargetState(selectedTarget);
    pendingClasses = primary.pendingClasses;
    pendingText = primary.pendingText;
    textInput.value = pendingText !== null ? pendingText : originalText;
    classesRawInput.value = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateAllSelectionBoxes();
    updateUndoRedoUI();
    renderDiff();
    updateSyncBadge();
  }

  // --- Isolated Shadow DOM Root ---
  const container = document.createElement('div');
  container.id = 'flimsy-root';
  container.style.cssText = 'position:fixed; z-index:2147483647; pointer-events:none; top:0; left:0; width:100%; height:100%;';
  const shadow = container.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(container);

  // --- Editorial Monochrome White Glass Styling (Direction 04 + Shadcn Zinc Tokens) ---
  const style = document.createElement('style');
  style.textContent = \`
    * {
      box-sizing: border-box;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
    }

    :host {
      --panel-bg: rgba(255, 255, 255, 0.94);
      --dock-bg: rgba(255, 255, 255, 0.86);
      --modal-bg: rgba(255, 255, 255, 0.96);
      --well-bg: #f4f4f5;
      --well-hover: #e4e4e7;
      --input-bg: #fafafa;
      --border-panel: rgba(9, 9, 11, 0.09);
      --border-input: #e4e4e7;
      --hairline: #f1f5f9;
      --ink-primary: #09090b;
      --ink-secondary: #52525b;
      --ink-muted: #a1a1aa;
      --active-bg: #09090b;
      --active-ink: #ffffff;
      --figma-blue: #0ea5e9;
      --comp-purple: #7c3aed;
      --comp-soft: rgba(124, 58, 237, 0.10);
      --figma-red: #f43f5e;
      --glass-shadow: 0 22px 54px -12px rgba(0, 0, 0, 0.34), 0 0 0 0.5px rgba(9, 9, 11, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.92);
    }

    .no-scroll {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .no-scroll::-webkit-scrollbar { display: none; }

    /* Bottom-Center Floating Frosted White Pill Dock */
    .bottom-dock {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--dock-bg);
      backdrop-filter: blur(26px) saturate(180%);
      -webkit-backdrop-filter: blur(26px) saturate(180%);
      border: 1px solid var(--border-panel);
      box-shadow: var(--glass-shadow);
      padding: 5px 6px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 3px;
      pointer-events: auto;
      user-select: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 2100;
    }

    .dock-tool {
      position: relative;
      background: transparent;
      border: none;
      color: var(--ink-secondary);
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .dock-tool svg { width: 16px; height: 16px; }
    .dock-tool:hover:not(:disabled) {
      background: var(--well-bg);
      color: var(--ink-primary);
    }
    .dock-tool.active {
      background: var(--active-bg);
      color: var(--active-ink);
      box-shadow: 0 2px 8px rgba(9, 9, 11, 0.22);
    }
    .dock-tool.subtle-active {
      background: var(--well-bg);
      color: var(--ink-primary);
    }
    .dock-tool:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .dock-tool.brand-mark {
      cursor: default;
      width: 30px;
      height: 30px;
    }
    .dock-tool.brand-mark:hover { background: transparent; }
    .dock-tool.brand-mark svg { width: 19px; height: 19px; }

    .dock-tool[data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);
      background: #09090b;
      color: #ffffff;
      font-size: 10px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
      z-index: 50;
    }

    .dock-divider {
      width: 1px;
      height: 16px;
      background: var(--border-input);
      margin: 0 3px;
    }
    .dock-extra {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .sync-status-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: 9999px;
      background: var(--well-bg);
      color: var(--ink-secondary);
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.16s ease;
    }
    .sync-status-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #16a34a;
    }
    .sync-status-badge.dirty {
      background: #09090b;
      color: #ffffff;
    }
    .sync-status-badge.dirty .dot {
      background: #f59e0b;
      box-shadow: 0 0 6px #f59e0b;
    }
    .sync-status-badge.synced {
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
    }
    .sync-status-badge.synced .dot { background: #16a34a; }

    /* Hover, Multi-Select, Marquee, Alt Measurement Overlays */
    .hover-outline {
      position: fixed;
      border: 1px solid rgba(14, 165, 233, 0.72);
      background: rgba(14, 165, 233, 0.04);
      pointer-events: none;
      display: none;
      z-index: 995;
      border-radius: 2px;
      transition: top 0.05s ease-out, left 0.05s ease-out, width 0.05s ease-out, height 0.05s ease-out;
    }
    .multi-box {
      position: fixed;
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.07);
      pointer-events: none;
      z-index: 998;
      border-radius: 2px;
    }
    .marquee-box {
      position: fixed;
      border: 1px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.12);
      pointer-events: none;
      display: none;
      z-index: 1050;
      border-radius: 2px;
    }
    .measure-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1060;
      display: none;
    }
    .canvas-drop-guide {
      position: fixed;
      pointer-events: none;
      display: none;
      z-index: 1070;
      border-radius: 3px;
    }
    .canvas-drop-guide.mode-inside {
      border: 2px dashed var(--figma-blue);
      background: rgba(14, 165, 233, 0.12);
    }
    .canvas-drop-guide.mode-line {
      background: var(--figma-blue);
      box-shadow: 0 0 8px rgba(14, 165, 233, 0.55);
    }
    .zoom-pill {
      font-size: 10px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 4px 7px;
      border-radius: 9999px;
      border: none;
      background: transparent;
      color: var(--ink-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, color 0.12s;
    }
    .zoom-pill:hover {
      background: var(--well-bg);
      color: var(--ink-primary);
    }
    .measure-line {
      position: fixed;
      background: var(--figma-red);
      pointer-events: none;
    }
    .measure-line.dashed { background: transparent; }
    .measure-pill {
      position: fixed;
      background: var(--figma-red);
      color: #ffffff;
      font-size: 9.5px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 1px 5px;
      border-radius: 4px;
      transform: translate(-50%, -50%);
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(244, 63, 94, 0.32);
    }

    /* Highlight Bounding Box + 8 Handles + Rotation Knob */
    .box-highlight {
      position: fixed;
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.06);
      pointer-events: none;
      display: none;
      z-index: 1000;
      border-radius: 2px;
    }
    .box-highlight.selected {
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.08);
    }
    .handle {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #ffffff;
      border: 1.5px solid var(--figma-blue);
      border-radius: 1.5px;
      pointer-events: auto;
      display: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      z-index: 1001;
      transition: transform 0.1s ease;
    }
    .handle:hover { transform: scale(1.25); }
    .box-highlight.selected .handle { display: block; }
    .handle-tl { top: -4px; left: -4px; cursor: nwse-resize; }
    .handle-tc { top: -4px; left: calc(50% - 4px); cursor: ns-resize; }
    .handle-tr { top: -4px; right: -4px; cursor: nesw-resize; }
    .handle-ml { top: calc(50% - 4px); left: -4px; cursor: ew-resize; }
    .handle-mr { top: calc(50% - 4px); right: -4px; cursor: ew-resize; }
    .handle-bl { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .handle-bc { bottom: -4px; left: calc(50% - 4px); cursor: ns-resize; }
    .handle-br { bottom: -4px; right: -4px; cursor: nwse-resize; }

    .handle-rotate-stem {
      position: absolute;
      top: -19px;
      left: 50%;
      width: 1px;
      height: 15px;
      background: var(--figma-blue);
      transform: translateX(-50%);
      display: none;
      pointer-events: none;
    }
    .handle-rotate {
      position: absolute;
      top: -27px;
      left: 50%;
      width: 10px;
      height: 10px;
      transform: translateX(-50%);
      background: #ffffff;
      border: 1.5px solid var(--figma-blue);
      border-radius: 50%;
      cursor: grab;
      pointer-events: auto;
      display: none;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
      z-index: 1002;
    }
    .handle-rotate:active { cursor: grabbing; background: var(--figma-blue); }
    .box-highlight.selected .handle-rotate,
    .box-highlight.selected .handle-rotate-stem { display: block; }

    .box-tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      color: var(--ink-primary);
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      white-space: nowrap;
      border: 1px solid var(--border-input);
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
      pointer-events: none;
    }
    .box-tooltip .tag-name { color: #09090b; font-family: ui-monospace, SFMono-Regular, monospace; }
    .box-tooltip .loc { color: var(--ink-muted); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 9.5px; }

    .dim-pill {
      position: absolute;
      top: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--figma-blue);
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
      box-shadow: 0 3px 10px rgba(14, 165, 233, 0.28);
      pointer-events: none;
    }

    /* Shared Editorial Frosted Snow-White Card */
    .glass-card {
      background: var(--panel-bg);
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
      border: 1px solid var(--border-panel);
      border-radius: 14px;
      box-shadow: var(--glass-shadow);
      color: var(--ink-primary);
      pointer-events: auto;
      animation: floatIn 0.14s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes floatIn {
      from { opacity: 0; transform: translateY(3px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Left Floating Layers Tree */
    .layers-panel {
      position: fixed;
      top: 16px;
      left: 16px;
      width: 242px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
      padding: 11px;
      display: none;
      flex-direction: column;
      gap: 6px;
      z-index: 2000;
    }
    .layers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1px 4px 8px;
      border-bottom: 1px solid var(--hairline);
      font-size: 11.5px;
      font-weight: 600;
      color: var(--ink-primary);
      letter-spacing: -0.01em;
    }
    .layers-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .trail {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .trail-item {
      padding: 4px 6px;
      border-radius: 7px;
      font-size: 11px;
      color: var(--ink-secondary);
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      transition: background 0.1s ease, color 0.1s ease;
      user-select: none;
      border: 1.5px solid transparent;
    }
    .trail-item:hover {
      background: var(--well-bg);
      color: var(--ink-primary);
    }
    .trail-item.active {
      background: #09090b;
      color: #ffffff;
      font-weight: 500;
    }
    .trail-item.is-component { color: var(--comp-purple); }
    .trail-item.is-component.active {
      background: var(--comp-soft);
      color: #5b21b6;
      font-weight: 600;
    }
    .trail-item.active .caret-btn { color: rgba(255, 255, 255, 0.72); }
    .trail-item.is-component.active .caret-btn { color: var(--comp-purple); }
    .trail-item.active .trail-btn { color: rgba(255, 255, 255, 0.75); }
    .trail-item.active .trail-btn:hover { background: rgba(255, 255, 255, 0.16); color: #ffffff; }
    .trail-item.is-component.active .trail-btn { color: var(--comp-purple); }

    .trail-item.drop-before { border-top: 2px solid var(--figma-blue); }
    .trail-item.drop-after { border-bottom: 2px solid var(--figma-blue); }
    .trail-item.drop-inside {
      border: 1.5px dashed var(--figma-blue);
      background: rgba(14, 165, 233, 0.10);
    }
    .caret-btn {
      width: 14px;
      height: 14px;
      border: none;
      background: transparent;
      color: var(--ink-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      border-radius: 3px;
      padding: 0;
      transition: transform 0.12s ease;
    }
    .caret-btn svg { width: 10px; height: 10px; }
    .caret-btn:hover { background: rgba(9, 9, 11, 0.06); color: var(--ink-primary); }
    .caret-btn.collapsed svg { transform: rotate(-90deg); }
    .caret-spacer { width: 14px; height: 14px; flex-shrink: 0; }
    .trail-title {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .type-icon {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .type-icon.text-icon { background: rgba(14, 165, 233, 0.12); color: #0284c7; }
    .type-icon.frame-icon { background: var(--well-bg); color: var(--ink-secondary); }
    .type-icon.comp-icon { background: var(--comp-soft); color: var(--comp-purple); }
    .trail-item.active:not(.is-component) .type-icon {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }
    .node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .node-tag-dim {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 9.5px;
      opacity: 0.55;
      margin-left: 2px;
    }
    .trail-actions {
      display: none;
      align-items: center;
      gap: 1px;
    }
    .trail-item:hover .trail-actions,
    .trail-item.active .trail-actions { display: flex; }
    .trail-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      cursor: pointer;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .trail-btn svg { width: 10px; height: 10px; }
    .trail-btn:hover { background: var(--well-hover); color: var(--ink-primary); }

    /* Right Floating Streamlined Inspector Card */
    .studio-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 288px;
      max-height: calc(100vh - 92px);
      overflow-y: auto;
      padding: 13px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 2000;
    }

    .studio-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 9px;
      border-bottom: 1px solid var(--hairline);
      gap: 6px;
    }
    .studio-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .studio-tag-badge {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-primary);
      background: var(--well-bg);
      padding: 2px 7px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .studio-tag-badge.is-comp {
      background: var(--comp-soft);
      color: var(--comp-purple);
    }
    .studio-loc-badge {
      font-size: 10px;
      color: var(--ink-muted);
      font-family: ui-monospace, SFMono-Regular, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .instance-badge {
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 9999px;
      background: var(--well-bg);
      color: var(--ink-secondary);
      display: none;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      cursor: pointer;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.12s, color 0.12s;
    }
    .icon-btn svg { width: 13px; height: 13px; }
    .icon-btn:hover:not(:disabled) {
      background: var(--well-bg);
      color: var(--ink-primary);
    }

    .prop-section {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--hairline);
    }
    .prop-section.no-divider {
      border-bottom: none;
      padding-bottom: 0;
    }
    .prop-row-inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .prop-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-primary);
      letter-spacing: -0.01em;
      flex-shrink: 0;
    }
    .prop-sub {
      font-size: 10px;
      font-weight: 500;
      color: var(--ink-muted);
    }

    /* Compact 2-column Shadcn Field Grid */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .field-box {
      height: 29px;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 7px;
      padding: 0 7px;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: border-color 0.12s, background 0.12s;
    }
    .field-box:focus-within {
      border-color: #09090b;
      background: #ffffff;
    }
    .field-k {
      font-size: 9.5px;
      font-weight: 600;
      color: var(--ink-muted);
      flex-shrink: 0;
      user-select: none;
    }
    .field-input {
      width: 100%;
      min-width: 0;
      border: none;
      background: transparent;
      outline: none;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      font-weight: 500;
      color: var(--ink-primary);
      text-align: right;
    }
    .field-select {
      width: 100%;
      min-width: 0;
      height: 29px;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 7px;
      padding: 0 7px;
      font-size: 11px;
      font-weight: 500;
      color: var(--ink-primary);
      outline: none;
      cursor: pointer;
    }
    .field-select:focus {
      border-color: #09090b;
      background: #ffffff;
    }
    .mini-toggle-btn {
      width: 19px;
      height: 19px;
      border-radius: 5px;
      border: none;
      background: transparent;
      color: var(--ink-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.12s;
    }
    .mini-toggle-btn svg { width: 11px; height: 11px; }
    .mini-toggle-btn:hover { background: var(--well-hover); color: var(--ink-primary); }
    .mini-toggle-btn.active { background: var(--active-bg); color: var(--active-ink); }

    /* Monochrome Segmented Pills */
    .segmented {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      background: var(--well-bg);
      border-radius: 7px;
      padding: 2px;
      gap: 2px;
    }
    .seg-btn {
      background: transparent;
      border: none;
      color: var(--ink-secondary);
      font-size: 10px;
      font-weight: 500;
      height: 23px;
      border-radius: 5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s;
    }
    .seg-btn svg { width: 12px; height: 12px; }
    .seg-btn:hover { color: var(--ink-primary); }
    .seg-btn.active {
      background: var(--active-bg);
      color: var(--active-ink);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
    }

    /* Compact Range Slider (Obsidian Ink) */
    .mini-slider {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      height: 4px;
      border-radius: 9999px;
      background: var(--well-hover);
      outline: none;
      cursor: pointer;
    }
    .mini-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #09090b;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      cursor: pointer;
    }

    /* 3x3 Alignment Matrix */
    .align-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      width: 62px;
      height: 62px;
      background: var(--well-bg);
      border-radius: 8px;
      padding: 4px;
      gap: 3px;
      flex-shrink: 0;
    }
    .align-cell {
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s;
    }
    .align-cell::after {
      content: '';
      width: 4px;
      height: 4px;
      background: var(--ink-muted);
      border-radius: 50%;
      opacity: 0.6;
    }
    .align-cell:hover::after { background: var(--ink-primary); opacity: 0.9; }
    .align-cell.active { background: var(--active-bg); }
    .align-cell.active::after { background: #ffffff; opacity: 1; }

    .side-box-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      align-items: center;
    }
    .side-input-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: center;
    }
    .side-tag {
      font-size: 8.5px;
      color: var(--ink-muted);
      font-weight: 600;
    }
    .side-input {
      width: 100%;
      text-align: center;
      padding: 3px 2px;
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 6px;
      outline: none;
      color: var(--ink-primary);
    }
    .side-input:focus { border-color: #09090b; background: #ffffff; }

    /* Accordion Headers (Stroke & Border, Effects) */
    .accordion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      padding: 1px 0;
    }
    .accordion-plus {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      border: none;
      background: var(--well-bg);
      color: var(--ink-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.12s;
    }
    .accordion-plus svg { width: 11px; height: 11px; }
    .accordion-header:hover .accordion-plus { background: var(--well-hover); color: var(--ink-primary); }
    .accordion-body {
      display: none;
      flex-direction: column;
      gap: 6px;
      padding-top: 2px;
    }
    .accordion-body.open { display: flex; }

    /* Color Trigger Row */
    .color-preview-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 8px;
      padding: 5px 8px 5px 5px;
      cursor: pointer;
      width: 100%;
      transition: border-color 0.12s;
    }
    .color-preview-trigger:hover { border-color: #a1a1aa; }
    .color-preview-thumb {
      width: 19px;
      height: 19px;
      border-radius: 5px;
      border: 1px solid rgba(9, 9, 11, 0.14);
      background: #1e293b;
      flex-shrink: 0;
    }
    .color-preview-hex {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      font-weight: 500;
      color: var(--ink-primary);
      flex: 1;
    }

    /* Floating 2D Spectrum Color Picker Modal */
    .figma-color-modal {
      position: fixed;
      top: 56px;
      right: 314px;
      width: 244px;
      background: var(--modal-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--border-panel);
      border-radius: 14px;
      box-shadow: var(--glass-shadow);
      padding: 11px;
      display: none;
      flex-direction: column;
      gap: 9px;
      z-index: 2500;
      pointer-events: auto;
    }
    .color-canvas-wrap {
      position: relative;
      width: 100%;
      height: 130px;
      border-radius: 8px;
      overflow: hidden;
      cursor: crosshair;
    }
    .color-canvas { width: 100%; height: 100%; display: block; }
    .canvas-thumb {
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.45);
      transform: translate(-50%, -50%);
      pointer-events: none;
      left: 50%;
      top: 50%;
    }
    .hue-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 11px;
      border-radius: 6px;
      background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
      outline: none;
      cursor: pointer;
    }
    .hue-slider::-webkit-slider-thumb,
    .alpha-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #ffffff;
      border: 1.5px solid rgba(9, 9, 11, 0.35);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
      cursor: pointer;
    }
    .alpha-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 11px;
      border-radius: 6px;
      background: linear-gradient(to right, transparent, #09090b), repeating-conic-gradient(#d4d4d8 0% 25%, #fff 0% 50%) 50% / 8px 8px;
      outline: none;
      cursor: pointer;
    }
    .doc-colors-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
      max-height: 48px;
      overflow-y: auto;
    }
    .doc-chip {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid rgba(9, 9, 11, 0.14);
      cursor: pointer;
      transition: transform 0.12s;
    }
    .doc-chip:hover { transform: scale(1.15); }

    /* Searchable Typography Font Modal */
    .font-select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 29px;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 7px;
      padding: 0 9px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      color: var(--ink-primary);
      width: 100%;
      transition: border-color 0.12s;
    }
    .font-select-trigger:hover { border-color: #a1a1aa; }
    .font-modal {
      position: fixed;
      top: 148px;
      right: 314px;
      width: 220px;
      background: var(--modal-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--border-panel);
      border-radius: 14px;
      box-shadow: var(--glass-shadow);
      padding: 9px;
      display: none;
      flex-direction: column;
      gap: 6px;
      max-height: 268px;
      z-index: 2500;
      pointer-events: auto;
    }
    .font-list-scroll {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
      max-height: 200px;
    }
    .font-row {
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--ink-primary);
      transition: background 0.1s;
    }
    .font-row:hover { background: var(--well-bg); }
    .font-row.active {
      background: var(--active-bg);
      color: var(--active-ink);
      font-weight: 500;
    }

    .clean-input {
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 7px;
      padding: 5px 8px;
      color: var(--ink-primary);
      font-size: 11px;
      outline: none;
      width: 100%;
      transition: border-color 0.12s, background 0.12s;
    }
    .clean-input:focus {
      border-color: #09090b;
      background: #ffffff;
    }

    .drawer-pills {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .pill-toggle {
      background: var(--well-bg);
      border: 1px solid transparent;
      color: var(--ink-secondary);
      font-size: 10px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 7px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.12s;
    }
    .pill-toggle svg { width: 11px; height: 11px; }
    .pill-toggle:hover { color: var(--ink-primary); background: var(--well-hover); }
    .pill-toggle.active {
      background: var(--active-bg);
      color: var(--active-ink);
    }

    .ai-drawer {
      display: none;
      flex-direction: column;
      gap: 6px;
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      padding: 8px;
      border-radius: 9px;
    }
    .ai-chip {
      background: #ffffff;
      border: 1px solid var(--border-input);
      color: var(--ink-secondary);
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ai-chip:hover {
      background: #09090b;
      color: #ffffff;
      border-color: #09090b;
    }

    .diff-container {
      background: var(--input-bg);
      border: 1px solid var(--border-input);
      border-radius: 8px;
      padding: 6px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 10px;
      display: none;
      flex-direction: column;
      gap: 3px;
      max-height: 84px;
      overflow-y: auto;
    }
    .diff-del {
      color: #991b1b;
      background: rgba(220, 38, 38, 0.08);
      padding: 2px 5px;
      border-radius: 4px;
      word-break: break-all;
    }
    .diff-add {
      color: #166534;
      background: rgba(22, 163, 74, 0.10);
      padding: 2px 5px;
      border-radius: 4px;
      word-break: break-all;
    }

    .action-btn {
      background: #09090b;
      color: #ffffff;
      border: none;
      border-radius: 7px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: opacity 0.14s;
    }
    .action-btn:hover { opacity: 0.88; }

    .sync-row {
      display: flex;
      gap: 6px;
      align-items: center;
      padding-top: 2px;
    }
    .sync-btn {
      flex: 1;
      background: var(--well-bg);
      color: var(--ink-secondary);
      border: 1px solid transparent;
      border-radius: 9px;
      height: 32px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.14s;
    }
    .sync-btn.dirty {
      background: #09090b;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(9, 9, 11, 0.22);
    }
    .sync-btn.dirty:hover { background: #18181b; }
    .sync-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .discard-btn {
      background: var(--well-bg);
      color: var(--ink-secondary);
      border: none;
      border-radius: 9px;
      height: 32px;
      padding: 0 11px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s;
    }
    .discard-btn:hover {
      background: var(--well-hover);
      color: var(--ink-primary);
    }
    .sync-status {
      font-size: 10px;
      color: #15803d;
      text-align: center;
      display: none;
      font-weight: 500;
    }
  \`;
  shadow.appendChild(style);

  // --- Overlay Layers ---
  const hoverOutline = document.createElement('div');
  hoverOutline.className = 'hover-outline';
  shadow.appendChild(hoverOutline);

  const multiBoxesLayer = document.createElement('div');
  multiBoxesLayer.id = 'flimsy-multi-boxes';
  shadow.appendChild(multiBoxesLayer);

  const marqueeBox = document.createElement('div');
  marqueeBox.className = 'marquee-box';
  shadow.appendChild(marqueeBox);

  const measureLayer = document.createElement('div');
  measureLayer.className = 'measure-layer';
  measureLayer.id = 'flimsy-measure-layer';
  shadow.appendChild(measureLayer);

  const canvasDropGuide = document.createElement('div');
  canvasDropGuide.className = 'canvas-drop-guide';
  canvasDropGuide.id = 'flimsy-canvas-drop-guide';
  shadow.appendChild(canvasDropGuide);

  // --- Bottom-Center Floating Glass Pill Dock ---
  const dock = document.createElement('div');
  dock.className = 'bottom-dock';
  dock.innerHTML = \`
    <button class="dock-tool dock-btn" data-tip="Select (V / Alt+X)" aria-label="Toggle Inspect">\${ICONS.cursor}</button>
    <div class="dock-extra" id="flimsy-dock-extra" style="display:none;">
      <button class="dock-tool" id="flimsy-hand-tool" data-tip="Hand Pan (H / Space)" aria-label="Pan Canvas">\${ICONS.hand}</button>
      <button class="dock-tool" id="flimsy-text-tool" data-tip="Edit Text" aria-label="Edit Text">\${ICONS.text}</button>
      <button class="dock-tool subtle-active" id="flimsy-layers-toggle" data-tip="Layers" aria-label="Toggle Layers">\${ICONS.layers}</button>
      <button class="dock-tool subtle-active" id="flimsy-snap-toggle" data-tip="Snap to Scale (Ctrl bypass)" aria-label="Toggle Tailwind Snap">\${ICONS.snap}</button>
      <div class="dock-divider"></div>
      <button class="dock-tool" id="flimsy-undo-btn" data-tip="Undo (Ctrl+Z)" aria-label="Undo" disabled>\${ICONS.undo}</button>
      <button class="dock-tool" id="flimsy-redo-btn" data-tip="Redo (Ctrl+Y)" aria-label="Redo" disabled>\${ICONS.redo}</button>
      <button class="dock-tool" id="flimsy-dock-ai-btn" data-tip="AI Assist" aria-label="AI Assist">\${ICONS.ai}</button>
      <div class="dock-divider"></div>
      <button class="zoom-pill" id="flimsy-zoom-pill" title="Zoom (Ctrl+Scroll, Ctrl+0 to reset)">100%</button>
    </div>
    <div class="dock-divider"></div>
    <div class="sync-status-badge" id="flimsy-dock-sync-status" title="Press Shift+S to sync changes to code">
      <span class="dot"></span>
      <span class="text">In sync</span>
    </div>
    <span class="dock-tool brand-mark" data-tip="Flimsy">\${ICONS.brand}</span>
  \`;
  shadow.appendChild(dock);

  const dockBtn = dock.querySelector('.dock-btn');
  const dockExtra = dock.querySelector('#flimsy-dock-extra');
  const handToolBtn = dock.querySelector('#flimsy-hand-tool');
  const textToolBtn = dock.querySelector('#flimsy-text-tool');
  const layersToggleBtn = dock.querySelector('#flimsy-layers-toggle');
  const snapToggleBtn = dock.querySelector('#flimsy-snap-toggle');
  const undoBtn = dock.querySelector('#flimsy-undo-btn');
  const redoBtn = dock.querySelector('#flimsy-redo-btn');
  const dockAiBtn = dock.querySelector('#flimsy-dock-ai-btn');
  const zoomPillBtn = dock.querySelector('#flimsy-zoom-pill');
  const dockSyncBadge = dock.querySelector('#flimsy-dock-sync-status');

  // --- Highlight Box with 8 Grab Handles + Rotation Knob ---
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = \`
    <div class="handle-rotate-stem"></div>
    <div class="handle-rotate" id="flimsy-rotate-handle" title="Drag to rotate (Shift for 15 deg)"></div>
    <div class="handle handle-tl" data-handle="tl"></div>
    <div class="handle handle-tc" data-handle="tc"></div>
    <div class="handle handle-tr" data-handle="tr"></div>
    <div class="handle handle-ml" data-handle="ml"></div>
    <div class="handle handle-mr" data-handle="mr"></div>
    <div class="handle handle-bl" data-handle="bl"></div>
    <div class="handle handle-bc" data-handle="bc"></div>
    <div class="handle handle-br" data-handle="br"></div>
    <div class="box-tooltip">
      <span class="tag-name"></span>
      <span class="loc"></span>
    </div>
    <div class="dim-pill"></div>
  \`;
  shadow.appendChild(highlightBox);

  const tagNameSpan = highlightBox.querySelector('.tag-name');
  const locSpan = highlightBox.querySelector('.loc');
  const dimPillSpan = highlightBox.querySelector('.dim-pill');
  const rotateHandle = highlightBox.querySelector('#flimsy-rotate-handle');

  // --- Left Floating Layers Tree Panel ---
  const layersPanel = document.createElement('div');
  layersPanel.className = 'glass-card layers-panel no-scroll';
  layersPanel.id = 'flimsy-layers-panel';
  layersPanel.innerHTML = \`
    <div class="layers-header">
      <span>Layers</span>
      <div class="layers-header-actions">
        <button class="icon-btn" id="flimsy-layers-refresh" title="Refresh Tree" aria-label="Refresh Layers">\${ICONS.refresh}</button>
        <button class="icon-btn" id="flimsy-layers-close" title="Hide Layers" aria-label="Hide Layers">\${ICONS.close}</button>
      </div>
    </div>
    <div class="trail" id="flimsy-trail"></div>
  \`;
  shadow.appendChild(layersPanel);

  const trailContainer = layersPanel.querySelector('#flimsy-trail');
  const layersCloseBtn = layersPanel.querySelector('#flimsy-layers-close');
  const layersRefreshBtn = layersPanel.querySelector('#flimsy-layers-refresh');

  // --- Right Floating Streamlined Inspector Card ---
  const panel = document.createElement('div');
  panel.className = 'glass-card studio-panel no-scroll';
  panel.innerHTML = \`
    <div class="studio-header">
      <div class="studio-header-left">
        <span class="studio-tag-badge" id="flimsy-elem-tag">&lt;div&gt;</span>
        <span class="studio-loc-badge" id="flimsy-elem-loc">Hero.tsx:16</span>
        <span class="instance-badge" id="flimsy-instance-badge"></span>
      </div>
      <button class="icon-btn" id="flimsy-close-btn" title="Close (Esc)" aria-label="Close Inspector">\${ICONS.close}</button>
    </div>

    <!-- Inline Text Content -->
    <div class="prop-section" id="flimsy-text-group">
      <div class="field-box" style="padding: 0 8px;">
        <span class="field-k">Text</span>
        <input type="text" id="flimsy-text-input" class="field-input" style="text-align:left; font-family:Inter, sans-serif;" placeholder="Double-click to edit...">
      </div>
    </div>

    <!-- Layout & Dimensions -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Layout</span>
        <div class="segmented" id="seg-flex-dir" style="width: 148px;">
          <button class="seg-btn" data-class="flex" title="Flex">Flex</button>
          <button class="seg-btn" data-class="flex-row" data-auto-flex="1" title="Horizontal">\${ICONS.flowRow}</button>
          <button class="seg-btn" data-class="flex-col" data-auto-flex="1" title="Vertical">\${ICONS.flowCol}</button>
          <button class="seg-btn" data-class="flex-wrap" data-auto-flex="1" title="Wrap">\${ICONS.flowWrap}</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="field-box"><span class="field-k">W</span><input type="text" id="flimsy-width-input" class="field-input" placeholder="auto" title="Width (px, full, fit, auto)"></div>
        <div class="field-box"><span class="field-k">H</span><input type="text" id="flimsy-height-input" class="field-input" placeholder="auto" title="Height (px, full, fit, auto)"></div>
      </div>

      <div style="display:flex; gap:5px; align-items:center;">
        <div class="field-box" style="flex:1;"><span class="field-k">X</span><input type="text" id="flimsy-pos-x-input" class="field-input" placeholder="0px" title="Horizontal offset (drag on canvas)"></div>
        <div class="field-box" style="flex:1;"><span class="field-k">Y</span><input type="text" id="flimsy-pos-y-input" class="field-input" placeholder="0px" title="Vertical offset (drag on canvas)"></div>
        <div class="segmented" id="seg-position" style="width:74px; flex-shrink:0;">
          <button class="seg-btn" data-class="relative" title="Relative flow offset">Rel</button>
          <button class="seg-btn" data-class="absolute" title="Absolute freeform coordinates">Abs</button>
        </div>
      </div>

      <div style="display:flex; gap:8px; align-items:stretch;">
        <div class="align-grid" id="flimsy-align-grid">
          <div class="align-cell" data-align="items-start justify-start" title="Top Left"></div>
          <div class="align-cell" data-align="items-start justify-center" title="Top Center"></div>
          <div class="align-cell" data-align="items-start justify-end" title="Top Right"></div>
          <div class="align-cell" data-align="items-center justify-start" title="Center Left"></div>
          <div class="align-cell" data-align="items-center justify-center" title="Center"></div>
          <div class="align-cell" data-align="items-center justify-end" title="Center Right"></div>
          <div class="align-cell" data-align="items-end justify-start" title="Bottom Left"></div>
          <div class="align-cell" data-align="items-end justify-center" title="Bottom Center"></div>
          <div class="align-cell" data-align="items-end justify-end" title="Bottom Right"></div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; gap:5px; min-width:0;">
          <div class="field-box">
            <span class="field-k">Gap</span>
            <input type="text" id="flimsy-gap-input" class="field-input" placeholder="0px" title="Flex/Grid gap (e.g. 16px or 4)">
          </div>
          <div class="field-box">
            <span class="field-k">Pad</span>
            <input type="text" id="flimsy-pad-input" class="field-input" placeholder="0px" title="Padding (e.g. 24px or 6)">
            <button class="mini-toggle-btn" id="flimsy-pad-link-btn" title="Per-side padding">\${ICONS.sides}</button>
          </div>
        </div>
      </div>

      <div class="side-box-grid" id="flimsy-pad-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">T</span><input type="text" class="side-input" id="pad-top" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">R</span><input type="text" class="side-input" id="pad-right" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">B</span><input type="text" class="side-input" id="pad-bottom" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">L</span><input type="text" class="side-input" id="pad-left" placeholder="0"></div>
      </div>

      <div class="grid-2">
        <div class="segmented" id="seg-justify">
          <button class="seg-btn" data-class="justify-start" data-auto-flex="1" title="Start">S</button>
          <button class="seg-btn" data-class="justify-center" data-auto-flex="1" title="Center">C</button>
          <button class="seg-btn" data-class="justify-between" data-auto-flex="1" title="Between">B</button>
          <button class="seg-btn" data-class="justify-end" data-auto-flex="1" title="End">E</button>
        </div>
        <div class="segmented" id="seg-sizing">
          <button class="seg-btn" data-class="w-fit" title="Hug content">Hug</button>
          <button class="seg-btn" data-class="w-full" title="Fill width">Fill</button>
          <button class="seg-btn" data-class="w-auto" title="Auto">Auto</button>
        </div>
      </div>
    </div>

    <!-- Appearance -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Appearance</span>
        <span class="prop-sub" id="flimsy-opacity-val" style="font-family:ui-monospace,monospace;">100%</span>
      </div>
      <div class="grid-2">
        <div class="field-box">
          <span class="field-k">Rad</span>
          <input type="text" id="flimsy-radius-input" class="field-input" placeholder="0px" title="Corner radius (e.g. 12px, lg, full)">
          <button class="mini-toggle-btn" id="flimsy-radius-link-btn" title="Independent corners">\${ICONS.corners}</button>
        </div>
        <div class="field-box">
          <span class="field-k">Rot</span>
          <input type="text" id="flimsy-rotate-input" class="field-input" placeholder="0deg" title="Rotation in degrees">
        </div>
      </div>
      <div class="side-box-grid" id="flimsy-radius-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">TL</span><input type="text" class="side-input" id="rad-tl" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">TR</span><input type="text" class="side-input" id="rad-tr" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BR</span><input type="text" class="side-input" id="rad-br" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BL</span><input type="text" class="side-input" id="rad-bl" placeholder="0"></div>
      </div>
      <div class="prop-row-inline" style="gap:8px;">
        <span class="prop-sub" style="width:42px;">Opacity</span>
        <input type="range" min="0" max="100" step="5" value="100" class="mini-slider" id="flimsy-opacity-slider" aria-label="Opacity">
      </div>
    </div>

    <!-- Fill -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Fill</span>
        <div class="segmented" id="seg-color-target" style="width: 132px;">
          <button class="seg-btn active" id="flimsy-target-fill">Fill</button>
          <button class="seg-btn" id="flimsy-target-text">Text</button>
          <button class="seg-btn" id="flimsy-target-stroke">Stroke</button>
        </div>
      </div>
      <div class="color-preview-trigger" id="flimsy-color-trigger" title="Open 2D Color Spectrum">
        <div class="color-preview-thumb" id="flimsy-color-thumb"></div>
        <span class="color-preview-hex" id="flimsy-color-hex-label">#1E293B</span>
        <span style="font-size:10px; color:var(--ink-muted); font-family:ui-monospace,monospace;" id="flimsy-color-opacity-label">100%</span>
        <span style="display:inline-flex; color:var(--ink-muted); width:12px; height:12px;">\${ICONS.chevronDown}</span>
      </div>
    </div>

    <!-- Typography -->
    <div class="prop-section">
      <span class="prop-label">Typography</span>
      <button class="font-select-trigger" id="flimsy-font-trigger">
        <span id="flimsy-current-font-name">Inter</span>
        <span style="display:inline-flex; color:var(--ink-muted); width:12px; height:12px;">\${ICONS.chevronDown}</span>
      </button>
      <div class="grid-2">
        <select class="field-select" id="flimsy-weight-select" aria-label="Font Weight">
          <option value="font-light">Light</option>
          <option value="font-normal" selected>Regular</option>
          <option value="font-medium">Medium</option>
          <option value="font-semibold">Semibold</option>
          <option value="font-bold">Bold</option>
          <option value="font-extrabold">Extrabold</option>
        </select>
        <div class="field-box">
          <span class="field-k">Size</span>
          <input type="text" id="flimsy-size-input" class="field-input" placeholder="16px" title="Font size (e.g. 16px, lg, 2xl)">
        </div>
      </div>
      <div class="grid-2">
        <select class="field-select" id="seg-leading" aria-label="Line Height">
          <option value="leading-none">Line 1.0</option>
          <option value="leading-tight">Line 1.25</option>
          <option value="leading-snug">Line 1.37</option>
          <option value="leading-normal" selected>Line 1.5</option>
          <option value="leading-relaxed">Line 1.62</option>
          <option value="leading-loose">Line 2.0</option>
        </select>
        <select class="field-select" id="seg-tracking" aria-label="Letter Spacing">
          <option value="tracking-tighter">Track -5%</option>
          <option value="tracking-tight">Track -2%</option>
          <option value="tracking-normal" selected>Track 0%</option>
          <option value="tracking-wide">Track +2%</option>
          <option value="tracking-wider">Track +5%</option>
          <option value="tracking-widest">Track +10%</option>
        </select>
      </div>
      <div style="display:flex; gap:5px;">
        <div class="segmented" id="seg-text-align" style="flex:1.15;">
          <button class="seg-btn" data-class="text-left" title="Align Left">\${ICONS.alignL}</button>
          <button class="seg-btn" data-class="text-center" title="Align Center">\${ICONS.alignC}</button>
          <button class="seg-btn" data-class="text-right" title="Align Right">\${ICONS.alignR}</button>
          <button class="seg-btn" data-class="text-justify" title="Justify">\${ICONS.alignJ}</button>
        </div>
        <div class="segmented" id="seg-text-transform" style="flex:0.85;">
          <button class="seg-btn" data-class="normal-case" title="Normal">Aa</button>
          <button class="seg-btn" data-class="uppercase" title="Uppercase">AA</button>
          <button class="seg-btn" data-class="capitalize" title="Capitalize">Ab</button>
        </div>
      </div>
    </div>

    <!-- Collapsible Stroke & Border Accordion -->
    <div class="prop-section">
      <div class="accordion-header" id="flimsy-border-accordion-btn">
        <span class="prop-label">Stroke &amp; Border</span>
        <button class="accordion-plus" id="flimsy-border-accordion-icon" type="button" aria-label="Toggle Stroke & Border">\${ICONS.plus}</button>
      </div>
      <div class="accordion-body" id="flimsy-border-body">
        <div style="display:flex; gap:5px; align-items:center;">
          <div class="segmented" id="seg-border-width" style="flex:1;">
            <button class="seg-btn" data-class="border-0">0</button>
            <button class="seg-btn" data-class="border">1</button>
            <button class="seg-btn" data-class="border-2">2</button>
            <button class="seg-btn" data-class="border-4">4</button>
          </div>
          <div class="segmented" id="seg-border-style" style="width:94px;">
            <button class="seg-btn" data-class="border-solid">Sol</button>
            <button class="seg-btn" data-class="border-dashed">Dsh</button>
            <button class="seg-btn" data-class="border-dotted">Dot</button>
          </div>
          <button class="mini-toggle-btn" id="flimsy-border-side-btn" title="Individual border sides">\${ICONS.sides}</button>
        </div>
        <div class="side-box-grid" id="flimsy-border-side-grid" style="display:none;">
          <div class="side-input-wrap"><span class="side-tag">BT</span><input type="text" class="side-input" id="bdr-t" placeholder="0"></div>
          <div class="side-input-wrap"><span class="side-tag">BR</span><input type="text" class="side-input" id="bdr-r" placeholder="0"></div>
          <div class="side-input-wrap"><span class="side-tag">BB</span><input type="text" class="side-input" id="bdr-b" placeholder="0"></div>
          <div class="side-input-wrap"><span class="side-tag">BL</span><input type="text" class="side-input" id="bdr-l" placeholder="0"></div>
        </div>
      </div>
    </div>

    <!-- Collapsible Effects Accordion -->
    <div class="prop-section">
      <div class="accordion-header" id="flimsy-effects-accordion-btn">
        <span class="prop-label">Effects</span>
        <button class="accordion-plus" id="flimsy-effects-accordion-icon" type="button" aria-label="Toggle Effects">\${ICONS.plus}</button>
      </div>
      <div class="accordion-body" id="flimsy-effects-body">
        <div class="segmented" id="seg-shadow">
          <button class="seg-btn" data-class="shadow-none">None</button>
          <button class="seg-btn" data-class="shadow-sm">sm</button>
          <button class="seg-btn" data-class="shadow-md">md</button>
          <button class="seg-btn" data-class="shadow-lg">lg</button>
          <button class="seg-btn" data-class="shadow-xl">xl</button>
          <button class="seg-btn" data-class="shadow-inner">In</button>
        </div>
        <div class="segmented" id="seg-blur">
          <button class="seg-btn" data-class="backdrop-blur-none">BG 0</button>
          <button class="seg-btn" data-class="backdrop-blur-sm">sm</button>
          <button class="seg-btn" data-class="backdrop-blur-md">md</button>
          <button class="seg-btn" data-class="backdrop-blur-lg">lg</button>
        </div>
        <div class="segmented" id="seg-layer-blur">
          <button class="seg-btn" data-class="blur-none">Blur 0</button>
          <button class="seg-btn" data-class="blur-sm">sm</button>
          <button class="seg-btn" data-class="blur-md">md</button>
          <button class="seg-btn" data-class="blur-lg">lg</button>
        </div>
      </div>
    </div>

    <!-- Drawers: AI Assist & Raw Classes -->
    <div class="prop-section no-divider">
      <div class="drawer-pills">
        <button class="pill-toggle" id="flimsy-ai-toggle">\${ICONS.ai} AI</button>
        <button class="pill-toggle" id="flimsy-classes-toggle">Classes</button>
      </div>

      <div id="flimsy-ai-drawer" class="ai-drawer">
        <input type="text" id="flimsy-ai-input" class="clean-input" placeholder="e.g. Glass card, soft shadow...">
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="ai-chip" data-prompt="Glassmorphism card with blur">Glass</button>
          <button class="ai-chip" data-prompt="Vibrant gradient background">Gradient</button>
          <button class="ai-chip" data-prompt="Neon glow shadow">Glow</button>
          <button class="ai-chip" data-prompt="Modern rounded card with shadow">Card</button>
        </div>
        <div style="display:flex; gap:5px;">
          <button id="flimsy-ai-generate" class="action-btn" style="flex:1;">Apply</button>
          <button id="flimsy-ai-copy" class="pill-toggle" title="Copy prompt">\${ICONS.copy} Copy</button>
        </div>
        <div id="flimsy-ai-feedback" style="font-size:10px; color:var(--ink-secondary); display:none;"></div>
      </div>

      <div id="flimsy-classes-drawer" style="display:none;">
        <input type="text" id="flimsy-classes-raw" class="clean-input" style="font-family:ui-monospace,monospace;" placeholder="Tailwind classes...">
      </div>
    </div>

    <!-- Diff & Sync Footer -->
    <div id="flimsy-diff-box" class="diff-container no-scroll"></div>
    <div class="sync-row">
      <button id="flimsy-sync-btn" class="sync-btn" title="Sync to Code (Shift+S)">In Sync</button>
      <button id="flimsy-discard-btn" class="discard-btn" title="Reset changes">Reset</button>
    </div>
    <div id="flimsy-sync-status" class="sync-status"></div>
  \`;
  shadow.appendChild(panel);

  // --- Floating 2D Spectrum Color Picker Modal ---
  const colorModal = document.createElement('div');
  colorModal.className = 'figma-color-modal';
  colorModal.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-primary);">Color</span>
      <button class="icon-btn" id="flimsy-color-close" style="width:18px; height:18px;" aria-label="Close Color Picker">\${ICONS.close}</button>
    </div>
    <div class="color-canvas-wrap" id="flimsy-canvas-wrap">
      <canvas class="color-canvas" id="flimsy-color-canvas" width="220" height="130"></canvas>
      <div class="canvas-thumb" id="flimsy-canvas-thumb"></div>
    </div>
    <input type="range" min="0" max="360" value="217" class="hue-slider" id="flimsy-hue-slider" aria-label="Hue">
    <input type="range" min="5" max="100" value="100" class="alpha-slider" id="flimsy-alpha-slider" aria-label="Alpha">
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="icon-btn" id="flimsy-eyedropper-btn" title="Eyedropper" aria-label="Eyedropper">\${ICONS.eyedropper}</button>
      <input type="text" id="flimsy-modal-hex" class="clean-input" style="font-family:ui-monospace,monospace; text-transform:uppercase;" value="#1E293B">
      <span id="flimsy-modal-alpha-text" style="font-size:10px; font-family:ui-monospace,monospace; color:var(--ink-secondary); width:32px; text-align:right;">100%</span>
    </div>
    <div style="border-top:1px solid var(--hairline); padding-top:6px;">
      <span style="font-size:9.5px; font-weight:600; color:var(--ink-muted); margin-bottom:4px; display:block;">On this page</span>
      <div class="doc-colors-grid" id="flimsy-doc-colors"></div>
    </div>
  \`;
  shadow.appendChild(colorModal);

  // --- Searchable Typography Font Modal ---
  const fontModal = document.createElement('div');
  fontModal.className = 'font-modal no-scroll';
  fontModal.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-primary);">Fonts</span>
      <button class="icon-btn" id="flimsy-font-close" style="width:18px; height:18px;" aria-label="Close Fonts">\${ICONS.close}</button>
    </div>
    <input type="text" class="clean-input" id="flimsy-font-search" placeholder="Search fonts...">
    <div class="font-list-scroll no-scroll" id="flimsy-font-list"></div>
  \`;
  shadow.appendChild(fontModal);

  // --- Inspector Element Refs ---
  const elemTagDisplay = panel.querySelector('#flimsy-elem-tag');
  const elemLocDisplay = panel.querySelector('#flimsy-elem-loc');
  const instanceBadge = panel.querySelector('#flimsy-instance-badge');
  const textGroup = panel.querySelector('#flimsy-text-group');
  const textInput = panel.querySelector('#flimsy-text-input');
  const classesRawInput = panel.querySelector('#flimsy-classes-raw');
  const classesToggle = panel.querySelector('#flimsy-classes-toggle');
  const classesDrawer = panel.querySelector('#flimsy-classes-drawer');
  const diffBox = panel.querySelector('#flimsy-diff-box');
  const syncBtn = panel.querySelector('#flimsy-sync-btn');
  const discardBtn = panel.querySelector('#flimsy-discard-btn');
  const syncStatus = panel.querySelector('#flimsy-sync-status');
  const closeBtn = panel.querySelector('#flimsy-close-btn');

  const widthInput = panel.querySelector('#flimsy-width-input');
  const heightInput = panel.querySelector('#flimsy-height-input');
  const posXInput = panel.querySelector('#flimsy-pos-x-input');
  const posYInput = panel.querySelector('#flimsy-pos-y-input');
  const gapInput = panel.querySelector('#flimsy-gap-input');
  const padInput = panel.querySelector('#flimsy-pad-input');
  const radiusInput = panel.querySelector('#flimsy-radius-input');
  const opacitySlider = panel.querySelector('#flimsy-opacity-slider');
  const opacityValLabel = panel.querySelector('#flimsy-opacity-val');
  const rotateInput = panel.querySelector('#flimsy-rotate-input');
  const weightSelect = panel.querySelector('#flimsy-weight-select');
  const sizeInput = panel.querySelector('#flimsy-size-input');
  const leadingSelect = panel.querySelector('#seg-leading');
  const trackingSelect = panel.querySelector('#seg-tracking');

  const borderAccordionBtn = panel.querySelector('#flimsy-border-accordion-btn');
  const borderAccordionIcon = panel.querySelector('#flimsy-border-accordion-icon');
  const borderBody = panel.querySelector('#flimsy-border-body');
  const effectsAccordionBtn = panel.querySelector('#flimsy-effects-accordion-btn');
  const effectsAccordionIcon = panel.querySelector('#flimsy-effects-accordion-icon');
  const effectsBody = panel.querySelector('#flimsy-effects-body');

  const aiToggle = panel.querySelector('#flimsy-ai-toggle');
  const aiDrawer = panel.querySelector('#flimsy-ai-drawer');
  const aiInput = panel.querySelector('#flimsy-ai-input');
  const aiGenerate = panel.querySelector('#flimsy-ai-generate');
  const aiCopy = panel.querySelector('#flimsy-ai-copy');
  const aiFeedback = panel.querySelector('#flimsy-ai-feedback');
  let currentAICopyPrompt = '';

  const colorTrigger = panel.querySelector('#flimsy-color-trigger');
  const colorThumb = panel.querySelector('#flimsy-color-thumb');
  const colorHexLabel = panel.querySelector('#flimsy-color-hex-label');
  const colorOpacityLabel = panel.querySelector('#flimsy-color-opacity-label');
  const targetFillBtn = panel.querySelector('#flimsy-target-fill');
  const targetTextBtn = panel.querySelector('#flimsy-target-text');
  const targetStrokeBtn = panel.querySelector('#flimsy-target-stroke');

  const colorCanvas = colorModal.querySelector('#flimsy-color-canvas');
  const colorCanvasWrap = colorModal.querySelector('#flimsy-canvas-wrap');
  const canvasThumb = colorModal.querySelector('#flimsy-canvas-thumb');
  const hueSlider = colorModal.querySelector('#flimsy-hue-slider');
  const alphaSlider = colorModal.querySelector('#flimsy-alpha-slider');
  const modalHexInput = colorModal.querySelector('#flimsy-modal-hex');
  const modalAlphaText = colorModal.querySelector('#flimsy-modal-alpha-text');
  const eyedropperBtn = colorModal.querySelector('#flimsy-eyedropper-btn');
  const colorCloseBtn = colorModal.querySelector('#flimsy-color-close');
  const docColorsGrid = colorModal.querySelector('#flimsy-doc-colors');

  const fontTrigger = panel.querySelector('#flimsy-font-trigger');
  const currentFontName = panel.querySelector('#flimsy-current-font-name');
  const fontSearch = fontModal.querySelector('#flimsy-font-search');
  const fontListContainer = fontModal.querySelector('#flimsy-font-list');
  const fontCloseBtn = fontModal.querySelector('#flimsy-font-close');

  const padLinkBtn = panel.querySelector('#flimsy-pad-link-btn');
  const padGrid = panel.querySelector('#flimsy-pad-grid');
  const radLinkBtn = panel.querySelector('#flimsy-radius-link-btn');
  const radGrid = panel.querySelector('#flimsy-radius-grid');
  const borderSideBtn = panel.querySelector('#flimsy-border-side-btn');
  const borderSideGrid = panel.querySelector('#flimsy-border-side-grid');

  const FONTS = [
    { name: 'Inter', category: 'Sans', family: "'Inter', sans-serif" },
    { name: 'Roboto', category: 'Sans', family: "'Roboto', sans-serif" },
    { name: 'Poppins', category: 'Sans', family: "'Poppins', sans-serif" },
    { name: 'Montserrat', category: 'Sans', family: "'Montserrat', sans-serif" },
    { name: 'Plus Jakarta Sans', category: 'Sans', family: "'Plus Jakarta Sans', sans-serif" },
    { name: 'Open Sans', category: 'Sans', family: "'Open Sans', sans-serif" },
    { name: 'Playfair Display', category: 'Serif', family: "'Playfair Display', serif" },
    { name: 'Merriweather', category: 'Serif', family: "'Merriweather', serif" },
    { name: 'Inria Serif', category: 'Serif', family: "'Inria Serif', serif" },
    { name: 'Fira Code', category: 'Mono', family: "'Fira Code', monospace" },
    { name: 'JetBrains Mono', category: 'Mono', family: "'JetBrains Mono', monospace" },
    { name: 'System Sans', category: 'System', family: 'system-ui, -apple-system, sans-serif' },
    { name: 'System Serif', category: 'System', family: 'Georgia, Cambria, serif' },
    { name: 'System Mono', category: 'System', family: 'ui-monospace, monospace' },
  ];

  const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

  function isTextElement(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'label', 'strong', 'em', 'b', 'i', 'button'].includes(tag)) {
      return true;
    }
    if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
      return true;
    }
    return false;
  }

  function isComponentBoundary(el, parentTaggedEl) {
    if (!el) return false;
    if (el.getAttribute('data-flimsy-type') === 'component') return true;
    const comp = el.getAttribute('data-flimsy-comp');
    if (!comp) return false;
    if (!parentTaggedEl) return true;
    const parentComp = parentTaggedEl.getAttribute('data-flimsy-comp');
    return Boolean(parentComp && comp !== parentComp);
  }

  function setAccordionState(which, open) {
    if (which === 'border') {
      isBorderSectionOpen = open;
      borderBody.classList.toggle('open', open);
      borderAccordionIcon.innerHTML = open ? ICONS.minus : ICONS.plus;
    } else {
      isEffectsSectionOpen = open;
      effectsBody.classList.toggle('open', open);
      effectsAccordionIcon.innerHTML = open ? ICONS.minus : ICONS.plus;
    }
  }

  borderAccordionBtn.addEventListener('click', () => setAccordionState('border', !isBorderSectionOpen));
  effectsAccordionBtn.addEventListener('click', () => setAccordionState('effects', !isEffectsSectionOpen));

  function updateUndoRedoUI() {
    undoBtn.disabled = historyIdx <= 0;
    redoBtn.disabled = historyIdx >= history.length - 1;
  }

  function updateSyncBadge() {
    const dirty = hasAnyUnsavedChanges();
    const countLabel = selectedTargets.length > 1 ? ' (' + selectedTargets.length + ')' : '';
    if (dirty) {
      dockSyncBadge.className = 'sync-status-badge dirty';
      dockSyncBadge.querySelector('.text').textContent = 'Unsaved (Shift+S)';
      syncBtn.classList.add('dirty');
      syncBtn.textContent = 'Sync to Code' + countLabel + ' (Shift+S)';
    } else {
      dockSyncBadge.className = 'sync-status-badge';
      dockSyncBadge.querySelector('.text').textContent = 'In sync';
      syncBtn.classList.remove('dirty');
      syncBtn.textContent = 'In Sync';
    }
  }

  function renderDiff() {
    let hasDiff = false;
    diffBox.innerHTML = '';

    if (pendingClasses !== originalClasses) {
      hasDiff = true;
      const oldSet = originalClasses.split(/\\s+/).filter(Boolean);
      const newSet = pendingClasses.split(/\\s+/).filter(Boolean);
      const removed = oldSet.filter((c) => !newSet.includes(c));
      const added = newSet.filter((c) => !oldSet.includes(c));

      if (removed.length) {
        const delLine = document.createElement('div');
        delLine.className = 'diff-del';
        delLine.textContent = '- ' + removed.join(' ');
        diffBox.appendChild(delLine);
      }
      if (added.length) {
        const addLine = document.createElement('div');
        addLine.className = 'diff-add';
        addLine.textContent = '+ ' + added.join(' ');
        diffBox.appendChild(addLine);
      }
    }

    if (pendingText !== null && pendingText !== originalText) {
      hasDiff = true;
      const delText = document.createElement('div');
      delText.className = 'diff-del';
      delText.textContent = '- text: "' + originalText + '"';
      const addText = document.createElement('div');
      addText.className = 'diff-add';
      addText.textContent = '+ text: "' + pendingText + '"';
      diffBox.appendChild(delText);
      diffBox.appendChild(addText);
    }

    if (selectedTargets.length > 1) {
      const extraDirty = selectedTargets.slice(1).filter((el) => {
        const st = targetStates.get(el);
        return st && st.pendingClasses !== st.originalClasses;
      }).length;
      if (extraDirty > 0) {
        hasDiff = true;
        const note = document.createElement('div');
        note.className = 'diff-add';
        note.textContent = '+ ' + extraDirty + ' more selected';
        diffBox.appendChild(note);
      }
    }

    diffBox.style.display = hasDiff ? 'flex' : 'none';
  }

  // --- Tailwind Class Category Reconciliation ---
  function getClientClassCategory(base) {
    if (/^text-([0-9]?xl|xs|sm|base|lg|(\\[\\d+(?:\\.\\d+)?(px|rem|em)\\]))$/.test(base)) return 'font-size';
    if (/^text-(left|center|right|justify|start|end)$/.test(base)) return 'text-align';
    if (base.startsWith('text-')) return 'text-color';
    if (/^font-(sans|serif|mono|(\\[[^\\]]+\\]))$/.test(base)) return 'font-family';
    if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) return 'font-weight';
    if (/^leading-/.test(base)) return 'line-height';
    if (/^tracking-/.test(base)) return 'letter-spacing';
    if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(base)) return 'text-transform';
    if (/^rounded-(tl|tr|br|bl)-/.test(base)) return base.match(/^rounded-(tl|tr|br|bl)/)?.[0];
    if (base.startsWith('rounded')) return 'border-radius';
    if (/^shadow(-none|-sm|-md|-lg|-xl|-2xl|-inner)?$/.test(base)) return 'box-shadow';
    if (base.startsWith('backdrop-blur')) return 'backdrop-blur';
    if (/^blur(-none|-sm|-md|-lg|-xl|-2xl|-3xl|(\\[[^\\]]+\\]))?$/.test(base)) return 'layer-blur';
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
    if (/^border-([trbl])(-[0-9]+|(\\[[0-9]+px\\]))?$/.test(base)) return 'border-width-' + base.match(/^border-([trbl])/)[1];
    if (/^border(-[0-9]+|(\\[[0-9]+px\\]))?$/.test(base) || base === 'border') return 'border-width';
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

  function applyClassToElement(el, newClass, removeOnlyCategory = null) {
    const parts = newClass ? newClass.split(':') : [''];
    const base = parts[parts.length - 1];
    const variantPrefix = parts.length > 1 ? parts.slice(0, -1).join(':') : '';
    const category = removeOnlyCategory || getClientClassCategory(base);

    const currentTokens = (el.className || '').split(/\\s+/).filter(Boolean);
    const filtered = currentTokens.filter((token) => {
      const tParts = token.split(':');
      const tPrefix = tParts.length > 1 ? tParts.slice(0, -1).join(':') : '';
      const b = tParts[tParts.length - 1];
      const tCat = getClientClassCategory(b);
      if (tPrefix !== variantPrefix) {
        // When visually setting a base font-size, strip conflicting breakpoint font-size overrides (e.g. sm:text-5xl)
        if (!variantPrefix && category === 'font-size' && tCat === 'font-size' && /^(sm|md|lg|xl|2xl)$/.test(tPrefix)) {
          return false;
        }
        return true;
      }
      if (category && tCat === category) return false;
      if (category === 'padding' && (b.startsWith('p-') || /^p[xytrbl]-/.test(b))) return false;
      if (category === 'margin' && (b.startsWith('m-') || /^m[xytrbl]-/.test(b))) return false;
      return true;
    });

    if (newClass) {
      filtered.push(newClass);
    }

    const updated = Array.from(new Set(filtered)).join(' ');
    ensurePreviewRulesForClasses(updated);
    el.className = updated;

    const st = getOrInitTargetState(el);
    st.pendingClasses = updated;
    return updated;
  }

  function applyOptimisticClass(newClass, skipHistory = false, removeOnlyCategory = null) {
    if (!selectedTarget || selectedTargets.length === 0) return;

    let primaryUpdated = pendingClasses;
    for (const el of selectedTargets) {
      const updated = applyClassToElement(el, newClass, removeOnlyCategory);
      if (el === selectedTarget) {
        primaryUpdated = updated;
      }
    }

    pendingClasses = primaryUpdated;
    classesRawInput.value = primaryUpdated;
    updateActiveSegmentedUI(primaryUpdated);
    updateAllSelectionBoxes();
    if (!skipHistory) {
      pushHistory();
    } else {
      renderDiff();
      updateSyncBadge();
    }
  }

  // --- Sync Computed Element Styles into Inspector Controls ---
  function rgbStringToHexAndAlpha(cssColor) {
    if (!cssColor || cssColor === 'transparent') return null;
    const m = cssColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return null;
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return { r, g, b, hex, alpha: Math.round(a * 100) };
  }

  function rgbToHsv(r, g, b) {
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

  function syncColorTriggerFromSelected() {
    if (!selectedTarget) return;
    const cs = window.getComputedStyle(selectedTarget);
    let raw = cs.backgroundColor;
    if (activeColorTarget === 'text') raw = cs.color;
    if (activeColorTarget === 'stroke') raw = cs.borderTopColor;

    const parsed = rgbStringToHexAndAlpha(raw);
    if (parsed) {
      currentColorHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
      currentColorAlpha = parsed.alpha;
      colorThumb.style.background = parsed.hex;
      colorHexLabel.textContent = parsed.hex.toUpperCase();
      colorOpacityLabel.textContent = parsed.alpha + '%';
      modalHexInput.value = parsed.hex.toUpperCase();
      modalAlphaText.textContent = parsed.alpha + '%';
      hueSlider.value = String(currentColorHsv[0]);
      alphaSlider.value = String(currentColorAlpha);
      if (colorModal.style.display === 'flex') {
        drawColorCanvas(currentColorHsv[0]);
        const wrapRect = colorCanvasWrap.getBoundingClientRect();
        if (wrapRect.width) {
          canvasThumb.style.left = (currentColorHsv[1] / 100 * wrapRect.width) + 'px';
          canvasThumb.style.top = ((100 - currentColorHsv[2]) / 100 * wrapRect.height) + 'px';
        }
      }
    } else {
      colorThumb.style.background = 'repeating-conic-gradient(#d4d4d8 0% 25%, #fff 0% 50%) 50% / 8px 8px';
      colorHexLabel.textContent = 'Transparent';
      colorOpacityLabel.textContent = '0%';
      modalHexInput.value = 'TRANSPARENT';
      modalAlphaText.textContent = '0%';
    }
  }

  function parseRotationDeg(classesStr) {
    const tokens = (classesStr || '').split(/\\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const m = tokens[i].match(/^(-)?rotate-(?:\\[(-?\\d+(?:\\.\\d+)?)deg\\]|(\\d+))$/);
      if (m) {
        if (m[2] !== undefined) return parseFloat(m[2]);
        const v = parseFloat(m[3]);
        return m[1] ? -v : v;
      }
    }
    return 0;
  }

  function parseTranslatePx(classesStr, axis) {
    const tokens = (classesStr || '').split(/\\s+/);
    const re = new RegExp('^(-)?translate-' + axis + '-(?:\\\\[(-?\\\\d+(?:\\\\.\\\\d+)?)px\\\\]|(\\\\d+))$');
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

  function parseInsetPx(classesStr, side) {
    const tokens = (classesStr || '').split(/\\s+/);
    const re = new RegExp('^(-)?' + side + '-(?:\\\\[(-?\\\\d+(?:\\\\.\\\\d+)?)px\\\\]|(\\\\d+))$');
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

  function isAbsolutePositioned(el) {
    return /\\b(absolute|fixed)\\b/.test(el?.className || '');
  }

  function getElementPosXY(el) {
    const cls = el.className || '';
    if (isAbsolutePositioned(el)) {
      const cs = window.getComputedStyle(el);
      const hasLeft = /\\b-?left-/.test(cls);
      const hasTop = /\\b-?top-/.test(cls);
      return {
        x: hasLeft ? parseInsetPx(cls, 'left') : Math.round(parseFloat(cs.left) || el.offsetLeft || 0),
        y: hasTop ? parseInsetPx(cls, 'top') : Math.round(parseFloat(cs.top) || el.offsetTop || 0),
      };
    }
    return {
      x: parseTranslatePx(cls, 'x'),
      y: parseTranslatePx(cls, 'y'),
    };
  }

  function setElementPosAxis(el, axis, pxVal) {
    const rounded = Math.round(pxVal);
    if (isAbsolutePositioned(el)) {
      const side = axis === 'x' ? 'left' : 'top';
      applyClassToElement(el, side + '-[' + rounded + 'px]');
    } else if (rounded === 0) {
      applyClassToElement(el, '', 'translate-' + axis);
    } else {
      applyClassToElement(el, 'translate-' + axis + '-[' + rounded + 'px]');
    }
  }

  function updateActiveSegmentedUI(classesStr) {
    const tokens = (classesStr || '').split(/\\s+/).filter(Boolean);
    panel.querySelectorAll('.seg-btn').forEach((btn) => {
      const cls = btn.getAttribute('data-class');
      if (cls) btn.classList.toggle('active', tokens.includes(cls));
    });

    panel.querySelectorAll('.align-cell').forEach((cell) => {
      const alignPairs = (cell.getAttribute('data-align') || '').split(' ');
      const isMatch = alignPairs.every((cls) => tokens.includes(cls));
      cell.classList.toggle('active', isMatch);
    });

    if (selectedTarget) {
      const rect = selectedTarget.getBoundingClientRect();
      const cs = window.getComputedStyle(selectedTarget);
      widthInput.value = Math.round(rect.width / canvasZoom) + 'px';
      heightInput.value = Math.round(rect.height / canvasZoom) + 'px';
      const pos = getElementPosXY(selectedTarget);
      posXInput.value = Math.round(pos.x) + 'px';
      posYInput.value = Math.round(pos.y) + 'px';
      sizeInput.value = Math.round(parseFloat(cs.fontSize) || 16) + 'px';

      const radPx = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
      radiusInput.value = radPx + 'px';

      const padPx = Math.round(parseFloat(cs.paddingTop) || 0);
      padInput.value = padPx + 'px';

      const gapVal = parseFloat(cs.gap);
      gapInput.value = !Number.isNaN(gapVal) ? (Math.round(gapVal) + 'px') : '0px';
    }

    // Font display
    const fontToken = tokens.find((t) => /^font-(sans|serif|mono|\\[)/.test(t));
    if (fontToken) {
      const found = FONTS.find((f) => fontToken.includes(f.name.replace(/\\s+/g, '_')) || fontToken === 'font-' + f.name.toLowerCase());
      if (found) currentFontName.textContent = found.name;
    }

    // Weight, Leading, Tracking selects
    const weightTok = tokens.find((t) => /^font-(light|normal|medium|semibold|bold|extrabold)$/.test(t));
    weightSelect.value = weightTok || 'font-normal';

    const leadTok = tokens.find((t) => /^leading-(none|tight|snug|normal|relaxed|loose)$/.test(t));
    leadingSelect.value = leadTok || 'leading-normal';

    const trackTok = tokens.find((t) => /^tracking-(tighter|tight|normal|wide|wider|widest)$/.test(t));
    trackingSelect.value = trackTok || 'tracking-normal';

    // Opacity slider
    let opVal = 100;
    const opTok = tokens.find((t) => t.startsWith('opacity-'));
    if (opTok) {
      const m = opTok.match(/^opacity-(?:\\[(\\d+)%\\]|(\\d+))$/);
      if (m) opVal = parseInt(m[1] || m[2], 10);
    }
    opacitySlider.value = String(opVal);
    opacityValLabel.textContent = opVal + '%';

    // Rotation
    const rotDeg = parseRotationDeg(classesStr);
    rotateInput.value = rotDeg ? (rotDeg + 'deg') : '0deg';
  }

  function syncLayersVisibility() {
    layersToggleBtn.classList.toggle('subtle-active', isLayersOpen);
    layersPanel.style.display = (isInspectActive && isLayersOpen) ? 'flex' : 'none';
  }

  function clearSelection() {
    if (selectedTarget) selectedTarget.contentEditable = 'false';
    selectedTarget = null;
    selectedTargets = [];
    highlightBox.style.display = 'none';
    highlightBox.classList.remove('selected');
    multiBoxesLayer.innerHTML = '';
    clearMeasureGuides();
    panel.style.display = 'none';
    colorModal.style.display = 'none';
    fontModal.style.display = 'none';
    renderFullLayersTree();
    updateSyncBadge();
  }

  // --- Viewport Camera (Figma Zoom & Pan on document.body, Shadow DOM stays fixed at 100%) ---
  let prevBodyTransform = '';
  let prevBodyTransformOrigin = '';
  let cameraApplied = false;

  function applyViewportCamera() {
    if (!cameraApplied) {
      prevBodyTransform = document.body.style.transform || '';
      prevBodyTransformOrigin = document.body.style.transformOrigin || '';
      cameraApplied = true;
    }
    if (canvasZoom === 1 && panX === 0 && panY === 0) {
      document.body.style.transform = prevBodyTransform;
      document.body.style.transformOrigin = prevBodyTransformOrigin;
    } else {
      document.body.style.transformOrigin = '0 0';
      document.body.style.transform = 'translate(' + Math.round(panX) + 'px, ' + Math.round(panY) + 'px) scale(' + canvasZoom + ')';
    }
    zoomPillBtn.textContent = Math.round(canvasZoom * 100) + '%';
    if (selectedTarget) updateAllSelectionBoxes();
    else if (hoveredTarget) updateHighlightBox(hoveredTarget, false);
    if (isAltPressed && selectedTarget && hoveredTarget && hoveredTarget !== selectedTarget) {
      renderMeasureGuides(selectedTarget, hoveredTarget);
    }
  }

  function resetViewportCamera() {
    canvasZoom = 1;
    panX = 0;
    panY = 0;
    applyViewportCamera();
  }

  function zoomAtPoint(clientX, clientY, factor) {
    const prevZoom = canvasZoom;
    const nextZoom = Math.max(0.25, Math.min(3, Math.round(prevZoom * factor * 100) / 100));
    if (nextZoom === prevZoom) return;
    panX = clientX - ((clientX - panX) / prevZoom) * nextZoom;
    panY = clientY - ((clientY - panY) / prevZoom) * nextZoom;
    canvasZoom = nextZoom;
    applyViewportCamera();
  }

  function setHandTool(active) {
    isHandTool = active;
    handToolBtn.classList.toggle('active', isHandTool);
    dockBtn.classList.toggle('active', isInspectActive && !isHandTool);
    document.documentElement.style.cursor = (isInspectActive && (isHandTool || isSpacePressed)) ? 'grab' : '';
  }

  // --- Copy & Paste Group / Elements Directly into TSX AST (Ctrl+C / Ctrl+V) ---
  async function copySelectedElements() {
    if (!isInspectActive || selectedTargets.length === 0) return;
    const targets = selectedTargets.map((el) => ({
      file: el.getAttribute('data-flimsy-file'),
      line: parseInt(el.getAttribute('data-flimsy-line'), 10),
      col: parseInt(el.getAttribute('data-flimsy-col'), 10),
    })).filter((t) => t.file && !Number.isNaN(t.line));

    if (targets.length === 0) return;

    try {
      const res = await fetch('/__flimsy/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.snippets) && data.snippets.length > 0) {
        copiedSnippets = data.snippets;
        copiedSourceKeys = new Set(selectedTargets.map((el) => getLayerNodeKey(el)));
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#09090b';
        syncStatus.textContent = 'Copied ' + copiedSnippets.length + ' element' + (copiedSnippets.length > 1 ? 's' : '') + ' (Ctrl+V to paste)';
        setTimeout(() => { syncStatus.style.display = 'none'; }, 1600);
      }
    } catch {}
  }

  async function pasteCopiedElements() {
    if (!isInspectActive || copiedSnippets.length === 0 || !selectedTarget) return;
    const targetEl = selectedTarget;
    const file = targetEl.getAttribute('data-flimsy-file');
    const line = parseInt(targetEl.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(targetEl.getAttribute('data-flimsy-col'), 10);
    if (!file || Number.isNaN(line)) return;

    const targetKey = getLayerNodeKey(targetEl);
    const canPasteInside = !copiedSourceKeys.has(targetKey) && !VOID_TAGS.has(targetEl.tagName.toLowerCase()) && !isTextElement(targetEl);
    const position = canPasteInside ? 'inside' : 'after';

    try {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = 'Pasting ' + copiedSnippets.length + ' element' + (copiedSnippets.length > 1 ? 's' : '') + '...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          line,
          col,
          action: { type: 'paste-elements', snippets: copiedSnippets, position },
        }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.style.color = '#15803d';
        syncStatus.textContent = 'Pasted ' + copiedSnippets.length + ' element' + (copiedSnippets.length > 1 ? 's' : '') + ' to ' + file.split('/').pop();
        setTimeout(() => {
          syncStatus.style.display = 'none';
          renderFullLayersTree();
        }, 1200);
      } else {
        syncStatus.style.color = '#991b1b';
        syncStatus.textContent = data.error || 'Paste failed.';
      }
    } catch {}
  }

  function toggleInspect(force) {
    isInspectActive = typeof force === 'boolean' ? force : !isInspectActive;
    if (!isInspectActive) {
      isHandTool = false;
      isSpacePressed = false;
      handToolBtn.classList.remove('active');
      document.documentElement.style.cursor = '';
      resetViewportCamera();
      hoverOutline.style.display = 'none';
      hoveredTarget = null;
      clearSelection();
      layersPanel.style.display = 'none';
    } else {
      renderFullLayersTree();
      syncLayersVisibility();
    }
    dockBtn.classList.toggle('active', isInspectActive && !isHandTool);
    dockExtra.style.display = isInspectActive ? 'flex' : 'none';
  }

  function toggleAIDrawer(force) {
    const isHidden = aiDrawer.style.display === 'none' || !aiDrawer.style.display;
    const nextOpen = typeof force === 'boolean' ? force : isHidden;
    aiDrawer.style.display = nextOpen ? 'flex' : 'none';
    aiToggle.classList.toggle('active', nextOpen);
    dockAiBtn.classList.toggle('subtle-active', nextOpen);
    if (nextOpen) aiInput.focus();
  }

  dockBtn.addEventListener('click', () => {
    if (isInspectActive && isHandTool) setHandTool(false);
    else toggleInspect();
  });
  handToolBtn.addEventListener('click', () => {
    if (!isInspectActive) toggleInspect(true);
    setHandTool(!isHandTool);
  });
  zoomPillBtn.addEventListener('click', () => resetViewportCamera());
  undoBtn.addEventListener('click', () => undo());
  redoBtn.addEventListener('click', () => redo());
  dockSyncBadge.addEventListener('click', () => syncToCode());

  snapToggleBtn.addEventListener('click', () => {
    isSnapEnabled = !isSnapEnabled;
    snapToggleBtn.classList.toggle('subtle-active', isSnapEnabled);
  });

  layersToggleBtn.addEventListener('click', () => {
    isLayersOpen = !isLayersOpen;
    syncLayersVisibility();
  });

  layersCloseBtn.addEventListener('click', () => {
    isLayersOpen = false;
    syncLayersVisibility();
  });

  layersRefreshBtn.addEventListener('click', () => renderFullLayersTree());

  textToolBtn.addEventListener('click', () => {
    if (!selectedTarget) return;
    selectedTarget.contentEditable = 'true';
    selectedTarget.focus();
  });

  dockAiBtn.addEventListener('click', () => {
    if (!selectedTarget) return;
    toggleAIDrawer();
  });

  classesToggle.addEventListener('click', () => {
    const isHidden = classesDrawer.style.display === 'none' || !classesDrawer.style.display;
    classesDrawer.style.display = isHidden ? 'block' : 'none';
    classesToggle.classList.toggle('active', isHidden);
  });

  // --- Alt / Option Distance Measurement Guides ---
  function clearMeasureGuides() {
    measureLayer.innerHTML = '';
    measureLayer.style.display = 'none';
  }

  function addMeasureSegment(x1, y1, x2, y2, labelText, isDashed = false) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const dist = Math.round(Math.max(dx, dy));
    if (dist < 1 && !isDashed) return;

    const line = document.createElement('div');
    line.className = 'measure-line' + (isDashed ? ' dashed' : '');
    if (dx >= dy) {
      line.style.left = Math.min(x1, x2) + 'px';
      line.style.top = y1 + 'px';
      line.style.width = Math.max(1, dx) + 'px';
      line.style.height = '1px';
      if (isDashed) line.style.borderTop = '1px dashed rgba(244, 63, 94, 0.55)';
    } else {
      line.style.left = x1 + 'px';
      line.style.top = Math.min(y1, y2) + 'px';
      line.style.width = '1px';
      line.style.height = Math.max(1, dy) + 'px';
      if (isDashed) line.style.borderLeft = '1px dashed rgba(244, 63, 94, 0.55)';
    }
    measureLayer.appendChild(line);

    if (!isDashed && labelText) {
      const pill = document.createElement('div');
      pill.className = 'measure-pill';
      pill.textContent = labelText;
      pill.style.left = ((x1 + x2) / 2) + 'px';
      pill.style.top = ((y1 + y2) / 2) + 'px';
      measureLayer.appendChild(pill);
    }
  }

  function renderMeasureGuides(targetA, targetB) {
    if (!targetA || !targetB || targetA === targetB) {
      clearMeasureGuides();
      return;
    }
    const a = targetA.getBoundingClientRect();
    const b = targetB.getBoundingClientRect();
    measureLayer.innerHTML = '';
    measureLayer.style.display = 'block';

    const aMidX = a.left + a.width / 2;
    const aMidY = a.top + a.height / 2;

    const aInsideB = a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
    const bInsideA = b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;

    if (aInsideB || bInsideA) {
      const inner = aInsideB ? a : b;
      const outer = aInsideB ? b : a;
      const midX = inner.left + inner.width / 2;
      const midY = inner.top + inner.height / 2;

      addMeasureSegment(midX, outer.top, midX, inner.top, Math.round(inner.top - outer.top) + 'px');
      addMeasureSegment(midX, inner.bottom, midX, outer.bottom, Math.round(outer.bottom - inner.bottom) + 'px');
      addMeasureSegment(outer.left, midY, inner.left, midY, Math.round(inner.left - outer.left) + 'px');
      addMeasureSegment(inner.right, midY, outer.right, midY, Math.round(outer.right - inner.right) + 'px');
      return;
    }

    if (a.right < b.left) {
      addMeasureSegment(a.right, aMidY, b.left, aMidY, Math.round(b.left - a.right) + 'px');
      if (aMidY < b.top || aMidY > b.bottom) {
        addMeasureSegment(b.left, aMidY, b.left, aMidY < b.top ? b.top : b.bottom, '', true);
      }
    } else if (b.right < a.left) {
      addMeasureSegment(b.right, aMidY, a.left, aMidY, Math.round(a.left - b.right) + 'px');
      if (aMidY < b.top || aMidY > b.bottom) {
        addMeasureSegment(b.right, aMidY, b.right, aMidY < b.top ? b.top : b.bottom, '', true);
      }
    }

    if (a.bottom < b.top) {
      addMeasureSegment(aMidX, a.bottom, aMidX, b.top, Math.round(b.top - a.bottom) + 'px');
      if (aMidX < b.left || aMidX > b.right) {
        addMeasureSegment(aMidX, b.top, aMidX < b.left ? b.left : b.right, b.top, '', true);
      }
    } else if (b.bottom < a.top) {
      addMeasureSegment(aMidX, b.bottom, aMidX, a.top, Math.round(a.top - b.bottom) + 'px');
      if (aMidX < b.left || aMidX > b.right) {
        addMeasureSegment(aMidX, b.bottom, aMidX < b.left ? b.left : b.right, b.bottom, '', true);
      }
    }
  }

  // --- Global Keyboard Shortcuts ---
  window.addEventListener('keydown', async (e) => {
    if (e.key === 'Alt') {
      isAltPressed = true;
      if (isInspectActive && selectedTarget && hoveredTarget && hoveredTarget !== selectedTarget) {
        renderMeasureGuides(selectedTarget, hoveredTarget);
      }
    }

    const typing = isTypingInField(e);

    if (((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) || (!typing && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S'))) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        await syncToCode();
        return;
      }
    }

    if (e.altKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')) {
      e.preventDefault();
      toggleInspect();
      return;
    }

    if (e.key === 'Escape') {
      if (colorModal.style.display === 'flex') {
        colorModal.style.display = 'none';
      } else if (fontModal.style.display === 'flex') {
        fontModal.style.display = 'none';
      } else if (selectedTarget) {
        clearSelection();
      } else if (isInspectActive) {
        toggleInspect(false);
      }
      return;
    }

    if (typing) return;

    // Spacebar temporary Hand Pan tool (Figma-style)
    if (e.code === 'Space' && isInspectActive) {
      e.preventDefault();
      if (!isSpacePressed) {
        isSpacePressed = true;
        document.documentElement.style.cursor = 'grab';
      }
      return;
    }

    // Tool switchers: H (Hand pan), V (Select cursor)
    if (isInspectActive && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setHandTool(true);
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setHandTool(false);
        return;
      }
    }

    // Viewport Zoom shortcuts: Ctrl/Cmd + (+ / - / 0)
    if (isInspectActive && (e.ctrlKey || e.metaKey)) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 1.2);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        zoomAtPoint(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.2);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        resetViewportCamera();
        return;
      }
      if ((e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllElements();
        return;
      }
      if ((e.key === 'c' || e.key === 'C') && selectedTargets.length > 0) {
        e.preventDefault();
        await copySelectedElements();
        return;
      }
      if ((e.key === 'v' || e.key === 'V') && copiedSnippets.length > 0 && selectedTarget) {
        e.preventDefault();
        await pasteCopiedElements();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        redo();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        await duplicateSelectedElement();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        await deleteSelectedElement();
      }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (isInspectActive && selectedTargets.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const axis = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? 'x' : 'y';
        const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -step : step;

        for (const el of selectedTargets) {
          const curPos = getElementPosXY(el);
          setElementPosAxis(el, axis, curPos[axis] + delta);
        }
        const primarySt = getOrInitTargetState(selectedTarget);
        pendingClasses = primarySt.pendingClasses;
        classesRawInput.value = pendingClasses;
        updateActiveSegmentedUI(pendingClasses);
        updateAllSelectionBoxes();
        const p = getElementPosXY(selectedTarget);
        dimPillSpan.textContent = 'x: ' + Math.round(p.x) + 'px, y: ' + Math.round(p.y) + 'px';
        pushHistory();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      isAltPressed = false;
      clearMeasureGuides();
    }
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (!isHandTool) document.documentElement.style.cursor = '';
    }
  });

  window.addEventListener('blur', () => {
    isAltPressed = false;
    isSpacePressed = false;
    if (!isHandTool) document.documentElement.style.cursor = '';
    clearMeasureGuides();
  });

  // --- Wheel Zoom-to-Cursor (Ctrl+Wheel / Trackpad Pinch) & Horizontal/Vertical Pan ---
  window.addEventListener('wheel', (e) => {
    if (!isInspectActive) return;
    if (e.composedPath().includes(container)) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
      zoomAtPoint(e.clientX, e.clientY, factor);
    } else if (canvasZoom !== 1 || panX !== 0 || panY !== 0 || isHandTool) {
      e.preventDefault();
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      panX -= dx;
      panY -= dy;
      applyViewportCamera();
    }
  }, { passive: false });

  closeBtn.addEventListener('click', () => clearSelection());

  function findTaggedElement(el) {
    let cur = el;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // --- Highlight Box & Multi-Select Outlines ---
  function updateHighlightBox(target, isSelected = false) {
    if (!target) {
      highlightBox.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.classList.toggle('selected', isSelected);
    highlightBox.style.top = rect.top + 'px';
    highlightBox.style.left = rect.left + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const name = target.getAttribute('data-flimsy-name') || target.tagName.toLowerCase();

    tagNameSpan.textContent = selectedTargets.length > 1
      ? ('<' + name + '> +' + (selectedTargets.length - 1))
      : ('<' + name + '>');
    locSpan.textContent = file.split('/').pop() + ':' + line;

    if (isTextElement(target)) {
      const fs = Math.round(parseFloat(window.getComputedStyle(target).fontSize) || 16);
      dimPillSpan.textContent = fs + 'px (' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')';
    } else {
      dimPillSpan.textContent = Math.round(rect.width) + ' x ' + Math.round(rect.height);
    }
  }

  function updateAllSelectionBoxes() {
    if (selectedTarget) {
      updateHighlightBox(selectedTarget, true);
    } else {
      highlightBox.style.display = 'none';
    }
    multiBoxesLayer.innerHTML = '';
    if (selectedTargets.length > 1) {
      for (const el of selectedTargets) {
        if (el === selectedTarget) continue;
        const r = el.getBoundingClientRect();
        const box = document.createElement('div');
        box.className = 'multi-box';
        box.style.top = r.top + 'px';
        box.style.left = r.left + 'px';
        box.style.width = r.width + 'px';
        box.style.height = r.height + 'px';
        multiBoxesLayer.appendChild(box);
      }
    }
  }

  function updateHoverBox(target) {
    if (!target || target === selectedTarget) {
      hoverOutline.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    hoverOutline.style.display = 'block';
    hoverOutline.style.top = r.top + 'px';
    hoverOutline.style.left = r.left + 'px';
    hoverOutline.style.width = r.width + 'px';
    hoverOutline.style.height = r.height + 'px';
  }

  // --- Interactive 8-Point Handles: Aspect Ratio Lock, Canva Text Scaling, Tailwind Snap ---
  let isResizing = false;
  let resizeHandle = '';
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let initialFontSize = 16;
  let initialDiag = 1;

  highlightBox.querySelectorAll('.handle').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      if (!selectedTarget) return;
      e.stopPropagation();
      e.preventDefault();

      isResizing = true;
      resizeHandle = handle.getAttribute('data-handle');
      startX = e.clientX;
      startY = e.clientY;

      const rect = selectedTarget.getBoundingClientRect();
      const prevTransition = selectedTarget.style.transition;
      selectedTarget.style.transition = 'none';
      startW = Math.max(1, rect.width / canvasZoom);
      startH = Math.max(1, rect.height / canvasZoom);
      const aspectRatio = startW / startH;
      initialDiag = Math.hypot(startW, startH) || 1;
      initialFontSize = parseFloat(window.getComputedStyle(selectedTarget).fontSize) || 16;

      const isText = isTextElement(selectedTarget);
      const isCorner = ['tl', 'tr', 'bl', 'br'].includes(resizeHandle);
      let lastBypassSnap = false;

      const onPointerMove = (me) => {
        if (!isResizing || !selectedTarget) return;
        lastBypassSnap = me.ctrlKey || me.metaKey;
        const deltaX = (me.clientX - startX) / canvasZoom;
        const deltaY = (me.clientY - startY) / canvasZoom;

        let newW = startW;
        let newH = startH;

        if (resizeHandle.includes('r')) newW = Math.max(20, startW + deltaX);
        if (resizeHandle.includes('l')) newW = Math.max(20, startW - deltaX);
        if (resizeHandle.includes('b')) newH = Math.max(20, startH + deltaY);
        if (resizeHandle.includes('t')) newH = Math.max(20, startH - deltaY);

        if (isText && isCorner) {
          const scaleX = newW / startW;
          const scaleY = newH / startH;
          const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
          const currentPx = Math.max(10, Math.min(144, Math.round(initialFontSize * scale)));
          selectedTarget.style.fontSize = currentPx + 'px';
          updateHighlightBox(selectedTarget, true);
          dimPillSpan.textContent = currentPx + 'px';
          sizeInput.value = currentPx + 'px';
        } else {
          const lockRatio = isCorner && me.shiftKey;
          if (lockRatio) {
            if (Math.abs(deltaX) >= Math.abs(deltaY)) newH = Math.max(20, newW / aspectRatio);
            else newW = Math.max(20, newH * aspectRatio);
          }
          selectedTarget.style.width = Math.round(newW) + 'px';
          if (!isText || lockRatio) selectedTarget.style.height = Math.round(newH) + 'px';
          updateHighlightBox(selectedTarget, true);
          dimPillSpan.textContent = Math.round(newW) + ' x ' + Math.round(newH) + (lockRatio ? ' (ratio)' : '');
          widthInput.value = Math.round(newW) + 'px';
          heightInput.value = Math.round(newH) + 'px';
        }
      };

      const onPointerUp = (ue) => {
        if (!isResizing || !selectedTarget) return;
        isResizing = false;
        selectedTarget.style.transition = prevTransition;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        const shouldSnap = isSnapEnabled && !lastBypassSnap && !(ue && (ue.ctrlKey || ue.metaKey));

        if (isText && isCorner) {
          const computedFs = parseFloat(selectedTarget.style.fontSize) || initialFontSize;
          selectedTarget.style.fontSize = '';

          const snapFont = (px) => {
            if (shouldSnap) {
              const steps = [
                [12, 'text-xs'], [14, 'text-sm'], [16, 'text-base'], [18, 'text-lg'],
                [20, 'text-xl'], [24, 'text-2xl'], [30, 'text-3xl'], [36, 'text-4xl'],
                [48, 'text-5xl'], [60, 'text-6xl'], [72, 'text-7xl'], [96, 'text-8xl']
              ];
              for (const [p, cls] of steps) {
                if (Math.abs(px - p) <= 2) return cls;
              }
            }
            return 'text-[' + Math.round(px) + 'px]';
          };

          applyOptimisticClass(snapFont(computedFs));
        } else {
          const finalRect = selectedTarget.getBoundingClientRect();
          const finalW = finalRect.width / canvasZoom;
          const finalH = finalRect.height / canvasZoom;
          selectedTarget.style.width = '';
          selectedTarget.style.height = '';

          const snapWidth = (w) => {
            if (shouldSnap) {
              const steps = [
                [64, 'w-16'], [80, 'w-20'], [96, 'w-24'], [128, 'w-32'], [160, 'w-40'],
                [192, 'w-48'], [224, 'w-56'], [256, 'w-64'], [288, 'w-72'], [320, 'w-80'], [384, 'w-96']
              ];
              for (const [px, cls] of steps) {
                if (Math.abs(w - px) <= 6) return cls;
              }
            }
            return 'w-[' + Math.round(w) + 'px]';
          };

          const snapHeight = (h) => {
            if (shouldSnap) {
              const steps = [
                [32, 'h-8'], [40, 'h-10'], [48, 'h-12'], [64, 'h-16'], [80, 'h-20'],
                [96, 'h-24'], [128, 'h-32'], [160, 'h-40'], [192, 'h-48'], [256, 'h-64']
              ];
              for (const [px, cls] of steps) {
                if (Math.abs(h - px) <= 5) return cls;
              }
            }
            return 'h-[' + Math.round(h) + 'px]';
          };

          if (resizeHandle.includes('r') || resizeHandle.includes('l') || (isCorner && ue && ue.shiftKey)) {
            applyOptimisticClass(snapWidth(finalW), true);
          }
          if ((!isText || (isCorner && ue && ue.shiftKey)) && (resizeHandle.includes('t') || resizeHandle.includes('b'))) {
            applyOptimisticClass(snapHeight(finalH), true);
          }
          pushHistory();
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  });

  // --- Interactive Canvas Rotation Handle ---
  let isRotating = false;
  rotateHandle.addEventListener('pointerdown', (e) => {
    if (!selectedTarget) return;
    e.stopPropagation();
    e.preventDefault();
    isRotating = true;

    const rect = selectedTarget.getBoundingClientRect();
    const prevTransition = selectedTarget.style.transition;
    selectedTarget.style.transition = 'none';
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let currentDeg = parseRotationDeg(selectedTarget.className || '');

    const onMove = (me) => {
      if (!isRotating || !selectedTarget) return;
      let angle = Math.round((Math.atan2(me.clientY - cy, me.clientX - cx) * 180) / Math.PI + 90);
      if (angle > 180) angle -= 360;
      if (angle < -180) angle += 360;
      if (me.shiftKey) angle = Math.round(angle / 15) * 15;
      currentDeg = angle;
      selectedTarget.style.transform = 'rotate(' + angle + 'deg)';
      dimPillSpan.textContent = angle + 'deg';
      rotateInput.value = angle + 'deg';
    };

    const onUp = (ue) => {
      if (!isRotating || !selectedTarget) return;
      isRotating = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      selectedTarget.style.transition = prevTransition;
      selectedTarget.style.transform = '';

      const shouldSnap = isSnapEnabled && !(ue && (ue.ctrlKey || ue.metaKey));
      const snapRotate = (deg) => {
        if (deg === 0) return 'rotate-0';
        if (shouldSnap) {
          const steps = [0, 1, 2, 3, 6, 12, 45, 90, 180];
          const abs = Math.abs(deg);
          for (const s of steps) {
            if (Math.abs(abs - s) <= 2) {
              return (deg < 0 && s > 0 ? '-rotate-' : 'rotate-') + s;
            }
          }
        }
        return 'rotate-[' + deg + 'deg]';
      };

      applyOptimisticClass(snapRotate(currentDeg));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // --- Full Recursive Layers Tree with Custom Flimsy Badges, Collapse/Expand, & Re-parenting ---
  function getLayerNodeKey(el) {
    return (el.getAttribute('data-flimsy-file') || '') + ':' +
      (el.getAttribute('data-flimsy-line') || '') + ':' +
      (el.getAttribute('data-flimsy-col') || '');
  }

  function renderFullLayersTree() {
    trailContainer.innerHTML = '';
    const allTagged = Array.from(document.querySelectorAll('[data-flimsy-file]'));
    if (allTagged.length === 0) {
      trailContainer.innerHTML = '<div style="font-size:10.5px; color:var(--ink-muted); padding:6px;">No components tagged.</div>';
      return;
    }

    const roots = allTagged.filter((el) => {
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement && parent !== document.body) {
        if (parent.hasAttribute('data-flimsy-file')) return false;
        parent = parent.parentElement;
      }
      return true;
    });

    function renderNode(el, depth = 0, parentTaggedEl = null) {
      const key = getLayerNodeKey(el);
      const isSelected = selectedTargets.includes(el);
      const isComp = isComponentBoundary(el, parentTaggedEl);
      const isText = !isComp && isTextElement(el);
      const comp = el.getAttribute('data-flimsy-comp');
      const name = el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase();

      const childTagged = allTagged.filter((c) => {
        let p = c.parentElement;
        while (p && p !== el) {
          if (p.hasAttribute('data-flimsy-file')) return false;
          p = p.parentElement;
        }
        return p === el;
      });

      const hasChildren = childTagged.length > 0;
      const isCollapsed = collapsedLayerKeys.has(key);

      const row = document.createElement('div');
      row.className = 'trail-item' + (isSelected ? ' active' : '') + (isComp ? ' is-component' : '');
      row.style.paddingLeft = (4 + depth * 11) + 'px';
      row.draggable = true;

      const badgeHtml = isComp
        ? '<span class="type-icon comp-icon" title="React Component">' + ICONS.compDiamond + '</span>'
        : (isText
          ? '<span class="type-icon text-icon" title="Text Layer">T</span>'
          : '<span class="type-icon frame-icon" title="Container">' + ICONS.frameBracket + '</span>');

      const caretHtml = hasChildren
        ? '<button class="caret-btn' + (isCollapsed ? ' collapsed' : '') + '" title="Toggle subtree">' + ICONS.chevronDown + '</button>'
        : '<span class="caret-spacer"></span>';

      const displayLabel = isComp && comp
        ? comp + '<span class="node-tag-dim">&lt;' + name + '&gt;</span>'
        : '<span style="font-family:ui-monospace,monospace; font-size:10.5px;">&lt;' + name + '&gt;</span>';

      row.innerHTML = \`
        \${caretHtml}
        <div class="trail-title">
          \${badgeHtml}
          <span class="node-name">\${displayLabel}</span>
        </div>
        <div class="trail-actions">
          <button class="trail-btn btn-up" title="Move Up">\${ICONS.up}</button>
          <button class="trail-btn btn-down" title="Move Down">\${ICONS.down}</button>
          <button class="trail-btn btn-dup" title="Duplicate (Ctrl+D)">\${ICONS.copy}</button>
          <button class="trail-btn btn-del" title="Delete (Del)">\${ICONS.trash}</button>
        </div>
      \`;

      const caretBtn = row.querySelector('.caret-btn');
      if (caretBtn) {
        caretBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (collapsedLayerKeys.has(key)) collapsedLayerKeys.delete(key);
          else collapsedLayerKeys.add(key);
          renderFullLayersTree();
        });
      }

      row.querySelector('.trail-title').addEventListener('click', (e) => selectElement(el, e.shiftKey));
      row.querySelector('.btn-up').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'up'); });
      row.querySelector('.btn-down').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'down'); });
      row.querySelector('.btn-dup').addEventListener('click', (e) => { e.stopPropagation(); duplicateSelectedElement(el); });
      row.querySelector('.btn-del').addEventListener('click', (e) => { e.stopPropagation(); deleteSelectedElement(el); });

      const clearDropClasses = () => row.classList.remove('drop-before', 'drop-inside', 'drop-after');

      row.addEventListener('dragstart', (e) => {
        draggedElement = el;
        row.style.opacity = '0.45';
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', key);
        }
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
        draggedElement = null;
        trailContainer.querySelectorAll('.trail-item').forEach((item) => {
          item.classList.remove('drop-before', 'drop-inside', 'drop-after');
        });
      });
      row.addEventListener('dragover', (e) => {
        if (!draggedElement || draggedElement === el) return;
        if (draggedElement.contains(el)) return;
        e.preventDefault();
        clearDropClasses();
        const r = row.getBoundingClientRect();
        const relY = (e.clientY - r.top) / (r.height || 1);
        const canNestInside = !VOID_TAGS.has(el.tagName.toLowerCase()) && !isTextElement(el);

        if (relY < 0.25) {
          activeDropPosition = 'before';
          row.classList.add('drop-before');
        } else if (relY > 0.75 || !canNestInside) {
          activeDropPosition = 'after';
          row.classList.add('drop-after');
        } else {
          activeDropPosition = 'inside';
          row.classList.add('drop-inside');
        }
      });
      row.addEventListener('dragleave', () => clearDropClasses());
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDropClasses();
        if (!draggedElement || draggedElement === el || draggedElement.contains(el)) return;

        const srcFile = draggedElement.getAttribute('data-flimsy-file');
        const dstFile = el.getAttribute('data-flimsy-file');
        if (srcFile && dstFile && srcFile === dstFile) {
          reparentElement(draggedElement, el, activeDropPosition);
        } else {
          const isAbove = el.compareDocumentPosition(draggedElement) & Node.DOCUMENT_POSITION_FOLLOWING;
          reorderElement(draggedElement, isAbove ? 'up' : 'down');
        }
      });

      trailContainer.appendChild(row);
      if (hasChildren && !isCollapsed) {
        childTagged.forEach((child) => renderNode(child, depth + 1, el));
      }
    }

    roots.forEach((root) => renderNode(root, 0, null));
  }

  async function reparentElement(sourceEl, targetEl, position) {
    if (!sourceEl || !targetEl) return;
    const file = sourceEl.getAttribute('data-flimsy-file');
    const line = parseInt(sourceEl.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(sourceEl.getAttribute('data-flimsy-col'), 10);
    const targetLine = parseInt(targetEl.getAttribute('data-flimsy-line'), 10);
    const targetColumn = parseInt(targetEl.getAttribute('data-flimsy-col'), 10);

    try {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = position === 'inside' ? 'Nesting layer...' : 'Moving layer...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          line,
          col,
          action: { type: 'reparent-element', targetLine, targetColumn, position },
        }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.style.color = '#15803d';
        syncStatus.textContent = 'Hierarchy updated.';
        setTimeout(() => {
          syncStatus.style.display = 'none';
          renderFullLayersTree();
        }, 900);
      } else {
        syncStatus.style.color = '#991b1b';
        syncStatus.textContent = data.error || 'Could not move layer.';
      }
    } catch {}
  }

  async function duplicateSelectedElement(target = selectedTarget) {
    if (!target) return;
    const file = target.getAttribute('data-flimsy-file');
    const line = parseInt(target.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(target.getAttribute('data-flimsy-col'), 10);

    try {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = 'Duplicating...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'duplicate-element' } }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.style.color = '#15803d';
        syncStatus.textContent = 'Duplicated.';
        setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
      }
    } catch {}
  }

  async function deleteSelectedElement(target = selectedTarget) {
    if (!target) return;
    const file = target.getAttribute('data-flimsy-file');
    const line = parseInt(target.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(target.getAttribute('data-flimsy-col'), 10);

    try {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#991b1b';
      syncStatus.textContent = 'Deleting...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'delete-element' } }),
      });
      const data = await res.json();
      if (data.success) {
        clearSelection();
      }
    } catch {}
  }

  async function reorderElement(target, direction) {
    if (!target) return;
    const file = target.getAttribute('data-flimsy-file');
    const line = parseInt(target.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(target.getAttribute('data-flimsy-col'), 10);

    try {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = 'Reordering...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'reorder-child', direction } }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.style.color = '#15803d';
        syncStatus.textContent = 'Reordered.';
        setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
      }
    } catch {}
  }

  async function checkFileMtime(file, el) {
    try {
      const res = await fetch('/__flimsy/api/inspect?file=' + encodeURIComponent(file));
      const data = await res.json();
      if (data.success) {
        fileMtime = data.mtime;
        if (el) {
          const st = getOrInitTargetState(el);
          st.fileMtime = data.mtime;
        }
      }
    } catch {}
  }

  // --- Figma-Style Select All Elements (Ctrl+A selects siblings/frames, never browser text) ---
  function getDirectTaggedChildren(parentEl) {
    const allTagged = Array.from(document.querySelectorAll('[data-flimsy-file]'));
    return allTagged.filter((el) => {
      if (parentEl && el === parentEl) return false;
      const nearestParent = findTaggedElement(el.parentElement);
      return parentEl ? nearestParent === parentEl : !nearestParent;
    });
  }

  function selectAllElements() {
    if (!isInspectActive) return;
    let group = [];

    if (selectedTarget) {
      let parentContainer = findTaggedElement(selectedTarget.parentElement);
      while (parentContainer) {
        const siblings = getDirectTaggedChildren(parentContainer);
        const alreadyAllSelected = siblings.length > 0 && siblings.every((s) => selectedTargets.includes(s));
        if (siblings.length > 1 && !alreadyAllSelected) {
          group = siblings;
          break;
        }
        parentContainer = findTaggedElement(parentContainer.parentElement);
      }
      if (group.length === 0) {
        const topLevel = getDirectTaggedChildren(null);
        group = topLevel.length === 1 ? getDirectTaggedChildren(topLevel[0]) : topLevel;
      }
    } else {
      const topLevel = getDirectTaggedChildren(null);
      if (topLevel.length === 1) {
        const children = getDirectTaggedChildren(topLevel[0]);
        group = children.length > 0 ? children : topLevel;
      } else {
        group = topLevel;
      }
    }

    if (group.length === 0) return;
    selectElement(group[0], false);
    for (let i = 1; i < group.length; i++) {
      selectElement(group[i], true);
    }
    syncStatus.style.display = 'block';
    syncStatus.style.color = '#09090b';
    syncStatus.textContent = 'Selected ' + group.length + ' element' + (group.length > 1 ? 's' : '');
    setTimeout(() => { syncStatus.style.display = 'none'; }, 1400);
  }

  // --- Element Selection (Single & Multi-Select + Smart Accordion Auto-Open) ---
  function selectElement(target, additive = false) {
    if (!target) return;
    if (selectedTarget && selectedTarget !== target) {
      selectedTarget.contentEditable = 'false';
    }

    if (additive && selectedTargets.length > 0) {
      const idx = selectedTargets.indexOf(target);
      if (idx !== -1) {
        if (selectedTargets.length === 1) {
          clearSelection();
          return;
        }
        selectedTargets.splice(idx, 1);
        selectedTarget = selectedTargets[selectedTargets.length - 1];
      } else {
        getOrInitTargetState(target);
        selectedTargets.push(target);
        selectedTarget = target;
      }
    } else {
      selectedTargets = [target];
      selectedTarget = target;
    }

    const st = getOrInitTargetState(selectedTarget);
    originalClasses = st.originalClasses;
    originalText = st.originalText;
    pendingText = st.pendingText;
    pendingClasses = st.pendingClasses;

    history = [selectedTargets.map((el) => {
      const s = getOrInitTargetState(el);
      return { el, classes: s.pendingClasses, text: s.pendingText };
    })];
    historyIdx = 0;
    updateUndoRedoUI();
    updateSyncBadge();
    updateAllSelectionBoxes();
    hoverOutline.style.display = 'none';

    const file = selectedTarget.getAttribute('data-flimsy-file') || '';
    const line = selectedTarget.getAttribute('data-flimsy-line') || '';
    const comp = selectedTarget.getAttribute('data-flimsy-comp') || '';
    const name = selectedTarget.getAttribute('data-flimsy-name') || selectedTarget.tagName.toLowerCase();
    const parentTagged = findTaggedElement(selectedTarget.parentElement);
    const isComp = isComponentBoundary(selectedTarget, parentTagged);

    elemTagDisplay.textContent = isComp && comp ? comp : ('<' + name + '>');
    elemTagDisplay.classList.toggle('is-comp', isComp);
    elemLocDisplay.textContent = file.split('/').pop() + ':' + line;
    elemLocDisplay.title = file + ':' + line;

    // Show inline Text row only when element is text-bearing
    textGroup.style.display = isTextElement(selectedTarget) ? 'flex' : 'none';

    // Smart auto-expand Stroke & Effects only when element already uses them
    const toks = pendingClasses.split(/\\s+/);
    const hasBorder = toks.some((t) => /^border($|-[1-9]|-[trbl]|-solid|-dashed|-dotted)/.test(t));
    const hasEffect = toks.some((t) => /^(shadow(?!-none)|blur(?!-none)|backdrop-blur(?!-none))/.test(t));
    setAccordionState('border', hasBorder);
    setAccordionState('effects', hasEffect);

    if (selectedTargets.length > 1) {
      instanceBadge.textContent = selectedTargets.length + ' selected';
      instanceBadge.title = 'Batch editing ' + selectedTargets.length + ' elements';
      instanceBadge.style.display = 'inline-block';
    } else {
      const matchingElements = document.querySelectorAll('[data-flimsy-file="' + file + '"]');
      if (matchingElements.length > 1) {
        instanceBadge.textContent = matchingElements.length + 'x';
        instanceBadge.title = matchingElements.length + ' instances on page';
        instanceBadge.style.display = 'inline-block';
      } else {
        instanceBadge.style.display = 'none';
      }
    }

    checkFileMtime(file, selectedTarget);

    textInput.value = pendingText !== null ? pendingText : originalText;
    classesRawInput.value = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    syncColorTriggerFromSelected();
    renderFullLayersTree();
    renderDiff();

    currentAICopyPrompt = '';
    if (aiFeedback) aiFeedback.style.display = 'none';

    syncStatus.style.display = 'none';
    syncBtn.disabled = false;
    panel.style.display = 'flex';
    syncLayersVisibility();
  }

  // --- Smooth Hover Detection + Alt Distance Guides ---
  window.addEventListener('mousemove', (e) => {
    if (!isInspectActive || isResizing || isRotating || isMarqueeDragging || isPanning || isMovingElements) return;
    if (isHandTool || isSpacePressed) {
      hoverOutline.style.display = 'none';
      clearMeasureGuides();
      return;
    }
    if (e.composedPath().includes(container)) {
      hoverOutline.style.display = 'none';
      clearMeasureGuides();
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      hoveredTarget = target;
      if (selectedTarget) {
        updateHoverBox(target);
        if (isAltPressed && target !== selectedTarget) {
          renderMeasureGuides(selectedTarget, target);
        } else {
          clearMeasureGuides();
        }
      } else {
        updateHighlightBox(target, false);
        hoverOutline.style.display = 'none';
      }
    } else {
      hoveredTarget = null;
      hoverOutline.style.display = 'none';
      clearMeasureGuides();
      if (!selectedTarget) highlightBox.style.display = 'none';
    }
  }, true);

  // --- Unified Canvas PointerDown: Hand Pan, Drag-to-Move (Freeform + Alt-Reparent), & Marquee ---
  let isMarqueeDragging = false;
  let marqueeSuppressClick = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;

  window.addEventListener('pointerdown', (e) => {
    if (!isInspectActive) return;
    if (e.composedPath().includes(container)) return;
    if (isResizing || isRotating) return;

    // 1. Hand Pan Mode (Middle-click OR Space+Drag OR Hand Tool)
    if (e.button === 1 || (e.button === 0 && (isHandTool || isSpacePressed))) {
      e.preventDefault();
      e.stopPropagation();
      isPanning = true;
      const panStartX = e.clientX;
      const panStartY = e.clientY;
      const initPanX = panX;
      const initPanY = panY;
      document.documentElement.style.cursor = 'grabbing';

      const onPanMove = (me) => {
        if (!isPanning) return;
        panX = initPanX + (me.clientX - panStartX);
        panY = initPanY + (me.clientY - panStartY);
        applyViewportCamera();
      };

      const onPanUp = () => {
        isPanning = false;
        marqueeSuppressClick = true;
        setTimeout(() => { marqueeSuppressClick = false; }, 50);
        document.documentElement.style.cursor = (isHandTool || isSpacePressed) ? 'grab' : '';
        window.removeEventListener('pointermove', onPanMove);
        window.removeEventListener('pointerup', onPanUp);
      };

      window.addEventListener('pointermove', onPanMove);
      window.addEventListener('pointerup', onPanUp);
      return;
    }

    if (e.button !== 0) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tagged = findTaggedElement(el);

    // 2. Canvas Drag-to-Move (dragging an already-selected element or group of elements)
    if (tagged && selectedTargets.includes(tagged) && !e.shiftKey && !tagged.isContentEditable) {
      const dragStartX = e.clientX;
      const dragStartY = e.clientY;
      const startPositions = selectedTargets.map((item) => ({
        el: item,
        pos: getElementPosXY(item),
        prevTransition: item.style.transition,
      }));
      let dropTargetEl = null;
      let dropPos = 'after';
      let isReparentMode = false;

      const onMoveDrag = (me) => {
        const rawDx = me.clientX - dragStartX;
        const rawDy = me.clientY - dragStartY;
        if (!isMovingElements && Math.hypot(rawDx, rawDy) > 5) {
          isMovingElements = true;
          startPositions.forEach((sp) => { sp.el.style.transition = 'none'; });
          hoverOutline.style.display = 'none';
          clearMeasureGuides();
        }
        if (!isMovingElements) return;

        // Alt + Drag on single selected element = Live Canvas DOM Reparenting
        isReparentMode = Boolean(me.altKey && selectedTargets.length === 1);
        if (isReparentMode) {
          const src = selectedTarget;
          const prevPE = src.style.pointerEvents;
          src.style.pointerEvents = 'none';
          const under = document.elementFromPoint(me.clientX, me.clientY);
          src.style.pointerEvents = prevPE;

          const candidate = findTaggedElement(under);
          if (candidate && candidate !== src && !src.contains(candidate)) {
            dropTargetEl = candidate;
            const r = candidate.getBoundingClientRect();
            const relY = (me.clientY - r.top) / (r.height || 1);
            const canNest = !VOID_TAGS.has(candidate.tagName.toLowerCase()) && !isTextElement(candidate);

            canvasDropGuide.style.display = 'block';
            if (relY < 0.25) {
              dropPos = 'before';
              canvasDropGuide.className = 'canvas-drop-guide mode-line';
              canvasDropGuide.style.left = r.left + 'px';
              canvasDropGuide.style.top = (r.top - 2) + 'px';
              canvasDropGuide.style.width = r.width + 'px';
              canvasDropGuide.style.height = '3px';
            } else if (relY > 0.75 || !canNest) {
              dropPos = 'after';
              canvasDropGuide.className = 'canvas-drop-guide mode-line';
              canvasDropGuide.style.left = r.left + 'px';
              canvasDropGuide.style.top = (r.bottom - 1) + 'px';
              canvasDropGuide.style.width = r.width + 'px';
              canvasDropGuide.style.height = '3px';
            } else {
              dropPos = 'inside';
              canvasDropGuide.className = 'canvas-drop-guide mode-inside';
              canvasDropGuide.style.left = r.left + 'px';
              canvasDropGuide.style.top = r.top + 'px';
              canvasDropGuide.style.width = r.width + 'px';
              canvasDropGuide.style.height = r.height + 'px';
            }
            dimPillSpan.textContent = dropPos === 'inside'
              ? ('Drop inside <' + candidate.tagName.toLowerCase() + '>')
              : ('Move ' + dropPos + ' <' + candidate.tagName.toLowerCase() + '>');
          } else {
            dropTargetEl = null;
            canvasDropGuide.style.display = 'none';
          }
          return;
        }

        // Standard Freeform Canvas Drag-to-Move (zoom-compensated, Shift constrains axis)
        canvasDropGuide.style.display = 'none';
        dropTargetEl = null;
        let dx = rawDx / canvasZoom;
        let dy = rawDy / canvasZoom;
        if (me.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }

        for (const sp of startPositions) {
          setElementPosAxis(sp.el, 'x', sp.pos.x + dx);
          setElementPosAxis(sp.el, 'y', sp.pos.y + dy);
        }

        const primarySt = getOrInitTargetState(selectedTarget);
        pendingClasses = primarySt.pendingClasses;
        classesRawInput.value = pendingClasses;
        updateAllSelectionBoxes();
        const p = getElementPosXY(selectedTarget);
        posXInput.value = Math.round(p.x) + 'px';
        posYInput.value = Math.round(p.y) + 'px';
        dimPillSpan.textContent = 'x: ' + Math.round(p.x) + 'px, y: ' + Math.round(p.y) + 'px';
      };

      const onUpDrag = () => {
        window.removeEventListener('pointermove', onMoveDrag);
        window.removeEventListener('pointerup', onUpDrag);
        if (!isMovingElements) return;

        isMovingElements = false;
        marqueeSuppressClick = true;
        setTimeout(() => { marqueeSuppressClick = false; }, 50);
        canvasDropGuide.style.display = 'none';
        startPositions.forEach((sp) => { sp.el.style.transition = sp.prevTransition; });

        if (isReparentMode && dropTargetEl && selectedTarget) {
          const srcFile = selectedTarget.getAttribute('data-flimsy-file');
          const dstFile = dropTargetEl.getAttribute('data-flimsy-file');
          if (srcFile && dstFile && srcFile === dstFile) {
            reparentElement(selectedTarget, dropTargetEl, dropPos);
          } else {
            syncStatus.style.display = 'block';
            syncStatus.style.color = '#991b1b';
            syncStatus.textContent = 'Use Ctrl+C / Ctrl+V to move across different files.';
            setTimeout(() => { syncStatus.style.display = 'none'; }, 2000);
          }
          return;
        }

        updateActiveSegmentedUI(pendingClasses);
        updateAllSelectionBoxes();
        pushHistory();
      };

      window.addEventListener('pointermove', onMoveDrag);
      window.addEventListener('pointerup', onUpDrag);
      return;
    }

    // 3. Marquee Multi-Selection on Empty Canvas Space (or Shift+Drag)
    if (tagged && !e.shiftKey) return;

    marqueeStartX = e.clientX;
    marqueeStartY = e.clientY;

    const onMove = (me) => {
      const dx = me.clientX - marqueeStartX;
      const dy = me.clientY - marqueeStartY;
      if (!isMarqueeDragging && Math.hypot(dx, dy) > 8) {
        isMarqueeDragging = true;
        marqueeBox.style.display = 'block';
      }
      if (!isMarqueeDragging) return;

      marqueeBox.style.left = Math.min(marqueeStartX, me.clientX) + 'px';
      marqueeBox.style.top = Math.min(marqueeStartY, me.clientY) + 'px';
      marqueeBox.style.width = Math.abs(dx) + 'px';
      marqueeBox.style.height = Math.abs(dy) + 'px';
    };

    const onUp = (ue) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!isMarqueeDragging) return;

      isMarqueeDragging = false;
      marqueeSuppressClick = true;
      setTimeout(() => { marqueeSuppressClick = false; }, 50);
      marqueeBox.style.display = 'none';

      const mLeft = Math.min(marqueeStartX, ue.clientX);
      const mTop = Math.min(marqueeStartY, ue.clientY);
      const mRight = Math.max(marqueeStartX, ue.clientX);
      const mBottom = Math.max(marqueeStartY, ue.clientY);

      const allTagged = Array.from(document.querySelectorAll('[data-flimsy-file]'));
      const matched = allTagged.filter((node) => {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const intersects = !(r.right < mLeft || r.left > mRight || r.bottom < mTop || r.top > mBottom);
        if (!intersects) return false;
        const engulfs = r.left <= mLeft && r.right >= mRight && r.top <= mTop && r.bottom >= mBottom;
        return !engulfs;
      });

      if (matched.length > 0) {
        selectElement(matched[0], false);
        for (let i = 1; i < matched.length; i++) {
          selectElement(matched[i], true);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, true);

  // --- Click & Double-Click Selection ---
  window.addEventListener('click', (e) => {
    if (!isInspectActive || marqueeSuppressClick) return;
    if (e.composedPath().includes(container)) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      selectElement(target, e.shiftKey);
    } else if (selectedTarget) {
      clearSelection();
    }
  }, true);

  window.addEventListener('dblclick', (e) => {
    if (!isInspectActive) return;
    if (e.composedPath().includes(container)) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      selectElement(target, false);

      target.contentEditable = 'true';
      target.focus();

      const onBlur = () => {
        target.contentEditable = 'false';
        const newText = target.innerText.trim();
        pendingText = newText;
        const st = getOrInitTargetState(target);
        st.pendingText = newText;
        textInput.value = newText;
        pushHistory();
        target.removeEventListener('blur', onBlur);
      };
      target.addEventListener('blur', onBlur);

      const onKey = (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          target.blur();
          target.removeEventListener('keydown', onKey);
        }
      };
      target.addEventListener('keydown', onKey);
    }
  }, true);

  const syncViewportBoxes = () => {
    if (selectedTarget) updateAllSelectionBoxes();
    else if (hoveredTarget) updateHighlightBox(hoveredTarget, false);
    if (isAltPressed && selectedTarget && hoveredTarget && hoveredTarget !== selectedTarget) {
      renderMeasureGuides(selectedTarget, hoveredTarget);
    }
  };
  window.addEventListener('scroll', syncViewportBoxes, { passive: true });
  window.addEventListener('resize', syncViewportBoxes, { passive: true });

  // --- Compact Numeric Field & Select Handlers ---
  function normalizeLengthToken(prefix, rawVal) {
    const val = rawVal.trim().toLowerCase();
    if (!val) return null;
    if (['auto', 'full', 'fit', 'screen'].includes(val)) return prefix + '-' + val;
    if (/^\\d+$/.test(val)) {
      const px = parseInt(val, 10);
      if (isSnapEnabled && px % 4 === 0 && TW_SPACING[String(px / 4)]) {
        return prefix + '-' + (px / 4);
      }
      return prefix + '-[' + px + 'px]';
    }
    if (/^\\d+px$/.test(val)) {
      const px = parseInt(val, 10);
      if (isSnapEnabled && px % 4 === 0 && TW_SPACING[String(px / 4)]) {
        return prefix + '-' + (px / 4);
      }
      return prefix + '-[' + val + ']';
    }
    if (TW_SPACING[val]) return prefix + '-' + val;
    return prefix + '-[' + val + ']';
  }

  widthInput.addEventListener('change', () => {
    const cls = normalizeLengthToken('w', widthInput.value);
    if (cls) applyOptimisticClass(cls);
  });

  heightInput.addEventListener('change', () => {
    const cls = normalizeLengthToken('h', heightInput.value);
    if (cls) applyOptimisticClass(cls);
  });

  posXInput.addEventListener('change', () => {
    if (!selectedTarget) return;
    const px = parseInt(posXInput.value.trim().replace(/px$/i, ''), 10);
    if (Number.isNaN(px)) return;
    selectedTargets.forEach((el) => setElementPosAxis(el, 'x', px));
    const st = getOrInitTargetState(selectedTarget);
    pendingClasses = st.pendingClasses;
    classesRawInput.value = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateAllSelectionBoxes();
    pushHistory();
  });

  posYInput.addEventListener('change', () => {
    if (!selectedTarget) return;
    const px = parseInt(posYInput.value.trim().replace(/px$/i, ''), 10);
    if (Number.isNaN(px)) return;
    selectedTargets.forEach((el) => setElementPosAxis(el, 'y', px));
    const st = getOrInitTargetState(selectedTarget);
    pendingClasses = st.pendingClasses;
    classesRawInput.value = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateAllSelectionBoxes();
    pushHistory();
  });

  gapInput.addEventListener('change', () => {
    const cls = normalizeLengthToken('gap', gapInput.value);
    if (!cls) return;
    if (selectedTarget && !/\\b(flex|inline-flex|grid|inline-grid)\\b/.test(selectedTarget.className || '')) {
      applyOptimisticClass('flex', true);
    }
    applyOptimisticClass(cls);
  });

  padInput.addEventListener('change', () => {
    const cls = normalizeLengthToken('p', padInput.value);
    if (cls) applyOptimisticClass(cls);
  });

  radiusInput.addEventListener('change', () => {
    const val = radiusInput.value.trim().toLowerCase();
    if (!val) return;
    if (val === '0' || val === '0px' || val === 'none') return applyOptimisticClass('rounded-none');
    if (['sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].includes(val)) return applyOptimisticClass('rounded-' + val);
    const px = parseInt(val, 10);
    if (!Number.isNaN(px)) {
      const map = { 2: 'rounded-sm', 4: 'rounded', 6: 'rounded-md', 8: 'rounded-lg', 12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl' };
      if (isSnapEnabled && map[px]) return applyOptimisticClass(map[px]);
      return applyOptimisticClass('rounded-[' + px + 'px]');
    }
    applyOptimisticClass('rounded-[' + val + ']');
  });

  sizeInput.addEventListener('change', () => {
    const val = sizeInput.value.trim().toLowerCase();
    if (!val) return;
    if (TW_FONT_SIZE[val]) return applyOptimisticClass('text-' + val);
    const px = parseInt(val, 10);
    if (!Number.isNaN(px)) {
      const steps = [[12, 'text-xs'], [14, 'text-sm'], [16, 'text-base'], [18, 'text-lg'], [20, 'text-xl'], [24, 'text-2xl'], [30, 'text-3xl'], [36, 'text-4xl'], [48, 'text-5xl']];
      if (isSnapEnabled) {
        const hit = steps.find(([p]) => p === px);
        if (hit) return applyOptimisticClass(hit[1]);
      }
      return applyOptimisticClass('text-[' + px + 'px]');
    }
  });

  weightSelect.addEventListener('change', () => applyOptimisticClass(weightSelect.value));
  leadingSelect.addEventListener('change', () => applyOptimisticClass(leadingSelect.value));
  trackingSelect.addEventListener('change', () => applyOptimisticClass(trackingSelect.value));

  textInput.addEventListener('input', () => {
    if (!selectedTarget) return;
    pendingText = textInput.value;
    const st = getOrInitTargetState(selectedTarget);
    st.pendingText = pendingText;
    selectedTarget.innerText = textInput.value;
    updateAllSelectionBoxes();
    pushHistory();
  });

  classesRawInput.addEventListener('input', () => {
    if (!selectedTarget) return;
    pendingClasses = classesRawInput.value;
    ensurePreviewRulesForClasses(pendingClasses);
    selectedTarget.className = pendingClasses;
    const st = getOrInitTargetState(selectedTarget);
    st.pendingClasses = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateAllSelectionBoxes();
    pushHistory();
  });

  panel.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = btn.getAttribute('data-class');
      if (!cls) return;
      if (btn.getAttribute('data-auto-flex') === '1' && selectedTarget) {
        const hasFlexOrGrid = /\\b(flex|inline-flex|grid|inline-grid)\\b/.test(selectedTarget.className || '');
        if (!hasFlexOrGrid) applyOptimisticClass('flex', true);
      }
      applyOptimisticClass(cls);
    });
  });

  panel.querySelectorAll('.align-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      if (!selectedTarget) return;
      const hasFlexOrGrid = /\\b(flex|inline-flex|grid|inline-grid)\\b/.test(selectedTarget.className || '');
      if (!hasFlexOrGrid) applyOptimisticClass('flex', true);
      const alignPairs = (cell.getAttribute('data-align') || '').split(' ');
      alignPairs.forEach((cls) => applyOptimisticClass(cls, true));
      pushHistory();
    });
  });

  opacitySlider.addEventListener('input', () => {
    const val = parseInt(opacitySlider.value, 10);
    opacityValLabel.textContent = val + '%';
    const standardSteps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    const cls = standardSteps.includes(val) ? ('opacity-' + val) : ('opacity-[' + val + '%]');
    applyOptimisticClass(cls, true);
  });
  opacitySlider.addEventListener('change', () => pushHistory());

  rotateInput.addEventListener('change', () => {
    const raw = rotateInput.value.trim().replace(/deg$/i, '');
    const deg = parseInt(raw, 10);
    if (Number.isNaN(deg)) return;
    const cls = deg === 0 ? 'rotate-0' : ('rotate-[' + deg + 'deg]');
    applyOptimisticClass(cls);
  });

  // --- 2D Spectrum Color Picker Modal ---
  function hsvToRgb(h, s, v) {
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

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function drawColorCanvas(hue) {
    const ctx = colorCanvas.getContext('2d');
    const w = colorCanvas.width;
    const h = colorCanvas.height;

    ctx.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
    ctx.fillRect(0, 0, w, h);

    const gradWhite = ctx.createLinearGradient(0, 0, w, 0);
    gradWhite.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradWhite.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, w, h);

    const gradBlack = ctx.createLinearGradient(0, 0, 0, h);
    gradBlack.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradBlack.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, w, h);
  }

  function updateColorFromHsv(skipHistory = false) {
    const [h, s, v] = currentColorHsv;
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);

    colorThumb.style.background = hex;
    colorHexLabel.textContent = hex.toUpperCase();
    colorOpacityLabel.textContent = currentColorAlpha + '%';
    modalHexInput.value = hex.toUpperCase();
    modalAlphaText.textContent = currentColorAlpha + '%';

    const wrapRect = colorCanvasWrap.getBoundingClientRect();
    if (wrapRect.width) {
      canvasThumb.style.left = (s / 100 * wrapRect.width) + 'px';
      canvasThumb.style.top = ((100 - v) / 100 * wrapRect.height) + 'px';
    }

    applyActiveColor(hex, currentColorAlpha, skipHistory);
  }

  function applyActiveColor(hex, opacityVal = 100, skipHistory = false) {
    if (!selectedTarget) return;
    let targetPrefix = 'bg-';
    if (activeColorTarget === 'text') targetPrefix = 'text-';
    if (activeColorTarget === 'stroke') targetPrefix = 'border-';

    let normalizedHex = hex;
    if (hex && hex.startsWith('rgb')) {
      const parsed = rgbStringToHexAndAlpha(hex);
      if (parsed) normalizedHex = parsed.hex;
    }

    let classToAdd = '';
    if (normalizedHex === 'transparent') {
      classToAdd = targetPrefix + 'transparent';
    } else {
      const alphaSuffix = opacityVal < 100 ? '/' + opacityVal : '';
      classToAdd = targetPrefix + '[' + normalizedHex + ']' + alphaSuffix;
    }

    if (activeColorTarget === 'stroke') {
      applyOptimisticClass('border', true);
    }

    applyOptimisticClass(classToAdd, skipHistory);
  }

  function populateDocumentColors() {
    docColorsGrid.innerHTML = '';
    const colors = new Set(['#ffffff', '#09090b', '#f4f4f5', '#71717a', '#0ea5e9', '#10b981', '#7c3aed', '#f43f5e']);

    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length && colors.size < 16; i++) {
      const el = all[i];
      if (el.id === 'flimsy-root' || el.closest('#flimsy-root')) continue;
      const s = window.getComputedStyle(el);
      const parsed = rgbStringToHexAndAlpha(s.backgroundColor);
      if (parsed) colors.add(parsed.hex);
    }

    colors.forEach((c) => {
      const chip = document.createElement('div');
      chip.className = 'doc-chip';
      chip.style.background = c;
      chip.title = c;
      chip.addEventListener('click', () => {
        colorThumb.style.background = c;
        colorHexLabel.textContent = c.toUpperCase();
        modalHexInput.value = c.toUpperCase();
        applyActiveColor(c, currentColorAlpha, false);
      });
      docColorsGrid.appendChild(chip);
    });
  }

  let isCanvasDragging = false;
  function handleCanvasPointer(e) {
    const rect = colorCanvasWrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    currentColorHsv[1] = Math.round((x / rect.width) * 100);
    currentColorHsv[2] = Math.round((1 - y / rect.height) * 100);

    canvasThumb.style.left = x + 'px';
    canvasThumb.style.top = y + 'px';

    updateColorFromHsv(true);
  }

  colorCanvasWrap.addEventListener('pointerdown', (e) => {
    isCanvasDragging = true;
    const prevTransitions = selectedTargets.map((el) => [el, el.style.transition]);
    selectedTargets.forEach((el) => { el.style.transition = 'none'; });
    handleCanvasPointer(e);
    const onMove = (me) => { if (isCanvasDragging) handleCanvasPointer(me); };
    const onUp = () => {
      isCanvasDragging = false;
      prevTransitions.forEach(([el, prev]) => { el.style.transition = prev; });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      pushHistory();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  hueSlider.addEventListener('input', () => {
    currentColorHsv[0] = parseInt(hueSlider.value, 10);
    drawColorCanvas(currentColorHsv[0]);
    updateColorFromHsv(true);
  });
  hueSlider.addEventListener('change', () => pushHistory());

  alphaSlider.addEventListener('input', () => {
    currentColorAlpha = parseInt(alphaSlider.value, 10);
    modalAlphaText.textContent = currentColorAlpha + '%';
    updateColorFromHsv(true);
  });
  alphaSlider.addEventListener('change', () => pushHistory());

  modalHexInput.addEventListener('change', () => {
    let val = modalHexInput.value.trim();
    if (val && !val.startsWith('#') && val.toLowerCase() !== 'transparent') val = '#' + val;
    colorThumb.style.background = val;
    colorHexLabel.textContent = val.toUpperCase();
    applyActiveColor(val, currentColorAlpha, false);
  });

  eyedropperBtn.addEventListener('click', async () => {
    if (window.EyeDropper) {
      try {
        const eye = new window.EyeDropper();
        const res = await eye.open();
        if (res && res.sRGBHex) {
          modalHexInput.value = res.sRGBHex.toUpperCase();
          colorThumb.style.background = res.sRGBHex;
          colorHexLabel.textContent = res.sRGBHex.toUpperCase();
          applyActiveColor(res.sRGBHex, currentColorAlpha, false);
        }
      } catch {}
    } else {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = 'Eyedropper unsupported in this browser.';
      setTimeout(() => { syncStatus.style.display = 'none'; }, 1600);
    }
  });

  colorTrigger.addEventListener('click', () => {
    const isHidden = colorModal.style.display === 'none' || !colorModal.style.display;
    colorModal.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      fontModal.style.display = 'none';
      syncColorTriggerFromSelected();
      drawColorCanvas(currentColorHsv[0]);
      populateDocumentColors();
      const wrapRect = colorCanvasWrap.getBoundingClientRect();
      if (wrapRect.width) {
        canvasThumb.style.left = (currentColorHsv[1] / 100 * wrapRect.width) + 'px';
        canvasThumb.style.top = ((100 - currentColorHsv[2]) / 100 * wrapRect.height) + 'px';
      }
    }
  });

  colorCloseBtn.addEventListener('click', () => { colorModal.style.display = 'none'; });

  const switchColorTarget = (mode) => {
    activeColorTarget = mode;
    targetFillBtn.classList.toggle('active', mode === 'fill');
    targetTextBtn.classList.toggle('active', mode === 'text');
    targetStrokeBtn.classList.toggle('active', mode === 'stroke');
    syncColorTriggerFromSelected();
  };
  targetFillBtn.addEventListener('click', () => switchColorTarget('fill'));
  targetTextBtn.addEventListener('click', () => switchColorTarget('text'));
  targetStrokeBtn.addEventListener('click', () => switchColorTarget('stroke'));

  // --- Searchable Typography Font Modal ---
  function renderFontList(query = '') {
    fontListContainer.innerHTML = '';
    const filtered = FONTS.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
    filtered.forEach((font) => {
      const row = document.createElement('div');
      row.className = 'font-row' + (currentFontName.textContent === font.name ? ' active' : '');
      row.style.fontFamily = font.family;
      row.innerHTML = \`
        <span>\${font.name}</span>
        <span style="font-size:9.5px; opacity:0.55; font-family:Inter, sans-serif;">\${font.category}</span>
      \`;
      row.addEventListener('click', () => {
        currentFontName.textContent = font.name;
        fontModal.style.display = 'none';

        if (!font.category.includes('System')) {
          const fontId = 'flimsy-font-' + font.name.replace(/\\s+/g, '-').toLowerCase();
          if (!document.getElementById(fontId)) {
            const link = document.createElement('link');
            link.id = fontId;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(font.name) + ':wght@400;500;600;700&display=swap';
            document.head.appendChild(link);
          }
        }

        const fontClass = font.category.includes('System')
          ? (font.name.includes('Mono') ? 'font-mono' : font.name.includes('Serif') ? 'font-serif' : 'font-sans')
          : "font-['" + font.name.replace(/\\s+/g, '_') + "']";

        applyOptimisticClass(fontClass);
      });
      fontListContainer.appendChild(row);
    });
  }

  fontTrigger.addEventListener('click', () => {
    const isHidden = fontModal.style.display === 'none' || !fontModal.style.display;
    fontModal.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      colorModal.style.display = 'none';
      fontSearch.value = '';
      renderFontList();
      fontSearch.focus();
    }
  });

  fontSearch.addEventListener('input', () => renderFontList(fontSearch.value));
  fontCloseBtn.addEventListener('click', () => { fontModal.style.display = 'none'; });

  // --- Per-Side Padding, Independent Corners, & Individual Border Sides ---
  padLinkBtn.addEventListener('click', () => {
    isPaddingLinked = !isPaddingLinked;
    padLinkBtn.classList.toggle('active', !isPaddingLinked);
    padGrid.style.display = isPaddingLinked ? 'none' : 'grid';
  });

  radLinkBtn.addEventListener('click', () => {
    isRadiusLinked = !isRadiusLinked;
    radLinkBtn.classList.toggle('active', !isRadiusLinked);
    radGrid.style.display = isRadiusLinked ? 'none' : 'grid';
  });

  borderSideBtn.addEventListener('click', () => {
    isBorderSidesLinked = !isBorderSidesLinked;
    borderSideBtn.classList.toggle('active', !isBorderSidesLinked);
    borderSideGrid.style.display = isBorderSidesLinked ? 'none' : 'grid';
  });

  ['pad-top', 'pad-right', 'pad-bottom', 'pad-left'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id);
    const prefixes = ['pt-', 'pr-', 'pb-', 'pl-'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          const cls = /^\\d+$/.test(val) ? prefixes[idx] + val : prefixes[idx] + '[' + val + ']';
          applyOptimisticClass(cls);
        }
      });
    }
  });

  ['rad-tl', 'rad-tr', 'rad-br', 'rad-bl'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id);
    const prefixes = ['rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          const cls = /^\\d+px$/.test(val) ? (prefixes[idx] + '[' + val + ']') : (prefixes[idx] + val);
          applyOptimisticClass(cls);
        }
      });
    }
  });

  ['bdr-t', 'bdr-r', 'bdr-b', 'bdr-l'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id);
    const sides = ['t', 'r', 'b', 'l'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (!val) return;
        const side = sides[idx];
        let cls = '';
        if (val === '1' || val === '1px') cls = 'border-' + side;
        else if (/^(0|2|4|8)$/.test(val)) cls = 'border-' + side + '-' + val;
        else cls = 'border-' + side + '-[' + (/^\\d+$/.test(val) ? val + 'px' : val) + ']';
        applyOptimisticClass(cls);
      });
    }
  });

  // --- AI Assist Controls ---
  aiToggle.addEventListener('click', () => toggleAIDrawer());

  panel.querySelectorAll('.ai-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      aiInput.value = chip.getAttribute('data-prompt') || '';
    });
  });

  aiGenerate.addEventListener('click', async () => {
    if (!selectedTarget) return;
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    aiGenerate.disabled = true;
    aiGenerate.textContent = 'Applying...';
    aiFeedback.style.display = 'block';
    aiFeedback.textContent = 'Generating suggestion...';

    const file = selectedTarget.getAttribute('data-flimsy-file');
    const line = parseInt(selectedTarget.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(selectedTarget.getAttribute('data-flimsy-col'), 10);

    try {
      const res = await fetch('/__flimsy/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, prompt }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.suggestion && data.suggestion.suggestedClasses) {
          const newTokens = data.suggestion.suggestedClasses.split(/\\s+/).filter(Boolean);
          const oldTokens = (data.context?.currentClasses || '').split(/\\s+/).filter(Boolean);
          const addedTokens = newTokens.filter((t) => !oldTokens.includes(t));
          if (addedTokens.length > 0) {
            addedTokens.forEach((cls) => applyOptimisticClass(cls, true));
            pushHistory();
          }
        }
        currentAICopyPrompt = data.copyPrompt || '';
        aiFeedback.textContent = 'Applied: ' + (data.suggestion?.explanation || 'Done.');
      } else {
        aiFeedback.textContent = 'Error: ' + (data.error || 'Failed');
      }
    } catch (err) {
      aiFeedback.textContent = 'Network error contacting AI assist.';
    } finally {
      aiGenerate.disabled = false;
      aiGenerate.textContent = 'Apply';
    }
  });

  aiCopy.addEventListener('click', async () => {
    if (!selectedTarget) return;
    const prompt = aiInput.value.trim() || 'Enhance this element design';
    const file = selectedTarget.getAttribute('data-flimsy-file');
    const line = parseInt(selectedTarget.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(selectedTarget.getAttribute('data-flimsy-col'), 10);

    if (!currentAICopyPrompt) {
      try {
        const res = await fetch('/__flimsy/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file, line, col, prompt }),
        });
        const data = await res.json();
        if (data.success && data.copyPrompt) currentAICopyPrompt = data.copyPrompt;
      } catch {}
    }

    const fallbackPrompt = 'Target: ' + file + ':' + line + ':' + col + '\\nClasses: ' + pendingClasses + '\\nGoal: ' + prompt;
    const textToCopy = currentAICopyPrompt || fallbackPrompt;

    try {
      await navigator.clipboard.writeText(textToCopy);
      aiFeedback.style.display = 'block';
      aiFeedback.textContent = 'Copied to clipboard.';
      setTimeout(() => { aiFeedback.style.display = 'none'; }, 1800);
    } catch {
      aiFeedback.style.display = 'block';
      aiFeedback.textContent = 'Clipboard permission denied.';
    }
  });

  // --- Reset / Discard ---
  discardBtn.addEventListener('click', () => {
    if (selectedTargets.length === 0) return;
    for (const el of selectedTargets) {
      const st = getOrInitTargetState(el);
      st.pendingClasses = st.originalClasses;
      st.pendingText = null;
      el.className = st.originalClasses;
      if (el === selectedTarget) el.innerText = st.originalText;
    }
    pendingClasses = originalClasses;
    pendingText = null;
    classesRawInput.value = originalClasses;
    textInput.value = originalText;
    updateActiveSegmentedUI(originalClasses);
    syncColorTriggerFromSelected();
    updateAllSelectionBoxes();
    history = [selectedTargets.map((el) => {
      const s = getOrInitTargetState(el);
      return { el, classes: s.pendingClasses, text: s.pendingText };
    })];
    historyIdx = 0;
    updateUndoRedoUI();
    renderDiff();
    updateSyncBadge();
    syncStatus.style.display = 'block';
    syncStatus.style.color = '#52525b';
    syncStatus.textContent = 'Changes reset.';
    setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
  });

  // --- Exact Class Diff Helper ---
  function buildClassUpdateAction(origCls, nextCls) {
    const oldTokens = (origCls || '').split(/\\s+/).filter(Boolean);
    const newTokens = (nextCls || '').split(/\\s+/).filter(Boolean);
    const added = newTokens.filter((t) => !oldTokens.includes(t));
    const removed = oldTokens.filter((t) => !newTokens.includes(t));
    return {
      type: 'update-class',
      newClasses: added.join(' '),
      removeClasses: removed,
      mode: 'reconcile',
    };
  }

  // --- Manual Sync Action (Shift+S / Ctrl+S / Button Click) ---
  async function syncToCode() {
    if (!selectedTarget || selectedTargets.length === 0) return;

    const dirtyUpdates = [];
    for (const el of selectedTargets) {
      const st = getOrInitTargetState(el);
      const actions = [];
      if (st.pendingText !== null && st.pendingText !== st.originalText) {
        actions.push({ type: 'update-text', text: st.pendingText });
      }
      if (st.pendingClasses !== st.originalClasses) {
        actions.push(buildClassUpdateAction(st.originalClasses, st.pendingClasses));
      }
      if (actions.length > 0) {
        dirtyUpdates.push({
          el,
          st,
          file: el.getAttribute('data-flimsy-file'),
          line: parseInt(el.getAttribute('data-flimsy-line'), 10),
          col: parseInt(el.getAttribute('data-flimsy-col'), 10),
          actions,
        });
      }
    }

    if (dirtyUpdates.length === 0) {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#52525b';
      syncStatus.textContent = 'No changes to sync.';
      setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
      return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    dockSyncBadge.querySelector('.text').textContent = 'Syncing...';
    syncStatus.style.display = 'none';

    try {
      const isBatch = dirtyUpdates.length > 1;
      const payload = isBatch
        ? {
            updates: dirtyUpdates.map((u) => ({
              file: u.file,
              line: u.line,
              col: u.col,
              actions: u.actions,
            })),
          }
        : {
            file: dirtyUpdates[0].file,
            line: dirtyUpdates[0].line,
            col: dirtyUpdates[0].col,
            actions: dirtyUpdates[0].actions,
            expectedMtime: dirtyUpdates[0].st.fileMtime || fileMtime || undefined,
          };

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        for (const u of dirtyUpdates) {
          u.st.originalClasses = u.st.pendingClasses;
          if (u.st.pendingText !== null) u.st.originalText = u.st.pendingText;
          u.st.pendingText = null;
          u.st.fileMtime = data.mtime || u.st.fileMtime;
        }
        const primarySt = getOrInitTargetState(selectedTarget);
        originalClasses = primarySt.originalClasses;
        originalText = primarySt.originalText;
        pendingClasses = primarySt.pendingClasses;
        pendingText = primarySt.pendingText;
        fileMtime = data.mtime || fileMtime;

        history = [selectedTargets.map((el) => {
          const s = getOrInitTargetState(el);
          return { el, classes: s.pendingClasses, text: s.pendingText };
        })];
        historyIdx = 0;
        updateUndoRedoUI();
        renderDiff();

        syncStatus.style.display = 'block';
        syncStatus.style.color = '#15803d';
        syncStatus.textContent = isBatch
          ? ('Synced ' + dirtyUpdates.length + ' elements')
          : ('Synced to ' + dirtyUpdates[0].file.split('/').pop() + ':' + dirtyUpdates[0].line);
        dockSyncBadge.className = 'sync-status-badge synced';
        dockSyncBadge.querySelector('.text').textContent = 'Synced';
        syncBtn.textContent = 'In Sync';
        syncBtn.disabled = false;
        setTimeout(() => {
          updateSyncBadge();
          syncStatus.style.display = 'none';
        }, 1600);
      } else if (data.conflict && !isBatch) {
        const u = dirtyUpdates[0];
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#b45309';
        syncStatus.textContent = 'Conflict: ' + data.error;
        syncBtn.textContent = 'Force Overwrite';
        syncBtn.disabled = false;
        const onForce = async () => {
          syncBtn.removeEventListener('click', onForce);
          await fetch('/__flimsy/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: u.file, line: u.line, col: u.col, actions: u.actions, force: true }),
          });
          u.st.originalClasses = u.st.pendingClasses;
          originalClasses = u.st.originalClasses;
          syncBtn.textContent = 'Overwritten';
          updateSyncBadge();
        };
        syncBtn.addEventListener('click', onForce, { once: true });
      } else {
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#991b1b';
        syncStatus.textContent = 'Error: ' + (data.error || 'Sync failed');
        syncBtn.textContent = 'Retry Sync (Shift+S)';
        syncBtn.disabled = false;
      }
    } catch (err) {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#991b1b';
      syncStatus.textContent = 'Network error syncing.';
      syncBtn.textContent = 'Retry Sync (Shift+S)';
      syncBtn.disabled = false;
    }
  }

  syncBtn.addEventListener('click', () => syncToCode());
})();
`;
