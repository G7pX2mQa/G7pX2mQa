import { lsGetItem } from "../../main.js";
import { getActiveSlot } from "../../util/storage.js";

const sk = (base) => base + ":" + (getActiveSlot() ?? "default");

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
        panelColorShift.className = "merchant-panel";
        panelColorShift.id = "coral-panel-colorshift";
        const csContent = document.createElement("div");
        csContent.className = "centered";
        csContent.textContent = "Color Shift Content Goes Here (WIP)";
        panelColorShift.appendChild(csContent);
        
        tabs.appendChild(tabCsBtn);
        panelsWrap.appendChild(panelColorShift);
        
        tabCsBtn.addEventListener("click", () => {
            if (tabCsBtn.classList.contains("is-locked")) return;
            const allTabs = tabs.querySelectorAll(".merchant-tab");
            const allPanels = panelsWrap.querySelectorAll(".merchant-panel");
            allTabs.forEach((t) => t.classList.remove("is-active"));
            allPanels.forEach((p) => p.classList.remove("is-active"));
            tabCsBtn.classList.add("is-active");
            panelColorShift.classList.add("is-active");
        });
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
