// "?" toggles a keybind reference modal; Esc also closes it while open
// (§16 lists the spec'd bindings — this also includes bindings added on
// request that aren't in the spec, e.g. Shift+Tab).
const GROUPS = [
  ['Global', [
    ['G', 'Toggle grid'],
    ['Shift+G', 'Toggle ruler'],
    ['1-0 / Alt+1-0', 'Primary / secondary color from palette chips 1-10'],
    ['P', 'Pin/unpin palette'],
    ['Tab', 'Pin/unpin project panel'],
    ['Shift+Tab', 'Hide/restore all pinned panels'],
    ['L', 'Pin/unpin layers panel'],
    ['T', 'Pin/unpin timeline'],
    ['E', 'Open export'],
    ['Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+Space', 'Play/pause timeline'],
    ['?', 'Toggle this help'],
  ]],
  ['Canvas — drawing', [
    ['Click / drag', 'Paint primary (left) or secondary (right)'],
    ['Alt+click/drag', 'Antialiased paint'],
    ['[ / ]', 'Shrink / grow brush size'],
    ['Shift+[ / Shift+]', 'Halve / double brush size'],
    ['Ctrl+click', 'Flood fill, or fill the whole selection if one exists'],
    ['Ctrl+Alt+click', 'Antialiased fill'],
    ['Space+drag', 'Pan'],
    ['Wheel', 'Zoom'],
  ]],
  ['Canvas — selection', [
    ['Shift+drag', 'Rectangle select (click alone = one pixel)'],
    ['Shift+Alt+click', 'Magic wand select'],
    ['Shift+Ctrl+click', 'Polygon select (release Shift or Ctrl to close)'],
    ['Ctrl+A', 'Select all'],
    ['Esc', 'Clear selection'],
    ['Backspace/Delete', 'Delete hovered pixel, or full selection'],
    ['Ctrl+C / X / V', 'Copy / cut / paste'],
    ['F / Shift+F', 'Flip horizontal / vertical'],
    ['R (hold) / Shift+R', 'Free rotate / 15°-snapped rotate'],
    ['Shift+Arrows', 'Move selection boundary'],
    ['Shift+Ctrl+Arrows/Drag', 'Move selected content'],
  ]],
  ['Palette chip', [
    ['Click', 'Set primary'],
    ['Right-click', 'Set secondary'],
    ['Alt+click', 'Open color picker'],
    ['Shift+click', 'Select every pixel of this color on the active layer'],
    ['Drag', 'Reorder'],
  ]],
  ['Layers panel (hovered)', [
    ['Up/Down', 'Navigate active layer'],
    ['Shift+Up/Down', 'Reorder active layer'],
    ['Backspace/Delete', 'Delete active layer'],
  ]],
  ['Timeline (hovered)', [
    ['Left/Right', 'Navigate frames'],
    ['Shift+Left/Right', 'Reorder frame'],
    ['+ / Ctrl+ +', 'Add / duplicate frame'],
    ['Backspace/Delete', 'Delete frame'],
  ]],
];

export function createKeybindHelp() {
  let overlay = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'keybind-help-overlay';

    const panel = document.createElement('div');
    panel.className = 'keybind-help-panel';

    const title = document.createElement('div');
    title.className = 'keybind-help-title';
    title.textContent = 'KEYBINDS';
    panel.append(title);

    for (const [group, rows] of GROUPS) {
      const h = document.createElement('div');
      h.className = 'keybind-help-group';
      h.textContent = group;
      panel.append(h);
      for (const [key, desc] of rows) {
        const row = document.createElement('div');
        row.className = 'keybind-help-row';
        const k = document.createElement('span');
        k.className = 'keybind-help-key';
        k.textContent = key;
        const d = document.createElement('span');
        d.textContent = desc;
        row.append(k, d);
        panel.append(row);
      }
    }

    overlay.append(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.append(overlay);
  }

  function open() {
    if (overlay) return;
    build();
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  return {
    toggle() { overlay ? close() : open(); },
    isOpen: () => !!overlay,
    close,
  };
}
