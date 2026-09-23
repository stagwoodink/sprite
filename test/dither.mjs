import assert from 'node:assert/strict';
import { createSpriteFile } from '../src/sprite-file.js';
import { floodFill, getPixel } from '../src/canvas-model.js';

const f = createSpriteFile('d', 6, 6);
const m = { width: 6, height: 6, stride: 6, pixels: f.frames[0].layerPixels[0], colors: f.colors };
floodFill(m, 0, 0, '#FF0000', false, undefined, true);
for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
  assert.equal(getPixel(m, x, y), (x + y) % 2 ? null : '#FF0000', `checkerboard at ${x},${y}`);
}
console.log('dither ok');
