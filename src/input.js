import { setPixel, stampBrush, floodFill, linePixels } from './canvas-model.js';
import { computeViewport, screenToPixel } from './viewport.js';
import { cursorForMode } from './cursors.js';

const MAX_BRUSH_FRACTION = 0.25; // "[" / "]" while Alt held, capped at 1/4 canvas dimension (§8)

// Modifier-driven single-tool interaction (§8). No selection creation here
// yet (Shift-family lands in Phase 4) — cursor modes for it are wired now so
// the mode table stays in one place.
export function createInputController(canvas, model, colors, onPaint) {
  const keys = { alt: false, ctrl: false, shift: false, space: false };
  let brushRadius = 1;
  let panning = false;
  let lastPan = null;
  let lastPixel = null;
  let drawingButton = null; // 0 = left/primary, 2 = right/secondary

  function maxBrush() {
    return Math.max(1, Math.floor(Math.min(model.width, model.height) * MAX_BRUSH_FRACTION));
  }

  function currentMode() {
    if (keys.space) return panning ? 'panning' : 'pan';
    if (keys.shift && keys.ctrl) return 'selectPolygon';
    if (keys.shift && keys.alt) return 'selectWand';
    if (keys.shift) return 'selectRect';
    if (keys.ctrl && keys.alt) return 'antialiasedFill';
    if (keys.ctrl) return 'fill';
    if (keys.alt) return 'antialiasedPaint';
    return 'paint';
  }

  function updateCursor() {
    canvas.style.cursor = cursorForMode(currentMode());
  }

  function colorForButton(button) {
    return button === 2 ? colors.secondary() : colors.primary();
  }

  function paintAt(x, y, button) {
    const color = colorForButton(button);
    if (keys.alt) {
      stampBrush(model, x, y, brushRadius, color);
    } else {
      setPixel(model, x, y, color);
    }
  }

  function fillAt(x, y, button) {
    floodFill(model, x, y, colorForButton(button), keys.alt);
  }

  function pointerPixel(e) {
    const rect = canvas.getBoundingClientRect();
    const viewport = computeViewport(model, rect.width, rect.height);
    return screenToPixel(viewport, e.clientX - rect.left, e.clientY - rect.top);
  }

  function onKeyDown(e) {
    let changed = false;
    if (e.key === 'Alt') { keys.alt = true; changed = true; }
    if (e.key === 'Control') { keys.ctrl = true; changed = true; }
    if (e.key === 'Shift') { keys.shift = true; changed = true; }
    if (e.code === 'Space' && !e.repeat) { keys.space = true; changed = true; e.preventDefault(); }
    if (keys.alt && (e.key === '[' || e.key === ']')) {
      brushRadius = Math.max(1, Math.min(maxBrush(), brushRadius + (e.key === ']' ? 1 : -1)));
      changed = true;
      e.preventDefault();
    }
    if (changed) updateCursor();
  }

  function onKeyUp(e) {
    let changed = false;
    if (e.key === 'Alt') { keys.alt = false; changed = true; }
    if (e.key === 'Control') { keys.ctrl = false; changed = true; }
    if (e.key === 'Shift') { keys.shift = false; changed = true; }
    if (e.code === 'Space') { keys.space = false; panning = false; changed = true; }
    if (changed) updateCursor();
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    if (keys.space) {
      panning = true;
      lastPan = { x: e.clientX, y: e.clientY };
      updateCursor();
      return;
    }
    e.preventDefault();
    const { x, y } = pointerPixel(e);
    if (keys.shift) return; // selection creation: Phase 4
    drawingButton = e.button;
    if (keys.ctrl) {
      fillAt(x, y, e.button);
    } else {
      paintAt(x, y, e.button);
    }
    lastPixel = { x, y };
    onPaint();
  }

  function onPointerMove(e) {
    if (panning && lastPan) {
      // Pan target (a scrollable/zoomable viewport transform) lands with
      // the zoom feature — not yet in the model, so this is a no-op stub
      // that still tracks delta for when that lands.
      lastPan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (drawingButton === null || keys.shift) return;
    const { x, y } = pointerPixel(e);
    if (lastPixel && (lastPixel.x !== x || lastPixel.y !== y)) {
      for (const [px, py] of linePixels(lastPixel.x, lastPixel.y, x, y)) {
        paintAt(px, py, drawingButton);
      }
      lastPixel = { x, y };
      onPaint();
    }
  }

  function onPointerUp(e) {
    canvas.releasePointerCapture(e.pointerId);
    drawingButton = null;
    lastPixel = null;
    if (keys.space) panning = false;
    updateCursor();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  updateCursor();
  return { getBrushRadius: () => brushRadius };
}
