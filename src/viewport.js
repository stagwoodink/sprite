import { viewState } from './view-state.js';

// Zoom is measured in CSS pixels per canvas pixel, but a canvas pixel only
// draws crisp when it covers a whole number of *device* pixels: otherwise the
// nearest-neighbor blit gives some pixels one device pixel more than their
// neighbours and edges look soft. That is only a problem when devicePixelRatio
// is not 1 (browser zoom, fractional OS scaling, hi-dpi), so everything below
// takes it as a parameter and works in device pixels.
const deviceRatio = () => globalThis.devicePixelRatio || 1;
const EPS = 1e-9; // keeps 4.000000001 or 3.9999999 from landing on the wrong side of a stop

/**
 * `scale` snapped to a whole number of device pixels per canvas pixel. Zoomed
 * out below one device pixel it snaps to 1/n instead (every n-th pixel is
 * sampled), which is as sharp as a reduction gets. `dir`: -1 rounds toward
 * zoomed out, 1 toward zoomed in, 0 to the nearest stop.
 *
 * The one exception: 100% (one CSS pixel per canvas pixel) is always a stop,
 * even where that is a fractional number of device pixels, because being able
 * to see the art at true size matters more than the crispness of one step.
 */
export function snapScale(scale, dpr = deviceRatio(), dir = 0) {
  const device = scale * dpr;
  let stop;
  if (device >= 1) stop = Math.max(1, [Math.floor, Math.round, Math.ceil][dir + 1](device + (dir < 0 ? EPS : -EPS))) / dpr;
  else stop = 1 / (Math.max(1, [Math.ceil, Math.round, Math.floor][dir + 1](1 / device + (dir < 0 ? -EPS : EPS))) * dpr);
  const hundred = dir < 0 ? scale >= 1 && stop < 1 : dir > 0 ? scale <= 1 && stop > 1 : Math.abs(scale - 1) < Math.abs(scale - stop);
  return hundred ? 1 : stop;
}

// The stop one notch in / out from `scale` (which need not be a stop itself),
// or 100% if that lies in between.
function adjacentStop(scale, dir, dpr) {
  const device = scale * dpr;
  const stop = device > 1 + EPS || (dir > 0 && device >= 1 - EPS)
    ? Math.max(1, Math.round(device) + dir) / dpr
    : 1 / (Math.max(1, Math.round(1 / device) - dir) * dpr);
  return (scale - 1) * (stop - 1) < 0 ? 1 : stop;
}

/**
 * Where a zoom step from `current` toward `next` lands: `next` snapped to a
 * stop, but never the stop it started on, so a gentle wheel tick still moves.
 */
export function stepScale(current, next, dpr = deviceRatio()) {
  const snapped = snapScale(next, dpr);
  const start = snapScale(current, dpr);
  if (next > current && snapped <= start) return adjacentStop(start, 1, dpr);
  if (next < current && snapped >= start) return adjacentStop(start, -1, dpr);
  return snapped;
}

/** A CSS-pixel length rounded to a whole device pixel, so an edge lands on a pixel boundary. */
export function snapLength(px, dpr = deviceRatio()) {
  return Math.round(px * dpr) / dpr;
}

// Shared screen<->canvas-pixel mapping, used by both the renderer and input
// handling so they can never drift out of sync (§6: zoom-to-fit, free zoom,
// pan).
export function fitScale(model, viewW, viewH, dpr = deviceRatio()) {
  return Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height) * dpr + EPS) / dpr);
}

// Zoom in until at least MIN_VISIBLE_PX canvas pixels still span the
// shorter viewport dimension: past that, scrolling/panning stops being
// useful (nothing left to navigate to within view). Never below the scale
// that fills the viewport in at least one direction, though: for a small
// canvas that scale can exceed this cap outright, and the user must always
// be able to zoom in that far.
const MIN_VISIBLE_PX = 16;
export function maxZoomScale(model, viewW, viewH) {
  const capScale = Math.max(1, Math.min(viewW, viewH) / MIN_VISIBLE_PX);
  const fillScale = Math.min(viewW / model.width, viewH / model.height);
  return Math.max(capScale, fillScale);
}

// How far out the user can manually zoom (wheel, End): further than plain
// fit-to-window, down to about a 200px on-screen footprint (on request),
// whichever of the two is smaller. fitScale() itself stays floored at 1:1
// for the default/reset view; this is only the clamp for active zooming.
const MIN_ZOOM_TARGET_PX = 200;
export function minZoomScale(model, viewW, viewH) {
  const rawFit = Math.min(viewW / model.width, viewH / model.height);
  const targetScale = MIN_ZOOM_TARGET_PX / Math.max(model.width, model.height);
  // Cap at 1 (100%) so a small sprite: whose 200px footprint target would
  // otherwise sit above 1:1: never loses the ability to zoom out to 100%.
  return Math.min(rawFit, targetScale, 1);
}

// Zoom/pan that centers the pixel-space box `b` ({minX, minY, w, h}) and
// scales it to just fill the viewport, clamped to the usual zoom range.
// Snapped down to a stop so the region still fits.
export function regionView(model, viewW, viewH, b) {
  const zoom = snapScale(Math.max(
    minZoomScale(model, viewW, viewH),
    Math.min(maxZoomScale(model, viewW, viewH), viewW / b.w, viewH / b.h),
  ), deviceRatio(), -1);
  const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
  return { zoom, panX: (model.width / 2 - cx) * zoom, panY: (model.height / 2 - cy) * zoom };
}

// `state` defaults to the single-file canvas's own pan/zoom, but takes any
// { zoom, panX, panY } shape: the read-only group grid (main.js) reuses
// this same fit/pan math for its own camera over `groupViewState` instead.
export function computeViewport(model, viewW, viewH, state = viewState) {
  const fit = fitScale(model, viewW, viewH);
  const scale = state.zoom || fit;
  const w = model.width * scale;
  const h = model.height * scale;
  return {
    scale,
    ox: snapLength(Math.floor((viewW - w) / 2) + state.panX),
    oy: snapLength(Math.floor((viewH - h) / 2) + state.panY),
    fit,
  };
}

export function screenToPixel(viewport, screenX, screenY) {
  return {
    x: Math.floor((screenX - viewport.ox) / viewport.scale),
    y: Math.floor((screenY - viewport.oy) / viewport.scale),
  };
}
