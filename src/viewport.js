import { viewState } from './view-state.js';

// Shared screen<->canvas-pixel mapping, used by both the renderer and input
// handling so they can never drift out of sync (§6: zoom-to-fit, free zoom,
// pan).
export function fitScale(model, viewW, viewH) {
  return Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height)));
}

// Zoom in until a single canvas pixel fills the whole visible area (§6).
export function maxZoomScale(viewW, viewH) {
  return Math.max(1, Math.min(viewW, viewH));
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
