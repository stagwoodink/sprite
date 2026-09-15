import { createCanvasModel } from './canvas-model.js';
import { render } from './renderer.js';
import { createInputController } from './input.js';
import { computeViewport, screenToPixel } from './viewport.js';

const canvas = document.getElementById('pixi-canvas');
const ctx = canvas.getContext('2d');

const model = createCanvasModel(32, 32);

let showGrid = true;
let showRuler = false;
let hoverPixel = null;
// Palette (Phase 3) will replace these with real chip-driven state.
const colors = { primary: () => '#BE1425', secondary: () => '#F2F2F0' };

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw();
}

function draw() {
  render(ctx, model, canvas.clientWidth, canvas.clientHeight, { showGrid, showRuler, hoverPixel, selection: null });
}

createInputController(canvas, model, colors, draw);

canvas.addEventListener('pointermove', (e) => {
  if (!showRuler) return;
  const rect = canvas.getBoundingClientRect();
  const viewport = computeViewport(model, rect.width, rect.height);
  hoverPixel = screenToPixel(viewport, e.clientX - rect.left, e.clientY - rect.top);
  draw();
});

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' && !e.shiftKey) {
    showGrid = !showGrid;
    draw();
  }
  if (e.key === 'G' && e.shiftKey) {
    showRuler = !showRuler;
    draw();
  }
});

resize();
