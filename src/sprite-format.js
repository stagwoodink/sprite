import { createColorTable, colorIndex, bufferId } from './canvas-model.js';

// .sprite v3: the File's JSON `meta` (everything except pixels and undo
// diffs) plus binary chunks, each written independently so an autosave
// rewrites only what changed:
//   one chunk per Frame — its layers' buffers back to back, each
//     canvasWidth*canvasHeight Uint16 indices into `meta.colors` — named by
//     the Frame's stable id, listed in order in `meta.frames`;
//   one undo chunk — every kept command's before/after Uint32 diff.
// Binary rather than base64-in-JSON: base64 is a third larger, and
// JSON.stringify over a huge string blocks the main thread on every autosave.
// v2 kept every Frame in one sidecar (`read('bin')`); a file with no
// `version` is v1 (pixels as plain arrays of hex/null). Both still load.
export const FORMAT_VERSION = 3;

let uidCounter = 0;
let frameIdCounter = 0;
const frameId = (frame) => frame.id ??= `f${Date.now().toString(36)}${(frameIdCounter++).toString(36)}`;

// Structural ('layers') undo commands carry whole-stack snapshots, so only
// the pixel commands after the last one are kept — earlier pixel commands
// predate that layer shape and could not be replayed against it anyway.
const keptUndo = (file) => file.undoStack.slice(file.undoStack.findLastIndex((c) => c.type === 'layers') + 1);

// In-memory File -> { meta, frames, undo }. `frames[i]` and `undo` carry a
// cheap change signature and a `bytes()` thunk, so a caller that already
// knows a chunk is unchanged never pays to encode it. Redo is session-only
// (§10); session-only references (no file handle to relink by) aren't saved.
export function encodeFile(file) {
  const { frames, undoStack, ...rest } = file;
  const cells = file.canvasWidth * file.canvasHeight;
  const kept = keptUndo(file);
  const commands = kept.map(({ before, after, uid, ...cmd }) => ({ ...cmd, n: before.length }));
  const references = (file.references || []).filter((r) => r.linked);
  const meta = { ...rest, references, version: FORMAT_VERSION, frames: frames.map(frameId), undoStack: commands, redoStack: [] };

  const frameChunks = frames.map((frame) => ({
    id: frameId(frame),
    sig: frame.layerPixels.map((buf) => `${bufferId(buf)}.${buf.v | 0}`).join(','),
    bytes() {
      const bytes = new Uint8Array(frame.layerPixels.length * cells * 2);
      frame.layerPixels.forEach((buf, i) => new Uint16Array(bytes.buffer, i * cells * 2, cells).set(buf));
      return bytes;
    },
  }));

  const undo = {
    sig: kept.map((c) => c.uid ??= ++uidCounter).join(','),
    bytes() {
      const bytes = new Uint8Array(kept.reduce((sum, c) => sum + c.before.byteLength * 2, 0));
      let offset = 0;
      for (const { before, after } of kept) {
        for (const side of [before, after]) {
          bytes.set(new Uint8Array(side.buffer, side.byteOffset, side.byteLength), offset);
          offset += side.byteLength;
        }
      }
      return bytes;
    },
  };
  return { meta, frames: frameChunks, undo };
}

// Persisted meta (or a bare v1 file object) -> the in-memory File.
// `read(kind, id)` returns a chunk's bytes or null: ('frame', id),
// ('undo'), or ('bin') for a v2 file's single sidecar. v1/v2 files come back
// in the current shape (v1's undo history is dropped: its [x, y, hex]
// commands are cheap to lose and undo is already expendable state).
export function parseFile(meta, read = () => null) {
  if (meta.version === FORMAT_VERSION) return decodeV3(meta, read);
  if (meta.version === 2) return decodeV2(meta, read('bin'));
  return migrateV1(meta);
}

// Reads consecutive typed values out of `bytes`. slice() copies into a
// fresh, aligned ArrayBuffer, so each view owns its memory and offsets in
// `bytes` needn't be aligned.
function reader(bytes) {
  let offset = 0;
  return (Type, count) => {
    const size = count * Type.BYTES_PER_ELEMENT;
    const out = new Type(bytes.slice(offset, offset + size).buffer);
    offset += size;
    return out;
  };
}

function decodeUndo(commands, bytes) {
  const take = reader(bytes || new Uint8Array(0));
  return commands.map(({ n, ...cmd }) => ({ ...cmd, before: take(Uint32Array, n), after: take(Uint32Array, n) }));
}

function decodeV3({ frames: ids, ...meta }, read) {
  const cells = meta.canvasWidth * meta.canvasHeight;
  const frames = ids.map((id) => {
    const bytes = read('frame', id) || new Uint8Array(meta.layers.length * cells * 2); // a missing chunk reads as blank, not a failed load
    const take = reader(bytes);
    return { id, layerPixels: meta.layers.map(() => take(Uint16Array, cells)) };
  });
  const undoStack = decodeUndo(meta.undoStack, read('undo'));
  delete meta.version;
  return { ...meta, frames, undoStack };
}

function decodeV2({ frameCount, ...meta }, bytes) {
  const cells = meta.canvasWidth * meta.canvasHeight;
  const take = reader(bytes);
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
