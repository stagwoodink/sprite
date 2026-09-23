import { createColorTable, packedTable } from './canvas-model.js';
import { computeMembership, moveBlock, nextOrder } from './ordering.js';

// SpriteFile / Layer / Frame data model (design-doc §5).
export function createLayer(name = 'Layer 1', order = 1000) {
  return { name, visible: true, opacity: 1, order };
}

// A group is purely organizational — a label member layers can be nested
// under in the panel by position (§ ordering.js). It composites nothing of
// its own; its `visible` flag just gates whether its members render at all.
export function createLayerGroup(name, order) {
  return { id: crypto.randomUUID(), name, visible: true, collapsed: false, order };
}

// A layer's pixels are a Uint16Array of indices into `file.colors`
// (canvas-model.js); index 0 is transparent, so a fresh buffer is empty.
export function createFrame(layerCount, pixelCount) {
  return { layerPixels: Array.from({ length: layerCount }, () => new Uint16Array(pixelCount)) };
}

// Every Layer must belong to a Group — there's no "ungrouped" state — so
// the very first Layer also creates the very first Group. Ascending
// `.order` is top-to-bottom in the panel (§ layerOrder below), so the
// group (order 1000) sits above its one member (order 2000).
export function createSpriteFile(name, width, height) {
  return {
    name,
    layers: [createLayer('Layer 1', 2000)],
    layerGroups: [createLayerGroup('Group 1', 1000)],
    colors: createColorTable(),
    frames: [createFrame(1, width * height)],
    activeLayerIndex: 0,
    activeFrameIndex: 0,
    canvasWidth: width,
    canvasHeight: height,
    visibleWidth: width,
    visibleHeight: height,
    undoStack: [],
    redoStack: [],
    // Stamped fresh on creation, then again on every commit (undo.js's
    // commitCommand) — a never-edited file still has a valid timestamp to
    // compare against (§ project.js's mostRecentFileIn).
    updatedAt: Date.now(),
  };
}

// The combined, order-sorted [groups + layers] view — the one source of
// truth for both panel display order and layer→group membership
// (§ ordering.js), same pattern as project.js's `projectOrder`.
export function layerOrder(file) {
  return computeMembership(file.layerGroups, file.layers);
}

// The pixel array currently being drawn on: active layer, active frame.
export function activePixels(file) {
  return file.frames[file.activeFrameIndex].layerPixels[file.activeLayerIndex];
}

// All visible layers of the active frame, flattened bottom-to-top into one
// buffer for display (§11) — drawing still targets the single active
// layer's own array via activePixels(), this is display-only. Output is a
// packed-RGBA Uint32Array (canvas-model.js's hexToPacked), 0 = transparent.
export function compositeFrame(file) {
  return compositeFrameAt(file, file.activeFrameIndex);
}

// Source-over of packed `top` at `alpha` onto packed `base`, matching
// canvas-model.js's blendColors (same rounding, same alpha edge cases).
function blendPacked(base, top, alpha) {
  if (alpha >= 1 || !base) return top;
  if (alpha <= 0) return base;
  const r = Math.round((base & 255) + ((top & 255) - (base & 255)) * alpha);
  const g = Math.round(((base >> 8) & 255) + (((top >> 8) & 255) - ((base >> 8) & 255)) * alpha);
  const b = Math.round(((base >> 16) & 255) + (((top >> 16) & 255) - ((base >> 16) & 255)) * alpha);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Per-frame composite cache. A WeakMap keyed by the frame object, so it
// never reaches serialization and dies with the frame. A hit needs the same
// structure (dimensions, each layer's visibility/opacity/buffer identity)
// and the same buffer versions (canvas-model.js touch()) — so pan, zoom,
// idle redraws and edits to *other* frames all cost one key comparison.
const compositeCache = new WeakMap(); // frame -> { structKey, versions, out }
let nextBufferId = 1;

export function compositeFrameAt(file, frameIndex) {
  const w = file.visibleWidth, h = file.visibleHeight;
  const frame = file.frames[frameIndex];
  // `layer.groupId` is derived, not stored — layerOrder() is what computes
  // it (as a side effect), and this runs every frame regardless of whether
  // the layers panel has rendered since the last group/order change, so it
  // can't rely on that having already happened.
  layerOrder(file);
  const shown = file.layers.map((layer) => {
    const group = layer.groupId && file.layerGroups.find((g) => g.id === layer.groupId);
    return layer.visible && !(group && !group.visible);
  });
  const bufs = frame.layerPixels;
  const structKey = `${w}x${h}x${file.canvasWidth}|` + file.layers.map((layer, li) => `${shown[li] ? 1 : 0}:${layer.opacity}:${bufs[li].id ??= nextBufferId++}`).join(',');
  const versions = bufs.map((buf) => buf.v | 0);

  const cached = compositeCache.get(frame);
  if (cached && cached.structKey === structKey && cached.versions.every((v, i) => v === versions[i])) return cached.out;

  const out = new Uint32Array(w * h);
  const table = packedTable(file.colors);
  file.layers.forEach((layer, li) => {
    if (!shown[li]) return;
    const src = bufs[li];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = src[y * file.canvasWidth + x];
        if (!idx) continue;
        const i = y * w + x;
        out[i] = blendPacked(out[i], table[idx], layer.opacity);
      }
    }
  });
  compositeCache.set(frame, { structKey, versions, out });
  return out;
}

// One layer's own pixels at one frame, at its own opacity — everything
// else ignored (§ export.js's per-layer breakdown export). This app's
// pixel model has no true alpha channel (a cell is one solid color or
// nothing), so a partially-opaque layer exported alone paints solid,
// exactly as it already would if it were the only visible layer on-canvas
// — hence no opacity term here at all.
export function compositeLayerAt(file, layerIndex, frameIndex) {
  return cropToVisible(file, file.frames[frameIndex].layerPixels[layerIndex]);
}

// Crops a full-stride (canvasWidth x canvasHeight) index buffer down to the
// visible window as packed pixels, matching compositeFrame's output shape.
function cropToVisible(file, fullPixels) {
  const w = file.visibleWidth, h = file.visibleHeight;
  const out = new Uint32Array(w * h);
  const table = packedTable(file.colors);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = table[fullPixels[y * file.canvasWidth + x]];
  }
  return out;
}

// Onion-skin ghost source for one frame (§12.3): either the full composite
// or just the active layer, toggleable.
export function ghostSource(file, frameIndex, activeLayerOnly) {
  if (activeLayerOnly) {
    return cropToVisible(file, file.frames[frameIndex].layerPixels[file.activeLayerIndex]);
  }
  return compositeFrameAt(file, frameIndex);
}

// A new layer must land INSIDE some group (every Layer belongs to a Group
// — no ungrouped state), so its order sits between that group's header and
// its current first member. Defaults to the topmost group when no groupId
// is given (e.g. no group currently focused in the Layers panel).
function orderInGroup(file, groupId) {
  const group = (groupId && file.layerGroups.find((g) => g.id === groupId))
    || file.layerGroups.reduce((a, b) => (a.order < b.order ? a : b));
  const combined = layerOrder(file);
  const headerPos = combined.findIndex((e) => e.isHeader && e.item === group);
  const next = combined[headerPos + 1];
  return next ? (group.order + next.item.order) / 2 : group.order + 1;
}

export function addLayer(file, name, groupId) {
  if (!file.layerGroups.length) addLayerGroup(file);
  file.layers.push(createLayer(name || `Layer ${file.layers.length + 1}`, orderInGroup(file, groupId)));
  for (const frame of file.frames) {
    frame.layerPixels.push(new Uint16Array(file.canvasWidth * file.canvasHeight));
  }
  file.activeLayerIndex = file.layers.length - 1;
}

export function deleteLayer(file, index) {
  if (file.layers.length <= 1) return; // always at least one layer
  file.layers.splice(index, 1);
  for (const frame of file.frames) frame.layerPixels.splice(index, 1);
  file.activeLayerIndex = Math.min(file.activeLayerIndex, file.layers.length - 1);
}

export function addLayerGroup(file, name) {
  file.layerGroups.push(createLayerGroup(name || `Group ${file.layerGroups.length + 1}`, nextOrder(file.layerGroups, file.layers)));
}

// Every Layer must always belong to *some* Group, so the last one can't be
// deleted, and deleting any other one re-homes its member layers under the
// (new) first Group rather than leaving them stranded (§ project.js's
// deleteCollection, same pattern).
export function deleteLayerGroup(file, groupId) {
  if (file.layerGroups.length <= 1) return;
  const combined = layerOrder(file);
  const headerPos = combined.findIndex((e) => e.isHeader && e.item.id === groupId);
  if (headerPos < 0) return;
  const orphans = [];
  for (let i = headerPos + 1; i < combined.length && !combined[i].isHeader; i++) orphans.push(combined[i].item);
  file.layerGroups = file.layerGroups.filter((g) => g.id !== groupId);
  if (orphans.length) {
    const target = file.layerGroups[0];
    orphans.forEach((layer, i) => { layer.order = target.order + (i + 1) * 0.01; });
  }
}

// Moves whatever sits at `fromPos` in `layerOrder(file)` to `toPos` — a
// layer, or a group header (which brings its member layers with it) —
// then re-syncs `file.layers`/`frame.layerPixels`/`activeLayerIndex` to
// match, since (unlike files) a layer's array position *is* its
// compositing order, not just a display detail.
// Ascending `.order` = top-to-bottom in the panel, but `file.layers`
// array order is bottom-to-top (index 0 composites first/at the back,
// last index on top) — so the derived array is the reverse of order.
export function moveLayerItem(file, fromPos, toPos) {
  const combined = layerOrder(file);
  moveBlock(combined, fromPos, toPos);
  const oldLayers = file.layers;
  const activeLayer = oldLayers[file.activeLayerIndex];
  const newLayers = combined.filter((e) => !e.isHeader).map((e) => e.item).reverse();
  for (const frame of file.frames) {
    frame.layerPixels = newLayers.map((layer) => frame.layerPixels[oldLayers.indexOf(layer)]);
  }
  file.layers = newLayers;
  file.activeLayerIndex = Math.max(0, newLayers.indexOf(activeLayer));
}

// Frame operations (§12.1). Every frame shares the file's layer stack, so a
// new frame gets one empty pixel buffer per existing layer.
export function addFrame(file, atIndex = file.frames.length) {
  file.frames.splice(atIndex, 0, createFrame(file.layers.length, file.canvasWidth * file.canvasHeight));
  file.activeFrameIndex = atIndex;
}

export function duplicateFrame(file, index) {
  const source = file.frames[index];
  const copy = { layerPixels: source.layerPixels.map((p) => p.slice()) };
  file.frames.splice(index + 1, 0, copy);
  file.activeFrameIndex = index + 1;
}

export function deleteFrame(file, index) {
  if (file.frames.length <= 1) return; // a File always has at least one Frame
  file.frames.splice(index, 1);
  file.activeFrameIndex = Math.min(file.activeFrameIndex, file.frames.length - 1);
}

export function reorderFrame(file, from, to) {
  if (to < 0 || to >= file.frames.length) return;
  const [frame] = file.frames.splice(from, 1);
  file.frames.splice(to, 0, frame);
  if (file.activeFrameIndex === from) file.activeFrameIndex = to;
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
      const next = new Uint16Array(newCanvasW * newCanvasH);
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
