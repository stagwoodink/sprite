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
    name: 'Game Boy DMG',
    chips: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'],
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
