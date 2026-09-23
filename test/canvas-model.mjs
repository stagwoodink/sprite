// Golden-output guard for the pixel-writing paths: each scenario's final
// grid (as hex, so it is independent of colour-table order) is hashed and
// compared against the value the pre-optimisation implementation produced.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createColorTable, paintAt, floodFill, setPixel, setPixelIndex, colorIndex } from '../src/canvas-model.js';
import { maskFromWand } from '../src/selection.js';

const W = 16, H = 12, STRIDE = 20; // stride != width: a shrunk canvas
function fresh() {
  const colors = createColorTable();
  return { width: W, height: H, stride: STRIDE, pixels: new Uint16Array(STRIDE * H), colors };
}
const hash = (m) => {
  const rows = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rows.push(m.colors[m.pixels[y * STRIDE + x]] || '-');
  return createHash('sha1').update(rows.join(',')).digest('hex').slice(0, 12);
};
const rect = (m, x0, y0, x1, y1, hex) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintAt(m, x, y, { size: 1, color: hex }); };
const diamond = () => { const k = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.abs(x - 8) + Math.abs(y - 6) <= 5) k[y * W + x] = 1; return k; };

const cases = {
  'soft brush over solid': () => {
    const m = fresh(); rect(m, 0, 0, W - 1, H - 1, '#204080');
    paintAt(m, 5, 5, { size: 7, antialiased: true, color: '#ff8000' });
    paintAt(m, 6, 6, { size: 4, antialiased: true, color: '#00ff40' });
    return m;
  },
  'soft brush dithered and masked': () => {
    const m = fresh(); rect(m, 0, 0, W - 1, H - 1, '#101010');
    paintAt(m, 8, 6, { size: 9, antialiased: true, color: '#e0e0ff', dither: true, mask: diamond() });
    return m;
  },
  'square, erase, mirror': () => {
    const m = fresh();
    paintAt(m, 3, 3, { size: 3, color: '#ff0000', symmetry: 'both' });
    paintAt(m, 4, 3, { size: 2, erase: true, symmetry: 'h' });
    paintAt(m, 10, 2, { size: 4, antialiased: true, color: '#0000ff', symmetry: 'v' });
    return m;
  },
  'flood fill plain': () => {
    const m = fresh(); rect(m, 4, 0, 4, H - 1, '#ffffff');
    floodFill(m, 0, 0, '#ff0000');
    return m;
  },
  'flood fill dither': () => {
    const m = fresh(); floodFill(m, 2, 2, '#00ff00', false, undefined, true); return m;
  },
  'flood fill antialiased': () => {
    const m = fresh(); rect(m, 5, 2, 10, 8, '#3050a0'); floodFill(m, 6, 3, '#ffcc00', true); return m;
  },
  'flood fill masked': () => {
    const m = fresh(); floodFill(m, 8, 6, '#aa00aa', false, diamond()); return m;
  },
  'wand': () => {
    const m = fresh(); rect(m, 3, 3, 9, 7, '#ffffff'); rect(m, 5, 4, 6, 5, '#000000');
    const inside = maskFromWand(m, 4, 4), hole = maskFromWand(m, 5, 4), outside = maskFromWand(m, 0, 0);
    const merged = fresh();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      merged.pixels[y * STRIDE + x] = inside[i] ? 1 : hole[i] ? 2 : outside[i] ? 3 : 4;
    }
    merged.colors.push('#111111', '#222222', '#333333', '#444444');
    return merged;
  },
};

const GOLDEN = {
  'soft brush over solid': '98fd2185723f',
  'soft brush dithered and masked': '83a83f93279b',
  'square, erase, mirror': '9c5af5755fc5',
  'flood fill plain': 'a4dded5b4910',
  'flood fill dither': 'ea78ea5c1063',
  'flood fill antialiased': '33e9ee0c8c89',
  'flood fill masked': 'a31cc2f4a147',
  'wand': 'a8c335f7d659',
};
// PRINT=1 regenerates the table after a deliberate behaviour change.
for (const [name, run] of Object.entries(cases)) {
  const h = hash(run());
  if (process.env.PRINT) console.log(`  '${name}': '${h}',`);
  else assert.equal(h, GOLDEN[name], name);
}

// setPixelIndex writes what setPixel would, and a rejected setPixel never grows the table
const a = fresh(), b = fresh();
setPixel(a, 2, 3, '#abcdef');
setPixelIndex(b, 2, 3, colorIndex(b.colors, '#abcdef'));
assert.equal(hash(a), hash(b));
const before = a.colors.length;
setPixel(a, -1, 0, '#123456');
setPixel(a, 0, 0, '#123456', new Uint8Array(W * H));
assert.equal(a.colors.length, before, 'out-of-bounds/masked write interns nothing');
console.log('canvas-model ok');
