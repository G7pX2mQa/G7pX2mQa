import {
    AREA_KEYS,
    formatMultForUi,
} from "./upgrades.js";
import { getActiveSlot } from "../util/storage.js";
import { lsGetItem } from "../main.js";
import { isBuildingUnlocked } from "../ui/minerTabs/buildingsTab.js";

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
        baseCost: 3,
        costType: "rubble",
        upgType: "NM",
        scalingPreset: 'NM',
        scaling: { ratio: 3 },
        effectType: "book_value",
        icon: "img/sc_upg_icons/book_value.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        _baseEffectVal: 10,
        _costScaling: true,
        bonusLine: (level, total) => `Book value bonus: ${formatMultForUi(total)}x`,
        computeLockState() {
            let isUnlocked = false;
            try {
                const activeSlot = getActiveSlot() ?? "default";
                const isActive = typeof window.isCopperChallengeActive === "function" ? window.isCopperChallengeActive() : false;
                const isCompleted = lsGetItem(`ccc:collapseChallengeCompleted:copper:${activeSlot}`) === "1";
                isUnlocked = isActive || isCompleted;
            } catch {}

            if (isUnlocked) return { state: "unlocked" };

            let hasUnlockedCopper = false;
            try {
                hasUnlockedCopper = isBuildingUnlocked("copper");
            } catch {}

            const revealText = hasUnlockedCopper 
                ? "Start the Challenge of Copper to reveal this upgrade" 
                : "Start the Challenge of [Unknown] to reveal this upgrade";
            
            return { state: "mysterious", unlockReqText: revealText };
        }
    },
];
