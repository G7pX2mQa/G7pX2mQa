import { computeDefaultUpgradeCost, formatMultForUi } from './upgrades.js';

export const UC_AREA_KEY = 'underwater_cavern';

export const UC_REGISTRY = [
  {
    area: UC_AREA_KEY,
    id: 1,
    tie: 'scrap_1',
    title: 'Faster Materials',
    desc: 'Increases Material Spawn Rate by +1% per level',
    lvlCap: 900,
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
      return 1 + (0.01 * normalizedLevel);
    },
  },
];
