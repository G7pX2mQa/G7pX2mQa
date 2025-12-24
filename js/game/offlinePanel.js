import { getLastSaveTime, getActiveSlot, isCurrencyLocked, isStorageKeyLocked, markSaveSlotModified } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { ensureCustomScrollbar } from '../ui/shopOverlay.js';
import { IS_MOBILE } from '../main.js';
import { getLevelNumber } from './upgrades.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';
import { getPassiveCoinReward } from './coinPickup.js';
import { addXp } from './xpSystem.js';
import { addMutationPower } from './mutationSystem.js';

let initialized = false;

export function formatTimeCompact(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs === 0 ? `${m}m` : `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    if (d < 365) return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
    const y = Math.floor(d / 365);
    const rd = d % 365;
    return rd === 0 ? `${y}y` : `${y}y ${rd}d`;
}

// Visual Priority Map
const PRIORITY_ORDER = [
    { key: 'coins',     icon: 'img/currencies/coin/coin.webp',   singular: 'Coin',     plural: 'Coins' },
    { key: 'xp',        icon: 'img/stats/xp/xp.webp',            singular: 'XP',       plural: 'XP' },
    { key: 'xp_levels', icon: 'img/stats/xp/xp.webp',            singular: 'XP Level', plural: 'XP Levels' },
    { key: 'books',     icon: 'img/currencies/book/book.webp',   singular: 'Book',     plural: 'Books' },
    { key: 'gold',      icon: 'img/currencies/gold/gold.webp',   singular: 'Gold',     plural: 'Gold' },
    { key: 'mp',        icon: 'img/stats/mp/mp.webp',            singular: 'MP',       plural: 'MP' },
    { key: 'mp_levels', icon: 'img/stats/mp/mp.webp',            singular: 'Mutation Level', plural: 'Mutation Levels' },
    { key: 'magic',     icon: 'img/currencies/magic/magic.webp', singular: 'Magic',    plural: 'Magic' },
    { key: 'gears',     icon: 'img/currencies/gear/gear.webp',   singular: 'Gear',     plural: 'Gears' },
    { key: 'waves',     icon: 'img/currencies/gear/gear.webp',   singular: 'Wave',     plural: 'Waves' },
];

export function showOfflinePanel(rewards, offlineMs) {
    // Remove existing panel if any
    const existing = document.querySelector('.offline-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'offline-overlay';
    
    const panel = document.createElement('div');
    panel.className = 'offline-panel';
    
    const header = document.createElement('div');
    header.className = 'offline-header';
    header.textContent = 'Offline Progress';
    
    const subHeader = document.createElement('div');
    subHeader.className = 'offline-subheader';
    subHeader.textContent = `You were gone for ${formatTimeCompact(offlineMs)}`;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'offline-content-wrapper';
	
	const scrollContainer = document.createElement('div');
    scrollContainer.className = 'offline-scroll-container';
    
    const list = document.createElement('div');
    list.className = 'offline-list';
    
    // Iterate rewards in priority order
    PRIORITY_ORDER.forEach(config => {
        const key = config.key;
        const val = rewards[key];
        if (!val || val.isZero()) return;

        const row = document.createElement('div');
        row.className = 'offline-row';
        
        // + Symbol
        const plus = document.createElement('span');
        plus.className = 'offline-plus';
        plus.classList.add(`text-${key}`);
        plus.textContent = '+';
        
        // Icon
        const icon = document.createElement('img');
        icon.className = 'offline-icon';
        icon.src = config.icon;
        icon.alt = key;
        
        // Amount
        const text = document.createElement('span');
        text.className = 'offline-text';
        text.classList.add(`text-${key}`);
        
        // Grammar logic
        let isOne = false;
        if (val instanceof BigNum) {
            isOne = !val.isInfinite() && val.cmp(BigNum.fromInt(1)) === 0;
        } else {
            isOne = (Number(val) === 1);
        }
        
        const displayName = isOne ? config.singular : config.plural;

        text.innerHTML = `${formatNumber(val)} ${displayName}`;
        
        row.appendChild(plus);
        row.appendChild(icon);
        row.appendChild(text);
        list.appendChild(row);
    });
    
    scrollContainer.appendChild(list);
    contentWrapper.appendChild(scrollContainer);
    
    const actions = document.createElement('div');
    actions.className = 'offline-actions';
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'offline-close-btn'; 
    closeBtn.textContent = 'Close';
    
    const closePanel = () => {
        overlay.remove();
        // No need to resumeGameLoop() here as we didn't pause it
    };

    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePanel();
    });
    
    actions.appendChild(closeBtn);
    
    panel.appendChild(header);
    panel.appendChild(subHeader);
    panel.appendChild(contentWrapper);
    panel.appendChild(actions);
    
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => {
        ensureCustomScrollbar(panel, contentWrapper, '.offline-scroll-container');
    });
    
    return overlay;
}

export function calculateOfflineRewards(seconds) {
    const slot = getActiveSlot();
    if (slot == null) return {};

    const rewards = {};
    const gearRate = getGearsProductionRate ? getGearsProductionRate() : BigNum.fromInt(0);
    const gearsEarned = gearRate.mulDecimal(String(seconds)).floorToInteger();
    
    if (!gearsEarned.isZero()) {
        if (!isCurrencyLocked('gears', slot)) {
            rewards.gears = gearsEarned;
        }
    }

    const autoLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID) || 0;
    if (autoLevel > 0) {
        const totalPassives = Math.floor(autoLevel * seconds);
        if (totalPassives > 0) {
            const singleReward = getPassiveCoinReward();
            const coinsEarned = singleReward.coins.mulBigNumInteger(BigNum.fromInt(totalPassives));
            const xpEarned = singleReward.xp.mulBigNumInteger(BigNum.fromInt(totalPassives));
            const mpEarned = singleReward.mp.mulBigNumInteger(BigNum.fromInt(totalPassives));
            
            if (!coinsEarned.isZero()) {
                if (!isCurrencyLocked('coins', slot)) {
                    rewards.coins = coinsEarned;
                }
            }
            if (!xpEarned.isZero()) {
                if (!isStorageKeyLocked(`ccc:xp:progress:${slot}`)) {
                    rewards.xp = xpEarned;
                }
            }
            if (!mpEarned.isZero()) {
                if (!isStorageKeyLocked(`ccc:mutation:progress:${slot}`)) {
                    rewards.mp = mpEarned;
                }
            }
        }
    }
    return rewards;
}

export function grantOfflineRewards(rewards) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    if (rewards.gears) {
        if (bank.gears) bank.gears.add(rewards.gears);
    }
    if (rewards.coins) {
        if (bank.coins) bank.coins.add(rewards.coins);
    }
    if (rewards.xp) {
         try {
            const xpResult = addXp(rewards.xp);
            if (xpResult) {
                if (xpResult.xpLevelsGained && !xpResult.xpLevelsGained.isZero()) {
                    rewards.xp_levels = xpResult.xpLevelsGained;
                }
                if (xpResult.xpAdded) {
                    rewards.xp = xpResult.xpAdded;
                }
            }
        } catch {}
    }
    if (rewards.mp) {
        try {
            const mpResult = addMutationPower(rewards.mp);
            if (mpResult) {
                if (mpResult.levelsGained && !mpResult.levelsGained.isZero()) {
                    rewards.mp_levels = mpResult.levelsGained;
                }
                if (mpResult.delta) {
                    rewards.mp = mpResult.delta;
                }
            }
        } catch {}
    }
}

export function processOfflineProgress() {
    // 1. Ensure we are actually in a save slot (prevent Main Menu triggers)
    const slot = getActiveSlot();
    if (slot == null) {
        return; 
    }

    const lastSave = getLastSaveTime();
    const now = Date.now();
    
    if (lastSave <= 0) return;

    // Detect reverse time travel (user changed clock back after saving in future)
    // Tolerance of 10 seconds to avoid drift issues
    if (now < lastSave - 10000) {
        markSaveSlotModified(slot);
        return;
    }
    
    const diff = now - lastSave;
    if (diff < 1000) return; // Ignore gaps < 1s
    
    if (!hasDoneInfuseReset()) return;

    const seconds = diff / 1000;
    
    const rewards = calculateOfflineRewards(seconds);
    const hasRewards = Object.keys(rewards).length > 0;
    
    if (hasRewards) {
        grantOfflineRewards(rewards);
        showOfflinePanel(rewards, diff);
    }
    return hasRewards;
}

export function initOfflineTracker(checkActiveState, onReward) {
    if (initialized) return;
    initialized = true;
    
    document.addEventListener('visibilitychange', () => {
        const slot = getActiveSlot();
        if (slot == null) return; // Ignore visibility changes on main menu

        if (checkActiveState && !checkActiveState()) return;

        if (document.hidden) {
            pauseGameLoop();
        } else {
            // Resume first, then process logic
            resumeGameLoop();
            const rewarded = processOfflineProgress();
            if (rewarded && typeof onReward === 'function') {
                onReward();
            }
        }
    });
}
window.createOfflinePanel = showOfflinePanel;
