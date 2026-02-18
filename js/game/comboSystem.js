import { getActiveSlot } from '../util/storage.js';

// Configuration
const MAX_ACTIVE_TIME_SEC = 1000;
const DECAY_WINDOW_SEC = 15;
const MOVEMENT_HISTORY_WINDOW_MS = 2000;
const MIN_MOVEMENT_EXTENT_PX = 50;
const MIN_UNIQUE_REGIONS = 3;
const REGION_SIZE = 50; // Used for anti-macro grid

// State
let activeTimeSec = 0; // The "potential" combo time
let decayCounter = 0; // Integer seconds since last coin collection
let decayAccumulator = 0; // Float accumulator for partial seconds
let movementHistory = []; // { timestamp, x, y }
let isMoving = false;
let isSurge14ActiveFn = () => false;

// New: Rate limiting for growth
let lastGrowthTime = 0;

function resetState() {
    activeTimeSec = 0;
    decayCounter = 0;
    decayAccumulator = 0;
    movementHistory = [];
    isMoving = false;
    lastGrowthTime = 0;
}

export function onPointerMove(x, y) {
    if (!isSurge14ActiveFn()) return;
    
    isMoving = true;
    const now = performance.now();
    
    // Add to history
    movementHistory.push({ timestamp: now, x, y });
    
    // Prune old history
    const cutoff = now - MOVEMENT_HISTORY_WINDOW_MS;
    while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
        movementHistory.shift();
    }
}

export function onCoinCollected() {
    if (!isSurge14ActiveFn()) return;
    
    const now = performance.now();
    
    // Check activity FIRST
    if (!checkActivity(now)) {
        return; 
    }
    
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

function checkActivity(now) {
    if (movementHistory.length < 2) return false;
    
    const cutoff = now - MOVEMENT_HISTORY_WINDOW_MS;
    
    // Prune stale entries before checking
    while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
        movementHistory.shift();
    }

    if (movementHistory.length < 2) return false;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const uniqueRegions = new Set();

    for (const entry of movementHistory) {
        if (entry.x < minX) minX = entry.x;
        if (entry.x > maxX) maxX = entry.x;
        if (entry.y < minY) minY = entry.y;
        if (entry.y > maxY) maxY = entry.y;

        // Anti-macro: Count unique 50x50 regions visited
        const regionX = Math.floor(entry.x / REGION_SIZE);
        const regionY = Math.floor(entry.y / REGION_SIZE);
        uniqueRegions.add(`${regionX},${regionY}`);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Check 1: Must cover minimum extent (not just small twitching)
    if (width < MIN_MOVEMENT_EXTENT_PX && height < MIN_MOVEMENT_EXTENT_PX) {
        return false;
    }

    // Check 2: Must visit minimum number of unique regions (not just A <-> B macro)
    // A simple back-and-forth between two points might only visit 2 regions.
    if (uniqueRegions.size < MIN_UNIQUE_REGIONS) {
        return false;
    }

    return true;
}

export function updateCombo(dt) {
    if (!isSurge14ActiveFn()) return;
    
    const now = performance.now();
    
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
    
    // 2. Prune history
    const cutoff = now - MOVEMENT_HISTORY_WINDOW_MS;
    while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
        movementHistory.shift();
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
        
        window.addEventListener('pointermove', (e) => {
             onPointerMove(e.clientX, e.clientY);
        }, { passive: true });
        
        resetState();
    }
}
