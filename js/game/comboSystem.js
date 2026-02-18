
import { getActiveSlot } from '../util/storage.js';

// Configuration
const MAX_ACTIVE_TIME_SEC = 1000;
const DECAY_WINDOW_SEC = 15;
const MOVEMENT_HISTORY_WINDOW_MS = 2000;
const MIN_UNIQUE_CELLS = 3;
const GRID_COLS = 10;
const GRID_ROWS = 10;

// State
let activeTimeSec = 0; // The "potential" combo time
let decayTimerSec = 0; // Time since last coin collection
let movementHistory = []; // { timestamp, col, row }
let isMoving = false;
let isSurge14ActiveFn = () => false;

// New: Rate limiting for growth
let lastGrowthTime = 0;

function resetState() {
    activeTimeSec = 0;
    decayTimerSec = 0;
    movementHistory = [];
    isMoving = false;
    lastGrowthTime = 0;
}

// Grid calculation
function getGridCell(x, y) {
    if (typeof window === 'undefined') return { col: 0, row: 0 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const col = Math.floor((x / w) * GRID_COLS);
    const row = Math.floor((y / h) * GRID_ROWS);
    return { col, row };
}

export function onPointerMove(x, y) {
    if (!isSurge14ActiveFn()) return;
    
    isMoving = true;
    const now = performance.now();
    
    // Add to history
    const cell = getGridCell(x, y);
    movementHistory.push({ timestamp: now, ...cell });
    
    // Prune old history
    const cutoff = now - MOVEMENT_HISTORY_WINDOW_MS;
    while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
        movementHistory.shift();
    }
}

export function onCoinCollected() {
    if (!isSurge14ActiveFn()) return;
    
    const now = performance.now();
    
    // Reset decay timer on collection
    decayTimerSec = 0;
    
    // Check activity for potential growth
    if (checkActivity(now)) {
        // Enforce 1 second rate limit
        // "collecting any amount of coins in a given second should increment the second counter up one second"
        
        // Initial state or long gap check
        if (now - lastGrowthTime >= 1000) {
            activeTimeSec += 1;
            if (activeTimeSec > MAX_ACTIVE_TIME_SEC) {
                activeTimeSec = MAX_ACTIVE_TIME_SEC;
            }
            lastGrowthTime = now;
        }
    }
}

function checkActivity(now) {
    if (movementHistory.length === 0) return false;
    
    // Count unique cells in history
    const uniqueCells = new Set();
    const cutoff = now - MOVEMENT_HISTORY_WINDOW_MS;
    
    // Prune stale entries before checking
    while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
        movementHistory.shift();
    }
    
    for (const entry of movementHistory) {
        uniqueCells.add(`${entry.col},${entry.row}`);
    }
    
    return uniqueCells.size >= MIN_UNIQUE_CELLS;
}

export function updateCombo(dt) {
    if (!isSurge14ActiveFn()) return;
    
    const now = performance.now();
    
    // 1. Process Decay
    // "if the 15 second timer fully goes by without any coins collected, the potential combo should be fully reset to 0"
    if (decayTimerSec < DECAY_WINDOW_SEC) {
        decayTimerSec += dt;
        if (decayTimerSec >= DECAY_WINDOW_SEC) {
            activeTimeSec = 0;
            // Note: We don't reset decayTimerSec here, it stays "expired" until a coin is collected.
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
    
    // 2. Calculate Decay Penalty (Linear decay over 15s)
    // "decrease every game tick for 15 seconds"
    // "if a coin is collected... reverted back to the maximum potential"
    // So if decayTimer is 0, factor is 1.0. If 7.5s, factor is 0.5. If 15s, factor is 0.0.
    let decayFactor = 0;
    if (decayTimerSec < DECAY_WINDOW_SEC) {
        decayFactor = Math.max(0, 1 - (decayTimerSec / DECAY_WINDOW_SEC));
    }
    
    return potential * decayFactor;
}

export function initComboSystem(checkFn) {
    if (typeof checkFn === 'function') {
        isSurge14ActiveFn = checkFn;
    }

    if (typeof window !== 'undefined') {
        // Reset state on slot load
        window.addEventListener('saveSlot:change', resetState);
        
        // Listen for global pointer movement to feed combo system
        window.addEventListener('pointermove', (e) => {
             onPointerMove(e.clientX, e.clientY);
        }, { passive: true });
        
        // Initial reset
        resetState();
    }
}