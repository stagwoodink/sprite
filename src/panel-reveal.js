// Shared reveal/hide/pin/focus mechanic (§15) — built once, wired to
// Project, Layers, Timeline, and (when unpinned) the Palette bar.
//
// Hide-on-leave uses a short grace period rather than hiding on the raw
// mouseleave event: a real "did the user mean to leave" signal would track
// cursor velocity/direction, but a brief debounce absorbs the same overshoot
// and flick-back cases with far less code, which is the whole point of a
// shared mechanic — one simple rule everywhere beats four bespoke ones.
const HIDE_GRACE_MS = 220;

export function createRevealablePanel(panelEl, triggerEl, { initiallyPinned = false } = {}) {
  let pinned = initiallyPinned;
  let hovering = false;
  let hideTimer = null;

  function apply() {
    const visible = pinned || hovering;
    panelEl.hidden = !visible;
    panelEl.classList.toggle('focused', visible);
  }

  function onEnter() {
    hovering = true;
    clearTimeout(hideTimer);
    apply();
  }

  function onLeave() {
    hovering = false;
    if (pinned) return; // a pinned panel keeps focus/visibility until unpinned (§15)
    clearTimeout(hideTimer);
    hideTimer = setTimeout(apply, HIDE_GRACE_MS);
  }

  triggerEl.addEventListener('mouseenter', onEnter);
  panelEl.addEventListener('mouseenter', onEnter);
  triggerEl.addEventListener('mouseleave', onLeave);
  panelEl.addEventListener('mouseleave', onLeave);

  apply();

  return {
    togglePin() { pinned = !pinned; apply(); },
    setPinned(value) { pinned = value; apply(); },
    isFocused: () => pinned || hovering,
    isPinned: () => pinned,
  };
}
