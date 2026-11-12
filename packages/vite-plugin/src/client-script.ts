export const clientScript = `
(function () {
  if (window.__FLIMSY_INITIALIZED__) return;
  window.__FLIMSY_INITIALIZED__ = true;

  console.log('[Flimsy] Visual-to-code synchronization client active.');

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
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .badge-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #1e293b;
      box-shadow: 0 4px 14px rgba(0,0,0,0.3);
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
      transition: all 0.2s ease;
    }
    .badge-btn:hover {
      background: #1e293b;
      transform: translateY(-1px);
    }
    .badge-btn.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
    }
    .indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
    }
    .badge-btn.active .indicator {
      background: #4ade80;
      box-shadow: 0 0 8px #4ade80;
    }
    .box-highlight {
      position: absolute;
      border: 2px dashed #0284c7;
      background: rgba(2, 132, 199, 0.1);
      pointer-events: none;
      transition: all 0.08s ease;
      display: none;
      border-radius: 4px;
    }
    .box-tooltip {
      position: absolute;
      top: -28px;
      left: 0;
      background: #0f172a;
      color: #f8fafc;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      border: 1px solid #334155;
      display: flex;
      gap: 6px;
    }
    .box-tooltip span.loc {
      color: #38bdf8;
    }
    .inspector-card {
      position: fixed;
      bottom: 75px;
      right: 20px;
      width: 320px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      padding: 16px;
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
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 8px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .field-input {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      color: #ffffff;
      font-size: 12px;
      outline: none;
      width: 100%;
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
    .quick-btn {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .quick-btn:hover {
      background: #334155;
      color: #f1f5f9;
    }
    .status-msg {
      font-size: 11px;
      color: #4ade80;
      margin-top: 4px;
      display: none;
    }
  \`;
  shadow.appendChild(style);

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'badge-btn';
  toggleBtn.innerHTML = '<span class="indicator"></span><span>Flimsy Inspect</span>';
  shadow.appendChild(toggleBtn);

  // Highlight Box
  const highlightBox = document.createElement('div');
  highlightBox.className = 'box-highlight';
  highlightBox.innerHTML = '<div class="box-tooltip"><span class="tag"></span><span class="loc"></span></div>';
  shadow.appendChild(highlightBox);
  const tagSpan = highlightBox.querySelector('.tag');
  const locSpan = highlightBox.querySelector('.loc');

  // Inspector Card
  const inspectorCard = document.createElement('div');
  inspectorCard.className = 'inspector-card';
  inspectorCard.innerHTML = \`
    <div class="card-header">
      <div class="card-title">⚡ Flimsy Inspector</div>
      <button class="close-btn">&times;</button>
    </div>
    <div class="field-group">
      <div class="field-label">Target Source</div>
      <div id="flimsy-src-display" style="font-size:12px; color:#38bdf8; font-family:monospace; word-break:break-all;"></div>
    </div>
    <div class="field-group">
      <div class="field-label">Text Content</div>
      <input type="text" id="flimsy-text-input" class="field-input" placeholder="Update text...">
      <button id="flimsy-save-text" class="action-btn" style="margin-top:4px;">Sync Text to Code</button>
    </div>
    <div class="field-group">
      <div class="field-label">Tailwind Classes</div>
      <input type="text" id="flimsy-class-input" class="field-input" placeholder="e.g. bg-blue-500 p-4">
      <div class="btn-row" style="margin-top:4px;">
        <button class="quick-btn" data-classes="bg-emerald-600 text-white">Emerald</button>
        <button class="quick-btn" data-classes="bg-indigo-600 text-white">Indigo</button>
        <button class="quick-btn" data-classes="p-6">Big Pad</button>
        <button class="quick-btn" data-classes="rounded-2xl shadow-xl">Rounded</button>
      </div>
      <button id="flimsy-save-class" class="action-btn" style="margin-top:6px;">Sync Classes to Code</button>
    </div>
    <div id="flimsy-status" class="status-msg"></div>
  \`;
  shadow.appendChild(inspectorCard);

  const srcDisplay = inspectorCard.querySelector('#flimsy-src-display');
  const textInput = inspectorCard.querySelector('#flimsy-text-input');
  const classInput = inspectorCard.querySelector('#flimsy-class-input');
  const saveTextBtn = inspectorCard.querySelector('#flimsy-save-text');
  const saveClassBtn = inspectorCard.querySelector('#flimsy-save-class');
  const statusMsg = inspectorCard.querySelector('#flimsy-status');
  const closeBtn = inspectorCard.querySelector('.close-btn');

  // Toggle Inspect Mode
  toggleBtn.addEventListener('click', () => {
    isInspectActive = !isInspectActive;
    toggleBtn.classList.toggle('active', isInspectActive);
    if (!isInspectActive) {
      highlightBox.style.display = 'none';
      inspectorCard.style.display = 'none';
      selectedTarget = null;
    }
  });

  closeBtn.addEventListener('click', () => {
    inspectorCard.style.display = 'none';
    selectedTarget = null;
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

  // Mousemove handler
  window.addEventListener('mousemove', (e) => {
    if (!isInspectActive || selectedTarget) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      hoveredTarget = target;
      const rect = target.getBoundingClientRect();
      highlightBox.style.display = 'block';
      highlightBox.style.top = rect.top + window.scrollY + 'px';
      highlightBox.style.left = rect.left + window.scrollX + 'px';
      highlightBox.style.width = rect.width + 'px';
      highlightBox.style.height = rect.height + 'px';

      const file = target.getAttribute('data-flimsy-file');
      const line = target.getAttribute('data-flimsy-line');
      tagSpan.textContent = '<' + target.tagName.toLowerCase() + '>';
      locSpan.textContent = file + ':' + line;
    } else {
      hoveredTarget = null;
      highlightBox.style.display = 'none';
    }
  }, true);

  // Click handler
  window.addEventListener('click', (e) => {
    if (!isInspectActive) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = findTaggedElement(el);

    if (target) {
      e.preventDefault();
      e.stopPropagation();

      selectedTarget = target;
      const file = target.getAttribute('data-flimsy-file');
      const line = target.getAttribute('data-flimsy-line');
      const col = target.getAttribute('data-flimsy-col');

      srcDisplay.textContent = file + ':' + line;
      textInput.value = target.innerText.trim();
      classInput.value = target.className || '';

      inspectorCard.style.display = 'flex';
      statusMsg.style.display = 'none';
    }
  }, true);

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
        statusMsg.textContent = '✓ Synced to ' + file + ' (HMR triggering)';
      } else {
        statusMsg.style.color = '#f87171';
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
