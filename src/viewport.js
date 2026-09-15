import { viewState } from './view-state.js';

// Shared screen<->canvas-pixel mapping, used by both the renderer and input
// handling so they can never drift out of sync (§6: zoom-to-fit, free zoom,
// pan).
export function fitScale(model, viewW, viewH) {
  return Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height)));
}

// Zoom in until at least MIN_VISIBLE_PX canvas pixels still span the
// shorter viewport dimension — past that, scrolling/panning stops being
// useful (nothing left to navigate to within view).
const MIN_VISIBLE_PX = 16;
export function maxZoomScale(viewW, viewH) {
  return Math.max(1, Math.min(viewW, viewH) / MIN_VISIBLE_PX);
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

export function computeViewport(model, viewW, viewH) {
  const fit = fitScale(model, viewW, viewH);
  const scale = viewState.zoom || fit;
  const w = model.width * scale;
  const h = model.height * scale;
  return {
    scale,
    ox: Math.floor((viewW - w) / 2) + viewState.panX,
    oy: Math.floor((viewH - h) / 2) + viewState.panY,
    fit,
  };
}

export function screenToPixel(viewport, screenX, screenY) {
  return {
    x: Math.floor((screenX - viewport.ox) / viewport.scale),
    y: Math.floor((screenY - viewport.oy) / viewport.scale),
  };
}
