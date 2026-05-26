import { unlockDpSystem } from './dpSystem.js';
import { computeDefaultUpgradeCost, formatMultForUi, UPGRADE_TIES, determineLockState } from './upgrades.js';

import { BigNum } from '../util/bigNum.js';

export const UC_AREA_KEY = 'underwater_cavern';

export const UC_REGISTRY = [
  {
    area: UC_AREA_KEY,
    id: 1,
    tie: 'scrap_1',
    title: 'Faster Materials',
    desc: 'Increases Material Spawn Rate by +9% per level',
    lvlCap: 100,
    baseCost: 10,
    costType: 'scrap',
    upgType: 'NM',
    effectType: 'material_spawn',
    icon: 'img/uc_upg_icons/faster_materials.webp',
    costAtLevel(level) { return computeDefaultUpgradeCost(this.baseCost, level, this.upgType); },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Material Spawn Rate bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return 1 + (0.09 * normalizedLevel);
    },
  },
  {
    area: UC_AREA_KEY,
    id: 2,
    tie: 'none_5',
    title: "Unlock Sell",
    desc: "Unlocks the Sell tab in the Delve menu",
    lvlCap: 1,
    upgType: "NM",
    icon: "",
    baseIconOverride: "img/misc/sell_plus_base.webp",
    
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState: determineLockState,
    onLevelChange({ newLevel }) {
      if ((newLevel ?? 0) >= 1) {
        try { if (typeof window.onSellUpgradeUnlocked === 'function') window.onSellUpgradeUnlocked(); } catch {}
      }
    },
    effectSummary() { return ""; },
  },
  {
    area: UC_AREA_KEY,
    id: 3,
    tie: 'none_6',
    title: "Unlock Depth",
    desc: "<span style=\"font-size: 80%;\">Unlocks the Depth system; Collect materials for DP; Go deeper to find new materials\nEach meter of Depth boosts material accumulator speed (see Sell tab)\nEach meter of Depth additionally boosts FP 1.1x compounding\nThis upgrade also unlocks a new Waterwheel (important)</span>",
    lvlCap: 1,
    upgType: "NM",
    icon: "",
    baseIconOverride: "img/stats/dp/dp_plus_base.webp",
    
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState: determineLockState,
    onLevelChange({ newLevel }) {
      if ((newLevel ?? 0) >= 1) {
        try { unlockDpSystem(); } catch {}
      }
    },
    effectSummary() { return ""; },
  },
];
