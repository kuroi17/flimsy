import { ICONS } from './icons.js';

export function createDockHTML(): string {
  return `
    <button class="dock-tool dock-btn" data-tip="Select (V / Alt+X)" aria-label="Toggle Inspect">${ICONS.cursor}</button>
    <div class="dock-extra" id="flimsy-dock-extra" style="display:none;">
      <button class="dock-tool" id="flimsy-hand-tool" data-tip="Hand Pan (H / Space)" aria-label="Pan Canvas">${ICONS.hand}</button>
      <button class="dock-tool" id="flimsy-text-tool" data-tip="Edit Text" aria-label="Edit Text">${ICONS.text}</button>
      <button class="dock-tool subtle-active" id="flimsy-layers-toggle" data-tip="Layers" aria-label="Toggle Layers">${ICONS.layers}</button>
      <button class="dock-tool subtle-active" id="flimsy-snap-toggle" data-tip="Snap to Scale (Ctrl bypass)" aria-label="Toggle Tailwind Snap">${ICONS.snap}</button>
      <div class="dock-divider"></div>
      <button class="dock-tool" id="flimsy-undo-btn" data-tip="Undo (Ctrl+Z)" aria-label="Undo" disabled>${ICONS.undo}</button>
      <button class="dock-tool" id="flimsy-redo-btn" data-tip="Redo (Ctrl+Y)" aria-label="Redo" disabled>${ICONS.redo}</button>
      <button class="dock-tool" id="flimsy-dock-ai-btn" data-tip="AI Assist" aria-label="AI Assist">${ICONS.ai}</button>
      <div class="dock-divider"></div>
      <button class="zoom-pill" id="flimsy-zoom-pill" title="Zoom (Ctrl+Scroll, Ctrl+0 to reset)">100%</button>
    </div>
    <div class="dock-divider"></div>
    <div class="sync-status-badge" id="flimsy-dock-sync-status" title="Press Shift+S to sync changes to code">
      <span class="dot"></span>
      <span class="text">In sync</span>
    </div>
    <span class="dock-tool brand-mark" data-tip="Flimsy">${ICONS.brand}</span>
  `;
}

export function createHighlightBoxHTML(): string {
  return `
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
  `;
}

export function createLayersPanelHTML(): string {
  return `
    <div class="layers-header">
      <span>Layers</span>
      <div class="layers-header-actions">
        <button class="icon-btn" id="flimsy-layers-refresh" title="Refresh Tree" aria-label="Refresh Layers">${ICONS.refresh}</button>
        <button class="icon-btn" id="flimsy-layers-close" title="Hide Layers" aria-label="Hide Layers">${ICONS.close}</button>
      </div>
    </div>
    <div class="trail" id="flimsy-trail"></div>
  `;
}

export function createInspectorPanelHTML(): string {
  return `
    <div class="studio-header">
      <div class="studio-header-left">
        <span class="studio-tag-badge" id="flimsy-elem-tag">&lt;div&gt;</span>
        <span class="studio-loc-badge" id="flimsy-elem-loc">Hero.tsx:16</span>
        <span class="instance-badge" id="flimsy-instance-badge"></span>
      </div>
      <button class="icon-btn" id="flimsy-close-btn" title="Close (Esc)" aria-label="Close Inspector">${ICONS.close}</button>
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
          <button class="seg-btn" data-class="flex-row" data-auto-flex="1" title="Horizontal">${ICONS.flowRow}</button>
          <button class="seg-btn" data-class="flex-col" data-auto-flex="1" title="Vertical">${ICONS.flowCol}</button>
          <button class="seg-btn" data-class="flex-wrap" data-auto-flex="1" title="Wrap">${ICONS.flowWrap}</button>
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
            <button class="mini-toggle-btn" id="flimsy-pad-link-btn" title="Per-side padding">${ICONS.sides}</button>
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
          <button class="mini-toggle-btn" id="flimsy-radius-link-btn" title="Independent corners">${ICONS.corners}</button>
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
        <span style="display:inline-flex; color:var(--ink-muted); width:12px; height:12px;">${ICONS.chevronDown}</span>
      </div>
    </div>

    <!-- Typography -->
    <div class="prop-section">
      <span class="prop-label">Typography</span>
      <button class="font-select-trigger" id="flimsy-font-trigger">
        <span id="flimsy-current-font-name">Inter</span>
        <span style="display:inline-flex; color:var(--ink-muted); width:12px; height:12px;">${ICONS.chevronDown}</span>
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
          <button class="seg-btn" data-class="text-left" title="Align Left">${ICONS.alignL}</button>
          <button class="seg-btn" data-class="text-center" title="Align Center">${ICONS.alignC}</button>
          <button class="seg-btn" data-class="text-right" title="Align Right">${ICONS.alignR}</button>
          <button class="seg-btn" data-class="text-justify" title="Justify">${ICONS.alignJ}</button>
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
        <button class="accordion-plus" id="flimsy-border-accordion-icon" type="button" aria-label="Toggle Stroke & Border">${ICONS.plus}</button>
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
          <button class="mini-toggle-btn" id="flimsy-border-side-btn" title="Individual border sides">${ICONS.sides}</button>
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
        <button class="accordion-plus" id="flimsy-effects-accordion-icon" type="button" aria-label="Toggle Effects">${ICONS.plus}</button>
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
        <button class="pill-toggle" id="flimsy-ai-toggle">${ICONS.ai} AI</button>
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
          <button id="flimsy-ai-copy" class="pill-toggle" title="Copy prompt">${ICONS.copy} Copy</button>
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
  `;
}

export function createColorModalHTML(): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-primary);">Color</span>
      <button class="icon-btn" id="flimsy-color-close" style="width:18px; height:18px;" aria-label="Close Color Picker">${ICONS.close}</button>
    </div>
    <div class="color-canvas-wrap" id="flimsy-canvas-wrap">
      <canvas class="color-canvas" id="flimsy-color-canvas" width="220" height="130"></canvas>
      <div class="canvas-thumb" id="flimsy-canvas-thumb"></div>
    </div>
    <input type="range" min="0" max="360" value="217" class="hue-slider" id="flimsy-hue-slider" aria-label="Hue">
    <input type="range" min="5" max="100" value="100" class="alpha-slider" id="flimsy-alpha-slider" aria-label="Alpha">
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="icon-btn" id="flimsy-eyedropper-btn" title="Eyedropper" aria-label="Eyedropper">${ICONS.eyedropper}</button>
      <input type="text" id="flimsy-modal-hex" class="clean-input" style="font-family:ui-monospace,monospace; text-transform:uppercase;" value="#1E293B">
      <span id="flimsy-modal-alpha-text" style="font-size:10px; font-family:ui-monospace,monospace; color:var(--ink-secondary); width:32px; text-align:right;">100%</span>
    </div>
    <div style="border-top:1px solid var(--hairline); padding-top:6px;">
      <span style="font-size:9.5px; font-weight:600; color:var(--ink-muted); margin-bottom:4px; display:block;">On this page</span>
      <div class="doc-colors-grid" id="flimsy-doc-colors"></div>
    </div>
  `;
}

export function createFontModalHTML(): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:11px; font-weight:600; color:var(--ink-primary);">Fonts</span>
      <button class="icon-btn" id="flimsy-font-close" style="width:18px; height:18px;" aria-label="Close Fonts">${ICONS.close}</button>
    </div>
    <input type="text" class="clean-input" id="flimsy-font-search" placeholder="Search fonts...">
    <div class="font-list-scroll no-scroll" id="flimsy-font-list"></div>
  `;
}
