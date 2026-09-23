import assert from 'node:assert/strict';
import { encodeGifStream, upscaleIndex } from '../src/gif-index.js';

// upscaleIndex repeats every cell scale x scale
assert.deepEqual(Array.from(upscaleIndex(Uint8Array.of(1, 2, 3, 4), 2, 2, 2)), [1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);

// a fake gifenc that records what it is asked to write
function fakeGifenc() {
  const frames = [];
  return {
    frames,
    GIFEncoder: () => ({ writeFrame: (index, w, h, opts) => frames.push({ index, w, h, opts }), finish() {}, bytes: () => new Uint8Array(0) }),
    quantize: (data, max) => { frames.quantizedFrom = data.length; return Array.from({ length: 3 }, (_, i) => [i, i, i]); },
    applyPalette: (data) => new Uint8Array(data.length / 4).fill(2),
  };
}
const RED = 0xff0000ff, BLUE = 0xffff0000; // packed R,G,B,A little-endian words

// few colours: the palette is exact and shared, indices follow it, output is scaled
const f0 = Uint32Array.of(RED, 0, BLUE, RED), f1 = Uint32Array.of(BLUE, BLUE, RED, 0);
const g = fakeGifenc();
const progress = [];
encodeGifStream({ frameCount: 2, wordsAt: (i) => [f0, f1][i], w: 2, h: 2, scale: 2, delayMs: 100, onFrame: (f) => progress.push(f), gifenc: g });
const palette = g.frames[0].opts.palette;
assert.deepEqual(palette, [[255, 0, 0], [0, 0, 0], [0, 0, 255]], 'exact colours, transparent shares black');
assert.equal(g.frames[0].opts.palette, g.frames[1].opts.palette, 'one palette for every frame');
assert.equal(g.frames[0].w, 4);
assert.deepEqual(Array.from(g.frames[0].index.slice(0, 4)), [0, 0, 1, 1], 'frame 0 row 0, scaled');
assert.deepEqual(Array.from(g.frames[1].index.slice(0, 4)), [2, 2, 2, 2], 'frame 1 row 0, scaled');
assert.deepEqual(progress, [0.5, 1]);
assert.equal(g.frames.quantizedFrom, undefined, 'the quantizer is not needed');

// more than 256 colours: quantize from a sample of frames, not all of them
const many = (seed) => Uint32Array.from({ length: 400 }, (_, i) => (0xff000000 | ((i + seed) * 40503)) >>> 0);
const g2 = fakeGifenc();
encodeGifStream({ frameCount: 20, wordsAt: (i) => many(i), w: 20, h: 20, scale: 1, delayMs: 50, gifenc: g2 });
assert.equal(g2.frames.length, 20, 'every frame is written');
assert.equal(g2.frames.quantizedFrom, 8 * 400 * 4, 'only 8 sampled frames reach the quantizer');
assert.ok(g2.frames.every((fr) => fr.opts.palette === g2.frames[0].opts.palette));
console.log('gif-index ok');
