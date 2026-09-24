/** True if the pointer event is over `el`'s visible text, not the empty space in the box around it. */
export function overText(el, e) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].some((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
}
