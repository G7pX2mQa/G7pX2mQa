import { getLastSaveTime, getActiveSlot, isCurrencyLocked, isStorageKeyLocked, markSaveSlotModified } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { ensureCustomScrollbar } from '../ui/shopOverlay.js';
import { IS_MOBILE } from '../main.js';
import { getLevelNumber, computeUpgradeEffects, getCurrentAreaKey as getUpgAreaKey } from './upgrades.js';
import { getRpMult } from '../ui/merchantTabs/labTab.js';
import { 
    RESEARCH_NODES, 
    getResearchNodeLevel, 
    getResearchNodeRp, 
    isResearchNodeActive, 
    setResearchNodeLevel, 
    setResearchNodeRp
} from './labNodes.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';
import { getPassiveCoinReward } from './coinPickup.js';
import { addXp } from './xpSystem.js';
import { addMutationPower } from './mutationSystem.js';
import { getBookProductionRate, isSurgeActive } from './surgeEffects.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';

let initialized = false;

export function formatTimeCompact(ms) {
    const msBn = BigNum.fromAny(ms);
    // Constants for time units
    const ONE_SECOND = 1000;
    const ONE_MINUTE = 60 * ONE_SECOND;
    const ONE_HOUR = 60 * ONE_MINUTE;
    const ONE_DAY = 24 * ONE_HOUR;
    const ONE_YEAR = 365 * ONE_DAY;

    const bnYear = BigNum.fromInt(ONE_YEAR);
    
    // Logic:
    // If < 1 year, keep using standard logic (it cycles through d/h/m/s).
    // If >= 1 year, format years using BigNum formatNumber, and append remaining days.
    
    // Check if ms >= ONE_YEAR
    if (msBn.cmp(bnYear) >= 0) {
        const years = msBn.div(bnYear).floorToInteger();
        // Calculate remaining days: (ms % ONE_YEAR) / ONE_DAY
        // Since BigNum doesn't have modulo, we do: ms - (years * ONE_YEAR)
        const yearsInMs = years.mulBigNumInteger(bnYear);
        const remainingMs = msBn.sub(yearsInMs);
        
        // Days can be calculated safely as a Number since remainingMs < ONE_YEAR (approx 3e10)
        // BigNum -> String -> Number
        let days = 0;
        try {
            const daysBn = remainingMs.div(BigNum.fromInt(ONE_DAY)).floorToInteger();
            days = Number(daysBn.toPlainIntegerString());
        } catch {
            days = 0;
        }

        return days === 0 ? `${formatNumber(years)}y` : `${formatNumber(years)}y ${days}d`;
    }

    // Fallback to standard logic for < 1 year (or if ms input is standard number)
    // Convert BigNum to number if safe, otherwise it would have been caught above (unless negative/zero)
    let s_val = 0;
    try {
        if (ms instanceof BigNum) s_val = Number(ms.toPlainIntegerString()) / 1000;
        else s_val = Number(ms) / 1000;
    } catch {
        s_val = 0;
    }

    const s = Math.floor(s_val);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs === 0 ? `${m}m` : `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
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
    { key: 'research_levels', icon: 'img/stats/rp/rp.webp',      singular: 'Level',    plural: 'Levels' },
];

export function showOfflinePanel(rewards, offlineMs, isPreAutomation = false) {
    if (window.__tsunamiActive) return;

    // Remove existing panel if any
    const existing = document.querySelector('.offline-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'offline-overlay';
    
    const panel = document.createElement('div');
    panel.className = 'offline-panel';
    
    const header = document.createElement('div');
    header.className = 'offline-header';
    header.textContent = isPreAutomation ? 'Pre-Automation Offline Gift' : 'Offline Progress';
    
    const subHeader = document.createElement('div');
    subHeader.className = 'offline-subheader';
    subHeader.textContent = `You were gone for ${formatTimeCompact(offlineMs)}`;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'offline-content-wrapper';

    if (isPreAutomation) {
        const note = document.createElement('div');
        note.className = 'offline-pre-auto-note';
        note.textContent = "Until you unlock proper automation, Coins have to be collected manually. As a gift to not discourage idle play before unlocking automation, provided below are the rewards from Coins that would have spawned if you were active in the game.";
        contentWrapper.appendChild(note);
    }
	
	const scrollContainer = document.createElement('div');
    scrollContainer.className = 'offline-scroll-container';
    
    const list = document.createElement('div');
    list.className = 'offline-list';
    
    // Iterate rewards in priority order
    PRIORITY_ORDER.forEach(config => {
        const key = config.key;
        const val = rewards[key];
        if (!val) return;
        if (typeof val.isZero === 'function' && val.isZero()) return;

        if (key === 'research_levels') {
            if (Array.isArray(val)) {
                val.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'offline-row';
                    
                    const plus = document.createElement('span');
                    plus.className = 'offline-plus';
                    plus.style.color = '#004F96'; 
                    plus.textContent = '+';
                    
                    const icon = document.createElement('img');
                    icon.className = 'offline-icon';
                    icon.src = config.icon;
                    icon.alt = 'RP';
                    
                    const text = document.createElement('span');
                    text.className = 'offline-text';
                    text.style.color = '#004F96';
                    
                    const levelCount = BigNum.fromInt(item.levels);
                    const label = (levelCount.cmp(BigNum.fromInt(1)) === 0) ? 'Level' : 'Levels';
                    text.textContent = `${formatNumber(levelCount)} ${label} of ${item.name}`;
                    
                    row.appendChild(plus);
                    row.appendChild(icon);
                    row.appendChild(text);
                    list.appendChild(row);
                });
            }
            return;
        }

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

// Helper to calculate research cost locally to avoid state dependency issues during simulation
function getSimulatedReq(node, level) {
    if (level >= node.maxLevel) return BigNum.fromAny('Infinity');
    const log10Scale = Math.log10(node.scale); 
    const log10Base = Math.log10(node.baseRpReq);
    const totalLog10 = log10Base + (level * log10Scale);
    const intPart = Math.floor(totalLog10);
    const fracPart = totalLog10 - intPart;
    const mantissa = Math.pow(10, fracPart);
    return new BigNum(BigInt(Math.round(mantissa * 1e14)), { base: intPart, offset: -14n });
}

export function calculateOfflineRewards(seconds) {
    const slot = getActiveSlot();
    if (slot == null) return {};

    // Convert seconds to BigNum to handle both normal offline progress and massive OP Time Warps
    const secondsBn = BigNum.fromAny(seconds);
    const rewards = {};

    // --- Research Lab Progress ---
    const rpMult = getRpMult ? getRpMult() : BigNum.fromInt(0);
    if (rpMult && !rpMult.isZero()) {
        const totalRp = rpMult.mulBigNumInteger(secondsBn);
        
        const activeNodes = RESEARCH_NODES.filter(n => isResearchNodeActive(n.id));
        const researchLevels = [];
        const researchProgress = {};

        for (const node of activeNodes) {
             let tempLevel = getResearchNodeLevel(node.id);
             let tempRp = getResearchNodeRp(node.id).add(totalRp);
             let levelsGained = 0;
             const maxLevel = node.maxLevel;

             while (tempLevel < maxLevel) {
                 const req = getSimulatedReq(node, tempLevel);
                 if (req.isInfinite && req.isInfinite()) break;
                 if (tempRp.cmp(req) < 0) break;
                 
                 tempRp = tempRp.sub(req);
                 tempLevel++;
                 levelsGained++;
             }
             
             if (levelsGained > 0) {
                 researchLevels.push({ name: node.title, levels: levelsGained });
             }
             // Always store progress (RP update) even if no levels gained
             researchProgress[node.id] = { level: tempLevel, rp: tempRp };
        }
        
        if (researchLevels.length > 0) rewards.research_levels = researchLevels;
        if (Object.keys(researchProgress).length > 0) rewards.research_progress = researchProgress;
    }
    // -----------------------------

    const gearRate = getGearsProductionRate ? getGearsProductionRate() : BigNum.fromInt(0);
    
    // Update: use BigNum multiplication for accuracy with large inputs
    // mulBigNumInteger is correct because we are effectively multiplying rate * time
    const gearsEarned = gearRate.mulBigNumInteger(secondsBn).floorToInteger();
    
    if (!gearsEarned.isZero()) {
        if (!isCurrencyLocked('gears', slot)) {
            rewards.gears = gearsEarned;
        }
    }

    // Books (Surge 3)
    const bookRate = getBookProductionRate ? getBookProductionRate() : BigNum.fromInt(0);
    if (!bookRate.isZero()) {
        const booksEarned = bookRate.mulBigNumInteger(secondsBn).floorToInteger();
        if (!booksEarned.isZero()) {
            if (!isCurrencyLocked('books', slot)) {
                rewards.books = booksEarned;
            }
        }
    }

    const autoLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID) || 0;
    if (autoLevel > 0) {
        // Update: use BigNum to calculate totalPassives safely
        let multiplier = 1;
        if (isSurgeActive(2)) {
             multiplier = 10;
        }

        const totalPassives = BigNum.fromInt(autoLevel)
            .mulBigNumInteger(secondsBn)
            .mulBigNumInteger(BigNum.fromInt(multiplier))
            .floorToInteger();
        
        if (!totalPassives.isZero()) {
            const singleReward = getPassiveCoinReward();
            const coinsEarned = singleReward.coins.mulBigNumInteger(totalPassives);
            const xpEarned = singleReward.xp.mulBigNumInteger(totalPassives);
            const mpEarned = singleReward.mp.mulBigNumInteger(totalPassives);
            
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
    
    // Handle special systems (XP, MP)
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

    // Handle Research
    if (rewards.research_progress) {
        for (const [idStr, data] of Object.entries(rewards.research_progress)) {
             const nodeId = parseInt(idStr, 10);
             if (!isNaN(nodeId)) {
                 setResearchNodeLevel(nodeId, data.level);
                 setResearchNodeRp(nodeId, data.rp);
             }
        }
    }

    // Handle standard currencies automatically
    for (const key of Object.keys(rewards)) {
        // Skip special keys handled above or created during handling
        if (key === 'xp' || key === 'mp' || key === 'xp_levels' || key === 'mp_levels') continue;
        if (key === 'research_levels' || key === 'research_progress') continue;
        
        if (bank[key] && typeof bank[key].add === 'function') {
            bank[key].add(rewards[key]);
        }
    }
}

export function calculatePreAutomationRewards(seconds) {
    const slot = getActiveSlot();
    if (slot == null) return {};

    const secondsBn = BigNum.fromAny(seconds);
    const rewards = {};
    const areaKey = getUpgAreaKey();
    let spawnRate = BigNum.fromInt(1);

    try {
        const eff = computeUpgradeEffects(areaKey);
        if (eff && eff.coinsPerSecondMult) {
            spawnRate = BigNum.fromAny(eff.coinsPerSecondMult);
        }
    } catch (e) {
        console.error('Offline rewards calc error:', e);
        spawnRate = BigNum.fromInt(1);
    }

    if (typeof applyStatMultiplierOverride === 'function') {
        const override = applyStatMultiplierOverride('spawnRate', spawnRate);
        try {
             spawnRate = BigNum.fromAny(override);
        } catch {}
    }

    // Update: use BigNum multiplication
    const totalCoins = spawnRate.mulBigNumInteger(secondsBn).floorToInteger();

    if (!totalCoins.isZero()) {
        const singleReward = getPassiveCoinReward();
        const coinsEarned = singleReward.coins.mulBigNumInteger(totalCoins);
        const xpEarned = singleReward.xp.mulBigNumInteger(totalCoins);
        const mpEarned = singleReward.mp.mulBigNumInteger(totalCoins);

        if (!coinsEarned.isZero()) {
             rewards.coins = coinsEarned;
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
    return rewards;
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
    
    const seconds = diff / 1000;

    if (!hasDoneInfuseReset()) {
        const rewards = calculatePreAutomationRewards(seconds);
        const hasRewards = Object.keys(rewards).length > 0;
        
        if (hasRewards) {
            grantOfflineRewards(rewards);
            showOfflinePanel(rewards, diff, true);
        }
        return hasRewards;
    }

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
