import { paintThumbnail } from './thumbnail.js';
import { compositeFrameAt } from './pixi-file.js';
import { BLOCK } from './grid.js';

const THUMB_H = BLOCK;

export function renderTimelinePanel(container, file, playback, callbacks) {
  container.innerHTML = '';

  const fpsField = document.createElement('input');
  fpsField.type = 'number';
  fpsField.className = 'fps-field';
  fpsField.min = 1;
  fpsField.max = 60;
  fpsField.value = playback.fps;
  fpsField.addEventListener('change', () => callbacks.onSetFps(Math.max(1, Number(fpsField.value) || 1)));

  const onionBtn = document.createElement('button');
  onionBtn.className = 'onion-toggle' + (playback.onionSkin ? ' active' : '');
  onionBtn.title = 'Onion skin (right-click: toggle full-composite vs active-layer-only ghost source)';
  onionBtn.textContent = '◈'; // diamond glyph, per the brand's rotated-square motif
  onionBtn.addEventListener('click', () => callbacks.onToggleOnion());
  onionBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); callbacks.onToggleOnionSource(); });

  const strip = document.createElement('div');
  strip.className = 'frame-strip';

  file.frames.forEach((frame, i) => {
    const gap = document.createElement('div');
    gap.className = 'frame-insert-gap';
    const insertBtn = document.createElement('button');
    insertBtn.className = 'frame-insert-btn';
    insertBtn.textContent = '+';
    insertBtn.addEventListener('click', () => callbacks.onInsertFrame(i));
    gap.append(insertBtn);
    strip.append(gap);

    const tile = document.createElement('div');
    tile.className = 'frame-tile' + (i === file.activeFrameIndex ? ' active' : '');
    tile.draggable = true;

    const canvasEl = document.createElement('canvas');
    paintThumbnail(canvasEl, file, compositeFrameAt(file, i), THUMB_H);

    const del = document.createElement('div');
    del.className = 'frame-delete';
    del.textContent = '✕';
    del.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onDelete(i); });

    tile.append(canvasEl, del);
    tile.addEventListener('click', () => callbacks.onSelect(i));
    tile.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
    tile.addEventListener('dragover', (e) => e.preventDefault());
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      callbacks.onReorder(Number(e.dataTransfer.getData('text/plain')), i);
    });

    strip.append(tile);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'frame-add-btn';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => callbacks.onAddFrame());

  container.append(fpsField, onionBtn, strip, addBtn);
}
