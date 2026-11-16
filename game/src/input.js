const KEYS = {
  ArrowUp: 'N', KeyW: 'N', ArrowRight: 'E', KeyD: 'E',
  ArrowDown: 'S', KeyS: 'S', ArrowLeft: 'W', KeyA: 'W',
};

export function createInput(canvas) {
  const state = { move: null, restart: false, pause: false, escape: false, start: false, pointer: null };
  window.addEventListener('keydown', (event) => {
    if (KEYS[event.code]) { state.move = KEYS[event.code]; event.preventDefault(); }
    else if (event.code === 'KeyR' && !event.repeat) state.restart = true;
    else if (event.code === 'KeyP' && !event.repeat) state.pause = true;
    else if (event.code === 'Escape' && !event.repeat) state.escape = true;
    else if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) state.start = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    state.pointer = { x, y };
  });
  return {
    take() {
      const value = { ...state };
      state.move = null; state.restart = false; state.pause = false; state.escape = false;
      state.start = false; state.pointer = null;
      return value;
    },
  };
}
