import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../../util/storage.js';
import { registerTick, registerFrame, FIXED_STEP } from '../../game/gameLoop.js';
import { addExternalCoinMultiplierProvider, refreshCoinMultiplierFromXpLevel } from '../../game/xpSystem.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { approxLog10BigNum } from '../../game/upgrades.js';
import { applyStatMultiplierOverride } from '../../util/debugPanel.js';
import { waterwheelRenderer } from '../../game/webgl/waterwheelRenderer.js';

/* =========================================
   CONSTANTS & KEYS
   ========================================= */

const KEY_PREFIX = 'ccc:flow'; 
const KEY_WATERWHEEL = (id, slot) => `${KEY_PREFIX}:${id}:${slot}`;

const EFFECT_PERCENTAGE = 100;

const WATERWHEELS = {
    COIN: 'coin'
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
    }
};

/* =========================================
   STATE
   ========================================= */

const fpMultiplierProviders = new Set();

let flowSystemInitialized = false;
let flowTabInitialized = false;
let flowPanel = null;
let currentMiniTexture = null;

const state = {
    waterwheels: {
        [WATERWHEELS.COIN]: {
            level: BigNum.fromInt(0),
            fp: 0,
            active: false,
            unlocked: true
        }
    },
    visuals: {
        [WATERWHEELS.COIN]: {
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
    
    // --- 1. Update Rotations (Simulation) ---
    for (const id in state.waterwheels) {
        if (!state.visuals[id]) continue;
        const v = state.visuals[id];
        
        if (v.speed > 0 || v.rotation > 0) {
            let speed = v.speed;
            if (v.isMax || speed > 20) speed = 20;

            v.rotation -= speed * 360 * dt;
            v.rotation %= 360;
        }
    }
    
    // --- 2. Gather Items for Renderer ---
    const items = [];
    const dpr = window.devicePixelRatio || 1;
    
    // Minis (Header)
    const miniRotation = (time / 8000) * Math.PI * 2;
    
    if (currentMiniTexture) {
        const minis = flowPanel.querySelectorAll('.flow-ww-anchor[data-type="mini"]');
        minis.forEach(el => {
            const rect = el.getBoundingClientRect();
            // Simple visibility check
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            
            items.push({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                size: Math.max(rect.width, rect.height), // Ensure square-ish
                rotation: miniRotation,
                imageUrl: currentMiniTexture,
                alpha: 1.0
            });
        });
    }
    
    // Mains (List)
    const mains = flowPanel.querySelectorAll('.flow-ww-anchor[data-type="main"]');
    mains.forEach(el => {
        const id = el.dataset.id;
        if (!id) return;
        
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        
        const def = WATERWHEEL_DEFS[id];
        if (!def) return;
        
        const v = state.visuals[id];
        let rotationDeg = v ? v.rotation : 0;
        let rotationRad = (rotationDeg * Math.PI) / 180;
        
        let cx = rect.left + rect.width / 2;
        let cy = rect.top + rect.height / 2;
        
        // Shake effect if Max
        if (v && v.isMax) {
             const dx = (Math.random() - 0.5) * 4;
             const dy = (Math.random() - 0.5) * 4;
             cx += dx;
             cy += dy;
        }
        
        items.push({
            x: cx,
            y: cy,
            size: Math.max(rect.width, rect.height),
            rotation: rotationRad,
            imageUrl: def.image,
            alpha: 1.0
        });
    });
    
    // --- 3. Render ---
    waterwheelRenderer.render(items);
}

/* =========================================
   UI
   ========================================= */

function createWaterwheelHTML(extraClass = '', type = 'mini', id = '') {
    const dataId = id ? `data-id="${id}"` : '';
    return `
        <div class="flow-ww-anchor ${extraClass}" data-type="${type}" ${dataId}></div>
    `;
}

function buildUI(panel) {
    panel.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'flow-tab';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-header';
    
    
    const explainer = document.createElement('div');
    explainer.className = 'flow-explainer';
    
    const minisLeft = document.createElement('div');
    minisLeft.className = 'flow-minis-col';
    minisLeft.innerHTML = Array(4).fill(null).map(() => createWaterwheelHTML('flow-ww-mini', 'mini')).join('');
    
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
    minisRight.innerHTML = Array(4).fill(null).map(() => createWaterwheelHTML('flow-ww-mini', 'mini')).join('');

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
        const item = document.createElement('div');
        item.className = 'flow-row';
        item.innerHTML = `
            <div class="flow-bar-container">
                 ${createWaterwheelHTML('flow-ww-main', 'main', id)}
                 <div class="flow-bar-inner">
                    <div class="flow-bar-fill" id="flow-fill-${id}"></div>
                    <div class="flow-bar-text">
                        <span class="flow-name-text">${def.name}</span>
                    </div>
                 </div>
            </div>
            
            <div class="flow-level-val" id="flow-lvl-${id}">0</div>
            
            <div class="flow-effect-val" id="flow-effect-${id}">+0%</div>
            
            <div class="flow-row-controls">
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
    
    // Update global state for minis
    currentMiniTexture = currentDef.image;
}

function alignFlowColumns() {
    if (!flowPanel) return;
    const header = flowPanel.querySelector('.flow-list-header');
    if (!header) return;

    if (header.children.length < 4) return;

    const levelHeader = header.children[1];
    const effectHeader = header.children[2];
    const stateHeader = header.children[3];

    const levelRect = levelHeader.getBoundingClientRect();
    const effectRect = effectHeader.getBoundingClientRect();
    const stateRect = stateHeader.getBoundingClientRect();

    const levelCenter = levelRect.left + levelRect.width / 2;
    const effectCenter = effectRect.left + effectRect.width / 2;
    const stateCenter = stateRect.left + stateRect.width / 2;

    const rows = flowPanel.querySelectorAll('.flow-row');
    rows.forEach(row => {
        const levelVal = row.querySelector('.flow-level-val');
        const effectVal = row.querySelector('.flow-effect-val');
        const stateVal = row.querySelector('.flow-row-controls'); // Centering controls under header

        if (levelVal) {
            levelVal.style.transform = '';
            const rect = levelVal.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            const diff = levelCenter - currentCenter;
            
            if (Math.abs(diff) > 0.5) {
                levelVal.style.transform = `translateX(${diff}px)`;
            }
        }

        if (effectVal) {
            effectVal.style.transform = '';
            const rect = effectVal.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            const diff = effectCenter - currentCenter;
            
            if (Math.abs(diff) > 0.5) {
                effectVal.style.transform = `translateX(${diff}px)`;
            }
        }

        if (stateVal) {
            stateVal.style.transform = '';
            const rect = stateVal.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            const diff = stateCenter - currentCenter;
            
            if (Math.abs(diff) > 0.5) {
                stateVal.style.transform = `translateX(${diff}px)`;
            }
        }
    });
}

function updateFlowVisuals() {
    if (!flowTabInitialized || !flowPanel) return;

    const fpMult = getFpMultiplier();

    for (const id in WATERWHEEL_DEFS) {
        const ch = state.waterwheels[id];
        
        const elLvl = flowPanel.querySelector(`#flow-lvl-${id}`);
        if (elLvl) elLvl.textContent = formatNumber(ch.level);
        
        const elEffect = flowPanel.querySelector(`#flow-effect-${id}`);
        if (elEffect) {
            const effectVal = ch.level.mulSmall(EFFECT_PERCENTAGE);
            elEffect.textContent = `+${formatNumber(effectVal)}%`;
        }
        
        const elFill = flowPanel.querySelector(`#flow-fill-${id}`);
        
        const req = WATERWHEEL_DEFS[id]?.baseReq;
        
        let fpVal = ch.fp;
        if (fpVal instanceof BigNum) {
             if (fpVal.isInfinite()) fpVal = Infinity;
             else try { fpVal = Number(fpVal.toScientific(5)); } catch { fpVal = 0; }
        }
        
        let pct = 0;
        if (req > 0) {
            pct = Math.min(100, Math.max(0, (fpVal / req) * 100));
        }
        
        // If active, visualize "full" if gain per tick is enough to fill?
        // Maybe not needed for ON/OFF system, but kept for consistency with logic
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
}

export function initFlowTab(panelEl) {
    if (flowTabInitialized) return;
    
    initFlowSystem();

    flowPanel = panelEl;
    
    // Init Renderer
    waterwheelRenderer.init(panelEl);
    
    buildUI(panelEl);
    flowTabInitialized = true;
    updateFlowTab();
    
    setTimeout(alignFlowColumns, 0);
    window.addEventListener('resize', alignFlowColumns);
}
