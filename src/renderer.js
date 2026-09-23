import { blendColors, packedToHex } from './canvas-model.js';
import { computeViewport } from './viewport.js';

// Shared solid-color set for every backdrop in the app — the app-wide
// chrome background (Shift+U/Ctrl+U), the sprite's own backdrop (`u`,
// alongside its 4th "checker" option), and the group grid's own — same
// three colors and keys (main.js's BG_STEPS/GROUP_APP_BG_STEPS) everywhere,
// so "the canvas and app backdrop are the same color" is a plain string
// comparison, not two separate vocabularies mapped onto each other.
// Pinned to the official Sprite UI palette (style.css's --gray-0..13 ramp,
// spec/ui-colors.png) rather than pure black/white — darkest step (gray-13)
// and second-brightest (gray-1, one step in from pure white gray-0).
const SHADE_BLACK = '#1B1A19'; // --gray-13
const SHADE_GREY = '#808080';
const SHADE_WHITE = '#F3F2F1'; // --gray-1
const BG_SOLID = { black: SHADE_BLACK, grey: SHADE_GREY, white: SHADE_WHITE };
const CHECKER_LIGHT = '#DEDEDE';
const CHECKER_DARK = '#CFCFCF';
const CHECKER_CELL = 4; // canvas pixels per checker square — an 8x8 sprite reads as a 2x2 checkerboard
const GROUP_CHECKER_CELL = 24; // screen px per square — big and chunky, legible at any zoom (not tied to sprite size)
const GRID_ALPHA = 0.35;
const GRID_MIN_SPACING_PX = 6; // never draw grid lines closer together than this on screen
const RULER_THICKNESS = 16;
const RULER_BG = '#1A1A1D';
const RULER_TICK = '#444441';
const RULER_HIGHLIGHT = '#F2F2F0';
const CROSSHAIR_COLOR = '#FFFFFF';
const ONION_BEFORE_TINT = '#BE1425';
const ONION_AFTER_TINT = '#3366FF';

export function render(ctx, model, viewW, viewH, { showGrid, showRuler, selection, onionFrames, brushCursor, cursorPos, canvasBg = 'checker', appBg = 'black' }) {
  const { scale, ox, oy } = computeViewport(model, viewW, viewH);
  const w = model.width * scale;
  const h = model.height * scale;

  // The transparency checkerboard is a base layer for the whole scene,
  // pixel-aligned to the canvas's own grid (not just drawn within the
  // sprite's bounds) — Shift+U's "checker" backdrop and `u`'s "checker"
  // canvas backdrop are then just "leave this alone" instead of each
  // computing their own separately-aligned pattern, so the two can never
  // drift out of sync with each other or with the sprite itself.
  fillCheckerboard(ctx, scale, ox, oy, 0, 0, viewW, viewH);

  if (appBg !== 'checker') {
    ctx.fillStyle = BG_SOLID[appBg] || SHADE_BLACK;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // [U] cycles the sprite's own backdrop — checker (shows transparency: the
  // base layer above, re-exposed here if the app backdrop just covered it),
  // or a solid white/grey/black matte to preview against a flat background.
  if (canvasBg === 'checker') {
    if (appBg !== 'checker') fillCheckerboard(ctx, scale, ox, oy, ox, oy, w, h);
  } else {
    ctx.fillStyle = BG_SOLID[canvasBg];
    ctx.fillRect(ox, oy, w, h);
  }

  if (onionFrames) {
    for (const ghost of onionFrames) drawGhost(ctx, model, ghost, scale, ox, oy);
  }

  drawPixels(ctx, model, scale, ox, oy, w, h);

  if (showGrid) {
    // A reference, not a measurement: at 1 screen-pixel-per-canvas-pixel
    // zoom, one line per pixel is already unreadable clutter. Step goes
    // 1px -> 4px -> 16px -> ... (gridStep) until on-screen line spacing
    // clears a minimum, so it's 1x1 when pixels are big enough to see
    // individually, and coarser as the canvas shrinks.
    const step = gridStep(scale);

    // 'difference' composite inverts whatever is under each line segment —
    // no single fixed color read against every cell, unlike a single
    // whole-canvas-average color that goes invisible on any cell matching
    // that average (e.g. white lines over white background).
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = GRID_ALPHA;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= model.width; x += step) {
      ctx.moveTo(ox + x * scale + 0.5, oy);
      ctx.lineTo(ox + x * scale + 0.5, oy + h);
    }
    for (let y = 0; y <= model.height; y += step) {
      ctx.moveTo(ox, oy + y * scale + 0.5);
      ctx.lineTo(ox + w, oy + y * scale + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (showRuler) {
    const alpha = rulerAlpha(w, h);
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      // Follows the same eased trail as the brush cursor (main.js's
      // animateCursor), not the raw hover position — a tiny, deliberate
      // lag/follow on the highlight for character, not just an instant snap.
      const anchor = rulerAnchor(scale, ox, oy, viewW, viewH);
      const trailPixel = cursorPos && { x: Math.round(cursorPos.x), y: Math.round(cursorPos.y) };
      if (cursorPos) drawCrosshair(ctx, cursorPos, anchor, scale, ox, oy, w, h);
      drawRuler(ctx, model, scale, ox, oy, w, h, viewW, viewH, anchor, trailPixel);
      ctx.restore();
    }
  }

  if (selection) {
    drawSelection(ctx, selection, scale, ox, oy);
  }

  if (brushCursor && cursorPos) {
    // `cursorPos` is the eased trail, not the raw hover pixel — it can lag
    // outside the sprite bounds near an edge before it catches up, so clip
    // rather than trust it to stay in range on its own. Only ever shows
    // within the sprite itself, never over the app background margin.
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, w, h);
    ctx.clip();
    drawBrushCursor(ctx, cursorPos, brushCursor, scale, ox, oy);
    ctx.restore();
  }
}

// Read-only overview of every File in a Collection (§ project panel group
// select), tiled into a grid of small artboards instead of one editable
// canvas — no grid lines, ruler, selection, brush cursor, or onion-skinning,
// since nothing here is editable. Cell size and gap are in *world* units
// (model pixels), laid out once by computeArtboardLayout; render applies one
// shared scale/pan across every cell — a camera over the whole board, not
// each artboard fit independently to its own slot.
const ARTBOARD_GAP = 4; // world px between cells — same value both axes, so the grid reads even

// `gridset`, when given, wraps after that many columns (a Collection's own
// preference, § project panel group select) instead of the default
// auto square-ish layout. `gap` defaults to the on-screen grid's own
// spacing but is a real parameter (not just the module constant) so
// export.js's collection sheet export — which wants a fixed, unscaled 2px
// gap regardless of what the live view uses — can reuse this exact same
// column/row math instead of duplicating it.
export function computeArtboardLayout(artboards, gridset, gap = ARTBOARD_GAP) {
  if (!artboards.length) return { cols: 0, rows: 0, cellW: 0, cellH: 0, stepX: 0, stepY: 0, totalW: 0, totalH: 0 };
  const cellW = Math.max(...artboards.map((b) => b.width));
  const cellH = Math.max(...artboards.map((b) => b.height));
  const cols = gridset > 0 ? Math.min(gridset, artboards.length) : Math.ceil(Math.sqrt(artboards.length));
  const rows = Math.ceil(artboards.length / cols);
  const stepX = cellW + gap;
  const stepY = cellH + gap;
  return { cols, rows, cellW, cellH, stepX, stepY, totalW: cols * stepX - gap, totalH: rows * stepY - gap };
}

export function renderArtboardGrid(ctx, viewW, viewH, artboards, { appBg = 'black', scale = 1, panX = 0, panY = 0, gridset } = {}) {
  // The group grid has no single shared pixel grid spanning the whole
  // viewport (every artboard has its own) to pin a checker to, so this one
  // tiles in plain screen pixels (scale 1, origin 0,0) instead of the
  // model-pixel-aligned tiling fillCheckerboard's other call site uses.
  if (appBg === 'checker') fillCheckerboard(ctx, 1, 0, 0, 0, 0, viewW, viewH, GROUP_CHECKER_CELL);
  else { ctx.fillStyle = BG_SOLID[appBg] || SHADE_BLACK; ctx.fillRect(0, 0, viewW, viewH); }
  if (!artboards.length) return;

  const layout = computeArtboardLayout(artboards, gridset);
  const originX = viewW / 2 - (layout.totalW * scale) / 2 + panX;
  const originY = viewH / 2 - (layout.totalH * scale) / 2 + panY;

  artboards.forEach((board, i) => {
    const col = i % layout.cols, row = Math.floor(i / layout.cols);
    const cellX = originX + col * layout.stepX * scale;
    const cellY = originY + row * layout.stepY * scale;
    const w = board.width * scale, h = board.height * scale;
    const ox = cellX + ((layout.cellW - board.width) / 2) * scale;
    const oy = cellY + ((layout.cellH - board.height) / 2) * scale;

    // No per-artboard fill — every artboard is transparent, showing the one
    // shared backdrop (`appBg`, filled once above) straight through.
    drawPixels(ctx, board, scale, ox, oy, w, h);
  });
}

// Screen-space hit test for renderArtboardGrid's own layout — which
// artboard index (if any) contains (x, y) — computed with the identical
// geometry the render itself uses, so a click always lands on what it
// visually looks like it's over (double-click-to-open, § main.js). -1 if
// none. Options must match whatever the grid was actually rendered with.
export function hitTestArtboardGrid(viewW, viewH, artboards, { scale = 1, panX = 0, panY = 0, gridset } = {}, x, y) {
  if (!artboards.length) return -1;
  const layout = computeArtboardLayout(artboards, gridset);
  const originX = viewW / 2 - (layout.totalW * scale) / 2 + panX;
  const originY = viewH / 2 - (layout.totalH * scale) / 2 + panY;

  for (let i = 0; i < artboards.length; i++) {
    const board = artboards[i];
    const col = i % layout.cols, row = Math.floor(i / layout.cols);
    const cellX = originX + col * layout.stepX * scale;
    const cellY = originY + row * layout.stepY * scale;
    const w = board.width * scale, h = board.height * scale;
    const ox = cellX + ((layout.cellW - board.width) / 2) * scale;
    const oy = cellY + ((layout.cellH - board.height) / 2) * scale;
    if (x >= ox && x < ox + w && y >= oy && y < oy + h) return i;
  }
  return -1;
}

// Difference-blend against a mid-gray background produces a result that's
// itself mid-gray (|255-128| = 127 ≈ 128) — barely distinguishable from what
// it's sitting on. Only a narrow band around 128 is actually a problem
// (extremes invert cleanly), so it's cheaper to special-case that band than
// to replace the blend everywhere.
const CURSOR_MID_LO = 96;
const CURSOR_MID_HI = 160;

function sampleLuma(ctx, sx, sy) {
  try {
    const d = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
  } catch {
    return null; // e.g. a tainted canvas — fall back to plain difference blend
  }
}

// Always-visible brush cursor: painted with a "difference" blend so it
// inverts whatever color is beneath it, rather than a fixed color that
// could vanish against a similar background. `pos` is fractional (the
// eased/trailing display position, not necessarily the exact hovered
// pixel) — main.js's animation loop owns that easing, this just draws
// wherever it's told.
function drawBrushCursor(ctx, pos, { mode, size }, scale, ox, oy) {
  if (mode !== 'place' && mode !== 'paint') return;
  const cx = ox + (pos.x + 0.5) * scale;
  const cy = oy + (pos.y + 0.5) * scale;
  const drawShape = () => {
    if (mode === 'paint') {
      const r = Math.max(0.5, size / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    } else {
      const half = Math.floor(size / 2);
      ctx.beginPath();
      ctx.rect(ox + (pos.x - half) * scale, oy + (pos.y - half) * scale, size * scale, size * scale);
    }
  };

  // Sampled before the fill below touches this pixel — it needs to read
  // whatever's actually underneath, not its own already-blended result.
  const luma = sampleLuma(ctx, cx, cy);

  ctx.save();
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = '#FFFFFF';
  drawShape();
  ctx.fill();
  ctx.restore();

  if (luma !== null && luma >= CURSOR_MID_LO && luma <= CURSOR_MID_HI) {
    // Midrange boost: an unblended outline, pushed toward whichever extreme
    // contrasts more against this specific background, layered on top of
    // the (here, weak) difference fill.
    ctx.save();
    ctx.strokeStyle = luma > 128 ? '#000000' : '#FFFFFF';
    ctx.lineWidth = 1;
    drawShape();
    ctx.stroke();
    ctx.restore();
  }
}

// Repeating 2x2-cell tile (light/dark/dark/light), built once. `cellPx`
// defaults to the single-file canvas's density (CHECKER_CELL); the group
// grid's screen-space backdrop passes a bigger value — "big and chunky",
// legible at any zoom since it's not tied to any one sprite's resolution —
// via its own cached tile instead of reusing this one at the wrong size.
const checkerTiles = new Map(); // cellPx -> tile canvas
function getCheckerTile(cellPx = CHECKER_CELL) {
  if (!checkerTiles.has(cellPx)) {
    const tile = document.createElement('canvas');
    tile.width = cellPx * 2;
    tile.height = cellPx * 2;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = CHECKER_LIGHT;
    tctx.fillRect(0, 0, cellPx * 2, cellPx * 2);
    tctx.fillStyle = CHECKER_DARK;
    tctx.fillRect(cellPx, 0, cellPx, cellPx);
    tctx.fillRect(0, cellPx, cellPx, cellPx);
    checkerTiles.set(cellPx, tile);
  }
  return checkerTiles.get(cellPx);
}

// Fills `(destX, destY, destW, destH)` (screen px) with the checker pattern,
// pinned to the canvas's own pixel grid: translating/scaling the context by
// the same (ox, oy, scale) the sprite itself is drawn with before filling
// means the pattern's cell boundaries land exactly on canvas-pixel
// boundaries, at any destination rect — the whole viewport (the app
// backdrop) or just the canvas's own bounds (the canvas backdrop) tile
// identically and seamlessly, because it's literally the same fill.
function fillCheckerboard(ctx, scale, ox, oy, destX, destY, destW, destH, cellPx) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = ctx.createPattern(getCheckerTile(cellPx), 'repeat');
  ctx.fillRect((destX - ox) / scale, (destY - oy) / scale, destW / scale, destH / scale);
  ctx.restore();
}

// Onion skinning (§12.3): ghost frames tint toward red (before) or blue
// (after) with opacity falling off by distance, fixed range 2 in each
// direction — no range control exists in the UI.
function drawGhost(ctx, model, ghost, scale, ox, oy) {
  const tint = ghost.side === 'before' ? ONION_BEFORE_TINT : ONION_AFTER_TINT;
  const alpha = ghost.distance === 1 ? 0.35 : 0.18;
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      const color = ghost.pixels[y * model.width + x];
      if (!color) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = blendColors(packedToHex(color), tint, 0.5);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  ctx.globalAlpha = 1;
}

// Marching ants. Two dash passes exactly one dash-length out of phase —
// black filling one set of gaps, white the other — so the boundary reads
// against any background, same reasoning as the brush cursor/grid having no
// single fixed color that's safe everywhere. `antsPhase` advances once per
// render call (main.js's animation loop already calls render() every
// frame), giving the classic marching animation for free.
const SELECTION_DASH = 4; // screen px per dash segment — constant across zoom, see below
const SELECTION_DASH_SPEED = 0.5; // screen px of march per frame
// Dash coordinates here are already screen pixels (scale is baked into
// every point, not applied via ctx.scale), so a fixed dash size holds
// steady on screen at any zoom — until the sprite itself is so small on
// screen that a fixed-size dash would swamp it more than outline it, where
// it fades out instead of blocking the view.
const ANTS_FULL_SCALE = 4; // model-px -> screen-px scale at/above which ants are fully opaque
const ANTS_MIN_SCALE = 1; // at/below this scale, ants are fully transparent
let antsPhase = 0;

function selectionAlpha(scale) {
  if (scale >= ANTS_FULL_SCALE) return 1;
  if (scale <= ANTS_MIN_SCALE) return 0;
  return (scale - ANTS_MIN_SCALE) / (ANTS_FULL_SCALE - ANTS_MIN_SCALE);
}

// Outline every selected pixel's exposed edges (magic wand / rect-select
// both resolve to a mask) as one continuous path, so the dash pattern flows
// around the whole boundary instead of restarting at every 1-pixel edge.
function selectionOutlinePath(selection, scale, ox, oy) {
  const path = new Path2D();
  const { width, height, mask } = selection;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const sx = ox + x * scale, sy = oy + y * scale;
      if (!mask[(y - 1) * width + x]) { path.moveTo(sx, sy); path.lineTo(sx + scale, sy); }
      if (!mask[(y + 1) * width + x]) { path.moveTo(sx, sy + scale); path.lineTo(sx + scale, sy + scale); }
      if (!mask[y * width + (x - 1)]) { path.moveTo(sx, sy); path.lineTo(sx, sy + scale); }
      if (!mask[y * width + (x + 1)]) { path.moveTo(sx + scale, sy); path.lineTo(sx + scale, sy + scale); }
    }
  }
  return path;
}

function drawSelection(ctx, selection, scale, ox, oy) {
  const alpha = selectionAlpha(scale);
  if (alpha <= 0) return;
  const path = selectionOutlinePath(selection, scale, ox, oy);
  antsPhase = (antsPhase + SELECTION_DASH_SPEED) % (SELECTION_DASH * 2);

  // Difference blend (same trick as the hover crosshair) — a white stroke
  // always fully inverts whatever's underneath, so the boundary reads on
  // any background without needing separate black/white dash passes.
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'difference';
  ctx.lineWidth = 1;
  ctx.setLineDash([SELECTION_DASH, SELECTION_DASH]);
  ctx.lineDashOffset = -antsPhase;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke(path);
  ctx.restore();
}

// Same step progression the grid uses (§6): 1 -> 4 -> 16 -> ... — ticks/
// gridlines agree on where lines fall, and ruler number labels use a
// second, coarser threshold so the text itself never overlaps.
function gridStep(scale, minSpacing = GRID_MIN_SPACING_PX) {
  let step = 1;
  while (step * scale < minSpacing) step *= 4;
  return step;
}

// Keyed off the canvas's own on-screen footprint (screen px), not `scale`
// (model-px -> screen-px ratio) — minZoomScale never lets `scale` drop
// below 1, so a scale-based fade never triggered at all, but a *small
// sprite* still renders a tiny on-screen footprint even at that closest
// allowed zoom-out. Below ~3 ruler-thicknesses of footprint the bars start
// crowding the sprite; below one thickness the ruler is outright bigger
// than the canvas it's measuring, which is the actual "too small" this
// fades ahead of.
const RULER_FULL_FOOTPRINT_PX = RULER_THICKNESS * 3;
const RULER_MIN_FOOTPRINT_PX = RULER_THICKNESS;
function rulerAlpha(w, h) {
  const footprint = Math.min(w, h);
  if (footprint >= RULER_FULL_FOOTPRINT_PX) return 1;
  if (footprint <= RULER_MIN_FOOTPRINT_PX) return 0;
  return (footprint - RULER_MIN_FOOTPRINT_PX) / (RULER_FULL_FOOTPRINT_PX - RULER_MIN_FOOTPRINT_PX);
}

// Where the ruler bars sit: attached to the sprite's own edge normally,
// clamped to the viewport edge once zoom has scrolled that edge off-screen.
function rulerAnchor(scale, ox, oy, viewW, viewH) {
  return {
    topY: Math.max(0, Math.min(oy - RULER_THICKNESS, viewH - RULER_THICKNESS)),
    leftX: Math.max(0, Math.min(ox - RULER_THICKNESS, viewW - RULER_THICKNESS)),
  };
}

// Highlight bar through the hovered pixel's row and column — a difference
// blend so it stays visible no matter what color sits underneath (same
// trick as the brush cursor). `hoverPixel` here is the eased cursor trail
// (main.js's displayCursorPos), which can briefly sit just outside the
// sprite's bounds near an edge before it catches up — each axis only draws
// once its own coordinate is actually within the canvas, so that overshoot
// never paints a highlight stripe into the ruler/app-background margin
// beyond where the canvas ends.
function drawCrosshair(ctx, hoverPixel, { topY, leftX }, scale, ox, oy, w, h) {
  const vx = ox + hoverPixel.x * scale;
  const hy = oy + hoverPixel.y * scale;
  const insideX = vx >= ox && vx < ox + w;
  const insideY = hy >= oy && hy < oy + h;
  if (!insideX && !insideY) return;

  ctx.save();
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = CROSSHAIR_COLOR;
  if (insideX) {
    ctx.fillRect(vx, topY, scale, RULER_THICKNESS); // through the top ruler
    ctx.fillRect(vx, oy, scale, h); // through the canvas
  }
  if (insideY) {
    ctx.fillRect(leftX, hy, RULER_THICKNESS, scale); // through the left ruler
    ctx.fillRect(ox, hy, w, scale); // through the canvas
  }
  ctx.restore();
}

// Top (columns) and left (rows) coordinate rulers (§6), hidden by default,
// toggled with Shift+G. Normally attached directly to the sprite's own
// edge (tracks pan/zoom with it); once the canvas is zoomed in far enough
// that its edge has scrolled past the viewport edge, the ruler clamps to
// the viewport edge instead so it's always reachable rather than
// scrolling off-screen with the canvas. Tick/label spacing scales with
// zoom the same way the grid does, so it never becomes an unreadable
// smear of numbers at low zoom.
function drawRuler(ctx, model, scale, ox, oy, w, h, viewW, viewH, { topY, leftX }, hoverPixel) {
  ctx.font = '12px m3x6, monospace';
  ctx.textBaseline = 'top';

  // Bar length matches the visible portion of the sprite — which is just
  // its own width/height when the sprite fits in the viewport ("attached
  // to the canvas"), and clamps to the full viewport span once the sprite
  // is bigger than the viewport in that direction ("floats independently").
  const barLeft = Math.max(0, ox), barRight = Math.min(viewW, ox + w);
  const barTop = Math.max(0, oy), barBottom = Math.min(viewH, oy + h);
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(barLeft, topY, barRight - barLeft, RULER_THICKNESS);
  ctx.fillRect(leftX, barTop, RULER_THICKNESS, barBottom - barTop);

  const tickStep = gridStep(scale);
  const labelStep = gridStep(scale, 28);

  const colStart = Math.max(0, Math.floor(-ox / scale / tickStep) * tickStep);
  const colEnd = Math.min(model.width - 1, Math.ceil((viewW - ox) / scale));
  for (let x = colStart; x <= colEnd; x += tickStep) {
    const isHover = hoverPixel && Math.floor(hoverPixel.x / tickStep) === Math.floor(x / tickStep);
    ctx.fillStyle = isHover ? RULER_HIGHLIGHT : RULER_TICK;
    ctx.fillRect(ox + x * scale, topY, 1, RULER_THICKNESS);
    if (x % labelStep === 0) ctx.fillText(String(x), ox + x * scale + 2, topY + 2);
  }

  const rowStart = Math.max(0, Math.floor(-oy / scale / tickStep) * tickStep);
  const rowEnd = Math.min(model.height - 1, Math.ceil((viewH - oy) / scale));
  for (let y = rowStart; y <= rowEnd; y += tickStep) {
    const isHover = hoverPixel && Math.floor(hoverPixel.y / tickStep) === Math.floor(y / tickStep);
    ctx.fillStyle = isHover ? RULER_HIGHLIGHT : RULER_TICK;
    ctx.fillRect(leftX, oy + y * scale, RULER_THICKNESS, 1);
    if (y % labelStep === 0) ctx.fillText(String(y), leftX + 2, oy + y * scale + 2);
  }

  // The corner where the two bars meet.
  ctx.fillStyle = RULER_BG;
  ctx.fillRect(leftX, topY, RULER_THICKNESS, RULER_THICKNESS);
}

// Reused 1:1 offscreen buffer for the sprite's pixel content. A single
// drawImage() blit (nearest-neighbor, imageSmoothingEnabled off) has no
// seams between pixels at any zoom — tiling one fillRect per pixel does:
// adjacent same-color rects can leave hairline gaps between them from
// sub-pixel rasterization once devicePixelRatio scaling isn't a clean
// integer, which read as a phantom grid even with the real grid off.
let pixelBuffer = null;
let pixelBufferCtx = null;
let pixelBufferSource = null; // { pixels, rev } the buffer currently holds, so an unchanged composite isn't re-uploaded every frame

// Rebuilds the shared offscreen buffer with `model`'s own pixels — split out
// from the blit below so a caller (the artboard grid's glow effect) can blit
// the same built buffer twice in one pass (once blurred, once sharp)
// without re-walking the pixel grid twice.
function buildPixelBuffer(model) {
  if (!pixelBuffer || pixelBuffer.width !== model.width || pixelBuffer.height !== model.height) {
    pixelBuffer = document.createElement('canvas');
    pixelBuffer.width = model.width;
    pixelBuffer.height = model.height;
    pixelBufferCtx = pixelBuffer.getContext('2d');
    pixelBufferSource = null;
  }
  // `model.pixels` is already packed RGBA words (canvas-model.js
  // hexToPacked), so this is one bulk copy over the ImageData's own buffer.
  if (pixelBufferSource && pixelBufferSource.pixels === model.pixels && pixelBufferSource.rev === model.pixels.rev) {
    return { width: model.width, height: model.height };
  }
  const imageData = pixelBufferCtx.createImageData(model.width, model.height);
  new Uint32Array(imageData.data.buffer).set(model.pixels);
  pixelBufferCtx.putImageData(imageData, 0, 0);
  pixelBufferSource = { pixels: model.pixels, rev: model.pixels.rev };
  return { width: model.width, height: model.height };
}

function blitPixelBuffer(ctx, srcSize, ox, oy, w, h) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelBuffer, 0, 0, srcSize.width, srcSize.height, ox, oy, w, h);
}

function drawPixels(ctx, model, scale, ox, oy, w, h) {
  const srcSize = buildPixelBuffer(model);
  blitPixelBuffer(ctx, srcSize, ox, oy, w, h);
}

