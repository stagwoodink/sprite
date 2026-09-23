import assert from 'node:assert/strict';
import { createSpriteFile } from '../src/sprite-file.js';
import { setPixel } from '../src/canvas-model.js';
import { saveProject, loadProject } from '../src/persistence.js';

const store = new Map(), writes = [];
const backend = {
  async write(path, data) { writes.push(path.join('/')); store.set(path.join('/'), structuredClone(data)); },
  async read(path) { return store.get(path.join('/')) ?? null; },
  async readBytes(path) { return store.get(path.join('/')) ?? null; },
  async list() { return []; },
  async delete() {},
};
const project = {
  id: 'p', name: 'P', palette: { chips: ['#000000'], primary: '#000000' }, activeFileIndex: 0, collections: [],
  files: [createSpriteFile('a', 4, 4), createSpriteFile('b', 4, 4)],
};
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.endsWith('.sprite.bin')).length, 2, 'cold save writes both');

writes.length = 0;
await saveProject(backend, project);
assert.equal(writes.filter((w) => w.startsWith('p/')).length, 0, 'unchanged project writes nothing');

const f = project.files[0];
setPixel({ width: 4, height: 4, stride: 4, pixels: f.frames[0].layerPixels[0], colors: f.colors }, 0, 0, '#FF0000');
await saveProject(backend, project);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')).sort(), ['p/a.sprite', 'p/a.sprite.bin'], 'only the edited file is rewritten');

writes.length = 0;
project.files[1].layers[0].visible = false; // no pixel change: JSON only
await saveProject(backend, project);
assert.deepEqual(writes.filter((w) => w.startsWith('p/')), ['p/b.sprite'], 'metadata-only change skips the sidecar');

const back = await loadProject(backend, 'p');
writes.length = 0;
await saveProject(backend, back);
assert.equal(writes.filter((w) => w.startsWith('p/')).length, 1, 'reloaded project rewrites only project.json');
console.log('persistence-skip ok');
