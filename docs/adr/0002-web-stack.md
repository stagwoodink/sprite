# Switch from Rust/egui to plain web stack, drop native target

The original spec package (`sprite-design-doc.md` v1/v2) specced Rust + `egui`/`eframe`,
compiling to both a native binary and WASM (via `trunk`) for the itch.io web build.
A working prototype was built against that spec (now archived at `../sprite-prototype`,
outside this repo) but proved harder to modify than the UI's actual complexity
warranted: `egui`'s immediate-mode model fuses view, state, and layout into one
function per frame, so panels couldn't be touched in isolation, and the dual
native+wasm target doubled the persistence surface (three storage backends: native
`std::fs`, browser File System Access API, IndexedDB fallback) for a project that
only ever needed to ship as a web app.

Decision: rebuild as a plain JavaScript/HTML/CSS web app: Canvas2D for pixel
rendering, DOM/CSS for panel chrome, no framework, no build step, no native target.
This drops the `std::fs` backend entirely (§1 item 5 / ADR 0001 now describes the
full, only persistence story) and gives the UI panels real component boundaries
(DOM elements + event listeners) instead of one monolithic draw function.

Electron was considered and rejected: itch.io wants a web build regardless, and
Chromium's File System Access API already gives the same real-filesystem access
Electron would add, without the Node/Chromium packaging weight. Revisit only if a
genuine need for native-only capability (e.g. true offline installer) shows up later.
