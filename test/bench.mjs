// Times the hot paths on a worst-case File (256x256, 20 layers, 100 frames).
// Not an assertion test: run it before and after a perf change and compare.
import { createSpriteFile, addLayer, addFrame, compositeFrameAt, resizeCanvas } from '../src/sprite-file.js';
import { setPixel, snapshotPixels, diffFromSnapshot, floodFill } from '../src/canvas-model.js';
import { maskFromWand } from '../src/selection.js';
import { encodeFile } from '../src/sprite-format.js';
import { saveProject } from '../src/persistence.js';

const SIZE = 256, LAYERS = 20, FRAMES = 100;
const file = createSpriteFile('bench', SIZE, SIZE);
while (file.layers.length < LAYERS) addLayer(file, 'L' + file.layers.length, file.layerGroups[0].id);
while (file.frames.length < FRAMES) addFrame(file);
file.activeFrameIndex = 0;
file.activeLayerIndex = 0;

const view = () => ({ width: SIZE, height: SIZE, stride: SIZE, pixels: file.frames[0].layerPixels[0], colors: file.colors });
for (let i = 0; i < 2000; i++) setPixel(view(), (i * 7) % SIZE, (i * 13) % SIZE, i % 2 ? '#FF0000' : '#00FF00');

const rows = [];
function time(name, iterations, fn) {
  fn(); // warm up the JIT so the first sample is not the outlier
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  rows.push([name, (performance.now() - t0) / iterations]);
}
async function timeAsync(name, iterations, fn) {
  await fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  rows.push([name, (performance.now() - t0) / iterations]);
}

time('compositeFrameAt (cache hit)', 200, () => compositeFrameAt(file, 0));
let n = 0;
time('compositeFrameAt (after 1px edit)', 200, () => {
  setPixel(view(), 0, 0, n++ % 2 ? '#0000FF' : '#FFFF00');
  compositeFrameAt(file, 0);
});
time('snapshotPixels + diffFromSnapshot (1px edit)', 200, () => {
  const snap = snapshotPixels(view());
  setPixel(view(), 1, 1, n++ % 2 ? '#0000FF' : '#FFFF00');
  diffFromSnapshot(view(), snap);
});
time('floodFill (full canvas)', 5, () => floodFill({ ...view(), pixels: file.frames[1].layerPixels[0] }, 0, 0, n++ % 2 ? '#123456' : '#654321'));
time('maskFromWand (full canvas)', 5, () => maskFromWand({ ...view(), pixels: file.frames[2].layerPixels[0] }, 0, 0));
time('encodeFile + every chunk bytes()', 3, () => {
  const enc = encodeFile(file);
  for (const c of enc.frames) c.bytes();
});

const store = new Map();
const backend = {
  async write(path, data) { store.set(path.join('/'), data); }, // no structuredClone: it would time the fake, not the app
  async read(path) { return store.get(path.join('/')) ?? null; },
  async readBytes(path) { return store.get(path.join('/')) ?? null; },
  async list() { return []; },
  async delete(path) { store.delete(path.join('/')); },
};
const project = {
  id: 'p', name: 'P', palette: { chips: ['#000000'], primary: '#000000' }, activeFileIndex: 0, collections: [],
  files: [file],
};
await saveProject(backend, project);
await timeAsync('saveProject (1px edit, 1 file)', 5, async () => {
  setPixel(view(), 2, 2, n++ % 2 ? '#0000FF' : '#FFFF00');
  await saveProject(backend, project);
});

const small = createSpriteFile('small', 128, 128);
while (small.layers.length < LAYERS) addLayer(small, 'L' + small.layers.length, small.layerGroups[0].id);
while (small.frames.length < FRAMES) addFrame(small);
const t0 = performance.now();
resizeCanvas(small, SIZE, SIZE);
rows.push(['resizeCanvas 128->256 (once)', performance.now() - t0]);

const width = Math.max(...rows.map(([name]) => name.length));
for (const [name, ms] of rows) console.log(name.padEnd(width), ms.toFixed(3).padStart(10), 'ms');
