import { registerTick } from './gameLoop.js';
import { getLevelNumber } from './upgrades.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';

let accumulator = 0;

function onTick(dt) {
  updateAutomation(dt);
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