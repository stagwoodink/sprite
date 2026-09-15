import { blendColors } from './canvas-model.js';

// PixiFile / Layer / Frame data model (design-doc §5).
export function createLayer(name = 'Layer 1') {
  return { name, visible: true, opacity: 1 };
}

export function createFrame(layerCount, pixelCount) {
  return { layerPixels: Array.from({ length: layerCount }, () => new Array(pixelCount).fill(null)) };
}

export function createPixiFile(name, width, height) {
  return {
    name,
    layers: [createLayer()],
    frames: [createFrame(1, width * height)],
    activeLayerIndex: 0,
    activeFrameIndex: 0,
    canvasWidth: width,
    canvasHeight: height,
    visibleWidth: width,
    visibleHeight: height,
    undoStack: [],
    redoStack: [],
  };
}

// The pixel array currently being drawn on: active layer, active frame.
export function activePixels(file) {
  return file.frames[file.activeFrameIndex].layerPixels[file.activeLayerIndex];
}

// All visible layers of the active frame, flattened bottom-to-top into one
// buffer for display (§11) — drawing still targets the single active
// layer's own array via activePixels(), this is display-only.
export function compositeFrame(file) {
  const w = file.visibleWidth, h = file.visibleHeight;
  const out = new Array(w * h).fill(null);
  const frame = file.frames[file.activeFrameIndex];
  file.layers.forEach((layer, li) => {
    if (!layer.visible) return;
    const src = frame.layerPixels[li];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = src[y * file.canvasWidth + x];
        if (!v) continue;
        const i = y * w + x;
        out[i] = blendColors(out[i], v, layer.opacity);
      }
    }
  });
  return out;
}

export function addLayer(file, name) {
  file.layers.push(createLayer(name || `Layer ${file.layers.length + 1}`));
  for (const frame of file.frames) {
    frame.layerPixels.push(new Array(file.canvasWidth * file.canvasHeight).fill(null));
  }
  file.activeLayerIndex = file.layers.length - 1;
}

export function deleteLayer(file, index) {
  if (file.layers.length <= 1) return; // always at least one layer
  file.layers.splice(index, 1);
  for (const frame of file.frames) frame.layerPixels.splice(index, 1);
  file.activeLayerIndex = Math.min(file.activeLayerIndex, file.layers.length - 1);
}

export function reorderLayer(file, from, to) {
  if (to < 0 || to >= file.layers.length) return;
  const [layer] = file.layers.splice(from, 1);
  file.layers.splice(to, 0, layer);
  for (const frame of file.frames) {
    const [pixels] = frame.layerPixels.splice(from, 1);
    frame.layerPixels.splice(to, 0, pixels);
  }
  if (file.activeLayerIndex === from) file.activeLayerIndex = to;
}

// Resizing larger grows the logical buffer from center; resizing smaller only
// shrinks the *visible* window — pixels outside it are preserved in the
// logical buffer so growing back out later restores them intact (§13.4).
export function resizeCanvas(file, newVisibleW, newVisibleH) {
  const needsGrow = newVisibleW > file.canvasWidth || newVisibleH > file.canvasHeight;
  if (!needsGrow) {
    file.visibleWidth = newVisibleW;
    file.visibleHeight = newVisibleH;
    return;
  }

  const newCanvasW = Math.max(file.canvasWidth, newVisibleW);
  const newCanvasH = Math.max(file.canvasHeight, newVisibleH);
  const offsetX = Math.floor((newCanvasW - file.canvasWidth) / 2);
  const offsetY = Math.floor((newCanvasH - file.canvasHeight) / 2);

  for (const frame of file.frames) {
    frame.layerPixels = frame.layerPixels.map((oldPixels) => {
      const next = new Array(newCanvasW * newCanvasH).fill(null);
      for (let y = 0; y < file.canvasHeight; y++) {
        for (let x = 0; x < file.canvasWidth; x++) {
          const v = oldPixels[y * file.canvasWidth + x];
          if (v) next[(y + offsetY) * newCanvasW + (x + offsetX)] = v;
        }
      }
      return next;
    });
  }

  file.canvasWidth = newCanvasW;
  file.canvasHeight = newCanvasH;
  file.visibleWidth = newVisibleW;
  file.visibleHeight = newVisibleH;
}
