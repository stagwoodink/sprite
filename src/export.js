import { compositeFrame, compositeFrameAt, compositeLayerAt } from './sprite-file.js';
import { packedToHex } from './canvas-model.js';
import { encodeFile } from './sprite-format.js';
import { ensureLoaded } from './persistence.js';
import { computeArtboardLayout } from './renderer.js';
import { zipSync } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';
import { GIFEncoder, quantize, applyPalette } from 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';

// Export (§14): PNG, GIF, SVG per File/Collection, plus a whole-Project
// .sprite archive. Scale is an integer upscale, nearest-neighbor — no
// smoothing, so pixel edges stay hard.

// --- progress + retry/error handling, shared by every export entry point --

// main.js's tool tag subscribes here to show a progress bar while an
// export runs, and a quiet "(export error)" marker if one ultimately
// fails — see runExport below for the full lifecycle.
let progressListener = null;
export function onExportProgress(fn) { progressListener = fn; }
function reportProgress(status) { if (progressListener) progressListener(status); }

const MAX_ATTEMPTS = 4; // 1 initial try + 3 silent retries

// A transient hiccup (a GC pause, a momentarily-busy disk cache) most
// often just works on a second try, so failures retry silently — no
// interruption, the progress bar just keeps running. Only once every
// attempt has failed does this decide whether the user can actually do
// anything about it: a message worth prompting for (free up space, lower
// the scale) versus an unexpected internal error with no useful next
// step, where interrupting with a dialog that says nothing actionable
// would be worse than just flagging it quietly.
function fixableMessage(err) {
  if (err && err.name === 'QuotaExceededError') return { short: 'storage full', detail: 'Export failed: not enough free storage space. Free up space and try again.' };
  if (err instanceof RangeError) return { short: 'too large', detail: 'Export failed: the result was too large to build. Try a smaller scale.' };
  return null;
}

async function runExport(work) {
  reportProgress({ active: true, fraction: 0, error: null });
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await work((fraction) => reportProgress({ active: true, fraction }));
      reportProgress({ active: false });
      return;
    } catch (err) {
      lastErr = err;
      console.error(`Export failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
    }
  }
  const fixable = fixableMessage(lastErr);
  reportProgress({
    active: false,
    error: fixable
      ? { short: fixable.short, detail: fixable.detail, actionable: true }
      : { short: 'export error', detail: `Export failed: ${lastErr?.message || lastErr}`, actionable: false },
  });
}

// --- low-level rasterization, shared by every raster export path -------

function pixelsToCanvas(pixels, w, h, scale, bgColor) {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = w * scale;
  canvasEl.height = h * scale;
  const ctx = canvasEl.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const img = new ImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels); // packed RGBA words, see canvas-model.js hexToPacked
  src.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(src, 0, 0, w * scale, h * scale);
  return canvasEl;
}

function canvasToBlob(canvasEl, mime) {
  return new Promise((resolve) => canvasEl.toBlob(resolve, mime));
}

// Hand-rolled: one <rect> per pixel — no library needed at this pixel-grid scale.
function pixelsToSvgString(pixels, w, h, scale) {
  let rects = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixels[y * w + x];
      if (!c) continue;
      rects += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${packedToHex(c)}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w * scale} ${h * scale}">${rects}</svg>`;
}

// Flat RGBA bytes (4 per pixel, upscaled), the shape gifenc's quantize/
// applyPalette both require — `null` cells (this app's own "transparent"
// value) become alpha 0.
function pixelsToRgba(pixels, w, h, scale) {
  const out = new Uint8ClampedArray(w * scale * h * scale * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixels[y * w + x];
      const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
      const a = c ? 255 : 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = x * scale + sx, py = y * scale + sy;
          const i = (py * w * scale + px) * 4;
          out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        }
      }
    }
  }
  return out;
}

// --- download plumbing ---------------------------------------------------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A file name that already exists in the app (a layer's, a file's) isn't
// guaranteed clean for a filesystem — strip path separators and other
// characters most filesystems (and zip readers) choke on.
function sanitizeName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'untitled';
}

// Anything past this is large enough it's worth a "are you sure" beat
// before committing the browser to holding it all in memory and writing it
// out — a plain, blocking confirm is enough for a rare warning gate like
// this, no need for a bespoke modal. Declining isn't a failure — it just
// returns, same as any other "nothing to do" no-op elsewhere in the app,
// so runExport's retry loop never touches this path.
const LARGE_EXPORT_BYTES = 25 * 1024 * 1024;
function confirmIfLarge(totalBytes, itemDesc) {
  if (totalBytes <= LARGE_EXPORT_BYTES) return true;
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  return window.confirm(`This export (${itemDesc}) is about ${mb}MB. Continue?`);
}

// Single-file result: just download it (after the size check). Multi-file
// result: zip it first (fflate, no existing zip writer in this codebase to
// reuse — see the audit that led here), *then* size-check the zip itself
// (compression can land either side of the raw total), then download.
async function downloadSingle(blob, filename) {
  if (!confirmIfLarge(blob.size, filename)) return;
  downloadBlob(blob, filename);
}

async function downloadZip(entries, zipFilename) {
  const files = {};
  for (const { path, blob } of entries) {
    files[path] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  if (!confirmIfLarge(blob.size, zipFilename)) return;
  downloadBlob(blob, zipFilename);
}

// One or many blobs in: exactly one download out, zipped when there's more
// than one — the one rule every export target (File/Collection/Project)
// below follows, so none of them need to special-case "did this produce
// one file or several."
async function downloadResults(entries, zipFilename) {
  if (entries.length === 1) return downloadSingle(entries[0].blob, entries[0].path);
  return downloadZip(entries, zipFilename);
}

// --- GIF -------------------------------------------------------------

// One shared palette across every frame (quantized from all of them
// together) — every frame draws from the identical global color table, so
// a color already used doesn't shift or flicker between frames the way
// separately-quantized per-frame palettes could.
function encodeGif(rgbaFrames, w, h, delayMs, onFrame) {
  const combined = new Uint8ClampedArray(rgbaFrames.length * rgbaFrames[0].length);
  rgbaFrames.forEach((f, i) => combined.set(f, i * f.length));
  const palette = quantize(combined, 256);

  const gif = GIFEncoder();
  rgbaFrames.forEach((rgba, i) => {
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, w, h, { palette, delay: delayMs, repeat: 0 });
    onFrame?.((i + 1) / rgbaFrames.length);
  });
  gif.finish();
  return gif.bytes();
}

// A File's own GIF: one plain image if it has just the one Frame, an
// animated loop (at `fps`) if it has more — no separate mode/picker for
// this, unlike PNG/SVG's canvas/layers/frames choice below, since a GIF is
// inherently a sequence-or-not already.
async function exportFileGif(file, scale, fps, onProgress) {
  const w = file.visibleWidth, h = file.visibleHeight;
  const rgbaFrames = file.frames.map((_, i) => {
    onProgress((i + 1) / file.frames.length * 0.5);
    return pixelsToRgba(compositeFrameAt(file, i), w, h, scale);
  });
  const bytes = encodeGif(rgbaFrames, w * scale, h * scale, Math.round(1000 / fps), (f) => onProgress(0.5 + f * 0.4));
  await downloadResults([{ path: `${file.name}.gif`, blob: new Blob([bytes], { type: 'image/gif' }) }], `${file.name}.gif`);
}

// --- File export ----------------------------------------------------------

// `mode`: 'canvas' (today's single flattened image, the active Frame) |
// 'layers' (every Layer of the active Frame, each its own file, in a
// subfolder named after the File — named by the Layer) | 'frames' (every
// Frame's full composite, same shape as 'layers'). PNG/SVG only — GIF has
// its own all-frames-or-one behavior above instead.
export function exportFile(file, opts) {
  return runExport((onProgress) => exportFileImpl(file, opts, onProgress));
}

async function exportFileImpl(file, { format, scale = 1, mode = 'canvas', fps = 8 } = {}, onProgress) {
  await ensureLoaded(file);
  if (format === 'gif') return exportFileGif(file, scale, fps, onProgress);

  const toBlob = async (pixels, w, h) => {
    if (format === 'svg') return new Blob([pixelsToSvgString(pixels, w, h, scale)], { type: 'image/svg+xml' });
    const canvasEl = pixelsToCanvas(pixels, w, h, scale, null);
    return canvasToBlob(canvasEl, 'image/png');
  };
  const ext = format === 'svg' ? 'svg' : 'png';
  const w = file.visibleWidth, h = file.visibleHeight;

  if (mode === 'canvas') {
    const blob = await toBlob(compositeFrame(file), w, h);
    onProgress(0.9);
    return downloadResults([{ path: `${file.name}.${ext}`, blob }], `${file.name}.${ext}`);
  }

  const dir = sanitizeName(file.name);
  const items = mode === 'layers' ? file.layers : file.frames;
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const pixels = mode === 'layers' ? compositeLayerAt(file, i, file.activeFrameIndex) : compositeFrameAt(file, i);
    const blob = await toBlob(pixels, w, h);
    const name = mode === 'layers' ? sanitizeName(file.layers[i].name) : `frame-${i + 1}`;
    entries.push({ path: `${dir}/${name}.${ext}`, blob });
    onProgress((i + 1) / items.length * 0.9);
  }
  return downloadResults(entries, `${dir}.zip`);
}

// --- Collection export -----------------------------------------------------

// `artboards`: [{ name, width, height, pixels }] — the same shape
// main.js's groupArtboards() already builds for the on-screen group grid
// (one entry per member File, its own current composite). `mode`: 'sheet'
// (one combined raster laid out in the same grid the collection view
// shows, 2px gap — fixed, independent of `scale`) | 'files' (each artboard
// as its own file, zipped). SVG has no `mode` at all — always one combined
// sheet, vector, since a "files" SVG export would just be File export's
// canvas mode repeated per member, already covered there.
const SHEET_GAP = 2; // export px, independent of scale — not the live view's ARTBOARD_GAP

export function exportCollection(collectionName, artboards, opts) {
  return runExport((onProgress) => exportCollectionImpl(collectionName, artboards, opts, onProgress));
}

async function exportCollectionImpl(collectionName, artboards, { format, scale = 1, mode = 'sheet', gridset } = {}, onProgress) {
  // An empty Collection has nothing to lay out — computeArtboardLayout
  // degrades to a 0x0 sheet for zero artboards, and canvas.toBlob() on a
  // 0x0 canvas resolves with a null Blob rather than throwing, which would
  // otherwise crash downstream in downloadResults with nothing to show for
  // why. Nothing to export, so nothing happens.
  if (!artboards.length) { onProgress(1); return; }
  if (format === 'svg') { exportCollectionSheetSvg(collectionName, artboards, scale, gridset); onProgress(1); return; }
  if (mode === 'files') return exportCollectionFiles(collectionName, artboards, format, scale, onProgress);
  return exportCollectionSheet(collectionName, artboards, format, scale, gridset, onProgress);
}

// Same column/row math the on-screen group grid uses (computeArtboardLayout,
// § renderer.js) but with a fixed 2px export gap instead of the live view's
// own — see SHEET_GAP's comment.
function layoutSheetCells(artboards, gridset) {
  const layout = computeArtboardLayout(artboards, gridset, SHEET_GAP);
  const cells = artboards.map((board, i) => {
    const col = i % layout.cols, row = Math.floor(i / layout.cols);
    return {
      board,
      x: col * layout.stepX + Math.floor((layout.cellW - board.width) / 2),
      y: row * layout.stepY + Math.floor((layout.cellH - board.height) / 2),
    };
  });
  return { cells, layout };
}

async function exportCollectionSheet(collectionName, artboards, format, scale, gridset, onProgress) {
  const { cells, layout } = layoutSheetCells(artboards, gridset);
  const w = layout.totalW, h = layout.totalH;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = w * scale;
  canvasEl.height = h * scale;
  const ctx = canvasEl.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  cells.forEach(({ board, x, y }, i) => {
    for (let py = 0; py < board.height; py++) {
      for (let px = 0; px < board.width; px++) {
        const c = board.pixels[py * board.width + px];
        if (!c) continue;
        ctx.fillStyle = packedToHex(c);
        ctx.fillRect((x + px) * scale, (y + py) * scale, scale, scale);
      }
    }
    onProgress((i + 1) / cells.length * 0.6);
  });
  if (format === 'gif') {
    const rgba = new Uint8ClampedArray(w * scale * h * scale * 4);
    const imgData = ctx.getImageData(0, 0, w * scale, h * scale).data;
    rgba.set(imgData);
    const bytes = encodeGif([rgba], w * scale, h * scale, 0, (f) => onProgress(0.6 + f * 0.3));
    return downloadResults([{ path: `${collectionName}.gif`, blob: new Blob([bytes], { type: 'image/gif' }) }], `${collectionName}.gif`);
  }
  const blob = await canvasToBlob(canvasEl, 'image/png');
  onProgress(0.9);
  return downloadResults([{ path: `${collectionName}.png`, blob }], `${collectionName}.png`);
}

function exportCollectionSheetSvg(collectionName, artboards, scale, gridset) {
  const { cells, layout } = layoutSheetCells(artboards, gridset);
  const w = layout.totalW * scale, h = layout.totalH * scale;
  let rects = '';
  for (const { board, x, y } of cells) {
    for (let py = 0; py < board.height; py++) {
      for (let px = 0; px < board.width; px++) {
        const c = board.pixels[py * board.width + px];
        if (!c) continue;
        rects += `<rect x="${(x + px) * scale}" y="${(y + py) * scale}" width="${scale}" height="${scale}" fill="${packedToHex(c)}"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
  return downloadResults([{ path: `${collectionName}.svg`, blob: new Blob([svg], { type: 'image/svg+xml' }) }], `${collectionName}.svg`);
}

async function exportCollectionFiles(collectionName, artboards, format, scale, onProgress) {
  const dir = sanitizeName(collectionName);
  const entries = [];
  for (let i = 0; i < artboards.length; i++) {
    const board = artboards[i];
    const blob = format === 'gif'
      ? new Blob([encodeGif([pixelsToRgba(board.pixels, board.width, board.height, scale)], board.width * scale, board.height * scale, 0)], { type: 'image/gif' })
      : await canvasToBlob(pixelsToCanvas(board.pixels, board.width, board.height, scale, null), 'image/png');
    entries.push({ path: `${dir}/${sanitizeName(board.name)}.${format === 'gif' ? 'gif' : 'png'}`, blob });
    onProgress((i + 1) / artboards.length * 0.9);
  }
  return downloadResults(entries, `${dir}.zip`);
}

// --- Project export ---------------------------------------------------

// The whole Project as one portable .sprite archive (a zip, same shape
// persistence.js already writes to storage — project.json plus one
// <name>.sprite per File — bundled into a single downloadable file instead
// of storage-backend records). The Project's palette (this app has exactly
// one shared palette per Project — see project.js's createProject — so
// "every palette used" is just that one object) rides along inside
// project.json, same as it already does in storage.
export function exportProjectSprite(project) {
  return runExport((onProgress) => exportProjectSpriteImpl(project, onProgress));
}

async function exportProjectSpriteImpl(project, onProgress) {
  // `<name>.sprite` paths deliberately unsanitized here — same convention
  // persistence.js's own storage already uses for these exact files
  // (`fileName + '.sprite'`, storage.js), so `fileNames` in project.json
  // and each entry's own path always agree on import, byte for byte.
  const files = {
    'project.json': new TextEncoder().encode(JSON.stringify({
      name: project.name, palette: project.palette, activeFileIndex: project.activeFileIndex,
      collections: project.collections, fileNames: project.files.map((f) => f.name),
    })),
  };
  for (const [i, file] of project.files.entries()) {
    await ensureLoaded(file);
    const { meta, frames, undo } = encodeFile(file);
    delete meta.references; // reference images never leave the app
    files[`${file.name}.sprite`] = new TextEncoder().encode(JSON.stringify(meta));
    for (const frame of frames) files[`${file.name}.sprite.frame-${frame.id}`] = frame.bytes();
    files[`${file.name}.sprite.undo`] = undo.bytes();
    onProgress((i + 1) / project.files.length * 0.5);
  }
  onProgress(0.7);
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/octet-stream' });
  onProgress(0.9);
  if (!confirmIfLarge(blob.size, `${project.name}.sprite`)) return;
  downloadBlob(blob, `${project.name}.sprite`);
}
