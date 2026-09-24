# Sprite

Sprite is a minimalist pixel-art editor: one modifier-driven tool, projects of collections of multi-frame/multi-layer canvases, autosave, no manual save.

## Language

**Project**:
A directory containing one or more Collections and one shared Palette. Native: a real folder. Web: a virtual folder (IndexedDB) or a real folder via the File System Access API, depending on what the browser grants.
_Avoid_: Workspace, folder (as a domain term: "folder" is fine as the storage detail, not the concept name)

**Collection**:
A named, foldable group of Canvases within a Project. Owns the grid layout (columns) its Canvases are arranged in.

**Canvas**:
A single drawing document within a Collection, with its own Layers, Frames, and undo history. Persisted as `.sprite`. The code still calls it a `file` (`project.files`, `file-row`, `createSpriteFile`): renaming those would break saved projects, so only user-facing text uses "canvas".
_Avoid_: File, document, sprite

**Layer**:
A stack element within a Canvas. All Frames of a Canvas share the same Layer stack.

**Frame**:
A single point in time within a Canvas's animation. A Canvas with exactly one Frame is a static image.

**Palette**:
Up to 256 color chips, belonging to a Project (not a Canvas): switching Canvases keeps it, switching Projects swaps it.

**Palette Preset**:
One of the built-in, non-editable starting Palettes a new Project can load: Pico-8 (16 colors, default), Game Boy DMG (4 colors), or Stagwood Brand (4 colors: dark red, red `#BE1425`, almost-white, almost-black). Distinct from a Project's own Palette, which is user-editable after loading a preset into it.
_Avoid_: Theme, swatch set

**Eyedropper**:
Sampling a color into the palette (and primary), on `I`. (`D` is the dither toggle, not the eyedropper.)
_Avoid_: Color picker (that term is reserved for the HSL+hex popup itself, not the sampling action)

**Prime color / Erase**:
Sprite has one active drawing color ("prime"), not a primary/secondary pair. Left click/drag (or `Space`/hold-`Space`+arrows) paints with it; right click/drag (or hold-`Alt`) erases (sets pixels transparent) at the same brush size: the erase tool, not a secondary color.

**Control scheme (focus-based)**:
Sprite's control scheme is keyboard-first, usable entirely on a 60% keyboard, and focus-based rather than hold-to-reveal (see todo/control.md for the full rationale). `Ctrl`(left)+Arrow focuses a panel: Timeline/Layers/Colors/Projects for Up/Right/Down/Left: pulling it out and marking it with a red hairline; it *stays* focused after keyup, and while focused that panel owns the whole keyboard, until `Tab` cycles to another panel or `Ctrl`(left) alone (tap, no arrow) returns focus to Canvas, the default. Hovering a panel (or its edge trigger) focuses it too, same as Ctrl+Arrow: mouse and keyboard stay in sync: and moving the mouse back off it returns focus to Canvas. `Shift+Tab` pins/unpins every panel at once; `~` pins/unpins the corner tags. Canvas arrow keys are the primary cursor, stepped by brush size, with an accelerating hold-repeat (modeled on a phone's backspace) shared by cursor movement and rotate; held modifiers (Shift/Ctrl/Alt/Z, including distinguishing left/right Shift) select momentary tool/selection variants: paint/erase are no longer a persisted mode, just whichever key/mouse-button is down at the time. Mouse still works alongside this (left paints, right erases, scroll zooms): whether it's retired later is still open. Remaining gap: multi-project open/new and a focused-category/group concept for the Projects/Layers panels aren't built (both act on the *current* canvas/layer's own category/group instead).

**Slide-Out Context Bar**:
The one shared mechanism for every secondary/contextual control surface in the app: a right-click on a palette chip, a layer thumbnail, a Project canvas, or the Project name all open this same kind of bar, sliding out from the element that triggered it, rather than a floating dropdown menu. Contents differ per trigger (Rename+Resize for a canvas, an opacity slider for a layer thumbnail, etc.) but the mechanic is one thing, built once.
_Avoid_: Context menu, popup menu, dropdown
