// Session-wide drawing modifiers shared by the mouse path (input.js), the
// keyboard path (main.js) and the renderer's overlays. Mutated in place by
// the toggles in main.js, which also mirror them into uiPrefs.
// symmetry: 'off' | 'h' (mirror left-right) | 'v' (mirror top-bottom) | 'both'
export const paintOptions = { dither: false, symmetry: 'off' };
export const SYMMETRY_CYCLE = ['off', 'h', 'v', 'both'];
