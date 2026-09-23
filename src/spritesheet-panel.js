import { openCustomSlideOut } from './slide-out.js';
import { button } from './ui.js';

// Slide-out asking for the grid when auto-detection couldn't find one:
// cell W/H, margin, spacing, and whether cells become Frames or Layers.
// Resolves to { cellW, cellH, margin, spacing, mode }, or null if dismissed.
export function askSheetGrid(anchor, { cellW, cellH, margin, spacing, mode }) {
  return new Promise((resolve) => {
    let picked = mode;
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openCustomSlideOut(anchor, (panel, close) => {
      const fields = [['Cell W', cellW], ['Cell H', cellH], ['Margin', margin], ['Spacing', spacing]].map(([title, value]) => {
        const el = document.createElement('input');
        el.type = 'number';
        el.min = 0;
        el.title = title;
        el.placeholder = title;
        el.value = value;
        return el;
      });
      const row = document.createElement('div');
      row.className = 'size-row sheet-fields';
      row.append(...fields);

      const modes = ['frames', 'layers'].map((m) => button({
        label: m === 'frames' ? 'Frames' : 'Layers', fill: true, selected: m === picked,
        onClick: () => { picked = m; modes.forEach((b, i) => b.classList.toggle('selected', ['frames', 'layers'][i] === m)); },
      }));
      const ok = button({
        label: 'Import', fill: true,
        onClick: () => {
          const [w, h, m, s] = fields.map((f) => Math.max(0, Math.round(Number(f.value)) || 0));
          finish({ cellW: w, cellH: h, margin: m, spacing: s, mode: picked });
          close();
        },
      });
      panel.append(row, ...modes, ok);
    }, { side: 'right', className: 'sheet-popup', onDismiss: () => finish(null) });
  });
}
