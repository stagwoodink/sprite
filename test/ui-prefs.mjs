import assert from 'node:assert/strict';

const ls = new Map();
globalThis.localStorage = { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) };
const { loadUiPrefs, saveUiPrefs } = await import('../src/ui-prefs.js');

const defaults = await loadUiPrefs({ kind: 'idb' });
assert.equal(defaults.showGrid, true, 'grid defaults on');
assert.equal(defaults.canvasBg, 'white', 'canvas defaults whitish');
assert.equal(defaults.appBg, 'white', 'app background defaults whitish');

const files = new Map();
const folder = { kind: 'fsa', write: async (p, d) => files.set(p.join('/'), structuredClone(d)), read: async (p) => files.get(p.join('/')) ?? null };

// A fresh browser (no localStorage) adopts what the folder remembers.
files.set('.prefs', { canvasBg: 'black', showGrid: false });
const restored = await loadUiPrefs(folder);
assert.equal(restored.canvasBg, 'black');
assert.equal(restored.showGrid, false);
assert.equal(restored.appBg, 'white', 'unsaved keys still fall back to defaults');

// Saving mirrors to the folder, debounced to one write for a burst.
files.clear();
saveUiPrefs({ ...restored, appBg: 'grey' });
saveUiPrefs({ ...restored, appBg: 'black' });
assert.equal(files.size, 0, 'write waits out the debounce');
await new Promise((r) => setTimeout(r, 700));
assert.equal(files.get('.prefs').appBg, 'black', 'last save wins');
console.log('ui-prefs ok');
