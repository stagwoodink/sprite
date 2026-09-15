// Shared reveal/hide/pin/focus mechanic (§15) — built once, wired to
// Project, Layers, Timeline, and (when unpinned) the Palette bar.
//
// Hide-on-leave uses a short grace period rather than hiding on the raw
// mouseleave event: a real "did the user mean to leave" signal would track
// cursor velocity/direction, but a brief debounce absorbs the same overshoot
// and flick-back cases with far less code, which is the whole point of a
// shared mechanic — one simple rule everywhere beats four bespoke ones.
const HIDE_GRACE_MS = 220;

export function createRevealablePanel(panelEl, triggerEl, { initiallyPinned = false, onVisibility } = {}) {
  let pinned = initiallyPinned;
  let hovering = false;
  let hideTimer = null;

  function apply() {
    const visible = pinned || hovering;
    // A CSS class (collapsing width/height to 0), not the `hidden`
    // attribute — `hidden` sets display:none, which can't transition/slide.
    // The element stays in the layout at all times so it can animate.
    panelEl.classList.toggle('panel-hidden', !visible);
    panelEl.classList.toggle('focused', visible);
    if (onVisibility) onVisibility(visible);
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
    // Forces the panel closed regardless of live hover state — setPinned(false)
    // alone would leave it open if the cursor is still resting on it.
    forceHide() { pinned = false; hovering = false; clearTimeout(hideTimer); apply(); },
    isFocused: () => pinned || hovering,
    isPinned: () => pinned,
  };
}
