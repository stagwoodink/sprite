// Shared reveal/hide/pin/focus mechanic (§15) — built once, wired to
// Project, Layers, Timeline, and (when unpinned) the Palette bar.
//
// Hide-on-leave uses a short grace period rather than hiding on the raw
// mouseleave event: a real "did the user mean to leave" signal would track
// cursor velocity/direction, but a brief debounce absorbs the same overshoot
// and flick-back cases with far less code, which is the whole point of a
// shared mechanic — one simple rule everywhere beats four bespoke ones.
const HIDE_GRACE_MS = 220;

export function createRevealablePanel(panelEl, triggerEl, { initiallyPinned = false, onVisibility, onPinChange } = {}) {
  let pinned = initiallyPinned;
  let hovering = false;
  let keyHeld = false; // its hold-to-reveal key is currently down (keyboard-first scheme, CONTEXT.md)
  // A slide-out menu (slide-out.js) spawned from something inside this
  // panel is open — the menu itself renders as a separate DOM node
  // appended to <body>, floating outside panelEl's own bounds, so the
  // panel's own mouseenter/mouseleave has no way to know about it on its
  // own. Without this, moving the mouse from the panel onto its menu reads
  // as "left the panel," the hide-grace timer fires, and the panel
  // collapses out from under a menu that's still open — slide-out.js
  // dispatches 'slideout-open'/'slideout-close' on this panel element to
  // keep this in sync instead.
  let slideoutOpen = false;
  let hideTimer = null;

  function setPin(value) {
    if (pinned === value) return;
    pinned = value;
    if (onPinChange) onPinChange(pinned);
  }

  function apply() {
    const visible = pinned || hovering || keyHeld || slideoutOpen;
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

  function onSlideoutOpen() {
    slideoutOpen = true;
    clearTimeout(hideTimer);
    apply();
  }
  // No grace timer here — by the time a menu closes, either the mouse is
  // back over the panel (a real mouseenter already reset `hovering`) or it
  // isn't and the panel should collapse right away, same as any other
  // "the reason this was open just went away" moment.
  function onSlideoutClose() {
    slideoutOpen = false;
    apply();
  }

  triggerEl.addEventListener('mouseenter', onEnter);
  panelEl.addEventListener('mouseenter', onEnter);
  triggerEl.addEventListener('mouseleave', onLeave);
  panelEl.addEventListener('mouseleave', onLeave);
  panelEl.addEventListener('slideout-open', onSlideoutOpen);
  panelEl.addEventListener('slideout-close', onSlideoutClose);

  apply();

  return {
    togglePin() { setPin(!pinned); apply(); },
    setPinned(value) { setPin(value); apply(); },
    // Forces the panel closed regardless of live hover state — setPinned(false)
    // alone would leave it open if the cursor is still resting on it.
    forceHide() { setPin(false); hovering = false; keyHeld = false; slideoutOpen = false; clearTimeout(hideTimer); apply(); },
    // Its dedicated key is down: show it (if not already pinned) without
    // changing pin state, same as hovering does for the mouse. Release
    // drops it again unless pinned or still hovered.
    setKeyHeld(value) { keyHeld = value; apply(); },
    isFocused: () => pinned || hovering || keyHeld || slideoutOpen,
    isPinned: () => pinned,
  };
}
