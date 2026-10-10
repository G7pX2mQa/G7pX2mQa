import { lsGetItem, lsSetItem } from "../../main.js";
import { syncCoinMultiplierWithXpLevel } from "../../game/xpSystem.js";
import { getActiveSlot } from "../../util/storage.js";
import { playAudio } from "../../util/audioManager.js";
import { getCoralColorMode, getNextCoralColor, setCoralColorMode } from "../../game/coralColorMode.js";
import { getLevelNumber } from "../../game/upgrades.js";
import { AUTOMATION_AREA_KEY, CORAL_REEF_EAC_ID } from "../../game/automationUpgrades.js";

const sk = (base) => base + ":" + (getActiveSlot() ?? "default");

let lastShiftTime = 0;

export function updateColorShiftVisibility() {
    const coralOverlayEl = document.getElementById("coral-overlay");
    if (!coralOverlayEl) return;
    
    let isCopperCompleted = false;
    try {
        isCopperCompleted = lsGetItem(sk("ccc:collapseChallengeCompleted:copper")) === "1" || lsGetItem(`ccc:collapseChallengeCompleted:copper:${getActiveSlot() ?? "default"}`) === "1";
    } catch {}

    const tabs = coralOverlayEl.querySelector(".merchant-tabs");
    const panelsWrap = coralOverlayEl.querySelector(".merchant-panels");
    
    if (!tabs || !panelsWrap) return;
    
    let tabCsBtn = tabs.querySelector('[data-tab="colorshift"]');
    let panelColorShift = panelsWrap.querySelector('#coral-panel-colorshift');
    
    if (!tabCsBtn) {
        tabCsBtn = document.createElement("button");
        tabCsBtn.type = "button";
        tabCsBtn.className = "merchant-tab";
        tabCsBtn.dataset.tab = "colorshift";
        
        panelColorShift = document.createElement("section");
        panelColorShift.className = "merchant-panel color-shift-container";
        panelColorShift.id = "coral-panel-colorshift";
        
        const card = document.createElement("div");
        card.className = "color-shift-card";
        
        const layout = document.createElement("div");
        layout.className = "color-shift-layout";
        
        const header = document.createElement("header");
        header.className = "color-shift-header";
        
        const title = document.createElement("h3");
        title.className = "color-shift-title";
        title.textContent = "Color Shift";
        
        header.appendChild(title);
        
        const contentArea = document.createElement("div");
        contentArea.className = "color-shift-content";
        
        const modeDesc = document.createElement("p");
        modeDesc.className = "color-shift-mode-desc";
        
        const desc = document.createElement("p");
        desc.className = "color-shift-desc";
        desc.textContent = "Shifting the Color resets nothing";
        
        const firstTimeText = document.createElement("div");
        firstTimeText.className = "color-shift-first-time";
        firstTimeText.innerHTML = "Color Shifting for the first time will unlock Green Coral Level and new Shop upgrades<br>More information about Green Coral Level can be found post-shift";
        
        const shiftBtnWrap = document.createElement("div");
        shiftBtnWrap.className = "color-shift-actions";
        
        const shiftBtn = document.createElement("button");
        shiftBtn.className = "color-shift-btn";
        shiftBtn.innerHTML = '<span class="color-shift-btn-text">Shift</span>';
        
        shiftBtnWrap.appendChild(shiftBtn);
        
        contentArea.appendChild(modeDesc);
        contentArea.appendChild(desc);
        contentArea.appendChild(firstTimeText);
        contentArea.appendChild(shiftBtnWrap);
        
        layout.appendChild(header);
        layout.appendChild(contentArea);
        
        card.appendChild(layout);
        panelColorShift.appendChild(card);
        
        tabs.appendChild(tabCsBtn);
        panelsWrap.appendChild(panelColorShift);
        
        renderColorShiftCard(card, firstTimeText);
        
        // Tab switching logic
        tabCsBtn.addEventListener("click", () => {
            if (tabCsBtn.classList.contains("is-locked")) return;
            const allTabs = tabs.querySelectorAll(".merchant-tab");
            const allPanels = panelsWrap.querySelectorAll(".merchant-panel");
            allTabs.forEach((t) => t.classList.remove("is-active"));
            allPanels.forEach((p) => p.classList.remove("is-active"));
            tabCsBtn.classList.add("is-active");
            panelColorShift.classList.add("is-active");
            
            // Re-render card when opened
            renderColorShiftCard(card, firstTimeText);
        });
        
        // Shift logic
        shiftBtn.addEventListener("click", () => {
            const now = Date.now();
            if (now - lastShiftTime < 50) return; // 50ms cooldown
            lastShiftTime = now;
            
            const slot = getActiveSlot();
            if (slot == null) return;
            
            playAudio("sounds/color_shift.ogg", 0.8, false);
            
            try {
                if (typeof window.invalidateEffectsCache === "function") {
                    window.invalidateEffectsCache();
                }
                if (typeof syncCoinMultiplierWithXpLevel === "function") {
                    syncCoinMultiplierWithXpLevel(true);
                }
            } catch {}
            
            // Advance Color Mode
            const currentMode = getCoralColorMode(slot);
            const nextMode = getNextCoralColor(currentMode);
            setCoralColorMode(nextMode, slot);
            
            if (nextMode === "green") {
                lsSetItem(sk("ccc:colorShiftFirstGreen"), "1");
                window.gclpSystem?.unlockGclpSystem?.();
            } else if (nextMode === "blue") {
                lsSetItem(sk("ccc:colorShiftFirstBlue"), "1");
            }
            
            if (window.coralSpawner) {
                window.coralSpawner.setMode(nextMode);
            }
            
            // Re-render
            renderColorShiftCard(card, firstTimeText);
        });
    } else {
        const card = panelColorShift.querySelector(".color-shift-card");
        const firstTimeText = panelColorShift.querySelector(".color-shift-first-time");
        if (card && firstTimeText) {
            renderColorShiftCard(card, firstTimeText);
        }
    }
    
    if (tabCsBtn && panelColorShift) {
        const targetText = isCopperCompleted ? "Color Shift" : "???";
        const targetTitle = isCopperCompleted ? "Color Shift" : "???";
        
        if (tabCsBtn.textContent !== targetText) tabCsBtn.textContent = targetText;
        if (tabCsBtn.title !== targetTitle) tabCsBtn.title = targetTitle;
        
        tabCsBtn.classList.toggle("is-locked", !isCopperCompleted);
        
        tabCsBtn.style.display = "";
        
        if (!isCopperCompleted && tabCsBtn.classList.contains("is-active")) {
            const dlgTab = tabs.querySelector('[data-tab="dialogue"]');
            if (dlgTab) {
                dlgTab.click();
            }
        }
    }
}

function renderColorShiftCard(card, firstTimeText) {
    const slot = getActiveSlot();
    const mode = getCoralColorMode(slot);
    
    card.className = `color-shift-card is-${mode}`;
    
    if (mode === "red" && lsGetItem(sk("ccc:colorShiftFirstGreen")) !== "1") {
        firstTimeText.innerHTML = "Color Shifting for the first time will unlock Green Coral Level and new Shop upgrades<br>More information about Green Coral Level can be found post-shift";
        firstTimeText.style.color = "";
        firstTimeText.style.display = "";
    } else if (mode === "green" && lsGetItem(sk("ccc:colorShiftFirstBlue")) !== "1") {
        firstTimeText.innerHTML = "Color Shifting for the first time will unlock Blue Coral Level and new Shop upgrades<br>More information about Blue Coral Level can be found post-shift";
        firstTimeText.style.color = "#0000FF";
        firstTimeText.style.display = "";
    } else {
        firstTimeText.style.display = "none";
    }
    
    let currentColorStr = mode.charAt(0).toUpperCase() + mode.slice(1); // "Red", "Green", "Blue"
    let nextColorStr = "Green";
    if (mode === "green") {
        nextColorStr = "Blue";
    } else if (mode === "blue") {
        nextColorStr = "Red";
    }
    
    const modeDesc = card.querySelector(".color-shift-mode-desc");
    if (modeDesc) {
        let actionWord = document.documentElement.classList.contains("is-mobile") ? "tap" : "click";
        
        let breakdown = "";
        if (mode === "red") {
            breakdown = `\n\nRed Coral breakdown:\n- Red Coral Level doubles Coin, XP, Book, Gold, MP, Magic, Gear, Wave, and RP value per level\n- Red Coral value is doubled per atm of Pressure after 31`;
        } else if (mode === "green") {
            breakdown = `\n\nGreen Coral breakdown:\n- Green Coral Level doubles DNA, FP, Scrap, Stone, Copper, Iron, Pure Gold, Diamond, and Emerald value per level\n- Green Coral value is doubled per 2 atms of Pressure after 31`;
        } else if (mode === "blue") {
            breakdown = `\n\nBlue Coral breakdown:\n- Blue Coral Level doubles Ruby, Sapphire, Unobtainium, Prismatium, Core, DP, Crystal, PP, and Rubble value per level\n- Blue Coral value is doubled per 3 atms of Pressure after 31`;
        }
        
        modeDesc.innerText = `You are currently in ${currentColorStr} mode, ${actionWord} the button below to change to ${nextColorStr} mode${breakdown}`;
    }
    
    const shiftBtnText = card.querySelector(".color-shift-btn-text");
    if (shiftBtnText) {
        shiftBtnText.textContent = `Shift`;
    }
    
    const eacLevel = getLevelNumber(AUTOMATION_AREA_KEY, CORAL_REEF_EAC_ID);
    let topCloneWrap = card.querySelector(".color-shift-clone-top");
    let bottomCloneWrap = card.querySelector(".color-shift-clone-bottom");
    
    if (eacLevel >= 1) {
        if (!topCloneWrap) {
            topCloneWrap = document.createElement("div");
            topCloneWrap.className = "color-shift-clone-top";
            const layout = card.querySelector(".color-shift-layout");
            if (layout) layout.appendChild(topCloneWrap);
        }
        topCloneWrap.style.gridRow = "2";
        topCloneWrap.style.alignSelf = "stretch";
        topCloneWrap.style.display = "flex";
        topCloneWrap.style.flexDirection = "column";
        topCloneWrap.style.justifyContent = "flex-end";
        topCloneWrap.style.alignItems = "center";
        topCloneWrap.style.marginTop = "0";
        topCloneWrap.style.marginBottom = "calc(var(--coin-h) - var(--coin-plus-size) + var(--bar-y-nudge) + 20px)";
        topCloneWrap.style.paddingBottom = "0";

        if (!bottomCloneWrap) {
            bottomCloneWrap = document.createElement("div");
            bottomCloneWrap.className = "color-shift-clone-bottom";
            const layout = card.querySelector(".color-shift-layout");
            if (layout) layout.appendChild(bottomCloneWrap);
        }
        const plusSizeVar = mode === "red" ? "var(--rclp-plus-size)" : mode === "green" ? "var(--gclp-plus-size)" : "var(--bclp-plus-size)";
        const barHVar = mode === "red" ? "var(--rclp-bar-h)" : mode === "green" ? "var(--gclp-bar-h)" : "var(--bclp-bar-h)";
        
        bottomCloneWrap.style.gridRow = "4";
        bottomCloneWrap.style.alignSelf = "stretch";
        bottomCloneWrap.style.display = "flex";
        bottomCloneWrap.style.flexDirection = "column";
        bottomCloneWrap.style.justifyContent = "flex-start";
        bottomCloneWrap.style.alignItems = "center";
        bottomCloneWrap.style.marginTop = "0";
        bottomCloneWrap.style.marginBottom = "0";
        bottomCloneWrap.style.paddingTop = "0";
        
        const counterClass = mode === "red" ? ".red-coral-counter" : mode === "green" ? ".green-coral-counter" : ".blue-coral-counter";
        const progressClass = mode === "red" ? ".rclp-counter" : mode === "green" ? ".gclp-counter" : ".bclp-counter";
        
        const realCounter = document.querySelector(`.hud-top ${counterClass}`);
        const realProgress = document.querySelector(progressClass);
        
        if (realCounter && topCloneWrap) {
            topCloneWrap.innerHTML = "";
            const clone = realCounter.cloneNode(true);
            clone.style.display = ""; // remove the old forced flex if present
            topCloneWrap.appendChild(clone);
        }
        
        if (realProgress && bottomCloneWrap) {
            bottomCloneWrap.innerHTML = "";
            const clone = realProgress.cloneNode(true);
            clone.style.display = "flex";
            clone.style.marginTop = `calc(41px - (${plusSizeVar} - ${barHVar}) / 2)`;
            clone.style.marginBottom = "0";
            clone.removeAttribute("id");
            clone.removeAttribute("data-rclp-hud");
            clone.removeAttribute("data-gclp-hud");
            clone.removeAttribute("data-bclp-hud");
            bottomCloneWrap.appendChild(clone);
            
            // Grid items cannot shrink below their physical content box size, so negative margins
            // fail to pull the grid boundary up. Instead, we dynamically shrink the card's native
            // bottom padding so the scroll boundary perfectly matches the top padding symmetry.
            card.style.paddingBottom = `calc(22px - (${plusSizeVar} - ${barHVar}) / 2)`;
        }
    } else {
        if (topCloneWrap) topCloneWrap.remove();
        if (bottomCloneWrap) bottomCloneWrap.remove();
        card.style.paddingBottom = "";
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("unlock:change", (e) => {
        if (e.detail?.key === "gclp") {
            const card = document.querySelector("#coral-panel-colorshift .color-shift-card");
            const firstTimeText = document.querySelector("#coral-panel-colorshift .color-shift-first-time");
            if (card && firstTimeText) {
                renderColorShiftCard(card, firstTimeText);
            }
        }
    });
}

