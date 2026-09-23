import assert from 'node:assert/strict';
import { parsePalette, paletteNameFromFile } from '../src/palette-parse.js';

const gpl = 'GIMP Palette\nName: Test\nColumns: 4\n# comment\n255   0   0 Red\n  0 255   0 Green\n';
assert.deepEqual(parsePalette(gpl), ['#FF0000', '#00FF00']);

const hex = '1a1c2c\n5d275d\n#B13E53\n';
assert.deepEqual(parsePalette(hex), ['#1A1C2C', '#5D275D', '#B13E53']);

const jasc = 'JASC-PAL\r\n0100\r\n2\r\n0 0 255\r\n255 255 255\r\n';
assert.deepEqual(parsePalette(jasc), ['#0000FF', '#FFFFFF']);

const big = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(6, '0')).join('\n');
assert.equal(parsePalette(big).length, 256, 'truncates at the chip cap');
assert.deepEqual(parsePalette('000000\n000000'), ['#000000'], 'duplicates dropped');
assert.equal(paletteNameFromFile('lospec/sweet 24.hex'), 'lospec_sweet 24');
console.log('palette-parse ok');
