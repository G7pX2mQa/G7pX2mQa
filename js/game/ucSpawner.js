import { IS_MOBILE } from '../main.js';
import { playAudio } from '../util/audioManager.js';
import { settingsManager } from './settingsManager.js';

const MATERIALS = [
    'stone',
    'copper',
    'iron',
    'gold',
    'diamond',
    'emerald',
    'ruby',
    'obsidian',
    'unobtainium',
    'prismatium'
];

const MATERIAL_SIZES = [];
for (let i = 0; i < MATERIALS.length; i++) {
    MATERIAL_SIZES.push(40 * Math.pow(1.1, i));
}

const MAX_ACTIVE_MATERIALS_MOBILE = 2500;

const imgCache = new Map();
const preRenderedMaterials = new Map();
const preRenderedMaterialUrls = new Map();

function getCanvasSmoothingQuality() {
    const quality = settingsManager.get('graphics_quality');
    if (quality === undefined) return 'high';
    if (quality >= 8) return 'high';
    if (quality >= 4) return 'medium';
    return 'low';
}

function easeOutCubic(t) {
  const f = 1 - t;
  return 1 - f * f * f;
}
const CUBIC_BEZIER = 'cubic-bezier(0.215, 0.61, 0.355, 1)';

function getImage(src) {
  if (!src) return null;
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
  return img;
}

function getPreRenderedMaterialUrl(src, size) {
    if (!src || typeof document === 'undefined') return src;
    
    let resolutionScale = 1;
    if (typeof settingsManager !== 'undefined') {
        const quality = settingsManager.get('graphics_quality') ?? 10;
        if (quality < 4) resolutionScale = 0.5;
        else if (quality < 8) resolutionScale = 0.75;
    }
    if (resolutionScale === 1) return src;
    
    let sizeMap = preRenderedMaterialUrls.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedMaterialUrls.set(src, sizeMap);
    }
    
    let url = sizeMap.get(size);
    if (!url) {
        const canvas = getPreRenderedMaterial(src, size);
        if (canvas && canvas instanceof HTMLCanvasElement) {
            url = canvas.toDataURL('image/webp');
            sizeMap.set(size, url);
        } else {
            return src;
        }
    }
    return url;
}

function getPreRenderedMaterial(src, size) {
    if (!src || typeof document === 'undefined') return null;
    
    let sizeMap = preRenderedMaterials.get(src);
    if (!sizeMap) {
        sizeMap = new Map();
        preRenderedMaterials.set(src, sizeMap);
    }
    
    let canvas = sizeMap.get(size);
    if (!canvas) {
        const img = getImage(src);
        if (!img || !img.complete || img.naturalWidth === 0) {
            if (img && !img.complete) {
                img.addEventListener('load', () => getPreRenderedMaterial(src, size), { once: true });
            }
            return img;
        }
        
        let resolutionScale = 1;
        let isMaxQuality = false;
        if (typeof settingsManager !== 'undefined') {
            const quality = settingsManager.get('graphics_quality') ?? 10;
            if (quality === 10) isMaxQuality = true;
            else if (quality < 4) resolutionScale = 0.5;
            else if (quality < 8) resolutionScale = 0.75;
        }
        
        let dpr;
        if (isMaxQuality) {
            dpr = Math.max(window.devicePixelRatio || 1, 3) * resolutionScale;
        } else {
            dpr = Math.max(window.devicePixelRatio || 1, 2) * resolutionScale;
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

export function createUcSpawner({
    playfieldSelector = '.playfield',
    waterSelector = '#water-background',
    materialsHost = '.coins-layer', // Reusing the same container div
    animationDurationMs = 1500,
    initialRate = 0.2,
    maxActiveMaterials = IS_MOBILE ? MAX_ACTIVE_MATERIALS_MOBILE : 10000,
    materialTtlMs = 1e99,
    spawnSoundSrc = 'sounds/got_our_pickaxe_swinging_from_side_to_side.ogg',
    spawnSoundDesktopVolume = 0.45,
    spawnSoundMobileVolume  = 0.2,
    shouldAutoResume = () => true,
} = {}) {

    const refs = {
        pf: document.querySelector(playfieldSelector),
        w: document.querySelector(waterSelector),
        c: document.querySelector(materialsHost),
    };

    function validRefs() {
        return !!(refs.pf && refs.w && refs.c);
    }

    const NUM_LAYERS = MATERIALS.length;
    const canvases = [];
    const contexts = [];
    let canvasDirty = false;

    if (refs.c) {
        for (let i = 0; i < NUM_LAYERS; i++) {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.inset = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = `${10 + i}`; 
            refs.c.appendChild(canvas);
            
            const ctx = canvas.getContext('2d', { alpha: true });
            canvases.push(canvas);
            contexts.push(ctx);
        }
    }

    const M = {
        pfRect: null,
        wRect: null,
        pfW: 0, pfH: 0,
        safeBottom: 0
    };

    let dpr = 1;
    let baseDpr = 1;

    function computeMetrics() {
        if (!validRefs()) return false;
        
        M.pfRect = refs.pf.getBoundingClientRect();
        M.wRect = refs.w.getBoundingClientRect();
        M.pfW = M.pfRect.width;
        M.pfH = M.pfRect.height;

        const hudTop = document.getElementById('hud-bottom-wrapper') || document.getElementById('hud-bottom');
        if (hudTop) {
            const hRect = hudTop.getBoundingClientRect();
            M.safeBottom = hRect.top - M.pfRect.top;
        } else {
            M.safeBottom = M.pfH;
        }

        let resolutionScale = 1;
        let isMaxQuality = false;
        const quality = settingsManager.get('graphics_quality') ?? 10;
        if (quality === 10) isMaxQuality = true;
        else if (quality < 4) resolutionScale = 0.5;
        else if (quality < 8) resolutionScale = 0.75;
        
        if (isMaxQuality) {
            baseDpr = Math.max(window.devicePixelRatio || 1, 3);
            dpr = baseDpr * resolutionScale;
        } else {
            baseDpr = Math.max(window.devicePixelRatio || 1, 2);
            dpr = baseDpr * resolutionScale;
        }

        canvases.forEach((canvas, i) => {
            const ctx = contexts[i];
            if (canvas) {
                canvas.width = Math.max(1, M.pfW * dpr);
                canvas.height = Math.max(1, M.pfH * dpr);
                canvas.style.width = M.pfW + 'px';
                canvas.style.height = M.pfH + 'px';
                
                if (ctx) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(dpr, dpr);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = getCanvasSmoothingQuality();
                }
            }
        });
        
        canvasDirty = true;
        return true;
    }

    computeMetrics();

    settingsManager.subscribe('graphics_quality', () => {
        if (typeof preRenderedMaterials !== 'undefined') preRenderedMaterials.clear();
        if (typeof preRenderedMaterialUrls !== 'undefined') preRenderedMaterialUrls.clear();
        computeMetrics();
        
        for (let i = 0; i < activeMaterials.length; i++) {
            const c = activeMaterials[i];
            if (c && c.el && !c.settled && !c.isRemoved) {
                if (c.el.firstChild) {
                    c.el.firstChild.src = getPreRenderedMaterialUrl(c.src, c.size);
                }
            }
        }
    });

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => computeMetrics()) : null;
    if (ro && refs.pf) ro.observe(refs.pf);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) computeMetrics(); });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const MATERIAL_POOL_MAX = Math.max(2000, maxActiveMaterials * 3);
    const MATERIAL_MARGIN = 12;

    const materialPool = [];
    const activeMaterials = [];
    let garbageCount = 0;
    const newlySettledMaterials = [];
    const dirtyRegions = [];

    function makeMaterial() {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.pointerEvents = 'auto';
        el.style.borderRadius = '50%';
        el.style.willChange = 'transform';
        el.style.contain = 'layout style size';
        
        const inner = document.createElement('img');
        inner.className = 'material-inner';
        inner.draggable = false;
        inner.alt = '';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.objectFit = 'contain';
        inner.style.borderRadius = '50%';
        
        el.appendChild(inner);
        return el;
    }

    const getMaterial = () => (materialPool.length ? materialPool.pop() : makeMaterial());
    
    function releaseMaterial(el) {
       el.style.transition = '';
       el.style.transform = '';
       el.style.opacity = '1';
       
       for (let i = 0; i < NUM_LAYERS; i++) {
           el.classList.remove(`material--size-${i}`);
       }
       el.style.willChange = 'transform';
       
       if (el.parentNode) el.remove();
       if (materialPool.length < MATERIAL_POOL_MAX) materialPool.push(el);
    }
    
    function removeMaterial(materialObj, knownIndex = -1) {
        if (materialObj.isRemoved) return;
        materialObj.isRemoved = true;
        
        let idx = knownIndex;
        if (idx === -1 || activeMaterials[idx] !== materialObj) {
            if (materialObj.index !== undefined && activeMaterials[materialObj.index] === materialObj) {
                idx = materialObj.index;
            } else {
                idx = activeMaterials.indexOf(materialObj);
            }
        }
        if (idx !== -1) {
            activeMaterials[idx] = null;
            garbageCount++;
        }
        
        if (materialObj.el) {
            releaseMaterial(materialObj.el);
            materialObj.el = null;
        } else {
            dirtyRegions.push({
                layer: materialObj.sizeIndex || 0,
                x: materialObj.x,
                y: materialObj.y,
                size: materialObj.size
            });
        }
    }
    
    function playSpawnSound() {
      const vol = IS_MOBILE ? spawnSoundMobileVolume : spawnSoundDesktopVolume;
      playAudio(spawnSoundSrc, { volume: vol });
    }

    function planSpawn() {
        if (!validRefs()) return null;
        if (!M.pfRect || !M.wRect) computeMetrics();

        if (maxActiveMaterials !== Infinity && (activeMaterials.length - garbageCount) >= maxActiveMaterials) {
            let indexToRemove = -1;
            for (let i = 0; i < activeMaterials.length; i++) {
                if (activeMaterials[i]) {
                    indexToRemove = i;
                    break;
                }
            }
            if (indexToRemove === -1) return null;
            const oldest = activeMaterials[indexToRemove];
            if (oldest) removeMaterial(oldest, indexToRemove);
        }

        const pfW = M.pfW;
        const waterToPfTop = M.wRect.top - M.pfRect.top;
        const spawnY = Math.max(0, waterToPfTop);

        const sizeIndex = Math.floor(Math.random() * MATERIALS.length);
        const size = MATERIAL_SIZES[sizeIndex];
        const materialName = MATERIALS[sizeIndex];
        const currentSrc = `img/materials/${materialName}.webp`;

        const effectiveMargin = MATERIAL_MARGIN;
        const minX = effectiveMargin;
        const maxX = Math.max(minX, pfW - size - effectiveMargin);
        const spawnX = minX + Math.random() * (maxX - minX);

        const drift = Math.random() * 100 - 50;
        let endX;
        
        if (size >= M.pfW) {
            endX = (M.pfW - size) / 2;
        } else {
             const mx = M.pfW - size - effectiveMargin;
             if (minX >= mx) endX = (M.pfW - size)/2;
             else endX = clamp(spawnX + drift, minX, mx);
        }
        
        const effectiveWaterH = Math.min(M.wRect.height, M.pfRect.height * 0.3);
        const minY = Math.max(effectiveWaterH + 80, 120);
        const maxY = Math.max(minY + 40, M.safeBottom - size - 6);
        const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
        const jitterMs = 0;
        
        const material = {
            x0: spawnX, y0: spawnY,
            x1: endX, y1: endY,
            jitterMs
        };

        return {
            material,
            sizeIndex,
            currentSrc
        };
    }

    function commitBatch(batch) {
      if (!batch.length || !validRefs()) return;

      const frag = document.createDocumentFragment();
      const newMaterials = [];
      const now = performance.now();

      for (const { material, sizeIndex, currentSrc } of batch) {
        const size = MATERIAL_SIZES[sizeIndex];

        const el = getMaterial();
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.zIndex = `${10 + sizeIndex}`; 
        el.className = `material material--size-${sizeIndex}`; 
        if (el.firstChild) el.firstChild.src = getPreRenderedMaterialUrl(currentSrc, size);
        
        el.style.transform = `translate3d(${material.x0}px, ${material.y0}px, 0) rotate(-10deg) scale(0.96)`;
        el.style.opacity = '1'; 

        const materialObj = {
            el,
            src: currentSrc,
            x: material.x0,
            y: material.y0,
            rot: -10,
            scale: 0.96,
            startX: material.x0,
            startY: material.y0,
            endX: material.x1,
            endY: material.y1,
            startTime: now + material.jitterMs,
            duration: animationDurationMs,
            dieAt: now + materialTtlMs,
            jitterMs: material.jitterMs,
            isRemoved: false,
            settled: false,
            size: size,
            sizeIndex: sizeIndex,
            bMinX: Math.min(material.x0, material.x1) - size,
            bMaxX: Math.max(material.x0, material.x1) + size,
            bMinY: Math.min(material.y0, material.y1) - size,
            bMaxY: Math.max(material.y0, material.y1) + size
        };
        
        el._materialObj = materialObj;
        materialObj.index = activeMaterials.length;
        activeMaterials.push(materialObj);
        newMaterials.push(materialObj);
        
        frag.appendChild(el);
      }

      refs.c.appendChild(frag);

      if (newMaterials.length > 0) {
          if (newMaterials[0].el) void newMaterials[0].el.offsetHeight;
          requestAnimationFrame(() => {
            for (const c of newMaterials) {
                if (!c.el) continue;
                if (settingsManager.get('insta_teleport')) {
                    c.el.style.transition = 'none';
                } else {
                    c.el.style.transition = `transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${c.jitterMs}ms`;
                }
                c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
            }
          });
      }
    }

    function spawnBurst(n = 1) {
        if (!validRefs()) return;
        if (!M.pfRect || !M.wRect) computeMetrics();
        const batch = [];
        for (let i = 0; i < n; i++) {
            const plan = planSpawn();
            if (plan) batch.push(plan);
        }
        if (batch.length) {
            commitBatch(batch);
            playSpawnSound();
        }
    }

    let rate = initialRate;
    let rafId = null;
    let last = performance.now();
    let carry = 0;

    function loop(now) {
      if (!document.hidden && validRefs()) {
          const dt = Math.min(now - last, 100);
          
          if (activeMaterials.length > 200) {
              for (let i = 0; i < activeMaterials.length; i++) {
                 if (!activeMaterials[i]) continue;
                 const c = activeMaterials[i];
                 if (c.settled && !c.isRemoved) {
                     if (c.el) {
                         releaseMaterial(c.el);
                         c.el = null;
                         newlySettledMaterials.push(c);
                     }
                 }
              }
          }

          if (garbageCount > Math.max(100, activeMaterials.length * 0.2)) {
             let w = 0;
             for (let i = 0; i < activeMaterials.length; i++) {
                 if (activeMaterials[i]) {
                     activeMaterials[i].index = w;
                     activeMaterials[w++] = activeMaterials[i];
                 }
             }
             activeMaterials.length = w;
             garbageCount = 0;
          }

          if (rate > 0) {
            carry += rate * (dt / 1000);
            if (carry >= 1) {
                const spawns = Math.floor(carry);
                carry -= spawns;
                const batch = [];
                for (let i = 0; i < spawns; i++) {
                    const plan = planSpawn();
                    if (plan) batch.push(plan);
                }
                if (batch.length) {
                    commitBatch(batch);
                    playSpawnSound();
                }
            }
          }

          for (let i = activeMaterials.length - 1; i >= 0; i--) {
              const c = activeMaterials[i]; if (!c) continue;
              if (now >= c.dieAt) {
                  removeMaterial(c, i);
                  continue;
              }

              if (c.settled) continue;
              
              const elapsed = now - c.startTime;
              if (elapsed < 0 && !settingsManager.get('insta_teleport')) continue;
              
              let t = elapsed / c.duration;
              if (t >= 1 || settingsManager.get('insta_teleport')) {
                  c.settled = true;
                  c.x = c.endX;
                  c.y = c.endY;
                  c.rot = 0;
                  c.scale = 1;
                  if (c.el) {
                      releaseMaterial(c.el);
                      c.el = null;
                      newlySettledMaterials.push(c);
                  }
              }
          }

          if (canvasDirty || dirtyRegions.length > 0) {
              if (canvasDirty) {
                  contexts.forEach(ctx => {
                      if (!ctx) return;
                      ctx.save();
                      ctx.setTransform(1, 0, 0, 1, 0, 0);
                      ctx.clearRect(0, 0, M.pfW * dpr, M.pfH * dpr);
                      ctx.restore();
                  });
                  for (const c of activeMaterials) {
                      if (c && c.settled && !c.el && !c.isRemoved) {
                          const layerCtx = contexts[c.sizeIndex || 0];
                          if (layerCtx) drawSingleSettledMaterial(layerCtx, c);
                      }
                  }
                  canvasDirty = false;
                  dirtyRegions.length = 0;
              } else {
                  while (dirtyRegions.length > 0) {
                      const r = dirtyRegions.pop();
                      const ctx = contexts[r.layer];
                      if (!ctx) continue;
                      
                      const rx = Math.floor((r.x - 5));
                      const ry = Math.floor((r.y - 5));
                      const rw = Math.ceil((r.size + 10));
                      const rh = Math.ceil((r.size + 10));
                      
                      ctx.save();
                      ctx.setTransform(1, 0, 0, 1, 0, 0);
                      ctx.clearRect(rx * dpr, ry * dpr, rw * dpr, rh * dpr);
                      ctx.restore();
                      
                      for (const c of activeMaterials) {
                           if (c && c.settled && !c.el && !c.isRemoved && (c.sizeIndex || 0) === r.layer) {
                               const intersect = !(
                                   c.x > rx + rw ||
                                   c.x + (c.size) < rx ||
                                   c.y > ry + rh ||
                                   c.y + (c.size) < ry
                               );
                               if (intersect) drawSingleSettledMaterial(ctx, c);
                           }
                      }
                  }
              }
          }

          if (newlySettledMaterials.length > 0) {
              for (const c of newlySettledMaterials) {
                  if (c.isRemoved) continue;
                  const layerCtx = contexts[c.sizeIndex || 0];
                  if (layerCtx) drawSingleSettledMaterial(layerCtx, c);
              }
              newlySettledMaterials.length = 0;
          }
      }

      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }

    function drawSingleSettledMaterial(ctx, c) {
        const renderable = getPreRenderedMaterial(c.src, c.size);
        if (renderable) {
            if (renderable instanceof HTMLCanvasElement) {
                ctx.drawImage(renderable, c.x, c.y, c.size, c.size);
            } else if (renderable.complete && renderable.naturalWidth > 0) {
                ctx.drawImage(renderable, c.x, c.y, c.size, c.size);
            }
        }
    }

    function start() {
        if (!validRefs()) return;
        if (rafId) return;
        computeMetrics();
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

    function clearPlayfield() {
        for (let i = activeMaterials.length - 1; i >= 0; i--) {
            const c = activeMaterials[i]; if (!c) continue;
            removeMaterial(activeMaterials[i], i);
        }
        contexts.forEach((ctx, i) => {
            if (!ctx || !canvases[i]) return;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvases[i].width, canvases[i].height);
            ctx.restore();
        });
        dirtyRegions.length = 0;
        newlySettledMaterials.length = 0;
        canvasDirty = false;
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (typeof shouldAutoResume === 'function' && !shouldAutoResume()) return;
        if (!rafId) start();
      }
    });

    return {
        start,
        stop,
        setRate,
        clearPlayfield,
        spawnBurst, // Included for potential testing
        getActiveMaterials: () => activeMaterials,
    };
}