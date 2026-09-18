import { lsSetItem, lsGetItem, lsRemoveItem } from "../../main.js";
import { getActiveSlot } from "../../util/storage.js";
import { setHtmlOrText } from "../../util/uiHelpers.js";
import { setupDragToClose, ensureCustomScrollbar } from "../shopOverlay.js";
import { UC_MATERIAL_DATA } from "../../game/ucSpawner.js";
import { isBuildingUnlocked } from "./buildingsTab.js";
import { BigNum } from "../../util/bigNum.js";
import { formatNumber } from "../../util/numFormat.js";
import { suspendAllAudioFor } from "../../util/audioManager.js";
import { addExternalCoinMultiplierProvider, syncCoinMultiplierWithXpLevel } from "../../game/xpSystem.js";
import { getLevelNumber, AREA_KEYS } from "../../game/upgrades.js";
import { RUBBLE_AREA_KEY } from "../../game/rubbleUpgrades.js";
import { DNA_AREA_KEY } from "../../game/dnaUpgrades.js";
import { disableGlobalOverlayEsc, enableGlobalOverlayEsc } from "../../util/globalOverlayEsc.js";
import { performCollapseReset } from "./resetTab.js";
const COLLAPSE_UNLOCKED_KEY_BASE = "ccc:collapseUnlocked";

let cachedCollapseUnlockedStates = {};

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
        lsSetItem(`${COLLAPSE_UNLOCKED_KEY_BASE}:${slot}`, value ? "1" : "0");
        cachedCollapseUnlockedStates[slot] = !!value;
    }
}

if (typeof window !== "undefined") {
    const invalidateCollapseCache = () => {
        cachedCollapseUnlockedStates = {};
        cachedChallengeActive = {};
    };
    window.addEventListener("saveSlot:change", invalidateCollapseCache);
    window.addEventListener("unlock:change", invalidateCollapseCache);
}

// --- Collapse Challenge State ---
const CHALLENGE_ACTIVE_KEY_BASE = "ccc:collapseChallengeActive";
let cachedChallengeActive = {};
let coinDebuffUnregister = null;
let rubbleCoinValueUnregister = null;

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
    if (typeof localStorage === "undefined") return null;
    try {
        const val = lsGetItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
        return val && val !== "" ? val : null;
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
        } else {
            lsRemoveItem(`${CHALLENGE_ACTIVE_KEY_BASE}:${slot}`);
            cachedChallengeActive[slot] = false;
        }
        window.dispatchEvent(new CustomEvent("rubbleMode:toggled"));
    } catch {}
}

function registerCoinDebuff() {
    if (coinDebuffUnregister) return; // Already registered
    const divisor = BigNum.fromAny("1e100");
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

function registerRubbleCoinValueProvider() {
    if (rubbleCoinValueUnregister) return; // Already registered
    rubbleCoinValueUnregister = addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
        try {
            const level = getLevelNumber(RUBBLE_AREA_KEY, 1);
            if (level <= 0) return baseMultiplier;
            // 10^level multiplier
            const mult = BigNum.fromAny("1e" + level);
            return baseMultiplier.mulBigNumInteger(mult);
        } catch {
            return baseMultiplier;
        }
    });
}

function unregisterRubbleCoinValueProvider() {
    if (rubbleCoinValueUnregister) {
        rubbleCoinValueUnregister();
        rubbleCoinValueUnregister = null;
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
    if (animate) {
        el.classList.remove("is-active", "is-fading");
        el.classList.add("is-animating");
        el.addEventListener("animationend", () => {
            el.classList.remove("is-animating");
            el.classList.add("is-active");
        }, { once: true });
    } else {
        el.classList.remove("is-animating", "is-fading");
        el.classList.add("is-active");
    }
}

function fadeFractureOverlay() {
    const el = document.getElementById("collapse-fracture-screen");
    if (el) {
        el.classList.add("is-fading");
        el.classList.remove("is-active");
        el.addEventListener("animationend", () => {
            hideFractureOverlay();
        }, { once: true });
    }
}

function hideFractureOverlay() {
    const el = document.getElementById("collapse-fracture-screen");
    if (el) {
        el.classList.remove("is-active", "is-animating", "is-fading");
        el.remove();
    }
}

// --- Challenge Start/Exit ---
function startCollapseChallenge(materialName) {

    // Block interactions to prevent spamming
    blockCollapseInteractions();

    if (fractureTimeout) clearTimeout(fractureTimeout);
    if (fractureFadeTimeout) clearTimeout(fractureFadeTimeout);

    // Set active state
    setCollapseChallengeActive(materialName);

    // Register coin debuff (÷1e100)
    registerCoinDebuff();
    // Register Rubble Coin Value provider
    registerRubbleCoinValueProvider();
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

    // Perform Challenge-tier reset
    try {
        performCollapseReset();
    } catch {}

    // Dispatch event so other systems can react
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collapse:challenge:start", { detail: { material: materialName } }));
    }

    return true;
}

function exitCollapseChallenge(materialName) {
    const capitalName = materialName.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const answer = window.confirm(`Are you sure you want to exit the Challenge of ${capitalName}?`);
    if (!answer) return false;

    if (fractureTimeout) clearTimeout(fractureTimeout);
    if (fractureFadeTimeout) clearTimeout(fractureFadeTimeout);
    unblockCollapseInteractions();

    // Clear active state
    setCollapseChallengeActive(null);

    // Unregister coin debuff
    unregisterCoinDebuff();
    // Unregister Rubble Coin Value provider
    unregisterRubbleCoinValueProvider();
    syncCoinMultiplierWithXpLevel(true);

    // Perform Challenge-tier reset
    try {
        performCollapseReset();
    } catch {}

    // Remove fracture overlay
    hideFractureOverlay();

    // Clear rubble upgrade levels (temporary upgrades)
    try {
        const slot = getActiveSlot();
        if (slot != null) {
            // Clear the rubble coin value upgrade level
            lsRemoveItem(`ccc:upg:${RUBBLE_AREA_KEY}:1:${slot}`);
            // Clear the 4 new Cove HM upgrades
            lsRemoveItem(`ccc:upg:${AREA_KEYS.STARTER_COVE}:24:${slot}`);
            lsRemoveItem(`ccc:upg:${AREA_KEYS.STARTER_COVE}:25:${slot}`);
            lsRemoveItem(`ccc:upg:${AREA_KEYS.STARTER_COVE}:26:${slot}`);
            lsRemoveItem(`ccc:upg:${AREA_KEYS.STARTER_COVE}:27:${slot}`);
            // Clear the 1 new DNA HM upgrade
            lsRemoveItem(`ccc:upg:${DNA_AREA_KEY}:6:${slot}`);
        }
    } catch {}

    // Dispatch event
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("collapse:challenge:exit", { detail: { material: materialName } }));
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
        unregisterRubbleCoinValueProvider();
        syncCoinMultiplierWithXpLevel(true);
        return;
    }
    // Re-register providers
    registerCoinDebuff();
    registerRubbleCoinValueProvider();
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

function openMysteriousChallengeOverlay(mysteriousText) {
    const existingOverlay = document.getElementById("mysterious-challenge-overlay");
    if (existingOverlay && existingOverlay.classList.contains("is-open")) return;
    lastMysteriousOpenTime = Date.now();
    ensureMysteriousChallengeOverlay();
    const overlay = document.getElementById("mysterious-challenge-overlay");
    const sheet = overlay.querySelector(".upg-sheet");
    const header = overlay.querySelector(".upg-header");
    const content = overlay.querySelector(".upg-content");
    const actions = overlay.querySelector(".upg-actions");
    header.innerHTML = `
        <div class="upg-title">Hidden Challenge</div>
    `;
    content.innerHTML = `
        <div class="upg-desc centered lock-desc">${mysteriousText}</div>
    `;
    actions.innerHTML = `
        <button type="button" class="shop-close">Close</button>
    `;
    const closeBtn = actions.querySelector(".shop-close");
    closeBtn.addEventListener("click", closeMysteriousChallengeOverlay);
    openChallengeOverlaySheet(overlay, sheet);
}

function closeMysteriousChallengeOverlay() {
    const overlay = document.getElementById("mysterious-challenge-overlay");
    if (!overlay) return;
    if (overlay.style.pointerEvents === "none") return;
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

function openChallengeOverlay(id) {
    if (overlayEl && overlayEl.classList.contains("is-open")) return;
    lastChallengeOpenTime = Date.now();
    initChallengeOverlay();
    
    const sheet = overlayEl.querySelector(".upg-sheet");
    const header = overlayEl.querySelector(".upg-header");
    const content = overlayEl.querySelector(".upg-content");
    
    const capitalName = id.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    header.innerHTML = `<div class="upg-title">Challenge of ${capitalName}</div>`;
    
    const desc = document.createElement("div");
    desc.className = "collapse-overlay-desc";
    
    const formattedNum = formatNumber(BigNum.fromAny("1e100"));
    
    const baseDescText = `Welcome to Collapse Challenges; there are 10 total Collapse Challenges you must complete
Collapse Challenge completions are permanent (never will be reset) and each completion unlocks something new

The Challenge of ${capitalName}; the first Collapse Challenge
Starting a Collapse Challenge resets everything Compress does as well as Crystals, the Crystal Building, and Pressure/PP
Once you have started this Collapse Challenge, visit the Sell tab for required information to complete it (important)

This first Collapse Challenge will be easy because the Lab is not reset, so recovery will be fast

Effect: Coin value is divided by ${formattedNum}x
Goal: Reach Pressure: 31atm
Reward: An upgrade which unlocks the third area + a new automation upgrade`.trim();

    desc.textContent = baseDescText;

    const btnWrapper = document.createElement("div");
    btnWrapper.className = "collapse-btn-wrapper";
    const actionBtn = document.createElement("button");
    actionBtn.className = "collapse-start-btn";

    // Determine button state
    const challengeActive = isCollapseChallengeActive();
    const activeMat = getActiveCollapseChallengeType();
    const isThisChallengeActive = activeMat === id;

    if (isThisChallengeActive) {
        actionBtn.textContent = `Exit Challenge`;
    } else {
        actionBtn.textContent = `Start Challenge`;
    }

    actionBtn.addEventListener("click", () => {
        if (isCollapseChallengeActive() && getActiveCollapseChallengeType() === id) {
            // Exit
            if (exitCollapseChallenge(id)) {
                actionBtn.textContent = `Start Challenge`;
                actionBtn.blur();
            }
        } else {
            // Start
            if (startCollapseChallenge(id)) {
                actionBtn.blur();
                actionBtn.style.animation = "none";
                setTimeout(() => {
                    const oldText = `Start Challenge`;
                    const newText = `Exit Challenge`;
                    
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

    function updateScrollNotice() {
        if (!actionBtn || !content || !desc) return;
        const currentScroll = content.scrollTop;
        desc.textContent = baseDescText;
        
        // Force reflow
        void content.offsetHeight;
        
        const isEntirelyVisible = content.scrollHeight <= content.clientHeight + 1;
        
        if (!isEntirelyVisible) {
            desc.textContent = `Scroll down further to see everything\n\n${baseDescText}`;
        }
        
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
        const isLocked = !isFirst;
        
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
        
        if (isLocked) {
            const properName = buildingUnlocked ? capitalName : "[Unknown]";
            
            const mysteriousText = `You will know when you are ready to attempt the Challenge of ${properName}`;
            btn.title = "Hidden Challenge";
            btn.addEventListener("click", () => {
                openMysteriousChallengeOverlay(mysteriousText);
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
}
