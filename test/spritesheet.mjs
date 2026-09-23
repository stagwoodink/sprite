import assert from 'node:assert/strict';
import { detectGrid, buildSheetFile } from '../src/spritesheet.js';
import { getPixel } from '../src/canvas-model.js';

// 2 cells of 3x3, 1px margin, 1px gutter -> 9 wide x 5 tall
const W = 9, H = 5;
const data = new Uint8ClampedArray(W * H * 4);
const put = (x, y, r, g, b) => { const p = (y * W + x) * 4; data.set([r, g, b, 255], p); };
for (const x0 of [1, 5]) for (let y = 1; y < 4; y++) for (let x = x0; x < x0 + 3; x++) put(x, y, 250, 10, 10);
put(1, 1, 0, 0, 240); // corner of the first cell only

const grid = detectGrid(data, W, H);
assert.deepEqual(grid, { cellW: 3, cellH: 3, margin: 1, spacing: 1 });

const file = buildSheetFile('sheet', { data, width: W, height: H }, grid, 'frames', ['#FF0000', '#0000FF']);
assert.equal(file.frames.length, 2);
const view = (i) => ({ width: 3, height: 3, stride: 3, pixels: file.frames[i].layerPixels[0], colors: file.colors });
assert.equal(getPixel(view(0), 0, 0), '#0000FF', 'snaps to nearest chip');
assert.equal(getPixel(view(1), 0, 0), '#FF0000');

const layers = buildSheetFile('sheet', { data, width: W, height: H }, grid, 'layers', ['#FF0000']);
assert.equal(layers.layers.length, 2);
assert.equal(layers.frames.length, 1);

assert.equal(detectGrid(new Uint8ClampedArray(W * H * 4).fill(255), W, H), null, 'no gutters -> ask');
console.log('spritesheet ok');
