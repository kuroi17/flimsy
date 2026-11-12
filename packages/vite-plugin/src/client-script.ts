export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Studio active. Alt+X to toggle inspect. Ctrl+Z to undo.');

  // State
  let isInspectActive = false;
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
    // Truncate redo states
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

  // Isolated Container
  const container = document.createElement('div');
  container.id = 'flimsy-root';
  container.style.cssText = 'position:fixed; z-index:2147483647; pointer-events:none; top:0; left:0; width:100%; height:100%;';
  const shadow = container.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(container);

  // Modern Minimalist Dark Theme
  const style = document.createElement('style');
  style.textContent = \`
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }

    /* Dock Button */
    .dock-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #090d16;
      color: #94a3b8;
      border: 1px solid #1e293b;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: auto;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    .dock-btn:hover {
      background: #0f172a;
      color: #f1f5f9;
      transform: translateY(-1px);
    }
    .dock-btn.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
      box-shadow: 0 0 20px rgba(2, 132, 199, 0.4);
    }
    .indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
      transition: all 0.2s;
    }
    .dock-btn.active .indicator {
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
    }
    .kbd-badge {
      font-size: 10px;
      background: rgba(255,255,255,0.1);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      color: #94a3b8;
    }
    .dock-btn.active .kbd-badge {
      color: #ffffff;
      background: rgba(0,0,0,0.25);
    }

    /* Bounding Box & Anchors */
    .box-highlight {
      position: absolute;
      border: 1.5px solid #0284c7;
      background: rgba(2, 132, 199, 0.08);
      pointer-events: none;
      display: none;
      z-index: 10;
      border-radius: 2px;
    }
    .box-highlight.selected {
      border: 2px solid #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }
    .handle {
      position: absolute;
      width: 7px;
      height: 7px;
      background: #ffffff;
      border: 1.5px solid #38bdf8;
      border-radius: 1px;
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
      background: #0f172a;
      color: #f8fafc;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
      border: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .box-tooltip .tag-name { color: #38bdf8; font-family: monospace; }
    .box-tooltip .loc { color: #94a3b8; font-family: monospace; font-size: 10px; }
    .dim-pill {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #0f172a;
      color: #94a3b8;
      font-size: 10px;
      font-family: monospace;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #1e293b;
      white-space: nowrap;
    }

    /* Minimalist Inspector Studio */
    .studio-panel {
      position: fixed;
      bottom: 75px;
      right: 20px;
      width: 330px;
      max-height: 85vh;
      overflow-y: auto;
      background: #0b0f19;
      border: 1px solid #1e293b;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
      padding: 14px;
      color: #f1f5f9;
      pointer-events: auto;
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Studio Header */
    .studio-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid #1e293b;
    }
    .studio-header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .studio-tag-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
    }
    .studio-loc-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .studio-loc-badge {
      font-size: 10px;
      color: #64748b;
      font-family: monospace;
    }
    .instance-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      display: none;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .icon-btn {
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 14px;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s;
    }
    .icon-btn:hover:not(:disabled) {
      background: #1e293b;
      color: #f1f5f9;
    }
    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* Compact Hierarchy Trail */
    .trail {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      font-size: 11px;
      color: #64748b;
      padding-bottom: 2px;
    }
    .trail-item {
      cursor: pointer;
      padding: 1px 5px;
      border-radius: 4px;
      font-family: monospace;
      white-space: nowrap;
      transition: all 0.12s;
    }
    .trail-item:hover {
      background: #1e293b;
      color: #38bdf8;
    }
    .trail-item.active {
      background: #0284c7;
      color: #ffffff;
      font-weight: 600;
    }

    /* Property Groups */
    .prop-section {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .prop-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .segmented {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }
    .seg-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 0;
      border-radius: 4px;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
    }
    .seg-btn:hover { color: #f1f5f9; }
    .seg-btn.active {
      background: #1e293b;
      color: #38bdf8;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    /* Swatches */
    .swatches {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .swatch {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.15);
      cursor: pointer;
      transition: all 0.15s;
    }
    .swatch:hover {
      transform: scale(1.15);
      border-color: #38bdf8;
    }
    .swatch.active {
      border: 2px solid #38bdf8;
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
    }

    .clean-input {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 6px 10px;
      color: #ffffff;
      font-size: 12px;
      outline: none;
      width: 100%;
      transition: border-color 0.15s;
    }
    .clean-input:focus { border-color: #38bdf8; }

    /* Diff Review Drawer */
    .diff-container {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 8px;
      font-family: monospace;
      font-size: 11px;
      display: none;
      flex-direction: column;
      gap: 4px;
      max-height: 120px;
      overflow-y: auto;
    }
    .diff-del {
      color: #f87171;
      background: rgba(239, 68, 68, 0.1);
      padding: 2px 4px;
      border-radius: 3px;
      word-break: break-all;
    }
    .diff-add {
      color: #4ade80;
      background: rgba(34, 197, 94, 0.1);
      padding: 2px 4px;
      border-radius: 3px;
      word-break: break-all;
    }

    /* Actions */
    .ai-chip {
      background: #0f172a;
      border: 1px solid #1e293b;
      color: #94a3b8;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ai-chip:hover {
      background: #1e293b;
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .action-btn {
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .action-btn:hover {
      background: #0369a1;
    }
    .sync-row {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-top: 4px;
    }
    .sync-btn {
      flex: 1;
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 9px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .sync-btn:hover { background: #0369a1; }
    .sync-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .discard-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s;
    }
    .discard-btn:hover {
      background: #334155;
      color: #f1f5f9;
    }
    .sync-status {
      font-size: 11px;
      color: #4ade80;
      text-align: center;
      display: none;
      padding: 4px;
    }
  \`;
  shadow.appendChild(style);

  // Dock button
  const dockBtn = document.createElement('button');
  dockBtn.className = 'dock-btn';
  dockBtn.innerHTML = '<span class="indicator"></span><span>Flimsy</span><span class="kbd-badge">Alt+X</span>';
  shadow.appendChild(dockBtn);

  // Highlight Box with Figma Handles
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

  // Minimal Studio Panel
  const panel = document.createElement('div');
  panel.className = 'studio-panel';
  panel.innerHTML = \`
    <div class="studio-header">
      <div class="studio-header-left">
        <div class="studio-tag-badge">
          <span id="flimsy-elem-tag">&lt;button&gt;</span>
        </div>
        <div class="studio-loc-row">
          <span class="studio-loc-badge" id="flimsy-elem-loc">src/Hero.tsx:16</span>
          <span class="instance-badge" id="flimsy-instance-badge"></span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="flimsy-undo-btn" title="Undo (Ctrl+Z)" disabled>↶</button>
        <button class="icon-btn" id="flimsy-redo-btn" title="Redo (Ctrl+Y)" disabled>↷</button>
        <button class="icon-btn" id="flimsy-close-btn" title="Close (Esc)">&times;</button>
      </div>
    </div>

    <div class="prop-section">
      <div class="trail" id="flimsy-trail"></div>
    </div>

    <!-- Text Edit -->
    <div class="prop-section" id="flimsy-text-group">
      <div class="prop-label">Text Content (Double-click to edit)</div>
      <input type="text" id="flimsy-text-input" class="clean-input" placeholder="Text content...">
    </div>

    <!-- Typography -->
    <div class="prop-section">
      <div class="prop-label">Typography</div>
      <div class="segmented" id="seg-font-size">
        <button class="seg-btn" data-class="text-xs">xs</button>
        <button class="seg-btn" data-class="text-sm">sm</button>
        <button class="seg-btn" data-class="text-base">base</button>
        <button class="seg-btn" data-class="text-lg">lg</button>
        <button class="seg-btn" data-class="text-xl">xl</button>
        <button class="seg-btn" data-class="text-2xl">2xl</button>
      </div>
      <div class="segmented" id="seg-font-weight" style="margin-top:4px;">
        <button class="seg-btn" data-class="font-normal">Regular</button>
        <button class="seg-btn" data-class="font-medium">Medium</button>
        <button class="seg-btn" data-class="font-semibold">Semi</button>
        <button class="seg-btn" data-class="font-bold">Bold</button>
      </div>
    </div>

    <!-- Spacing & Radius -->
    <div class="prop-section">
      <div class="prop-label">Padding & Radius</div>
      <div class="segmented" id="seg-padding">
        <button class="seg-btn" data-class="p-0">p-0</button>
        <button class="seg-btn" data-class="p-2">p-2</button>
        <button class="seg-btn" data-class="p-4">p-4</button>
        <button class="seg-btn" data-class="p-6">p-6</button>
        <button class="seg-btn" data-class="p-8">p-8</button>
      </div>
      <div class="segmented" id="seg-radius" style="margin-top:4px;">
        <button class="seg-btn" data-class="rounded-none">Square</button>
        <button class="seg-btn" data-class="rounded-md">md</button>
        <button class="seg-btn" data-class="rounded-lg">lg</button>
        <button class="seg-btn" data-class="rounded-xl">xl</button>
        <button class="seg-btn" data-class="rounded-full">Pill</button>
      </div>
    </div>

    <!-- Color Palette -->
    <div class="prop-section">
      <div class="prop-label">Color Theme</div>
      <div class="swatches" id="color-swatches">
        <div class="swatch" data-classes="bg-transparent text-slate-100" style="background:transparent; border-style:dashed;" title="Transparent"></div>
        <div class="swatch" data-classes="bg-slate-800 text-white" style="background:#1e293b;" title="Slate"></div>
        <div class="swatch" data-classes="bg-sky-500 text-white" style="background:#0ea5e9;" title="Sky"></div>
        <div class="swatch" data-classes="bg-emerald-500 text-white" style="background:#10b981;" title="Emerald"></div>
        <div class="swatch" data-classes="bg-indigo-600 text-white" style="background:#4f46e5;" title="Indigo"></div>
        <div class="swatch" data-classes="bg-rose-500 text-white" style="background:#f43f5e;" title="Rose"></div>
        <div class="swatch" data-classes="bg-white text-slate-900" style="background:#ffffff;" title="White"></div>
      </div>
    </div>

    <!-- Layout & Flex -->
    <div class="prop-section">
      <div class="prop-label">Layout</div>
      <div class="segmented" id="seg-layout">
        <button class="seg-btn" data-class="flex-row">Row</button>
        <button class="seg-btn" data-class="flex-col">Col</button>
        <button class="seg-btn" data-class="justify-start">Start</button>
        <button class="seg-btn" data-class="justify-center">Center</button>
        <button class="seg-btn" data-class="justify-between">Between</button>
      </div>
    </div>

    <!-- AI Assist (Optional) -->
    <div class="prop-section">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="prop-label">AI Assist (Optional)</span>
        <button id="flimsy-ai-toggle" style="background:none; border:none; color:#38bdf8; font-size:10px; cursor:pointer; font-weight:600;">✨ Open</button>
      </div>
      <div id="flimsy-ai-drawer" style="display:none; flex-direction:column; gap:6px; background:#070a12; border:1px solid #1e293b; padding:8px; border-radius:8px;">
        <input type="text" id="flimsy-ai-input" class="clean-input" placeholder="e.g. Glassmorphism, Neon glow...">
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="ai-chip" data-prompt="Glassmorphism card with blur">Glass</button>
          <button class="ai-chip" data-prompt="Vibrant gradient background">Gradient</button>
          <button class="ai-chip" data-prompt="Neon glow shadow">Glow</button>
          <button class="ai-chip" data-prompt="Modern rounded card with shadow">Card</button>
        </div>
        <div style="display:flex; gap:6px; margin-top:2px;">
          <button id="flimsy-ai-generate" class="action-btn" style="flex:1; padding:6px; font-size:11px;">Apply AI Style</button>
          <button id="flimsy-ai-copy" class="action-btn" style="background:#1e293b; color:#94a3b8; border:1px solid #334155; padding:6px 8px; font-size:11px;" title="Copy prompt for Claude Code or Cursor">📋 Copy</button>
        </div>
        <div id="flimsy-ai-feedback" style="font-size:10px; color:#38bdf8; display:none;"></div>
      </div>
    </div>

    <!-- Raw Classes input -->
    <div class="prop-section">
      <div class="prop-label">Tailwind Classes</div>
      <input type="text" id="flimsy-classes-raw" class="clean-input" placeholder="Tailwind classes...">
    </div>

    <!-- Diff Preview Drawer -->
    <div id="flimsy-diff-box" class="diff-container"></div>

    <div class="sync-row">
      <button id="flimsy-sync-btn" class="sync-btn">Sync to Code</button>
      <button id="flimsy-discard-btn" class="discard-btn" title="Discard pending changes">Reset</button>
    </div>
    <div id="flimsy-sync-status" class="sync-status"></div>
  \`;
  shadow.appendChild(panel);

  const elemTagDisplay = panel.querySelector('#flimsy-elem-tag');
  const elemLocDisplay = panel.querySelector('#flimsy-elem-loc');
  const instanceBadge = panel.querySelector('#flimsy-instance-badge');
  const undoBtn = panel.querySelector('#flimsy-undo-btn');
  const redoBtn = panel.querySelector('#flimsy-redo-btn');
  const trailContainer = panel.querySelector('#flimsy-trail');
  const textInput = panel.querySelector('#flimsy-text-input');
  const classesRawInput = panel.querySelector('#flimsy-classes-raw');
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
      const delLine = document.createElement('div');
      delLine.className = 'diff-del';
      delLine.textContent = '- class: ' + (originalClasses || '(none)');
      const addLine = document.createElement('div');
      addLine.className = 'diff-add';
      addLine.textContent = '+ class: ' + pendingClasses;
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

  function toggleInspect(force) {
    isInspectActive = typeof force === 'boolean' ? force : !isInspectActive;
    dockBtn.classList.toggle('active', isInspectActive);
    if (!isInspectActive) {
      highlightBox.style.display = 'none';
      highlightBox.classList.remove('selected');
      panel.style.display = 'none';
      if (selectedTarget) {
        selectedTarget.contentEditable = 'false';
      }
      selectedTarget = null;
      hoveredTarget = null;
    }
  }

  dockBtn.addEventListener('click', () => toggleInspect());
  undoBtn.addEventListener('click', () => undo());
  redoBtn.addEventListener('click', () => redo());

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
    dimPillSpan.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';
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
      const item = document.createElement('span');
      item.className = 'trail-item' + (el === target ? ' active' : '');
      const elName = el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase();
      const elComp = el.getAttribute('data-flimsy-comp');
      item.textContent = (elComp ? elComp + ':' : '') + '<' + elName + '>';
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

    // Reset history stack for newly selected element
    history = [{ classes: originalClasses, text: originalText }];
    historyIdx = 0;
    updateUndoRedoUI();

    updateHighlightBox(target, true);

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const name = target.getAttribute('data-flimsy-name') || target.tagName.toLowerCase();

    elemTagDisplay.textContent = '<' + name + '>';
    elemLocDisplay.textContent = file + ':' + line;

    // Check multiple instances on page
    const matchingElements = document.querySelectorAll('[data-flimsy-file="' + file + '"]');
    if (matchingElements.length > 1) {
      instanceBadge.textContent = '⚠️ ' + matchingElements.length + ' instances on page';
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

  window.addEventListener('resize', () => {
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
        classesToAdd.split(' ').forEach((c) => applyOptimisticClass(c));
      }
    });
  });

  // AI Assist Controls (Optional)
  aiToggle.addEventListener('click', () => {
    const isHidden = aiDrawer.style.display === 'none' || !aiDrawer.style.display;
    aiDrawer.style.display = isHidden ? 'flex' : 'none';
    aiToggle.textContent = isHidden ? '✕ Close' : '✨ Open';
  });

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
        aiFeedback.textContent = '✨ ' + (data.suggestion?.explanation || 'Applied.');
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
      aiFeedback.textContent = '📋 Context & prompt copied to clipboard!';
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
    syncStatus.style.color = '#94a3b8';
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
      syncStatus.style.color = '#94a3b8';
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
        syncStatus.style.color = '#4ade80';
        syncStatus.textContent = '✓ Synced to ' + file.split('/').pop() + '!';
        syncBtn.textContent = '✓ Synced';
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
        }, 1500);
      } else if (data.conflict) {
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#fbbf24';
        syncStatus.textContent = '⚠️ ' + data.error;
        syncBtn.textContent = 'Force Overwrite';
        syncBtn.disabled = false;
        // Clicking again will force overwrite
        const onForce = async () => {
          syncBtn.removeEventListener('click', onForce);
          await fetch('/__flimsy/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file, line, col, actions, force: true }),
          });
          syncBtn.textContent = '✓ Overwritten';
        };
        syncBtn.addEventListener('click', onForce, { once: true });
      } else {
        syncStatus.style.display = 'block';
        syncStatus.style.color = '#f87171';
        syncStatus.textContent = 'Error: ' + (data.error || 'Sync failed');
        syncBtn.textContent = 'Retry Sync';
        syncBtn.disabled = false;
      }
    } catch (err) {
      syncStatus.style.display = 'block';
      syncStatus.style.color = '#f87171';
      syncStatus.textContent = 'Network error syncing.';
      syncBtn.textContent = 'Retry Sync';
      syncBtn.disabled = false;
    }
  });
})();
`;
