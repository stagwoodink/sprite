import { PRESETS, DEFAULT_PRESET, MAX_CHIPS } from './palettes-presets.js';
import { openColorPicker } from './color-picker.js';
import { positionSlideOut } from './slide-out.js';

// Live drag-reorder preview: chips between the dragged one and the hover
// target slide aside by one chip-width to open a gap, without touching the
// real array/DOM order until drop actually happens.
function previewShift(row, from, target) {
  const chips = Array.from(row.querySelectorAll('.chip'));
  chips.forEach((chip, idx) => {
    if (idx === from) { chip.style.opacity = '0.3'; return; }
    let shift = 0;
    if (from < target && idx > from && idx <= target) shift = -1;
    else if (from > target && idx < from && idx >= target) shift = 1;
    chip.style.transition = 'transform 120ms ease';
    chip.style.transform = shift ? `translateX(${shift * 100}%)` : '';
  });
}

function clearPreviewShift(row) {
  row.querySelectorAll('.chip').forEach((chip) => {
    chip.style.transform = '';
    chip.style.opacity = '';
  });
}

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const clampDark = (v) => Math.max(24, Math.round(v * (1 - amount))); // clamped off pure black (§1.2/§1.3)
  return '#' + [r, g, b].map((v) => clampDark(v).toString(16).padStart(2, '0')).join('');
}

// Slides up from the hamburger (palette docks to the bottom edge) — lists
// the built-in presets plus a "+ New Palette" to start a blank one.
function openPresetPanel(anchor, onLoadPreset, onNewPalette) {
  document.querySelectorAll('.palette-preset-panel').forEach((el) => el.remove());
  const panel = document.createElement('div');
  panel.className = 'palette-preset-panel slide-out-bar';

  Object.entries(PRESETS).forEach(([key, preset]) => {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.addEventListener('click', () => { onLoadPreset(key); panel.remove(); });
    panel.append(btn);
  });

  const newBtn = document.createElement('button');
  newBtn.className = 'new-palette-btn';
  newBtn.textContent = '+ New Palette';
  newBtn.addEventListener('click', () => { onNewPalette(); panel.remove(); });
  panel.append(newBtn);

  const fromTransform = positionSlideOut(panel, anchor, 'up');
  panel.style.transform = fromTransform;
  panel.style.opacity = '0';
  document.body.append(panel);
  requestAnimationFrame(() => {
    panel.style.transform = 'translate(0, 0)';
    panel.style.opacity = '1';
  });

  setTimeout(() => window.addEventListener('pointerdown', function onOutside(e) {
    if (!panel.contains(e.target) && e.target !== anchor) {
      panel.remove();
      window.removeEventListener('pointerdown', onOutside);
    }
  }), 0);
}

// Above this many chips, the row stops stretching chips to fill the bar
// and switches to a fixed-size scrollable window instead — 16 full chips
// visible plus at least a quarter-chip peek on each edge, as a "there's
// more this way" affordance, scrolled with the wheel.
const MAX_VISIBLE_CHIPS = 16;
const PEEK_FRACTION = 0.25; // per side

// Palette belongs to the Project (§4, §7.2). `initial` seeds it from a
// loaded/created Project's own palette object; the returned `state` is that
// same live object (mutated in place) so main.js can persist it directly.
export function createPalette(container, initial, onChange, onSelectColor) {
  const preset = PRESETS[DEFAULT_PRESET];
  const state = initial && initial.chips && initial.chips.length ? initial : {
    chips: [...preset.chips],
    primary: preset.chips[0],
    secondary: preset.chips[1] || preset.chips[0],
  };
  let scrollPx = 0; // pixel offset into the chip track, only used above MAX_VISIBLE_CHIPS
  let draggingIndex = null; // chip index currently being dragged, for the live reorder preview
  let dragHoverIndex = null; // last chip index dragged over — the actual drop target

  function loadPreset(key) {
    const p = PRESETS[key];
    state.chips = [...p.chips];
    state.primary = state.chips[0];
    state.secondary = state.chips[1] || state.chips[0];
    render();
    onChange(state);
  }

  function newPalette() {
    state.chips = ['#FFFFFF'];
    state.primary = '#FFFFFF';
    state.secondary = '#FFFFFF';
    render();
    onChange(state);
  }

  function render() {
    container.innerHTML = '';

    const hamburger = document.createElement('button');
    hamburger.className = 'palette-hamburger';
    hamburger.textContent = '☰';
    hamburger.title = 'Palettes';
    hamburger.addEventListener('click', () => openPresetPanel(hamburger, loadPreset, newPalette));
    container.append(hamburger);

    const viewport = document.createElement('div');
    viewport.className = 'chip-viewport';
    const row = document.createElement('div');
    row.className = 'chip-row';
    viewport.append(row);

    state.chips.forEach((hex, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.setProperty('--chip-color', hex);
      chip.style.setProperty('--chip-shadow', darken(hex, 0.45));
      chip.draggable = true;

      const face = document.createElement('div');
      face.className = 'chip-face';
      const shadow = document.createElement('div');
      shadow.className = 'chip-shadow';
      chip.append(face, shadow);

      // Hex code reveals above the chip on hover — click it to open the
      // color picker (one seamless interaction, not a right-click menu).
      const hexLabel = document.createElement('button');
      hexLabel.className = 'chip-hex-label';
      hexLabel.textContent = hex;
      hexLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker(chip, state.chips[i], (newHex) => {
          if (state.chips[i] === state.primary) state.primary = newHex;
          if (state.chips[i] === state.secondary) state.secondary = newHex;
          state.chips[i] = newHex;
          chip.style.setProperty('--chip-color', newHex);
          chip.style.setProperty('--chip-shadow', darken(newHex, 0.45));
          hexLabel.textContent = newHex;
          onChange(state);
        });
      });
      chip.append(hexLabel);

      chip.addEventListener('mousedown', () => chip.classList.add('pressed'));
      chip.addEventListener('mouseup', () => chip.classList.remove('pressed'));
      chip.addEventListener('mouseleave', () => chip.classList.remove('pressed'));

      // Left-click = primary. Shift+click = select every pixel of this
      // color on the active layer. Right-click = secondary, directly.
      chip.addEventListener('click', (e) => {
        if (e.shiftKey) {
          onSelectColor(hex);
          return;
        }
        state.primary = hex;
        onChange(state);
      });

      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        state.secondary = hex;
        onChange(state);
      });

      chip.addEventListener('dragstart', (e) => {
        draggingIndex = i;
        chip.classList.add('dragging');
        e.dataTransfer.setData('text/plain', String(i));
      });
      // 'drag' fires continuously (unlike 'dragover', which only fires over
      // valid drop targets) — use it to flag when the chip has been pulled
      // outside the palette, so removal has a visible cue before release.
      chip.addEventListener('drag', (e) => {
        if (e.clientX === 0 && e.clientY === 0) return; // fires once with zeroed coords
        const outside = !document.elementFromPoint(e.clientX, e.clientY)?.closest('.chip-viewport');
        chip.classList.toggle('removing', outside && state.chips.length > 1);
      });
      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggingIndex === null || draggingIndex === i) return;
        dragHoverIndex = i;
        previewShift(row, draggingIndex, i);
      });
      // The reorder happens here, not on 'drop': previewShift's transform
      // can visually move a chip out from under the pointer, so whatever
      // element the browser resolves as the drop target can be wrong (or
      // have no listener at all). dragend always fires on the dragged
      // element itself regardless, so it's the reliable place to commit
      // using the last hovered index tracked above.
      chip.addEventListener('dragend', (e) => {
        const droppedOutside = !document.elementFromPoint(e.clientX, e.clientY)?.closest('.chip-viewport');
        if (droppedOutside && state.chips.length > 1) {
          // Drag a chip off the palette entirely to remove it.
          state.chips.splice(draggingIndex, 1);
          if (state.primary === hex) state.primary = state.chips[0];
          if (state.secondary === hex) state.secondary = state.chips[0];
        } else if (draggingIndex !== null && dragHoverIndex !== null && dragHoverIndex !== draggingIndex) {
          const [moved] = state.chips.splice(draggingIndex, 1);
          state.chips.splice(dragHoverIndex, 0, moved);
        }
        draggingIndex = null;
        dragHoverIndex = null;
        clearPreviewShift(row);
        render();
        onChange(state);
      });
      chip.addEventListener('drop', (e) => e.preventDefault());

      row.append(chip);
    });

    container.append(viewport);

    if (state.chips.length < MAX_CHIPS) {
      const add = document.createElement('button');
      add.className = 'chip-add';
      add.textContent = '+';
      add.title = 'Add color';
      add.addEventListener('click', () => {
        state.chips.push('#FFFFFF');
        scrollPx = Infinity; // clamped to the new max in layoutChips — scrolls the new chip into view
        render();
        onChange(state);
      });
      container.append(add);
    }

    layoutChips(viewport, row);
  }

  // <=16 chips: stretch evenly to fill the bar (no scrolling needed at all).
  // >16 chips: fixed-width slots sized for 16 full + 2 half-peeks (17
  // chip-widths across the viewport), scrolled by wheel — never native
  // overflow/scrollbars, and chips never spill past the bar's own edge.
  function layoutChips(viewport, row) {
    const count = state.chips.length;
    if (count <= MAX_VISIBLE_CHIPS) {
      row.style.width = '100%';
      row.querySelectorAll('.chip').forEach((chip) => { chip.style.flex = '1 1 0'; });
      row.style.transform = 'none';
      viewport.onwheel = null;
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const chipWidth = viewportWidth / (MAX_VISIBLE_CHIPS + 2 * PEEK_FRACTION);
    const trackWidth = chipWidth * count;
    row.style.width = trackWidth + 'px';
    row.querySelectorAll('.chip').forEach((chip) => { chip.style.flex = `0 0 ${chipWidth}px`; });

    const maxScroll = Math.max(0, trackWidth - viewportWidth);
    scrollPx = Math.max(0, Math.min(scrollPx, maxScroll));
    row.style.transform = `translateX(${-scrollPx}px)`;

    viewport.onwheel = (e) => {
      e.preventDefault();
      scrollPx = Math.max(0, Math.min(maxScroll, scrollPx + (e.deltaY || e.deltaX)));
      row.style.transform = `translateX(${-scrollPx}px)`;
    };
  }

  render();

  return {
    getPrimary: () => state.primary,
    getSecondary: () => state.secondary,
    setPrimaryByIndex(i) {
      if (state.chips[i]) { state.primary = state.chips[i]; onChange(state); }
    },
    setSecondaryByIndex(i) {
      if (state.chips[i]) { state.secondary = state.chips[i]; onChange(state); }
    },
    loadPreset,
    // Eyedropper (§8, "I" hold): sets primary/secondary from a sampled
    // color, adding it as a new chip first if the palette doesn't have it.
    pickColor(hex, isSecondary) {
      const upper = hex.toUpperCase();
      if (!state.chips.some((c) => c.toUpperCase() === upper) && state.chips.length < MAX_CHIPS) {
        state.chips.push(upper);
        render();
      }
      if (isSecondary) state.secondary = upper; else state.primary = upper;
      onChange(state);
    },
  };
}
