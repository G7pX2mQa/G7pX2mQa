import { computeDefaultUpgradeCost, E, getLevelNumber } from "./upgrades.js";
import { BigNum, approxLog10BigNum, bigNumFromLog10 } from "../util/bigNum.js";
import { formatMultForUi, formatNumber } from "../util/numFormat.js";
import { isRclpSystemUnlocked, unlockRclpSystem, getRclpState } from "./rclpSystem.js";
import { isGclpSystemUnlocked } from "./gclpSystem.js";
import { getActiveSlot, bank } from "../util/storage.js";
import { lsSetItem, lsGetItem } from "../main.js";
import { isBuildingUnlocked } from "../ui/minerTabs/buildingsTab.js";

export const CORAL_AREA_KEY = "coral_reef";
export const CORAL_REGISTRY = [
    {
        area: CORAL_AREA_KEY,
        id: 1,
        title: "Faster Coral",
        desc: "Multiplies Bubble Spawn Rate by a certain amount per level\nBubbles float up, hit the Coral Ceiling, and spawn a Coral when they pop",
        lvlCap: 4,
        costType: "red_coral",
        upgType: "NM",
        effectType: "bubble_spawn",
        icon: "img/coral_upg_icons/faster_coral.webp",
        costAtLevel(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            if (normalizedLevel === 0) return BigNum.fromInt(10);
            if (normalizedLevel === 1) return BigNum.fromInt(1000);
            if (normalizedLevel === 2) return BigNum.fromAny(1e6);
            if (normalizedLevel === 3) return BigNum.fromAny(1e9);
            return BigNum.fromAny("Infinity");
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        computeLockState() {
            return { state: "unlocked" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Bubble Spawn Rate bonus: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            if (normalizedLevel === 0) return 1;
            if (normalizedLevel === 1) return 2;
            if (normalizedLevel === 2) return 5;
            if (normalizedLevel === 3) return 10;
            if (normalizedLevel >= 4) return 20;
            return 1;
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 2,
        title: "Unlock Red Coral Level",
        desc: "Unlocks the Red Coral Level system; collect Red Coral to contribute to it (gain RCLP)\nThat is, RCLP (progress) gain directly depends on the amount of Red Coral you collect\nEach Red Coral Level doubles Coin, XP, Book, Gold, MP, Magic, Gear, Wave, and RP value\nAnd lastly, each atm of Pressure after 31 doubles Red Coral value",
        descScale: 0.7,
        ignoreDescScaleAt: 1920,
        shrinkBetween: { min: 1920, max: 2000, scale: 0.925 },
        lvlCap: 1,
        upgType: "NM",
        icon: "",
        baseIconOverride: "img/stats/rclp/rclp_plus_base.webp",
        unlockUpgrade: true,
        costAtLevel() {
            return BigNum.fromInt(0);
        },
        nextCostAfter() {
            return BigNum.fromInt(0);
        },
        computeLockState() {
            if (isRclpSystemUnlocked()) {
                return { state: "unlocked" };
            }
            
            let metCoral = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                metCoral = lsGetItem(`ccc:coral_reefMet:${slotKey}`) === "1";
            } catch {}
            
            if (metCoral) {
                return { state: "unlocked" };
            }
            return { state: "mysterious", unlockReqText: "Explore the Delve menu to reveal this upgrade" };
        },
        onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
                try {
                    unlockRclpSystem();
                } catch {}
            }
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 3,
        title: "Scrap Value",
        get desc() {
            let text = `Multiplies Scrap value by ${formatNumber(BigNum.fromAny("1e20"))}x`;
            let depth = 0;
            try {
                const slotKey = getActiveSlot() ?? "default";
                const dpLvlStr = lsGetItem(`ccc:dpLevel:${slotKey}`);
                if (dpLvlStr) {
                    if (dpLvlStr.startsWith("BN:infinite") || dpLvlStr === "Infinity") {
                        depth = Infinity;
                    } else if (dpLvlStr.startsWith("BN:")) {
                        const expPart = dpLvlStr.slice(dpLvlStr.lastIndexOf(":") + 1);
                        const caret = expPart.indexOf("^");
                        if (caret >= 0) {
                            depth = parseFloat(expPart.slice(0, caret)) * Math.pow(10, parseFloat(expPart.slice(caret + 1)));
                        } else {
                            depth = parseFloat(expPart);
                        }
                    } else {
                        depth = parseFloat(dpLvlStr);
                    }
                }
            } catch (e) {}
            if (depth < 800) {
                text += "\nThis will make it easier to reach Depth: 800m";
            }
            return text;
        },
        lvlCap: 1,
        baseCost: 100,
        costType: "red_coral",
        upgType: "NM",
        effectType: "scrap_value",
        icon: "img/lab_icons/scrap_val0.webp",
        costAtLevel(level) {
            return computeDefaultUpgradeCost(this.baseCost, level, this.upgType);
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        computeLockState() {
            if (isRclpSystemUnlocked()) {
                return { state: "unlocked" };
            }
            let metCoral = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                metCoral = lsGetItem(`ccc:coral_reefMet:${slotKey}`) === "1";
            } catch {}
            
            if (!metCoral) {
                return { state: "locked" };
            }
            return { state: "mysterious", unlockReqText: "Unlock the Red Coral Level system to reveal this upgrade" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Scrap value bonus: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            return normalizedLevel > 0 ? BigNum.fromAny("1e20") : 1;
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 4,
        title: "Advanced Researching II",
        get desc() {
            return `Improves RP value by ${formatNumber(BigNum.fromAny("1e200"))}x per level`;
        },
        lvlCap: 5,
        baseCost: 1000,
        costType: "red_coral",
        upgType: "NM",
        effectType: "rp_value",
        icon: "img/uc_upg_icons/rp_val1.webp",
        costAtLevel(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            if (normalizedLevel >= this.lvlCap) return BigNum.fromAny("Infinity");
            return BigNum.fromInt(Math.floor(this.baseCost * Math.pow(33.3333333333, normalizedLevel)));
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        computeLockState() {
            if (isRclpSystemUnlocked()) {
                return { state: "unlocked" };
            }
            let metCoral = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                metCoral = lsGetItem(`ccc:coral_reefMet:${slotKey}`) === "1";
            } catch {}
            
            if (!metCoral) {
                return { state: "locked" };
            }
            return { state: "mysterious", unlockReqText: "Unlock the Red Coral Level system to reveal this upgrade" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `RP value bonus: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            return E.powPerLevel("1e200")(level);
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 5,
        title: "PP Value",
        desc: "Quintuples PP value per level",
        lvlCap: 10,
        baseCost: 1000,
        costType: "red_coral",
        upgType: "NM",
        effectType: "pp_value",
        icon: "img/lab_icons/pp_val0.webp",
        costAtLevel(level) {
            const mult = E.powPerLevel(5)(level);
            if (mult && typeof mult.mulSmall === "function") {
                return mult.mulSmall(1000);
            }
            return BigNum.fromAny(mult).mulSmall(1000);
        },
        nextCostAfter(_, nextLevel) {
            return this.costAtLevel(nextLevel);
        },
        computeLockState() {
            if (isRclpSystemUnlocked()) {
                return { state: "unlocked" };
            }
            let metCoral = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                metCoral = lsGetItem(`ccc:coral_reefMet:${slotKey}`) === "1";
            } catch {}
            
            if (!metCoral) {
                return { state: "locked" };
            }
            return { state: "mysterious", unlockReqText: "Unlock the Red Coral Level system to reveal this upgrade" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `PP value bonus: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            return E.powPerLevel(5)(level);
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 6,
        title: "Challenge of Copper",
        desc: "Unlocks the Challenge of Copper",
        lvlCap: 1,
        upgType: "NM",
        icon: "img/materials/copper.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        unlockUpgrade: true,
        costAtLevel() {
            return BigNum.fromInt(0);
        },
        nextCostAfter() {
            return BigNum.fromInt(0);
        },
        computeLockState() {
            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 31) {
                        return { state: "unlocked" };
                    }
                    return { state: "mysterious", unlockReqText: "Reach Red Coral Level 31 to reveal this upgrade" };
                }
            } catch {}
            
            return { state: "locked" };
        },
        onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
                try {
                    const slot = getActiveSlot() ?? "default";
                    lsSetItem(`ccc:collapseChallengeVisible:copper:${slot}`, "1");
                    window.dispatchEvent(new CustomEvent("debug:challenge:change", { detail: { id: "copper", visible: true } }));
                } catch {}
            }
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 7,
        title: "Red Coral Link",
        desc: "Unspent Green Coral boosts Red Coral value",
        lvlCap: 1,
        costType: "green_coral",
        upgType: "NM",
        effectType: "red_coral_value",
        icon: "img/coral_upg_icons/red_coral_link.webp",
        costAtLevel() {
            return BigNum.fromAny(1e6);
        },
        nextCostAfter() {
            return BigNum.fromAny(1e6);
        },
        computeLockState() {
            if (isGclpSystemUnlocked()) {
                return { state: "unlocked" };
            }

            let isCopperCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isCopperCompleted = lsGetItem(`ccc:collapseChallengeCompleted:copper:${slotKey}`) === "1";
            } catch {}

            if (!isCopperCompleted) {
                return { state: "locked" };
            }

            return { state: "mysterious", unlockReqText: "Unlock the Green Coral Level system to reveal this upgrade" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Red Coral value: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            if (normalizedLevel === 0) return BigNum.fromInt(1);
            let unspentGreen = BigNum.fromInt(0);
            try {
                unspentGreen = bank.green_coral?.value || BigNum.fromInt(0);
            } catch {
                unspentGreen = BigNum.fromInt(0);
            }
            
            if (!unspentGreen || unspentGreen.isZero?.() || unspentGreen === 0) return BigNum.fromInt(1);
            
            try {
                const log10 = approxLog10BigNum(unspentGreen);
                if (Number.isNaN(log10) || log10 <= 0) return BigNum.fromInt(1);
                
                let power = 1 / 3;
                try {
                    if (getLevelNumber(CORAL_AREA_KEY, 11) > 0) power = 0.5;
                } catch {}
                return bigNumFromLog10(log10 * power);
            } catch {
                return BigNum.fromInt(1);
            }
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 8,
        title: "Green Coral Link",
        desc: "Unspent Red Coral boosts Green Coral value",
        lvlCap: 1,
        costType: "red_coral",
        upgType: "NM",
        effectType: "green_coral_value",
        icon: "img/coral_upg_icons/green_coral_link.webp",
        costAtLevel() {
            return BigNum.fromAny(1e12);
        },
        nextCostAfter() {
            return BigNum.fromAny(1e12);
        },
        computeLockState() {
            if (isGclpSystemUnlocked()) {
                return { state: "unlocked" };
            }

            let isCopperCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isCopperCompleted = lsGetItem(`ccc:collapseChallengeCompleted:copper:${slotKey}`) === "1";
            } catch {}

            if (!isCopperCompleted) {
                return { state: "locked" };
            }

            return { state: "mysterious", unlockReqText: "Unlock the Green Coral Level system to reveal this upgrade" };
        },
        effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Green Coral value: ${formatMultForUi(mult)}x`;
        },
        effectMultiplier(level) {
            const normalizedLevel = Math.max(0, Number(level) || 0);
            if (normalizedLevel === 0) return BigNum.fromInt(1);
            let unspentRed = BigNum.fromInt(0);
            try {
                unspentRed = bank.red_coral?.value || BigNum.fromInt(0);
            } catch {
                unspentRed = BigNum.fromInt(0);
            }
            
            if (!unspentRed || unspentRed.isZero?.() || unspentRed === 0) return BigNum.fromInt(1);
            
            try {
                const log10 = approxLog10BigNum(unspentRed);
                if (Number.isNaN(log10) || log10 <= 0) return BigNum.fromInt(1);
                
                let power = 1 / 3;
                try {
                    if (getLevelNumber(CORAL_AREA_KEY, 12) > 0) power = 0.5;
                } catch {}
                return bigNumFromLog10(log10 * power);
            } catch {
                return BigNum.fromInt(1);
            }
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 9,
        title: "Challenge of Iron",
        desc: "Unlocks the Challenge of Iron",
        lvlCap: 1,
        upgType: "NM",
        icon: "img/materials/iron.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        unlockUpgrade: true,
        costAtLevel() {
            return BigNum.fromInt(0);
        },
        nextCostAfter() {
            return BigNum.fromInt(0);
        },
        computeLockState() {
            if (!isGclpSystemUnlocked()) {
                return { state: "locked" };
            }
            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 51) {
                        return { state: "unlocked" };
                    }
                    return { state: "mysterious", unlockReqText: "Reach Red Coral Level 51 to reveal this upgrade" };
                }
            } catch {}
            
            return { state: "mysterious", unlockReqText: "Reach Red Coral Level 51 to reveal this upgrade" };
        },
        onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
                try {
                    const slot = getActiveSlot() ?? "default";
                    lsSetItem(`ccc:collapseChallengeVisible:iron:${slot}`, "1");
                    window.dispatchEvent(new CustomEvent("debug:challenge:change", { detail: { id: "iron", visible: true } }));
                } catch {}
            }
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 10,
        title: "Challenge of Pure Gold",
        desc: "Unlocks the Challenge of Pure Gold",
        lvlCap: 1,
        upgType: "NM",
        icon: "img/materials/pure_gold.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        unlockUpgrade: true,
        costAtLevel() {
            return BigNum.fromInt(0);
        },
        nextCostAfter() {
            return BigNum.fromInt(0);
        },
        computeLockState() {
            let isIronCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isIronCompleted = lsGetItem(`ccc:collapseChallengeCompleted:iron:${slotKey}`) === "1";
            } catch {}

            if (!isIronCompleted) {
                return { state: "locked" };
            }

            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 91) {
                        return { state: "unlocked" };
                    }
                    return { state: "mysterious", unlockReqText: "Reach Red Coral Level 91 to reveal this upgrade" };
                }
            } catch {}
            
            return { state: "mysterious", unlockReqText: "Reach Red Coral Level 91 to reveal this upgrade" };
        },
        onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
                try {
                    const slot = getActiveSlot() ?? "default";
                    lsSetItem(`ccc:collapseChallengeVisible:pure_gold:${slot}`, "1");
                    window.dispatchEvent(new CustomEvent("debug:challenge:change", { detail: { id: "pure_gold", visible: true } }));
                } catch {}
            }
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 11,
        title: "Enhanced Red Coral Link",
        desc: "Red Coral Link has a stronger formula",
        lvlCap: 1,
        costType: "green_coral",
        upgType: "NM",
        icon: "img/coral_upg_icons/enhanced_red_coral_link.webp",
        costAtLevel() {
            return BigNum.fromAny("1e33");
        },
        nextCostAfter() {
            return BigNum.fromAny("1e33");
        },
        computeLockState() {
            let isPureGoldCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isPureGoldCompleted = lsGetItem(`ccc:collapseChallengeCompleted:pure_gold:${slotKey}`) === "1";
            } catch {}

            if (isPureGoldCompleted) {
                return { state: "unlocked" };
            }
            
            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 91) {
                        let hasUnlockedPureGold = false;
                        try {
                            hasUnlockedPureGold = isBuildingUnlocked("pure_gold");
                        } catch {}
                        
                        return { 
                            state: "mysterious", 
                            unlockReqText: hasUnlockedPureGold ? "Complete the Challenge of Pure Gold to reveal this upgrade" : "Complete the Challenge of [Unknown] to reveal this upgrade" 
                        };
                    }
                }
            } catch {}

            return { state: "mysterious", unlockReqText: "Reach Red Coral Level 91 to reveal this upgrade" };
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 12,
        title: "Enhanced Green Coral Link",
        desc: "Green Coral Link has a stronger formula",
        lvlCap: 1,
        costType: "red_coral",
        upgType: "NM",
        icon: "img/coral_upg_icons/enhanced_green_coral_link.webp",
        costAtLevel() {
            return BigNum.fromAny("1e51");
        },
        nextCostAfter() {
            return BigNum.fromAny("1e51");
        },
        computeLockState() {
            let isPureGoldCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isPureGoldCompleted = lsGetItem(`ccc:collapseChallengeCompleted:pure_gold:${slotKey}`) === "1";
            } catch {}

            if (isPureGoldCompleted) {
                return { state: "unlocked" };
            }
            
            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 91) {
                        let hasUnlockedPureGold = false;
                        try {
                            hasUnlockedPureGold = isBuildingUnlocked("pure_gold");
                        } catch {}
                        
                        return { 
                            state: "mysterious", 
                            unlockReqText: hasUnlockedPureGold ? "Complete the Challenge of Pure Gold to reveal this upgrade" : "Complete the Challenge of [Unknown] to reveal this upgrade" 
                        };
                    }
                }
            } catch {}

            return { state: "mysterious", unlockReqText: "Reach Red Coral Level 91 to reveal this upgrade" };
        },
        effectSummary() {
            return "";
        },
    },
    {
        area: CORAL_AREA_KEY,
        id: 13,
        title: "Challenge of Diamond",
        desc: "Unlocks the Challenge of Diamond",
        lvlCap: 1,
        upgType: "NM",
        icon: "img/materials/diamond.webp",
        baseIconOverride: "img/currencies/rubble/rubble_base.webp",
        unlockUpgrade: true,
        costAtLevel() {
            return BigNum.fromInt(0);
        },
        nextCostAfter() {
            return BigNum.fromInt(0);
        },
        computeLockState() {
            let isPureGoldCompleted = false;
            try {
                const slotKey = getActiveSlot() ?? "default";
                isPureGoldCompleted = lsGetItem(`ccc:collapseChallengeCompleted:pure_gold:${slotKey}`) === "1";
            } catch {}

            if (!isPureGoldCompleted) {
                return { state: "locked" };
            }

            try {
                const state = getRclpState();
                if (state && state.unlocked) {
                    const numLevel = Math.max(0, Number(state.rclpLevel?.toString() || 0));
                    if (numLevel >= 221) {
                        return { state: "unlocked" };
                    }
                    return { state: "mysterious", unlockReqText: "Reach Red Coral Level 221 to reveal this upgrade" };
                }
            } catch {}
            
            return { state: "mysterious", unlockReqText: "Reach Red Coral Level 221 to reveal this upgrade" };
        },
        onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
                try {
                    const slot = getActiveSlot() ?? "default";
                    lsSetItem(`ccc:collapseChallengeVisible:diamond:${slot}`, "1");
                    window.dispatchEvent(new CustomEvent("debug:challenge:change", { detail: { id: "diamond", visible: true } }));
                } catch {}
            }
        },
        effectSummary() {
            return "";
        },
    }
];
