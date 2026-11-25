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

  let hoveredTarget = null;
  let selectedTarget = null;
  let selectedTargets = [];
  // Per-element state map: WeakMap<Element, { originalClasses, originalText, pendingClasses, pendingText, fileMtime }>
  const targetStates = new WeakMap();

  let originalClasses = '';
  let originalText = '';
  let pendingText = null;
  let pendingClasses = '';
  let fileMtime = 0;

  let draggedElement = null;
  let activeDropPosition = 'after'; // 'before' | 'inside' | 'after'
  const collapsedLayerKeys = new Set();

  // Active color property target: 'fill' | 'text' | 'stroke'
  let activeColorTarget = 'fill';
  let currentColorHsv = [42, 56, 85]; // Default honey gold: #d9b25f
  let currentColorAlpha = 100;
  let isPaddingLinked = true;
  let isRadiusLinked = true;
  let isBorderSidesLinked = true;

  // History buffer for Undo/Redo (stores snapshots across all active targets)
  let history = [];
  let historyIdx = -1;

  // --- Live Optimistic Tailwind CSS Preview Engine ---
  // Injects dynamic rules for pending/arbitrary Tailwind classes so edits render at 60fps
  // immediately before Shift+S triggers Tailwind JIT compilation on disk.
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

    // Color arbitrary: bg-[#hex](/alpha), text-[#hex](/alpha), border-[#hex](/alpha)
    let m = cls.match(/^(bg|text|border)-\\[([^\\]]+)\\](?:\\/(\\d+))?$/);
    if (m) {
      const prop = m[1] === 'bg' ? 'background-color' : (m[1] === 'text' ? 'color' : 'border-color');
      return prop + ': ' + hexAlphaToCss(m[2], m[3]) + ';';
    }
    if (cls === 'bg-transparent') return 'background-color: transparent;';
    if (cls === 'text-transparent') return 'color: transparent;';
    if (cls === 'border-transparent') return 'border-color: transparent;';

    // Dimensions
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

    // Font size
    m = cls.match(/^text-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]$/);
    if (m) return 'font-size: ' + m[1] + '; line-height: 1.15;';
    m = cls.match(/^text-(xs|sm|base|lg|xl|[2-9]xl)$/);
    if (m && TW_FONT_SIZE[m[1]]) return 'font-size: ' + TW_FONT_SIZE[m[1]] + ';';

    // Text align & transform
    if (/^text-(left|center|right|justify)$/.test(cls)) return 'text-align: ' + cls.slice(5) + ';';
    if (cls === 'uppercase') return 'text-transform: uppercase;';
    if (cls === 'lowercase') return 'text-transform: lowercase;';
    if (cls === 'capitalize') return 'text-transform: capitalize;';
    if (cls === 'normal-case') return 'text-transform: none;';

    // Font weight & family
    m = cls.match(/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/);
    if (m) return 'font-weight: ' + TW_FONT_WEIGHT[m[1]] + ';';
    if (cls === 'font-sans') return 'font-family: ui-sans-serif, system-ui, sans-serif;';
    if (cls === 'font-serif') return 'font-family: ui-serif, Georgia, Cambria, serif;';
    if (cls === 'font-mono') return 'font-family: ui-monospace, SFMono-Regular, monospace;';
    m = cls.match(/^font-\\['?([^\\]']+)'?\\]$/);
    if (m) return 'font-family: "' + m[1].replace(/_/g, ' ') + '", sans-serif;';

    // Leading & Tracking
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

    // Display & Flex & Alignment & Gap
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

    // Padding & Margin
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

    // Border radius (master & independent corners)
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

    // Borders: style, master width, side widths
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

    // Opacity
    m = cls.match(/^opacity-(\\d+)$/);
    if (m) return 'opacity: ' + (parseInt(m[1], 10) / 100) + ';';
    m = cls.match(/^opacity-\\[([^\\]]+)\\]$/);
    if (m) {
      const v = m[1].endsWith('%') ? (parseFloat(m[1]) / 100) : m[1];
      return 'opacity: ' + v + ';';
    }

    // Transforms (composed cleanly via CSS variables so translate-x, translate-y, and rotate combine!)
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

    // Effects: shadows & blurs
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

  // --- Helpers for Typing Focus Guard (checks both Document and Shadow DOM) ---
  function isTypingInField(e) {
    const path = e && typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (node && node.nodeType === 1) {
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable) {
          return true;
        }
      }
    }
    const activeDoc = document.activeElement;
    if (activeDoc && (activeDoc.tagName === 'INPUT' || activeDoc.tagName === 'TEXTAREA' || activeDoc.isContentEditable)) {
      return true;
    }
    const activeShadow = shadow && shadow.activeElement;
    if (activeShadow && (activeShadow.tagName === 'INPUT' || activeShadow.tagName === 'TEXTAREA' || activeShadow.isContentEditable)) {
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

  // --- Styling ---
  const style = document.createElement('style');
  style.textContent = \`
    * {
      box-sizing: border-box;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
    }

    :host {
      --glass-bg: rgba(253, 248, 235, 0.92);
      --glass-well: rgba(235, 224, 196, 0.54);
      --glass-hover: rgba(217, 178, 95, 0.16);
      --glass-border: rgba(201, 154, 59, 0.36);
      --glass-hairline: rgba(30, 27, 22, 0.08);
      --ink-primary: #1e1b16;
      --ink-secondary: #5e5444;
      --ink-muted: #8a7f6b;
      --gold: #d9b25f;
      --gold-strong: #c69a3b;
      --gold-tint: rgba(217, 178, 95, 0.24);
      --figma-blue: #0ea5e9;
      --figma-purple: #8b5cf6;
      --figma-red: #f43f5e;
      --glass-shadow: 0 18px 42px rgba(24, 19, 12, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.78);
    }

    .no-scroll {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .no-scroll::-webkit-scrollbar { display: none; }

    /* Bottom-Center Floating Glass Pill Dock */
    .bottom-dock {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--glass-bg);
      backdrop-filter: blur(22px) saturate(165%);
      -webkit-backdrop-filter: blur(22px) saturate(165%);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      padding: 5px 6px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: auto;
      user-select: none;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 2100;
    }

    .dock-tool {
      position: relative;
      background: transparent;
      border: none;
      color: var(--ink-secondary);
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .dock-tool svg { width: 16px; height: 16px; }
    .dock-tool:hover:not(:disabled) {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }
    .dock-tool.active {
      background: var(--gold);
      color: #1e1b16;
      box-shadow: 0 2px 10px rgba(201, 154, 59, 0.35);
    }
    .dock-tool:disabled {
      opacity: 0.32;
      cursor: not-allowed;
    }
    .dock-tool.brand-mark {
      cursor: default;
      opacity: 0.9;
    }
    .dock-tool.brand-mark:hover { background: transparent; }

    .dock-tool[data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);
      background: #1e1b16;
      color: #fdf8eb;
      font-size: 10px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
      z-index: 50;
    }

    .dock-divider {
      width: 1px;
      height: 18px;
      background: var(--glass-hairline);
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
      background: rgba(30, 27, 22, 0.06);
      color: var(--ink-muted);
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s ease;
    }
    .sync-status-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ink-muted);
    }
    .sync-status-badge.dirty {
      background: rgba(217, 178, 95, 0.25);
      color: #7c5910;
      border: 1px solid rgba(201, 154, 59, 0.4);
    }
    .sync-status-badge.dirty .dot {
      background: #c69a3b;
      box-shadow: 0 0 6px #d9b25f;
    }
    .sync-status-badge.synced {
      background: rgba(22, 163, 74, 0.15);
      color: #166534;
      border: 1px solid rgba(22, 163, 74, 0.3);
    }
    .sync-status-badge.synced .dot { background: #16a34a; }

    /* Hover Outline (Independent from Selected Box) */
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

    /* Multi-select secondary boxes */
    .multi-box {
      position: fixed;
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.07);
      pointer-events: none;
      z-index: 998;
      border-radius: 2px;
    }

    /* Marquee Selection Rectangle */
    .marquee-box {
      position: fixed;
      border: 1px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.12);
      pointer-events: none;
      display: none;
      z-index: 1050;
      border-radius: 2px;
    }

    /* Alt Distance Measurement Guides (Figma Red) */
    .measure-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1060;
      display: none;
    }
    .measure-line {
      position: fixed;
      background: var(--figma-red);
      pointer-events: none;
    }
    .measure-line.dashed {
      background: transparent;
      border-color: rgba(244, 63, 94, 0.55);
    }
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

    /* Highlight Bounding Box with 8 Resize Handles + Rotation Knob */
    .box-highlight {
      position: fixed;
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.07);
      pointer-events: none;
      display: none;
      z-index: 1000;
      border-radius: 2px;
    }
    .box-highlight.selected {
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.09);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65);
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

    /* 8 Transform Anchors */
    .handle-tl { top: -4px; left: -4px; cursor: nwse-resize; }
    .handle-tc { top: -4px; left: calc(50% - 4px); cursor: ns-resize; }
    .handle-tr { top: -4px; right: -4px; cursor: nesw-resize; }
    .handle-ml { top: calc(50% - 4px); left: -4px; cursor: ew-resize; }
    .handle-mr { top: calc(50% - 4px); right: -4px; cursor: ew-resize; }
    .handle-bl { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .handle-bc { bottom: -4px; left: calc(50% - 4px); cursor: ns-resize; }
    .handle-br { bottom: -4px; right: -4px; cursor: nwse-resize; }

    /* Rotation Stem & Knob */
    .handle-rotate-stem {
      position: absolute;
      top: -20px;
      left: 50%;
      width: 1px;
      height: 16px;
      background: var(--figma-blue);
      transform: translateX(-50%);
      display: none;
      pointer-events: none;
    }
    .handle-rotate {
      position: absolute;
      top: -28px;
      left: 50%;
      width: 11px;
      height: 11px;
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
      background: rgba(253, 248, 235, 0.95);
      backdrop-filter: blur(12px);
      color: var(--ink-primary);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      white-space: nowrap;
      border: 1px solid var(--glass-border);
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(24, 19, 12, 0.14);
      pointer-events: none;
    }
    .box-tooltip .tag-name { color: #0369a1; font-family: ui-monospace, SFMono-Regular, monospace; }
    .box-tooltip .loc { color: var(--ink-muted); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; }

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

    /* Shared Glass Island Base */
    .glass-card {
      background: var(--glass-bg);
      backdrop-filter: blur(24px) saturate(165%);
      -webkit-backdrop-filter: blur(24px) saturate(165%);
      border: 1px solid var(--glass-border);
      border-radius: 14px;
      box-shadow: var(--glass-shadow);
      color: var(--ink-primary);
      pointer-events: auto;
      animation: floatIn 0.14s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes floatIn {
      from { opacity: 0; transform: translateY(4px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Left Floating Full Layers Tree */
    .layers-panel {
      position: fixed;
      top: 16px;
      left: 16px;
      width: 248px;
      max-height: calc(100vh - 104px);
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
      z-index: 2000;
    }
    .layers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4px 6px;
      border-bottom: 1px solid var(--glass-hairline);
      font-size: 11px;
      font-weight: 600;
      color: var(--ink-secondary);
    }
    .layers-header-actions {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .trail {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .trail-item {
      padding: 4px 6px;
      border-radius: 6px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
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
      background: var(--glass-hover);
      color: var(--ink-primary);
    }
    .trail-item.active {
      background: rgba(14, 165, 233, 0.16);
      color: #0369a1;
      font-weight: 600;
    }
    .trail-item.is-component {
      color: #6d28d9;
    }
    .trail-item.is-component.active {
      background: rgba(139, 92, 246, 0.16);
      color: #5b21b6;
    }
    .trail-item.drop-before {
      border-top: 2px solid var(--figma-blue);
    }
    .trail-item.drop-after {
      border-bottom: 2px solid var(--figma-blue);
    }
    .trail-item.drop-inside {
      border: 1.5px dashed var(--figma-blue);
      background: rgba(14, 165, 233, 0.14);
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
    .caret-btn:hover { background: rgba(30, 27, 22, 0.08); color: var(--ink-primary); }
    .caret-btn.collapsed svg { transform: rotate(-90deg); }
    .caret-spacer {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .trail-title {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    .type-icon {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(30, 27, 22, 0.08);
      color: var(--ink-muted);
      font-family: Inter, sans-serif;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .type-icon.text-icon {
      background: rgba(14, 165, 233, 0.15);
      color: #0284c7;
    }
    .type-icon.frame-icon {
      background: rgba(201, 154, 59, 0.2);
      color: #7c5910;
    }
    .type-icon.comp-icon {
      background: rgba(139, 92, 246, 0.18);
      color: #7c3aed;
      padding: 2px 3px;
    }
    .node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .trail-actions {
      display: none;
      align-items: center;
      gap: 1px;
    }
    .trail-item:hover .trail-actions,
    .trail-item.active .trail-actions {
      display: flex;
    }
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
    .trail-btn:hover {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }

    /* Right Floating Inspector Card */
    .studio-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 308px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 9px;
      z-index: 2000;
    }

    .studio-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--glass-hairline);
      gap: 8px;
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
      color: #0369a1;
      background: rgba(14, 165, 233, 0.12);
      border: 1px solid rgba(14, 165, 233, 0.3);
      padding: 2px 7px;
      border-radius: 6px;
      white-space: nowrap;
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
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 9999px;
      background: rgba(217, 178, 95, 0.25);
      color: #7c5910;
      border: 1px solid rgba(201, 154, 59, 0.4);
      display: none;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.12s;
    }
    .icon-btn svg { width: 13px; height: 13px; }
    .icon-btn:hover:not(:disabled) {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }

    .prop-section {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--glass-hairline);
    }
    .prop-section.no-divider {
      border-bottom: none;
      padding-bottom: 0;
    }
    .prop-row-inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .prop-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--ink-muted);
      letter-spacing: 0.2px;
      flex-shrink: 0;
    }

    .segmented {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      background: var(--glass-well);
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
    }
    .seg-btn {
      background: transparent;
      border: none;
      color: var(--ink-secondary);
      font-size: 10px;
      font-weight: 500;
      padding: 4px 0;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
    }
    .seg-btn:hover { color: var(--ink-primary); }
    .seg-btn.active {
      background: #fffdf7;
      color: var(--ink-primary);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(30, 27, 22, 0.12);
    }

    /* Compact Range Slider (Opacity) */
    .mini-slider {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      height: 5px;
      border-radius: 9999px;
      background: var(--glass-well);
      outline: none;
      cursor: pointer;
    }
    .mini-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: var(--gold);
      border: 1.5px solid #1e1b16;
      cursor: pointer;
    }

    /* 3x3 Auto Layout Matrix */
    .align-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      width: 54px;
      height: 54px;
      background: var(--glass-well);
      border-radius: 8px;
      padding: 3px;
      gap: 2px;
      flex-shrink: 0;
    }
    .align-cell {
      background: rgba(255, 253, 247, 0.6);
      border-radius: 3px;
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
      opacity: 0.4;
    }
    .align-cell:hover::after {
      background: var(--ink-primary);
      opacity: 0.8;
      transform: scale(1.2);
    }
    .align-cell.active { background: var(--gold); }
    .align-cell.active::after { background: #1e1b16; opacity: 1; }

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
      background: rgba(255, 253, 247, 0.78);
      border: 1px solid rgba(30, 27, 22, 0.12);
      border-radius: 6px;
      outline: none;
      color: var(--ink-primary);
    }
    .side-input:focus { border-color: var(--gold-strong); background: #fffdf7; }

    /* Color Trigger Row */
    .color-preview-trigger {
      display: flex;
      align-items: center;
      gap: 7px;
      background: rgba(255, 253, 247, 0.78);
      border: 1px solid rgba(30, 27, 22, 0.12);
      border-radius: 8px;
      padding: 4px 8px;
      cursor: pointer;
      width: 100%;
    }
    .color-preview-thumb {
      width: 20px;
      height: 20px;
      border-radius: 5px;
      border: 1px solid rgba(30, 27, 22, 0.2);
      background: #d9b25f;
      flex-shrink: 0;
    }
    .color-preview-hex {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      font-weight: 500;
      color: var(--ink-primary);
      flex: 1;
    }

    /* Figma 2D Spectrum Color Popover Modal */
    .figma-color-modal {
      position: fixed;
      top: 50px;
      right: 332px;
      width: 244px;
      background: var(--glass-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.22);
      padding: 10px;
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
    .color-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .canvas-thumb {
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 4px rgba(0,0,0,0.45);
      transform: translate(-50%, -50%);
      pointer-events: none;
      left: 50%;
      top: 50%;
    }

    /* Rainbow Hue Slider */
    .hue-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
      outline: none;
      cursor: pointer;
    }
    .hue-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ffffff;
      border: 1.5px solid rgba(0,0,0,0.3);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      cursor: pointer;
    }

    /* Alpha Slider with checkerboard */
    .alpha-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(to right, transparent, #d9b25f), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px;
      outline: none;
      cursor: pointer;
    }
    .alpha-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ffffff;
      border: 1.5px solid rgba(0,0,0,0.3);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
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
      border: 1px solid rgba(30, 27, 22, 0.15);
      cursor: pointer;
      transition: transform 0.12s;
    }
    .doc-chip:hover { transform: scale(1.15); }

    /* Figma Typography Font Modal */
    .font-select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 253, 247, 0.78);
      border: 1px solid rgba(30, 27, 22, 0.12);
      border-radius: 8px;
      padding: 5px 9px;
      cursor: pointer;
      font-size: 11px;
      color: var(--ink-primary);
      width: 100%;
    }
    .font-modal {
      position: fixed;
      top: 140px;
      right: 332px;
      width: 218px;
      background: var(--glass-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.22);
      padding: 8px;
      display: none;
      flex-direction: column;
      gap: 6px;
      max-height: 264px;
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
      transition: background 0.12s;
    }
    .font-row:hover { background: var(--glass-hover); }
    .font-row.active {
      background: rgba(14, 165, 233, 0.15);
      color: #0369a1;
      font-weight: 600;
    }

    .clean-input {
      background: rgba(255, 253, 247, 0.78);
      border: 1px solid rgba(30, 27, 22, 0.12);
      border-radius: 8px;
      padding: 4px 8px;
      color: var(--ink-primary);
      font-size: 11px;
      outline: none;
      width: 100%;
      transition: border-color 0.15s, background 0.15s;
    }
    .clean-input:focus {
      border-color: var(--gold-strong);
      background: #fffdf7;
    }

    .drawer-pills {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .pill-toggle {
      background: var(--glass-well);
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
    .pill-toggle:hover { color: var(--ink-primary); background: var(--glass-hover); }
    .pill-toggle.active {
      background: var(--gold-tint);
      border-color: rgba(201, 154, 59, 0.35);
      color: var(--ink-primary);
      font-weight: 600;
    }

    .ai-drawer {
      display: none;
      flex-direction: column;
      gap: 6px;
      background: rgba(255, 253, 247, 0.55);
      border: 1px solid var(--glass-hairline);
      padding: 8px;
      border-radius: 9px;
    }
    .ai-chip {
      background: rgba(255, 253, 247, 0.8);
      border: 1px solid rgba(30, 27, 22, 0.1);
      color: var(--ink-secondary);
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ai-chip:hover {
      background: var(--gold-tint);
      color: var(--ink-primary);
      border-color: var(--gold-strong);
    }

    .diff-container {
      background: rgba(255, 253, 247, 0.72);
      border: 1px solid var(--glass-hairline);
      border-radius: 8px;
      padding: 7px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 10.5px;
      display: none;
      flex-direction: column;
      gap: 3px;
      max-height: 92px;
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
      background: rgba(22, 163, 74, 0.1);
      padding: 2px 5px;
      border-radius: 4px;
      word-break: break-all;
    }

    .action-btn {
      background: var(--gold);
      color: #1e1b16;
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
      transition: background 0.15s;
    }
    .action-btn:hover { background: var(--gold-strong); }

    .sync-row {
      display: flex;
      gap: 6px;
      align-items: center;
      padding-top: 2px;
    }
    .sync-btn {
      flex: 1;
      background: var(--glass-well);
      color: var(--ink-secondary);
      border: 1px solid rgba(30, 27, 22, 0.08);
      border-radius: 9px;
      padding: 8px 12px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .sync-btn.dirty {
      background: var(--gold);
      color: #1e1b16;
      border-color: var(--gold-strong);
      box-shadow: 0 4px 12px rgba(201, 154, 59, 0.3);
    }
    .sync-btn.dirty:hover { background: var(--gold-strong); }
    .sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .discard-btn {
      background: transparent;
      color: var(--ink-secondary);
      border: 1px solid var(--glass-hairline);
      border-radius: 9px;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s;
    }
    .discard-btn:hover {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }
    .sync-status {
      font-size: 10.5px;
      color: #166534;
      text-align: center;
      display: none;
      padding-top: 2px;
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

  // --- Bottom-Center Floating Glass Pill Dock ---
  const dock = document.createElement('div');
  dock.className = 'bottom-dock';
  dock.innerHTML = \`
    <button class="dock-tool dock-btn" data-tip="Inspect (Alt+X)" aria-label="Toggle Inspect">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/></svg>
    </button>
    <div class="dock-extra" id="flimsy-dock-extra" style="display:none;">
      <button class="dock-tool" id="flimsy-text-tool" data-tip="Edit Text" aria-label="Edit Text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      </button>
      <button class="dock-tool active" id="flimsy-layers-toggle" data-tip="Layers" aria-label="Toggle Layers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      </button>
      <button class="dock-tool active" id="flimsy-snap-toggle" data-tip="Snap to Tailwind Scale (Ctrl to bypass)" aria-label="Toggle Tailwind Snap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16"/><path d="M4 16h16"/><path d="M8 4v16"/><path d="M16 4v16"/></svg>
      </button>
      <div class="dock-divider"></div>
      <button class="dock-tool" id="flimsy-undo-btn" data-tip="Undo (Ctrl+Z)" aria-label="Undo" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
      </button>
      <button class="dock-tool" id="flimsy-redo-btn" data-tip="Redo (Ctrl+Y)" aria-label="Redo" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
      </button>
      <button class="dock-tool" id="flimsy-dock-ai-btn" data-tip="AI Assist" aria-label="AI Assist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
      </button>
    </div>
    <div class="dock-divider"></div>
    <div class="sync-status-badge" id="flimsy-dock-sync-status" title="Press Shift+S to sync changes to code">
      <span class="dot"></span>
      <span class="text">In sync</span>
    </div>
    <span class="dock-tool brand-mark" data-tip="Flimsy Visual Sync">
      <svg viewBox="0 0 24 24" fill="none" stroke="#c69a3b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5 14.5 4 20 11.5 9.5 19Z" fill="rgba(253, 246, 223, 0.9)"/><path d="M14.5 4c-.8 4.2 1.2 6.8 5.5 7.5" fill="rgba(217, 178, 95, 0.45)"/></svg>
    </span>
  \`;
  shadow.appendChild(dock);

  const dockBtn = dock.querySelector('.dock-btn');
  const dockExtra = dock.querySelector('#flimsy-dock-extra');
  const textToolBtn = dock.querySelector('#flimsy-text-tool');
  const layersToggleBtn = dock.querySelector('#flimsy-layers-toggle');
  const snapToggleBtn = dock.querySelector('#flimsy-snap-toggle');
  const undoBtn = dock.querySelector('#flimsy-undo-btn');
  const redoBtn = dock.querySelector('#flimsy-redo-btn');
  const dockAiBtn = dock.querySelector('#flimsy-dock-ai-btn');
  const dockSyncBadge = dock.querySelector('#flimsy-dock-sync-status');

  // --- Highlight Box with 8 Interactive Grab Handles + Rotation Knob ---
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = \`
    <div class="handle-rotate-stem"></div>
    <div class="handle-rotate" id="flimsy-rotate-handle" title="Drag to rotate (Shift for 15 deg steps)"></div>
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

  // --- Left Floating Full Layers Tree Panel ---
  const layersPanel = document.createElement('div');
  layersPanel.className = 'glass-card layers-panel no-scroll';
  layersPanel.id = 'flimsy-layers-panel';
  layersPanel.innerHTML = \`
    <div class="layers-header">
      <span>Layers</span>
      <div class="layers-header-actions">
        <button class="icon-btn" id="flimsy-layers-refresh" title="Refresh Tree">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
        </button>
        <button class="icon-btn" id="flimsy-layers-close" title="Hide Layers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="trail" id="flimsy-trail"></div>
  \`;
  shadow.appendChild(layersPanel);

  const trailContainer = layersPanel.querySelector('#flimsy-trail');
  const layersCloseBtn = layersPanel.querySelector('#flimsy-layers-close');
  const layersRefreshBtn = layersPanel.querySelector('#flimsy-layers-refresh');

  // --- Right Floating Inspector Card ---
  const panel = document.createElement('div');
  panel.className = 'glass-card studio-panel no-scroll';
  panel.innerHTML = \`
    <div class="studio-header">
      <div class="studio-header-left">
        <span class="studio-tag-badge" id="flimsy-elem-tag">&lt;button&gt;</span>
        <span class="studio-loc-badge" id="flimsy-elem-loc">Hero.tsx:16</span>
        <span class="instance-badge" id="flimsy-instance-badge"></span>
      </div>
      <button class="icon-btn" id="flimsy-close-btn" title="Close (Esc)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Text Section -->
    <div class="prop-section" id="flimsy-text-group">
      <div class="prop-row-inline">
        <span class="prop-label">Text</span>
        <input type="text" id="flimsy-text-input" class="clean-input" placeholder="Double-click on page to edit...">
      </div>
    </div>

    <!-- Auto Layout Section -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Auto Layout</span>
        <div class="segmented" id="seg-flex-dir" style="width: 172px;">
          <button class="seg-btn" data-class="flex" title="Enable Flex">Flex</button>
          <button class="seg-btn" data-class="flex-row" data-auto-flex="1">Row</button>
          <button class="seg-btn" data-class="flex-col" data-auto-flex="1">Col</button>
          <button class="seg-btn" data-class="flex-wrap" data-auto-flex="1">Wrap</button>
        </div>
      </div>

      <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
        <!-- 3x3 Alignment Matrix -->
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

        <div style="flex:1; display:flex; flex-direction:column; gap:5px; min-width:0;">
          <!-- Gap presets + numeric input -->
          <div class="prop-row-inline" style="gap:5px;">
            <span class="prop-label" style="font-size:9.5px;">Gap</span>
            <div class="segmented" id="seg-gap" style="flex:1;">
              <button class="seg-btn" data-class="gap-0">0</button>
              <button class="seg-btn" data-class="gap-2">2</button>
              <button class="seg-btn" data-class="gap-4">4</button>
              <button class="seg-btn" data-class="gap-6">6</button>
            </div>
            <input type="text" id="flimsy-gap-input" class="side-input" style="width:42px;" placeholder="px" title="Exact gap (e.g. 18px or 5)">
          </div>
          <!-- Justify distribution -->
          <div class="prop-row-inline" style="gap:5px;">
            <span class="prop-label" style="font-size:9.5px;">Dist</span>
            <div class="segmented" id="seg-justify" style="flex:1;">
              <button class="seg-btn" data-class="justify-start" data-auto-flex="1">Start</button>
              <button class="seg-btn" data-class="justify-center" data-auto-flex="1">Ctr</button>
              <button class="seg-btn" data-class="justify-between" data-auto-flex="1">Betw</button>
              <button class="seg-btn" data-class="justify-end" data-auto-flex="1">End</button>
            </div>
          </div>
          <!-- Sizing constraints -->
          <div class="prop-row-inline" style="gap:5px;">
            <span class="prop-label" style="font-size:9.5px;">Size</span>
            <div class="segmented" id="seg-sizing" style="flex:1;">
              <button class="seg-btn" data-class="w-fit">Hug</button>
              <button class="seg-btn" data-class="w-full">Fill</button>
              <button class="seg-btn" data-class="w-auto">Auto</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Appearance: Element Opacity & Rotation -->
    <div class="prop-section">
      <span class="prop-label">Appearance</span>
      <div class="prop-row-inline" style="gap:6px;">
        <span class="prop-label" style="font-size:9.5px; width:44px;">Opacity</span>
        <input type="range" min="0" max="100" step="5" value="100" class="mini-slider" id="flimsy-opacity-slider">
        <span id="flimsy-opacity-val" style="font-size:10px; font-family:monospace; color:var(--ink-secondary); width:32px; text-align:right;">100%</span>
      </div>
      <div class="prop-row-inline" style="gap:6px;">
        <span class="prop-label" style="font-size:9.5px; width:44px;">Rotate</span>
        <div class="segmented" id="seg-rotate" style="flex:1;">
          <button class="seg-btn" data-class="rotate-0">0</button>
          <button class="seg-btn" data-class="rotate-6">6</button>
          <button class="seg-btn" data-class="rotate-12">12</button>
          <button class="seg-btn" data-class="rotate-45">45</button>
          <button class="seg-btn" data-class="-rotate-6">-6</button>
        </div>
        <input type="text" id="flimsy-rotate-input" class="side-input" style="width:44px;" placeholder="0deg" title="Rotation in degrees">
      </div>
    </div>

    <!-- Spacing & Per-Side Padding -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Padding</span>
        <button class="pill-toggle" id="flimsy-pad-link-btn" style="padding: 2px 6px; font-size:9.5px;">Linked</button>
      </div>
      <div class="side-box-grid" id="flimsy-pad-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">T</span><input type="text" class="side-input" id="pad-top" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">R</span><input type="text" class="side-input" id="pad-right" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">B</span><input type="text" class="side-input" id="pad-bottom" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">L</span><input type="text" class="side-input" id="pad-left" placeholder="0"></div>
      </div>
      <div class="segmented" id="seg-padding">
        <button class="seg-btn" data-class="p-0">p-0</button>
        <button class="seg-btn" data-class="p-2">p-2</button>
        <button class="seg-btn" data-class="p-4">p-4</button>
        <button class="seg-btn" data-class="p-6">p-6</button>
        <button class="seg-btn" data-class="p-8">p-8</button>
      </div>
    </div>

    <!-- Color System: 2D Spectrum & Document Colors Modal Trigger -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Color & Fill</span>
        <div class="segmented" id="seg-color-target" style="width: 140px;">
          <button class="seg-btn active" id="flimsy-target-fill">Fill</button>
          <button class="seg-btn" id="flimsy-target-text">Text</button>
          <button class="seg-btn" id="flimsy-target-stroke">Stroke</button>
        </div>
      </div>

      <div class="color-preview-trigger" id="flimsy-color-trigger" title="Open 2D Color Spectrum">
        <div class="color-preview-thumb" id="flimsy-color-thumb"></div>
        <span class="color-preview-hex" id="flimsy-color-hex-label">#D9B25F</span>
        <span style="font-size:10px; color:var(--ink-muted); font-family:monospace;" id="flimsy-color-opacity-label">100%</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </div>

    <!-- Typography & Advanced Controls -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Typography</span>
        <button class="font-select-trigger" id="flimsy-font-trigger" style="width:148px;">
          <span id="flimsy-current-font-name">Inter</span>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      <div class="segmented" id="seg-font-size">
        <button class="seg-btn" data-class="text-xs">xs</button>
        <button class="seg-btn" data-class="text-sm">sm</button>
        <button class="seg-btn" data-class="text-base">md</button>
        <button class="seg-btn" data-class="text-lg">lg</button>
        <button class="seg-btn" data-class="text-xl">xl</button>
        <button class="seg-btn" data-class="text-2xl">2xl</button>
      </div>
      <div class="segmented" id="seg-font-weight">
        <button class="seg-btn" data-class="font-normal">Reg</button>
        <button class="seg-btn" data-class="font-medium">Med</button>
        <button class="seg-btn" data-class="font-semibold">Semi</button>
        <button class="seg-btn" data-class="font-bold">Bold</button>
      </div>
      <div class="prop-row-inline" style="gap:5px;">
        <div class="segmented" id="seg-text-align" style="flex:1;">
          <button class="seg-btn" data-class="text-left" title="Align Left">L</button>
          <button class="seg-btn" data-class="text-center" title="Align Center">C</button>
          <button class="seg-btn" data-class="text-right" title="Align Right">R</button>
          <button class="seg-btn" data-class="text-justify" title="Align Justify">J</button>
        </div>
        <div class="segmented" id="seg-text-transform" style="flex:1;">
          <button class="seg-btn" data-class="normal-case" title="Normal Case">Aa</button>
          <button class="seg-btn" data-class="uppercase" title="Uppercase">AA</button>
          <button class="seg-btn" data-class="lowercase" title="Lowercase">aa</button>
          <button class="seg-btn" data-class="capitalize" title="Capitalize">Ab</button>
        </div>
      </div>
      <div class="prop-row-inline" style="gap:5px;">
        <span class="prop-label" style="font-size:9.5px; width:36px;">Lead</span>
        <div class="segmented" id="seg-leading" style="flex:1;">
          <button class="seg-btn" data-class="leading-none">None</button>
          <button class="seg-btn" data-class="leading-tight">Tight</button>
          <button class="seg-btn" data-class="leading-normal">Norm</button>
          <button class="seg-btn" data-class="leading-relaxed">Relx</button>
          <button class="seg-btn" data-class="leading-loose">Loose</button>
        </div>
      </div>
      <div class="prop-row-inline" style="gap:5px;">
        <span class="prop-label" style="font-size:9.5px; width:36px;">Track</span>
        <div class="segmented" id="seg-tracking" style="flex:1;">
          <button class="seg-btn" data-class="tracking-tighter">--</button>
          <button class="seg-btn" data-class="tracking-tight">-</button>
          <button class="seg-btn" data-class="tracking-normal">0</button>
          <button class="seg-btn" data-class="tracking-wide">+</button>
          <button class="seg-btn" data-class="tracking-widest">++</button>
        </div>
      </div>
    </div>

    <!-- Borders & Independent Radii & Per-Side Borders -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Corners & Border</span>
        <div style="display:flex; gap:4px;">
          <button class="pill-toggle" id="flimsy-radius-link-btn" style="padding: 2px 6px; font-size:9.5px;">Corners</button>
          <button class="pill-toggle" id="flimsy-border-side-btn" style="padding: 2px 6px; font-size:9.5px;">Sides</button>
        </div>
      </div>

      <div class="side-box-grid" id="flimsy-radius-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">TL</span><input type="text" class="side-input" id="rad-tl" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">TR</span><input type="text" class="side-input" id="rad-tr" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BR</span><input type="text" class="side-input" id="rad-br" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BL</span><input type="text" class="side-input" id="rad-bl" placeholder="0"></div>
      </div>

      <div class="side-box-grid" id="flimsy-border-side-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">BT</span><input type="text" class="side-input" id="bdr-t" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BR</span><input type="text" class="side-input" id="bdr-r" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BB</span><input type="text" class="side-input" id="bdr-b" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BL</span><input type="text" class="side-input" id="bdr-l" placeholder="0"></div>
      </div>

      <div class="segmented" id="seg-radius">
        <button class="seg-btn" data-class="rounded-none">0</button>
        <button class="seg-btn" data-class="rounded-sm">sm</button>
        <button class="seg-btn" data-class="rounded-md">md</button>
        <button class="seg-btn" data-class="rounded-lg">lg</button>
        <button class="seg-btn" data-class="rounded-xl">xl</button>
        <button class="seg-btn" data-class="rounded-full">Full</button>
      </div>

      <div style="display:flex; gap:6px; align-items:center;">
        <div class="segmented" id="seg-border-width" style="flex:1;">
          <button class="seg-btn" data-class="border-0">0px</button>
          <button class="seg-btn" data-class="border">1px</button>
          <button class="seg-btn" data-class="border-2">2px</button>
          <button class="seg-btn" data-class="border-4">4px</button>
        </div>
        <div class="segmented" id="seg-border-style" style="width:110px;">
          <button class="seg-btn" data-class="border-solid">Solid</button>
          <button class="seg-btn" data-class="border-dashed">Dash</button>
          <button class="seg-btn" data-class="border-dotted">Dot</button>
        </div>
      </div>
    </div>

    <!-- Effects: Shadow, Backdrop Blur, Layer Blur -->
    <div class="prop-section">
      <span class="prop-label">Effects</span>
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
        <button class="seg-btn" data-class="backdrop-blur-sm">BG sm</button>
        <button class="seg-btn" data-class="backdrop-blur-md">BG md</button>
        <button class="seg-btn" data-class="backdrop-blur-lg">BG lg</button>
      </div>
      <div class="segmented" id="seg-layer-blur">
        <button class="seg-btn" data-class="blur-none">Blur 0</button>
        <button class="seg-btn" data-class="blur-sm">sm</button>
        <button class="seg-btn" data-class="blur-md">md</button>
        <button class="seg-btn" data-class="blur-lg">lg</button>
      </div>
    </div>

    <!-- Drawers: AI Assist & Raw Classes -->
    <div class="prop-section no-divider">
      <div class="drawer-pills">
        <button class="pill-toggle" id="flimsy-ai-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
          AI Assist
        </button>
        <button class="pill-toggle" id="flimsy-classes-toggle">Classes</button>
      </div>

      <div id="flimsy-ai-drawer" class="ai-drawer">
        <input type="text" id="flimsy-ai-input" class="clean-input" placeholder="e.g. Glassmorphism card, Neon glow...">
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="ai-chip" data-prompt="Glassmorphism card with blur">Glass</button>
          <button class="ai-chip" data-prompt="Vibrant gradient background">Gradient</button>
          <button class="ai-chip" data-prompt="Neon glow shadow">Glow</button>
          <button class="ai-chip" data-prompt="Modern rounded card with shadow">Card</button>
        </div>
        <div style="display:flex; gap:5px; margin-top:2px;">
          <button id="flimsy-ai-generate" class="action-btn" style="flex:1;">Apply AI Style</button>
          <button id="flimsy-ai-copy" class="pill-toggle" title="Copy prompt for Claude Code or Cursor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <div id="flimsy-ai-feedback" style="font-size:10px; color:#7c5910; display:none;"></div>
      </div>

      <div id="flimsy-classes-drawer" style="display:none;">
        <input type="text" id="flimsy-classes-raw" class="clean-input" placeholder="Tailwind classes...">
      </div>
    </div>

    <!-- Diff & Sync -->
    <div id="flimsy-diff-box" class="diff-container no-scroll"></div>

    <div class="sync-row">
      <button id="flimsy-sync-btn" class="sync-btn" title="Sync to Code (Shift+S)">In Sync</button>
      <button id="flimsy-discard-btn" class="discard-btn" title="Discard pending changes">Reset</button>
    </div>
    <div id="flimsy-sync-status" class="sync-status"></div>
  \`;
  shadow.appendChild(panel);

  // --- Figma 2D Spectrum Color Popover Modal ---
  const colorModal = document.createElement('div');
  colorModal.className = 'figma-color-modal';
  colorModal.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-secondary);">Color Picker</span>
      <button class="icon-btn" id="flimsy-color-close" style="width:18px; height:18px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="color-canvas-wrap" id="flimsy-canvas-wrap">
      <canvas class="color-canvas" id="flimsy-color-canvas" width="220" height="130"></canvas>
      <div class="canvas-thumb" id="flimsy-canvas-thumb"></div>
    </div>
    <input type="range" min="0" max="360" value="42" class="hue-slider" id="flimsy-hue-slider">
    <input type="range" min="5" max="100" value="100" class="alpha-slider" id="flimsy-alpha-slider">
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="icon-btn" id="flimsy-eyedropper-btn" title="Eyedropper tool">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 7 3 3"/><path d="m17 4 3 3-10 10H7v-3L17 4z"/></svg>
      </button>
      <input type="text" id="flimsy-modal-hex" class="clean-input" style="font-family:monospace; text-transform:uppercase;" value="#D9B25F">
      <span id="flimsy-modal-alpha-text" style="font-size:10px; font-family:monospace; color:var(--ink-secondary); width:32px;">100%</span>
    </div>
    <div style="border-top:1px solid var(--glass-hairline); padding-top:6px;">
      <span style="font-size:9.5px; font-weight:600; color:var(--ink-muted); margin-bottom:4px; display:block;">On this page</span>
      <div class="doc-colors-grid" id="flimsy-doc-colors"></div>
    </div>
  \`;
  shadow.appendChild(colorModal);

  // --- Searchable Typography Font Dropdown Modal ---
  const fontModal = document.createElement('div');
  fontModal.className = 'font-modal no-scroll';
  fontModal.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-secondary);">Fonts</span>
      <button class="icon-btn" id="flimsy-font-close" style="width:18px; height:18px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <input type="text" class="clean-input" id="flimsy-font-search" placeholder="Search fonts...">
    <div class="font-list-scroll no-scroll" id="flimsy-font-list"></div>
  \`;
  shadow.appendChild(fontModal);

  // --- Inspector Element Refs ---
  const elemTagDisplay = panel.querySelector('#flimsy-elem-tag');
  const elemLocDisplay = panel.querySelector('#flimsy-elem-loc');
  const instanceBadge = panel.querySelector('#flimsy-instance-badge');
  const textInput = panel.querySelector('#flimsy-text-input');
  const classesRawInput = panel.querySelector('#flimsy-classes-raw');
  const classesToggle = panel.querySelector('#flimsy-classes-toggle');
  const classesDrawer = panel.querySelector('#flimsy-classes-drawer');
  const diffBox = panel.querySelector('#flimsy-diff-box');
  const syncBtn = panel.querySelector('#flimsy-sync-btn');
  const discardBtn = panel.querySelector('#flimsy-discard-btn');
  const syncStatus = panel.querySelector('#flimsy-sync-status');
  const closeBtn = panel.querySelector('#flimsy-close-btn');

  const gapInput = panel.querySelector('#flimsy-gap-input');
  const opacitySlider = panel.querySelector('#flimsy-opacity-slider');
  const opacityValLabel = panel.querySelector('#flimsy-opacity-val');
  const rotateInput = panel.querySelector('#flimsy-rotate-input');

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

  // Standard Web Fonts List with previews
  const FONTS = [
    { name: 'Inter', category: 'Sans-Serif', family: "'Inter', sans-serif" },
    { name: 'Roboto', category: 'Sans-Serif', family: "'Roboto', sans-serif" },
    { name: 'Poppins', category: 'Sans-Serif', family: "'Poppins', sans-serif" },
    { name: 'Montserrat', category: 'Sans-Serif', family: "'Montserrat', sans-serif" },
    { name: 'Plus Jakarta Sans', category: 'Sans-Serif', family: "'Plus Jakarta Sans', sans-serif" },
    { name: 'Open Sans', category: 'Sans-Serif', family: "'Open Sans', sans-serif" },
    { name: 'Playfair Display', category: 'Serif', family: "'Playfair Display', serif" },
    { name: 'Merriweather', category: 'Serif', family: "'Merriweather', serif" },
    { name: 'Inria Serif', category: 'Serif', family: "'Inria Serif', serif" },
    { name: 'Fira Code', category: 'Monospace', family: "'Fira Code', monospace" },
    { name: 'JetBrains Mono', category: 'Monospace', family: "'JetBrains Mono', monospace" },
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
        note.textContent = '+ ' + extraDirty + ' additional selected element(s) queued';
        diffBox.appendChild(note);
      }
    }

    diffBox.style.display = hasDiff ? 'flex' : 'none';
  }

  // --- Tailwind Class Category Reconciliation (Client-side Mirror of Core Updater) ---
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
      if (tPrefix !== variantPrefix) return true;
      const b = tParts[tParts.length - 1];
      const tCat = getClientClassCategory(b);
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
      colorThumb.style.background = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px';
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

  function updateActiveSegmentedUI(classesStr) {
    const tokens = (classesStr || '').split(/\\s+/);
    panel.querySelectorAll('.seg-btn').forEach((btn) => {
      const cls = btn.getAttribute('data-class');
      if (cls) {
        btn.classList.toggle('active', tokens.includes(cls));
      }
    });

    panel.querySelectorAll('.align-cell').forEach((cell) => {
      const alignPairs = (cell.getAttribute('data-align') || '').split(' ');
      const isMatch = alignPairs.every((cls) => tokens.includes(cls));
      cell.classList.toggle('active', isMatch);
    });

    // Sync Font Display
    const fontToken = tokens.find((t) => /^font-(sans|serif|mono|\\[)/.test(t));
    if (fontToken) {
      const found = FONTS.find((f) => fontToken.includes(f.name.replace(/\\s+/g, '_')) || fontToken === 'font-' + f.name.toLowerCase());
      if (found) currentFontName.textContent = found.name;
    }

    // Sync Opacity Slider
    let opVal = 100;
    const opTok = tokens.find((t) => t.startsWith('opacity-'));
    if (opTok) {
      const m = opTok.match(/^opacity-(?:\\[(\\d+)%\\]|(\\d+))$/);
      if (m) opVal = parseInt(m[1] || m[2], 10);
    }
    opacitySlider.value = String(opVal);
    opacityValLabel.textContent = opVal + '%';

    // Sync Rotation Input
    const rotDeg = parseRotationDeg(classesStr);
    rotateInput.value = rotDeg ? (rotDeg + 'deg') : '0deg';

    // Sync Gap Input
    const gapTok = tokens.find((t) => t.startsWith('gap-'));
    if (gapTok) {
      const gm = gapTok.match(/^gap-(?:\\[([^\\]]+)\\]|(.+))$/);
      gapInput.value = gm ? (gm[1] || gm[2]) : '';
    } else {
      gapInput.value = '';
    }
  }

  function syncLayersVisibility() {
    layersToggleBtn.classList.toggle('active', isLayersOpen);
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

  function toggleInspect(force) {
    isInspectActive = typeof force === 'boolean' ? force : !isInspectActive;
    dockBtn.classList.toggle('active', isInspectActive);
    dockExtra.style.display = isInspectActive ? 'flex' : 'none';
    if (!isInspectActive) {
      hoverOutline.style.display = 'none';
      hoveredTarget = null;
      clearSelection();
      layersPanel.style.display = 'none';
    } else {
      renderFullLayersTree();
      syncLayersVisibility();
    }
  }

  function toggleAIDrawer(force) {
    const isHidden = aiDrawer.style.display === 'none' || !aiDrawer.style.display;
    const nextOpen = typeof force === 'boolean' ? force : isHidden;
    aiDrawer.style.display = nextOpen ? 'flex' : 'none';
    aiToggle.classList.toggle('active', nextOpen);
    dockAiBtn.classList.toggle('active', nextOpen);
    if (nextOpen) aiInput.focus();
  }

  dockBtn.addEventListener('click', () => toggleInspect());
  undoBtn.addEventListener('click', () => undo());
  redoBtn.addEventListener('click', () => redo());
  dockSyncBadge.addEventListener('click', () => syncToCode());

  snapToggleBtn.addEventListener('click', () => {
    isSnapEnabled = !isSnapEnabled;
    snapToggleBtn.classList.toggle('active', isSnapEnabled);
  });

  layersToggleBtn.addEventListener('click', () => {
    isLayersOpen = !isLayersOpen;
    syncLayersVisibility();
  });

  layersCloseBtn.addEventListener('click', () => {
    isLayersOpen = false;
    syncLayersVisibility();
  });

  layersRefreshBtn.addEventListener('click', () => {
    renderFullLayersTree();
  });

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

    // Disjoint horizontal distance
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

    // Disjoint vertical distance
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

    // Ctrl+S / Cmd+S always syncs; Shift+S syncs when not typing inside an input
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
          const curVal = parseTranslatePx(el.className || '', axis);
          const nextVal = curVal + delta;
          if (nextVal === 0) {
            applyClassToElement(el, '', 'translate-' + axis);
          } else {
            applyClassToElement(el, 'translate-' + axis + '-[' + nextVal + 'px]');
          }
        }
        const primarySt = getOrInitTargetState(selectedTarget);
        pendingClasses = primarySt.pendingClasses;
        classesRawInput.value = pendingClasses;
        updateActiveSegmentedUI(pendingClasses);
        updateAllSelectionBoxes();
        const tx = parseTranslatePx(pendingClasses, 'x');
        const ty = parseTranslatePx(pendingClasses, 'y');
        dimPillSpan.textContent = 'offset ' + tx + 'px, ' + ty + 'px';
        pushHistory();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      isAltPressed = false;
      clearMeasureGuides();
    }
  });

  window.addEventListener('blur', () => {
    isAltPressed = false;
    clearMeasureGuides();
  });

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
      startW = Math.max(1, rect.width);
      startH = Math.max(1, rect.height);
      const aspectRatio = startW / startH;
      initialDiag = Math.hypot(startW, startH) || 1;
      initialFontSize = parseFloat(window.getComputedStyle(selectedTarget).fontSize) || 16;

      const isText = isTextElement(selectedTarget);
      const isCorner = ['tl', 'tr', 'bl', 'br'].includes(resizeHandle);
      let lastBypassSnap = false;

      const onPointerMove = (me) => {
        if (!isResizing || !selectedTarget) return;
        lastBypassSnap = me.ctrlKey || me.metaKey;
        const deltaX = me.clientX - startX;
        const deltaY = me.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (resizeHandle.includes('r')) newW = Math.max(20, startW + deltaX);
        if (resizeHandle.includes('l')) newW = Math.max(20, startW - deltaX);
        if (resizeHandle.includes('b')) newH = Math.max(20, startH + deltaY);
        if (resizeHandle.includes('t')) newH = Math.max(20, startH - deltaY);

        if (isText && isCorner) {
          // Canva / Figma Text Scale Mode: proportional corner scaling adjusts font-size in real time
          const currentDiag = Math.hypot(newW, newH);
          const scale = currentDiag / initialDiag;
          const currentPx = Math.max(10, Math.min(144, Math.round(initialFontSize * scale)));
          selectedTarget.style.fontSize = currentPx + 'px';
          updateHighlightBox(selectedTarget, true);
          dimPillSpan.textContent = currentPx + 'px';
        } else {
          // Shift+Drag locks aspect ratio on corners
          const lockRatio = isCorner && me.shiftKey;
          if (lockRatio) {
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              newH = Math.max(20, newW / aspectRatio);
            } else {
              newW = Math.max(20, newH * aspectRatio);
            }
          }
          selectedTarget.style.width = Math.round(newW) + 'px';
          if (!isText || lockRatio) {
            selectedTarget.style.height = Math.round(newH) + 'px';
          }
          updateHighlightBox(selectedTarget, true);
          dimPillSpan.textContent = Math.round(newW) + ' x ' + Math.round(newH) + (lockRatio ? ' (ratio)' : '');
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
            applyOptimisticClass(snapWidth(finalRect.width), true);
          }
          if ((!isText || (isCorner && ue && ue.shiftKey)) && (resizeHandle.includes('t') || resizeHandle.includes('b'))) {
            applyOptimisticClass(snapHeight(finalRect.height), true);
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
      if (me.shiftKey) {
        angle = Math.round(angle / 15) * 15;
      }
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

  // --- Full Recursive Layers Tree with Collapse/Expand, Component Badges, & Re-parenting Drag-Drop ---
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
      row.style.paddingLeft = (4 + depth * 10) + 'px';
      row.draggable = true;

      const badgeHtml = isComp
        ? '<span class="type-icon comp-icon" title="React Component"><svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor"><path d="M6 1L11 6L6 11L1 6Z"/></svg></span>'
        : (isText
          ? '<span class="type-icon text-icon" title="Text Layer">T</span>'
          : '<span class="type-icon frame-icon" title="Container Frame">#</span>');

      const caretHtml = hasChildren
        ? '<button class="caret-btn' + (isCollapsed ? ' collapsed' : '') + '" title="Toggle subtree"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg></button>'
        : '<span class="caret-spacer"></span>';

      const displayLabel = isComp && comp
        ? comp + ' <span style="opacity:0.65; font-size:10px;">&lt;' + name + '&gt;</span>'
        : '&lt;' + name + '&gt;';

      row.innerHTML = \`
        \${caretHtml}
        <div class="trail-title">
          \${badgeHtml}
          <span class="node-name">\${displayLabel}</span>
        </div>
        <div class="trail-actions">
          <button class="trail-btn btn-up" title="Move Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg></button>
          <button class="trail-btn btn-down" title="Move Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
          <button class="trail-btn btn-dup" title="Duplicate (Ctrl+D)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="trail-btn btn-del" title="Delete (Del)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg></button>
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

      row.querySelector('.trail-title').addEventListener('click', (e) => {
        selectElement(el, e.shiftKey);
      });
      row.querySelector('.btn-up').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'up'); });
      row.querySelector('.btn-down').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'down'); });
      row.querySelector('.btn-dup').addEventListener('click', (e) => { e.stopPropagation(); duplicateSelectedElement(el); });
      row.querySelector('.btn-del').addEventListener('click', (e) => { e.stopPropagation(); deleteSelectedElement(el); });

      // 3-zone Drag & Drop (Before / Nest Inside / After)
      const clearDropClasses = () => {
        row.classList.remove('drop-before', 'drop-inside', 'drop-after');
      };

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
        // Block dropping parent into its own descendant
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
      row.addEventListener('dragleave', () => {
        clearDropClasses();
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDropClasses();
        if (!draggedElement || draggedElement === el || draggedElement.contains(el)) return;

        const srcFile = draggedElement.getAttribute('data-flimsy-file');
        const dstFile = el.getAttribute('data-flimsy-file');
        if (srcFile && dstFile && srcFile === dstFile) {
          reparentElement(draggedElement, el, activeDropPosition);
        } else {
          // Cross-component fallback: reorder within source component
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
      syncStatus.style.color = '#7c5910';
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
        syncStatus.textContent = 'Hierarchy updated. Hot reloading...';
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
      syncStatus.style.color = '#7c5910';
      syncStatus.textContent = 'Duplicating element in ' + file.split('/').pop() + '...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'duplicate-element' } }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.textContent = 'Duplicated. Hot reloading...';
        setTimeout(() => { syncStatus.style.display = 'none'; }, 1500);
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
      syncStatus.textContent = 'Deleting element in ' + file.split('/').pop() + '...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'delete-element' } }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.textContent = 'Deleted. Hot reloading...';
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
      syncStatus.style.color = '#7c5910';
      syncStatus.textContent = 'Reordering...';

      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action: { type: 'reorder-child', direction } }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.textContent = 'Reordered. Hot reloading...';
        setTimeout(() => { syncStatus.style.display = 'none'; }, 1500);
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

  // --- Element Selection (Single & Shift+Click Multi-Select) ---
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
    const name = selectedTarget.getAttribute('data-flimsy-name') || selectedTarget.tagName.toLowerCase();

    elemTagDisplay.textContent = '<' + name + '>';
    elemLocDisplay.textContent = file.split('/').pop() + ':' + line;
    elemLocDisplay.title = file + ':' + line;

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
    if (!isInspectActive || isResizing || isRotating || isMarqueeDragging) return;
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

  // --- Marquee Drag Multi-Selection on Canvas ---
  let isMarqueeDragging = false;
  let marqueeSuppressClick = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;

  window.addEventListener('pointerdown', (e) => {
    if (!isInspectActive || e.button !== 0) return;
    if (e.composedPath().includes(container)) return;
    if (isResizing || isRotating) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const tagged = findTaggedElement(el);
    // Allow marquee drag when starting on empty space OR holding Alt+drag/background drag
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

      const left = Math.min(marqueeStartX, me.clientX);
      const top = Math.min(marqueeStartY, me.clientY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      marqueeBox.style.left = left + 'px';
      marqueeBox.style.top = top + 'px';
      marqueeBox.style.width = width + 'px';
      marqueeBox.style.height = height + 'px';
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
        // Skip huge wrapper ancestors that completely engulf the entire marquee
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

  // --- Click Selection (Single, Shift+Click Multi, or Empty-Canvas Deselect) ---
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

  // --- Double Click for Direct Inline Text Editing ---
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

  // Keep boxes aligned on scroll & resize
  const syncViewportBoxes = () => {
    if (selectedTarget) updateAllSelectionBoxes();
    else if (hoveredTarget) updateHighlightBox(hoveredTarget, false);
    if (isAltPressed && selectedTarget && hoveredTarget && hoveredTarget !== selectedTarget) {
      renderMeasureGuides(selectedTarget, hoveredTarget);
    }
  };
  window.addEventListener('scroll', syncViewportBoxes, { passive: true });
  window.addEventListener('resize', syncViewportBoxes, { passive: true });

  // --- Inspector Input Listeners ---
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

  // Segmented control click handlers (auto-activates flex when clicking flex flow/justify controls)
  panel.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = btn.getAttribute('data-class');
      if (!cls) return;
      if (btn.getAttribute('data-auto-flex') === '1' && selectedTarget) {
        const hasFlexOrGrid = /\\b(flex|inline-flex|grid|inline-grid)\\b/.test(selectedTarget.className || '');
        if (!hasFlexOrGrid) {
          applyOptimisticClass('flex', true);
        }
      }
      applyOptimisticClass(cls);
    });
  });

  // 9-Point Alignment Grid click handlers (auto-activates flex if missing)
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

  // Gap numeric input
  gapInput.addEventListener('change', () => {
    const val = gapInput.value.trim();
    if (!val) return;
    if (selectedTarget && !/\\b(flex|inline-flex|grid|inline-grid)\\b/.test(selectedTarget.className || '')) {
      applyOptimisticClass('flex', true);
    }
    const cls = /^\\d+$/.test(val) && TW_SPACING[val] ? ('gap-' + val) : ('gap-[' + (/^\\d+$/.test(val) ? val + 'px' : val) + ']');
    applyOptimisticClass(cls);
  });

  // Element Opacity Slider (smooth 60fps preview on input, single history push on change)
  opacitySlider.addEventListener('input', () => {
    const val = parseInt(opacitySlider.value, 10);
    opacityValLabel.textContent = val + '%';
    const standardSteps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    const cls = standardSteps.includes(val) ? ('opacity-' + val) : ('opacity-[' + val + '%]');
    applyOptimisticClass(cls, true);
  });
  opacitySlider.addEventListener('change', () => pushHistory());

  // Rotation Numeric Input
  rotateInput.addEventListener('change', () => {
    const raw = rotateInput.value.trim().replace(/deg$/i, '');
    const deg = parseInt(raw, 10);
    if (Number.isNaN(deg)) return;
    const cls = deg === 0 ? 'rotate-0' : ('rotate-[' + deg + 'deg]');
    applyOptimisticClass(cls);
  });

  // --- Figma 2D Spectrum Color Picker Modal ---
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
    const colors = new Set(['#ffffff', '#000000', '#fdf6df', '#d9b25f', '#1e1b16', '#0ea5e9', '#10b981', '#f43f5e']);

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
    if (val && !val.startsWith('#') && val !== 'transparent') val = '#' + val;
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
      syncStatus.style.color = '#7c5910';
      syncStatus.textContent = 'Eyedropper API not supported in this browser.';
      setTimeout(() => { syncStatus.style.display = 'none'; }, 1800);
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

  colorCloseBtn.addEventListener('click', () => {
    colorModal.style.display = 'none';
  });

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
        <span style="font-size:9.5px; opacity:0.6; font-family:Inter, sans-serif;">\${font.category}</span>
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
            link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(font.name) + ':wght@400;600;700&display=swap';
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

  // --- Spacing, Corner, & Individual Border Side Toggles ---
  padLinkBtn.addEventListener('click', () => {
    isPaddingLinked = !isPaddingLinked;
    padLinkBtn.classList.toggle('active', !isPaddingLinked);
    padLinkBtn.textContent = isPaddingLinked ? 'Linked' : '4-Sides';
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
    aiFeedback.textContent = 'Generating style suggestion...';

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
      aiGenerate.textContent = 'Apply AI Style';
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
        if (data.success && data.copyPrompt) {
          currentAICopyPrompt = data.copyPrompt;
        }
      } catch {}
    }

    const fallbackPrompt = 'Target: ' + file + ':' + line + ':' + col + '\\nClasses: ' + pendingClasses + '\\nGoal: ' + prompt;
    const textToCopy = currentAICopyPrompt || fallbackPrompt;

    try {
      await navigator.clipboard.writeText(textToCopy);
      aiFeedback.style.display = 'block';
      aiFeedback.textContent = 'Context & prompt copied to clipboard.';
      setTimeout(() => { aiFeedback.style.display = 'none'; }, 2000);
    } catch {
      aiFeedback.style.display = 'block';
      aiFeedback.textContent = 'Clipboard permission denied.';
    }
  });

  // --- Discard / Reset Button ---
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
    syncStatus.style.color = '#5e5444';
    syncStatus.textContent = 'Changes reset.';
    setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
  });

  // --- Compute Exact Class Diff (Safe for StringLiteral, TemplateLiteral, and cn()/clsx()) ---
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
      syncStatus.style.color = '#5e5444';
      syncStatus.textContent = 'No modifications to sync.';
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
        syncStatus.style.color = '#166534';
        syncStatus.textContent = isBatch
          ? ('Synced ' + dirtyUpdates.length + ' elements to code')
          : ('Synced to ' + dirtyUpdates[0].file.split('/').pop() + ':' + dirtyUpdates[0].line);
        dockSyncBadge.className = 'sync-status-badge synced';
        dockSyncBadge.querySelector('.text').textContent = 'Synced';
        syncBtn.textContent = 'In Sync';
        syncBtn.disabled = false;
        setTimeout(() => {
          updateSyncBadge();
          syncStatus.style.display = 'none';
        }, 1800);
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
