import { BigNum } from '../util/bigNum.js';

export const AUTOMATION_AREA_KEY = 'automation';
export const EFFECTIVE_AUTO_COLLECT_ID = 1;
export const AUTOBUY_COIN_UPGRADES_ID = 2;

export const REGISTRY = [
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
    desc: 'Automatically buys Coin upgrades, but with a twist:\nBuys without spending currency, provided you can afford the upgrade cost\nWhich basically means the autobuyer will never take away your currency\nThis is how all future autobuyer upgrades will work',
    icon: 'img/sc_upg_icons/coin_autobuy.webp',
    lvlCap: 1,
    baseCost: 1000,
    costType: 'gears',
    upgType: 'NM',
    costAtLevel() {
      return BigNum.fromInt(1000);
    },
    effectSummary(level) {
      const lvl = Math.max(0, Math.floor(Number(level) || 0));
      return lvl > 0 ? 'Status: Active' : 'Status: Inactive';
    }
  }
];
