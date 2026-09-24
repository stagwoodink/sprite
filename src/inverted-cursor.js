import { cursorIcon } from './cursors.js';

// A CSS `cursor` can't blend with what's under it, so over the canvas the OS
// cursor is hidden and this icon follows the pointer instead, drawn with
// `mix-blend-mode: difference` (white in, inverse of the backdrop out). Only a
// compositor transform changes per move, so the cost stays flat however big the
// canvas or project is.
// `canvas` is the full-viewport drawing surface: the app background is part of it.
export function createInvertedCursor(canvas) {
  const img = document.createElement('img');
  img.className = 'inverted-cursor';
  img.alt = '';
  img.hidden = true;
  document.body.append(img);

  let hotspot = { x: 0, y: 0 };
  let active = false; // false while the mode is null, e.g. the read-only group grid

  // A drag captures the pointer, so `e.target` stays the canvas even after the
  // pointer slides over a panel; hit-test then (only during a drag) instead.
  const overCanvas = (e) => (canvas.hasPointerCapture(e.pointerId) ? document.elementFromPoint(e.clientX, e.clientY) : e.target) === canvas;

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    img.hidden = !(active && overCanvas(e));
    if (img.hidden) return;
    img.style.transform = `translate(${e.clientX - hotspot.x}px, ${e.clientY - hotspot.y}px)`;
  });
  document.documentElement.addEventListener('pointerleave', () => { img.hidden = true; });

  return {
    /** Shows the icon for `mode`; null hides it (and the caller restores the OS cursor). */
    setMode(mode) {
      active = mode !== null;
      if (!active) { img.hidden = true; return; }
      const icon = cursorIcon(mode);
      hotspot = icon.hotspot;
      if (img.src !== icon.src) img.src = icon.src;
    },
  };
}
