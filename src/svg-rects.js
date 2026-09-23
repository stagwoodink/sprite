import { packedToHex } from './canvas-model.js';

// Appends one <rect> per horizontal run of identical opaque colour in a
// w*h packed-pixel board, placed at cell offset (ox, oy) and scaled. A
// rect per pixel made a 256x256 sprite a 65k-element file most vector
// editors choke on; pixel art has long runs. Parts are joined once by the
// caller, not concatenated one rope at a time.
export function pushRects(parts, pixels, w, h, ox, oy, scale) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      const c = pixels[y * w + x];
      if (!c) { x++; continue; }
      let end = x + 1;
      while (end < w && pixels[y * w + end] === c) end++;
      parts.push(`<rect x="${(ox + x) * scale}" y="${(oy + y) * scale}" width="${(end - x) * scale}" height="${scale}" fill="${packedToHex(c)}"/>`);
      x = end;
    }
  }
}
