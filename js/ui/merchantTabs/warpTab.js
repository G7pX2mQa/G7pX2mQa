import { getActiveSlot } from '../../util/storage.js';
import { formatTimeCompact, calculateOfflineRewards, grantOfflineRewards, showOfflinePanel } from '../../game/offlinePanel.js';
import { playPurchaseSfx } from '../shopOverlay.js';

const WARP_CHARGES_KEY = (slot) => `ccc:warp:charges:${slot}`;
const WARP_LAST_CHARGE_KEY = (slot) => `ccc:warp:lastCharge:${slot}`;

const MAX_WARPS = 24;
const CHARGE_TIME_MS = 60 * 60 * 1000; // 1 hour
const WARP_DURATION_SEC = 300; // 5 minutes

let warpTabPanel = null;
let updateTimer = null;

function getWarpState(slot) {
    let charges = 24;
    let lastCharge = Date.now();
    
    try {
        const c = localStorage.getItem(WARP_CHARGES_KEY(slot));
        if (c !== null) charges = parseInt(c, 10);
        
        const l = localStorage.getItem(WARP_LAST_CHARGE_KEY(slot));
        if (l !== null) lastCharge = parseInt(l, 10);
        else if (c === null) {
             // First time init: 24 charges.
             try {
                localStorage.setItem(WARP_CHARGES_KEY(slot), '24');
                localStorage.setItem(WARP_LAST_CHARGE_KEY(slot), String(lastCharge));
            } catch {}
        }
    } catch {}
    
    return { charges, lastCharge };
}

function saveWarpState(slot, charges, lastCharge) {
    try {
        localStorage.setItem(WARP_CHARGES_KEY(slot), String(charges));
        localStorage.setItem(WARP_LAST_CHARGE_KEY(slot), String(lastCharge));
    } catch {}
}

export function checkWarpRecharge() {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    let { charges, lastCharge } = getWarpState(slot);
    
    if (charges >= MAX_WARPS) return; // Full
    
    const now = Date.now();
    const elapsed = now - lastCharge;
    
    if (elapsed >= CHARGE_TIME_MS) {
        const gained = Math.floor(elapsed / CHARGE_TIME_MS);
        charges += gained;
        if (charges >= MAX_WARPS) {
            charges = MAX_WARPS;
            lastCharge = now; // Reset timer if full
        } else {
            lastCharge += gained * CHARGE_TIME_MS; // Advance timer by consumed intervals
        }
        saveWarpState(slot, charges, lastCharge);
        // Force update UI if visible
        if (warpTabPanel && warpTabPanel.classList.contains('is-active')) {
             updateWarpTab(true); // pass flag to avoid infinite recursion if I called check inside update
        }
    }
}

function performWarp() {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    checkWarpRecharge(); // Ensure state is up to date first

    let { charges, lastCharge } = getWarpState(slot);
    
    if (charges <= 0) return;
    
    // If we are at MAX, we start the timer now
    if (charges >= MAX_WARPS) {
        lastCharge = Date.now();
    }
    
    charges--;
    saveWarpState(slot, charges, lastCharge);
    
    // Grant rewards
    const rewards = calculateOfflineRewards(WARP_DURATION_SEC);
    grantOfflineRewards(rewards);
    showOfflinePanel(rewards, WARP_DURATION_SEC * 1000);
    
    playPurchaseSfx();
    updateWarpTab(true);
}

export function updateWarpTab(skipRechargeCheck = false) {
    if (!warpTabPanel) return;
    // We update even if not active? No, waste of resources.
    // But timer needs to update if active.
    if (!warpTabPanel.classList.contains('is-active')) return;
    
    const slot = getActiveSlot();
    if (slot == null) return;
    
    if (!skipRechargeCheck) checkWarpRecharge();
    
    const { charges, lastCharge } = getWarpState(slot);
    
    const counterEl = warpTabPanel.querySelector('.warp-counter');
    if (counterEl) {
        counterEl.innerHTML = `Warps remaining: <span class="text-cyan">${charges} / ${MAX_WARPS}</span>`;
    }
    
    const timerEl = warpTabPanel.querySelector('.warp-timer');
    if (timerEl) {
        if (charges >= MAX_WARPS) {
            timerEl.style.visibility = 'hidden';
        } else {
            timerEl.style.visibility = 'visible';
            const now = Date.now();
            const nextCharge = lastCharge + CHARGE_TIME_MS;
            const diff = Math.max(0, nextCharge - now);
            timerEl.textContent = `Next warp in ${formatTimeCompact(diff)}`;
        }
    }
    
    const btn = warpTabPanel.querySelector('.warp-btn');
    if (btn) {
        btn.disabled = charges <= 0;
    }
}

export function initWarpTab(panel) {
    if (!panel || panel.__warpInit) return;
    panel.__warpInit = true;
    warpTabPanel = panel;
    
    panel.innerHTML = `
        <div class="warp-tab">
            <h3 class="warp-title">Warp</h3>
            <div class="warp-desc">
                <p>Click the Warp button below to instantly gain <span class="text-cyan">5m</span> of offline progress</p>
                <p>Warp length will never be increased because it's intended to be a small boost</p>
                <p>Use your Warps wisely as they only recharge once every hour</p>
            </div>
            <div class="warp-status">
                <div class="warp-timer">Next warp in 60m</div>
                <div class="warp-counter">Warps remaining: <span class="text-cyan">24 / 24</span></div>
            </div>
            <button type="button" class="warp-btn">Warp</button>
        </div>
    `;
    
    const btn = panel.querySelector('.warp-btn');
    btn.addEventListener('click', performWarp);
    
    // Start update loop
    if (!updateTimer) {
        updateTimer = setInterval(() => {
            updateWarpTab();
        }, 1000);
    }
    
    updateWarpTab();
}
