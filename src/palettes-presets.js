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
  stagwood: {
    // Dark red, red, almost-white, almost-black — the brand's 4 colors
    // (CONTEXT.md's Palette Preset definition). Red is the exact accent
    // sampled from spec/stagwood.png; the other three reuse the app's own
    // existing tokens for the same roles rather than inventing new hexes.
    name: 'Stagwood',
    chips: ['#7A0C18', '#BE1425', '#F2F2F0', '#121214'],
  },
};

export const DEFAULT_PRESET = 'pico8';
export const MAX_CHIPS = 32;
