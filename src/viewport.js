import { viewState } from './view-state.js';

// Shared screen<->canvas-pixel mapping, used by both the renderer and input
// handling so they can never drift out of sync (§6: zoom-to-fit, free zoom,
// pan).
export function fitScale(model, viewW, viewH) {
  return Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height)));
}

// Zoom in until at least MIN_VISIBLE_PX canvas pixels still span the
// shorter viewport dimension — past that, scrolling/panning stops being
// useful (nothing left to navigate to within view). Never below the scale
// that fills the viewport in at least one direction, though — for a small
// canvas that scale can exceed this cap outright, and the user must always
// be able to zoom in that far.
const MIN_VISIBLE_PX = 16;
export function maxZoomScale(model, viewW, viewH) {
  const capScale = Math.max(1, Math.min(viewW, viewH) / MIN_VISIBLE_PX);
  const fillScale = Math.min(viewW / model.width, viewH / model.height);
  return Math.max(capScale, fillScale);
}

// How far out the user can manually zoom (wheel, End) — further than plain
// fit-to-window, down to about a 200px on-screen footprint (on request),
// whichever of the two is smaller. fitScale() itself stays floored at 1:1
// for the default/reset view; this is only the clamp for active zooming.
const MIN_ZOOM_TARGET_PX = 200;
export function minZoomScale(model, viewW, viewH) {
  const rawFit = Math.min(viewW / model.width, viewH / model.height);
  const targetScale = MIN_ZOOM_TARGET_PX / Math.max(model.width, model.height);
  // Cap at 1 (100%) so a small sprite — whose 200px footprint target would
  // otherwise sit above 1:1 — never loses the ability to zoom out to 100%.
  return Math.min(rawFit, targetScale, 1);
}

// Zoom/pan that centers the pixel-space box `b` ({minX, minY, w, h}) and
// scales it to just fill the viewport, clamped to the usual zoom range.
// Continuous scale, not integer-snapped (§1.3).
export function regionView(model, viewW, viewH, b) {
  const zoom = Math.max(
    minZoomScale(model, viewW, viewH),
    Math.min(maxZoomScale(model, viewW, viewH), viewW / b.w, viewH / b.h),
  );
  const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
  return { zoom, panX: (model.width / 2 - cx) * zoom, panY: (model.height / 2 - cy) * zoom };
}

// `state` defaults to the single-file canvas's own pan/zoom, but takes any
// { zoom, panX, panY } shape — the read-only group grid (main.js) reuses
// this same fit/pan math for its own camera over `groupViewState` instead.
export function computeViewport(model, viewW, viewH, state = viewState) {
  const fit = fitScale(model, viewW, viewH);
  const scale = state.zoom || fit;
  const w = model.width * scale;
  const h = model.height * scale;
  return {
    scale,
    ox: Math.floor((viewW - w) / 2) + state.panX,
    oy: Math.floor((viewH - h) / 2) + state.panY,
    fit,
  };
}

export function screenToPixel(viewport, screenX, screenY) {
  return {
    x: Math.floor((screenX - viewport.ox) / viewport.scale),
    y: Math.floor((screenY - viewport.oy) / viewport.scale),
  };
}
