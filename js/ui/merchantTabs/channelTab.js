import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../../util/storage.js';
import { registerTick, FIXED_STEP } from '../../game/gameLoop.js';
import { addExternalCoinMultiplierProvider } from '../../game/xpSystem.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { approxLog10BigNum } from '../../game/upgrades.js';

/* =========================================
   CONSTANTS & KEYS
   ========================================= */

const KEY_PREFIX = 'ccc:channel';
const KEY_FOCUS_CAPACITY = (slot) => `${KEY_PREFIX}:capacity:${slot}`;
const KEY_TOTAL_FP = (slot) => `${KEY_PREFIX}:totalFP:${slot}`;
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

const CHANNEL_DEFS = {
    [CHANNELS.COIN]: {
        id: CHANNELS.COIN,
        name: 'Coin',
        icon: 'img/currencies/coin/coin_plus_base.webp',
        baseReq: 1, // 1 FP per level
        description: 'Boosts Global Coin Value by +100% per level',
    }
};

/* =========================================
   STATE
   ========================================= */

let channelSystemInitialized = false;
let channelTabInitialized = false;
let channelPanel = null;

const state = {
    focusCapacity: 1,
    totalFPAccumulated: BigNum.fromInt(0),
    channels: {
        [CHANNELS.COIN]: {
            level: BigNum.fromInt(0),
            fp: 0, // float for sub-1 amounts
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

    // Load Total FP
    try {
        const totalRaw = localStorage.getItem(KEY_TOTAL_FP(slot));
        state.totalFPAccumulated = totalRaw ? BigNum.fromAny(totalRaw) : BigNum.fromInt(0);
    } catch {
        state.totalFPAccumulated = BigNum.fromInt(0);
    }

    // Load Channel Data
    try {
        const dataRaw = localStorage.getItem(KEY_CHANNEL_DATA(slot));
        if (dataRaw) {
            const parsed = JSON.parse(dataRaw);
            for (const id in parsed) {
                if (state.channels[id]) {
                    state.channels[id].level = BigNum.fromAny(parsed[id].level || 0);
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
    localStorage.setItem(KEY_TOTAL_FP(slot), state.totalFPAccumulated.toStorage());

    const dataToSave = {};
    for (const [id, ch] of Object.entries(state.channels)) {
        dataToSave[id] = {
            level: ch.level.toStorage(),
            fp: ch.fp,
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
        // Reset Levels, FP, Total FP
        // Keep Capacity, Allocation
        state.totalFPAccumulated = BigNum.fromInt(0);
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

/* =========================================
   GAME LOOP
   ========================================= */

function onTick(dt) {
    if (!isChannelUnlocked()) return;

    let changes = false;
    let visualUpdate = false;

    // dt is in seconds
    // Requirement: "1 FP per allocated Focus per second (but it will accrue in game ticks)"
    
    for (const id in state.channels) {
        const ch = state.channels[id];
        if (ch.allocated <= 0) continue;

        const rate = ch.allocated; // FP per second
        const gain = rate * dt;
        
        if (gain > 0) visualUpdate = true;
        
        // High Rate Logic
        // Req is static 1.
        // If gain per tick > 1 (meaning we level up multiple times per tick), just math it.
        // Actually the prompt said: "When the rate of FP accrual ... exceeds 20 times the bar's requirement"
        // Requirement = 1. So if rate (allocated) > 20/tick?
        // Wait, rate is per second. gain is per tick (dt).
        // If gain > 20 * 1, we do bulk.
        // Even if gain > 1, we should probably do bulk to avoid looping.
        
        const req = 1; // Static requirement
        
        // Accumulate global stats
        const gainBn = BigNum.fromAny(gain); // Rough conversion for accumulation
        // For total FP, we should probably just track purely numerical if small, but BigNum if large.
        // Since levels scale linearly, Total FP = Total Levels * 1 + Current FP (approx).
        // But let's just add the gain.
        // BigNum construction from small float might be precise enough.
        
        // Since gain is likely small (e.g. 0.05 * 10 = 0.5), BigNum might trunc? 
        // BigNum handles floats if initialized via fromAny usually? No, it's integer based primarily.
        // However, `state.totalFPAccumulated` is BigNum.
        // We should accumulate `gain` in a float buffer if it's small, or handle it carefully.
        // But given "1e999" costs, levels will get high.
        // If gain is huge (e.g. 1e50 focus), BigNum is needed.
        
        // Hybrid approach:
        // 1. Add gain to current FP (float/number).
        // 2. While FP >= 1, Level Up.
        
        if (gain > 1e15) {
            // Massive gain, use BigNum logic directly
            const gainBig = BigNum.fromAny(gain); // Assuming fromAny handles huge numbers/scientific string
            state.totalFPAccumulated = state.totalFPAccumulated.add(gainBig);
            
            // Levels gained = gain (since req is 1)
            ch.level = ch.level.add(gainBig);
            changes = true;
        } else {
            // Standard/Small gain
            ch.fp += gain;
            
            const fpBig = BigNum.fromAny(Math.floor(ch.fp));
            if (!fpBig.isZero()) {
                ch.level = ch.level.add(fpBig);
                ch.fp -= Math.floor(ch.fp);
                changes = true;
            }
        }
    }

    if (changes) {
        // Re-sum total FP for display (Logic: Total Levels of all channels + partial FP?)
        // Or just sum of levels. Since FP < 1 usually, it doesn't matter much for big numbers.
        let sum = BigNum.fromInt(0);
        for (const id in state.channels) {
            sum = sum.add(state.channels[id].level);
        }
        state.totalFPAccumulated = sum;
        
        updateChannelTab(); // Schedule update
        scheduleSave();
    } else if (visualUpdate && channelTabInitialized && channelPanel) {
        updateChannelVisuals();
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
            Pay attention to total FP accumulated to see when new things will unlock<br>
            Channels will reset upon Surge or similar reset, but unlocked Channels are permanent
        </div>
        <div class="channel-total-fp">Total FP Accumulated: <span id="ch-total-fp">0</span></div>
    `;
    wrapper.appendChild(header);

    // Controls (Focus Capacity)
    const controls = document.createElement('div');
    controls.className = 'channel-controls';
    const COIN_ICON_SRC = 'img/currencies/coin/coin.webp';
    controls.innerHTML = `
        <button class="channel-upgrade-btn" id="btn-focus-upg">
            <span class="channel-upgrade-title">Increase Focus Amount</span>
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
    
    // Update Total FP
    const elTotal = channelPanel.querySelector('#ch-total-fp');
    if (elTotal) elTotal.textContent = formatNumber(state.totalFPAccumulated);

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
}

function updateChannelVisuals() {
    if (!channelTabInitialized || !channelPanel) return;

    for (const id in CHANNEL_DEFS) {
        const ch = state.channels[id];
        
        const elLvl = channelPanel.querySelector(`#ch-lvl-${id}`);
        if (elLvl) elLvl.textContent = formatNumber(ch.level);
        
        const elAlloc = channelPanel.querySelector(`#ch-alloc-${id}`);
        if (elAlloc) elAlloc.textContent = ch.allocated;
        
        const elFill = channelPanel.querySelector(`#ch-fill-${id}`);
        
        // Progress
        // Req is always 1.
        // FP is float 0..1 (mostly)
        let pct = Math.min(100, Math.max(0, ch.fp * 100));
        
        // Force full bar if rate >= 20 * capacity (capacity is 1)
        // Rate (allocated) is per second. We gain allocated * FIXED_STEP per tick.
        // If gain per tick >= 1, we fill the bar instantly.
        // gain >= 1 => allocated * FIXED_STEP >= 1 => allocated >= 1 / FIXED_STEP
        const threshold = 1 / FIXED_STEP;
        
        if (ch.allocated >= threshold) {
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
}
