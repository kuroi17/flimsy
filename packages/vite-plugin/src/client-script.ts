export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Visual overlay & DOM inspector initialized. Press Alt+X to toggle inspect mode.');

  // State
  let isInspectActive = false;
  let hoveredTarget = null;
  let selectedTarget = null;

  // Create isolated container
  const container = document.createElement('div');
  container.id = 'flimsy-root';
  container.style.cssText = 'position:fixed; z-index:2147483647; pointer-events:none; top:0; left:0; width:100%; height:100%;';
  const shadow = container.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(container);

  // Styles inside shadow DOM
  const style = document.createElement('style');
  style.textContent = \`
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
    
    /* Toggle Dock */
    .badge-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #090d16;
      color: #94a3b8;
      border: 1px solid #1e293b;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
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
    .badge-btn:hover {
      background: #0f172a;
      color: #f1f5f9;
      transform: translateY(-1px);
    }
    .badge-btn.active {
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
    .badge-btn.active .indicator {
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
    }
    .badge-kbd {
      font-size: 10px;
      background: rgba(255,255,255,0.1);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      color: #94a3b8;
    }
    .badge-btn.active .badge-kbd {
      color: #ffffff;
      background: rgba(0,0,0,0.25);
    }

    /* Figma-style Selection & Hover Box */
    .box-highlight {
      position: absolute;
      border: 1.5px solid #0284c7;
      background: rgba(2, 132, 199, 0.08);
      pointer-events: none;
      display: none;
      z-index: 10;
      transition: border-color 0.1s;
    }
    .box-highlight.selected {
      border: 2px solid #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }
    /* Corner Anchor Handles (Figma style) */
    .handle {
      position: absolute;
      width: 7px;
      height: 7px;
      background: #ffffff;
      border: 1.5px solid #0284c7;
      border-radius: 1px;
      display: none;
    }
    .box-highlight.selected .handle {
      display: block;
      border-color: #38bdf8;
    }
    .handle-tl { top: -4px; left: -4px; }
    .handle-tr { top: -4px; right: -4px; }
    .handle-bl { bottom: -4px; left: -4px; }
    .handle-br { bottom: -4px; right: -4px; }

    /* Floating Tooltip & Dimension Pill */
    .box-tooltip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      background: #0f172a;
      color: #f8fafc;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
      border: 1px solid #334155;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .box-tooltip .tag-name {
      color: #f1f5f9;
      font-family: monospace;
    }
    .box-tooltip .comp-badge {
      background: #1e293b;
      color: #a5b4fc;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
    }
    .box-tooltip .loc {
      color: #38bdf8;
      font-family: monospace;
      font-size: 10px;
    }
    .dim-pill {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #0f172a;
      color: #94a3b8;
      font-size: 10px;
      font-family: monospace;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #1e293b;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }

    /* Inspector Card */
    .inspector-card {
      position: fixed;
      bottom: 75px;
      right: 20px;
      width: 360px;
      max-height: 80vh;
      overflow-y: auto;
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 14px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
      padding: 18px;
      color: #f1f5f9;
      pointer-events: auto;
      display: none;
      flex-direction: column;
      gap: 14px;
      animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 10px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .close-btn {
      background: #1e293b;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.15s;
    }
    .close-btn:hover {
      background: #334155;
      color: #ffffff;
    }

    /* Breadcrumbs Trail */
    .breadcrumbs-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .breadcrumbs-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      background: #0f172a;
      border: 1px solid #1e293b;
      padding: 6px 10px;
      border-radius: 8px;
    }
    .breadcrumb-item {
      font-size: 11px;
      font-family: monospace;
      color: #94a3b8;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.12s;
    }
    .breadcrumb-item:hover {
      background: #1e293b;
      color: #38bdf8;
    }
    .breadcrumb-item.active {
      background: #0284c7;
      color: #ffffff;
      font-weight: 600;
    }
    .breadcrumb-sep {
      color: #475569;
      font-size: 10px;
    }

    /* Component Boundary Info */
    .boundary-info {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .boundary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }
    .boundary-label {
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
    }
    .boundary-val {
      font-family: monospace;
      color: #38bdf8;
      font-weight: 600;
    }
    .boundary-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge-definition {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    /* Property Fields */
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field-label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .field-input {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 12px;
      color: #ffffff;
      font-size: 12px;
      outline: none;
      width: 100%;
      transition: border-color 0.15s;
    }
    .field-input:focus {
      border-color: #38bdf8;
    }
    .btn-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .action-btn {
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      width: 100%;
    }
    .action-btn:hover {
      background: #0369a1;
    }
    .quick-btn {
      background: #0f172a;
      color: #94a3b8;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .quick-btn:hover {
      background: #1e293b;
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .status-msg {
      font-size: 11px;
      color: #4ade80;
      margin-top: 2px;
      display: none;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
  \`;
  shadow.appendChild(style);

  // Toggle button dock
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'badge-btn';
  toggleBtn.innerHTML = '<span class="indicator"></span><span>Flimsy Inspect</span><span class="badge-kbd">Alt+X</span>';
  shadow.appendChild(toggleBtn);

  // Highlight Box with Handles and Dimension Pill
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = \`
    <div class="handle handle-tl"></div>
    <div class="handle handle-tr"></div>
    <div class="handle handle-bl"></div>
    <div class="handle handle-br"></div>
    <div class="box-tooltip">
      <span class="tag-name"></span>
      <span class="comp-badge"></span>
      <span class="loc"></span>
    </div>
    <div class="dim-pill"></div>
  \`;
  shadow.appendChild(highlightBox);

  const tagNameSpan = highlightBox.querySelector('.tag-name');
  const compBadgeSpan = highlightBox.querySelector('.comp-badge');
  const locSpan = highlightBox.querySelector('.loc');
  const dimPillSpan = highlightBox.querySelector('.dim-pill');

  // Inspector Card
  const inspectorCard = document.createElement('div');
  inspectorCard.className = 'inspector-card';
  inspectorCard.innerHTML = \`
    <div class="card-header">
      <div class="card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        <span>Flimsy Inspector</span>
      </div>
      <button class="close-btn" title="Close (Esc)">&times;</button>
    </div>

    <div class="breadcrumbs-container">
      <div class="field-label">Hierarchy Breadcrumb</div>
      <div id="flimsy-breadcrumbs" class="breadcrumbs-list"></div>
    </div>

    <div class="boundary-info">
      <div class="boundary-row">
        <span class="boundary-label">Component</span>
        <span id="flimsy-comp-name" class="boundary-val"></span>
      </div>
      <div class="boundary-row">
        <span class="boundary-label">Location</span>
        <span id="flimsy-src-display" class="boundary-val"></span>
      </div>
      <div class="boundary-row">
        <span class="boundary-label">Scope</span>
        <span class="boundary-badge badge-definition">Component Definition</span>
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">Text Content</div>
      <input type="text" id="flimsy-text-input" class="field-input" placeholder="Edit text content...">
      <button id="flimsy-save-text" class="action-btn" style="margin-top:2px;">Sync Text to Code</button>
    </div>

    <div class="field-group">
      <div class="field-label">Tailwind Classes</div>
      <input type="text" id="flimsy-class-input" class="field-input" placeholder="e.g. bg-blue-500 p-4">
      <div class="btn-row" style="margin-top:2px;">
        <button class="quick-btn" data-classes="bg-emerald-600 text-white">Emerald</button>
        <button class="quick-btn" data-classes="bg-indigo-600 text-white">Indigo</button>
        <button class="quick-btn" data-classes="p-6">Big Pad</button>
        <button class="quick-btn" data-classes="rounded-2xl shadow-xl">Rounded</button>
      </div>
      <button id="flimsy-save-class" class="action-btn" style="margin-top:4px;">Sync Classes to Code</button>
    </div>

    <div id="flimsy-status" class="status-msg"></div>
  \`;
  shadow.appendChild(inspectorCard);

  const breadcrumbsList = inspectorCard.querySelector('#flimsy-breadcrumbs');
  const compNameDisplay = inspectorCard.querySelector('#flimsy-comp-name');
  const srcDisplay = inspectorCard.querySelector('#flimsy-src-display');
  const textInput = inspectorCard.querySelector('#flimsy-text-input');
  const classInput = inspectorCard.querySelector('#flimsy-class-input');
  const saveTextBtn = inspectorCard.querySelector('#flimsy-save-text');
  const saveClassBtn = inspectorCard.querySelector('#flimsy-save-class');
  const statusMsg = inspectorCard.querySelector('#flimsy-status');
  const closeBtn = inspectorCard.querySelector('.close-btn');

  // Toggle Inspect Mode Function
  function toggleInspect(forceState) {
    isInspectActive = typeof forceState === 'boolean' ? forceState : !isInspectActive;
    toggleBtn.classList.toggle('active', isInspectActive);
    if (!isInspectActive) {
      highlightBox.style.display = 'none';
      highlightBox.classList.remove('selected');
      inspectorCard.style.display = 'none';
      hoveredTarget = null;
      selectedTarget = null;
    }
  }

  // Toggle button click
  toggleBtn.addEventListener('click', () => toggleInspect());

  // Global Keyboard Shortcuts (Alt+X and Esc)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX')) {
      e.preventDefault();
      toggleInspect();
    } else if (e.key === 'Escape' && isInspectActive) {
      if (selectedTarget) {
        selectedTarget = null;
        highlightBox.classList.remove('selected');
        inspectorCard.style.display = 'none';
      } else {
        toggleInspect(false);
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    selectedTarget = null;
    highlightBox.classList.remove('selected');
    inspectorCard.style.display = 'none';
  });

  // Find nearest element with data-flimsy-file
  function findTaggedElement(el) {
    let cur = el;
    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Update position of highlight box and dimension badge
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
    const comp = target.getAttribute('data-flimsy-comp') || '';

    tagNameSpan.textContent = '<' + name + '>';
    compBadgeSpan.textContent = comp ? comp : '';
    compBadgeSpan.style.display = comp ? 'inline-block' : 'none';
    locSpan.textContent = file + ':' + line;
    dimPillSpan.textContent = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';
  }

  // Build hierarchy breadcrumb trail
  function buildBreadcrumbs(target) {
    breadcrumbsList.innerHTML = '';
    const chain = [];
    let cur = target;

    while (cur && cur !== document.documentElement && cur !== document.body) {
      if (cur.hasAttribute && cur.hasAttribute('data-flimsy-file')) {
        chain.unshift(cur);
      }
      cur = cur.parentElement;
    }

    chain.forEach((el, idx) => {
      if (idx > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '›';
        breadcrumbsList.appendChild(sep);
      }

      const item = document.createElement('span');
      item.className = 'breadcrumb-item' + (el === target ? ' active' : '');
      const elName = el.getAttribute('data-flimsy-name') || el.tagName.toLowerCase();
      const elComp = el.getAttribute('data-flimsy-comp');
      item.textContent = elComp ? elComp + ':<' + elName + '>' : '<' + elName + '>';
      item.title = el.getAttribute('data-flimsy-file') + ':' + el.getAttribute('data-flimsy-line');

      item.addEventListener('click', () => {
        selectElement(el);
      });

      breadcrumbsList.appendChild(item);
    });
  }

  // Select an element and populate inspector
  function selectElement(target) {
    selectedTarget = target;
    updateHighlightBox(target, true);

    const file = target.getAttribute('data-flimsy-file') || '';
    const line = target.getAttribute('data-flimsy-line') || '';
    const comp = target.getAttribute('data-flimsy-comp') || 'Component';

    compNameDisplay.textContent = '<' + comp + ' />';
    srcDisplay.textContent = file + ':' + line;
    textInput.value = target.innerText.trim();
    classInput.value = target.className || '';

    buildBreadcrumbs(target);

    inspectorCard.style.display = 'flex';
    statusMsg.style.display = 'none';
  }

  // Mousemove handler for hover highlight
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

  // Click handler for element selection
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

  // Listen to scroll and resize to keep highlight aligned
  window.addEventListener('scroll', () => {
    if (selectedTarget) {
      updateHighlightBox(selectedTarget, true);
    } else if (hoveredTarget) {
      updateHighlightBox(hoveredTarget, false);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (selectedTarget) {
      updateHighlightBox(selectedTarget, true);
    } else if (hoveredTarget) {
      updateHighlightBox(hoveredTarget, false);
    }
  }, { passive: true });

  // Quick class buttons
  inspectorCard.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cls = btn.getAttribute('data-classes');
      classInput.value = (classInput.value + ' ' + cls).trim();
    });
  });

  async function sendUpdate(action) {
    if (!selectedTarget) return;

    const file = selectedTarget.getAttribute('data-flimsy-file');
    const line = parseInt(selectedTarget.getAttribute('data-flimsy-line'), 10);
    const col = parseInt(selectedTarget.getAttribute('data-flimsy-col'), 10);

    statusMsg.style.display = 'block';
    statusMsg.style.color = '#38bdf8';
    statusMsg.style.borderColor = 'rgba(56, 189, 248, 0.3)';
    statusMsg.style.background = 'rgba(56, 189, 248, 0.1)';
    statusMsg.textContent = 'Writing to source code...';

    try {
      const res = await fetch('/__flimsy/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, col, action }),
      });
      const data = await res.json();
      if (data.success) {
        statusMsg.style.color = '#4ade80';
        statusMsg.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        statusMsg.style.background = 'rgba(34, 197, 94, 0.1)';
        statusMsg.textContent = '✓ Synced to ' + file + ' (HMR triggering)';
      } else {
        statusMsg.style.color = '#f87171';
        statusMsg.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        statusMsg.style.background = 'rgba(239, 68, 68, 0.1)';
        statusMsg.textContent = 'Error: ' + (data.error || 'Update failed');
      }
    } catch (err) {
      statusMsg.style.color = '#f87171';
      statusMsg.textContent = 'Network error syncing change.';
    }
  }

  saveTextBtn.addEventListener('click', () => {
    sendUpdate({
      type: 'update-text',
      text: textInput.value,
    });
  });

  saveClassBtn.addEventListener('click', () => {
    sendUpdate({
      type: 'update-class',
      newClasses: classInput.value,
      mode: 'reconcile',
    });
  });
})();
`;
