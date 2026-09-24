// js/game/coralSpawner.js
import { createBaseSpawner, getPreRenderedImageBitmap } from "./spawnerCore.js";
import { IS_MOBILE } from "../util/platformChecker.js";
import { getActiveSlot } from "../util/storage.js";
import { playAudio } from "../util/audioManager.js";
import { settingsManager } from "./settingsManager.js";

const CORAL_ASSETS = {
    red: "img/currencies/coral/coral_red.webp",
    // future: green, blue, etc.
};

function getDynamicMaxCapacity() {
    if (typeof window === 'undefined') return IS_MOBILE ? 1000 : 5000;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const area = vw * vh;
    
    if (area >= 1000000) return 5000;
    if (area <= 400000) return 1000;
    
    // Linear interpolation
    const ratio = (area - 400000) / (1000000 - 400000);
    return Math.floor(1000 + ratio * (5000 - 1000));
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

            const minX = COIN_MARGIN;
            const maxX = pfW - baseSize - COIN_MARGIN;
            if (maxX <= minX) return null;

            const maxY = safeBottom - baseSize - 6;
            const minY = canopyHitY;
            if (maxY <= minY) return null;

            const itemsToAdd = 1 + batchLength;
            const limit = typeof maxActiveItems === "function" ? maxActiveItems() : maxActiveItems;
            
            const totalActive = activeItems.length - garbageCount + risingBubbles.length;
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

            const spawnX = minX + Math.random() * (maxX - minX);
            const drift = (Math.random() - 0.5) * 100;
            let endX = Math.max(minX, Math.min(maxX, spawnX + drift));
            const endY = minY + Math.random() * (maxY - minY);

            // Spawn exactly so the top of the bubble is at the bottom of the viewport frame
            const bubbleStartY = pf.height + baseSize;

            return {
                x0: spawnX,
                startY: bubbleStartY,
                hitY: minY,
                fallEndX: endX,
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
                    size: 6 + Math.random() * 6, // Random bubble radius 6-12px
                    animationDurationMs: animationDurationMs
                });
            }
        },

        onDrawFx: (fxCtx, fxCanvas, dt, now, getItemState) => {
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

            if (settingsManager.get("spawn_vessels")) {
                const dynamicHitY = currentCanopyV - 35;

                // 1. Draw rising bubbles
                fxCtx.lineWidth = 2;
                for (const b of risingBubbles) {
                    const bx = b.x + Math.sin(b.timeElapsed / 500 + b.seed) * 15;
                    // Spawn exactly so the top of the bubble is at the bottom of the viewport frame
                    const startY = lastCanopyH + b.size;
                    const by = startY - ((startY - dynamicHitY) * (b.timeElapsed / b.duration));
                    
                    const gradX = bx - b.size * 0.4;
                    const gradY = by - b.size * 0.4;
                    
                    // Main radial gradient background matching Map:
                    // radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.1) 70%, transparent 100%)
                    const bgGrad = fxCtx.createRadialGradient(gradX, gradY, 0, gradX, gradY, b.size * 1.8);
                    bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                    bgGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
                    bgGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    
                    fxCtx.beginPath();
                    fxCtx.arc(bx, by, b.size, 0, Math.PI * 2);
                    fxCtx.fillStyle = bgGrad;
                    fxCtx.fill();
                    
                    // Inset shadow matching Map:
                    // box-shadow: inset 0 0 5px rgba(255, 255, 255, 0.5)
                    const insetGrad = fxCtx.createRadialGradient(bx, by, Math.max(0, b.size - 5), bx, by, b.size);
                    insetGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                    insetGrad.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
                    
                    fxCtx.beginPath();
                    fxCtx.arc(bx, by, b.size, 0, Math.PI * 2);
                    fxCtx.fillStyle = insetGrad;
                    fxCtx.fill();
                }

                // 2. Draw pop effects
                for (const p of popEffects) {
                    const progress = p.timeElapsed / p.duration;
                    const alpha = 1 - progress;
                    const radius = 5 + progress * 15;
                    
                    fxCtx.beginPath();
                    fxCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                    fxCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    fxCtx.lineWidth = 2;
                    fxCtx.stroke();

                    // Small particles
                    for (let j = 0; j < 4; j++) {
                        const angle = (j / 4) * Math.PI * 2 + (p.timeElapsed * 0.01);
                        const dist = progress * 20;
                        const px = p.x + Math.cos(angle) * dist;
                        const py = p.y + Math.sin(angle) * dist;
                        fxCtx.beginPath();
                        fxCtx.arc(px, py, 2, 0, Math.PI * 2);
                        fxCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                        fxCtx.fill();
                    }
                }
            }

            // 3. Draw falling corals
            for (let i = 0; i < base.getActiveItems().length; i++) {
                const c = base.getActiveItems()[i];
                if (c && !c.settled && !c.isRemoved) {
                    const s = getItemState(c, now);
                    const renderable = getPreRenderedImageBitmap(c.src, c.size);
                    if (renderable) {
                        let half = c.size / 2;
                        fxCtx.save();
                        fxCtx.translate(s.x + half, s.y + half);
                        if (s.rot) fxCtx.rotate(s.rot * Math.PI / 180);
                        if (s.scale !== 1) fxCtx.scale(s.scale, s.scale);
                        
                        const draw = (img) => fxCtx.drawImage(img, -half, -half, c.size, c.size);
                        if (renderable instanceof HTMLCanvasElement || (typeof ImageBitmap !== "undefined" && renderable instanceof ImageBitmap)) {
                            draw(renderable);
                        } else if (renderable.complete && renderable.naturalWidth > 0) {
                            draw(renderable);
                        }
                        fxCtx.restore();
                    }
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
                    playAudio("sounds/pop.ogg", { type: "spawn_vessel", volume: 0.6, pitch: 0.9 + Math.random() * 0.2 });
                    
                    const popX = b.x + Math.sin(b.timeElapsed / 500 + b.seed) * 15;
                    
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
                    
                    // Remove the bubble
                    risingBubbles.splice(i, 1);
                }
            }

            // 2. Update pop effects
            for (let i = popEffects.length - 1; i >= 0; i--) {
                const p = popEffects[i];
                p.timeElapsed += dt * 1000;
                if (p.timeElapsed >= p.duration) {
                    popEffects.splice(i, 1);
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
