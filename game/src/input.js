// input.js — keyboard + mouse, pointer lock with a drag fallback.
// Pointer lock can fail (headless browser, denied permission); the game must
// still be playable by dragging, so screenshots and play-tests never stall.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    lookDX: 0, lookDY: 0, // accumulated mouse deltas since last consume
    firing: false,
    locked: false,
    lockFailed: false,
    dragging: false,
    onKey: null, // (code, down) — main.js wires buy keys, grenade, etc.
    onMouseDown: null,
    onMouseUp: null,
    requestLock() {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { input.lockFailed = true; });
      } catch { input.lockFailed = true; }
    },
    consumeLook() {
      const dx = input.lookDX, dy = input.lookDY;
      input.lookDX = 0; input.lookDY = 0;
      return { dx, dy };
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (input.onKey) input.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (input.onKey) input.onKey(e.code, false);
  });
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('pointerlockerror', () => { input.lockFailed = true; });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.lookDX += e.movementX; input.lookDY += e.movementY;
    } else if (input.dragging) {
      input.lookDX += e.movementX; input.lookDY += e.movementY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!input.locked) input.dragging = true;
    input.firing = true;
    if (input.onMouseDown) input.onMouseDown();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    input.dragging = false;
    input.firing = false;
    if (input.onMouseUp) input.onMouseUp();
  });
  // Clicking the canvas while playing (re)grabs the mouse.
  canvas.addEventListener('click', () => {
    if (!input.locked && !input.lockFailed) input.requestLock();
  });
  return input;
}
