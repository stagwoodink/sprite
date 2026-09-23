import { setPixelIndex, packedTable, colorIndex, packedToHex, inBounds } from './canvas-model.js';

// Acting on a selection (§9.2): flip, rotate, move, copy/cut/paste. All of
// these work on the selection's bounding box within the active layer.
// A mask is never edited after it is built (every change makes a new one),
// so its bounding box is computed once per mask. shiftMask seeds the entry
// for the mask it returns, so a run of arrow-key nudges never rescans.
const boundsCache = new WeakMap(); // mask -> bounds | null
export function maskBounds(model, mask) {
  if (boundsCache.has(mask)) return boundsCache.get(mask);
  let minX = model.width, minY = model.height, maxX = -1, maxY = -1;
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      if (!mask[y * model.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bounds = maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  boundsCache.set(mask, bounds);
  return bounds;
}

// Extracts (mask-shaped) content into a clipboard-style {w, h, cells}, where
// cells is a flat Uint32Array of [offset, packedColor] pairs (offset =
// dy * w + dx from the bbox's top-left, transparent cells omitted). Colours
// are packed RGBA, not table indices, because a clip can be pasted into a
// different file whose colour table numbers things differently.
export function extract(model, mask) {
  const b = maskBounds(model, mask);
  if (!b) return null;
  const stride = model.stride || model.width;
  const table = packedTable(model.colors);
  const cells = new Uint32Array(b.w * b.h * 2);
  let n = 0;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (!mask[y * model.width + x]) continue;
      const idx = model.pixels[y * stride + x];
      if (!idx) continue;
      cells[n++] = (y - b.minY) * b.w + (x - b.minX);
      cells[n++] = table[idx];
    }
  }
  return { w: b.w, h: b.h, cells: cells.slice(0, n) };
}

export function stamp(model, clip, atX, atY, replaceMode = true) {
  if (replaceMode) {
    for (let dy = 0; dy < clip.h; dy++) {
      for (let dx = 0; dx < clip.w; dx++) setPixelIndex(model, atX + dx, atY + dy, 0);
    }
  }
  const indexOf = packedResolver(model.colors);
  for (let k = 0; k < clip.cells.length; k += 2) {
    const at = clip.cells[k];
    setPixelIndex(model, atX + (at % clip.w), atY + ((at / clip.w) | 0), indexOf(clip.cells[k + 1]));
  }
}

// packed colour -> table index, memoised so a transform hashes each
// distinct colour once instead of once per cell.
function packedResolver(colors) {
  const memo = new Map();
  return (packed) => {
    let idx = memo.get(packed);
    if (idx === undefined) memo.set(packed, idx = colorIndex(colors, packedToHex(packed)));
    return idx;
  };
}

export function flip(model, mask, axis) {
  const b = maskBounds(model, mask);
  if (!b) return;
  const stride = model.stride || model.width;
  // Flat [x, y, colorIndex] triples; transparent cells are kept on purpose,
  // they overwrite their destination like any other selected cell.
  const cells = new Uint32Array(b.w * b.h * 3);
  let n = 0;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (!mask[y * model.width + x]) continue;
      cells[n++] = x; cells[n++] = y; cells[n++] = model.pixels[y * stride + x];
    }
  }
  for (let k = 0; k < n; k += 3) setPixelIndex(model, cells[k], cells[k + 1], 0);
  for (let k = 0; k < n; k += 3) {
    const x = cells[k], y = cells[k + 1];
    const nx = axis === 'horizontal' ? b.minX + (b.maxX - x) : x;
    const ny = axis === 'vertical' ? b.minY + (b.maxY - y) : y;
    setPixelIndex(model, nx, ny, cells[k + 2]);
  }
}

// Moves the mask itself (Shift+Arrows) without touching pixel content.
export function shiftMask(model, mask, dx, dy) {
  const next = new Uint8Array(mask.length);
  const b = maskBounds(model, mask);
  if (!b) return next;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (!mask[y * model.width + x]) continue;
      const nx = x + dx, ny = y + dy;
      if (inBounds(model, nx, ny)) next[ny * model.width + nx] = 1;
    }
  }
  // Only exact while nothing was clipped; otherwise the box is rescanned lazily.
  if (b.minX + dx >= 0 && b.minY + dy >= 0 && b.maxX + dx < model.width && b.maxY + dy < model.height) {
    boundsCache.set(next, { ...b, minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY + dy, maxY: b.maxY + dy });
  }
  return next;
}

// Moves the selected pixel content along with the mask (Shift+Ctrl+Arrows/Drag).
export function moveContent(model, mask, dx, dy) {
  const clip = extract(model, mask);
  if (!clip) return mask;
  const b = maskBounds(model, mask);
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (mask[y * model.width + x]) setPixelIndex(model, x, y, 0);
    }
  }
  stamp(model, clip, b.minX + dx, b.minY + dy, false);
  return shiftMask(model, mask, dx, dy);
}

// Rotation via an offscreen canvas (nearest-neighbor, no smoothing) so
// pixel-art edges stay hard. Content outside the original bbox after
// rotating is clipped rather than growing the selection.
export function rotate(model, mask, degrees) {
  const b = maskBounds(model, mask);
  if (!b) return;
  // The bbox goes to the canvas as one ImageData blit, like the renderer.
  const off = document.createElement('canvas');
  off.width = b.w;
  off.height = b.h;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  const stride = model.stride || model.width;
  const table = packedTable(model.colors);
  const src = new ImageData(b.w, b.h);
  const words = new Uint32Array(src.data.buffer);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (mask[(b.minY + y) * model.width + (b.minX + x)]) words[y * b.w + x] = table[model.pixels[(b.minY + y) * stride + b.minX + x]];
    }
  }
  octx.putImageData(src, 0, 0);

  const rotated = document.createElement('canvas');
  rotated.width = b.w;
  rotated.height = b.h;
  const rctx = rotated.getContext('2d');
  rctx.imageSmoothingEnabled = false;
  rctx.translate(b.w / 2, b.h / 2);
  rctx.rotate((degrees * Math.PI) / 180);
  rctx.translate(-b.w / 2, -b.h / 2);
  rctx.drawImage(off, 0, 0);

  const out = new Uint32Array(rctx.getImageData(0, 0, b.w, b.h).data.buffer);
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) setPixelIndex(model, x, y, 0);
  }
  const indexOf = packedResolver(model.colors);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const word = out[y * b.w + x];
      if (word >>> 24 === 0) continue;
      setPixelIndex(model, b.minX + x, b.minY + y, indexOf(word));
    }
  }
}
