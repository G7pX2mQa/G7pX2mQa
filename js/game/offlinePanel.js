import { getLastSaveTime, getActiveSlot, isCurrencyLocked, isStorageKeyLocked, markSaveSlotModified } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber, formatMultForUi } from '../util/numFormat.js';
import { ensureCustomScrollbar } from '../ui/shopOverlay.js';
import { IS_MOBILE } from '../main.js';
import { getLevelNumber, computeUpgradeEffects, getCurrentAreaKey as getUpgAreaKey } from './upgrades.js';
import { getRpMult, getLabLevel } from '../ui/merchantTabs/labTab.js';
import { 
    RESEARCH_NODES, 
    getResearchNodeLevel, 
    getResearchNodeRp, 
    isResearchNodeActive, 
    setResearchNodeLevel, 
    setResearchNodeRp
} from './labNodes.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';
import { getEacAmountMultiplier } from './automationEffects.js';
import { settingsManager } from './settingsManager.js';
import { getPassiveCoinReward } from './coinPickup.js';
import { addXp } from './xpSystem.js';
import { addMutationPower } from './mutationSystem.js';
import { getBookProductionRate, isSurgeActive, getTsunamiExponent } from './surgeEffects.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { getXpState } from './xpSystem.js';
import { getTotalCumulativeMp } from './mutationSystem.js';
import { computeForgeGoldFromInputs, computeInfuseMagicFromInputs, computePendingDnaFromInputs } from '../ui/merchantTabs/resetTab.js';
import { getLabGoldMultiplier } from './labNodes.js';
import { bigNumFromLog10 } from '../util/bigNum.js';
import { calculateWaterwheelOffline, applyWaterwheelOffline, WATERWHEEL_DEFS } from '../ui/merchantTabs/flowTab.js';

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
export const RESOURCE_REGISTRY = [
    { key: 'coins', bgGradient: 'linear-gradient(to bottom, #d1a008 0%, #e3b527 15%, #ffd34c 50%, #e3b527 85%, #d1a008 100%)',      icon: 'img/currencies/coin/coin.webp',   singular: 'Coin',     plural: 'Coins', type: 'currency' },
    { 
        key: 'xp', 
        icon: 'img/stats/xp/xp.webp', 
        singular: 'XP', 
        plural: 'XP', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(12,26,46,1), rgba(16,32,58,1))', 
        bgGradient: 'linear-gradient(to bottom, #0050b3 0%, #0073e6 15%, #3399ff 50%, #0073e6 85%, #0050b3 100%)', 
        fillGradient: 'linear-gradient(90deg, rgba(0,240,255,1) 0%, rgba(0,150,255,1) 50%, rgba(0,70,210,1) 100%)', 
        barOutline: '3px', 
        borderColor: '#01060f', 
        barBoxShadow: 'inset 0 6px 10px rgba(255,255,255,0.14), inset 0 -6px 14px rgba(0,0,0,0.45)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))', 
        glassOpacity: '0.6' 
    },
    { key: 'xp_levels', icon: 'img/stats/xp/xp.webp',            singular: 'XP Level', plural: 'XP Levels', type: 'levelStat' },
    { key: 'books', bgGradient: 'linear-gradient(to bottom, #82551b 0%, #94601e 15%, #AC6C1B 50%, #94601e 85%, #82551b 100%)',      icon: 'img/currencies/book/book.webp',   singular: 'Book',     plural: 'Books', type: 'currency' },
    { key: 'gold', bgGradient: 'linear-gradient(to bottom, #c27400 0%, #d98200 15%, #ffc400 50%, #d98200 85%, #c27400 100%)',       icon: 'img/currencies/gold/gold.webp',   singular: 'Gold',     plural: 'Gold', type: 'currency' },
    { 
        key: 'mp', 
        icon: 'img/stats/mp/mp.webp', 
        singular: 'MP', 
        plural: 'MP', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(60,24,0,1), rgba(45,18,0,1))', 
        bgGradient: 'linear-gradient(to bottom, #b35900 0%, #e67300 15%, #ff9933 50%, #e67300 85%, #b35900 100%)', 
        fillGradient: 'linear-gradient(90deg, rgba(255,170,0,1) 0%, rgba(255,120,0,1) 50%, rgba(200,60,0,1) 100%)', 
        barOutline: '3px', 
        borderColor: '#2a0b00', 
        barBoxShadow: 'inset 0 6px 10px rgba(255,192,128,0.18), inset 0 -6px 14px rgba(0,0,0,0.52)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0))', 
        glassOpacity: '0.55' 
    },
    { key: 'mp_levels', icon: 'img/stats/mp/mp.webp',            singular: 'Mutation Level', plural: 'Mutation Levels', type: 'levelStat' },
    { key: 'magic', bgGradient: 'linear-gradient(to bottom, #42138A 0%, #6A1ECF 15%, #9F30FF 50%, #6A1ECF 85%, #42138A 100%)',     icon: 'img/currencies/magic/magic.webp', singular: 'Magic',    plural: 'Magic', type: 'currency' },
    { key: 'gears', bgGradient: 'linear-gradient(to bottom, #5c5d61 0%, #8f9096 15%, #9d9fa6 50%, #8f9096 85%, #5c5d61 100%)',     icon: 'img/currencies/gear/gear.webp',   singular: 'Gear',     plural: 'Gears', type: 'currency' },
    { key: 'waves', bgGradient: 'linear-gradient(to bottom, #0286a1 0%, #02b1d4 15%, #00eded 50%, #02b1d4 85%, #0286a1 100%)',     icon: 'img/currencies/gear/gear.webp',   singular: 'Wave',     plural: 'Waves', type: 'currency' },
    { key: 'dna', bgGradient: 'repeating-linear-gradient(-45deg, #C00000, #C00000 30.1px, #00B0F0 30.1px, #00B0F0 60.2px)',       icon: 'img/currencies/dna/dna.webp',     singular: 'DNA',      plural: 'DNA', type: 'currency' },
    { key: 'research_levels', icon: 'img/stats/rp/rp.webp',      singular: 'Level',    plural: 'Levels', type: 'levelStat' },
    { key: 'waterwheel_levels', icon: 'img/waterwheels/waterwheel_coin.webp', singular: 'Level', plural: 'Levels', type: 'levelStat' },
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
    RESOURCE_REGISTRY.forEach(config => {
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

        if (key === 'waterwheel_levels') {
            if (Array.isArray(val)) {
                val.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'offline-row';
                    
                    const def = WATERWHEEL_DEFS[item.id];
                    const colorClass = def?.styleKey ? `text-${def.styleKey}` : 'text-coins';

                    const plus = document.createElement('span');
                    plus.className = 'offline-plus';
                    plus.classList.add(colorClass); 
                    plus.textContent = '+';
                    
                    const icon = document.createElement('img');
                    icon.className = 'offline-icon';
                    icon.src = def?.image;
                    icon.alt = 'WW';
                    
                    const text = document.createElement('span');
                    text.className = 'offline-text';
                    text.classList.add(colorClass);
                    
                    const levelCount = BigNum.fromAny(item.levels);
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
    return new BigNum(BigInt(Math.round(mantissa * 1e14)), { base: intPart - 14 });
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
    
    // --- Waterwheels Progress ---
    const waterwheelData = calculateWaterwheelOffline(seconds);
    const waterwheelLevels = [];
    for (const [id, data] of Object.entries(waterwheelData)) {
        if (data.levels && !data.levels.isZero()) {
            waterwheelLevels.push({ id, ...data });
        }
    }
    if (waterwheelLevels.length > 0) rewards.waterwheel_levels = waterwheelLevels;
    if (Object.keys(waterwheelData).length > 0) rewards.waterwheel_progress = waterwheelData;
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

    // Surge 13 (Gold), Surge 16 (Magic), and Surge 80 (DNA)
    if (isSurgeActive(13) || isSurgeActive(16) || isSurgeActive(80)) {
        const effectiveNerf = getTsunamiExponent();
        const mapped = effectiveNerf * 1.5 - 0.5;
        const log10Rate = 2 * mapped - 2;
        const rateMultiplier = bigNumFromLog10(log10Rate);
        const totalMultiplier = rateMultiplier.mulDecimal(String(seconds));

        if (isSurgeActive(13)) {
             const coins = bank.coins?.value;
             const xpState = getXpState();
             const basePending = computeForgeGoldFromInputs(coins, xpState.xpLevel);
             let pending = bank.gold?.mult?.applyTo?.(basePending) ?? basePending;
             const labMult = getLabGoldMultiplier();
             pending = pending.mulDecimal(labMult.toScientific());
             
             const goldEarned = pending.mulDecimal(totalMultiplier.toScientific());
             if (goldEarned.cmp(0) > 0 && !isCurrencyLocked('gold', slot)) {
                 rewards.gold = goldEarned;
             }
        }

        if (isSurgeActive(16)) {
             const coins = bank.coins?.value;
             const cumulativeMp = getTotalCumulativeMp();
             const pending = computeInfuseMagicFromInputs(coins, cumulativeMp);
             
             const magicEarned = pending.mulDecimal(totalMultiplier.toScientific());
             if (magicEarned.cmp(0) > 0 && !isCurrencyLocked('magic', slot)) {
                 rewards.magic = magicEarned;
             }
        }

        if (isSurgeActive(80)) {
             const tNerf = effectiveNerf;
             if (tNerf > 0) {
                 const pct = Math.pow(100, mapped);
                 const newPct = Math.pow(parseFloat(formatMultForUi(pct)), 1 / tNerf);
                 const log10RateDna = Math.log10(newPct / 100);
                 const rateMultiplierDna = bigNumFromLog10(log10RateDna);
                 const totalMultiplierDna = rateMultiplierDna.mulDecimal(String(seconds));

                 const xpState = getXpState();
                 const labLevel = getLabLevel();
                 let pending = computePendingDnaFromInputs(labLevel, xpState.xpLevel);
                 pending = bank.dna?.mult?.applyTo?.(pending) ?? pending;
                 
                 const dnaEarned = pending.mulDecimal(totalMultiplierDna.toScientific());
                 if (dnaEarned.cmp(0) > 0 && !isCurrencyLocked('dna', slot)) {
                     rewards.dna = dnaEarned;
                 }
             }
        }
    }

    const autoLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID) || 0;
    if (autoLevel > 0) {
        // Update: use BigNum to calculate totalPassives safely
        const multiplier = getEacAmountMultiplier();

        const totalPassives = BigNum.fromInt(autoLevel)
            .mulBigNumInteger(secondsBn)
            .mulDecimal(String(multiplier))
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
    
    // Handle Waterwheels
    if (rewards.waterwheel_progress) {
        applyWaterwheelOffline(rewards.waterwheel_progress);
    }

    // Handle standard currencies automatically
    for (const key of Object.keys(rewards)) {
        // Skip special keys handled above or created during handling
        if (key === 'xp' || key === 'mp' || key === 'xp_levels' || key === 'mp_levels') continue;
        if (key === 'research_levels' || key === 'research_progress') continue;
        if (key === 'waterwheel_levels' || key === 'waterwheel_progress') continue;
        
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

    if (!settingsManager.get('offline_progress')) {
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
