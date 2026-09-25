// js/ui/coralTabs/dlgTab.js
import { lsSetItem, lsGetItem } from "../../main.js";
import { getActiveSlot } from "../../util/storage.js";
import { updateShopOverlay, setupDragToClose } from "../shopOverlay.js";
import { muteGameAudio, unmuteGameAudio } from "../../util/audioManager.js";
import {
    setTypingActive,
    stopTypingSfx,
    DialogueEngine,
    ensureMerchantScrollbar,
    setDelveElements,
    openDelveOverlay,
    MYSTERIOUS_ICON_SRC,
} from "../delveCore.js";

const CORAL_MET_KEY_BASE = "ccc:coral_reefMet";
export const CORAL_MET_EVENT = "ccc:coral:met";
const sk = (base) => base + ":" + (getActiveSlot() ?? "default");

export function hasMetCoral() {
    try {
        return lsGetItem(sk(CORAL_MET_KEY_BASE)) === "1";
    } catch {
        return false;
    }
}

let coralOverlayEl = null;
let coralSheetEl = null;

function ensureCoralOverlay() {
    if (coralOverlayEl) return;
    coralSheetEl = document.createElement("div");
    coralOverlayEl = document.createElement("div");
    coralOverlayEl.className = "merchant-overlay is-coral";
    coralOverlayEl.id = "coral-overlay";
    coralOverlayEl.setAttribute("inert", "");
    coralSheetEl.className = "merchant-sheet";
    coralSheetEl.setAttribute("role", "dialog");
    coralSheetEl.setAttribute("aria-modal", "false");
    coralSheetEl.setAttribute("aria-label", "???");
    const grabber = document.createElement("div");
    grabber.className = "merchant-grabber";
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
    
    const header = document.createElement("header");
    header.className = "merchant-header";
    header.innerHTML = `
        <div class="merchant-title">???</div>
        <div class="merchant-line" aria-hidden="true"></div>
    `;
    
    const content = document.createElement("div");
    content.className = "merchant-content";
    const tabs = document.createElement("div");
    tabs.className = "merchant-tabs";
    tabs.setAttribute("role", "tablist");
    const panelsWrap = document.createElement("div");
    panelsWrap.className = "merchant-panels";
    
    const panelDialogue = document.createElement("section");
    panelDialogue.className = "merchant-panel is-active";
    panelDialogue.id = "coral-panel-dialogue";
    
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "merchant-tab is-active";
    tabBtn.dataset.tab = "dialogue";
    tabBtn.textContent = "Dialogue";
    tabBtn.title = "Dialogue";
    tabs.appendChild(tabBtn);
    panelsWrap.appendChild(panelDialogue);
    content.append(tabs, panelsWrap);
    
    tabBtn.addEventListener("click", () => {
        const allTabs = tabs.querySelectorAll(".merchant-tab");
        const allPanels = panelsWrap.querySelectorAll(".merchant-panel");
        allTabs.forEach((t) => t.classList.remove("is-active"));
        allPanels.forEach((p) => p.classList.remove("is-active"));
        tabBtn.classList.add("is-active");
        panelDialogue.classList.add("is-active");
    });
    
    const actions = document.createElement("footer");
    actions.className = "merchant-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "merchant-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCoral();
    });
    actions.appendChild(closeBtn);
    
    const firstChat = document.createElement("div");
    firstChat.className = "merchant-firstchat";
    firstChat.innerHTML = `
        <div class="merchant-firstchat__card">
            <div class="merchant-firstchat__row">
                <img src="${MYSTERIOUS_ICON_SRC}" alt="???" class="merchant-firstchat__icon" draggable="false">
                <div class="merchant-firstchat__info">
                    <div class="merchant-firstchat__name">???</div>
                    <div class="merchant-firstchat__text" id="coral-first-line"></div>
                </div>
            </div>
            <div class="merchant-firstchat__choices" id="coral-first-choices"></div>
        </div>
    `;
    
    coralSheetEl.append(grabber, header, content, actions, firstChat);
    coralOverlayEl.appendChild(coralSheetEl);
    document.body.appendChild(coralOverlayEl);
    setupDragToClose(
        grabber,
        coralSheetEl,
        () => coralOverlayEl && coralOverlayEl.classList.contains("is-open"),
        closeCoral
    );
    coralOverlayEl.addEventListener("click", (e) => {
        if (e.target === coralOverlayEl) closeCoral();
    });
}

function renderDialogueList() {
    const panel = coralOverlayEl.querySelector("#coral-panel-dialogue");
    panel.innerHTML = "";
    const asocialMsg = document.createElement("div");
    asocialMsg.className = "coral-no-merchant-message";
    asocialMsg.textContent = "There's nobody here...";
    panel.appendChild(asocialMsg);
}

function runFirstMeet() {
    muteGameAudio();
    const fc = coralOverlayEl.querySelector(".merchant-firstchat");
    const textEl = fc.querySelector("#coral-first-line");
    const rowEl = fc.querySelector(".merchant-firstchat__row");
    const cardEl = fc.querySelector(".merchant-firstchat__card");
    const choicesEl = fc.querySelector("#coral-first-choices");
    
    const blockEsc = (e) => {
        if (e.key === "Escape") {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    document.addEventListener("keydown", blockEsc, { capture: true });
    
    const CORAL_FIRST_SCRIPT = {
        start: "node1",
        nodes: {
            node1: {
                type: "line",
                say: "",
                stallMs: 5000,
                next: "choice1"
            },
            choice1: {
                type: "choice",
                options: [
                    { label: "Does this area not have a merchant?", to: "end" }
                ]
            }
        }
    };
    
    const engine = new DialogueEngine({
        textEl,
        choicesEl,
        skipTargets: [], // Cannot skip in any way
        pauseMultiplier: 1,
        onEnd: () => {
            unmuteGameAudio();
            document.removeEventListener("keydown", blockEsc, { capture: true });
            try {
                if (getActiveSlot() != null) {
                    lsSetItem(sk(CORAL_MET_KEY_BASE), "1");
                }
            } catch {}
            try {
                window.dispatchEvent(new Event(CORAL_MET_EVENT));
            } catch {}
            fc.classList.remove("is-visible");
            coralOverlayEl.classList.remove("firstchat-active");
        }
    });
    engine.load(CORAL_FIRST_SCRIPT);
    engine.start();
}



export function openCoral() {
    ensureCoralOverlay();
    setDelveElements(coralOverlayEl, coralSheetEl);
    renderDialogueList();
    
    let met = false;
    try {
        met = lsGetItem(sk(CORAL_MET_KEY_BASE)) === "1";
    } catch {
        met = false;
    }
    
    if (!met) {
        coralOverlayEl.classList.add("firstchat-instant");
    }
    
    stopTypingSfx();
    setTypingActive(false);
    
    if (!met) {
        coralOverlayEl.classList.add("firstchat-active");
        const fc = coralOverlayEl.querySelector(".merchant-firstchat");
        if (fc) fc.classList.add("is-visible");
        runFirstMeet();
    }
    
    openDelveOverlay(coralOverlayEl, coralSheetEl);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (coralOverlayEl.classList.contains("firstchat-instant")) {
                coralOverlayEl.classList.remove("firstchat-instant");
            }
        });
    });
}

export function closeCoral() {
    if (!coralOverlayEl || !coralOverlayEl.classList.contains("is-open")) return;
    if (coralOverlayEl.classList.contains("firstchat-active")) return;
    coralOverlayEl.classList.remove("is-open");
    coralOverlayEl.setAttribute("inert", "");
    stopTypingSfx();
    setTypingActive(false);
    try {
        unmuteGameAudio();
    } catch {}
    updateShopOverlay(true);
}

if (typeof window !== "undefined") {
    window.addEventListener("escape:pressed", () => {
        if (document.body.classList.contains("has-modal")) return;
        if (document.body.classList.contains("has-offline")) return;
        if (coralOverlayEl?.classList.contains("is-open") && !coralOverlayEl.classList.contains("firstchat-active")) {
            closeCoral();
        }
    });
}
