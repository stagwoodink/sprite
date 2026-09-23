import assert from 'node:assert/strict';
import { extractPalette } from '../src/quantize.js';

const rgba = (colors) => new Uint8ClampedArray(colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

assert.deepEqual(extractPalette(rgba([[255, 0, 0], [0, 255, 0], [255, 0, 0], [9, 9, 9, 10]])), ['#FF0000', '#00FF00'], 'verbatim, transparent ignored');

const many = rgba(Array.from({ length: 200 }, (_, i) => [i, 255 - i, (i * 7) % 256]));
const out = extractPalette(many);
assert.equal(out.length, 32, 'reduces to exactly 32');
assert.ok(out.every((c) => /^#[0-9A-F]{6}$/.test(c)));
console.log('quantize ok');
