// Custom Flimsy monochrome 20x20 icon registry & Google Fonts catalog
export const ICONS: Record<string, string> = {
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
    // Insert Element Presets & Viewport Switcher Icons
    box: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3.5" y="4.5" width="13" height="11" rx="2.4" fill="currentColor" fill-opacity="0.14"/></svg>',
    buttonEl: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.8" y="6" width="14.4" height="8" rx="4" fill="currentColor" fill-opacity="0.14"/><path d="M7.5 10h5"/></svg>',
    image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.2" width="13.6" height="11.6" rx="2.2" fill="currentColor" fill-opacity="0.10"/><circle cx="7.4" cy="8.1" r="1.2" fill="currentColor" stroke="none"/><path d="m4.2 14 3.7-3.4 2.8 2.6 2-1.8 3.1 2.6"/></svg>',
    desktop: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="2.8" y="3.8" width="14.4" height="9.6" rx="1.8" fill="currentColor" fill-opacity="0.12"/><path d="M7.2 16.4h5.6"/><path d="M10 13.4v3"/></svg>',
    tablet: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="2.8" width="11" height="14.4" rx="2" fill="currentColor" fill-opacity="0.12"/><path d="M9.2 14.6h1.6"/></svg>',
    mobile: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.8" width="8" height="14.4" rx="1.8" fill="currentColor" fill-opacity="0.12"/><path d="M9.2 14.6h1.6"/></svg>',
  };

export interface FontOption {
  name: string;
  family: string;
  category: string;
}

export const FONTS: FontOption[] = [
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
