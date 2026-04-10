
import { settingsManager } from '../game/settingsManager.js';

export function initFpsTracker() {
  const fpsDiv = document.createElement('div');
  fpsDiv.id = 'fps-tracker';
  Object.assign(fpsDiv.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    zIndex: '2147483643',
    background: '#000',
    color: '#fff',
    fontFamily: 'monospace',
    padding: '4px',
    fontSize: '12px',
    pointerEvents: 'none',
  });
  fpsDiv.style.display = 'none'; // start hidden
  document.body.appendChild(fpsDiv);


  let frameCount = 0;
  let lastTime = performance.now();
  let rafId = null;
  let inMenu = true;

  function loop(now) {
    frameCount++;
    const elapsed = now - lastTime;
    
    if (elapsed >= 250) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      fpsDiv.textContent = `FPS: ${fps}`;
      frameCount = 0;
      lastTime = now;
    }
    
    rafId = requestAnimationFrame(loop);
  }

  function updateVisibility() {
    const show = settingsManager.get('show_fps') && !inMenu;
    fpsDiv.style.display = show ? 'block' : 'none';
    if (show && !rafId) {
        lastTime = performance.now();
        frameCount = 0;
        rafId = requestAnimationFrame(loop);
    } else if (!show && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
  }

  settingsManager.subscribe('show_fps', updateVisibility);

  window.addEventListener('menu:visibilitychange', (e) => {
    inMenu = e.detail ? e.detail.visible : false;
    updateVisibility();
  });

  updateVisibility();
}
