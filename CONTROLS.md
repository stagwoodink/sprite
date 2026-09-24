# Control Scheme

Keyboard-first, usable on 60% keyboard, focus-based rather than hold-to-reveal (see `todo/control.md`). `Ctrl`(left)+Arrow focuses a panel: Timeline/Layers/Colors/Projects for Up/Right/Down/Left: pulling it out with a red hairline; it stays focused after keyup and owns the whole keyboard until `Tab` cycles to another panel or `Ctrl`(left) alone (tap) returns focus to Canvas, the default. Mouse works alongside this: left places (Alt: paints), right erases, scroll zooms.

## Global

| Input | Action |
|---|---|
| `?` | Toggle controls help modal |
| `Tab` | Cycle focus: Timeline → Layers → Colors → Projects (from Canvas, starts at Timeline) |
| `Shift+Tab` | Pin/unpin every panel at once |
| `~` | Pin/unpin the corner tags |
| `` ` `` (hold) + Left/Right | Select a version-tab button; `Enter` launches it |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+A` | Select all |
| `Ctrl+Space` (tap) | Play/pause timeline |
| `Ctrl`(left)+Up/Right/Down/Left | Focus Timeline / Layers / Colors / Projects |
| `Ctrl`(left) (tap alone) | Return focus to canvas |
| `Escape` | Clear selection |

## Canvas

| Input | Action |
|---|---|
| Arrows | Move cursor, stepped by brush size |
| `Ctrl+Space` + arrows | Pan viewport |
| `Shift` + arrows | Rectangle-select, commits on release |
| `Shift+Alt` + arrows | Move the selection boundary |
| `Shift+Ctrl` + arrows | Move the selected content |
| `Shift+Space` | Magic wand at cursor |
| `Shift+C` | Select every pixel of the color under the cursor |
| `1`-`9`, `0` | Set prime color to palette chip 1-10 |
| `Space` | Place at cursor (hold for repeated stamps); hold `Alt` too for Paint (antialiased) |
| `Backspace`/`Delete` | Erase under cursor, or clear the selection |
| `Z` + arrows (hold) | Erase while moving |
| `Alt` + arrows (hold) | Paint while moving (antialiased) |
| `Ctrl+Enter` | Flood fill at cursor, or fill the whole selection |
| Left click/drag | Place (hard-edged square stamp) |
| `Alt` + left click/drag | Paint (antialiased) |
| Right click/drag | Erase |
| Scroll wheel | Zoom (inertial) |
| `Q`/`W`/`A`/`S` (hold) | Rectangle / triangle / circle / line shape (`Shift` constrains) |
| `[` / `]` | Brush size -1 / +1 |
| `{` / `}` | Brush size ÷2 / ×2 |
| `I` (tap) | Dropper: sample color under cursor |
| `I` (hold) + click | Sample color from anywhere in the viewport |
| `F` / `Shift+F` | Flip horizontal / vertical |
| `R` / `Shift+R` (hold) + Left/Right | Rotate 1°/15° per step (accelerating hold) |
| `+` | Zoom in |
| `-` | Zoom to 100% |
| `=` | Zoom to fit (selection if any) |
| `_` | Zoom out |
| `G` / `Shift+G` | Toggle grid / ruler |
| `D` | Toggle dither for Paint and fill (checkerboard, not Place) |
| `:` | Reference image: fit to canvas / full size (also from the Layers panel) |
| `M` | Cycle mirror drawing guide: off, horizontal, vertical, both |
| `u` | Cycle canvas background |
| `Shift+U` | Cycle app background (dark/mid/light, bounces off mid) |

## Panels

### Timeline (`Ctrl+Up` to focus)
| Input | Action |
|---|---|
| Left/Right | Navigate frames |
| Up/Down | Adjust framerate (accelerating hold) |
| `Shift+`Left/Right | Select multiple frames |
| `Alt+`Left/Right | Move the selected frame(s) |
| `+` | New frame |
| `=` | Duplicate frame |
| `Backspace`/`Delete` | Remove frame(s) |
| `\` | Toggle onion skin |
| `Space` | Play/pause |

### Layers (`Ctrl+Right` to focus)
| Input | Action |
|---|---|
| Up/Down | Navigate layers/groups |
| Right-Shift+Up/Down | Navigate groups only |
| `Shift+`Up/Down | Select multiple layers/groups |
| `Alt+`Up/Down | Move the selected layer(s)/group(s) |
| Left/Right | Adjust layer/group opacity |
| `Shift+`Left/Right | Adjust opacity by 10 |
| `Backspace`/`Delete` | Remove selected layer(s)/group(s) |
| `+` | New layer |
| `=` | New group |
| `Space` | Expand/collapse focused group |
| `Enter` | Rename focused layer/group |
| `\` | Toggle layer visibility |

### Colors (`Ctrl+Down` to focus)
| Input | Action |
|---|---|
| Left/Right | Cycle prime color |
| `+` | Add chip |
| `-` | Remove current chip |
| `\` | Open palette preset menu (Up/Down navigate, `Enter` commits) |
| `Enter` | Edit the primary chip's color (arrows move on the color square, `Alt+`Left/Right adjust hue, `Enter`/`Escape` close) |
| `Shift+Enter` | Rename (and save) the palette |

### Projects (`Ctrl+Left` to focus)
| Input | Action |
|---|---|
| Up/Down | Navigate canvases and collections |
| `Space` | Fold/unfold the focused collection |
| `+` | New canvas (opens size picker; Left/Right adjusts size, `Enter` commits, `Escape` cancels) |
| `Alt++` | New project |
| `_` | Remove selected canvas or collection |
| `=` | New collection |
| `Enter` | Rename focused canvas/collection |
| `Shift+Enter` | Rename project |
| `e` / `E` | Export canvas / project |
| `\` | Open project picker |

## Known gaps
- Multi-project open/new and focused-category/group navigation not built (panel nav acts on the current canvas/layer's own category/group).
