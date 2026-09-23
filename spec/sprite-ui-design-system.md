# Sprite — UI Design System & Web Storage Architecture

**Status:** Supporting detail document — the authoritative source for visual/styling specifics (color tokens, typography, button/chip/panel anatomy) that `sprite-design-doc.md` references but doesn't duplicate in full. For anything *behavioral* (not visual), `sprite-design-doc.md` is canonical; where the two genuinely conflict on behavior, `sprite-design-doc.md` wins. See `INDEX.md` for the complete file relationship. Supersedes the two-font (chunky header + lighter body) pairing floated earlier in design discussion; that idea is dead, replaced by the single-font system in §2 below.

**Audience:** Claude Code (autonomous build agent)

---

## 1. Color Tokens

Dark theme, layered the way Discord/Claude-style dark UIs are layered — neutral dark grays for structure, with the Stagwood brand red reserved for meaning (never used as a large surface fill).

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#121214` | App background, canvas surround |
| `bg-elevated` | `#1A1A1D` | Panels — layers, timeline, project, palette bar |
| `bg-hover` | `#232326` | Chip hover, row hover, selected row background |
| `border` | `#2C2C2A` | Chunky button/panel outlines — always 2px, never soft/blurred |
| `border-strong` | `#444441` | Button/chip 2px borders at rest |
| `hairline` | A barely-perceptible tonal shift from the adjacent surface — approximate placeholder, needs a real value picked once mocked up in-context | Dividers between chips and between layer/frame rows. Deliberately much lower-contrast than `border` — never dark/black, never the same weight as a chunky button outline |
| `accent` | **Needs exact sampling from the Stagwood logo asset** — approximated at `#C4202E` in mockups so far, but pull the precise pixel value from the source file rather than treating this as final | Primary buttons, active/pinned panel indicators, selection marquee, playhead, focus states, the active layer row's full background fill |
| `text-primary` | `#F2F2F0` (off-white, matching the logo mark) | Primary text |
| `text-secondary` | `#B4B2A9` | Supporting labels |
| `text-muted` | `#9A9A96` | Status bar, hints, disabled |

Corner radius: **0px everywhere, no exceptions.** Every panel, button, chip, tile, and popup is perfectly square — this is a hard rule, not a range, superseding the earlier 0–2px allowance. Nothing in this UI has a rounded corner.

No gradients. No drop shadows, blur, or glow — the only depth cue anywhere in the app is the hard-edged offset shadow described in §1.2 below. Everything else is flat.

**Tile-fit discipline:** elements that sit adjacent to one another (palette chips, layer rows, toolbar segments) should interlock edge-to-edge with no stray gaps — separation between them comes from a 1px hairline border, not from margin/spacing. All sizing (padding, row heights, chip widths, icon sizes) should snap to a single shared unit grid (e.g. multiples of 4px) so the whole interface reads as fitted, uniform tiles rather than arbitrarily-sized floating elements — an extension of the same pixel-grid discipline already governing the canvas itself and the font's integer-scale rule.

Iconography should draw on the Stagwood mark's own geometry where it makes sense — the rotated-square/diamond shape is already established as the brand's visual signature (see the small trailing-diamond motif on the logo), so small status indicators, loading states, and selection markers can reuse that diamond shape rather than inventing an unrelated icon language.

### 1.2 Button depth (chunky/pressable elements)

Applies to anything tappable that isn't a chip or a tile (export format buttons, scale multiplier buttons, toolbar action buttons). Structure, top to bottom: a 2px lighter-shade highlight line, the button face, then a hard-edged offset shadow beneath (a darker shade of the button's own fill — clamped to stay visibly distinct from the panel background, never literally black, since a naive "darker shade" of an already-dark neutral button can otherwise blend into the background entirely). Buttons in the same logical group sit flush edge-to-edge with a 1px hairline between them (no gaps) rather than being spaced apart individually.

Four confirmed states, all bottom-anchored (so shorter states appear to sink rather than float):

| State | Top highlight | Face height | Shadow height | Notes |
|---|---|---|---|---|
| Unfocused (resting) | 2px, a **very subtle** tint of the fill — barely lighter than the face itself, not a strong `border-strong`-level lift | 28px | 4px | Neutral gray fill (`#2C2C2A`) unless otherwise colored |
| Hovered | 2px, brighter tint | 28px | 4px | Same footprint as unfocused — hover is conveyed by brightening the whole fill, top line, and shadow, not by moving anything |
| Selected (persistent "this is the current choice" state, e.g. active export format) | 2px | 29px | 3px | Same total footprint as unfocused (34px) — conveyed mainly through the accent-red fill plus a slightly reduced shadow, not a vertical shift |
| Pressed (actively being clicked, mouse-down) | 2px | 27px | 1px | Sinks 4px below the resting baseline — the strongest, most literal "being pushed in" feedback, reserved for the momentary active-click state rather than a persistent selection |

### 1.3 Chips and tiles

Applies to palette chips and layer/frame rows. See `sprite-ui-reference.svg` (shipped alongside this doc) for the literal visual reference this section describes.

- **Palette chips — structure:** no outer panel/container — chips sit directly on the app background, edge-to-edge with no gaps. Each chip has its own offset shadow ledge beneath it, filled with a **darker shade of that chip's own color** — never a generic dark or black shadow, the same rule §1.2 uses for buttons, and with the same background-clamping caveat for very dark chips. Adjacent chips are separated by a hairline that is **barely perceptible** — a very low-contrast, same-family tonal shift, not a dark or black line.
- **Chip states (confirmed):**

| State | Fill | Position | Shadow height | Notes |
|---|---|---|---|---|
| Unfocused | base color | resting | 5px | Baseline chunk depth for chips |
| Hovered | lightened tint of the base color | resting, no movement | 5px | Hover is brightness-only — no lift, no shadow change |
| Pressed | lightened tint (same as hover) | lifts up 3px | 7px | Reuses the hover fill but adds the lift and grown shadow — this is the click/active-drag feedback, not hover |

- **No primary/secondary "in use" indicator for now.** Several approaches were tried (extending the chip down, a corner/centered pip, a top-edge line, depressing, lifting) and none felt right — this is explicitly deferred, not decided. Do not implement any of the discarded approaches; leave chips visually identical regardless of primary/secondary status until this is revisited.
- Chips fill the available width; with N chips, each takes `100% / N` width down to a minimum clickable width (needs a concrete px value — propose 32px as a starting point, matching the tile-grid unit), below which the row becomes horizontally scrollable instead of shrinking further.
- **Layer/frame rows (confirmed):** flat, hairline-divided tiles — same subtle, low-contrast hairline rule as chips, not the stronger `border` token used for chunky button outlines. A stacked list of edge-to-edge tiles, not individual bordered/padded cards.
  - Resting: `bg-elevated` (`#1A1A1D`).
  - Hover: a visibly brighter `#2A2A2E` — noticeably lighter than resting, not a subtle nudge.
  - Active (the layer currently selected for drawing): the **entire row** fills with the accent red (`#C4202E`), not just an edge accent — full-color fill, text and thumbnail border adjusted for contrast against it.

---

## 2. Typography

**Single font, entire UI: m3x6** (Daniel Linssen, CC0), confirmed against the actual uploaded font file and approved for the whole interface, not just incidental numbers. This replaces the earlier two-font (chunky-display + lighter-body) proposal entirely — there is exactly one typeface in this app now.

### 2.1 Hierarchy rule

Since m3x6 has no bold or alternate weight, visual hierarchy is built from **case and size only**, not weight:

| Role | Case | Size |
|---|---|---|
| Headers / panel titles (e.g. "LAYERS", "SPRITE") | ALL CAPS | Larger — proposed default **32px** |
| Everything else (labels, file/layer names, status bar, coordinates, buttons, fields) | Normal case | Smaller — proposed default **16px** |

These two sizes (32px, 16px) follow the "use multiples of 16" convention documented for this font family (confirmed for m5x7/m6x11 on their itch.io pages) as a reasonable default, but **this hasn't been independently confirmed for m3x6's own native grid** — verify against the actual font before locking it in, since the wrong multiple will blur the pixel edges exactly the way non-integer canvas zoom would.

### 2.2 Rendering rule

Carried over from earlier and now more important with only one font in play: **pixel-style fonts must only render at integer multiples of their native grid size.** Any UI layout that would force m3x6 to render at a non-multiple size (responsive scaling, unusual DPI, a panel width that doesn't divide cleanly) needs to snap to the nearest valid multiple rather than letting the renderer interpolate/anti-alias between grid positions.

### 2.3 Open item

Longer strings (a full project name, a long layer name) haven't been tested yet — the only rendering confirmed so far was a short specimen string (`ABCDEFGHIJ 0123456789`) at 48/32/16px. Worth checking that this font holds up for realistic-length UI text before finalizing 16px as the standard body size — if long names become hard to scan at that size, the two size tiers may need a third intermediate step, or file/layer names specifically may need to render larger than other body text.

---

## 3. Web Storage Architecture (finalized)

Reconciling the discussion from earlier into a concrete spec, replacing the "IndexedDB only" default originally proposed in the architecture doc.

### 3.1 Hybrid model

- **Feature-detect `window.showDirectoryPicker`** (the File System Access API) on load.
- **If supported:** offer an optional, non-forced "Connect a folder" action. Granting it gives the app one root directory to manage — all projects and files map into real subdirectories under that root, mirroring the native desktop folder structure exactly. This is a single one-time permission grant, not a per-project or per-file prompt.
- **If unsupported, or the user declines:** fall back silently to an IndexedDB-backed virtual filesystem that mirrors the same project/file/undo-history data model. The Project panel, autosave, and undo persistence behave identically either way — the backend swap is invisible to the user.
- Implementation-wise, this is a third backend (`io/web_fsa.rs`) added alongside the previously-planned IndexedDB web backend, sitting behind the same storage abstraction trait that already separates native from web. Native desktop code is untouched by any of this.

### 3.2 Known limitations to flag, not silently absorb

- **IndexedDB path only:** storage is origin-scoped and single-device/single-browser. No sync between browsers or machines. This is why Export-to-`.sprite` (already specced) matters more on this path than it does on native or on the File System Access path.
- **Itch.io serves games inside an iframe.** Some browsers (Safari's ITP, Chrome's storage partitioning) restrict or evict iframed-context storage more aggressively than a top-level site would get. This needs an early verification spike — confirm IndexedDB (and, separately, whether `showDirectoryPicker` even works inside an itch.io iframe at all, since permission-prompting APIs are sometimes blocked in embedded contexts) actually behaves as expected in a real itch.io-hosted build — before either storage path is built out fully on the assumption that it will.
- **Open UX question, not yet decided:** should the web build (on the IndexedDB path specifically) show a periodic gentle prompt nudging the user to export a `.sprite` backup, given how much easier it is to lose that data than on desktop or the File System Access path? Desktop and the File System Access path don't need this since they're writing to real, user-owned storage already.

---

## 4. Layers Panel (confirmed)

Structure, top to bottom: a full-width chunky add-layer button, flush against the tile list below it (no gap, its shadow sits directly against the first tile), then the stacked layer tiles.

### 4.1 Add-layer button

Uses the standard unfocused button treatment from §1.2 (2px subtle top highlight, flat face, offset shadow), spanning the full panel width, centered `+` glyph. Flush against the first layer tile — no margin between the button's shadow and the tile list.

### 4.2 Layer tile anatomy

Each tile is a horizontal row: a thumbnail on the left, the layer name label, and (on hover only) a delete control on the right.

- **Thumbnail:** spans the **full height** of the row, flush against the tile's **left edge** (no padding/gap). Width is derived from the row height times the document's aspect ratio (`rowHeight × docWidth / docHeight`) — never forced square. Shows a checkerboard transparency backdrop with the layer's actual pixel content composited on top.
  - Checkerboard: a single 2×2 pattern filling the thumbnail (not a small repeating tile), neutral gray, lighter side `#DEDEDE`, darker side `#CFCFCF` — both pure neutral (no color tint), lighter than a typical Lospec-style reference.
  - Hidden layer state: a `rgba(0,0,0,0.55)` overlay darkens the entire thumbnail.
- **Label:** the layer name, positioned after the thumbnail with standard padding.
- **Delete control (hover-revealed):** a full-row-height **square** tile flush against the row's **right edge**, separated from the label by a 1px hairline (not its own bottom shadow — it's a flat tile, not a chunky button, matching §1.3's tile language). Fill is a neutral tile color (not white, not full accent-red) with a small centered red pip as the delete indicator — deliberately minimal; a literal trash/X icon can replace the pip later without changing the tile treatment itself.
- **Eye icon placeholder (visibility toggle):** a small centered pip on the thumbnail itself.
  - Hidden by default on a visible, unhovered layer.
  - Appears on hover.
  - Clicking it toggles the layer's visibility: activates the dark overlay and the pip **stays visible** afterward (not hover-only) as a persistent indicator that the layer is hidden — this is the actual eye icon's job once designed; the current pip is a functional placeholder holding the interaction and position, not final art.

### 4.3 Hairlines (two distinct weights)

The thumbnail column and the label column use **different** hairline strengths between rows, not one shared value:

- **Between thumbnails:** `rgba(0,0,0,0.3)` (30% black) — a full-width-of-thumbnail top border on each thumbnail.
- **Between tile labels:** `rgba(0,0,0,0.1)` (10% black) — much subtler, on the label span specifically, not the full row.
- Neither hairline spans the full row width as a single continuous line — they're scoped separately to the thumbnail and label regions. This avoids the failure mode discovered while designing this: a single hairline color that works against the dark label background reads as a harsh black seam when it crosses the light checkerboard thumbnail, no matter how low-contrast that color is against the dark side alone — the light-to-dark transition itself creates the harsh read, not the color choice. Splitting the hairline by region (and giving the thumbnail region its own stronger, intentional divider rather than trying to hide the seam) resolved this.

### 4.4 Row background states (from §1.3, restated here for completeness)

Resting `bg-elevated`, hover a visibly brighter `#2A2A2E`, active (the layer currently selected for drawing) a full accent-red row fill — see §1.3 for the general rule.

## 5. Panel Layout (confirmed — revised)

**This supersedes an earlier version of this rule stated in this same document.** The relationship was reversed partway through design: the timeline panel now takes layout priority, not the side panels.

The timeline bar (bottom) always spans the **full window width** and never shrinks to accommodate the project or layers panels. The project panel (left) and layers panel (right), when active, span from the top of the canvas area down to the **top edge of the timeline panel** — flush against it, not extending past it to the absolute bottom of the window.

The palette bar (top) still **shrinks horizontally** to fill only the space remaining between whichever side panels are currently active — this part is unchanged from the original rule. If only the layers panel is open, the palette spans from the left edge to the layers panel's left edge. If both project and layers are open, the palette spans the narrower gap between them. If neither is open, the palette spans the full window width.

## 6. Timeline Panel (confirmed)

One continuous flush strip, full height throughout (matching whatever height the timeline bar is), hairline dividers between segments instead of gaps — no element floats separately with margin around it.

Left to right: a single FPS field (drag left/right to change the value, or click to type directly — not separate increment buttons), the onion-skin toggle (icon-only, no text label, fills red when active), then the frame strip, then the add-frame button at the **right** end (not the left). No dedicated play/pause button — playback is keyboard-only (`Ctrl+Space`, per the features doc), so the strip doesn't need to spend space on a control that duplicates a keybind.

- **Frame tiles:** checkerboard thumbnail content, same neutral checkerboard as layer thumbnails, separated by the same 30% black hairline used between layer thumbnails (§4.3) — frames and layer thumbnails share this treatment since they're visually the same kind of object.
- **Active frame indicator:** a thin bar (~5px) runs beneath the entire frame strip, neutral gray by default, with the segment directly under the currently active frame turning full accent-red. This replaced an earlier full-red-fill-on-the-tile approach — filling the whole tile red would obscure the frame's own thumbnail content the same way it doesn't for layer rows (which don't show a thumbnail preview at that scale in the same way); the indicator bar avoids that problem while still giving a clear, glanceable "this one's active" signal.
- **Deleting a frame:** the hover-revealed delete pip, same minimal treatment as the layers panel's delete tile (§4.2) — a neutral tile with a small centered red pip, not a literal icon yet.
- **Inserting a frame at a specific position:** hovering the gap between two adjacent frames separates them slightly and reveals an insert-here `+` — the same interaction as Canva's between-element insert. This is in addition to the add-frame button at the strip's end, which always appends.
- **Onion skin range is fixed at 2, not user-adjustable** — no range control exists in the UI at all. See the design principle stated at the top of the features doc: Sprite is opinionated, not customizable, and this is the reference example for that principle.

## 7. Project Panel (confirmed)

- **Header row:** project name (editable inline on click), followed by two full-height buttons flush against each other and against the panel's right edge: `+` (new project) and a hollow-square icon button (open project — opens an existing project rather than creating one). Both buttons fill the full height of the header row, not nested smaller squares with padding around them.
- **File list:** a full-width chunky add-file button (matching the layers panel's add-layer button exactly) flush against the list below it. File rows show **name only — no thumbnail**, deliberately different from layer rows so the two don't visually blur into looking like the same kind of list. Rows use the single 10% black hairline (the layers panel's label-hairline weight, §4.3) since there's no thumbnail column to need the stronger 30% weight.
- **Active file:** full accent-red row fill, same convention as the active layer row.
- **Footer:** Import (left) and Export (right) as a flush two-button group, full height, anchored to the bottom of the panel — same flush-button-group language as the export format buttons from §1.2's examples.

## 8. Open Items Carried From Earlier (still unresolved)

Restating from `sprite-features-doc.md` §12 plus new ones from this document, so nothing gets lost:

1. **Resolved, flagging for awareness:** third built-in palette — see the concrete 16-color list in `sprite-design-doc.md` §7.1 or `sprite-features-doc.md` §2.1. This was a default pick made without an explicit follow-up confirmation; revisit if a different palette is wanted.
2. Click-away-from-color-picker = eyedropper (stated as an assumption).
3. Add-chip button glyph (assumed `[+]`).
4. App launch/first-run behavior — what opens by default given autosave means there's always a "last state."
5. Cursor iconography per modifier mode, plus the several placeholder icons now in play that need real art: the eye-icon visibility toggle, the delete pip, the onion-skin toggle icon, and the open-project icon (currently a plain hollow square).
6. ~~Onion-skin on/off and range control surface.~~ Resolved — see §6 above.
7. SVG and JSON export schemas.
8. `Ctrl+Space` platform conflict fallback.
9. **New:** exact accent red hex, sampled precisely from the Stagwood logo asset rather than the approximated `#C4202E` used in mockups.
10. **New:** m3x6's actual native-grid size multiples (32px/16px are a convention-based guess, not confirmed for this specific font).
11. **New:** whether long UI strings remain legible at the proposed 16px body size.
12. **New:** whether an itch.io-embedded build reliably supports IndexedDB persistence and/or the File System Access API — needs a verification spike before either web storage path is built out in full.
