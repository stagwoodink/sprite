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
