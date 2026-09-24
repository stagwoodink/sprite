// Layers panel (design-doc §11, ui-design-system §4).
import { paintThumbnail } from './thumbnail.js';
import { BLOCK } from './grid.js';
import { button, makeReorderable, startInlineEdit } from './ui.js';
import { layerOrder, compositeLayerAt } from './sprite-file.js';
import { visibleOrder } from './ordering.js';
import { referencesOf, isResolved } from './references.js';
import { openSlideOut } from './slide-out.js';

const THUMB_H = BLOCK * 2; // layer tiles are 2 blocks tall

// Layer grouping is drag-and-drop only: a layer becomes a group's member
// by being positioned directly beneath its header (§ ordering.js), same as
// file collections. No separate "move to group" control.
// Painted thumbnail canvases from the last render, keyed by layer buffer and
// reused while the buffer's version, visibility and size are unchanged: the
// panel rebuilds its rows on every edit, but only the edited layer's pixels
// need repainting. Rebuilt each render from just the rows shown, so it can't
// outgrow the layer count.
let thumbCache = new Map(); // buffer -> { key, canvasEl }

export function renderLayersPanel(container, file, callbacks, focusedGroupId, layerSelection, multiSelection, activeReferenceId) {
  const scrollTop = container.scrollTop; // a rebuild would otherwise snap the panel back to the top
  const nextThumbs = new Map();
  container.innerHTML = '';
  const selLo = layerSelection ? Math.min(layerSelection.anchor, layerSelection.to) : -1;
  const selHi = layerSelection ? Math.max(layerSelection.anchor, layerSelection.to) : -1;

  // Anchored to the bottom of the panel, not the top: a stack of layers
  // reads more naturally sitting at the floor than floating at the ceiling.
  const stack = document.createElement('div');
  stack.className = 'layer-stack';

  // One "+" at the foot of the stack. Click opens a menu of everything you can
  // add; right-click adds a group and Alt+click a reference straight away.
  const addBtn = button({
    glyph: '+', fill: true, className: 'panel-add-btn', title: 'New layer, group or reference',
    onClick: (e) => {
      if (e.altKey) { callbacks.onImportReference(); return; }
      openSlideOut(addBtn, [
        { label: 'Layer', onClick: () => callbacks.onAddLayer() },
        { label: 'Group', onClick: () => callbacks.onAddGroup() },
        { label: 'Reference', onClick: () => callbacks.onImportReference() },
      ], { side: 'left' });
    },
    onContextMenu: (e) => { e.preventDefault(); callbacks.onAddGroup(); },
  });

  function buildLayerRow(layer, i, pos, nested) {
    const row = document.createElement('div');
    const multiSelected = !!(multiSelection && multiSelection.has(i));
    row.className = 'layer-row tile tile--tall reveal-on-hover' + (nested ? ' layer-row--nested' : '') + ((multiSelected || i === file.activeLayerIndex) ? ' selected' : '') + (pos >= selLo && pos <= selHi ? ' layer-row--selected' : '');
    row.dataset.layerIndex = i; // § multi-select menu anchor lookup

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'layer-thumb';
    const buf = file.frames[file.activeFrameIndex].layerPixels[i];
    const thumbKey = `${buf.v | 0}|${layer.visible}|${file.visibleWidth}x${file.visibleHeight}x${file.canvasWidth}`;
    let thumb = thumbCache.get(buf);
    if (!thumb || thumb.key !== thumbKey) {
      const canvasEl = thumb ? thumb.canvasEl : document.createElement('canvas');
      paintThumbnail(canvasEl, file, compositeLayerAt(file, i, file.activeFrameIndex), THUMB_H, { dim: !layer.visible });
      thumb = { key: thumbKey, canvasEl };
    }
    nextThumbs.set(buf, thumb);
    const canvasEl = thumb.canvasEl;
    const eyePip = document.createElement('div');
    eyePip.className = 'eye-pip' + (layer.visible ? '' : ' hidden-indicator');
    thumbWrap.append(canvasEl, eyePip);
    thumbWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      // Clicking the thumbnail of a layer that's part of the current
      // multi-selection toggles every selected layer together, not just
      // this one.
      if (multiSelected) callbacks.onToggleVisibleSelection();
      else callbacks.onToggleVisible(i);
    });

    // Hover-revealed vertical slider, OVERLAID on the thumbnail's right edge
    // (not pushing it over): drag the pip up/down to change opacity, no
    // right-click/menu needed. A % readout appears to its left while dragging.
    const opacitySlider = document.createElement('div');
    opacitySlider.className = 'opacity-slider';
    const opacityFill = document.createElement('div');
    opacityFill.className = 'opacity-slider-fill';
    const opacityPip = document.createElement('div');
    opacityPip.className = 'opacity-slider-pip';
    const opacityReadout = document.createElement('div');
    opacityReadout.className = 'opacity-readout';
    opacitySlider.append(opacityFill, opacityPip);

    function setOpacityFromEvent(e) {
      const r = opacitySlider.getBoundingClientRect();
      const value = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      const pct = Math.round(value * 100);
      opacityFill.style.height = pct + '%';
      opacityPip.style.bottom = pct + '%';
      opacityReadout.textContent = pct + '%';
      opacityReadout.style.left = r.right + 4 + 'px';
      opacityReadout.style.top = e.clientY - opacityReadout.offsetHeight / 2 + 'px';
      callbacks.onOpacityChange(i, value);
    }
    opacityFill.style.height = Math.round(layer.opacity * 100) + '%';
    opacityPip.style.bottom = Math.round(layer.opacity * 100) + '%';
    opacitySlider.draggable = false;
    opacitySlider.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      opacitySlider.setPointerCapture(e.pointerId);
      document.body.append(opacityReadout);
      setOpacityFromEvent(e);
      const move = (ev) => setOpacityFromEvent(ev);
      const up = () => {
        opacitySlider.removeEventListener('pointermove', move);
        opacitySlider.removeEventListener('pointerup', up);
        opacityReadout.remove();
        callbacks.onOpacityCommit();
      };
      opacitySlider.addEventListener('pointermove', move);
      opacitySlider.addEventListener('pointerup', up);
    });
    thumbWrap.append(opacitySlider);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⋮';

    const label = document.createElement('div');
    label.className = 'layer-label';
    label.textContent = layer.name;
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(label, layer.name, (v) => { if (v) { layer.name = v; callbacks.onRename(); } });
    });

    const del = button({
      glyph: '✕', icon: true, className: 'btn--reveal', title: 'Delete layer',
      onClick: (e) => { e.stopPropagation(); callbacks.onDelete(i); },
    });

    row.append(thumbWrap, handle, label, del);
    row.addEventListener('click', (e) => {
      // Shift/Alt-click build a multi-layer selection instead of switching
      // the active layer: same pattern as the file list's rows.
      if (e.shiftKey) { callbacks.onShiftSelectLayer(i); return; }
      if (e.altKey) { callbacks.onAltSelectLayer(i); return; }
      // Same no-op guard as the file list: onSelect re-renders this
      // panel, which was destroying `label` mid-double-click.
      if (i === file.activeLayerIndex && !multiSelection) return;
      callbacks.onSelect(i);
    });
    makeReorderable(handle, row, pos, {
      listEl: stack,
      boundsEl: container,
      onReorder: (from, to) => callbacks.onReorder(from, to),
      onRemove: () => callbacks.onDelete(i),
    });

    return row;
  }

  function buildGroupHeader(group, pos) {
    const row = document.createElement('div');
    row.className = 'layer-group-header tile reveal-on-hover' + (group.id === focusedGroupId ? ' selected' : '') + (pos >= selLo && pos <= selHi ? ' layer-row--selected' : '');
    row.dataset.groupId = group.id;

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⋮';
    makeReorderable(handle, row, pos, {
      listEl: stack,
      boundsEl: container,
      onReorder: (from, to) => callbacks.onReorder(from, to),
    });

    const eyePip = document.createElement('div');
    eyePip.className = 'eye-pip standalone' + (group.visible ? '' : ' hidden-indicator');
    eyePip.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onToggleGroupVisible(group.id); });

    const arrow = document.createElement('span');
    arrow.className = 'fold-arrow';
    arrow.textContent = group.collapsed ? '▸' : '▾';
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      group.collapsed = !group.collapsed;
      callbacks.onChange();
    });

    const label = document.createElement('div');
    label.className = 'layer-label';
    label.textContent = group.name;
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(label, group.name, (v) => { if (v) { group.name = v; callbacks.onRename(); } });
    });

    const deleteBtn = button({
      glyph: '✕', icon: true, className: 'btn--reveal', title: 'Delete group (layers move to the first group)',
      onClick: (e) => { e.stopPropagation(); callbacks.onDeleteGroup(group.id); },
    });

    row.append(handle, eyePip, arrow, label, deleteBtn);
    return row;
  }

  // Ascending order = top-to-bottom in the panel (§ ordering.js): the
  // reverse of `file.layers`' own bottom-to-top compositing order, so this
  // reads front-to-back same as before, just off the derived combined view
  // instead of iterating the raw array backwards.
  for (const entry of visibleOrder(layerOrder(file))) {
    if (entry.isHeader) {
      stack.append(buildGroupHeader(entry.item, entry.pos));
    } else {
      const i = file.layers.indexOf(entry.item);
      stack.append(buildLayerRow(entry.item, i, entry.pos, entry.item.groupId != null));
    }
  }

  stack.append(addBtn);
  const references = buildReferenceSection();
  if (references) container.append(references);
  container.append(stack);
  container.scrollTop = scrollTop;
  thumbCache = nextThumbs;

  // Reference images (references.js) sit apart from the layer stack: they
  // aren't layers, so they can't be selected, painted on, or exported:
  // there's simply nothing here to select. A row's ⤢ (or `:`) flips it
  // between fit-to-canvas and full size off to the right.
  function buildReferenceSection() {
    if (!referencesOf(file).length) return null;
    const section = document.createElement('div');
    section.className = 'reference-section';
    const header = document.createElement('div');
    header.className = 'layer-group-header tile';
    const title = document.createElement('div');
    title.className = 'layer-label';
    title.textContent = 'Reference';
    header.append(title);

    section.append(header);
    for (const ref of referencesOf(file)) {
      const row = document.createElement('div');
      row.className = 'layer-row tile reveal-on-hover' + (ref.id === activeReferenceId ? ' selected' : '');
      const label = document.createElement('div');
      label.className = 'layer-label';
      label.textContent = isResolved(ref) ? ref.name : `${ref.name} (click to relink)`;
      row.append(
        label,
        button({ glyph: '⤢', icon: true, className: 'btn--reveal', title: 'Fit to canvas / full size (:)', onClick: (e) => { e.stopPropagation(); callbacks.onToggleReferenceMode(ref.id); } }),
        button({ glyph: '✕', icon: true, className: 'btn--reveal', title: 'Remove reference', onClick: (e) => { e.stopPropagation(); callbacks.onRemoveReference(ref.id); } }),
      );
      row.addEventListener('click', () => callbacks.onSelectReference(ref.id));
      section.append(row);
    }
    return section;
  }
}
