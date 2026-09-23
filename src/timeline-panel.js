import { paintThumbnail } from './thumbnail.js';
import { compositeFrameAt } from './sprite-file.js';
import { BLOCK } from './grid.js';
import { button, attachNativeDragReorder } from './ui.js';

const THUMB_H = BLOCK * 2; // frame tiles are 2 blocks tall

export function renderTimelinePanel(container, file, playback, callbacks, frameSelection) {
  container.innerHTML = '';
  const selLo = frameSelection ? Math.min(frameSelection.anchor, frameSelection.to) : -1;
  const selHi = frameSelection ? Math.max(frameSelection.anchor, frameSelection.to) : -1;

  const fpsField = document.createElement('input');
  fpsField.type = 'number';
  fpsField.className = 'fps-field';
  fpsField.min = 1;
  fpsField.max = 60;
  fpsField.value = playback.fps;
  fpsField.addEventListener('change', () => callbacks.onSetFps(Math.max(1, Number(fpsField.value) || 1)));

  const onionBtn = button({
    glyph: '◈', icon: true, className: 'onion-toggle', active: playback.onionSkin, // diamond glyph, per the brand's rotated-square motif
    title: 'Onion skin (right-click: toggle full-composite vs active-layer-only ghost source)',
    onClick: () => callbacks.onToggleOnion(),
    onContextMenu: (e) => { e.preventDefault(); callbacks.onToggleOnionSource(); },
  });

  const strip = document.createElement('div');
  strip.className = 'frame-strip';

  file.frames.forEach((frame, i) => {
    const gap = document.createElement('div');
    gap.className = 'frame-insert-gap';
    const insertBtn = button({ glyph: '+', className: 'frame-insert-btn', onClick: () => callbacks.onInsertFrame(i) });
    gap.append(insertBtn);
    strip.append(gap);

    const tile = document.createElement('div');
    tile.className = 'frame-tile'
      + (i === file.activeFrameIndex ? ' active' : '')
      + (i >= selLo && i <= selHi ? ' frame-tile--selected' : ''); // T+Shift multi-frame select

    const canvasEl = document.createElement('canvas');
    paintThumbnail(canvasEl, file, compositeFrameAt(file, i), THUMB_H);

    const del = document.createElement('div');
    del.className = 'frame-delete';
    del.textContent = '✕';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDelete(i); });

    tile.append(canvasEl, del);
    tile.addEventListener('click', () => callbacks.onSelect(i));
    attachNativeDragReorder(tile, i, {
      getItems: () => Array.from(strip.querySelectorAll('.frame-tile')),
      axis: 'x',
      onReorder: (from, to) => callbacks.onReorder(from, to),
    });

    strip.append(tile);
  });

  const addBtn = button({ glyph: '+', icon: true, title: 'Add frame', onClick: () => callbacks.onAddFrame() });

  // Onion skin and add-frame stack 1 block each, to the right of the FPS
  // field, filling the same 2-block panel height between them.
  const stack = document.createElement('div');
  stack.className = 'timeline-stack';
  // Still creates a new File — nothing imports into the open one; Frames
  // is pre-selected because that's the Timeline's concern.
  const importBtn = button({ glyph: '↓', icon: true, title: 'Import a spritesheet as frames (new File)', onClick: (e) => callbacks.onImportSheet(e.currentTarget) });
  stack.append(onionBtn, addBtn, importBtn);

  container.append(fpsField, stack, strip);
}
