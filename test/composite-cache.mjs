import assert from 'node:assert/strict';
import { createSpriteFile, addLayer, compositeFrameAt } from '../src/sprite-file.js';
import { setPixel } from '../src/canvas-model.js';

const f = createSpriteFile('c', 4, 4);
addLayer(f);
const view = (li) => ({ width: 4, height: 4, stride: 4, pixels: f.frames[0].layerPixels[li], colors: f.colors });
const a = compositeFrameAt(f, 0);
assert.equal(compositeFrameAt(f, 0), a, 'idle call hits the cache');
setPixel(view(1), 1, 1, '#FF0000');
const b = compositeFrameAt(f, 0);
assert.notEqual(b[5], 0, 'edit shows up');
f.layers[1].visible = false;
assert.equal(compositeFrameAt(f, 0)[5], 0, 'visibility change invalidates');
f.layers[1].visible = true;
setPixel(view(0), 1, 1, '#00FF00');
assert.equal(compositeFrameAt(f, 0)[5] & 255, 255, 'top layer red wins over lower green');
console.log('composite-cache ok');
