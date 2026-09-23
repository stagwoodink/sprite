import assert from 'node:assert/strict';
import { pushRects } from '../src/svg-rects.js';
import { hexToPacked } from '../src/canvas-model.js';

const R = hexToPacked('#ff0000'), B = hexToPacked('#0000ff');
const W = 6, H = 4;
// full-width row, single-pixel column, gaps, and a colour change inside a row
const board = Uint32Array.from([
  R, R, R, R, R, R,
  B, 0, 0, 0, 0, 0,
  B, 0, R, R, B, B,
  B, 0, 0, 0, 0, R,
]);
const parts = [];
pushRects(parts, board, W, H, 0, 0, 1);
assert.equal(parts.length, 7, 'runs, not pixels');
assert.match(parts[0], /x="0" y="0" width="6" height="1" fill="#ff0000"/, 'a full-width row is one rect');

// painting the rects back onto a grid reproduces the board exactly, at an offset and scale
const scale = 3, ox = 2, oy = 5;
const out = [];
pushRects(out, board, W, H, ox, oy, scale);
const painted = new Map();
for (const r of out) {
  const [, x, y, w, h, fill] = r.match(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#\w+)"/);
  for (let dy = 0; dy < h; dy += scale) for (let dx = 0; dx < w; dx += scale) painted.set(`${+x + dx},${+y + dy}`, fill);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const want = board[y * W + x] ? (board[y * W + x] === R ? '#ff0000' : '#0000ff') : undefined;
  assert.equal(painted.get(`${(ox + x) * scale},${(oy + y) * scale}`), want, `cell ${x},${y}`);
}
assert.equal(painted.size, board.filter(Boolean).length, 'nothing painted on transparent cells');
console.log('svg-rects ok');
