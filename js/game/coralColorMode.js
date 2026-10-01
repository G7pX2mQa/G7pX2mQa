import { getActiveSlot } from "../util/storage.js";
import { lsGetItem, lsSetItem } from "../main.js";

export const CORAL_COLOR_ORDER = ["red", "green"];

export function getCoralColorMode(slot = getActiveSlot()) {
    if (slot == null) return "red";
    try {
        const mode = lsGetItem(`ccc:coralColorMode:${slot}`);
        if (CORAL_COLOR_ORDER.includes(mode)) {
            return mode;
        }
        return "red";
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

export function getNextCoralColor(current) {
    const idx = CORAL_COLOR_ORDER.indexOf(current);
    if (idx === -1) return "red";
    const nextIdx = (idx + 1) % CORAL_COLOR_ORDER.length;
    return CORAL_COLOR_ORDER[nextIdx];
}

export function getCoralCurrencyKey(mode) {
    if (mode === "green") return "green_coral";
    return "red_coral";
}
