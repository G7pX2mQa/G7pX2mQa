import { getActiveSlot } from "../util/storage.js";
import { lsGetItem, lsSetItem } from "../main.js";
import { isGclpSystemUnlocked } from "./gclpSystem.js";
import { isBclpSystemUnlocked } from "./bclpSystem.js";

export const CORAL_COLOR_ORDER = ["red", "green", "blue"];

export function getCoralColorMode(slot = getActiveSlot()) {
    if (slot == null) return "red";
    try {
        let mode = lsGetItem(`ccc:coralColorMode:${slot}`);
        if (!CORAL_COLOR_ORDER.includes(mode)) {
            mode = "red";
        }
        
        // Fallback logic if the player lost access to the current color
        if (mode === "blue" && !isBclpSystemUnlocked()) {
            mode = "green";
            // If they also don't have green, fallback will cascade below
        }
        if (mode === "green" && !isGclpSystemUnlocked()) {
            mode = "red";
        }
        
        return mode;
    } catch {
        return "red";
    }
}

export function setCoralColorMode(mode, slot = getActiveSlot()) {
    if (slot == null) return;
    if (!CORAL_COLOR_ORDER.includes(mode)) return;
    try {
        lsSetItem(`ccc:coralColorMode:${slot}`, mode);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ccc:coralColorMode:change", { detail: { mode, slot } }));
        }
    } catch {}
}

export function getNextCoralColor(current, slot = getActiveSlot()) {
    if (current === "red") {
        return "green";
    } else if (current === "green") {
        let canGoToBlue = isBclpSystemUnlocked();
        if (!canGoToBlue) {
            try {
                canGoToBlue = lsGetItem(`ccc:collapseChallengeCompleted:diamond:${slot}`) === "1";
            } catch {}
        }
        return canGoToBlue ? "blue" : "red";
    } else if (current === "blue") {
        return "red";
    }
    
    return "red";
}

export function getCoralCurrencyKey(mode) {
    return `${mode}_coral`;
}

if (typeof window !== "undefined") {
    window.addEventListener("unlock:change", (e) => {
        if (e.detail?.key === "gclp" || e.detail?.key === "bclp") {
            const slot = e.detail?.slot ?? getActiveSlot();
            const validMode = getCoralColorMode(slot);
            const savedMode = lsGetItem(`ccc:coralColorMode:${slot}`);
            
            if (savedMode !== validMode) {
                setCoralColorMode(validMode, slot);
                if (window.coralSpawner) {
                    window.coralSpawner.setMode(validMode);
                }
            }
        }
    });
}
