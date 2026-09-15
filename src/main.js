import { createCanvasModel, setPixel } from './canvas-model.js';
import { render } from './renderer.js';
import { createInputController } from './input.js';
import { computeViewport, screenToPixel } from './viewport.js';
import { createPalette } from './palette.js';
import { maskFromRect, fullMask, toRenderSelection } from './selection.js';

const canvas = document.getElementById('pixi-canvas');
const ctx = canvas.getContext('2d');
const paletteBar = document.getElementById('palette-bar');

const model = createCanvasModel(32, 32);

let showGrid = true;
let showRuler = false;
let hoverPixel = null;
let palettePinned = true;
let selectionMask = null;
let selectionRender = null;

const palette = createPalette(paletteBar, () => {});
const colors = { primary: () => palette.getPrimary(), secondary: () => palette.getSecondary() };

const selectionApi = {
  setLiveRect(x0, y0, x1, y1) {
    selectionMask = maskFromRect(model, x0, y0, x1, y1);
    selectionRender = toRenderSelection(model, selectionMask);
  },
  set(mask) {
    selectionMask = mask;
    selectionRender = toRenderSelection(model, mask);
  },
  clear() {
    selectionMask = null;
    selectionRender = null;
  },
};

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw();
}

function draw() {
  render(ctx, model, canvas.clientWidth, canvas.clientHeight, { showGrid, showRuler, hoverPixel, selection: selectionRender });
}

createInputController(canvas, model, colors, draw, selectionApi);

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const viewport = computeViewport(model, rect.width, rect.height);
  hoverPixel = screenToPixel(viewport, e.clientX - rect.left, e.clientY - rect.top);
  if (showRuler) draw();
});

function deleteSelectionOrHover() {
  if (selectionMask) {
    for (let y = 0; y < model.height; y++) {
      for (let x = 0; x < model.width; x++) {
        if (selectionMask[y * model.width + x]) setPixel(model, x, y, null);
      }
    }
  } else if (hoverPixel) {
    setPixel(model, hoverPixel.x, hoverPixel.y, null);
  }
  draw();
}

const DIGIT_INDEX = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '0': 9 };

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' && !e.shiftKey) {
    showGrid = !showGrid;
    draw();
  } else if (e.key === 'G' && e.shiftKey) {
    showRuler = !showRuler;
    draw();
  } else if (e.key === 'p' || e.key === 'P') {
    palettePinned = !palettePinned;
    paletteBar.hidden = !palettePinned;
  } else if (e.key in DIGIT_INDEX) {
    if (e.altKey) palette.setSecondaryByIndex(DIGIT_INDEX[e.key]);
    else palette.setPrimaryByIndex(DIGIT_INDEX[e.key]);
  } else if (e.ctrlKey && e.key === 'a') {
    e.preventDefault();
    selectionApi.set(fullMask(model));
    draw();
  } else if (e.key === 'Escape') {
    selectionApi.clear();
    draw();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    deleteSelectionOrHover();
  }
});

resize();
