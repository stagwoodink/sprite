import assert from 'node:assert/strict';
import { createSpriteFile, addLayer, deleteLayer, addFrame } from '../src/sprite-file.js';
import { setPixel } from '../src/canvas-model.js';
import { commitCommand, undo, redo, snapshotLayers } from '../src/undo.js';

const f = createSpriteFile('t', 4, 4);
addFrame(f);
const buf0 = f.frames[0].layerPixels[0];
const layerChange = (mutate) => {
  const before = snapshotLayers(f); mutate(); const after = snapshotLayers(f);
  commitCommand(f, { type: 'layers', before, after });
};
addLayer(f);
setPixel({ width: 4, height: 4, pixels: f.frames[0].layerPixels[1], colors: f.colors }, 0, 0, '#FF0000');
layerChange(() => deleteLayer(f, 1));
assert.equal(f.layers.length, 1);
undo(f, null);
assert.equal(f.layers.length, 2);
assert.equal(f.frames[0].layerPixels[1][0] !== 0, true); // deleted layer's pixels came back, not cloned
assert.equal(f.frames[0].layerPixels[0], buf0);
redo(f, null);
assert.equal(f.layers.length, 1);
console.log('undo-layers ok');
