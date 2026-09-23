// Golden-output guard for selection transforms (rotate needs a DOM canvas
// and is checked by hand). Each result grid is hashed against the value the
// pre-optimisation implementation produced.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createColorTable, setPixel } from '../src/canvas-model.js';
import { extract, stamp, flip, shiftMask, moveContent, maskBounds } from '../src/selection-ops.js';
import { maskFromRect, emptyMask } from '../src/selection.js';

const W = 16, H = 12, STRIDE = 20;
function scene() {
  const m = { width: W, height: H, stride: STRIDE, pixels: new Uint16Array(STRIDE * H), colors: createColorTable() };
  const hexes = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  for (let y = 2; y <= 8; y++) for (let x = 3; x <= 10; x++) if ((x * 3 + y * 5) % 4) setPixel(m, x, y, hexes[(x + y) % 4]);
  return m;
}
const hash = (m, mask) => {
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push((m.colors[m.pixels[y * STRIDE + x]] || '-') + (mask && mask[y * W + x] ? '*' : ''));
  return createHash('sha1').update(cells.join(',')).digest('hex').slice(0, 12);
};
const sel = (m) => maskFromRect(m, 4, 3, 9, 7);
const clipHash = (c) => createHash('sha1').update(JSON.stringify(c)).digest('hex').slice(0, 12);

const cases = {
  'bounds': () => clipHash(maskBounds(scene(), sel(scene()))),
  'bounds of empty': () => String(maskBounds(scene(), emptyMask(scene()))),
  // the clipboard's shape is private: judge it by what stamping it produces
  'extract': () => { const m = scene(), c = extract(m, sel(m)), blank = scene(); blank.pixels.fill(0); stamp(blank, c, 1, 1, true); return hash(blank) + ':' + c.w + 'x' + c.h; },
  'flip horizontal': () => { const m = scene(); flip(m, sel(m), 'horizontal'); return hash(m); },
  'flip vertical': () => { const m = scene(); flip(m, sel(m), 'vertical'); return hash(m); },
  'stamp replace': () => { const m = scene(); const c = extract(m, sel(m)); stamp(m, c, 0, 0, true); return hash(m); },
  'stamp overlay off canvas': () => { const m = scene(); const c = extract(m, sel(m)); stamp(m, c, 13, 10, false); return hash(m); },
  'shift': () => { const m = scene(); return hash(m, shiftMask(m, sel(m), 3, -2)); },
  'shift past edge': () => { const m = scene(); return hash(m, shiftMask(m, sel(m), 8, 8)); },
  'move content': () => { const m = scene(); const mask = moveContent(m, sel(m), 2, 3); return hash(m, mask); },
  'move content past edge': () => { const m = scene(); const mask = moveContent(m, sel(m), -6, 9); return hash(m, mask); },
};

const GOLDEN = {
  'bounds': '01364e19bec2',
  'bounds of empty': 'null',
  'extract': 'e152966da4a6:6x5',
  'flip horizontal': '9706b5812a1f',
  'flip vertical': '71466939651d',
  'stamp replace': '0da5dad12837',
  'stamp overlay off canvas': 'f41b89e0facc',
  'shift': '4d51eab7500a',
  'shift past edge': '69d1185086a7',
  'move content': 'e1ec819dc424',
  'move content past edge': 'bf615e70d9c1',
};
// PRINT=1 regenerates the table after a deliberate behaviour change.
for (const [name, run] of Object.entries(cases)) {
  const h = run();
  if (process.env.PRINT) console.log(`  '${name}': '${h}',`);
  else assert.equal(h, GOLDEN[name], name);
}

// a cached bounding box must not outlive the mask it describes
const m = scene(), mask = sel(m);
assert.deepEqual(maskBounds(m, mask), { minX: 4, minY: 3, maxX: 9, maxY: 7, w: 6, h: 5 });
const moved = shiftMask(m, mask, 2, 1);
assert.deepEqual(maskBounds(m, moved), { minX: 6, minY: 4, maxX: 11, maxY: 8, w: 6, h: 5 }, 'shifted mask has its own box');
assert.deepEqual(maskBounds(m, shiftMask(m, moved, 8, 0)), { minX: 14, minY: 4, maxX: 15, maxY: 8, w: 2, h: 5 }, 'clipped at the edge');
console.log('selection-ops ok');
