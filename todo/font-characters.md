# Custom font — required character set

Replacing m3x6 for body/header text (`--font-body`/`--font-header`). Icon-glyph buttons (`--icon-font`: `+ □ ⤡ ↥ ↧ ✕ ⋮ ◈ ☰ ! @ ? ⌕`) are a separate fallback-symbol font, untouched by this — see `todo/icons.md`.

## Letters

Full `A–Z` and `a–z`. Project/file/layer names are free-typed by the user, so this can't be trimmed to only what's in fixed UI copy.

## Digits

Full `0–9`.

## Punctuation / symbols actually rendered

Pulled from every fixed UI string in the codebase (Controls modal, panel labels, export formats, mode labels) plus what arbitrary content needs:

- `+ - / \ ( ) [ ] = ? ! , . : ` ° —`
- `#` — hex color codes (`#BE1425`)
- `%` — opacity readout, zoom %
- `x` — export scale multiplier (`2x`, `4x`, `8x`), already covered by lowercase letters

## Not needed

No accented/non-Latin characters, no currency symbols, no em-dash beyond the one `—` above (used once, in a Controls modal description).
