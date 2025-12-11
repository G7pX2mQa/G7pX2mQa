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
  const slotSuffix = slot != null ? `:${slot}` : '';

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
        // Check local storage disable setting
        const key = `ccc:autobuy:${AREA_KEYS.STARTER_COVE}:${upg.id}${slotSuffix}`;
        const setting = localStorage.getItem(key);
        if (setting === '0') continue; // Skip if explicitly disabled
        
        performFreeAutobuy(AREA_KEYS.STARTER_COVE, upg.id);
      }
    }
  }

  // Process workshop levels
  if (workshopAutobuy) {
    const key = `ccc:autobuy:workshop:genLevel${slotSuffix}`;
    const setting = localStorage.getItem(key);
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
}
