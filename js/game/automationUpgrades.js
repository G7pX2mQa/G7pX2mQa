import { BigNum } from '../util/bigNum.js';

export const AUTOMATION_AREA_KEY = 'automation';
export const EFFECTIVE_AUTO_COLLECT_ID = 1;
export const AUTOBUY_COIN_UPGRADES_ID = 2;
export const AUTOBUY_BOOK_UPGRADES_ID = 3;
export const AUTOBUY_GOLD_UPGRADES_ID = 4;
export const AUTOBUY_MAGIC_UPGRADES_ID = 5;
export const AUTOBUY_WORKSHOP_LEVELS_ID = 6;
export const AUTOBUY_DNA_UPGRADES_ID = 7;

// Maps an Automation Upgrade ID to the cost type it controls (Master Switch logic).
export const MASTER_AUTOBUY_IDS = {
  [AUTOBUY_COIN_UPGRADES_ID]: 'coins',
  [AUTOBUY_BOOK_UPGRADES_ID]: 'books',
  [AUTOBUY_GOLD_UPGRADES_ID]: 'gold',
  [AUTOBUY_MAGIC_UPGRADES_ID]: 'magic',
  [AUTOBUY_DNA_UPGRADES_ID]: 'dna'
};

const MYSTERIOUS_ICON = 'img/misc/mysterious.webp';
const LOCKED_ICON = 'img/misc/locked.webp';
const HIDDEN_TITLE = 'Hidden Upgrade';
const LOCKED_TITLE = 'Locked Upgrade';

const UPGRADE_DEFINITIONS = [
  {
    area: AUTOMATION_AREA_KEY,
    id: EFFECTIVE_AUTO_COLLECT_ID,
    title: 'Effective Auto-Collect',
    desc: 'Generates the equivalent of picking up a Coin on an interval\nEach level of this upgrade will reduce the generation interval\nAs a bonus, anything passively generated accumulates offline',
    icon: 'sc_upg_icons/effective_auto_collect.webp',
    lvlCap: 20,
    baseCost: 100,
    costType: 'gears',
    upgType: 'NM',
    scaling: { ratio: 2 },
    costAtLevel(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      const base = BigInt(100);
      const pow = 2n ** BigInt(lvl);
      return BigNum.fromAny((base * pow).toString());
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
    icon: 'sc_upg_icons/autobuy_coin.webp',
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
    icon: 'sc_upg_icons/autobuy_book.webp',
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
    icon: 'sc_upg_icons/autobuy_gold.webp',
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
    icon: 'sc_upg_icons/autobuy_magic.webp',
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
    icon: 'sc_upg_icons/autobuy_workshop_level.webp',
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
    icon: 'sc_upg_icons/autobuy_dna.webp',
    lvlCap: 1,
    baseCost: 1e25,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromAny('1e99');
    },
    effectSummary() {
      return null;
    },
    computeLockState(ctx) {
        const sl = ctx.surgeLevel;
        let isUnlocked = false;
        
        if (typeof sl === 'number') {
            if (sl >= 11 || sl === Infinity) isUnlocked = true;
        } else if (typeof sl === 'bigint') {
            if (sl >= 11n) isUnlocked = true;
        } else if (typeof sl === 'string') {
             if (sl === 'Infinity' || parseFloat(sl) === Infinity) isUnlocked = true;
             else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 11) isUnlocked = true;
        } else if (sl && typeof sl.isInfinite === 'function' && sl.isInfinite()) {
             isUnlocked = true;
        }
        
        if (isUnlocked) return { locked: false };

        if (!ctx.surgeUnlocked) {
            return {
                locked: true,
                iconOverride: LOCKED_ICON,
                titleOverride: LOCKED_TITLE,
                descOverride: 'Locked',
                reason: 'Locked',
                hidden: false,
                hideCost: true,
                hideEffect: true,
                useLockedBase: true
            };
        }
        
        const revealText = "Reach Surge 11 to reveal this upgrade";
        return {
            locked: true,
            iconOverride: MYSTERIOUS_ICON,
            titleOverride: HIDDEN_TITLE,
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
  icon: `img/${(u.icon || '').replace(/^img\//, '')}`
}));
