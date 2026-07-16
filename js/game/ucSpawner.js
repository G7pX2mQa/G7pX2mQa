import { createBaseSpawner, CUBIC_BEZIER, getImage, getPreRenderedItem, getPreRenderedItemUrl, clearPreRenderedItems } from './spawnerCore.js';
import { IS_MOBILE } from '../util/platformChecker.js';
import { playAudio } from '../util/audioManager.js';
import { getActiveSlot, UC_MATERIALS } from '../util/storage.js';
import { settingsManager } from './settingsManager.js';
import { bigNumIsInfinite } from '../util/bigNum.js';

export const UC_MATERIAL_DATA = [
    { name: 'stone', start: 0, max: 0, value: 1 },
    { name: 'copper', start: 1, max: 24, value: 10 },
    { name: 'iron', start: 25, max: 49, value: 1000 },
    { name: 'pure_gold', start: 50, max: 99, value: 1e6 },
    { name: 'diamond', start: 100, max: 199, value: 1e10 },
    { name: 'emerald', start: 200, max: 399, value: 1e15 },
    { name: 'ruby', start: 400, max: 799, value: 1e21 },
    { name: 'sapphire', start: 800, max: 1599, value: 1e28 },
    { name: 'unobtainium', start: 1600, max: 3199, value: 1e36 },
    { name: 'prismatium', start: 3200, max: 5000, value: 1e45 }
];

export function resetUcMaterialAccumulators() {
    window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
    try {
        localStorage.setItem(`ccc:ucMaterialAccumulators:${getActiveSlot()}`, JSON.stringify(window._ucMaterialAccumulators));
    } catch {}
}

export function resetUcEacMaterialAccumulators() {
    window._ucEacMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
    try {
        localStorage.setItem(`ccc:ucEacMaterialAccumulators:${getActiveSlot()}`, JSON.stringify(window._ucEacMaterialAccumulators));
    } catch {}
}

export function getUcMaterialAccumulators() {
    if (!window._ucMaterialAccumulators) {
        try {
            const stored = localStorage.getItem(`ccc:ucMaterialAccumulators:${getActiveSlot()}`);
            if (stored) {
                window._ucMaterialAccumulators = JSON.parse(stored);
            } else {
                window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
            }
        } catch {
            window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
        }
    }

    return window._ucMaterialAccumulators || new Array(UC_MATERIALS.length).fill(0);
}

export function getUcEacMaterialAccumulators() {
    if (!window._ucEacMaterialAccumulators) {
        try {
            const stored = localStorage.getItem(`ccc:ucEacMaterialAccumulators:${getActiveSlot()}`);
            if (stored) {
                window._ucEacMaterialAccumulators = JSON.parse(stored);
            } else {
                window._ucEacMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
            }
        } catch {
            window._ucEacMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
        }
    }

    return window._ucEacMaterialAccumulators || new Array(UC_MATERIALS.length).fill(0);
}

export function saveUcEacMaterialAccumulators() {
    try {
        if (window._ucEacMaterialAccumulators) {
            localStorage.setItem(`ccc:ucEacMaterialAccumulators:${getActiveSlot()}`, JSON.stringify(window._ucEacMaterialAccumulators));
        }
    } catch {}
}

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
        maxActiveMaterials = IS_MOBILE ? 2500 : 5000,
        initialBurst = 0,
        materialTtlMs = 1e99,
        shouldAutoResume = () => true,
        soundMinIntervalMs = 10
    } = { ...config, ...overrides };


    let soundLastAt = 0;
    const soundURL = new URL('sounds/got_our_pickaxe_swinging_from_side_to_side.ogg', document.baseURI).href;
	const basePickaxeSoundVolume = 0.3;
    const minPickaxeVolumeRate = 0.2;
    const halfPickaxeVolumeRate = 2;

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

    let cachedRate = -1;
    let cachedVolume = basePickaxeSoundVolume;

    function getPickaxeSoundVolume() {
        if (currentRate === cachedRate) {
            return cachedVolume;
        }
        
        cachedRate = currentRate;

        const fadeProgress = clamp(
            (currentRate - minPickaxeVolumeRate) / (halfPickaxeVolumeRate - minPickaxeVolumeRate),
            0,
            1
        );
        
        cachedVolume = basePickaxeSoundVolume * (1 - Math.sqrt(fadeProgress) * 0.75);
        return cachedVolume;
    }
	
    function playSpawnSound() {
        const now = performance.now();
        if (now - soundLastAt < soundMinIntervalMs) return;
        soundLastAt = now;
        playAudio(soundURL, { volume: getPickaxeSoundVolume(), type: 'spawn_vessel' });
    }

    

    settingsManager.subscribe('graphics_quality', () => {
        clearPreRenderedItems();
        const activeCoins = base.getActiveItems();
        for (let i = 0; i < activeCoins.length; i++) {
            const c = activeCoins[i];
            if (c && c.el && !c.settled && !c.isRemoved) {
                if (c.el.firstChild) {
                    c.el.firstChild.src = getPreRenderedItemUrl(c.src, c.size || config.coinSize || 40);
                }
            }
        }
        base.forceCanvasRedraw();
    });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    let currentRate = materialsPerSecond;

    function updateUcMetrics() {
        const playfieldNode = document.querySelector(playfieldSelector);
        if (playfieldNode) {
            window._cachedUcPfRect = playfieldNode.getBoundingClientRect();
            const waterNode = document.querySelector('#water-background');
            window._cachedUcWRect = waterNode ? waterNode.getBoundingClientRect() : null;
            const hud = document.getElementById('hud-bottom-wrapper') || document.getElementById('hud-bottom');
            const hudHeight = hud ? hud.getBoundingClientRect().height : 0;
            window._cachedUcSafeBottom = window._cachedUcPfRect.height - hudHeight;
            const rubbleLayer = document.querySelector('.rubble-layer');
            window._cachedUcRubbleRect = rubbleLayer ? rubbleLayer.getBoundingClientRect() : null;
            window._lastUcMetricsTime = performance.now();
        }
    }

    if (!window._ucMetricsObserver) {
        window._ucMetricsObserver = new ResizeObserver(() => {
            updateUcMetrics();
        });
        const pf = document.querySelector(playfieldSelector);
        if (pf) window._ucMetricsObserver.observe(pf);
        const rl = document.querySelector('.rubble-layer');
        if (rl) window._ucMetricsObserver.observe(rl);
        window.addEventListener('resize', updateUcMetrics);
    }
    if (!window._cachedUcPfRect) {
        updateUcMetrics();
    }
    
    const base = createBaseSpawner({
        playfieldSelector,
        waterSelector: '#water-background',
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
            const wRect = M.wRect && M.wRect.height > 0 ? M.wRect : { top: M.pfRect.top, left: M.pfRect.left, height: M.pfRect.height * 0.35 };
            const waterToPfTop = wRect.top - M.pfRect.top;
            const spawnY = Math.max(0, waterToPfTop);

            const maxSize = baseSize * Math.pow(1.1, UC_MATERIALS.length - 1);
            const sharedMinX = MATERIAL_MARGIN;
            const sharedMaxX = Math.max(sharedMinX, pfW - maxSize - MATERIAL_MARGIN);
            const sharedSpawnX = sharedMinX + Math.random() * (sharedMaxX - sharedMinX);
            
            // Return one placeholder item representing the strike intent.
            const spawns = [{
                isStrikePlaceholder: true,
                coin: { x0: sharedSpawnX, y0: spawnY, jitterMs: 0 }
            }];

            const itemsToAdd = spawns.length + batchLength;
            if (maxActiveItems !== Infinity && (activeItems.length - garbageCount + itemsToAdd) > maxActiveItems) {
                let strictOverflow = (activeItems.length - garbageCount + itemsToAdd) - maxActiveItems;
                let bufferToRemove = Math.floor(maxActiveItems * 0.05);
                let totalToRemove = strictOverflow + bufferToRemove;
                
                // Sweep 1: Only settled items (avoid deleting falling materials)
                let b = 0;
                while (totalToRemove > 0 && b < UC_MATERIALS.length) {
                    let targetForThisLayer = (b === 0) ? totalToRemove : strictOverflow;
                    
                    if (targetForThisLayer > 0) {
                        for (let i = 0, len = activeItems.length; i < len && targetForThisLayer > 0; i++) {
                            const c = activeItems[i];
                            if (c && !c.isRemoved && !c.isStrikePlaceholder && !c.isHiddenPreAllocated && c.settled && (c.sizeIndex || 0) === b) {
                                removeItem(c, i);
                                strictOverflow--;
                                totalToRemove--;
                                targetForThisLayer--;
                            }
                        }
                    }
                    b++;
                }

                // Sweep 2: Fallback to unsettled ONLY if we strictly need to clear space
                b = 0;
                while (strictOverflow > 0 && b < UC_MATERIALS.length) {
                    for (let i = 0, len = activeItems.length; i < len && strictOverflow > 0; i++) {
                        const c = activeItems[i];
                        if (c && !c.isRemoved && !c.isStrikePlaceholder && !c.isHiddenPreAllocated && (c.sizeIndex || 0) === b) {
                            removeItem(c, i);
                            strictOverflow--;
                        }
                    }
                    b++;
                }
            }
            return spawns;
        },

        onCommitBatch: (batch, activeItems, getItem, refs, animationDurationMs) => {
            const frag = document.createDocumentFragment();
            const newItems = [];
            const now = performance.now();
            let playedSoundInBatch = false;
            
            // Override animation duration to match spawn rate cycle
            const cycleMs = currentRate > 0 ? 1000 / currentRate : 5000;

            for (const item of batch) {
                if (item.isStrikePlaceholder) {
                    // Create strike placeholder
                    const strikeObj = {
                        isStrikePlaceholder: true,
                        startX: item.coin.x0,
                        startY: item.coin.y0,
                        startTime: now + item.coin.jitterMs + cycleMs,
                        jitterMs: item.coin.jitterMs,
                        isRemoved: false,
                        settled: false,
                        dieAt: now + Math.max(200, cycleMs * 2), // remove relatively soon
                        size: baseSize,
                        preAllocatedItems: []
                    };
                    strikeObj.index = activeItems.length;
                    activeItems.push(strikeObj);
                    newItems.push(strikeObj);
                    
                    if (!playedSoundInBatch) playedSoundInBatch = true;

                    // Pre-allocate items for all potential drops to properly use spawnerCore's object pool
                    for (let j = 0; j < UC_MATERIALS.length; j++) {
                        const preAllocObj = {
                            el: null,
                            isHiddenPreAllocated: true,
                            isPreAllocatedMaterial: true,
                            isRemoved: false,
                            settled: false,
                            dieAt: now + Math.max(200, cycleMs * 2), // dies with placeholder if unused
                            startTime: now + cycleMs * 2
                        };
                        preAllocObj.index = activeItems.length;
                        activeItems.push(preAllocObj);
                        
                        strikeObj.preAllocatedItems.push(preAllocObj);
                    }
                }
            }

            refs.c.appendChild(frag);

            // Pickaxe Logic
            if (newItems.length > 0 && settingsManager.get('spawn_vessels')) {
                if (!window._cachedUcRubbleRect) {
                    const rl = document.querySelector('.rubble-layer');
                    if (rl) window._cachedUcRubbleRect = rl.getBoundingClientRect();
                }
                const rubbleRect = window._cachedUcRubbleRect;
                if (rubbleRect) {
                    // Use cached metrics
                    const pfRect = window._cachedUcPfRect || (refs.pf ? refs.pf.getBoundingClientRect() : document.querySelector(playfieldSelector).getBoundingClientRect());
                    const pfW = pfRect.width;

                    // Ensure only ONE persistent pickaxe exists at a time
                    let pickaxe = window._ucPickaxeElement || document.getElementById('uc-pickaxe');
                    if (!pickaxe) {
                        pickaxe = document.createElement('img');
                        window._ucPickaxeElement = pickaxe;
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
                    // pfRect already obtained above

                    // Y position between 25% and 75% of rubble layer height, relative to viewport
                    const pickY = rubbleRect.top + rubbleRect.height * 0.5 + window.innerHeight * 0.025;
                    
                    // Is left or right half?
                    const itemMiddleAbsoluteX = pfRect.left + item.startX + (item.size / 2);
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
                    // For left: tip is at -71px from pivot, so left edge should be at startX + 39.
                    // For right: tip is at +71px from pivot, so left edge should be at startX - 103.
                    const scaleFactor = pickaxeSize / 64;
                    const offsetX = (isLeft ? 39 : -103) * scaleFactor;
                    const offsetY = -60 * scaleFactor; // shift up so the tip is at the target Y

                    pickaxe.style.left = `${item.startX + offsetX}px`;
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
                const pickaxe = window._ucPickaxeElement || document.getElementById('uc-pickaxe');
                if (pickaxe && pickaxe.parentNode) {
                    pickaxe.parentNode.removeChild(pickaxe);
                }
                window._ucPickaxeElement = null;
            }
        },

        onItemUpdate: (activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState) => {
            const pickaxe = window._ucPickaxeElement || document.getElementById('uc-pickaxe');
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

            const activeItemsToActivate = [];

            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                
                if (now >= c.dieAt) {
                    removeItem(c, i);
                    continue;
                }

                if (c.settled) continue;

                if (c.isStrikePlaceholder) {
                    const elapsed = now - c.startTime;
                    if (elapsed >= 0) {
                        // Execute DP Checks and Spawn Logic right at strike
                        if (!window._ucMaterialAccumulators) {
                            try {
                                const stored = localStorage.getItem(`ccc:ucMaterialAccumulators:${getActiveSlot()}`);
                                if (stored) {
                                    window._ucMaterialAccumulators = JSON.parse(stored);
                                } else {
                                    window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
                                }
                            } catch {
                                window._ucMaterialAccumulators = new Array(UC_MATERIALS.length).fill(0);
                            }
                        }

                        let dpLevelNum = 0;
                        if (window.dpSystem && typeof window.dpSystem.getDpState === 'function') {
                            const dpState = window.dpSystem.getDpState();
                            if (dpState && dpState.dpLevel) {
                                try {
                                    dpLevelNum = (bigNumIsInfinite(dpState.dpLevel) ? Infinity : (dpState.dpLevel.sig * Math.pow(10, dpState.dpLevel.e)));
                                } catch {}
                            }
                        }

                        // Use cached layout values if available (spawnerCore updates M in its loop)
                        const pfRect = window._cachedUcPfRect || { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
                        const wRect = window._cachedUcWRect !== undefined ? window._cachedUcWRect : null;
                        const safeBottom = window._cachedUcSafeBottom !== undefined ? window._cachedUcSafeBottom : (pfRect.height - 100);
                        
                        let allocatedIndex = 0;

                        for (let j = 0; j < UC_MATERIALS.length; j++) {
                            const t = UC_MATERIAL_DATA[j];
                            if (j === 0) {
                                window._ucMaterialAccumulators[j] = 1.0;
                            } else {
                                if (dpLevelNum >= t.max) {
                                    window._ucMaterialAccumulators[j] += 1.0;
                                } else if (dpLevelNum >= t.start) {
                                    const progress = (dpLevelNum - t.start) / (t.max - t.start);
                                    const gain = 0.01 + 0.99 * Math.pow(progress, 1.5);
                                    window._ucMaterialAccumulators[j] += gain + 1e-9;
                                }
                            }

                            if (window._ucMaterialAccumulators[j] > 1.99) {
                                window._ucMaterialAccumulators[j] = 1.99;
                            }

                            if (window._ucMaterialAccumulators[j] >= 1.0) {
                                window._ucMaterialAccumulators[j] -= 1.0;

                                const size = baseSize * Math.pow(1.1, j);
                                const drift = Math.random() * 200 - 100;
                                const spawnX = c.startX;
                                const MATERIAL_MARGIN = 12;
                                const minX = MATERIAL_MARGIN;

                                let endX;
                                if (size >= pfRect.width) {
                                    endX = (pfRect.width - size) / 2;
                                } else {
                                    const mx = pfRect.width - size - MATERIAL_MARGIN;
                                    if (minX >= mx) endX = (pfRect.width - size)/2;
                                    else endX = clamp(spawnX + drift, minX, mx);
                                }

                                const fallbackWaterH = pfRect.height * 0.35;
                                const actualWaterH = (wRect && wRect.height > 0) ? wRect.height : fallbackWaterH;
                                const effectiveWaterH = Math.min(actualWaterH, pfRect.height * 0.3);
                                const minY = Math.max(effectiveWaterH + 80, 120);
                                const maxY = Math.max(minY + 40, safeBottom - size - 6);
                                const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);

                                // Use pre-allocated item
                                const preAlloc = c.preAllocatedItems[allocatedIndex];
                                if (preAlloc) {
                                    allocatedIndex++;
                                    preAlloc.isHiddenPreAllocated = false;
                                    preAlloc.dieAt = now + materialTtlMs;
                                    preAlloc.startTime = now;
                                    preAlloc.duration = animationDurationMs;
                                    preAlloc.jitterMs = 0;
                                    preAlloc.size = size;
                                    preAlloc.sizeIndex = j;
                                    preAlloc.startX = spawnX;
                                    preAlloc.startY = c.startY;
                                    preAlloc.endX = endX;
                                    preAlloc.endY = endY;
                                    preAlloc.x = spawnX;
                                    preAlloc.y = c.startY;
                                    preAlloc.rot = -10;
                                    preAlloc.scale = 0.96;
                                    preAlloc.src = `img/materials/${UC_MATERIALS[j]}.webp`;
                                    preAlloc.srcId = j;
                                    preAlloc.bMinX = Math.min(spawnX, endX) - size;
                                    preAlloc.bMaxX = Math.max(spawnX, endX) + size;
                                    preAlloc.bMinY = Math.min(c.startY, endY) - size;
                                    preAlloc.bMaxY = Math.max(c.startY, endY) + size;

                                    // No DOM element needed, handled by spawnerCore canvas rendering
                                    activeItemsToActivate.push(preAlloc);
                                }
                            }
                        }

                        // Remove unused pre-allocated items
                        for (let k = allocatedIndex; k < c.preAllocatedItems.length; k++) {
                            removeItem(c.preAllocatedItems[k], -1);
                        }
                        
                        try {
                            if (!window._lastUcStorageSaveTime || now - window._lastUcStorageSaveTime > 2000) {
                                localStorage.setItem(`ccc:ucMaterialAccumulators:${getActiveSlot()}`, JSON.stringify(window._ucMaterialAccumulators));
                                window._lastUcStorageSaveTime = now;
                            }
                        } catch {}

                        removeItem(c, i);
                        continue;
                    } else {
                        continue;
                    }
                }
                
                if (c.isHiddenPreAllocated) continue;
                
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
                    }
                    newlySettledBuffer.push(c);
                    continue;
                }
            }

            if (activeItemsToActivate.length > 0) {
                const domItems = activeItemsToActivate.filter(c => c.el);
                if (domItems.length > 0) {
                    void domItems[0].el.offsetHeight;

                    requestAnimationFrame(() => {
                        for (const c of domItems) {
                            if (!c.el) continue;
                            if (settingsManager.get('insta_teleport')) {
                                c.el.style.transition = 'none';
                            } else {
                                c.el.style.transition = `transform ${animationDurationMs}ms ${CUBIC_BEZIER} 0ms`;
                            }
                            c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
                        }
                    });
                }
            }
        },

        onDrawSingleSettledItem: (ctx, c) => {
            const size = c.size || baseSize;
            if (c.src) {
                const renderable = getPreRenderedItem(c.src, size);
                if (renderable) {
                    if (c.rot || c.scale !== 1) {
                        ctx.save();
                        ctx.translate(c.x + size / 2, c.y + size / 2);
                        if (c.rot) ctx.rotate(c.rot * Math.PI / 180);
                        if (c.scale !== 1) ctx.scale(c.scale, c.scale);
                        ctx.drawImage(renderable, -size / 2, -size / 2, size, size);
                        ctx.restore();
                    } else {
                        ctx.drawImage(renderable, c.x, c.y, size, size);
                    }
                }
            }
        },

        onDrawHitbox: (ctx, c, cx, cy, size) => {
            ctx.beginPath();
            const rx = size * 0.5;
            const ry = size * 0.25;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
        },

        onEnsureItemVisual: (el, c) => {
            const size = c.size || baseSize;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.className = `material material--${UC_MATERIALS[c.sizeIndex || 0]}`;
            
            el.style.transition = '';
            el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
            
            if (el.firstChild) {
                el.firstChild.src = getPreRenderedItemUrl(c.src, size);
            }
            
            el.style.opacity = '1';
            el.style.display = 'block';
        },

        onClearPlayfield: (activeItems, removeItem, resetType) => {
            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                if (resetType === 'underwater_cavern' && (c.isStrikePlaceholder || c.isPreAllocatedMaterial)) continue;
                removeItem(activeItems[i], i);
            }
            const pickaxe = document.getElementById("uc-pickaxe");
            if (pickaxe && pickaxe.parentNode && resetType !== 'underwater_cavern') {
                pickaxe.parentNode.removeChild(pickaxe);
                window._ucPickaxeElement = null;
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
                
                if (now < c.startTime) continue;

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
                
                if (now < c.startTime) continue;

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
