import { ICONS, FONTS } from './icons.js';
import { STUDIO_STYLES } from './styles.js';
import {
  TW_SPACING,
  TW_FONT_SIZE,
  buildPreviewRule,
  getClientClassCategory,
  rgbStringToHexAndAlpha,
  rgbToHsv,
  hsvToRgb,
  rgbToHex,
  parseRotationDeg,
  parseTranslatePx,
  parseInsetPx,
  buildClassUpdateAction,
} from './tailwind-preview.js';
import {
  createDockHTML,
  createHighlightBoxHTML,
  createLayersPanelHTML,
  createInspectorPanelHTML,
  createColorModalHTML,
  createFontModalHTML,
} from './templates.js';

function bootFlimsyStudio() {
  if ((window as any).__FLIMSY_INITIALIZED__) return;
  (window as any).__FLIMSY_INITIALIZED__ = true;
  const API_BASE: string = (window as any).__FLIMSY_API_BASE__ || '';

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


  // --- Live Optimistic Tailwind CSS Preview Engine ---
  let liveStyleEl = document.getElementById('flimsy-live-preview');
  if (!liveStyleEl) {
    liveStyleEl = document.createElement('style');
    liveStyleEl.id = 'flimsy-live-preview';
    document.head.appendChild(liveStyleEl);
  }
  const injectedPreviewClasses = new Set();

  function ensurePreviewRulesForClasses(classesStr) {
    if (!classesStr) return;
    const tokens = classesStr.split(/\s+/).filter(Boolean);
    let newCss = '';
    for (const cls of tokens) {
      if (injectedPreviewClasses.has(cls)) continue;
      const body = buildPreviewRule(cls);
      if (body) {
        injectedPreviewClasses.add(cls);
        newCss += '[data-flimsy-file].' + CSS.escape(cls) + ' { ' + body + ' }\n';
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
    const activeDoc = document.activeElement as HTMLElement | null;
    if (activeDoc && (activeDoc.tagName === 'INPUT' || activeDoc.tagName === 'TEXTAREA' || activeDoc.tagName === 'SELECT' || activeDoc.isContentEditable)) {
      return true;
    }
    const activeShadow = (shadow && shadow.activeElement) as HTMLElement | null;
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
  style.textContent = STUDIO_STYLES;
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
  dock.innerHTML = createDockHTML();
  shadow.appendChild(dock);

  const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T =>
    root.querySelector(sel) as unknown as T;

  const dockBtn = q<HTMLButtonElement>(dock, '.dock-btn');
  const dockExtra = q<HTMLDivElement>(dock, '#flimsy-dock-extra');
  const handToolBtn = q<HTMLButtonElement>(dock, '#flimsy-hand-tool');
  const textToolBtn = q<HTMLButtonElement>(dock, '#flimsy-text-tool');
  const layersToggleBtn = q<HTMLButtonElement>(dock, '#flimsy-layers-toggle');
  const snapToggleBtn = q<HTMLButtonElement>(dock, '#flimsy-snap-toggle');
  const undoBtn = q<HTMLButtonElement>(dock, '#flimsy-undo-btn');
  const redoBtn = q<HTMLButtonElement>(dock, '#flimsy-redo-btn');
  const dockAiBtn = q<HTMLButtonElement>(dock, '#flimsy-dock-ai-btn');
  const zoomPillBtn = q<HTMLButtonElement>(dock, '#flimsy-zoom-pill');
  const dockSyncBadge = q<HTMLDivElement>(dock, '#flimsy-dock-sync-status');

  // --- Highlight Box with 8 Grab Handles + Rotation Knob ---
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = createHighlightBoxHTML();
  shadow.appendChild(highlightBox);

  const tagNameSpan = q<HTMLSpanElement>(highlightBox, '.tag-name');
  const locSpan = q<HTMLSpanElement>(highlightBox, '.loc');
  const dimPillSpan = q<HTMLDivElement>(highlightBox, '.dim-pill');
  const rotateHandle = q<HTMLDivElement>(highlightBox, '#flimsy-rotate-handle');

  // --- Left Floating Layers Tree Panel ---
  const layersPanel = document.createElement('div');
  layersPanel.className = 'glass-card layers-panel no-scroll';
  layersPanel.id = 'flimsy-layers-panel';
  layersPanel.innerHTML = createLayersPanelHTML();
  shadow.appendChild(layersPanel);

  const trailContainer = q<HTMLDivElement>(layersPanel, '#flimsy-trail');
  const layersCloseBtn = q<HTMLButtonElement>(layersPanel, '#flimsy-layers-close');
  const layersRefreshBtn = q<HTMLButtonElement>(layersPanel, '#flimsy-layers-refresh');

  // --- Right Floating Streamlined Inspector Card ---
  const panel = document.createElement('div');
  panel.className = 'glass-card studio-panel no-scroll';
  panel.innerHTML = createInspectorPanelHTML();
  shadow.appendChild(panel);

  // --- Floating 2D Spectrum Color Picker Modal ---
  const colorModal = document.createElement('div');
  colorModal.className = 'figma-color-modal';
  colorModal.innerHTML = createColorModalHTML();
  shadow.appendChild(colorModal);

  // --- Searchable Typography Font Modal ---
  const fontModal = document.createElement('div');
  fontModal.className = 'font-modal no-scroll';
  fontModal.innerHTML = createFontModalHTML();
  shadow.appendChild(fontModal);

  // --- Inspector Element Refs ---
  const elemTagDisplay = q<HTMLSpanElement>(panel, '#flimsy-elem-tag');
  const elemLocDisplay = q<HTMLSpanElement>(panel, '#flimsy-elem-loc');
  const instanceBadge = q<HTMLSpanElement>(panel, '#flimsy-instance-badge');
  const textGroup = q<HTMLDivElement>(panel, '#flimsy-text-group');
  const textInput = q<HTMLInputElement>(panel, '#flimsy-text-input');
  const classesRawInput = q<HTMLInputElement>(panel, '#flimsy-classes-raw');
  const classesToggle = q<HTMLButtonElement>(panel, '#flimsy-classes-toggle');
  const classesDrawer = q<HTMLDivElement>(panel, '#flimsy-classes-drawer');
  const diffBox = q<HTMLDivElement>(panel, '#flimsy-diff-box');
  const syncBtn = q<HTMLButtonElement>(panel, '#flimsy-sync-btn');
  const discardBtn = q<HTMLButtonElement>(panel, '#flimsy-discard-btn');
  const syncStatus = q<HTMLDivElement>(panel, '#flimsy-sync-status');
  const closeBtn = q<HTMLButtonElement>(panel, '#flimsy-close-btn');

  const widthInput = q<HTMLInputElement>(panel, '#flimsy-width-input');
  const heightInput = q<HTMLInputElement>(panel, '#flimsy-height-input');
  const posXInput = q<HTMLInputElement>(panel, '#flimsy-pos-x-input');
  const posYInput = q<HTMLInputElement>(panel, '#flimsy-pos-y-input');
  const gapInput = q<HTMLInputElement>(panel, '#flimsy-gap-input');
  const padInput = q<HTMLInputElement>(panel, '#flimsy-pad-input');
  const radiusInput = q<HTMLInputElement>(panel, '#flimsy-radius-input');
  const opacitySlider = q<HTMLInputElement>(panel, '#flimsy-opacity-slider');
  const opacityValLabel = q<HTMLSpanElement>(panel, '#flimsy-opacity-val');
  const rotateInput = q<HTMLInputElement>(panel, '#flimsy-rotate-input');
  const weightSelect = q<HTMLSelectElement>(panel, '#flimsy-weight-select');
  const sizeInput = q<HTMLInputElement>(panel, '#flimsy-size-input');
  const leadingSelect = q<HTMLSelectElement>(panel, '#seg-leading');
  const trackingSelect = q<HTMLSelectElement>(panel, '#seg-tracking');

  const borderAccordionBtn = q<HTMLButtonElement>(panel, '#flimsy-border-accordion-btn');
  const borderAccordionIcon = q<HTMLSpanElement>(panel, '#flimsy-border-accordion-icon');
  const borderBody = q<HTMLDivElement>(panel, '#flimsy-border-body');
  const effectsAccordionBtn = q<HTMLButtonElement>(panel, '#flimsy-effects-accordion-btn');
  const effectsAccordionIcon = q<HTMLSpanElement>(panel, '#flimsy-effects-accordion-icon');
  const effectsBody = q<HTMLDivElement>(panel, '#flimsy-effects-body');

  const aiToggle = q<HTMLButtonElement>(panel, '#flimsy-ai-toggle');
  const aiDrawer = q<HTMLDivElement>(panel, '#flimsy-ai-drawer');
  const aiInput = q<HTMLInputElement>(panel, '#flimsy-ai-input');
  const aiGenerate = q<HTMLButtonElement>(panel, '#flimsy-ai-generate');
  const aiCopy = q<HTMLButtonElement>(panel, '#flimsy-ai-copy');
  const aiFeedback = q<HTMLDivElement>(panel, '#flimsy-ai-feedback');
  let currentAICopyPrompt = '';

  const colorTrigger = q<HTMLDivElement>(panel, '#flimsy-color-trigger');
  const colorThumb = q<HTMLDivElement>(panel, '#flimsy-color-thumb');
  const colorHexLabel = q<HTMLSpanElement>(panel, '#flimsy-color-hex-label');
  const colorOpacityLabel = q<HTMLSpanElement>(panel, '#flimsy-color-opacity-label');
  const targetFillBtn = q<HTMLButtonElement>(panel, '#flimsy-target-fill');
  const targetTextBtn = q<HTMLButtonElement>(panel, '#flimsy-target-text');
  const targetStrokeBtn = q<HTMLButtonElement>(panel, '#flimsy-target-stroke');

  const colorCanvas = q<HTMLCanvasElement>(colorModal, '#flimsy-color-canvas');
  const colorCanvasWrap = q<HTMLDivElement>(colorModal, '#flimsy-canvas-wrap');
  const canvasThumb = q<HTMLDivElement>(colorModal, '#flimsy-canvas-thumb');
  const hueSlider = q<HTMLInputElement>(colorModal, '#flimsy-hue-slider');
  const alphaSlider = q<HTMLInputElement>(colorModal, '#flimsy-alpha-slider');
  const modalHexInput = q<HTMLInputElement>(colorModal, '#flimsy-modal-hex');
  const modalAlphaText = q<HTMLSpanElement>(colorModal, '#flimsy-modal-alpha-text');
  const eyedropperBtn = q<HTMLButtonElement>(colorModal, '#flimsy-eyedropper-btn');
  const colorCloseBtn = q<HTMLButtonElement>(colorModal, '#flimsy-color-close');
  const docColorsGrid = q<HTMLDivElement>(colorModal, '#flimsy-doc-colors');

  const fontTrigger = q<HTMLButtonElement>(panel, '#flimsy-font-trigger');
  const currentFontName = q<HTMLSpanElement>(panel, '#flimsy-current-font-name');
  const fontSearch = q<HTMLInputElement>(fontModal, '#flimsy-font-search');
  const fontListContainer = q<HTMLDivElement>(fontModal, '#flimsy-font-list');
  const fontCloseBtn = q<HTMLButtonElement>(fontModal, '#flimsy-font-close');

  const padLinkBtn = q<HTMLButtonElement>(panel, '#flimsy-pad-link-btn');
  const padGrid = q<HTMLDivElement>(panel, '#flimsy-pad-grid');
  const radLinkBtn = q<HTMLButtonElement>(panel, '#flimsy-radius-link-btn');
  const radGrid = q<HTMLDivElement>(panel, '#flimsy-radius-grid');
  const borderSideBtn = q<HTMLButtonElement>(panel, '#flimsy-border-side-btn');
  const borderSideGrid = q<HTMLDivElement>(panel, '#flimsy-border-side-grid');


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
      const oldSet = originalClasses.split(/\s+/).filter(Boolean);
      const newSet = pendingClasses.split(/\s+/).filter(Boolean);
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
  function applyClassToElement(el, newClass, removeOnlyCategory = null) {
    const parts = newClass ? newClass.split(':') : [''];
    const base = parts[parts.length - 1];
    const variantPrefix = parts.length > 1 ? parts.slice(0, -1).join(':') : '';
    const category = removeOnlyCategory || getClientClassCategory(base);

    const currentTokens = (el.className || '').split(/\s+/).filter(Boolean);
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

  function isAbsolutePositioned(el) {
    return /\b(absolute|fixed)\b/.test(el?.className || '');
  }

  function getElementPosXY(el) {
    const cls = el.className || '';
    if (isAbsolutePositioned(el)) {
      const cs = window.getComputedStyle(el);
      const hasLeft = /\b-?left-/.test(cls);
      const hasTop = /\b-?top-/.test(cls);
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
    const tokens = (classesStr || '').split(/\s+/).filter(Boolean);
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
    const fontToken = tokens.find((t) => /^font-(sans|serif|mono|\[)/.test(t));
    if (fontToken) {
      const found = FONTS.find((f) => fontToken.includes(f.name.replace(/\s+/g, '_')) || fontToken === 'font-' + f.name.toLowerCase());
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
      const m = opTok.match(/^opacity-(?:\[(\d+)%\]|(\d+))$/);
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
      const res = await fetch(API_BASE + '/__flimsy/api/copy', {
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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

  function toggleInspect(force?: boolean) {
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

  function toggleAIDrawer(force?: boolean) {
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
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
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

          const snapFont = (px: number) => {
            if (shouldSnap) {
              const steps: Array<[number, string]> = [
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

          const snapWidth = (w: number) => {
            if (shouldSnap) {
              const steps: Array<[number, string]> = [
                [64, 'w-16'], [80, 'w-20'], [96, 'w-24'], [128, 'w-32'], [160, 'w-40'],
                [192, 'w-48'], [224, 'w-56'], [256, 'w-64'], [288, 'w-72'], [320, 'w-80'], [384, 'w-96']
              ];
              for (const [px, cls] of steps) {
                if (Math.abs(w - px) <= 6) return cls;
              }
            }
            return 'w-[' + Math.round(w) + 'px]';
          };

          const snapHeight = (h: number) => {
            if (shouldSnap) {
              const steps: Array<[number, string]> = [
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

      row.innerHTML = `
        ${caretHtml}
        <div class="trail-title">
          ${badgeHtml}
          <span class="node-name">${displayLabel}</span>
        </div>
        <div class="trail-actions">
          <button class="trail-btn btn-up" title="Move Up">${ICONS.up}</button>
          <button class="trail-btn btn-down" title="Move Down">${ICONS.down}</button>
          <button class="trail-btn btn-dup" title="Duplicate (Ctrl+D)">${ICONS.copy}</button>
          <button class="trail-btn btn-del" title="Delete (Del)">${ICONS.trash}</button>
        </div>
      `;

      const caretBtn = row.querySelector('.caret-btn');
      if (caretBtn) {
        caretBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (collapsedLayerKeys.has(key)) collapsedLayerKeys.delete(key);
          else collapsedLayerKeys.add(key);
          renderFullLayersTree();
        });
      }

      row.querySelector('.trail-title').addEventListener('click', (e: MouseEvent) => selectElement(el, e.shiftKey));
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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
      const res = await fetch(API_BASE + '/__flimsy/api/inspect?file=' + encodeURIComponent(file));
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
    const toks = pendingClasses.split(/\s+/);
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

    // Bridge active browser selection to local MCP server (best-effort, non-blocking)
    try {
      const toSelectionTarget = (el) => ({
        file: el.getAttribute('data-flimsy-file') || '',
        line: parseInt(el.getAttribute('data-flimsy-line') || '0', 10),
        col: parseInt(el.getAttribute('data-flimsy-col') || '0', 10),
        tagName: el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase(),
        componentName: el.getAttribute('data-flimsy-comp') || '',
        classes: el.className || '',
        text: isTextElement(el) ? (el.innerText || '').trim() : '',
      });
      fetch(API_BASE + '/__flimsy/api/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary: toSelectionTarget(selectedTarget),
          targets: selectedTargets.map(toSelectionTarget),
        }),
      }).catch(() => {});
    } catch {}

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
    if (/^\d+$/.test(val)) {
      const px = parseInt(val, 10);
      if (isSnapEnabled && px % 4 === 0 && TW_SPACING[String(px / 4)]) {
        return prefix + '-' + (px / 4);
      }
      return prefix + '-[' + px + 'px]';
    }
    if (/^\d+px$/.test(val)) {
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
    if (selectedTarget && !/\b(flex|inline-flex|grid|inline-grid)\b/.test(selectedTarget.className || '')) {
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
        const hasFlexOrGrid = /\b(flex|inline-flex|grid|inline-grid)\b/.test(selectedTarget.className || '');
        if (!hasFlexOrGrid) applyOptimisticClass('flex', true);
      }
      applyOptimisticClass(cls);
    });
  });

  panel.querySelectorAll('.align-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      if (!selectedTarget) return;
      const hasFlexOrGrid = /\b(flex|inline-flex|grid|inline-grid)\b/.test(selectedTarget.className || '');
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
    if ((window as any).EyeDropper) {
      try {
        const eye = new (window as any).EyeDropper();
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
      row.innerHTML = `
        <span>${font.name}</span>
        <span style="font-size:9.5px; opacity:0.55; font-family:Inter, sans-serif;">${font.category}</span>
      `;
      row.addEventListener('click', () => {
        currentFontName.textContent = font.name;
        fontModal.style.display = 'none';

        if (!font.category.includes('System')) {
          const fontId = 'flimsy-font-' + font.name.replace(/\s+/g, '-').toLowerCase();
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
          : "font-['" + font.name.replace(/\s+/g, '_') + "']";

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
    const input = panel.querySelector('#' + id) as HTMLInputElement | null;
    const prefixes = ['pt-', 'pr-', 'pb-', 'pl-'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          const cls = /^\d+$/.test(val) ? prefixes[idx] + val : prefixes[idx] + '[' + val + ']';
          applyOptimisticClass(cls);
        }
      });
    }
  });

  ['rad-tl', 'rad-tr', 'rad-br', 'rad-bl'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id) as HTMLInputElement | null;
    const prefixes = ['rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          const cls = /^\d+px$/.test(val) ? (prefixes[idx] + '[' + val + ']') : (prefixes[idx] + val);
          applyOptimisticClass(cls);
        }
      });
    }
  });

  ['bdr-t', 'bdr-r', 'bdr-b', 'bdr-l'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id) as HTMLInputElement | null;
    const sides = ['t', 'r', 'b', 'l'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (!val) return;
        const side = sides[idx];
        let cls = '';
        if (val === '1' || val === '1px') cls = 'border-' + side;
        else if (/^(0|2|4|8)$/.test(val)) cls = 'border-' + side + '-' + val;
        else cls = 'border-' + side + '-[' + (/^\d+$/.test(val) ? val + 'px' : val) + ']';
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
      const res = await fetch(API_BASE + '/__flimsy/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, prompt }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.suggestion && data.suggestion.suggestedClasses) {
          const newTokens = data.suggestion.suggestedClasses.split(/\s+/).filter(Boolean);
          const oldTokens = (data.context?.currentClasses || '').split(/\s+/).filter(Boolean);
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
        const res = await fetch(API_BASE + '/__flimsy/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file, line, col, prompt }),
        });
        const data = await res.json();
        if (data.success && data.copyPrompt) currentAICopyPrompt = data.copyPrompt;
      } catch {}
    }

    const fallbackPrompt = 'Target: ' + file + ':' + line + ':' + col + '\nClasses: ' + pendingClasses + '\nGoal: ' + prompt;
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

      const res = await fetch(API_BASE + '/__flimsy/api/update', {
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
          await fetch(API_BASE + '/__flimsy/api/update', {
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

}

bootFlimsyStudio();
