import assert from 'node:assert/strict';
import { pushOutlines } from '../src/svg-outlines.js';
import { hexToPacked } from '../src/canvas-model.js';

const R = hexToPacked('#ff0000'), B = hexToPacked('#0000ff');

// Sum of shoelace areas over every sub-contour of a path (H/V moves only).
function area(d) {
  let total = 0;
  for (const sub of d.split('Z').filter(Boolean)) {
    const pts = [];
    let x = 0, y = 0;
    for (const [, cmd, n, m] of sub.matchAll(/([MHV])(-?\d+)(?: (-?\d+))?/g)) {
      if (cmd === 'M') { x = +n; y = +m; } else if (cmd === 'H') x = +n; else y = +n;
      pts.push([x, y]);
    }
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      total += x1 * y2 - x2 * y1;
    }
  }
  return total / 2;
}
const run = (board, w, h, ox = 0, oy = 0, scale = 1) => { const parts = []; pushOutlines(parts, Uint32Array.from(board), w, h, ox, oy, scale); return parts; };

let p = run([R], 1, 1);
assert.equal(p.length, 1);
assert.match(p[0], /d="M0 0H1V1H0Z"/, 'one pixel is one square');

p = run([R, R, R, R], 2, 2);
assert.match(p[0], /d="M0 0H2V2H0Z"/, 'a block merges to one rectangle with no inner seams');

// ring with a hole: the hole is a second contour and the net area is the ring's pixel count
const ring = [R, R, R, R, 0, R, R, R, R];
p = run(ring, 3, 3);
assert.equal(p[0].split('Z').length - 1, 2, 'outer contour plus hole');
assert.equal(Math.abs(area(/d="([^"]+)"/.exec(p[0])[1])), 8, 'hole is subtracted');

// two colours, diagonal touch, offset and scale: area still matches pixel count
const mixed = [R, 0, B, 0, R, 0, B, 0, R];
p = run(mixed, 3, 3, 2, 1, 4);
assert.equal(p.length, 2, 'one path per colour');
const red = p.find((s) => s.includes('#ff0000'));
assert.equal(Math.abs(area(/d="([^"]+)"/.exec(red)[1])), 3 * 16, 'three red pixels at scale 4');
assert.match(red, /M8 4/, 'offset applied');
console.log('svg-outlines ok');
