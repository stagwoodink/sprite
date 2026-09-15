// HSL-square + hue-slider + hex-field popup (design-doc §7.2, ui-design-system
// §1: 0px corners, flat, dark chrome). Opened on right-click of a chip.
const SIZE = 120;

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = 60 * (((g - b) / d) % 6); break;
      case g: h = 60 * ((b - r) / d + 2); break;
      case b: h = 60 * ((r - g) / d + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to255 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to255(r) + to255(g) + to255(b);
}

export function openColorPicker(anchorEl, initialHex, onChange) {
  document.querySelectorAll('.color-picker-popup').forEach((el) => el.remove());

  let { h, s, l } = hexToHsl(initialHex);

  const popup = document.createElement('div');
  popup.className = 'color-picker-popup';

  const square = document.createElement('canvas');
  square.width = SIZE;
  square.height = SIZE;
  square.className = 'picker-square';

  const hue = document.createElement('input');
  hue.type = 'range';
  hue.min = 0;
  hue.max = 360;
  hue.value = h;
  hue.className = 'picker-hue';

  const hexField = document.createElement('input');
  hexField.type = 'text';
  hexField.className = 'picker-hex';
  hexField.value = initialHex;

  popup.append(square, hue, hexField);
  document.body.append(popup);

  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';
  popup.style.top = rect.bottom + 4 + 'px';

  const sctx = square.getContext('2d');

  function paintSquare() {
    for (let y = 0; y < SIZE; y++) {
      const lightness = 1 - y / SIZE;
      const grad = sctx.createLinearGradient(0, 0, SIZE, 0);
      grad.addColorStop(0, hslToHex(h, 0, lightness));
      grad.addColorStop(1, hslToHex(h, 1, lightness));
      sctx.fillStyle = grad;
      sctx.fillRect(0, y, SIZE, 1);
    }
  }

  function commit(hex) {
    hexField.value = hex;
    onChange(hex);
  }

  paintSquare();

  square.addEventListener('pointerdown', (e) => {
    square.setPointerCapture(e.pointerId);
    const drag = (ev) => {
      const r = square.getBoundingClientRect();
      s = Math.max(0, Math.min(1, (ev.clientX - r.left) / SIZE));
      l = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / SIZE));
      commit(hslToHex(h, s, l));
    };
    drag(e);
    const move = (ev) => drag(ev);
    const up = () => {
      square.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    square.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  hue.addEventListener('input', () => {
    h = Number(hue.value);
    paintSquare();
    commit(hslToHex(h, s, l));
  });

  hexField.addEventListener('change', () => {
    const v = hexField.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      ({ h, s, l } = hexToHsl(v));
      hue.value = h;
      paintSquare();
      commit(v);
    }
  });

  function onOutsideClick(e) {
    if (!popup.contains(e.target) && e.target !== anchorEl) {
      popup.remove();
      window.removeEventListener('pointerdown', onOutsideClick, true);
    }
  }
  // Deferred so the opening right-click itself doesn't immediately close it.
  setTimeout(() => window.addEventListener('pointerdown', onOutsideClick, true), 0);

  return popup;
}
