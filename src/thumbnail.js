// Shared checkerboard + pixel-content thumbnail painter, used by both the
// layers panel (§4.2) and the timeline's frame strip (§6) — "frames and
// layer thumbnails share this treatment since they're visually the same
// kind of object."
const CHECKER_LIGHT = '#DEDEDE';
const CHECKER_DARK = '#CFCFCF';

export function paintThumbnail(canvasEl, file, pixels, heightPx, { dim } = {}) {
  const w = Math.max(1, Math.round(heightPx * file.visibleWidth / file.visibleHeight));
  canvasEl.width = w;
  canvasEl.height = heightPx;
  const ctx = canvasEl.getContext('2d');

  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(0, 0, w, heightPx);
  ctx.fillStyle = CHECKER_DARK;
  ctx.fillRect(0, 0, w / 2, heightPx / 2);
  ctx.fillRect(w / 2, heightPx / 2, w / 2, heightPx / 2);

  // `pixels` is a packed-RGBA visible-size buffer (sprite-file.js
  // composites): one bulk copy + one scaled blit, not a fillRect per pixel.
  const src = document.createElement('canvas');
  src.width = file.visibleWidth;
  src.height = file.visibleHeight;
  const img = new ImageData(file.visibleWidth, file.visibleHeight);
  new Uint32Array(img.data.buffer).set(pixels);
  src.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, w, heightPx);

  if (dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, heightPx);
  }
}
