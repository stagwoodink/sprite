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

// dirty-rect path: a second edit must patch the cached buffer, not stale-read it
const g = createSpriteFile('d', 8, 8);
const gv = { width: 8, height: 8, stride: 8, pixels: g.frames[0].layerPixels[0], colors: g.colors };
setPixel(gv, 0, 0, '#111111');
const first = compositeFrameAt(g, 0);
setPixel(gv, 7, 7, '#222222');
setPixel(gv, 0, 0, null);
const second = compositeFrameAt(g, 0);
assert.equal(second[0], 0, 'erased pixel cleared inside dirty rect');
assert.notEqual(second[63], 0, 'new pixel painted');
assert.equal(second, first, 'patched in place');
console.log('dirty-rect ok');

// group visibility and reordering must invalidate without a revision counter
const h = createSpriteFile('g', 4, 4);
const hv = { width: 4, height: 4, stride: 4, pixels: h.frames[0].layerPixels[0], colors: h.colors };
setPixel(hv, 0, 0, '#333333');
assert.notEqual(compositeFrameAt(h, 0)[0], 0);
h.layerGroups[0].visible = false;
assert.equal(compositeFrameAt(h, 0)[0], 0, 'hiding the layer\'s group hides it');
h.layerGroups[0].visible = true;
h.layerGroups[0].order = 5000; // group now sits below the layer: layer leaves it
h.layerGroups[0].visible = false;
assert.notEqual(compositeFrameAt(h, 0)[0], 0, 'moving the group past the layer un-groups it');
console.log('group cache ok');
