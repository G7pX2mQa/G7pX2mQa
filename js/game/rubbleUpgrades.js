import {
    AREA_KEYS,
    formatMultForUi,
    computeDefaultUpgradeCost,
    getLevelNumber
} from "./upgrades.js";
import { BigNum, bigNumFromLog10 } from "../util/bigNum.js";
import { formatNumber } from "../util/numFormat.js";

export const RUBBLE_AREA_KEY = "rubble_upgrades";

export const RUBBLE_REGISTRY = [
    {
        area: RUBBLE_AREA_KEY,
        id: 1,
        title: "Rubble Coin Value",
        desc: "Multiplies Coin value by 10x per level",
        lvlCap: Infinity,
        baseCost: 1e3,
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: 1000, ratioLog10: 3, ratioMinus1: 999, ratioMinus1Log: 2.999565488225982, ratioStr: "1000" },
        effectType: "coin_value",
        icon: "img/lab_icons/coin_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        costAtLevel(level) {
            const lvl = Math.max(0, Number(level) || 0);
            if (!Number.isFinite(lvl)) return BigNum.fromAny("Infinity");
            if (lvl >= 4e12) return BigNum.fromAny("Infinity");
            const log10Cost = 3 + 3 * lvl;
            if (!Number.isFinite(log10Cost)) return BigNum.fromAny("Infinity");
            return bigNumFromLog10(log10Cost);
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        bonusLine: (level, total) => `Coin value bonus: ${formatMultForUi(total)}x`
    },
];
