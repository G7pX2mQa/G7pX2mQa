import { lsSetItem, lsRemoveItem, lsGetItem } from "../main.js";
import { PALETTES } from "../game/mutationColorPalettes.js";
import { BigNum } from "./bigNum.js";
import { formatNumber } from "./numFormat.js";
import { isManageMode } from "./slotsManager.js";
import { FONT_MAP, ALL_FONT_CLASSES } from "../main.js";
import {
    setHasOpenedSaveSlot,
    ensureCurrencyDefaults,
    ensureMultiplierDefaults,
    setActiveSlot,
    peekCurrency,
} from "./storage.js";
// A slot is considered "used" once it has a coins key at all (even if 0)
function hasSlotData(slot) {
    return lsGetItem(`ccc:coins:${slot}`) !== null;
}

function coinsTextFor(slot) {
    if (!hasSlotData(slot)) return "No Save Data";
    try {
        const bn = peekCurrency(slot, "coins"); // BigNum
        const notation = lsGetItem(`ccc:setting:number_notation:${slot}`);
        return formatNumber(bn, notation ? JSON.parse(notation) : "Standard");
    } catch {
        return "0";
    }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatCreationDate(timestamp) {
    const d = new Date(parseInt(timestamp, 10));
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function renderSlotCards() {
    const manageBtn = document.getElementById("manage-saves");
    const cards = document.querySelectorAll(".slot-card");
    const slotTints = ["empty", "empty", "empty"];
    
    cards.forEach((btn, idx) => {
        const slot = idx + 1;
        const titleEl = btn.querySelector(".slot-title");
        if (titleEl) {
            const text = coinsTextFor(slot);
            titleEl.innerHTML = `<img src="img/currencies/coin/coin.webp" class="coin-slot-icon-img" alt=""> ${text}`;
        }

        const existingMeta = btn.querySelector(".slot-meta");
        if (existingMeta) {
            existingMeta.remove();
        }
        if (hasSlotData(slot)) {
            let creationTime = lsGetItem(`ccc:creationTime:${slot}`);
            if (!creationTime) {
                creationTime = Date.now().toString();
                lsSetItem(`ccc:creationTime:${slot}`, creationTime);
            }

            const metaEl = document.createElement("div");
            metaEl.className = "slot-meta";
            metaEl.textContent = `Created on: ${formatCreationDate(creationTime)}`;
            btn.appendChild(metaEl);
            let actualHighest = 0;
            const highestLevelRaw = lsGetItem(`ccc:mutation:highest_level:${slot}`);
            if (highestLevelRaw) {
                try {
                    const bn = BigNum.fromAny(highestLevelRaw);
                    const plain = bn.toPlainIntegerString?.();
                    if (plain && plain !== "Infinity" && plain.length <= 15) {
                        actualHighest = Number(plain);
                    } else {
                        actualHighest = Object.keys(PALETTES).length - 1;
                    }
                } catch (e) {}
            }

            const tintSettingRaw = lsGetItem(`ccc:setting:save_slot_tint:${slot}`);
            let tintSetting = "Default";
            if (tintSettingRaw) {
                try {
                    tintSetting = JSON.parse(tintSettingRaw);
                } catch (e) {}
            }

            let finalTintLevel = actualHighest;
            if (tintSetting === "Random") {
                const maxRand = Math.min(actualHighest, Object.keys(PALETTES).length - 1);
                finalTintLevel = Math.floor(Math.random() * (maxRand + 1));
            } else if (tintSetting.startsWith("M")) {
                const chosen = parseInt(tintSetting.substring(1), 10);
                if (!Number.isNaN(chosen) && chosen <= actualHighest) {
                    finalTintLevel = chosen;
                }
            }
            if (finalTintLevel > 0) {
                const paletteKeys = Object.keys(PALETTES);
                const maxVisual = paletteKeys.length - 1;
                const paletteIndex = Math.min(finalTintLevel, maxVisual);
                const paletteKey = paletteKeys[paletteIndex];
                const colors = PALETTES[paletteKey];
                const colorString =
                    colors.length === 1
                        ? `linear-gradient(135deg, ${colors[0]}, ${colors[0]})`
                        : `linear-gradient(135deg, ${colors.join(", ")})`;
                slotTints[idx] = colorString;
                btn.style.setProperty("--slot-tint-gradient", colorString);
                btn.dataset.hasTint = "true";
                if (manageBtn) {
                    manageBtn.style.setProperty(`--s${slot}-body`, `linear-gradient(var(--manage-overlay), var(--manage-overlay)), ${colorString}`);
                    manageBtn.style.setProperty(`--s${slot}-border`, `linear-gradient(var(--border-overlay), var(--border-overlay)), ${colorString}`);
                }
            } else {
                slotTints[idx] = "empty";
                btn.dataset.hasTint = "false";
                btn.style.removeProperty("--slot-tint-gradient");
                if (manageBtn) {
                    manageBtn.style.removeProperty(`--s${slot}-body`);
                    manageBtn.style.removeProperty(`--s${slot}-border`);
                }
            }
        } else {
            slotTints[idx] = "empty";
            btn.dataset.hasTint = "false";
            btn.style.removeProperty("--slot-tint-gradient");
            if (manageBtn) {
                manageBtn.style.removeProperty(`--s${slot}-body`);
                manageBtn.style.removeProperty(`--s${slot}-border`);
            }
        }
        btn.dataset.slot = String(slot);
        btn.classList.remove(...ALL_FONT_CLASSES, "custom-font-active");
        const fontModStr = lsGetItem(`ccc:setting:active_font_mod:${slot}`);
        if (fontModStr) {
            try {
                const fontMod = parseInt(JSON.parse(fontModStr), 10);
                if (FONT_MAP[fontMod]) {
                    btn.classList.add(FONT_MAP[fontMod], "custom-font-active");
                }
            } catch (e) {}
        }
    });

    if (manageBtn) {
        manageBtn.classList.remove("coalesce-all", "coalesce-1-2", "coalesce-2-3");
        if (slotTints[0] === slotTints[1] && slotTints[1] === slotTints[2]) {
            manageBtn.classList.add("coalesce-all");
        } else if (slotTints[0] === slotTints[1]) {
            manageBtn.classList.add("coalesce-1-2");
        } else if (slotTints[1] === slotTints[2]) {
            manageBtn.classList.add("coalesce-2-3");
        }
    }
}

export function initSlots(onSelect) {
    const cards = document.querySelectorAll(".slot-card");
    // Initial paint
    renderSlotCards();
    cards.forEach((btn, idx) => {
        const slotNum = idx + 1;
        const activate = (ev) => {
            if (window.__duplicateInstanceDetected) return;
            // Switch to this slot and seed its defaults the first time it’s opened
            setActiveSlot(slotNum);
            if (window.__duplicateInstanceDetected) return;
            let creationTime = lsGetItem(`ccc:creationTime:${slotNum}`);
            if (!creationTime) {
                // Clean slate: Wipe any leftover keys from a poorly deleted old save
                const suffix = `:${slotNum}`;
                const toRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith("ccc:") && key.endsWith(suffix)) {
                        toRemove.push(key);
                    }
                }
                toRemove.forEach((k) => {
                    try {
                        lsRemoveItem(k);
                    } catch {}
                });
                lsSetItem(`ccc:creationTime:${slotNum}`, Date.now().toString());
            }
            ensureCurrencyDefaults();
            ensureMultiplierDefaults();
            setHasOpenedSaveSlot(true);
            if (typeof onSelect === "function") onSelect(slotNum, ev);
            // Repaint card titles after seeding
            renderSlotCards();
        };
        btn.addEventListener("click", (ev) => {
            if (isManageMode()) return;
            ev.preventDefault();
            activate(ev);
        });
    });
}

export function refreshSlotsView() {
    renderSlotCards();
}
