import { createColorTable, colorIndex } from './canvas-model.js';

// .sprite v2: the File's JSON `meta` (everything except pixels) plus one raw
// binary sidecar holding every layer buffer back to back, frame-major then
// layer, each canvasWidth*canvasHeight Uint16 indices into `meta.colors`.
// Kept binary rather than base64-in-JSON: base64 is a third larger, and
// JSON.stringify over a huge string blocks the main thread on every autosave.
// A file with no `version` is v1 (pixels as plain arrays of hex/null).
export const FORMAT_VERSION = 2;

// In-memory File -> { meta, bytes }. Redo is session-only (§10). Structural
// ('layers') undo commands carry whole-state buffer snapshots, so only the
// pixel commands after the last one are kept — earlier pixel commands
// predate that layer shape and could not be replayed against it anyway.
export function encodeFile(file) {
  const { frames, undoStack, ...rest } = file;
  const cells = file.canvasWidth * file.canvasHeight;
  const bytes = new Uint8Array(frames.length * file.layers.length * cells * 2);
  let offset = 0;
  for (const frame of frames) {
    for (const buf of frame.layerPixels) {
      new Uint16Array(bytes.buffer, offset, cells).set(buf);
      offset += cells * 2;
    }
  }
  const lastStructural = undoStack.findLastIndex((c) => c.type === 'layers');
  const meta = { ...rest, version: FORMAT_VERSION, frameCount: frames.length, undoStack: undoStack.slice(lastStructural + 1), redoStack: [] };
  return { meta, bytes };
}

// Persisted { meta, bytes } (or a bare v1 file object, bytes null) -> the
// in-memory File. v1 files are converted, and their undo history dropped:
// its [x, y, hex] commands are cheap to lose and the undo stack is already
// expendable state.
export function parseFile(meta, bytes) {
  return meta.version === FORMAT_VERSION ? decodeV2(meta, bytes) : migrateV1(meta);
}

function decodeV2({ frameCount, ...meta }, bytes) {
  const cells = meta.canvasWidth * meta.canvasHeight;
  let offset = 0;
  const frames = Array.from({ length: frameCount }, () => ({
    layerPixels: meta.layers.map(() => {
      const buf = new Uint16Array(bytes.slice(offset, offset + cells * 2).buffer);
      offset += cells * 2;
      return buf;
    }),
  }));
  delete meta.version;
  return { ...meta, frames };
}

function migrateV1(file) {
  const colors = createColorTable();
  const frames = file.frames.map((frame) => ({
    layerPixels: frame.layerPixels.map((hexes) => {
      const buf = new Uint16Array(hexes.length);
      for (let i = 0; i < hexes.length; i++) if (hexes[i]) buf[i] = colorIndex(colors, hexes[i]);
      return buf;
    }),
  }));
  return { ...file, colors, frames, undoStack: [] };
}
