import { lsSetItem, lsGetItem } from "../../main.js";
import { getActiveSlot } from "../../util/storage.js";
import { setHtmlOrText } from "../../util/uiHelpers.js";
import { setupDragToClose } from "../shopOverlay.js";

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

    // Add temporary empty content for now as per requirements
    const emptyText = document.createElement("div");
    emptyText.textContent = "Collapse tab content coming soon.";
    emptyText.className = "collapse-empty-text";
    
    content.appendChild(emptyText);
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
