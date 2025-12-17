
const TICK_RATE = 20;
const FIXED_STEP = 1 / TICK_RATE; // 0.05s

const tickListeners = new Set();
let rafId = null;
let paused = false;
let lastTime = 0;
let accumulator = 0;

function loop() {
  const now = performance.now();
  if (paused) {
      lastTime = now;
      rafId = requestAnimationFrame(loop);
      return;
  }
  
  if (!lastTime) lastTime = now;
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Clamp dt to avoid spiral of death if tab was backgrounded for a long time
  // (Offline progress handles >1s usually, but we clamp here to be safe)
  // Bolt: Increased to 60s to allow catching up after lag spikes (e.g. shop open)
  // to prevent permanent desync of game state vs cursor position.
  if (dt > 60.0) dt = 60.0; 
  if (dt < 0) dt = 0;
  
  accumulator += dt;

  // Process fixed steps
  // Bolt: Limit ticks per frame to fast-forward instead of freezing the browser.
  let ticksProcessed = 0;
  const MAX_TICKS_PER_FRAME = 250; // ~12.5s of simulation per frame

  while (accumulator >= FIXED_STEP) {
    if (ticksProcessed >= MAX_TICKS_PER_FRAME) {
      // Break early; remaining accumulator will be processed next frame (fast-forward)
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

  rafId = requestAnimationFrame(loop);
}

export function pauseGameLoop() {
  paused = true;
}

export function resumeGameLoop() {
  paused = false;
  lastTime = performance.now();
  accumulator = 0; // Reset accumulator on resume to avoid burst
}

export function startGameLoop() {
  if (rafId) return;
  lastTime = performance.now();
  accumulator = 0;
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

export class RateAccumulator {
  constructor(currencyKey, bankRef) {
    this.currencyKey = currencyKey;
    this.bank = bankRef || window.bank;
    this.buffer = 0;
  }

  addRate(amountPerSecond) {
    // This logic assumes 20 ticks per second (FIXED_STEP)
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
