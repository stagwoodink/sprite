import { resumeFolder, createDefaultBackend } from './storage.js';
import { encodeFile, parseFile, FORMAT_VERSION } from './sprite-format.js';

// Debounced write — autosave fires after every committed EditCommand, but
// batched against rapid-fire commits (e.g. end-of-stroke) rather than
// writing mid-stroke (§18).
// `ms` may be a function, re-read on every call, for a delay that depends
// on current state (see autosaveDelay).
export function debounce(fn, ms = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), typeof ms === 'function' ? ms() : ms);
  };
}

// Serializing a file costs roughly its canvas area, so a big canvas waits
// longer to batch more edits per write: a flat 400ms up to 64x64, stretching
// linearly to 5s at 512x512.
export function autosaveDelay(area) {
  const SMALL = 64 * 64, LARGE = 512 * 512;
  const t = Math.min(1, Math.max(0, (area - SMALL) / (LARGE - SMALL)));
  return 400 + t * 4600;
}

export async function chooseBackend() {
  const fsa = await resumeFolder().catch(() => null);
  return fsa || createDefaultBackend();
}

// Every saved project gets its own [projectId, ...] subtree — the registry
// (a flat list at the backend root, outside any project's own subtree) is
// the index of what's out there, so "Open Project" doesn't need to load
// every project's full data just to list their names.
const REGISTRY_PATH = ['projects.json'];

export async function listProjects(backend) {
  return (await backend.read(REGISTRY_PATH)) || [];
}

async function touchRegistry(backend, project) {
  const registry = await listProjects(backend);
  const i = registry.findIndex((p) => p.id === project.id);
  const entry = { id: project.id, name: project.name, updatedAt: Date.now() };
  if (i >= 0) registry[i] = entry; else registry.push(entry);
  await backend.write(REGISTRY_PATH, registry);
}

export async function loadProject(backend, projectId) {
  const meta = await backend.read([projectId, 'project.json']);
  if (!meta) return null;
  const files = [];
  for (const fileName of meta.fileNames) {
    const raw = await backend.read([projectId, fileName]);
    if (!raw) continue;
    // Chunks are read up front (parseFile is synchronous): every Frame's
    // for v3, the single sidecar for v2, nothing for v1.
    const chunks = new Map();
    if (raw.version === FORMAT_VERSION) {
      // `fileName` is the JSON's stored name ("x.sprite"); chunks are named
      // after the File ("x"), see writeFile.
      const base = fileName.replace(/\.sprite$/, '');
      for (const id of raw.frames) chunks.set(`frame:${id}`, await backend.readBytes([projectId, frameChunkName(base, id)]));
      chunks.set('undo', await backend.readBytes([projectId, base + UNDO_SUFFIX]));
    } else if (raw.version === 2) {
      chunks.set('bin', await backend.readBytes([projectId, fileName + '.bin']));
    }
    const file = parseFile(raw, (kind, id) => chunks.get(id === undefined ? kind : `${kind}:${id}`) ?? null);
    // An older file is rewritten as v3 right away, so the old shape doesn't
    // linger in storage until this file happens to be edited.
    if (raw.version !== FORMAT_VERSION) {
      await writeFile(backend, projectId, file);
      if (raw.version === 2) await backend.delete([projectId, fileName + '.bin']);
    }
    files.push(file);
  }
  if (!files.length) return null;
  const collections = meta.collections || [];
  // Redo stack is session-only, never persisted (§10) — reopening starts
  // empty. `layerGroups` and every `.order` field are newer than some
  // already-saved projects — default rather than crash on an old one.
  // (Stale `collectionId`/`groupId` fields from the pre-ordering.js model
  // are harmless leftovers: membership is derived fresh from `.order` on
  // every read now, never read back off those fields.)
  files.forEach((file, i) => {
    file.redoStack = [];
    file.layerGroups ||= [];
    file.references ||= [];
    file.order ??= (i + 1) * 1000;
    file.layers.forEach((layer, li) => { layer.order ??= (li + 1) * 1000; });
    file.layerGroups.forEach((g, gi) => { g.order ??= (gi + 1) * 1000; });
  });
  collections.forEach((c, i) => { c.order ??= (i + 1) * 1000; });
  // What's on disk now is what was just read, so the first autosave of a
  // freshly opened project needn't rewrite every File.
  files.forEach((file) => {
    if (!lastWritten.has(file)) lastWritten.set(file, snapshotOf(projectId, file, encodeFile(file)));
  });
  return { id: projectId, name: meta.name, palette: meta.palette, activeFileIndex: meta.activeFileIndex, collections, files };
}

// Deletes every file a project owns (its subtree is flat — project.json
// plus one .sprite per File, no nested directories) and drops it from the
// registry. No undo — this is a hard delete, same as every other
// delete/remove button in the app (file, collection, layer, group), none
// of which confirm either.
export async function deleteProject(backend, projectId) {
  const names = await backend.list([projectId]);
  await Promise.all(names.map((name) => backend.delete([projectId, name])));
  const registry = await listProjects(backend);
  await backend.write(REGISTRY_PATH, registry.filter((entry) => entry.id !== projectId));
}

// A File's pixels live in binary chunks beside its JSON — one per Frame,
// one for undo (see sprite-format.js). Chunks are written before the JSON,
// so a saved JSON never points at chunks that aren't there yet.
const frameChunkName = (fileName, id) => `${fileName}.sprite.frame-${id}`;
const UNDO_SUFFIX = '.sprite.undo';

// What each File / project.json last wrote, so an autosave rewrites only
// what changed: drawing one pixel in one Frame of a 10-File project used to
// re-serialize all ten Files, and now rewrites just that Frame's chunk. The
// chunks are gated on their cheap change signatures; the small JSON is
// compared as text, which also catches edits that touch no pixels (layer
// visibility, renames). Not persisted, so a cold start (or a rename, which
// changes the path) just writes once.
const lastWritten = new WeakMap(); // File -> { path, json, frameSigs: Map<id, sig>, undoSig }
const lastProjectJson = new WeakMap(); // project -> string

const snapshotOf = (projectId, file, enc) => ({
  path: `${projectId}/${file.name}`,
  json: JSON.stringify(enc.meta),
  frameSigs: new Map(enc.frames.map((f) => [f.id, f.sig])),
  undoSig: enc.undo.sig,
});

// Returns whether anything was written.
async function writeFile(backend, projectId, file) {
  const enc = encodeFile(file);
  const now = snapshotOf(projectId, file, enc);
  const last = lastWritten.get(file);
  const same = last && last.path === now.path;
  let wrote = false;
  for (const frame of enc.frames) {
    if (same && last.frameSigs.get(frame.id) === frame.sig) continue;
    await backend.write([projectId, frameChunkName(file.name, frame.id)], frame.bytes());
    wrote = true;
  }
  if (!same || last.undoSig !== now.undoSig) {
    await backend.write([projectId, file.name + UNDO_SUFFIX], enc.undo.bytes());
    wrote = true;
  }
  if (!same || last.json !== now.json) {
    await backend.write([projectId, file.name + '.sprite'], enc.meta);
    wrote = true;
  }
  // Chunks of Frames deleted since the last write are now unreferenced.
  if (same) {
    for (const id of last.frameSigs.keys()) {
      if (!now.frameSigs.has(id)) await backend.delete([projectId, frameChunkName(file.name, id)]);
    }
  }
  lastWritten.set(file, now);
  return wrote;
}

// Drops a File's stored JSON and every chunk (it moved to another Project,
// or was deleted). Found by listing rather than by the File's frame ids, so
// leftovers from earlier saves go too.
export async function deleteStoredFile(backend, projectId, fileName) {
  const prefix = fileName + '.sprite';
  const names = (await backend.list([projectId])).filter((n) => n === prefix || n.startsWith(prefix + '.'));
  await Promise.all(names.map((n) => backend.delete([projectId, n])));
}

export async function saveProject(backend, project) {
  const projectJson = {
    name: project.name,
    palette: project.palette,
    activeFileIndex: project.activeFileIndex,
    collections: project.collections,
    fileNames: project.files.map((f) => f.name + '.sprite'),
  };
  const serialized = JSON.stringify(projectJson);
  let wrote = false;
  if (lastProjectJson.get(project) !== serialized) {
    await backend.write([project.id, 'project.json'], projectJson);
    lastProjectJson.set(project, serialized);
    wrote = true;
  }
  const results = await Promise.all(project.files.map((file) => writeFile(backend, project.id, file)));
  if (wrote || results.includes(true)) await touchRegistry(backend, project);
}
