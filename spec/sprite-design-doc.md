# Sprite — Design & Build Specification

**Status:** This is the **canonical, authoritative build spec** for Sprite — the consolidated result of the full design process, including everything in `sprite-features-doc.md` and `sprite-ui-design-system.md`. If anything in those two documents appears to conflict with this one, **this document wins** — they're kept alongside it for the detailed design rationale and visual reference they contain (including a still-current list of genuinely open items), not as competing authorities. See `INDEX.md` for the full reading order and how the four files relate.

**Audience:** Claude Code (autonomous build agent)

---

## 0. What changed since v1

### 0.1 Design principle

Sprite is opinionated, not customizable. When a feature could be built as a user-adjustable setting or as a single fixed, deliberate choice, default to the fixed choice unless this document says otherwise. The onion-skin range (§12.3) is the reference example — it was originally scoped as an adjustable 1–3 range and was deliberately simplified to a fixed value for exactly this reason. Treat that as the model for resolving similar judgment calls, not as an isolated exception.

v1 scoped Sprite as "single canvas, draw and export a PNG." That scope has grown substantially through design discussion. The following v1 assumptions are now **explicitly overturned**:

| v1 assumption | v2 reality |
|---|---|
| One canvas, no projects | Projects are directories containing multiple canvas files |
| No undo | Undo/redo, 50 steps, **persisted in the file** (survives reopening) |
| Manual save (`Ctrl+S`) | **Autosave on every change.** There is no manual save action at all. |
| PNG-only export | PNG, JPG, SVG, PDF, JSON, and `.sprite` project files |
| Multiple tools (pencil/eraser) | **One tool.** Behavior changes via modifier keys, not tool switching |
| No layers | Full layers panel (add/delete/duplicate/reorder/visibility/opacity) |
| No animation | Frame timeline with playback and onion skinning |
| Fixed palette only | User-editable, reorderable, project-scoped palette (up to 32 colors) + 3 built-in presets |

This document is the current spec; the table above is historical context on what changed, not a pointer to a separate file you need to reconcile against — the earlier "v1" scope isn't shipped as its own document.

---

## 1. Flagged Assumptions — Read First

Three points in the source discussion were ambiguous or self-contradictory. Rather than silently resolve them, here is the default this document builds around for each — confirm or correct before Claude Code proceeds past the relevant section.

1. **Canvas eyedropper trigger.** One statement says "clicking anywhere else in the interface uses an eyedropper," but a separate, later statement establishes that on the canvas, right-click applies the *secondary* color (not an eyedropper) and left-click paints. There is no remaining unclaimed click on the canvas for a generic eyedropper. **Default adopted here:** the eyedropper-on-click behavior described in the palette section applies only within the palette bar's own empty space (clicking the bar background, not a chip, samples whatever color is currently active and does nothing meaningful — effectively this rule has no canvas-level effect). The canvas itself has no plain-click eyedropper; sampling from the canvas happens only via the standard color-picker/hex-entry flow. **Flag for confirmation.**
2. **Palette "add chip" button glyph.** The spec calls it `[x]`, but every other "add" affordance in this spec (`[+]` for new layer, new frame, new project) uses a plus glyph, and `x` conventionally means close/delete. **Default adopted here:** this is styled as a `+` for consistency with every other add-button in the app; treat the `[x]` in the source discussion as a typo. **Flag for confirmation.**
3. **Palette panel default pin state.** The palette is introduced as always-visible and anchored, but later given a `P` key to "unpin" it — implying it participates in the same pin/hover system as the layers/timeline/project panels. **Default adopted here:** the palette is **pinned (visible) by default**; `P` toggles it into the same hover-to-reveal/idle-to-hide behavior as the other panels, rather than being a permanently fixed element. **Flag for confirmation.**
4. **Right-click on a project file** is described twice: once as "lets you rename it," later as "slides out a context menu that lets you resize the canvas." **Default adopted here:** these merge into one context menu with (at minimum) **Rename** and **Resize Canvas** as entries — not two competing behaviors.
5. **Persistence architecture.** Sprite is now web-only (no native build). Browsers don't grant arbitrary folder access by default; the only way to get real, persistent, multi-file directory behavior in-browser is the File System Access API (`showDirectoryPicker`), which is **Chromium-only** (not supported in Safari or Firefox as of this writing). **Resolved (see `DECISIONS.md` and `docs/adr/0001-hybrid-web-storage.md`):** feature-detect `showDirectoryPicker`; if available, offer an optional one-time "connect a folder" grant for real filesystem access; otherwise fall back silently to an IndexedDB-backed virtual filesystem mirroring the same project/file model. Manual PNG/JSON/`.sprite` export remains the way to get work out of the browser regardless of backend.

---

## 2. Intention

Sprite is a minimalist pixel-art editor built around a single idea: **one tool, altered by modifier keys, rather than a toolbox of many tools.** The aim is rapid experimentation with small-scale pixel art — icons, tiny sprites, animation loops — not murals, tilesets, or large sprite sheets. Every feature below should reinforce speed and immediacy over configurability.

---

## 3. Tech Stack

**Visual/styling note:** this document specifies *behavior* — what things do. Every visual detail (the dark color palette and its exact tokens, the m3x6 pixel font and its sizing rules, the chunky offset-shadow button/chip language, corner radius, hairline weights, checkerboard thumbnails, and the full anatomy of the layers/timeline/project panels) lives in `sprite-ui-design-system.md` and is not repeated here. Build the behavior from this document and the look from that one — they're both required, not alternatives.

**Changed from v1 (see `docs/adr/0002-web-stack.md`): plain JavaScript/HTML/CSS, no framework, no build step.** Single web app, no native target, no Electron. Rendering is Canvas2D (`<canvas>` + `ImageData`), UI chrome is DOM/CSS. Loaded directly via `<script type="module">` — no bundler, no transpiler.

Additions required by this spec:

| Need | Approach |
|---|---|
| Serializable undo history | Plain-object command records (`{type, ...}`), `JSON.stringify`-able directly — no class hierarchy needed |
| Project directories | File System Access API (`showDirectoryPicker`) when available, else IndexedDB-backed virtual filesystem (see §1 item 5) |
| Autosave | Debounced write to whichever backend §1 item 5 resolved to, triggered after every committed command, not on a timer |
| SVG export | Hand-rolled: each pixel becomes a `<rect>`; no library needed at this pixel-grid scale |
| PDF export | `pdf-lib` (via CDN or vendored), embedding the rendered raster (PDF is not a native pixel format, so this is "image inside a PDF page," not vector) |
| JPG export | `canvas.toBlob('image/jpeg')` — native browser API, no dependency |
| JSON export | `JSON.stringify` of the same structure used internally for `.sprite` |

---

## 4. Core Vocabulary

| Term | Meaning |
|---|---|
| **Project** | A directory. Contains one or more Files and one shared Palette. |
| **File** | A single canvas document within a Project. Has its own Layers, Frames, and undo history. Saved as `.sprite`. |
| **Layer** | A stack element within a File. All Frames share the same Layer stack. |
| **Frame** | A single point in time within a File's animation. Each Frame has its own pixel content per Layer. A File with exactly one Frame is a static image. |
| **Palette** | Up to 32 color chips. Belongs to a Project (not a File) — switching Files within a Project keeps the same Palette; switching Projects swaps it. |

---

## 5. Data Model

```js
// Project: { name, rootPath, palette, files: [SpriteFile], activeFileIndex }
//   rootPath: FSA FileSystemDirectoryHandle, or virtual path string in IndexedDB
// Palette:  { chips: [colorHex], primary: colorHex, secondary: colorHex }  // chips.length <= 32
// SpriteFile: {
//   name, layers: [Layer], frames: [Frame],
//   activeLayerIndex, activeFrameIndex,
//   canvasWidth, canvasHeight,     // logical size, can exceed visible/exported size after a shrink (see §13.4)
//   visibleWidth, visibleHeight,   // <= canvasWidth/canvasHeight; what's actually shown/exported
//   undoStack: [EditCommand],      // capped at 50, persisted with the file
//   redoStack: [EditCommand],      // NOT persisted — redo history clears on file close/reopen
// }
// Layer:    { name, visible, opacity }  // opacity: 0.0-1.0
// Frame:    { layerPixels: [[colorHex]] }  // one array per layer, indexed same as SpriteFile.layers;
//                                           // each inner array is canvasWidth * canvasHeight, row-major

// EditCommand is a plain tagged object, JSON-serializable as-is:
// { type: 'pixelEdit', layer, frame, before: [[x,y,colorHex]], after: [[x,y,colorHex]] }
// { type: 'fill', layer, frame, before, after, antialiased }
// { type: 'flip', layer, frame, axis, region }
// { type: 'rotate', layer, frame, degrees, region }
// { type: 'moveSelectionContent', layer, frame, dx, dy }
// { type: 'layerAdd', index }
// { type: 'layerDelete', index, removed }
// { type: 'layerReorder', from, to }
// { type: 'frameAdd', index }
// { type: 'frameDelete', index, removed }
// { type: 'frameDuplicate', source, newIndex }
// { type: 'frameReorder', from, to }
// { type: 'canvasResize', oldW, oldH, newW, newH }
```

Each `EditCommand.type` maps to an `apply`/`unapply` pair via a single `switch` — no class hierarchy. This is what makes the command array directly `JSON.stringify`-able into the `.sprite` file for persistent undo (§10).

---

## 6. Canvas & Viewport

- Canvas always opens **zoomed to fill available space** on load (fit-to-window), not at a fixed default zoom.
- Pixels are always rendered perfectly square regardless of window aspect ratio.
- Zoom range: from fit-to-window down to **1:1 actual size** as the *minimum* zoom-out floor — i.e., the user can never zoom out further than one screen pixel per canvas pixel would imply is silly; and can zoom in until a single canvas pixel fills the visible canvas area, whichever constraint is closer. Scroll wheel while hovering canvas zooms in/out (not stepped — free/continuous zoom, unlike v1's snapped-step approach, since no snap increments were specified here).
- Canvas background: dull dark near-black (suggest `#0A0A0A`–`#0C0C0D` — matches the value used throughout the UI mockups in `sprite-ui-design-system.md`, distinct from that document's `bg-base` token which covers the surrounding app chrome, not the canvas fill itself) with a **very subtle** grid overlay by default.
- **`G`** toggles the grid overlay.
- **`Shift+G`** toggles the ruler (top and bottom edges), showing pixel coordinates. Hidden by default.
- While the ruler is visible, the row/column corresponding to the cursor's current position highlights subtly (slight brightness increase, not a hard color) on both the top and bottom rulers.

---

## 7. Color & Palette System

### 7.1 Built-in palettes

Three selectable presets, loadable into a Project's Palette slot:
1. **Game Boy DMG** (4 shades, classic green-gray)
2. **PICO-8** (16 colors, standard PICO-8 palette)
3. A default general-purpose starter palette (16 colors): `#000000 #FFFFFF #7F7F7F #C3C3C3 / #FF0000 #FF7F00 #FFFF00 #00FF00 / #0000FF #7F00FF #FF00FF #00FFFF / #7F3300 #FFC0CB #808000 #003366`. This was a default pick made during design discussion, not something explicitly re-confirmed afterward — revisit if a different third palette is wanted.

### 7.2 Palette bar (top, anchored)

- Chips stretch to fill the bar's width; if there are too many to fit, **scrolling while hovering the bar** slides the strip left/right to reveal the rest.
- Hover on a chip: lifts slightly (small y-offset, shadow increase).
- **Left-click** a chip: sets primary (left-click/brush) color.
- **Right-click** a chip: opens an HSL square color picker popup, hex text field as the default input method.
- **Alt + right-click** a chip: sets that chip's color as the **secondary** (right-click) color, without opening the picker.
- **Drag** a chip: reorders it within the strip.
- Hovering the **right edge** of the bar reveals an add-chip button (styled `+`, see flagged assumption §1.2). Max 32 chips; button disabled/hidden at cap.
- **`1`–`0`** keys: set primary color to the 1st–10th chip (left to right).
- **`Alt+1`–`0`**: set secondary color to the 1st–10th chip.
- Palette is **pinned (visible) by default**; **`P`** toggles it into hover-reveal/idle-hide behavior like the other side panels (see flagged assumption §1.3, and §15 for the shared reveal mechanic).
- Palette belongs to the **Project**, not the File — switching Files within a Project keeps the palette; switching Projects loads that Project's palette.

---

## 8. Drawing Model — One Tool, Modifier-Driven

There is no tool palette. A single interaction model, altered by held modifier keys, covers every drawing operation:

| Input | Effect |
|---|---|
| Left click | Set hovered pixel to primary color |
| Left click + drag | Set every pixel the cursor passes over to primary color (Bresenham-filled between samples to avoid gaps at speed) |
| Right click / drag | Same as above, using **secondary** color instead of primary |
| `Alt` + click/drag | Same paint behavior, but **antialiased** edges |
| `[` / `]` (while `Alt` held) | Decrease / increase the antialiased brush's size, up to a max of **one quarter of the canvas** dimension |
| `Ctrl` + click | Flood-fill all contiguous pixels of the same color as the clicked pixel, with the active color |
| `Ctrl+Alt` + click | Same flood fill, antialiased edges |
| `Shift` (hold) | Switches interaction to **selector** mode: click = select one pixel; click+drag, released = selects the dragged rectangular area |
| `Shift+Alt` (hold) | **Magic wand** selector — selects contiguous same-color region (antialiasing-aware detection; the resulting selection respects soft/aliased edges rather than a hard boundary) |
| `Shift+Ctrl` (hold) | **Polygonal** selector — click to place points at pixel corners or centers; releasing the modifiers connects the last point back to the first automatically, or the user can click the starting point to close the shape manually |
| `Space` (hold) + left-drag | Pan the canvas |
| `Alt` + right-click a **palette chip** | Sets that chip as the secondary color (see §7.2 — listed here too since it's part of the same modifier vocabulary) |

Every modifier state must change the **cursor icon** to indicate the active mode (plain dot for default paint, a soft-edged brush glyph for antialiased paint, a bucket for fill, a marquee/wand/lasso icon per selector variant, an open hand for pan). This is a hard requirement, not a nice-to-have — the entire interaction model depends on the user always knowing which mode is currently active without needing to check a toolbar, since there is no toolbar-based tool indicator.

---

## 9. Selection System

### 9.1 Creating a selection
Covered in §8 — plain drag-select, magic wand, or polygonal, all gated behind `Shift`-family modifiers.

### 9.2 Acting on a selection

| Input | Effect |
|---|---|
| `Ctrl+A` | Select entire canvas, current layer only |
| `Ctrl+C` | Copy — targets the hovered pixel if no selection exists, otherwise the full selection |
| `Ctrl+X` | Cut — same targeting rule as copy |
| `Ctrl+V` | Paste |
| `F` | Flip horizontally — **requires an active selection** |
| `Shift+F` | Flip vertically — requires an active selection |
| `R` (hold) | Free rotation: shows a bounding box around the selection with a handle (pip) extending from the bottom; dragging the pip rotates freely |
| `Shift+R` (hold) | Same rotation handle, but snapped to 15° increments |
| `Shift+Arrows` | Moves the **selection boundary itself** (reposition what's selected, content underneath stays put) |
| `Shift+Ctrl+Arrows` | Moves the **selected content** (the pixels move with the selection) |
| `Shift+Ctrl+Drag` | Freely moves the selected content by mouse drag |
| `Backspace` / `Delete` | If hovering a pixel with no selection: deletes that one pixel (sets transparent). If a selection is active: deletes every pixel within it |
| `Esc` | Clears the current selection |

### 9.3 Selection persistence
A selection **persists across Layer and Frame switches** within the same File — switching layers or frames does not clear it. (Confirmed explicitly during design discussion.)

---

## 10. Undo, Redo, and Autosave

- **No manual save exists.** Every committed change (end of a drag-stroke, a fill, a flip, a layer op, a frame op, a resize) immediately triggers autosave.
- Autosave writes to whichever backend §1 item 5 resolved to: a real file via the File System Access API handle, or the IndexedDB virtual filesystem entry for that file.
- **Undo stack: 50 steps, and it is part of the file itself** — closing and reopening a File preserves the ability to undo actions from the previous session. This is why `EditCommand` is a plain JSON-serializable object (§5) rather than a class hierarchy.
- **Redo stack is not persisted.** It exists only for the current session and clears whenever the file is closed/reopened, or whenever a new command is committed after an undo (standard redo-invalidation behavior).
- Keybinds: `Ctrl+Z` (undo), `Ctrl+Y` and `Ctrl+Shift+Z` (redo — support both for habit variance).

---

## 11. Layers Panel

Reveal behavior: hovering the **right edge** of the app slides the panel in; mousing away slides it back out. `L` toggles it pinned (stays open regardless of hover) or closed. See §15 for the precise reveal/hide/pin/focus mechanic shared across all slide-in panels.

| Element / Input | Behavior |
|---|---|
| Top row | Always a `+` button — adds a new layer |
| Click a layer's **thumbnail** | Toggles that layer's visibility in the canvas |
| Click a layer's **row/name** (not the thumbnail) | Sets that layer as the **active** layer for drawing |
| Right-click a layer's thumbnail | Slides out an opacity/transparency slider for that layer |
| Hover the **right side** of a layer row | Reveals a red `x` delete button |
| `Backspace`/`Delete` (panel focused) | Deletes the current (active) layer |
| `Up`/`Down` (panel focused) | Navigate active layer selection |
| `Shift+Up`/`Down` (panel focused) | Reorders the active layer up/down the stack |
| Drag a layer row | Reorders layers directly |

---

## 12. Timeline (Frames) & Onion Skinning

Reveal behavior: hovering the **bottom edge** slides the timeline up; mousing away slides it back down. `T` toggles pinned/closed. Same reveal mechanic as §15.

### 12.1 Frame operations

| Input | Behavior |
|---|---|
| Click a frame | Selects it (same click-to-select pattern used throughout) |
| `+` button, or `+` key (panel focused/pinned) | Adds a new frame |
| `Ctrl+` `+` (panel focused/pinned) | Duplicates the current frame |
| Drag a frame | Reorders it |
| `Left`/`Right` (panel focused/pinned) | Navigate between frames |
| `Shift+Left`/`Right` (panel focused/pinned) | Reorders the current frame left/right |
| `Backspace`/`Delete` (panel focused) | Deletes the current frame |

### 12.2 Playback

- `Ctrl+Space`: play/pause the frame sequence. **Note:** `Ctrl+Space` is intercepted by some OS-level input-method-switch bindings on Windows/Linux — verify on target platforms and provide a documented fallback binding if it proves unreliable, rather than silently failing.
- **No dedicated play/pause button exists in the UI.** Playback is keyboard-only, so the timeline strip doesn't spend space on a control that duplicates a keybind.
- FPS is shown as a **single field**, not separate increment buttons — drag left/right to change the value, or click into it to type a value directly.
- **Inserting a frame at a specific position:** hovering the gap between two adjacent frames separates them slightly and reveals an insert-here `+` (the same interaction as Canva's between-element insert). This is in addition to the add-frame button at the strip's end (§12.1), which always appends rather than inserting at a position.

### 12.3 Onion skinning

- Range is **fixed at 2 frames** in each direction — not user-configurable, and there is no range control in the UI at all. (This was originally scoped as an adjustable 1–3 range and was deliberately simplified — see the design principle in §0.1: Sprite is opinionated, not customizable.)
- Ghosted frames are **tinted and faded**: frames before the current one tint toward one color (suggest red), frames after tint toward another (suggest blue), with opacity falling off the further a ghost frame is from the current one.
- Toggleable between showing the **full composited frame** (all layers) or **active-layer-only** as the ghost source.

---

## 13. Project Panel & File Management

Reveal behavior: hovering the **left edge** slides this panel in; mousing away slides it back out. `Tab` toggles pinned/closed. Same mechanic as §15.

### 13.1 Layout (top to bottom)

1. **Project name** (top). A `+` to its right starts a new project. Clicking the name itself allows editing it inline; right-clicking opens a rename option (merged with §1.4's resolution if applicable — for the project name specifically, this menu is rename-only, since resize doesn't apply to a project, only to individual files).
2. **File list** below the name. Top entry is always a `+` to add a new file to the project.
3. **Export/Import** controls, anchored to the **bottom** of the panel (separate from the scrolling file list above).

### 13.2 Creating things

- Clicking the project's `+`: opens a slide-out bar with a text cursor already active; type a name, hit `Return` to create and switch into the new project.
- Clicking the file list's `+`: opens a **popup** (not a modal — the rest of the UI stays interactive/visible around it) prompting canvas size selection: one of the presets (`6x6, 9x9, 16x16, 24x24, 32x32, 64x64, Pico-8, Game Boy DMG`) or a custom width × height (Tab between the two fields; height mirrors width until edited; 6×6 minimum, 256×256 maximum; larger typed values snap to 256, non-square allowed). Pico-8 (128×128) and Game Boy DMG (160×144) also swap the Project's palette to match. *(Revised: this section originally allowed presets only and deliberately dropped custom sizing — see `docs/adr/0003-canvas-size-range.md`.)*

### 13.3 Navigating and editing

- Clicking between files in the list **instantly swaps** the visible canvas to that file — no confirmation, no save prompt (there's nothing to lose; autosave already covers it).
- Right-click a file: opens a context menu with (at minimum) **Rename** and **Resize Canvas** (see §1.4).
- Right-click the project name: opens a rename option.

### 13.4 Canvas resize behavior

- Resizing **larger**: canvas grows outward from **center**.
- Resizing **smaller**: pixels outside the new visible bounds are **not deleted** — they're simply outside `visible_width`/`visible_height` (see the `SpriteFile` struct in §5) and excluded from both the on-screen canvas and any export. If the canvas is later resized larger again, those previously out-of-bounds pixels reappear intact, since `canvas_width`/`canvas_height` (the logical/full backing buffer) never actually shrinks — only the visible window into it does.

### 13.5 Projects on disk

- A Project is a directory. Individual canvas documents within it are `.sprite` files. (Native: real directory. Web: virtual, per the IndexedDB approach flagged in §1.5.)

---

## 14. Export

- Triggered by an **Export** button, or the **`E`** key.
- Pressing `E` (or the button) **slides the Project panel out** if it isn't already visible, and opens a **context bar** to the right of the currently selected file, containing: a file-type selector, a scale multiplier selector, and an export/confirm icon.
- `Return` while this context bar is open executes the export using whatever is currently set.
- **Default**: PNG at 1x scale. The app **remembers the user's last-used format and scale globally** (not per-project) and defaults to that on the next export.
- **Formats:** PNG, JPG, SVG, PDF, JSON, `.sprite` (the last being a full project-file export, distinct from the app's own autosave location).
- **Scale multiplier**: integer upscale (nearest-neighbor, no smoothing) — exact preset steps (2x/4x/8x/etc.) to be confirmed, but the mechanism is an integer multiplier applied to the visible canvas dimensions.
- **Alpha handling for JPG/PDF** (neither supports transparency): background fill **defaults to white**. Clicking the JPG (or PDF) format option a **second time** toggles the fill to black. **Right-clicking** the JPG or PDF option sets the fill to the user's current **secondary** color instead.

---

## 15. Panel Reveal / Hide / Pin / Focus Model

This single mechanic governs the Layers, Timeline, Project, and (when unpinned) Palette panels. Implement it once, reuse it everywhere — do not build four separate versions.

- **Reveal:** hovering the trigger edge (right for Layers, bottom for Timeline, left for Project) slides the panel in.
- **Hide:** the panel slides back out when the user's mouse leaves it — but this must account for **intent**, not just raw hover-exit. Track cursor speed and distance since leaving the panel's bounds; only actually hide it once the movement pattern indicates the user meant to leave (e.g., a fast, sustained movement away), not an incidental overshoot or a brief flick back toward the canvas. A naive "hide on mouseleave" will feel twitchy and wrong — this needs real tuning, not just an event handler.
- **Pin:** each panel's dedicated key (`L` layers, `T` timeline, `Tab` project, `P` palette) toggles it pinned open regardless of hover state, or closes it if already pinned.
- **Focus:** a panel has keyboard focus whenever the mouse is hovering it (including while it's revealed via hover) **or** whenever it is pinned. A pinned panel **keeps** focus even after the mouse leaves it, until the user clicks elsewhere or moves the mouse away with enough speed/distance to indicate they've moved on (the same intent-detection logic as the hide behavior above, reused for focus release rather than visual hiding). Focus determines which set of context-scoped keybinds (arrow-key navigation, `Backspace`/`Delete` meaning, etc. — see §16) is currently active.

---

## 16. Complete Keybind Reference

| Key(s) | Context | Effect |
|---|---|---|
| `G` | Global | Toggle grid overlay |
| `Shift+G` | Global | Toggle ruler |
| `1`–`0` | Global | Set primary color to palette chips 1–10 |
| `Alt+1`–`0` | Global | Set secondary color to palette chips 1–10 |
| `[` / `]` | While `Alt` held | Decrease/increase antialiased brush size (max ¼ canvas) |
| `Ctrl+A` | Canvas | Select all (current layer) |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Canvas | Copy / cut / paste (hovered pixel, or selection if one exists) |
| `F` / `Shift+F` | Canvas, requires selection | Flip horizontal / vertical |
| `R` (hold) | Canvas, requires selection | Free rotation handle |
| `Shift+R` (hold) | Canvas, requires selection | 15°-snapped rotation handle |
| `Shift+Arrows` | Canvas, requires selection | Move the selection boundary |
| `Shift+Ctrl+Arrows` | Canvas, requires selection | Move the selected content |
| `Shift+Ctrl+Drag` | Canvas, requires selection | Freely move selected content |
| `Arrows` (no modifier) | Canvas, no selection | Navigate pixel cursor |
| `Return` / `Alt+Return` | Canvas, keyboard-navigated pixel | Stamp primary / secondary color |
| `Backspace`/`Delete` | Canvas | Delete hovered pixel, or full selection if one exists |
| `Esc` | Canvas | Clear selection |
| `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` | Global | Undo / redo |
| `Space` (hold) + left-drag | Canvas | Pan |
| `L` | Global | Pin/unpin Layers panel |
| `Backspace`/`Delete` | Layers panel focused | Delete active layer |
| `Up`/`Down` | Layers panel focused | Navigate active layer |
| `Shift+Up`/`Down` | Layers panel focused | Reorder active layer |
| `T` | Global | Pin/unpin Timeline panel |
| `+` / `Ctrl+` `+` | Timeline focused/pinned | Add / duplicate frame |
| `Left`/`Right` | Timeline focused/pinned | Navigate frames |
| `Shift+Left`/`Right` | Timeline focused/pinned | Reorder frames |
| `Backspace`/`Delete` | Timeline focused | Delete current frame |
| `Ctrl+Space` | Global | Play/pause timeline |
| `Tab` | Global | Pin/unpin Project panel |
| `P` | Global | Pin/unpin Palette panel |
| `E` | Global | Open export context bar |
| `Return` | Export context bar open | Execute export |

Note the deliberate overload of `Backspace`/`Delete`, `Arrows`, and `+` across canvas/layers/timeline contexts — this is intentional and relies entirely on the focus model in §15 to disambiguate. There is no case where two of these contexts can hold focus simultaneously.

---

## 17. UI Layout Overview

```
┌─────────────────────────────────────────────────┐
│  Palette bar (shrinks to fit between side panels)│
├───┬───────────────────────────────────────────┬──┤
│ P │                                           │ L │
│ r │                                           │ a │
│ o │              Canvas (fills                │ y │
│ j │           available space,                │ e │
│ e │            zoomed to fit)                  │ r │
│ c │                                           │ s │
│ t │  (stops flush against timeline's top edge) │   │
│ (hover-in from left)                (hover-in from right)
├───┴───────────────────────────────────────────┴──┤
│  Timeline — full window width, does not shrink   │
└─────────────────────────────────────────────────┘
```

**Layout priority (revised from an earlier version of this diagram):** the timeline panel always spans the **full window width** at the bottom and never shrinks to accommodate the side panels. The Project and Layers panels, when active, span from the top of the canvas area down to the **top edge of the timeline panel** — flush against it, not extending past it to the absolute bottom of the window. The palette bar is the one that still shrinks horizontally to fit the gap between whichever side panels are currently open (unchanged from the original behavior). Only the canvas and the (pinned-by-default) palette bar are visible at rest; everything else is edge-triggered per §15.

---

## 18. File I/O & `.sprite` Format

- `.sprite` is a `serde_json`- or `bincode`-serialized dump of a `SpriteFile` (§5), including its full `undo_stack` (capped at 50 entries — once full, the oldest entry is dropped as a new one is pushed).
- **JSON export** (§14) is a human-readable dump of the same structure, intended for interop/inspection rather than reopening in Sprite itself (though there's no reason it couldn't also be re-imported — confirm if that's desired, or if JSON export is one-way only).
- **Autosave** writes the current `SpriteFile` state to its `.sprite` location after every committed `EditCommand`. This should be debounced against rapid-fire commands (e.g., end-of-stroke) rather than writing mid-stroke.
- Native: real file paths under the Project's directory. Web: entries in the IndexedDB virtual filesystem, keyed by Project/File path (see §1.5).

---

## 19. Build Plan — Ordered Phases (revised)

1. **Phase 0 — Scaffold.** Repo layout, `index.html` + empty `<canvas>` served with zero build step, opens directly in a browser.
2. **Phase 1 — Single canvas, single layer, single frame.** Canvas data model, zoom-to-fit rendering, grid overlay (`G`).
3. **Phase 2 — Modifier-key drawing model.** Plain paint, `Alt` antialiased paint + `[`/`]` sizing, `Ctrl` fill + `Ctrl+Alt` antialiased fill, cursor-icon switching per mode.
4. **Phase 3 — Palette system.** Chip bar, drag reorder, add/remove, HSL+hex picker popup, primary/secondary, `1`-`0`/`Alt+1`-`0`, built-in presets (DMG/PICO-8/default).
5. **Phase 4 — Selection system.** All three selector modes (`Shift`, `Shift+Alt`, `Shift+Ctrl`), select-all, delete-within-selection, `Esc`.
6. **Phase 5 — Undo/redo, in-memory only.** `EditCommand` objects + apply/unapply, 50-step cap, `Ctrl+Z`/`Ctrl+Y`. Do not persist yet.
7. **Phase 6 — Persistence backend.** Implement the hybrid storage from §1.5 (`docs/adr/0001-hybrid-web-storage.md`): File System Access API when available, IndexedDB fallback otherwise — this affects every phase after it.
8. **Phase 7 — Projects & Files.** Project panel, multiple `SpriteFile`s per project, new-project/new-file flows, instant-swap between files, resize-canvas-from-center with the hidden-pixel-preservation behavior (§13.4).
9. **Phase 8 — Autosave + persisted undo.** Wire `.sprite` read/write via Phase 6's backend, confirm undo history survives a close/reopen cycle.
10. **Phase 9 — Layers.** Full layers panel per §11, including its focus-scoped keybinds.
11. **Phase 10 — Frames & Timeline.** Frame operations, playback, FPS control.
12. **Phase 11 — Onion skinning.** Per §12.3.
13. **Phase 12 — Selection operations.** Copy/cut/paste, flip, rotate (free + snapped), move-selection-vs-move-content distinction.
14. **Phase 13 — Panel reveal/hide/pin/focus mechanic.** Build this once as a shared component (§15), then wire Layers/Timeline/Project/Palette to it.
15. **Phase 14 — Export.** All six formats, scale multiplier, remembered last-used settings, JPG/PDF alpha-fallback fill + toggle/right-click behavior.
16. **Phase 15 — Packaging.** Zip the static site (`index.html` + assets, no build artifact to generate) for itch.io upload.

---

## 20. Non-Goals (unchanged in spirit from v1)

Sprite is still aimed at small-scale, rapid pixel art — not large sprite sheets, tilemaps, or general-purpose image editing. Nothing in this document should be read as inviting scope beyond what's written here (e.g., no plugin/scripting system, no canvas larger than 256×256, no non-integer zoom snapping unless specified).
