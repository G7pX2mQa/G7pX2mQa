// js/game/spawnerCore.js
import { IS_MOBILE } from '../main.js';
import { settingsManager } from './settingsManager.js';

export const MAX_ACTIVE_ITEMS_MOBILE = 2500;

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


// Pre-rendered offscreen canvases for coins/items
const preRenderedCoins = new Map();
const preRenderedUrls = new Map();


export function clearPreRenderedCoins() {
    preRenderedCoins.clear();
    preRenderedUrls.clear();
}
export function getPreRenderedCoinUrl(src, size) {
    if (!src || typeof document === 'undefined') return src;
    
    let resolutionScale = 1;
    if (typeof settingsManager !== 'undefined') {
        const quality = settingsManager.get('graphics_quality') ?? 10;
        if (quality < 4) resolutionScale = 0.5;
        else if (quality < 8) resolutionScale = 0.75;
    }
    if (resolutionScale === 1) return src;
    
    let sizeMap = preRenderedUrls.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedUrls.set(src, sizeMap);
    }
    
    let url = sizeMap.get(size);
    if (!url) {
        const canvas = getPreRenderedCoin(src, size);
        if (canvas && canvas instanceof HTMLCanvasElement) {
            url = canvas.toDataURL('image/webp');
            sizeMap.set(size, url);
        } else {
            return src; // Fallback if still loading
        }
    }
    
    return url;
}

export function getPreRenderedCoin(src, size) {
    if (!src || typeof document === 'undefined') return null;
    
    let sizeMap = preRenderedCoins.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedCoins.set(src, sizeMap);
    }
    
    let canvas = sizeMap.get(size);
    if (!canvas) {
        const img = getImage(src);
        if (!img || !img.complete || img.naturalWidth === 0) {
            if (img && !img.complete) {
                img.addEventListener('load', () => getPreRenderedCoin(src, size), { once: true });
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
        onClearPlayfield = () => {}
    } = config;

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
    let canvasDirty = false;

    if (refs.c) {
        // We only create ONE canvas, but we'll still keep it in `canvases[0]` and `contexts[0]`
        // and when rendering, we'll sort the settled items by their `sizeIndex` so they appear layered.
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '10'; // Unified z-index base
        refs.c.appendChild(canvas);
        
        const ctx = canvas.getContext('2d', { alpha: true });
        canvases.push(canvas);
        contexts.push(ctx);
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
        
        canvasDirty = true;

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
    const dirtyRegions = [];

    function makeItem() {
        const el = document.createElement('div');
        el.className = 'coin'; // Maintain generic class, can be overridden by consumer
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
       
       el.classList.remove('coin--collected');
       for (let i = 0; i <= 6; i++) el.classList.remove(`coin--size-${i}`);
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
        }
        
        if (itemObj.el) {
            releaseItem(itemObj.el);
            itemObj.el = null;
        } else {
            dirtyRegions.push({
                layer: itemObj.sizeIndex || 0,
                x: itemObj.x,
                y: itemObj.y,
                size: itemObj.size || baseItemSize
            });
        }
        onRemoveItem(itemObj);
    }
    
    function detachItem(itemElOrObj) {
        const itemObj = itemElOrObj._coinObj || itemElOrObj;
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
            }
            if (itemElOrObj._coinObj) itemElOrObj._coinObj = null;
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
        if (newlySettledBuffer.length > 0) {
            for (let i = 0; i < newlySettledBuffer.length; i++) {
                const c = newlySettledBuffer[i];
                if (!c.isRemoved && c.settled && !c.el) {
                    dirtyRegions.push({
                        layer: c.sizeIndex || 0,
                        x: c.x,
                        y: c.y,
                        size: c.size || baseItemSize
                    });
                }
            }
            newlySettledBuffer.length = 0;
        }

        let hasMovingItems = false;
        for (let i = 0; i < activeItems.length; i++) {
            const c = activeItems[i];
            if (c && !c.settled && !c.isRemoved && !c.el) {
                hasMovingItems = true;
                break;
            }
        }
        
        if (hasMovingItems) {
            canvasDirty = true;
        }

        if (!canvasDirty && dirtyRegions.length === 0) return;
        
        const ctx = contexts[0];
        if (!ctx) return;

        if (canvasDirty) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvases[0].width, canvases[0].height);
            ctx.restore();

            // Collect all items
            const toDraw = [];
            const count = activeItems.length;
            for (let i = 0; i < count; i++) {
                const c = activeItems[i];
                if (c && !c.isRemoved && !c.el && !c.isHiddenPreAllocated && !c.isStrikePlaceholder) {
                    toDraw.push(c);
                }
            }
            
            // Sort by sizeIndex (Z-index layer)
            toDraw.sort((a, b) => (a.sizeIndex || 0) - (b.sizeIndex || 0));
            
            for (let i = 0; i < toDraw.length; i++) {
                const c = toDraw[i];
                if (!c.settled) {
                    const state = getItemState(c, now);
                    onDrawSingleSettledItem(ctx, { ...c, x: state.x, y: state.y, rot: state.rot, scale: state.scale });
                } else {
                    onDrawSingleSettledItem(ctx, c);
                }
            }

            canvasDirty = false;
            dirtyRegions.length = 0;
        } else {
            if (dirtyRegions.length > 0) {
                // Group all dirty regions into one list
                const regions = [];
                for (let i = 0; i < dirtyRegions.length; i++) {
                    const r = dirtyRegions[i];
                    const pad = 8;
                    const cx = Math.floor(r.x - pad);
                    const cy = Math.floor(r.y - pad);
                    const cSize = Math.ceil(r.size + (pad * 2)) + 1;
                    
                    regions.push({
                        minX: cx, maxX: cx + cSize,
                        minY: cy, maxY: cy + cSize,
                        cx, cy, cSize
                    });
                }
                
                if (regions.length > 0) {
                    ctx.save();
                    ctx.beginPath();
                    for (let rIdx = 0; rIdx < regions.length; rIdx++) {
                        const r = regions[rIdx];
                        ctx.rect(r.cx, r.cy, r.cSize, r.cSize);
                    }
                    ctx.clip();
                    for (let rIdx = 0; rIdx < regions.length; rIdx++) {
                        const r = regions[rIdx];
                        ctx.clearRect(r.cx, r.cy, r.cSize, r.cSize);
                    }
                    
                    // Collect items intersecting with regions
                    const toDraw = [];
                    const count = activeItems.length;
                    for (let j = 0; j < count; j++) {
                        const c = activeItems[j];
                        if (!c || c.isRemoved || c.el || c.isHiddenPreAllocated || c.isStrikePlaceholder) continue;
                        
                        const cSize2 = c.size || baseItemSize;
                        let cMinX = c.x, cMaxX = c.x + cSize2, cMinY = c.y, cMaxY = c.y + cSize2;
                        
                        if (!c.settled) {
                            const state = getItemState(c, now);
                            cMinX = state.x;
                            cMaxX = state.x + cSize2;
                            cMinY = state.y;
                            cMaxY = state.y + cSize2;
                        }
                        
                        let intersects = false;
                        for (let rIdx = 0; rIdx < regions.length; rIdx++) {
                            const r = regions[rIdx];
                            if (cMaxX > r.minX && cMinX < r.maxX && cMaxY > r.minY && cMinY < r.maxY) {
                                intersects = true;
                                break;
                            }
                        }
                        
                        if (intersects) {
                             toDraw.push(c);
                        }
                    }
                    
                    // Sort intersecting items by layer index
                    toDraw.sort((a, b) => (a.sizeIndex || 0) - (b.sizeIndex || 0));
                    
                    for (let i = 0; i < toDraw.length; i++) {
                        const c = toDraw[i];
                        if (!c.settled) {
                            const state = getItemState(c, now);
                            onDrawSingleSettledItem(ctx, { ...c, x: state.x, y: state.y, rot: state.rot, scale: state.scale });
                        } else {
                            onDrawSingleSettledItem(ctx, c);
                        }
                    }
                    
                    ctx.restore();
                }
                dirtyRegions.length = 0;
            }
        }
    }

    let rate = itemsPerSecond;
    let rafId = null;
    let last = performance.now();
    let carry = 0;
    
    function loop(now) {
      if (!M.pfRect) computeMetrics();

      let dt = (now - last) / 1000;
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
      if (garbageCount > 50) {
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
        if (fxCtx && fxCanvas) {
            fxCtx.save();
            fxCtx.setTransform(1, 0, 0, 1, 0, 0);
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
            fxCtx.restore();
        }
        newlySettledBuffer.length = 0;
        dirtyRegions.length = 0;
        canvasDirty = false;
        if (resetType !== 'underwater_cavern') {
            clearBacklog();
        }
    }

    function getItemTransform(elOrObj) {
        const c = elOrObj._coinObj || elOrObj;
        if (!c) return (elOrObj.style && elOrObj.style.transform) || 'translate3d(0,0,0)';
        const { x, y, rot, scale } = getItemState(c, performance.now());
        return `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    }

    function ensureItemVisual(c) {
        if (c.el) return c.el;
        if (c.isRemoved) return null;
        
        const el = getItem();
        onEnsureItemVisual(el, c);
        
        el._coinObj = c;
        c.el = el;
        refs.c.appendChild(el);
        
        dirtyRegions.push({
            layer: c.sizeIndex || 0,
            x: c.x,
            y: c.y,
            size: c.size || baseItemSize
        });
        
        return el;
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          if (typeof shouldAutoResume === 'function' && !shouldAutoResume()) return;
          if (typeof window !== 'undefined' && (window.__tsunamiActive || window.__bossFightSequenceActive || window.__mapSequenceActive)) return;
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
        forceCanvasRedraw: () => { canvasDirty = true; },
        getRefs: () => refs,
    };
}
