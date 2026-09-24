import assert from 'node:assert/strict';
import { contentBounds, unionBounds, cropPixels } from '../src/trim.js';

const RED = 0xFF0000FF;
const px = new Uint32Array(5 * 4);
assert.equal(contentBounds(px, 5, 4), null, 'a blank canvas has no content');
px[1 * 5 + 2] = RED;
px[2 * 5 + 3] = RED;
const box = contentBounds(px, 5, 4);
assert.deepEqual(box, { x0: 2, y0: 1, x1: 4, y1: 3 });
assert.deepEqual([...cropPixels(px, 5, box)], [RED, 0, 0, RED]);
assert.deepEqual(unionBounds(box, { x0: 0, y0: 2, x1: 3, y1: 4 }), { x0: 0, y0: 1, x1: 4, y1: 4 });
assert.deepEqual(unionBounds(null, box), box);
assert.equal(unionBounds(null, null), null);
px[0] = 0x00FFFFFF; // colored but fully transparent
assert.deepEqual(contentBounds(px, 5, 4), box, 'alpha 0 does not count');
console.log('trim ok');
