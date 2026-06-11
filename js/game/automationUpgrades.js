import { isSurgeUnlocked } from '../ui/merchantTabs/resetTab.js';
import { MYSTERIOUS_UPGRADE_ICON_DATA_URL, LOCKED_UPGRADE_ICON_DATA_URL, HIDDEN_UPGRADE_TITLE, LOCKED_UPGRADE_TITLE, E } from './upgrades.js';
import { BigNum } from '../util/bigNum.js';

export const AUTOMATION_AREA_KEY = 'automation';
export const EFFECTIVE_AUTO_COLLECT_ID = 1;
export const AUTOBUY_COIN_UPGRADES_ID = 2;
export const AUTOBUY_BOOK_UPGRADES_ID = 3;
export const AUTOBUY_GOLD_UPGRADES_ID = 4;
export const AUTOBUY_MAGIC_UPGRADES_ID = 5;
export const AUTOBUY_WORKSHOP_LEVELS_ID = 6;
export const AUTOBUY_DNA_UPGRADES_ID = 7;
export const AUTOBUY_EVOLVE_UPGRADES_ID = 8;
export const AUTOBUY_SCRAP_UPGRADES_ID = 9;
export const UNDERWATER_CAVERN_EAC_ID = 10;
export const MANUAL_MATERIAL_VALUE_ID = 11;
export const EFFECTIVE_AUTO_SELL_ID = 12;

// Maps an Automation Upgrade ID to the cost type it controls (Master Switch logic).
export const MASTER_AUTOBUY_IDS = {
  [AUTOBUY_COIN_UPGRADES_ID]: 'coins',
  [AUTOBUY_BOOK_UPGRADES_ID]: 'books',
  [AUTOBUY_GOLD_UPGRADES_ID]: 'gold',
  [AUTOBUY_MAGIC_UPGRADES_ID]: 'magic',
  [AUTOBUY_DNA_UPGRADES_ID]: 'dna',
  [AUTOBUY_SCRAP_UPGRADES_ID]: 'scrap'
};


const UPGRADE_DEFINITIONS = [
  {
    area: AUTOMATION_AREA_KEY,
    id: EFFECTIVE_AUTO_COLLECT_ID,
    title: 'Effective Auto-Collect',
    desc: 'Generates the equivalent of picking up a Coin on an interval\nEach level of this upgrade will reduce the generation interval\nAs a bonus, anything passively generated accumulates offline',
    icon: 'img/sc_upg_icons/effective_auto_collect.webp',
    lvlCap: 20,
    baseCost: 100,
    costType: 'gears',
    upgType: 'NM',
    scaling: { ratio: 2 },
    costAtLevel(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      return BigNum.fromInt(100).mulBigNumInteger(E.powPerLevel(2)(lvl));
    },
    effectSummary(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      if (lvl === 0) return 'Coin generation interval: None';
      const intervalMs = Math.round(1000 / lvl);
      return `Coin generation interval: ${intervalMs}ms`;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_COIN_UPGRADES_ID,
    title: 'Autobuy Coin Upgrades',
    desc: 'Automatically buys Coin upgrades, but with a twist:\nAutobuys upgrades for free, as long as you can afford the cost\nThis is how all future autobuyers will work',
    icon: 'img/sc_upg_icons/autobuy_coin.webp',
    lvlCap: 1,
    baseCost: 1e6,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromInt(1e6);
    },
    effectSummary() {
      return null;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_BOOK_UPGRADES_ID,
    title: 'Autobuy Book Upgrades',
    desc: 'Automatically buys Book upgrades',
    icon: 'img/sc_upg_icons/autobuy_book.webp',
    lvlCap: 1,
    baseCost: 1e9,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromInt(1e9);
    },
    effectSummary() {
      return null;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_GOLD_UPGRADES_ID,
    title: 'Autobuy Gold Upgrades',
    desc: 'Automatically buys Gold upgrades',
    icon: 'img/sc_upg_icons/autobuy_gold.webp',
    lvlCap: 1,
    baseCost: 1e12,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e12');
    },
    effectSummary() {
      return null;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_MAGIC_UPGRADES_ID,
    title: 'Autobuy Magic Upgrades',
    desc: 'Automatically buys Magic upgrades',
    icon: 'img/sc_upg_icons/autobuy_magic.webp',
    lvlCap: 1,
    baseCost: 1e15,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e15');
    },
    effectSummary() {
      return null;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_WORKSHOP_LEVELS_ID,
    title: 'Autobuy Workshop Levels',
    desc: 'Automatically buys Workshop Levels',
    icon: 'img/sc_upg_icons/autobuy_workshop_level.webp',
    lvlCap: 1,
    baseCost: 1e18,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e18');
    },
    effectSummary() {
      return null;
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_DNA_UPGRADES_ID,
    title: 'Autobuy DNA Upgrades',
    desc: 'Automatically buys DNA upgrades',
    icon: 'img/sc_upg_icons/autobuy_dna.webp',
    lvlCap: 1,
    baseCost: 1e27,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e27');
    },
    effectSummary() {
      return null;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 11 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 11) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 11 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_EVOLVE_UPGRADES_ID,
    title: 'Auto-Evolve Upgrades',
    desc: 'Automatically evolves upgrades when they are ready',
    icon: 'img/sc_upg_icons/autobuy_evolve.webp',
    lvlCap: 1,
    baseCost: 1e126,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e126');
    },
    effectSummary() {
      return null;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 60 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 60) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 60 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: AUTOBUY_SCRAP_UPGRADES_ID,
    title: 'Autobuy Scrap Upgrades',
    desc: 'Automatically buys Scrap upgrades',
    icon: 'img/uc_upg_icons/autobuy_scrap.webp',
    lvlCap: 1,
    baseCost: '1e9999',
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e9999');
    },
    effectSummary() {
      return null;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 150 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 150 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: UNDERWATER_CAVERN_EAC_ID,
    title: 'Underwater Cavern EAC',
    desc: 'Generates the equivalent of a pickaxe strike\'s worth of Materials on an interval\nDependent on Depth, UC EAC has its own separate accumulators\nEach level of this upgrade will reduce the generation interval',
    icon: 'img/uc_upg_icons/eac_uc.webp',
    lvlCap: 20,
    baseCost: '1e9999',
    costType: 'gears',
    upgType: 'NM',
    scaling: { ratio: 1e10 },
    costAtLevel(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      return BigNum.fromAny('1e9999').mulBigNumInteger(E.powPerLevel(1e10)(lvl));
    },
    effectSummary(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      if (lvl === 0) return 'Material generation interval: None';
      const intervalMs = Math.round(1000 / lvl);
      return `Material generation interval: ${intervalMs}ms`;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 150 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 150 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: MANUAL_MATERIAL_VALUE_ID,
    title: 'Manual Material Value',
    desc: 'Increases the value of manually collected Materials by +100% per level',
    icon: 'img/uc_upg_icons/manual_material_value.webp',
    lvlCap: 4,
    baseCost: '1e9999',
    costType: 'gears',
    upgType: 'NM',
    scaling: { ratio: 1e50 },
    costAtLevel(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      return BigNum.fromAny('1e9999').mulBigNumInteger(E.powPerLevel(1e50)(lvl));
    },
    effectSummary() {
      return null;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 150 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 150 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  },
  {
    area: AUTOMATION_AREA_KEY,
    id: EFFECTIVE_AUTO_SELL_ID,
    title: 'Effective Auto-Sell',
    desc: 'Every game tick, generates 0.1%/1%/10%/100% of potential Scrap from selling\n100% of all held Materials are considered regardless of manual sell preferences',
    icon: 'img/uc_upg_icons/effective_auto_sell.webp',
    lvlCap: 4,
    baseCost: '1e9999',
    costType: 'gears',
    upgType: 'NM',
    scaling: { ratio: '1e1000' },
    costAtLevel(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      return BigNum.fromAny('1e9999').mulBigNumInteger(E.powPerLevel('1e1000')(lvl));
    },
    effectSummary(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      if (lvl === 0) return 'Auto-sell efficiency: 0%';
      let eff = '0%';
      if (lvl === 1) eff = '0.1%';
      else if (lvl === 2) eff = '1%';
      else if (lvl === 3) eff = '10%';
      else if (lvl >= 4) eff = '100%';
      return `Auto-sell efficiency: ${eff}`;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 150 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!isSurgeUnlocked()) {
            return {
                locked: true,
                iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
                titleOverride: LOCKED_UPGRADE_TITLE,
                descOverride: 'Locked',
                reason: 'Unlock Surge to unlock',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 150 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: revealText,
            reason: revealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
        };
    }
  }
];

export const REGISTRY = UPGRADE_DEFINITIONS.map(u => ({
  ...u,
  icon: u.icon
}));
