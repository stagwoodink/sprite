// Palette extraction from RGBA pixels. Pixels under 50% alpha count as
// transparent and are ignored. A source with `max` or fewer distinct colors
// is returned verbatim (so a pixel-art PNG round-trips exactly); anything
// richer is reduced to exactly `max` by median cut, each box averaged
// weighted by pixel count.
export function extractPalette(data, max = 32) {
  const counts = new Map(); // packed 0xRRGGBB -> pixel count, in first-seen order
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(rgb, (counts.get(rgb) || 0) + 1);
  }
  const colors = [...counts].map(([rgb, n]) => ({ r: rgb >> 16, g: (rgb >> 8) & 255, b: rgb & 255, n }));
  if (colors.length <= max) return colors.map(toHex);

  const boxes = [colors];
  while (boxes.length < max) {
    // Split the box with the widest channel spread; stop if none can split.
    let best = -1, bestSpread = 0, bestChannel = 'r';
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (const ch of ['r', 'g', 'b']) {
        const vals = box.map((c) => c[ch]);
        const spread = Math.max(...vals) - Math.min(...vals);
        if (spread > bestSpread) { best = i; bestSpread = spread; bestChannel = ch; }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const half = box.reduce((s, c) => s + c.n, 0) / 2;
    let acc = 0, cut = 0;
    while (cut < box.length - 1 && acc + box[cut].n <= half) acc += box[cut++].n;
    cut = Math.max(1, cut);
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map((box) => {
    const n = box.reduce((s, c) => s + c.n, 0);
    const avg = (ch) => box.reduce((s, c) => s + c[ch] * c.n, 0) / n;
    return toHex({ r: avg('r'), g: avg('g'), b: avg('b') });
  });
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
