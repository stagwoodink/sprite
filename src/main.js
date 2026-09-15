import { setPixel, snapshotPixels, diffFromSnapshot } from './canvas-model.js';
import { render } from './renderer.js';
import { createInputController } from './input.js';
import { computeViewport, screenToPixel } from './viewport.js';
import { createPalette } from './palette.js';
import { maskFromRect, fullMask, toRenderSelection } from './selection.js';
import { commitCommand, undo as undoCmd, redo as redoCmd } from './undo.js';
import { createProject, activeFile as getActiveFile, addFile } from './project.js';
import { activePixels, compositeFrame, resizeCanvas, addLayer, deleteLayer, reorderLayer } from './pixi-file.js';
import { renderProjectPanel } from './project-panel.js';
import { renderLayersPanel } from './layers-panel.js';
import { chooseBackend, loadProject, saveProject, debounce } from './persistence.js';

const canvas = document.getElementById('pixi-canvas');
const ctx = canvas.getContext('2d');
const paletteBar = document.getElementById('palette-bar');
const projectPanel = document.getElementById('project-panel');
const layersPanel = document.getElementById('layers-panel');

// Autosave (§10, §18): every committed change writes to whichever backend
// was resolved (real folder via FSA, or the IndexedDB fallback), debounced
// so a fast drag-stroke doesn't fire one write per pixel.
const backend = await chooseBackend();
const project = (await loadProject(backend)) || createProject('My Project');
const autosave = debounce(() => saveProject(backend, project));
autosave();

// `model` is a stable view object; switching files/layers/frames re-points
// model.pixels at that combination's array in place (same reference the
// PixiFile stores) rather than rebuilding every module that holds `model`.
// stride = the logical canvas width, which can exceed the visible width
// after a shrink (§13.4) — width/height stay the visible (edit/display)
// window, cropped from the top-left of that wider backing array.
const model = { width: 0, height: 0, stride: 0, pixels: null };

function bindActiveFile() {
  const file = getActiveFile(project);
  model.width = file.visibleWidth;
  model.height = file.visibleHeight;
  model.stride = file.canvasWidth;
  model.pixels = activePixels(file);
}
bindActiveFile();

let showGrid = true;
let showRuler = false;
let hoverPixel = null;
let palettePinned = true;
let projectPinned = false;
let layersPinned = false;
let layersPanelFocused = false; // hover-only focus stand-in until Phase 13's real model
let selectionMask = null;
let selectionRender = null;

layersPanel.addEventListener('mouseenter', () => { layersPanelFocused = true; });
layersPanel.addEventListener('mouseleave', () => { layersPanelFocused = false; });

const palette = createPalette(paletteBar, project.palette, () => autosave());
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

// Undo/redo lives on the active PixiFile (§5, §10) — this just resolves it.
const history = {
  commit: (cmd) => { commitCommand(getActiveFile(project), cmd); autosave(); },
};

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw();
}

function draw() {
  // The canvas always shows the composited result of every visible layer
  // (§11), while `model` (the active layer's own raw buffer) is what
  // painting/selection/undo actually mutate.
  const display = { width: model.width, height: model.height, pixels: compositeFrame(getActiveFile(project)) };
  render(ctx, display, canvas.clientWidth, canvas.clientHeight, { showGrid, showRuler, hoverPixel, selection: selectionRender });
  redrawLayersPanel();
}

function redrawProjectPanel() {
  renderProjectPanel(projectPanel, project, {
    onChange: () => { bindActiveFile(); selectionApi.clear(); redrawProjectPanel(); draw(); },
    onAddFile: (w, h) => { addFile(project, `sprite${project.files.length + 1}`, w, h); bindActiveFile(); redrawProjectPanel(); draw(); autosave(); },
    onResizeFile: (file, w, h) => {
      resizeCanvas(file, w, h);
      if (file === getActiveFile(project)) bindActiveFile();
      redrawProjectPanel();
      draw();
      autosave();
    },
  });
}
redrawProjectPanel();

function redrawLayersPanel() {
  const file = getActiveFile(project);
  renderLayersPanel(layersPanel, file, {
    onAddLayer: () => { addLayer(file); bindActiveFile(); draw(); autosave(); },
    onSelect: (i) => { file.activeLayerIndex = i; bindActiveFile(); redrawLayersPanel(); },
    onToggleVisible: (i) => { file.layers[i].visible = !file.layers[i].visible; draw(); autosave(); },
    onDelete: (i) => { deleteLayer(file, i); bindActiveFile(); draw(); autosave(); },
    onReorder: (from, to) => { reorderLayer(file, from, to); draw(); autosave(); },
    onOpenOpacity: (i, anchor) => openOpacitySlider(anchor, file.layers[i], () => { draw(); autosave(); }),
  });
}

function openOpacitySlider(anchor, layer, onChange) {
  document.querySelectorAll('.opacity-popup').forEach((el) => el.remove());
  const popup = document.createElement('div');
  popup.className = 'color-picker-popup opacity-popup';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = Math.round(layer.opacity * 100);
  slider.addEventListener('input', () => { layer.opacity = Number(slider.value) / 100; onChange(); });
  popup.append(slider);
  const rect = anchor.getBoundingClientRect();
  popup.style.left = rect.right + 4 + 'px';
  popup.style.top = rect.top + 'px';
  document.body.append(popup);
  setTimeout(() => window.addEventListener('pointerdown', function onOutside(e) {
    if (!popup.contains(e.target)) { popup.remove(); window.removeEventListener('pointerdown', onOutside); }
  }), 0);
}

createInputController(canvas, model, colors, draw, selectionApi, history);

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const viewport = computeViewport(model, rect.width, rect.height);
  hoverPixel = screenToPixel(viewport, e.clientX - rect.left, e.clientY - rect.top);
  if (showRuler) draw();
});

function deleteSelectionOrHover() {
  const snapshot = snapshotPixels(model);
  if (selectionMask) {
    for (let y = 0; y < model.height; y++) {
      for (let x = 0; x < model.width; x++) {
        if (selectionMask[y * model.width + x]) setPixel(model, x, y, null);
      }
    }
  } else if (hoverPixel) {
    setPixel(model, hoverPixel.x, hoverPixel.y, null);
  }
  const { before, after } = diffFromSnapshot(model, snapshot);
  history.commit({ type: 'pixelEdit', before, after });
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
  } else if (e.key === 'Tab') {
    e.preventDefault();
    projectPinned = !projectPinned;
    projectPanel.hidden = !projectPinned;
  } else if (e.key === 'l' || e.key === 'L') {
    layersPinned = !layersPinned;
    layersPanel.hidden = !layersPinned;
  } else if (layersPanelFocused && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const file = getActiveFile(project);
    const dir = e.key === 'ArrowUp' ? 1 : -1; // panel lists topmost-first, stack index rises upward
    const next = file.activeLayerIndex + dir;
    if (e.shiftKey) reorderLayer(file, file.activeLayerIndex, next);
    else if (next >= 0 && next < file.layers.length) file.activeLayerIndex = next;
    bindActiveFile();
    redrawLayersPanel();
    draw();
    autosave();
  } else if (layersPanelFocused && (e.key === 'Backspace' || e.key === 'Delete')) {
    const file = getActiveFile(project);
    deleteLayer(file, file.activeLayerIndex);
    bindActiveFile();
    draw();
    autosave();
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
  } else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
    e.preventDefault();
    if (undoCmd(getActiveFile(project), model)) { draw(); autosave(); }
  } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
    e.preventDefault();
    if (redoCmd(getActiveFile(project), model)) { draw(); autosave(); }
  }
});

resize();
