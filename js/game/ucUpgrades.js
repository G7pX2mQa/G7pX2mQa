import { unlockDpSystem, isDpSystemUnlocked } from './dpSystem.js';
import { AREA_KEYS, LOCKED_UPGRADE_ICON_DATA_URL, formatMultForUi, safeHasMetMiner, UPGRADE_TIES, LOCKED_UPGRADE_TITLE, computeDefaultUpgradeCost, HIDDEN_UPGRADE_TITLE, MYSTERIOUS_UPGRADE_ICON_DATA_URL, getLevelNumber } from './upgrades.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { isSellUnlocked, hasViewedSellTab } from '../ui/minerTabs/sellTab.js';

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
    computeLockState() {
      if (safeHasMetMiner()) {
        return {
          locked: false,
          hidden: false,
          hideCost: false,
          hideEffect: false,
          useLockedBase: false,
        };
      }
      const revealText = 'Explore the Delve menu to reveal this upgrade';
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
      };
    },
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
    desc: "Unlocks the Depth system; Collect materials for DP; Go deeper to find new materials\nEach meter of Depth boosts material accumulator speed (see Sell tab)\nEach meter of Depth additionally boosts FP 1.1x compounding\nAlso you should go look in the Flow tab (important)",
    descScale: 0.725,
	ignoreDescScaleAt: 1920,
    lvlCap: 1,
    upgType: "NM",
    icon: "",
    baseIconOverride: "img/stats/dp/dp_plus_base.webp",
    
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState() {
      if (!isSellUnlocked()) {
        return {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          useLockedBase: true,
        };
      }
      if (!hasViewedSellTab()) {
        const revealText = 'Visit the Sell tab to reveal this upgrade';
        return {
          locked: true,
          iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          titleOverride: HIDDEN_UPGRADE_TITLE,
          descOverride: revealText,
          reason: revealText,
          hidden: true,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
        };
      }
      return {
        locked: false,
        hidden: false,
        hideCost: false,
        hideEffect: false,
        useLockedBase: false,
      };
    },
    onLevelChange({ newLevel }) {
      if ((newLevel ?? 0) >= 1) {
        try { unlockDpSystem(); } catch {}
      }
    },
    effectSummary() { return ""; },
  },
  {
    area: UC_AREA_KEY,
    id: 4,
    tie: 'scrap_2',
    title: "Coin Value IV",
    get desc() {
      let text = `Multiplies Coin value by ${formatNumber(BigNum.fromInt(100000))}x`;
      let endlessFpLevel = 0;
      try {
          endlessFpLevel = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_FP);
      } catch(e) {}
      if (endlessFpLevel < 400) {
          text += "\nThis will make it easier to reach level 400 of Endless FP";
      }
      return text;
    },
    lvlCap: 1,
    baseCost: 100,
    costType: 'scrap',
    upgType: 'NM',
    effectType: 'coin_value',
    icon: 'img/lab_icons/coin_val0.webp',
    baseIconOverride: 'img/currencies/scrap/scrap_base.webp',
    costAtLevel(level) { return computeDefaultUpgradeCost(this.baseCost, level, this.upgType); },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    computeLockState() {
      if (!isSellUnlocked() || !hasViewedSellTab()) {
        return {
          locked: true,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Locked',
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
        };
      }
      if (!isDpSystemUnlocked()) {
        return {
          locked: true,
          iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          titleOverride: HIDDEN_UPGRADE_TITLE,
          descOverride: 'Unlock the Depth system',
          reason: 'Unlock the Depth system',
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
        };
      }
      return { locked: false, hidden: false, useLockedBase: false };
    },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Coin value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return normalizedLevel > 0 ? 100000 : 1;
    },
  },
  {
    area: UC_AREA_KEY,
    id: 5,
    tie: 'scrap_3',
    title: "DP Value",
    desc: "Triples DP value per level",
    lvlCap: 10,
    baseCost: 1000,
    costType: 'scrap',
    upgType: 'NM',
    effectType: 'dp_value',
    icon: 'img/uc_upg_icons/dp_val1.webp',
    costAtLevel(level) { 
        const normalizedLevel = Math.max(0, Number(level) || 0);
        return BigNum.fromInt(this.baseCost).mulBigNumInteger(BigNum.fromInt(2).pow(normalizedLevel));
    },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    computeLockState() {
      if (!isSellUnlocked() || !hasViewedSellTab()) {
        return {
          locked: true,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Locked',
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
        };
      }
      if (!isDpSystemUnlocked()) {
        return {
          locked: true,
          iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          titleOverride: HIDDEN_UPGRADE_TITLE,
          descOverride: 'Unlock the Depth system',
          reason: 'Unlock the Depth system',
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
        };
      }
      return { locked: false, hidden: false, useLockedBase: false };
    },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `DP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return BigNum.fromInt(3).pow(normalizedLevel);
    },
  },
];
