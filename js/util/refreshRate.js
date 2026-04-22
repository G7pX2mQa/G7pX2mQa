export let maxRefreshRate = 240; // Default to a high value so high Hz monitors don't lock to 60fps on launch
export let refreshRateMeasured = false;

const listeners = [];

export function onRefreshRateMeasured(callback) {
  if (refreshRateMeasured) {
    callback(maxRefreshRate);
  }
  // Always push to listeners so they can get updates if the rate bumps up
  listeners.push(callback);
}

function startRefreshRateMonitor() {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
  
  let frameCount = 0;
  let startTime = performance.now();
  let rafId;

  function loop(now) {
    frameCount++;
    const elapsed = now - startTime;
    
    if (elapsed >= 1000) { // Measure for 1 second intervals
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
      let currentMeasurement = minDiff < 10 ? closest : measured;
      
      // Sanity clamp
      if (currentMeasurement < 30) currentMeasurement = 30;
      if (currentMeasurement > 1000) currentMeasurement = 1000;
      
      // Only update and notify if we found a higher refresh rate
      if (currentMeasurement > maxRefreshRate || !refreshRateMeasured) {
        // Do not downgrade maxRefreshRate from its initial high default on first measurement
        // Chromium caps background/initial RAF at 60, so we ignore that if we defaulted higher
        if (currentMeasurement > maxRefreshRate || maxRefreshRate <= 60) {
          maxRefreshRate = currentMeasurement;
        }
        refreshRateMeasured = true;
        
        // Notify all current and future listeners
        listeners.forEach(cb => cb(maxRefreshRate));
        // We don't clear listeners because they might be registered at any time,
        // and we want them to get updates if the rate bumps up.
      }
      
      // Reset for next interval
      frameCount = 0;
      startTime = now;
    }
    
    rafId = requestAnimationFrame(loop);
  }
  
  rafId = requestAnimationFrame(loop);
}

startRefreshRateMonitor();
