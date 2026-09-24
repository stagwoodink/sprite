// Modifier-mode cursor icons (design-doc §8: "hard requirement, not a nice-to-have").
// Small inline SVGs so no asset files/build step are needed (luddite).
// Pure white: inverted-cursor.js draws these with a difference blend, so white is what
// makes the result an exact inversion of whatever is underneath.
const ACCENT = '%23FFFFFF';

function svgCursor(inner, size, hotspot) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${inner}</svg>`;
  return { src: `data:image/svg+xml,${svg}`, hotspot };
}

// Every cursor below shares one 18x18 canvas and 1.5 stroke-width so no
// tool's reticle reads as bigger/heavier than another's.
const DOT = svgCursor(
  `<circle cx='9' cy='9' r='2' fill='${ACCENT}'/><circle cx='9' cy='9' r='7' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 9, y: 9 },
);

const BRUSH = svgCursor(
  `<circle cx='9' cy='9' r='7' fill='none' stroke='${ACCENT}' stroke-width='1.5' stroke-dasharray='2,2'/>`,
  18, { x: 9, y: 9 },
);

const BUCKET = svgCursor(
  `<path d='M3 9 L9 3 L15 9 L9 15 Z' fill='none' stroke='${ACCENT}' stroke-width='1.5'/><circle cx='9' cy='9' r='1.5' fill='${ACCENT}'/>`,
  18, { x: 3, y: 15 },
);

const MARQUEE = svgCursor(
  `<rect x='2' y='2' width='14' height='14' fill='none' stroke='${ACCENT}' stroke-width='1.5' stroke-dasharray='2,2'/>`,
  18, { x: 2, y: 2 },
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

// Hold Delete + click/drag to erase (§9.2, extended on request).
const ERASER = svgCursor(
  `<rect x='2' y='2' width='14' height='14' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 9, y: 9 },
);

// Shape tools (Q/W/E, on request).
const SHAPE_RECT = svgCursor(
  `<rect x='2' y='2' width='14' height='14' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 2, y: 2 },
);
const SHAPE_TRIANGLE = svgCursor(
  `<path d='M9 2 L16 16 L2 16 Z' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 2, y: 16 },
);
const SHAPE_CIRCLE = svgCursor(
  `<circle cx='9' cy='9' r='7' fill='none' stroke='${ACCENT}' stroke-width='1.5'/>`,
  18, { x: 2, y: 2 },
);

const ICONS = {
  place: DOT, // precision: hard-edged square stamp
  paint: BRUSH, // fluid: soft antialiased circular brush
  fill: BUCKET,
  antialiasedFill: BUCKET,
  selectRect: MARQUEE,
  selectWand: WAND,
  selectPolygon: LASSO,
  erase: ERASER,
  shaperect: SHAPE_RECT,
  shapetriangle: SHAPE_TRIANGLE,
  shapecircle: SHAPE_CIRCLE,
};

/** `{ src, hotspot }` for a tool mode's cursor icon; unknown modes fall back to Place. */
export function cursorIcon(mode) {
  return ICONS[mode] || ICONS.place;
}
