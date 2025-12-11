import { registerTick } from './gameLoop.js';
import { getLevelNumber, performFreeAutobuy, getUpgradesForArea, AREA_KEYS } from './upgrades.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID, AUTOBUY_COIN_UPGRADES_ID } from './automationUpgrades.js';
import { getActiveSlot } from '../util/storage.js';

let accumulator = 0;

function onTick(dt) {
  updateAutomation(dt);
  updateAutobuyers(dt);
}

function updateAutobuyers(dt) {
  const autobuyLevel = getLevelNumber(AUTOMATION_AREA_KEY, AUTOBUY_COIN_UPGRADES_ID);
  if (autobuyLevel <= 0) return;

  const slot = getActiveSlot();
  const slotSuffix = slot != null ? `:${slot}` : '';

  const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
  for (const upg of upgrades) {
    if (upg.costType === 'coins') {
      const key = `ccc:autobuy:${AREA_KEYS.STARTER_COVE}:${upg.id}${slotSuffix}`;
      const setting = localStorage.getItem(key);
      if (setting === '0') continue; // Skip if explicitly disabled
      
      performFreeAutobuy(AREA_KEYS.STARTER_COVE, upg.id);
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
