import { setPixel, snapshotPixels, diffFromSnapshot } from './canvas-model.js';
import { render } from './renderer.js';
import { createInputController } from './input.js';
import { computeViewport, screenToPixel, maxZoomScale, fitScale } from './viewport.js';
import { viewState, resetView } from './view-state.js';
import { createPalette } from './palette.js';
import { maskFromRect, maskFromColor, fullMask, toRenderSelection } from './selection.js';
import { extract, stamp, flip, rotate, shiftMask, moveContent, maskBounds } from './selection-ops.js';
import { commitCommand, undo as undoCmd, redo as redoCmd } from './undo.js';
import { createProject, activeFile as getActiveFile, addFile } from './project.js';
import {
  activePixels, compositeFrame, resizeCanvas, addLayer, deleteLayer, reorderLayer,
  addFrame, deleteFrame, duplicateFrame, reorderFrame, ghostSource,
} from './pixi-file.js';
import { renderProjectPanel } from './project-panel.js';
import { renderLayersPanel } from './layers-panel.js';
import { renderTimelinePanel } from './timeline-panel.js';
import { chooseBackend, loadProject, saveProject, debounce } from './persistence.js';
import { createRevealablePanel } from './panel-reveal.js';
import { createKeybindHelp } from './keybind-help.js';
import { openExportBar } from './export-bar.js';

const canvas = document.getElementById('pixi-canvas');
const ctx = canvas.getContext('2d');
const paletteBar = document.getElementById('palette-bar');
const projectPanel = document.getElementById('project-panel');
const layersPanel = document.getElementById('layers-panel');
const timelineBar = document.getElementById('timeline-bar');

// Timeline (top) and Palette (bottom) both shrink horizontally to clear
// whichever side panel is open, rather than staying full width and
// pushing anything — side panels just run the full viewport height.
const SIDE_PANEL_WIDTH = 220;

let projectReveal, layersReveal, timelineReveal, paletteReveal;
function updatePushes() {
  const pushedLeft = !!(projectReveal && projectReveal.isFocused());
  const pushedRight = !!(layersReveal && layersReveal.isFocused());
  const leftPush = pushedLeft ? SIDE_PANEL_WIDTH : 0;
  const rightPush = pushedRight ? SIDE_PANEL_WIDTH : 0;
  for (const el of [timelineBar, paletteBar]) {
    el.style.setProperty('--push-left', leftPush + 'px');
    el.style.setProperty('--push-right', rightPush + 'px');
    // Dark shadow line where an open side panel butts against this edge —
    // shows the side panel stacking in front of it (§ panel-edge treatment).
    el.classList.toggle('pushed-left', pushedLeft);
    el.classList.toggle('pushed-right', pushedRight);
  }
}

// Shared reveal/hide/pin/focus mechanic (§15), one instance per panel.
// Palette starts pinned (visible) by default (§7.2 flagged assumption 3).
projectReveal = createRevealablePanel(projectPanel, document.getElementById('project-trigger'), { onVisibility: updatePushes });
layersReveal = createRevealablePanel(layersPanel, document.getElementById('layers-trigger'), { onVisibility: updatePushes });
timelineReveal = createRevealablePanel(timelineBar, document.getElementById('timeline-trigger'), { onVisibility: updatePushes });
paletteReveal = createRevealablePanel(paletteBar, document.getElementById('palette-trigger'), { initiallyPinned: true, onVisibility: updatePushes });
updatePushes(); // final pass — the four constructions above ran with partial info
const keybindHelp = createKeybindHelp();

// Shift+Tab: pin/unpin every panel at once (not in the spec — added on
// request). A plain toggle on whether *any* panel is currently pinned —
// the earlier stash-and-restore-exact-prior-state version was a no-op
// whenever nothing happened to be pinned yet, which read as broken.
function toggleHideAllPanels() {
  const reveals = [projectReveal, layersReveal, timelineReveal, paletteReveal];
  const anyPinned = reveals.some((r) => r.isPinned());
  for (const r of reveals) {
    if (anyPinned) r.forceHide();
    else r.setPinned(true);
  }
}

// Autosave (§10, §18): every committed change writes to whichever backend
// was resolved (real folder via FSA, or the IndexedDB fallback), debounced
// so a fast drag-stroke doesn't fire one write per pixel. IndexedDB is
// unavailable in some contexts (a file:// origin, private browsing) — fall
// back to an in-memory no-op backend rather than taking the whole app down,
// since losing autosave is much better than losing the app.
let backend, project;
try {
  backend = await chooseBackend();
  project = (await loadProject(backend)) || createProject('My Project');
} catch (err) {
  console.error('Storage backend unavailable, autosave disabled:', err);
  backend = { write: async () => {}, read: async () => null, delete: async () => {}, list: async () => [] };
  project = createProject('My Project');
}
const autosave = debounce(() => saveProject(backend, project).catch((err) => console.error('Autosave failed:', err)));
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

let inputController = null;
let showGrid = true;
let showRuler = false;
let hoverPixel = null;
let selectionMask = null;
let selectionRender = null;
let clipboard = null;
let rotating = null; // { snapshot, center } while R is held
const playback = { fps: 8, onionSkin: false, onionLayerOnly: false, playing: false, timer: null };

// Fixed range: 2 frames each direction, not user-configurable (§12.3).
const ONION_RANGE = 2;
function computeOnionFrames(file) {
  if (!playback.onionSkin) return null;
  const ghosts = [];
  for (let d = 1; d <= ONION_RANGE; d++) {
    if (file.activeFrameIndex - d >= 0) {
      ghosts.push({ side: 'before', distance: d, pixels: ghostSource(file, file.activeFrameIndex - d, playback.onionLayerOnly) });
    }
    if (file.activeFrameIndex + d < file.frames.length) {
      ghosts.push({ side: 'after', distance: d, pixels: ghostSource(file, file.activeFrameIndex + d, playback.onionLayerOnly) });
    }
  }
  return ghosts;
}


const palette = createPalette(paletteBar, project.palette, () => autosave(), (hex) => {
  selectionApi.set(maskFromColor(model, hex));
  draw();
});
const colors = { primary: () => palette.getPrimary(), secondary: () => palette.getSecondary() };

let contentDragSnapshot = null;
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
  getMask: () => selectionMask,
  moveContentBy(dx, dy) {
    if (!contentDragSnapshot) contentDragSnapshot = snapshotPixels(model);
    selectionMask = moveContent(model, selectionMask, dx, dy);
    selectionRender = toRenderSelection(model, selectionMask);
    renderCanvas(); // live drag feedback only; commitContentMove does the full refresh
  },
  commitContentMove() {
    if (!contentDragSnapshot) return;
    const { before, after } = diffFromSnapshot(model, contentDragSnapshot);
    history.commit({ type: 'moveSelectionContent', before, after });
    contentDragSnapshot = null;
  },
};

// Undo/redo lives on the active PixiFile (§5, §10) — this just resolves it.
const history = {
  // Full refresh (thumbnails included) once per committed edit — not per
  // animation frame or per pointermove, which is what made this laggy
  // before (see the animateCursor comment further down).
  commit: (cmd) => { commitCommand(getActiveFile(project), cmd); autosave(); draw(); },
};

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw();
}

// Retro trailing brush cursor: the on-canvas cursor indicator eases toward
// the real pointer position instead of snapping to it instantly. This was
// originally an accidental side effect of an expensive per-move redraw
// (rebuilding the layers/timeline panels on every pointermove) — that was a
// real perf bug, fixed by splitting the cheap per-frame canvas render
// (renderCanvas) from the expensive full refresh (draw, panels included,
// now only called once per committed action via history.commit). This is
// that same trailing look recreated on purpose, driven by a steady
// animation loop rather than dropped frames, so it looks the same at any
// frame rate and the amount of lag is one number to tune.
const CURSOR_TRAIL_EASE = 0.35; // 1 = no lag (snaps instantly), lower = laggier/more retro
let displayCursorPos = null;

function renderCanvas() {
  // The canvas always shows the composited result of every visible layer
  // (§11), while `model` (the active layer's own raw buffer) is what
  // painting/selection/undo actually mutate.
  const file = getActiveFile(project);
  const display = { width: model.width, height: model.height, pixels: compositeFrame(file) };
  const onionFrames = computeOnionFrames(file);
  const brushCursor = inputController && { mode: inputController.getMode(), size: inputController.getBrushSize() };
  render(ctx, display, canvas.clientWidth, canvas.clientHeight, {
    showGrid, showRuler, hoverPixel, selection: selectionRender, onionFrames, brushCursor, cursorPos: displayCursorPos,
  });
}

function draw() {
  // Full refresh: cheap canvas render plus the layers/timeline panel
  // rebuilds (thumbnails etc.) — only called once per committed action
  // (see history.commit below), not per animation frame or per pointermove.
  renderCanvas();
  redrawLayersPanel();
  redrawTimelinePanel();
}

(function animateCursor() {
  if (hoverPixel) {
    if (!displayCursorPos) displayCursorPos = { x: hoverPixel.x, y: hoverPixel.y };
    displayCursorPos.x += (hoverPixel.x - displayCursorPos.x) * CURSOR_TRAIL_EASE;
    displayCursorPos.y += (hoverPixel.y - displayCursorPos.y) * CURSOR_TRAIL_EASE;
  } else {
    displayCursorPos = null;
  }
  renderCanvas();
  requestAnimationFrame(animateCursor);
})();

function redrawProjectPanel() {
  renderProjectPanel(projectPanel, project, {
    onChange: () => { bindActiveFile(); resetView(); selectionApi.clear(); redrawProjectPanel(); draw(); },
    onAddFile: (w, h) => {
      addFile(project, `sprite${project.files.length + 1}`, w, h);
      // New file defaults to PICO-8, unless it's the Game Boy DMG screen
      // size specifically, which defaults to the Game Boy palette instead.
      palette.loadPreset(w === 160 && h === 144 ? 'dmg' : 'pico8');
      bindActiveFile();
      resetView();
      redrawProjectPanel();
      draw();
      autosave();
    },
    onResizeFile: (file, w, h) => {
      resizeCanvas(file, w, h);
      if (file === getActiveFile(project)) { bindActiveFile(); resetView(); }
      redrawProjectPanel();
      draw();
      autosave();
    },
    onExport: () => openExport(),
  });
}
redrawProjectPanel();

// E (§14): reveals the Project panel if hidden, then opens the export
// context bar beside the currently selected file's row.
function openExport() {
  projectReveal.setPinned(true);
  const anchor = projectPanel.querySelector('.file-row.active') || projectPanel;
  openExportBar(anchor, getActiveFile(project), colors.secondary);
}

function redrawLayersPanel() {
  const file = getActiveFile(project);
  renderLayersPanel(layersPanel, file, {
    onAddLayer: () => { addLayer(file); bindActiveFile(); draw(); autosave(); },
    onSelect: (i) => { file.activeLayerIndex = i; bindActiveFile(); redrawLayersPanel(); },
    onToggleVisible: (i) => { file.layers[i].visible = !file.layers[i].visible; draw(); autosave(); },
    onDelete: (i) => { deleteLayer(file, i); bindActiveFile(); draw(); autosave(); },
    onReorder: (from, to) => { reorderLayer(file, from, to); draw(); autosave(); },
    // Live drag feedback is cheap (canvas only); autosave/thumbnail
    // refresh happens once when the drag ends, not on every tick.
    onOpacityChange: (i, value) => { file.layers[i].opacity = value; renderCanvas(); },
    onOpacityCommit: () => { redrawLayersPanel(); autosave(); },
  });
}

function redrawTimelinePanel() {
  const file = getActiveFile(project);
  renderTimelinePanel(timelineBar, file, playback, {
    onSetFps: (fps) => { playback.fps = fps; if (playback.playing) startPlayback(); },
    onToggleOnion: () => { playback.onionSkin = !playback.onionSkin; draw(); },
    onToggleOnionSource: () => { playback.onionLayerOnly = !playback.onionLayerOnly; draw(); },
    onSelect: (i) => { file.activeFrameIndex = i; bindActiveFile(); draw(); }, // selection persists across frame switches (§9.3)
    onAddFrame: () => { addFrame(file); bindActiveFile(); draw(); autosave(); },
    onInsertFrame: (i) => { addFrame(file, i); bindActiveFile(); draw(); autosave(); },
    onDelete: (i) => { deleteFrame(file, i); bindActiveFile(); draw(); autosave(); },
    onReorder: (from, to) => { reorderFrame(file, from, to); draw(); autosave(); },
  });
}

function stepFrame(dir) {
  const file = getActiveFile(project);
  const next = (file.activeFrameIndex + dir + file.frames.length) % file.frames.length;
  file.activeFrameIndex = next;
  bindActiveFile(); // selection persists across frame switches (§9.3)
  draw();
}

function startPlayback() {
  clearInterval(playback.timer);
  playback.timer = setInterval(() => stepFrame(1), 1000 / playback.fps);
}

function togglePlayback() {
  playback.playing = !playback.playing;
  if (playback.playing) startPlayback();
  else clearInterval(playback.timer);
}

inputController = createInputController(canvas, model, colors, renderCanvas, selectionApi, history);

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const viewport = computeViewport(model, rect.width, rect.height);
  hoverPixel = screenToPixel(viewport, e.clientX - rect.left, e.clientY - rect.top);
  if (rotating) updateRotate(hoverPixel.x, hoverPixel.y, e.shiftKey);
  // No render call here — the animateCursor loop already redraws every
  // frame and picks up the new hoverPixel on its own; forcing a full
  // draw() per pointermove was the original (expensive) cause of the
  // cursor lag this replaced.
});
canvas.addEventListener('pointerleave', () => { hoverPixel = null; });

// Scroll wheel zooms (§6). Scale is snapped to whole numbers — the spec
// calls for continuous zoom, but a fractional scale would leave subpixel
// seams between adjacent pixel rects, breaking "pixels always render
// perfectly square." Integer-only zoom is the pixel-safe simplification.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const fit = fitScale(model, rect.width, rect.height);
  const max = maxZoomScale(rect.width, rect.height);
  const current = viewState.zoom || fit;
  const next = current + (e.deltaY < 0 ? 1 : -1);
  viewState.zoom = Math.max(fit, Math.min(max, next));
  if (viewState.zoom === fit) { viewState.panX = 0; viewState.panY = 0; }
  draw();
}, { passive: false });

function doCopy() {
  const mask = selectionMask || (hoverPixel && (() => {
    const m = new Uint8Array(model.width * model.height);
    if (inBoundsPixel(hoverPixel)) m[hoverPixel.y * model.width + hoverPixel.x] = 1;
    return m;
  })());
  if (mask) clipboard = extract(model, mask);
}

function inBoundsPixel(p) {
  return p.x >= 0 && p.y >= 0 && p.x < model.width && p.y < model.height;
}

function doCut() {
  doCopy();
  deleteSelectionOrHover();
}

function doPaste() {
  if (!clipboard) return;
  const at = hoverPixel || { x: 0, y: 0 };
  const snapshot = snapshotPixels(model);
  stamp(model, clipboard, at.x, at.y, false);
  const { before, after } = diffFromSnapshot(model, snapshot);
  history.commit({ type: 'pixelEdit', before, after }); // triggers the full refresh
}

function doFlip(axis) {
  if (!selectionMask) return; // requires an active selection (§9.2)
  const snapshot = snapshotPixels(model);
  flip(model, selectionMask, axis);
  const { before, after } = diffFromSnapshot(model, snapshot);
  history.commit({ type: 'flip', layer: getActiveFile(project).activeLayerIndex, axis, before, after });
}

function moveSelection(dx, dy, moveContentToo) {
  if (!selectionMask) return;
  if (moveContentToo) {
    const snapshot = snapshotPixels(model);
    selectionMask = moveContent(model, selectionMask, dx, dy);
    selectionRender = toRenderSelection(model, selectionMask);
    const { before, after } = diffFromSnapshot(model, snapshot);
    history.commit({ type: 'moveSelectionContent', dx, dy, before, after }); // triggers the full refresh
  } else {
    selectionMask = shiftMask(model, selectionMask, dx, dy);
    selectionRender = toRenderSelection(model, selectionMask);
    renderCanvas(); // boundary-only move: no committed edit, just a cheap redraw
  }
}

function beginRotate() {
  if (!selectionMask || rotating) return;
  const b = maskBounds(model, selectionMask);
  if (!b) return;
  rotating = {
    snapshot: snapshotPixels(model),
    center: { x: b.minX + b.w / 2, y: b.minY + b.h / 2 },
    angle: 0,
  };
}

// Re-applies the rotation to the *original* content on every move (rather
// than compounding a small rotation onto an already-rotated, lossy result)
// by restoring the pristine snapshot in place before each rotate() call.
function updateRotate(px, py, snap) {
  if (!rotating) return;
  let angle = (Math.atan2(py - rotating.center.y, px - rotating.center.x) * 180) / Math.PI;
  if (snap) angle = Math.round(angle / 15) * 15;
  rotating.angle = angle;
  for (let i = 0; i < model.pixels.length; i++) model.pixels[i] = rotating.snapshot[i];
  rotate(model, selectionMask, angle);
  renderCanvas(); // live drag feedback only; endRotate does the full refresh
}

function endRotate() {
  if (!rotating) return;
  const { before, after } = diffFromSnapshot(model, rotating.snapshot);
  history.commit({ type: 'rotate', degrees: rotating.angle, before, after }); // triggers the full refresh
  rotating = null;
}

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
  // Text fields (rename, hex, FPS) handle their own keys — don't let global
  // single-letter/arrow shortcuts fight typing in them.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (keybindHelp.isOpen()) {
    if (e.key === '?' || e.key === 'Escape') { e.preventDefault(); keybindHelp.close(); }
    return; // swallow every other shortcut while the help is up
  }
  if (e.key === '?') {
    keybindHelp.toggle();
  } else if (e.key === 'g' && !e.shiftKey) {
    showGrid = !showGrid;
    draw();
  } else if (e.key === 'G' && e.shiftKey) {
    showRuler = !showRuler;
    draw();
  } else if (!e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
    paletteReveal.togglePin();
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    toggleHideAllPanels();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    projectReveal.togglePin();
  } else if (e.key === 'l' || e.key === 'L') {
    layersReveal.togglePin();
  } else if (layersReveal.isFocused() && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
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
  } else if (layersReveal.isFocused() && (e.key === 'Backspace' || e.key === 'Delete')) {
    const file = getActiveFile(project);
    deleteLayer(file, file.activeLayerIndex);
    bindActiveFile();
    draw();
    autosave();
  } else if (e.key === 'e' || e.key === 'E') {
    openExport();
  } else if (e.key === 't' || e.key === 'T') {
    timelineReveal.togglePin();
  } else if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  } else if (timelineReveal.isFocused() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    const file = getActiveFile(project);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (e.shiftKey) {
      const next = file.activeFrameIndex + dir;
      reorderFrame(file, file.activeFrameIndex, next);
      bindActiveFile();
    } else {
      stepFrame(dir);
    }
    draw();
    autosave();
  } else if (timelineReveal.isFocused() && e.key === '+') {
    const file = getActiveFile(project);
    if (e.ctrlKey) duplicateFrame(file, file.activeFrameIndex);
    else addFrame(file);
    bindActiveFile();
    draw();
    autosave();
  } else if (timelineReveal.isFocused() && (e.key === 'Backspace' || e.key === 'Delete')) {
    const file = getActiveFile(project);
    deleteFrame(file, file.activeFrameIndex);
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
  } else if (e.ctrlKey && e.key === 'c') {
    doCopy();
  } else if (e.ctrlKey && e.key === 'x') {
    e.preventDefault();
    doCut();
  } else if (e.ctrlKey && e.key === 'v') {
    doPaste();
  } else if (e.key === 'f' && !e.shiftKey) {
    doFlip('horizontal');
  } else if (e.key === 'F' && e.shiftKey) {
    doFlip('vertical');
  } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
    beginRotate();
  } else if (e.shiftKey && e.ctrlKey && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const [dx, dy] = arrowDelta(e.key);
    moveSelection(dx, dy, true);
  } else if (e.shiftKey && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const [dx, dy] = arrowDelta(e.key);
    moveSelection(dx, dy, false);
  }
});

function arrowDelta(key) {
  return { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key] || [0, 0];
}

window.addEventListener('keyup', (e) => {
  if (e.key === 'r' || e.key === 'R') endRotate();
});

resize();
