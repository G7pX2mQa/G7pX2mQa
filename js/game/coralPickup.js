// js/game/coralPickup.js
import { IS_MOBILE } from "../util/platformChecker.js";
import { playAudio } from "../util/audioManager.js";
import { settingsManager } from "./settingsManager.js";
import { bank } from "../util/storage.js";
import { BigNum } from "../util/bigNum.js";
import { MAX_VISUALS } from "./spawnerCore.js";
import { createMagnetController, initInteractionBrush, computeMagnetUnitPx, PICKUP_VOLUME } from "./collectionCore.js";
import { currentArea, AREAS, lsSetItem, lsGetItem } from "../main.js";
import { getActiveSlot } from "../util/storage.js";
import { unlockShopCoral } from "../ui/hudButtons.js";

export function initCoralPickup({
    spawner,
    playfieldSelector = ".playfield",
    coralLayerSelector = ".coral-layer",
    coralSelector = ".coral",
    disableAnimation = false,
} = {}) {
    const pf = document.querySelector(playfieldSelector);
    const cl = document.querySelector(coralLayerSelector);
    if (!pf || !cl) {
        console.warn("[coralPickup] missing required nodes");
        return { destroy() {} };
    }
    pf.style.touchAction = "none";
    
    let magnetController = null;
    let lastAt = 0;
    
    function playSound() {
        const now = performance.now();
        if (now - lastAt < 20) return;
        lastAt = now;
        playAudio("sounds/pickup.ogg", {
            volume: PICKUP_VOLUME,
            type: "sfx",
        });
    }

    function isCoral(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el._itemObj) return !el._itemObj.isRemoved && el.dataset.collected !== "1";
        return el.dataset.collected !== "1" && el.matches(coralSelector);
    }

    function ensureInteractive(el) {
        try {
            el.style.pointerEvents = "auto";
        } catch {}
    }
    cl.querySelectorAll(coralSelector).forEach(ensureInteractive);
    
    function animateAndRemove(el, opts = {}) {
        const cObj = el && el._itemObj;
        if (spawner && typeof spawner.detachItem === "function") {
            spawner.detachItem(opts.coin || cObj || el);
        }

        const recycle = () => {
            if (!el) return;
            if (spawner && typeof spawner.recycleItem === "function") {
                spawner.recycleItem(el);
            } else {
                el.remove();
            }
        };
        
        if (disableAnimation || IS_MOBILE || settingsManager.get("pickup_animation") === false) {
            recycle();
            return;
        }

        let start = "translate3d(0,0,0)";
        if (opts.transform) {
            if (opts.transform !== "none") start = opts.transform;
        } else {
            start = el.style.transform || "translate3d(0,0,0)";
        }
        el.style.setProperty("--ccc-start", start);
        el.classList.add("item--collected"); // Standard collection animation
        
        let complete = false;
        const done = () => {
            if (complete) return;
            complete = true;
            el.removeEventListener("animationend", done);
            recycle();
        };
        el.addEventListener("animationend", done);
        setTimeout(done, 600);
    }

    function collectBatch(items) {
        if (!items || !items.length) return;
        if (
            typeof currentArea !== "undefined" &&
            typeof AREAS !== "undefined" &&
            currentArea !== AREAS.CORAL_REEF
        ) return;
            
        let collectedCount = 0;
        let visualCount = 0;
        
        for (const item of items) {
            let el = item.el;
            let cObj = item.coin;
            if (!cObj && el && el._itemObj) cObj = el._itemObj;
            if (el && !isCoral(el)) continue;
            if (cObj && cObj.isRemoved) continue;
            
            collectedCount++;
            if (el) el.dataset.collected = "1";
            
            if (visualCount < MAX_VISUALS) {
                if (!el && cObj && spawner && spawner.ensureItemVisual) {
                    el = spawner.ensureItemVisual(cObj);
                    if (el) el.dataset.collected = "1";
                }
                if (el) {
                    animateAndRemove(el, item.opts || {});
                    visualCount++;
                } else {
                    if (cObj && spawner && spawner.removeItemTarget) spawner.removeItemTarget(cObj);
                }
            } else {
                if (cObj && spawner && spawner.removeItemTarget) {
                    spawner.removeItemTarget(cObj);
                } else if (el) {
                    if (spawner && spawner.detachItem) spawner.detachItem(cObj || el);
                    if (spawner && spawner.recycleItem) spawner.recycleItem(el);
                    else el.remove();
                }
            }
        }
        
        if (collectedCount > 0) {
            playSound();
            
            // Add to bank
            let isLocked = false;
            try {
                isLocked = globalThis?.__cccLockedStorageKeys?.has?.("ccc:red_coral");
            } catch {}
            
            if (!isLocked) {
                const handle = bank.red_coral;
                if (handle) {
                    const mult = handle.mult.get();
                    const totalGain = BigNum.fromInt(collectedCount).mulBigNumInteger(mult);
                    handle.add(totalGain);
                }
            }

            const activeSlot = getActiveSlot();
            if (activeSlot != null) {
                const SHOP_CORAL_UNLOCK_KEY = `ccc:unlock:shop:coral:${activeSlot}`;
                const SHOP_CORAL_PROGRESS_KEY = `ccc:unlock:shop:coral:progress:${activeSlot}`;
                if (lsGetItem(SHOP_CORAL_UNLOCK_KEY) !== "1") {
                    const current = parseInt(lsGetItem(SHOP_CORAL_PROGRESS_KEY) || "0", 10);
                    const next = current + collectedCount;
                    lsSetItem(SHOP_CORAL_PROGRESS_KEY, String(next));
                    if (next >= 10) {
                        try {
                            unlockShopCoral();
                        } catch {}
                        lsSetItem(SHOP_CORAL_UNLOCK_KEY, "1");
                    }
                }
            }
        }
    }

    function collect(el, opts = {}) {
        collectBatch([{ el, opts }]);
        return true;
    }
    
    magnetController = createMagnetController({
        playfield: pf,
        itemsLayer: cl,
        itemSelector: coralSelector,
        collectFn: collect,
        collectBatchFn: collectBatch,
        spawner,
    });
    
    const brushController = initInteractionBrush({
        playfield: pf,
        itemsLayer: cl,
        itemSelector: coralSelector,
        isItemValid: isCoral,
        spawner,
        collectBatch,
        collect,
    });
    
    cl.addEventListener("pointerdown", brushController.onDelegatedInteract, { passive: true });
    if (!IS_MOBILE) {
        cl.addEventListener("mouseover", brushController.onDelegatedInteract, { passive: true });
    }

    const destroy = () => {
        if (brushController) {
            brushController.destroy();
        }
        if (magnetController) {
            magnetController.destroy();
        }
        try {
            cl.removeEventListener("pointerdown", brushController.onDelegatedInteract);
            if (!IS_MOBILE) {
                cl.removeEventListener("mouseover", brushController.onDelegatedInteract);
            }
        } catch {}
    };
    
    return {
        destroy,
        collectBatch,
        getMagnetUnitPx: computeMagnetUnitPx,
    };
}
