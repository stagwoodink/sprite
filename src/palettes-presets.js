// Built-in palette presets (design-doc §7.1). Loadable into a Project's
// Palette slot; user-editable afterward, distinct from these fixed presets.
export const PRESETS = {
  pico8: {
    name: 'PICO-8',
    chips: [
      '#000000', '#1D2B53', '#7E2553', '#008751',
      '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
      '#FF004D', '#FFA300', '#FFEC27', '#00E436',
      '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
    ],
  },
  dmg: {
    // Sampled directly from spec/gameboy-color.png (user-provided reference),
    // darkest to lightest, replacing the generic monochrome-green guess.
    name: 'Game Boy DMG',
    chips: ['#01121C', '#20594A', '#6DA56E', '#D8F7D8'],
  },
  default: {
    name: 'Default',
    chips: [
      '#000000', '#FFFFFF', '#7F7F7F', '#C3C3C3',
      '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
      '#0000FF', '#7F00FF', '#FF00FF', '#00FFFF',
      '#7F3300', '#FFC0CB', '#808000', '#003366',
    ],
  },
};

export const DEFAULT_PRESET = 'default';
export const MAX_CHIPS = 32;
