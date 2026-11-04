// Put into apps that have scrolling panels by tools/apply-kid-tap.py. Edit here and run that again.
// Finger taps on buttons inside scrolling panels. A panel that scrolls lets the browser take a finger tap that wobbles a
// little as the start of a scroll and cancel it (a stylus is steadier). A touch that moves less than 12 pixels counts as a tap on the
// button under it, and the browser's own click that may follow is dropped so nothing happens twice.
(function () {
  let down = null, swallow = null;
  const btn = t => t && t.closest && t.closest('button');
  document.addEventListener('pointerdown', e => {
    down = e.pointerType === 'touch' && btn(e.target) ? { b: btn(e.target), x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null;
  }, true);
  document.addEventListener('pointermove', e => { if (down && e.pointerType === 'touch') down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y)); }, true);
  const end = e => {
    if (!down || e.pointerType !== 'touch') return;
    const d = down; down = null;
    if (d.moved < 12 && performance.now() - d.t < 800 && d.b.isConnected && !d.b.disabled) {
      swallow = { x: d.x, y: d.y, until: performance.now() + 700 };
      d.b.click();
    }
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  document.addEventListener('click', e => {
    if (swallow && e.isTrusted && performance.now() < swallow.until && Math.hypot(e.clientX - swallow.x, e.clientY - swallow.y) < 40) {
      e.stopPropagation(); e.preventDefault(); swallow = null;
    }
  }, true);
})();
