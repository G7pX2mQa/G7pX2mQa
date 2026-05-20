// js/game/materialPickup.js

import { bank, UC_MATERIALS } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { IS_MOBILE } from '../main.js';
import { playAudio } from '../util/audioManager.js';
import { createMagnetController, initInteractionBrush, computeMagnetUnitPx } from './collectionCore.js';
import { settingsManager } from './settingsManager.js';
import { getComboUiString } from './surgeEffects.js';
import { formatNumber } from '../util/numFormat.js';

let ucPickup = null;
const BASE_MATERIAL_VALUE = BigNum.fromInt(1);
const soundSrc = 'sounds/material_pickup.ogg';

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
  
  const pf  = document.querySelector(playfieldSelector);
  const ml  = document.querySelector(materialsLayerSelector);

  if (!pf || !ml) {
    console.warn('[ucPickup] missing required nodes');
    return { destroy(){} };
  }

  pf.style.touchAction = 'none';

  let magnetController = null;
  const resolvedSrc = new URL(soundSrc, document.baseURI).href;
  const MATERIAL_VOLUME = IS_MOBILE ? 0.2 : 0.4;
  let lastAt = 0;

  function playSound(){
    const now = performance.now();
    if ((now - lastAt) < 40) return; 
    lastAt = now;
    
    playAudio(resolvedSrc, { 
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
    if (spawner && typeof spawner.detachItem === 'function') {
        spawner.detachItem(el);
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
    
    let collectedCount = 0;
    const MAX_VISUALS = items.length >= 50 ? 5 : 15;
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
               if (spawner && spawner.detachItem) spawner.detachItem(el);
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
                const totalGain = BASE_MATERIAL_VALUE.mulBigNumInteger(BigNum.fromAny(count)).mulBigNumInteger(mult);
                handle.add(totalGain);
            }
        }
        
        if (window.dpSystem && typeof window.dpSystem.addDp === 'function') {
            window.dpSystem.addDp(collectedCount);
        }

        if (typeof window !== 'undefined' && typeof window.currentArea !== 'undefined' && window.currentArea === 2) {
            // Add any custom lifetime tracking for underwater cavern here if needed
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
    if (brushController) {
      brushController.destroy();
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
