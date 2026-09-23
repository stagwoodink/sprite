import { decodeImage } from './image-import.js';
import { paletteNameFromFile } from './palette-parse.js';
import { refHandles } from './storage.js';

// Reference images: drawing aids shown behind the art, never part of the
// document. The image itself is never stored in the .sprite — a reference
// is a { id, name, mode, linked } record on `file.references`, and (on
// Chromium) a FileSystemFileHandle to the user's own file kept in IndexedDB
// (storage.js refHandles). Elsewhere there is no handle, so the reference
// lives for the session only (`linked: false`) and isn't persisted.
// Decoded bitmaps live here in memory, capped at 2048px on the long edge
// (~16MB each, 3 per File), never on the File object.
export const MAX_REFERENCES = 3;
const REF_LONG_EDGE = 2048;
const bitmaps = new Map(); // ref id -> ImageBitmap
const resolving = new Set(); // ref ids with a decode in flight

export function referencesOf(file) {
  return file.references ||= [];
}

export async function addReference(file, image, handle) {
  const refs = referencesOf(file);
  if (refs.length >= MAX_REFERENCES) throw new Error(`A File holds at most ${MAX_REFERENCES} reference images`);
  const bitmap = await decodeImage(image, { longEdge: REF_LONG_EDGE });
  const ref = { id: crypto.randomUUID(), name: paletteNameFromFile(image.name), mode: 'fit', linked: !!handle };
  if (handle) await refHandles.save(ref.id, handle);
  bitmaps.set(ref.id, bitmap);
  refs.push(ref);
  return ref;
}

export function removeReference(file, id) {
  const refs = referencesOf(file);
  refs.splice(refs.findIndex((r) => r.id === id), 1);
  bitmaps.get(id)?.close();
  bitmaps.delete(id);
  refHandles.delete(id).catch(() => {});
}

export const isResolved = (ref) => bitmaps.has(ref.id);

// Loads the bitmap for a linked reference from its handle. Without an
// active permission grant this stays unresolved (`interactive` = called from
// a click, so the browser may prompt). A moved/renamed/deleted source just
// leaves it unresolved — never fails the File load.
export async function resolveReference(ref, { interactive = false } = {}) {
  if (!ref.linked || bitmaps.has(ref.id) || resolving.has(ref.id)) return false;
  resolving.add(ref.id);
  try {
    const handle = await refHandles.load(ref.id);
    if (!handle) return false;
    const opts = { mode: 'read' };
    let perm = await handle.queryPermission(opts);
    if (perm !== 'granted' && interactive) perm = await handle.requestPermission(opts);
    if (perm !== 'granted') return false;
    bitmaps.set(ref.id, await decodeImage(await handle.getFile(), { longEdge: REF_LONG_EDGE }));
    return true;
  } catch {
    return false;
  } finally {
    resolving.delete(ref.id);
  }
}

// What the renderer draws: only references whose image is loaded.
export function drawableReferences(file) {
  return referencesOf(file).filter((r) => bitmaps.has(r.id)).map((r) => ({ mode: r.mode, bitmap: bitmaps.get(r.id) }));
}
