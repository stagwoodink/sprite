// Shared hover-tip channel: instead of a button's `title` becoming a native
// browser tooltip, button() reports it here on hover/focus; main.js (which
// owns the tool tag, the corner readout that already shows current
// tool/brush/zoom) subscribes once and displays it there instead.
let hoverTipListener = null;
export function onHoverTip(fn) { hoverTipListener = fn; }

// Wires any element to the tool tag's tip slot (what button() does for its
// `title`). Tips must be terse: that slot is a few words wide.
export function hoverTip(el, text) {
  el.addEventListener('mouseenter', () => hoverTipListener && hoverTipListener(text));
  el.addEventListener('mouseleave', () => hoverTipListener && hoverTipListener(null));
}

// A native file-picker dialog, no custom UI (same as the project import).
export function pickFile(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
  input.click();
}

// A transient message in the corner tool tag: the app's one non-modal way
// to say "that didn't happen, and why" without a dialog.
export function flashTip(text, ms = 3000) {
  if (!hoverTipListener) return;
  hoverTipListener(text);
  setTimeout(() => hoverTipListener(null), ms);
}

// Shared button primitive (design system: Button/Tile/Tile-bar/Panel).
// Every clickable control in the app: icon button, text button, tab,
// toggle: is one of these, so hover/active/focus/selected states and
// sizing live in one CSS rule (`.btn` in style.css) instead of being
// reimplemented per feature with its own markup and colors.
export function button({ glyph, label, title, icon = false, fill = false, selected = false, active = false, disabled = false, className = '', onClick, onContextMenu } = {}) {
  const el = document.createElement('button');
  el.className = ['btn', icon ? 'btn--icon' : '', fill ? 'btn--fill' : '', selected ? 'selected' : '', active ? 'active' : '', className]
    .filter(Boolean).join(' ');
  // `glyph` is usually a plain string, but a caller that needs a styled
  // sub-element (e.g. a smaller font-size span for a glyph that reads too
  // big at the button's own font-size) can pass a Node instead: appended
  // as-is rather than stringified into textContent.
  if (glyph instanceof Node) el.append(glyph);
  else el.textContent = glyph != null ? glyph : label;
  el.disabled = disabled;
  if (title) {
    el.addEventListener('mouseenter', () => hoverTipListener && hoverTipListener(title));
    el.addEventListener('mouseleave', () => hoverTipListener && hoverTipListener(null));
    el.addEventListener('focus', () => hoverTipListener && hoverTipListener(title));
    el.addEventListener('blur', () => hoverTipListener && hoverTipListener(null));
  }
  if (onClick) el.addEventListener('click', onClick);
  if (onContextMenu) el.addEventListener('contextmenu', onContextMenu);
  return el;
}

// Edits `el`'s own text in place via `contenteditable`: no swap to an
// `<input>`, so nothing about its look (font, background, padding) changes,
// only that it becomes typable. Commits (trimmed; an empty value is
// treated as "keep the original" by the caller) on Enter/blur, reverts on
// Escape. Shared by every renameable label (project name, file name,
// layer name) instead of each re-implementing the same dance.
export function startInlineEdit(el, initial, onCommit) {
  if (el.isContentEditable) return; // already editing: a stray extra click/dblclick shouldn't restart it
  el.contentEditable = 'true';
  el.spellcheck = false;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function finish(commit) {
    el.contentEditable = 'false';
    el.removeEventListener('keydown', onKeydown);
    el.removeEventListener('blur', onBlur);
    if (commit) {
      const value = el.textContent.trim();
      el.textContent = value || initial; // reflect immediately; the caller's re-render overwrites this if it changes
      onCommit(value);
    } else {
      el.textContent = initial;
    }
  }
  function onKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  }
  function onBlur() { finish(true); }
  el.addEventListener('keydown', onKeydown);
  el.addEventListener('blur', onBlur, { once: true });
}

// A floating copy of `row` that follows the cursor while dragging: the
// original stays in place (dimmed via .dragging) as the "this is where it
// came from" reference, the ghost is "this is what you're holding."
// `<canvas>` content doesn't survive cloneNode (it's rendered pixels, not
// DOM), so thumbnail canvases are manually repainted onto their clones.
function createGhost(row) {
  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  const srcCanvases = row.querySelectorAll('canvas');
  ghost.querySelectorAll('canvas').forEach((dst, i) => {
    const src = srcCanvases[i];
    dst.width = src.width;
    dst.height = src.height;
    dst.getContext('2d').drawImage(src, 0, 0);
  });
  ghost.classList.remove('selected', 'active', 'dragging');
  ghost.classList.add('drag-ghost');
  ghost.style.cssText = `position:fixed; left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px; margin:0;`;
  document.body.append(ghost);
  return ghost;
}

// Pointer-based drag-to-reorder for a list of rows: press the handle,
// drag over a sibling row to swap places (the rows between lift out of
// the way to open a gap), drag past `boundsEl`'s edge to remove, release
// to drop. Every reorderable list (file rows, layer rows) uses this one
// implementation instead of native HTML5 drag-and-drop, which requires
// the browser to recognize a drag gesture from a mousedown+move before
// dragstart even fires: unreliable to trigger from a small handle across
// browsers/platforms, and prone to silently doing nothing.
//
// `index` is the row's real array index (not its DOM position: a list
// can render in a different order than its array, e.g. the layers panel
// lists top-of-stack first). `listEl` scopes the sibling-shift query to
// this row's own list; `boundsEl` is what "dragged off the panel" means
// (typically the whole panel, wider than just the list).
export function makeReorderable(handle, row, index, { listEl, boundsEl, onReorder, onRemove }) {
  row.dataset.reorderIndex = index;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Best-effort: capture keeps the drag tracking cleanly through other
    // elements, but move/up are bound to `window` below regardless (not
    // `handle`), so the drag still works correctly even where capture
    // isn't available or throws.
    try { handle.setPointerCapture(e.pointerId); } catch { /* not required */ }
    row.classList.add('dragging');

    const rowRect = row.getBoundingClientRect();
    const rowH = rowRect.height;
    const grabOffsetY = e.clientY - rowRect.top;
    const ghost = createGhost(row);

    // Captured once, at drag start: the shift preview is about visual
    // position (who slides up/down to open a gap), which is independent
    // of array index: a list can render in a different order than its
    // array (the layers panel lists top-of-stack first, so a *higher*
    // array index sits *above* in the DOM, the reverse of the file list).
    const orderedRows = Array.from(listEl.querySelectorAll('[data-reorder-index]'));
    const startPos = orderedRows.indexOf(row);

    let dropIndex = index;
    let outside = false;

    function resetShift() {
      orderedRows.forEach((el) => { if (el !== row) el.style.transform = ''; });
    }
    function applyShift(target) {
      resetShift();
      const targetPos = orderedRows.indexOf(target);
      orderedRows.forEach((el, pos) => {
        if (el === row) return;
        let shift = 0;
        if (startPos < targetPos && pos > startPos && pos <= targetPos) shift = -1;
        else if (startPos > targetPos && pos < startPos && pos >= targetPos) shift = 1;
        el.style.transition = 'transform 120ms ease';
        el.style.transform = shift ? `translateY(${shift * rowH}px)` : '';
      });
    }
    function clearDragOver() {
      document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    }

    function onMove(ev) {
      ghost.style.top = (ev.clientY - grabOffsetY) + 'px';

      const bounds = boundsEl.getBoundingClientRect();
      outside = ev.clientX < bounds.left || ev.clientX > bounds.right || ev.clientY < bounds.top || ev.clientY > bounds.bottom;
      row.classList.toggle('removing', outside && !!onRemove);
      ghost.classList.toggle('removing', outside && !!onRemove);
      if (outside) {
        clearDragOver();
        resetShift();
        dropIndex = index;
        return;
      }

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest('[data-reorder-index]');
      clearDragOver();
      if (target && target !== row && listEl.contains(target)) {
        target.classList.add('drag-over');
        dropIndex = Number(target.dataset.reorderIndex);
        applyShift(target);
      } else {
        dropIndex = index;
        resetShift();
      }
    }
    function onUp() {
      try { handle.releasePointerCapture(e.pointerId); } catch { /* wasn't captured */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      row.classList.remove('dragging', 'removing');
      clearDragOver();
      resetShift();
      ghost.remove();
      if (outside && onRemove) onRemove(index);
      else if (dropIndex !== index) onReorder(index, dropIndex);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function applyShiftPreview(items, fromIdx, toIdx, axis) {
  items.forEach((el, idx) => {
    if (idx === fromIdx) { el.style.opacity = '0.3'; return; }
    let shift = 0;
    if (fromIdx < toIdx && idx > fromIdx && idx <= toIdx) shift = -1;
    else if (fromIdx > toIdx && idx < fromIdx && idx >= toIdx) shift = 1;
    el.style.transition = 'transform 120ms ease';
    el.style.transform = shift ? `translate${axis === 'x' ? 'X' : 'Y'}(${shift * 100}%)` : '';
  });
}
function clearShiftPreview(items) {
  items.forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
}

// Native HTML5 drag-and-drop reorder for a horizontal or vertical strip of
// equal-size sibling elements (palette's chip row, timeline's frame strip).
// A different mechanism from makeReorderable above on purpose: that one
// exists specifically because native DnD is unreliable to trigger from a
// small handle; a whole chip/frame tile is a large, unambiguous drag
// target, so native DnD's other native perks (drag-image, OS-level cursor
// feedback) are worth having here instead.
//
// dragstart marks the source; dragover previews the live shift; the actual
// reorder commits on dragend rather than drop: a live shift-preview can
// move the dragged element's own siblings out from under the pointer, so
// whatever the browser resolves as the drop target at drop-time can be
// stale or missing a listener, while dragend always fires on the dragged
// element itself regardless. Call once per item in the strip; only one
// native drag can be in flight browser-wide at a time, so the bit of state
// that must be shared across every sibling's own dragover handler is a
// module-level singleton here, the same way slide-out.js tracks its one
// open popup.
//
// `getItems()` returns the current sibling elements in order: called
// fresh at drag start, since the caller's own list can change between
// drags. `axis`: 'x' for a horizontal strip, 'y' for vertical.
// `containerEl` + `onRemove`, given together: dragging an item out past
// `containerEl`'s bounds and releasing removes it instead of reordering
// (the caller's own `onRemove` decides whether that's currently allowed,
// e.g. never dropping below one remaining item: this helper doesn't know
// or care what "removed" means beyond calling it back).
let dragReorderState = null;

export function attachNativeDragReorder(itemEl, index, { getItems, axis = 'x', onReorder, containerEl, onRemove } = {}) {
  itemEl.draggable = true;

  function pointIsOutside(e) {
    if (!containerEl) return false;
    if (e.clientX === 0 && e.clientY === 0) return false; // 'drag' fires once with zeroed coords
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return !el || !containerEl.contains(el);
  }

  itemEl.addEventListener('dragstart', (e) => {
    dragReorderState = { fromIndex: index, hoverIndex: index, items: getItems() };
    itemEl.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(index));
  });

  // 'drag' fires continuously (unlike 'dragover', which only fires over
  // valid drop targets): the only way to flag "pulled outside the strip"
  // with a visible cue before release.
  if (containerEl && onRemove) {
    itemEl.addEventListener('drag', (e) => {
      if (!dragReorderState) return;
      itemEl.classList.toggle('removing', pointIsOutside(e));
    });
  }

  itemEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragReorderState || dragReorderState.fromIndex === index) return;
    dragReorderState.hoverIndex = index;
    applyShiftPreview(dragReorderState.items, dragReorderState.fromIndex, index, axis);
  });

  itemEl.addEventListener('dragend', (e) => {
    if (!dragReorderState) return;
    const { fromIndex, hoverIndex, items } = dragReorderState;
    dragReorderState = null;
    itemEl.classList.remove('dragging', 'removing');
    clearShiftPreview(items);
    if (containerEl && onRemove && pointIsOutside(e)) onRemove(fromIndex);
    else if (hoverIndex !== fromIndex) onReorder(fromIndex, hoverIndex);
  });
  itemEl.addEventListener('drop', (e) => e.preventDefault());
}
