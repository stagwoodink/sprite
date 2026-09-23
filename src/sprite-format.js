import { createColorTable, colorIndex, bufferId } from './canvas-model.js';

// .sprite v2: the File's JSON `meta` (everything except pixels) plus one raw
// binary sidecar holding every layer buffer back to back, frame-major then
// layer, each canvasWidth*canvasHeight Uint16 indices into `meta.colors`.
// Kept binary rather than base64-in-JSON: base64 is a third larger, and
// JSON.stringify over a huge string blocks the main thread on every autosave.
// A file with no `version` is v1 (pixels as plain arrays of hex/null).
export const FORMAT_VERSION = 2;

// In-memory File -> { meta, bytes }. Redo is session-only (§10). Structural
// ('layers') undo commands carry whole-stack snapshots, so only the pixel
// commands after the last one are kept — earlier pixel commands predate that
// layer shape and could not be replayed against it anyway. Each kept
// command's before/after typed arrays follow the layer buffers in `bytes`,
// with only their length (`n`, in words) left in the JSON.
// What must change for a File's binary sidecar to need rewriting: any
// buffer's identity or version, the color table's size, or the undo stack.
// Cheap enough to compute on every autosave, unlike encoding the buffers.
export function bufferSignature(file) {
  const undo = file.undoStack;
  return [
    file.colors.length, undo.length, undo.length ? undo[undo.length - 1].before.length : 0,
    ...file.frames.flatMap((frame) => frame.layerPixels.map((buf) => `${bufferId(buf)}.${buf.v | 0}`)),
  ].join(',');
}

// `withBytes: false` skips building the sidecar (bytes: null) — for an
// autosave that already knows the buffers haven't changed.
export function encodeFile(file, { withBytes = true } = {}) {
  const { frames, undoStack, ...rest } = file;
  const cells = file.canvasWidth * file.canvasHeight;
  const kept = undoStack.slice(undoStack.findLastIndex((c) => c.type === 'layers') + 1);
  const layerBytes = frames.length * file.layers.length * cells * 2;
  const bytes = withBytes ? new Uint8Array(layerBytes + kept.reduce((sum, c) => sum + c.before.byteLength * 2, 0)) : null;
  let offset = 0;
  if (withBytes) {
    for (const frame of frames) {
      for (const buf of frame.layerPixels) {
        new Uint16Array(bytes.buffer, offset, cells).set(buf);
        offset += cells * 2;
      }
    }
  }
  const commands = kept.map(({ before, after, ...cmd }) => {
    if (withBytes) {
      for (const side of [before, after]) {
        bytes.set(new Uint8Array(side.buffer, side.byteOffset, side.byteLength), offset);
        offset += side.byteLength;
      }
    }
    return { ...cmd, n: before.length };
  });
  // Session-only references (no file handle to relink them by) aren't persisted.
  const references = (file.references || []).filter((r) => r.linked);
  const meta = { ...rest, references, version: FORMAT_VERSION, frameCount: frames.length, undoStack: commands, redoStack: [] };
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
  // slice() copies into a fresh, aligned ArrayBuffer, so each typed view
  // owns its memory and offsets in `bytes` needn't be aligned.
  const take = (Type, count) => {
    const size = count * Type.BYTES_PER_ELEMENT;
    const out = new Type(bytes.slice(offset, offset + size).buffer);
    offset += size;
    return out;
  };
  const frames = Array.from({ length: frameCount }, () => ({
    layerPixels: meta.layers.map(() => take(Uint16Array, cells)),
  }));
  const undoStack = meta.undoStack.map(({ n, ...cmd }) => ({ ...cmd, before: take(Uint32Array, n), after: take(Uint32Array, n) }));
  delete meta.version;
  return { ...meta, frames, undoStack };
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
