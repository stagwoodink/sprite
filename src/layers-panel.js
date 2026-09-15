// Layers panel (design-doc §11, ui-design-system §4).
import { paintThumbnail } from './thumbnail.js';

const THUMB_H = 40;

export function renderLayersPanel(container, file, callbacks) {
  container.innerHTML = '';

  // Anchored to the bottom of the panel, not the top — a stack of layers
  // reads more naturally sitting at the floor than floating at the ceiling.
  const stack = document.createElement('div');
  stack.className = 'layer-stack';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn panel-add-btn';
  const face = document.createElement('div');
  face.className = 'btn-face';
  face.textContent = '+';
  const shadow = document.createElement('div');
  shadow.className = 'btn-shadow';
  addBtn.append(face, shadow);
  addBtn.addEventListener('click', () => callbacks.onAddLayer());
  stack.append(addBtn);

  // Top of the stack is drawn first (§11): last layer in the array renders
  // on top, so the panel lists layers back-to-front, topmost first.
  for (let i = file.layers.length - 1; i >= 0; i--) {
    const layer = file.layers[i];
    const row = document.createElement('div');
    row.className = 'layer-row' + (i === file.activeLayerIndex ? ' active' : '');
    row.draggable = true;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'layer-thumb';
    const canvasEl = document.createElement('canvas');
    paintThumbnail(canvasEl, file, file.frames[file.activeFrameIndex].layerPixels[i], THUMB_H, { dim: !layer.visible });
    const eyePip = document.createElement('div');
    eyePip.className = 'eye-pip' + (layer.visible ? '' : ' hidden-indicator');
    thumbWrap.append(canvasEl, eyePip);
    thumbWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onToggleVisible(i);
    });

    // Hover-revealed vertical slider, OVERLAID on the thumbnail's left edge
    // (not pushing it over) — drag the pip up/down to change opacity, no
    // right-click/menu needed. A % readout appears to its left while dragging.
    const opacitySlider = document.createElement('div');
    opacitySlider.className = 'opacity-slider';
    opacitySlider.title = 'Drag to change layer opacity';
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
      opacityReadout.style.left = r.left - opacityReadout.offsetWidth - 4 + 'px';
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

    const label = document.createElement('div');
    label.className = 'layer-label';
    label.textContent = layer.name;

    const del = document.createElement('div');
    del.className = 'layer-delete';
    del.innerHTML = '<span class="delete-pip"></span>';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onDelete(i);
    });

    row.append(thumbWrap, label, del);
    row.addEventListener('click', () => callbacks.onSelect(i));
    // Only the row's own "tile" area (not the thumbnail, opacity slider, or
    // delete button) starts a reorder drag — those have their own
    // click/pointer interactions that a native drag would otherwise steal.
    row.addEventListener('dragstart', (e) => {
      if (e.target.closest('.layer-thumb, .opacity-slider, .layer-delete')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', String(i));
    });
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      callbacks.onReorder(Number(e.dataTransfer.getData('text/plain')), i);
    });

    stack.append(row);
  }

  container.append(stack);
}
