import assert from 'node:assert/strict';
import { createSpriteFile, addLayer, addFrame, compositeFrameAt } from '../src/sprite-file.js';
import { setPixel, getPixel, blendPixel, packedToHex } from '../src/canvas-model.js';
import { encodeFile, parseFile } from '../src/sprite-format.js';

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
const { meta, bytes } = encodeFile(f);
const back = parseFile(JSON.parse(JSON.stringify(meta)), bytes);
assert.equal(meta.version, 2);
assert.deepEqual(back.colors, f.colors);
back.frames.forEach((fr, i) => fr.layerPixels.forEach((buf, li) => assert.deepEqual(buf, f.frames[i].layerPixels[li])));
assert.equal(packedToHex(compositeFrameAt(back, 1)[4 + 1]).toUpperCase(), getPixel(v, 1, 1));
console.log('sprite-format ok');
