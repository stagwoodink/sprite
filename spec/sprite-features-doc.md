# Sprite — Features Specification

**Status:** Supporting detail document. `sprite-design-doc.md` is the canonical build spec and consolidates the decisions here — where the two differ, `sprite-design-doc.md` wins. This document is kept for the fuller design rationale and the open-items list it contains. See `INDEX.md` for the complete file relationship.

**Audience:** Claude Code (autonomous build agent)

**Design principle:** Sprite is opinionated, not customizable. When a feature could be built as a user-adjustable setting or as a single fixed, deliberate choice, default to the fixed choice unless this document explicitly says otherwise. The onion-skin range (§10.1) was originally scoped as adjustable and was deliberately simplified to a fixed value for exactly this reason — treat that as the model for how to resolve similar judgment calls, not as an isolated exception.

---

## 0. What This Document Supersedes (historical context)

The earliest design pass ("v1," not shipped as its own file — its still-valid tech-stack choice was carried forward into `sprite-design-doc.md` §3) specified a discrete-tool editor (Pencil/Eraser/Eyedropper buttons), manual save via `Ctrl+S`, PNG-only export, a fixed snapped-zoom system, and a single always-visible side panel. None of that survives. Specifically, **do not build**:

- The v1 toolbar (New/Open/Save/Undo/Redo buttons) — replaced by the Project panel (§7) and always-on autosave (§9).
- The v1 side panel (tool selector, swatch pair, 4×16 fixed palette grid, grid checkbox) — replaced by the anchored palette chip bar (§2) plus the modifier-key tool system (§3).
- The v1 New Canvas modal shown on launch — replaced by canvas-size selection happening inside the Project panel's file-creation popup (§7.3).
- The v1 snapped zoom levels (1x/2x/4x/.../32x) — replaced by continuous zoom (§1.3).
- PNG-only export — replaced by six export targets (§10).

Superseded (see `docs/adr/0002-web-stack.md`): the v1 Rust/egui/eframe/rfd/image/trunk stack choice is replaced by plain JavaScript/HTML/CSS + Canvas2D, no framework, no build step, no native target. The module-per-file repo layout still stands, translated to `.js` modules.

---

## 1. Canvas

### 1.1 Size presets

Offered as buttons in the new-file popup (§7.3):

| Preset | Dimensions |
|---|---|
| 8×8 | 8 × 8 |
| 16×16 | 16 × 16 |
| 32×32 | 32 × 32 |
| 64×64 | 64 × 64 |
| 128×128 | 128 × 128 |
| 256×256 | 256 × 256 |
| Game Boy DMG | 160 × 144 (native Game Boy DMG screen resolution) |

No "Custom" size option exists in v2 — this replaces v1's custom width/height steppers. If a non-preset size is genuinely needed, it's out of scope until resize (§8) is used post-creation.

### 1.2 Default appearance

- Canvas background: dull dark black (near-black, not pure `#000000` — implementation should pick a value like `#0A0A0A`–`#121212`, flag for a real design pass rather than treating this exact hex as final).
- A subtle grid overlay is visible by default, one line per pixel boundary, low-opacity.
- `G` toggles the grid on/off.
- Ruler (top and bottom edges, showing pixel coordinates) is hidden by default. `Shift+G` toggles it.
- While the ruler is visible, the row/column corresponding to the cursor's current pixel lights up subtly in the ruler strip itself (not on the canvas) as the cursor moves.

### 1.3 Zoom

- On load, canvas always starts zoomed to fill the available canvas viewport (not a fixed default zoom level — computed from canvas size vs. viewport size).
- Zoom is continuous, not snapped to discrete steps (this replaces v1 §4.3's stepped 1x/2x/4x/.../32x list).
- Minimum zoom: actual size, 1 canvas pixel = 1 screen pixel (1:1). The user cannot zoom out further than this.
- Maximum zoom: the point at which a single canvas pixel fills the visible canvas viewport.
- Scroll wheel while hovering the canvas zooms continuously in/out, centered on the cursor.
- Pixels always render as perfect squares at every zoom level, regardless of viewport aspect ratio.

### 1.4 Panning

- Holding `Space` and dragging with the left mouse button pans the canvas.

---

## 2. Palette

### 2.1 Built-in palettes

Three: **Game Boy DMG** (the 4-shade green/gray palette), **Pico-8** (the 16-color Pico-8 system palette), and a **default general-purpose starter palette** (16 colors: `#000000 #FFFFFF #7F7F7F #C3C3C3 / #FF0000 #FF7F00 #FFFF00 #00FF00 / #0000FF #7F00FF #FF00FF #00FFFF / #7F3300 #FFC0CB #808000 #003366`), reused here as the third preset rather than designing a new one. This resolves what was an open question earlier in design discussion; flagging that this specific choice was a default pick, not something explicitly re-confirmed after the fact — revisit if a different third palette is wanted.

### 2.2 Palette bar (default UI)

- By default, only the canvas and the palette bar are visible — no other panel is shown until summoned (§6, §7, layers timeline).
- Palette renders as a horizontal strip of color chips anchored along the top of the window, stretching to fill the available width.
- Chips are tied to the current **project file**, not the app globally — switching the active file in the Project panel swaps the palette shown (§7.4).

### 2.3 Chip interactions

| Action | Result |
|---|---|
| Hover a chip | Chip lifts slightly (small vertical translate) |
| Left-click a chip | Sets that color as the primary (left-click) draw color |
| Right-click a chip | Opens a color picker popup: hex text field (default focus), square HSL-style picker below it |
| Click elsewhere while the picker popup is open | **Assumption, flagging for confirmation:** treated as an eyedropper — samples whatever color is under that click point (including the canvas) and sets it as the current color, then closes the popup, rather than simply dismissing the popup with no effect |
| Drag a chip | Reorders chips within the palette |
| Hover the right edge of a chip's row area | Reveals an add-chip button. **Assumption:** rendered as `[+]`, not `[x]` as literally written in the original description — `[x]` is used consistently elsewhere in this spec for delete affordances, so a `[+]` for "add" keeps that convention intact. Flagging in case `[x]` was intentional. |
| Scroll wheel while hovering the palette bar | Slides the palette strip left/right when there are more chips than fit in the available width |

- Maximum 32 chips.

### 2.4 Number-key color assignment

- Keys `1`–`0` map to the first 10 chips left-to-right and set the primary (left-click) color when pressed.
- `Alt+1` through `Alt+0` set the secondary (right-click) color the same way.

---

## 3. The Tool System (modifier-key driven)

There is exactly one drawing tool. Its behavior is altered entirely by modifier keys — there is no Pencil/Brush/Eraser selector anywhere in the UI. This is the core interaction model of the app.

| Input | Behavior |
|---|---|
| Left-click | Sets the hovered pixel to the primary color |
| Left-click + drag | Sets every pixel the cursor passes over to the primary color |
| `Alt` + click/drag | Same as above, but antialiased. Brush size for this antialiased mode is adjustable with `[` (decrease) and `]` (increase), up to a maximum of one quarter of the canvas's smaller dimension |
| `Ctrl` + click | Flood-fills all contiguous pixels of the same color as the clicked pixel |
| `Ctrl+Alt` + click | Same flood fill, antialiased at the fill boundary |
| `Shift` + click | Selects a single pixel |
| `Shift` + drag | Selects a rectangular area, finalized on mouse release |
| `Shift+Alt` | Magic-wand selector: click selects a contiguous same-color region using antialiasing-aware edge detection; any fill applied afterward respects the aliasing of that selection boundary |
| `Shift+Ctrl` | Polygonal selector: each click places a point (snappable to pixel corners or centers); releasing the modifier keys auto-closes the polygon by connecting to the start point, or the user can click the original point manually to close it early |
| Right mouse button | Applies whatever the currently-held modifier combination specifies, identically to the left mouse button, but using the **secondary** color instead of primary |

- The cursor must visually change to reflect the currently-active modifier combination (e.g., a distinct cursor glyph for plain paint vs. antialiased paint vs. fill vs. each selection mode). Exact iconography is an implementation/art-pass detail not specified here — flagging as open, but the requirement itself (cursor must always indicate current mode) is not optional.

---

## 4. Selection Operations

Once a selection exists (from any of the Shift-modifier selection modes in §3):

| Input | Result |
|---|---|
| `Ctrl+C` | Copy. With no selection, targets the hovered pixel; with a selection, copies its contents |
| `Ctrl+X` | Cut. Same targeting rule as copy |
| `Ctrl+V` | Paste. Same targeting rule — pastes at the hovered pixel if no selection exists, or into/relative to the active selection |
| `F` | Flip horizontally. Requires an active selection |
| `Shift+F` | Flip vertically. Requires an active selection |
| Hold `R` | Shows a bounding box around the selection with a handle ("pip") extending from the bottom; dragging the pip freely rotates the selection |
| Hold `Shift+R` | Same rotation interaction, snapped to 15° increments |
| `Shift+Arrows` | Moves the **selection boundary itself**, without moving the pixel content underneath it |
| `Shift+Ctrl+Arrows` | Moves the **selected pixel content**, nudged one pixel per press |
| `Shift+Ctrl+Drag` | Freely moves the selected pixel content with the mouse |
| `Ctrl+A` | Selects the entire canvas, on the current layer |
| `Esc` | Clears/deselects the current selection |
| Arrow keys (no modifier, canvas focused, no selection) | Moves a pixel-level navigation cursor around the canvas |
| `Return` | Stamps the primary color onto the pixel under the navigation cursor |
| `Alt+Return` | Stamps the secondary color onto the pixel under the navigation cursor |
| `Backspace` / `Delete` | With no selection: erases the hovered pixel. With an active selection: erases every pixel within the selection |

Selections **persist across frame and layer switches** — moving to a different layer or timeline frame does not clear the active selection.

---

## 5. Panels — Shared Interaction Model

Three panels (Layers, Timeline, Project) all share one reveal/hide mechanism, and one focus model, so build this once and reuse it rather than re-implementing per panel.

### 5.1 Reveal / hide

- Each panel is hidden by default and slides in when the cursor hovers its trigger edge (Layers: right edge of the window; Timeline: bottom edge; Project: left edge).
- Hiding again on mouse-out is **not** an instant hide-on-leave — it must account for cursor speed and travel distance to infer real intent to leave, so a fast pass-through near the edge doesn't accidentally flash the panel open, and a brief, low-velocity dip outside the panel doesn't instantly close it. Getting this feel right is explicitly called out as important, not a minor nicety.
- Each panel has a dedicated pin/toggle key: Layers = `L`, Timeline = `T`, Project = `Tab`. Pressing it either pins the panel open (if hidden/unpinned) or closes it (if currently open/pinned).
- The palette bar can be unpinned/hidden with `P` (it's visible by default, unlike the other three panels, so `P` is a hide toggle rather than a pin toggle).

### 5.2 Focus

- A panel gains focus on hover, or immediately on pin.
- A pinned panel **keeps** focus even after the cursor leaves it, until the user clicks elsewhere or moves the mouse away from the panel significantly/quickly (the same speed-and-distance intent check from §5.1 governs whether that departure counts as "leaving," rather than a separate hard boundary).
- Several keybinds below (arrow-key navigation/reorder in particular) only apply while their panel has focus. Canvas-level bindings (e.g., `Shift+Arrows` moving a selection) apply when the canvas — not a panel — has focus.

---

## 6. Layers Panel

- Slides in from the right edge (§5.1); `L` pins/closes it.
- Top item in the list is always a `[+]` button to add a new layer.
- **Click on a layer's thumbnail** toggles that layer's visibility in the canvas (hide/show).
- **Click on a layer's row/name (not the thumbnail)** sets that layer as the active layer for drawing.
- **Right-click a thumbnail** slides out an opacity/transparency slider for that layer.
- Hovering the right side of a layer row reveals a red `[x]` delete button.
- While the panel has focus:
  - `Backspace`/`Delete` deletes the current active layer.
  - `Up`/`Down` arrows navigate which layer is active.
  - `Shift+Up`/`Shift+Down` moves the active layer up/down in the stack order.
- Layer rows can also be dragged directly to reorder them.

---

## 7. Project Panel

- Slides in from the left edge (§5.1); `Tab` pins/closes it.
- **Project Name** at the top, with a `[+]` to its right to start a new project; clicking the name itself makes it editable.
- **Right-click the Project Name** to rename the project.
- Creating a new project (via the `[+]`) opens a slide-out text field with an active cursor; typing a name and pressing `Return` creates the project.
- Below the project name: a list of files belonging to the current project.
  - **Top item in the list is always `[+]`**, to add a new file.
  - Clicking `[+]` opens a **popup** (not a modal) for canvas-size selection, using the presets from §1.1.
  - Clicking any existing file in the list instantly swaps the canvas to that file.
  - **Right-click a file** opens a slide-out context menu offering rename and canvas resize (§8).

### 7.1 Export/Import

- Anchored to the bottom of the Project panel.
- Pressing the `E` key, or an Export button, slides the Project panel open (if it was hidden) and opens a context bar to the right of the currently active file. That bar lets the user pick an export file type and a scale multiplier, plus an export icon to trigger the export.
- `Return`, while that export context bar is open, exports using whatever is currently selected.
- Default on first use: PNG at 1x. After that, the app remembers the user's last-used format and scale — **globally**, not per-project.

### 7.2 Storage model

- Projects are directories of `.sprite` files (one `.sprite` file per canvas/file within the project).

### 7.3 New-file popup

Reiterating from above for clarity since it replaces v1's launch-time modal entirely: canvas creation never happens as a modal blocking the whole app. It only happens via the `[+]` at the top of the Project panel's file list, as a popup, and only presets from §1.1 are offered.

### 7.4 Palette binding

- The palette bar (§2) is tied to the project **file**, not the project or the app. Switching which file is active swaps the palette shown along with it.

---

## 8. Canvas Resize

- Triggered from a file's right-click context menu in the Project panel (§7).
- **Resizing smaller** does not discard pixel data outside the new bounds — those pixels are retained internally, simply not rendered on canvas and not included in exports, unless the canvas is later resized back up to reveal them again.
- **Resizing larger** reveals previously-hidden pixel data if the canvas had been shrunk before; otherwise the new space is blank/transparent.
- Resizing is anchored from the **center** of the canvas (growth/shrink happens symmetrically outward/inward from the middle, not from a corner).

---

## 9. Undo, Redo, and Autosave

- Undo/redo history is **persisted with the file itself**, up to **50 steps**. Reopening a `.sprite` file later restores its undo history, so previously-made edits from an earlier session can still be undone.
- There is no manual save. **The app autosaves continuously** — every change is written to disk (or persisted in the browser storage layer on web) as it happens. This removes the v1 concept of a "dirty" flag and a Save button entirely; nothing in the UI represents "unsaved changes" because that state cannot exist.
- Undo/redo keybinds (carried over from v1, unchanged): `Ctrl+Z` to undo, `Ctrl+Y` or `Ctrl+Shift+Z` to redo.

---

## 10. Timeline / Keyframes & Onion Skinning

- Slides up from the bottom edge (§5.1); `T` pins/closes it.
- Frames follow the **same interaction language as layers**: click a frame to select it, `Backspace`/`Delete` removes it.
- A `[+]` control (in the UI, or the `[+]` key while the timeline has focus or is pinned) adds a new frame.
- `Ctrl+[+]` duplicates the current frame.
- Frames can be dragged to reorder. While the panel has focus, `Left`/`Right` arrows navigate between frames, and `Shift+Left`/`Shift+Right` reorder the current frame's position.
- `Ctrl+Space` plays/pauses animation preview. **Flagging:** `Ctrl+Space` is intercepted by the OS on some platforms (IME switching on Windows/Linux) — may need a documented fallback binding there.
- FPS is shown as a single field (not separate increment buttons) — drag left/right to change the value, or click into it to type a value directly.
- Hovering the gap between two adjacent frames separates them slightly and reveals an insert-here `+` button (the same interaction pattern as Canva's between-element insert) — this is in addition to the end-of-strip add-frame button, giving a way to insert a frame at a specific position rather than only appending.

### 10.1 Onion skinning

- Range is **fixed at 2 frames** in each direction — not user-configurable. Sprite is opinionated rather than customizable; this was originally scoped as an adjustable 1–3 range but that's been deliberately simplified to remove the control surface entirely.
- Ghosted frames are **tinted and faded**: frames before the current one and frames after it use distinct tint colors (e.g., warm tint for previous, cool tint for next), with opacity decreasing as distance from the current frame increases.
- Onion skin has a toggle between showing the **full composited frame** (all layers) or **only the active layer**, for both the "before" and "after" ghosts.

---

## 11. Export

### 11.1 Formats

PNG, JPG, SVG, PDF, JSON, and `.sprite` (the native project file format, i.e. "export" here can also mean producing a standalone `.sprite` outside the project's own storage).

- **PNG**: standard raster export, alpha preserved, at the selected integer scale multiplier (nearest-neighbor upscaling — this is pixel art, no smoothing).
- **JPG / PDF**: neither format supports alpha. Default fill for transparent pixels is **white**. Clicking the JPG export option a second time toggles the fill to **black**. Right-clicking the JPG option sets the fill to whatever the user's current **secondary color** is. This same toggle/right-click pattern applies identically to **PDF** export.
- **SVG**: needs an explicit definition — proposed default is one `<rect>` element per non-transparent pixel, scaled to the selected export multiplier. Flagging for confirmation since "SVG export of pixel art" has more than one reasonable interpretation (e.g., could also mean a single embedded raster image inside an SVG wrapper, which would be a very different and much simpler implementation).
- **JSON**: needs an explicit schema — proposed default is canvas width/height plus a flat array of RGBA values (or hex strings) in row-major order, plus basic metadata (palette used, layer/frame data if relevant). Flagging for confirmation for the same reason as SVG.

### 11.2 Scale

- User-selectable scale multiplier in the export context bar (§7.1).

---

## 12. Open Items Requiring a Decision Before Implementation

Collected here for visibility — implementation should not silently guess at these:

1. **Resolved, flagging for awareness:** third built-in palette — see the concrete 16-color list in §2.1 above. This was a default pick made without an explicit follow-up confirmation; revisit if a different palette is wanted.
2. **Click-away-from-color-picker = eyedropper** — plausible reading of the original description, but stated here as an assumption, not a confirmed spec (§2.3).
3. **Add-chip button glyph** — assumed `[+]`, original text said `[x]` (§2.3).
4. **App launch/first-run behavior** — nothing specifies what happens when the app opens with no project open yet (does it reopen the last active project/file automatically, given autosave means there's always a "last state"?). Not addressed anywhere in this document.
5. **Cursor iconography per modifier mode** — requirement to change cursor per §3 is firm; the actual glyphs are not designed yet.
6. ~~Onion-skin on/off and range control surface.~~ Resolved: range is fixed at 2 (no control needed), on/off is an icon-only toggle button in the timeline strip (see the UI design system doc §6).
7. **SVG and JSON export schemas** — proposed defaults given in §11.1, not confirmed.
8. **`Ctrl+Space` platform conflict** — flagged in §10, needs a fallback decision.
