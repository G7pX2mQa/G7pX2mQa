
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;

const tickListeners = new Set();
let timerId = null;
let paused = false;

function loop() {
  if (paused) return;
  const now = performance.now();
  // Simple fixed-step loop for now
  
  tickListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error('Error in game tick listener:', e);
    }
  });
}

export function pauseGameLoop() {
  paused = true;
}

export function resumeGameLoop() {
  paused = false;
}

export function startGameLoop() {
  if (timerId) return;
  timerId = setInterval(loop, TICK_MS);
}

export function stopGameLoop() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
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
    const perTick = amountPerSecond / TICK_RATE;
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
