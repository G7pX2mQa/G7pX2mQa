import { registerTick } from './gameLoop.js';
import { getLevelNumber, performFreeAutobuy, getUpgradesForArea, AREA_KEYS, evolveUpgrade, performFreeAutobuyEvolve, batchUpgradeOperations } from './upgrades.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { 
  AUTOMATION_AREA_KEY, 
  EFFECTIVE_AUTO_COLLECT_ID, 
  MASTER_AUTOBUY_IDS,
  AUTOBUY_WORKSHOP_LEVELS_ID,
  AUTOBUY_EVOLVE_UPGRADES_ID,
  UNDERWATER_CAVERN_EAC_ID,
  EFFECTIVE_AUTO_SELL_ID,
  AUTOBUY_SCRAP_UPGRADES_ID
} from './automationUpgrades.js';
import { performFreeGenerationUpgrade } from '../ui/merchantTabs/workshopTab.js';
import { getActiveSlot, getCurrencyMultiplierScaledBN, CURRENCIES, bank, UC_MATERIALS } from '../util/storage.js';
import { UC_MATERIAL_DATA, getUcEacMaterialAccumulators, saveUcEacMaterialAccumulators } from './ucSpawner.js';
import { BigNum } from '../util/bigNum.js';
import { isSurgeActive, getBaseTsunamiExponent } from './surgeEffects.js';
import { settingsManager } from './settingsManager.js';
import { isNodeLocked } from '../ui/mapOverlay.js';
import { getUpgrade } from './upgrades.js';
import { getDpState } from './dpSystem.js';

let accumulator = 0;
let ucEacAccumulator = 0;
let workshopTicker = 0;
let scrapAutoSellAccumulator = BigNum.fromInt(0);

let tsunamiBonusProvider = () => 0;

export function setTsunamiBonusProvider(fn) {
  tsunamiBonusProvider = fn;
}

const externalEacProviders = [];

export function addExternalEacMultiplierProvider(provider) {
  if (typeof provider === 'function') {
    externalEacProviders.push(provider);
  }
}

const externalEacAmountProviders = [];

export function addExternalEacAmountMultiplierProvider(provider) {
  if (typeof provider === 'function') {
    externalEacAmountProviders.push(provider);
  }
}

export function getEacAmountMultiplier() {
  let mult = 1;
  if (isSurgeActive(2)) {
    if (isSurgeActive(8)) {
        const nerf = getBaseTsunamiExponent();
        const bonus = tsunamiBonusProvider();
        let effective = nerf + bonus;
        if (effective > 1) effective = 1;
        mult *= Math.pow(10, effective);
    } else {
        mult *= 10;
    }
  }
  for (const provider of externalEacAmountProviders) {
    try {
      const val = provider();
      if (Number.isFinite(val)) mult *= val;
    } catch {}
  }
  return mult;
}

// Autobuyer Toggle Cache
// Structure: Map<string, string> where key is the localStorage key and value is the setting ('0' or '1')
const autobuyerCache = new Map();
let cacheSlot = null;

function ensureCacheSlot(slot) {
  if (cacheSlot !== slot) {
    autobuyerCache.clear();
    cacheSlot = slot;
  }
}

/**
 * Gets the autobuyer toggle state for a specific upgrade.
 * Caches the result to minimize localStorage reads.
 * Default is '1' (Active) if not set.
 */
export function getAutobuyerToggle(area, id) {
  const slot = getActiveSlot();
  ensureCacheSlot(slot);

  const slotSuffix = slot != null ? `:${slot}` : '';
  const key = `ccc:autobuy:${area}:${id}${slotSuffix}`;

  if (autobuyerCache.has(key)) {
    return autobuyerCache.get(key);
  }

  let val = '1'; // Default active
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) val = stored;
  } catch {}

  autobuyerCache.set(key, val);
  return val;
}

/**
 * Sets the autobuyer toggle state for a specific upgrade.
 * Updates both the cache and localStorage.
 */
export function setAutobuyerToggle(area, id, value) {
  const slot = getActiveSlot();
  ensureCacheSlot(slot);

  const slotSuffix = slot != null ? `:${slot}` : '';
  const key = `ccc:autobuy:${area}:${id}${slotSuffix}`;

  const valStr = String(value);
  autobuyerCache.set(key, valStr);
  try {
    localStorage.setItem(key, valStr);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('autobuyer:toggled'));
  }
}

export function setAllAutobuyersForCostType(costType, isEnabled) {
  if (costType === 'gears') return;

  const val = isEnabled ? '1' : '0';
  batchUpgradeOperations(() => {
    Object.values(AREA_KEYS).forEach(areaKey => {
      const upgrades = getUpgradesForArea(areaKey);
      upgrades.forEach(upg => {
        if (upg.costType === 'gears') return;
        if (costType === 'universal' || upg.costType === costType) {
          setAutobuyerToggle(areaKey, upg.id, val);
        }
      });
    });
  });
}

/**
 * Returns the collective automation state for a specific cost type.
 * 0 = All OFF
 * 1 = All ON
 * 0.5 = Mixed ("Sort of ON")
 */
export function getCollectiveAutobuyerState(costType) {
  if (costType === 'gears') {
    return settingsManager.get(`currency_gears_automated`) !== false ? 1 : 0;
  }

  let onCount = 0;
  let totalCount = 0;

  Object.values(AREA_KEYS).forEach(areaKey => {
    const upgrades = getUpgradesForArea(areaKey);
    upgrades.forEach(upg => {
      if (costType === 'universal' || upg.costType === costType) {
        totalCount++;
        if (getAutobuyerToggle(areaKey, upg.id) !== '0') {
          onCount++;
        }
      }
    });
  });

  if (totalCount === 0) {
    return settingsManager.get(`currency_${costType}_automated`) !== false ? 1 : 0;
  }
  if (onCount === 0) return 0;
  if (onCount === totalCount) return 1;
  return 0.5; // Mixed state
}

function onTick(dt) {
  updateAutomation(dt);
  updateAutobuyers(dt);
}

let _groupedUpgradesCache = null;
let _hmUpgradesCache = null;

/**
 * ⚡ Bolt Optimization:
 * Cache upgrades grouped by cost type to avoid filtering the registry
 * and allocating a new array every tick.
 */
function getGroupedUpgrades() {
  if (_groupedUpgradesCache) return _groupedUpgradesCache;

  const upgrades = Object.values(AREA_KEYS).flatMap(areaKey => getUpgradesForArea(areaKey));
  const groups = {};
  const hmUpgrades = [];

  for (const upg of upgrades) {
    const type = upg.costType;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(upg);
    
    if (upg.upgType === 'HM') {
      hmUpgrades.push(upg);
    }
  }

  _hmUpgradesCache = hmUpgrades;
  _groupedUpgradesCache = groups;
  return _groupedUpgradesCache;
}

function getHmUpgrades() {
  if (!_hmUpgradesCache) getGroupedUpgrades();
  return _hmUpgradesCache;
}

function processAutobuyGroup(upgrades) {
  if (!upgrades || upgrades.length === 0) return;
  for (const upg of upgrades) {
    const area = upg.area || AREA_KEYS.STARTER_COVE;

    // We no longer check the master currency toggle setting here.
    // The master toggle now sets the individual upgrade toggles,
    // so we can just rely on the individual toggle's state.

    const setting = getAutobuyerToggle(area, upg.id);
    if (setting !== '0') {
      const currentLevel = getLevelNumber(area, upg.id);
      const cap = upg.lvlCap ?? Infinity;
      if (currentLevel < cap) {
        performFreeAutobuy(area, upg.id);
      }
    }
  }

}

function updateAutobuyers(dt) {
  batchUpgradeOperations(() => {
    const slot = getActiveSlot();
    ensureCacheSlot(slot);

    // Tick-sliced processing for standard upgrades
    // Iterate over MASTER_AUTOBUY_IDS to dynamically handle cost types
    const groups = getGroupedUpgrades();
    for (const [idStr, currencyKey] of Object.entries(MASTER_AUTOBUY_IDS)) {
      const id = Number(idStr);
      // Check if this specific autobuyer is purchased/active
      if (getLevelNumber(AUTOMATION_AREA_KEY, id) > 0) {
        if (groups[currencyKey]) {
          processAutobuyGroup(groups[currencyKey]);
        }
      }
    }

    // Process workshop levels (throttled to ~4Hz)
    const workshopAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID) > 0;
    if (workshopAutobuy) {
      workshopTicker++;
      if (workshopTicker >= 5) {
        workshopTicker = 0;
        const setting = getAutobuyerToggle(AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID);
        if (setting !== '0') {
          performFreeGenerationUpgrade();
        }
      }
    }

    // Process Auto-Evolve Upgrades
    const evolveAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_EVOLVE_UPGRADES_ID) > 0;
    if (evolveAutobuy) {
      const setting = getAutobuyerToggle(AUTOMATION_AREA_KEY, AUTOBUY_EVOLVE_UPGRADES_ID);
      if (setting !== '0') {
        const hmUpgrades = getHmUpgrades();
        for (const upg of hmUpgrades) {
          const area = upg.area || AREA_KEYS.STARTER_COVE;
          // Only auto-evolve if the upgrade's standard autobuyer toggle is also ON
          if (getAutobuyerToggle(area, upg.id) !== '0') {
            performFreeAutobuyEvolve(area, upg.id);
          }
        }
      }
    }
  });
}

export function updateAutomation(dt) {
  const eacEfficiency = settingsManager.get("eac_efficiency");
  const efficiencyMult = eacEfficiency !== undefined ? (eacEfficiency / 100) : 1;

  if (eacEfficiency === 0) {
    accumulator = 0;
    ucEacAccumulator = 0;
  }

  const level = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID);
  let rate = level; // Rate = level (coins/sec)

  for (const provider of externalEacProviders) {
    try {
      const val = provider();
      if (Number.isFinite(val)) rate *= val;
    } catch {}
  }

  if (rate > 0 && eacEfficiency !== 0) {
    accumulator += dt;
    const interval = 1 / rate;

    if (accumulator >= interval) {
      const ticks = Math.floor(accumulator / interval);
      if (ticks > 0) {
        let collectCount = ticks;
        collectCount *= getEacAmountMultiplier();
        collectCount *= efficiencyMult;
        triggerPassiveCollect(collectCount);
        accumulator -= ticks * interval;
      }
    }
  } else {
    accumulator = 0;
  }

  // UC EAC Logic
  const ucEacLevel = getLevelNumber(AUTOMATION_AREA_KEY, UNDERWATER_CAVERN_EAC_ID);
  const ucEacUpgDef = getUpgrade(AUTOMATION_AREA_KEY, UNDERWATER_CAVERN_EAC_ID);
  let ucRate = 0;
  if (!ucEacUpgDef || !ucEacUpgDef.requiredNodeId || !isNodeLocked(ucEacUpgDef.requiredNodeId, true)) {
    ucRate = ucEacLevel;
  }
  
  for (const provider of externalEacProviders) {
    try {
      const val = provider();
      if (Number.isFinite(val)) ucRate *= val;
    } catch {}
  }

  if (ucRate > 0 && eacEfficiency !== 0) {
    ucEacAccumulator += dt;
    const ucInterval = 1 / ucRate;

    if (ucEacAccumulator >= ucInterval) {
      const ticks = Math.floor(ucEacAccumulator / ucInterval);
      if (ticks > 0) {
        let collectCount = ticks;
        collectCount *= getEacAmountMultiplier();
        collectCount *= efficiencyMult;
        
        let dpLevelNum = 0;
        try {
           const dpState = getDpState();
           if (dpState && dpState.dpLevel) {
               dpLevelNum = Number(dpState.dpLevel.toString());
           }
        } catch {}

        const accs = getUcEacMaterialAccumulators();
        let anyGains = false;
        
        for (let t = 0; t < collectCount; t++) {
            for (let j = 0; j < UC_MATERIALS.length; j++) {
                const matData = UC_MATERIAL_DATA[j];
                let gain = 0;
                if (j === 0) {
                    gain = 1.0;
                } else {
                    if (dpLevelNum >= matData.max) {
                        gain = 1.0;
                    } else if (dpLevelNum >= matData.start) {
                        const progress = (dpLevelNum - matData.start) / (matData.max - matData.start);
                        gain = 0.01 + 0.99 * Math.pow(progress, 1.5);
                    }
                }
                
                accs[j] += gain;
                if (accs[j] > 1.99) accs[j] = 1.99;
                
                if (accs[j] >= 1.0) {
                    accs[j] -= 1.0;
                    const matKey = UC_MATERIALS[j];
                    if (bank[matKey] && !globalThis?.__cccLockedStorageKeys?.has?.(`ccc:${matKey}`)) {
                        const mult = bank[matKey].mult.get();
                        const finalVal = BigNum.fromInt(1).mulBigNumInteger(mult);
                        bank[matKey].add(finalVal);
                        anyGains = true;
                    }
                }
            }
        }
        
        if (anyGains) {
            try { scheduleHudUpdate(); } catch {}
        }
        
        if (window.dpSystem && typeof window.dpSystem.addDp === 'function') {
            window.dpSystem.addDp(collectCount);
        }
        
        ucEacAccumulator -= ticks * ucInterval;
        const now = Date.now();
        if (now - lastUcEacSaveTime > 1000) {
            saveUcEacAccumulator();
            saveUcEacMaterialAccumulators();
            lastUcEacSaveTime = now;
        }
      }
    }
  } else {
    ucEacAccumulator = 0;
  }

  // Auto-Sell Logic
  const autoSellLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_SELL_ID);
  const autoSellUpgDef = getUpgrade(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_SELL_ID);
  const autoSellIsLocked = autoSellUpgDef && autoSellUpgDef.requiredNodeId && isNodeLocked(autoSellUpgDef.requiredNodeId, true);
  if (!autoSellIsLocked && autoSellLevel > 0 && bank.scrap && !globalThis?.__cccLockedStorageKeys?.has?.('ccc:scrap')) {
      const autoSellSetting = settingsManager.get("auto_sell_efficiency");
      const autoSellMult = autoSellSetting !== undefined ? (autoSellSetting / 100) : 1;
      if (autoSellMult === 0) return;
      let eff = 0;
      if (autoSellLevel === 1) eff = 0.000001; // 0.0001%
      else if (autoSellLevel === 2) eff = 0.0001; // 0.01%
      else if (autoSellLevel === 3) eff = 0.01; // 1%
      else if (autoSellLevel >= 4) eff = 1.0;
      eff *= autoSellMult; // 100%
      
      const scrapMultiplier = getCurrencyMultiplierScaledBN(CURRENCIES.SCRAP);
      let totalScrapGain = BigNum.fromInt(0);

      for (let j = 0; j < UC_MATERIALS.length; j++) {
          const matKey = UC_MATERIALS[j];
          const matData = UC_MATERIAL_DATA[j];
          if (bank[matKey] && bank[matKey].value.cmp(0) > 0) {
              const owned = bank[matKey].value;
              const materialValue = BigNum.fromAny(matData.value || 0);
              const valPerMaterial = materialValue.mulBigNumInteger(scrapMultiplier).mulScaledIntFloor(1, 18);
              const potentialScrap = owned.mulBigNumInteger(valPerMaterial);
              
              if (eff === 1.0) {
                  totalScrapGain = totalScrapGain.add(potentialScrap);
              } else {
                  totalScrapGain = totalScrapGain.add(potentialScrap.mulDecimal(eff));
              }
          }
      }

      scrapAutoSellAccumulator = scrapAutoSellAccumulator.add(totalScrapGain);
      
      const toAdd = scrapAutoSellAccumulator.floorToInteger();
      if (toAdd.cmp(0) > 0) {
          bank.scrap.add(toAdd);
          scrapAutoSellAccumulator = scrapAutoSellAccumulator.sub(toAdd);
      }
  }
}


let lastUcEacSaveTime = 0;
export function saveUcEacAccumulator() {
    try {
        localStorage.setItem(`ccc:ucEacAccumulator:${getActiveSlot()}`, String(ucEacAccumulator));
    } catch {}
}

export function loadUcEacAccumulator() {
    try {
        const stored = localStorage.getItem(`ccc:ucEacAccumulator:${getActiveSlot()}`);
        ucEacAccumulator = stored ? Number(stored) : 0;
        if (!Number.isFinite(ucEacAccumulator)) ucEacAccumulator = 0;
    } catch {
        ucEacAccumulator = 0;
    }
}

export function resetUcEacAccumulator() {
    ucEacAccumulator = 0;
    saveUcEacAccumulator();
}

export function initAutomationEffects() {
  loadUcEacAccumulator();
  registerTick(onTick);
  
  // Listen for save slot changes to clear cache
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', (e) => {
        const newSlot = e.detail?.slot;
        if (newSlot !== undefined && newSlot !== cacheSlot) {
            autobuyerCache.clear();
            loadUcEacAccumulator();
            cacheSlot = newSlot;
        }
    });
  }
}
