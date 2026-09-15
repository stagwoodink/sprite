import { NEW_FILE_SIZES } from './project.js';

// Project panel (ui-design-system §7, design-doc §13). `state` is the
// { project } holder in main.js; callbacks mutate it and call onChange to
// re-render + re-bind the active file.
export function renderProjectPanel(container, project, callbacks) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'project-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'project-name';
  nameEl.textContent = project.name;
  nameEl.title = 'Click to rename';
  nameEl.addEventListener('click', () => startInlineEdit(nameEl, project.name, (v) => {
    project.name = v || project.name;
    callbacks.onChange();
  }));

  // Multi-project switching isn't wired yet (Phase 7 gap: one Project per
  // session for now) — both buttons are honest placeholders until then.
  const newBtn = chunkyIconButton('+', 'New project (not yet implemented)', () => {});
  const openBtn = chunkyIconButton('□', 'Open project (not yet implemented)', () => {});

  header.append(nameEl, newBtn, openBtn);

  const fileList = document.createElement('div');
  fileList.className = 'file-list';

  // Anchored to the bottom of the list area, same as the layers panel's
  // stack — a short file list sits at the floor instead of floating at top.
  const fileStack = document.createElement('div');
  fileStack.className = 'file-stack';

  const addFileBtn = chunkyTextButton('+', () => openSizePopup(addFileBtn, (w, h) => {
    callbacks.onAddFile(w, h);
  }));
  addFileBtn.classList.add('panel-add-btn');
  fileStack.append(addFileBtn);

  project.files.forEach((file, i) => {
    const row = document.createElement('div');
    row.className = 'file-row' + (i === project.activeFileIndex ? ' active' : '');
    row.textContent = file.name;
    row.addEventListener('click', () => {
      project.activeFileIndex = i;
      callbacks.onChange();
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openFileContextMenu(row, file, callbacks);
    });
    fileStack.append(row);
  });

  fileList.append(fileStack);

  const footer = document.createElement('div');
  footer.className = 'project-footer';
  const importBtn = chunkyTextButton('Import', () => {});
  const exportBtn = chunkyTextButton('Export', () => callbacks.onExport && callbacks.onExport());
  footer.append(importBtn, exportBtn);

  container.append(header, fileList, footer);
}

function chunkyIconButton(glyph, title, onClick) {
  const btn = document.createElement('button');
  btn.className = 'panel-header-btn';
  btn.textContent = glyph;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function chunkyTextButton(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn footer-btn';
  const face = document.createElement('div');
  face.className = 'btn-face';
  face.textContent = label;
  const shadow = document.createElement('div');
  shadow.className = 'btn-shadow';
  btn.append(face, shadow);
  btn.addEventListener('click', onClick);
  return btn;
}

function startInlineEdit(el, initial, onCommit) {
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.value = initial;
  el.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    onCommit(input.value.trim());
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); }
    if (e.key === 'Escape') { input.replaceWith(el); }
  });
  input.addEventListener('blur', commit, { once: true });
}

// Non-modal popup — the rest of the UI stays interactive around it (§13.2).
function openSizePopup(anchor, onPick) {
  document.querySelectorAll('.size-popup').forEach((el) => el.remove());
  const popup = document.createElement('div');
  popup.className = 'size-popup';
  NEW_FILE_SIZES.forEach(({ label, w, h }) => {
    const opt = document.createElement('button');
    opt.className = 'size-popup-option';
    opt.textContent = label;
    opt.addEventListener('click', () => { onPick(w, h); popup.remove(); });
    popup.append(opt);
  });
  const rect = anchor.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = rect.bottom + 'px';
  document.body.append(popup);
  setTimeout(() => window.addEventListener('pointerdown', function onOutside(e) {
    if (!popup.contains(e.target)) { popup.remove(); window.removeEventListener('pointerdown', onOutside); }
  }), 0);
}

// Merged Rename + Resize Canvas context menu (§1 flagged assumption 4).
function openFileContextMenu(anchor, file, callbacks) {
  document.querySelectorAll('.context-bar').forEach((el) => el.remove());
  const bar = document.createElement('div');
  bar.className = 'context-bar';
  const rename = document.createElement('button');
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => {
    bar.remove();
    startInlineEdit(anchor, file.name, (v) => { if (v) { file.name = v; callbacks.onChange(); } });
  });
  const resize = document.createElement('button');
  resize.textContent = 'Resize Canvas';
  resize.addEventListener('click', () => {
    bar.remove();
    openSizePopup(anchor, (w, h) => callbacks.onResizeFile(file, w, h));
  });
  bar.append(rename, resize);
  const rect = anchor.getBoundingClientRect();
  bar.style.left = rect.right + 'px';
  bar.style.top = rect.top + 'px';
  document.body.append(bar);
  setTimeout(() => window.addEventListener('pointerdown', function onOutside(e) {
    if (!bar.contains(e.target)) { bar.remove(); window.removeEventListener('pointerdown', onOutside); }
  }), 0);
}
