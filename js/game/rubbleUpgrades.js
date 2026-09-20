import {
    AREA_KEYS,
    formatMultForUi,
    computeDefaultUpgradeCost
} from "./upgrades.js";
import { BigNum } from "../util/bigNum.js";
import { formatNumber } from "../util/numFormat.js";

export const RUBBLE_AREA_KEY = "rubble_upgrades";

export const RUBBLE_REGISTRY = [
    {
        area: RUBBLE_AREA_KEY,
        id: 1,
        title: "Rubble Coin Value",
        desc: "Multiplies Coin value by 10x per level",
        lvlCap: 100,
        baseCost: 1e3,
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        effectType: "coin_value",
        icon: "img/lab_icons/coin_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        costAtLevel(level) {
            // Base 1e3, scale 1e3x per level
            const lvl = Math.max(0, Number(level) || 0);
            const log10Cost = 3 + 3 * lvl;
            const costStr = "1e" + log10Cost;
            return BigNum.fromAny(costStr);
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        bonusLine: (level, total) => `Coin value bonus: ${formatMultForUi(total)}x`
    },
];
