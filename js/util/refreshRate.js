export let maxRefreshRate = 600; // Default until measured
export let refreshRateMeasured = false;

const listeners = [];

export function onRefreshRateMeasured(callback) {
  if (refreshRateMeasured) {
    callback(maxRefreshRate);
  } else {
    listeners.push(callback);
  }
}

function measureRefreshRate() {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
  
  let frameCount = 0;
  let startTime = performance.now();
  let rafId;

  function loop(now) {
    frameCount++;
    const elapsed = now - startTime;
    
    if (elapsed >= 1000) { // Measure for 1 second
      const measured = Math.round((frameCount * 1000) / elapsed);
      // Round to nearest standard refresh rate to avoid weird numbers like 59, 143, 239
      const standardRates = [30, 60, 75, 90, 120, 144, 165, 240, 360];
      let closest = standardRates[0];
      let minDiff = Math.abs(measured - closest);
      
      for (let i = 1; i < standardRates.length; i++) {
        const diff = Math.abs(measured - standardRates[i]);
        if (diff < minDiff) {
          minDiff = diff;
          closest = standardRates[i];
        }
      }
      
      // Allow measured if it's very different from standard rates (just in case)
      maxRefreshRate = minDiff < 10 ? closest : measured;
      
      // Sanity clamp
      if (maxRefreshRate < 30) maxRefreshRate = 30;
      if (maxRefreshRate > 1000) maxRefreshRate = 1000;
      
      refreshRateMeasured = true;
      listeners.forEach(cb => cb(maxRefreshRate));
      listeners.length = 0; // Clear
      
      // If we measured <= 60, it might be due to background throttling before user interaction.
      // Re-measure once upon first interaction to be sure.
      if (maxRefreshRate <= 60 && !window.__hasRemeasuredRefreshRate) {
        window.__hasRemeasuredRefreshRate = true;
        
        const remeasure = () => {
          window.removeEventListener('pointerdown', remeasure);
          window.removeEventListener('keydown', remeasure);
          
          refreshRateMeasured = false; // Reset flag to allow listeners if any re-subscribe
          measureRefreshRate();
        };
        
        window.addEventListener('pointerdown', remeasure, { once: true });
        window.addEventListener('keydown', remeasure, { once: true });
      }
    } else {
      rafId = requestAnimationFrame(loop);
    }
  }
  
  rafId = requestAnimationFrame(loop);
}

measureRefreshRate();
