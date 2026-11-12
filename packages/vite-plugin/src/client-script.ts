export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Studio active. Alt+X to toggle inspect. Ctrl+Z to undo.');

  // State
  let isInspectActive = false;
  let isLayersOpen = true;
  let hoveredTarget = null;
  let selectedTarget = null;
  let originalClasses = '';
  let originalText = '';
  let pendingText = null;
  let pendingClasses = '';
  let fileMtime = 0;

  // History buffer for Undo/Redo
  let history = [];
  let historyIdx = -1;

  function pushHistory(classes, text) {
    if (historyIdx < history.length - 1) {
      history = history.slice(0, historyIdx + 1);
    }
    history.push({ classes, text });
    historyIdx = history.length - 1;
    updateUndoRedoUI();
    renderDiff();
  }

  function undo() {
    if (historyIdx > 0 && selectedTarget) {
      historyIdx--;
      applyHistoryState(history[historyIdx]);
    }
  }

  function redo() {
    if (historyIdx < history.length - 1 && selectedTarget) {
      historyIdx++;
      applyHistoryState(history[historyIdx]);
    }
  }

  function applyHistoryState(state) {
    if (!selectedTarget) return;
    pendingClasses = state.classes;
    pendingText = state.text;
    selectedTarget.className = pendingClasses;
    selectedTarget.innerText = pendingText !== null ? pendingText : originalText;
    textInput.value = pendingText !== null ? pendingText : originalText;
    classesRawInput.value = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateHighlightBox(selectedTarget, true);
    updateUndoRedoUI();
    renderDiff();
  }

  // Isolated Shadow DOM Root
  const container = document.createElement('div');
  container.id = 'flimsy-root';
  container.style.cssText = 'position:fixed; z-index:2147483647; pointer-events:none; top:0; left:0; width:100%; height:100%;';
  const shadow = container.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(container);

  // Light Frosted Cream Vellum Glass + Figma UI3 Minimalist Theme
  const style = document.createElement('style');
  style.textContent = \`
    * {
      box-sizing: border-box;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
    }

    :host {
      --glass-bg: rgba(253, 248, 235, 0.86);
      --glass-well: rgba(235, 224, 196, 0.52);
      --glass-hover: rgba(217, 178, 95, 0.16);
      --glass-border: rgba(201, 154, 59, 0.36);
      --glass-hairline: rgba(30, 27, 22, 0.08);
      --ink-primary: #1e1b16;
      --ink-secondary: #5e5444;
      --ink-muted: #8a7f6b;
      --gold: #d9b25f;
      --gold-strong: #c69a3b;
      --gold-tint: rgba(217, 178, 95, 0.24);
      --glass-shadow: 0 18px 42px rgba(24, 19, 12, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.78);
    }

    /* Hide ugly scrollbars cleanly */
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
      gap: 3px;
      pointer-events: auto;
      user-select: none;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
      transition: all 0.15s ease;
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
    .dock-tool.brand-mark:hover {
      background: transparent;
    }

    /* Clean Hover Tooltip on Icon Buttons */
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

    /* Highlight Bounding Box & Anchors (Honey Gold) */
    .box-highlight {
      position: absolute;
      border: 1.5px solid var(--gold-strong);
      background: rgba(217, 178, 95, 0.08);
      pointer-events: none;
      display: none;
      z-index: 10;
      border-radius: 3px;
    }
    .box-highlight.selected {
      border: 1.5px solid var(--gold-strong);
      background: rgba(217, 178, 95, 0.13);
      box-shadow: 0 0 0 1px rgba(255, 253, 247, 0.4);
    }
    .handle {
      position: absolute;
      width: 7px;
      height: 7px;
      background: #fffdf7;
      border: 1.5px solid var(--gold-strong);
      border-radius: 1.5px;
      display: none;
    }
    .box-highlight.selected .handle { display: block; }
    .handle-tl { top: -4px; left: -4px; }
    .handle-tr { top: -4px; right: -4px; }
    .handle-bl { bottom: -4px; left: -4px; }
    .handle-br { bottom: -4px; right: -4px; }

    .box-tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      background: rgba(253, 248, 235, 0.94);
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
    }
    .box-tooltip .tag-name { color: #8c6618; font-family: ui-monospace, SFMono-Regular, monospace; }
    .box-tooltip .loc { color: var(--ink-muted); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; }
    .dim-pill {
      position: absolute;
      top: calc(100% + 5px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--gold);
      color: #1e1b16;
      font-size: 10px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
      box-shadow: 0 3px 10px rgba(24, 19, 12, 0.16);
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
      animation: floatIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes floatIn {
      from { opacity: 0; transform: translateY(4px) scale(0.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Top-Left Floating Layers Tree */
    .layers-panel {
      position: fixed;
      top: 16px;
      left: 16px;
      width: 204px;
      max-height: calc(100vh - 104px);
      overflow-y: auto;
      padding: 10px;
      display: none;
      flex-direction: column;
      gap: 6px;
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
    .trail {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .trail-item {
      cursor: pointer;
      padding: 5px 8px;
      border-radius: 7px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: var(--ink-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.12s;
    }
    .trail-item:hover {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }
    .trail-item.active {
      background: var(--gold-tint);
      color: var(--ink-primary);
      font-weight: 600;
    }
    .trail-indent {
      width: 6px;
      height: 6px;
      border-left: 1px solid var(--ink-muted);
      border-bottom: 1px solid var(--ink-muted);
      opacity: 0.45;
      flex-shrink: 0;
      margin-top: -3px;
    }

    /* Top-Right Floating Inspector Card */
    .studio-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 288px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 10px;
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
      color: #7c5910;
      background: var(--gold-tint);
      border: 1px solid rgba(201, 154, 59, 0.35);
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

    /* Minimal Property Rows */
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
      font-size: 10.5px;
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

    /* Swatches */
    .swatches {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .swatch {
      width: 19px;
      height: 19px;
      border-radius: 50%;
      border: 1.5px solid rgba(30, 27, 22, 0.18);
      cursor: pointer;
      transition: transform 0.15s, border-color 0.15s;
    }
    .swatch:hover {
      transform: scale(1.14);
      border-color: var(--gold-strong);
    }

    .clean-input {
      background: rgba(255, 253, 247, 0.78);
      border: 1px solid rgba(30, 27, 22, 0.12);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--ink-primary);
      font-size: 11.5px;
      outline: none;
      width: 100%;
      transition: border-color 0.15s, background 0.15s;
    }
    .clean-input::placeholder { color: var(--ink-muted); }
    .clean-input:focus {
      border-color: var(--gold-strong);
      background: #fffdf7;
    }

    /* Compact Collapsible Drawers */
    .drawer-pills {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .pill-toggle {
      background: var(--glass-well);
      border: 1px solid transparent;
      color: var(--ink-secondary);
      font-size: 10.5px;
      font-weight: 500;
      padding: 4px 9px;
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

  // Bottom-Center Floating Glass Pill Dock (Icon-only with hover tooltips)
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
    <span class="dock-tool brand-mark" data-tip="Flimsy Visual Sync">
      <svg viewBox="0 0 24 24" fill="none" stroke="#c69a3b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5 14.5 4 20 11.5 9.5 19Z" fill="rgba(253, 246, 223, 0.9)"/><path d="M14.5 4c-.8 4.2 1.2 6.8 5.5 7.5" fill="rgba(217, 178, 95, 0.45)"/></svg>
    </span>
  \`;
  shadow.appendChild(dock);

  const dockBtn = dock.querySelector('.dock-btn');
  const dockExtra = dock.querySelector('#flimsy-dock-extra');
  const textToolBtn = dock.querySelector('#flimsy-text-tool');
  const layersToggleBtn = dock.querySelector('#flimsy-layers-toggle');
  const undoBtn = dock.querySelector('#flimsy-undo-btn');
  const redoBtn = dock.querySelector('#flimsy-redo-btn');
  const dockAiBtn = dock.querySelector('#flimsy-dock-ai-btn');

  // Highlight Box with Handles
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = \`
    <div class="handle handle-tl"></div>
    <div class="handle handle-tr"></div>
    <div class="handle handle-bl"></div>
    <div class="handle handle-br"></div>
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

  // Left Floating Layers Card (Auto-opens on element selection)
  const layersPanel = document.createElement('div');
  layersPanel.className = 'glass-card layers-panel no-scroll';
  layersPanel.id = 'flimsy-layers-panel';
  layersPanel.innerHTML = \`
    <div class="layers-header">
      <span>Layers</span>
      <button class="icon-btn" id="flimsy-layers-close" title="Hide Layers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="trail" id="flimsy-trail"></div>
  \`;
  shadow.appendChild(layersPanel);

  const trailContainer = layersPanel.querySelector('#flimsy-trail');
  const layersCloseBtn = layersPanel.querySelector('#flimsy-layers-close');

  // Right Floating Inspector Card
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

    <div class="prop-section" id="flimsy-text-group">
      <div class="prop-row-inline">
        <span class="prop-label">Text</span>
        <input type="text" id="flimsy-text-input" class="clean-input" placeholder="Double-click on page...">
      </div>
    </div>

    <div class="prop-section">
      <span class="prop-label">Typography</span>
      <div class="segmented" id="seg-font-size">
        <button class="seg-btn" data-class="text-xs">xs</button>
        <button class="seg-btn" data-class="text-sm">sm</button>
        <button class="seg-btn" data-class="text-base">md</button>
        <button class="seg-btn" data-class="text-lg">lg</button>
        <button class="seg-btn" data-class="text-xl">xl</button>
      </div>
      <div class="segmented" id="seg-font-weight">
        <button class="seg-btn" data-class="font-normal">Reg</button>
        <button class="seg-btn" data-class="font-medium">Med</button>
        <button class="seg-btn" data-class="font-semibold">Semi</button>
        <button class="seg-btn" data-class="font-bold">Bold</button>
      </div>
    </div>

    <div class="prop-section">
      <span class="prop-label">Spacing</span>
      <div class="segmented" id="seg-padding">
        <button class="seg-btn" data-class="p-0">p-0</button>
        <button class="seg-btn" data-class="p-2">p-2</button>
        <button class="seg-btn" data-class="p-4">p-4</button>
        <button class="seg-btn" data-class="p-6">p-6</button>
        <button class="seg-btn" data-class="p-8">p-8</button>
      </div>
      <div class="segmented" id="seg-radius">
        <button class="seg-btn" data-class="rounded-none">0</button>
        <button class="seg-btn" data-class="rounded-md">md</button>
        <button class="seg-btn" data-class="rounded-lg">lg</button>
        <button class="seg-btn" data-class="rounded-xl">xl</button>
        <button class="seg-btn" data-class="rounded-full">Full</button>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Theme</span>
        <div class="swatches" id="color-swatches">
          <div class="swatch" data-classes="bg-transparent text-stone-800" style="background:transparent; border-style:dashed;" title="Transparent"></div>
          <div class="swatch" data-classes="bg-amber-50 text-stone-900" style="background:#fdf6df;" title="Cream"></div>
          <div class="swatch" data-classes="bg-amber-400 text-stone-950" style="background:#d9b25f;" title="Gold"></div>
          <div class="swatch" data-classes="bg-stone-900 text-amber-50" style="background:#1e1b16;" title="Charcoal"></div>
          <div class="swatch" data-classes="bg-sky-500 text-white" style="background:#0ea5e9;" title="Sky"></div>
          <div class="swatch" data-classes="bg-emerald-500 text-white" style="background:#10b981;" title="Emerald"></div>
          <div class="swatch" data-classes="bg-rose-500 text-white" style="background:#f43f5e;" title="Rose"></div>
          <div class="swatch" data-classes="bg-white text-slate-900" style="background:#ffffff;" title="White"></div>
        </div>
      </div>
    </div>

    <div class="prop-section">
      <span class="prop-label">Layout</span>
      <div class="segmented" id="seg-layout">
        <button class="seg-btn" data-class="flex-row">Row</button>
        <button class="seg-btn" data-class="flex-col">Col</button>
        <button class="seg-btn" data-class="justify-start">Start</button>
        <button class="seg-btn" data-class="justify-center">Center</button>
        <button class="seg-btn" data-class="justify-between">Between</button>
      </div>
    </div>

    <div class="prop-section no-divider">
      <div class="drawer-pills">
        <button class="pill-toggle" id="flimsy-ai-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
          AI Assist
        </button>
        <button class="pill-toggle" id="flimsy-classes-toggle">Classes</button>
      </div>

      <div id="flimsy-ai-drawer" class="ai-drawer">
        <input type="text" id="flimsy-ai-input" class="clean-input" placeholder="e.g. Glassmorphism, Neon glow...">
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

    <div id="flimsy-diff-box" class="diff-container no-scroll"></div>

    <div class="sync-row">
      <button id="flimsy-sync-btn" class="sync-btn">No Changes</button>
      <button id="flimsy-discard-btn" class="discard-btn" title="Discard pending changes">Reset</button>
    </div>
    <div id="flimsy-sync-status" class="sync-status"></div>
  \`;
  shadow.appendChild(panel);

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

  const aiToggle = panel.querySelector('#flimsy-ai-toggle');
  const aiDrawer = panel.querySelector('#flimsy-ai-drawer');
  const aiInput = panel.querySelector('#flimsy-ai-input');
  const aiGenerate = panel.querySelector('#flimsy-ai-generate');
  const aiCopy = panel.querySelector('#flimsy-ai-copy');
  const aiFeedback = panel.querySelector('#flimsy-ai-feedback');
  let currentAICopyPrompt = '';

  function updateUndoRedoUI() {
    undoBtn.disabled = historyIdx <= 0;
    redoBtn.disabled = historyIdx >= history.length - 1;
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

      const delLine = document.createElement('div');
      delLine.className = 'diff-del';
      delLine.textContent = '- ' + (removed.length ? removed.join(' ') : (originalClasses || '(none)'));
      const addLine = document.createElement('div');
      addLine.className = 'diff-add';
      addLine.textContent = '+ ' + (added.length ? added.join(' ') : (pendingClasses || '(none)'));
      diffBox.appendChild(delLine);
      diffBox.appendChild(addLine);
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

    diffBox.style.display = hasDiff ? 'flex' : 'none';
    syncBtn.classList.toggle('dirty', hasDiff);
    syncBtn.textContent = hasDiff ? 'Sync to Code' : 'No Changes';
  }

  // Client-side Tailwind category disambiguation for instant optimistic preview
  function applyOptimisticClass(newClass, skipHistory = false) {
    if (!selectedTarget) return;

    const parts = newClass.split(':');
    const base = parts[parts.length - 1];
    const variantPrefix = parts.length > 1 ? parts.slice(0, -1).join(':') : '';

    let category = '';
    if (/^text-(xs|sm|base|lg|[0-9]?xl)$/.test(base)) category = 'font-size';
    else if (/^text-(left|center|right|justify)$/.test(base)) category = 'text-align';
    else if (base.startsWith('text-')) category = 'text-color';
    else if (base.startsWith('font-')) category = 'font-weight';
    else if (base.startsWith('rounded')) category = 'border-radius';
    else if (base.startsWith('shadow')) category = 'box-shadow';
    else if (base.startsWith('p-')) category = 'padding';
    else if (base.startsWith('m-')) category = 'margin';
    else if (base.startsWith('bg-')) category = 'bg-color';
    else if (/^flex-(row|col)$/.test(base)) category = 'flex-dir';
    else if (base.startsWith('justify-')) category = 'justify';

    const currentTokens = (selectedTarget.className || '').split(/\\s+/).filter(Boolean);
    const filtered = currentTokens.filter((token) => {
      const tParts = token.split(':');
      const tPrefix = tParts.length > 1 ? tParts.slice(0, -1).join(':') : '';
      if (tPrefix !== variantPrefix) return true;
      const b = tParts[tParts.length - 1];
      if (category === 'font-size' && /^text-(xs|sm|base|lg|[0-9]?xl)$/.test(b)) return false;
      if (category === 'text-align' && /^text-(left|center|right|justify)$/.test(b)) return false;
      if (category === 'text-color' && b.startsWith('text-') && !/^text-(xs|sm|base|lg|[0-9]?xl|left|center|right)$/.test(b)) return false;
      if (category === 'font-weight' && b.startsWith('font-')) return false;
      if (category === 'border-radius' && b.startsWith('rounded')) return false;
      if (category === 'box-shadow' && b.startsWith('shadow')) return false;
      if (category === 'padding' && (b.startsWith('p-') || /^p[xytrbl]-/.test(b))) return false;
      if (category === 'margin' && (b.startsWith('m-') || /^m[xytrbl]-/.test(b))) return false;
      if (category === 'bg-color' && b.startsWith('bg-')) return false;
      if (category === 'flex-dir' && /^flex-(row|col)$/.test(b)) return false;
      if (category === 'justify' && b.startsWith('justify-')) return false;
      return true;
    });

    filtered.push(newClass);
    const updated = filtered.join(' ');
    selectedTarget.className = updated;
    pendingClasses = updated;
    classesRawInput.value = updated;
    updateActiveSegmentedUI(updated);
    updateHighlightBox(selectedTarget, true);
    if (!skipHistory) pushHistory(pendingClasses, pendingText);
  }

  function updateActiveSegmentedUI(classesStr) {
    const tokens = (classesStr || '').split(/\\s+/);
    panel.querySelectorAll('.seg-btn').forEach((btn) => {
      const cls = btn.getAttribute('data-class');
      btn.classList.toggle('active', tokens.includes(cls));
    });
  }

  function syncLayersVisibility() {
    layersToggleBtn.classList.toggle('active', isLayersOpen);
    layersPanel.style.display = (isInspectActive && selectedTarget && isLayersOpen) ? 'flex' : 'none';
  }

  function toggleInspect(force) {
    isInspectActive = typeof force === 'boolean' ? force : !isInspectActive;
    dockBtn.classList.toggle('active', isInspectActive);
    dockExtra.style.display = isInspectActive ? 'flex' : 'none';
    if (!isInspectActive) {
      highlightBox.style.display = 'none';
      highlightBox.classList.remove('selected');
      panel.style.display = 'none';
      layersPanel.style.display = 'none';
      if (selectedTarget) {
        selectedTarget.contentEditable = 'false';
      }
      selectedTarget = null;
      hoveredTarget = null;
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

  layersToggleBtn.addEventListener('click', () => {
    isLayersOpen = !isLayersOpen;
    syncLayersVisibility();
  });

  layersCloseBtn.addEventListener('click', () => {
    isLayersOpen = false;
    syncLayersVisibility();
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

  // Global Keys (Alt+X, Esc, Ctrl+Z, Ctrl+Y)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')) {
      e.preventDefault();
      toggleInspect();
    } else if (e.key === 'Escape') {
      if (selectedTarget) {
        selectedTarget.contentEditable = 'false';
        selectedTarget = null;
        highlightBox.classList.remove('selected');
        panel.style.display = 'none';
        layersPanel.style.display = 'none';
      } else if (isInspectActive) {
        toggleInspect(false);
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        redo();
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    if (selectedTarget) selectedTarget.contentEditable = 'false';
    selectedTarget = null;
    highlightBox.classList.remove('selected');
    panel.style.display = 'none';
    layersPanel.style.display = 'none';
  });

  function findTaggedElement(el) {
    let cur = el;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function updateHighlightBox(target, isSelected = false) {
    if (!target) {
      highlightBox.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.classList.toggle('selected', isSelected);
    highlightBox.style.top = rect.top + window.scrollY + 'px';
    highlightBox.style.left = rect.left + window.scrollX + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const name = target.getAttribute('data-flimsy-name') || target.tagName.toLowerCase();

    tagNameSpan.textContent = '<' + name + '>';
    locSpan.textContent = file.split('/').pop() + ':' + line;
    dimPillSpan.textContent = Math.round(rect.width) + ' x ' + Math.round(rect.height);
  }

  function buildTrail(target) {
    trailContainer.innerHTML = '';
    const chain = [];
    let cur = target;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) chain.unshift(cur);
      cur = cur.parentElement;
    }

    chain.forEach((el, idx) => {
      const item = document.createElement('div');
      item.className = 'trail-item' + (el === target ? ' active' : '');
      item.style.paddingLeft = (8 + idx * 10) + 'px';
      const elName = el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase();
      const elComp = el.getAttribute('data-flimsy-comp');
      if (idx > 0) {
        const indent = document.createElement('span');
        indent.className = 'trail-indent';
        item.appendChild(indent);
      }
      const label = document.createElement('span');
      label.textContent = (elComp ? elComp + ':' : '') + '<' + elName + '>';
      item.appendChild(label);
      item.addEventListener('click', () => selectElement(el));
      trailContainer.appendChild(item);
    });
  }

  async function checkFileMtime(file) {
    try {
      const res = await fetch('/__flimsy/api/inspect?file=' + encodeURIComponent(file));
      const data = await res.json();
      if (data.success) {
        fileMtime = data.mtime;
      }
    } catch {}
  }

  function selectElement(target) {
    if (selectedTarget && selectedTarget !== target) {
      selectedTarget.contentEditable = 'false';
    }

    selectedTarget = target;
    originalClasses = target.className || '';
    originalText = target.innerText.trim();
    pendingText = null;
    pendingClasses = originalClasses;

    history = [{ classes: originalClasses, text: originalText }];
    historyIdx = 0;
    updateUndoRedoUI();

    updateHighlightBox(target, true);

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const name = target.getAttribute('data-flimsy-name') || target.tagName.toLowerCase();

    elemTagDisplay.textContent = '<' + name + '>';
    elemLocDisplay.textContent = file.split('/').pop() + ':' + line;
    elemLocDisplay.title = file + ':' + line;

    const matchingElements = document.querySelectorAll('[data-flimsy-file="' + file + '"]');
    if (matchingElements.length > 1) {
      instanceBadge.textContent = matchingElements.length + 'x';
      instanceBadge.title = matchingElements.length + ' instances on page';
      instanceBadge.style.display = 'inline-block';
    } else {
      instanceBadge.style.display = 'none';
    }

    checkFileMtime(file);

    textInput.value = originalText;
    classesRawInput.value = originalClasses;
    updateActiveSegmentedUI(originalClasses);
    buildTrail(target);
    renderDiff();

    currentAICopyPrompt = '';
    if (aiFeedback) aiFeedback.style.display = 'none';

    syncStatus.style.display = 'none';
    syncBtn.disabled = false;
    panel.style.display = 'flex';
    syncLayersVisibility();
  }

  // Hover detection
  window.addEventListener('mousemove', (e) => {
    if (!isInspectActive || selectedTarget) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      hoveredTarget = target;
      updateHighlightBox(target, false);
    } else {
      hoveredTarget = null;
      highlightBox.style.display = 'none';
    }
  }, true);

  // Click selection
  window.addEventListener('click', (e) => {
    if (!isInspectActive) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      selectElement(target);
    }
  }, true);

  // Double Click for Direct Inline Text Editing
  window.addEventListener('dblclick', (e) => {
    if (!isInspectActive) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      selectElement(target);

      target.contentEditable = 'true';
      target.focus();

      const onBlur = () => {
        target.contentEditable = 'false';
        const newText = target.innerText.trim();
        pendingText = newText;
        textInput.value = newText;
        pushHistory(pendingClasses, pendingText);
        target.removeEventListener('blur', onBlur);
      };
      target.addEventListener('blur', onBlur);

      target.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          target.blur();
        }
      });
    }
  }, true);

  // Keep aligned on scroll / resize
  window.addEventListener('scroll', () => {
    if (selectedTarget) updateHighlightBox(selectedTarget, true);
    else if (hoveredTarget) updateHighlightBox(hoveredTarget, false);
  }, { passive: true });

  // Text input sync
  textInput.addEventListener('input', () => {
    if (!selectedTarget) return;
    pendingText = textInput.value;
    selectedTarget.innerText = textInput.value;
    updateHighlightBox(selectedTarget, true);
    pushHistory(pendingClasses, pendingText);
  });

  // Raw classes input sync
  classesRawInput.addEventListener('input', () => {
    if (!selectedTarget) return;
    pendingClasses = classesRawInput.value;
    selectedTarget.className = pendingClasses;
    updateActiveSegmentedUI(pendingClasses);
    updateHighlightBox(selectedTarget, true);
    pushHistory(pendingClasses, pendingText);
  });

  // Segmented control click handlers
  panel.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = btn.getAttribute('data-class');
      applyOptimisticClass(cls);
    });
  });

  // Color Swatches
  panel.querySelectorAll('.swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const classesToAdd = swatch.getAttribute('data-classes');
      if (classesToAdd) {
        const tokens = classesToAdd.split(' ').filter(Boolean);
        tokens.forEach((c) => applyOptimisticClass(c, true));
        pushHistory(pendingClasses, pendingText);
      }
    });
  });

  // AI Assist Controls (Optional)
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
            pushHistory(pendingClasses, pendingText);
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

  // Discard / Reset Button
  discardBtn.addEventListener('click', () => {
    if (!selectedTarget) return;
    pendingClasses = originalClasses;
    pendingText = originalText;
    selectedTarget.className = originalClasses;
    selectedTarget.innerText = originalText;
    classesRawInput.value = originalClasses;
    textInput.value = originalText;
    updateActiveSegmentedUI(originalClasses);
    updateHighlightBox(selectedTarget, true);
    history = [{ classes: originalClasses, text: originalText }];
    historyIdx = 0;
    updateUndoRedoUI();
    renderDiff();
    syncStatus.style.display = 'block';
    syncStatus.style.color = '#5e5444';
    syncStatus.textContent = 'Changes reset.';
    setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
  });

  // Unified Sync Action with Safety Checks
  syncBtn.addEventListener('click', async () => {
    if (!selectedTarget) return;

    const file = selectedTarget.getAttribute('data-flimsy-file');
    const line = parseInt(selectedTarget.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(selectedTarget.getAttribute('data-flimsy-col'), 10);

    const actions = [];
    if (pendingText !== null && pendingText !== originalText) {
      actions.push({ type: 'update-text', text: pendingText });
    }
    if (pendingClasses !== originalClasses) {
      actions.push({ type: 'update-class', newClasses: pendingClasses, mode: 'reconcile' });
    }

    if (actions.length === 0) {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#5e5444';
      syncStatus.textContent = 'No pending modifications.';
      return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    syncStatus.style.display = 'none';

    try {
      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          line,
          col,
          actions,
          expectedMtime: fileMtime || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#166534';
        syncStatus.textContent = 'Synced to ' + file.split('/').pop();
        syncBtn.textContent = 'Synced';
        originalClasses = pendingClasses;
        originalText = pendingText !== null ? pendingText : originalText;
        fileMtime = data.mtime || fileMtime;
        history = [{ classes: originalClasses, text: originalText }];
        historyIdx = 0;
        updateUndoRedoUI();
        renderDiff();
        setTimeout(() => {
          syncBtn.textContent = 'No Changes';
          syncBtn.disabled = false;
        }, 1400);
      } else if (data.conflict) {
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
            body: JSON.stringify({ file, line, col, actions, force: true }),
          });
          syncBtn.textContent = 'Overwritten';
        };
        syncBtn.addEventListener('click', onForce, { once: true });
      } else {
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#991b1b';
        syncStatus.textContent = 'Error: ' + (data.error || 'Sync failed');
        syncBtn.textContent = 'Retry Sync';
        syncBtn.disabled = false;
      }
    } catch (err) {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#991b1b';
      syncStatus.textContent = 'Network error syncing.';
      syncBtn.textContent = 'Retry Sync';
      syncBtn.disabled = false;
    }
  });
})();
`;
