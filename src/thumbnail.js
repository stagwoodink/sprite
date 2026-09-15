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

  const scaleX = w / file.visibleWidth, scaleY = heightPx / file.visibleHeight;
  for (let y = 0; y < file.visibleHeight; y++) {
    for (let x = 0; x < file.visibleWidth; x++) {
      const c = pixels[y * file.canvasWidth + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
    }
  }

  if (dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, heightPx);
  }
}
