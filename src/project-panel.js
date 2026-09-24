import { NEW_FILE_SIZES, MIN_CANVAS, MAX_CANVAS, clampCanvasSize, projectOrder, projectLoad, projectLoadBreakdown, formatBytes } from './project.js';
import { visibleOrder } from './ordering.js';
import { openSlideOut, openCustomSlideOut, closeSlideOut } from './slide-out.js';
import { button, hoverTip, makeReorderable, startInlineEdit } from './ui.js';

// Project panel (ui-design-system §7, design-doc §13). `state` is the
// { project } holder in main.js; callbacks mutate it and call onChange to
// re-render + re-bind the active file. File/collection order and grouping
// are drag-and-drop only now: a file becomes a collection's member by
// being positioned directly beneath its header (§ ordering.js), the same
// way dragging it back out above the header (or past the collection's last
// member) ungroups it. No separate "move to collection" control.
export function renderProjectPanel(container, project, callbacks, focusedCollectionId, activeGroupId, fileSelection) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'project-header tile-bar reveal-on-hover';

  const nameEl = document.createElement('div');
  nameEl.className = 'project-name';
  nameEl.textContent = project.name;
  nameEl.addEventListener('click', () => startInlineEdit(nameEl, project.name, (v) => {
    if (!v) return;
    project.name = v;
    // A single-file project reads as one thing to the user: its one
    // .sprite file should track the project's own name.
    if (project.files.length === 1) project.files[0].name = v;
    callbacks.onChange();
  }));

  // Same glyph, same `.btn--reveal` hover treatment as every other row's
  // "⋯" menu button (file, collection): one menu-trigger look everywhere,
  // not a bespoke always-visible one just for this row.
  const openBtn = button({ glyph: '⋯', icon: true, className: 'btn--reveal', title: 'Select project', onClick: () => callbacks.onOpenProject(openBtn) });

  header.append(nameEl, openBtn);

  const fileList = document.createElement('div');
  fileList.className = 'file-list';

  // Anchored to the bottom of the list area, same as the layers panel's
  // stack: a short file list sits at the floor instead of floating at top.
  const fileStack = document.createElement('div');
  fileStack.className = 'file-stack';

  function buildFileRow(file, fileIndex, pos, nested) {
    const row = document.createElement('div');
    const multiSelected = !!(fileSelection && fileSelection.has(fileIndex));
    const selected = !activeGroupId && (multiSelected || fileIndex === project.activeFileIndex);
    row.className = 'file-row tile reveal-on-hover' + (nested ? ' file-row--nested' : '') + (selected ? ' selected' : '');
    row.dataset.fileIndex = fileIndex; // § multi-select menu anchor lookup
    row.addEventListener('click', (e) => {
      // Shift/Alt-click build a multi-file selection instead of switching
      // the active file: see onShiftSelectFile/onAltSelectFile.
      if (e.shiftKey) { callbacks.onShiftSelectFile(fileIndex); return; }
      if (e.altKey) { callbacks.onAltSelectFile(fileIndex); return; }
      // No-op guard: onChange fully re-renders this panel (innerHTML=''),
      // which was destroying nameEl mid-gesture: re-selecting the file
      // that's already active isn't a real change, and rebuilding on
      // every click of a double-click was exactly what broke rename.
      if (fileIndex === project.activeFileIndex && !activeGroupId && !fileSelection) return;
      callbacks.onSelectFile(fileIndex);
    });

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⋮';
    makeReorderable(handle, row, pos, {
      listEl: fileStack,
      boundsEl: container,
      onReorder: (from, to) => callbacks.onReorder(from, to),
      onRemove: () => callbacks.onRemoveFile(fileIndex),
    });

    const nameEl = document.createElement('div');
    nameEl.className = 'file-row-name';
    nameEl.textContent = file.name;
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(nameEl, file.name, (v) => { if (v) { file.name = v; callbacks.onChange({ scrollToFileIndex: fileIndex }); } });
    });

    // Every per-file action folds into one menu instead of its own
    // always-reserved button slot.
    const menuBtn = button({
      glyph: '⋯', icon: true, className: 'btn--reveal', title: 'Canvas menu',
      onClick: (e) => {
        e.stopPropagation();
        const items = [
          { label: 'Resize canvas', onClick: () => openSizePopup(menuBtn, (w, h) => callbacks.onResizeFile(file, w, h)) },
        ];
        // The last file can't be removed (project.js: deleteFile is a no-op
        // then anyway): a project always has at least one file.
        if (project.files.length > 1) items.push({ label: 'Remove', onClick: () => callbacks.onRemoveFile(fileIndex) });
        items.push({ label: 'Export', onClick: () => callbacks.onExportFile && callbacks.onExportFile(file, fileIndex) });
        openSlideOut(menuBtn, items);
      },
    });

    row.append(handle, nameEl, menuBtn);
    return row;
  }

  function buildCollectionHeader(collection, pos) {
    const row = document.createElement('div');
    const selected = collection.id === focusedCollectionId || collection.id === activeGroupId;
    row.className = 'collection-header tile reveal-on-hover' + (selected ? ' selected' : '');
    row.dataset.collectionId = collection.id;
    // Same no-op guard as a file row's click: selecting the already-active
    // group is not a real change.
    row.addEventListener('click', () => {
      if (collection.id === activeGroupId) return;
      callbacks.onSelectGroup(collection.id);
    });

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⋮';
    makeReorderable(handle, row, pos, {
      listEl: fileStack,
      boundsEl: container,
      onReorder: (from, to) => callbacks.onReorder(from, to),
    });

    const arrow = document.createElement('span');
    arrow.className = 'fold-arrow';
    arrow.textContent = collection.collapsed ? '▸' : '▾';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      collection.collapsed = !collection.collapsed;
      callbacks.onChange();
    });

    const nameEl = document.createElement('div');
    nameEl.className = 'file-row-name';
    nameEl.textContent = collection.name;
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(nameEl, collection.name, (v) => { if (v) { collection.name = v; callbacks.onChange({ scrollToCollectionId: collection.id }); } });
    });

    // Every per-collection action folds into one menu instead of its own
    // always-reserved button slot.
    const menuItems = [];
    // The last collection can't be deleted (project.js: deleteCollection is
    // a no-op then anyway): there's nowhere left for its files to go. A
    // project always starts with exactly one, so this is the common case,
    // not an edge case: the menu button itself disables rather than
    // opening onto nothing.
    menuItems.push({ label: 'Columns', onClick: () => openGridsetPopup(menuBtn, collection, callbacks.onSetGridset) });
    menuItems.push({ label: 'Export', onClick: () => callbacks.onExportCollection(collection) });
    if (project.collections.length > 1) menuItems.push({ label: 'Delete collection', onClick: () => callbacks.onDeleteCollection(collection.id) });
    const menuBtn = button({
      glyph: '⋯', icon: true, className: 'btn--reveal', title: 'Collection menu',
      disabled: menuItems.length === 0,
      onClick: (e) => { e.stopPropagation(); openSlideOut(menuBtn, menuItems); },
    });

    row.append(handle, arrow, nameEl, menuBtn);
    return row;
  }

  // `pos` is the item's index into the *full* combined order (matching
  // what onReorder/moveProjectItem expect): collapsed members are simply
  // not rendered, not renumbered, so drag positions stay meaningful even
  // with hidden gaps.
  for (const entry of visibleOrder(projectOrder(project))) {
    if (entry.isHeader) {
      fileStack.append(buildCollectionHeader(entry.item, entry.pos));
    } else {
      const fileIndex = project.files.indexOf(entry.item);
      fileStack.append(buildFileRow(entry.item, fileIndex, entry.pos, entry.item.groupId != null));
    }
  }

  const addRow = document.createElement('div');
  addRow.className = 'tile-bar project-add-row';
  // Left click: new file (opens the size picker). Double click: match
  // whatever's most recently been worked on nearby (§ onAddFileCurrent).
  // Right click: new collection, straight away: single-purpose gestures on
  // one button instead of a menu in between.
  const addFileBtn = button({
    glyph: '+', fill: true, className: 'panel-add-btn', title: 'New canvas',
    onClick: () => openSizePopup(addFileBtn, (w, h, preset) => callbacks.onAddFile(w, h, preset), { onCollection: () => callbacks.onAddCollection(), onImport: () => callbacks.onImport(addFileBtn) }),
    onContextMenu: (e) => { e.preventDefault(); callbacks.onAddCollection(); },
  });
  addFileBtn.addEventListener('dblclick', () => { closeSlideOut(); callbacks.onAddFileCurrent(); });
  addRow.append(addFileBtn);
  fileList.append(fileStack);

  // `addRow` is a sibling of the scrollable `fileList`, not a child of its
  // stack, so it stays anchored above the panel footer instead of scrolling
  // away with a long file list.
  container.append(fileList, addRow, buildCapacityMeter(project, callbacks), header);
}

// Filled bar showing how close the Project is to what a low-end machine
// handles comfortably (project.js's projectLoad). Advisory: it never
// blocks anything; the bar filling *is* the warning.
function buildCapacityMeter(project, callbacks) {
  const load = projectLoad(project);
  const meter = document.createElement('div');
  meter.className = 'capacity-meter';
  const { pixelBytes, referenceBytes } = projectLoadBreakdown(project);
  hoverTip(meter, `Capacity ${Math.round(load * 100)}% · ${formatBytes(pixelBytes + referenceBytes)}`);
  const fill = document.createElement('div');
  fill.className = 'capacity-fill';
  fill.style.width = Math.min(100, load * 100) + '%';
  meter.append(fill);
  // At 100% the bar offers a way out instead of refusing anything.
  if (load >= 1 && project.collections.length) {
    meter.classList.add('full');
    meter.addEventListener('click', () => openSlideOut(meter, [{ label: 'Split by collection', onClick: callbacks.onSplitProject }], { side: 'right' }));
  }
  return meter;
}

// Slide-out button stack (§13.2's "non-modal popup": the rest of the UI
// stays interactive around it), one button per size preset: largest at
// the top down to smallest at the bottom (reverse of NEW_FILE_SIZES' own
// ascending order), so the picker's bottom-to-top reading is small-to-large
// working up from the anchor it slides out of. The bottom row is a custom
// W x H pair. `onPick(w, h, preset)`: `preset` is null for a custom size.
// `onCollection` and `onImport`, when given, add a "Collection" and a last "Import" row (new canvas only).
export function openSizePopup(anchor, onPick, { onDismiss, onCollection, onImport } = {}) {
  return openCustomSlideOut(anchor, (bar, close) => {
    for (const preset of [...NEW_FILE_SIZES].reverse()) {
      bar.append(button({ label: preset.label, fill: true, onClick: () => { onPick(preset.w, preset.h, preset); close(); } }));
    }
    bar.append(customSizeRow((w, h) => { onPick(w, h, null); close(); }));
    if (onCollection) bar.append(button({ label: 'Collection', fill: true, onClick: () => { close(); onCollection(); } }));
    if (onImport) bar.append(button({ label: 'Import', fill: true, title: 'Spritesheet or .sprite', onClick: () => { close(); onImport(); } }));
  }, { className: 'size-popup', onDismiss });
}

// Two number fields (Tab between them) and Enter to commit. H mirrors W
// until it's been edited by hand, so a square stays one keystroke.
function customSizeRow(onSubmit) {
  const row = document.createElement('div');
  row.className = 'size-row';
  const field = (title) => {
    const el = document.createElement('input');
    el.type = 'number';
    el.min = MIN_CANVAS;
    el.max = MAX_CANVAS;
    el.title = title;
    el.placeholder = title;
    return el;
  };
  const w = field('W'), h = field('H');
  let hEdited = false;
  // Typing past the ceiling snaps the text itself down to it.
  for (const el of [w, h]) el.addEventListener('input', () => { if (Number(el.value) > MAX_CANVAS) el.value = MAX_CANVAS; });
  h.addEventListener('input', () => { hEdited = true; });
  w.addEventListener('input', () => { if (!hEdited) h.value = w.value; });
  const submit = (e) => {
    if (e.key !== 'Enter') return;
    onSubmit(clampCanvasSize(w.value), clampCanvasSize(h.value || w.value));
  };
  w.addEventListener('keydown', submit);
  h.addEventListener('keydown', submit);
  row.append(w, h);
  return row;
}

// Collection header menu's "Columns": how many artboards the group
// grid wraps after before starting a new row (§ renderer.js's
// computeArtboardLayout `gridset`). 'Auto' clears it back to the default
// square-ish layout.
function openGridsetPopup(anchor, collection, onSetGridset) {
  const items = [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), onClick: () => onSetGridset(collection, n) }));
  items.push({ label: 'Auto', onClick: () => onSetGridset(collection, null) });
  openSlideOut(anchor, items);
}
