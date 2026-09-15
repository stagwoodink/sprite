# Pixi

Pixi is a minimalist pixel-art editor: one modifier-driven tool, projects of multi-frame/multi-layer canvas files, autosave, no manual save.

## Language

**Project**:
A directory containing one or more Files and one shared Palette. Native: a real folder. Web: a virtual folder (IndexedDB) or a real folder via the File System Access API, depending on what the browser grants.
_Avoid_: Workspace, folder (as a domain term — "folder" is fine as the storage detail, not the concept name)

**File**:
A single canvas document within a Project, with its own Layers, Frames, and undo history. Persisted as `.pixi`.
_Avoid_: Document, canvas (canvas is the drawing surface a File renders into, not the File itself), sprite

**Layer**:
A stack element within a File. All Frames of a File share the same Layer stack.

**Frame**:
A single point in time within a File's animation. A File with exactly one Frame is a static image.

**Palette**:
Up to 32 color chips, belonging to a Project (not a File) — switching Files keeps it, switching Projects swaps it.

**Palette Preset**:
One of the built-in, non-editable starting Palettes a new Project can load: Pico-8 (16 colors, default), Game Boy DMG (4 colors), or Stagwood Brand (4 colors: dark red, red `#BE1425`, almost-white, almost-black). Distinct from a Project's own Palette, which is user-editable after loading a preset into it.
_Avoid_: Theme, swatch set

**Eyedropper**:
Sampling a color from the canvas into the primary or secondary slot. Two distinct triggers, not one unified gesture: holding `I` while clicking the canvas (left = primary, right = secondary), or a toggle button inside the chip color-picker popup that arms sampling for its next canvas click. There is no plain, unmodified click-to-sample anywhere on the canvas.
_Avoid_: Color picker (that term is reserved for the HSL+hex popup itself, not the sampling action)

**Slide-Out Context Bar**:
The one shared mechanism for every secondary/contextual control surface in the app — a right-click on a palette chip, a layer thumbnail, a Project file, or the Project name all open this same kind of bar, sliding out from the element that triggered it, rather than a floating dropdown menu. Contents differ per trigger (Rename+Resize for a file, an opacity slider for a layer thumbnail, etc.) but the mechanic is one thing, built once.
_Avoid_: Context menu, popup menu, dropdown
