import { settingsManager } from '../game/settingsManager.js';

export function initPerformanceGraph() {
  let overlayContainer = document.getElementById('performance-overlay-container');
  if (!overlayContainer) {
      overlayContainer = document.createElement('div');
      overlayContainer.id = 'performance-overlay-container';
      Object.assign(overlayContainer.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          zIndex: '2147483643',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          pointerEvents: 'none',
      });
      document.body.appendChild(overlayContainer);
  }

  const container = document.createElement('div');
  const width = 150;
  const height = 36;
  container.id = 'performance-graph-container';
  Object.assign(container.style, {
    background: 'rgba(0, 0, 0, 0.7)',
    border: '1px solid #444',
    padding: '2px',
    display: 'none',
    cursor: 'none',
    pointerEvents: 'auto',
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  Object.assign(canvas.style, {
    display: 'block',
	width: `${width}px`,
	height: `${height}px`
  });
  container.appendChild(canvas);

  // Container needs position relative so tooltip can position absolutely
  container.style.position = 'relative';

  const tooltip = document.createElement('div');
  tooltip.className = 'setting-info-tooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: '4px',
    background: '#111',
    color: '#eee',
    border: '1px solid #555',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '2147483643',
    visibility: 'visible',
    opacity: '1'
  });
  container.appendChild(tooltip);

  overlayContainer.appendChild(container);

  const ctx = canvas.getContext('2d');
  
  const HISTORY_SIZE = width;
  const fpsHistory = new Array(HISTORY_SIZE).fill(0);
  let historyIndex = 0;

  let frameCount = 0;
  let lastTime = performance.now();
  let rafId = null;
  let inMenu = true;
  let isHovered = false;

  container.addEventListener('mouseenter', () => {
    isHovered = true;
    tooltip.style.display = 'block';
    updateTooltip();
  });

  container.addEventListener('mouseleave', () => {
    isHovered = false;
    tooltip.style.display = 'none';
  });

  function updateTooltip() {
    if (!isHovered) return;
    let minFps = Infinity;
    let maxFps = -Infinity;
    let sumFps = 0;
    let count = 0;

    for (let i = 0; i < HISTORY_SIZE; i++) {
      const val = fpsHistory[i];
      if (val > 0) {
        if (val < minFps) minFps = val;
        if (val > maxFps) maxFps = val;
        sumFps += val;
        count++;
      }
    }

    if (count === 0) {
      tooltip.innerHTML = 'Calculating...';
      return;
    }

    const avgFps = Math.round(sumFps / count);
    const currentFps = fpsHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE];
    
    let memInfo = '';
    if (performance.memory) {
      const usedMb = Math.round(performance.memory.usedJSHeapSize / 1048576);
      const totalMb = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
      memInfo = `<br>Mem: ${usedMb}MB / ${totalMb}MB`;
    }

    tooltip.innerHTML = `FPS: ${currentFps}<br>Min: ${minFps} | Max: ${maxFps}<br>Avg: ${avgFps}${memInfo}`;
  }

  function loop(now) {
    frameCount++;
    const elapsed = now - lastTime;
    
    // Update data every 250ms like fps tracker
    if (elapsed >= 250) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      fpsHistory[historyIndex] = fps;
      historyIndex = (historyIndex + 1) % HISTORY_SIZE;
      frameCount = 0;
      lastTime = now;

      const show = settingsManager.get('performance_graph') && !inMenu;
      if (show) {
          drawGraph();
          if (isHovered) {
            updateTooltip();
          }
      }
    }
    
    rafId = requestAnimationFrame(loop);
  }

  function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Find min and max for scaling
    let minVal = 0; // Fixed min to 0 for better relative scale, or we can use actual min
    let maxVal = 60; // Base max
    for (let i = 0; i < HISTORY_SIZE; i++) {
        if (fpsHistory[i] > maxVal) maxVal = fpsHistory[i];
    }
    
    // Pad max slightly
    maxVal = Math.max(60, maxVal + 5);

    ctx.beginPath();
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;

    for (let i = 0; i < HISTORY_SIZE; i++) {
      // Draw from oldest to newest
      const idx = (historyIndex + i) % HISTORY_SIZE;
      const val = fpsHistory[idx];
      
      const x = (i / (HISTORY_SIZE - 1)) * canvas.width;
      const y = canvas.height - ((val / maxVal) * canvas.height);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Fill underneath
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.fill();
  }

  function updateVisibility() {
    const show = settingsManager.get('performance_graph') && !inMenu;
    
    const wasHidden = container.style.display === 'none';
    container.style.display = show ? 'block' : 'none';
    
    if (show && wasHidden) {
      drawGraph();
    }
    
    // Always track as long as we're not in the menu, to maintain history even when hidden
    if (!rafId && !inMenu) {
        lastTime = performance.now();
        frameCount = 0;
        rafId = requestAnimationFrame(loop);
    } else if (inMenu && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
  }

  settingsManager.subscribe('performance_graph', updateVisibility);

  window.addEventListener('menu:visibilitychange', (e) => {
    inMenu = e.detail ? e.detail.visible : false;
    updateVisibility();
  });

  window.addEventListener('saveSlot:change', (e) => {
    if (e.detail && e.detail.slot !== null) {
      fpsHistory.fill(0);
      historyIndex = 0;
      if (settingsManager.get('performance_graph') && !inMenu) {
        drawGraph();
        if (isHovered) {
          updateTooltip();
        }
      }
    }
  });

  // initial setup
  updateVisibility();
}
