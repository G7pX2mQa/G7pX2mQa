import { createBaseSpawner, CUBIC_BEZIER, getImage } from './spawnerCore.js';
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
        maxActiveMaterials = 500,
        initialBurst = 0,
        materialTtlMs = 1e99,
        shouldAutoResume = () => true,
        soundMinIntervalMs = 10
    } = { ...config, ...overrides };


    let soundLastAt = 0;
    const soundURL = new URL('sounds/got_our_pickaxe_swinging_from_side_to_side.ogg', document.baseURI).href;

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


    function playSpawnSound() {
        const now = performance.now();
        if (now - soundLastAt < soundMinIntervalMs) return;
        soundLastAt = now;
        playAudio(soundURL, { volume: 0.3, type: 'sfx' });
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

        onPlanSpawn: (M, activeItems, garbageCount, removeItem, maxActiveItems) => {
            const MATERIAL_MARGIN = 12;
            if (maxActiveItems !== Infinity && (activeItems.length - garbageCount) >= maxActiveItems) {
                let indexToRemove = -1;
                for (let i = 0; i < activeItems.length; i++) {
                    if (activeItems[i]) {
                        indexToRemove = i;
                        break;
                    }
                }
                if (indexToRemove !== -1) {
                    const oldest = activeItems[indexToRemove];
                    if (oldest) removeItem(oldest, indexToRemove);
                }
            }

            const pfW = M.pfW;
            const waterToPfTop = M.wRect ? M.wRect.top - M.pfRect.top : 0;
            const spawnY = Math.max(0, waterToPfTop);

            // Randomly pick a material
            const matIndex = Math.floor(Math.random() * UC_MATERIALS.length);
            const size = baseSize * Math.pow(1.1, matIndex);

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
            
            const effectiveWaterH = M.wRect ? Math.min(M.wRect.height, M.pfRect.height * 0.3) : 0;
            const minY = Math.max(effectiveWaterH + 80, 120);
            const maxY = Math.max(minY + 40, M.safeBottom - size - 6);
            const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
            const jitterMs = 0;

            return {
                coin: {
                    x0: spawnX, y0: spawnY,
                    x1: endX, y1: endY,
                    jitterMs
                },
                matIndex,
                size
            };
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
                      
                      // Delay the original falling animation and opacity until cycleMs (when pickaxe finishes)
                      c.el.style.transition = `opacity 0s linear ${cycleMs}ms, transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${cycleMs + c.jitterMs}ms`;
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
                    if (pickaxe._startTime !== undefined && !pickaxe._playedSound) {
                        playSpawnSound();
                    }
                    
                    // We only animate the persistent pickaxe based on the first item in the batch
                    // to prevent multiple overlapping animations
                    const item = newItems[0];
                    const chargeTime = cycleMs * 0.8;
                    const strikeTime = cycleMs * 0.2;
                    
                    // Y position between 25% and 75% of rubble layer height, relative to viewport
                    const pickY = rubbleRect.top + rubbleRect.height * 0.5 + window.innerHeight * 0.025;
                    
                    // Is left or right half?
                    const isLeft = item.endX < pfW / 2;
                    // Right side: negative charge (-60), positive strike (+60)
                    // Left side: positive charge (+60), negative strike (-60)
                    const chargeRotation = isLeft ? 60 : -60;
                    const strikeRotation = isLeft ? -60 : 60;

                    // Convert pickY (which is viewport relative) to local playfield coordinates
                    const pfRect = document.querySelector(playfieldSelector).getBoundingClientRect();
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
                    pickaxe._startTime = now;
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
            if (pickaxe && pickaxe._startTime !== undefined) {
                const elapsed = now - pickaxe._startTime;
                const ratio = Math.min(elapsed / pickaxe._cycleMs, 1);
                
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
                if (elapsed < 0) continue;
                
                let t = elapsed / c.duration;
                if (t >= 1) {
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
        getActiveItems: base.getActiveItems,
    };
}
