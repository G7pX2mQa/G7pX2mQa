// js/game/spawnerCore.js
import { IS_MOBILE } from '../util/platformChecker.js';
import { settingsManager } from './settingsManager.js';

export const MAX_ACTIVE_ITEMS_MOBILE = 2500;
export const MAX_VISUALS = 15;

export function easeOutCubic(t) {
  const f = 1 - t;
  return 1 - f * f * f;
}

export const CUBIC_BEZIER = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

export function getCanvasSmoothingQuality() {
    const quality = settingsManager.get('graphics_quality');
    if (quality === undefined) return 'high';
    if (quality >= 8) return 'high';
    if (quality >= 4) return 'medium';
    return 'low';
}

const imgCache = new Map();

export function getImage(src) {
  if (!src) return null;
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
  return img;
}


// Pre-rendered offscreen canvases for items
const preRenderedItems = new Map();
const preRenderedItemUrls = new Map();


export function clearPreRenderedItems() {
    preRenderedItems.clear();
    preRenderedItemUrls.clear();
}
export function getPreRenderedItemUrl(src, size) {
    if (!src || typeof document === 'undefined') return src;
    
    let resolutionScale = 1;
    if (typeof settingsManager !== 'undefined') {
        const quality = settingsManager.get('graphics_quality') ?? 10;
        if (quality < 4) resolutionScale = 0.5;
        else if (quality < 8) resolutionScale = 0.75;
    }
    if (resolutionScale === 1) return src;
    
    let sizeMap = preRenderedItemUrls.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedItemUrls.set(src, sizeMap);
    }
    
    let url = sizeMap.get(size);
    if (!url) {
        const canvas = getPreRenderedItem(src, size);
        if (canvas && canvas instanceof HTMLCanvasElement) {
            url = canvas.toDataURL('image/webp');
            sizeMap.set(size, url);
        } else {
            return src; // Fallback if still loading
        }
    }
    
    return url;
}

export function getPreRenderedItem(src, size) {
    if (!src || typeof document === 'undefined') return null;
    
    let sizeMap = preRenderedItems.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedItems.set(src, sizeMap);
    }
    
    let canvas = sizeMap.get(size);
    if (!canvas) {
        const img = getImage(src);
        if (!img || !img.complete || img.naturalWidth === 0) {
            if (img && !img.complete) {
                img.addEventListener('load', () => getPreRenderedItem(src, size), { once: true });
            }
            return img; 
        }
        
        let resolutionScale = 1;
        let isMaxQuality = false;
        if (typeof settingsManager !== 'undefined') {
            const quality = settingsManager.get('graphics_quality') ?? 10;
            if (quality === 10) {
                isMaxQuality = true;
            } else if (quality < 4) {
                resolutionScale = 0.5;
            } else if (quality < 8) {
                resolutionScale = 0.75;
            }
        }
        
        let dpr;
        if (isMaxQuality) {
            const baseDpr = Math.max(Math.min(window.devicePixelRatio || 1, 2), 1);
            dpr = baseDpr * resolutionScale;
        } else {
            const baseDpr = Math.max(Math.min(window.devicePixelRatio || 1, 1.5), 1);
            dpr = baseDpr * resolutionScale;
        }
        
        canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(size * dpr));
        canvas.height = Math.max(1, Math.floor(size * dpr));
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = getCanvasSmoothingQuality();
        ctx.drawImage(img, 0, 0, size, size);
        
        sizeMap.set(size, canvas);
    }
    
    return canvas;
}

export function createBaseSpawner(config = {}) {
    const {
        playfieldSelector = '.playfield',
        waterSelector = '#water-background',
        itemsHostSelector = '.coins-layer', // Generic name
        baseItemSize = 40,
        animationDurationMs = 1500,
        itemsPerSecond = 1,
        perFrameBudget = 24,
        maxActiveItems = IS_MOBILE ? MAX_ACTIVE_ITEMS_MOBILE : 5000,
        initialBurst = 0,
        itemTtlMs = 1e99,
        shouldAutoResume = () => true,
        numLayers = 7, // For z-index canvas layers
        
        // Hooks
        onPlanSpawn = () => null,
        onCommitBatch = () => {},
        onItemUpdate = () => {},
        onGarbageCollect = () => {},
        onDrawFx = () => {},
        onDrawSingleSettledItem = () => {},
        onEnsureItemVisual = () => {},
        onRemoveItem = () => {},
        onClearPlayfield = () => {},
        onDrawHitbox = null
    } = config;

    if (typeof onDrawHitbox !== 'function') {
        throw new Error('[BaseSpawner] Fatal: onDrawHitbox must be defined in the spawner configuration.');
    }

    const refs = {
        pf: document.querySelector(playfieldSelector),
        w: document.querySelector(waterSelector),
        c: document.querySelector(itemsHostSelector),
        hud: document.getElementById('hud-bottom-wrapper') || document.getElementById('hud-bottom'),
    };

    function validRefs() {
        return !!(refs.pf && refs.c);
    }

    if (!validRefs()) {
        console.warn('[BaseSpawner] Missing required nodes. Check selectors:', {
            playfieldSelector, waterSelector, itemsHostSelector
        });
    }

    const canvases = [];
    const contexts = [];
    const inMemoryCanvases = [];
    const inMemoryContexts = [];
    let staticCanvasDirty = false;

    if (refs.c) {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '10'; 
        refs.c.appendChild(canvas);
        
        const ctx = canvas.getContext('2d', { alpha: true });
        canvases.push(canvas);
        contexts.push(ctx);
    }

    function getInMemoryContext(layer, w, h, dpr) {
        if (!inMemoryCanvases[layer]) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { alpha: true });
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = getCanvasSmoothingQuality();
            inMemoryCanvases[layer] = canvas;
            inMemoryContexts[layer] = ctx;
        }
        return inMemoryContexts[layer];
    }

    let fxCanvas = null;
    let fxCtx = null;
    if (refs.c) {
        fxCanvas = document.createElement('canvas');
        fxCanvas.style.position = 'absolute';
        fxCanvas.style.inset = '0';
        fxCanvas.style.pointerEvents = 'none';
        fxCanvas.style.zIndex = '100'; 
        refs.c.appendChild(fxCanvas);
        fxCtx = fxCanvas.getContext('2d', { alpha: true });
    }

    let M = {
        pfRect: null,
        wRect: null,
        safeBottom: 0,
        pfW: 0
    };

    function computeMetrics() {
        if (!validRefs()) return false;
        const pfRect = refs.pf.getBoundingClientRect();
        const wRect = refs.w ? refs.w.getBoundingClientRect() : null;
        const hudH = refs.hud ? refs.hud.getBoundingClientRect().height : 0;

        M = {
            pfRect,
            wRect,
            safeBottom: pfRect.height - hudH,
            pfW: pfRect.width
        };

        let dpr = Math.max(Math.min(window.devicePixelRatio || 1, 2.0), 1); // HARD CAP DPR to 2.0 to save VRAM
        if (typeof settingsManager !== "undefined") {
            const quality = settingsManager.get("graphics_quality") ?? 10;
            if (quality < 4) {
                dpr = Math.max(0.5, dpr * 0.5);
            } else if (quality < 8) {
                dpr = Math.max(0.75, dpr * 0.75);
            }
        }
        
        canvases.forEach((canvas, i) => {
            if (canvas) {
                canvas.width = pfRect.width * dpr;
                canvas.height = pfRect.height * dpr;
                canvas.style.width = pfRect.width + 'px';
                canvas.style.height = pfRect.height + 'px';
                
                const ctx = contexts[i];
                if (ctx) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(dpr, dpr);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = getCanvasSmoothingQuality();
                }
            }
        });

        for (let i = 0; i < inMemoryCanvases.length; i++) {
            const canvas = inMemoryCanvases[i];
            if (canvas) {
                canvas.width = pfRect.width * dpr;
                canvas.height = pfRect.height * dpr;
                
                const ctx = inMemoryContexts[i];
                if (ctx) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(dpr, dpr);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = getCanvasSmoothingQuality();
                }
            }
        }
        
        staticCanvasDirty = true;

        if (fxCanvas) {
             fxCanvas.width = pfRect.width * dpr;
             fxCanvas.height = pfRect.height * dpr;
             fxCanvas.style.width = pfRect.width + 'px';
             fxCanvas.style.height = pfRect.height + 'px';
             
             if (fxCtx) {
                 fxCtx.setTransform(1, 0, 0, 1, 0, 0);
                 fxCtx.scale(dpr, dpr);
             }
        }

        return true;
    }

    computeMetrics();

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => computeMetrics()) : null;
    if (ro && refs.pf)
        ro.observe(refs.pf);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) computeMetrics();
    });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const ITEM_POOL_MAX = Math.max(2000, maxActiveItems * 3);
    const itemPool = [];

    const activeItems = [];
    let garbageCount = 0;
    const newlySettledBuffer = [];
    
    function makeItem() {
        const el = document.createElement('div');
        el.className = 'spawner-item'; // Maintain generic class, can be overridden by consumer
        el.style.position = 'absolute';
        el.style.pointerEvents = 'auto';
        el.style.borderRadius = '50%';
        el.style.willChange = 'transform';
        el.style.contain = 'layout style size';
        
        const inner = document.createElement('img');
        inner.className = 'item-inner';
        inner.draggable = false;
        inner.alt = '';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.objectFit = 'contain';
        inner.style.borderRadius = '50%';
        
        el.appendChild(inner);
        return el;
    }
    const getItem = () => (itemPool.length ? itemPool.pop() : makeItem());
    
    function releaseItem(el) {
       el.style.transition = '';
       el.style.transform = '';
       el.style.opacity = '1';
       
       el.classList.remove('item--collected');
       for (let i = 0; i <= 6; i++) {
           el.classList.remove(`coin--size-${i}`);
       }
       el.style.removeProperty('--ccc-start');

       delete el.dataset.dieAt;
       delete el.dataset.mutationLevel;
       delete el.dataset.collected;
       
       el.style.willChange = 'transform';
       
       if (el.parentNode) el.remove();
       if (itemPool.length < ITEM_POOL_MAX) itemPool.push(el);
    }
    
    function removeItem(itemObj, knownIndex = -1) {
        if (itemObj.isRemoved) return;
        itemObj.isRemoved = true;
        
        let idx = knownIndex;
        if (idx === -1 || activeItems[idx] !== itemObj) {
            if (itemObj.index !== undefined && activeItems[itemObj.index] === itemObj) {
                idx = itemObj.index;
            } else {
                idx = activeItems.indexOf(itemObj);
            }
        }
        if (idx !== -1) {
            activeItems[idx] = null;
            garbageCount++;
            staticCanvasDirty = true;
        }
        
        if (itemObj.el) {
            releaseItem(itemObj.el);
            itemObj.el = null;
        }
        onRemoveItem(itemObj);
    }
    
    function detachItem(itemElOrObj) {
        const itemObj = itemElOrObj._itemObj || itemElOrObj;
        if (itemObj) {
            let idx = -1;
            if (itemObj.index !== undefined && activeItems[itemObj.index] === itemObj) {
                idx = itemObj.index;
            } else {
                idx = activeItems.indexOf(itemObj);
            }

            if (idx !== -1) {
                activeItems[idx] = null;
                garbageCount++;
                staticCanvasDirty = true;
            }
            if (itemElOrObj._itemObj) itemElOrObj._itemObj = null;
        }
    }

    function spawnBurst(n = 1) {
        if (!validRefs()) return;
        if (!M.pfRect) computeMetrics();
        const batch = [];
        for (let i = 0; i < n; i++) {
            const plan = onPlanSpawn(M, activeItems, garbageCount, removeItem, maxActiveItems, batch.length);
            if (plan) {
                if (Array.isArray(plan)) {
                    batch.push(...plan);
                } else {
                    batch.push(plan);
                }
            }
        }
        if (batch.length) {
            onCommitBatch(batch, activeItems, getItem, refs, animationDurationMs);
        }
    }

    function getItemState(c, now) {
        if (c.settled || c.isRemoved) {
            return { x: c.x, y: c.y, rot: 0, scale: 1 };
        }
        const elapsed = now - c.startTime;
        if (elapsed < 0 && !settingsManager.get('insta_teleport')) {
            return { x: c.startX, y: c.startY, rot: -10, scale: 0.96 };
        }
        let t = elapsed / c.duration;
        if (t >= 1 || settingsManager.get('insta_teleport')) {
             return { x: c.endX, y: c.endY, rot: 0, scale: 1 };
        }
        const ease = easeOutCubic(t);
        const x = c.startX + (c.endX - c.startX) * ease;
        const y = c.startY + (c.endY - c.startY) * ease;
        const rot = -10 + (10 * ease);
        const scale = 0.96 + (0.04 * ease);
        return { x, y, rot, scale };
    }

    function drawItems(now) {
        const mainCtx = contexts[0];
        if (!mainCtx) return;

        let dpr = Math.max(Math.min(window.devicePixelRatio || 1, 2.0), 1);
        if (typeof settingsManager !== "undefined") {
            const quality = settingsManager.get("graphics_quality") ?? 10;
            if (quality < 4) dpr = Math.max(0.5, dpr * 0.5);
            else if (quality < 8) dpr = Math.max(0.75, dpr * 0.75);
        }

        const w = canvases[0].width;
        const h = canvases[0].height;

        // If items settled, stamp them onto their respective in-memory layer contexts without a full redraw
        if (newlySettledBuffer.length > 0 && !staticCanvasDirty) {
            for (let i = 0; i < newlySettledBuffer.length; i++) {
                const c = newlySettledBuffer[i];
                if (c && !c.isRemoved && c.settled && !c.el && !c.isHiddenPreAllocated && !c.isStrikePlaceholder) {
                    const layer = c.sizeIndex || 0;
                    const ctx = getInMemoryContext(layer, w, h, dpr);
                    onDrawSingleSettledItem(ctx, c);
                }
            }
            newlySettledBuffer.length = 0;
        } else if (newlySettledBuffer.length > 0 && staticCanvasDirty) {
            // If dirty, they will be drawn anyway during the full redraw
            newlySettledBuffer.length = 0;
        }

        if (staticCanvasDirty) {
            // Clear all offscreen layer canvases
            for (let i = 0; i < inMemoryCanvases.length; i++) {
                if (inMemoryContexts[i] && inMemoryCanvases[i]) {
                    inMemoryContexts[i].save();
                    inMemoryContexts[i].setTransform(1, 0, 0, 1, 0, 0);
                    inMemoryContexts[i].clearRect(0, 0, inMemoryCanvases[i].width, inMemoryCanvases[i].height);
                    inMemoryContexts[i].restore();
                }
            }

            const staticBuckets = [];
            const count = activeItems.length;
            
            for (let i = 0; i < count; i++) {
                const c = activeItems[i];
                if (c && c.settled && !c.isRemoved && !c.el && !c.isHiddenPreAllocated && !c.isStrikePlaceholder) {
                    const layer = c.sizeIndex || 0;
                    if (!staticBuckets[layer]) staticBuckets[layer] = [];
                    staticBuckets[layer].push(c);
                }
            }

            for (let b = 0; b < staticBuckets.length; b++) {
                const bucket = staticBuckets[b];
                if (!bucket) continue;
                
                const ctx = getInMemoryContext(b, w, h, dpr);
                for (let i = 0; i < bucket.length; i++) {
                    onDrawSingleSettledItem(ctx, bucket[i]);
                }
            }
            
            staticCanvasDirty = false;
        }

        // Always redraw main composite canvas
        mainCtx.save();
        mainCtx.setTransform(1, 0, 0, 1, 0, 0);
        mainCtx.clearRect(0, 0, canvases[0].width, canvases[0].height);
        mainCtx.restore();

        const dynamicBuckets = [];
        const count = activeItems.length;
        
        for (let i = 0; i < count; i++) {
            const c = activeItems[i];
            if (c && !c.settled && !c.isRemoved && !c.el && !c.isHiddenPreAllocated && !c.isStrikePlaceholder) {
                const layer = c.sizeIndex || 0;
                if (!dynamicBuckets[layer]) dynamicBuckets[layer] = [];
                dynamicBuckets[layer].push(c);
            }
        }

        const maxLayer = Math.max(inMemoryCanvases.length, dynamicBuckets.length);

        for (let layer = 0; layer < maxLayer; layer++) {
            // Draw static/settled items for this layer
            if (inMemoryCanvases[layer]) {
                mainCtx.save();
                mainCtx.setTransform(1, 0, 0, 1, 0, 0); // drawImage works 1:1 on device pixels
                mainCtx.drawImage(inMemoryCanvases[layer], 0, 0);
                mainCtx.restore();
            }

            // Draw moving items for this layer
            const movingBucket = dynamicBuckets[layer];
            if (movingBucket) {
                for (let i = 0; i < movingBucket.length; i++) {
                    const c = movingBucket[i];
                    const state = getItemState(c, now);
                    onDrawSingleSettledItem(mainCtx, { ...c, x: state.x, y: state.y, rot: state.rot, scale: state.scale });
                }
            }
        }

        if (window.__showHitboxes) {
            mainCtx.save();
            mainCtx.strokeStyle = 'rgb(0, 255, 0)';
            mainCtx.lineWidth = 2;

            for (let i = 0; i < activeItems.length; i++) {
                const c = activeItems[i];
                if (c && !c.isRemoved && !c.isHiddenPreAllocated && !c.isStrikePlaceholder) {
                    const state = c.settled ? { x: c.x, y: c.y } : getItemState(c, now);
                    const size = c.size || 0;
                    if (size > 0) {
                        const cx = state.x + size / 2;
                        const cy = state.y + size / 2;
                        
                        onDrawHitbox(mainCtx, c, cx, cy, size);
                    }
                }
            }
            mainCtx.restore();
        }
    }

    let rate = itemsPerSecond;
    let rafId = null;
    let last = performance.now();
    let carry = 0;
    
    function loop(now) {
      if (!M.pfRect) computeMetrics();

      let rawDt = now - last;
      let dt = rawDt / 1000;
      if (rawDt > 250) {
          staticCanvasDirty = true;
      }
      last = now;
      if (dt > 0.1) dt = 0.1;
      
      onItemUpdate(activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState);

      carry += rate * dt;
      let spawnCount = Math.floor(carry);
      
      if (spawnCount > 0) {
          carry -= spawnCount;
          let spawnTarget = Math.min(spawnCount, perFrameBudget);
          
          if (spawnTarget > 0) {
             const t0 = performance.now();
             const batch = [];
             const timeBudgetMs = 5.0;
             
             for (let i = 0; i < spawnTarget; i++) {
                if (performance.now() - t0 > timeBudgetMs) break;
                const plan = onPlanSpawn(M, activeItems, garbageCount, removeItem, maxActiveItems, batch.length);
                if (plan) {
                    if (Array.isArray(plan)) {
                        batch.push(...plan);
                    } else {
                        batch.push(plan);
                    }
                }
             }
             if (batch.length) {
                 onCommitBatch(batch, activeItems, getItem, refs, animationDurationMs);
             }
          }
      }

      drawItems(now);
      if (garbageCount > Math.max(500, activeItems.length * 0.1)) {
          onGarbageCollect(activeItems);
          let w = 0;
          for (let r = 0; r < activeItems.length; r++) {
              const c = activeItems[r];
              if (c !== null) {
                  c.index = w;
                  activeItems[w++] = c;
              }
          }
          activeItems.length = w;
          garbageCount = 0;
      }
      if (fxCtx && fxCanvas) {
          onDrawFx(fxCtx, fxCanvas, dt, now, getItemState);
      }

      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (rafId) return;
      if (typeof window !== 'undefined' && window.__mapSequenceActive) return;
      if (!validRefs()) {
        console.warn('[BaseSpawner] start() called but required nodes are missing.');
        return;
      }
      computeMetrics();
      // Ensure metrics are accurate once layout stabilizes
      requestAnimationFrame(() => computeMetrics());

      if (initialBurst > 0 && rafId === null) {
        spawnBurst(initialBurst);
      }

      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (!rafId) return;
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    function setRate(n) {
        rate = Math.max(0, Number(n) || 0);
    }

    function clearBacklog() {
        carry = 0;
        last = performance.now();
    }

    function clearPlayfield(resetType) {
        onClearPlayfield(activeItems, removeItem, resetType);
        
        contexts.forEach((ctx, i) => {
            if (!ctx || !canvases[i]) return;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvases[i].width, canvases[i].height);
            ctx.restore();
        });

        // Clear all in-memory static canvases so ghost items do not remain
        for (let i = 0; i < inMemoryCanvases.length; i++) {
            if (inMemoryContexts[i] && inMemoryCanvases[i]) {
                inMemoryContexts[i].save();
                inMemoryContexts[i].setTransform(1, 0, 0, 1, 0, 0);
                inMemoryContexts[i].clearRect(0, 0, inMemoryCanvases[i].width, inMemoryCanvases[i].height);
                inMemoryContexts[i].restore();
            }
        }

        if (fxCtx && fxCanvas) {
            fxCtx.save();
            fxCtx.setTransform(1, 0, 0, 1, 0, 0);
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
            fxCtx.restore();
        }
        newlySettledBuffer.length = 0;
        staticCanvasDirty = false;
        if (resetType !== 'underwater_cavern') {
            clearBacklog();
        }
    }

    function getItemTransform(elOrObj) {
        const c = elOrObj._itemObj || elOrObj;
        if (!c) return (elOrObj.style && elOrObj.style.transform) || 'translate3d(0,0,0)';
        const { x, y, rot, scale } = getItemState(c, performance.now());
        return `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    }

    function ensureItemVisual(c) {
        if (c.el) return c.el;
        if (c.isRemoved) return null;
        
        const el = getItem();
        onEnsureItemVisual(el, c);
        
        el._itemObj = c;
        c.el = el;
        refs.c.appendChild(el);
        
        staticCanvasDirty = true;
        return el;
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          if (typeof shouldAutoResume === 'function' && !shouldAutoResume()) return;
          if (typeof window !== 'undefined' && (window.__tsunamiActive || window.__bossFightSequenceActive || window.__mapSequenceActive)) return;
          staticCanvasDirty = true;
          if (!rafId) start();
        }
    });

    return {
        start,
        stop,
        setRate,
        clearBacklog,
        clearPlayfield,
        getItemTransform,
        ensureItemVisual,
        removeItemTarget: removeItem,
        detachItem,
        recycleItem: releaseItem,
        spawnBurst,
        getActiveItems: () => activeItems,
        getItemState,
        forceCanvasRedraw: () => { staticCanvasDirty = true; },
        getRefs: () => refs,
    };
}
