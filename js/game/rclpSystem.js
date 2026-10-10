import { BigNum, bigNumFromLog10, approxLog10BigNum } from "../util/bigNum.js";
import { getActiveSlot, isStorageKeyLocked } from "../util/storage.js";
import { lsGetItem, lsSetItem } from "../main.js";
import { E, levelBigNumToNumber } from "./upgrades.js";

let rclpStateCache = null;
let cachedRclpSlot = null;

if (typeof window !== "undefined") {
    window.addEventListener("saveSlot:change", () => {
        rclpStateCache = null;
        cachedRclpSlot = null;
    });
}

function ensureState() {
    const slot = getActiveSlot();
    if (slot == null) return null;
    if (rclpStateCache && cachedRclpSlot === slot) return rclpStateCache;
    
    let state = {
        unlocked: false,
        rclpLevel: BigNum.fromInt(0),
        rclpProg: BigNum.fromInt(0),
    };
    
    try {
        const raw = lsGetItem(`ccc:rclpSystem:${slot}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed) {
                state.unlocked = !!parsed.unlocked;
                if (parsed.rclpLevel) state.rclpLevel = BigNum.fromAny(parsed.rclpLevel);
                if (parsed.rclpProg) state.rclpProg = BigNum.fromAny(parsed.rclpProg);
            }
        }
    } catch {}
    
    rclpStateCache = state;
    cachedRclpSlot = slot;
    return state;
}

function saveState(state) {
    const slot = getActiveSlot();
    if (slot == null) return;
    try {
        const payload = {
            unlocked: state.unlocked,
            rclpLevel: state.rclpLevel.toScientific(6),
            rclpProg: state.rclpProg.toScientific(6)
        };
        lsSetItem(`ccc:rclpSystem:${slot}`, JSON.stringify(payload));
    } catch {}
}

export function isRclpSystemUnlocked() {
    const state = ensureState();
    return state ? state.unlocked : false;
}

export function unlockRclpSystem() {
    const state = ensureState();
    if (!state) return;
    if (!state.unlocked) {
        state.unlocked = true;
        saveState(state);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('ccc:rclp:unlocked'));
        }
    }
}

export function getRclpState() {
    return ensureState();
}

function computeRclpRequirement(levelBn) {
    const L = levelBigNumToNumber(levelBn);
    if (!Number.isFinite(L)) return BigNum.fromAny("Infinity");
    
    if (L < 200) {
        return BigNum.fromInt(10).mulBigNumInteger(E.powPerLevel(2)(L));
    }
    
    let totalLog10 = 1 + L * Math.log10(2);
    const softcapStart = 1e12; // 1 Trillion
    if (L > softcapStart) {
        const softcapDeltaNum = L - softcapStart;
        const baseSoftcapLog = 5;
        const rate = 2.36034e-10;
        const penaltyLog10 = baseSoftcapLog * Math.exp(rate * softcapDeltaNum);
        if (!Number.isFinite(penaltyLog10) || penaltyLog10 >= 1.7976931348623157e308) {
            return BigNum.fromAny("Infinity");
        }
        totalLog10 += penaltyLog10;
        if (!Number.isFinite(totalLog10) || totalLog10 >= 1.7976931348623157e308) {
            return BigNum.fromAny("Infinity");
        }
    }
    return bigNumFromLog10(totalLog10);
}

export function getRclpRequirement() {
    const state = ensureState();
    if (!state) return BigNum.fromInt(10);
    return computeRclpRequirement(state.rclpLevel);
}

export function addRclp(amountBn) {
    const state = ensureState();
    if (!state || !state.unlocked) return;
    
    const slot = getActiveSlot();
    const progressLocked = isStorageKeyLocked(`ccc:rclpProgress:${slot}`);
    const levelLocked = isStorageKeyLocked(`ccc:rclLevel:${slot}`);

    if (progressLocked && levelLocked) return;

    if (!progressLocked) {
        state.rclpProg = state.rclpProg.add(amountBn);
    }
    
    let req = computeRclpRequirement(state.rclpLevel);
    let levelsGainedBn = BigNum.fromInt(0);
    let leveledUp = false;
    
    if (!levelLocked && !progressLocked && state.rclpProg.cmp(req) >= 0) {
        const getLogForLevel = (levelNum) => {
            let totalLog = 1 + levelNum * Math.log10(2);
            if (levelNum > 1e12) {
                const softcapDelta = levelNum - 1e12;
                totalLog += 5 * Math.exp(2.36034e-10 * softcapDelta);
            }
            return totalLog;
        };

        const currentProgressLog = approxLog10BigNum(state.rclpProg);
        const reqLog = approxLog10BigNum(req);

        if (currentProgressLog - reqLog > 2) {
            const baseLevelBn = state.rclpLevel;
            let currentLevelNum;
            try {
                currentLevelNum = baseLevelBn.inf
                    ? Infinity
                    : baseLevelBn.sig * Math.pow(10, baseLevelBn.e);
            } catch {
                currentLevelNum = 0;
            }

            if (Number.isFinite(currentLevelNum)) {
                let low = currentLevelNum;
                let high = Math.max(currentLevelNum, 4.5e12);
                let best = currentLevelNum;
                for (let i = 0; i < 60; i++) {
                    const mid = Math.floor((low + high) / 2);
                    const midLog = getLogForLevel(mid);
                    if (midLog <= currentProgressLog) {
                        best = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                    if (midLog === Number.POSITIVE_INFINITY) break;
                }

                const estimatedGain = best - currentLevelNum;
                if (estimatedGain > 10) {
                    const safeGain = Math.max(0, estimatedGain - 5);
                    if (safeGain > 0 && safeGain <= Number.MAX_SAFE_INTEGER) {
                        const safeGainBn = BigNum.fromAny(safeGain.toString());
                        state.rclpLevel = state.rclpLevel.add(safeGainBn);
                        levelsGainedBn = levelsGainedBn.add(safeGainBn);
                        req = computeRclpRequirement(state.rclpLevel);
                        leveledUp = true;
                    }
                }
            }
        }
        
        let guard = 0;
        const limit = 500;
        while (state.rclpProg.cmp(req) >= 0 && guard < limit) {
            if (state.rclpProg.inf || req.inf) break;
            
            state.rclpProg = state.rclpProg.sub(req);
            state.rclpLevel = state.rclpLevel.add(1);
            levelsGainedBn = levelsGainedBn.add(1);
            req = computeRclpRequirement(state.rclpLevel);
            leveledUp = true;
            guard++;
        }

        if (state.rclpLevel && typeof state.rclpLevel.cmp === "function" && state.rclpLevel.cmp(4.5e12) >= 0) {
            state.rclpLevel = BigNum.fromAny("Infinity");
            state.rclpProg = BigNum.fromAny("Infinity");
            req = computeRclpRequirement(state.rclpLevel);
        }
    }
    
    saveState(state);
    
    if (typeof window !== "undefined") {
        const detail = {
            delta: amountBn,
            levelsGained: levelsGainedBn
        };
        window.dispatchEvent(new CustomEvent('ccc:rclp:progress', { detail }));
        window.dispatchEvent(
            new CustomEvent("stat:change", {
                detail: { key: "rclp", delta: amountBn, progress: state.rclpProg },
            })
        );
        
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.rclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "rclp",
                    level: state.rclpLevel,
                    progress: state.rclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: leveledUp
                },
            })
        );
    }
}

export function getRclpMultiplier() {
    try {
        const state = getRclpState();
        if (state && state.rclpLevel) {
            const numLevel = Math.max(0, Number(state.rclpLevel.toString()));
            let effect = E.powPerLevel(2)(numLevel);
            return effect instanceof BigNum ? effect : BigNum.fromAny(effect);
        }
    } catch {}
    return BigNum.fromInt(1);
}

export function applyRclpState(newState) {
    const state = ensureState();
    if (!state) return;
    if (newState.unlocked) unlockRclpSystem();
    else if (newState.unlocked !== undefined) state.unlocked = newState.unlocked;
    let nextLevel = newState.rclpLevel !== undefined ? newState.rclpLevel : state.rclpLevel;
    let nextProgress = newState.rclpProg !== undefined ? newState.rclpProg : state.rclpProg;

    const levelIsFinite = nextLevel && !nextLevel.inf;
    const progressIsFinite = nextProgress && !nextProgress.inf;

    if (!levelIsFinite && progressIsFinite && newState.rclpLevel !== undefined) {
        nextProgress = BigNum.fromAny("Infinity");
    } else if (!progressIsFinite && levelIsFinite && newState.rclpProg !== undefined) {
        nextLevel = BigNum.fromAny("Infinity");
    } else if (newState.rclpLevel !== undefined || newState.rclpProg !== undefined) {
        if (levelIsFinite && !progressIsFinite) {
            if (newState.rclpLevel !== undefined) {
                nextProgress = BigNum.fromInt(0);
            }
        } else if (progressIsFinite && !levelIsFinite) {
            if (newState.rclpProg !== undefined) {
                nextLevel = BigNum.fromInt(0);
            }
        }
    }
    
    state.rclpLevel = nextLevel;
    state.rclpProg = nextProgress;
    saveState(state);
    
    if (typeof window !== "undefined") {
        let req = computeRclpRequirement(state.rclpLevel);
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.rclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "rclp",
                    level: state.rclpLevel,
                    progress: state.rclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: true
                },
            })
        );
        window.dispatchEvent(new CustomEvent('ccc:rclp:progress', { detail: { delta: BigNum.fromInt(0), levelsGained: BigNum.fromInt(0) } }));
    }
}

if (typeof window !== "undefined") {
    window.rclpSystem = {
        initRclpSystem,
        getRclpMultiplier,
        getRclpState,
        getRclpRequirement,
        isRclpSystemUnlocked,
        unlockRclpSystem,
        addRclp
    };
    // Also support cccRclpSystem in case offlinePanel checks for it
    window.cccRclpSystem = window.rclpSystem;
}

const hudRefs = {
    container: null,
    bar: null,
    fill: null,
    levelValue: null,
    progress: null,
};

function ensureHudRefs() {
    if (hudRefs.container && hudRefs.container.isConnected) return true;
    hudRefs.container = document.querySelector(".rclp-counter[data-rclp-hud]");
    if (!hudRefs.container) return false;
    hudRefs.bar = hudRefs.container.querySelector(".rclp-bar");
    hudRefs.fill = hudRefs.container.querySelector(".rclp-bar__fill");
    hudRefs.levelValue = hudRefs.container.querySelector(".rclp-level-value");
    hudRefs.progress = hudRefs.container.querySelector("[data-rclp-progress]");
    return true;
}

import { formatNumber } from "../util/numFormat.js";
import { setHtmlOrText, stripHtml } from "../util/uiHelpers.js";
import { syncCoralHudLayout } from "../ui/hudLayout.js";

export function updateRclpHud() {
    const containers = document.querySelectorAll(".rclp-counter");
    if (!containers.length) return;
    
    let isHiddenState = false;
    
    const state = ensureState();
    
    // Check main container hiding logic based on area and state
    const mainContainer = document.querySelector(".rclp-counter[data-rclp-hud]");
    if (mainContainer) {
        if (!mainContainer.closest(".area-coral") || !state || !state.unlocked) {
            isHiddenState = true;
            mainContainer.setAttribute("hidden", "");
        } else {
            mainContainer.removeAttribute("hidden");
        }
        syncCoralHudLayout();
    }
    
    containers.forEach(container => {
        const bar = container.querySelector(".rclp-bar");
        const fill = container.querySelector(".rclp-bar__fill");
        const levelValue = container.querySelector(".rclp-level-value");
        const progress = container.querySelector("[data-rclp-progress]");
        
        // Clones inside the merchant panel shouldn't be hidden based on the .area-coral rule,
        // but they should be hidden if the system is fully locked.
        if (!container.hasAttribute("data-rclp-hud")) {
            if (!state || !state.unlocked) {
                container.setAttribute("hidden", "");
            } else {
                container.removeAttribute("hidden");
            }
        }

        if (!state || !state.unlocked) {
            if (fill) {
                fill.style.setProperty("--rclp-fill", "0%");
                fill.style.width = "0%";
            }
            if (levelValue) setHtmlOrText(levelValue, "0");
            if (progress) {
                const reqHtml = formatNumber(BigNum.fromInt(10));
                setHtmlOrText(
                    progress,
                    `<span class="rclp-progress-current">0</span><span class="rclp-progress-separator">/</span><span class="rclp-progress-required">${reqHtml}</span><span class="rclp-progress-suffix">RCLP</span>`
                );
            }
            if (bar) {
                bar.setAttribute("aria-valuenow", "0");
                bar.setAttribute("aria-valuetext", `0 / 10 RCLP`);
            }
            return;
        }

        const requirement = getRclpRequirement();
        
        let ratio = 0;
        if (!requirement.isZero?.() && state.rclpProg) {
            ratio = Number(state.rclpProg.div(requirement).toScientific?.() ?? "0");
        }
        ratio = Math.min(1, Math.max(0, ratio));
        
        const pct = `${(ratio * 100).toFixed(2)}%`;
        if (fill) {
            fill.style.setProperty("--rclp-fill", pct);
            fill.style.width = pct;
        }
        if (levelValue) {
            setHtmlOrText(levelValue, formatNumber(state.rclpLevel));
        }
        if (progress) {
            const currentHtml = formatNumber(state.rclpProg);
            const reqHtml = formatNumber(requirement);
            setHtmlOrText(
                progress,
                `<span class="rclp-progress-current">${currentHtml}</span><span class="rclp-progress-separator">/</span><span class="rclp-progress-required">${reqHtml}</span><span class="rclp-progress-suffix">RCLP</span>`
            );
        }
        if (bar) {
            bar.setAttribute("aria-valuenow", (ratio * 100).toFixed(2));
            const currPlain = stripHtml(formatNumber(state.rclpProg));
            const reqPlain = stripHtml(formatNumber(requirement));
            bar.setAttribute("aria-valuetext", `${currPlain} / ${reqPlain} RCLP`);
        }
    });
}

export function initRclpSystem() {
    updateRclpHud();
    return getRclpState();
}

if (typeof window !== "undefined") {
    window.addEventListener('ccc:rclp:progress', updateRclpHud);
    window.addEventListener('ccc:rclp:levelup', updateRclpHud);
    window.addEventListener('ccc:rclp:unlocked', updateRclpHud);
    window.addEventListener('saveSlot:change', updateRclpHud);
    window.addEventListener('ccc:areaChanged', updateRclpHud);
    
    // Initial call after DOM loads or scripts execute might be needed
    setTimeout(() => {
        updateRclpHud();
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) {
            new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.attributeName === "class") {
                        updateRclpHud();
                    }
                }
            }).observe(gameRoot, { attributes: true });
        }
    }, 100);
}
