import { BigNum, bigNumFromLog10, approxLog10BigNum } from "../util/bigNum.js";
import { getActiveSlot, isStorageKeyLocked } from "../util/storage.js";
import { lsGetItem, lsSetItem } from "../main.js";
import { E, levelBigNumToNumber } from "./upgrades.js";

let gclpStateCache = null;
let cachedGclpSlot = null;

if (typeof window !== "undefined") {
    window.addEventListener("saveSlot:change", () => {
        gclpStateCache = null;
        cachedGclpSlot = null;
    });
}

function ensureState() {
    const slot = getActiveSlot();
    if (slot == null) return null;
    if (gclpStateCache && cachedGclpSlot === slot) return gclpStateCache;
    
    let state = {
        unlocked: false,
        gclpLevel: BigNum.fromInt(0),
        gclpProg: BigNum.fromInt(0),
    };
    
    try {
        const raw = lsGetItem(`ccc:gclpSystem:${slot}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed) {
                state.unlocked = !!parsed.unlocked;
                if (parsed.gclpLevel) state.gclpLevel = BigNum.fromAny(parsed.gclpLevel);
                if (parsed.gclpProg) state.gclpProg = BigNum.fromAny(parsed.gclpProg);
            }
        }
    } catch {}
    
    gclpStateCache = state;
    cachedGclpSlot = slot;
    return state;
}

function saveState(state) {
    const slot = getActiveSlot();
    if (slot == null) return;
    try {
        const payload = {
            unlocked: state.unlocked,
            gclpLevel: state.gclpLevel.toScientific(6),
            gclpProg: state.gclpProg.toScientific(6)
        };
        lsSetItem(`ccc:gclpSystem:${slot}`, JSON.stringify(payload));
    } catch {}
}

export function isGclpSystemUnlocked() {
    const slot = getActiveSlot();
    return slot != null && lsGetItem(`ccc:colorShiftFirstGreen:${slot}`) === "1";
}

export function unlockGclpSystem() {
    const state = ensureState();
    if (!state) return;
    
    const slot = getActiveSlot();
    if (slot != null && lsGetItem(`ccc:colorShiftFirstGreen:${slot}`) !== "1") {
        lsSetItem(`ccc:colorShiftFirstGreen:${slot}`, "1");
        state.unlocked = true;
        saveState(state);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('ccc:gclp:unlocked'));
            window.dispatchEvent(new CustomEvent("unlock:change", { detail: { key: "gclp", slot } }));
        }
    } else if (!state.unlocked) {
        state.unlocked = true;
        saveState(state);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('ccc:gclp:unlocked'));
        }
    }
}

export function getGclpState() {
    return ensureState();
}

function computeGclpRequirement(levelBn) {
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

export function getGclpRequirement() {
    const state = ensureState();
    if (!state) return BigNum.fromInt(10);
    return computeGclpRequirement(state.gclpLevel);
}

export function addGclp(amountBn) {
    const state = ensureState();
    if (!state) return;
    
    const slot = getActiveSlot();
    const progressLocked = isStorageKeyLocked(`ccc:gclpProgress:${slot}`);
    const levelLocked = isStorageKeyLocked(`ccc:gclLevel:${slot}`);

    if (progressLocked && levelLocked) return;

    if (!progressLocked) {
        state.gclpProg = state.gclpProg.add(amountBn);
    }
    
    let req = computeGclpRequirement(state.gclpLevel);
    let levelsGainedBn = BigNum.fromInt(0);
    let leveledUp = false;
    
    if (!levelLocked && !progressLocked && state.gclpProg.cmp(req) >= 0) {
        const getLogForLevel = (levelNum) => {
            let totalLog = 1 + levelNum * Math.log10(2);
            if (levelNum > 1e12) {
                const softcapDelta = levelNum - 1e12;
                totalLog += 5 * Math.exp(2.36034e-10 * softcapDelta);
            }
            return totalLog;
        };

        const currentProgressLog = approxLog10BigNum(state.gclpProg);
        const reqLog = approxLog10BigNum(req);

        if (currentProgressLog - reqLog > 2) {
            const baseLevelBn = state.gclpLevel;
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
                        state.gclpLevel = state.gclpLevel.add(safeGainBn);
                        levelsGainedBn = levelsGainedBn.add(safeGainBn);
                        req = computeGclpRequirement(state.gclpLevel);
                        leveledUp = true;
                    }
                }
            }
        }
        
        let guard = 0;
        const limit = 500;
        while (state.gclpProg.cmp(req) >= 0 && guard < limit) {
            if (state.gclpProg.inf || req.inf) break;
            
            state.gclpProg = state.gclpProg.sub(req);
            state.gclpLevel = state.gclpLevel.add(1);
            levelsGainedBn = levelsGainedBn.add(1);
            req = computeGclpRequirement(state.gclpLevel);
            leveledUp = true;
            guard++;
        }

        if (state.gclpLevel && typeof state.gclpLevel.cmp === "function" && state.gclpLevel.cmp(4.5e12) >= 0) {
            state.gclpLevel = BigNum.fromAny("Infinity");
            state.gclpProg = BigNum.fromAny("Infinity");
            req = computeGclpRequirement(state.gclpLevel);
        }
    }
    
    saveState(state);
    
    if (typeof window !== "undefined") {
        const detail = {
            delta: amountBn,
            levelsGained: levelsGainedBn
        };
        window.dispatchEvent(new CustomEvent('ccc:gclp:progress', { detail }));
        window.dispatchEvent(
            new CustomEvent("stat:change", {
                detail: { key: "gclp", delta: amountBn, progress: state.gclpProg },
            })
        );
        
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.gclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "gclp",
                    level: state.gclpLevel,
                    progress: state.gclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: leveledUp
                },
            })
        );
    }
}

export function getGclpMultiplier() {
    try {
        const state = getGclpState();
        if (state && state.gclpLevel) {
            const numLevel = Math.max(0, Number(state.gclpLevel.toString()));
            let effect = E.powPerLevel(2)(numLevel);
            return effect instanceof BigNum ? effect : BigNum.fromAny(effect);
        }
    } catch {}
    return BigNum.fromInt(1);
}

export function applyGclpState(newState) {
    const state = ensureState();
    if (!state) return;
    if (newState.unlocked) unlockGclpSystem();
    let nextLevel = newState.gclpLevel !== undefined ? newState.gclpLevel : state.gclpLevel;
    let nextProgress = newState.gclpProg !== undefined ? newState.gclpProg : state.gclpProg;

    const levelIsFinite = nextLevel && !nextLevel.inf;
    const progressIsFinite = nextProgress && !nextProgress.inf;

    if (!levelIsFinite && progressIsFinite && newState.gclpLevel !== undefined) {
        nextProgress = BigNum.fromAny("Infinity");
    } else if (!progressIsFinite && levelIsFinite && newState.gclpProg !== undefined) {
        nextLevel = BigNum.fromAny("Infinity");
    } else if (newState.gclpLevel !== undefined || newState.gclpProg !== undefined) {
        if (levelIsFinite && !progressIsFinite) {
            if (newState.gclpLevel !== undefined) {
                nextProgress = BigNum.fromInt(0);
            }
        } else if (progressIsFinite && !levelIsFinite) {
            if (newState.gclpProg !== undefined) {
                nextLevel = BigNum.fromInt(0);
            }
        }
    }
    
    state.gclpLevel = nextLevel;
    state.gclpProg = nextProgress;
    saveState(state);
    
    if (typeof window !== "undefined") {
        let req = computeGclpRequirement(state.gclpLevel);
        let ratio = 0;
        if (req && !req.isZero?.()) {
            const ratioBn = state.gclpProg.div(req);
            ratio = Number(ratioBn.toScientific?.() ?? "0");
        }
        window.dispatchEvent(
            new CustomEvent("level:change", {
                detail: {
                    prefix: "gclp",
                    level: state.gclpLevel,
                    progress: state.gclpProg,
                    requirement: req,
                    isUnlocked: state.unlocked,
                    ratio: Math.min(1, Math.max(0, ratio)),
                    leveledUp: true
                },
            })
        );
        window.dispatchEvent(new CustomEvent('ccc:gclp:progress', { detail: { delta: BigNum.fromInt(0), levelsGained: BigNum.fromInt(0) } }));
    }
}

if (typeof window !== "undefined") {
    window.gclpSystem = {
        initGclpSystem,
        getGclpMultiplier,
        getGclpState,
        getGclpRequirement,
        isGclpSystemUnlocked,
        unlockGclpSystem,
        addGclp
    };
    // Also support cccGclpSystem in case offlinePanel checks for it
    window.cccGclpSystem = window.gclpSystem;
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
    hudRefs.container = document.querySelector(".gclp-counter[data-gclp-hud]");
    if (!hudRefs.container) return false;
    hudRefs.bar = hudRefs.container.querySelector(".gclp-bar");
    hudRefs.fill = hudRefs.container.querySelector(".gclp-bar__fill");
    hudRefs.levelValue = hudRefs.container.querySelector(".gclp-level-value");
    hudRefs.progress = hudRefs.container.querySelector("[data-gclp-progress]");
    return true;
}

import { formatNumber } from "../util/numFormat.js";
import { setHtmlOrText, stripHtml } from "../util/uiHelpers.js";
import { syncCoralHudLayout } from "../ui/hudLayout.js";

export function updateGclpHud() {
    const containers = document.querySelectorAll(".gclp-counter");
    if (!containers.length) return;
    
    let isHiddenState = false;
    
    const state = ensureState();
    const slot = getActiveSlot();
    const hasFirstShift = slot != null && lsGetItem(`ccc:colorShiftFirstGreen:${slot}`) === "1";
    
    const mainContainer = document.querySelector(".gclp-counter[data-gclp-hud]");
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
        const bar = container.querySelector(".gclp-bar");
        const fill = container.querySelector(".gclp-bar__fill");
        const levelValue = container.querySelector(".gclp-level-value");
        const progress = container.querySelector("[data-gclp-progress]");
        
        if (!container.hasAttribute("data-gclp-hud")) {
            if (!state || !hasFirstShift) {
                container.setAttribute("hidden", "");
            } else {
                container.removeAttribute("hidden");
            }
        }
        
        if (!state || !hasFirstShift) {
            if (fill) {
                fill.style.setProperty("--gclp-fill", "0%");
                fill.style.width = "0%";
            }
            if (levelValue) setHtmlOrText(levelValue, "0");
            if (progress) {
                const reqHtml = formatNumber(BigNum.fromInt(10));
                setHtmlOrText(
                    progress,
                    `<span class="gclp-progress-current">0</span><span class="gclp-progress-separator">/</span><span class="gclp-progress-required">${reqHtml}</span><span class="gclp-progress-suffix">GCLP</span>`
                );
            }
            if (bar) {
                bar.setAttribute("aria-valuenow", "0");
                bar.setAttribute("aria-valuetext", `0 / 10 GCLP`);
            }
            return;
        }
        
        const requirement = getGclpRequirement();
        
        let ratio = 0;
        if (!requirement.isZero?.() && state.gclpProg) {
            ratio = Number(state.gclpProg.div(requirement).toScientific?.() ?? "0");
        }
        ratio = Math.min(1, Math.max(0, ratio));
        
        const pct = `${(ratio * 100).toFixed(2)}%`;
        if (fill) {
            fill.style.setProperty("--gclp-fill", pct);
            fill.style.width = pct;
        }
        if (levelValue) {
            setHtmlOrText(levelValue, formatNumber(state.gclpLevel));
        }
        if (progress) {
            const currentHtml = formatNumber(state.gclpProg);
            const reqHtml = formatNumber(requirement);
            setHtmlOrText(
                progress,
                `<span class="gclp-progress-current">${currentHtml}</span><span class="gclp-progress-separator">/</span><span class="gclp-progress-required">${reqHtml}</span><span class="gclp-progress-suffix">GCLP</span>`
            );
        }
        if (bar) {
            bar.setAttribute("aria-valuenow", (ratio * 100).toFixed(2));
            const currPlain = stripHtml(formatNumber(state.gclpProg));
            const reqPlain = stripHtml(formatNumber(requirement));
            bar.setAttribute("aria-valuetext", `${currPlain} / ${reqPlain} GCLP`);
        }
    });
}

export function initGclpSystem() {
    updateGclpHud();
    return getGclpState();
}

if (typeof window !== "undefined") {
    window.addEventListener('ccc:gclp:progress', updateGclpHud);
    window.addEventListener('ccc:gclp:levelup', updateGclpHud);
    window.addEventListener('ccc:gclp:unlocked', updateGclpHud);
    window.addEventListener('saveSlot:change', updateGclpHud);
    window.addEventListener('ccc:areaChanged', updateGclpHud);
    window.addEventListener('unlock:change', (e) => {
        if (e.detail?.key === 'gclp') updateGclpHud();
    });
    
    // Initial call after DOM loads or scripts execute might be needed
    setTimeout(() => {
        updateGclpHud();
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) {
            new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.attributeName === "class") {
                        updateGclpHud();
                    }
                }
            }).observe(gameRoot, { attributes: true });
        }
    }, 100);
}
