import { resumeFolder, createDefaultBackend } from './storage.js';
import { encodeFile, parseFile, FORMAT_VERSION } from './sprite-format.js';

// Debounced write — autosave fires after every committed EditCommand, but
// batched against rapid-fire commits (e.g. end-of-stroke) rather than
// writing mid-stroke (§18).
export function debounce(fn, ms = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
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
    const bytes = raw.version === FORMAT_VERSION ? await backend.readBytes([projectId, fileName + BIN_SUFFIX]) : null;
    const file = parseFile(raw, bytes);
    // A v1 file is rewritten as v2 right away, so the old shape doesn't
    // linger in storage until this file happens to be edited.
    if (raw.version !== FORMAT_VERSION) await writeFile(backend, projectId, file);
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
    file.order ??= (i + 1) * 1000;
    file.layers.forEach((layer, li) => { layer.order ??= (li + 1) * 1000; });
    file.layerGroups.forEach((g, gi) => { g.order ??= (gi + 1) * 1000; });
  });
  collections.forEach((c, i) => { c.order ??= (i + 1) * 1000; });
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

// A File's pixel buffers live in a binary sidecar beside its JSON (see
// sprite-format.js). The sidecar goes first so a v2 JSON never points at
// buffers that aren't there yet.
const BIN_SUFFIX = '.bin';

async function writeFile(backend, projectId, file) {
  const { meta, bytes } = encodeFile(file);
  await backend.write([projectId, file.name + '.sprite' + BIN_SUFFIX], bytes);
  await backend.write([projectId, file.name + '.sprite'], meta);
}

export async function saveProject(backend, project) {
  await backend.write([project.id, 'project.json'], {
    name: project.name,
    palette: project.palette,
    activeFileIndex: project.activeFileIndex,
    collections: project.collections,
    fileNames: project.files.map((f) => f.name + '.sprite'),
  });
  await Promise.all(project.files.map((file) => writeFile(backend, project.id, file)));
  await touchRegistry(backend, project);
}
