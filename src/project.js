import { createSpriteFile } from './sprite-file.js';
import { PRESETS, DEFAULT_PRESET } from './palettes-presets.js';
import { computeMembership, moveBlock, nextOrder } from './ordering.js';
import { referenceBytes } from './references.js';

// Project = a directory containing Files + one shared Palette (§4, §5).
// Every File must belong to a Collection — there's no "ungrouped" state —
// so the very first File also creates the very first Collection.
export function createProject(name) {
  const preset = PRESETS[DEFAULT_PRESET];
  const collection = { id: crypto.randomUUID(), name: 'Collection 1', collapsed: false, order: 1000 };
  return {
    id: crypto.randomUUID(),
    name,
    palette: { name: preset.name, chips: [...preset.chips], primary: preset.chips[0] },
    files: [{ ...createSpriteFile('sprite', 9, 9), order: 2000 }],
    collections: [collection],
    activeFileIndex: 0,
  };
}

export function activeFile(project) {
  return project.files[project.activeFileIndex];
}

// The combined, order-sorted [collection headers + files] view — the one
// source of truth for both display order and file→collection membership
// (§ ordering.js). Every panel render and every reorder goes through this.
export function projectOrder(project) {
  return computeMembership(project.collections, project.files);
}

// A fractional order value that lands at the end of `collectionId`'s own
// block (same technique deleteCollection uses for its orphans) instead of
// the very end of the whole project — lets a new File join whichever
// Collection is currently being worked on rather than always the last one.
function orderAtEndOfCollection(project, collectionId) {
  const combined = projectOrder(project);
  const headerPos = combined.findIndex((e) => e.isHeader && e.item.id === collectionId);
  if (headerPos < 0) return nextOrder(project.collections, project.files);
  let end = headerPos + 1;
  while (end < combined.length && !combined[end].isHeader) end++;
  const lastOrder = combined[end - 1].item.order;
  return end < combined.length ? (lastOrder + combined[end].item.order) / 2 : lastOrder + 1000;
}

// Every File must live in a Collection — appending at the very end
// (nextOrder) always lands a new File under whichever Collection is
// currently last, since membership is "nearest preceding header." If
// somehow there isn't one yet (e.g. migrated data), make one first rather
// than create a File with nowhere to live. `collectionId`, when given,
// targets that Collection's own block instead of the project's end.
export function addFile(project, name, width, height, collectionId) {
  addExistingFile(project, createSpriteFile(name, width, height), collectionId);
}

// Same placement as addFile, for a File built elsewhere (spritesheet import).
export function addExistingFile(project, file, collectionId) {
  if (!project.collections.length) addCollection(project);
  file.order = collectionId ? orderAtEndOfCollection(project, collectionId) : nextOrder(project.collections, project.files);
  project.files.push(file);
  project.activeFileIndex = project.files.length - 1;
}

// The bare name, then "name 2", "name 3" — never a "1" suffix on the first.
export function uniqueFileName(project, base) {
  const taken = new Set(project.files.map((f) => f.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  return name;
}

// The Collection a newly added File lands under by default (§ addFile) —
// whichever Collection is currently last in display order.
export function lastCollection(project) {
  const combined = projectOrder(project);
  const headers = combined.filter((e) => e.isHeader);
  return headers.length ? headers[headers.length - 1].item : null;
}

// Most recently modified File within a given Collection (by `.updatedAt`,
// stamped on commit — undo.js's commitCommand, and any other direct
// structural edit) — backs the "New File" size picker's Current option,
// which matches whatever's actively being worked on nearby instead of a
// fixed default.
export function mostRecentFileIn(project, collectionId) {
  projectOrder(project); // refreshes every file's derived .groupId
  let best = null;
  for (const file of project.files) {
    if (file.groupId !== collectionId) continue;
    if (!best || (file.updatedAt || 0) > (best.updatedAt || 0)) best = file;
  }
  return best;
}

// A collection is purely organizational — files nest under it in the panel
// by position (§ ordering.js), it isn't a real filesystem directory.
export function addCollection(project, name) {
  project.collections.push({
    id: crypto.randomUUID(),
    name: name || `Collection ${project.collections.length + 1}`,
    collapsed: false,
    order: nextOrder(project.collections, project.files),
  });
}

// Every File must always belong to *some* Collection, so the last one
// can't be deleted, and deleting any other one re-homes its member files
// under the (new) first Collection rather than leaving them stranded.
export function deleteCollection(project, id) {
  if (project.collections.length <= 1) return;
  const combined = projectOrder(project);
  const headerPos = combined.findIndex((e) => e.isHeader && e.item.id === id);
  if (headerPos < 0) return;
  const orphans = [];
  for (let i = headerPos + 1; i < combined.length && !combined[i].isHeader; i++) orphans.push(combined[i].item);
  project.collections = project.collections.filter((c) => c.id !== id);
  if (orphans.length) {
    const target = project.collections[0];
    orphans.forEach((file, i) => { file.order = target.order + (i + 1) * 0.01; });
  }
}

// Moves whatever sits at `fromPos` in `projectOrder(project)` to `toPos` —
// a file, or a collection header (which brings its member files with it).
// Positions are indices into that combined view, not raw array indices.
export function moveProjectItem(project, fromPos, toPos) {
  moveBlock(projectOrder(project), fromPos, toPos);
}

export function deleteFile(project, index) {
  if (project.files.length <= 1) return; // always at least one File
  project.files.splice(index, 1);
  project.activeFileIndex = Math.min(project.activeFileIndex, project.files.length - 1);
}

// New-File size presets, ascending by area. The two console names carry a
// `palette` key (palettes-presets.js): choosing one also swaps the Project's
// palette to match, the point of the name collision with Palette Presets.
// The picker stops at Game Boy DMG; the custom fields go up to 256x256 (the
// ceiling, chosen so long animations stay cheap: frame memory scales with
// canvas area) — see docs/adr/0003-canvas-size-range.md.
export const MIN_CANVAS = 6;
export const MAX_CANVAS = 256;

export const NEW_FILE_SIZES = [
  { label: '6x6', w: 6, h: 6 },
  { label: '9x9', w: 9, h: 9 }, // the new-project starter file's default size
  { label: '16x16', w: 16, h: 16 },
  { label: '24x24', w: 24, h: 24 },
  { label: '32x32', w: 32, h: 32 },
  { label: '64x64', w: 64, h: 64 },
  { label: 'Pico-8', w: 128, h: 128, palette: 'pico8' },
  { label: 'Game Boy DMG', w: 160, h: 144, palette: 'dmg' },
];

export function clampCanvasSize(n) {
  return Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(Number(n)) || MIN_CANVAS));
}

// --- Capacity meter (§ project panel) ---------------------------------
// A Project's cost is canvas area x layers x frames summed over its Files —
// its total pixel-buffer bytes, plus its loaded reference bitmaps — but a crowd of tiny Files still
// costs DOM and thumbnail work the byte count can't see, so the meter shows
// whichever budget is closer to full. Both budgets are tuned to keep a
// 4GB low-end machine responsive. Advisory only: nothing here ever blocks.
const BYTE_BUDGET = 256 * 1024 * 1024;
const FILE_BUDGET = 64;

// The two budgets' raw inputs, so the meter can say which one is filling.
export function projectLoadBreakdown(project) {
  let pixelBytes = 0, referenceByteCount = 0;
  for (const f of project.files) {
    pixelBytes += f.canvasWidth * f.canvasHeight * 2 * f.layers.length * f.frames.length;
    referenceByteCount += referenceBytes(f);
  }
  return { pixelBytes, referenceBytes: referenceByteCount, files: project.files.length };
}

export function projectLoad(project) {
  const { pixelBytes, referenceBytes: refs, files } = projectLoadBreakdown(project);
  return Math.max((pixelBytes + refs) / BYTE_BUDGET, files / FILE_BUDGET);
}

// Promotes each non-empty Collection to its own Project named after it;
// Files at the Project root stay in `project` (mutated in place). With no
// root Files, the first Collection stays behind as `project` itself, so the
// original is never left empty. Returns { parts, moved }: the new Projects
// (unsaved) and the Files that left `project`, whose stored copies the
// caller must delete.
export function splitByCollection(project) {
  const combined = projectOrder(project);
  const filesOf = (id) => combined.filter((e) => !e.isHeader && e.item.groupId === id).map((e) => e.item);
  const groups = project.collections.map((c) => ({ name: c.name, files: filesOf(c.id) })).filter((g) => g.files.length);
  const root = filesOf(null);
  if (!groups.length) return { parts: [], moved: [] };

  const shell = (name, files) => ({
    id: crypto.randomUUID(),
    name,
    palette: structuredClone(project.palette),
    files,
    collections: [{ id: crypto.randomUUID(), name: 'Collection 1', collapsed: false, order: Math.min(...files.map((f) => f.order)) - 1 }],
    activeFileIndex: 0,
  });
  const active = activeFile(project);
  const keep = root.length ? null : groups.shift();
  const parts = groups.map((g) => shell(g.name, g.files));
  const moved = parts.flatMap((p) => p.files);
  if (keep) {
    const kept = shell(keep.name, keep.files);
    project.name = kept.name;
    project.files = kept.files;
    project.collections = kept.collections;
  } else {
    project.files = root;
    project.collections = [];
  }
  project.activeFileIndex = Math.max(0, project.files.indexOf(active));
  return { parts, moved };
}
