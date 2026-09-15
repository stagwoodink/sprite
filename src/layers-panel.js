// Layers panel (design-doc §11, ui-design-system §4).
import { paintThumbnail } from './thumbnail.js';

const THUMB_H = 40;

export function renderLayersPanel(container, file, callbacks) {
  container.innerHTML = '';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn panel-add-btn';
  const face = document.createElement('div');
  face.className = 'btn-face';
  face.textContent = '+';
  const shadow = document.createElement('div');
  shadow.className = 'btn-shadow';
  addBtn.append(face, shadow);
  addBtn.addEventListener('click', () => callbacks.onAddLayer());
  container.append(addBtn);

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
    thumbWrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      callbacks.onOpenOpacity(i, thumbWrap);
    });

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
    row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
    row.addEventListener('dragover', (e) => e.preventDefault());
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      callbacks.onReorder(Number(e.dataTransfer.getData('text/plain')), i);
    });

    container.append(row);
  }
}
