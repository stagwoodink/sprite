// Shared zoom/pan state for the canvas viewport (§6). A single module-level
// object rather than threading params through render()/input — this app
// only ever shows one canvas at a time.
//
// zoom: null means "fit to window" (recomputed on every resize); a number
// pins an explicit scale until reset.
export const viewState = { zoom: null, panX: 0, panY: 0 };

export function resetView() {
  viewState.zoom = null;
  viewState.panX = 0;
  viewState.panY = 0;
}

// Same shape, for the read-only group grid's own camera (§ project panel
// group select) — panning/zooming a collection as a whole is independent of
// wherever the single-file canvas's own view happens to be.
export const groupViewState = { zoom: null, panX: 0, panY: 0 };

export function resetGroupView() {
  groupViewState.zoom = null;
  groupViewState.panX = 0;
  groupViewState.panY = 0;
}
