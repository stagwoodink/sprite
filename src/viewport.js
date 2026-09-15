// Shared screen<->canvas-pixel mapping, used by both the renderer and input
// handling so they can never drift out of sync (§6: zoom-to-fit).
export function computeViewport(model, viewW, viewH) {
  const scale = Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height)));
  const w = model.width * scale;
  const h = model.height * scale;
  return {
    scale,
    ox: Math.floor((viewW - w) / 2),
    oy: Math.floor((viewH - h) / 2),
  };
}

export function screenToPixel(viewport, screenX, screenY) {
  return {
    x: Math.floor((screenX - viewport.ox) / viewport.scale),
    y: Math.floor((screenY - viewport.oy) / viewport.scale),
  };
}
