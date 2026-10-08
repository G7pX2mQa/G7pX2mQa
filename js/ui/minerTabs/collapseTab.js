import { lsSetItem, lsGetItem, lsRemoveItem } from "../../main.js";
import { getActiveSlot, bank, setChallengeOfIronTransitionLockActive } from "../../util/storage.js";
import { getSaveDataForSlot, applySaveDataToSlot } from "../../util/slotsManager.js";
import { setHtmlOrText } from "../../util/uiHelpers.js";
import { setupDragToClose, ensureCustomScrollbar } from "../shopOverlay.js";
import { UC_MATERIAL_DATA } from "../../game/ucSpawner.js";
import { AREA_KEYS, UPGRADE_TIES, setLevel, clearCachedUpgradeStates, resetCurrencyAndUpgradeLevels } from "../../game/upgrades.js";
import { getCurrencyMultiplierBN } from "../../util/storage.js";
import { BigNum } from "../../util/bigNum.js";
import { formatNumber } from "../../util/numFormat.js";
import { setRubbleSellMode } from "./sellTab.js";
import { RUBBLE_AREA_KEY, RUBBLE_REGISTRY, getRubbleUpgradeForChallenge, getBoostedCurrencyForRubbleUpgrade } from "../../game/rubbleUpgrades.js";
import { DNA_AREA_KEY } from "../../game/dnaUpgrades.js";
import { disableGlobalOverlayEsc, enableGlobalOverlayEsc } from "../../util/globalOverlayEsc.js";
import { performCollapseReset } from "./resetTab.js";
import { isBuildingUnlocked } from "./buildingsTab.js";
import { suspendAllAudioFor } from "../../util/audioManager.js";
import { addExternalCoinMultiplierProvider, syncCoinMultiplierWithXpLevel } from "../../game/xpSystem.js";
import { showWideNotification } from "../notifications.js";
import { onDpChange } from "../../game/dpSystem.js";
import { clearPendingGains } from "../../game/coinPickup.js";
import { registerTick } from "../../game/gameLoop.js";
import { WATERWHEELS, setWaterwheelLevel, setWaterwheelFp } from "../merchantTabs/flowTab.js";
const COLLAPSE_UNLOCKED_KEY_BASE = "ccc:collapseUnlocked";

let cachedCollapseUnlockedStates = {};

let challengeOfIronTransitionLockTicks = 0;
if (typeof window !== "undefined") {
    registerTick(() => {
        if (challengeOfIronTransitionLockTicks > 0) {
            setChallengeOfIronTransitionLockActive(true);
            challengeOfIronTransitionLockTicks--;
            if (challengeOfIronTransitionLockTicks <= 0) {
                setChallengeOfIronTransitionLockActive(false);
                const slot = getActiveSlot();
                if (slot != null) {
                    lsRemoveItem(`ccc:challengeOfIronTransitionLockActive:${slot}`);
                }
            }
        }
    });
}

export function isCollapseUnlocked(slot = getActiveSlot()) {
    if (cachedCollapseUnlockedStates[slot] !== undefined && cachedCollapseUnlockedStates[slot] !== null)
        return cachedCollapseUnlockedStates[slot];

    if (typeof localStorage === "undefined") return false;
    try {
        const result = lsGetItem(`${COLLAPSE_UNLOCKED_KEY_BASE}:${slot}`) === "1";
        cachedCollapseUnlockedStates[slot] = result;
        return result;
    } catch {
        return false;
    }
}

export function setCollapseUnlocked(value, slot = getActiveSlot()) {
    if (typeof localStorage !== "undefined") {
        const prev = cachedCollapseUnlockedStates[slot];
        lsSetItem(`${COLLAPSE_UNLOCKED_KEY_BASE}:${slot}`, value ? "1" : "0");
        cachedCollapseUnlockedStates[slot] = !!value;
        if (prev !== !!value && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new CustomEvent("unlock:change", { detail: { key: "collapse", state: !!value, slot } }));
        }
    }
}

if (typeof window !== "undefined") {
    const invalidateCollapseCache = () => {
        cachedCollapseUnlockedStates = {};
        cachedChallengeActive = {};
        cachedChallengeType = {};
    };
    window.addEventListener("saveSlot:change", (e) => {
        invalidateCollapseCache();
        // Anti-cheat: resume iron lock if flag exists
        const slot = e?.detail?.slot ?? getActiveSlot();
        if (slot != null) {
            try {
                if (lsGetItem(`ccc:challengeOfIronTransitionLockActive:${slot}`) === "1") {
                    challengeOfIronTransitionLockTicks = 60;
                    setChallengeOfIronTransitionLockActive(true);
                } else {
                    challengeOfIronTransitionLockTicks = 0;
                    setChallengeOfIronTransitionLockActive(false);
                }
            } catch {}
        }
    });
    window.addEventListener("unlock:change", invalidateCollapseCache);
    try {
        const slot = getActiveSlot();
        if (slot != null && (lsGetItem(`ccc:challengeOfIronTransitionLockActive:${slot}`) === "1")) {
            challengeOfIronTransitionLockTicks = 60;
            setChallengeOfIronTransitionLockActive(true);
        }
    } catch {}
}

// --- Collapse Challenge State ---
const CHALLENGE_ACTIVE_KEY_BASE = "ccc:collapseChallengeActive";
let cachedChallengeActive = {};
let cachedChallengeType = {};
let coinDebuffUnregister = null;

export function isCollapseChallengeActive(slot = getActiveSlot()) {
    if (slot == null) return false;
    if (cachedChallengeActive[slot] !== undefined) return cachedChallengeActive[slot];
    if (typeof localStorage === "undefined") return false;
    try {
        const val = lsGetItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
        const result = !!val && val !== "";
        cachedChallengeActive[slot] = result;
        return result;
    } catch {
        return false;
    }
}

export function getActiveCollapseChallengeType(slot = getActiveSlot()) {
    if (slot == null) return null;
    if (cachedChallengeType[slot] !== undefined) return cachedChallengeType[slot];
    if (typeof localStorage === "undefined") return null;
    try {
        const val = lsGetItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
        const result = val && val !== "" ? val : null;
        cachedChallengeType[slot] = result;
        return result;
    } catch {
        return null;
    }
}

function setCollapseChallengeActive(materialName, slot = getActiveSlot()) {
    if (slot == null) return;
    if (typeof localStorage === "undefined") return;
    try {
        if (materialName) {
            lsSetItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`, materialName);
            cachedChallengeActive[slot] = true;
            cachedChallengeType[slot] = materialName;
        } else {
            lsRemoveItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
            cachedChallengeActive[slot] = false;
            cachedChallengeType[slot] = null;
        }
        window.dispatchEvent(new CustomEvent("rubbleMode:toggled"));
    } catch {}
}

function registerCoinDebuff() {
    if (coinDebuffUnregister) return; // Already registered
    const divisor = BigNum.fromAny(1e100);
    coinDebuffUnregister = addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
        try {
            // Divide the base multiplier by 1e100
            if (typeof baseMultiplier.divBigNumInteger === "function") {
                return baseMultiplier.divBigNumInteger(divisor);
            }
            // Fallback: multiply by 1e-100
            return baseMultiplier.mulDecimal(1e-100);
        } catch {
            return baseMultiplier;
        }
    });
}

function unregisterCoinDebuff() {
    if (coinDebuffUnregister) {
        coinDebuffUnregister();
        coinDebuffUnregister = null;
    }
}

// --- Fracture Overlay ---
let interactionBlockState = null;

function blockCollapseInteractions() {
    if (interactionBlockState) return;
    const state = { handler: null, blocker: null };

    state.handler = (e) => {
        if (e.key === "Escape" || e.key === "Tab" || /^[0-9]$/.test(e.key)) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    };
    window.addEventListener("keydown", state.handler, true);
    if (typeof disableGlobalOverlayEsc === "function") disableGlobalOverlayEsc();

    const blocker = document.createElement("div");
    blocker.id = "collapse-cinematic-blocker";
    blocker.style.position = "fixed";
    blocker.style.inset = "0";
    blocker.style.zIndex = "9999999"; 
    document.body.appendChild(blocker);
    state.blocker = blocker;

    interactionBlockState = state;
}

function unblockCollapseInteractions() {
    if (!interactionBlockState) return;
    const state = interactionBlockState;
    if (state.handler) {
        window.removeEventListener("keydown", state.handler, true);
    }
    if (typeof enableGlobalOverlayEsc === "function") enableGlobalOverlayEsc();
    if (state.blocker) {
        state.blocker.remove();
    }
    interactionBlockState = null;
}

let fractureTimeout = null;
let fractureFadeTimeout = null;

function showFractureOverlay(animate = true) {
    let el = document.getElementById("collapse-fracture-screen");
    if (!el) {
        el = document.createElement("div");
        el.id = "collapse-fracture-screen";
        el.className = "collapse-fracture-overlay";
        document.body.appendChild(el);
    }
    // Clear any inline styles that could conflict with classes
    el.style.clipPath = "";
    
    if (animate) {
        el.classList.remove("is-active", "is-fading", "is-animating");
        // Force reflow to ensure the transition from 0% starts cleanly
        void el.offsetWidth;
        el.classList.add("is-active");
    } else {
        el.classList.remove("is-animating", "is-fading");
        el.classList.add("is-active");
    }
}

function fadeFractureOverlay() {
    const el = document.getElementById("collapse-fracture-screen");
    if (el) {
        el.classList.add("is-fading");
        let done = false;
        const onEnd = (e) => {
            if (e && e.propertyName && e.propertyName !== "opacity") return;
            if (done) return;
            done = true;
            el.removeEventListener("transitionend", onEnd);
            hideFractureOverlay();
        };
        el.addEventListener("transitionend", onEnd);
        setTimeout(onEnd, 1050);
    }
}

function hideFractureOverlay() {
    const el = document.getElementById("collapse-fracture-screen");
    if (el) {
        el.classList.remove("is-active", "is-animating", "is-fading");
        el.remove();
    }
}

function getWhitelistPrefixes() {
    return [
        "ccc:upgrades:starter_cove:",
        "ccc:upgrades:underwater_cavern:",
        "ccc:upgrades:dna:",
        "ccc:upgrades:rubble:",
        "ccc:buildingLevel:",
        "ccc:lab:node:level:",
        "ccc:lab:node:rp:",
        "ccc:lab:node:active:",
        "ccc:lab:level:",
        "ccc:flow:",
        "ccc:reset:surge:barLevel:",
        "ccc:dp:level:",
        "ccc:dp:progress:",
        "ccc:ppLevel:",
        "ccc:ppProgress:",
        "ccc:hmEvolutions:",
        "ccc:mutation:level:",
        "ccc:mutation:progress:",
        "ccc:xp:level:",
        "ccc:xp:progress:",
        "ccc:ucMaterialAccumulators:",
        "ccc:ucEacMaterialAccumulators:",
        "ccc:ucEacAccumulator:",
        "ccc:ucEacYieldAccumulators:",
        "ccc:waves:",
        "ccc:gold:",
        "ccc:magic:",
        "ccc:coins:",
        "ccc:books:",
        "ccc:dna:",
        "ccc:scrap:",
        "ccc:stone:",
        "ccc:copper:",
        "ccc:iron:",
        "ccc:pure_gold:",
        "ccc:diamond:",
        "ccc:emerald:",
        "ccc:ruby:",
        "ccc:sapphire:",
        "ccc:unobtainium:",
        "ccc:prismatium:",
        "ccc:cores:",
        "ccc:crystals:",
        "ccc:rubble:",
        "ccc:mult:"
    ];
}

// --- Challenge Start/Exit ---
export function startCollapseChallenge(materialName) {
    const slot = getActiveSlot();

    // Block interactions to prevent spamming
    blockCollapseInteractions();

    if (fractureTimeout) clearTimeout(fractureTimeout);
    if (fractureFadeTimeout) clearTimeout(fractureFadeTimeout);

    // Clear pending gains so none carry over
    if (typeof clearPendingGains === "function") {
        clearPendingGains();
    }

    if (materialName === "iron") {
        challengeOfIronTransitionLockTicks = 60;
        setChallengeOfIronTransitionLockActive(true);
        if (slot != null) {
            lsSetItem(`ccc:challengeOfIronTransitionLockActive:${slot}`, "1");
        }
    }

    // Backup current state
    try {
        if (slot != null) {
            const backupData = getSaveDataForSlot(slot);
            delete backupData[`ccc:challengeBackup:${slot}`];
            
            const allowedPrefixes = getWhitelistPrefixes();
            
            for (const key of Object.keys(backupData)) {
                let keep = false;
                for (const prefix of allowedPrefixes) {
                    if (key.startsWith(prefix)) {
                        keep = true;
                        break;
                    }
                }
                if (!keep || key.startsWith("ccc:mult:rainbow_gems:")) {
                    delete backupData[key];
                }
            }
            
            lsSetItem(`ccc:challengeBackup:${slot}`, JSON.stringify(backupData));
        }
    } catch (e) {
        console.error("Failed to backup save before challenge:", e);
    }

    // Set active state
    setCollapseChallengeActive(materialName);

    // Register coin debuff (÷1e100) only for stone
    if (materialName === "stone") {
        registerCoinDebuff();
    }
    syncCoinMultiplierWithXpLevel(true);

    // Pause all audio for 4 seconds, smoothly fading it back in over the last 1 second
    suspendAllAudioFor(4000, 1000);

    // Play collapse SFX using a separate, temporary AudioContext to bypass suspension
    try {
        const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
        fetch("sounds/collapse.ogg")
            .then(r => r.arrayBuffer())
            .then(b => tempCtx.decodeAudioData(b))
            .then(buffer => {
                const source = tempCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(tempCtx.destination);
                source.start(0);
                setTimeout(() => tempCtx.close().catch(() => {}), 5000);
            }).catch(() => {});
    } catch {}

    // Show fracture overlay with animation
    showFractureOverlay(true);
    
    fractureFadeTimeout = setTimeout(() => {
        fadeFractureOverlay();
    }, 3000);

    fractureTimeout = setTimeout(() => {
        unblockCollapseInteractions();
    }, 4000);

    // We must preserve lab state during a collapse reset since lab nodes are not supposed to be reset by it
    let preChallengeLabData = {};
    try {
        if (slot != null) {
            const data = getSaveDataForSlot(slot);
            for (const key of Object.keys(data)) {
                if (key.startsWith("ccc:lab:") && !key.startsWith("ccc:lab:node:discovered:")) {
                    preChallengeLabData[key] = data[key];
                }
            }
        }
    } catch {}

    // Perform Challenge-tier reset
    try {
        performCollapseReset();
    } catch {}

    // Restore lab state
    try {
        for (const [key, value] of Object.entries(preChallengeLabData)) {
            lsSetItem(key, value);
        }
    } catch {}

    // Dispatch event so other systems can react
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collapse:challenge:start", { detail: { material: materialName } }));
    }

    if (materialName === "iron") {
        try {
            setWaterwheelLevel(WATERWHEELS.GOLD, 0);
            setWaterwheelFp(WATERWHEELS.GOLD, 0);
        } catch {}
        challengeOfIronTransitionLockTicks = 60; // 3 entire seconds
        setChallengeOfIronTransitionLockActive(true);
        if (slot != null) {
            lsSetItem(`ccc:challengeOfIronTransitionLockActive:${slot}`, "1");
        }
    }

    return true;
}

function restoreChallengeBackup(slot) {
    if (typeof clearPendingGains === "function") {
        clearPendingGains();
    }
    let restoredBackup = false;
    try {
        if (slot != null) {
            const backupStr = lsGetItem(`ccc:challengeBackup:${slot}`);
            if (backupStr) {
                const backupData = JSON.parse(backupStr);
                
                // --- Lab Node Smart Merge ---
                let currentTotalLab = 0;
                let backupTotalLab = 0;
                
                // 1. Find backup total lab
                for (const key of Object.keys(backupData)) {
                    if (key.startsWith("ccc:lab:node:level:")) {
                        const val = parseInt(backupData[key], 10) || 0;
                        backupTotalLab += val;
                    }
                }
                
                // 2. Find current total lab & capture current lab data
                const currentData = getSaveDataForSlot(slot);
                const currentLabData = {};
                for (const key of Object.keys(currentData)) {
                    if (key.startsWith("ccc:lab:") && !key.startsWith("ccc:lab:node:discovered:")) {
                        currentLabData[key] = currentData[key];
                        if (key.startsWith("ccc:lab:node:level:")) {
                            const val = parseInt(currentData[key], 10) || 0;
                            currentTotalLab += val;
                        }
                    }
                }
                
                const keepCurrentLab = currentTotalLab >= backupTotalLab && Object.keys(currentLabData).length > 0;
                
                if (keepCurrentLab) {
                    // Remove all lab keys from backupData so we don't restore them
                    for (const key of Object.keys(backupData)) {
                        if (key.startsWith("ccc:lab:") && !key.startsWith("ccc:lab:node:discovered:")) {
                            delete backupData[key];
                        }
                    }
                }
                
                // Wipe temporary challenge stats via normal reset
                try {
                    performCollapseReset();
                } catch {}
                
                // Overwrite wiped state with our progression-only backup
                for (const [key, value] of Object.entries(backupData)) {
                    lsSetItem(key, value);
                }
                
                // If we kept current lab, restore it (since performCollapseReset wiped it)
                if (keepCurrentLab) {
                    for (const [key, value] of Object.entries(currentLabData)) {
                        lsSetItem(key, value);
                    }
                }
                
                lsRemoveItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
                lsRemoveItem(`ccc:challengeBackup:${slot}`);
                
                cachedChallengeActive[slot] = false;
                restoredBackup = true;

                clearCachedUpgradeStates("starter_cove", slot);
                clearCachedUpgradeStates("underwater_cavern", slot);
                clearCachedUpgradeStates("dna", slot);
                clearCachedUpgradeStates("rubble", slot);
                
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("ccc:upgrades:changed"));
                    window.dispatchEvent(new CustomEvent("currency:multiplier"));
                    window.dispatchEvent(new CustomEvent("collapse:challenge:exit"));
                }
            }
        }
    } catch (e) {
        console.error("Failed to restore save backup:", e);
    }
    return restoredBackup;
}

function exitCollapseChallenge(materialName) {
    const capitalName = materialName.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const answer = window.confirm(`Are you sure you want to exit the Challenge of ${capitalName}? You will lose any progress made inside the challenge!`);
    if (!answer) return false;

    if (fractureTimeout) clearTimeout(fractureTimeout);
    if (fractureFadeTimeout) clearTimeout(fractureFadeTimeout);
    unblockCollapseInteractions();

    // Clear active state
    setCollapseChallengeActive(null);

    // Unregister coin debuff
    unregisterCoinDebuff();

    const slot = getActiveSlot();
    const restoredBackup = restoreChallengeBackup(slot);

    if (!restoredBackup) {
        // Perform Challenge-tier reset
        try {
            performCollapseReset();
        } catch {}
    }

    // Clear rubble upgrade levels (temporary upgrades)
    try {
        if (slot != null) {
            for (const upg of RUBBLE_REGISTRY) {
                setLevel(RUBBLE_AREA_KEY, upg.id, 0);
            }
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.GOLD_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MAGIC_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(DNA_AREA_KEY, UPGRADE_TIES.DNA_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            
            if (bank?.rubble?.set) {
                bank.rubble.set(0);
            }
            setRubbleSellMode(false, slot);
        }
    } catch {}

    // Remove fracture overlay
    hideFractureOverlay();



    // Dispatch event
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collapse:challenge:exit", { detail: { material: materialName } }));
    }

    return true;
}

function completeCollapseChallenge(materialName) {
    const slot = getActiveSlot();
    
    // Record completion
    if (typeof localStorage !== "undefined") {
        lsSetItem(`ccc:collapseChallengeCompleted:${materialName}:${slot}`, "1");
    }

    if (fractureTimeout) clearTimeout(fractureTimeout);
    if (fractureFadeTimeout) clearTimeout(fractureFadeTimeout);
    unblockCollapseInteractions();

    // Clear active state
    setCollapseChallengeActive(null);
    
    // Clear any queued gains from the final challenge tick to prevent them from inflating restored currencies
    if (typeof clearPendingGains === "function") {
        clearPendingGains();
    }

    // Unregister coin debuff
    unregisterCoinDebuff();

    if (slot != null) {
        const backupStr = lsGetItem(`ccc:challengeBackup:${slot}`);
        if (backupStr) {
            try {
                const backupData = JSON.parse(backupStr);
                
                // --- Lab Node Smart Merge ---
                let currentTotalLab = 0;
                let backupTotalLab = 0;
                
                // Find backup max lab
                for (const key of Object.keys(backupData)) {
                    if (key.startsWith("ccc:lab:node:level:")) {
                        const val = parseInt(backupData[key], 10) || 0;
                        backupTotalLab += val;
                    }
                }
                
                // Find current max lab
                const currentData = getSaveDataForSlot(slot);
                for (const key of Object.keys(currentData)) {
                    if (key.startsWith("ccc:lab:node:level:")) {
                        const val = parseInt(currentData[key], 10) || 0;
                        currentTotalLab += val;
                    }
                }
                
                // If the player lost lab nodes during the challenge, restore the backup lab nodes.
                // Otherwise, keep the current ones (by doing nothing).
                if (currentTotalLab < backupTotalLab) {
                    for (const [key, value] of Object.entries(backupData)) {
                        if (key.startsWith("ccc:lab:") && !key.startsWith("ccc:lab:node:discovered:")) {
                            lsSetItem(key, value);
                        }
                    }
                }

            } catch (e) {
                console.error("Failed to restore lab nodes from backup on completion:", e);
            }
        }

        // Automated reset of all boosted currencies and their upgrade levels
        // for all challenges up to and including this one (e.g. Iron encompasses Stone, Copper, and Iron)
        const targetIndex = UC_MATERIAL_DATA.findIndex(m => m.name === materialName);
        const materialsToReset = targetIndex >= 0
            ? UC_MATERIAL_DATA.slice(0, targetIndex + 1).map(m => m.name)
            : [materialName];

        for (const mat of materialsToReset) {
            // EXCEPTION: Diamond challenge should not reset waves or surge
            if (mat === 'diamond') continue;

            const rubbleUpg = getRubbleUpgradeForChallenge(mat);
            if (rubbleUpg) {
                const boostedCurrency = getBoostedCurrencyForRubbleUpgrade(rubbleUpg);
                if (boostedCurrency) {
                    resetCurrencyAndUpgradeLevels(boostedCurrency, slot);
                }
            }
        }
        if (typeof clearPendingGains === "function") {
            clearPendingGains();
        }
        lsRemoveItem(`ccc:challengeBackup:${slot}`);
        lsRemoveItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
        cachedChallengeActive[slot] = false;
    }

    // Clear rubble upgrade levels (temporary challenge upgrades)
    try {
        if (slot != null) {
            for (const upg of RUBBLE_REGISTRY) {
                setLevel(RUBBLE_AREA_KEY, upg.id, 0);
            }
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.GOLD_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MAGIC_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            setLevel(DNA_AREA_KEY, UPGRADE_TIES.DNA_RUBBLE_VALUE, 0, true, { resetHmEvolutions: true });
            
            if (bank?.rubble?.set) {
                bank.rubble.set(0);
            }
            setRubbleSellMode(false, slot);
        }
    } catch {}

    hideFractureOverlay();

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collapse:challenge:complete", { detail: { material: materialName } }));
        window.dispatchEvent(new CustomEvent("ccc:upgrades:changed"));
        syncCoinMultiplierWithXpLevel(true);
    }

    return true;
}

// On page load or slot change: restore or clear challenge state
function restoreCollapseChallengeState() {
    const slot = getActiveSlot();
    if (slot == null) return;
    const activeMat = getActiveCollapseChallengeType(slot);
    if (!activeMat) {
        unregisterCoinDebuff();
        syncCoinMultiplierWithXpLevel(true);
        setRubbleSellMode(false, slot);
        if (bank?.rubble?.value > 0) {
            bank.rubble.set(0);
        }
        return;
    }
    // Re-register providers
    if (activeMat === "stone") {
        registerCoinDebuff();
    }
    syncCoinMultiplierWithXpLevel(true);
}

// Restore on script load and handle save slot changes
if (typeof window !== "undefined") {
    // Use a slight delay to ensure xpSystem has initialized
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(restoreCollapseChallengeState, 0);
    } else {
        window.addEventListener("DOMContentLoaded", () => {
            setTimeout(restoreCollapseChallengeState, 0);
        });
    }
    
    window.addEventListener("saveSlot:change", () => {
        restoreCollapseChallengeState();
    });
}

let overlayEl = null;
let lastChallengeOpenTime = 0;
let lastMysteriousOpenTime = 0;
let challengeResizeCleanup = null;
let currentPpChangeListener = null;
let currentDebugChallengeListener = null;

function applyChallengeOverlayTransition(sheet, transition = "transform var(--shop-anim)") {
    if (!sheet) return;
    sheet.style.transition = transition;
}

function openChallengeOverlaySheet(overlay, sheet) {
    if (!overlay || !sheet) return;
    applyChallengeOverlayTransition(sheet);
    overlay.classList.add("is-open");
    overlay.style.pointerEvents = "auto";
    sheet.style.transform = "translateY(100%)";
    void sheet.offsetHeight;
    sheet.style.transform = "translateY(0)";
}

function finishChallengeOverlayClose(overlay, onClosed) {
    const delay = document.body.classList.contains("no-overlay-transitions") ? 0 : 120;
    setTimeout(() => {
        overlay.classList.remove("is-open");
        if (typeof onClosed === "function") onClosed();
    }, delay);
}

function ensureMysteriousChallengeOverlay() {
    if (document.getElementById("mysterious-challenge-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "mysterious-challenge-overlay";
    overlay.className = "upg-overlay";
    const sheet = document.createElement("div");
    sheet.className = "upg-sheet";
    applyChallengeOverlayTransition(sheet);
    sheet.style.display = "flex";
    sheet.style.flexDirection = "column";
    const grabber = document.createElement("div");
    grabber.className = "upg-grabber";
    grabber.innerHTML = `<div class="grab-handle"></div>`;
    grabber.style.zIndex = "1";
    const header = document.createElement("header");
    header.className = "upg-header";
    header.style.zIndex = "1";
    header.style.background = "transparent";
    header.style.borderBottom = "none";
    const content = document.createElement("div");
    content.className = "upg-content shop-scroller";
    const actions = document.createElement("div");
    actions.className = "upg-actions";
    sheet.append(grabber, header, content, actions);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    ensureCustomScrollbar(overlay, sheet, ".shop-scroller");
    overlay.addEventListener("pointerdown", (e) => {
        if (e.target === overlay) {
            if (Date.now() - lastMysteriousOpenTime < 300) return;
            closeMysteriousChallengeOverlay();
        }
    });
    setupDragToClose(grabber, sheet, () => overlay.classList.contains("is-open"), closeMysteriousChallengeOverlay);
}

function openMysteriousChallengeOverlay(matName) {
    const existingOverlay = document.getElementById("mysterious-challenge-overlay");
    if (existingOverlay && existingOverlay.classList.contains("is-open")) return;
    lastMysteriousOpenTime = Date.now();
    ensureMysteriousChallengeOverlay();
    const overlay = document.getElementById("mysterious-challenge-overlay");
    const sheet = overlay.querySelector(".upg-sheet");
    const header = overlay.querySelector(".upg-header");
    const content = overlay.querySelector(".upg-content");
    const actions = overlay.querySelector(".upg-actions");
    
    const updateText = () => {
        const capitalName = matName.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const properName = isBuildingUnlocked(matName) ? capitalName : "[Unknown]";
        const mysteriousText = `You will know when you are ready to attempt the Challenge of ${properName}`;
        
        header.innerHTML = `
            <div class="upg-title">Hidden Challenge</div>
        `;
        content.innerHTML = `
            <div class="upg-desc centered lock-desc">${mysteriousText}</div>
        `;
    };
    
    updateText();
    
    if (currentMysteriousDpListener) {
        window.removeEventListener("dp:change", currentMysteriousDpListener);
        window.removeEventListener("level:change", currentMysteriousDpListener);
    }
    
    currentMysteriousDpListener = () => {
        if (!overlay.classList.contains("is-open")) return;
        updateText();
    };
    
    window.addEventListener("dp:change", currentMysteriousDpListener);
    window.addEventListener("level:change", currentMysteriousDpListener);

    actions.innerHTML = `
        <button type="button" class="shop-close">Close</button>
    `;
    const closeBtn = actions.querySelector(".shop-close");
    closeBtn.addEventListener("click", closeMysteriousChallengeOverlay);
    openChallengeOverlaySheet(overlay, sheet);
}
let currentMysteriousDpListener = null;

function closeMysteriousChallengeOverlay() {
    const overlay = document.getElementById("mysterious-challenge-overlay");
    if (!overlay) return;
    if (overlay.style.pointerEvents === "none") return;
    
    if (currentMysteriousDpListener) {
        window.removeEventListener("dp:change", currentMysteriousDpListener);
        window.removeEventListener("level:change", currentMysteriousDpListener);
        currentMysteriousDpListener = null;
    }
    
    overlay.style.pointerEvents = "none";
    const sheet = overlay.querySelector(".upg-sheet");
    applyChallengeOverlayTransition(sheet);
    sheet.style.transform = "translateY(100%)";
    finishChallengeOverlayClose(overlay);
}

function initChallengeOverlay() {
    if (document.getElementById("collapse-challenge-overlay")) return;
    overlayEl = document.createElement("div");
    overlayEl.id = "collapse-challenge-overlay";
    overlayEl.className = "upg-overlay";
    overlayEl.style.zIndex = "9999";
    const sheet = document.createElement("div");
    sheet.className = "upg-sheet";
    applyChallengeOverlayTransition(sheet);
    sheet.style.display = "flex";
    sheet.style.flexDirection = "column";

    const grabber = document.createElement("div");
    grabber.className = "upg-grabber";
    grabber.innerHTML = `<div class="grab-handle"></div>`;
    grabber.style.zIndex = "1";
    
    const header = document.createElement("header");
    header.className = "upg-header";
    header.style.zIndex = "1";
    header.style.background = "transparent";
    header.style.borderBottom = "none";
    
    const content = document.createElement("div");
    content.className = "upg-content shop-scroller";
    content.style.flex = "1";
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.zIndex = "1";
    
    const actions = document.createElement("div");
    actions.className = "upg-actions";
    actions.style.zIndex = "1";
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.flexWrap = "wrap";
    actions.style.justifyContent = "center";
    
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "shop-close";
    btnClose.textContent = "Close";
    actions.appendChild(btnClose);
    
    sheet.append(grabber, header, content, actions);
    overlayEl.appendChild(sheet);
    document.body.appendChild(overlayEl);
    
    ensureCustomScrollbar(overlayEl, sheet, ".shop-scroller");
    
    overlayEl.addEventListener("pointerdown", (e) => {
        if (e.target === overlayEl) {
            if (Date.now() - lastChallengeOpenTime < 300) return;
            closeChallengeOverlay();
        }
    });
    
    setupDragToClose(
        grabber,
        sheet,
        () => overlayEl.classList.contains("is-open"),
        closeChallengeOverlay
    );
    
    btnClose.addEventListener("click", closeChallengeOverlay);
}

function openChallengeOverlay(id, forceRedraw = false) {
    if (!forceRedraw && overlayEl && overlayEl.classList.contains("is-open")) return;
    lastChallengeOpenTime = Date.now();
    initChallengeOverlay();
    
    const sheet = overlayEl.querySelector(".upg-sheet");
    const header = overlayEl.querySelector(".upg-header");
    const content = overlayEl.querySelector(".upg-content");
    
    const capitalName = id.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    header.innerHTML = `<div class="upg-title">Challenge of ${capitalName}</div>`;
    
    const desc = document.createElement("div");
    desc.className = "collapse-overlay-desc";
    
    const formattedNum = formatNumber(BigNum.fromAny(1e100));
    
    let baseDescText = "";
    if (id === "stone") {
        baseDescText = `Welcome to Collapse Challenges; there are 10 total Collapse Challenges you must complete
Collapse Challenge completions are permanent (will never be reset) and each completion unlocks something new

The Challenge of ${capitalName}; the first Collapse Challenge
Starting a Collapse Challenge resets everything Compress does as well as Crystals, the Crystal Building, and Pressure/PP
Once you've started this Collapse Challenge, visit the Sell tab for required information to complete it (important)

Persistence of Lab Nodes when starting a Collapse Challenge will assist your recovery greatly

Effect: Coin value is divided by ${formattedNum}x
Goal: Reach Pressure: 31atm
Reward: Reveals a new UC upgrade that unlocks the third area + reveals a new automation upgrade`.trim();
    } else if (id === "copper") {
        baseDescText = `The Challenge of ${capitalName}; the second Collapse Challenge
You’ve gotten familiar with Coral Reef, now things are starting to get interesting
Be sure you’ve maximized the levels of your Lab Nodes before starting this (or any) Collapse Challenge

You can exit a Collapse Challenge at any time to recover stats you had before starting

Effect: Books become Coins and Coins become Books
Goal: Reach Pressure: 50atm
Reward: Unlocks a new tab in Coral Reef + reveals a new automation upgrade`.trim();
    } else if (id === "iron") {
        baseDescText = `The Challenge of ${capitalName}; the third Collapse Challenge
You’ve mastered the Red and you’ve mastered the Green
What might lie ahead? That waits to be seen...

The Green Coral Level you enter this Collapse Challenge with should not impact it too much

Effect: Gold Waterwheel becomes evil, dividing the values of all things Waterwheels boost, and is forced ON
Goal: Reach Pressure: 50atm
Reward: Unlocks a new Waterwheel + reveals a new automation upgrade`.trim();
    } else if (id === "pure_gold") {
        baseDescText = `The Challenge of ${capitalName}; the fourth Collapse Challenge
The numbers are starting to grow large, but things have only just begun
You will soon discover the final Material, and you will soon witness the final Building

As usual, prepare your Lab Nodes and other things before starting for a faster completion

Effect: The Vault Building becomes infused with Magic, and traps a logarithmic half of all currencies inside it
Effect Modifier: Reach Surge 250 to make it only trap a logarithmic third (^½ → ^⅔ currency multipliers)
Goal: Reach Pressure: 65atm
Reward: Reveals two new Coral Reef upgrades + unlocks a new Waterwheel + reveals a new automation upgrade`.trim();
    } else if (id === "diamond") {
        baseDescText = `The Challenge of ${capitalName}; the fifth Collapse Challenge
Coral Reef has gone long enough without the final color; it's been waiting so long
Can you guess what the final color might be? Or have you already figured it out?

You know what to do

Effect: Waves are entirely unobtainable from Surge resets
Effect Modifier: Rubble Upgrades inside this and all future Collapse Challenges scale 5x more harshly
Goal: Reach Pressure: 110atm
Reward: Reveals three new Coral Reef upgrades + adds a new color to Color Shift + reveals a new automation upgrade`.trim();
    } else {
        baseDescText = `The Challenge of ${capitalName}
[Placeholder challenge text]`.trim();
    }

    desc.textContent = baseDescText;

    const btnWrapper = document.createElement("div");
    btnWrapper.className = "collapse-btn-wrapper";
    const actionBtn = document.createElement("button");
    actionBtn.className = "collapse-start-btn";

    // Determine button state
    const challengeActive = isCollapseChallengeActive();
    const activeMat = getActiveCollapseChallengeType();
    const isThisChallengeActive = activeMat === id;
    
    function checkChallengeGoalReached(challengeId) {
        if (challengeId === "stone") {
            try {
                if (typeof window.ppSystem !== "undefined" && window.ppSystem.getPpState().ppLevel.cmp(31) >= 0) {
                    return true;
                }
            } catch {}
        }
        if (challengeId === "copper") {
            try {
                if (typeof window.ppSystem !== "undefined" && window.ppSystem.getPpState().ppLevel.cmp(50) >= 0) {
                    return true;
                }
            } catch {}
        }
        if (challengeId === "iron") {
            try {
                if (typeof window.ppSystem !== "undefined" && window.ppSystem.getPpState().ppLevel.cmp(50) >= 0) {
                    return true;
                }
            } catch {}
        }
        if (challengeId === "pure_gold") {
            try {
                if (typeof window.ppSystem !== "undefined" && window.ppSystem.getPpState().ppLevel.cmp(65) >= 0) {
                    return true;
                }
            } catch {}
        }
        if (challengeId === "diamond") {
            try {
                if (typeof window.ppSystem !== "undefined" && window.ppSystem.getPpState().ppLevel.cmp(110) >= 0) {
                    return true;
                }
            } catch {}
        }
        return false;
    }

    let isGoalReached = isThisChallengeActive && checkChallengeGoalReached(id);

    const slot = getActiveSlot();
    let isCompleted = false;
    try {
        isCompleted = lsGetItem(`ccc:collapseChallengeCompleted:${id}:${slot}`) === "1";
    } catch {}

    if (isCompleted) {
        btnWrapper.style.display = "none";
        desc.style.marginBottom = "0";
        actionBtn.textContent = `Complete Challenge`;
    } else if (isThisChallengeActive) {
        if (isGoalReached) {
            actionBtn.textContent = `Complete Challenge`;
        } else {
            actionBtn.textContent = `Exit Challenge`;
        }
    } else {
        actionBtn.textContent = `Start Challenge`;
    }

    actionBtn.addEventListener("click", () => {
        if (isCompleted) return;
        
        if (isCollapseChallengeActive() && getActiveCollapseChallengeType() === id) {
            let currentGoalReached = checkChallengeGoalReached(id);

            if (currentGoalReached) {
                // Complete
                if (completeCollapseChallenge(id)) {
                    isCompleted = true;
                    if (overlayEl.querySelector('.shop-scroller')?.__customScroll?.suppressFadeIn) {
                        overlayEl.querySelector('.shop-scroller').__customScroll.suppressFadeIn();
                    }
                    btnWrapper.style.display = "none";
                    updateScrollNotice();
                }
            } else {
                // Exit
                if (exitCollapseChallenge(id)) {
                    actionBtn.textContent = `Start Challenge`;
                    actionBtn.blur();
                }
            }
        } else {
            // Start
            if (startCollapseChallenge(id)) {
                actionBtn.blur();
                actionBtn.style.animation = "none";
                setTimeout(() => {
                    const oldText = `Start Challenge`;
                    const newText = checkChallengeGoalReached(id) ? `Complete Challenge` : `Exit Challenge`;
                    
                    // Measure old dimensions
                    const oldRect = actionBtn.getBoundingClientRect();
                    const oldWidth = oldRect.width;
                    const oldHeight = oldRect.height;
                    
                    // Temporarily set to new text to measure target width
                    actionBtn.textContent = newText;
                    const newWidth = actionBtn.getBoundingClientRect().width;
                    
                    // Prepare button for animation
                    actionBtn.style.width = oldWidth + "px";
                    actionBtn.style.height = oldHeight + "px";
                    actionBtn.style.transition = "width 1s ease";
                    
                    actionBtn.innerHTML = `
                        <span style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 1; transition: opacity 1s ease; white-space: nowrap;">${oldText}</span>
                        <span style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 1s ease; white-space: nowrap;">${newText}</span>
                    `;
                    
                    // Trigger reflow
                    actionBtn.offsetHeight;
                    
                    // Animate width and cross-fade opacities
                    actionBtn.style.width = newWidth + "px";
                    const spans = actionBtn.querySelectorAll("span");
                    if (spans.length === 2) {
                        spans[0].style.opacity = "0";
                        spans[1].style.opacity = "1";
                    }
                    
                    setTimeout(() => {
                        actionBtn.style.width = "";
                        actionBtn.style.height = "";
                        actionBtn.style.transition = "";
                        actionBtn.textContent = newText;
                        actionBtn.style.animation = "";
                    }, 1050);
                }, 3000);
            }
        }
    });

    btnWrapper.appendChild(actionBtn);

    const centerWrapper = document.createElement("div");
    centerWrapper.style.display = "flex";
    centerWrapper.style.flexDirection = "column";
    centerWrapper.style.alignItems = "center";
    centerWrapper.style.width = "100%";

    centerWrapper.appendChild(desc);
    centerWrapper.appendChild(btnWrapper);

    content.innerHTML = "";
    content.appendChild(centerWrapper);
    
    openChallengeOverlaySheet(overlayEl, sheet);

    if (currentPpChangeListener) {
        window.removeEventListener("level:change", currentPpChangeListener);
        window.removeEventListener("pp:change", currentPpChangeListener);
        window.removeEventListener("debug:change", currentPpChangeListener);
        currentPpChangeListener = null;
    }
    
    if (currentDebugChallengeListener) {
        window.removeEventListener("debug:challenge:change", currentDebugChallengeListener);
        currentDebugChallengeListener = null;
    }

    currentDebugChallengeListener = (e) => {
        if (e.detail && e.detail.id === id) {
            openChallengeOverlay(id, true);
        }
    };
    window.addEventListener("debug:challenge:change", currentDebugChallengeListener);

    if (!isCompleted) {
        currentPpChangeListener = () => {
            if (isCompleted) return;
            // Defer slightly to ensure debug panel or other systems have fully applied their state changes
            setTimeout(() => {
                try {
                    if (isCompleted) return;
                    if (!isCollapseChallengeActive() || getActiveCollapseChallengeType() !== id) return;
                    
                    if (actionBtn.textContent === "Start Challenge" || actionBtn.querySelector("span")) return;
                    
                    let levelBn = null;
                    if (typeof window.ppSystem !== "undefined") {
                        levelBn = window.ppSystem.getPpState().ppLevel;
                    }
                    if (levelBn) {
                        if (checkChallengeGoalReached(id)) {
                            isGoalReached = true;
                            actionBtn.textContent = `Complete Challenge`;
                        } else {
                            isGoalReached = false;
                            actionBtn.textContent = `Exit Challenge`;
                        }
                    }
                } catch {}
            }, 0);
        };
        window.addEventListener("level:change", currentPpChangeListener);
        window.addEventListener("pp:change", currentPpChangeListener);
        window.addEventListener("debug:change", currentPpChangeListener);
    }

    function updateScrollNotice() {
        if (!actionBtn || !content || !desc) return;
        const currentScroll = content.scrollTop;
        
        let textToUse = baseDescText;
        desc.textContent = textToUse;
        
        // Force reflow
        void content.offsetHeight;
        
        const isEntirelyVisible = content.scrollHeight <= content.clientHeight + 1;
        
        if (!isEntirelyVisible) {
            textToUse = `Scroll down further to see everything\n\n${baseDescText}`;
        }
        
        if (isCompleted) {
            textToUse = textToUse.replace(/^Reward:.*$/gm, match => {
                return `<span style="color:#00ff00; font-weight:bold;">${match}</span>`;
            });
        }
        
        let finalHtml = textToUse.replace(/\n/g, "<br>");
        desc.innerHTML = finalHtml;
        
        if (currentScroll > 0) {
            content.scrollTop = currentScroll;
        }
        if (content.__customScroll && typeof content.__customScroll.update === "function") {
            content.__customScroll.update();
        }
    }

    updateScrollNotice();

    requestAnimationFrame(() => {
        updateScrollNotice();
    });

    if (challengeResizeCleanup) {
        challengeResizeCleanup();
        challengeResizeCleanup = null;
    }

    const onResize = () => {
        if (overlayEl && overlayEl.classList.contains("is-open")) {
            updateScrollNotice();
        }
    };
    window.addEventListener("resize", onResize);
    challengeResizeCleanup = () => {
        window.removeEventListener("resize", onResize);
    };
}

function closeChallengeOverlay() {
    if (challengeResizeCleanup) {
        challengeResizeCleanup();
        challengeResizeCleanup = null;
    }
    if (currentPpChangeListener) {
        window.removeEventListener("level:change", currentPpChangeListener);
        window.removeEventListener("pp:change", currentPpChangeListener);
        window.removeEventListener("debug:change", currentPpChangeListener);
        currentPpChangeListener = null;
    }
    if (currentDebugChallengeListener) {
        window.removeEventListener("debug:challenge:change", currentDebugChallengeListener);
        currentDebugChallengeListener = null;
    }
    if (!overlayEl) return;
    if (overlayEl.style.pointerEvents === "none") return;
    overlayEl.style.pointerEvents = "none";
    const sheet = overlayEl.querySelector(".upg-sheet");
    applyChallengeOverlayTransition(sheet);
    sheet.style.transform = "translateY(100%)";
    finishChallengeOverlayClose(overlayEl);
}

export function renderCollapseGrid(gridEl) {
    gridEl.innerHTML = "";
    
    if (!UC_MATERIAL_DATA || !Array.isArray(UC_MATERIAL_DATA) || UC_MATERIAL_DATA.length === 0) {
        return;
    }

    for (let i = 0; i < 10; i++) {
        const mat = UC_MATERIAL_DATA[i];
        if (!mat) break;
        
        const isFirst = i === 0;
        const slot = getActiveSlot() ?? "default";
        const debugVisible = lsGetItem(`ccc:collapseChallengeVisible:${mat.name}:${slot}`) === "1";
        const isLocked = !isFirst && !debugVisible;
        
        const btn = document.createElement("button");
        btn.className = "shop-upgrade";
        if (isLocked) {
            btn.classList.add("is-locked");
        }
        btn.type = "button";
        
        const tile = document.createElement("div");
        tile.className = "shop-tile";
        
        const baseImg = document.createElement("img");
        baseImg.className = "base";
        baseImg.src = isLocked ? "img/misc/mysterious_plus_base.webp" : "img/currencies/rubble/rubble_base.webp";
        baseImg.alt = "";
        baseImg.draggable = false;
        
        const iconImg = document.createElement("img");
        iconImg.className = "icon";
        iconImg.src = `img/materials/${mat.name}.webp`;
        iconImg.alt = "";
        iconImg.draggable = false;
        if (isLocked) {
            iconImg.style.display = "none";
            iconImg.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // Transparent 1x1 gif
        }
        
        tile.appendChild(baseImg);
        tile.appendChild(iconImg);
        
        btn.appendChild(tile);
        
        const buildingUnlocked = isBuildingUnlocked(mat.name);
        const capitalName = mat.name.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        
        btn.dataset.matName = mat.name;
        btn.dataset.unlocked = buildingUnlocked ? "1" : "0";
        
        if (isLocked) {
            btn.title = "Hidden Challenge";
            btn.addEventListener("click", () => {
                openMysteriousChallengeOverlay(mat.name);
            });
        } else {
            btn.title = `Challenge of ${capitalName}`;
            btn.addEventListener("click", () => {
                openChallengeOverlay(mat.name);
            });
        }
        
        gridEl.appendChild(btn);
        }
}

export function initCollapsePanel(minerOverlayEl, minerSheetEl, tabsEl, panelsWrapEl) {
    // Create tab button
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "merchant-tab";
    tabBtn.dataset.tab = "collapse";
    tabBtn.textContent = "Collapse";
    tabBtn.title = "Collapse";

    tabsEl.appendChild(tabBtn);

    // Create panel content
    const panel = document.createElement("div");
    panel.className = "merchant-panel collapse-tab";
    panel.dataset.panel = "collapse";

    const scroller = document.createElement("div");
    scroller.className = "shop-scroller";
    scroller.style.height = "100%";
    scroller.style.position = "relative";

    const grid = document.createElement("div");
    grid.className = "shop-grid collapse-grid";
    grid.setAttribute("role", "grid");
    
    scroller.appendChild(grid);
    panel.appendChild(scroller);

    panelsWrapEl.appendChild(panel);

    tabBtn.addEventListener("click", () => {
        if (!isCollapseUnlocked()) return;
        const allTabs = tabsEl.querySelectorAll(".merchant-tab");
        const allPanels = panelsWrapEl.querySelectorAll(".merchant-panel");

        allTabs.forEach((t) => t.classList.remove("is-active"));
        allPanels.forEach((p) => p.classList.remove("is-active"));

        tabBtn.classList.add("is-active");
        panel.classList.add("is-active");
        
        renderCollapseGrid(grid);
    });

    updateCollapsePanelVisibility(minerSheetEl);
    
    if (isCollapseUnlocked()) {
        renderCollapseGrid(grid);
    }
    
    window.addEventListener("debug:challenge:change", () => {
        if (panel.classList.contains("is-active")) {
            renderCollapseGrid(grid);
        }
    });

    const handleDpChange = () => {
        if (!panel.classList.contains("is-active")) return;
        
        let needsRender = false;
        const children = grid.querySelectorAll(".shop-upgrade");
        for (const child of children) {
            const matName = child.dataset.matName;
            if (matName) {
                const wasUnlocked = child.dataset.unlocked === "1";
                if (isBuildingUnlocked(matName) !== wasUnlocked) {
                    needsRender = true;
                    break;
                }
            }
        }
        
        if (needsRender) {
            renderCollapseGrid(grid);
        }
    };

    window.addEventListener("dp:change", handleDpChange);
    window.addEventListener("level:change", (e) => {
        if (e.detail?.prefix === "dp") {
            handleDpChange();
        }
    });
}

export function updateCollapsePanelVisibility(minerSheetEl) {
    if (!minerSheetEl) {
        minerSheetEl = document.querySelector(".merchant-overlay.is-miner .merchant-sheet");
    }
    if (!minerSheetEl) return;
    
    const tabsEl = minerSheetEl.querySelector(".merchant-tabs");
    if (!tabsEl) return;
    const tabBtn = tabsEl.querySelector('[data-tab="collapse"]');
    if (!tabBtn) return;
    
    const unlocked = isCollapseUnlocked();
    const targetText = unlocked ? "Collapse" : "???";
    const targetTitle = unlocked ? "Collapse" : "???";

    if (tabBtn.textContent !== targetText) setHtmlOrText(tabBtn, targetText);
    if (tabBtn.title !== targetTitle) tabBtn.title = targetTitle;

    tabBtn.classList.toggle("is-locked", !unlocked);

    if (!unlocked && tabBtn.classList.contains("is-active")) {
        const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
        if (dlgTab) {
            dlgTab.click();
        }
    }
}

if (typeof window !== "undefined") {
    window.onCollapseUpgradeUnlocked = function () {
        setCollapseUnlocked(true);
        if (typeof window.dispatchEvent === "function") {
            window.dispatchEvent(new Event("unlock:change"));
        }
        const minerSheetEl = document.querySelector(".merchant-overlay.is-miner .merchant-sheet");
        if (minerSheetEl) {
            updateCollapsePanelVisibility(minerSheetEl);
        }
    };
    
    window.resetSystem = window.resetSystem || {};
    Object.assign(window.resetSystem, {
        isCollapseUnlocked,
        setCollapseUnlocked,
        updateCollapsePanelVisibility,
        isCollapseChallengeActive,
        getActiveCollapseChallengeType,
    });

    let stoneChallengeNotifyTimeout = null;
    let stoneChallengeObserver = null;
    let stoneChallengeNotif = null;

    const startStoneChallengeTimer = () => {
        const slot = getActiveSlot() ?? "default";
        const visitedKey = `ccc:hasVisitedSellTabInsideCoS:${slot}`;
        let visited = lsGetItem(visitedKey) === "1";

        if (visited) return;

        const checkVisited = () => {
            const sellPanel = document.getElementById("miner-panel-sell");
            if (sellPanel && sellPanel.classList.contains("is-active")) {
                visited = true;
                lsSetItem(visitedKey, "1");
                if (stoneChallengeNotif) {
                    stoneChallengeNotif.close();
                    stoneChallengeNotif = null;
                }
            }
        };

        const observer = new MutationObserver(() => {
            checkVisited();
            if (visited) observer.disconnect();
        });
        stoneChallengeObserver = observer;
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

        checkVisited();
        if (visited) {
            observer.disconnect();
            return;
        }

        if (stoneChallengeNotifyTimeout) clearInterval(stoneChallengeNotifyTimeout);
        
        let timeElapsed = 0;

        stoneChallengeNotifyTimeout = setInterval(() => {
            if (!document.hidden) {
                timeElapsed += 250;
            }

            if (timeElapsed >= 30000) {
                clearInterval(stoneChallengeNotifyTimeout);
                if (!visited && isCollapseChallengeActive() && getActiveCollapseChallengeType() === "stone") {
                    stoneChallengeNotif = showWideNotification(
                        "Please visit the Sell tab for required information to complete the Challenge of Stone!",
                        15000
                    );
                } else {
                    observer.disconnect();
                }
            }
        }, 250);

        const cleanup = (exitEvent) => {
            if (!exitEvent || exitEvent.detail?.material === "stone" || !isCollapseChallengeActive()) {
                if (stoneChallengeNotifyTimeout) clearInterval(stoneChallengeNotifyTimeout);
                observer.disconnect();
                if (stoneChallengeNotif) {
                    stoneChallengeNotif.close();
                    stoneChallengeNotif = null;
                }
                window.removeEventListener("collapse:challenge:exit", cleanup);
                window.removeEventListener("collapse:challenge:complete", cleanup);
            }
        };
        window.addEventListener("collapse:challenge:exit", cleanup);
        window.addEventListener("collapse:challenge:complete", cleanup);
    };

    window.addEventListener("collapse:challenge:start", (e) => {
        if (e.detail?.material === "stone") {
            startStoneChallengeTimer();
        }
    });

    if (isCollapseChallengeActive() && getActiveCollapseChallengeType() === "stone") {
        setTimeout(() => startStoneChallengeTimer(), 100);
    }
}
