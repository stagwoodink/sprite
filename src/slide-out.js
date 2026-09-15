// Shared "Slide-Out Context Bar" mechanism (per CONTEXT.md's vocabulary):
// every secondary/contextual control surface slides out from the element
// that triggered it as a stack of chunky buttons, not a floating text
// dropdown menu. One implementation, reused by every context interaction
// (file rename/resize, new-file size picker, etc.) rather than each
// building its own popup.
export function openSlideOut(anchor, buttons, { side = 'right' } = {}) {
  document.querySelectorAll('.slide-out-bar').forEach((el) => el.remove());

  const bar = document.createElement('div');
  bar.className = 'slide-out-bar';

  function close() {
    bar.remove();
    cleanup();
  }

  for (const { label, onClick, accent } of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn slide-out-btn' + (accent ? ' selected' : '');
    const face = document.createElement('div');
    face.className = 'btn-face';
    face.textContent = label;
    const shadow = document.createElement('div');
    shadow.className = 'btn-shadow';
    btn.append(face, shadow);
    btn.addEventListener('click', () => { onClick(); close(); });
    bar.append(btn);
  }

  const rect = anchor.getBoundingClientRect();
  let fromTransform;
  if (side === 'right') {
    bar.style.left = rect.right + 4 + 'px';
    bar.style.top = rect.top + 'px';
    fromTransform = 'translateX(-12px)';
  } else if (side === 'left') {
    bar.style.right = window.innerWidth - rect.left + 4 + 'px';
    bar.style.top = rect.top + 'px';
    fromTransform = 'translateX(12px)';
  } else if (side === 'up') {
    bar.style.left = rect.left + 'px';
    bar.style.bottom = window.innerHeight - rect.top + 4 + 'px';
    fromTransform = 'translateY(12px)';
  } else {
    bar.style.left = rect.left + 'px';
    bar.style.top = rect.bottom + 4 + 'px';
    fromTransform = 'translateY(-12px)';
  }
  bar.style.transform = fromTransform;
  bar.style.opacity = '0';
  document.body.append(bar);
  requestAnimationFrame(() => {
    bar.style.transform = 'translate(0, 0)';
    bar.style.opacity = '1';
  });

  function onOutside(e) {
    if (!bar.contains(e.target) && e.target !== anchor) close();
  }
  function cleanup() {
    window.removeEventListener('pointerdown', onOutside);
  }
  setTimeout(() => window.addEventListener('pointerdown', onOutside), 0);

  return bar;
}
