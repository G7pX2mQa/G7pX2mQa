import { BigNum } from "../util/bigNum.js";
import { formatNumber, formatMultForUi } from "../util/numFormat.js";
import { AREA_KEYS } from "./upgrades.js";

// Helper object for effect functions
const E = {
    addPctPerLevel: (pctString) => {
        const val = typeof pctString === "string" ? BigNum.fromAny(pctString) : BigNum.fromAny(pctString);
        const div = val.div(100);
        return (lvlNum) => {
            if (lvlNum <= 0) return BigNum.fromInt(1);
            return BigNum.fromInt(1).add(div.mulBigNumInteger(BigNum.fromAny(lvlNum)));
        };
    }
};

export const RUBBLE_REGISTRY = [
    {
        area: "collapse",
        id: 1,
        tie: "rubble_1",
        title: "Rubble Coin Value",
        desc: "Multiplies Coin value by 10x per level",
        lvlCap: 100,
        costType: "rubble",
        effectType: "coin_value",
        cost: (lvl) => {
            const baseCost = BigNum.fromAny("1e99999");
            const scale = BigNum.fromAny("1e99999");
            const lvlBn = BigNum.fromAny(lvl);
            return baseCost.mul(scale.pow(lvlBn));
        },
        effect: (lvl) => {
            const lvlBn = BigNum.fromAny(lvl);
            if (lvlBn.cmp(0) <= 0) return BigNum.fromInt(1);
            return BigNum.fromInt(10).pow(lvlBn);
        },
        effectDisplay: (mult) => {
            return `Coin value bonus: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier: (lvl) => {
            const lvlBn = BigNum.fromAny(lvl);
            if (lvlBn.cmp(0) <= 0) return BigNum.fromInt(1);
            return BigNum.fromInt(10).pow(lvlBn);
        },
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        icon: "img/lab_icons/coin_val0.webp",
    }
];
