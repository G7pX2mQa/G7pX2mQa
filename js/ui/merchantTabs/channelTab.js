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

const KEY_PREFIX = 'ccc:channel';
const KEY_FOCUS_CAPACITY = (slot) => `${KEY_PREFIX}:capacity:${slot}`;
// We store channel data in a single JSON object for simplicity, or separate keys? 
// Separate keys are safer for partial updates/watches, but JSON is cleaner for "list of channels".
// Given we only have one channel now, let's use a structured key per channel or a single state object.
// Let's use `${KEY_PREFIX}:data:${slot}` storing { [channelId]: { level: '0', fp: '0', allocated: 0 } }
const KEY_CHANNEL_DATA = (slot) => `${KEY_PREFIX}:data:${slot}`;

const BASE_FOCUS_COST_LOG = 999; // 1e999
const MAX_FOCUS_CAPACITY = 1000;

const CHANNELS = {
    COIN: 'coin'
};

export const CHANNEL_DEFS = {
    [CHANNELS.COIN]: {
        id: CHANNELS.COIN,
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

let channelSystemInitialized = false;
let channelTabInitialized = false;
let channelPanel = null;

const state = {
    focusCapacity: 1,
    channels: {
        [CHANNELS.COIN]: {
            level: BigNum.fromInt(0),
            fp: 0, // float for sub-1 amounts, or BigNum if huge/debug
            allocated: 0
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

    // Load Capacity
    try {
        const capRaw = localStorage.getItem(KEY_FOCUS_CAPACITY(slot));
        state.focusCapacity = capRaw ? parseInt(capRaw, 10) : 1;
        if (isNaN(state.focusCapacity)) state.focusCapacity = 1;
    } catch {
        state.focusCapacity = 1;
    }

    // Load Channel Data
    try {
        const dataRaw = localStorage.getItem(KEY_CHANNEL_DATA(slot));
        if (dataRaw) {
            const parsed = JSON.parse(dataRaw);
            for (const id in parsed) {
                if (state.channels[id]) {
                    state.channels[id].level = BigNum.fromAny(parsed[id].level || 0);
                    // Persistence of huge FP (BigNum) is not strictly supported by JSON.parse/stringify directly without custom reviver
                    // but we generally rely on number for FP. If it was huge, it resets on reload to Number (Infinity if too big).
                    // This is acceptable behavior for now.
                    state.channels[id].fp = Number(parsed[id].fp || 0);
                    state.channels[id].allocated = Number(parsed[id].allocated || 0);
                }
            }
        }
    } catch (e) {
        console.warn("Failed to load channel data", e);
    }
    
    // Ensure allocation doesn't exceed capacity (safety check)
    let totalAlloc = 0;
    for (const ch of Object.values(state.channels)) {
        totalAlloc += ch.allocated;
    }
    if (totalAlloc > state.focusCapacity) {
        // Reset allocations if invalid
        for (const id in state.channels) {
            state.channels[id].allocated = 0;
        }
    }
}

function saveState() {
    const slot = getSlot();
    if (slot == null) return;

    localStorage.setItem(KEY_FOCUS_CAPACITY(slot), String(state.focusCapacity));

    const dataToSave = {};
    for (const [id, ch] of Object.entries(state.channels)) {
        dataToSave[id] = {
            level: ch.level.toStorage(),
            fp: (ch.fp instanceof BigNum) ? ch.fp.toStorage() : ch.fp,
            allocated: ch.allocated
        };
    }
    localStorage.setItem(KEY_CHANNEL_DATA(slot), JSON.stringify(dataToSave));
}

// Partial save for frequent updates (game loop)?
// Actually, saving every tick is bad. We should save periodically or on important events.
// But for this task, standard practice in this codebase seems to be `saveSlot:change` reloads,
// and we might rely on auto-save or explicit save triggers.
// `util/storage.js` has watchers, but for our custom keys we manage them.
// We will save on upgrade/allocate interactions.
// For passive gain, we might rely on the global save loop if there is one, or just save periodically.
// The `gameLoop.js` doesn't inherently save. `storage.js` has a heartbeat.
// We'll implement a debounced save or save on window unload/hide.

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

function getFocusUpgradeCost() {
    if (state.focusCapacity >= MAX_FOCUS_CAPACITY) return BigNum.fromAny('Infinity');
    
    // Cost = 1e(999 + (capacity - 1))
    // Base (cap 1) = 1e999
    // Cap 2 = 1e1000
    const exponent = BASE_FOCUS_COST_LOG + (state.focusCapacity - 1);
    
    // Create BigNum from exponent
    // BigNum structure for 10^N is roughly { sig: 1, e: N } or using fromLog10
    // But standard `fromLog10` logic might be simpler or constructing manually if N is huge.
    // Since N starts at 999, it fits in standard BigNum exponent.
    // However, if capacity approaches 1000, exponent approaches 2000. BigNum handles this fine.
    
    return BigNum.fromScientific(`1e${exponent}`);
}

export function upgradeFocusCapacity() {
    const cost = getFocusUpgradeCost();
    if (cost.isInfinite()) return; // Maxed
    
    if (bank.coins.value.cmp(cost) >= 0) {
        bank.coins.sub(cost);
        state.focusCapacity++;
        saveState();
        updateChannelTab();
        playPurchaseSfx();
    }
}

function buyMaxFocusCapacity() {
    if (state.focusCapacity >= MAX_FOCUS_CAPACITY) return;
    if (bank.coins.value.isZero()) return;

    // Cost(C) = 1e(999 + C - 1)
    
    const coinsLog = approxLog10BigNum(bank.coins.value);
    if (!Number.isFinite(coinsLog)) return;

    // Max affordable single cost exponent
    // coinsLog >= 999 + (target - 1) - 1 => coinsLog >= 997 + target
    // target <= coinsLog - 997
    const maxK = Math.floor(coinsLog - 997);
    
    let target = Math.min(MAX_FOCUS_CAPACITY, Math.max(state.focusCapacity, maxK));
    
    // Cap target at MAX_FOCUS_CAPACITY
    if (target > MAX_FOCUS_CAPACITY) target = MAX_FOCUS_CAPACITY;
    
    if (target <= state.focusCapacity) return;

    // Check if we can afford buying up to target
    while (target > state.focusCapacity) {
        // Cost of last upgrade (target-1 -> target)
        // Exponent = 999 + (target - 1) - 1 = 997 + target
        const exponent = 997 + target;
        const cost = BigNum.fromScientific(`1e${exponent}`);
        
        if (bank.coins.value.cmp(cost) < 0) {
            target--;
            continue;
        }
        
        // We want one transaction for the sum.
        // Sum is approx cost * 1.111...
        const total = cost.mulDecimal('1.11111111');
        
        if (bank.coins.value.cmp(total) >= 0) {
            // Can afford!
            bank.coins.sub(total);
            state.focusCapacity = target;
            saveState();
            updateChannelTab();
            playPurchaseSfx();
            return;
        } else {
            // Cannot afford sum. Try target-1.
            target--;
        }
    }
}

export function allocateFocus(channelId, amount) {
    const ch = state.channels[channelId];
    if (!ch) return;

    let currentTotalAllocated = 0;
    for (const c of Object.values(state.channels)) {
        currentTotalAllocated += c.allocated;
    }

    const available = state.focusCapacity - currentTotalAllocated;
    
    // If trying to add
    if (amount > 0) {
        const toAdd = Math.min(amount, available);
        if (toAdd > 0) {
            ch.allocated += toAdd;
            saveState();
            updateChannelTab();
        }
    } 
    // If trying to remove
    else if (amount < 0) {
        const toRemove = Math.min(Math.abs(amount), ch.allocated);
        if (toRemove > 0) {
            ch.allocated -= toRemove;
            saveState();
            updateChannelTab();
        }
    }
}

export function getChannelUnlockState() {
    // Check manual unlock flag (debug/testing)
    const slot = getSlot();
    if (slot != null) {
        try {
            if (localStorage.getItem(`ccc:unlock:channel:${slot}`) === '1') return true;
        } catch {}
    }

    if (_unlockChecker) {
        return _unlockChecker(20);
    }
    
    return false;
}

// Injected checker is mostly for dlgTab, but we expose the logic here too.
export function isChannelUnlocked() {
    return getChannelUnlockState();
}

// Needed for dlgTab interface compatibility
let _unlockChecker = null;
export function setChannelUnlockChecker(fn) {
    _unlockChecker = fn;
}

export function resetChannels(type) {
    if (type === 'surge') {
        // Reset Levels, FP
        // Keep Capacity, Allocation
        for (const id in state.channels) {
            state.channels[id].level = BigNum.fromInt(0);
            state.channels[id].fp = 0;
        }
        saveState();
        updateChannelTab();
    }
}

export function getChannelCoinMultiplier({ baseMultiplier }) {
    // Multiplier = 1 + Coin_Channel_Level
    const level = state.channels[CHANNELS.COIN]?.level || BigNum.fromInt(0);
    const mult = BigNum.fromInt(1).add(level);
    
    // Apply to base
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

export function getChannelLevel(id) {
    return state.channels[id]?.level || BigNum.fromInt(0);
}

export function setChannelLevel(id, val) {
    if (!state.channels[id]) return;
    state.channels[id].level = val instanceof BigNum ? val : BigNum.fromAny(val);
    saveState();
    updateChannelTab();
    refreshCoinMultiplierFromXpLevel();
    window.dispatchEvent(new CustomEvent('channel:change', { detail: { id, type: 'level' } }));
}

export function getChannelFp(id) {
    return state.channels[id]?.fp || 0;
}

export function setChannelFp(id, val) {
    if (!state.channels[id]) return;
    // Update to support BigNum/Infinity from debug
    state.channels[id].fp = val; 
    saveState();
    updateChannelTab();
    window.dispatchEvent(new CustomEvent('channel:change', { detail: { id, type: 'fp' } }));
}

/* =========================================
   GAME LOOP
   ========================================= */

function onTick(dt) {
    if (!isChannelUnlocked()) return;

    let changes = false;
    let visualUpdate = false;

    // dt is in seconds
    // Requirement: "1 FP per allocated Focus per second (but it will accrue in game ticks)"
    
    // Compute global FP multiplier once per tick
    const fpMult = getFpMultiplier();
    const slot = getSlot();

    for (const id in state.channels) {
        const ch = state.channels[id];
        if (ch.allocated <= 0) continue;

        // Debug Locking
        const fpLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:channel:fp:${id}:${slot}`);
        const levelLocked = typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(`ccc:channel:level:${id}:${slot}`);

        if (fpLocked) continue;

        const rate = BigNum.fromAny(ch.allocated); // FP per second
        let gainBn = rate.mulDecimal(String(dt));
        
        // Apply FP Multiplier
        gainBn = gainBn.mulBigNumInteger(fpMult);
        
        // Apply Debug Override
        gainBn = applyStatMultiplierOverride('fp', gainBn);
        
        if (!gainBn.isZero()) visualUpdate = true;
        
        // High Rate Logic
        // req: The FP requirement to gain 1 Level
        const req = CHANNEL_DEFS[id]?.baseReq;
        
        // Hybrid approach:
        // 1. Add gain to current FP (float/number).
        // 2. While FP >= req, Level Up.
        
        if (gainBn.cmp(1e15) > 0) {
            // Massive gain, use BigNum logic directly
            if (!levelLocked) {
                // Levels gained = gain / req
                const levels = gainBn.div(req).floorToInteger();
                ch.level = ch.level.add(levels);
                changes = true;
            }
        } else {
            // Standard/Small gain
            const gain = Number(gainBn.toScientific(10));
            
            // Handle BigNum FP (if set via Debug)
            if (ch.fp instanceof BigNum) {
                if (ch.fp.isInfinite()) {
                    if (!levelLocked) {
                        ch.level = BigNum.fromAny('Infinity');
                        changes = true;
                    }
                } else {
                    ch.fp = ch.fp.add(gain);
                    // Check if we have enough for levels
                    // levels = floor(fp / req)
                    let levels = ch.fp.div(req).floorToInteger();
                    
                    if (!levels.isZero()) {
                        if (!levelLocked) {
                            ch.level = ch.level.add(levels);
                        }
                        // Subtract cost: levels * req
                        ch.fp = ch.fp.sub(levels.mulSmall(req));
                        changes = true;
                    }
                }
            } else {
                ch.fp += gain;
                
                // Promote to BigNum if it became Infinity
                if (!Number.isFinite(ch.fp)) {
                     ch.fp = BigNum.fromAny(ch.fp); // Infinity
                     if (!levelLocked) {
                         ch.level = BigNum.fromAny('Infinity');
                         changes = true;
                     }
                } else {
                    // While FP >= req
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
        updateChannelTab(); // Schedule update
        scheduleSave();
        refreshCoinMultiplierFromXpLevel();
        window.dispatchEvent(new CustomEvent('channel:change', { detail: { type: 'tick' } }));
    } else if (visualUpdate) {
        if (channelTabInitialized && channelPanel) {
            updateChannelVisuals();
        }
        // Dispatch event for debug panel real-time updates even if no level up
        // We do this every tick if there's visual update (FP gain)
        window.dispatchEvent(new CustomEvent('channel:change', { detail: { type: 'tick-visual' } }));
    }
}

/* =========================================
   UI
   ========================================= */

function buildUI(panel) {
    panel.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'channel-tab';

    // Header
    const header = document.createElement('div');
    header.className = 'channel-header';
    header.innerHTML = `
        <div class="channel-explainer">
            Channel your Focus into Channels to increase Channel Levels<br>
            Each Channel has a focus currency or stat it will boost<br>
            Gain +100% value to the Channel's focus for each level of any Channel<br>
            Purchase and allocate Focus into Channels so they may level up passively<br>
            The more Focus a Channel has allocated, the quicker it will gain FP and level up<br>
            Pay attention to Channel Level requirements to unlock new Channels<br>
            Surge and higher resets will reset Channels, but unlocked Channels are permanent
        </div>
    `;
    wrapper.appendChild(header);

    // Controls (Focus Capacity)
    const controls = document.createElement('div');
    controls.className = 'channel-controls';
    const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';
    controls.innerHTML = `
        <button class="channel-upgrade-btn" id="btn-focus-upg">
            <span class="channel-upgrade-title">Increase Focus Capacity</span>
            <span class="channel-upgrade-cost">
               Cost: <img src="${COIN_ICON_SRC}" class="channel-upgrade-cost-icon" alt="Coins">
               <span id="focus-cost">1e999 Coins</span>
            </span>
            <div class="focus-capacity-display">Capacity: <span id="focus-cap">1/1</span></div>
        </button>
    `;
    wrapper.appendChild(controls);

    // Channel List
    const list = document.createElement('div');
    list.className = 'channel-list';
    
    // Header Row
    const listHeader = document.createElement('div');
    listHeader.className = 'channel-list-header';
    listHeader.innerHTML = `
        <div class="list-head-name">Channels</div>
        <div class="list-head-level">Level</div>
        <div class="list-head-alloc">Focus Allocated</div>
        <div class="list-head-controls"></div>
    `;
    list.appendChild(listHeader);
    
    // Render Channel Rows
    for (const [id, def] of Object.entries(CHANNEL_DEFS)) {
        const item = document.createElement('div');
        item.className = 'channel-row';
        item.innerHTML = `
            <div class="channel-bar-container">
                 <img src="${def.icon}" class="channel-icon-overlay" alt="">
                 <div class="channel-bar-inner">
                    <div class="channel-bar-fill" id="ch-fill-${id}"></div>
                    <div class="channel-bar-text">
                        <span class="channel-name-text">${def.name}</span>
                    </div>
                 </div>
            </div>
            
            <div class="channel-level-val" id="ch-lvl-${id}">0</div>
            
            <div class="channel-alloc-val" id="ch-alloc-${id}">0</div>
            
            <div class="channel-row-controls">
                <button class="btn-ch-control" data-action="add" data-id="${id}">+</button>
                <button class="btn-ch-control" data-action="sub" data-id="${id}">-</button>
                <button class="btn-ch-control btn-ch-cap" data-action="cap" data-id="${id}">Cap</button>
            </div>
        `;
        list.appendChild(item);
    }
    wrapper.appendChild(list);
    panel.appendChild(wrapper);

    // Bind Events
    const btnUpg = wrapper.querySelector('#btn-focus-upg');
    btnUpg.addEventListener('click', upgradeFocusCapacity);
    btnUpg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        buyMaxFocusCapacity();
    });

    wrapper.querySelectorAll('.btn-ch-control').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const action = e.target.dataset.action;
            
            if (action === 'add') {
                allocateFocus(id, 1);
            } else if (action === 'sub') {
                allocateFocus(id, -1);
            } else if (action === 'cap') {
                let currentTotal = 0;
                for(const c of Object.values(state.channels)) currentTotal += c.allocated;
                const available = state.focusCapacity - currentTotal;
                if (available > 0) {
                    allocateFocus(id, available);
                }
            }
        });
    });
}

export function updateChannelTab() {
    if (!channelTabInitialized || !channelPanel) return;
    
    // Update Focus Button
    const btnUpg = channelPanel.querySelector('#btn-focus-upg');
    const cost = getFocusUpgradeCost();
    const elCost = channelPanel.querySelector('#focus-cost');
    const elCap = channelPanel.querySelector('#focus-cap');
    
    // Calculate total allocated for display
    let totalAlloc = 0;
    for (const c of Object.values(state.channels)) totalAlloc += c.allocated;

    if (elCap) elCap.textContent = `${totalAlloc}/${state.focusCapacity}`;

    if (cost.isInfinite()) {
        if (btnUpg) {
            btnUpg.disabled = true;
            btnUpg.classList.add('is-maxed');
        }
        if (elCost) elCost.textContent = "MAXED";
    } else {
        if (btnUpg) {
            btnUpg.disabled = bank.coins.value.cmp(cost) < 0;
            btnUpg.classList.remove('is-maxed');
        }
        if (elCost) elCost.textContent = `${formatNumber(cost)} Coins`;
    }

    updateChannelVisuals();

    // Allocation Buttons State
    for (const id in CHANNEL_DEFS) {
        const ch = state.channels[id];
        const btnAdd = channelPanel.querySelector(`.btn-ch-control[data-id="${id}"][data-action="add"]`);
        const btnCap = channelPanel.querySelector(`.btn-ch-control[data-id="${id}"][data-action="cap"]`);
        const btnSub = channelPanel.querySelector(`.btn-ch-control[data-id="${id}"][data-action="sub"]`);
        
        const isFull = (totalAlloc >= state.focusCapacity);

        if (btnAdd) btnAdd.disabled = isFull;
        if (btnCap) btnCap.disabled = isFull;
        if (btnSub) btnSub.disabled = (ch.allocated <= 0);
    }

    alignChannelColumns();
}

function alignChannelColumns() {
    if (!channelPanel) return;
    const header = channelPanel.querySelector('.channel-list-header');
    if (!header) return;

    // We expect header children to correspond to grid columns.
    // Index 1: Level, Index 2: Alloc
    if (header.children.length < 4) return;

    const levelHeader = header.children[1];
    const allocHeader = header.children[2];

    const levelRect = levelHeader.getBoundingClientRect();
    const allocRect = allocHeader.getBoundingClientRect();

    const levelCenter = levelRect.left + levelRect.width / 2;
    const allocCenter = allocRect.left + allocRect.width / 2;

    const rows = channelPanel.querySelectorAll('.channel-row');
    rows.forEach(row => {
        const levelVal = row.querySelector('.channel-level-val');
        const allocVal = row.querySelector('.channel-alloc-val');

        if (levelVal) {
            // Reset transform to measure natural position
            levelVal.style.transform = '';
            const rect = levelVal.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            const diff = levelCenter - currentCenter;
            
            // Only apply if diff is significant (e.g. > 0.5px) to avoid jitter
            if (Math.abs(diff) > 0.5) {
                levelVal.style.transform = `translateX(${diff}px)`;
            }
        }

        if (allocVal) {
            allocVal.style.transform = '';
            const rect = allocVal.getBoundingClientRect();
            const currentCenter = rect.left + rect.width / 2;
            const diff = allocCenter - currentCenter;
            
            if (Math.abs(diff) > 0.5) {
                allocVal.style.transform = `translateX(${diff}px)`;
            }
        }
    });
}

function updateChannelVisuals() {
    if (!channelTabInitialized || !channelPanel) return;

    const fpMult = getFpMultiplier();

    for (const id in CHANNEL_DEFS) {
        const ch = state.channels[id];
        
        const elLvl = channelPanel.querySelector(`#ch-lvl-${id}`);
        if (elLvl) elLvl.textContent = formatNumber(ch.level);
        
        const elAlloc = channelPanel.querySelector(`#ch-alloc-${id}`);
        if (elAlloc) elAlloc.textContent = formatNumber(ch.allocated);
        
        const elFill = channelPanel.querySelector(`#ch-fill-${id}`);
        
        // Progress
        // req is dynamic
        const req = CHANNEL_DEFS[id]?.baseReq;
        
        // Support BigNum FP visual
        let fpVal = ch.fp;
        if (fpVal instanceof BigNum) {
             if (fpVal.isInfinite()) fpVal = Infinity;
             else try { fpVal = Number(fpVal.toScientific(5)); } catch { fpVal = 0; }
        }
        
        // Percent = (fp / req) * 100
        let pct = 0;
        if (req > 0) {
            pct = Math.min(100, Math.max(0, (fpVal / req) * 100));
        }
        
        // Force full bar if effective rate per tick is >= req
        // Rate (allocated) is per second. We gain allocated * fpMult * FIXED_STEP per tick.
        // If gain per tick >= req, we fill the bar instantly.
        // (allocated * fpMult) * FIXED_STEP >= req  => (allocated * fpMult) >= req/FIXED_STEP
        
        const safeFixedStep = (typeof FIXED_STEP === 'number' && FIXED_STEP > 0) ? FIXED_STEP : 0.05;
        const threshold = req / safeFixedStep;
        
        let effectiveRate = BigNum.fromAny(ch.allocated);
        
        // Apply multiplier if valid (supports integer and BigNum mults)
        if (fpMult && !fpMult.isZero()) {
             effectiveRate = effectiveRate.mulBigNumInteger(fpMult);
        }
        
        // Apply Debug Override
        effectiveRate = applyStatMultiplierOverride('fp', effectiveRate);
        
        // Quick check for infinity or huge numbers
        if (effectiveRate.isInfinite() || effectiveRate.cmp(threshold) >= 0) {
            pct = 100;
        }

        if (elFill) elFill.style.width = `${pct}%`;
    }
}

/* =========================================
   INITIALIZATION
   ========================================= */

export function initChannelSystem() {
    if (channelSystemInitialized) return;
    channelSystemInitialized = true;

    // Load State
    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', () => {
            loadState();
            updateChannelTab();
        });
    }
    loadState();

    // Register Tick
    registerTick((dt) => onTick(dt));

    // Register Multiplier Provider
    addExternalCoinMultiplierProvider((params) => getChannelCoinMultiplier(params));
}

export function initChannelTab(panelEl) {
    if (channelTabInitialized) return;
    
    // Ensure system is init (UI might load before main.js calls initChannelSystem in some race cases, though unlikely)
    initChannelSystem();

    channelPanel = panelEl;
    buildUI(panelEl);
    channelTabInitialized = true;
    updateChannelTab();
    
    // Initial alignment check
    setTimeout(alignChannelColumns, 0);

    // Ensure alignment persists on resize
    window.addEventListener('resize', alignChannelColumns);
}
