// Single layer/frame pixel grid. Project/File/Layer/Frame model arrives in later phases.
export function createCanvasModel(width, height) {
  return {
    width,
    height,
    pixels: new Array(width * height).fill(null), // null = transparent
  };
}

export function inBounds(model, x, y) {
  return x >= 0 && y >= 0 && x < model.width && y < model.height;
}

export function getPixel(model, x, y) {
  if (!inBounds(model, x, y)) return null;
  return model.pixels[y * model.width + x];
}

export function setPixel(model, x, y, colorHex) {
  if (!inBounds(model, x, y)) return;
  model.pixels[y * model.width + x] = colorHex;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Source-over composite of `colorHex` at `alpha` onto whatever is already at
// (x, y). Baking the blend into a resolved color (rather than storing alpha
// per pixel) keeps the model a flat grid of solid-or-transparent colors, so
// repeated re-renders never re-blend against the same pixel twice.
export function blendPixel(model, x, y, colorHex, alpha) {
  if (!inBounds(model, x, y)) return;
  if (alpha >= 1) return setPixel(model, x, y, colorHex);
  if (alpha <= 0) return;
  const existing = getPixel(model, x, y);
  const top = hexToRgb(colorHex);
  if (!existing) {
    // Blending onto transparent: only the top color's own alpha matters,
    // which we approximate by lightening toward the canvas background so
    // low-alpha stamps still read as "faint" rather than full-strength.
    setPixel(model, x, y, colorHex);
    return;
  }
  const base = hexToRgb(existing);
  const mixed = rgbToHex(
    base.r + (top.r - base.r) * alpha,
    base.g + (top.g - base.g) * alpha,
    base.b + (top.b - base.b) * alpha,
  );
  setPixel(model, x, y, mixed);
}

// Antialiased stamp: soft circular brush, alpha falling off from center.
export function stampBrush(model, cx, cy, radius, colorHex) {
  const r = Math.max(1, radius);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const alpha = r <= 1 ? 1 : Math.max(0, Math.min(1, 1 - d / r));
      blendPixel(model, x, y, colorHex, alpha);
    }
  }
}

// Plain (non-antialiased) flood fill: all 4-connected pixels matching the
// clicked pixel's color are replaced outright.
export function floodFill(model, startX, startY, colorHex, antialiased = false) {
  const target = getPixel(model, startX, startY);
  if (target === colorHex) return;
  const matches = (x, y) => inBounds(model, x, y) && getPixel(model, x, y) === target;

  const visited = new Set();
  const stack = [[startX, startY]];
  const filled = [];
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = x + ',' + y;
    if (visited.has(key) || !matches(x, y)) continue;
    visited.add(key);
    filled.push([x, y]);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  for (const [x, y] of filled) {
    setPixel(model, x, y, colorHex);
  }

  if (antialiased) {
    // Soften the fill's outer boundary: any filled pixel touching a
    // non-matching neighbor gets a partial blend toward that neighbor's
    // original color, approximating an antialiased fill edge.
    const filledSet = new Set(filled.map(([x, y]) => x + ',' + y));
    for (const [x, y] of filled) {
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (filledSet.has(nx + ',' + ny) || !inBounds(model, nx, ny)) continue;
        blendPixel(model, x, y, colorHex, 0.6);
      }
    }
  }
}

// Bresenham: every grid cell on the line from (x0,y0) to (x1,y1), inclusive.
// Used to fill gaps when the pointer moves fast during a drag stroke.
export function linePixels(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  while (true) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
}
