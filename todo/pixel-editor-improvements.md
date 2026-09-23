# Pixel-editor feature candidates

Researched against Aseprite/Piskel/Pixelorama/PixiEditor community demand,
then filtered against this app's own constraints: zero-build, keyboard-first,
minimalist, prime-color-only (no primary/secondary pair), solid-or-nothing
pixels (no alpha), no new heavyweight subsystems. Ordered roughly by
value/effort. (Undo-history persistence — a candidate from the same
research pass — was dropped: `src/persistence.js`'s `saveProject` already
persists `file.undoStack` in the `.sprite` file as-is; only `redoStack` is
deliberately wiped on save/load, §10, session-only by design.)

## 1. Lospec/.gpl/.hex palette import

Aseprite, GIMP, Krita, LibreSprite all load these directly — Lospec's whole
palette library assumes it. Sprite already has a palette-preset slot
(Pico-8/DMG/Stagwood, `src/palettes-presets.js`) — this is a 4th "import"
option feeding the same ≤32-chip array, just a new parser for three common
text formats.

## 2. Palette extraction from an image

A whole cottage industry of standalone tools exists (Pixelera, Payangar's
Pixel Palette Exporter) specifically because editors skip this. One
canvas-pixel histogram function (most-frequent-colors, capped at 32) feeding
the same palette array as #1 — no new UI beyond a "from image" trigger next
to the existing preset picker.

## 3. Symmetry / mirror drawing guide

Open Pixelorama feature request (#133). A toggle that mirrors the cursor's
target cell (horizontal and/or vertical axis) before the existing paint
dispatch writes it — one hairline guide overlay, no new tool, one keybind.
Doesn't touch the undo/command model since it's still one paint dispatch
per stroke tick, just aimed at two cells instead of one.

## 4. Reference-image layer

Recurring ask on the Aseprite Community forum ("Placing pictures as
reference layer," "Ways to use references whilst drawing?"). One more entry
in the existing layer stack (`src/sprite-file.js`'s layers array), flagged
non-paintable and excluded from every export path — reuses layer ordering,
compositing, and the visibility toggle wholesale. The only new piece is an
image-file → pixel-buffer import step for that one layer.

## 5. Zoom to selection / zoom to fit

Explicit Aseprite Community feature request. One function against the
existing viewport zoom/pan state (`src/viewport.js`/`view-state.js`) — fit
the current selection's bounding box (or, with no selection, the whole
canvas) into the viewport, same math the existing `_` (zoom to 100%) and `=`
(zoom to fit) keys already use.

## 6. Dithering (checkerboard) brush mode

Asked on Aseprite's forum, PixiEditor's forum, and Pixelorama's tracker
(#185) — usually as a two-color pattern brush. Fits Sprite's prime-color-
only model unusually well: a toggle that alternates prime-color / erased
cells in a checkerboard as you paint, no secondary color needed (every other
editor's dither needs one). Lives entirely inside the existing paint
dispatch, one modulo check on the target cell's (x+y) parity.

## 8. Spritesheet import (grid-slice a PNG into frames)

Mirrors demand on Piskel's own wishlist (#1122) for importing external
formats — and is the direct inverse of a feature Sprite already ships
(`src/export.js`'s per-frame PNG breakdown). Given a PNG plus a cell
width/height, slice it into a grid and load each cell as a Frame — reuses
the existing frame-array shape and the same pixel-buffer decode step PNG
import already needs elsewhere.

---

Cut in the original research pass for bloat, not reconsidered here: tilemap
editing (Pixelorama shipped this as a large subsystem), a scripting console,
semi-transparent pixels (fights the solid-or-nothing pixel model),
configurable keybindings (fights the app's own opinionated scheme). Also
cut: freeform selection transform (drag rotate/scale) — kept out of this
list at the user's direction, not part of the approved 7.
