import { setPixel, stampBrush, floodFill, linePixels, snapshotPixels, diffFromSnapshot } from './canvas-model.js';
import { computeViewport, screenToPixel } from './viewport.js';
import { cursorForMode } from './cursors.js';
import { maskFromRect, maskFromWand, maskFromPolygon } from './selection.js';

const MAX_BRUSH_FRACTION = 0.25; // "[" / "]" while Alt held, capped at 1/4 canvas dimension (§8)

// Modifier-driven single-tool interaction (§8). No selection creation here
// yet (Shift-family lands in Phase 4) — cursor modes for it are wired now so
// the mode table stays in one place.
export function createInputController(canvas, model, colors, onPaint, selectionApi, history) {
  const keys = { alt: false, ctrl: false, shift: false, space: false };
  let brushRadius = 1;
  let panning = false;
  let lastPan = null;
  let lastPixel = null;
  let drawingButton = null; // 0 = left/primary, 2 = right/secondary
  let rectStart = null;
  let polygonPoints = null;
  let strokeSnapshot = null;
  let contentDragFrom = null;

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
    const color = colorForButton(button);
    const mask = selectionApi.getMask && selectionApi.getMask();
    // With an active selection, Ctrl+click fills the whole selection with
    // the color — the selection acts as a stencil, not a color-match seed.
    // No selection: falls back to the plain flood fill (§8).
    if (mask) {
      for (let my = 0; my < model.height; my++) {
        for (let mx = 0; mx < model.width; mx++) {
          if (mask[my * model.width + mx]) setPixel(model, mx, my, color);
        }
      }
    } else {
      floodFill(model, x, y, color, keys.alt);
    }
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
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (!typing && keys.alt && (e.key === '[' || e.key === ']')) {
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
    // Releasing either modifier of the polygon selector closes the shape (§9.1).
    if ((e.key === 'Shift' || e.key === 'Control') && polygonPoints) {
      if (polygonPoints.length >= 3) selectionApi.set(maskFromPolygon(model, polygonPoints));
      polygonPoints = null;
      onPaint();
    }
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

    if (keys.shift && keys.ctrl) {
      const mask = selectionApi.getMask && selectionApi.getMask();
      if (mask && mask[y * model.width + x]) {
        contentDragFrom = { x, y };
      } else {
        (polygonPoints ||= []).push([x, y]);
      }
      onPaint();
      return;
    }
    if (keys.shift && keys.alt) {
      selectionApi.set(maskFromWand(model, x, y));
      onPaint();
      return;
    }
    if (keys.shift) {
      rectStart = { x, y };
      selectionApi.setLiveRect(x, y, x, y);
      onPaint();
      return;
    }

    drawingButton = e.button;
    strokeSnapshot = snapshotPixels(model);
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
    if (rectStart) {
      const { x, y } = pointerPixel(e);
      selectionApi.setLiveRect(rectStart.x, rectStart.y, x, y);
      onPaint();
      return;
    }
    if (contentDragFrom) {
      const { x, y } = pointerPixel(e);
      const dx = x - contentDragFrom.x, dy = y - contentDragFrom.y;
      if (dx || dy) {
        selectionApi.moveContentBy(dx, dy);
        contentDragFrom = { x, y };
      }
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
    if (contentDragFrom) {
      contentDragFrom = null;
      selectionApi.commitContentMove();
    }
    if (rectStart) {
      const { x, y } = pointerPixel(e);
      selectionApi.set(maskFromRect(model, rectStart.x, rectStart.y, x, y));
      rectStart = null;
      onPaint();
    }
    if (strokeSnapshot) {
      const { before, after } = diffFromSnapshot(model, strokeSnapshot);
      history.commit({ type: keys.ctrl ? 'fill' : 'pixelEdit', before, after, antialiased: keys.alt });
      strokeSnapshot = null;
    }
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
