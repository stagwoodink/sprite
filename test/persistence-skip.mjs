import assert from 'node:assert/strict';
import { createSpriteFile, addFrame } from '../src/sprite-file.js';
import { setPixel } from '../src/canvas-model.js';
import { saveProject, loadProject } from '../src/persistence.js';

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
console.log('persistence-skip ok');
