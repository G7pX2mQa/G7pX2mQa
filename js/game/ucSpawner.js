import { createBaseSpawner, CUBIC_BEZIER, getImage } from './spawnerCore.js';
import { IS_MOBILE } from '../main.js';
import { playAudio } from '../util/audioManager.js';
import { UC_MATERIALS } from '../util/storage.js';
import { settingsManager } from './settingsManager.js';

export function createUcSpawner(config = {}) {
    // If settings are enabled, start with an initialBurst so there's no dead wait at startup.
    const overrides = {};
    if (settingsManager.get('spawn_vessels') && !config.initialBurst) {
        overrides.initialBurst = 1;
    }
    
    const {
        playfieldSelector = '.playfield',
        materialsHost = '.materials-layer',
        baseSize = 40,
        animationDurationMs = 1500,
        materialsPerSecond = 0.2,
        perFrameBudget = 5,
        maxActiveMaterials = IS_MOBILE ? 2500 : 10000,
        initialBurst = 0,
        materialTtlMs = 1e99,
        shouldAutoResume = () => true,
        soundMinIntervalMs = 10
    } = { ...config, ...overrides };


    let soundLastAt = 0;
    const soundURL = new URL('sounds/got_our_pickaxe_swinging_from_side_to_side.ogg', document.baseURI).href;
	const basePickaxeSoundVolume = 0.3;
    const minPickaxeVolumeRate = 0.2;
    const halfPickaxeVolumeRate = 10;

    let pickaxeSize = 64;
    function updatePickaxeSize() {
        pickaxeSize = Math.min(256, Math.max(64, window.innerHeight * 0.12));
        const pickaxe = document.getElementById('uc-pickaxe');
        if (pickaxe) {
            pickaxe.style.width = `${pickaxeSize}px`;
            pickaxe.style.height = `${pickaxeSize}px`;
        }
    }
    window.addEventListener('resize', updatePickaxeSize);
    updatePickaxeSize();

    function getPickaxeSoundVolume() {
        const fadeProgress = clamp(
            (currentRate - minPickaxeVolumeRate) / (halfPickaxeVolumeRate - minPickaxeVolumeRate),
            0,
            1
        );
        return basePickaxeSoundVolume * (1 - fadeProgress * 0.5);
    }
	
    function playSpawnSound() {
        const now = performance.now();
        if (now - soundLastAt < soundMinIntervalMs) return;
        soundLastAt = now;
        playAudio(soundURL, { volume: getPickaxeSoundVolume(), type: 'sfx' });
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    let currentRate = materialsPerSecond;

    const base = createBaseSpawner({
        playfieldSelector,
        waterSelector: null,
        itemsHostSelector: materialsHost,
        baseItemSize: baseSize,
        animationDurationMs,
        itemsPerSecond: materialsPerSecond,
        perFrameBudget,
        maxActiveItems: maxActiveMaterials,
        initialBurst,
        itemTtlMs: materialTtlMs,
        shouldAutoResume,
        numLayers: UC_MATERIALS.length,

        onPlanSpawn: (M, activeItems, garbageCount, removeItem, maxActiveItems, batchLength = 0) => {
            const MATERIAL_MARGIN = 12;

            const pfW = M.pfW;
            const waterToPfTop = M.wRect ? M.wRect.top - M.pfRect.top : 0;
            const spawnY = Math.max(0, waterToPfTop);

            // Initialize accumulators if needed
            if (!window._ucMaterialAccumulators) {
                try {
                    const stored = localStorage.getItem('ccc:ucMaterialAccumulators');
                    if (stored) {
                        window._ucMaterialAccumulators = JSON.parse(stored);
                    } else {
                        window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
                    }
                } catch {
                    window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
                }
            }

            // Save function to persist to local storage
            const saveAccumulators = () => {
                try {
                    localStorage.setItem('ccc:ucMaterialAccumulators', JSON.stringify(window._ucMaterialAccumulators));
                } catch {}
            };

            // Get DP Level (safely)
            let dpLevelNum = 0;
            if (window.dpSystem && typeof window.dpSystem.getDpState === 'function') {
                const dpState = window.dpSystem.getDpState();
                if (dpState && dpState.dpLevel) {
                    try {
                        dpLevelNum = Number(dpState.dpLevel.toString());
                    } catch {}
                }
            }

            // The scaling thresholds for materials:
            const thresholds = [
                { start: 0, max: 0 }, // Stone (always drops)
                { start: 1, max: 24 }, // Copper
                { start: 25, max: 49 }, // Iron
                { start: 50, max: 99 }, // Gold
                { start: 100, max: 199 }, // Diamond
                { start: 200, max: 399 }, // Emerald
                { start: 400, max: 799 }, // Ruby
                { start: 800, max: 1599 }, // Obsidian
                { start: 1600, max: 3199 }, // Unobtainium
                { start: 3200, max: 5000 } // Prismatium
            ];

            const spawns = [];
            const maxSize = baseSize * Math.pow(1.1, UC_MATERIALS.length - 1);
            const sharedMinX = MATERIAL_MARGIN;
            const sharedMaxX = Math.max(sharedMinX, pfW - maxSize - MATERIAL_MARGIN);
            const sharedSpawnX = sharedMinX + Math.random() * (sharedMaxX - sharedMinX);
            
            // Process all materials
            for (let i = 0; i < UC_MATERIALS.length; i++) {
                const t = thresholds[i];
                if (i === 0) {
                     // Stone always drops 1 per swing, no accumulator needed really, but we can set it
                     window._ucMaterialAccumulators[i] = 1.0;
                } else {
                     if (dpLevelNum >= t.max) {
                         window._ucMaterialAccumulators[i] += 1.0;
                     } else if (dpLevelNum >= t.start) {
                         const progress = (dpLevelNum - t.start + 1) / (t.max - t.start + 1);
                         const gain = Math.pow(progress, 1.5);
                         window._ucMaterialAccumulators[i] += gain;
                     }
                }

                // Cap accumulator to 1.99
                if (window._ucMaterialAccumulators[i] > 1.99) {
                    window._ucMaterialAccumulators[i] = 1.99;
                }

                if (window._ucMaterialAccumulators[i] >= 1.0) {
                    window._ucMaterialAccumulators[i] -= 1.0;
                    
                    const size = baseSize * Math.pow(1.1, i);
                    const effectiveMargin = MATERIAL_MARGIN;
                    const minX = effectiveMargin;

                    const spawnX = sharedSpawnX;

                    const drift = Math.random() * 200 - 100;
                    let endX;
                    if (size >= M.pfW) {
                        endX = (M.pfW - size) / 2;
                    } else {
                        const mx = M.pfW - size - effectiveMargin;
                        if (minX >= mx) endX = (M.pfW - size)/2;
                        else endX = clamp(spawnX + drift, minX, mx);
                    }
                    
                    const effectiveWaterH = M.wRect ? Math.min(M.wRect.height, M.pfRect.height * 0.3) : M.pfRect.height * 0.3;
                    const minY = Math.max(effectiveWaterH + 80, 120);
                    const maxY = Math.max(minY + 40, M.safeBottom - size - 6);
                    const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
                    const jitterMs = 0;

                    spawns.push({
                        coin: { x0: spawnX, y0: spawnY, x1: endX, y1: endY, jitterMs },
                        matIndex: i,
                        size
                    });
                }
            }

            const itemsToAdd = spawns.length + batchLength;
            if (maxActiveItems !== Infinity && (activeItems.length - garbageCount + itemsToAdd) > maxActiveItems) {
                let numToRemove = (activeItems.length - garbageCount + itemsToAdd) - maxActiveItems;
                for (let i = 0; i < activeItems.length && numToRemove > 0; i++) {
                    if (activeItems[i]) {
                        removeItem(activeItems[i], i);
                        numToRemove--;
                    }
                }
            }

            saveAccumulators();
            return spawns;
        },

        onCommitBatch: (batch, activeItems, getItem, refs, animationDurationMs) => {
            const frag = document.createDocumentFragment();
            const newItems = [];
            const now = performance.now();
            let playedSoundInBatch = false;
            
            // Override animation duration to match spawn rate cycle
            const cycleMs = currentRate > 0 ? 1000 / currentRate : 5000;

            for (const { coin, matIndex, size } of batch) {
                const el = getItem();
                el.style.width = `${size}px`;
                el.style.height = `${size}px`;
                el.className = `material material--${UC_MATERIALS[matIndex]}`;
                
                if (el.firstChild) {
                     el.firstChild.src = `img/materials/${UC_MATERIALS[matIndex]}.webp`;
                }
                
                // Keep initial state hidden and untransformed (wait for pickaxe strike)
                el.style.transform = `translate3d(${coin.x0}px, ${coin.y0}px, 0) rotate(-10deg) scale(0.96)`;
                el.style.opacity = '0';
                el.style.zIndex = `${10 + (matIndex * 10)}`;

                const itemObj = {
                    el,
                    src: `img/materials/${UC_MATERIALS[matIndex]}.webp`,
                    x: coin.x0,
                    y: coin.y0,
                    rot: -10,
                    scale: 0.96,
                    startX: coin.x0,
                    startY: coin.y0,
                    endX: coin.x1,
                    endY: coin.y1,
                    // Delay the start of the material's lifecycle until the pickaxe animation finishes
                    startTime: now + coin.jitterMs + cycleMs,
                    duration: animationDurationMs,
                    dieAt: now + materialTtlMs + cycleMs,
                    jitterMs: coin.jitterMs,
                    isRemoved: false,
                    settled: false,
                    size: size,
                    sizeIndex: matIndex,
                    bMinX: Math.min(coin.x0, coin.x1) - size,
                    bMaxX: Math.max(coin.x0, coin.x1) + size,
                    bMinY: Math.min(coin.y0, coin.y1) - size,
                    bMaxY: Math.max(coin.y0, coin.y1) + size
                };
                
                el._coinObj = itemObj;
                itemObj.index = activeItems.length;
                activeItems.push(itemObj);
                newItems.push(itemObj);
                
                frag.appendChild(el);
                if (!playedSoundInBatch) {
                    playedSoundInBatch = true;
                }
            }

            refs.c.appendChild(frag);

            if (newItems.length > 0) {
                if (newItems[0].el) void newItems[0].el.offsetHeight;

                requestAnimationFrame(() => {
                  for (const c of newItems) {
                      if (!c.el) continue;
                      
                      if (settingsManager.get('insta_teleport')) {
                          c.el.style.transition = 'none';
                      } else {
                          // Delay the original falling animation and opacity until cycleMs (when pickaxe finishes)
                      c.el.style.transition = `opacity 0s linear ${cycleMs}ms, transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${cycleMs + c.jitterMs}ms`;
                      }
                      c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
                      c.el.style.opacity = '1';
                  }
                });
            }

            // Pickaxe Logic
            if (newItems.length > 0 && settingsManager.get('spawn_vessels')) {
                const rubbleLayer = document.querySelector('.rubble-layer');
                if (rubbleLayer) {
                    const rubbleRect = rubbleLayer.getBoundingClientRect();
                    const pfW = document.querySelector(playfieldSelector).getBoundingClientRect().width;

                    // Ensure only ONE persistent pickaxe exists at a time
                    let pickaxe = document.getElementById('uc-pickaxe');
                    if (!pickaxe) {
                        pickaxe = document.createElement('img');
                        pickaxe.id = 'uc-pickaxe';
                        pickaxe.src = 'img/misc/pickaxe.webp';
                        pickaxe.style.position = 'absolute';
                        pickaxe.style.width = `${pickaxeSize}px`;
                        pickaxe.style.height = `${pickaxeSize}px`;
                        pickaxe.style.transformOrigin = 'bottom center';
                        pickaxe.style.zIndex = '400';
                        pickaxe.style.pointerEvents = 'none';
                        document.querySelector(playfieldSelector).appendChild(pickaxe);
                    }
                    
                    // If the previous animation was interrupted before the sound could play at the end, play it now!
                    if (pickaxe._elapsedTime !== undefined && !pickaxe._playedSound) {
                        playSpawnSound();
                    }
                    
                    // We only animate the persistent pickaxe based on the first item in the batch
                    // to prevent multiple overlapping animations
                    const item = newItems[0];
                    const chargeTime = cycleMs * 0.8;
                    const strikeTime = cycleMs * 0.2;
                    
                    // Convert pickY (which is viewport relative) to local playfield coordinates
                    const pfRect = document.querySelector(playfieldSelector).getBoundingClientRect();

                    // Y position between 25% and 75% of rubble layer height, relative to viewport
                    const pickY = rubbleRect.top + rubbleRect.height * 0.5 + window.innerHeight * 0.025;
                    
                    // Is left or right half?
                    const itemMiddleAbsoluteX = pfRect.left + item.endX + (item.size / 2);
                    const isLeft = itemMiddleAbsoluteX < (window.innerWidth / 2);
                    // Right side: negative charge (-60), positive strike (+60)
                    // Left side: positive charge (+60), negative strike (-60)
                    const chargeRotation = isLeft ? 60 : -60;
                    const strikeRotation = isLeft ? -60 : 60;

                    const localPickY = pickY - pfRect.top;
                    
                    // Offset pickaxe so the tip hits the spawn location
                    // For a 64x64 pickaxe with transformOrigin 'bottom center', the tip is near the top corners.
                    // If striking left (-60), the pivot needs to be moved right and down so the top-left tip hits the target.
                    // If striking right (+60), the pivot needs to be moved left and down so the top-right tip hits the target.
                    // Assuming tip is ~71px from pivot horizontally when swung 60 degrees.
                    // The pivot is at the bottom center of the 64x64 image (so Y is top + 64).
                    // The rotated tip Y is roughly at the same height as the pivot, meaning top should be ~60px above the target Y.
                    // For left: tip is at -71px from pivot, so left edge should be at endX + 39.
                    // For right: tip is at +71px from pivot, so left edge should be at endX - 103.
                    const scaleFactor = pickaxeSize / 64;
                    const offsetX = (isLeft ? 39 : -103) * scaleFactor;
                    const offsetY = -60 * scaleFactor; // shift up so the tip is at the target Y

                    pickaxe.style.left = `${item.endX + offsetX}px`;
                    pickaxe.style.top = `${localPickY + offsetY}px`;
                    
                    // Reset pickaxe rotation before starting
                    pickaxe.style.transform = 'rotate(0deg)';
                    
                    // We will not use pickaxe.animate(), but rather synchronize it explicitly with onItemUpdate
                    // Store logic variables onto the pickaxe so onItemUpdate can calculate rotations safely
                    pickaxe._cycleMs = cycleMs;
                    pickaxe._chargeRotation = chargeRotation;
                    pickaxe._strikeRotation = strikeRotation;
                    pickaxe._elapsedTime = 0;
                    pickaxe._playedSound = false;
                }
            } else if (!settingsManager.get('spawn_vessels')) {
                // If spawn_vessels is OFF, no pickaxe, no sound.
                const pickaxe = document.getElementById('uc-pickaxe');
                if (pickaxe && pickaxe.parentNode) {
                    pickaxe.parentNode.removeChild(pickaxe);
                }
            }
        },

        onItemUpdate: (activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState) => {
            const pickaxe = document.getElementById('uc-pickaxe');
            if (pickaxe && pickaxe._elapsedTime !== undefined) {
                const currentCycleMs = currentRate > 0 ? 1000 / currentRate : 5000;
                if (pickaxe._cycleMs !== currentCycleMs) {
                    pickaxe._cycleMs = currentCycleMs;
                }

                pickaxe._elapsedTime += dt * 1000;
                 // elapsed line replaced
                const ratio = Math.min(pickaxe._elapsedTime / pickaxe._cycleMs, 1);
                
                if (ratio <= 0.8) {
                    // Charging phase
                    pickaxe._playedSound = false;
                    const chargeRatio = ratio / 0.8;
                    const easeOutCubic = 1 - Math.pow(1 - chargeRatio, 3);
                    const currentRot = pickaxe._chargeRotation * easeOutCubic;
                    pickaxe.style.transform = `rotate(${currentRot}deg)`;
                } else {
                    // Striking phase
                    const strikeRatio = (ratio - 0.8) / 0.2;
                    const easeInCubic = strikeRatio * strikeRatio * strikeRatio;
                    const currentRot = pickaxe._chargeRotation + (pickaxe._strikeRotation - pickaxe._chargeRotation) * easeInCubic;
                    pickaxe.style.transform = `rotate(${currentRot}deg)`;

                    if (ratio === 1 && !pickaxe._playedSound) {
                        playSpawnSound();
                        pickaxe._playedSound = true;
                    }
                }
            }
            
            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                
                if (now >= c.dieAt) {
                    removeItem(c, i);
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
                        releaseItem(c.el);
                        c.el = null;
                        newlySettledBuffer.push(c);
                    }
                    continue;
                }
            }
        },

        onDrawSingleSettledItem: (ctx, c) => {
            const size = c.size || baseSize;
            if (c.src) {
                const img = getImage(c.src);
                if (img && img.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, c.x, c.y, size, size);
                }
            }
        },

        onEnsureItemVisual: (el, c) => {
            const size = c.size || baseSize;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.className = `material material--${UC_MATERIALS[c.sizeIndex || 0]}`;
            
            el.style.transition = '';
            el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
            
            if (el.firstChild) {
                el.firstChild.src = c.src;
            }
            
            el.style.opacity = '1';
        },

        onClearPlayfield: (activeItems, removeItem, resetType) => {
            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                removeItem(activeItems[i], i);
            }
            const pickaxe = document.getElementById("uc-pickaxe");
            if (pickaxe && pickaxe.parentNode) pickaxe.parentNode.removeChild(pickaxe);
        }
    });

    return {
        start: base.start,
        stop: base.stop,
        setRate: (n) => {
            currentRate = Math.max(0, Number(n) || 0);
            base.setRate(currentRate);
        },
        clearBacklog: base.clearBacklog,
        clearPlayfield: base.clearPlayfield,
        getItemTransform: base.getItemTransform,
        ensureItemVisual: base.ensureItemVisual,
        removeItemTarget: base.removeItemTarget,
        detachItem: base.detachItem,
        recycleItem: base.recycleItem,
        spawnBurst: base.spawnBurst,
        getActiveItems: base.getActiveItems,

        findItemTargetsInRadius: (x, y, radius, isVisualHitbox) => {
            let searchRadius = radius;
            if (isVisualHitbox) {
                 searchRadius = Math.max(radius, 260);
            }
            // Add padding for the material size
            searchRadius += baseSize / 2;

            const activeItems = base.getActiveItems();
            const results = [];
            const count = activeItems.length;
            const now = performance.now();
            
            const minX = x - searchRadius;
            const maxX = x + searchRadius;
            const minY = y - searchRadius;
            const maxY = y + searchRadius;

            for (let i = count - 1; i >= 0; i--) {
                const c = activeItems[i];
                if (!c || c.isRemoved) continue;

                if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                    continue;
                }

                const w = c.size;
                const h = c.size;
                
                let curX, curY;
                if (c.settled) {
                    curX = c.x;
                    curY = c.y;
                } else {
                    const s = base.getItemState(c, now);
                    curX = s.x;
                    curY = s.y;
                }
                
                const cx = curX + w / 2;
                const cy = curY + h / 2;
                
                if (cx < minX || cx > maxX) continue;
                if (cy < minY || cy > maxY) continue;

                const dx = cx - x;
                const dy = cy - y;
                
                let hit = false;
                if (isVisualHitbox) {
                    const scaledDy = dy * 2;
                    const effectiveR = Math.max(w * 0.5, radius);
                    const limitSq = effectiveR * effectiveR;
                    if (dx * dx + scaledDy * scaledDy <= limitSq) hit = true;
                } else {
                    if (dx * dx + dy * dy <= radius * radius) hit = true;
                }
                
                if (hit) {
                    results.push(c);
                }
            }
            return results;
        },

        findItemTargetsInPath: (x1, y1, x2, y2, radius, isVisualHitbox) => {
            let searchRadius = radius;
            if (isVisualHitbox) {
                 searchRadius = Math.max(radius, 260);
            }
            // Add padding for the material size
            searchRadius += baseSize / 2;

            const activeItems = base.getActiveItems();
            const results = [];
            const count = activeItems.length;
            const now = performance.now();

            const minX = Math.min(x1, x2) - searchRadius;
            const maxX = Math.max(x1, x2) + searchRadius;
            const minY = Math.min(y1, y2) - searchRadius;
            const maxY = Math.max(y1, y2) + searchRadius;

            const vx = x2 - x1;
            const vy = y2 - y1;
            const lenSq = vx * vx + vy * vy;

            for (let i = count - 1; i >= 0; i--) {
                const c = activeItems[i];
                if (!c || c.isRemoved) continue;

                if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                    continue;
                }

                const w = c.size;
                const h = c.size;

                let curX, curY;
                if (c.settled) {
                    curX = c.x;
                    curY = c.y;
                } else {
                    const s = base.getItemState(c, now);
                    curX = s.x;
                    curY = s.y;
                }

                const cx = curX + w / 2;
                const cy = curY + h / 2;

                if (cx < minX || cx > maxX) continue;
                if (cy < minY || cy > maxY) continue;

                const wx = cx - x1;
                const wy = cy - y1;
                
                let hit = false;
                if (isVisualHitbox) {
                    const scaledWy = wy * 2;
                    const scaledVy = vy * 2;
                    
                    const scaledDot = wx * vx + scaledWy * scaledVy;
                    const scaledLenSq = vx * vx + scaledVy * scaledVy;
                    const effectiveR = Math.max(w * 0.5, radius);
                    const limitSq = effectiveR * effectiveR;
                    
                    if (scaledDot <= 0) {
                        if ((wx * wx + scaledWy * scaledWy) <= limitSq) hit = true;
                    } else if (scaledDot >= scaledLenSq) {
                        const dx = cx - x2;
                        const dy = cy - y2;
                        const scaledDy = dy * 2;
                        if ((dx * dx + scaledDy * scaledDy) <= limitSq) hit = true;
                    } else {
                        const cross = wx * scaledVy - scaledWy * vx;
                        if (cross * cross <= limitSq * scaledLenSq) hit = true;
                    }
                } else {
                    const dot = wx * vx + wy * vy;
                    const limitSq = radius * radius;
                    if (dot <= 0) {
                        if ((wx * wx + wy * wy) <= limitSq) hit = true;
                    } else if (dot >= lenSq) {
                        const dx = cx - x2;
                        const dy = cy - y2;
                        if ((dx * dx + dy * dy) <= limitSq) hit = true;
                    } else {
                        const cross = wx * vy - wy * vx;
                        if (cross * cross <= limitSq * lenSq) hit = true;
                    }
                }
                
                if (hit) {
                    results.push(c);
                }
            }
            return results;
        },



        findCoinsInRadius: (x, y, radius) => {
            // Unused normally, only fallback if using visual DOM elements
            return [];
        },

    };
}
