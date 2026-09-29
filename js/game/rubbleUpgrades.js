import {
    AREA_KEYS,
    formatMultForUi,
} from "./upgrades.js";

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
        scaling: { ratio: 1000 },
        effectType: "coin_value",
        icon: "img/lab_icons/coin_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        _costScaling: true,
        bonusLine: (level, total) => `Coin value bonus: ${formatMultForUi(total)}x`
    },
    {
        area: RUBBLE_AREA_KEY,
        id: 2,
        title: "Rubble Book Value",
        desc: "Multiplies Book value by 10x per level",
        lvlCap: Infinity,
        baseCost: 10,
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: 10 },
        effectType: "book_value",
        icon: "img/sc_upg_icons/book_value.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        _costScaling: true,
        bonusLine: (level, total) => `Book value bonus: ${formatMultForUi(total)}x`
    },
];
