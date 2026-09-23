// Persisted UI preferences — which panels are pinned open, grid/ruler
// visibility, corner-tag visibility — restored on reload so the workspace
// looks the same as when you left it. Distinct from Project data (which
// goes through persistence.js to the chosen storage backend): this is a
// per-browser display preference, not part of the .sprite file, so it lives
// in localStorage like the export panel's remembered format/scale.
const KEY = 'sprite-ui-prefs';
const DEFAULTS = {
  project: false, layers: false, timeline: false, palette: true, // panel pin state (§7.2 flagged assumption 3: palette starts pinned)
  showGrid: true, showRuler: false, dither: false, symmetry: 'off', tagsHidden: false, canvasBg: 'checker', appBg: 'black', lastProjectId: null,
  // The group grid (§ project panel group select) has no canvas background
  // of its own (every artboard is always transparent) — just its own `U`
  // backdrop, separate from the single-file canvas's above.
  groupAppBg: 'white',
};

export function loadUiPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUiPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore quota/availability */ }
}
