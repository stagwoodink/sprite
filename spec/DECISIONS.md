# Pixi — Grilled Decisions

Every flagged assumption and open item from `INDEX.md`, `pixi-design-doc.md` §1, `pixi-features-doc.md` §12, and `pixi-ui-design-system.md` §8 has a confirmed answer below. This file is the resolution log for that grilling session — the four spec files themselves are left unedited as the original package; where they say "flagged for confirmation" or leave a value open, this file is the answer. Build against this alongside them.

## Interaction

- **Canvas eyedropper.** No plain click-to-sample anywhere on the canvas. Two triggers: hold `I` + left-click samples into primary, hold `I` + right-click samples into secondary (mirrors the paint model). Separately, the chip color-picker popup gets an explicit eyedropper toggle button — one-shot, arms sampling for the next canvas click only, then auto-reverts to normal paint mode. Clicking away from the picker with no toggle armed just dismisses it; no side effect.
- **Palette add-chip glyph:** `[+]`.
- **Palette default state:** pinned/visible by default; `P` demotes it to hover-reveal/idle-hide like the other panels.
- **All secondary/contextual surfaces are one component:** a Slide-Out Context Bar (see `CONTEXT.md`), not floating popups. A file's right-click bar holds Rename + Resize Canvas only. Applies uniformly to chip right-click, layer-thumbnail right-click, file right-click, and project-name right-click. Flush and aligned, matching §15's "build once, reuse everywhere" instruction.
- **`Ctrl+Space` platform-conflict fallback:** `Shift+Space`.

## Palette presets

Three presets, replacing the earlier "generic 16-color third preset":
1. **Pico-8** (16 colors) — the default loaded into a brand-new Project.
2. **Game Boy DMG** (4 colors).
3. **Stagwood Brand** (4 colors): dark red `#7A0D18` (approximated, darkened from the sampled accent red), red `#BE1425` (exact, sampled from `spec/stagwood.png`), almost-white = `text-primary` `#F2F2F0`, almost-black = `bg-base` `#121214` (both reused from the existing UI tokens rather than new values).

User-facing palette swapping/customization beyond loading one of these three at Project creation is out of scope for now (YAGNI — revisit if asked for later).

## Export

- SVG: one `<rect>` per non-transparent pixel, confirmed as final (not a raster-in-wrapper).
- JSON: width/height + row-major RGBA array + palette/layer/frame metadata, confirmed as final, **and it is reimportable** — JSON is a real round-trip format, not export-only.

## First run & naming

- First launch with no prior state creates one Project named `New Project` containing one File named `New Sprite` at 16×16.
- Every subsequent `+` (new project, new file) reuses this same bare-name pattern. The name only gets a trailing number on an actual collision (`New Project`, then `New Project 2`, `New Project 3`, ...) — never a `1` suffix on the first instance.

## Visual

- **Accent red, exact:** `#BE1425`, sampled directly from `spec/stagwood.png`. Supersedes the `#C4202E` approximation used throughout both design docs' mockup language — treat every mention of `#C4202E` in `pixi-design-doc.md` / `pixi-ui-design-system.md` as superseded by this value.
- **m3x6 native grid:** measured directly from `spec/m3x6.ttf` (`unitsPerEm`/hhea metrics) — the font's name is literal, glyphs sit on a 3px-wide × 6px-tall grid, matching the same naming convention as Daniel Linssen's `m5x7`/`m6x11`. Valid integer render sizes are multiples of **6px**. This supersedes the spec's unconfirmed 32px/16px guess (neither is a multiple of 6). **Header size: 36px** (×6). **Body size: 12px** (×2).
- **Long-string legibility at 12px:** genuinely can't be checked from the font file alone — needs a running build rendering real names. Deferred; the user will manually check once the first real UI (with actual project/layer names) is up, and report back before this is treated as final.
- **Icon art — both UI icons (eye/delete/onion-skin-toggle/open-project) and per-mode cursor icons:** ship with plain placeholder shapes (squares, simple primitives) everywhere for now. Real pixel-art icons and a cursor sprite sheet come later, made by the user in Pixi itself once the app exists. The *requirement* that the cursor always indicates the active mode is still firm — only the art quality is deferred, not the behavior.

## Architecture

- **Web storage:** hybrid graceful-degradation approach, not IndexedDB-only. See `docs/adr/0001-hybrid-web-storage.md`.
- **itch.io iframe storage verification:** not a standalone spike. Folded into Phase 6 (Persistence architecture decision point) when the persistence code actually exists to test against.
- **Build phase order:** `pixi-design-doc.md` §19's 15 phases, followed as written — already dependency-ordered, no reprioritization.
