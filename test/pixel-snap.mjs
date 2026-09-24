import assert from 'node:assert/strict';
import { snapFontSize, snapLength } from '../src/pixel-snap.js';

// at 1x and 2x the stylesheet's sizes are already whole cells
assert.equal(snapFontSize(16, 1), 16);
assert.equal(snapFontSize(16, 2), 16);
assert.equal(snapFontSize(32, 1), 32);
// whatever the ratio, the result is a whole number of 16px cells in device pixels
for (const dpr of [0.75, 0.9, 1, 1.015625, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
  for (const base of [16, 32]) {
    const device = snapFontSize(base, dpr) * dpr;
    assert.ok(Math.abs(device / 16 - Math.round(device / 16)) < 1e-9, `${base}px at ${dpr}x -> ${device} device px`);
    assert.ok(device >= 16, 'never smaller than one cell');
  }
}
// and it stays close to what was asked for
assert.ok(Math.abs(snapFontSize(16, 1.015625) - 16) < 0.5);

// lengths land on whole device pixels, keep their sign, and never vanish
for (const dpr of [1, 1.015625, 1.25, 1.5, 2]) {
  for (const base of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, -2]) {
    const device = snapLength(base, dpr) * dpr;
    assert.ok(Math.abs(device - Math.round(device)) < 1e-9, `${base}px at ${dpr}x`);
    assert.ok(Math.abs(device) >= 1);
    assert.equal(Math.sign(device), Math.sign(base));
  }
}
assert.equal(snapLength(0, 1.25), 0);
assert.equal(snapLength(4, 1), 4);
console.log('pixel-snap ok');
