import assert from 'node:assert/strict';
import { createSpriteFile } from '../src/sprite-file.js';
import { paintAt, getPixel } from '../src/canvas-model.js';

const make = (w, h) => {
  const f = createSpriteFile('s', w, h);
  return { width: w, height: h, stride: w, pixels: f.frames[0].layerPixels[0], colors: f.colors };
};
const painted = (m) => {
  const out = [];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (getPixel(m, x, y)) out.push(`${x},${y}`);
  return out.sort();
};

const odd = make(7, 7); // axis at the centre cell
paintAt(odd, 1, 2, { size: 1, color: '#FF0000', symmetry: 'both' });
assert.deepEqual(painted(odd), ['1,2', '1,4', '5,2', '5,4']);

const even = make(8, 8);
paintAt(even, 1, 1, { size: 2, color: '#FF0000', symmetry: 'h' }); // covers x 0..1
assert.deepEqual(painted(even), ['0,0', '0,1', '1,0', '1,1', '6,0', '6,1', '7,0', '7,1'].sort());
console.log('symmetry ok');
