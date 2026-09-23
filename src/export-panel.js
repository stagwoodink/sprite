import { exportFile, exportCollection, exportProjectSprite } from './export.js';
import { button } from './ui.js';

const FORMATS = ['PNG', 'GIF', 'SVG'];
const SCALES = [1, 2, 4, 8];
const FILE_MODES = ['Canvas', 'Layers', 'Frames'];
const COLLECTION_MODES = ['Sheet', 'Files'];
const STORE_KEY = 'sprite-export-prefs';

function loadPrefs() {
  const defaults = { fileFormat: 'PNG', fileScale: 1, fileMode: 'Canvas', collectionFormat: 'PNG', collectionScale: 1, collectionMode: 'Sheet' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return defaults;
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* ignore quota/availability */ }
}

// Export panel (§14): a docked full-height side panel, flush against the
// Project panel, opened from a File's or Collection's own "⋯" menu (or the
// whole-Project export shortcut). `target` is one of:
//   { kind: 'file', file, fps }
//   { kind: 'collection', name, artboards, gridset }
//   { kind: 'project', project }
// File and Collection share the same Format/Scale row (each remembers its
// own last-used choice); Project has no format/scale at all — a `.sprite`
// archive is the only thing it produces.
export function renderExportPanel(container, target) {
  container.innerHTML = '';
  const prefs = loadPrefs();

  const title = document.createElement('div');
  title.className = 'side-panel-title';
  title.textContent = 'Export';

  const body = document.createElement('div');
  body.className = 'side-panel-body';

  if (target.kind === 'project') {
    const confirm = button({
      label: 'Export .sprite', fill: true, className: 'export-confirm',
      onClick: () => exportProjectSprite(target.project),
    });
    body.append(confirm);
    container.append(title, body);
    return;
  }

  const isFile = target.kind === 'file';
  const formatKey = isFile ? 'fileFormat' : 'collectionFormat';
  const scaleKey = isFile ? 'fileScale' : 'collectionScale';
  const modeKey = isFile ? 'fileMode' : 'collectionMode';
  const modes = isFile ? FILE_MODES : COLLECTION_MODES;

  const formatRow = document.createElement('div');
  formatRow.className = 'export-btn-row tile-bar';
  const scaleRow = document.createElement('div');
  scaleRow.className = 'export-btn-row tile-bar';
  const modeRow = document.createElement('div');
  modeRow.className = 'export-btn-row tile-bar';

  function rebuild() {
    formatRow.innerHTML = '';
    FORMATS.forEach((fmt) => {
      formatRow.append(button({
        label: fmt, fill: true, className: 'export-option', selected: prefs[formatKey] === fmt,
        onClick: () => { prefs[formatKey] = fmt; savePrefs(prefs); rebuild(); },
      }));
    });
    scaleRow.innerHTML = '';
    SCALES.forEach((s) => {
      scaleRow.append(button({
        label: `${s}x`, fill: true, className: 'scale-option', selected: prefs[scaleKey] === s,
        onClick: () => { prefs[scaleKey] = s; savePrefs(prefs); rebuild(); },
      }));
    });
    modeRow.innerHTML = '';
    // File: Layers/Frames breakdown applies to PNG/SVG only (GIF is always
    // simple-or-animated on its own, no mode). Collection: SVG is always
    // one combined sheet (no Files mode — see export.js's own comment).
    modeRow.hidden = isFile ? prefs[formatKey] === 'GIF' : prefs[formatKey] === 'SVG';
    modes.forEach((m) => {
      modeRow.append(button({
        label: m, fill: true, className: 'mode-option', selected: prefs[modeKey] === m,
        onClick: () => { prefs[modeKey] = m; savePrefs(prefs); rebuild(); },
      }));
    });
  }
  rebuild();

  async function runExport() {
    const format = prefs[formatKey].toLowerCase();
    const scale = prefs[scaleKey];
    const mode = prefs[modeKey].toLowerCase();
    if (isFile) {
      await exportFile(target.file, { format, scale, mode, fps: target.fps });
    } else {
      await exportCollection(target.name, target.artboards, { format, scale, mode, gridset: target.gridset });
    }
  }

  const confirm = button({ label: 'Export', fill: true, className: 'export-confirm', onClick: () => runExport() });

  body.append(formatRow, scaleRow, modeRow, confirm);
  container.append(title, body);
}
