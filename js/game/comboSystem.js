import { getActiveSlot } from '../util/storage.js';

// Configuration
const DECAY_WINDOW_SEC = 60;

// State
const COMBO_INCREMENT_AMOUNT = 0.001;
let activeComboValue = 0; // The accumulated combo value
let decayCounter = 0; // Integer seconds since last coin collection
let decayAccumulator = 0; // Float accumulator for partial seconds
let isSurge14ActiveFn = () => false;
let getMaxComboFn = () => 1.0; // Default max combo if not provided

// New: Rate limiting for growth
let lastGrowthTime = 0;

function resetState() {
    activeComboValue = 0;
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
        const maxVal = getMaxComboFn();
        
        // Ensure we are within bounds before adding
        if (activeComboValue < maxVal) {
            activeComboValue += COMBO_INCREMENT_AMOUNT;
            // Clamp
            if (activeComboValue > maxVal) {
                activeComboValue = maxVal;
            }
        } else if (activeComboValue > maxVal) {
            // If cap dropped below current value
            activeComboValue = maxVal;
        }

        lastGrowthTime = now;
    }
}

export function updateCombo(dt) {
    if (!isSurge14ActiveFn()) return;

    // Continuous cap check
    const maxVal = getMaxComboFn();
    if (activeComboValue > maxVal) {
        activeComboValue = maxVal;
    }
    
    // 1. Process Decay
    // "change the decay to happen every second, not every game tick"
    if (decayCounter < DECAY_WINDOW_SEC) {
        decayAccumulator += dt;
        while (decayAccumulator >= 1.0) {
            decayAccumulator -= 1.0;
            // Only increment if we haven't hit the cap
            if (decayCounter < DECAY_WINDOW_SEC) {
                decayCounter += 1;
                // If we hit the cap (fully decayed), reset value
                if (decayCounter >= DECAY_WINDOW_SEC) {
                    activeComboValue = 0;
                }
            }
        }
    }
}

// Returns the absolute value to add to the nerf exponent
export function getComboRestorationFactor() {
    if (!isSurge14ActiveFn()) return 0;
    
    // 1. Get Base Value
    let val = activeComboValue;
    
    // 2. Apply Decay Penalty (Linear over 60s)
    let decayFactor = 0;
    if (decayCounter < DECAY_WINDOW_SEC) {
        decayFactor = Math.max(0, 1 - (decayCounter / DECAY_WINDOW_SEC));
    }
    
    return val * decayFactor;
}

export function initComboSystem(checkFn, maxComboFn) {
    if (typeof checkFn === 'function') {
        isSurge14ActiveFn = checkFn;
    }
    if (typeof maxComboFn === 'function') {
        getMaxComboFn = maxComboFn;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', resetState);
        
        resetState();
    }
}
