// Global named-palette library: palettes the user has saved, shared by every
// Project. Lives in localStorage beside the other per-browser prefs
// (ui-prefs.js) — a source you load *from*: a Project keeps its own copy of
// whatever it loaded, so deleting an entry here can't reach into a Project.
const KEY = 'sprite-palettes';
export const MAX_SAVED = 30;

export function loadLibrary() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(library) {
  try { localStorage.setItem(KEY, JSON.stringify(library)); } catch { /* ignore quota/availability */ }
}

// "Name", then "Name 2", "Name 3" — never a "1" suffix on the first
// instance (DECISIONS.md).
function uniqueName(taken, base) {
  let name = base, n = 2;
  while (taken.includes(name)) name = `${base} ${n++}`;
  return name;
}

// Returns the name it was saved under, or null if the library is full.
// `reserved` = names that can't be reused at all (the built-in presets).
export function addPalette(name, chips, reserved = []) {
  const library = loadLibrary();
  if (library.length >= MAX_SAVED) return null;
  const saved = uniqueName([...library.map((p) => p.name), ...reserved], name);
  library.push({ name: saved, chips: [...chips] });
  save(library);
  return saved;
}

export function removePalette(name) {
  save(loadLibrary().filter((p) => p.name !== name));
}

// Returns the new name (uniquified against every *other* entry), or null if
// no entry had `oldName`.
export function renamePalette(oldName, newName, reserved = []) {
  const library = loadLibrary();
  const entry = library.find((p) => p.name === oldName);
  if (!entry) return null;
  entry.name = uniqueName([...library.filter((p) => p !== entry).map((p) => p.name), ...reserved], newName);
  save(library);
  return entry.name;
}
