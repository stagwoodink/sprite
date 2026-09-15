// Shared "Slide-Out Context Bar" mechanism (per CONTEXT.md's vocabulary):
// every secondary/contextual control surface slides out flush against the
// element that triggered it, with a chevron pointing back at that element,
// as a stack of chunky buttons — not a floating text dropdown with dead
// space around it. One implementation, reused by every context interaction.

// Positions `bar` flush against `anchor` on the given side, adds a chevron
// pointing at the anchor, and returns the transform to animate in from.
// Exported so other slide-out surfaces (color picker, palette presets,
// export bar) that aren't a simple button list can still get the same
// flush-position + chevron treatment.
export function positionSlideOut(bar, anchor, side) {
  const rect = anchor.getBoundingClientRect();
  bar.dataset.side = side;

  const chevron = document.createElement('div');
  chevron.className = 'slide-out-chevron';
  bar.append(chevron);

  let fromTransform;
  if (side === 'right') {
    bar.style.left = rect.right + 'px';
    bar.style.top = rect.top + 'px';
    chevron.style.top = rect.height / 2 + 'px';
    fromTransform = 'translateX(-12px)';
  } else if (side === 'left') {
    bar.style.right = window.innerWidth - rect.left + 'px';
    bar.style.top = rect.top + 'px';
    chevron.style.top = rect.height / 2 + 'px';
    fromTransform = 'translateX(12px)';
  } else if (side === 'up') {
    bar.style.left = rect.left + 'px';
    bar.style.bottom = window.innerHeight - rect.top + 'px';
    chevron.style.left = rect.width / 2 + 'px';
    fromTransform = 'translateY(12px)';
  } else {
    bar.style.left = rect.left + 'px';
    bar.style.top = rect.bottom + 'px';
    chevron.style.left = rect.width / 2 + 'px';
    fromTransform = 'translateY(-12px)';
  }
  return fromTransform;
}

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

  const fromTransform = positionSlideOut(bar, anchor, side);
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
