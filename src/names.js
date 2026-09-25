/** `base 1`, or the lowest `base N` no name in `taken` already uses: numbers only climb past names that exist. */
export function nextName(base, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
