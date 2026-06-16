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
import { passiveRegistry } from './passiveRegistry.js';
import { getEacAmountMultiplier } from './automationEffects.js';
import { settingsManager } from './settingsManager.js';
import { getPassiveCoinReward } from './coinPickup.js';
import { addXp, getXpProgressRatio, getXpState } from './xpSystem.js';
import { addMutationPower, getMutationState, getMutationProgressRatio, getTotalCumulativeMp } from './mutationSystem.js';
import { getBookProductionRate, isSurgeActive, getTsunamiExponent } from './surgeEffects.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { computeForgeGoldFromInputs, computeInfuseMagicFromInputs, computePendingDnaFromInputs, getCurrentSurgeLevel, getSurgeRequirement, isSurgeUnlocked } from '../ui/merchantTabs/resetTab.js';
import { getLabGoldMultiplier } from './labNodes.js';
import { getUcEacMaterialAccumulators, saveUcEacMaterialAccumulators } from './ucSpawner.js';
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

export const RESOURCE_REGISTRY_EXTRAS = {
    'research_levels': {
        key: 'research_levels',
        singular: 'RP',
        plural: 'RP',
        icon: 'img/stats/rp/rp.webp',
        bgGradient: 'linear-gradient(to bottom, #003264 0%, #004678 15%, #005688 50%, #004678 85%, #003264 100%)'
    },
    'waterwheel_levels': {
        key: 'waterwheel_levels',
        singular: 'FP',
        plural: 'FP',
        icon: 'img/stats/fp/fp.webp',
        bgGradient: 'linear-gradient(to bottom, #12B1B5 0%, #26C5C9 15%, #36D5D9 50%, #26C5C9 85%, #12B1B5 100%)'
    }
};

export const RESOURCE_REGISTRY = [
    { key: 'voidGems', bgGradient: 'black', icon: 'img/currencies/void_gem.webp', baseIcon: 'img/currencies/void_gem.webp', noPlusBase: true, singular: 'Void Gem', plural: 'Void Gems', type: 'currency' },
    { key: 'rainbowGems', bgGradient: 'linear-gradient(to bottom in oklch, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0000ff, #a000ff, #ff00ff)', icon: 'img/currencies/rainbow_gem.webp', baseIcon: 'img/currencies/rainbow_gem.webp', noPlusBase: true, singular: 'Rainbow Gem', plural: 'Rainbow Gems', type: 'currency' },
    { key: 'coins', bgGradient: 'linear-gradient(to bottom, #d1a008 0%, #e3b527 15%, #ffeb3b 50%, #e3b527 85%, #d1a008 100%)',      icon: 'img/currencies/coin/coin.webp', baseIcon: 'img/currencies/coin/coin_plus_base.webp',   singular: 'Coin',     plural: 'Coins', type: 'currency' },
    { 
        key: 'xp', 
        icon: 'img/stats/xp/xp.webp', 
        singular: 'XP', 
        plural: 'XP', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(12,26,46,1), rgba(16,32,58,1))', 
        bgGradient: 'linear-gradient(to bottom, #008bcc 0%, #00aeff 15%, #00c8fa 50%, #00aeff 85%, #008bcc 100%)', 
        fillGradient: 'linear-gradient(90deg, rgba(0,240,255,1) 0%, rgba(0,150,255,1) 50%, rgba(0,70,210,1) 100%)', 
        barOutline: '3px', 
        borderColor: '#01060f', 
        barBoxShadow: 'inset 0 6px 10px rgba(255,255,255,0.14), inset 0 -6px 14px rgba(0,0,0,0.45)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))', 
        glassOpacity: '0.6',
        getState: () => {

            const state = getXpState();
            if (!state) return null;
            return {
                level: state.xpLevel,
                progress: state.progress,
                requirement: state.requirement,
                isUnlocked: state.unlocked,
                ratio: getXpProgressRatio()
            };
        }
    },
    { key: 'xp_levels', icon: 'img/stats/xp/xp.webp',            singular: 'XP Level', plural: 'XP Levels', type: 'levelStat', color: '#00c8fa', barText: 'Level<span class="xp-level-value">{val}</span>' },
    { key: 'books', bgGradient: 'linear-gradient(to bottom, #82551b 0%, #94601e 15%, #AC6C1B 50%, #94601e 85%, #82551b 100%)',      icon: 'img/currencies/book/book.webp', baseIcon: 'img/currencies/book/book_plus_base.webp',   singular: 'Book',     plural: 'Books', type: 'currency' },
    { key: 'gold', bgGradient: 'linear-gradient(to bottom, #FF9801 0%, #FFAC15 15%, #FFC926 50%, #FFAC15 85%, #FF9801 100%)',       icon: 'img/currencies/gold/gold.webp', baseIcon: 'img/currencies/gold/gold_plus_base.webp',   singular: 'Gold',     plural: 'Gold', type: 'currency' },
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
        glassOpacity: '0.55',
        getState: () => {
            const state = getMutationState();
            if (!state) return null;
            return {
                level: state.level,
                progress: state.progress,
                requirement: state.requirement,
                isUnlocked: state.unlocked,
                ratio: getMutationProgressRatio()
            };
        }
    },
    { key: 'mp_levels', icon: 'img/stats/mp/mp.webp',            singular: 'Mutation', plural: 'Mutations', type: 'levelStat', color: '#ff9933', barText: 'Mutation<span class="mp-level-value">{val}</span>' },
    { key: 'magic', bgGradient: 'linear-gradient(to bottom, #42138A 0%, #6A1ECF 15%, #9F30FF 50%, #6A1ECF 85%, #42138A 100%)',     icon: 'img/currencies/magic/magic.webp', baseIcon: 'img/currencies/magic/magic_plus_base.webp', singular: 'Magic',    plural: 'Magic', type: 'currency' },
    { key: 'gears', bgGradient: 'linear-gradient(to bottom, #5c5d61 0%, #8f9096 15%, #9d9fa6 50%, #8f9096 85%, #5c5d61 100%)',     icon: 'img/currencies/gear/gear.webp', baseIcon: 'img/currencies/gear/gear_plus_base.webp',   singular: 'Gear',     plural: 'Gears', type: 'currency' },
    { 
        key: 'waves', 
        icon: 'img/currencies/wave/wave.webp', 
        baseIcon: 'img/currencies/wave/wave_plus_base.webp', 
        singular: 'Waves', 
        plural: 'Waves', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(10,30,40,1), rgba(15,40,55,1))', 
        bgGradient: 'linear-gradient(to bottom, #0286a1 0%, #02b1d4 15%, #00eded 50%, #02b1d4 85%, #0286a1 100%)', 
        fillGradient: 'linear-gradient(90deg, rgba(0,237,237,1) 0%, rgba(2,177,212,1) 50%, rgba(2,48,115,1) 100%)',
        barOutline: '3px', 
        borderColor: '#023340', 
        barBoxShadow: 'inset 0 6px 10px rgba(0,237,237,0.18), inset 0 -6px 14px rgba(0,0,0,0.52)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0))', 
        glassOpacity: '0.55',
        getState: () => {
            const level = getCurrentSurgeLevel();
            const progress = bank?.waves?.value || BigNum.fromInt(0);
            const req = getSurgeRequirement(level);
            let isUnlocked = isSurgeUnlocked();
            
            let ratio = 0;
            if (req.isInfinite?.()) {
                ratio = 0;
            } else if (progress.isInfinite?.()) {
                ratio = 1;
            } else if (!req.isZero?.()) {
                const ratioBn = progress.div(req);
                ratio = Number(ratioBn.toScientific?.() ?? '0');
            }
            
            return {
                level: BigNum.fromAny(level),
                progress,
                requirement: req,
                isUnlocked,
                ratio: Math.min(1, Math.max(0, ratio))
            };
        }
    },
    { key: 'waves_levels', icon: 'img/misc/surge.webp', baseIcon: 'img/misc/surge_plus_base.webp', singular: 'Surge', plural: 'Surges', type: 'levelStat', color: '#00eded', barText: 'Surge <span class="waves-level-value">{val}</span>' },
    { key: 'dna', bgGradient: 'repeating-linear-gradient(-45deg, #C00000, #C00000 30.1px, #00B0F0 30.1px, #00B0F0 60.2px)',       icon: 'img/currencies/dna/dna.webp', baseIcon: 'img/currencies/dna/dna_plus_base.webp',     singular: 'DNA',      plural: 'DNA', type: 'currency' },
    { key: 'research_levels', icon: 'img/stats/rp/rp.webp',      singular: 'Level',    plural: 'Levels', type: 'levelStat', barText: 'Level<span class="research-level-value">{val}</span>' },
    { key: 'waterwheel_levels', icon: 'img/waterwheels/waterwheel_coin.webp', singular: 'Level', plural: 'Levels', type: 'levelStat', barText: 'Level<span class="waterwheel-level-value">{val}</span>' },


    { key: 'scrap', bgGradient: 'linear-gradient(to bottom, #666666 0%, #767676 15%, #8a8a8a 50%, #767676 85%, #666666 100%)', icon: 'img/currencies/scrap/scrap.webp', baseIcon: 'img/currencies/scrap/scrap_plus_base.webp', singular: 'Scrap', plural: 'Scrap', type: 'currency' },
    { key: 'stone', bgGradient: 'linear-gradient(to bottom, #666666 0%, #767676 15%, #8a8a8a 50%, #767676 85%, #666666 100%)', icon: 'img/materials/stone.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Stone', plural: 'Stone', type: 'currency' },
    { key: 'copper', bgGradient: 'linear-gradient(to bottom, #b6673f 0%, #d1835c 15%, #e99f79 50%, #d1835c 85%, #b6673f 100%)', icon: 'img/materials/copper.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Copper', plural: 'Copper', type: 'currency' },
    { key: 'iron', bgGradient: 'linear-gradient(to bottom, #aab0b6 0%, #c9ced3 15%, #e6e8eb 50%, #c9ced3 85%, #aab0b6 100%)', icon: 'img/materials/iron.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Iron', plural: 'Iron', type: 'currency' },
    { key: 'pure_gold', bgGradient: 'linear-gradient(to bottom, #d4b22c 0%, #eecf53 15%, #ffe67a 50%, #eecf53 85%, #d4b22c 100%)', icon: 'img/materials/pure_gold.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Pure Gold', plural: 'Pure Gold', type: 'currency' },
    { key: 'diamond', bgGradient: 'linear-gradient(to bottom, #50c3ca 0%, #7be0e6 15%, #a0f6f9 50%, #7be0e6 85%, #50c3ca 100%)', icon: 'img/materials/diamond.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Diamond', plural: 'Diamonds', type: 'currency' },
    { key: 'emerald', bgGradient: 'linear-gradient(to bottom, #23ab1b 0%, #47d13f 15%, #6bf564 50%, #47d13f 85%, #23ab1b 100%)', icon: 'img/materials/emerald.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Emerald', plural: 'Emeralds', type: 'currency' },
    { key: 'ruby', bgGradient: 'linear-gradient(to bottom, #c22121 0%, #e64545 15%, #ff6b6b 50%, #e64545 85%, #c22121 100%)', icon: 'img/materials/ruby.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Ruby', plural: 'Rubies', type: 'currency' },
    { key: 'sapphire', bgGradient: 'linear-gradient(to bottom, #0022cc 0%, #1c38d6 25%, #3950d4 50%, #1c38d6 75%, #0022cc 100%)', icon: 'img/materials/sapphire.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Sapphire', plural: 'Sapphires', type: 'currency' },
    { key: 'unobtainium', bgGradient: 'linear-gradient(to bottom, #330d58 0%, #7633b5 15%, #9352d8 50%, #7633b5 85%, #330d58 100%)', icon: 'img/materials/unobtainium.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Unobtainium', plural: 'Unobtainium', type: 'currency' },
    { key: 'prismatium', bgGradient: 'linear-gradient(to bottom in oklch, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0000ff, #a000ff, #ff00ff)', icon: 'img/materials/prismatium.webp', baseIcon: 'img/currencies/scrap/scrap_base.webp', noPlusBase: true, singular: 'Prismatium', plural: 'Prismatium', type: 'currency' },
    { 
        key: 'dp', 
        icon: 'img/stats/dp/dp.webp', 
        baseIcon: 'img/stats/dp/dp_plus_base.webp', 
        singular: 'DP', 
        plural: 'DP', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(35,24,18,1), rgba(25,18,13,1))',
        bgGradient: 'linear-gradient(to bottom, #6B4E3A 0%, #8A674D 15%, #A98060 50%, #8A674D 85%, #6B4E3A 100%)',
        fillGradient: 'linear-gradient(90deg, rgba(169,128,96,1) 0%, rgba(138,103,77,1) 50%, rgba(107,78,58,1) 100%)', 
        barOutline: '3px', 
        borderColor: '#1f1610', 
        barBoxShadow: 'inset 0 6px 10px rgba(169,128,96,0.18), inset 0 -6px 14px rgba(0,0,0,0.52)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0))', 
        glassOpacity: '0.55',
        getState: () => {
            if (!window.dpSystem || typeof window.dpSystem.getDpState !== 'function') return null;
            const state = window.dpSystem.getDpState();
            if (!state) return null;
            return {
                level: state.dpLevel,
                progress: state.progress,
                requirement: state.requirement,
                isUnlocked: window.dpSystem.isDpSystemUnlocked ? window.dpSystem.isDpSystemUnlocked() : true,
                ratio: window.dpSystem.getDpProgressRatio ? window.dpSystem.getDpProgressRatio() : 0
            };
        }
    },
    { key: 'dp_levels', icon: 'img/stats/dp/dp.webp',            singular: 'meter of Depth', plural: 'meters of Depth', type: 'levelStat', color: '#A98060', barText: 'Depth:<span class="dp-level-value">{val}</span>m', noTextGap: true },

    { key: 'cores', bgGradient: 'linear-gradient(to bottom, #0a0a0a 0%, #1a1a1a 15%, #2a2a2a 50%, #1a1a1a 85%, #0a0a0a 100%)',      icon: 'img/currencies/core/core.webp', baseIcon: 'img/currencies/core/core_plus_base.webp',   singular: 'Core',     plural: 'Cores', type: 'currency' },
    { key: 'crystals', bgGradient: 'linear-gradient(to bottom, #943276 0%, #bd53a3 15%, #e979d0 50%, #bd53a3 85%, #943276 100%)',      icon: 'img/currencies/crystal/crystal.webp', baseIcon: 'img/currencies/crystal/crystal_plus_base.webp',   singular: 'Crystal',     plural: 'Crystals', type: 'currency' },
    { 
        key: 'pp', 
        icon: 'img/stats/pp/pp.webp', 
        singular: 'PP', 
        plural: 'PP', 
        type: 'levelProg', 
        pinBgGradient: 'linear-gradient(180deg, rgba(48,8,42,1), rgba(34,6,29,1))', 
        bgGradient: 'linear-gradient(to bottom, #ef75b2 0%, #ee6aac 15%, #eb529f 50%, #e93a91 85%, #e8308c 100%)', 
        fillGradient: 'linear-gradient(90deg, rgba(239,117,178,1) 0%, rgba(235,82,159,1) 50%, rgba(232,48,140,1) 100%)', 
        barOutline: '3px', 
        borderColor: '#1a0512', 
        barBoxShadow: 'inset 0 6px 10px rgba(255,255,255,0.14), inset 0 -6px 14px rgba(0,0,0,0.45)', 
        glassBg: 'linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))', 
        glassOpacity: '0.6',
        getState: () => {
            if (!window.ppSystem || typeof window.ppSystem.getPpState !== 'function') return null;
            const state = window.ppSystem.getPpState();
            return {
                level: state.ppLevel,
                progress: state.progress,
                requirement: state.requirement,
                isUnlocked: window.ppSystem.isPpSystemUnlocked ? window.ppSystem.isPpSystemUnlocked() : true,
                ratio: window.ppSystem.getPpProgressRatio ? window.ppSystem.getPpProgressRatio() : 0
            };
        }
    },
    { key: 'pp_levels', icon: 'img/stats/pp/pp.webp', singular: 'atm of Pressure', plural: 'atms of Pressure', type: 'levelStat', color: '#ff66d9', barText: 'Pressure:<span class="pp-level-value">{val}</span>atm', noTextGap: true },
];


function applyAutoColor(plusEl, textEl, colorKey, registryConfig) {
    let displayStyle = null;
    let fallbackClass = null;

    if (colorKey === 'dna') {
        fallbackClass = 'text-dna';
    } else if (colorKey === 'prismatium') {
        fallbackClass = 'text-prismatium';
    } else {
        if (registryConfig && registryConfig.bgGradient) {
            const match = registryConfig.bgGradient.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s+50%/);
            if (match) {
                displayStyle = match[1];
            }
        } else if (registryConfig && registryConfig.color) {
            displayStyle = registryConfig.color;
        }
        
        if (!displayStyle) {
            fallbackClass = `text-${colorKey}`;
        }
    }

    if (displayStyle) {
        plusEl.style.color = displayStyle;
        textEl.style.color = displayStyle;
    } else if (fallbackClass) {
        plusEl.classList.add(fallbackClass);
        textEl.classList.add(fallbackClass);
    }
}

export function showOfflinePanel(rewards, offlineMs, isPreAutomation = false) {
    if (window.__tsunamiActive || window.__bossFightSequenceActive || window.__mapSequenceActive) return;

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
                    text.innerHTML = `${formatNumber(levelCount)} ${label} of ${item.name}`;
                    
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

                    const plus = document.createElement('span');
                    plus.className = 'offline-plus';
                    plus.textContent = '+';
                    
                    const icon = document.createElement('img');
                    icon.className = 'offline-icon';
                    icon.src = def?.image;
                    icon.alt = 'WW';
                    
                    const text = document.createElement('span');
                    text.className = 'offline-text';

                    const styleKey = def?.styleKey || 'coins';
                    const matchedConfig = RESOURCE_REGISTRY.find(r => r.key === styleKey);
                    applyAutoColor(plus, text, styleKey, matchedConfig);
                    
                    const levelCount = BigNum.fromAny(item.levels);
                    const label = (levelCount.cmp(BigNum.fromInt(1)) === 0) ? 'Level' : 'Levels';
                    text.innerHTML = `${formatNumber(levelCount)} ${label} of ${item.name}`;
                    
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
        plus.textContent = '+';
        
        // Icon
        const icon = document.createElement('img');
        icon.className = 'offline-icon';
        icon.src = config.icon;
        icon.alt = key;
        
        // Amount
        const text = document.createElement('span');
        text.className = 'offline-text';

        // Infinity formatting logic - separate from text so we can selectively color
        const infinityHtml = `<span class="infinity-symbol">&infin;</span>`;

        // Styling for both plus and text
        applyAutoColor(plus, text, key, config);
        
        // Grammar logic
        let isOne = false;
        if (val instanceof BigNum) {
            isOne = !val.isInfinite() && val.cmp(BigNum.fromInt(1)) === 0;
        } else {
            isOne = (Number(val) === 1);
        }
        
        const displayName = isOne ? config.singular : config.plural;

        
        let amountText = formatNumber(val);
        let hasInfinity = false;
        if (amountText === 'Infinity' || amountText === 'NaN' || amountText.includes('infinity-symbol')) {
            hasInfinity = true;
        }

        text.innerHTML = hasInfinity ? displayName : `${amountText} ${displayName}`;
        
        row.appendChild(plus);
        row.appendChild(icon);
        
        if (hasInfinity) {
            const infSpan = document.createElement('span');
            infSpan.className = 'infinity-symbol';
            infSpan.innerHTML = '&infin;';
            infSpan.style.color = '#ffff55';
            infSpan.style.webkitTextFillColor = '#ffff55';
            row.appendChild(infSpan);
        }
        
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
    return new BigNum(Number(Math.round(mantissa * 1e14)), { base: intPart - 14 });
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

        // Process all passive systems registered in passiveRegistry
    const eacEfficiency = settingsManager.get("eac_efficiency");
    const eacMult = eacEfficiency !== undefined ? (eacEfficiency / 100) : 1;
    
    for (const sys of passiveRegistry) {
        let sysEfficiencyMult = 1;
        if (sys.getEfficiencyMultiplier) {
            sysEfficiencyMult = sys.getEfficiencyMultiplier();
        } else {
            sysEfficiencyMult = eacMult;
        }
        
        if (sysEfficiencyMult === 0) continue;
        
        if (typeof sys.onOffline === 'function') {
            const rate = sys.getRate();
            if (rate > 0) {
                let totalPassivesSecs = secondsBn.mulDecimal(String(rate));
                
                if (sys.getAmountMultiplier) {
                    totalPassivesSecs = totalPassivesSecs.mulDecimal(String(sys.getAmountMultiplier()));
                }
                totalPassivesSecs = totalPassivesSecs.mulDecimal(String(sysEfficiencyMult));
                
                const totalPassives = totalPassivesSecs.floorToInteger();
                
                if (!totalPassives.isZero()) {
                    const sysRewards = sys.onOffline(secondsBn, totalPassives);
                        if (sysRewards) {
                            for (const [key, val] of Object.entries(sysRewards)) {
                                if (key === 'uc_eac_progress') {
                                    rewards.uc_eac_progress = val;
                                } else if (val instanceof BigNum) {
                                    if (rewards[key] && rewards[key] instanceof BigNum) {
                                        rewards[key] = rewards[key].add(val);
                                    } else {
                                        rewards[key] = val;
                                    }
                                } else {
                                    // Handle non-BigNum additive properties if they exist
                                    if (rewards[key]) {
                                        rewards[key] += val;
                                    } else {
                                        rewards[key] = val;
                                    }
                                }
                            }
                        }
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
    if (rewards.dp) {
        try {
            // dpSystem addDp handles logic, similar to addXp
            if (window.dpSystem && typeof window.dpSystem.addDp === 'function') {
                const dpResult = window.dpSystem.addDp(rewards.dp);
                if (dpResult) {
                    if (dpResult.dpLevelsGained && !dpResult.dpLevelsGained.isZero()) {
                        rewards.dp_levels = dpResult.dpLevelsGained;
                    }
                    if (dpResult.dpAdded) {
                        rewards.dp = dpResult.dpAdded;
                    }
                }
            }
        } catch {}
    }
    if (rewards.pp) {
        try {
            if (window.ppSystem && typeof window.ppSystem.addPp === 'function') {
                const ppResult = window.ppSystem.addPp(rewards.pp);
                if (ppResult) {
                    if (ppResult.ppLevelsGained && !ppResult.ppLevelsGained.isZero()) {
                        rewards.pp_levels = ppResult.ppLevelsGained;
                    }
                    if (ppResult.ppAdded) {
                        rewards.pp = ppResult.ppAdded;
                    }
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

    // Handle UC EAC Material fractional progress
    if (rewards.uc_eac_progress) {
        try {
            const accs = getUcEacMaterialAccumulators();
            for (let i = 0; i < accs.length; i++) {
                accs[i] = rewards.uc_eac_progress[i];
            }
            saveUcEacMaterialAccumulators();
        } catch {}
    }

    // Handle standard currencies automatically
    for (const key of Object.keys(rewards)) {
        // Skip special keys handled above or created during handling
        if (key === 'xp' || key === 'mp' || key === 'dp' || key === 'xp_levels' || key === 'mp_levels' || key === 'dp_levels' || key === 'pp' || key === 'pp_levels') continue;
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
    if (window.__tsunamiActive || window.__bossFightSequenceActive || window.__mapSequenceActive) return;

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
