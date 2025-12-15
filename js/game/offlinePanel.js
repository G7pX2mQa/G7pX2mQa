import { getLastSaveTime, getActiveSlot, isCurrencyLocked, isStorageKeyLocked } from '../util/storage.js';
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

function formatTimeCompact(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return `${h}h ${rm}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    if (d < 365) return `${d}d ${rh}h`;
    const y = Math.floor(d / 365);
    const rd = d % 365;
    return `${y}y ${rd}d`;
}

// Visual Priority Map
const PRIORITY_ORDER = [
    { key: 'coins',     icon: 'img/currencies/coin/coin.webp',   singular: 'Coin',     plural: 'Coins' },
    { key: 'xp',        icon: 'img/stats/xp/xp.webp',            singular: 'XP',       plural: 'XP' },
    { key: 'xp_levels', icon: 'img/stats/xp/xp.webp',            singular: 'XP Level', plural: 'XP Levels' },
    { key: 'books',     icon: 'img/currencies/book/book.webp',   singular: 'Book',     plural: 'Books' },
    { key: 'gold',      icon: 'img/currencies/gold/gold.webp',   singular: 'Gold',     plural: 'Gold' },
    { key: 'mp',        icon: 'img/stats/mp/mp.webp',            singular: 'MP',       plural: 'MP' },
    { key: 'mp_levels', icon: 'img/stats/mp/mp.webp',            singular: 'MP Level', plural: 'MP Levels' },
    { key: 'magic',     icon: 'img/currencies/magic/magic.webp', singular: 'Magic',    plural: 'Magic' },
    { key: 'gears',     icon: 'img/currencies/gear/gear.webp',   singular: 'Gear',     plural: 'Gears' },
    { key: 'waves',     icon: 'img/currencies/gear/gear.webp',   singular: 'Wave',     plural: 'Waves' },
];

function createOfflinePanel(rewards, offlineMs) {
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

export function processOfflineProgress() {
    // 1. Ensure we are actually in a save slot (prevent Main Menu triggers)
    const slot = getActiveSlot();
    if (slot == null) {
        // If we are on the menu, we do nothing. 
        // We do NOT resume loop here because the loop might not even be started yet 
        // or handled by main menu logic.
        return; 
    }

    const lastSave = getLastSaveTime();
    const now = Date.now();
    
    if (lastSave <= 0) return;
    
    const diff = now - lastSave;
    if (diff < 1000) return; // Ignore gaps < 1s
    
    if (!hasDoneInfuseReset()) return;

    const seconds = diff / 1000;
    
    // Calculate Rewards
    // (Only Gears implemented currently)
    const gearRate = getGearsProductionRate ? getGearsProductionRate() : BigNum.fromInt(0);
    const gearsEarned = gearRate.mulDecimal(String(seconds)).floorToInteger();
    
    const rewards = {};
    let hasRewards = false;
    
    if (!gearsEarned.isZero()) {
        if (!isCurrencyLocked('gears', slot)) {
            rewards.gears = gearsEarned;
            hasRewards = true;
            
            // Award immediately
            if (bank.gears) bank.gears.add(rewards.gears);
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
                    hasRewards = true;
                    if (bank.coins) bank.coins.add(coinsEarned);
                }
            }
            if (!xpEarned.isZero()) {
                if (!isStorageKeyLocked(`ccc:xp:progress:${slot}`)) {
                    rewards.xp = xpEarned;
                    hasRewards = true;
                    try {
                        const xpResult = addXp(xpEarned);
                        if (xpResult && xpResult.xpLevelsGained && !xpResult.xpLevelsGained.isZero()) {
                            rewards.xp_levels = xpResult.xpLevelsGained;
                        }
                    } catch {}
                }
            }
            if (!mpEarned.isZero()) {
                if (!isStorageKeyLocked(`ccc:mutation:progress:${slot}`)) {
                    rewards.mp = mpEarned;
                    hasRewards = true;
                    try {
                        const mpResult = addMutationPower(mpEarned);
                        if (mpResult && mpResult.levelsGained && !mpResult.levelsGained.isZero()) {
                            rewards.mp_levels = mpResult.levelsGained;
                        }
                    } catch {}
                }
            }
        }
    }
    
    if (hasRewards) {
        // Remove existing panel if any
        const existing = document.querySelector('.offline-overlay');
        if (existing) existing.remove();

        // Do NOT pause game loop here (per requirement)
        createOfflinePanel(rewards, diff);
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
window.createOfflinePanel = createOfflinePanel;
