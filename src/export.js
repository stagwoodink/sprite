import { compositeFrame } from './pixi-file.js';

// Export (§14): PNG, JPG, SVG, PDF, JSON, .pixi. Scale is an integer
// upscale, nearest-neighbor — no smoothing, so pixel edges stay hard.
export function renderExportCanvas(file, scale, bgColor) {
  const pixels = compositeFrame(file);
  const w = file.visibleWidth * scale, h = file.visibleHeight * scale;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  for (let y = 0; y < file.visibleHeight; y++) {
    for (let x = 0; x < file.visibleWidth; x++) {
      const c = pixels[y * file.visibleWidth + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvasEl;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPng(file, scale) {
  const canvasEl = renderExportCanvas(file, scale, null);
  canvasEl.toBlob((blob) => download(blob, `${file.name}.png`), 'image/png');
}

export async function exportJpg(file, scale, bgColor) {
  const canvasEl = renderExportCanvas(file, scale, bgColor || '#FFFFFF');
  canvasEl.toBlob((blob) => download(blob, `${file.name}.jpg`), 'image/jpeg');
}

// Hand-rolled: one <rect> per pixel — no library needed at this pixel-grid scale.
export function exportSvg(file, scale) {
  const pixels = compositeFrame(file);
  const w = file.visibleWidth * scale, h = file.visibleHeight * scale;
  let rects = '';
  for (let y = 0; y < file.visibleHeight; y++) {
    for (let x = 0; x < file.visibleWidth; x++) {
      const c = pixels[y * file.visibleWidth + x];
      if (!c) continue;
      rects += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${c}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
  download(new Blob([svg], { type: 'image/svg+xml' }), `${file.name}.svg`);
}

// PDF is not a native pixel format — this embeds the rendered raster as an
// image on one page, via pdf-lib (CDN, per the design doc's tech stack §3).
export async function exportPdf(file, scale, bgColor) {
  const canvasEl = renderExportCanvas(file, scale, bgColor || '#FFFFFF');
  const pngData = await new Promise((resolve) => canvasEl.toBlob((b) => b.arrayBuffer().then(resolve), 'image/png'));
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngData);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  const bytes = await pdf.save();
  download(new Blob([bytes], { type: 'application/pdf' }), `${file.name}.pdf`);
}

export function exportJson(file) {
  download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${file.name}.json`);
}

// A full project-file export (distinct from the app's own autosave
// location) — exports the current File, not the whole Project.
export function exportPixi(file) {
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${file.name}.pixi`);
}
