// Trimming unused pixel space for export: the bounding box of everything that
// is not fully transparent, so a small sprite on a large canvas exports as
// just the sprite. Pixels are packed RGBA words (canvas-model.js hexToPacked),
// alpha in the top byte.

/** `{ x0, y0, x1, y1 }` (x1/y1 exclusive) of the visible pixels, or null if there are none. */
export function contentBounds(pixels, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x] >>> 24 === 0) continue;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      y1 = y + 1;
    }
  }
  return x1 ? { x0, y0, x1, y1 } : null;
}

/** Smallest box holding both; either may be null (nothing visible). */
export function unionBounds(a, b) {
  if (!a || !b) return a || b;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** The `box` window of a `w`-wide pixel array, as a new packed array. */
export function cropPixels(pixels, w, box) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const out = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const from = (box.y0 + y) * w + box.x0;
    out.set(pixels.subarray(from, from + bw), y * bw);
  }
  return out;
}
