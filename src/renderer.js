import { getPixel } from './canvas-model.js';

const CANVAS_BG = '#0A0A0A';
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)';

// Fit-to-window: largest integer pixel scale that keeps the whole model on screen.
function fitScale(model, viewW, viewH) {
  return Math.max(1, Math.floor(Math.min(viewW / model.width, viewH / model.height)));
}

export function render(ctx, model, viewW, viewH, { showGrid }) {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, viewW, viewH);

  const scale = fitScale(model, viewW, viewH);
  const w = model.width * scale;
  const h = model.height * scale;
  const ox = Math.floor((viewW - w) / 2);
  const oy = Math.floor((viewH - h) / 2);

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
}
