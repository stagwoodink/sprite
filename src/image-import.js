// Shared image decode for every feature that reads a user-supplied picture
// (palette extraction, spritesheet import, reference layers). Decoded size
// is width * height * 4 regardless of file size — a 2MB JPEG can be 48MB of
// RGBA — so the byte cap alone bounds nothing; callers also pass a
// `longEdge` and the decode itself downscales (off the main thread, before
// the full-size bitmap is ever held).
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isImageFile(file) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name);
}

async function naturalSize(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error(`${file.name} isn't an image this browser can decode`)); });
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// `longEdge` (optional): downscale so the longer side is at most this, but
// only when the image has more than `abovePixels` pixels. Downscaling is
// nearest-neighbour ('pixelated'): the default smooth filter averages
// neighbours and would invent colors that were never in the image.
export async function decodeImage(file, { longEdge, abovePixels = 0, maxPixels = Infinity } = {}) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is over ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  const { w, h } = await naturalSize(file);
  if (w * h > maxPixels) throw new Error(`${file.name} is too large (${w}x${h})`);
  const shrink = longEdge && Math.max(w, h) > longEdge && w * h > abovePixels ? longEdge / Math.max(w, h) : 1;
  return createImageBitmap(file, shrink < 1
    ? { resizeWidth: Math.max(1, Math.round(w * shrink)), resizeHeight: Math.max(1, Math.round(h * shrink)), resizeQuality: 'pixelated' }
    : undefined);
}

export function bitmapPixels(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
