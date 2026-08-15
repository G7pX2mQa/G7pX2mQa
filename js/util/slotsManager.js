// js/util/slotsManager.js
import { lsSetItem, lsRemoveItem } from "../main.js";
import { flushLocalStorageBuffer } from "../main.js";
import { markSaveSlotModified } from "./storage.js";
import { refreshSlotsView } from "./slots.js";
let currentMode = null; // null, 'menu', 'export-json', 'import-json', 'export-b64', 'import-b64'
let initialized = false;
let submenuContainer = null;
let originalTitle = "";
let originalTitleColor = "";
export function isManageMode() {
    return currentMode !== null && currentMode !== "menu";
}

function setManageMode(mode) {
    currentMode = mode;
    const grid = document.querySelector(".slots-grid");
    const panelHeader = document.querySelector(".panel-header");
    const titleEl = document.getElementById("panel-title");
    const manageBtn = document.getElementById("manage-saves");
    if (!originalTitle && titleEl) {
        originalTitle = titleEl.textContent;
        originalTitleColor = titleEl.style.color;
    }
    // ... existing mode toggles
    if (mode === "menu") {
        grid.style.display = "none";
        panelHeader.style.display = "none";
        if (submenuContainer) submenuContainer.style.display = "flex";
        hideCancelButton();
    } else if (mode === null) {
        grid.style.display = "";
        panelHeader.style.display = "";
        if (manageBtn) manageBtn.style.display = "";
        if (submenuContainer) submenuContainer.style.display = "none";
        if (titleEl) {
            titleEl.textContent = originalTitle;
            titleEl.style.color = originalTitleColor;
            titleEl.style.display = "";
            titleEl.style.opacity = "";
        }
        document.querySelectorAll(".slot-card").forEach((card) => {
            card.style.borderColor = "";
            card.style.borderWidth = "";
            card.style.borderStyle = "";
        });
        hideCancelButton();
    } else {
        // Action mode (export/import)
        grid.style.display = "";
        panelHeader.style.display = "";
        if (manageBtn) manageBtn.style.display = "none";
        if (submenuContainer) submenuContainer.style.display = "none";
        const isExport = mode.startsWith("export");
        if (titleEl) {
            titleEl.textContent = isExport
                ? "Select a save slot to export"
                : "Select a save slot to import onto (warning: will overwrite data)";
            titleEl.style.color = isExport ? "rgb(68, 255, 68)" : "rgb(255, 68, 68)";
            titleEl.style.display = "block";
            titleEl.style.opacity = "1";
        }
        document.querySelectorAll(".slot-card").forEach((card) => {
            card.style.borderColor = isExport ? "rgb(68, 255, 68)" : "rgb(255, 68, 68)";
            card.style.borderWidth = "2px";
            card.style.borderStyle = "solid";
        });
        showCancelButton();
    }
}

let cancelBtnContainer = null;
function hideCancelButton() {
    if (cancelBtnContainer) cancelBtnContainer.style.display = "none";
}

function showCancelButton() {
    if (!cancelBtnContainer) {
        cancelBtnContainer = document.createElement("div");
        cancelBtnContainer.style.position = "fixed";
        cancelBtnContainer.style.bottom = "40px";
        cancelBtnContainer.style.left = "0";
        cancelBtnContainer.style.width = "100%";
        cancelBtnContainer.style.display = "flex";
        cancelBtnContainer.style.justifyContent = "center";
        cancelBtnContainer.style.pointerEvents = "none"; // So the container doesn't block clicks
        cancelBtnContainer.style.zIndex = "9999";
        const btn = document.createElement("button");
        btn.textContent = "Cancel";
        btn.style.pointerEvents = "auto"; // Re-enable clicks on button
        // Copying the Merchant Delve Close button styling (.shop-actions .shop-close)
        btn.style.minWidth = "180px";
        btn.style.height = "44px";
        btn.style.borderRadius = "0";
        btn.style.border = "2px solid hsl(0, 80%, 40%)";
        btn.style.background = "hsla(0, 80%, 40%, 0.85)";
        btn.style.color = "#fff";
        btn.style.fontWeight = "600";
        btn.style.letterSpacing = ".2px";
        btn.style.cursor = "pointer";
        btn.style.transition = "transform 120ms ease, background 120ms ease, border-color 120ms ease";
        btn.onmouseenter = () => {
            btn.style.background = "hsla(0, 80%, 40%, 0.95)";
        };
        btn.onmouseleave = () => {
            btn.style.background = "hsla(0, 80%, 40%, 0.85)";
            btn.style.transform = "";
        };
        btn.onmousedown = () => {
            btn.style.transform = "translateY(1px)";
            btn.style.background = "hsla(0, 80%, 40%, 1.0)";
        };
        btn.onmouseup = () => {
            btn.style.transform = "";
            btn.style.background = "hsla(0, 80%, 40%, 0.95)";
        };
        btn.addEventListener("click", () => setManageMode(null));
        cancelBtnContainer.appendChild(btn);
        document.body.appendChild(cancelBtnContainer);
    }
    cancelBtnContainer.style.display = "flex";
}

function buildSubmenu() {
    const container = document.createElement("div");
    container.className = "manage-menu-container";
    container.style.display = "none";
    container.style.flexDirection = "column";
    container.style.alignItems = "center";
    container.style.justifyContent = "center";
    container.style.gap = "15px";
    container.style.width = "100%";
    container.style.padding = "20px";
    const createBtn = (text, mode) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = text;
        btn.style.width = "200px";
        btn.addEventListener("click", () => setManageMode(mode));
        return btn;
    };
    container.appendChild(createBtn("Export JSON", "export-json"));
    container.appendChild(createBtn("Import JSON", "import-json"));
    container.appendChild(createBtn("Export Base64", "export-b64"));
    container.appendChild(createBtn("Import Base64", "import-b64"));
    const returnBtn = document.createElement("button");
    returnBtn.className = "btn btn-danger";
    returnBtn.textContent = "Return to Menu";
    returnBtn.style.marginTop = "20px";
    returnBtn.style.width = "200px";
    returnBtn.addEventListener("click", () => setManageMode(null));
    container.appendChild(returnBtn);
    return container;
}

function getSaveDataForSlot(slot) {
    if (typeof flushLocalStorageBuffer === "function") flushLocalStorageBuffer();
    const re = new RegExp(`^ccc:.*:${slot}$`);
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (re.test(key)) {
            data[key] = localStorage.getItem(key);
        }
    }
    return data;
}

function clearSaveDataForSlot(slot) {
    const re = new RegExp(`^ccc:.*:${slot}$`);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (re.test(key)) {
            toRemove.push(key);
        }
    }
    toRemove.forEach((k) => lsRemoveItem(k));
    if (window.__activeStorageKeys) {
        toRemove.forEach((k) => window.__activeStorageKeys.delete(k));
    }
}

function applySaveDataToSlot(slot, data) {
    clearSaveDataForSlot(slot);
    for (const [key, value] of Object.entries(data)) {
        // Ensure the key actually belongs to the target slot
        if (key.endsWith(`:${slot}`)) {
            lsSetItem(key, value);
        } else {
            // If the imported data was from a different slot, rewrite the key suffix
            const baseKey = key.substring(0, key.lastIndexOf(":"));
            lsSetItem(`${baseKey}:${slot}`, value);
        }
    }
    // Fire events so the live game state matches the newly imported local storage
    try {
        window.dispatchEvent(new CustomEvent("saveIntegrity:storageMutation", { detail: { slot, trusted: true } }));
        window.dispatchEvent(new CustomEvent("saveIntegrity:rebuildSnapshot", { detail: { slot } }));
    } catch {}
}

const SIGNATURE_SALT = "ccc_save_v1_salt_93817293";
async function generateSignature(dataObj) {
    // Deterministic JSON stringification for hashing
    const keys = Object.keys(dataObj).sort();
    const sortedData = {};
    for (const k of keys) {
        if (k !== "__ccc_signature") sortedData[k] = dataObj[k];
    }

    const payload = JSON.stringify(sortedData) + SIGNATURE_SALT;
    const msgBuffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function handleExport(slot, asBase64) {
    const data = getSaveDataForSlot(slot);
    if (Object.keys(data).length === 0) {
        alert(`Save slot ${slot} has no save data to export.`);
        setManageMode(null);
        return;
    }
    // Sign the export
    data.__ccc_signature = await generateSignature(data);
    const jsonString = JSON.stringify(data);
    if (asBase64) {
        const b64 = btoa(unescape(encodeURIComponent(jsonString)));
        try {
            await navigator.clipboard.writeText(b64);
            alert("Save data copied to clipboard as Base64!");
        } catch (e) {
            prompt("Clipboard access denied. Please copy the string manually:", b64);
        }
    } else {
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ccc_save_slot_${slot}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Save data downloaded as JSON file!");
    }
    setManageMode(null);
}
async function verifyAndImport(slot, data) {
    let isTampered = false;
    if (!data.__ccc_signature) {
        isTampered = true;
    } else {
        const expectedSig = await generateSignature(data);
        if (data.__ccc_signature !== expectedSig) {
            isTampered = true;
        }
    }
    delete data.__ccc_signature;
    applySaveDataToSlot(slot, data);
    if (isTampered) {
        markSaveSlotModified(slot);
        alert(
            `Save data imported to Slot ${slot}, but it has been tampered with, so the hammer of justice strikes once again.`,
        );
    } else {
        alert(`Save data successfully imported to Slot ${slot}!`);
    }
    refreshSlotsView();
    setManageMode(null);
}
async function handleImport(slot, asBase64) {
    if (asBase64) {
        const input = prompt("Paste your Base64 save data string here:");
        if (!input) {
            setManageMode(null);
            return;
        }
        try {
            const jsonString = decodeURIComponent(escape(atob(input)));
            const data = JSON.parse(jsonString);
            await verifyAndImport(slot, data);
        } catch (e) {
            alert("Failed to parse Base64 string. The data may be invalid or corrupted.");
            setManageMode(null);
        }
    } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                setManageMode(null);
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    await verifyAndImport(slot, data);
                } catch (err) {
                    alert("Failed to parse JSON file. The data may be invalid or corrupted.");
                    setManageMode(null);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}

export function initSlotsManager() {
    if (initialized) return;
    initialized = true;
    const manageBtn = document.getElementById("manage-saves");
    const grid = document.querySelector(".slots-grid");
    const panel = document.querySelector(".menu-panel");
    if (!manageBtn || !grid || !panel) return;
    submenuContainer = buildSubmenu();
    panel.appendChild(submenuContainer);
    manageBtn.addEventListener("click", (e) => {
        e.preventDefault();
        setManageMode("menu");
    });
    window.addEventListener("keydown", (e) => {
        if (isManageMode() && e.key === "Escape") setManageMode(null);
    });
    const onPointerDownCapture = (e) => {
        if (!isManageMode()) return;
        const card = e.target.closest(".slot-card");
        if (!card) return;
        e.preventDefault();
        e.stopPropagation();
    };

    const onClickCapture = (e) => {
        if (!isManageMode()) return;
        const card = e.target.closest(".slot-card");
        if (!card) return;
        e.preventDefault();
        e.stopPropagation();
        let slot = parseInt(card.dataset.slot, 10);
        if (!Number.isFinite(slot) || slot <= 0) {
            const cards = Array.from(document.querySelectorAll(".slot-card"));
            slot = cards.indexOf(card) + 1;
        }
        if (currentMode === "export-json") handleExport(slot, false);
        else if (currentMode === "export-b64") handleExport(slot, true);
        else if (currentMode === "import-json") handleImport(slot, false);
        else if (currentMode === "import-b64") handleImport(slot, true);
    };
    grid.addEventListener("pointerdown", onPointerDownCapture, true);
    grid.addEventListener("click", onClickCapture, true);
    setManageMode(null);
}
document.addEventListener("DOMContentLoaded", () => {
    try {
        initSlotsManager();
    } catch {}
});
