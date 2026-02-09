import { registerTick } from './gameLoop.js';
import { getLevelNumber, performFreeAutobuy, getUpgradesForArea, AREA_KEYS } from './upgrades.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { 
  AUTOMATION_AREA_KEY, 
  EFFECTIVE_AUTO_COLLECT_ID, 
  MASTER_AUTOBUY_IDS,
  AUTOBUY_WORKSHOP_LEVELS_ID
} from './automationUpgrades.js';
import { performFreeGenerationUpgrade } from '../ui/merchantTabs/workshopTab.js';
import { getActiveSlot } from '../util/storage.js';
import { isSurgeActive, getTsunamiNerf } from './surgeEffects.js';

let accumulator = 0;
let workshopTicker = 0;

const externalEacProviders = [];

export function addExternalEacMultiplierProvider(provider) {
  if (typeof provider === 'function') {
    externalEacProviders.push(provider);
  }
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
}

function onTick(dt) {
  updateAutomation(dt);
  updateAutobuyers(dt);
}

let _groupedUpgradesCache = null;

/**
 * ⚡ Bolt Optimization:
 * Cache upgrades grouped by cost type to avoid filtering the registry
 * and allocating a new array every tick.
 */
function getGroupedUpgrades() {
  if (_groupedUpgradesCache) return _groupedUpgradesCache;

  const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
  const groups = {};

  for (const upg of upgrades) {
    const type = upg.costType;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(upg);
  }

  _groupedUpgradesCache = groups;
  return _groupedUpgradesCache;
}

function processAutobuyGroup(upgrades) {
  if (!upgrades || upgrades.length === 0) return;
  for (const upg of upgrades) {
    const setting = getAutobuyerToggle(AREA_KEYS.STARTER_COVE, upg.id);
    if (setting !== '0') {
      const currentLevel = getLevelNumber(AREA_KEYS.STARTER_COVE, upg.id);
      const cap = upg.lvlCap ?? Infinity;
      if (currentLevel < cap) {
        performFreeAutobuy(AREA_KEYS.STARTER_COVE, upg.id);
      }
    }
  }
}

function updateAutobuyers(dt) {
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
}

export function updateAutomation(dt) {
  const level = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID);
  let rate = level; // Rate = level (coins/sec)

  for (const provider of externalEacProviders) {
    try {
      const val = provider();
      if (Number.isFinite(val)) rate *= val;
    } catch {}
  }

  if (rate <= 0) {
    accumulator = 0;
    return;
  }

  accumulator += dt;
  const interval = 1 / rate;

  if (accumulator >= interval) {
    const ticks = Math.floor(accumulator / interval);
    if (ticks > 0) {
      let collectCount = ticks;
      if (isSurgeActive(2)) {
        if (isSurgeActive(8)) {
            const nerf = getTsunamiNerf();
            collectCount *= Math.pow(10, nerf);
        } else {
            collectCount *= 10;
        }
      }
      triggerPassiveCollect(collectCount);
      accumulator -= ticks * interval;
    }
  }
}

export function initAutomationEffects() {
  registerTick(onTick);
  
  // Listen for save slot changes to clear cache
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', (e) => {
        const newSlot = e.detail?.slot;
        if (newSlot && newSlot !== cacheSlot) {
            autobuyerCache.clear();
            cacheSlot = newSlot;
        }
    });
  }
}
