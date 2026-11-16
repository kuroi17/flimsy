export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Studio active. Alt+X to toggle inspect. Shift+S to sync to code.');

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
  let draggedElement = null;

  // Active color property target: 'fill' | 'text' | 'stroke'
  let activeColorTarget = 'fill';
  let currentColorHsv = [42, 56, 85]; // Default honey gold: #d9b25f
  let currentColorAlpha = 100;
  let isPaddingLinked = true;
  let isRadiusLinked = true;

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
    updateSyncBadge();
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
    updateSyncBadge();
  }

  // Isolated Shadow DOM Root
  const container = document.createElement('div');
  container.id = 'flimsy-root';
  container.style.cssText = 'position:fixed; z-index:2147483647; pointer-events:none; top:0; left:0; width:100%; height:100%;';
  const shadow = container.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(container);

  // Styling
  const style = document.createElement('style');
  style.textContent = \`
    * {
      box-sizing: border-box;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
    }

    :host {
      --glass-bg: rgba(253, 248, 235, 0.90);
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
      --figma-blue: #0ea5e9;
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
      padding: 3px 8px;
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
    .sync-status-badge.synced .dot {
      background: #16a34a;
    }

    /* Highlight Bounding Box with 8 Interactive Resize Handles */
    .box-highlight {
      position: absolute;
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.08);
      pointer-events: none;
      display: none;
      z-index: 1000;
      border-radius: 2px;
    }
    .box-highlight.selected {
      border: 1.5px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.10);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
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
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      z-index: 1001;
    }
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
      pointer-events: none;
    }
    .box-tooltip .tag-name { color: #0369a1; font-family: ui-monospace, SFMono-Regular, monospace; }
    .box-tooltip .loc { color: var(--ink-muted); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; }
    
    .dim-pill {
      position: absolute;
      top: calc(100% + 5px);
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
      box-shadow: 0 3px 10px rgba(14, 165, 233, 0.25);
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
      animation: floatIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
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
      width: 236px;
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
      gap: 4px;
    }
    .trail {
      display: flex;
      flex-direction: column;
      gap: 2px;
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
      transition: all 0.12s;
      user-select: none;
    }
    .trail-item:hover {
      background: var(--glass-hover);
      color: var(--ink-primary);
    }
    .trail-item.active {
      background: rgba(14, 165, 233, 0.15);
      color: #0369a1;
      font-weight: 600;
    }
    .trail-item.drag-over {
      border-top: 2px solid var(--figma-blue);
      background: rgba(14, 165, 233, 0.1);
    }
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
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(30, 27, 22, 0.08);
      color: var(--ink-muted);
      font-family: Inter, sans-serif;
    }
    .type-icon.text-icon {
      background: rgba(14, 165, 233, 0.15);
      color: #0284c7;
    }
    .type-icon.frame-icon {
      background: rgba(201, 154, 59, 0.2);
      color: #7c5910;
    }
    .node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .trail-actions {
      display: none;
      align-items: center;
      gap: 2px;
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
      width: 17px;
      height: 17px;
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
      width: 304px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 10px;
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
    .align-cell.active {
      background: var(--gold);
    }
    .align-cell.active::after {
      background: #1e1b16;
      opacity: 1;
    }

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
      position: absolute;
      top: 50px;
      right: 320px;
      width: 240px;
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
      box-shadow: 0 0 4px rgba(0,0,0,0.4);
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
      position: absolute;
      top: 140px;
      right: 320px;
      width: 210px;
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
      max-height: 260px;
      z-index: 2500;
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

  // Bottom-Center Floating Glass Pill Dock
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
  const undoBtn = dock.querySelector('#flimsy-undo-btn');
  const redoBtn = dock.querySelector('#flimsy-redo-btn');
  const dockAiBtn = dock.querySelector('#flimsy-dock-ai-btn');
  const dockSyncBadge = dock.querySelector('#flimsy-dock-sync-status');

  // Highlight Box with 8 Interactive Grab Handles
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = \`
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

  // Left Floating Full Layers Tree Panel
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

    <!-- Text Section -->
    <div class="prop-section" id="flimsy-text-group">
      <div class="prop-row-inline">
        <span class="prop-label">Text</span>
        <input type="text" id="flimsy-text-input" class="clean-input" placeholder="Double-click on page to edit...">
      </div>
    </div>

    <!-- Auto Layout 5.0 Section -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Auto Layout</span>
        <div class="segmented" id="seg-flex-dir" style="width: 140px;">
          <button class="seg-btn" data-class="flex-row">Row</button>
          <button class="seg-btn" data-class="flex-col">Col</button>
          <button class="seg-btn" data-class="flex-wrap">Wrap</button>
        </div>
      </div>
      
      <div style="display:flex; gap:10px; align-items:center; margin-top:3px;">
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

        <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
          <!-- Gap selector -->
          <div class="prop-row-inline">
            <span class="prop-label" style="font-size:9.5px;">Gap</span>
            <div class="segmented" id="seg-gap" style="flex:1;">
              <button class="seg-btn" data-class="gap-0">0</button>
              <button class="seg-btn" data-class="gap-2">2</button>
              <button class="seg-btn" data-class="gap-4">4</button>
              <button class="seg-btn" data-class="gap-6">6</button>
              <button class="seg-btn" data-class="gap-8">8</button>
            </div>
          </div>
          <!-- Sizing constraints -->
          <div class="prop-row-inline">
            <span class="prop-label" style="font-size:9.5px;">Sizing</span>
            <div class="segmented" id="seg-sizing" style="flex:1;">
              <button class="seg-btn" data-class="w-fit">Hug</button>
              <button class="seg-btn" data-class="w-full">Fill</button>
              <button class="seg-btn" data-class="w-auto">Auto</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Spacing & Per-Side Padding -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Padding</span>
        <button class="pill-toggle" id="flimsy-pad-link-btn" style="padding: 2px 6px; font-size:9.5px;">
          Linked
        </button>
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

    <!-- Typography & Font Dropdown Trigger -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Typography</span>
        <button class="font-select-trigger" id="flimsy-font-trigger" style="width:140px;">
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
    </div>

    <!-- Borders & Independent Radii -->
    <div class="prop-section">
      <div class="prop-row-inline">
        <span class="prop-label">Corners & Border</span>
        <button class="pill-toggle" id="flimsy-radius-link-btn" style="padding: 2px 6px; font-size:9.5px;">
          Linked
        </button>
      </div>

      <div class="side-box-grid" id="flimsy-radius-grid" style="display:none;">
        <div class="side-input-wrap"><span class="side-tag">TL</span><input type="text" class="side-input" id="rad-tl" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">TR</span><input type="text" class="side-input" id="rad-tr" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BR</span><input type="text" class="side-input" id="rad-br" placeholder="0"></div>
        <div class="side-input-wrap"><span class="side-tag">BL</span><input type="text" class="side-input" id="rad-bl" placeholder="0"></div>
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

    <!-- Effects: Shadow & Blur -->
    <div class="prop-section">
      <span class="prop-label">Effects</span>
      <div class="segmented" id="seg-shadow">
        <button class="seg-btn" data-class="shadow-none">None</button>
        <button class="seg-btn" data-class="shadow-sm">sm</button>
        <button class="seg-btn" data-class="shadow-md">md</button>
        <button class="seg-btn" data-class="shadow-lg">lg</button>
        <button class="seg-btn" data-class="shadow-xl">xl</button>
      </div>
      <div class="segmented" id="seg-blur">
        <button class="seg-btn" data-class="backdrop-blur-none">No Blur</button>
        <button class="seg-btn" data-class="backdrop-blur-sm">Blur sm</button>
        <button class="seg-btn" data-class="backdrop-blur-md">Blur md</button>
        <button class="seg-btn" data-class="backdrop-blur-lg">Blur lg</button>
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

  // Figma 2D Spectrum Color Popover Modal (Screenshot 4)
  const colorModal = document.createElement('div');
  colorModal.className = 'figma-color-modal';
  colorModal.innerHTML = \`
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-secondary);">Color Picker</span>
      <button class="icon-btn" id="flimsy-color-close" style="width:18px; height:18px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- 2D Canvas Gradient Box -->
    <div class="color-canvas-wrap" id="flimsy-canvas-wrap">
      <canvas class="color-canvas" id="flimsy-color-canvas" width="220" height="130"></canvas>
      <div class="canvas-thumb" id="flimsy-canvas-thumb"></div>
    </div>

    <!-- Rainbow Hue Slider -->
    <input type="range" min="0" max="360" value="42" class="hue-slider" id="flimsy-hue-slider">

    <!-- Alpha Slider -->
    <input type="range" min="10" max="100" value="100" class="alpha-slider" id="flimsy-alpha-slider">

    <!-- Hex & Controls -->
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="icon-btn" id="flimsy-eyedropper-btn" title="Eyedropper tool">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m14 7 3 3"/><path d="m17 4 3 3-10 10H7v-3L17 4z"/></svg>
      </button>
      <input type="text" id="flimsy-modal-hex" class="clean-input" style="font-family:monospace; text-transform:uppercase;" value="#D9B25F">
      <span id="flimsy-modal-alpha-text" style="font-size:10px; font-family:monospace; color:var(--ink-secondary); width:32px;">100%</span>
    </div>

    <!-- On this page document colors -->
    <div style="border-top:1px solid var(--glass-hairline); padding-top:6px;">
      <span style="font-size:9.5px; font-weight:600; color:var(--ink-muted); margin-bottom:4px; display:block;">On this page</span>
      <div class="doc-colors-grid" id="flimsy-doc-colors"></div>
    </div>
  \`;
  shadow.appendChild(colorModal);

  // Searchable Typography Font Dropdown Modal (Screenshot 3)
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

  // Inspector Elements
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

  // Color & Font UI elements
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

  function updateUndoRedoUI() {
    undoBtn.disabled = historyIdx <= 0;
    redoBtn.disabled = historyIdx >= history.length - 1;
  }

  function updateSyncBadge() {
    const hasDiff = (pendingClasses !== originalClasses) || (pendingText !== null && pendingText !== originalText);
    if (hasDiff) {
      dockSyncBadge.className = 'sync-status-badge dirty';
      dockSyncBadge.querySelector('.text').textContent = 'Unsaved (Shift+S)';
      syncBtn.classList.add('dirty');
      syncBtn.textContent = 'Sync to Code (Shift+S)';
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
  }

  // Client-side Tailwind category disambiguation for instant optimistic preview
  function applyOptimisticClass(newClass, skipHistory = false) {
    if (!selectedTarget) return;

    const parts = newClass.split(':');
    const base = parts[parts.length - 1];
    const variantPrefix = parts.length > 1 ? parts.slice(0, -1).join(':') : '';

    let category = '';
    if (/^text-([0-9]?xl|xs|sm|base|lg|(\\[\\d+(px|rem|em)\\]))$/.test(base)) category = 'font-size';
    else if (/^text-(left|center|right|justify)$/.test(base)) category = 'text-align';
    else if (base.startsWith('text-')) category = 'text-color';
    else if (/^font-(sans|serif|mono|(\\[[^\\]]+\\]))$/.test(base)) category = 'font-family';
    else if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(base)) category = 'font-weight';
    else if (base.startsWith('rounded-tl-') || base.startsWith('rounded-tr-') || base.startsWith('rounded-br-') || base.startsWith('rounded-bl-')) {
      category = base.match(/^rounded-(tl|tr|br|bl)/)?.[0];
    } else if (base.startsWith('rounded')) category = 'border-radius';
    else if (base.startsWith('shadow')) category = 'box-shadow';
    else if (base.startsWith('backdrop-blur')) category = 'backdrop-blur';
    else if (base.startsWith('pt-')) category = 'pt';
    else if (base.startsWith('pr-')) category = 'pr';
    else if (base.startsWith('pb-')) category = 'pb';
    else if (base.startsWith('pl-')) category = 'pl';
    else if (base.startsWith('p-')) category = 'padding';
    else if (base.startsWith('m-')) category = 'margin';
    else if (base.startsWith('bg-')) category = 'bg-color';
    else if (/^flex-(row|col|row-reverse|col-reverse)$/.test(base)) category = 'flex-dir';
    else if (/^flex-(wrap|nowrap)$/.test(base)) category = 'flex-wrap';
    else if (base.startsWith('items-')) category = 'items';
    else if (base.startsWith('justify-')) category = 'justify';
    else if (base.startsWith('gap-')) category = 'gap';
    else if (base.startsWith('w-')) category = 'width';
    else if (base.startsWith('h-')) category = 'height';
    else if (/^border-(solid|dashed|dotted|none)$/.test(base)) category = 'border-style';
    else if (/^border(-[0-9]+)?$/.test(base) || base === 'border') category = 'border-width';
    else if (base.startsWith('border-')) category = 'border-color';
    else if (base.startsWith('opacity-')) category = 'opacity';

    const currentTokens = (selectedTarget.className || '').split(/\\s+/).filter(Boolean);
    const filtered = currentTokens.filter((token) => {
      const tParts = token.split(':');
      const tPrefix = tParts.length > 1 ? tParts.slice(0, -1).join(':') : '';
      if (tPrefix !== variantPrefix) return true;
      const b = tParts[tParts.length - 1];

      if (category === 'font-size' && /^text-([0-9]?xl|xs|sm|base|lg|(\\[\\d+(px|rem|em)\\]))$/.test(b)) return false;
      if (category === 'text-align' && /^text-(left|center|right|justify)$/.test(b)) return false;
      if (category === 'text-color' && b.startsWith('text-') && !/^text-([0-9]?xl|xs|sm|base|lg|left|center|right|(\\[\\d+(px|rem|em)\\]))$/.test(b)) return false;
      if (category === 'font-family' && /^font-(sans|serif|mono|(\\[[^\\]]+\\]))$/.test(b)) return false;
      if (category === 'font-weight' && /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(b)) return false;
      if (category === 'border-radius' && b.startsWith('rounded')) return false;
      if (category && category.startsWith('rounded-') && b.startsWith(category)) return false;
      if (category === 'box-shadow' && b.startsWith('shadow')) return false;
      if (category === 'backdrop-blur' && b.startsWith('backdrop-blur')) return false;
      if (category === 'padding' && (b.startsWith('p-') || /^p[xytrbl]-/.test(b))) return false;
      if (category === 'pt' && b.startsWith('pt-')) return false;
      if (category === 'pr' && b.startsWith('pr-')) return false;
      if (category === 'pb' && b.startsWith('pb-')) return false;
      if (category === 'pl' && b.startsWith('pl-')) return false;
      if (category === 'margin' && (b.startsWith('m-') || /^m[xytrbl]-/.test(b))) return false;
      if (category === 'bg-color' && b.startsWith('bg-')) return false;
      if (category === 'flex-dir' && /^flex-(row|col|row-reverse|col-reverse)$/.test(b)) return false;
      if (category === 'flex-wrap' && /^flex-(wrap|nowrap)$/.test(b)) return false;
      if (category === 'items' && b.startsWith('items-')) return false;
      if (category === 'justify' && b.startsWith('justify-')) return false;
      if (category === 'gap' && b.startsWith('gap-')) return false;
      if (category === 'width' && b.startsWith('w-')) return false;
      if (category === 'height' && b.startsWith('h-')) return false;
      if (category === 'border-style' && /^border-(solid|dashed|dotted|none)$/.test(b)) return false;
      if (category === 'border-width' && (/^border(-[0-9]+)?$/.test(b) || b === 'border')) return false;
      if (category === 'border-color' && b.startsWith('border-') && !/^border(-[0-9]+|solid|dashed|dotted|none)?$/.test(b)) return false;
      if (category === 'opacity' && b.startsWith('opacity-')) return false;
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
      if (cls) {
        btn.classList.toggle('active', tokens.includes(cls));
      }
    });

    panel.querySelectorAll('.align-cell').forEach((cell) => {
      const alignPairs = (cell.getAttribute('data-align') || '').split(' ');
      const isMatch = alignPairs.every((cls) => tokens.includes(cls));
      cell.classList.toggle('active', isMatch);
    });

    // Check font
    const fontToken = tokens.find((t) => t.startsWith('font-'));
    if (fontToken) {
      const found = FONTS.find((f) => fontToken.includes(f.name.replace(/\\s+/g, '_')) || fontToken === 'font-' + f.name.toLowerCase());
      if (found) currentFontName.textContent = found.name;
    }
  }

  function syncLayersVisibility() {
    layersToggleBtn.classList.toggle('active', isLayersOpen);
    layersPanel.style.display = (isInspectActive && isLayersOpen) ? 'flex' : 'none';
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
      colorModal.style.display = 'none';
      fontModal.style.display = 'none';
      if (selectedTarget) {
        selectedTarget.contentEditable = 'false';
      }
      selectedTarget = null;
      hoveredTarget = null;
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

  // Global Keys: Shift+S (Manual Sync), Alt+X, Esc, Ctrl+Z, Ctrl+Y, Ctrl+D, Delete
  window.addEventListener('keydown', async (e) => {
    // Shift+S or Ctrl+S for Manual Sync
    if ((e.shiftKey && (e.key === 's' || e.key === 'S')) || ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S'))) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        await syncToCode();
        return;
      }
    }

    if (e.altKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')) {
      e.preventDefault();
      toggleInspect();
    } else if (e.key === 'Escape') {
      if (colorModal.style.display === 'flex') {
        colorModal.style.display = 'none';
      } else if (fontModal.style.display === 'flex') {
        fontModal.style.display = 'none';
      } else if (selectedTarget) {
        selectedTarget.contentEditable = 'false';
        selectedTarget = null;
        highlightBox.classList.remove('selected');
        panel.style.display = 'none';
        renderFullLayersTree();
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
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      if (isInspectActive && selectedTarget) {
        e.preventDefault();
        await duplicateSelectedElement();
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (isInspectActive && selectedTarget && !isInput) {
        e.preventDefault();
        await deleteSelectedElement();
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    if (selectedTarget) selectedTarget.contentEditable = 'false';
    selectedTarget = null;
    highlightBox.classList.remove('selected');
    panel.style.display = 'none';
    colorModal.style.display = 'none';
    fontModal.style.display = 'none';
    renderFullLayersTree();
  });

  function findTaggedElement(el) {
    let cur = el;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // Update Highlight Box directly relative to fixed viewport
  function updateHighlightBox(target, isSelected = false) {
    if (!target) {
      highlightBox.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.classList.toggle('selected', isSelected);
    // Fixed viewport positioning (NO window.scrollY added!)
    highlightBox.style.top = rect.top + 'px';
    highlightBox.style.left = rect.left + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const name = target.getAttribute('data-flimsy-name') || target.tagName.toLowerCase();

    tagNameSpan.textContent = '<' + name + '>';
    locSpan.textContent = file.split('/').pop() + ':' + line;
    
    if (isTextElement(target)) {
      const fs = Math.round(parseFloat(window.getComputedStyle(target).fontSize) || 16);
      dimPillSpan.textContent = fs + 'px (' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ')';
    } else {
      dimPillSpan.textContent = Math.round(rect.width) + ' x ' + Math.round(rect.height);
    }
  }

  // Interactive 8-Point Bounding Box Handles with Canva / Figma Text Scaling
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
      startW = rect.width;
      startH = rect.height;
      initialDiag = Math.hypot(startW, startH) || 1;
      initialFontSize = parseFloat(window.getComputedStyle(selectedTarget).fontSize) || 16;

      const isText = isTextElement(selectedTarget);
      const isCorner = ['tl', 'tr', 'bl', 'br'].includes(resizeHandle);

      const onPointerMove = (me) => {
        if (!isResizing || !selectedTarget) return;
        const deltaX = me.clientX - startX;
        const deltaY = me.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (resizeHandle.includes('r')) newW = Math.max(20, startW + deltaX);
        if (resizeHandle.includes('l')) newW = Math.max(20, startW - deltaX);
        if (resizeHandle.includes('b')) newH = Math.max(20, startH + deltaY);
        if (resizeHandle.includes('t')) newH = Math.max(20, startH - deltaY);

        if (isText && isCorner) {
          // Canva / Figma Text Scale Mode: corner scaling scales font-size in real time!
          const currentDiag = Math.hypot(newW, newH);
          const scale = currentDiag / initialDiag;
          const currentPx = Math.max(10, Math.min(144, Math.round(initialFontSize * scale)));
          selectedTarget.style.fontSize = currentPx + 'px';
          dimPillSpan.textContent = currentPx + 'px';
        } else {
          // Container stretch mode
          selectedTarget.style.width = Math.round(newW) + 'px';
          if (!isText) selectedTarget.style.height = Math.round(newH) + 'px';
          dimPillSpan.textContent = Math.round(newW) + ' x ' + Math.round(newH);
        }

        updateHighlightBox(selectedTarget, true);
      };

      const onPointerUp = () => {
        if (!isResizing || !selectedTarget) return;
        isResizing = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        if (isText && isCorner) {
          // Commit scaled font-size to Tailwind class
          const computedFs = parseFloat(selectedTarget.style.fontSize) || initialFontSize;
          selectedTarget.style.fontSize = '';

          // Snap to standard Tailwind typography or arbitrary px
          const snapFont = (px) => {
            const steps = [
              [12, 'text-xs'], [14, 'text-sm'], [16, 'text-base'], [18, 'text-lg'],
              [20, 'text-xl'], [24, 'text-2xl'], [30, 'text-3xl'], [36, 'text-4xl'],
              [48, 'text-5xl'], [60, 'text-6xl'], [72, 'text-7xl'], [96, 'text-8xl']
            ];
            for (const [p, cls] of steps) {
              if (Math.abs(px - p) <= 2) return cls;
            }
            return 'text-[' + Math.round(px) + 'px]';
          };

          applyOptimisticClass(snapFont(computedFs));
        } else {
          // Commit width / height to Tailwind class
          const finalRect = selectedTarget.getBoundingClientRect();
          selectedTarget.style.width = '';
          selectedTarget.style.height = '';

          const snapWidth = (w) => {
            const steps = [
              [64, 'w-16'], [80, 'w-20'], [96, 'w-24'], [128, 'w-32'], [160, 'w-40'],
              [192, 'w-48'], [224, 'w-56'], [256, 'w-64'], [288, 'w-72'], [320, 'w-80'], [384, 'w-96']
            ];
            for (const [px, cls] of steps) {
              if (Math.abs(w - px) <= 6) return cls;
            }
            return 'w-[' + Math.round(w) + 'px]';
          };

          const snapHeight = (h) => {
            const steps = [
              [32, 'h-8'], [40, 'h-10'], [48, 'h-12'], [64, 'h-16'], [80, 'h-20'],
              [96, 'h-24'], [128, 'h-32'], [160, 'h-40'], [192, 'h-48'], [256, 'h-64']
            ];
            for (const [px, cls] of steps) {
              if (Math.abs(h - px) <= 5) return cls;
            }
            return 'h-[' + Math.round(h) + 'px]';
          };

          if (resizeHandle.includes('r') || resizeHandle.includes('l')) {
            applyOptimisticClass(snapWidth(finalRect.width), true);
          }
          if (!isText && (resizeHandle.includes('t') || resizeHandle.includes('b'))) {
            applyOptimisticClass(snapHeight(finalRect.height), true);
          }
          pushHistory(pendingClasses, pendingText);
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  });

  // Full Recursive Layers Hierarchy Tree (Screenshots 1 & 2)
  function renderFullLayersTree() {
    trailContainer.innerHTML = '';
    const allTagged = Array.from(document.querySelectorAll('[data-flimsy-file]'));
    if (allTagged.length === 0) {
      trailContainer.innerHTML = '<div style="font-size:10.5px; color:var(--ink-muted); padding:6px;">No components tagged.</div>';
      return;
    }

    // Find roots
    const roots = allTagged.filter((el) => {
      let parent = el.parentElement;
      while (parent && parent !== document.documentElement && parent !== document.body) {
        if (parent.hasAttribute('data-flimsy-file')) return false;
        parent = parent.parentElement;
      }
      return true;
    });

    function renderNode(el, depth = 0) {
      const row = document.createElement('div');
      row.className = 'trail-item' + (el === selectedTarget ? ' active' : '');
      row.style.paddingLeft = (4 + depth * 10) + 'px';
      row.draggable = true;

      const isText = isTextElement(el);
      const comp = el.getAttribute('data-flimsy-comp');
      const name = el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase();

      // Find direct tagged children
      const childTagged = allTagged.filter((c) => {
        let p = c.parentElement;
        while (p && p !== el) {
          if (p.hasAttribute('data-flimsy-file')) return false;
          p = p.parentElement;
        }
        return p === el;
      });

      const hasChildren = childTagged.length > 0;

      row.innerHTML = \`
        <div class="trail-title">
          <span class="type-icon \${isText ? 'text-icon' : 'frame-icon'}">\${isText ? 'T' : '#'}</span>
          <span class="node-name">\${comp ? comp + ':' : ''}&lt;\${name}&gt;</span>
        </div>
        <div class="trail-actions">
          <button class="trail-btn btn-up" title="Move Up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg></button>
          <button class="trail-btn btn-down" title="Move Down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
          <button class="trail-btn btn-dup" title="Duplicate (Ctrl+D)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="trail-btn btn-del" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg></button>
        </div>
      \`;

      row.querySelector('.trail-title').addEventListener('click', () => selectElement(el));
      row.querySelector('.btn-up').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'up'); });
      row.querySelector('.btn-down').addEventListener('click', (e) => { e.stopPropagation(); reorderElement(el, 'down'); });
      row.querySelector('.btn-dup').addEventListener('click', (e) => { e.stopPropagation(); duplicateSelectedElement(el); });
      row.querySelector('.btn-del').addEventListener('click', (e) => { e.stopPropagation(); deleteSelectedElement(el); });

      // Drag and drop reordering
      row.addEventListener('dragstart', (e) => {
        draggedElement = el;
        row.style.opacity = '0.5';
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
        draggedElement = null;
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (draggedElement && draggedElement !== el) {
          const isAbove = el.compareDocumentPosition(draggedElement) & Node.DOCUMENT_POSITION_FOLLOWING;
          reorderElement(draggedElement, isAbove ? 'up' : 'down');
        }
      });

      trailContainer.appendChild(row);
      childTagged.forEach((child) => renderNode(child, depth + 1));
    }

    roots.forEach((root) => renderNode(root, 0));
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
        panel.style.display = 'none';
        highlightBox.style.display = 'none';
        selectedTarget = null;
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
    updateSyncBadge();

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
    renderFullLayersTree();
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

  // Align highlight box on scroll
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
      if (cls) {
        applyOptimisticClass(cls);
      }
    });
  });

  // 9-Point Alignment Grid click handlers
  panel.querySelectorAll('.align-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      const alignPairs = (cell.getAttribute('data-align') || '').split(' ');
      alignPairs.forEach((cls) => applyOptimisticClass(cls, true));
      pushHistory(pendingClasses, pendingText);
    });
  });

  // --- Figma 2D Spectrum Color Picker Modal (Screenshot 4) ---
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

    // Base color
    ctx.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
    ctx.fillRect(0, 0, w, h);

    // Horizontal white gradient
    const gradWhite = ctx.createLinearGradient(0, 0, w, 0);
    gradWhite.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradWhite.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(0, 0, w, h);

    // Vertical black gradient
    const gradBlack = ctx.createLinearGradient(0, 0, 0, h);
    gradBlack.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradBlack.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(0, 0, w, h);
  }

  function updateColorFromHsv() {
    const [h, s, v] = currentColorHsv;
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);

    // Update triggers & thumb
    colorThumb.style.background = hex;
    colorHexLabel.textContent = hex.toUpperCase();
    colorOpacityLabel.textContent = currentColorAlpha + '%';
    modalHexInput.value = hex.toUpperCase();
    modalAlphaText.textContent = currentColorAlpha + '%';

    // Canvas thumb position
    const wrapRect = colorCanvasWrap.getBoundingClientRect();
    if (wrapRect.width) {
      canvasThumb.style.left = (s / 100 * wrapRect.width) + 'px';
      canvasThumb.style.top = ((100 - v) / 100 * wrapRect.height) + 'px';
    }

    applyActiveColor(hex, currentColorAlpha);
  }

  function applyActiveColor(hex, opacityVal = 100) {
    if (!selectedTarget) return;
    let targetPrefix = 'bg-';
    if (activeColorTarget === 'text') targetPrefix = 'text-';
    if (activeColorTarget === 'stroke') targetPrefix = 'border-';

    let classToAdd = '';
    if (hex === 'transparent') {
      classToAdd = targetPrefix + 'transparent';
    } else {
      const alphaSuffix = opacityVal < 100 ? '/' + opacityVal : '';
      classToAdd = targetPrefix + '[' + hex + ']' + alphaSuffix;
    }

    if (activeColorTarget === 'stroke') {
      applyOptimisticClass('border', true);
    }

    applyOptimisticClass(classToAdd);
  }

  // Populate Document Colors from active page
  function populateDocumentColors() {
    docColorsGrid.innerHTML = '';
    const colors = new Set(['#ffffff', '#000000', '#fdf6df', '#d9b25f', '#1e1b16', '#0ea5e9', '#10b981', '#f43f5e']);
    
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length && colors.size < 16; i++) {
      const el = all[i];
      if (el.id === 'flimsy-root' || el.closest('#flimsy-root')) continue;
      const s = window.getComputedStyle(el);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
        colors.add(s.backgroundColor);
      }
    }

    colors.forEach((c) => {
      const chip = document.createElement('div');
      chip.className = 'doc-chip';
      chip.style.background = c;
      chip.title = c;
      chip.addEventListener('click', () => {
        applyActiveColor(c, currentColorAlpha);
      });
      docColorsGrid.appendChild(chip);
    });
  }

  // Canvas interaction
  let isCanvasDragging = false;
  function handleCanvasPointer(e) {
    const rect = colorCanvasWrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const s = Math.round((x / rect.width) * 100);
    const v = Math.round((1 - y / rect.height) * 100);

    currentColorHsv[1] = s;
    currentColorHsv[2] = v;

    canvasThumb.style.left = x + 'px';
    canvasThumb.style.top = y + 'px';

    updateColorFromHsv();
  }

  colorCanvasWrap.addEventListener('pointerdown', (e) => {
    isCanvasDragging = true;
    handleCanvasPointer(e);
    const onMove = (me) => { if (isCanvasDragging) handleCanvasPointer(me); };
    const onUp = () => {
      isCanvasDragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  hueSlider.addEventListener('input', () => {
    currentColorHsv[0] = parseInt(hueSlider.value, 10);
    drawColorCanvas(currentColorHsv[0]);
    updateColorFromHsv();
  });

  alphaSlider.addEventListener('input', () => {
    currentColorAlpha = parseInt(alphaSlider.value, 10);
    modalAlphaText.textContent = currentColorAlpha + '%';
    updateColorFromHsv();
  });

  modalHexInput.addEventListener('change', () => {
    let val = modalHexInput.value.trim();
    if (val && !val.startsWith('#') && val !== 'transparent') val = '#' + val;
    applyActiveColor(val, currentColorAlpha);
  });

  eyedropperBtn.addEventListener('click', async () => {
    if (window.EyeDropper) {
      try {
        const eye = new window.EyeDropper();
        const res = await eye.open();
        if (res && res.sRGBHex) {
          modalHexInput.value = res.sRGBHex.toUpperCase();
          applyActiveColor(res.sRGBHex, currentColorAlpha);
        }
      } catch {}
    } else {
      alert('Eyedropper tool is not supported in this browser.');
    }
  });

  colorTrigger.addEventListener('click', () => {
    const isHidden = colorModal.style.display === 'none' || !colorModal.style.display;
    colorModal.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      fontModal.style.display = 'none';
      drawColorCanvas(currentColorHsv[0]);
      populateDocumentColors();
      updateColorFromHsv();
    }
  });

  colorCloseBtn.addEventListener('click', () => {
    colorModal.style.display = 'none';
  });

  targetFillBtn.addEventListener('click', () => {
    activeColorTarget = 'fill';
    targetFillBtn.classList.add('active');
    targetTextBtn.classList.remove('active');
    targetStrokeBtn.classList.remove('active');
  });
  targetTextBtn.addEventListener('click', () => {
    activeColorTarget = 'text';
    targetTextBtn.classList.add('active');
    targetFillBtn.classList.remove('active');
    targetStrokeBtn.classList.remove('active');
  });
  targetStrokeBtn.addEventListener('click', () => {
    activeColorTarget = 'stroke';
    targetStrokeBtn.classList.add('active');
    targetFillBtn.classList.remove('active');
    targetTextBtn.classList.remove('active');
  });

  // --- Searchable Typography Font Modal (Screenshot 3) ---
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

        // Dynamically load Google Font if external
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

  fontSearch.addEventListener('input', () => {
    renderFontList(fontSearch.value);
  });

  fontCloseBtn.addEventListener('click', () => {
    fontModal.style.display = 'none';
  });

  // Spacing & Corner Link Toggles
  padLinkBtn.addEventListener('click', () => {
    isPaddingLinked = !isPaddingLinked;
    padLinkBtn.classList.toggle('active', !isPaddingLinked);
    padLinkBtn.textContent = isPaddingLinked ? 'Linked' : '4-Sides';
    padGrid.style.display = isPaddingLinked ? 'none' : 'grid';
  });

  radLinkBtn.addEventListener('click', () => {
    isRadiusLinked = !isRadiusLinked;
    radLinkBtn.classList.toggle('active', !isRadiusLinked);
    radLinkBtn.textContent = isRadiusLinked ? 'Linked' : '4-Corners';
    radGrid.style.display = isRadiusLinked ? 'none' : 'grid';
  });

  // Per-Side Padding Inputs
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

  // Independent Corner Radii Inputs
  ['rad-tl', 'rad-tr', 'rad-br', 'rad-bl'].forEach((id, idx) => {
    const input = panel.querySelector('#' + id);
    const prefixes = ['rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-'];
    if (input) {
      input.addEventListener('change', () => {
        const val = input.value.trim();
        if (val) {
          const cls = prefixes[idx] + val;
          applyOptimisticClass(cls);
        }
      });
    }
  });

  // AI Assist Controls
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
    updateSyncBadge();
    syncStatus.style.display = 'block';
    syncStatus.style.color = '#5e5444';
    syncStatus.textContent = 'Changes reset.';
    setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
  });

  // Manual Sync Action (Shift+S or Button Click)
  async function syncToCode() {
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
      syncStatus.textContent = 'No modifications to sync.';
      setTimeout(() => { syncStatus.style.display = 'none'; }, 1200);
      return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    dockSyncBadge.querySelector('.text').textContent = 'Syncing...';
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
        syncStatus.textContent = 'Synced to ' + file.split('/').pop() + ':' + line;
        originalClasses = pendingClasses;
        originalText = pendingText !== null ? pendingText : originalText;
        fileMtime = data.mtime || fileMtime;
        history = [{ classes: originalClasses, text: originalText }];
        historyIdx = 0;
        updateUndoRedoUI();
        renderDiff();
        dockSyncBadge.className = 'sync-status-badge synced';
        dockSyncBadge.querySelector('.text').textContent = 'Synced';
        syncBtn.textContent = 'In Sync';
        syncBtn.disabled = false;
        setTimeout(() => {
          updateSyncBadge();
          syncStatus.style.display = 'none';
        }, 1800);
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
