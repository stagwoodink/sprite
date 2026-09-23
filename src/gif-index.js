// Streaming GIF encoding over packed-RGBA composites (canvas-model.js's
// hexToPacked). Holds one frame's index array at a time, never every frame's
// RGBA at once — at scale 4 and 100 frames that was gigabytes.

const MAX_COLORS = 256;
const SAMPLE_FRAMES = 8; // frames fed to the quantizer when the colours don't fit

// Every distinct colour across all frames as a GIF palette, or null past
// `max`. Keyed on RGB alone: a transparent pixel (word 0) and opaque black
// share a slot, as they always did in the exported GIF, which has no alpha.
function exactPalette(frameCount, wordsAt, max) {
  const slot = new Map(); // rgb -> palette index
  const palette = [];
  for (let i = 0; i < frameCount; i++) {
    for (const word of wordsAt(i)) {
      const rgb = word & 0xffffff;
      if (slot.has(rgb)) continue;
      if (palette.length >= max) return null;
      slot.set(rgb, palette.length);
      palette.push([rgb & 255, (rgb >> 8) & 255, rgb >> 16]);
    }
  }
  return { palette, slot };
}

// Nearest-neighbour upscale of a 1-byte-per-pixel index array.
export function upscaleIndex(index, w, h, scale) {
  if (scale === 1) return index;
  const out = new Uint8Array(w * scale * h * scale);
  for (let y = 0; y < h; y++) {
    const row = y * scale * w * scale;
    for (let x = 0; x < w; x++) out.fill(index[y * w + x], row + x * scale, row + (x + 1) * scale);
    for (let sy = 1; sy < scale; sy++) out.copyWithin(row + sy * w * scale, row, row + w * scale);
  }
  return out;
}

// `wordsAt(i)` gives frame i's composite (w*h packed words); `gifenc` is the
// library's { GIFEncoder, quantize, applyPalette }, injected so this stays
// testable without the CDN import.
export function encodeGifStream({ frameCount, wordsAt, w, h, scale, delayMs, onFrame, gifenc: { GIFEncoder, quantize, applyPalette } }) {
  const exact = exactPalette(frameCount, wordsAt, MAX_COLORS);
  let palette = exact?.palette;
  if (!palette) {
    // Too many colours for a verbatim palette: one shared palette from a
    // sample, so colours still can't drift between frames.
    const picks = Array.from({ length: Math.min(SAMPLE_FRAMES, frameCount) }, (_, k) => Math.floor(k * frameCount / Math.min(SAMPLE_FRAMES, frameCount)));
    const sample = new Uint8Array(picks.length * w * h * 4);
    picks.forEach((frame, k) => sample.set(new Uint8Array(wordsAt(frame).buffer), k * w * h * 4));
    palette = quantize(sample, MAX_COLORS);
  }

  const gif = GIFEncoder();
  for (let i = 0; i < frameCount; i++) {
    const words = wordsAt(i);
    let index;
    if (exact) {
      index = new Uint8Array(words.length);
      for (let p = 0; p < words.length; p++) index[p] = exact.slot.get(words[p] & 0xffffff);
    } else {
      index = applyPalette(new Uint8Array(words.buffer, words.byteOffset, words.byteLength), palette);
    }
    gif.writeFrame(upscaleIndex(index, w, h, scale), w * scale, h * scale, { palette, delay: delayMs, repeat: 0 });
    onFrame?.((i + 1) / frameCount);
  }
  gif.finish();
  return gif.bytes();
}
