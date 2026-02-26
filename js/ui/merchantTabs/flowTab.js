import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../../util/storage.js';
import { registerTick, registerFrame, FIXED_STEP } from '../../game/gameLoop.js';
import { addExternalCoinMultiplierProvider, refreshCoinMultiplierFromXpLevel, addExternalXpGainMultiplierProvider } from '../../game/xpSystem.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { approxLog10BigNum } from '../../game/upgrades.js';
import { applyStatMultiplierOverride } from '../../util/debugPanel.js';
import { WaterwheelRenderer } from '../../game/webgl/waterwheelRenderer.js';

/* =========================================
   CONSTANTS & KEYS
   ========================================= */

const KEY_PREFIX = 'ccc:flow'; 
const KEY_WATERWHEEL = (id, slot) => `${KEY_PREFIX}:${id}:${slot}`;

const EFFECT_PERCENTAGE = 100;

const WATERWHEELS = {
    COIN: 'coin',
    XP: 'xp'
};

export const WATERWHEEL_DEFS = {
    [WATERWHEELS.COIN]: {
        id: WATERWHEELS.COIN,
        name: 'Coin Waterwheel',
        icon: 'img/waterwheels/waterwheel_coin.webp',
        image: 'img/waterwheels/waterwheel_coin.webp',
        baseReq: 10, // 10 FP per level
        description: 'Boosts Global Coin Value by +100% per level',
        unlocked: true,
        styleKey: 'coins'
    },
    [WATERWHEELS.XP]: {
        id: WATERWHEELS.XP,
        name: 'XP Waterwheel',
        icon: 'img/waterwheels/waterwheel_xp.webp',
        image: 'img/waterwheels/waterwheel_xp.webp',
        baseReq: 1000, // 1000 FP per level
        description: 'Boosts Global XP Gain by +100% per level',
        unlocked: false,
        prev: WATERWHEELS.COIN,
        unlockReq: 1000,
        styleKey: 'xp'
    }
};

/* =========================================
   STATE
   ========================================= */

const fpMultiplierProviders = new Set();
const waterwheelRenderer = new WaterwheelRenderer();

let flowSystemInitialized = false;
let flowTabInitialized = false;
let flowPanel = null;

const state = {
    waterwheels: {
        [WATERWHEELS.COIN]: {
            level: BigNum.fromInt(0),
            fp: 0,
            active: false,
            unlocked: true
        },
        [WATERWHEELS.XP]: {
            level: BigNum.fromInt(0),
            fp: 0,
            active: false,
            unlocked: false
        }
    },
    visuals: {
        [WATERWHEELS.COIN]: {
            rotation: 0,
            speed: 0,
            isMax: false
        },
        [WATERWHEELS.XP]: {
            rotation: 0,
            speed: 0,
            isMax: false
        }
    }
};

/* =========================================
   PERSISTENCE
   ========================================= */

function getSlot() {
    return getActiveSlot();
}

function loadState() {
    const slot = getSlot();
    if (slot == null) return;

    // Load Flow Data
    try {
        // Migration: Check for old single-object key
        const oldKey = `${KEY_PREFIX}:data:${slot}`;
        const oldDataRaw = localStorage.getItem(oldKey);
        
        if (oldDataRaw) {
            // Migration Path
            try {
                const parsed = JSON.parse(oldDataRaw);
                for (const id in parsed) {
                    if (state.waterwheels[id]) {
                        state.waterwheels[id].level = BigNum.fromAny(parsed[id].level || 0);
                        state.waterwheels[id].fp = Number(parsed[id].fp || 0);
                        state.waterwheels[id].active = !!parsed[id].active;
                    }
                }
                // Save to new individual keys
                saveState();
                // Clean up old key
                localStorage.removeItem(oldKey);
            } catch (e) {
                console.warn("Migration failed for flow data", e);
            }
        } else {
            // Standard Load from individual keys
            for (const id in state.waterwheels) {
                const key = KEY_WATERWHEEL(id, slot);
                const dataRaw = localStorage.getItem(key);
                if (dataRaw) {
                    const parsed = JSON.parse(dataRaw);
                    state.waterwheels[id].level = BigNum.fromAny(parsed.level || 0);
                    state.waterwheels[id].fp = Number(parsed.fp || 0);
                    state.waterwheels[id].active = !!parsed.active;
                    state.waterwheels[id].unlocked = parsed.unlocked !== undefined ? !!parsed.unlocked : (WATERWHEEL_DEFS[id]?.unlocked || false);
                }
            }
        }
    } catch (e) {
        console.warn("Failed to load flow data", e);
    }
    
    // Ensure only one is active (safety check)
    let activeCount = 0;
    for (const ch of Object.values(state.waterwheels)) {
        if (ch.active) activeCount++;
    }
    if (activeCount > 1) {
        // Reset if invalid, keep the first one found or reset all
        let found = false;
        for (const id in state.waterwheels) {
            if (state.waterwheels[id].active) {
                if (found) state.waterwheels[id].active = false;
                else found = true;
            }
        }
    }
}

function saveState() {
    const slot = getSlot();
    if (slot == null) return;

    for (const [id, ch] of Object.entries(state.waterwheels)) {
        const dataToSave = {
            level: ch.level.toStorage(),
            fp: (ch.fp instanceof BigNum) ? ch.fp.toStorage() : ch.fp,
            active: ch.active,
            unlocked: ch.unlocked
        };
        localStorage.setItem(KEY_WATERWHEEL(id, slot), JSON.stringify(dataToSave));
    }
}

let saveTimeout = null;
function scheduleSave() {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        saveState();
    }, 2000);
}

/* =========================================
   LOGIC
   ========================================= */

export function toggleWaterwheel(waterwheelId) {
    const ch = state.waterwheels[waterwheelId];
    if (!ch) return;
    if (!ch.unlocked) return; // Prevent toggling if locked

    const wasActive = ch.active;

    // If turning ON, deactivate all others first
    if (!wasActive) {
        for (const id in state.waterwheels) {
            state.waterwheels[id].active = false;
        }
        ch.active = true;
    } else {
        // If turning OFF
        ch.active = false;
        // Reset speed
        if (state.visuals[waterwheelId]) {
            state.visuals[waterwheelId].speed = 0;
            state.visuals[waterwheelId].isMax = false;
        }
    }
    
    saveState();
    updateFlowTab();
}

export function getFlowUnlockState() {
    const slot = getSlot();
    if (slot != null) {
        try {
            if (localStorage.getItem(`ccc:unlock:flow:${slot}`) === '1') return true;
        } catch {}
    }

    if (_unlockChecker) {
        return _unlockChecker(20);
    }
    
    return false;
}

export function isFlowUnlocked() {
    return getFlowUnlockState();
}

let _unlockChecker = null;
export function setFlowUnlockChecker(fn) {
    _unlockChecker = fn;
}



export function getWaterwheelCoinMultiplier({ baseMultiplier }) {
    const level = state.waterwheels[WATERWHEELS.COIN]?.level || BigNum.fromInt(0);
    const mult = BigNum.fromInt(1).add(level);
    return baseMultiplier.mulBigNumInteger(mult);
}

export function getWaterwheelXpMultiplier({ baseGain }) {
    const level = state.waterwheels[WATERWHEELS.XP]?.level || BigNum.fromInt(0);
    // +100% per level means multiplier = 1 + level
    // e.g. level 1 -> 2x multiplier (+100%)
    const mult = BigNum.fromInt(1).add(level);
    return baseGain.mulBigNumInteger(mult);
}

export function addExternalFpMultiplierProvider(fn) {
    if (typeof fn === 'function') fpMultiplierProviders.add(fn);
}

export function getFpMultiplier() {
    let mult = BigNum.fromInt(1);
    for (const provider of fpMultiplierProviders) {
        try {
            const res = provider(mult.clone());
            if (res instanceof BigNum) mult = res;
            else if (typeof res === 'number') mult = BigNum.fromAny(res);
        } catch {}
    }
    return mult;
}

// --- Debug Panel Helpers ---

export function getWaterwheelLevel(id) {
    return state.waterwheels[id]?.level || BigNum.fromInt(0);
}

export function setWaterwheelLevel(id, val) {
    if (!state.waterwheels[id]) return;
    state.waterwheels[id].level = val instanceof BigNum ? val : BigNum.fromAny(val);
    saveState();
    updateFlowTab();
    refreshCoinMultiplierFromXpLevel();
    window.dispatchEvent(new CustomEvent('flow:change', { detail: { id, type: 'level' } }));
}

export function getWaterwheelFp(id) {
    return state.waterwheels[id]?.fp || 0;
}

export function setWaterwheelFp(id, val) {
    if (!state.waterwheels[id]) return;
    state.waterwheels[id].fp = val; 
    saveState();
    updateFlowTab();
    window.dispatchEvent(new CustomEvent('flow:change', { detail: { id, type: 'fp' } }));
}

export function calculateWaterwheelOffline(seconds) {
    if (!isFlowUnlocked()) return {};

    const fpMult = getFpMultiplier();
    const result = {};
    // Base rate 1 FP/sec
    let totalGainBn = BigNum.fromInt(1).mulDecimal(String(seconds));
    totalGainBn = totalGainBn.mulBigNumInteger(fpMult);
    totalGainBn = applyStatMultiplierOverride('fp', totalGainBn);

    if (totalGainBn.isZero()) return {};

    for (const id in state.waterwheels) {
        const ch = state.waterwheels[id];
        if (!ch.active) continue;

        const req = WATERWHEEL_DEFS[id]?.baseReq || 10;
        
        let currentFpBn;
        if (ch.fp instanceof BigNum) currentFpBn = ch.fp.clone();
        else currentFpBn = BigNum.fromAny(ch.fp);
        
        let finalFpBn = currentFpBn.add(totalGainBn);
        let levelsGained = BigNum.fromInt(0);

        if (!finalFpBn.isInfinite()) {
             const reqBn = BigNum.fromInt(req);
             const levels = finalFpBn.div(reqBn).floorToInteger();
             
             if (!levels.isZero()) {
                 levelsGained = levels;
                 finalFpBn = finalFpBn.sub(levels.mulSmall(req));
             }
        }
        
        // Return result if there was any gain (levels or just fp progress)
        result[id] = {
            levels: levelsGained,
            fp: finalFpBn,
            name: WATERWHEEL_DEFS[id]?.name || id
        };
    }
    
    return result;
}

export function applyWaterwheelOffline(offlineData) {
    if (!offlineData) return;
    let changes = false;
    
    for (const id in offlineData) {
        const data = offlineData[id];
        const ch = state.waterwheels[id];
        if (!ch) continue;
        
        if (data.levels && !data.levels.isZero()) {
             ch.level = ch.level.add(data.levels);
             changes = true;
        }
        
        if (data.fp !== undefined) {
            // Convert to number if small enough, consistent with onTick
            if (data.fp instanceof BigNum) {
                const val = Number(data.fp.toScientific(5));
                if (Number.isFinite(val) && val < 1e15) {
                    ch.fp = val;
                } else {
                    ch.fp = data.fp;
                }
            } else {
                ch.fp = data.fp;
            }
        }
    }
    
    if (changes) {
        saveState();
        updateFlowTab();
        refreshCoinMultiplierFromXpLevel();
    }
}

/* =========================================
   GAME LOOP
   ========================================= */

function onTick(dt) {
    if (!isFlowUnlocked()) return;

    let changes = false;
    let visualUpdate = false;

    // dt is in seconds
    // Requirement: 1 FP/sec for active waterwheel * FP Multiplier
    
    const fpMult = getFpMultiplier();
    const slot = getSlot();
    
    // Unlock Logic
    // Check XP unlock condition: Coin Waterwheel Level >= 1000
    // We do this check before processing gains, so it updates dynamically
    const coinLevel = state.waterwheels[WATERWHEELS.COIN]?.level || BigNum.fromInt(0);
    const xpDef = WATERWHEEL_DEFS[WATERWHEELS.XP];
    
    // Generic Unlock Logic check (future proofing)
    for (const id in WATERWHEEL_DEFS) {
        const def = WATERWHEEL_DEFS[id];
        if (def.prev && def.unlockReq) {
            const prevCh = state.waterwheels[def.prev];
            if (prevCh) {
                const threshold = BigNum.fromInt(def.unlockReq);
                const shouldUnlock = prevCh.level.cmp(threshold) >= 0;
                
                if (state.waterwheels[id].unlocked !== shouldUnlock) {
                    state.waterwheels[id].unlocked = shouldUnlock;
                    changes = true;
                    
                    if (!shouldUnlock && state.waterwheels[id].active) {
                        state.waterwheels[id].active = false;
                        // Reset visuals for this one
                         if (state.visuals[id]) {
                            state.visuals[id].speed = 0;
                            state.visuals[id].isMax = false;
                        }
                    }
                }
            }
        }
    }

    for (const id in state.waterwheels) {
        const ch = state.waterwheels[id];
        // Ensure visual state exists
        if (!state.visuals[id]) state.visuals[id] = { rotation: 0, speed: 0, isMax: false };
        
        if (!ch.active) {
            state.visuals[id].speed = 0;
            state.visuals[id].isMax = false;
            continue;
        }

        // Debug Locking
        const fpLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:flow:fp:${id}:${slot}`);
        const levelLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:flow:level:${id}:${slot}`);

        if (fpLocked) {
            state.visuals[id].speed = 0;
            state.visuals[id].isMax = false;
            continue;
        }

        // Base rate 1 FP/sec
        let gainBn = BigNum.fromInt(1).mulDecimal(String(dt));
        
        // Apply FP Multiplier
        gainBn = gainBn.mulBigNumInteger(fpMult);
        
        // Apply Debug Override
        gainBn = applyStatMultiplierOverride('fp', gainBn);
        
        if (!gainBn.isZero()) visualUpdate = true;
        
        const req = WATERWHEEL_DEFS[id]?.baseReq;

        // --- Visual Speed Calculation ---
        const reqBn = BigNum.fromInt(req);
        // If gain per tick >= requirement, bar is filling instantly every tick -> Max Speed
        if (gainBn.cmp(reqBn) >= 0) {
            state.visuals[id].isMax = true;
            state.visuals[id].speed = 20;
        } else {
            state.visuals[id].isMax = false;
            // gainBn is gain per tick (approx 0.05s). 
            // gainPerSec = gainBn / dt
            // speed = gainPerSec / req = (gainBn / dt) / req
            let gainVal = 0;
            try {
                gainVal = Number(gainBn.toScientific(5));
            } catch { gainVal = 0; }
            
            // Avoid division by zero
            if (dt > 0 && req > 0) {
                state.visuals[id].speed = (gainVal / dt) / req;
            } else {
                state.visuals[id].speed = 0;
            }
        }
        
        if (gainBn.cmp(1e15) > 0) {
            if (!levelLocked) {
                const levels = gainBn.div(req).floorToInteger();
                ch.level = ch.level.add(levels);
                changes = true;
            }
        } else {
            const gain = Number(gainBn.toScientific(10));
            
            if (ch.fp instanceof BigNum) {
                if (ch.fp.isInfinite()) {
                    if (!levelLocked) {
                        ch.level = BigNum.fromAny('Infinity');
                        changes = true;
                    }
                } else {
                    ch.fp = ch.fp.add(gain);
                    let levels = ch.fp.div(req).floorToInteger();
                    
                    if (!levels.isZero()) {
                        if (!levelLocked) {
                            ch.level = ch.level.add(levels);
                        }
                        ch.fp = ch.fp.sub(levels.mulSmall(req));
                        changes = true;
                    }
                }
            } else {
                ch.fp += gain;
                
                if (!Number.isFinite(ch.fp)) {
                     ch.fp = BigNum.fromAny(ch.fp);
                     if (!levelLocked) {
                         ch.level = BigNum.fromAny('Infinity');
                         changes = true;
                     }
                } else {
                    if (ch.fp >= req) {
                        const levels = Math.floor(ch.fp / req);
                        if (levels > 0) {
                            if (!levelLocked) {
                                ch.level = ch.level.add(BigNum.fromInt(levels));
                            }
                            ch.fp -= levels * req;
                            changes = true;
                        }
                    }
                }
            }
        }
    }

    if (flowTabInitialized && flowPanel) {
        updateWaterwheelVisuals();
    }

    if (changes) {
        updateFlowTab();
        scheduleSave();
        refreshCoinMultiplierFromXpLevel();
        window.dispatchEvent(new CustomEvent('flow:change', { detail: { type: 'tick' } }));
    } else if (visualUpdate) {
        if (flowTabInitialized && flowPanel) {
            updateFlowVisuals();
        }
        window.dispatchEvent(new CustomEvent('flow:change', { detail: { type: 'tick-visual' } }));
    }
}

function onFrame(time, dt) {
    if (!flowTabInitialized || !flowPanel) return;

    if (!flowPanel.classList.contains('is-active')) return;
    if (!flowPanel.closest('.merchant-overlay.is-open')) return;
    
    // --- Render WebGL Waterwheels ---
    waterwheelRenderer.render(dt);

    for (const id in state.waterwheels) {
        if (!state.visuals[id]) continue;
        const v = state.visuals[id];
        
        if (v.speed > 0 || v.rotation > 0) {
            let speed = v.speed;
            if (v.isMax || speed > 20) speed = 20;

            v.rotation -= speed * 360 * dt;
            v.rotation %= 360;

            const el = document.getElementById(`flow-icon-${id}`);
            if (el) {
                let transform = `translateY(-50%) rotate(${v.rotation}deg)`;
                
                if (v.isMax) {
                    // Shake effect at max speed
                    // Random offset between -2px and 2px
                    const dx = (Math.random() - 0.5) * 4;
                    const dy = (Math.random() - 0.5) * 4;
                    transform = `translate(${dx}px, calc(-50% + ${dy}px)) rotate(${v.rotation}deg)`;
                }
                
                el.style.transform = transform;
            }
        }
    }
}

/* =========================================
   UI
   ========================================= */

function createWaterwheelHTML(extraClass = '') {
    // 4 Layers for double-sided faces:
    // 1: Front (Bright)
    // 2: Back of Front (Dark)
    // 3: Front of Back (Dark)
    // 4: Back (Bright)
    const layers = Array(4).fill(0).map((_, i) => 
        `<img src="" class="flow-ww-img flow-ww-layer" alt="">`
    ).join('');

    return `
        <div class="flow-ww-wrapper ${extraClass}">
             ${layers}
        </div>
    `;
}

function buildUI(panel) {
    console.log("Building Flow UI. DEFS keys:", Object.keys(WATERWHEEL_DEFS));
    panel.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'flow-tab';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-header';
    
    
    const explainer = document.createElement('div');
    explainer.className = 'flow-explainer';
    
    // REPLACE: Create Canvases instead of divs
    const minisLeft = document.createElement('div');
    minisLeft.className = 'flow-minis-col';
    // Use canvas elements
    minisLeft.innerHTML = Array(4).fill(null).map(() => 
        `<canvas class="flow-ww-canvas" width="80" height="80" style="width: 80px; height: 80px;"></canvas>`
    ).join('');
    
    const text = document.createElement('div');
    text.className = 'flow-explainer-text';
    text.innerHTML = `
        Direct your Flow to make the Great Waterwheels turn,<br>
        Within the Forgotten Channels these hidden relics yearn,<br>
        To split the surging waters is a wish the depths denied,<br>
        So choose with careful strategy where power shall reside,<br>
        While each wheel works hard to increase your every gain,<br>
        As milestones unlock more links within the ancient chain,<br>
        Command the rushing waters, push the limits of the machine,<br>
        To wake the strongest multipliers that The Cove has ever seen.
    `;

    const minisRight = document.createElement('div');
    minisRight.className = 'flow-minis-col';
    // Use canvas elements
    minisRight.innerHTML = Array(4).fill(null).map(() => 
        `<canvas class="flow-ww-canvas" width="80" height="80" style="width: 80px; height: 80px;"></canvas>`
    ).join('');

    explainer.appendChild(minisLeft);
    explainer.appendChild(text);
    explainer.appendChild(minisRight);


    header.appendChild(explainer);
    wrapper.appendChild(header);

    // List
    const list = document.createElement('div');
    list.className = 'flow-list';
    
    // Header Row
    const listHeader = document.createElement('div');
    listHeader.className = 'flow-list-header';
    listHeader.innerHTML = `
        <div class="list-head-name">Waterwheel</div>
        <div class="list-head-level">Level</div>
        <div class="list-head-effect">Effect</div>
        <div class="list-head-state">Flow State</div>
    `;
    list.appendChild(listHeader);
    
    // Rows
    for (const [id, def] of Object.entries(WATERWHEEL_DEFS)) {
        console.log("Creating row for:", id, def);
        const item = document.createElement('div');
        item.className = 'flow-row';
        item.innerHTML = `
            <div class="flow-bar-container">
                 <img src="${def.icon}" class="flow-icon-overlay" id="flow-icon-${id}" alt="">
                 <div class="flow-bar-inner">
                    <div class="flow-bar-fill" id="flow-fill-${id}"></div>
                    <div class="flow-bar-text">
                        <span class="flow-name-text" id="flow-name-${id}">${def.name}</span>
                    </div>
                 </div>
            </div>
            
            <div class="flow-level-val" id="flow-lvl-${id}">0</div>
            
            <div class="flow-effect-val" id="flow-effect-${id}">+0%</div>
            
            <div class="flow-row-controls" id="flow-controls-${id}">
                <button class="flow-toggle-btn" data-id="${id}">OFF</button>
            </div>
        `;
        list.appendChild(item);
    }
    wrapper.appendChild(list);
    panel.appendChild(wrapper);

    // Bind Events
    wrapper.querySelectorAll('.flow-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            toggleWaterwheel(id);
        });
    });
}

export function updateFlowTab() {
    if (!flowTabInitialized || !flowPanel) return;
    
    updateFlowVisuals();

    // Update Buttons
    for (const id in WATERWHEEL_DEFS) {
        const ch = state.waterwheels[id];
        const btn = flowPanel.querySelector(`.flow-toggle-btn[data-id="${id}"]`);
        
        if (btn) {
            if (ch.active) {
                btn.textContent = "ON";
                btn.classList.add('is-active');
            } else {
                btn.textContent = "OFF";
                btn.classList.remove('is-active');
            }
        }
    }

    alignFlowColumns();
}

function updateWaterwheelVisuals() {
    if (!flowPanel) return;
    
    const unlocked = [];
    for (const id in state.waterwheels) {
        if (state.waterwheels[id].unlocked) {
            const def = WATERWHEEL_DEFS[id];
            if (def && def.image) unlocked.push(def);
        }
    }
    
    if (unlocked.length === 0) return;
    
    const time = Date.now();
    const index = Math.floor(time / 2000) % unlocked.length;
    const currentDef = unlocked[index];
    
    // Update WebGL Texture
    waterwheelRenderer.setImage(currentDef.image);
    
    const imgs = flowPanel.querySelectorAll('.flow-ww-img');
    imgs.forEach(img => {
        // Only update if src is different to avoid flicker/reload
        if (!img.src || img.src.indexOf(currentDef.image) === -1) {
            img.src = currentDef.image;
        }
    });
}

/**
 * Refines the alignment of the Flow tab columns by measuring header positions
 * and applying compensatory transforms to the row values.
 */
function alignFlowColumns() {
    if (!flowPanel || !flowPanel.isConnected) return;
    
    const header = flowPanel.querySelector('.flow-list-header');
    if (!header || header.offsetParent === null) return; // Hidden or not rendered

    if (header.children.length < 4) return;

    const levelHeader = header.children[1];
    const effectHeader = header.children[2];
    const stateHeader = header.children[3];

    const rows = Array.from(flowPanel.querySelectorAll('.flow-row'));
    
    // Collect all elements to manage
    const levelEls = [levelHeader];
    const effectEls = [effectHeader];
    const stateEls = [stateHeader];
    
    rows.forEach(row => {
        const l = row.querySelector('.flow-level-val');
        const e = row.querySelector('.flow-effect-val');
        const s = row.querySelector('.flow-row-controls');
        if (l) levelEls.push(l);
        if (e) effectEls.push(e);
        if (s) stateEls.push(s);
    });

    // 1. Reset Transforms (Batch Write)
    levelEls.forEach(el => el.style.transform = '');
    effectEls.forEach(el => el.style.transform = '');
    stateEls.forEach(el => el.style.transform = '');

    // 2. Measure Centers (Batch Read)
    const getCenter = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.left + rect.width / 2;
    };
    
    let maxLevelCenter = 0;
    levelEls.forEach(el => maxLevelCenter = Math.max(maxLevelCenter, getCenter(el)));
    
    let maxEffectCenter = 0;
    effectEls.forEach(el => maxEffectCenter = Math.max(maxEffectCenter, getCenter(el)));
    
    let maxStateCenter = 0;
    stateEls.forEach(el => maxStateCenter = Math.max(maxStateCenter, getCenter(el)));

    // 3. Apply Transforms (Batch Write)
    const alignGroup = (els, targetCenter, headerOffset = 0) => {
        els.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const center = rect.left + rect.width / 2;
            let diff = targetCenter - center;
            
            if (index === 0) { // Header
                diff += headerOffset;
            }

            if (Math.abs(diff) > 0.5) {
                el.style.transform = `translateX(${diff}px)`;
            }
        });
    };
    
    alignGroup(levelEls, maxLevelCenter);
    alignGroup(effectEls, maxEffectCenter);
    alignGroup(stateEls, maxStateCenter, -1);
}

function updateFlowVisuals() {
    if (!flowTabInitialized || !flowPanel) return;

    const fpMult = getFpMultiplier();

    for (const id in WATERWHEEL_DEFS) {
        const ch = state.waterwheels[id];
        const def = WATERWHEEL_DEFS[id];
        
        const elIcon = flowPanel.querySelector(`#flow-icon-${id}`);
        const elLvl = flowPanel.querySelector(`#flow-lvl-${id}`);
        const elEffect = flowPanel.querySelector(`#flow-effect-${id}`);
        const elControls = flowPanel.querySelector(`#flow-controls-${id}`);
        const elName = flowPanel.querySelector(`#flow-name-${id}`);
        const elFill = flowPanel.querySelector(`#flow-fill-${id}`);
        
        if (!ch.unlocked) {
            // Locked State
            if (elIcon) elIcon.style.opacity = '0';
            if (elLvl) elLvl.style.visibility = 'hidden';
            if (elEffect) elEffect.style.visibility = 'hidden';
            if (elControls) elControls.style.visibility = 'hidden';
            
            if (elName) {
                elName.textContent = `Level ${formatNumber(def.unlockReq)} in prev.`;
                elName.classList.add('flow-locked-text');
            }
            
            if (elFill) elFill.style.width = '0%';
            
        } else {
            // Unlocked State
            if (elIcon) elIcon.style.opacity = '1';
            if (elLvl) {
                 elLvl.style.visibility = 'visible';
                 elLvl.textContent = formatNumber(ch.level);
            }
            if (elEffect) {
                elEffect.style.visibility = 'visible';
                const effectVal = ch.level.mulSmall(EFFECT_PERCENTAGE);
                elEffect.textContent = `+${formatNumber(effectVal)}%`;
            }
            if (elControls) elControls.style.visibility = 'visible';
            
            if (elName) {
                elName.textContent = def.name;
                elName.classList.remove('flow-locked-text');
            }
            
            const req = def?.baseReq;
            
            let fpVal = ch.fp;
            if (fpVal instanceof BigNum) {
                 if (fpVal.isInfinite()) fpVal = Infinity;
                 else try { fpVal = Number(fpVal.toScientific(5)); } catch { fpVal = 0; }
            }
            
            let pct = 0;
            if (req > 0) {
                pct = Math.min(100, Math.max(0, (fpVal / req) * 100));
            }
            
            if (ch.active) {
                const safeFixedStep = (typeof FIXED_STEP === 'number' && FIXED_STEP > 0) ? FIXED_STEP : 0.05;
                const threshold = req / safeFixedStep;
                
                let effectiveRate = BigNum.fromInt(1);
                if (fpMult && !fpMult.isZero()) {
                     effectiveRate = effectiveRate.mulBigNumInteger(fpMult);
                }
                effectiveRate = applyStatMultiplierOverride('fp', effectiveRate);
                
                if (effectiveRate.isInfinite() || effectiveRate.cmp(threshold) >= 0) {
                    pct = 100;
                }
            }

            if (elFill) elFill.style.width = `${pct}%`;
        }
    }
}

/* =========================================
   INITIALIZATION
   ========================================= */

export function initFlowSystem() {
    if (flowSystemInitialized) return;
    flowSystemInitialized = true;

    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', () => {
            loadState();
            updateFlowTab();
        });
    }
    loadState();

    registerTick((dt) => onTick(dt));
    registerFrame((time, dt) => onFrame(time, dt));

    addExternalCoinMultiplierProvider((params) => getWaterwheelCoinMultiplier(params));
    addExternalXpGainMultiplierProvider((params) => getWaterwheelXpMultiplier(params));
}

export function initFlowTab(panelEl) {
    if (flowTabInitialized) return;
    
    initFlowSystem();

    flowPanel = panelEl;
    buildUI(panelEl);

    // Initialize WebGL Canvases
    const canvases = flowPanel.querySelectorAll('.flow-ww-canvas');
    waterwheelRenderer.clear();
    canvases.forEach(c => waterwheelRenderer.addCanvas(c));

    flowTabInitialized = true;
    updateFlowTab();
    
    setTimeout(alignFlowColumns, 0);
    window.addEventListener('resize', alignFlowColumns);
}
