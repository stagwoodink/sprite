import { createSpriteFile, addFrame, addLayer } from './sprite-file.js';
import { colorIndex, hexToRgb } from './canvas-model.js';

export const MAX_CELL = 512;

// [start, length] of each run of occupied entries.
function runs(occupied) {
  const out = [];
  for (let i = 0; i < occupied.length; i++) {
    if (!occupied[i]) continue;
    if (out.length && out[out.length - 1][0] + out[out.length - 1][1] === i) out[out.length - 1][1]++;
    else out.push([i, 1]);
  }
  return out;
}

// Finds the grid by scanning for fully-transparent rows and columns: the
// occupied runs between them are the cells. Returns { cellW, cellH, margin,
// spacing } or null when the sheet isn't evenly gridded that way (cells of
// differing size, different margin/spacing per axis, a single cell, or no
// transparent gutters at all) — the caller then asks the user.
export function detectGrid(data, w, h) {
  const cols = new Uint8Array(w), rows = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= 128) { cols[x] = 1; rows[y] = 1; }
    }
  }
  const axis = (occupied) => {
    const r = runs(occupied);
    if (!r.length || r.some(([, len]) => len !== r[0][1])) return null;
    const gaps = r.slice(1).map(([start], i) => start - (r[i][0] + r[i][1]));
    if (gaps.some((g) => g !== gaps[0])) return null;
    return { start: r[0][0], size: r[0][1], gap: gaps[0] ?? 0, count: r.length };
  };
  const x = axis(cols), y = axis(rows);
  if (!x || !y || x.count * y.count < 2) return null;
  if (x.start !== y.start || (x.count > 1 && y.count > 1 && x.gap !== y.gap)) return null;
  return { cellW: x.size, cellH: y.size, margin: x.start, spacing: x.count > 1 ? x.gap : y.gap };
}

// Builds a new SpriteFile from the sheet's cells — as Frames (one Layer, a
// Frame per cell) or Layers (one Frame, a Layer per cell). Pixels snap to
// `chips` by nearest RGB rather than extracting a new palette: extraction is
// its own explicit act, and importing must not repaint anything else.
// Trailing empty cells are dropped. Throws if the grid yields no cells.
export function buildSheetFile(name, image, { cellW, cellH, margin, spacing }, mode, chips) {
  const { data, width: w, height: h } = image;
  if (cellW < 1 || cellH < 1 || cellW > MAX_CELL || cellH > MAX_CELL) throw new Error(`Cell size must be 1 to ${MAX_CELL}px`);
  const cols = Math.floor((w - margin + spacing) / (cellW + spacing));
  const rowCount = Math.floor((h - margin + spacing) / (cellH + spacing));
  if (cols < 1 || rowCount < 1) throw new Error('That grid doesn\'t fit inside the image');

  const file = createSpriteFile(name, cellW, cellH);
  const chipIndex = chips.map((hex) => colorIndex(file.colors, hex));
  const chipRgb = chips.map(hexToRgb);
  const snapped = new Map(); // packed rgb -> chip table index
  const snap = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let i = snapped.get(key);
    if (i === undefined) {
      let best = 0, bestD = Infinity;
      chipRgb.forEach((c, k) => {
        const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      i = chipIndex[best];
      snapped.set(key, i);
    }
    return i;
  };

  const cells = [];
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < cols; col++) {
      const buf = new Uint16Array(cellW * cellH);
      let filled = false;
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const p = ((margin + row * (cellH + spacing) + y) * w + margin + col * (cellW + spacing) + x) * 4;
          if (data[p + 3] < 128) continue;
          buf[y * cellW + x] = snap(data[p], data[p + 1], data[p + 2]);
          filled = true;
        }
      }
      cells.push({ buf, filled });
    }
  }
  while (cells.length && !cells[cells.length - 1].filled) cells.pop();
  if (!cells.length) throw new Error('No pixels found in that grid');

  cells.forEach((cell, i) => {
    if (mode === 'layers') {
      if (i > 0) addLayer(file);
      file.frames[0].layerPixels[i] = cell.buf;
    } else {
      if (i > 0) addFrame(file);
      file.frames[i].layerPixels[0] = cell.buf;
    }
  });
  file.activeFrameIndex = 0;
  file.activeLayerIndex = file.layers.length - 1;
  return file;
}
