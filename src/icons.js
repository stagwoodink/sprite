// The UI's icons, drawn as pixel bitmaps in inline SVG rather than typed as
// characters. A character comes from whichever system font the browser falls
// back to (m3x6 has none of these), so its size and vertical position differ
// per machine and never sit exactly centred. A bitmap is the same everywhere:
// each icon pixel is two device pixels (style.css --icon-px), so an icon is
// always an even number of device pixels across and centres on a whole pixel.
const BITMAPS = {
  '+': ['..#..', '..#..', '#####', '..#..', '..#..'],
  '✕': ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '⋮': ['#', '.', '#', '.', '#'],
  '⋯': ['#.#.#'],
  '☰': ['#####', '.....', '#####', '.....', '#####'],
  '↓': ['..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '◈': ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'],
  '⤢': ['..###', '...##', '.#.#.', '##...', '###..'],
  '▸': ['#..', '.#.', '..#', '.#.', '#..'],
  '▾': ['#...#', '.#.#.', '..#..'],
  '⌕': ['.##..', '#..#.', '#..#.', '.###.', '....#'],
};

/** True if `name` is one of the drawn icons (the character it replaces is its name). */
export const hasIcon = (name) => name in BITMAPS;

const NS = 'http://www.w3.org/2000/svg';

/** A new `<svg>` for the icon named `name`, filled with `currentColor`. */
export function iconElement(name) {
  const rows = BITMAPS[name];
  const w = rows[0].length, h = rows.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.style.width = `calc(var(--icon-px) * ${w})`;
  svg.style.height = `calc(var(--icon-px) * ${h})`;
  const path = document.createElementNS(NS, 'path');
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w;) {
      if (row[x] !== '#') { x++; continue; }
      let end = x + 1;
      while (end < w && row[end] === '#') end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Replaces `el`'s content with the icon named `name`. */
export function setIcon(el, name) {
  el.replaceChildren(iconElement(name));
}
