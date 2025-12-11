import { registerTick } from './gameLoop.js';
import { getLevelNumber, performFreeAutobuy, getUpgradesForArea, AREA_KEYS } from './upgrades.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { 
  AUTOMATION_AREA_KEY, 
  EFFECTIVE_AUTO_COLLECT_ID, 
  AUTOBUY_COIN_UPGRADES_ID,
  AUTOBUY_BOOK_UPGRADES_ID,
  AUTOBUY_GOLD_UPGRADES_ID,
  AUTOBUY_MAGIC_UPGRADES_ID,
  AUTOBUY_WORKSHOP_LEVELS_ID
} from './automationUpgrades.js';
import { performFreeGenerationUpgrade } from '../ui/merchantTabs/workshopTab.js';
import { getActiveSlot } from '../util/storage.js';

let accumulator = 0;

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

function updateAutobuyers(dt) {
  const coinAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_COIN_UPGRADES_ID) > 0;
  const bookAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_BOOK_UPGRADES_ID) > 0;
  const goldAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_GOLD_UPGRADES_ID) > 0;
  const magicAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_MAGIC_UPGRADES_ID) > 0;
  const workshopAutobuy = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID) > 0;

  if (!coinAutobuy && !bookAutobuy && !goldAutobuy && !magicAutobuy && !workshopAutobuy) return;

  const slot = getActiveSlot();
  // Ensure cache slot is synced at start of tick processing to handle external slot changes
  // although ensureCacheSlot is called inside getAutobuyerToggle, calling it here once is safe
  ensureCacheSlot(slot);

  // Process standard upgrades if any standard autobuyer is active
  if (coinAutobuy || bookAutobuy || goldAutobuy || magicAutobuy) {
    const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
    for (const upg of upgrades) {
      let shouldAutobuy = false;

      if (upg.costType === 'coins' && coinAutobuy) shouldAutobuy = true;
      else if (upg.costType === 'books' && bookAutobuy) shouldAutobuy = true;
      else if (upg.costType === 'gold' && goldAutobuy) shouldAutobuy = true;
      else if (upg.costType === 'magic' && magicAutobuy) shouldAutobuy = true;

      if (shouldAutobuy) {
        // Use cached getter
        const setting = getAutobuyerToggle(AREA_KEYS.STARTER_COVE, upg.id);
        if (setting === '0') continue; // Skip if explicitly disabled
        
        performFreeAutobuy(AREA_KEYS.STARTER_COVE, upg.id);
      }
    }
  }

  // Process workshop levels
  if (workshopAutobuy) {
    // Check standard automation toggle key (ccc:autobuy:automation:6)
    const setting = getAutobuyerToggle(AUTOMATION_AREA_KEY, AUTOBUY_WORKSHOP_LEVELS_ID);
    if (setting !== '0') {
      performFreeGenerationUpgrade();
    }
  }
}

export function updateAutomation(dt) {
  const level = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID);
  const rate = level; // Rate = level (coins/sec)

  if (rate <= 0) {
    accumulator = 0;
    return;
  }

  accumulator += dt;
  const interval = 1 / rate;

  if (accumulator >= interval) {
    const count = Math.floor(accumulator / interval);
    if (count > 0) {
      triggerPassiveCollect(count);
      accumulator -= count * interval;
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
