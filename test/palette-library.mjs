import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
const { addPalette, removePalette, renamePalette, loadLibrary, MAX_SAVED } = await import('../src/palette-library.js');

assert.equal(addPalette('Proj', ['#000000']), 'Proj');
assert.equal(addPalette('Proj', ['#111111']), 'Proj 2', 'collision suffixes from 2, never 1');
assert.equal(addPalette('PICO-8', ['#222222'], ['PICO-8']), 'PICO-8 2', 'built-in names are reserved');
assert.equal(renamePalette('Proj 2', 'Proj'), 'Proj 2', 'rename to an existing name still uniquifies');
removePalette('Proj');
assert.deepEqual(loadLibrary().map((p) => p.name), ['Proj 2', 'PICO-8 2']);
for (let i = loadLibrary().length; i < MAX_SAVED; i++) addPalette(`p${i}`, ['#000000']);
assert.equal(addPalette('over', ['#000000']), null, 'full at 30');
console.log('palette-library ok');
