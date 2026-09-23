// Pure pixel-buffer math shared by every {width, height, pixels, stride,
// colors} view — main.js binds this shape to whichever layer+frame is
// currently active. `pixels` is a Uint16Array of indices into `colors`, the
// owning File's color table (index 0 = transparent). The public API stays
// hex-based; indices never leak past this module except through the raw
// snapshot/`pixels` copies main.js takes for undo diffs.
// `stride` (row length in the backing array) defaults to `width`;
// it differs after a canvas shrink, where the visible window (width/height)
// is a top-left crop of a wider logical buffer (§13.4) rather than a
// same-size copy — this lets that crop stay a view, not a copy.
export function inBounds(model, x, y) {
  return x >= 0 && y >= 0 && x < model.width && y < model.height;
}

const MAX_COLORS = 65535; // Uint16 index space, minus the transparent slot
const internMaps = new WeakMap(); // colors array -> Map<HEX, index>, rebuilt if the array changed underneath
const packedTables = new WeakMap(); // colors array -> { length, table: Uint32Array }

export function createColorTable() {
  return [null];
}

function internMap(colors) {
  let map = internMaps.get(colors);
  if (!map || map.size !== colors.length - 1) {
    map = new Map();
    for (let i = 1; i < colors.length; i++) map.set(colors[i], i);
    internMaps.set(colors, map);
  }
  return map;
}

// Hex -> table index, appending on first sight. A blended (off-palette)
// color goes through the same path, which is the whole reason the table
// exists instead of palette indices. Past 65,535 distinct colors the
// nearest existing entry wins rather than losing the stroke.
export function colorIndex(colors, hex) {
  if (!hex) return 0;
  const key = hex.toUpperCase();
  const map = internMap(colors);
  let i = map.get(key);
  if (i !== undefined) return i;
  if (colors.length > MAX_COLORS) return nearestColorIndex(colors, key);
  i = colors.length;
  colors.push(key);
  map.set(key, i);
  return i;
}

function nearestColorIndex(colors, hex) {
  const t = hexToRgb(hex);
  let best = 1, bestD = Infinity;
  for (let i = 1; i < colors.length; i++) {
    const c = hexToRgb(colors[i]);
    const d = (c.r - t.r) ** 2 + (c.g - t.g) ** 2 + (c.b - t.b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Table as packed RGBA words (see hexToPacked), cached until it grows.
export function packedTable(colors) {
  let cached = packedTables.get(colors);
  if (!cached || cached.length !== colors.length) {
    const table = new Uint32Array(colors.length);
    for (let i = 1; i < colors.length; i++) table[i] = hexToPacked(colors[i]);
    cached = { length: colors.length, table };
    packedTables.set(colors, cached);
  }
  return cached.table;
}

// One pixel as a single 32-bit word laid out R,G,B,A in memory (a
// little-endian Uint32 over ImageData bytes), 0 = transparent. Composites
// are built in this form so the renderer can copy them straight into an
// ImageData with no per-pixel parsing.
export function hexToPacked(hex) {
  const { r, g, b } = hexToRgb(hex);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function packedToHex(p) {
  return rgbToHex(p & 255, (p >> 8) & 255, (p >> 16) & 255);
}

export function getPixel(model, x, y) {
  if (!inBounds(model, x, y)) return null;
  return model.colors[model.pixels[y * (model.stride || model.width) + x]];
}

// `mask` (optional, full-canvas boolean array) restricts the write to inside
// an active selection — every user-facing place/paint/erase tool passes it;
// internal selection transforms (move/flip/rotate) omit it since they must
// write outside the mask's old position.
export function setPixel(model, x, y, colorHex, mask) {
  if (!inBounds(model, x, y)) return;
  if (mask && !mask[y * model.width + x]) return;
  model.pixels[y * (model.stride || model.width) + x] = colorIndex(model.colors, colorHex);
  touch(model.pixels, x, y);
}

// Change tracking for sprite-file.js's composite cache. Every write to a
// layer buffer bumps its `v` and grows its dirty rectangle (`dirty` =
// [x0, y0, x1, y1], or 'all' when the extent is unknown), so a cached
// composite can tell what, if anything, it must redo. A caller that writes
// `pixels[i]` directly (bypassing setPixel) must call touch(pixels) itself.
export function touch(pixels, x, y) {
  pixels.v = (pixels.v | 0) + 1;
  const d = pixels.dirty;
  if (d === 'all') return;
  if (x === undefined) pixels.dirty = 'all';
  else if (!d) pixels.dirty = [x, y, x, y];
  else {
    if (x < d[0]) d[0] = x;
    if (y < d[1]) d[1] = y;
    if (x > d[2]) d[2] = x;
    if (y > d[3]) d[3] = y;
  }
}

// Whole-array snapshot/diff, used to build one undo EditCommand per committed
// action (a drag-stroke, a fill, a delete) rather than per pixel. Diffs are
// emitted in hex, not indices, so a command stays valid even if the color
// table later changes shape.
export function snapshotPixels(model) {
  return model.pixels.slice();
}

export function diffFromSnapshot(model, snapshot) {
  const stride = model.stride || model.width;
  const before = [], after = [];
  for (let i = 0; i < model.pixels.length; i++) {
    if (model.pixels[i] !== snapshot[i]) {
      const x = i % stride, y = Math.floor(i / stride);
      before.push([x, y, model.colors[snapshot[i]]]);
      after.push([x, y, model.colors[model.pixels[i]]]);
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
// in-place (blendPixel) and to composite layers for display (sprite-file.js).
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
export function blendPixel(model, x, y, colorHex, alpha, mask) {
  if (!inBounds(model, x, y)) return;
  setPixel(model, x, y, blendColors(getPixel(model, x, y), colorHex, alpha), mask);
}

// Antialiased stamp: soft circular brush, alpha falling off from center.
// `size` is the same NxN unit the plain square brush uses (§8) — radius is
// derived from it so both tools share one brush-size value.
export function stampBrush(model, cx, cy, size, colorHex, mask) {
  const r = Math.max(0.5, size / 2);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const alpha = r <= 0.5 ? 1 : Math.max(0, Math.min(1, 1 - d / r));
      blendPixel(model, x, y, colorHex, alpha, mask);
    }
  }
}

// Plain (hard-edged) square brush stamp: 1x1, 2x2, 3x3, and so on.
export function stampSquare(model, cx, cy, size, colorHex, mask) {
  const half = Math.floor(size / 2);
  for (let y = cy - half; y < cy - half + size; y++) {
    for (let x = cx - half; x < cx - half + size; x++) {
      setPixel(model, x, y, colorHex, mask);
    }
  }
}

// Plain (non-antialiased) flood fill: all 4-connected pixels matching the
// clicked pixel's color are replaced outright. `mask` (active selection)
// also bounds the fill's spread, not just which pixels get written — a
// selection is a hard wall the flood can't leak through.
export function floodFill(model, startX, startY, colorHex, antialiased = false, mask) {
  if (!inBounds(model, startX, startY)) return;
  const stride = model.stride || model.width;
  const target = model.pixels[startY * stride + startX];
  if (target === colorIndex(model.colors, colorHex)) return;
  const matches = (x, y) => inBounds(model, x, y) && model.pixels[y * stride + x] === target && (!mask || mask[y * model.width + x]);

  // Flat typed visited/stack, not string-keyed Set/arrays: at 512x512 a
  // fill can touch 262k cells.
  const visited = new Uint8Array(model.width * model.height);
  const stack = [startX, startY];
  const filled = [];
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (!matches(x, y) || visited[y * model.width + x]) continue;
    visited[y * model.width + x] = 1;
    filled.push([x, y]);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  for (const [x, y] of filled) {
    setPixel(model, x, y, colorHex, mask);
  }

  if (antialiased) {
    // Soften the fill's outer boundary: any filled pixel touching a
    // non-matching neighbor gets a partial blend toward that neighbor's
    // original color, approximating an antialiased fill edge.
    for (const [x, y] of filled) {
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (!inBounds(model, nx, ny) || visited[ny * model.width + nx]) continue;
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
