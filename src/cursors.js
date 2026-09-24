// Cursor icons (design-doc §8: "hard requirement, not a nice-to-have"): pixel-art SVGs in
// src/cursors/, each with its hotspot in art pixels. A file is the 6x6 drawing in pure white
// and nothing else: inverted-cursor.js draws it with a difference blend, so white is what
// makes the result an exact inversion of whatever is underneath, on any background.
const FILE_CURSORS = {
  arrow: [0.5, 2.5],
  click: [1.5, 2.5],
  text: [1.5, 3.5],
  'drag-vertical': [1.5, 3],
  grab: [2.5, 3.5],
  crosshair: [2.5, 3.5],
  dropper: [0.5, 1.5],
  draw: [2.5, 3.5],
  paint: [0.5, 1.5],
  select: [0.5, 1.5],
  magic: [1.5, 2.5],
  erase: [2.5, 3.5],
  rectangle: [2.5, 4],
  triangle: [2.5, 4],
  circle: [3, 3],
  fill: [2.5, 3.5],
};
const GRID = 6, CSS_PX_PER_ART_PX = 3;

// A cursor image is resampled unless each art pixel covers whole device pixels,
// so the files are rescaled to the nearest whole number for this screen's pixel
// ratio. Rebuilt when the ratio changes.
const scaled = {}; // name -> { src, hotspot } at the current ratio
let sources = null; // name -> svg text, fetched once

async function fetchSources() {
  const names = Object.keys(FILE_CURSORS);
  const texts = await Promise.all(names.map((n) => fetch(`src/cursors/${n}.svg`).then((r) => r.text())));
  sources = Object.fromEntries(names.map((n, i) => [n, texts[i]]));
}

function rescale() {
  const dpr = window.devicePixelRatio || 1;
  const cssPerArtPx = Math.max(1, Math.round(CSS_PX_PER_ART_PX * dpr)) / dpr;
  const size = GRID * cssPerArtPx;
  for (const [name, [hx, hy]] of Object.entries(FILE_CURSORS)) {
    const svg = sources[name].replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    scaled[name] = { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, hotspot: { x: hx * cssPerArtPx, y: hy * cssPerArtPx } };
  }
}

/** Loads the cursor files and keeps them pixel-sharp: call once, before the first cursor is shown. */
export async function watchCursorScale() {
  await fetchSources();
  rescale();
  const listen = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { rescale(); listen(); }, { once: true });
  listen();
}

const FILE_MODES = { place: 'draw', selectRect: 'select', selectWand: 'magic' }; // tool modes named differently from their file

/** `{ src, hotspot }` for a cursor by name: a file cursor ('arrow', 'grab', ...) or a tool mode ('place', 'selectRect', ...). */
export function cursorIcon(name) {
  return scaled[FILE_MODES[name] || name] || scaled.arrow;
}
