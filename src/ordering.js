// Shared position-based grouping: used by both the Project panel
// (files/collections) and the Layers panel (layers/groups). Membership is
// derived from where an item sits in a combined, order-sorted sequence
// relative to the nearest header above it: dragging or keyboard-moving an
// item past a header's position joins or leaves that group automatically.
// There's no explicit "assign to group" step or field to keep in sync:
// `groupId` below is computed fresh every time, never stored as the source
// of truth (§ new control scheme: "drag it into the space beneath a tab").

const ORDER_GAP = 1000;

// Merges headers + members into one array sorted by `.order`, tagged
// `{item, isHeader}`, and stamps each member's derived `groupId` (the
// nearest preceding header's id, or null if none precedes it) directly
// onto `item` as a side effect: cheap, and every caller needs it anyway.
export function computeMembership(headers, members) {
  const combined = [
    ...headers.map((item) => ({ item, isHeader: true })),
    ...members.map((item) => ({ item, isHeader: false })),
  ].sort((a, b) => a.item.order - b.item.order);
  let current = null;
  for (const entry of combined) {
    if (entry.isHeader) current = entry.item.id;
    else entry.item.groupId = current;
  }
  return combined;
}

function blockLength(combined, pos) {
  if (!combined[pos].isHeader) return 1;
  let n = 1;
  while (pos + n < combined.length && !combined[pos + n].isHeader) n++;
  return n;
}

// Moves the entry at `fromPos`: and, if it's a header, its whole
// contiguous member block, so a collapsed/hidden block moves with it: to
// sit at `toPos`, same splice-then-reinsert convention as every other
// reorder in this app (`project.js`'s `reorderFile`, `sprite-file.js`'s
// `reorderLayer`), just generalized from a 1-item move to a block move.
// Mutates `combined` in place and renumbers every `.order` afterward.
export function moveBlock(combined, fromPos, toPos) {
  const len = blockLength(combined, fromPos);
  const block = combined.splice(fromPos, len);
  const insertAt = toPos > fromPos ? toPos - len + 1 : toPos;
  combined.splice(Math.max(0, Math.min(combined.length, insertAt)), 0, ...block);
  combined.forEach((entry, i) => { entry.item.order = (i + 1) * ORDER_GAP; });
}

// Filters a combined array down to what's actually visible: every member
// of a collapsed header is skipped, the header itself stays. Each returned
// entry keeps its `pos` (index into the *original* combined array, which
// is what moveBlock/onReorder positions mean: collapsed gaps don't
// renumber anything) alongside the usual `item`/`isHeader`. Shared by panel
// rendering and keyboard navigation so "skip hidden content" (§ new
// control scheme) means the same thing in both places.
export function visibleOrder(combined) {
  const out = [];
  let skipping = false;
  combined.forEach((entry, pos) => {
    if (entry.isHeader) { out.push({ ...entry, pos }); skipping = entry.item.collapsed; }
    else if (!skipping) out.push({ ...entry, pos });
  });
  return out;
}

// Order value for something appended at the very end of a combined list:
// callers already have `headers`/`members` separately (before merging), so
// this avoids making every call site build the combined array just to add
// one new item to it.
export function nextOrder(headers, members) {
  const all = [...headers, ...members];
  return all.length ? Math.max(...all.map((i) => i.order)) + ORDER_GAP : ORDER_GAP;
}
