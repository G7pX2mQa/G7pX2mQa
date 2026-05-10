import { createBaseSpawner, CUBIC_BEZIER, getImage } from './spawnerCore.js';
import { playAudio } from '../util/audioManager.js';

const MATERIALS = [
    'stone',
    'copper',
    'iron',
    'pure_gold',
    'diamond',
    'emerald',
    'ruby',
    'obsidian',
    'unobtainium',
    'prismatium'
];

export function createUcSpawner(config = {}) {
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
    } = config;

    let soundLastAt = 0;
    const soundURL = new URL('sounds/got_our_pickaxe_swinging_from_side_to_side.ogg', document.baseURI).href;

    function playSpawnSound() {
        const now = performance.now();
        if (now - soundLastAt < soundMinIntervalMs) return;
        soundLastAt = now;
        playAudio(soundURL, { volume: 0.3, type: 'sfx' });
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
        numLayers: MATERIALS.length,

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
            const matIndex = Math.floor(Math.random() * MATERIALS.length);
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

            for (const { coin, matIndex, size } of batch) {
                const el = getItem();
                el.style.width = `${size}px`;
                el.style.height = `${size}px`;
                el.className = `material material--${MATERIALS[matIndex]}`;
                
                if (el.firstChild) {
                     el.firstChild.src = `img/materials/${MATERIALS[matIndex]}.webp`;
                }
                
                el.style.transform = `translate3d(${coin.x0}px, ${coin.y0}px, 0) rotate(-10deg) scale(0.96)`;
                el.style.opacity = '1';
                el.style.zIndex = `${10 + (matIndex * 10)}`;

                const itemObj = {
                    el,
                    src: `img/materials/${MATERIALS[matIndex]}.webp`,
                    x: coin.x0,
                    y: coin.y0,
                    rot: -10,
                    scale: 0.96,
                    startX: coin.x0,
                    startY: coin.y0,
                    endX: coin.x1,
                    endY: coin.y1,
                    startTime: now + coin.jitterMs,
                    duration: animationDurationMs,
                    dieAt: now + materialTtlMs,
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
                      c.el.style.transition = `transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${c.jitterMs}ms`;
                      c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
                  }
                });
            }

            if (playedSoundInBatch) {
                playSpawnSound();
            }
        },

        onItemUpdate: (activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState) => {
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
            el.className = `material material--${MATERIALS[c.sizeIndex || 0]}`;
            
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
        setRate: base.setRate,
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
