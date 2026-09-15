import { getPixel } from './canvas-model.js';
import { computeViewport } from './viewport.js';

const CANVAS_BG = '#0A0A0A';
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const SELECTION_COLOR = '#BE1425';
const RULER_H = 14;
const RULER_BG = '#1A1A1D';
const RULER_TICK = '#444441';
const RULER_HIGHLIGHT = '#F2F2F0';

export function render(ctx, model, viewW, viewH, { showGrid, showRuler, hoverPixel, selection }) {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, viewW, viewH);

  const { scale, ox, oy } = computeViewport(model, viewW, viewH);
  const w = model.width * scale;
  const h = model.height * scale;

  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      const color = getPixel(model, x, y);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  if (showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= model.width; x++) {
      ctx.moveTo(ox + x * scale + 0.5, oy);
      ctx.lineTo(ox + x * scale + 0.5, oy + h);
    }
    for (let y = 0; y <= model.height; y++) {
      ctx.moveTo(ox, oy + y * scale + 0.5);
      ctx.lineTo(ox + w, oy + y * scale + 0.5);
    }
    ctx.stroke();
  }

  if (showRuler) {
    drawRuler(ctx, model, scale, ox, oy, w, h, hoverPixel);
  }

  if (selection) {
    drawSelection(ctx, selection, scale, ox, oy);
  }
}

function drawSelection(ctx, selection, scale, ox, oy) {
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 2]);
  if (selection.type === 'rect') {
    const { x, y, w, h } = selection;
    ctx.strokeRect(ox + x * scale + 0.5, oy + y * scale + 0.5, w * scale, h * scale);
  } else if (selection.type === 'mask') {
    // Outline every selected pixel's exposed edges (magic wand / polygon results).
    const { width, height, mask } = selection;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[y * width + x]) continue;
        const sx = ox + x * scale, sy = oy + y * scale;
        if (!mask[(y - 1) * width + x]) line(ctx, sx, sy, sx + scale, sy);
        if (!mask[(y + 1) * width + x]) line(ctx, sx, sy + scale, sx + scale, sy + scale);
        if (!mask[y * width + (x - 1)]) line(ctx, sx, sy, sx, sy + scale);
        if (!mask[y * width + (x + 1)]) line(ctx, sx + scale, sy, sx + scale, sy + scale);
      }
    }
  }
  ctx.setLineDash([]);
}

// Top and bottom coordinate rulers (§6), hidden by default, toggled with
// Shift+G. The column/row under the cursor highlights subtly.
function drawRuler(ctx, model, scale, ox, oy, w, h, hoverPixel) {
  ctx.font = '12px m3x6, monospace';
  ctx.textBaseline = 'top';
  for (const ry of [oy - RULER_H, oy + h]) {
    ctx.fillStyle = RULER_BG;
    ctx.fillRect(ox, ry, w, RULER_H);
  }
  for (let x = 0; x < model.width; x++) {
    const isHover = hoverPixel && hoverPixel.x === x;
    ctx.fillStyle = isHover ? RULER_HIGHLIGHT : RULER_TICK;
    ctx.fillRect(ox + x * scale, oy - RULER_H, 1, RULER_H);
    ctx.fillRect(ox + x * scale, oy + h, 1, RULER_H);
    if (x % 10 === 0) {
      ctx.fillText(String(x), ox + x * scale + 2, oy - RULER_H + 2);
      ctx.fillText(String(x), ox + x * scale + 2, oy + h + 2);
    }
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}
