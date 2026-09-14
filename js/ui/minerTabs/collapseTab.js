import { lsSetItem, lsGetItem, lsRemoveItem } from "../../main.js";
import { getActiveSlot, getActiveCollapseChallenge, setActiveCollapseChallenge, inCollapseChallenge, setInCollapseChallenge, bank } from "../../util/storage.js";
import { setHtmlOrText } from "../../util/uiHelpers.js";
import { setupDragToClose, openShop } from "../shopOverlay.js";
import { IS_MOBILE } from "../../util/platformChecker.js";
import { playAudio, applyAudioDrownEffect, removeAudioDrownEffect, fadeAudioUnderwaterToNormal } from "../../util/audioManager.js";
import { formatNumber } from "../../util/numFormat.js";
import { BigNum } from "../../util/bigNum.js";
import { getSurgeBarLevelKey } from "../merchantTabs/resetTab.js";
import { performCompressReset } from "./resetTab.js";

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
    };
    window.addEventListener("saveSlot:change", invalidateCollapseCache);
    window.addEventListener("unlock:change", invalidateCollapseCache);
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

    const content = document.createElement("div");
    content.className = "merchant-content";

    content.innerHTML = `
        <div class="collapse-main-card">
            <div class="collapse-header">Collapse Challenges</div>
            <div class="collapse-general-desc">
                Entering a Collapse Challenge resets everything Compress does as well as Crystals and the Crystal Building<br>
                While inside a Collapse Challenge, a special currency Rubble is passively generated<br>
                Upgrades that increase Rubble value only appear inside a Collapse Challenge runs and are temporary<br>
                Spend Rubble on powerful upgrades in the Collapse Shop to clear the Collapse Challenge<br>
                The Collapse Shop only appears while actively inside a Collapse Challenge run
            </div>
            
            <div class="collapse-challenges-grid" id="collapse-challenges-grid">
                <!-- Challenge 1 -->
                <div class="collapse-challenge-item">
                    <div class="collapse-challenge-title">Collapse Challenge 1</div>
                    <div class="collapse-section-title">Details</div>
                    <div class="collapse-text-content">
                        CC1 Effect: <strong>Coin value is divided by 1e100x</strong><br>
                        CC1 Goal: <strong>Reach Pressure: 31atm</strong><br>
                        CC1 Reward: <strong>An upgrade which unlocks the third area</strong>
                    </div>
                    
                    <div id="collapse-shop-container-1" style="display: none;">
                        <div class="collapse-shop-btn-container">
                            <div class="collapse-shop-instruction">Click the big brown button below to open the Collapse Shop</div>
                            <button class="btn-collapse-shop" data-action="open-shop">Collapse</button>
                        </div>
                    </div>
                    
                    <div class="collapse-section-title">Recommendations</div>
                    <div class="collapse-text-content">
                        Recommended start: Immediately<br><br>
                        This Collapse Challenge should be started immediately. You will keep your Lab Nodes when starting the Collapse Challenge run, so progressing back to Pressure: 31atm is not actually as hard as it sounds. Remember to buy from the Collapse Shop when you have enough Rubble to do so.
                    </div>
                    
                    <div class="collapse-challenge-action">
                        <button class="btn-enter-challenge" data-challenge="1">Enter Challenge</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Apply mobile text changes if needed
    if (IS_MOBILE) {
        const instr = content.querySelector(".collapse-shop-instruction");
        if (instr) instr.textContent = instr.textContent.replace("Click", "Tap");
    }

    content.addEventListener("click", (e) => {
        if (e.target.dataset.action === "open-shop") {
            openShop("collapse");
        } else if (e.target.dataset.challenge) {
            const challengeNum = parseInt(e.target.dataset.challenge, 10);
            enterCollapseChallenge(challengeNum);
        }
    });

    panel.appendChild(content);

    const grabber = document.createElement("div");
    grabber.className = "merchant-grabber";
    panel.appendChild(grabber);
    
    if (minerSheetEl) {
        setupDragToClose(
            grabber,
            minerSheetEl,
            () => minerOverlayEl && minerOverlayEl.classList.contains("is-open"),
            () => {
                if (minerOverlayEl) minerOverlayEl.classList.remove("is-open");
                if (minerSheetEl) minerSheetEl.style.transform = "";
                if (window.closeMinerOverlay) window.closeMinerOverlay();
            }
        );
    }

    panelsWrapEl.appendChild(panel);

    tabBtn.addEventListener("click", () => {
        if (!isCollapseUnlocked()) return;
        const allTabs = tabsEl.querySelectorAll(".merchant-tab");
        const allPanels = panelsWrapEl.querySelectorAll(".merchant-panel");

        allTabs.forEach((t) => t.classList.remove("is-active"));
        allPanels.forEach((p) => p.classList.remove("is-active"));

        tabBtn.classList.add("is-active");
        panel.classList.add("is-active");
        
        refreshCollapseChallengeUI();
    });

    updateCollapsePanelVisibility(minerSheetEl);
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
        updateCollapsePanelVisibility
    });
}

let isEnteringChallenge = false;
function playCollapseExplosion() {
    // Basic explosion effect inspired by the void altar
    const explosionContainer = document.createElement("div");
    explosionContainer.style.position = "fixed";
    explosionContainer.style.top = "0";
    explosionContainer.style.left = "0";
    explosionContainer.style.width = "100vw";
    explosionContainer.style.height = "100vh";
    explosionContainer.style.pointerEvents = "none";
    explosionContainer.style.zIndex = "999999";
    explosionContainer.style.overflow = "hidden";
    explosionContainer.style.backgroundColor = "rgba(74, 43, 26, 0.5)"; // Dark brown flash
    explosionContainer.style.opacity = "1";
    explosionContainer.style.transition = "opacity 1s ease-out";
    document.body.appendChild(explosionContainer);
    
    // Trigger fade out in the next frame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            explosionContainer.style.opacity = "0";
        });
    });

    setTimeout(() => {
        if (explosionContainer.parentElement) {
            explosionContainer.remove();
        }
    }, 1000);
}

function enterCollapseChallenge(challengeNum) {
    if (isEnteringChallenge) return;
    
    isEnteringChallenge = true;
    
    applyAudioDrownEffect(1.0);
    playCollapseExplosion();
    
    setTimeout(() => {
        const slot = getActiveSlot();
        if (slot == null) {
            isEnteringChallenge = false;
            return;
        }

        // Apply a full reset
        try {
            if (bank.CRYSTALS?.set) bank.CRYSTALS.set(0);
            if (bank.RUBBLE?.set) bank.RUBBLE.set(0);
            
            if (typeof localStorage !== "undefined") {
                lsRemoveItem(`ccc:buildingLevel:crystal:${slot}`);
            }
            if (typeof window !== "undefined") {
                // Set surge to 200
                const surgeKey = getSurgeBarLevelKey(slot);
                lsSetItem(surgeKey, "200");
                window.dispatchEvent(new CustomEvent("surge:level:change", { detail: { slot, level: 200, isCompressReset: true } }));
                window.dispatchEvent(
                    new CustomEvent("level:change", { detail: { prefix: "waves", level: 200, isUnlocked: true } })
                );
                
                // Reset Waves
                if (bank.waves?.set) bank.waves.set(0);

                if (window.resetSystem && typeof window.resetSystem.performCompressReset === "function") {
                    // Try to use compress reset if we wanted to mock it. 
                    // However, doing so manually avoids the confirmation prompt. 
                    // To do applyCombineResetLogic manually we can dispatch an event if needed or rely on the above.
                }
            }
        } catch (e) {
            console.error(e);
        }

        setActiveCollapseChallenge(challengeNum);
        setInCollapseChallenge(true);
        
        isEnteringChallenge = false;
        
        // Refresh UI
        updateCollapsePanelVisibility();
        refreshCollapseChallengeUI();
        removeAudioDrownEffect();
    }, 1000);
}

export function refreshCollapseChallengeUI() {
    const activeChallenge = getActiveCollapseChallenge();
    const shopContainer = document.getElementById("collapse-shop-container-1");
    if (shopContainer) {
        shopContainer.style.display = (activeChallenge === 1 || inCollapseChallenge) ? "block" : "none";
    }
}
