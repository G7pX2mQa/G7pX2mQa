import { getActiveSlot } from '../util/storage.js';

// Configuration
const MAX_ACTIVE_TIME_SEC = 1000;
const DECAY_WINDOW_SEC = 15;

// State
let activeTimeSec = 0; // The "potential" combo time
let decayCounter = 0; // Integer seconds since last coin collection
let decayAccumulator = 0; // Float accumulator for partial seconds
let isSurge14ActiveFn = () => false;

// New: Rate limiting for growth
let lastGrowthTime = 0;

function resetState() {
    activeTimeSec = 0;
    decayCounter = 0;
    decayAccumulator = 0;
    lastGrowthTime = 0;
}

export function onCoinCollected() {
    if (!isSurge14ActiveFn()) return;
    
    const now = performance.now();
    
    // Reset decay timer on collection
    decayCounter = 0;
    decayAccumulator = 0;
    
    // Enforce 1 second rate limit for growth
    if (now - lastGrowthTime >= 1000) {
        activeTimeSec += 1;
        if (activeTimeSec > MAX_ACTIVE_TIME_SEC) {
            activeTimeSec = MAX_ACTIVE_TIME_SEC;
        }
        lastGrowthTime = now;
    }
}

export function updateCombo(dt) {
    if (!isSurge14ActiveFn()) return;
    
    // 1. Process Decay
    // "change the decay to happen every second, not every game tick"
    if (decayCounter < DECAY_WINDOW_SEC) {
        decayAccumulator += dt;
        while (decayAccumulator >= 1.0) {
            decayAccumulator -= 1.0;
            // Only increment if we haven't hit the cap
            if (decayCounter < DECAY_WINDOW_SEC) {
                decayCounter += 1;
                // If we hit the cap, reset potential
                if (decayCounter >= DECAY_WINDOW_SEC) {
                    activeTimeSec = 0;
                }
            }
        }
    }
}

// Returns a value between 0.0 and 1.0 representing the ratio of restoration
export function getComboRestorationFactor() {
    if (!isSurge14ActiveFn()) return 0;
    
    // 1. Calculate Potential (0.0 to 1.0 based on 1000s)
    let potential = Math.min(1, Math.max(0, activeTimeSec / MAX_ACTIVE_TIME_SEC));
    
    // 2. Calculate Decay Penalty (Discrete steps over 15s)
    let decayFactor = 0;
    if (decayCounter < DECAY_WINDOW_SEC) {
        // Linear but discrete: (15 - counter) / 15
        decayFactor = Math.max(0, 1 - (decayCounter / DECAY_WINDOW_SEC));
    }
    
    return potential * decayFactor;
}

export function initComboSystem(checkFn) {
    if (typeof checkFn === 'function') {
        isSurge14ActiveFn = checkFn;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', resetState);
        
        resetState();
    }
}
