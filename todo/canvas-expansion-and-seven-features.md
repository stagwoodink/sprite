# Canvas size expansion + seven pixel-editor features

Execution brief. Supersedes the feature list in `pixel-editor-improvements.md`,
which described the seven candidates but predates the decisions recorded here.

Read `spec/INDEX.md` first for document precedence, then
`spec/sprite-design-doc.md`. Where this file and the spec docs disagree, this
file wins and the spec docs are amended in place (see A5).

---

## Why this exists

`pixel-editor-improvements.md` lists seven feature candidates already filtered
against Sprite's constraints. Three of them — palette from image, reference
layer, spritesheet import — are bounded by how large a canvas can be, and
today's ceiling is 64×64. Raising that ceiling is larger and riskier than the
seven features combined, so it ships first as Plan A.

Two scaling defects already exist at 64×64 and turn fatal at any larger size.
Both are fixed in Plan A:

- `main.js:735` re-composites the entire canvas on every animation frame, even
  when nothing changed.
- `commitLayerChange` (`main.js:701`) `structuredClone`s all layers × all frames
  on every structural layer edit, and `undo.js:3` keeps 50 of them. At 64×64
  with 4 layers and 24 frames that is already roughly 150MB across the stack.

## Standing constraint: speed and resource use

Speed and resource management are top-priority constraints on this project,
ranked alongside correctness rather than deferred as later optimization. Before
adding anything to this plan, evaluate its runtime and memory cost. If a change
would compromise either, do not absorb the cost quietly — raise it, propose an
alternative, or drop the feature.

Watch specifically for the three things that multiply: canvas area, frame count
and layer count. Also watch for per-frame work inside the render loop,
whole-state snapshots or clones, and serialization that rewrites data which did
not change. Several items below (A2, A3, A4b, A4c, and the storage and decode
decisions in A1, B5 and B7) exist purely to satisfy this constraint.

## Published decisions being reversed

1. **Canvas sizes** — reverses `sprite-design-doc.md` §20 ("no arbitrary canvas
   sizes beyond the preset list"), §14 ("No custom-size option — this was
   considered and deliberately dropped"), and the comment at `project.js:124`.
2. **Palette library** — reverses `DECISIONS.md:20` ("User-facing palette
   swapping/customization … is out of scope for now (YAGNI)").
3. **Palette size** — `CONTEXT.md:22`'s "Up to 32 color chips" becomes 256.
4. **Eyedropper key** — `CONTEXT.md:29`'s hold-`D` plan is dropped. `D` becomes
   the dither toggle and the eyedropper stays on `i`, where the code already
   has it.

Use the `adr-documenter` agent for ADR 0003. Do **not** run `shadow-documenter`
or `ux-documenter`: they target `spec.md` and `features.json`, neither of which
exists in this repo, and running them would fork the documentation hierarchy
that `spec/INDEX.md` deliberately orders.

Fixed in passing: `keybind-help.js:41` labels `=` "Zoom to fit" while
`main.js:1944` calls `maxZoomScale` (fill) — B1 makes the label true.
`DECISIONS.md:29` says the starter File is 16×16 while `project.js:131` says
9×9 — 9×9 wins, this being a micro-pixel editor.

`src/version.js` is bumped once per phase, not per commit. Plan A is one MINOR
bump (it carries `!` changes); Plan B's features are PATCH bumps. Never 1.0.0 —
that remains a manual human milestone.

---

# Plan A — canvas size range

## A0 · ADR

Write `docs/adr/0003-canvas-size-range.md`, shaped like `0002-web-stack.md`.
Record what §20 and §14 said, why they are reversed, the 512×512 ceiling and its
rationale, and the pixel-model rewrite it forces.

## A1 · `refactor(canvas)!: typed-array color-table pixel buffers`

No size changes in this series. It must be reviewable against today's 64×64
files so that a regression here is distinguishable from a sizing bug.

`model.pixels` is currently a plain `Array` of hex strings or `null`
(`sprite-file.js:17`). At 512² a 24-frame, 4-layer File is roughly 288MB of
pointers. Typed buffers bring that to roughly 72MB.

Replace it with a `Uint16Array` of indices into a **per-File color table** —
not palette indices. This distinction is critical: `blendPixel`
(`canvas-model.js:73`) writes off-palette blended colors straight into the
buffer, which is what `Alt`-paint does, and `canvas-model.js:70` documents the
intent ("Baking the blend into a resolved color… keeps the model a flat grid of
solid-or-transparent colors"). Palette indices would break the antialiased
brush outright.

- Index `0` is reserved for transparent, replacing `null`.
- Palette chips are a subset of the table; antialiased blends append entries.
- 65,535 distinct colors per File.
- Editing a palette chip still does not repaint existing art, exactly as today.

Touch points, all of which currently assume hex strings:

- `canvas-model.js` — `setPixel`, `getPixel`, `blendPixel`, `stampBrush`,
  `stampSquare`, `floodFill`, `snapshotPixels`, `diffFromSnapshot`. Keep the
  public signatures hex-based and resolve to indices internally, so callers do
  not all have to change.
- `sprite-file.js` — `createFrame`, `compositeFrameAt`, `compositeLayerAt`,
  `cropToVisible`, `resizeCanvas`, `addLayer`, `deleteLayer`, `moveLayerItem`.
- `renderer.js:514` `buildPixelBuffer` — composite straight into the RGBA
  `Uint8ClampedArray`, skipping the intermediate hex-string array. Today this is
  two passes plus a string parse per pixel per frame.
- `export.js:101` `pixelsToRgba`, `:60` `pixelsToCanvas`, `:85` `pixelsToSvgString`.
- `thumbnail.js`.

### `.sprite` format v2, with migration

- **Buffers serialize as raw binary, never as base64 text inside the JSON.**
  Base64 is 33% larger and `JSON.stringify` over a large encoded string blocks
  the main thread on every autosave. IndexedDB stores `ArrayBuffer` natively
  with no encoding at all; the FSA backend writes a binary sidecar beside the
  `.sprite`. This requires a binary write path in `storage.js`, which is
  currently JSON-only (`createIndexedDbBackend` at `:35`,
  `createFsaBackend` at `:67`).
- Add `version: 2` to the File object; absent means v1.
- Auto-migrate v1 files on load: hex arrays are converted to the color-table
  form and re-saved. This also covers the existing project, so no separate
  conversion step is needed.
- Undo commands (`[x, y, color]` triples, `undo.js:35`) are dropped on
  migration, not converted. `undoStack` is already expendable state —
  `redoStack` is wiped on every save by design (§10).
- `export.js:375` `exportProjectSpriteImpl` writes the same shape, so it follows
  automatically.

## A2 · `refactor(undo): delta-based layer commands`

`commitLayerChange` (`main.js:701`) snapshots `{layers, frames,
activeLayerIndex}` via `structuredClone` both before and after every structural
edit, and `undo.js:14-18` / `:25-29` replay whole state. This is fatal at 512².

Record only what changed — which layer, and its buffers — instead of whole
state. `applyLayerSnapshot` (`undo.js:25`) becomes a delta applier. This is
required for 512×512 to work at all, and is a large memory win at every existing
size.

## A3 · `perf(renderer): cache composited frames`

- Add `file._compositeCache`, stripped in `saveProject` alongside `redoStack`.
- Invalidate from the existing `bindActiveFile()` / `draw()` triad
  (`main.js:503`, `:816`) and on any layer or frame structural change.
- Then add dirty-rect re-composite: track a changed bounding box per edit and
  re-walk only that region.

Idle, pan and zoom then cost one blit regardless of canvas size.

## A4 · `feat(canvas): expanded size presets and custom sizing`

Replace `NEW_FILE_SIZES` (`project.js:125`) with:

```
6x6 · 9x9 · 16x16 · 24x24 · 32x32 · 64x64 · Pico-8 · Game Boy DMG · 256x256 · 512x512
```

The console names stay bare, and choosing one also swaps the Project's palette
to match. Pico-8 is 128×128 with the Pico-8 palette; Game Boy DMG is 160×144
with the DMG palette. The name collision with Palette Presets (`CONTEXT.md:24`)
is intentional — the two are meant to be used together. If the outgoing palette
has unsaved edits, the B2a auto-save rule fires first.

**Custom size**: two fields with `Tab` between them, `H` mirroring `W` until
edited so that a square stays one keystroke. Minimum 6×6, maximum 512×512,
non-square permitted at any size. It lives in the existing file-creation popup —
`sprite-features-doc.md:207`: "canvas creation never happens as a modal blocking
the whole app."

512×512 is the ceiling because it is the largest size at which every export
target still works inside the existing 25MB warning gate (`export.js:143`). SVG
is built by string-concatenating one `<rect>` per pixel (`export.js:85-95`, about
90 characters each): at 512² that is 262,144 rects, roughly 23.6MB, just under
the gate. At 612² it is roughly 33.7MB, which would trip the confirm on every
export.

There is no animation cap. Every size animates and the Timeline is always
present, so `resizeCanvas` needs no new guard.

**Autosave throttle**: `main.js:492` debounces at a flat 400ms. Scale it by
canvas area — 400ms at small sizes, stretching toward roughly 5s at 512².

## A4c · `feat(project): project capacity meter`

Nothing currently bounds a Project's size, and canvas area, frame count, layer
count and File count all multiply together.

Add a **capacity bar in the Projects panel, above the project name and below the
new-File button.** It fills as the Project grows.

The four factors the user named are already one number: files × layers × frames
× area *is* total buffer bytes — `canvasWidth * canvasHeight * 2 * layers *
frames`, summed across Files. The only thing bytes miss is that many tiny Files
still cost DOM and thumbnail work, so the meter shows the worse of two ratios:

```
load = max(totalBufferBytes / 256MB, fileCount / 64)
```

Both budgets are tuned to keep a low-end 4GB Chromebook responsive. For scale,
one 512² File with 4 layers and 24 frames is roughly 100MB, so the bar fills at
about two to three heavy Files, or many light ones.

**The meter is advisory and never blocks.** At 100% it offers to **split the
Project by Collection**: each Collection is promoted to a Project named after
itself, and Files at the Project root stay where they are. This reuses the
user's own organisation to decide the split rather than inventing one. Nothing
is refused and no action is interrupted — the bar filling *is* the warning.

Style it from the existing tokens (`src/style.css` `:root`); it is a plain
filled rectangle, square corners, no gradient — `sprite-ui-design-system.md:26`
and `:28` are hard rules.

## A4b · `perf(persistence): write only Files that changed`

`saveProject` (`persistence.js:84`) maps over `project.files` and writes **every
File on every autosave**, changed or not. Drawing one pixel in a 10-File project
re-serializes all ten. This is already wasteful at 64×64 and untenable at 512².

`file.updatedAt` already exists and is bumped by `commitCommand`
(`undo.js:22`). Track a `lastSavedAt` per File and skip any File whose
`updatedAt` has not moved. Also skip rewriting `project.json` unless its
metadata actually changed — it is currently written unconditionally at
`persistence.js:77`.

## A5 · `docs(spec): record the canvas, palette and keybind reversals`

Amend `sprite-design-doc.md` §14 and §20 in place. Rewrite the `DECISIONS.md`
preamble to drop the "original package" framing, which stops being true once the
spec files are edited. Update `CONTEXT.md`: palette cap 32 to 256, and remove the
hold-`D` eyedropper line.

---

# Plan B — the seven features

## B0 · `refactor(canvas): unify mouse and keyboard paint dispatch`

Prerequisite for B3 and B4. Paint logic is duplicated, not shared:

- `input.js:38-54` — `placeAt` and `eraseAt` (mouse)
- `main.js:1728-1744` — `stampCurrentTool` (keyboard)

plus two independent hard-square implementations (`stampSquare`,
`canvas-model.js:94`, versus `squareOffsets`, `main.js:1745`).

Symmetry and dither both mean "change how a cell gets painted," so without this
they get built twice and drift apart. `sprite-design-doc.md:313` is explicit:
"Implement it once, reuse it everywhere — do not build four separate versions."

Export one function from `canvas-model.js`:

```js
paintAt(model, x, y, { size, antialiased, erase, color, mask, symmetry, dither })
```

Both call sites route through it. No behavior change in this commit. Land it
after A1 so it is written against the typed-array buffers directly.

**Trap**: `model.pixels` is indexed by `stride` (`canvas-model.js:13`) but masks
and every renderer and selection loop use `width`. The two differ after a canvas
shrink. Symmetry math must go through `setPixel` and `getPixel`, never compute
buffer offsets directly.

## B1 · `feat(viewport): fit to selection, falling back to canvas`

No new keybind. `=` becomes: fit the selection if one exists, otherwise fit the
whole canvas.

- Switch `=` from `maxZoomScale` to the currently unused `fitScale()`
  (`viewport.js:6`), so the whole canvas is visible rather than cropped. This
  also makes `keybind-help.js:41`'s existing "Zoom to fit" label true.
- `maskBounds(model, mask)` already exists at `selection-ops.js:5`, returns
  `{minX, minY, maxX, maxY, w, h}`, returns `null` on an empty mask, and is
  already imported into `main.js:8`. Reuse it directly.
- Compute the scale from the bounding box, then set `panX` and `panY`
  explicitly. `zoomTo` (`main.js:1429`) zooms about the viewport centre and does
  not touch pan except in its snap-to-fit branch.
- Clamp through the existing `minZoomScale` and `maxZoomScale`
  (`viewport.js:17`, `:28`).
- No integer snap — `sprite-features-doc.md` §1.3 established continuous zoom.

## B2a · `feat(palette): named global palette library`

The largest piece of Plan B. Today the Project holds exactly one palette
(`project.js:14` — `{chips, primary}`, with no name) and the menu lists three
hardcoded presets plus "New Palette" (`palette.js:12`).

- Global, in a new `sprite-palettes` localStorage key beside `sprite-ui-prefs`
  (`ui-prefs.js:7`), reusing that module's load and save shape.
- Capped at 30 saved palettes. Warn the user on an import or new-palette action
  that would exceed it.
- Projects keep their own copy. `project.json`'s `palette` stays a live value,
  not a link — the library is a source you load from. Deleting a library entry
  therefore cannot reach into any Project.
- The palette object gains a `name` field.
- The chip cap rises from 32 to 256. The bar renders up to 32 inline; beyond
  that it scrolls, 16 chips at a time. `1`-`9` and `0` select the first ten
  currently visible (`main.js:1911`'s `DIGIT_INDEX`).
- Auto-save on switch, but only when the outgoing palette has unsaved edits —
  that is, when it differs from the saved entry it came from. Switching away
  from an untouched Pico-8 saves nothing; this is what stops the list becoming a
  junk drawer. Auto-saved entries are named `<project-name>` with the existing
  collision rule (never a `1` suffix on the first instance, `DECISIONS.md:29`).
- Menu: one list, built-ins first, saved palettes below a hairline divider.
  Delete via a hover-revealed `✕` on each saved row, matching layer rows
  (`layers-panel.js:110`). Built-ins are non-editable and have no `✕`.
- Rename: `Shift+Enter` in the Colors panel. `Enter` is already bound to editing
  the primary chip's colour (`CONTROLS.md:96`), and `Shift+Enter` exactly mirrors
  the Projects panel, where `Enter` renames the focused item and `Shift+Enter`
  renames the container (`CONTROLS.md:107-108`).
- `+ New Palette` creates a blank working palette that enters the library only
  once it has chips, using the same unsaved-edits rule.
- Loading a palette resets the prime colour to `chips[0]`, matching `loadPreset`.

## B2b · `feat(palette): import .gpl, .hex and JASC .pal`

New module `src/palette-parse.js`. All three formats are line-oriented text and
share one tokenizer. Skip RIFF binary `.pal` (a byte parser for a format Lospec
does not export) and Paint.NET `.txt` (its alpha channel is meaningless in a
no-alpha app).

- `.gpl` — GIMP: skip the header and `#` comments, parse `R G B Name`.
- `.hex` — Lospec: one bare hex per line.
- `.pal` — JASC: `JASC-PAL` / version / count header, then `R G B`.

Emit uppercase `#RRGGBB` to match the chip convention (`palette.js:224`). An
imported palette enters the library named after its source filename (sanitized)
and is switched to. Nothing is destroyed, so no undo entry is needed. Truncate
at 256.

**Bug to fix here**: the chip cap is enforced only in `addChip`
(`palette.js:209`) and `pickColor` (`palette.js:225`). `loadPreset`
(`palette.js:43`) and `newPalette` (`palette.js:51`) assign
`state.chips = [...p.chips]` with no length check at all. Move the cap into the
shared load path so that import and presets cannot diverge.

No URL import, ever — `index.html:7` sets `connect-src 'self'`, so fetching
lospec.com directly is blocked by CSP.

## B3 · `feat(canvas): dither mode for paint and fill` — `D`

- Toggle in `dispatchCanvas`, following the exact four-step pattern at
  `main.js:1946`: flip a module-level `let`, mirror it into `uiPrefs`, call
  `saveUiPrefs(uiPrefs)`, then `draw()`. Add one key to `DEFAULTS`
  (`ui-prefs.js:8`).
- Applies to Paint (the antialiased `Alt` brush) and Fill. **Place — the
  hard-edged square stamp on left click — is unchanged.** These are distinct
  tools in Sprite's vocabulary (`CONTEXT.md:33`, `CONTROLS.md:39-40`). Fill is
  `floodFill` (`canvas-model.js:107`) plus the mask-walk branch at `main.js:1760`.
- Off-cells are skipped, not erased. Dither is a 50%-coverage paint that blends
  over what is beneath; a real eraser already exists on right-drag.
- Parity is `(x + y) % 2`, anchored to canvas origin, so separate strokes align
  into one continuous checkerboard. It is evaluated per cell, so a brush larger
  than 1px lays a checkerboard inside its own footprint.
- Show a `(dither)` indicator in the corner tool tag while active.
  `updateToolTag` (`main.js:179`) already composes `` `${size}px ${modeLabel}` ``
  at `:203`.
- Undo is unaffected: `diffFromSnapshot` (`canvas-model.js:34`) diffs arrays
  rather than write calls, and the `if (before.length)` guard already skips
  no-op strokes.

## B4 · `feat(canvas): symmetry drawing guide` — `M`

- Toggle cycling off, horizontal, vertical, both, off — modelled on
  `makeBgCycler` (`main.js:532`), which already does this shape for backgrounds.
  Persist it in `uiPrefs` like the grid.
- The axis defaults to canvas centre. The mirror is `x → width - 1 - x`, exact
  for odd and even widths alike. With both axes on, one stroke tick writes four
  cells.
- Applies to paint, erase and fill. Not shapes — a mirrored rectangle drawn
  across the axis is a confusing overlap — and not selection ops.
- Lives inside `paintAt` (B0), so it lands on mouse and keyboard at once.
- Hairline overlay in `renderer.js`, drawn between the pixel blit (`:63`) and
  the grid (`:65`). Follow the house overlay convention used by the grid,
  crosshair, selection ants and brush cursor alike: `ctx.save()`,
  `globalCompositeOperation = 'difference'`, white stroke, `ctx.restore()`, so
  that it inverts whatever is beneath instead of picking a colour that can
  vanish against it. `drawCrosshair` (`renderer.js:432`) is the closest existing
  analogue. Add one field to the options bag at `renderer.js:31`, populated from
  the call site at `main.js:738`.

## B5 · `feat(palette): extract a palette from an image`

- Decode via `createImageBitmap`, then an offscreen canvas, then `getImageData`.
  This is the repo's first image decode path — nothing currently uses
  `new Image`, `createImageBitmap` or `drawImage`. `img-src 'self' data: blob:`
  permits it. Accept whatever the browser decodes (PNG, JPEG, GIF, WebP, AVIF);
  no allowlist, and unsupported files simply fail the decode.
- **Refuse source files over 8MB**, same cap as references.
- **Let the decode do the sampling — do not write a sampler.** A 4000×3000 photo
  is 12M pixels, and a full histogram plus clustering blocks the main thread for
  seconds. `createImageBitmap`'s resize options downscale during decode, off the
  main thread, which is the sampling step done for free.
  - **Under 1M pixels** (1000×1000 and smaller), decode at full size and scan
    every pixel exactly. Pixel-art sources are always small, and this is what
    makes the "32 or fewer distinct colours round-trip verbatim" rule hold.
  - **Above 1M pixels**, decode to a 512px longest edge with
    `resizeQuality: 'pixelated'`. Nearest-neighbour is required here: the
    default smooth downscale averages adjacent pixels and would invent
    intermediate colours that were never in the image.
- Produce a maximum of 32 colors, averaged, even though palettes may now hold
  256. An extracted palette is meant to be workable, not exhaustive. If the
  image has 32 or fewer distinct colors, take them verbatim so that a pixel-art
  PNG round-trips exactly; only cluster and average when it exceeds 32.
- Alpha below 50% becomes transparent.
- The result enters the library (B2a) as a new named palette and is switched to.

## B6 · `feat(file): spritesheet import`

Always creates a new File in the current Collection. It never modifies the open
File — there is no import-into-a-File path anywhere in this design.

- Name it after the source filename via the existing `sanitizeName`
  (`export.js:133`) and the standard collision rule. With no focused Collection,
  it lands at the Project root, same as `+` does today.
- The grid is given as cell width × height, plus margin and spacing. Auto-detect
  margin and spacing by scanning for fully-transparent rows and columns; if
  detection fails, ask, via the Slide-Out Context Bar carrying the numeric
  fields.
- Cells become either Frames or Layers, mirroring `export-panel.js:6`'s existing
  `FILE_MODES = ['Canvas', 'Layers', 'Frames']`.
- Pixels snap to the existing Project palette by nearest RGB. Extraction is a
  separate, explicit act (B5), so importing a sheet must not silently repaint
  the Project's other Files.
- Create the File via `createSpriteFile`; add frames via `addFrame`
  (`sprite-file.js:205`) and layers via `addLayer` (`:144`). Both need the
  mandatory `bindActiveFile(); draw(); autosave();` triad afterwards.

## B7 · `feat(layers): reference image layer`

The biggest of the seven. Build it last.

A reference is a special kind of layer that can be moved off-canvas — it is not
clipped to the canvas bounds the way pixel layers are.

**Placement**: a lazily-created Group named `Reference`, holding up to three
reference layers per File. A fourth drop is refused with the reason shown,
matching the house pattern for invalid mutations (`project.js:119`,
`sprite-file.js:153`). Groups are already mandatory (`sprite-file.js:20` —
"Every Layer must belong to a Group — there's no 'ungrouped' state"), already
gate visibility in the composite loop (`sprite-file.js:71`), and already handle
ordering via `ordering.js`. Create the group on first reference import and
remove it when its last member is deleted.

Vocabulary note: this is a Group, not a Collection. `CONTEXT.md` reserves
"Collection" for the Projects panel.

**Storage: the image is never stored in the `.sprite` at all — it is a link.**
The layer holds a `FileSystemFileHandle` pointing at the user's own file on
disk. Handles are structured-cloneable and live in IndexedDB, which is exactly
how `storage.js:119` `resumeFolder()` already rehydrates the directory grant —
reuse that mechanism.

Do **not** inline the image as a data URL or store a copy as a blob. Either
would be rewritten on every autosave and `structuredClone`d on every structural
layer edit, for an asset that is not part of the document.

**Browser split, per `docs/adr/0001-hybrid-web-storage.md`'s graceful
degradation stance:**

- **Chromium** — a drop yields a handle via `DataTransferItem.getAsFileSystemHandle()`,
  so the link persists across sessions behind a permission re-grant on reopen.
- **Firefox and Safari** — no handle exists. References are **session-only**
  there: held in memory, gone on reload. Feature-detect and degrade silently,
  the same way the storage backend already does.
- A moved, renamed or deleted source file breaks the link. Show the reference
  layer as unresolved rather than failing the File load.

**Import budget.** File size alone bounds nothing — a 2MB JPEG decodes to 48MB
of RGBA, since decoded cost is `width * height * 4` regardless of compression.
So:

- Refuse source files over **8MB**, with the reason shown.
- Decode with `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality })`
  to a **2048px longest edge**. This downscales during decode, off the main
  thread, so the full-size bitmap is never held. Each reference is bounded at
  roughly 16MB decoded no matter what was dropped; three come to about 50MB,
  comfortable on a 4GB Chromebook.

The image cannot live in `layerPixels`, because those are capped at canvas
resolution.

**Not paintable, by being unselectable.** Do not add a paint gate. `input.js`
holds only a `model` reference and has no concept of layers; the one existing
gate, `getReadOnly` (`input.js:56`), is global-per-view, and the keyboard paint
path does not consult it at all. Instead make a reference layer refuse to become
the active layer: guard `onSelect` (`main.js:1209`) and skip it in keyboard
layer navigation (`main.js:2070`). Then no paint path anywhere needs to know it
exists.

**Rendering**: its own draw step in `renderer.js`, after the canvas backdrop and
before the pixel blit. Two modes — fit-to-canvas, which is the default, and
full-size positioned off-canvas to the right. Both scale with viewport zoom and
pan via the existing `computeViewport` transform (`viewport.js:39`).

**Toggling between the two modes**, two ways, both required:

- `:` when a reference layer is selected and either the Canvas or the Layers
  panel is focused.
- A `.btn--reveal` hover-revealed glyph button on the reference layer's own row
  in the Layers panel, matching the delete `✕` at `layers-panel.js:110`.

**A reference is a drawing aid, never part of the document.** It leaves the app
through no path whatsoever, including the `.sprite` archive, and the eyedropper
does not sample it (`main.js:2468`).

Every export path that must exclude it:

| # | Location | What it iterates |
|---|---|---|
| 1 | `export.js:207-210` | all frames via `compositeFrameAt` (GIF) |
| 2 | `export.js:238` | `compositeFrame` (PNG/SVG canvas mode) |
| 3 | `export.js:244-252` | `file.layers` directly, via `compositeLayerAt` |
| 4 | `export.js:247` | all frames via `compositeFrameAt` (frames mode) |
| 5 | `export.js:249` | `file.layers[i].name` as an output filename |
| 6 | `main.js:749-761` `groupArtboards` | `compositeFrame` per File; feeds all three collection paths |
| 7 | `export.js:300`, `:331`, `:348` | those artboard pixel buffers |
| 8 | `export.js:384-387` | raw `{...file}` JSON — layers and layerPixels, unfiltered |

The cheapest correct fix is to exclude reference layers inside
`compositeFrameAt` and `compositeLayerAt` (`sprite-file.js:64`, `:96`), which
covers 1 through 4, 6, 7 and the on-canvas render at once. Then handle 5
separately, and for 8 strip the file handle and the Reference group from the
exported `.sprite`, the same way `redoStack` is already stripped at
`export.js:385`.

Other walkers to check: `timeline-panel.js:44`, `layers-panel.js:41`, and
`main.js:~644` (onion ghosts).

## B8 · `feat(ui): panel import buttons and file drag-and-drop`

An import button on all four panels, each meaning what its panel is about:

| Panel | Its import button |
|---|---|
| Colors | load a palette file |
| Layers | add a reference image |
| Timeline | spritesheet to a new File, Frames mode pre-selected |
| Projects | spritesheet to a new File, or a `.sprite` project |

The Timeline button still creates a new File; it only pre-selects Frames, since
that is the Timeline's concern. Nothing imports into the open File.

**Drop targets.** The `drop` event fires on the element under the pointer, so
each panel is an unambiguous target with no dialog:

| Drop on | `.gpl` / `.hex` / `.pal` | image | `.sprite` |
|---|---|---|---|
| Colors panel | load palette | extract palette | — |
| Layers panel | — | reference layer | — |
| Canvas | — | reference layer | import project |
| Projects panel | — | spritesheet to a new File | import project |

The Timeline is not a drop target — it has a button instead. Canvas and Layers
both already mean "reference", and Projects is where new Files belong.

- Panels auto-reveal on `dragover` via the existing `panel-reveal.js`, using the
  established red hairline focus treatment (`CONTEXT.md:36`). No new visual
  language.
- **Watch out**: `ui.js:255-284` `attachNativeDragReorder` already binds
  `dragover` and `drop` on list items for reordering, and `ui.js:284` calls
  `e.preventDefault()` on drop. File drops must not be swallowed by it — check
  `e.dataTransfer.files`.
- Reuse the established file-read idiom from `importProject`
  (`main.js:1134-1173`): `await file.arrayBuffer()`, and `TextDecoder` for text.
  There is no `FileReader` anywhere in this repo; do not introduce one. Errors
  go to `console.error` and are swallowed — match that.

---

## Commit sequence

```
A0   docs(adr): record the canvas size range reversal
A1   refactor(canvas)!: typed-array color-table pixel buffers
A1   feat(persistence)!: .sprite format v2 with v1 auto-migration
A2   refactor(undo): delta-based layer commands
A3   perf(renderer): cache composited frames
A3   perf(renderer): dirty-rect re-composite
A4   feat(canvas): expanded size presets and custom sizing
A4   feat(canvas): swap palette when a console size preset is chosen
A4   perf(persistence): scale autosave debounce by canvas area
A4b  perf(persistence): write only Files that changed
A4c  feat(project): project capacity meter
A4c  feat(project): split a project by collection
A5   docs(spec): record the canvas, palette and keybind reversals
B0   refactor(canvas): unify mouse and keyboard paint dispatch
B1   feat(viewport): fit to selection, falling back to canvas
B2a  feat(palette): named global palette library
B2a  feat(palette): raise the chip cap to 256 with a scrolling bar
B2b  feat(palette): import .gpl, .hex and JASC .pal
B2b  fix(palette): enforce the chip cap on every load path
B3   feat(canvas): dither mode for paint and fill
B4   feat(canvas): symmetry drawing guide
B5   feat(palette): extract a palette from an image
B6   feat(file): spritesheet import
B7   feat(layers): reference image layer
B8   feat(ui): panel import buttons and file drag-and-drop
```

One responsibility per commit; never a feature and a fix together. Commits
carrying `!` are MINOR bumps in 0.x. Every keybind change updates both
`keybind-help.js`'s `GROUPS` and `CONTROLS.md` — they are hand-synced.

## Verification

No test framework exists and none should be added, since the project has no
build step. For pure-logic modules, leave one assert-based check each as
`test/*.mjs`, run by bare `node`. The `.mjs` extension avoids needing a
`package.json`.

- `test/palette-parse.mjs` — one fixture per format, plus an over-cap file
  asserting truncation.
- `test/quantize.mjs` — an image with 32 or fewer colors round-trips verbatim;
  one with more reduces to exactly 32.
- `test/sprite-format.mjs` — a v1 File migrates to v2 with identical pixels, and
  buffers survive encode then decode.

Trivial one-liners need no test.

Manual verification in the browser (`mise.toml`, or any static server):

1. **A1** — open the existing project and confirm every File's art survives
   migration. Confirm `Alt`-paint still antialiases; off-palette blending is the
   color table's entire reason for existing.
2. **A2** — add, delete and reorder layers on a multi-frame File. Confirm undo
   restores correctly and that memory stays flat across 50 operations.
3. **A3** — confirm that panning and zooming a large File no longer
   re-composites, while art still updates immediately on every edit.
4. **A4** — create a 512×512 File and a non-square custom File; confirm the
   Timeline works at every size. Choose the Pico-8 size preset and confirm the
   palette swaps with it. Export SVG at 512² and confirm it completes.
5. **A4b** — open a project with several Files, draw one pixel in one of them,
   and confirm via the backend that **only that File was written**. This is the
   single most important performance check in Plan A.
6. **A4c** — add Files until the capacity bar fills; confirm it never blocks an
   action, that the split offer appears at 100%, and that accepting it promotes
   each Collection to its own Project with root Files left in place.
7. **B0** — draw with the mouse and with `Space` plus arrows. Both must behave
   exactly as they did before the refactor.
8. **B1** — press `=` with no selection and confirm the whole canvas fits with
   nothing cropped; press it with a selection and confirm the selection fills
   the viewport.
9. **B2a and B2b** — import a Lospec `.hex` and confirm it appears named after
   the file. Load a palette with more than 32 chips and confirm the bar scrolls
   16 at a time and the digit keys hit the first ten visible. Edit a palette,
   switch away, and confirm it saves as `<project-name>`; switch away from an
   untouched preset and confirm nothing is saved. Rename with `Shift+Enter`.
   Attempt a 31st palette and confirm the warning.
10. **B3 and B4** — toggle `D` and `M`. Confirm the `(dither)` tag appears, that
   dither affects `Alt`-paint and fill but not left-click Place, that the
   checkerboard aligns across separate strokes, and that the mirror axis holds
   on an odd-width canvas. Confirm both survive a reload, and that a single
   `Ctrl+Z` undoes a whole mirrored stroke.
11. **B6** — import a sheet with a 1px margin and 1px gutters; confirm detection
   finds them, that cells land aligned, and that a new File appears named after
   the source. Then import one that detection cannot parse and confirm it asks.
12. **B7** — drop three images on the Layers panel. Confirm the Reference group
    appears, that a fourth is refused with a reason, that the layers cannot be
    selected or painted, that `:` and the row button both toggle full-size
    off-canvas placement, and that references appear in none of PNG, GIF, SVG,
    Canvas, Layers, Frames, collection sheet, or the `.sprite` archive — and
    that the eyedropper refuses to sample them.
13. **B8** — exercise all four import buttons and every drop-target combination,
    including dropping onto a hidden panel's edge. Confirm that list reordering
    still works and has not swallowed the drop.
