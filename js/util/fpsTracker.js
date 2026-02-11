
export const SHOW_FPS = true;

export function initFpsTracker() {
  if (!SHOW_FPS) return;

  const fpsDiv = document.createElement('div');
  fpsDiv.id = 'fps-tracker';
  Object.assign(fpsDiv.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '2147483647',
    background: '#000',
    color: '#fff',
    fontFamily: 'monospace',
    padding: '4px',
    fontSize: '12px',
    pointerEvents: 'none',
  });
  document.body.appendChild(fpsDiv);

  let frameCount = 0;
  let lastTime = performance.now();

  function loop(now) {
    frameCount++;
    const elapsed = now - lastTime;
    
    if (elapsed >= 250) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      fpsDiv.textContent = `FPS: ${fps}`;
      frameCount = 0;
      lastTime = now;
    }
    
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
