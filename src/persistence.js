import { resumeFolder, createDefaultBackend } from './storage.js';

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

// Single-project scope for now (Phase 7 gap) — everything lives flat under
// the backend root rather than nested per-project directories.
export async function loadProject(backend) {
  const meta = await backend.read(['project.json']);
  if (!meta) return null;
  const files = [];
  for (const fileName of meta.fileNames) {
    const file = await backend.read([fileName]);
    if (file) files.push(file);
  }
  if (!files.length) return null;
  // Redo stack is session-only, never persisted (§10) — reopening starts empty.
  for (const file of files) file.redoStack = [];
  return { name: meta.name, palette: meta.palette, activeFileIndex: meta.activeFileIndex, files };
}

export async function saveProject(backend, project) {
  await backend.write(['project.json'], {
    name: project.name,
    palette: project.palette,
    activeFileIndex: project.activeFileIndex,
    fileNames: project.files.map((f) => f.name + '.pixi'),
  });
  await Promise.all(project.files.map((file) => backend.write([file.name + '.pixi'], { ...file, redoStack: [] })));
}
