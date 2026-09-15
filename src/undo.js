import { setPixel } from './canvas-model.js';

const CAP = 50; // §10: 50-step undo stack

// In-memory only (Phase 5) — persisting undoStack into the .pixi file lands
// in Phase 8. Commands are plain {type, before, after} objects (§5), so
// undo/redo here is just replaying the diff, no per-type apply/unapply needed
// since every current command type reduces to a pixel diff.
export function createUndoStack() {
  let undoStack = [];
  let redoStack = [];

  return {
    commit(command) {
      if (!command.before.length) return;
      undoStack.push(command);
      if (undoStack.length > CAP) undoStack.shift();
      redoStack = []; // new command invalidates redo history
    },
    undo(model) {
      const command = undoStack.pop();
      if (!command) return false;
      for (const [x, y, color] of command.before) setPixel(model, x, y, color);
      redoStack.push(command);
      return true;
    },
    redo(model) {
      const command = redoStack.pop();
      if (!command) return false;
      for (const [x, y, color] of command.after) setPixel(model, x, y, color);
      undoStack.push(command);
      return true;
    },
  };
}
