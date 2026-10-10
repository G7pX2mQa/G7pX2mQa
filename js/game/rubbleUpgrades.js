import {
    AREA_KEYS,
} from "./upgrades.js";
import { formatNumber, formatMultForUi } from "../util/numFormat.js";
import { BigNum } from "../util/bigNum.js";
import { getActiveSlot } from "../util/storage.js";
import { lsGetItem } from "../main.js";
import { isBuildingUnlocked } from "../ui/minerTabs/buildingsTab.js";

export const RUBBLE_AREA_KEY = "rubble_upgrades";

export const EFFECT_TYPE_TO_CURRENCY_MAP = {
    coin_value: "coins",
    book_value: "books",
    gold_value: "gold",
    magic_value: "magic",
    wave_value: "waves",
    dna_value: "dna",
    scrap_value: "scrap",
    cores_value: "cores",
    crystals_value: "crystals",
    rubble_value: "rubble",
};

export function computeRubbleLockState(matName) {
    if (!matName || matName === "stone") {
        return { state: "unlocked" };
    }
    let isUnlocked = false;
    try {
        const activeSlot = getActiveSlot() ?? "default";
        let isChallengeActive = false;
        if (typeof window !== "undefined" && window.resetSystem?.isCollapseChallengeActive) {
            isChallengeActive = window.resetSystem.isCollapseChallengeActive() && window.resetSystem.getActiveCollapseChallengeType() === matName;
        } else {
            isChallengeActive = lsGetItem(`ccc:collapseChallengeActive:${activeSlot}`) === matName;
        }
        const isCompleted = lsGetItem(`ccc:collapseChallengeCompleted:${matName}:${activeSlot}`) === "1";
        isUnlocked = isChallengeActive || isCompleted;
    } catch {}

    if (isUnlocked) return { state: "unlocked" };

    let hasUnlockedBuilding = false;
    try {
        hasUnlockedBuilding = isBuildingUnlocked(matName);
    } catch {}

    const capitalName = matName.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const revealText = hasUnlockedBuilding 
        ? `Start the Challenge of ${capitalName} to reveal this upgrade` 
        : "Start the Challenge of [Unknown] to reveal this upgrade";
    
    return { state: "mysterious", unlockReqText: revealText };
}

export function getRubbleUpgradeForChallenge(materialName) {
    if (!materialName) return null;
    return RUBBLE_REGISTRY.find(u => u.challengeMaterial === materialName) || null;
}

export function getBoostedCurrencyForRubbleUpgrade(rubbleUpg) {
    if (!rubbleUpg) return null;
    if (rubbleUpg.boostedCurrency) return rubbleUpg.boostedCurrency;
    if (rubbleUpg.effectType && EFFECT_TYPE_TO_CURRENCY_MAP[rubbleUpg.effectType]) {
        return EFFECT_TYPE_TO_CURRENCY_MAP[rubbleUpg.effectType];
    }
    if (rubbleUpg.effectType && rubbleUpg.effectType.endsWith("_value")) {
        const base = rubbleUpg.effectType.slice(0, -6);
        if (base === "coin") return "coins";
        if (base === "book") return "books";
        return base;
    }
    return null;
}

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
        challengeMaterial: "stone",
        icon: "img/lab_icons/coin_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        _costScaling: true,
        bonusLine: (level, total) => `Coin value bonus: ${formatMultForUi(total)}x`,
        computeLockState() {
            return computeRubbleLockState(this.challengeMaterial);
        }
    },
    {
        area: RUBBLE_AREA_KEY,
        id: 2,
        title: "Rubble Book Value",
        desc: "Multiplies Book value by 10x per level",
        lvlCap: Infinity,
        baseCost: 3,
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: 3 },
        effectType: "book_value",
        challengeMaterial: "copper",
        icon: "img/sc_upg_icons/book_value.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        _costScaling: true,
        bonusLine: (level, total) => `Book value bonus: ${formatMultForUi(total)}x`,
        computeLockState() {
            return computeRubbleLockState(this.challengeMaterial);
        }
    },
    {
        area: RUBBLE_AREA_KEY,
        id: 3,
        title: "Rubble Gold Value",
        desc: `Multiplies Gold value by ${formatNumber(BigNum.fromAny(6666))}x per level`,
        lvlCap: Infinity,
        baseCost: "6.666e666",
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: 6.666 },
        effectType: "gold_value",
        challengeMaterial: "iron",
        icon: "img/lab_icons/gold_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 6666,
        _costScaling: true,
        bonusLine: (level, total) => `Gold value bonus: ${formatMultForUi(total)}x`,
        computeLockState() {
            return computeRubbleLockState(this.challengeMaterial);
        }
    },
    {
        area: RUBBLE_AREA_KEY,
        id: 4,
        title: "Rubble Magic Value",
        desc: `Multiplies Magic value by ${formatNumber("1e100")}x per level`,
        lvlCap: Infinity,
        baseCost: "1e20",
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: "1e20" },
        effectType: "magic_value",
        challengeMaterial: "pure_gold",
        icon: "img/lab_icons/magic_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: "1e100",
        _costScaling: true,
        bonusLine: (level, total) => `Magic value bonus: ${formatMultForUi(total)}x`,
        computeLockState() {
            return computeRubbleLockState(this.challengeMaterial);
        }
    },
    {
        area: RUBBLE_AREA_KEY,
        id: 5,
        title: "Rubble Free Surge",
        desc: "Grants +1 free Surge per level\nFree Surges do not affect Wave requirement",
        lvlCap: Infinity,
        baseCost: "1e888",
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: "1e4" },
        effectType: "free_surge",
        challengeMaterial: "diamond",
        icon: "img/lab_icons/wave_val0.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 1, 
        _costScaling: true,
        effectMultiplier: (level) => {
            if (level && typeof level.toNumber === 'function') return level.toNumber();
            return Number(level || 0);
        },
        bonusLine: (level, total) => `Free Surges: +${formatNumber(total)}`,
        computeLockState() {
            return computeRubbleLockState(this.challengeMaterial);
        }
    }
];
