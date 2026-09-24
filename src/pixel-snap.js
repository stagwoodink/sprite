// The pixel font draws each font pixel 1/16 em wide (measured: glyph
// pixel = 64 of 1024 units), so it is only crisp at a whole multiple of 16
// *device* pixels; every other size, including a CSS 16px on a screen whose
// devicePixelRatio is 1.015625 (browser zoom, fractional OS scaling), is
// resampled and blurred. This resolves each font token to the nearest multiple
// of 16 device pixels and writes it back in CSS pixels, so the em-based grid
// (1 block = 1.5em) also lands on whole device pixels.
const CELL = 16;
const TOKENS = { '--font-small': 16, '--font-body': 16, '--font-title': 32, '--font-header': 32 }; // the stylesheet's sizes, at dpr 1

/** CSS px size for `base` CSS px that is a whole number of 16px cells on a screen with this pixel ratio. */
export function snapFontSize(base, dpr) {
  const cells = Math.max(1, Math.round(base * dpr / CELL));
  return cells * CELL / dpr;
}

/** CSS px length rounded to whole device pixels (never below one, unless it is zero). Keeps sign. */
export function snapLength(base, dpr) {
  if (base === 0) return 0;
  return Math.sign(base) * Math.max(1, Math.round(Math.abs(base) * dpr)) / dpr;
}

// Borders, outlines and the spacing scale, so hairlines and gaps are whole
// device pixels too: read once from the stylesheet's :root, at dpr 1.
const LENGTH_TOKEN = /^--(space-\d+|border-width|stroke-strong|outline-offset|meter-h)$/;
let lengths = null;
function lengthTokens() {
  if (lengths) return lengths;
  lengths = {};
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText !== ':root') continue;
      for (const name of rule.style) {
        const px = /^(-?\d+(?:\.\d+)?)px$/.exec(rule.style.getPropertyValue(name).trim());
        if (LENGTH_TOKEN.test(name) && px) lengths[name] = Number(px[1]);
      }
    }
  }
  return lengths;
}

export function applyPixelSnap(root = document.documentElement) {
  const dpr = window.devicePixelRatio || 1;
  for (const [name, base] of Object.entries(TOKENS)) root.style.setProperty(name, snapFontSize(base, dpr) + 'px');
  for (const [name, base] of Object.entries(lengthTokens())) root.style.setProperty(name, snapLength(base, dpr) + 'px');
}

// Browser zoom and moving between monitors change the ratio without always firing resize.
export function watchPixelSnap() {
  applyPixelSnap();
  const listen = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { applyPixelSnap(); listen(); }, { once: true });
  listen();
}
