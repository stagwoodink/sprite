# Sprite — Spec Package Index

Start here. This package contains four files, produced across an extended design process. They are not four independent specs to reconcile yourself — read them in this order, with this precedence:

## Reading order

1. **`sprite-design-doc.md`** — **Read this first. This is the canonical, authoritative build spec.** It covers intention, tech stack, data model, every feature's behavior, the full keybind reference, panel layout, file I/O, and an ordered build-plan of phases. If you only read one file, read this one. Where anything in files 2 or 3 below appears to conflict with this document, **this document wins** — it's the most recently reconciled version.

2. **`sprite-features-doc.md`** — Supporting detail. Covers the same feature ground as `sprite-design-doc.md` but in more granular, conversational form, including the reasoning behind several decisions and a list of items that were deliberately left as open judgment calls (see its own §12). Read this when you want the *why* behind something `sprite-design-doc.md` states more tersely, or when its open-items list is directly relevant to what you're building.

3. **`sprite-ui-design-system.md`** — **The authoritative source for everything visual.** `sprite-design-doc.md` deliberately does not duplicate color tokens, typography, button/chip states, or panel visual anatomy — it points here instead. Do not style anything from memory or convention; this document specifies exact values (hex codes, pixel dimensions, state tables) for buttons, chips, layers/timeline/project panel anatomy, and the overall dark theme. Read this alongside `sprite-design-doc.md`, not instead of it — one covers behavior, the other covers appearance, and a complete build needs both.

4. **`sprite-ui-reference.svg`** — A literal visual reference for the button, chip, and layers-panel states described in file 3. Open it directly (any browser or SVG viewer) rather than trying to infer the look from prose alone — several of these visual decisions (hairline weights, shadow-clamping for near-black colors, the checkerboard treatment) went through multiple failed attempts before landing on the described version, and the SVG shows the actual result.

## What's deliberately *not* included

- `m3x6.ttf` and `m3x6-specimen.html` (delivered earlier in this design process) are the confirmed UI font and a specimen page for evaluating it — grab them from earlier in this conversation/session if they didn't come through in this package, they're needed to actually render the UI as specified.
- No source code. This is a spec package, not a starting repo.

## Before you start building

Both `sprite-design-doc.md` and `sprite-features-doc.md` contain **open items** — things that were explicitly flagged as unresolved defaults or genuine open questions rather than confirmed decisions (see `sprite-design-doc.md`'s flagged-assumptions section near the top, `sprite-features-doc.md` §12, and `sprite-ui-design-system.md` §8). Skim these before starting. A few are safe to build against as-is (they're reasonable defaults, stated as such); a few — particularly the web storage architecture's reliance on an unverified assumption about itch.io's iframe behavior, and the SVG/JSON export schemas — are worth a quick confirmation pass before you're deep into the relevant phase, rather than discovering a wrong assumption mid-build.

## Known remaining gaps (not yet resolved anywhere in this package)

- Exact accent-red hex (currently an approximation, `#C4202E`, sampled by eye from the brand logo rather than the actual pixel value).
- m3x6's confirmed native-grid size multiples (32px/16px header/body sizes are a convention-based guess).
- Real icon art for the several placeholder pips/glyphs currently standing in (eye/visibility toggle, delete, onion-skin toggle, open-project).
- Whether long UI strings (a full project name, a long layer name) stay legible at the specified 16px body size — only a short specimen string was tested.

None of these block starting the build — they're localized enough to patch in later — but they're genuine gaps, not settled decisions, and shouldn't be treated as final if you're the one filling them in.
