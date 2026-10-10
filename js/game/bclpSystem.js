import { BigNum, bigNumFromLog10, approxLog10BigNum } from "../util/bigNum.js";
import { getActiveSlot, isStorageKeyLocked } from "../util/storage.js";
import { lsGetItem, lsSetItem } from "../main.js";
import { E, levelBigNumToNumber } from "./upgrades.js";

let bclpStateCache = null;
let cachedBclpSlot = null;

if (typeof window !== "undefined") {
    window.addEventListener("saveSlot:change", () => {
        bclpStateCache = null;
        cachedBclpSlot = null;
    });
}

function ensureState() {
    const slot = getActiveSlot();
    if (slot == null) return null;
    if (bclpStateCache && cachedBclpSlot === slot) return bclpStateCache;
    
    let state = {
        unlocked: false,
        bclpLevel: BigNum.fromInt(0),
        bclpProg: BigNum.fromInt(0),
    };
    
    try {
        const raw = lsGetItem(`ccc:bclpSystem:${slot}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed) {
                state.unlocked = !!parsed.unlocked;
                if (parsed.bclpLevel) state.bclpLevel = BigNum.fromAny(parsed.bclpLevel);
                if (parsed.bclpProg) state.bclpProg = BigNum.fromAny(parsed.bclpProg);
            }
        }
    } catch {}
    
    bclpStateCache = state;
    cachedBclpSlot = slot;
    return state;
}

function saveState(state) {
    const slot = getActiveSlot();
    if (slot == null) return;
    try {
        const payload = {
            unlocked: state.unlocked,
            bclpLevel: state.bclpLevel.toScientific(6),
            bclpProg: state.bclpProg.toScientific(6)
        };
        lsSetItem(`ccc:bclpSystem:${slot}`, JSON.stringify(payload));
    } catch {}
}

export function isBclpSystemUnlocked() {
    const slot = getActiveSlot();
    return slot != null && lsGetItem(`ccc:colorShiftFirstBlue:${slot}`) === "1";
}

export function unlockBclpSystem() {
    const state = ensureState();
    if (!state) return;
    
    const slot = getActiveSlot();
    if (slot != null && lsGetItem(`ccc:colorShiftFirstBlue:${slot}`) !== "1") {
        lsSetItem(`ccc:colorShiftFirstBlue:${slot}`, "1");
        state.unlocked = true;
        saveState(state);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('ccc:bclp:unlocked'));
            window.dispatchEvent(new CustomEvent("unlock:change", { detail: { key: "bclp", slot } }));
        }
    } else if (!state.unlocked) {
        state.unlocked = true;
        saveState(state);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('ccc:bclp:unlocked'));
        }
    }
}

export function getBclpState() {
    return ensureState();
}

function computeBclpRequirement(levelBn) {
    const L = levelBigNumToNumber(levelBn);
    if (!Number.isFinite(L)) return BigNum.fromAny("Infinity");
    
    if (L < 200) {
        return BigNum.fromInt(10).mulBigNumInteger(E.powPerLevel(2)(L));
    }
    
    let totalLog10 = 1 + L * Math.log10(2);
    const softcapStart = 4e12; // 4 Trillion
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

export function getBclpRequirement() {
    const state = ensureState();
    if (!state) return BigNum.fromInt(10);
    return computeBclpRequirement(state.bclpLevel);
}

export function addBclp(amountBn) {
    const state = ensureState();
    if (!state) return;
    
    const slot = getActiveSlot();
    const progressLocked = isStorageKeyLocked(`ccc:bclpProgress:${slot}`);
    const levelLocked = isStorageKeyLocked(`ccc:bclLevel:${slot}`);

    if (progressLocked && levelLocked) return;

    if (!progressLocked) {
        state.bclpProg = state.bclpProg.add(amountBn);
    }
    
    let req = computeBclpRequirement(state.bclpLevel);
    let levelsGainedBn = BigNum.fromInt(0);
    let leveledUp = false;
    
    if (!levelLocked && !progressLocked && state.bclpProg.cmp(req) >= 0) {
        const getLogForLevel = (levelNum) => {
            let totalLog = 1 + levelNum * Math.log10(2);
            if (levelNum > 4e12) {
                const softcapDelta = levelNum - 4e12;
                totalLog += 5 * Math.exp(2.36034e-10 * softcapDelta);
            }
            return totalLog;
        };

        const currentProgressLog = approxLog10BigNum(state.bclpProg);
        const reqLog = approxLog10BigNum(req);

        if (currentProgressLog - reqLog > 2) {
            const baseLevelBn = state.bclpLevel;
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
                        state.bclpLevel = state.bclpLevel.add(safeGainBn);
                        levelsGainedBn = levelsGainedBn.add(safeGainBn);
                        req = computeBclpRequirement(state.bclpLevel);
                        leveledUp = true;
                    }
                }
            }
        }
        
        let guard = 0;
        const limit = 500;
        while (state.bclpProg.cmp(req) >= 0 && guard < limit) {
            if (state.bclpProg.inf || req.inf) break;
            
            state.bclpProg = state.bclpProg.sub(req);
            state.bclpLevel = state.bclpLevel.add(1);
            levelsGainedBn = levelsGainedBn.add(1);
            req = computeBclpRequirement(state.bclpLevel);
            leveledUp = true;
            guard++;
        }

        if (state.bclpLevel && typeof state.bclpLevel.cmp === "function" && state.bclpLevel.cmp(4.5e12) >= 0) {
            state.bclpLevel = BigNum.fromAny("Infinity");
            state.bclpProg = BigNum.fromAny("Infinity");
            req = computeBclpRequirement(state.bclpLevel);
        }
    }
    
    saveState(state);
    
    if (typeof window !== "undefined") {
        const detail = {
            delta: amountBn,
            levelsGained: levelsGainedBn
        };
        window.dispatchEvent(new CustomEvent('ccc:bclp:progress', { detail }));
        window.dispatchEvent(
            new CustomEvent("stat:change", {
                detail: { key: "bclp", delta: amountBn, progress: state.bclpProg },
            })
        );
        
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.bclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "bclp",
                    level: state.bclpLevel,
                    progress: state.bclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: leveledUp
                },
            })
        );
    }
}

export function getBclpMultiplier() {
    try {
        const state = getBclpState();
        if (state && state.bclpLevel) {
            const numLevel = Math.max(0, Number(state.bclpLevel.toString()));
            let effect = E.powPerLevel(2)(numLevel);
            return effect instanceof BigNum ? effect : BigNum.fromAny(effect);
        }
    } catch {}
    return BigNum.fromInt(1);
}

export function applyBclpState(newState) {
    const state = ensureState();
    if (!state) return;
    if (newState.unlocked) unlockBclpSystem();
    let nextLevel = newState.bclpLevel !== undefined ? newState.bclpLevel : state.bclpLevel;
    let nextProgress = newState.bclpProg !== undefined ? newState.bclpProg : state.bclpProg;

    const levelIsFinite = nextLevel && !nextLevel.inf;
    const progressIsFinite = nextProgress && !nextProgress.inf;

    if (!levelIsFinite && progressIsFinite && newState.bclpLevel !== undefined) {
        nextProgress = BigNum.fromAny("Infinity");
    } else if (!progressIsFinite && levelIsFinite && newState.bclpProg !== undefined) {
        nextLevel = BigNum.fromAny("Infinity");
    } else if (newState.bclpLevel !== undefined || newState.bclpProg !== undefined) {
        if (levelIsFinite && !progressIsFinite) {
            if (newState.bclpLevel !== undefined) {
                nextProgress = BigNum.fromInt(0);
            }
        } else if (progressIsFinite && !levelIsFinite) {
            if (newState.bclpProg !== undefined) {
                nextLevel = BigNum.fromInt(0);
            }
        }
    }
    
    state.bclpLevel = nextLevel;
    state.bclpProg = nextProgress;
    saveState(state);
    
    if (typeof window !== "undefined") {
        let req = computeBclpRequirement(state.bclpLevel);
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.bclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "bclp",
                    level: state.bclpLevel,
                    progress: state.bclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: true
                },
            })
        );
        window.dispatchEvent(new CustomEvent('ccc:bclp:progress', { detail: { delta: BigNum.fromInt(0), levelsGained: BigNum.fromInt(0) } }));
    }
}

if (typeof window !== "undefined") {
    window.bclpSystem = {
        initBclpSystem,
        getBclpMultiplier,
        getBclpState,
        getBclpRequirement,
        isBclpSystemUnlocked,
        unlockBclpSystem,
        addBclp
    };
    // Also support cccBclpSystem in case offlinePanel checks for it
    window.cccBclpSystem = window.bclpSystem;
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
    hudRefs.container = document.querySelector(".bclp-counter[data-bclp-hud]");
    if (!hudRefs.container) return false;
    hudRefs.bar = hudRefs.container.querySelector(".bclp-bar");
    hudRefs.fill = hudRefs.container.querySelector(".bclp-bar__fill");
    hudRefs.levelValue = hudRefs.container.querySelector(".bclp-level-value");
    hudRefs.progress = hudRefs.container.querySelector("[data-bclp-progress]");
    return true;
}

import { formatNumber } from "../util/numFormat.js";
import { setHtmlOrText, stripHtml } from "../util/uiHelpers.js";
import { syncCoralHudLayout } from "../ui/hudLayout.js";

export function updateBclpHud() {
    const containers = document.querySelectorAll(".bclp-counter");
    if (!containers.length) return;
    
    let isHiddenState = false;
    
    const state = ensureState();
    const slot = getActiveSlot();
    const hasFirstShift = slot != null && lsGetItem(`ccc:colorShiftFirstBlue:${slot}`) === "1";
    
    const mainContainer = document.querySelector(".bclp-counter[data-bclp-hud]");
    if (mainContainer) {
        if (!mainContainer.closest(".area-coral") || !state || !hasFirstShift) {
            isHiddenState = true;
            mainContainer.setAttribute("hidden", "");
        } else {
            mainContainer.removeAttribute("hidden");
        }
        syncCoralHudLayout();
    }
    
    containers.forEach(container => {
        const bar = container.querySelector(".bclp-bar");
        const fill = container.querySelector(".bclp-bar__fill");
        const levelValue = container.querySelector(".bclp-level-value");
        const progress = container.querySelector("[data-bclp-progress]");
        
        if (!container.hasAttribute("data-bclp-hud")) {
            if (!state || !hasFirstShift) {
                container.setAttribute("hidden", "");
            } else {
                container.removeAttribute("hidden");
            }
        }
        
        if (!state || !hasFirstShift) {
            if (fill) {
                fill.style.setProperty("--bclp-fill", "0%");
                fill.style.width = "0%";
            }
            if (levelValue) setHtmlOrText(levelValue, "0");
            if (progress) {
                const reqHtml = formatNumber(BigNum.fromInt(10));
                setHtmlOrText(
                    progress,
                    `<span class="bclp-progress-current">0</span><span class="bclp-progress-separator">/</span><span class="bclp-progress-required">${reqHtml}</span><span class="bclp-progress-suffix">BCLP</span>`
                );
            }
            if (bar) {
                bar.setAttribute("aria-valuenow", "0");
                bar.setAttribute("aria-valuetext", `0 / 10 BCLP`);
            }
            return;
        }
        
        const requirement = getBclpRequirement();
        
        let ratio = 0;
        if (!requirement.isZero?.() && state.bclpProg) {
            ratio = Number(state.bclpProg.div(requirement).toScientific?.() ?? "0");
        }
        ratio = Math.min(1, Math.max(0, ratio));
        
        const pct = `${(ratio * 100).toFixed(2)}%`;
        if (fill) {
            fill.style.setProperty("--bclp-fill", pct);
            fill.style.width = pct;
        }
        if (levelValue) {
            setHtmlOrText(levelValue, formatNumber(state.bclpLevel));
        }
        if (progress) {
            const currentHtml = formatNumber(state.bclpProg);
            const reqHtml = formatNumber(requirement);
            setHtmlOrText(
                progress,
                `<span class="bclp-progress-current">${currentHtml}</span><span class="bclp-progress-separator">/</span><span class="bclp-progress-required">${reqHtml}</span><span class="bclp-progress-suffix">BCLP</span>`
            );
        }
        if (bar) {
            bar.setAttribute("aria-valuenow", (ratio * 100).toFixed(2));
            const currPlain = stripHtml(formatNumber(state.bclpProg));
            const reqPlain = stripHtml(formatNumber(requirement));
            bar.setAttribute("aria-valuetext", `${currPlain} / ${reqPlain} BCLP`);
        }
    });
}

export function initBclpSystem() {
    updateBclpHud();
    return getBclpState();
}

if (typeof window !== "undefined") {
    window.addEventListener('ccc:bclp:progress', updateBclpHud);
    window.addEventListener('ccc:bclp:levelup', updateBclpHud);
    window.addEventListener('ccc:bclp:unlocked', updateBclpHud);
    window.addEventListener('saveSlot:change', updateBclpHud);
    window.addEventListener('ccc:areaChanged', updateBclpHud);
    window.addEventListener('unlock:change', (e) => {
        if (e.detail?.key === 'bclp') updateBclpHud();
    });
    
    // Initial call after DOM loads or scripts execute might be needed
    setTimeout(() => {
        updateBclpHud();
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) {
            new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.attributeName === "class") {
                        updateBclpHud();
                    }
                }
            }).observe(gameRoot, { attributes: true });
        }
    }, 100);
}

