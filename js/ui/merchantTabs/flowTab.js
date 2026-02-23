import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../../util/storage.js';
import { registerTick, FIXED_STEP } from '../../game/gameLoop.js';
import { addExternalCoinMultiplierProvider, refreshCoinMultiplierFromXpLevel } from '../../game/xpSystem.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { approxLog10BigNum } from '../../game/upgrades.js';
import { applyStatMultiplierOverride } from '../../util/debugPanel.js';

/* =========================================
   CONSTANTS & KEYS
   ========================================= */

const KEY_PREFIX = 'ccc:flow'; 
// Storing { [waterwheelId]: { level: '0', fp: '0', active: false } }
const KEY_FLOW_DATA = (slot) => `${KEY_PREFIX}:data:${slot}`;

const WATERWHEELS = {
    COIN: 'coin'
};

export const WATERWHEEL_DEFS = {
    [WATERWHEELS.COIN]: {
        id: WATERWHEELS.COIN,
        name: 'Coin',
        icon: 'img/currencies/coin/coin_plus_base.webp',
        baseReq: 10, // 10 FP per level
        description: 'Boosts Global Coin Value by +100% per level',
    }
};

/* =========================================
   STATE
   ========================================= */

const fpMultiplierProviders = new Set();

let flowSystemInitialized = false;
let flowTabInitialized = false;
let flowPanel = null;

const state = {
    waterwheels: {
        [WATERWHEELS.COIN]: {
            level: BigNum.fromInt(0),
            fp: 0,
            active: false
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
        const dataRaw = localStorage.getItem(KEY_FLOW_DATA(slot));
        if (dataRaw) {
            const parsed = JSON.parse(dataRaw);
            for (const id in parsed) {
                if (state.waterwheels[id]) {
                    state.waterwheels[id].level = BigNum.fromAny(parsed[id].level || 0);
                    state.waterwheels[id].fp = Number(parsed[id].fp || 0);
                    state.waterwheels[id].active = !!parsed[id].active;
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

    const dataToSave = {};
    for (const [id, ch] of Object.entries(state.waterwheels)) {
        dataToSave[id] = {
            level: ch.level.toStorage(),
            fp: (ch.fp instanceof BigNum) ? ch.fp.toStorage() : ch.fp,
            active: ch.active
        };
    }
    localStorage.setItem(KEY_FLOW_DATA(slot), JSON.stringify(dataToSave));
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

export function resetWaterwheels(type) {
    if (type === 'surge') {
        for (const id in state.waterwheels) {
            state.waterwheels[id].level = BigNum.fromInt(0);
            state.waterwheels[id].fp = 0;
        }
        saveState();
        updateFlowTab();
    }
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
        if (!ch.active) continue;

        // Debug Locking
        const fpLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:flow:fp:${id}:${slot}`);
        const levelLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:flow:level:${id}:${slot}`);

        if (fpLocked) continue;

        // Base rate 1 FP/sec
        let gainBn = BigNum.fromInt(1).mulDecimal(String(dt));
        
        // Apply FP Multiplier
        gainBn = gainBn.mulBigNumInteger(fpMult);
        
        // Apply Debug Override
        gainBn = applyStatMultiplierOverride('fp', gainBn);
        
        if (!gainBn.isZero()) visualUpdate = true;
        
        const req = WATERWHEEL_DEFS[id]?.baseReq;
        
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

/* =========================================
   UI
   ========================================= */

function buildUI(panel) {
    panel.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'flow-tab';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-header';
    header.innerHTML = `
        <div class="flow-explainer">
            Direct your Flow to make the Great Waterwheels turn,<br>
            Within the Forgotten Channels these hidden relics yearn,<br>
            To split the surging waters is a wish the depths denied,<br>
            So choose with careful strategy where power shall reside,<br>
            While each wheel works hard to increase your every gain,<br>
            As milestones unlock more links within the ancient chain,<br>
            Command the rushing waters, push the limits of the machine,<br>
            To wake the strongest multipliers that The Cove has ever seen.
        </div>
    `;
    wrapper.appendChild(header);

    // List
    const list = document.createElement('div');
    list.className = 'flow-list';
    
    // Header Row
    const listHeader = document.createElement('div');
    listHeader.className = 'flow-list-header';
    listHeader.innerHTML = `
        <div class="list-head-name">Waterwheels</div>
        <div class="list-head-level">Level</div>
        <div class="list-head-state">Flow State</div>
    `;
    list.appendChild(listHeader);
    
    // Rows
    for (const [id, def] of Object.entries(WATERWHEEL_DEFS)) {
        const item = document.createElement('div');
        item.className = 'flow-row';
        item.innerHTML = `
            <div class="flow-bar-container">
                 <img src="${def.icon}" class="flow-icon-overlay" alt="">
                 <div class="flow-bar-inner">
                    <div class="flow-bar-fill" id="flow-fill-${id}"></div>
                    <div class="flow-bar-text">
                        <span class="flow-name-text">${def.name}</span>
                    </div>
                 </div>
            </div>
            
            <div class="flow-level-val" id="flow-lvl-${id}">0</div>
            
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

function alignFlowColumns() {
    if (!flowPanel) return;
    const header = flowPanel.querySelector('.flow-list-header');
    if (!header) return;

    if (header.children.length < 3) return;

    const levelHeader = header.children[1];
    const stateHeader = header.children[2];

    const levelRect = levelHeader.getBoundingClientRect();
    const stateRect = stateHeader.getBoundingClientRect();

    const levelCenter = levelRect.left + levelRect.width / 2;
    const stateCenter = stateRect.left + stateRect.width / 2;

    const rows = flowPanel.querySelectorAll('.flow-row');
    rows.forEach(row => {
        const levelVal = row.querySelector('.flow-level-val');
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

    addExternalCoinMultiplierProvider((params) => getWaterwheelCoinMultiplier(params));
}

export function initFlowTab(panelEl) {
    if (flowTabInitialized) return;
    
    initFlowSystem();

    flowPanel = panelEl;
    buildUI(panelEl);
    flowTabInitialized = true;
    updateFlowTab();
    
    setTimeout(alignFlowColumns, 0);
    window.addEventListener('resize', alignFlowColumns);
}
