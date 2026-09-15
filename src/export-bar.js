import { exportPng, exportJpg, exportSvg, exportPdf, exportJson, exportPixi } from './export.js';

const FORMATS = ['PNG', 'JPG', 'SVG', 'PDF', 'JSON', 'PIXI'];
const SCALES = [1, 2, 4, 8];
const STORE_KEY = 'pixi-export-prefs';

function loadPrefs() {
  try {
    return { format: 'PNG', scale: 1, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch {
    return { format: 'PNG', scale: 1 };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* ignore quota/availability */ }
}

// Export context bar (§14): opens beside the selected file, remembers the
// last-used format/scale globally. JPG/PDF alpha fill defaults to white;
// clicking that format again toggles black; right-click sets it to the
// current secondary color.
export function openExportBar(anchorEl, file, getSecondaryColor) {
  document.querySelectorAll('.slide-out-bar.export-bar').forEach((el) => el.remove());
  const prefs = loadPrefs();
  let altFill = '#FFFFFF';

  const bar = document.createElement('div');
  bar.className = 'slide-out-bar export-bar';

  const formatRow = document.createElement('div');
  formatRow.className = 'export-btn-row';
  const scaleRow = document.createElement('div');
  scaleRow.className = 'export-btn-row';

  function chunkyBtn(label, selected, onClick, onContextMenu) {
    const btn = document.createElement('button');
    btn.className = 'btn export-option' + (selected ? ' selected' : '');
    const face = document.createElement('div');
    face.className = 'btn-face';
    face.textContent = label;
    const shadow = document.createElement('div');
    shadow.className = 'btn-shadow';
    btn.append(face, shadow);
    btn.addEventListener('click', onClick);
    if (onContextMenu) btn.addEventListener('contextmenu', onContextMenu);
    return btn;
  }

  function rebuild() {
    formatRow.innerHTML = '';
    FORMATS.forEach((fmt) => {
      formatRow.append(chunkyBtn(fmt, prefs.format === fmt, () => {
        if (prefs.format === fmt && (fmt === 'JPG' || fmt === 'PDF')) {
          altFill = altFill === '#FFFFFF' ? '#000000' : '#FFFFFF';
        }
        prefs.format = fmt;
        savePrefs(prefs);
        rebuild();
      }, (e) => {
        if (fmt === 'JPG' || fmt === 'PDF') {
          e.preventDefault();
          altFill = getSecondaryColor();
        }
      }));
    });
    scaleRow.innerHTML = '';
    SCALES.forEach((s) => {
      scaleRow.append(chunkyBtn(`${s}x`, prefs.scale === s, () => {
        prefs.scale = s;
        savePrefs(prefs);
        rebuild();
      }));
    });
  }
  rebuild();

  const confirm = chunkyBtn('Export', false, () => runExport().then(cleanup));
  confirm.classList.add('export-confirm');

  async function runExport() {
    const { format, scale } = prefs;
    if (format === 'PNG') await exportPng(file, scale);
    else if (format === 'JPG') await exportJpg(file, scale, altFill);
    else if (format === 'SVG') exportSvg(file, scale);
    else if (format === 'PDF') await exportPdf(file, scale, altFill);
    else if (format === 'JSON') exportJson(file);
    else if (format === 'PIXI') exportPixi(file);
    bar.remove();
  }

  bar.append(formatRow, scaleRow, confirm);
  const rect = anchorEl.getBoundingClientRect();
  bar.style.left = rect.right + 4 + 'px';
  bar.style.top = rect.top + 'px';
  bar.style.transform = 'translateX(-12px)';
  bar.style.opacity = '0';
  document.body.append(bar);
  requestAnimationFrame(() => {
    bar.style.transform = 'translate(0, 0)';
    bar.style.opacity = '1';
  });

  function cleanup() {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('pointerdown', onOutside);
  }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); runExport().then(cleanup); }
    if (e.key === 'Escape') { bar.remove(); cleanup(); }
  }
  function onOutside(e) {
    if (!bar.contains(e.target)) { bar.remove(); cleanup(); }
  }
  window.addEventListener('keydown', onKeydown);
  setTimeout(() => window.addEventListener('pointerdown', onOutside), 0);

  return bar;
}
