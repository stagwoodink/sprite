import { PRESETS, DEFAULT_PRESET, MAX_CHIPS } from './palettes-presets.js';
import { openColorPicker } from './color-picker.js';

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const clampDark = (v) => Math.max(24, Math.round(v * (1 - amount))); // clamped off pure black (§1.2/§1.3)
  return '#' + [r, g, b].map((v) => clampDark(v).toString(16).padStart(2, '0')).join('');
}

// Palette belongs to the Project (§4, §7.2). `initial` seeds it from a
// loaded/created Project's own palette object; the returned `state` is that
// same live object (mutated in place) so main.js can persist it directly.
export function createPalette(container, initial, onChange) {
  const preset = PRESETS[DEFAULT_PRESET];
  const state = initial && initial.chips && initial.chips.length ? initial : {
    chips: [...preset.chips],
    primary: preset.chips[0],
    secondary: preset.chips[1] || preset.chips[0],
  };

  function render() {
    container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'chip-row';

    state.chips.forEach((hex, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.setProperty('--chip-color', hex);
      chip.style.setProperty('--chip-shadow', darken(hex, 0.45));
      chip.title = hex;
      chip.draggable = true;

      const face = document.createElement('div');
      face.className = 'chip-face';
      const shadow = document.createElement('div');
      shadow.className = 'chip-shadow';
      chip.append(face, shadow);

      chip.addEventListener('mousedown', () => chip.classList.add('pressed'));
      chip.addEventListener('mouseup', () => chip.classList.remove('pressed'));
      chip.addEventListener('mouseleave', () => chip.classList.remove('pressed'));

      chip.addEventListener('click', () => {
        state.primary = hex;
        onChange(state);
      });

      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.altKey) {
          state.secondary = hex;
          onChange(state);
          return;
        }
        openColorPicker(chip, hex, (newHex) => {
          if (state.chips[i] === state.primary) state.primary = newHex;
          if (state.chips[i] === state.secondary) state.secondary = newHex;
          state.chips[i] = newHex;
          chip.style.setProperty('--chip-color', newHex);
          chip.style.setProperty('--chip-shadow', darken(newHex, 0.45));
          chip.title = newHex;
          onChange(state);
        });
      });

      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
      });
      chip.addEventListener('dragover', (e) => e.preventDefault());
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        const [moved] = state.chips.splice(from, 1);
        state.chips.splice(i, 0, moved);
        render();
        onChange(state);
      });

      row.append(chip);
    });

    if (state.chips.length < MAX_CHIPS) {
      const add = document.createElement('button');
      add.className = 'chip-add';
      add.textContent = '+';
      add.title = 'Add color';
      add.addEventListener('click', () => {
        state.chips.push('#FFFFFF');
        render();
        onChange(state);
      });
      row.append(add);
    }

    container.append(row);
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
  };
}
