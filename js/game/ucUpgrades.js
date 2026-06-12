import { unlockDpSystem, isDpSystemUnlocked, getDpState } from './dpSystem.js';
import { AREA_KEYS, HM_EVOLUTION_INTERVAL, LOCKED_UPGRADE_ICON_DATA_URL, formatMultForUi, safeHasMetMiner, UPGRADE_TIES, LOCKED_UPGRADE_TITLE, computeDefaultUpgradeCost, costAtLevelUsingScaling, HIDDEN_UPGRADE_TITLE, MYSTERIOUS_UPGRADE_ICON_DATA_URL, getLevelNumber, E } from './upgrades.js';
import { isBuildingsUnlocked } from '../ui/minerTabs/buildingsTab.js';
import { hasDoneCombineReset } from "../ui/minerTabs/resetTab.js";
import { BigNum, bigNumFromLog10 } from '../util/bigNum.js';
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
      if (isDpSystemUnlocked()) {
        return { locked: false, hidden: false, useLockedBase: false, hideCost: false, hideEffect: false };
      }
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
      if (isDpSystemUnlocked()) {
        return { locked: false };
      }
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
        return BigNum.fromInt(this.baseCost).mulBigNumInteger(E.powPerLevel(3)(normalizedLevel));
    },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    computeLockState() {
      if (isDpSystemUnlocked()) {
        return { locked: false };
      }
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
    },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `DP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return E.powPerLevel(3)(normalizedLevel);
    },
  },
  {
    area: UC_AREA_KEY,
    id: 6,
    tie: 'none_7',
    title: "Unlock Combine",
    desc: "Unlocks the Reset tab and Combine reset in the Delve menu",
    descScale: 0.9,
	ignoreDescScaleAt: 1500,
    lvlCap: 1,
    upgType: "NM",
    icon: "",
    baseIconOverride: "img/misc/combine_plus_base.webp",
    revealRequirement: 'Reach Depth: 31m to reveal this upgrade',
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState() {
      if (!isDpSystemUnlocked()) {
        return {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          useLockedBase: true,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Unlock the Depth system to reveal this upgrade',
          reason: 'Unlock the Depth system to reveal this upgrade',
        };
      }

      let dp31 = false;
      try {
        const dpState = getDpState();
        dp31 = Number(dpState.dpLevel.toString()) >= 31;
      } catch {}
      
      if (!dp31) {
        const revealText = 'Reach Depth: 31m to reveal this upgrade';
        return {
          locked: true,
          iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          hidden: true,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: HIDDEN_UPGRADE_TITLE,
          descOverride: revealText,
          reason: revealText,
        };
      }
      return { locked: false };
    },
    onLevelChange({ newLevel }) {
      if ((newLevel ?? 0) >= 1) {
        try { if (typeof window.onCombineUpgradeUnlocked === 'function') window.onCombineUpgradeUnlocked(); } catch {}
      }
    },
    effectSummary() { return ""; }
  },
  {
    area: UC_AREA_KEY,
    id: 7,
    tie: 'scrap_4',
    title: "Endless DP",
    desc: "Multiplies DP value by 1.1x per level",
    lvlCap: HM_EVOLUTION_INTERVAL,
    baseCost: 1e9,
    costType: 'scrap',
    upgType: 'HM',
    effectType: 'dp_value',
    scalingPreset: 'HM',
    icon: 'img/uc_upg_icons/dp_val_hm.webp',
    costAtLevel(level) { return computeDefaultUpgradeCost(this.baseCost, level, this.upgType); },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    computeLockState() {
      if (hasDoneCombineReset() || isBuildingsUnlocked()) {
        return { locked: false };
      }

      let dp31 = false;
      try {
        const dpState = getDpState();
        dp31 = Number(dpState.dpLevel.toString()) >= 31;
      } catch {}
      
      if (!dp31) {
        return {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Reach Depth: 31m to reveal this upgrade',
          reason: 'Reach Depth: 31m to reveal this upgrade',
        };
      }

      const revealText = 'Do a Combine reset to reveal this upgrade';
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
      };
    },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `DP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return E.powPerLevel(1.1)(normalizedLevel);
    },
  },
  {
    area: UC_AREA_KEY,
    id: 8,
    tie: 'scrap_5',
    title: "Endless Materials",
    desc: "Multiplies the value of ALL Materials by 2x per level\nThis upgrade is very strong so it will scale just slightly faster than usual",
    lvlCap: HM_EVOLUTION_INTERVAL,
    baseCost: 1e9,
    costType: 'scrap',
    upgType: 'HM',
    effectType: 'all_materials_value',
    scalingPreset: 'HM',
    scalingHarshness: 1e15,
    icon: 'img/uc_upg_icons/allmat_val_hm.webp',
    costAtLevel(level) { return costAtLevelUsingScaling(this, level); },
    nextCostAfter(_, nextLevel) { return costAtLevelUsingScaling(this, nextLevel); },
    computeLockState() {
      if (hasDoneCombineReset() || isBuildingsUnlocked()) {
        return { locked: false };
      }

      let dp31 = false;
      try {
        const dpState = getDpState();
        dp31 = Number(dpState.dpLevel.toString()) >= 31;
      } catch {}
      
      if (!dp31) {
        return {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Reach Depth: 31m to reveal this upgrade',
          reason: 'Reach Depth: 31m to reveal this upgrade',
        };
      }

      const revealText = 'Do a Combine reset to reveal this upgrade';
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
      };
    },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `All Materials value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      return E.powPerLevel(2)(normalizedLevel);
    },
  },
  {
    area: UC_AREA_KEY,
    id: 9,
    tie: 'scrap_6',
    title: "Advanced Researching",
    desc: `Improves RP value by ${formatNumber(BigNum.fromAny("1e1000"))}x per level`,
    lvlCap: 10,
    baseCost: 1e21,
    costType: 'scrap',
    upgType: 'NM',
    effectType: 'rp_value',
    icon: 'img/uc_upg_icons/rp_val1.webp',
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `RP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier(level) {
      const normalizedLevel = Math.max(0, Number(level) || 0);
      const log10 = 1000 * normalizedLevel;
      return bigNumFromLog10(log10);
    },
    costAtLevel(level) {
        const normalizedLevel = Math.max(0, Number(level) || 0);
        const log10 = 3 * normalizedLevel;
        const thousands = bigNumFromLog10(log10);
        return BigNum.fromAny(this.baseCost).mulBigNumInteger(thousands);
    },
    nextCostAfter(_, nextLevel) { return this.costAtLevel(nextLevel); },
    computeLockState() {
      if (hasDoneCombineReset() || isBuildingsUnlocked()) {
        return { locked: false };
      }

      let dp31 = false;
      try {
        const dpState = getDpState();
        dp31 = Number(dpState.dpLevel.toString()) >= 31;
      } catch {}
      
      if (!dp31) {
        return {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          hidden: false,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: 'Reach Depth: 31m to reveal this upgrade',
          reason: 'Reach Depth: 31m to reveal this upgrade',
        };
      }

      const revealText = 'Do a Combine reset to reveal this upgrade';
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
      };
    },
  },
];
