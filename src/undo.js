import { applyDiff } from './canvas-model.js';

const CAP = 50; // §10: 50-step undo stack, persisted as part of the SpriteFile itself.

// Operates directly on file.undoStack/file.redoStack (§5) rather than owning
// separate closure state, so the arrays are exactly what Phase 8 persists to
// the .sprite file with no extra translation step.
//
// Most commands are pixel diffs ({ before, after }: see canvas-model.js's
// diffFromSnapshot for the typed-array shape). Layer structural changes (add/delete/reorder) aren't pixel
// diffs: they change the shape of file.layers/file.frames itself: so
// those carry a before/after layer-stack snapshot instead, tagged
// `type: 'layers'`: see snapshotLayers for why that's cheap.
export function commitCommand(file, command) {
  if (command.type === 'layers') {
    if (!command.before || !command.after) return;
  } else if (!command.before.length) {
    return;
  }
  file.undoStack.push(command);
  if (file.undoStack.length > CAP) file.undoStack.shift();
  file.redoStack = []; // new command invalidates redo history
  file.updatedAt = Date.now(); // § project.js's mostRecentFileIn
}

// Layer add/delete/reorder only ever add, remove or reorder *references* to
// pixel buffers: no buffer is edited or copied by them: so the snapshot
// holds the buffers by reference and clones only the small layer metadata.
// (Deep-cloning every buffer here cost layers x frames x canvas area per
// edit, times the 50-step stack.) Later pixel edits mutate those shared
// buffers in place, but the linear undo stack unwinds them first.
export function snapshotLayers(file) {
  return {
    layers: structuredClone(file.layers),
    frames: file.frames.map((frame) => ({ frame, layerPixels: frame.layerPixels.slice() })),
    activeLayerIndex: file.activeLayerIndex,
  };
}

function applyLayerSnapshot(file, snapshot) {
  file.layers = structuredClone(snapshot.layers);
  file.frames = snapshot.frames.map(({ frame, layerPixels }) => {
    frame.layerPixels = layerPixels.slice();
    return frame;
  });
  file.activeLayerIndex = snapshot.activeLayerIndex;
}

export function undo(file, model) {
  const command = file.undoStack.pop();
  if (!command) return false;
  if (command.type === 'layers') applyLayerSnapshot(file, command.before);
  else applyDiff(model, command.before);
  file.redoStack.push(command);
  return true;
}

export function redo(file, model) {
  const command = file.redoStack.pop();
  if (!command) return false;
  if (command.type === 'layers') applyLayerSnapshot(file, command.after);
  else applyDiff(model, command.after);
  file.undoStack.push(command);
  return true;
}
