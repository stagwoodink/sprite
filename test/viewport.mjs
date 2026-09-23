import assert from 'node:assert/strict';
import { regionView } from '../src/viewport.js';

const model = { width: 64, height: 64 };
const v = regionView(model, 640, 640, { minX: 0, minY: 0, w: 16, h: 16 });
assert.equal(v.zoom, 40, 'a 16px box fills a 640px view');
// region centre (8,8) must land on the viewport centre: ox + 8*zoom = 320
const ox = Math.floor((640 - 64 * v.zoom) / 2) + v.panX;
assert.ok(Math.abs(ox + 8 * v.zoom - 320) < 1);
console.log('viewport ok');
