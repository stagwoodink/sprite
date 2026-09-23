import assert from 'node:assert/strict';
import { createSpriteFile, addFrame, addLayer, deleteLayer } from '../src/sprite-file.js';
import { setPixel } from '../src/canvas-model.js';
import { saveProject, loadProject, ensureLoaded, unloadIdle } from '../src/persistence.js';

const store = new Map(), writes = [];
const backend = {
  async write(path, data) { writes.push(path.join('/')); store.set(path.join('/'), structuredClone(data)); },
  async read(path) { return store.get(path.join('/')) ?? null; },
  async readBytes(path) { return store.get(path.join('/')) ?? null; },
  async list() { return []; },
  async delete(path) { store.delete(path.join('/')); },
};
const project = {
  id: 'p', name: 'P', palette: { chips: ['#000000'], primary: '#000000' }, activeFileIndex: 0, collections: [],
  files: [createSpriteFile('a', 4, 4), createSpriteFile('b', 4, 4)],
};
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.includes('.sprite.frame-')).length, 2, 'cold save writes both files\' frames');

writes.length = 0;
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.startsWith('p/')).length, 0, 'unchanged project writes nothing');

const f = project.files[0];
setPixel({ width: 4, height: 4, stride: 4, pixels: f.frames[0].layerPixels[0], colors: f.colors }, 0, 0, '#FF0000');
await saveProject(backend, project);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')).map((w) => w.replace(/frame-.*/, 'frame')), ['p/a.sprite.frame', 'p/a.sprite'], 'the edited frame (and the meta, whose color table grew) is rewritten, nothing else');

writes.length = 0;
project.files[1].layers[0].visible = false; // no pixel change: JSON only
await saveProject(backend, project);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')), ['p/b.sprite'], 'metadata-only change skips every chunk');

const back = await loadProject(backend, 'p');
assert.notEqual(back.files[0].frames[0].layerPixels[0][0], 0, 'pixels survive a save and reload'); // the edited cell at 0,0
writes.length = 0;
await saveProject(backend, back);
assert.equal(writes.filter((w) => w.startsWith('p/')).length, 1, 'reloaded project rewrites only project.json');

// one edit in a many-frame file rewrites one frame chunk, not all of them
const many = project.files[0];
for (let i = 0; i < 5; i++) addFrame(many);
await saveProject(backend, project);
writes.length = 0;
setPixel({ width: 4, height: 4, stride: 4, pixels: many.frames[3].layerPixels[0], colors: many.colors }, 1, 1, '#00FF00');
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.includes('.sprite.frame-')).length, 1, 'six frames, one chunk written');

// deleting a frame removes its chunk from storage
const doomed = many.frames[0].id;
many.frames.splice(0, 1);
await saveProject(backend, project);
assert.equal([...store.keys()].some((k) => k.endsWith('frame-' + doomed)), false, 'orphaned chunk deleted');

// lazy loading: only the active file's pixels are read; the rest is a stub
// that fails loudly until loaded, and saves cost only its small JSON
const lazy = await loadProject(backend, 'p');
const [act, stub] = lazy.files;
assert.equal(!!act._stub, false);
assert.equal(!!stub._stub, true);
assert.throws(() => stub.frames[0].layerPixels, /isn't loaded yet/, 'touching an unloaded file throws by name');
await saveProject(backend, lazy); // first save of this project object writes project.json
writes.length = 0;
stub.order = 12345; // e.g. a reorder in the project panel
await saveProject(backend, lazy);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')), ['p/b.sprite'], 'a stub is saved as JSON only');
await Promise.all([ensureLoaded(stub), ensureLoaded(stub)]);
assert.equal(stub.frames[0].layerPixels[0].length, 16, 'loaded in place');
assert.equal(!!stub._stub, false);
writes.length = 0;
await saveProject(backend, lazy);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')), [], 'a freshly loaded file is not rewritten');

// unloading: an idle saved file drops back to a stub and reloads intact
const pixelsOf = (f) => Array.from(f.frames[0].layerPixels[0]);
setPixel({ width: 4, height: 4, stride: 4, pixels: stub.frames[0].layerPixels[0], colors: stub.colors }, 3, 3, '#0000FF');
const before = pixelsOf(stub);
await unloadIdle(backend, lazy, (f) => f === act, { keep: 0, idleMs: 0 });
assert.equal(!!stub._stub, true, 'idle file was unloaded');
assert.equal(!!act._stub, false, 'file in use was kept');
assert.throws(() => pixelsOf(stub), /isn't loaded yet/);
await ensureLoaded(stub);
assert.deepEqual(pixelsOf(stub), before, 'edits made before unloading survive it');

// undo history is not persisted: no undo chunk is ever written
const reopened = await loadProject(backend, 'p');
reopened.files[0].undoStack.push({ type: 'pixelEdit', before: new Uint32Array(2), after: new Uint32Array(2) });
setPixel({ width: 4, height: 4, stride: 4, pixels: reopened.files[0].frames[0].layerPixels[0], colors: reopened.files[0].colors }, 2, 2, '#FFFF00');
writes.length = 0;
await saveProject(backend, reopened);
assert.equal(writes.some((w) => w.endsWith('.undo')), false, 'no undo chunk is written');

// one chunk per layer buffer: editing one layer of twenty writes one chunk
const wide = createSpriteFile('wide', 4, 4);
while (wide.layers.length < 20) addLayer(wide, 'L' + wide.layers.length, wide.layerGroups[0].id);
project.files.push(wide);
await saveProject(backend, project);
writes.length = 0;
setPixel({ width: 4, height: 4, stride: 4, pixels: wide.frames[0].layerPixels[7], colors: wide.colors }, 0, 0, '#ABCDEF');
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.includes('wide.sprite.frame-')).length, 1, 'one layer of twenty edited, one chunk written');
// deleting a layer removes its chunk
const gone = wide.frames[0].layerPixels[3].cid;
deleteLayer(wide, 3);
await saveProject(backend, project);
assert.equal([...store.keys()].some((k) => k.endsWith('-' + gone)), false, 'deleted layer\'s chunk removed');

// a v3 project (one combined chunk per frame, plus an undo chunk) migrates to
// v4 on load: pixels intact, old chunks gone, per-layer chunks written
const v3meta = { version: 3, name: 'old', layers: [{ name: 'A', visible: true, opacity: 1, order: 2000 }, { name: 'B', visible: true, opacity: 1, order: 3000 }], layerGroups: [], activeLayerIndex: 0, activeFrameIndex: 0, canvasWidth: 2, canvasHeight: 2, visibleWidth: 2, visibleHeight: 2, colors: [null, '#111111', '#222222'], frames: ['fx'], undoStack: [], redoStack: [] };
store.set('q/project.json', { name: 'Q', palette: { chips: ['#000000'], primary: '#000000' }, activeFileIndex: 0, collections: [], fileNames: ['old.sprite'] });
store.set('q/old.sprite', v3meta);
store.set('q/old.sprite.frame-fx', new Uint8Array(new Uint16Array([1, 0, 0, 2, 0, 1, 1, 0]).buffer));
store.set('q/old.sprite.undo', new Uint8Array(8));
const migrated = await loadProject(backend, 'q');
assert.deepEqual(migrated.files[0].frames[0].layerPixels.map((b) => Array.from(b)), [[1, 0, 0, 2], [0, 1, 1, 0]], 'v3 pixels survive migration');
assert.equal(store.get('q/old.sprite').version, 4, 'meta rewritten as v4');
assert.equal(store.has('q/old.sprite.frame-fx'), false, 'combined chunk deleted');
assert.equal(store.has('q/old.sprite.undo'), false, 'undo chunk deleted');
assert.equal([...store.keys()].filter((k) => k.startsWith('q/old.sprite.frame-fx-')).length, 2, 'one chunk per layer written');
const again = await loadProject(backend, 'q');
assert.deepEqual(again.files[0].frames[0].layerPixels.map((b) => Array.from(b)), [[1, 0, 0, 2], [0, 1, 1, 0]], 'and reload as v4');
console.log('persistence-skip ok');
