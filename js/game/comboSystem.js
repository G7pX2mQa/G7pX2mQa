import { getActiveSlot } from '../util/storage.js';

// Configuration
const DECAY_WINDOW_SEC = 60;
const COMBO_STORAGE_KEY = (slot) => `ccc:combo:value:${slot}`;

// State
const COMBO_INCREMENT_AMOUNT = 0.001;
let activeComboValue = 0; // The accumulated combo value
let decayCounter = 0; // Integer seconds since last coin collection
let decayAccumulator = 0; // Float accumulator for partial seconds
let isSurge14ActiveFn = () => false;
let getMaxComboFn = () => 1.0; // Default max combo if not provided
let isComboPreservedFn = () => false; // Function to check if combo decay is disabled and persistence is enabled

// New: Rate limiting for growth
let lastGrowthTime = 0;

// New: Debug Panel features
let isComboLocked = false;
const comboChangeListeners = new Set();

// Throttled Saver
let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        saveComboState();
    }, 1000);
}

function saveComboState() {
    const slot = getActiveSlot();
    if (slot == null) return;
    // Only save if preservation is active
    if (!isComboPreservedFn()) return;
    
    try {
        localStorage.setItem(COMBO_STORAGE_KEY(slot), activeComboValue.toFixed(6));
    } catch {}
}

function loadComboState() {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(COMBO_STORAGE_KEY(slot));
        if (val) {
            const num = parseFloat(val);
            return Number.isFinite(num) ? num : 0;
        }
    } catch {}
    return 0;
}

function resetState() {
    isComboLocked = false;
    
    // Check preservation for the NEW slot (getActiveSlot called inside loadComboState/isComboPreservedFn)
    // However, resetState is called on 'saveSlot:change', at which point getActiveSlot() returns the new slot.
    
    if (isComboPreservedFn()) {
        activeComboValue = loadComboState();
    } else {
        activeComboValue = 0;
    }
    
    decayCounter = 0;
    decayAccumulator = 0;
    lastGrowthTime = 0;
    notifyComboChange();
}

function notifyComboChange() {
    comboChangeListeners.forEach(fn => {
        try { fn(activeComboValue); } catch {}
    });
}

export function onCoinCollected() {
    if (!isSurge14ActiveFn()) return;
    if (isComboLocked) return;
    
    const now = performance.now();
    
    // Reset decay timer on collection
    decayCounter = 0;
    decayAccumulator = 0;
    
    // Enforce 1 second rate limit for growth
    if (now - lastGrowthTime >= 1000) {
        const maxVal = getMaxComboFn();
        
        let changed = false;
        // Ensure we are within bounds before adding
        if (activeComboValue < maxVal) {
            activeComboValue += COMBO_INCREMENT_AMOUNT;
            changed = true;
            // Clamp
            if (activeComboValue > maxVal) {
                activeComboValue = maxVal;
            }
        } else if (activeComboValue > maxVal) {
            // If cap dropped below current value
            activeComboValue = maxVal;
            changed = true;
        }

        if (changed) {
            notifyComboChange();
            if (isComboPreservedFn()) scheduleSave();
        }
        lastGrowthTime = now;
    }
}

export function updateCombo(dt) {
    if (!isSurge14ActiveFn()) return;
    if (isComboLocked) return;

    // Continuous cap check
    const maxVal = getMaxComboFn();
    let changed = false;
    if (activeComboValue > maxVal) {
        activeComboValue = maxVal;
        changed = true;
    }
    
    // Preservation Check: If preserved, skip decay entirely
    if (isComboPreservedFn()) {
        if (changed) {
            notifyComboChange();
            scheduleSave();
        }
        return;
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
                    changed = true;
                }
            }
        }
    }
    if (changed) notifyComboChange();
}

// Returns the absolute value to add to the nerf exponent
export function getComboRestorationFactor() {
    if (!isSurge14ActiveFn()) return 0;
    
    // 1. Get Base Value
    let val = activeComboValue;
    
    // If preserved, decay doesn't apply, so factor is just raw value (capped at 1.0 logic handled elsewhere)
    // Actually the nerf restoration logic uses decayCounter to reduce effectiveness over time.
    // If preserved, decayCounter is always 0 (reset on load/init and never incremented in updateCombo).
    
    // 2. Apply Decay Penalty (Linear over 60s)
    let decayFactor = 0;
    if (decayCounter < DECAY_WINDOW_SEC) {
        decayFactor = Math.max(0, 1 - (decayCounter / DECAY_WINDOW_SEC));
    }
    
    return val * decayFactor;
}

export function initComboSystem(checkFn, maxComboFn, preservationFn) {
    if (typeof checkFn === 'function') {
        isSurge14ActiveFn = checkFn;
    }
    if (typeof maxComboFn === 'function') {
        getMaxComboFn = maxComboFn;
    }
    if (typeof preservationFn === 'function') {
        isComboPreservedFn = preservationFn;
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', resetState);
        
        resetState();
    }
}

// Debug Exports
export function setComboLocked(locked) { isComboLocked = !!locked; }
export function getComboLocked() { return isComboLocked; }
export function setActiveCombo(val) { 
    activeComboValue = Number(val) || 0; 
    notifyComboChange();
    if (isComboPreservedFn()) scheduleSave();
}
export function getActiveCombo() { return activeComboValue; }
export function getMaxCombo() { return getMaxComboFn(); }
export function addComboChangeListener(fn) { comboChangeListeners.add(fn); }
export function removeComboChangeListener(fn) { comboChangeListeners.delete(fn); }
