import { settingsManager } from "./settingsManager.js";
import { isSurgeUnlocked } from "../ui/merchantTabs/resetTab.js";
import { E } from "./upgrades.js";
import { formatNumber } from "../util/numFormat.js";
import { BigNum } from "../util/bigNum.js";
import { getActiveSlot } from "../util/storage.js";
import { isCollapseUnlocked } from "../ui/minerTabs/collapseTab.js";
import { lsGetItem } from "../main.js";

export const AUTOMATION_AREA_KEY = "automation";
export const EFFECTIVE_AUTO_COLLECT_ID = 1;
export const AUTOBUY_COIN_UPGRADES_ID = 2;
export const AUTOBUY_BOOK_UPGRADES_ID = 3;
export const AUTOBUY_GOLD_UPGRADES_ID = 4;
export const AUTOBUY_MAGIC_UPGRADES_ID = 5;
export const AUTOBUY_WORKSHOP_LEVELS_ID = 6;
export const AUTOBUY_DNA_UPGRADES_ID = 7;
export const AUTOBUY_EVOLVE_UPGRADES_ID = 8;
export const AUTOBUY_SCRAP_UPGRADES_ID = 9;
export const UNDERWATER_CAVERN_EAC_ID = 10;
export const EFFECTIVE_AUTO_SELL_ID = 11;
export const AUTOBUY_CORE_BUILDING_ID = 12;
export const AUTOBUY_CRYSTAL_BUILDING_ID = 13;
export const AUTOBUY_STONE_BUILDING_ID = 14;

// export ties specifically for upgrades who break the norm
export const AUTOMATION_TIES = {
    EFFECTIVE_AUTO_COLLECT: "effective_auto_collect",
    AUTOBUY_COIN_UPGRADES: "autobuy_coin_upgrades",
    UNDERWATER_CAVERN_EAC: "underwater_cavern_eac",
    EFFECTIVE_AUTO_SELL: "effective_auto_sell",
};

// Maps an Automation Upgrade ID to the cost type it controls (Master Switch logic).
export const MASTER_AUTOBUY_IDS = {
    [AUTOBUY_COIN_UPGRADES_ID]: "coins",
    [AUTOBUY_BOOK_UPGRADES_ID]: "books",
    [AUTOBUY_GOLD_UPGRADES_ID]: "gold",
    [AUTOBUY_MAGIC_UPGRADES_ID]: "magic",
    [AUTOBUY_DNA_UPGRADES_ID]: "dna",
    [AUTOBUY_SCRAP_UPGRADES_ID]: "scrap",
    [AUTOBUY_CORE_BUILDING_ID]: "cores",
    [AUTOBUY_CRYSTAL_BUILDING_ID]: "crystals",
    [AUTOBUY_STONE_BUILDING_ID]: "stone",
};

const UPGRADE_DEFINITIONS = [
    {
        area: AUTOMATION_AREA_KEY,
        id: EFFECTIVE_AUTO_COLLECT_ID,
        tie: AUTOMATION_TIES.EFFECTIVE_AUTO_COLLECT,
        title: "Effective Auto-Collect",
        desc: "Generates the equivalent of collecting a Coin on an interval\nEach level of this upgrade will reduce the generation interval\nAs a bonus, anything passively generated accumulates offline",
        icon: "img/sc_upg_icons/effective_auto_collect.webp",
        lvlCap: 20,
        baseCost: 100,
        costType: "gears",
        upgType: "NM",
        scaling: { ratio: 2 },
        costAtLevel(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            return BigNum.fromInt(100).mulBigNumInteger(E.powPerLevel(2)(lvl));
        },
        effectSummary(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            if (lvl === 0) return "Generation interval: None";
            const intervalMs = Math.round(1000 / lvl);
            return `Generation interval: ${formatNumber(BigNum.fromAny(intervalMs))}ms`;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_COIN_UPGRADES_ID,
        tie: AUTOMATION_TIES.AUTOBUY_COIN_UPGRADES,
        title: "Autobuy Coin Upgrades",
        desc: "Automatically buys Coin upgrades, but with a twist:\nAutobuys upgrades for free, as long as you can afford the cost\nThis is how all future autobuyers will work",
        icon: "img/sc_upg_icons/autobuy_coin.webp",
        lvlCap: 1,
        baseCost: 1e6,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromInt(1e6);
        },
        effectSummary() {
            return null;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_BOOK_UPGRADES_ID,
        title: "Autobuy Book Upgrades",
        desc: "Automatically buys Book upgrades",
        icon: "img/sc_upg_icons/autobuy_book.webp",
        lvlCap: 1,
        baseCost: 1e9,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromInt(1e9);
        },
        effectSummary() {
            return null;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_GOLD_UPGRADES_ID,
        title: "Autobuy Gold Upgrades",
        desc: "Automatically buys Gold upgrades",
        icon: "img/sc_upg_icons/autobuy_gold.webp",
        lvlCap: 1,
        baseCost: 1e12,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e12");
        },
        effectSummary() {
            return null;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_MAGIC_UPGRADES_ID,
        title: "Autobuy Magic Upgrades",
        desc: "Automatically buys Magic upgrades",
        icon: "img/sc_upg_icons/autobuy_magic.webp",
        lvlCap: 1,
        baseCost: 1e15,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e15");
        },
        effectSummary() {
            return null;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_WORKSHOP_LEVELS_ID,
        title: "Autobuy Workshop Levels",
        desc: "Automatically buys Workshop Levels",
        icon: "img/sc_upg_icons/autobuy_workshop_level.webp",
        lvlCap: 1,
        baseCost: 1e18,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e18");
        },
        effectSummary() {
            return null;
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_DNA_UPGRADES_ID,
        title: "Autobuy DNA Upgrades",
        desc: "Automatically buys DNA upgrades",
        icon: "img/sc_upg_icons/autobuy_dna.webp",
        lvlCap: 1,
        baseCost: 1e27,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e27");
        },
        effectSummary() {
            return null;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 11 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 11) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 11 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_EVOLVE_UPGRADES_ID,
        title: "Auto-Evolve Upgrades",
        desc: "Automatically evolves upgrades when they are ready",
        icon: "img/sc_upg_icons/autobuy_evolve.webp",
        lvlCap: 1,
        baseCost: 1e126,
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e126");
        },
        effectSummary() {
            return null;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 60 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 60) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 60 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_SCRAP_UPGRADES_ID,
        title: "Autobuy Scrap Upgrades",
        desc: "Automatically buys Scrap upgrades",
        icon: "img/uc_upg_icons/autobuy_scrap.webp",
        lvlCap: 1,
        baseCost: "1e250",
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e250");
        },
        effectSummary() {
            return null;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 150 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 150 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: UNDERWATER_CAVERN_EAC_ID,
        tie: AUTOMATION_TIES.UNDERWATER_CAVERN_EAC,
        title: "Underwater Cavern EAC",
        desc: "Generates the equivalent of collecting a Material on an interval\nUC EAC also generates its own Materials dependent on Depth\nEach level of this upgrade will reduce the generation interval",
        icon: "img/uc_upg_icons/eac_uc.webp",
        requiredNodeId: "cavern",
        lvlCap: 20,
        baseCost: "1e25",
        costType: "gears",
        upgType: "NM",
        scaling: { ratio: "1e25" },
        costAtLevel(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            return BigNum.fromAny("1e25").mulBigNumInteger(E.powPerLevel("1e25")(lvl));
        },
        effectSummary(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            if (lvl === 0) return "Generation interval: None";
            const intervalMs = Math.round(1000 / lvl);
            return `Generation interval: ${formatNumber(BigNum.fromAny(intervalMs))}ms`;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 150 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 150 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: EFFECTIVE_AUTO_SELL_ID,
        tie: AUTOMATION_TIES.EFFECTIVE_AUTO_SELL,
        title: "Effective Auto-Sell",
        desc: "Every game tick, generates Scrap based on owned Materials\nGenerates at 0.0001%/0.01%/1%/100% efficiency depending on level",
        icon: "img/uc_upg_icons/effective_auto_sell.webp",
        requiredNodeId: "cavern",
        lvlCap: 4,
        baseCost: "1e250",
        costType: "gears",
        upgType: "NM",
        scaling: { ratio: "1e250" },
        costAtLevel(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            return BigNum.fromAny("1e250").mulBigNumInteger(E.powPerLevel("1e250")(lvl));
        },
        effectSummary(level) {
            const lvl = Math.max(0, Math.floor(Number(level) || 0));
            if (lvl === 0) return "Auto-sell efficiency: 0%";
            let eff = "0%";
            if (lvl === 1) eff = "0.0001%";
            else if (lvl === 2) eff = "0.01%";
            else if (lvl === 3) eff = "1%";
            else if (lvl >= 4) eff = "100%";
            const autoSellSetting = settingsManager.get("auto_sell_efficiency");
            if (autoSellSetting !== undefined && autoSellSetting < 100) {
                if (autoSellSetting === 0) return `Auto-sell efficiency: 0% (nerfed by setting)`;
                let numVal = parseFloat(eff);
                let nerfedVal = numVal * (autoSellSetting / 100);
                return `Auto-sell efficiency: ${nerfedVal}% (nerfed by setting)`;
            }
            return `Auto-sell efficiency: ${eff}`;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 150 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 150) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 150 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_CORE_BUILDING_ID,
        title: "Autobuy Core Building",
        desc: "Automatically buys levels of the Core Building",
        icon: "img/sc_upg_icons/autobuy_core.webp",
        lvlCap: 1,
        baseCost: "1e1000",
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e1000");
        },
        effectSummary() {
            return null;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 500 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 500) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 500 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_CRYSTAL_BUILDING_ID,
        title: "Autobuy Crystal Building",
        desc: "Automatically buys levels of the Crystal Building",
        icon: "img/sc_upg_icons/autobuy_crystal.webp",
        lvlCap: 1,
        baseCost: "1e1000",
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e1000");
        },
        effectSummary() {
            return null;
        },
        computeLockState(ctx) {
            const sl = ctx.surgeLevel;
            let isUnlocked = false;

            if (typeof sl === "number") {
                if (sl >= 750 || sl === Infinity) isUnlocked = true;
            } else if (typeof sl === "string") {
                if (sl === "Infinity" || parseFloat(sl) === Infinity) isUnlocked = true;
                else if (!isNaN(parseFloat(sl)) && parseFloat(sl) >= 750) isUnlocked = true;
            } else if (sl && typeof sl.isInfinite === "function" && sl.isInfinite()) {
                isUnlocked = true;
            }

            if (isUnlocked) return { state: "unlocked" };

            if (!isSurgeUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Reach Surge 750 to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
    {
        area: AUTOMATION_AREA_KEY,
        id: AUTOBUY_STONE_BUILDING_ID,
        title: "Autobuy Stone Building",
        desc: "Automatically buys levels of the Stone Building",
        icon: "img/sc_upg_icons/autobuy_stone.webp",
        lvlCap: 1,
        baseCost: "1e1000",
        costType: "gears",
        upgType: "NM",
        costAtLevel() {
            return BigNum.fromAny("1e1000");
        },
        effectSummary() {
            return null;
        },
        computeLockState() {
            let isUnlocked = false;
            try {
                isUnlocked = lsGetItem(`ccc:collapseChallengeCompleted:stone:${getActiveSlot() ?? "default"}`) === "1";
            } catch {}

            if (isUnlocked) return { state: "unlocked" };

            if (!isCollapseUnlocked()) {
                return { state: "locked" };
            }

            const revealText = "Complete the Challenge of Stone to reveal this upgrade";
            return { state: "mysterious", unlockReqText: revealText };
        },
    },
];

export const REGISTRY = UPGRADE_DEFINITIONS.map((u) => ({
    ...u,
    icon: u.icon,
}));
