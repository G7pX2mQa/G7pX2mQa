import { computeDefaultUpgradeCost, E } from "./upgrades.js";
import { BigNum } from "../util/bigNum.js";
import { formatMultForUi, formatNumber } from "../util/numFormat.js";
import { isRclpSystemUnlocked, unlockRclpSystem } from "./rclpSystem.js";
import { getActiveSlot } from "../util/storage.js";

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
            if (normalizedLevel === 1) return BigNum.fromAny("1e4");
            if (normalizedLevel === 2) return BigNum.fromAny("1e10");
            if (normalizedLevel === 3) return BigNum.fromAny("1e25");
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

        title: "Unlock RCLP",
        desc: "Unlocks the RCLP system; collect Red Coral to contribute to Red Coral Level (gain RCLP)\nThat is, RCLP (progress) gain directly depends on the amount of Red Coral you collect\nEach Red Coral Level doubles Coin, XP, Book, Gold, MP, Magic, Gear, Wave, and RP value",
        descScale: 0.7,
        ignoreDescScaleAt: 1920,
        shrinkBetween: { min: 1920, max: 2000, scale: 0.95 },
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
                metCoral = window.localStorage.getItem(`ccc:coral_reefMet:${slotKey}`) === "1";
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
];
