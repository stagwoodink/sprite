import { getPixel, blendColors } from './canvas-model.js';
import { computeViewport } from './viewport.js';

const CANVAS_BG = '#121214'; // bg-base — same family as the panel bg-elevated, just darker
const CHECKER_LIGHT = '#DEDEDE';
const CHECKER_DARK = '#CFCFCF';
const CHECKER_CELL = 4; // canvas pixels per checker square — an 8x8 sprite reads as a 2x2 checkerboard
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const SELECTION_COLOR = '#BE1425';
const RULER_H = 14;
const RULER_BG = '#1A1A1D';
const RULER_TICK = '#444441';
const RULER_HIGHLIGHT = '#F2F2F0';
const ONION_BEFORE_TINT = '#BE1425';
const ONION_AFTER_TINT = '#3366FF';

export function render(ctx, model, viewW, viewH, { showGrid, showRuler, hoverPixel, selection, onionFrames, brushCursor, cursorPos }) {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, viewW, viewH);

  const { scale, ox, oy } = computeViewport(model, viewW, viewH);
  const w = model.width * scale;
  const h = model.height * scale;

  drawCheckerboard(ctx, model, scale, ox, oy);

  if (onionFrames) {
    for (const ghost of onionFrames) drawGhost(ctx, model, ghost, scale, ox, oy);
  }

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

  if (brushCursor && cursorPos) {
    drawBrushCursor(ctx, cursorPos, brushCursor, scale, ox, oy);
  }
}

// Always-visible brush cursor: painted with a "difference" blend so it
// inverts whatever color is beneath it, rather than a fixed color that
// could vanish against a similar background. `pos` is fractional (the
// eased/trailing display position, not necessarily the exact hovered
// pixel) — main.js's animation loop owns that easing, this just draws
// wherever it's told.
function drawBrushCursor(ctx, pos, { mode, size }, scale, ox, oy) {
  if (mode !== 'paint' && mode !== 'antialiasedPaint') return;
  ctx.save();
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = '#FFFFFF';
  if (mode === 'antialiasedPaint') {
    const r = Math.max(0.5, size / 2);
    ctx.beginPath();
    ctx.arc(ox + (pos.x + 0.5) * scale, oy + (pos.y + 0.5) * scale, r * scale, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const half = Math.floor(size / 2);
    ctx.fillRect(ox + (pos.x - half) * scale, oy + (pos.y - half) * scale, size * scale, size * scale);
  }
  ctx.restore();
}

// Transparency checkerboard under the sprite, sized so the checker density
// itself signals resolution: a fixed 4-canvas-pixel cell means an 8x8 sprite
// reads as a 2x2 checkerboard, 16x16 as 4x4, and so on as the canvas grows.
function drawCheckerboard(ctx, model, scale, ox, oy) {
  for (let cy = 0, gy = 0; cy < model.height; cy += CHECKER_CELL, gy++) {
    const cellH = Math.min(CHECKER_CELL, model.height - cy) * scale;
    for (let cx = 0, gx = 0; cx < model.width; cx += CHECKER_CELL, gx++) {
      const cellW = Math.min(CHECKER_CELL, model.width - cx) * scale;
      ctx.fillStyle = (gx + gy) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
      ctx.fillRect(ox + cx * scale, oy + cy * scale, cellW, cellH);
    }
  }
}

// Onion skinning (§12.3): ghost frames tint toward red (before) or blue
// (after) with opacity falling off by distance, fixed range 2 in each
// direction — no range control exists in the UI.
function drawGhost(ctx, model, ghost, scale, ox, oy) {
  const tint = ghost.side === 'before' ? ONION_BEFORE_TINT : ONION_AFTER_TINT;
  const alpha = ghost.distance === 1 ? 0.35 : 0.18;
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      const color = ghost.pixels[y * model.width + x];
      if (!color) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = blendColors(color, tint, 0.5);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  ctx.globalAlpha = 1;
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
