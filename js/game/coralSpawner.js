// js/game/coralSpawner.js
import { createBaseSpawner, getPreRenderedImageBitmap, getDynamicMaxCapacity } from "./spawnerCore.js";
import { IS_MOBILE } from "../util/platformChecker.js";
import { getActiveSlot } from "../util/storage.js";
import { playAudio } from "../util/audioManager.js";
import { settingsManager } from "./settingsManager.js";

const CORAL_ASSETS = {
    red: "img/currencies/coral/coral_red.webp",
    // future: green, blue, etc.
};

const SINE_TABLE_SIZE = 4096;
const SINE_TABLE = new Float32Array(SINE_TABLE_SIZE);
for (let i = 0; i < SINE_TABLE_SIZE; i++) {
    SINE_TABLE[i] = Math.sin((i / SINE_TABLE_SIZE) * Math.PI * 2);
}
const SINE_MAGIC = SINE_TABLE_SIZE / (Math.PI * 2);

const cachedBubbles = {};
function getBubbleCanvas(radius) {
    const r = Math.round(radius);
    if (cachedBubbles[r]) return cachedBubbles[r];

    const canvas = document.createElement("canvas");
    canvas.width = r * 2;
    canvas.height = r * 2;
    const ctx = canvas.getContext("2d");
    
    const gradX = r - r * 0.4;
    const gradY = r - r * 0.4;
    
    const bgGrad = ctx.createRadialGradient(gradX, gradY, 0, gradX, gradY, r * 1.8);
    bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    bgGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    bgGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();
    
    const insetGrad = ctx.createRadialGradient(r, r, Math.max(0, r - 5), r, r, r);
    insetGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    insetGrad.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
    
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = insetGrad;
    ctx.fill();

    cachedBubbles[r] = canvas;
    return canvas;
}

export function createCoralSpawner(config = {}) {
    const {
        playfieldSelector = ".playfield",
        coralHost = ".coral-layer",
        baseSize = 40,
        animationDurationMs = 1500,
        coralsPerSecond = 1,
        perFrameBudget = 24,
        initialBurst = 1,
        shouldAutoResume = () => true,
    } = config;

    let currentRate = coralsPerSecond;
    let deps = {};
    let activeMode = "red"; // For future color shifting

    const spawnRateAtWhichTheVolumeIsNormal = 1;
    const spawnRateAtWhichTheVolumeIsOneFifthOfNormal = 20;
    let cachedRate = -1;
    let cachedVolume = 0.6;
    let popLastAt = 0;
    const popSoundMinIntervalMs = 100;

    function getBubbleSoundVolume() {
        const baseVol = 0.6;
        if (currentRate === cachedRate) {
            return cachedVolume;
        }

        cachedRate = currentRate;

        const effectiveRate = Math.min(currentRate, 10);
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const fadeProgress = clamp((effectiveRate - spawnRateAtWhichTheVolumeIsNormal) / (spawnRateAtWhichTheVolumeIsOneFifthOfNormal - spawnRateAtWhichTheVolumeIsNormal), 0, 1);

        const easeOut = fadeProgress * (2 - fadeProgress);
        // Previously the minimum was 1/3 of baseVol (dropped by 2/3). 
        // To make it 5x as quiet as before, we drop by 14/15, leaving 1/15 of baseVol.
        cachedVolume = baseVol * (1 - easeOut * (14 / 15));
        return cachedVolume;
    }

    // Used for bounds checking and sweeps
    const COIN_MARGIN = 12;

    const risingBubbles = [];
    const popEffects = [];
    
    let lastCanopyW = 0;
    let lastCanopyH = 0;
    let currentCanopyV = 200; // default visible height
    
    function getVisibleCanopyHeight(pfH) {
        // Match the rubble layer's 17% height scaling
        return Math.max(100, pfH * 0.17);
    }
    
    function updateCanopyLayout(pfW, pfH) {
        const layer = document.getElementById("coral-canopy-layer");
        if (!layer) return;
        
        const V = getVisibleCanopyHeight(pfH);
        currentCanopyV = V;
        
        const numChunks = Math.ceil(pfW / 512);
        const totalW = numChunks * 512;
        const left = (pfW - totalW) / 2;
        
        // At most bottom 400px of the 512px image is shown (top 112px always hidden)
        // If V visible is needed, top offset is -(512 - V)
        const topOffset = -(512 - V);
        
        layer.style.width = totalW + "px";
        layer.style.height = "512px";
        layer.style.left = left + "px";
        layer.style.top = topOffset + "px";
        
        // In the future this can dynamically map to activeMode (e.g. coral_pattern_green.webp)
        const src = `img/currencies/coral/coral_pattern_${activeMode}.webp`;
        layer.style.backgroundImage = `url('${src}')`;
        layer.style.backgroundRepeat = "repeat-x";
        layer.style.backgroundSize = "512px 512px";
        
        // Clean up any old canvas if we transition from previous code
        const old = layer.querySelector("canvas");
        if (old) old.remove();
    }

    if (typeof window !== "undefined" && "ResizeObserver" in window) {
        const ro = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width !== lastCanopyW || height !== lastCanopyH) {
                    updateCanopyLayout(width, height);
                    lastCanopyW = width;
                    lastCanopyH = height;
                }
            }
        });
        const pf = document.querySelector(playfieldSelector);
        if (pf) ro.observe(pf);
    }

    const base = createBaseSpawner({
        playfieldSelector,
        itemsHostSelector: coralHost,
        baseItemSize: baseSize,
        animationDurationMs,
        itemsPerSecond: coralsPerSecond,
        perFrameBudget,
        maxActiveItems: getDynamicMaxCapacity,
        initialBurst,
        shouldAutoResume,
        numLayers: 1, // Currently only 1 size of coral

        onPlanSpawn: (M, activeItems, garbageCount, removeItem, maxActiveItems, batchLength) => {
            const pf = M.pfRect;
            if (!pf) return null;

            if (M.pfW !== lastCanopyW || pf.height !== lastCanopyH) {
                updateCanopyLayout(M.pfW, pf.height);
                lastCanopyW = M.pfW;
                lastCanopyH = pf.height;
            }

            const pfW = M.pfW;
            const safeBottom = M.safeBottom;

            // Bubbles pop higher inside the visible edge of the coral pattern chunk
            const canopyHitY = currentCanopyV - 35;

            const centerMinX = COIN_MARGIN + baseSize / 2;
            const centerMaxX = pfW - COIN_MARGIN - baseSize / 2;
            if (centerMaxX <= centerMinX) return null;

            const maxY = safeBottom - baseSize - 6;
            const minY = canopyHitY;
            if (maxY <= minY) return null;

            const itemsToAdd = 1 + batchLength;
            const limit = typeof maxActiveItems === "function" ? maxActiveItems() : maxActiveItems;
            
            const totalActive = activeItems.length - garbageCount;
            if (totalActive + itemsToAdd > limit) {
                let overflow = (totalActive + itemsToAdd) - limit;
                for (let i = 0; i < activeItems.length && overflow > 0; i++) {
                    const c = activeItems[i];
                    if (c && !c.isRemoved && c.settled) {
                        removeItem(c, i);
                        overflow--;
                    }
                }
            }

            const spawnCenterX = centerMinX + Math.random() * (centerMaxX - centerMinX);
            const drift = (Math.random() - 0.5) * 100;
            let endCenterX = Math.max(centerMinX, Math.min(centerMaxX, spawnCenterX + drift));
            const endY = minY + Math.random() * (maxY - minY);

            // Spawn exactly so the top of the bubble is at the bottom of the viewport frame
            const bubbleStartY = pf.height + baseSize;

            return {
                x0: spawnCenterX,
                startY: bubbleStartY,
                hitY: minY,
                fallEndX: endCenterX - baseSize / 2,
                fallEndY: endY,
                seed: Math.random() * Math.PI * 2
            };
        },

        onCommitBatch: (batch, activeItems, getItem, refs, animationDurationMs) => {
            for (let i = 0; i < batch.length; i++) {
                const plan = batch[i];
                risingBubbles.push({
                    x: plan.x0,
                    startY: plan.startY,
                    hitY: plan.hitY,
                    fallEndX: plan.fallEndX,
                    fallEndY: plan.fallEndY,
                    timeElapsed: 0,
                    duration: 10000, // Exactly 10 seconds of rising
                    seed: plan.seed,
                    size: Math.floor(6 + Math.random() * 7), // Random bubble radius 6-12px
                    animationDurationMs: animationDurationMs
                });
            }
        },

        onDrawFx: (fxCtx, fxCanvas, dt, now, getItemState) => {
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

            if (settingsManager.get("spawn_vessels")) {
                fxCtx.imageSmoothingEnabled = false;
                const dynamicHitY = currentCanopyV - 35;

                const sizeData = new Array(13);
                for (let s = 6; s <= 12; s++) {
                    const startY = lastCanopyH + s;
                    sizeData[s] = {
                        canvas: getBubbleCanvas(s),
                        startY: startY,
                        yRate: (startY - dynamicHitY) / 10000
                    };
                }

                // 1. Draw rising bubbles (Grouped by texture/size for massive GPU batching)
                const rLen = risingBubbles.length;
                for (let s = 6; s <= 12; s++) {
                    const sData = sizeData[s];
                    const canvas = sData.canvas;
                    const startY = sData.startY;
                    const yRate = sData.yRate;
                    
                    for (let i = 0; i < rLen; i++) {
                        const b = risingBubbles[i];
                        if (b.size !== s) continue;
                        
                        const angle = b.timeElapsed * 0.002 + b.seed;
                        const sinVal = SINE_TABLE[((angle * SINE_MAGIC) | 0) & 4095];
                        const bx = b.x + sinVal * 15;
                        const by = startY - yRate * b.timeElapsed;
                        
                        fxCtx.drawImage(canvas, (bx - s) | 0, (by - s) | 0);
                    }
                }

                // 2. Draw pop effects
                const pLen = popEffects.length;
                if (pLen > 0) {
                    fxCtx.lineWidth = 2;
                    fxCtx.strokeStyle = "rgb(255, 255, 255)";
                    fxCtx.fillStyle = "rgb(255, 255, 255)";
                    
                    for (let i = 0; i < pLen; i++) {
                        const p = popEffects[i];
                        const progress = p.timeElapsed * 0.003333333; // duration is 300
                        const alpha = 1 - progress;
                        const radius = 5 + progress * 15;
                        
                        fxCtx.globalAlpha = alpha;
                        
                        fxCtx.beginPath();
                        fxCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                        fxCtx.stroke();

                        // Small particles
                        const offsetAngle = p.timeElapsed * 0.01;
                        const dist = progress * 20;
                        const sIdx = ((offsetAngle * SINE_MAGIC) | 0) & 4095;
                        const cIdx = (sIdx + 1024) & 4095; // + PI/2
                        const sinA = SINE_TABLE[sIdx] * dist;
                        const cosA = SINE_TABLE[cIdx] * dist;
                        
                        fxCtx.beginPath();
                        
                        // j = 0
                        let px = p.x + cosA;
                        let py = p.y + sinA;
                        fxCtx.moveTo(px + 2, py);
                        fxCtx.arc(px, py, 2, 0, Math.PI * 2);
                        
                        // j = 1
                        px = p.x - sinA;
                        py = p.y + cosA;
                        fxCtx.moveTo(px + 2, py);
                        fxCtx.arc(px, py, 2, 0, Math.PI * 2);
                        
                        // j = 2
                        px = p.x - cosA;
                        py = p.y - sinA;
                        fxCtx.moveTo(px + 2, py);
                        fxCtx.arc(px, py, 2, 0, Math.PI * 2);
                        
                        // j = 3
                        px = p.x + sinA;
                        py = p.y - cosA;
                        fxCtx.moveTo(px + 2, py);
                        fxCtx.arc(px, py, 2, 0, Math.PI * 2);
                        
                        fxCtx.fill();
                    }
                    fxCtx.globalAlpha = 1.0;
                }
            }
        },

        onItemUpdate: (activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState) => {
            const dynamicHitY = currentCanopyV - 35;
            
            // 1. Update rising bubbles
            for (let i = risingBubbles.length - 1; i >= 0; i--) {
                const b = risingBubbles[i];
                b.timeElapsed += dt * 1000;

                if (b.timeElapsed >= b.duration) {
                    // Bubble fully concealed and pops!
                    if (now - popLastAt >= popSoundMinIntervalMs) {
                        popLastAt = now;
                        playAudio("sounds/pop.ogg", { type: "spawn_vessel", volume: getBubbleSoundVolume(), pitch: 0.9 + Math.random() * 0.2 });
                    }
                    
                    const angle = b.timeElapsed * 0.002 + b.seed;
                    const sinVal = SINE_TABLE[((angle * SINE_MAGIC) | 0) & 4095];
                    const popX = b.x + sinVal * 15;
                    
                    popEffects.push({
                        x: popX,
                        y: dynamicHitY,
                        timeElapsed: 0,
                        duration: 300 // 0.3s pop animation
                    });

                    // Fall target adjustment in case window shrank dramatically and bottom is now above the canopy!
                    const adjustedEndY = Math.max(b.fallEndY, dynamicHitY + baseSize + 10);

                    // Spawn the coral (offsetting by half size since x,y represent top-left but popX,hitY is center)
                    // Added -25 manual offset per user request
                    const cStartX = popX - baseSize / 2;
                    const cStartY = dynamicHitY - baseSize / 2 - 25;

                    const coralObj = {
                        el: null,
                        isRemoved: false,
                        size: baseSize,
                        sizeIndex: 0,
                        src: CORAL_ASSETS[activeMode] || CORAL_ASSETS.red,
                        x: cStartX,
                        y: cStartY,
                        startX: cStartX,
                        startY: cStartY,
                        endX: b.fallEndX,
                        endY: adjustedEndY,
                        startTime: now,
                        duration: b.animationDurationMs,
                        dieAt: 1e99,
                        settled: false,
                        scale: 0.96,
                        rot: -10,
                        bMinX: Math.min(cStartX, b.fallEndX) - baseSize,
                        bMaxX: Math.max(cStartX, b.fallEndX) + baseSize,
                        bMinY: Math.min(cStartY, adjustedEndY) - baseSize,
                        bMaxY: Math.max(cStartY, adjustedEndY) + baseSize,
                    };

                    coralObj.index = activeItems.length;
                    activeItems.push(coralObj);
                    
                    // Remove the bubble in O(1)
                    const lastIdx = risingBubbles.length - 1;
                    if (i !== lastIdx) {
                        risingBubbles[i] = risingBubbles[lastIdx];
                    }
                    risingBubbles.pop();
                }
            }

            // 2. Update pop effects
            for (let i = popEffects.length - 1; i >= 0; i--) {
                const p = popEffects[i];
                p.timeElapsed += dt * 1000;
                if (p.timeElapsed >= p.duration) {
                    const lastIdx = popEffects.length - 1;
                    if (i !== lastIdx) {
                        popEffects[i] = popEffects[lastIdx];
                    }
                    popEffects.pop();
                }
            }

            // 3. Standard active items update (bounds tracking and settled check)
            const count = activeItems.length;
            for (let i = count - 1; i >= 0; i--) {
                const c = activeItems[i];
                if (!c || c.isRemoved) continue;

                if (now > c.dieAt) {
                    removeItem(c, i);
                    continue;
                }

                if (!c.settled) {
                    const elapsed = now - c.startTime;
                    if (elapsed >= c.duration) {
                        c.settled = true;
                        c.x = c.endX;
                        c.y = c.endY;
                        c.rot = 0;
                        c.scale = 1;
                        newlySettledBuffer.push(c);
                        
                        c.bMinX = c.x;
                        c.bMaxX = c.x + c.size;
                        c.bMinY = c.y;
                        c.bMaxY = c.y + c.size;
                    } else {
                        const s = getItemState(c, now);
                        c.bMinX = s.x;
                        c.bMaxX = s.x + c.size;
                        c.bMinY = s.y;
                        c.bMaxY = s.y + c.size;
                    }
                }
            }
        },

        onDrawSingleSettledItem: (ctx, c) => {
            const size = c.size || baseSize;
            const renderable = getPreRenderedImageBitmap(c.src, size);
            if (renderable) {
                const draw = (img) => {
                    if (c.rot || c.scale !== 1) {
                        let halfSize = size / 2;
                        ctx.save();
                        ctx.translate(c.x + halfSize, c.y + halfSize);
                        if (c.rot) ctx.rotate(c.rot * Math.PI / 180);
                        if (c.scale !== 1) ctx.scale(c.scale, c.scale);
                        ctx.drawImage(img, -halfSize, -halfSize, size, size);
                        ctx.restore();
                    } else {
                        ctx.drawImage(img, c.x, c.y, size, size);
                    }
                };
                if (renderable instanceof HTMLCanvasElement || (typeof ImageBitmap !== "undefined" && renderable instanceof ImageBitmap)) {
                    draw(renderable);
                } else if (renderable.complete && renderable.naturalWidth > 0) {
                    draw(renderable);
                }
            }
        },

        onDrawHitbox: (ctx, c, cx, cy, size) => {
            ctx.beginPath();
            const r = size / 2;
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        },

        onEnsureItemVisual: (el, c) => {
            el.className = "coral";
            el.style.width = c.size + "px";
            el.style.height = c.size + "px";
            el.style.backgroundImage = `url("${c.src}")`;
            el.style.backgroundSize = "contain";
            el.style.backgroundRepeat = "no-repeat";
        },

        onClearPlayfield: (activeItems, removeItem, resetType) => {
            // Clear bubbles and canopy state so it regenerates on re-enter
            lastCanopyW = 0;
            risingBubbles.length = 0;
            popEffects.length = 0;

            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i];
                if (c) removeItem(c, i);
            }
        },
    });

    // Helper functions for collection
    function findItemTargetsInRadius(x, y, radius, isVisualHitbox) {
        let searchRadius = radius;
        if (isVisualHitbox) {
            searchRadius = Math.max(radius, 260);
        }
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
    }

    function findItemTargetsInPath(x1, y1, x2, y2, radius, isVisualHitbox) {
        let searchRadius = radius;
        if (isVisualHitbox) {
            searchRadius = Math.max(radius, 260);
        }
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
                    if (wx * wx + scaledWy * scaledWy <= limitSq) hit = true;
                } else if (scaledDot >= scaledLenSq) {
                    const dx = cx - x2;
                    const dy = cy - y2;
                    const scaledDy = dy * 2;
                    if (dx * dx + scaledDy * scaledDy <= limitSq) hit = true;
                } else {
                    const cross = wx * scaledVy - scaledWy * vx;
                    if (cross * cross <= limitSq * scaledLenSq) hit = true;
                }
            } else {
                const dot = wx * vx + wy * vy;
                const limitSq = radius * radius;
                if (dot <= 0) {
                    if (wx * wx + wy * wy <= limitSq) hit = true;
                } else if (dot >= lenSq) {
                    const dx = cx - x2;
                    const dy = cy - y2;
                    if (dx * dx + dy * dy <= limitSq) hit = true;
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
    }

    return {
        start: (resume) => {
            const pf = document.querySelector(playfieldSelector);
            if (pf) {
                updateCanopyLayout(pf.clientWidth, pf.clientHeight);
                lastCanopyW = pf.clientWidth;
                lastCanopyH = pf.clientHeight;
            }
            base.start(resume);
        },
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
        findItemTargetsInRadius,
        findItemTargetsInPath,
        setDependencies: (d) => {
            deps = { ...deps, ...d };
        }
    };
}
