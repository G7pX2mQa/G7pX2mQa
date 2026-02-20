import { markSaveSlotModified } from '../util/storage.js';

export const TICK_RATE = 20;
export const FIXED_STEP = 1 / TICK_RATE; // 0.05s

const tickListeners = new Set();
const frameListeners = new Set();
let rafId = null;
let paused = false;
let lastTime = 0;
let accumulator = 0;

// Anti-Cheat: Runtime Time Travel Detection
let lastRuntimeCheckReal = 0;
let lastRuntimeCheckPerf = 0;
const RUNTIME_CHECK_INTERVAL_MS = 2000;

function loop(timestamp) {
  if (!timestamp) timestamp = performance.now();
  const now = timestamp;
  if (paused) {
      lastTime = now;
      rafId = requestAnimationFrame(loop);
      return;
  }
  
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Clamp dt to avoid spiral of death if tab was backgrounded for a long time
  // (Offline progress handles >1s usually, but we clamp here to be safe
  // to prevent permanent desync of game state vs cursor position.
  if (dt > 60.0) dt = 60.0; 
  if (dt < 0) dt = 0;
  
  accumulator += dt;

  // Process fixed steps
  // Limit ticks per frame to fast-forward instead of freezing the browser.
  let ticksProcessed = 0;
  const MAX_TICKS_PER_FRAME = 250; // ~12.5s of simulation per frame

  while (accumulator >= FIXED_STEP) {
    if (ticksProcessed >= MAX_TICKS_PER_FRAME) {
      // Break early; remaining accumulator will be processed next frame (fast-forward)
      // If we hit the limit, discard excess accumulator to prevent death spiral.
      accumulator = accumulator % FIXED_STEP;
      break;
    }

    tickListeners.forEach(listener => {
      try {
        listener(FIXED_STEP);
      } catch (e) {
        console.error('Error in game tick listener:', e);
      }
    });
    accumulator -= FIXED_STEP;
    ticksProcessed++;
  }
  
  // Process frame listeners (rendering, interpolation)
  frameListeners.forEach(listener => {
    try {
      listener(now / 1000, dt); // Pass time in seconds
    } catch (e) {
      console.error('Error in game frame listener:', e);
    }
  });

  // Anti-Cheat Check
  // We check periodically to compare Wall Clock Time (Date.now) vs Monotonic Time (performance.now)
  // If Wall Clock moves significantly faster than Monotonic, it's a speed hack or time skip while running.
  // If Wall Clock moves BACKWARDS, it's a reverse time skip.
  if (lastRuntimeCheckReal === 0 || lastRuntimeCheckPerf === 0) {
      lastRuntimeCheckReal = Date.now();
      lastRuntimeCheckPerf = now;
  } else {
      const perfDelta = now - lastRuntimeCheckPerf;
      // perform check every 2 seconds
      if (perfDelta > RUNTIME_CHECK_INTERVAL_MS) {
          const realNow = Date.now();
          const realDelta = realNow - lastRuntimeCheckReal;
          
          // Check 1: Backward Jump
          // If real time went backwards by more than 1 second (buffer), catch it.
          if (realDelta < -1000) {
               markSaveSlotModified();
          }
          // Check 2: Forward Speed Hack / Skip
          // If real time advanced significantly more than monotonic time.
          // e.g. Monotonic says 2s passed, but Real says 60s passed.
          // Buffer: allow up to 2x variance or +5s to be safe against drift/lag, but skipping minutes is obvious.
          // Let's be lenient: if realDelta is > perfDelta + 10000ms (10s)
          else if (realDelta > perfDelta + 10000) {
              markSaveSlotModified();
          }
          
          lastRuntimeCheckReal = realNow;
          lastRuntimeCheckPerf = now;
      }
  }

  rafId = requestAnimationFrame(loop);
}

export function pauseGameLoop() {
  paused = true;
}

export function resumeGameLoop() {
  paused = false;
  lastTime = performance.now();
  accumulator = 0; // Reset accumulator on resume to avoid burst
  
  // Reset cheat detection anchors to prevent flagging legitimate sleep/suspend time
  // as a speed hack (since Date.now advances during sleep, but performance.now behavior varies or loop stops).
  lastRuntimeCheckReal = 0; 
  lastRuntimeCheckPerf = 0;
}

export function startGameLoop() {
  if (rafId) return;
  lastTime = performance.now();
  accumulator = 0;
  lastRuntimeCheckReal = 0;
  lastRuntimeCheckPerf = 0;
  rafId = requestAnimationFrame(loop);
}

export function stopGameLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function registerTick(callback) {
  if (typeof callback !== 'function') return () => {};
  tickListeners.add(callback);
  return () => {
    tickListeners.delete(callback);
  };
}

export function registerFrame(callback) {
  if (typeof callback !== 'function') return () => {};
  frameListeners.add(callback);
  return () => {
    frameListeners.delete(callback);
  };
}

export class RateAccumulator {
  constructor(currencyKey, bankRef) {
    this.currencyKey = currencyKey;
    this.bank = bankRef || window.bank;
    this.buffer = 0;
  }

  addRate(amountPerSecond) {
    // This logic assumes TICK_RATE ticks per second (FIXED_STEP)
    const perTick = amountPerSecond * FIXED_STEP;
    this.buffer += perTick;

    if (this.buffer >= 1) {
      const whole = Math.floor(this.buffer);
      this.buffer -= whole;
      if (this.bank && this.bank[this.currencyKey]) {
        this.bank[this.currencyKey].add(whole);
      }
    }
  }
}
