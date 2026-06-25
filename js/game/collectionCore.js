// js/game/collectionCore.js

import { settingsManager } from './settingsManager.js';

export const MAGNET_UNIT_RATIO = 0.05;
export const MAGNET_COLLECTION_BUFFER = 8; // Small buffer for collection feel

export function computeMagnetUnitPx() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const root = document.documentElement;
  const vw = Math.max(0, window.innerWidth || root?.clientWidth || 0);
  const vh = Math.max(0, window.innerHeight || root?.clientHeight || 0);
  if (!(vw > 0 && vh > 0)) return 0;
  const minDim = Math.min(vw, vh);
  return minDim * MAGNET_UNIT_RATIO;
}

export function createMagnetController({ playfield, itemsLayer, itemSelector, collectFn, collectBatchFn, spawner }) {
  if (!playfield || !itemsLayer || typeof collectFn !== 'function') {
    return { destroy() {} };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }

  const indicator = document.createElement('div');
  indicator.className = 'magnet-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  playfield.appendChild(indicator);

  let pointerInside = false;
  let hasPointer = false;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let localX = 0;
  let localY = 0;
  // Track last local position for interpolation
  let lastLocalX = null;
  let lastLocalY = null;

  let unitPx = computeMagnetUnitPx();
  let magnetLevel = 0;
  let radiusPx = 0;
  let rafId = 0;
  let destroyed = false;
  let playfieldRect = null;
  let syncInterval = null;

  const updatePlayfieldRect = () => {
    if (destroyed) return;
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    playfieldRect = { left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 };
  };

  const hideIndicator = () => {
    indicator.classList.remove('is-visible');
    indicator.style.transform = 'translate3d(-9999px, -9999px, 0)';
    lastLocalX = null;
    lastLocalY = null;
  };

  const updateIndicator = () => {
    if (!pointerInside || radiusPx <= 0) {
      hideIndicator();
      return;
    }
    const diameter = radiusPx * 2;
    indicator.style.width = `${diameter}px`;
    indicator.style.height = `${diameter}px`;
    indicator.style.transform = `translate3d(${localX - radiusPx}px, ${localY - radiusPx}px, 0)`;
    indicator.classList.add('is-visible');
  };

  const sweepItems = () => {
    if (!pointerInside || radiusPx <= 0) return;
    
    // Optimized: Use Spawner's spatial lookup if available
    if (spawner && typeof spawner.findItemTargetsInRadius === 'function') {
        const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
        
        let candidates = [];
        if (typeof spawner.findItemTargetsInPath === 'function' && lastLocalX !== null && lastLocalY !== null) {
             candidates = spawner.findItemTargetsInPath(lastLocalX, lastLocalY, localX, localY, radiusWithBuffer);
        } else {
             candidates = spawner.findItemTargetsInRadius(localX, localY, radiusWithBuffer);
        }

        lastLocalX = localX;
        lastLocalY = localY;
        
        if (candidates && candidates.length > 0) {
            if (typeof collectBatchFn === 'function') {
                 const items = [];
                 for (let i = 0; i < candidates.length; i++) {
                     const c = candidates[i];
                     const item = { coin: c }; // Support both "coin" nomenclature internally mapped
                     if (spawner.getItemTransform) {
                         item.opts = { transform: spawner.getItemTransform(c.el || c) };
                     } else if (spawner.getCoinTransform) {
                         item.opts = { transform: spawner.getCoinTransform(c.el || c) };
                     }
                     items.push(item);
                 }
                 collectBatchFn(items);
            } else {
                for (let i = 0; i < candidates.length; i++) {
                    const c = candidates[i];
                    const t = spawner.getItemTransform ? spawner.getItemTransform(c.el || c) : (spawner.getCoinTransform ? spawner.getCoinTransform(c.el || c) : '');
                    collectFn(c.el || c, { transform: t });
                }
            }
        }
    } else if (spawner && typeof spawner.findCoinsInRadius === 'function') {
        // Fallback
        const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
        const candidates = spawner.findCoinsInRadius(localX, localY, radiusWithBuffer);
        lastLocalX = localX; lastLocalY = localY;
        
        if (candidates && candidates.length > 0) {
             const items = [];
             for (let i = 0; i < candidates.length; i++) {
                 const el = candidates[i];
                 const t = spawner.getItemTransform ? spawner.getItemTransform(el) : (spawner.getCoinTransform ? spawner.getCoinTransform(el) : el.style.transform);
                 items.push({ el, opts: { transform: t } });
             }
             if (typeof collectBatchFn === 'function') collectBatchFn(items);
        }
    } else {
        // Fallback (Slow)
        const items = itemsLayer.children;
        const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
        const toCollect = [];
        
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (item.dataset.collected === '1') continue;
          if (!item.matches(itemSelector)) continue;
    
          const rect = item.getBoundingClientRect();
          const itemX = rect.left + rect.width / 2;
          const itemY = rect.top + rect.height / 2;
          const dx = itemX - pointerClientX;
          const dy = itemY - pointerClientY;
          if (Math.hypot(dx, dy) <= radiusWithBuffer) {
            toCollect.push(item);
          }
        }
    
        if (!toCollect.length) return;
    
        if (typeof collectBatchFn === 'function') {
            const batch = [];
            for (let i = 0; i < toCollect.length; i++) {
                const el = toCollect[i];
                const cs = window.getComputedStyle(el);
                batch.push({ el, opts: { transform: cs.transform } });
            }
            collectBatchFn(batch);
        } else {
            const transforms = [];
            for (let i = 0; i < toCollect.length; i++) {
                const el = toCollect[i];
                const cs = window.getComputedStyle(el);
                transforms.push(cs.transform);
            }
            for (let i = 0; i < toCollect.length; i++) {
                collectFn(toCollect[i], { transform: transforms[i] });
            }
        }
    }
  };

  const runSweep = () => {
    rafId = 0;
    updateIndicator();
    if (!pointerInside || radiusPx <= 0 || destroyed) return;
    sweepItems();
    ensureSweepLoop();
  };

  const ensureSweepLoop = () => {
    if (!pointerInside || radiusPx <= 0 || rafId || destroyed) return;
    rafId = requestAnimationFrame(runSweep);
  };

  const updatePointerFromEvent = (e) => {
    if (!e || destroyed) return;
    if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return;
    hasPointer = true;
    pointerClientX = e.clientX;
    pointerClientY = e.clientY;
    
    if (!playfieldRect) updatePlayfieldRect();
    const rect = playfieldRect;

    localX = pointerClientX;
    localY = pointerClientY;
    pointerInside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
    
    ensureSweepLoop();
  };

  const handlePointerLeave = () => {
    pointerInside = false;
    hideIndicator();
    lastLocalX = null;
    lastLocalY = null;
  };
  
  const resetPointerHistory = () => {
    lastLocalX = null;
    lastLocalY = null;
  };

  const refreshMagnetLevel = () => {
    const nextLevel = settingsManager.get('magnet_radius');
    magnetLevel = nextLevel;
    radiusPx = magnetLevel * unitPx;
    
    indicator.classList.remove('magnet-bronze', 'magnet-silver', 'magnet-gold', 'magnet-sapphire', 'magnet-emerald', 'magnet-ruby', 'magnet-amethyst', 'magnet-sunset', 'magnet-void', 'magnet-ethereal', 'magnet-earth', 'magnet-air', 'magnet-fire', 'magnet-water', 'magnet-cookie', 'magnet-pancake', 'magnet-watermelon', 'magnet-pepperoni', 'magnet-pizza', 'magnet-donut', 'magnet-glass', 'magnet-diamond', 'magnet-opal', 'magnet-cosmic', 'magnet-prismatic');
    
    const modMap = {
        6: 'magnet-silver', 3: 'magnet-bronze', 9: 'magnet-gold', 12: 'magnet-sapphire', 15: 'magnet-emerald',
        18: 'magnet-ruby', 21: 'magnet-amethyst', 24: 'magnet-sunset', 27: 'magnet-void', 30: 'magnet-ethereal',
        33: 'magnet-earth', 36: 'magnet-air', 39: 'magnet-fire', 42: 'magnet-water', 45: 'magnet-cookie',
        48: 'magnet-pancake', 51: 'magnet-watermelon', 54: 'magnet-pepperoni', 57: 'magnet-pizza',
        60: 'magnet-donut', 63: 'magnet-glass', 66: 'magnet-diamond', 69: 'magnet-opal', 72: 'magnet-cosmic',
        75: 'magnet-prismatic'
    };
    
    const mod = settingsManager.get('active_magnet_mod');
    if (modMap[mod]) {
        indicator.classList.add(modMap[mod]);
    }

    updateIndicator();
    ensureSweepLoop();
  };

  const handleScroll = () => {
    if (destroyed || !hasPointer) return;
    updatePlayfieldRect();
    if (playfieldRect) {
        const rect = playfieldRect;
        localX = pointerClientX - rect.left;
        localY = pointerClientY - rect.top;
        pointerInside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
    }
    ensureSweepLoop();
  };

  const handleResize = () => {
    unitPx = computeMagnetUnitPx();
    radiusPx = magnetLevel * unitPx;
    updatePlayfieldRect();
    if (hasPointer && playfieldRect) {
        const rect = playfieldRect;
        localX = pointerClientX - rect.left;
        localY = pointerClientY - rect.top;
        pointerInside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
    }
    ensureSweepLoop();
  };
  
  const forceUpdateAndMove = (e) => {
    updatePlayfieldRect();
    updatePointerFromEvent(e);
  };

  const handlePointerEnter = (e) => {
    resetPointerHistory();
    forceUpdateAndMove(e);
  };

  let settingsUnsub = null;
  let activeMagnetUnsub = null;
  settingsUnsub = settingsManager.subscribe('magnet_radius', refreshMagnetLevel);
  activeMagnetUnsub = settingsManager.subscribe('active_magnet_mod', refreshMagnetLevel);

  const destroy = () => {
    destroyed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (settingsUnsub) {
      try { settingsUnsub(); } catch {}
      settingsUnsub = null;
    }
    if (activeMagnetUnsub) {
      try { activeMagnetUnsub(); } catch {}
      activeMagnetUnsub = null;
    }
    if (syncInterval) clearInterval(syncInterval);
    try { window.removeEventListener('scroll', handleScroll); } catch {}
    try { window.removeEventListener('resize', handleResize); } catch {}
    try { window.removeEventListener('saveSlot:change', refreshMagnetLevel); } catch {}
    try { document.removeEventListener('ccc:upgrades:changed', refreshMagnetLevel); } catch {}
    try { playfield.removeEventListener('pointermove', updatePointerFromEvent); } catch {}
    try { playfield.removeEventListener('pointerdown', forceUpdateAndMove); } catch {}
    try { playfield.removeEventListener('pointerenter', handlePointerEnter); } catch {}
    try { playfield.removeEventListener('pointerleave', handlePointerLeave); } catch {}
    try { playfield.removeEventListener('pointercancel', handlePointerLeave); } catch {}
    try { window.removeEventListener('blur', resetPointerHistory); } catch {}
    try { indicator.remove(); } catch {}
  };

  const pointerOpts = { passive: true };

  playfield.addEventListener('pointermove', updatePointerFromEvent, pointerOpts);
  playfield.addEventListener('pointerdown', forceUpdateAndMove, pointerOpts);
  playfield.addEventListener('pointerenter', handlePointerEnter, pointerOpts);
  playfield.addEventListener('pointerleave', handlePointerLeave, pointerOpts);
  playfield.addEventListener('pointercancel', handlePointerLeave, pointerOpts);
  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('focus', updatePlayfieldRect, { passive: true });
  window.addEventListener('blur', resetPointerHistory, { passive: true });
  document.addEventListener('visibilitychange', () => {
      updatePlayfieldRect();
      if (document.hidden) resetPointerHistory();
  }, { passive: true });
  window.addEventListener('saveSlot:change', refreshMagnetLevel);
  document.addEventListener('ccc:upgrades:changed', refreshMagnetLevel);

  syncInterval = setInterval(updatePlayfieldRect, 1000);

  refreshMagnetLevel();

  return { destroy };
}

export function initInteractionBrush({ playfield, itemsLayer, itemSelector, isItemValid, spawner, collectBatch, collect }) {
  const BRUSH_R = 25; 
  let cachedPfRect = null;
  const updateCachedRect = () => {
      const w = document.documentElement.clientWidth;
      const h = document.documentElement.clientHeight;
      cachedPfRect = { left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 };
  };
  window.addEventListener('resize', updateCachedRect);
  window.addEventListener('scroll', updateCachedRect, { passive: true });
  updateCachedRect();

  let lastBrushLocalX = null;
  let lastBrushLocalY = null;

  const resetBrushHistory = () => {
      lastBrushLocalX = null;
      lastBrushLocalY = null;
  };

  playfield.addEventListener('pointerleave', resetBrushHistory, { passive: true });
  playfield.addEventListener('pointerenter', resetBrushHistory, { passive: true });
  window.addEventListener('blur', resetBrushHistory, { passive: true });

  function brushAt(x, y) {
    if (spawner && typeof spawner.findItemTargetsInRadius === 'function') {
        if (!cachedPfRect) updateCachedRect();
        const localX = x;
        const localY = y;
        
        let candidates = [];
        if (typeof spawner.findItemTargetsInPath === 'function' && lastBrushLocalX !== null && lastBrushLocalY !== null) {
            candidates = spawner.findItemTargetsInPath(lastBrushLocalX, lastBrushLocalY, localX, localY, BRUSH_R, true);
        } else {
            candidates = spawner.findItemTargetsInRadius(localX, localY, BRUSH_R, true);
        }
        
        lastBrushLocalX = localX;
        lastBrushLocalY = localY;

        if (candidates && candidates.length > 0) {
            const items = [];
            for (let i = 0; i < candidates.length; i++) {
                const c = candidates[i];
                const item = { coin: c };
                if (spawner.getItemTransform) {
                    item.opts = { transform: spawner.getItemTransform(c.el || c) };
                } else if (spawner.getCoinTransform) {
                    item.opts = { transform: spawner.getCoinTransform(c.el || c) };
                }
                items.push(item);
            }
            if(collectBatch) collectBatch(items);
        }
    } else if (spawner && typeof spawner.findCoinsInRadius === 'function') {
        if (!cachedPfRect) updateCachedRect();
        const localX = x; const localY = y;
        const candidates = spawner.findCoinsInRadius(localX, localY, BRUSH_R);
        lastBrushLocalX = localX; lastBrushLocalY = localY;
        if (candidates && candidates.length > 0) {
            const items = [];
            for(const el of candidates) {
                const t = spawner.getItemTransform ? spawner.getItemTransform(el) : (spawner.getCoinTransform ? spawner.getCoinTransform(el) : el.style.transform);
                items.push({ el, opts: { transform: t } });
            }
            if(collectBatch) collectBatch(items);
        }
    } else {
        const OFF = [[0,0],[18,0],[-18,0],[0,18],[0,-18]];
        const found = new Set();
        for (let k=0;k<OFF.length;k++){
          const px = x + OFF[k][0], py = y + OFF[k][1];
          const stack = document.elementsFromPoint(px, py);
          for (let i=0;i<stack.length;i++){
            const el = stack[i];
            if (isItemValid(el) && !found.has(el)) { found.add(el); }
          }
        }
        if (found.size > 0) {
            const items = [];
            found.forEach(el => items.push({ el }));
            if(collectBatch) collectBatch(items);
        }
    }
  }

  let pending = null, brushScheduled = false;
  function scheduleBrush(x, y){
    pending = {x, y};
    if (!brushScheduled){
      brushScheduled = true;
      requestAnimationFrame(() => {
        if (pending){ brushAt(pending.x, pending.y); pending = null; }
        brushScheduled = false;
      });
    }
  }

  const pointerOpts = { passive: true };
  const onPointerDown = (e) => scheduleBrush(e.clientX, e.clientY);
  const onPointerMove = (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); };
  const onPointerUp = (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); };
  const onMouseMove = (e) => scheduleBrush(e.clientX, e.clientY);

  playfield.addEventListener('pointerdown', onPointerDown, pointerOpts);
  playfield.addEventListener('pointermove', onPointerMove, pointerOpts);
  playfield.addEventListener('pointerup', onPointerUp, pointerOpts);
  playfield.addEventListener('mousemove', onMouseMove, pointerOpts);

  const rectInterval = setInterval(updateCachedRect, 1000);

  const onDelegatedInteract = (e) => {
    if (e.target === itemsLayer) return;
    const target = e.target.closest(itemSelector);
    if (target && isItemValid(target)) {
      let opts = {};
      if (spawner && typeof spawner.getItemTransform === 'function') {
          opts.transform = spawner.getItemTransform(target);
      } else if (spawner && typeof spawner.getCoinTransform === 'function') {
          opts.transform = spawner.getCoinTransform(target);
      }
      if(collect) collect(target, opts);
    }
  };

  return {
    rectInterval,
    onDelegatedInteract,
    destroy() {
      clearInterval(rectInterval);
      window.removeEventListener('resize', updateCachedRect);
      window.removeEventListener('scroll', updateCachedRect);
      window.removeEventListener('blur', resetBrushHistory);
      playfield.removeEventListener('pointerleave', resetBrushHistory);
      playfield.removeEventListener('pointerenter', resetBrushHistory);
      playfield.removeEventListener('pointerdown', onPointerDown);
      playfield.removeEventListener('pointermove', onPointerMove);
      playfield.removeEventListener('pointerup', onPointerUp);
      playfield.removeEventListener('mousemove', onMouseMove);
    }
  };
}
