// js/game/materialPickup.js

import { bank, UC_MATERIALS, getActiveSlot } from '../util/storage.js';
import { unlockShopUc } from '../ui/hudButtons.js';
import { BigNum } from '../util/bigNum.js';
import { IS_MOBILE, currentArea, AREAS } from '../main.js';
import { playAudio } from '../util/audioManager.js';
import { createMagnetController, initInteractionBrush, computeMagnetUnitPx } from './collectionCore.js';
import { settingsManager } from './settingsManager.js';
import { getComboUiString } from './surgeEffects.js';
import { formatNumber } from '../util/numFormat.js';
import { UC_MATERIAL_DATA } from './ucSpawner.js';
import { getLevelNumber } from './upgrades.js';
import { AUTOMATION_AREA_KEY, MANUAL_MATERIAL_VALUE_ID } from './automationUpgrades.js';
import { addPp, isPpSystemUnlocked } from './ppSystem.js';
import { MAX_VISUALS } from "./spawnerCore.js";

let ucPickup = null;
const BASE_MATERIAL_VALUE = BigNum.fromInt(1);


// Queue helpers moved to module scope
const cloneBn = (value) => {
  if (!value) return BigNum.fromInt(0);
  if (typeof value.clone === 'function') {
    try { return value.clone(); } catch {}
  }
  try { return BigNum.fromAny(value); } catch { return BigNum.fromInt(0); }
};

const mergeGain = (current, gain) => {
  if (!gain) return current;
  if (!current) return cloneBn(gain);
  try { return current.add(gain); }
  catch {
    try {
      const base = cloneBn(current);
      return base.add(gain);
    } catch {
      return cloneBn(gain);
    }
  }
};

let pendingMaterialGains = new Map();
let flushScheduled = false;

const flushPendingGains = () => {
  for (const [handle, gain] of pendingMaterialGains.entries()) {
    if (gain && !gain.isZero?.()) {
      try { handle.add(gain); } catch (e) { console.error("Error adding material gain", e); }
    }
  }
  pendingMaterialGains.clear();
};

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    flushPendingGains();
  });
};

const queueMaterialGain = (handle, gain) => {
  pendingMaterialGains.set(handle, mergeGain(pendingMaterialGains.get(handle), gain));
  scheduleFlush();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingGains, { passive: true });
}

export function initUcPickup({
  spawner,
  playfieldSelector   = '.playfield',
  materialsLayerSelector  = '.materials-layer',
  materialSelector        = '.material',
  disableAnimation    = false,
} = {}) {
  if (ucPickup?.destroy) {
    ucPickup.destroy();
  }

  const checkUcShopUnlock = () => {
    const activeSlot = getActiveSlot();
    if (activeSlot != null) {
      const SHOP_UC_UNLOCK_KEY   = `ccc:unlock:shop:uc:${activeSlot}`;
      const SHOP_UC_PROGRESS_KEY = `ccc:unlock:shop:uc:progress:${activeSlot}`;
      const p = parseInt(localStorage.getItem(SHOP_UC_PROGRESS_KEY) || '0', 10);
      localStorage.setItem(SHOP_UC_PROGRESS_KEY, String(p));
      if (p >= 10 && localStorage.getItem(SHOP_UC_UNLOCK_KEY) !== '1') {
        try { unlockShopUc(); } catch {}
        localStorage.setItem(SHOP_UC_UNLOCK_KEY, '1');
      }
    }
  };
  checkUcShopUnlock();
  window.addEventListener('saveSlot:change', checkUcShopUnlock);
  
  const pf  = document.querySelector(playfieldSelector);
  const ml  = document.querySelector(materialsLayerSelector);

  if (!pf || !ml) {
    console.warn('[ucPickup] missing required nodes');
    return { destroy(){} };
  }

  pf.style.touchAction = 'none';

  let magnetController = null;
  
  const MATERIAL_VOLUME = IS_MOBILE ? 0.2 : 0.4;
  let lastAt = 0;

  function playSound() {
    const now = performance.now();
    if ((now - lastAt) < 20) return; 
    lastAt = now;
    
    const baseSrc = new URL('sounds/pickup.ogg', document.baseURI).href;
    
    playAudio(baseSrc, {
        volume: MATERIAL_VOLUME,
        type: 'sfx'
    });
  }

  function isMaterial(el) {
      if (!(el instanceof HTMLElement)) return false;
      if (el._coinObj) return !el._coinObj.isRemoved && el.dataset.collected !== '1';
      return el.dataset.collected !== '1' && el.matches(materialSelector);
  }

  function ensureInteractive(el){ try { el.style.pointerEvents = 'auto'; } catch {} }
  ml.querySelectorAll(materialSelector).forEach(ensureInteractive);

  function animateAndRemove(el, opts = {}){
    const coinObj = el && el._coinObj;
    if (spawner && typeof spawner.detachItem === 'function') {
        spawner.detachItem(opts.coin || coinObj || el);
    }

    const recycle = () => {
        if (!el) return;
        if (spawner && typeof spawner.recycleItem === 'function') {
            spawner.recycleItem(el);
        } else {
            el.remove();
        }
    };

    if (disableAnimation || IS_MOBILE || settingsManager.get('pickup_animation') === false) {
        recycle();
        return; 
    }
    
    let start = 'translate3d(0,0,0)';
    if (opts.transform) {
        if (opts.transform !== 'none') start = opts.transform;
    } else {
        start = el.style.transform || 'translate3d(0,0,0)';
    }

    el.style.setProperty('--ccc-start', start);
    el.classList.add('coin--collected'); // Re-use the animation CSS class
    
    let complete = false;
    const done = () => { 
        if (complete) return;
        complete = true;
        el.removeEventListener('animationend', done); 
        recycle();
    };
    el.addEventListener('animationend', done);
    setTimeout(done, 600);
  }

  function collectBatch(items) {
    if (!items || !items.length) return;
    if (typeof currentArea !== 'undefined' && typeof AREAS !== 'undefined' && currentArea !== AREAS.UNDERWATER_CAVERN) return;
    
    let collectedCount = 0;

    let visualCount = 0;

    const gains = {};

    for (const item of items) {
      let el = item.el;
      let cObj = item.coin;
      
      if (!cObj && el && el._coinObj) cObj = el._coinObj;
      if (el && !isMaterial(el)) continue;
      if (cObj && cObj.isRemoved) continue;

      collectedCount++;
      if (el) el.dataset.collected = '1';

      if (visualCount < MAX_VISUALS) {
           if (!el && cObj && spawner && spawner.ensureItemVisual) {
               el = spawner.ensureItemVisual(cObj);
               if (el) el.dataset.collected = '1';
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

      if (cObj && cObj.sizeIndex !== undefined) {
          const matType = UC_MATERIALS[cObj.sizeIndex];
          if (!gains[matType]) gains[matType] = 0;
          gains[matType]++;
      }
    }

    if (collectedCount > 0) {
        playSound();

        // Add to bank
        for (const [matType, count] of Object.entries(gains)) {
            // Check if currency is locked (from debug)
            let isLocked = false;
            try { isLocked = globalThis?.__cccLockedStorageKeys?.has?.(`ccc:${matType}`); } catch {}
            if (isLocked) continue;
            
            const handle = bank[matType];
            if (handle) {
                const mult = handle.mult.get();
                const manualValueLevel = getLevelNumber(AUTOMATION_AREA_KEY, MANUAL_MATERIAL_VALUE_ID);
                const manualValueMultiplier = BigNum.fromInt(1 + manualValueLevel);
                const totalGain = BASE_MATERIAL_VALUE.mulBigNumInteger(BigNum.fromAny(count)).mulBigNumInteger(mult).mulBigNumInteger(manualValueMultiplier);
                queueMaterialGain(handle, totalGain);
            }
        }
        
        if (window.dpSystem && typeof window.dpSystem.addDp === 'function') {
            const manualValueLevel = getLevelNumber(AUTOMATION_AREA_KEY, MANUAL_MATERIAL_VALUE_ID);
            const manualValueMultiplier = 1 + manualValueLevel;
            window.dpSystem.addDp(collectedCount * manualValueMultiplier);

            if (isPpSystemUnlocked()) {
                 addPp(collectedCount * manualValueMultiplier);
            }
        }

        if (typeof window !== 'undefined' && typeof window.currentArea !== 'undefined' && window.currentArea === 2) {
            // Add any custom lifetime tracking for underwater cavern here if needed
        }
        
        const activeSlot = getActiveSlot();
        if (activeSlot != null) {
            const SHOP_UC_UNLOCK_KEY   = `ccc:unlock:shop:uc:${activeSlot}`;
            const SHOP_UC_PROGRESS_KEY = `ccc:unlock:shop:uc:progress:${activeSlot}`;
            if (localStorage.getItem(SHOP_UC_UNLOCK_KEY) !== '1') {
                const current = parseInt(localStorage.getItem(SHOP_UC_PROGRESS_KEY) || '0', 10);
                const next = current + collectedCount;
                localStorage.setItem(SHOP_UC_PROGRESS_KEY, String(next));
                if (next >= 10) {
                  try { unlockShopUc(); } catch {}
                  localStorage.setItem(SHOP_UC_UNLOCK_KEY, '1');
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
    itemsLayer: ml,
    itemSelector: materialSelector,
    collectFn: collect,
    collectBatchFn: collectBatch,
    spawner,
  });

  const brushController = initInteractionBrush({
    playfield: pf,
    itemsLayer: ml,
    itemSelector: materialSelector,
    isItemValid: isMaterial,
    spawner,
    collectBatch,
    collect,
  });

  ml.addEventListener('pointerdown', brushController.onDelegatedInteract, { passive: true });
  if (!IS_MOBILE) {
    ml.addEventListener('mouseover', brushController.onDelegatedInteract, { passive: true });
  }

  const destroy = () => {
    window.removeEventListener('saveSlot:change', checkUcShopUnlock);
    if (brushController) {
      brushController.destroy();
    }
    flushPendingGains();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', flushPendingGains);
    }
    if (magnetController) {
      magnetController.destroy();
    }
    try {
      ml.removeEventListener('pointerdown', brushController.onDelegatedInteract);
      if (!IS_MOBILE) {
        ml.removeEventListener('mouseover', brushController.onDelegatedInteract);
      }
    } catch {}
  };

  ucPickup = { destroy };

  return {
    destroy,
    collectBatch,
    getMagnetUnitPx: computeMagnetUnitPx,
  };
}
