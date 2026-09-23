import assert from 'node:assert/strict';
import { createSpriteFile, addLayer, addFrame, compositeFrameAt } from '../src/sprite-file.js';
import { setPixel, getPixel, blendPixel, packedToHex } from '../src/canvas-model.js';
import { encodeFile, parseFile } from '../src/sprite-format.js';

// In-memory stand-in for the chunk store: read(kind, id) over an encoded file.
const readerFor = (enc) => (kind, id) => (kind === 'frame' ? enc.frames.find((fr) => fr.id === id).bytes() : kind === 'undo' ? enc.undo.bytes() : null);

// v1 file: plain arrays of hex/null.
const v1 = {
  name: 'old', layers: [{ name: 'L', visible: true, opacity: 1, order: 2000 }], layerGroups: [], activeLayerIndex: 0, activeFrameIndex: 0,
  canvasWidth: 2, canvasHeight: 2, visibleWidth: 2, visibleHeight: 2, undoStack: [[1]], redoStack: [],
  frames: [{ layerPixels: [['#ff0000', null, '#00FF00', '#ff0000']] }],
};
const m = parseFile(structuredClone(v1), null);
const view = (f) => ({ width: 2, height: 2, stride: 2, pixels: f.frames[0].layerPixels[0], colors: f.colors });
const want = ['#FF0000', null, '#00FF00', '#FF0000'];
assert.deepEqual([0, 1, 2, 3].map((i) => getPixel(view(m), i % 2, i >> 1)), want);
assert.equal(m.undoStack.length, 0);
assert.equal(m.colors.length, 3); // transparent slot + 2 distinct colors

// v2 round trip, including an off-palette blended color and a second frame/layer.
const f = createSpriteFile('rt', 4, 3);
addLayer(f); addFrame(f);
const v = { width: 4, height: 3, stride: 4, pixels: f.frames[1].layerPixels[1], colors: f.colors };
setPixel(v, 1, 1, '#123456');
blendPixel(v, 1, 1, '#FFFFFF', 0.5);
const enc = encodeFile(f);
const back = parseFile(JSON.parse(JSON.stringify(enc.meta)), readerFor(enc));
assert.equal(enc.meta.version, 3);
assert.deepEqual(back.colors, f.colors);
assert.deepEqual(back.frames.map((fr) => fr.id), f.frames.map((fr) => fr.id), 'frame ids survive');
back.frames.forEach((fr, i) => fr.layerPixels.forEach((buf, li) => assert.deepEqual(Array.from(buf), Array.from(f.frames[i].layerPixels[li]))));
assert.equal(packedToHex(compositeFrameAt(back, 1)[4 + 1]).toUpperCase(), getPixel(v, 1, 1));
console.log('sprite-format ok');

// pixel undo commands survive encode/decode as typed diffs
import { diffFromSnapshot, applyDiff } from '../src/canvas-model.js';
const u = createSpriteFile('u', 4, 4);
const uv = { width: 4, height: 4, stride: 4, pixels: u.frames[0].layerPixels[0], colors: u.colors };
const snap = uv.pixels.slice();
setPixel(uv, 2, 1, '#ABCDEF');
u.undoStack.push({ type: 'pixelEdit', ...diffFromSnapshot(uv, snap) });
const uenc = encodeFile(u);
const ub = parseFile(JSON.parse(JSON.stringify(uenc.meta)), readerFor(uenc));
assert.equal(ub.undoStack.length, 1);
applyDiff({ ...uv, pixels: ub.frames[0].layerPixels[0], colors: ub.colors }, ub.undoStack[0].before);
assert.equal(ub.frames[0].layerPixels[0][6], 0, 'undo diff clears the pixel');
console.log('undo diff ok');

// v2 (single sidecar) files still load
const v2meta = { version: 2, name: 'v2', layers: [{ name: 'L', visible: true, opacity: 1, order: 2000 }], layerGroups: [], activeLayerIndex: 0, activeFrameIndex: 0, canvasWidth: 2, canvasHeight: 2, visibleWidth: 2, visibleHeight: 2, colors: [null, '#111111', '#222222'], frameCount: 1, undoStack: [], redoStack: [] };
const v2 = parseFile(v2meta, (kind) => (kind === 'bin' ? new Uint8Array(new Uint16Array([1, 0, 0, 2]).buffer) : null));
assert.deepEqual(Array.from(v2.frames[0].layerPixels[0]), [1, 0, 0, 2]);
console.log('v2 compat ok');
