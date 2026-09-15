// Pure pixel-buffer math shared by every {width, height, pixels, stride}
// view — main.js binds this shape to whichever layer+frame is currently
// active. `stride` (row length in the backing array) defaults to `width`;
// it differs after a canvas shrink, where the visible window (width/height)
// is a top-left crop of a wider logical buffer (§13.4) rather than a
// same-size copy — this lets that crop stay a view, not a copy.
export function inBounds(model, x, y) {
  return x >= 0 && y >= 0 && x < model.width && y < model.height;
}

export function getPixel(model, x, y) {
  if (!inBounds(model, x, y)) return null;
  return model.pixels[y * (model.stride || model.width) + x];
}

export function setPixel(model, x, y, colorHex) {
  if (!inBounds(model, x, y)) return;
  model.pixels[y * (model.stride || model.width) + x] = colorHex;
}

// Whole-array snapshot/diff, used to build one undo EditCommand per committed
// action (a drag-stroke, a fill, a delete) rather than per pixel. Canvas
// sizes here (max 256x256, per the design doc's size presets) make a full
// array diff cheap — no need for fine-grained touched-cell tracking.
export function snapshotPixels(model) {
  return model.pixels.slice();
}

export function diffFromSnapshot(model, snapshot) {
  const stride = model.stride || model.width;
  const before = [], after = [];
  for (let i = 0; i < model.pixels.length; i++) {
    if (model.pixels[i] !== snapshot[i]) {
      const x = i % stride, y = Math.floor(i / stride);
      before.push([x, y, snapshot[i]]);
      after.push([x, y, model.pixels[i]]);
    }
  }
  return { before, after };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Source-over composite of `top` at `alpha` onto `base` (either may be null
// = transparent). Pure — used both to bake a blended pixel into a model
// in-place (blendPixel) and to composite layers for display (pixi-file.js).
export function blendColors(base, top, alpha) {
  if (alpha >= 1 || !base) return top;
  if (alpha <= 0) return base;
  const b = hexToRgb(base), t = hexToRgb(top);
  return rgbToHex(
    b.r + (t.r - b.r) * alpha,
    b.g + (t.g - b.g) * alpha,
    b.b + (t.b - b.b) * alpha,
  );
}

// Baking the blend into a resolved color (rather than storing alpha per
// pixel) keeps the model a flat grid of solid-or-transparent colors, so
// repeated re-renders never re-blend against the same pixel twice.
export function blendPixel(model, x, y, colorHex, alpha) {
  if (!inBounds(model, x, y)) return;
  setPixel(model, x, y, blendColors(getPixel(model, x, y), colorHex, alpha));
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
