import { createCanvasModel, setPixel } from './canvas-model.js';
import { render } from './renderer.js';

const canvas = document.getElementById('pixi-canvas');
const ctx = canvas.getContext('2d');

const model = createCanvasModel(32, 32);
setPixel(model, 0, 0, '#BE1425'); // visible placeholder pixel until drawing lands (Phase 2)

let showGrid = true;

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw();
}

function draw() {
  render(ctx, model, canvas.clientWidth, canvas.clientHeight, { showGrid });
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    showGrid = !showGrid;
    draw();
  }
});

resize();
