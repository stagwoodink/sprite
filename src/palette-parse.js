import { MAX_CHIPS } from './palettes-presets.js';

// Palette file formats, all line-oriented text sharing one tokenizer:
//   .gpl (GIMP)      header, `#` comments, then `R G B Name`
//   .hex (Lospec)    one bare hex per line
//   .pal (JASC-PAL)  `JASC-PAL` / version / count header, then `R G B`
// A line is a color if it starts with three 0-255 integers or a 6-digit hex;
// every header and comment line matches neither, so no per-format state is
// needed. (Binary RIFF .pal and Paint.NET .txt aren't supported.)
const RGB = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/;
const HEX = /^#?([0-9a-f]{6})(?:\s|$)/i;
const byte = (n) => Math.min(255, Number(n)).toString(16).padStart(2, '0');

// Returns uppercase `#RRGGBB` chips in file order, duplicates dropped,
// truncated at the palette cap.
export function parsePalette(text) {
  const chips = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const rgb = RGB.exec(line);
    const hex = rgb ? null : HEX.exec(line);
    if (!rgb && !hex) continue;
    const chip = rgb ? `#${byte(rgb[1])}${byte(rgb[2])}${byte(rgb[3])}`.toUpperCase() : `#${hex[1]}`.toUpperCase();
    if (!chips.includes(chip)) chips.push(chip);
    if (chips.length >= MAX_CHIPS) break;
  }
  return chips;
}

// "My Palette.gpl" -> "My Palette", safe to show and to store as a name.
export function paletteNameFromFile(filename) {
  return filename.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Imported';
}
