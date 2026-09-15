import { createPixiFile } from './pixi-file.js';
import { PRESETS, DEFAULT_PRESET } from './palettes-presets.js';

// Project = a directory containing Files + one shared Palette (§4, §5).
export function createProject(name) {
  const preset = PRESETS[DEFAULT_PRESET];
  return {
    name,
    palette: { chips: [...preset.chips], primary: preset.chips[0], secondary: preset.chips[1] },
    files: [createPixiFile('sprite', 32, 32)],
    activeFileIndex: 0,
  };
}

export function activeFile(project) {
  return project.files[project.activeFileIndex];
}

export function addFile(project, name, width, height) {
  project.files.push(createPixiFile(name, width, height));
  project.activeFileIndex = project.files.length - 1;
}

// 8x8, 16x16, 32x32, 64x64, 128x128, 256x256, Game Boy DMG (§13.2) — no
// custom size, deliberately dropped.
export const NEW_FILE_SIZES = [
  { label: '8x8', w: 8, h: 8 },
  { label: '16x16', w: 16, h: 16 },
  { label: '32x32', w: 32, h: 32 },
  { label: '64x64', w: 64, h: 64 },
  { label: '128x128', w: 128, h: 128 },
  { label: '256x256', w: 256, h: 256 },
  { label: 'Game Boy DMG', w: 160, h: 144 },
];
