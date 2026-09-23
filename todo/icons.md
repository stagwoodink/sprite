# Icon art needed

Placeholder glyphs/shapes currently standing in across the UI. Real pixel-art icons (made in Sprite itself, per `spec/DECISIONS.md`) replace these — swap by changing the glyph string / cursor SVG, no markup change needed.

## Panel buttons

- **Project panel** (`project-panel.js`)
  - New project — `+`
  - Open project — `□`
  - Move file to collection — `▤`
  - Resize canvas (per-file) — `⤡`
  - Export (per-file) — `↥`
  - Import — `↧`
  - Add file/collection — `+`
- **Layers panel** (`layers-panel.js`)
  - Add layer/group — `+`
  - Move layer to group — `▤`
  - Delete layer — `✕`
  - Drag-to-reorder handle — `⋮`
  - Visibility toggle (eye pip on thumbnail, and standalone on a group header) — plain dot, no glyph yet
- **Timeline panel** (`timeline-panel.js`)
  - Add frame — `+`
  - Insert frame (between-frame gap) — `+`
  - Delete frame — `✕`
  - Onion-skin toggle — `◈` (diamond, brand motif)
- **Palette** (`palette.js`)
  - Palette presets (hamburger) — `☰`
  - Add color chip — `+`

## Version tag (top corner)

- Report a bug — `!`
- Join Discord — `@`
- Controls / help — `?`

## Tool tag (opposite corner)

- Zoom indicator — `⌕`

## Tool cursors (`cursors.js`)

All hand-rolled inline SVGs, one 18x18 canvas, 1.5px stroke:

- Paint (dot + ring)
- Antialiased paint (dashed circle)
- Fill / antialiased fill (bucket)
- Select rect (dashed marquee)
- Select wand (diamond)
- Select polygon (lasso)
- Erase (dashed square)
- Shape: rectangle
- Shape: triangle
- Shape: circle
- Pan / panning — using native `grab`/`grabbing` cursors, not custom art

## Known inconsistency

`frame-delete` (timeline-panel.js) still uses its own bespoke display:none/flex hover toggle instead of the shared `.btn--reveal` slide-out convention — same issue `layer-delete` had before it was converted. Worth the same conversion pass when icon art work happens.
