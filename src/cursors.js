// Modifier-mode cursor icons (design-doc §8: "hard requirement, not a nice-to-have").
// Small inline SVGs so no asset files/build step are needed (luddite).
const ACCENT = '%23F2F2F0';

function svgCursor(inner, size, hotspot) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${inner}</svg>`;
  return `url("data:image/svg+xml,${svg}") ${hotspot.x} ${hotspot.y}`;
}

const DOT = svgCursor(
  `<circle cx='8' cy='8' r='2' fill='${ACCENT}'/><circle cx='8' cy='8' r='6' fill='none' stroke='${ACCENT}' stroke-width='1'/>`,
  16, { x: 8, y: 8 },
);

const BRUSH = svgCursor(
  `<circle cx='9' cy='9' r='7' fill='none' stroke='${ACCENT}' stroke-width='1' stroke-dasharray='2,2'/>`,
  18, { x: 9, y: 9 },
);

const BUCKET = svgCursor(
  `<path d='M3 9 L9 3 L15 9 L9 15 Z' fill='none' stroke='${ACCENT}' stroke-width='1.5'/><circle cx='9' cy='9' r='1.5' fill='${ACCENT}'/>`,
  18, { x: 3, y: 15 },
);

const MARQUEE = svgCursor(
  `<rect x='2' y='2' width='12' height='12' fill='none' stroke='${ACCENT}' stroke-width='1' stroke-dasharray='2,2'/>`,
  16, { x: 2, y: 2 },
);

// Diamond motif, per the design system's suggestion to reuse the Stagwood
// mark's rotated-square shape for status/selection glyphs (§1, iconography note).
const WAND = svgCursor(
  `<path d='M9 1 L17 9 L9 17 L1 9 Z' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 9, y: 9 },
);

const LASSO = svgCursor(
  `<path d='M3 9 Q3 3 9 3 T15 9 Q15 14 9 14 Q5 14 4 11' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 3, y: 9 },
);

export const CURSORS = {
  paint: `${DOT}, crosshair`,
  antialiasedPaint: `${BRUSH}, crosshair`,
  fill: `${BUCKET}, cell`,
  antialiasedFill: `${BUCKET}, cell`,
  selectRect: `${MARQUEE}, crosshair`,
  selectWand: `${WAND}, crosshair`,
  selectPolygon: `${LASSO}, crosshair`,
  pan: 'grab',
  panning: 'grabbing',
};

export function cursorForMode(mode) {
  return CURSORS[mode] || CURSORS.paint;
}
