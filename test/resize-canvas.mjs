import assert from 'node:assert/strict';
import { createSpriteFile, addLayer, addFrame, resizeCanvas } from '../src/sprite-file.js';

// Reference: the per-pixel copy the row copy replaced.
function growReference(pixels, oldW, oldH, newW, newH) {
  const next = new Uint16Array(newW * newH);
  const ox = Math.floor((newW - oldW) / 2), oy = Math.floor((newH - oldH) / 2);
  for (let y = 0; y < oldH; y++) for (let x = 0; x < oldW; x++) { const v = pixels[y * oldW + x]; if (v) next[(y + oy) * newW + (x + ox)] = v; }
  return next;
}

const f = createSpriteFile('r', 5, 4);
addLayer(f); addFrame(f); addFrame(f);
let seed = 7;
for (const frame of f.frames) for (const buf of frame.layerPixels) for (let i = 0; i < buf.length; i++) buf[i] = (seed = (seed * 31 + 11) % 97) % 3 ? seed : 0;
const original = f.frames.map((fr) => fr.layerPixels.map((b) => b.slice()));

// grow by an odd difference on each axis
const want = original.map((layers) => layers.map((b) => growReference(b, 5, 4, 8, 7)));
resizeCanvas(f, 8, 7);
assert.equal(f.canvasWidth, 8); assert.equal(f.canvasHeight, 7);
f.frames.forEach((fr, i) => fr.layerPixels.forEach((b, li) => assert.deepEqual(Array.from(b), Array.from(want[i][li]), `frame ${i} layer ${li}`)));

// shrink only narrows the visible window; growing back restores everything
resizeCanvas(f, 3, 2);
assert.equal(f.canvasWidth, 8, 'buffer keeps its size when shrinking');
const kept = f.frames.map((fr) => fr.layerPixels.map((b) => Array.from(b)));
resizeCanvas(f, 8, 7);
f.frames.forEach((fr, i) => fr.layerPixels.forEach((b, li) => assert.deepEqual(Array.from(b), kept[i][li], 'shrink and regrow loses nothing')));
console.log('resize-canvas ok');
