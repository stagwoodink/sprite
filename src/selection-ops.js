import { getPixel, setPixel, inBounds } from './canvas-model.js';

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

// Extracts (mask-shaped) content into a clipboard-style {w, h, cells} where
// cells is a sparse list of [dx, dy, color] relative to the bbox's top-left.
export function extract(model, mask) {
  const b = maskBounds(model, mask);
  if (!b) return null;
  const cells = [];
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (!mask[y * model.width + x]) continue;
      const c = getPixel(model, x, y);
      if (c) cells.push([x - b.minX, y - b.minY, c]);
    }
  }
  return { w: b.w, h: b.h, cells };
}

export function stamp(model, clip, atX, atY, replaceMode = true) {
  if (replaceMode) {
    for (let dy = 0; dy < clip.h; dy++) {
      for (let dx = 0; dx < clip.w; dx++) {
        if (inBounds(model, atX + dx, atY + dy)) setPixel(model, atX + dx, atY + dy, null);
      }
    }
  }
  for (const [dx, dy, color] of clip.cells) setPixel(model, atX + dx, atY + dy, color);
}

export function flip(model, mask, axis) {
  const b = maskBounds(model, mask);
  if (!b) return;
  const snapshot = [];
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      if (mask[y * model.width + x]) snapshot.push([x, y, getPixel(model, x, y)]);
    }
  }
  for (const [x, y] of snapshot) {
    setPixel(model, x, y, null);
  }
  for (const [x, y, color] of snapshot) {
    const nx = axis === 'horizontal' ? b.minX + (b.maxX - x) : x;
    const ny = axis === 'vertical' ? b.minY + (b.maxY - y) : y;
    setPixel(model, nx, ny, color);
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
      if (mask[y * model.width + x]) setPixel(model, x, y, null);
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
  const off = document.createElement('canvas');
  off.width = b.w;
  off.height = b.h;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (!mask[(b.minY + y) * model.width + (b.minX + x)]) continue;
      const c = getPixel(model, b.minX + x, b.minY + y);
      if (c) { octx.fillStyle = c; octx.fillRect(x, y, 1, 1); }
    }
  }

  const rotated = document.createElement('canvas');
  rotated.width = b.w;
  rotated.height = b.h;
  const rctx = rotated.getContext('2d');
  rctx.imageSmoothingEnabled = false;
  rctx.translate(b.w / 2, b.h / 2);
  rctx.rotate((degrees * Math.PI) / 180);
  rctx.translate(-b.w / 2, -b.h / 2);
  rctx.drawImage(off, 0, 0);

  const data = rctx.getImageData(0, 0, b.w, b.h).data;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) setPixel(model, x, y, null);
  }
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = (y * b.w + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue;
      const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      setPixel(model, b.minX + x, b.minY + y, hex);
    }
  }
}
