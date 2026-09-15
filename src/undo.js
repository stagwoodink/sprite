import { setPixel } from './canvas-model.js';

const CAP = 50; // §10: 50-step undo stack, persisted as part of the PixiFile itself.

// Operates directly on file.undoStack/file.redoStack (§5) rather than owning
// separate closure state, so the arrays are exactly what Phase 8 persists to
// the .pixi file with no extra translation step.
export function commitCommand(file, command) {
  if (!command.before.length) return;
  file.undoStack.push(command);
  if (file.undoStack.length > CAP) file.undoStack.shift();
  file.redoStack = []; // new command invalidates redo history
}

export function undo(file, model) {
  const command = file.undoStack.pop();
  if (!command) return false;
  for (const [x, y, color] of command.before) setPixel(model, x, y, color);
  file.redoStack.push(command);
  return true;
}

export function redo(file, model) {
  const command = file.redoStack.pop();
  if (!command) return false;
  for (const [x, y, color] of command.after) setPixel(model, x, y, color);
  file.undoStack.push(command);
  return true;
}
