import { linePixels } from './canvas-model.js';

// Shape tool outlines (Q/W/E, hold Shift to constrain proportions): pure
// point-generators, decoupled from how/where they get stamped onto a model.

export function rectOutline(x0, y0, x1, y1) {
  const pts = [];
  pts.push(...linePixels(x0, y0, x1, y0));
  pts.push(...linePixels(x1, y0, x1, y1));
  pts.push(...linePixels(x1, y1, x0, y1));
  pts.push(...linePixels(x0, y1, x0, y0));
  return pts;
}

// Isoceles triangle inscribed in the drag's bounding box: apex at top
// center, base along the bottom corners.
export function triangleOutline(x0, y0, x1, y1) {
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  const apex = [Math.round((left + right) / 2), top];
  const bl = [left, bottom], br = [right, bottom];
  const pts = [];
  pts.push(...linePixels(apex[0], apex[1], bl[0], bl[1]));
  pts.push(...linePixels(bl[0], bl[1], br[0], br[1]));
  pts.push(...linePixels(br[0], br[1], apex[0], apex[1]));
  return pts;
}

// Midpoint ellipse, inscribed in the drag's bounding box.
export function ellipseOutline(x0, y0, x1, y1) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.max(1, Math.abs(x1 - x0) / 2);
  const ry = Math.max(1, Math.abs(y1 - y0) / 2);
  const pts = [];
  const steps = Math.max(16, Math.round(2 * Math.PI * Math.max(rx, ry)));
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + rx * Math.cos(a));
    const y = Math.round(cy + ry * Math.sin(a));
    if (!prev || prev[0] !== x || prev[1] !== y) {
      if (prev) pts.push(...linePixels(prev[0], prev[1], x, y));
      else pts.push([x, y]);
      prev = [x, y];
    }
  }
  return pts;
}

// Shift-hold constrains the drag to equal width/height (a square bounding
// box), anchored at the drag's start corner.
export function constrainSquare(x0, y0, x1, y1) {
  const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const x = x1 >= x0 ? x0 + side : x0 - side;
  const y = y1 >= y0 ? y0 + side : y0 - side;
  return [x, y];
}

export const SHAPE_OUTLINES = {
  rect: rectOutline,
  triangle: triangleOutline,
  circle: ellipseOutline,
  line: linePixels,
};
