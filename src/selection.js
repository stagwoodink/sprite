import { getPixel, inBounds } from './canvas-model.js';

// Selections are always normalized to a full-canvas boolean mask so every
// later selection operation (flip/rotate/move/delete, Phase 12) has one
// shape to deal with, regardless of which of the three modes created it.
export function emptyMask(model) {
  return new Uint8Array(model.width * model.height);
}

export function maskFromRect(model, x0, y0, x1, y1) {
  const mask = emptyMask(model);
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(model.width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(model.height - 1, Math.max(y0, y1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) mask[y * model.width + x] = 1;
  }
  return mask;
}

// Magic wand (Shift+Alt): contiguous same-color region from the clicked pixel.
export function maskFromWand(model, startX, startY) {
  const mask = emptyMask(model);
  if (!inBounds(model, startX, startY)) return mask;
  const w = model.width, h = model.height, stride = model.stride || w;
  // Compared by colour-table index (the table is interned, so equal index
  // means equal colour) with a flat stack; the mask doubles as the visited
  // set, and marking on push bounds the stack at w*h.
  const target = model.pixels[startY * stride + startX];
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (x, y) => {
    const i = y * w + x;
    if (mask[i] || model.pixels[y * stride + x] !== target) return;
    mask[i] = 1;
    stack[sp++] = i;
  };
  push(startX, startY);
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i / w) | 0;
    if (x + 1 < w) push(x + 1, y);
    if (x > 0) push(x - 1, y);
    if (y + 1 < h) push(x, y + 1);
    if (y > 0) push(x, y - 1);
  }
  return mask;
}

// Polygonal selector (Shift+Ctrl): even-odd scanline fill of the closed
// point path, in pixel-corner coordinates.
export function maskFromPolygon(model, points) {
  const mask = emptyMask(model);
  if (points.length < 3) return mask;
  for (let y = 0; y < model.height; y++) {
    const py = y + 0.5;
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= py && y2 > py) || (y2 <= py && y1 > py)) {
        xs.push(x1 + ((py - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i += 2) {
      const xStart = Math.max(0, Math.ceil(xs[i]));
      const xEnd = Math.min(model.width - 1, Math.floor(xs[i + 1] ?? xs[i]));
      for (let x = xStart; x <= xEnd; x++) mask[y * model.width + x] = 1;
    }
  }
  return mask;
}

// Every pixel matching a color, anywhere on the layer: not just one
// contiguous region (that's the magic wand). Triggered by Shift+clicking a
// palette chip.
export function maskFromColor(model, colorHex) {
  const mask = emptyMask(model);
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      if (getPixel(model, x, y) === colorHex) mask[y * model.width + x] = 1;
    }
  }
  return mask;
}

export function fullMask(model) {
  return emptyMask(model).fill(1);
}

export function toRenderSelection(model, mask) {
  if (!mask) return null;
  return { width: model.width, height: model.height, mask };
}
