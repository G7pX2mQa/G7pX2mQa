// js/game/spawner.js

import { takePreloadedAudio } from '../util/audioCache.js';
import { getMutationState, onMutationChange, getRandomMutationCoinSprite, getRandomMutationCoinId } from './mutationSystem.js';
import { IS_MOBILE } from '../main.js';
import { isSurgeActive, getTsunamiExponentWithCombo } from './surgeEffects.js';
import { playAudio } from '../util/audioManager.js';
import { waterSystem } from './webgl/waterSystem.js';
import { shouldBlockBigCoins } from '../util/bigCoinManager.js';
import { settingsManager } from './settingsManager.js';
import { AREAS, currentArea } from '../main.js';
import { createBaseSpawner, getCanvasSmoothingQuality, getImage, CUBIC_BEZIER, easeOutCubic, getPreRenderedCoin, getPreRenderedCoinUrl, clearPreRenderedCoins } from './spawnerCore.js';

let mutationUnlockedSnapshot = false;
let mutationLevelSnapshot = 0;

function updateMutationSnapshot(state) {
  if (!state || typeof state !== 'object') {
    mutationUnlockedSnapshot = false;
    mutationLevelSnapshot = 0;
    return;
  }
  mutationUnlockedSnapshot = !!state.unlocked;
  try {
    const level = state.level;
    const plain = typeof level?.toPlainIntegerString === 'function'
      ? level.toPlainIntegerString()
      : null;
    mutationLevelSnapshot = plain && plain !== 'Infinity' ? Number(plain) : 0;
  } catch {
    mutationLevelSnapshot = 0;
  }
}

try { updateMutationSnapshot(getMutationState()); } catch {}
try { onMutationChange((snapshot) => { updateMutationSnapshot(snapshot); }); } catch {}

// Surge 2 Constants
const COIN_SIZES = [40, 55, 80, 125, 200, 320, 512];
const LIGHTNING_START_RADIUS_RATIO = 0.78;
const COIN_VALUE_MULTS = [1, 25, 625, 15625, 390625, 9765625, 244140625];
const COIN_CHANCES = [
    0,          
    0.1,        
    0.01,       
    0.001,      
    0.0001,     
    0.00001,    
    0.000001,    
];
const COIN_SOUND_SUFFIXES = [
    '', 
    '_size1.ogg',
    '_size2.ogg',
    '_size3.ogg',
    '_size4.ogg',
    '_size5.ogg',
    '_size6.ogg'
];

const WAVE_DEFS = [
    { w: 22, h: 12 },  // Size 0 (Standard)
    { w: 28, h: 15 },  // Size 1
    { w: 36, h: 19 },  // Size 2
    { w: 48, h: 25 },  // Size 3
    { w: 64, h: 34 },  // Size 4
    { w: 85, h: 45 },  // Size 5
    { w: 120, h: 65 }, // Size 6
];

export function createSpawner(config = {}) {
    const {
        playfieldSelector = '.playfield',
        waterSelector = '#water-background',
        coinsHost = '.coins-layer',
        coinSrc = 'img/coin/coin.webp',
        coinSize: baseCoinSize = 40,
        animationDurationMs = 1500,
        surgeLifetimeMs = 1400,
        surgeWidthVw = 22,
        coinsPerSecond = 1,
        perFrameBudget = 24,
        maxActiveCoins = IS_MOBILE ? 2500 : 5000,
        initialBurst = 1,
        coinTtlMs = 1e99,
        waveSoundSrc = 'sounds/wave_spawn.ogg',
        waveSoundDesktopVolume = 0.45,
        waveSoundMobileVolume  = 0.2,
        waveSoundMinIntervalMs = 160,
        shouldAutoResume = () => true,
    } = config;

    let currentCoinSrc = coinSrc;
    let deps = { collectBatch: null, getMagnetUnit: null };

    settingsManager.subscribe('graphics_quality', () => {
        clearPreRenderedCoins();

        const activeCoins = base.getActiveItems();
        for (let i = 0; i < activeCoins.length; i++) {
            const c = activeCoins[i];
            if (c && c.el && !c.settled && !c.isRemoved) {
                if (c.el.firstChild) {
                    c.el.firstChild.src = getPreRenderedCoinUrl(c.src, c.size || baseCoinSize);
                }
            }
        }
        base.forceCanvasRedraw();
    });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const waveURL = new URL(waveSoundSrc, document.baseURI).href;
    let waveLastAt = 0;
    let activeWaveSounds = [];

    function playWaveOncePerBurst() {
      if (currentArea !== AREAS.STARTER_COVE) return;
      const now = performance.now();
      if (now - waveLastAt < waveSoundMinIntervalMs) return;
      waveLastAt = now;
      
      const vol = IS_MOBILE ? waveSoundMobileVolume : waveSoundDesktopVolume;
      const audioObj = playAudio(waveURL, { volume: vol, type: "music" });
      if (audioObj) {
          activeWaveSounds.push(audioObj);
          if (activeWaveSounds.length > 20) {
              activeWaveSounds.shift();
          }
      }
    }

    function stopAllWaveSounds() {
        for (const audioObj of activeWaveSounds) {
            try { audioObj.stop(); } catch(e) {}
        }
        activeWaveSounds = [];
    }

    const bolts = []; // { x1, y1, x2, y2, age, life, jaggedScale, width }
    const sparks = []; // { x, y, vx, vy, age, life, color }

    function addBolt(sourceCoin, targetCoin) {
        if (!sourceCoin || !targetCoin) return;
        const sSize = sourceCoin.size || baseCoinSize;
        const tSize = targetCoin.size || baseCoinSize;
        const x1 = sourceCoin.x + sSize/2;
        const y1 = sourceCoin.y + sSize/2;
        const x2 = targetCoin.x + tSize/2;
        const y2 = targetCoin.y + tSize/2;
        
        bolts.push({
            x1, y1, x2, y2,
            age: 0,
            life: 0.15
        });
    }

    function addStain(cx, cy, size) {
        const pf = base.getRefs().pf;
        if (!pf) return;
        const st = document.createElement('div');
        st.className = 'coin-stain';
        const d = size * 1.2;
        st.style.width = `${d}px`;
        st.style.height = `${d}px`;
        st.style.left = `${cx - d/2}px`;
        st.style.top = `${cy - d/2}px`;
        pf.appendChild(st);
        
        setTimeout(() => {
            st.style.opacity = '0';
            setTimeout(() => { if(st.parentNode) st.remove(); }, 1000);
        }, 2500);
    }

    function createBranchingLightning(coin, now) {
         const angle = Math.random() * Math.PI * 2;
         const r = (coin.size || baseCoinSize) / 2;
         
         const startDist = r * LIGHTNING_START_RADIUS_RATIO;
         const relStartX = Math.cos(angle) * startDist;
         const relStartY = Math.sin(angle) * startDist;
         
         const len = r * (0.7 + Math.random() * 0.6); 
         const relEndX = Math.cos(angle) * (startDist + len);
         const relEndY = Math.sin(angle) * (startDist + len);
         
         bolts.push({
             parentCoin: coin,
             relX1: relStartX, relY1: relStartY,
             relX2: relEndX, relY2: relEndY,
             x1: 0, y1: 0, x2: 0, y2: 0, 
             age: 0,
             life: 0.2, 
             jaggedScale: 20,
             width: 5.0 
         });
         
         const numBranches = 3 + Math.floor(Math.random() * 3); 
         for (let i = 0; i < numBranches; i++) {
             const t = 0.3 + Math.random() * 0.5;
             const bSx = relStartX + (relEndX - relStartX) * t;
             const bSy = relStartY + (relEndY - relStartY) * t;
             
             const branchAngle = angle + (Math.random() * 1.2 - 0.6); 
             const branchLen = len * (0.4 + Math.random() * 0.4);
             
             const bEx = bSx + Math.cos(branchAngle) * branchLen;
             const bEy = bSy + Math.sin(branchAngle) * branchLen;
             
             bolts.push({
                 parentCoin: coin,
                 relX1: bSx, relY1: bSy,
                 relX2: bEx, relY2: bEy,
                 x1: 0, y1: 0, x2: 0, y2: 0,
                 age: 0,
                 life: 0.2,
                 jaggedScale: 10,
                 width: 2.5
             });
         }

         playAudio('sounds/lightning_zap.ogg', { volume: 0.25 });
    }

    function createTargetedBranchingLightning(sourceCoin, targetX, targetY) {
         if (!sourceCoin) return;
         const size = sourceCoin.size || baseCoinSize;
         
         const now = performance.now();
         const s = base.getItemState(sourceCoin, now);
         const cx = s.x + size/2;
         const cy = s.y + size/2;
         
         const dx = targetX - cx;
         const dy = targetY - cy;
         const angle = Math.atan2(dy, dx);
         const dist = Math.sqrt(dx*dx + dy*dy);
         
         const startDist = (size / 2) * LIGHTNING_START_RADIUS_RATIO; 
         const relStartX = Math.cos(angle) * startDist;
         const relStartY = Math.sin(angle) * startDist;
         
         bolts.push({
             parentCoin: sourceCoin,
             relX1: relStartX, relY1: relStartY,
             x2: targetX, y2: targetY,
             age: 0,
             life: 0.25,
             width: 6,
             jaggedScale: 25
         });
         
         const startX = cx + relStartX;
         const startY = cy + relStartY;
         
         const numBranches = 6 + Math.floor(Math.random() * 5); 
         for (let i = 0; i < numBranches; i++) {
             const t = 0.1 + Math.random() * 0.8; 
             
             const splitX = startX + (targetX - startX) * t;
             const splitY = startY + (targetY - startY) * t;
             
             const branchAngle = angle + (Math.random() * 1.6 - 0.8); 
             const branchLen = dist * (0.1 + Math.random() * 0.3); 
             
             const endBX = splitX + Math.cos(branchAngle) * branchLen;
             const endBY = splitY + Math.sin(branchAngle) * branchLen;
             
             bolts.push({
                 x1: splitX, y1: splitY,
                 x2: endBX, y2: endBY,
                 age: 0,
                 life: 0.25,
                 width: 2.0,
                 jaggedScale: 15
             });
             
             if (Math.random() < 0.4) {
                 const subT = 0.5;
                 const subSx = splitX + (endBX - splitX) * subT;
                 const subSy = splitY + (endBY - splitY) * subT;
                 const subAngle = branchAngle + (Math.random() * 1.0 - 0.5);
                 const subLen = branchLen * 0.5;
                 
                 bolts.push({
                     x1: subSx, y1: subSy,
                     x2: subSx + Math.cos(subAngle) * subLen,
                     y2: subSy + Math.sin(subAngle) * subLen,
                     age: 0,
                     life: 0.25,
                     width: 1.5,
                     jaggedScale: 10
                 });
             }
         }
    }


    const base = createBaseSpawner({
        playfieldSelector,
        waterSelector,
        itemsHostSelector: coinsHost,
        baseItemSize: baseCoinSize,
        animationDurationMs,
        itemsPerSecond: coinsPerSecond,
        perFrameBudget,
        maxActiveItems: maxActiveCoins,
        initialBurst,
        itemTtlMs: coinTtlMs,
        shouldAutoResume,
        numLayers: 7,

        onPlanSpawn: (M, activeItems, garbageCount, removeItem, maxActiveItems, batchLength = 0) => {
            const COIN_MARGIN = 12;

            const pfW = M.pfW;
            const wRect = M.wRect && M.wRect.height > 0 ? M.wRect : { top: M.pfRect.top, left: M.pfRect.left, height: M.pfRect.height * 0.35 };
            const waterToPfTop = wRect.top - M.pfRect.top;
            const spawnY = Math.max(0, waterToPfTop);

            let sizeIndex = 0;
            if (isSurgeActive(2)) {
                const r = Math.random();
                for (let i = 6; i >= 1; i--) {
                    if (r < COIN_CHANCES[i]) {
                        sizeIndex = i;
                        break;
                    }
                }
            }

            if (sizeIndex >= 4 && shouldBlockBigCoins && shouldBlockBigCoins()) {
                sizeIndex = 3;
            }

            const size = COIN_SIZES[sizeIndex];

            const effectiveMargin = COIN_MARGIN + (sizeIndex >= 3 ? 15 * (sizeIndex - 2) : 0);
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
            
            const effectiveWaterH = Math.min(wRect.height, M.pfRect.height * 0.3);
            const minY = Math.max(effectiveWaterH + 80, 120);
            const maxY = Math.max(minY + 40, M.safeBottom - size - 6);
            const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
            const jitterMs = 0;
            
            const coin = {
                x0: spawnX, y0: spawnY,
                x1: endX, y1: endY,
                jitterMs
            };

            const waterToPfLeft = M.pfRect.left - wRect.left;
            
            const def = WAVE_DEFS[sizeIndex];
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            
            const randScale = 0.85 + Math.random() * 0.3;
            
            const waveW = vw * (def.w / 100) * randScale;
            const waveH = vw * (def.h / 100) * randScale;
            
            const waveCenterX = (spawnX + size / 2) + waterToPfLeft;
            const waveCenterY = spawnY - waterToPfTop;

            const itemsToAdd = 1 + batchLength;
            if (maxActiveCoins !== Infinity && (activeItems.length - garbageCount + itemsToAdd) > maxActiveCoins) {
                // Base overflow that MUST be removed
                let strictOverflow = (activeItems.length - garbageCount + itemsToAdd) - maxActiveCoins;
                // Buffer to prevent constant lagging (only applied to the lowest tier)
                let bufferToRemove = Math.floor(maxActiveCoins * 0.05);
                let totalToRemove = strictOverflow + bufferToRemove;
                
                // Sweep 1: Only settled items (avoid deleting falling coins)
                let b = 0;
                while (totalToRemove > 0 && b < 7) {
                    // Only apply the bulk buffer to sizeIndex 0. Rarer coins are only deleted if strictly over max capacity.
                    let targetForThisLayer = (b === 0) ? totalToRemove : strictOverflow;
                    
                    if (targetForThisLayer > 0) {
                        for (let i = 0, len = activeItems.length; i < len && targetForThisLayer > 0; i++) {
                            const c = activeItems[i];
                            if (c && !c.isRemoved && c.settled && (c.sizeIndex || 0) === b) {
                                removeItem(c, i);
                                strictOverflow--;
                                totalToRemove--;
                                targetForThisLayer--;
                            }
                        }
                    }
                    b++;
                }
                
                // Sweep 2: Fallback to unsettled ONLY if we still strictly need to clear space
                b = 0;
                while (strictOverflow > 0 && b < 7) {
                    for (let i = 0, len = activeItems.length; i < len && strictOverflow > 0; i++) {
                        const c = activeItems[i];
                        if (c && !c.isRemoved && (c.sizeIndex || 0) === b) {
                            removeItem(c, i);
                            strictOverflow--;
                        }
                    }
                    b++;
                }
            }

            return {
                wave: { x: waveCenterX, y: waveCenterY, width: waveW, height: waveH },
                coin,
                sizeIndex
            };
        },

        onCommitBatch: (batch, activeItems, getItem, refs, animationDurationMs) => {
            const coinsFrag = document.createDocumentFragment();
            const newCoins = [];
            const now = performance.now();
            let hasWaves = false;
            
            let burstRandomId = null;
            if (currentCoinSrc === 'RANDOM') {
                burstRandomId = getRandomMutationCoinId();
            }

            for (const { wave, coin, sizeIndex } of batch) {
                if (wave && settingsManager.get('spawn_vessels')) {
                    hasWaves = true;
                    if (waterSystem) {
                        const forceTop = sizeIndex >= 4;
                        waterSystem.addWave(wave.x, wave.y, wave.width, wave.height, forceTop);
                    }
                }

                const size = COIN_SIZES[sizeIndex];
                let valMult = 1;
                if (isSurgeActive(8)) {
                     let nerf = getTsunamiExponentWithCombo();
                     const base = Math.pow(25, nerf);
                     valMult = Math.pow(base, sizeIndex);
                } else {
                     valMult = COIN_VALUE_MULTS[sizeIndex];
                }
                const forceDom = sizeIndex >= 4;
				
                let assignedSrc = currentCoinSrc;
                let srcIdForSort = currentCoinSrcId;
                if (currentCoinSrc === 'RANDOM') {
                    const randId = burstRandomId !== null ? burstRandomId : getRandomMutationCoinId();
                    srcIdForSort = randId;
                    assignedSrc = randId === 0 ? 'img/currencies/coin/coin.webp' : `img/mutations/m${randId}.webp`;
                }

                let el = null;
                if (forceDom) {
                    el = getItem();
                    el.style.width = `${size}px`;
                    el.style.height = `${size}px`;
                    el.className = `coin coin--size-${sizeIndex}`;
                    if (el.firstChild) {
                         el.firstChild.src = getPreRenderedCoinUrl(assignedSrc, size);
                    }
                    
                    el.style.transform = `translate3d(${coin.x0}px, ${coin.y0}px, 0) rotate(-10deg) scale(0.96)`;
                    el.style.opacity = '0'; 

                    if (mutationUnlockedSnapshot) {
                      el.dataset.mutationLevel = mutationLevelSnapshot.toString();
                    } else {
                      el.dataset.mutationLevel = '0';
                    }
                }

                const coinObj = {
                    mutationLevel: mutationUnlockedSnapshot ? mutationLevelSnapshot.toString() : '0',
                    el,
                    src: assignedSrc,
                    srcId: srcIdForSort,
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
                    dieAt: now + coinTtlMs,
                    jitterMs: coin.jitterMs,
                    isRemoved: false,
                    settled: false,
                    size: size,
                    sizeIndex: sizeIndex,
                    valueMultiplier: valMult,
                    forceDom: forceDom,
                    soundSrc: COIN_SOUND_SUFFIXES[sizeIndex] ? `sounds/coin_pickup${COIN_SOUND_SUFFIXES[sizeIndex]}` : null,
                    bMinX: Math.min(coin.x0, coin.x1) - size,
                    bMaxX: Math.max(coin.x0, coin.x1) + size,
                    bMinY: Math.min(coin.y0, coin.y1) - size,
                    bMaxY: Math.max(coin.y0, coin.y1) + size
                };
                
                if (el) {
                    el._coinObj = coinObj;
                    coinsFrag.appendChild(el);
                }
                coinObj.index = activeItems.length;
                activeItems.push(coinObj);
                newCoins.push(coinObj);
            }

            refs.c.appendChild(coinsFrag);

            if (newCoins.length > 0) {
                const domCoins = newCoins.filter(c => c.el);
                if (domCoins.length > 0) {
                    void domCoins[0].el.offsetHeight;

                    requestAnimationFrame(() => {
                      for (const c of domCoins) {
                          if (!c.el) continue;
                          if (settingsManager.get('insta_teleport')) {
                              c.el.style.transition = 'none';
                          } else {
                              c.el.style.transition = `transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${c.jitterMs}ms`;
                          }
                          c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
                          c.el.style.opacity = '1';
                      }
                    });
                }
            }

            if (hasWaves) {
                requestAnimationFrame(() => {
                   playWaveOncePerBurst();
                });
            }
        },

        onItemUpdate: (activeItems, now, dt, removeItem, newlySettledBuffer, releaseItem, getItemState) => {
            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                
                if (now >= c.dieAt) {
                    removeItem(c, i);
                    continue;
                }
                
                if (c.sizeIndex === 5 && !c.isRemoved) {
                      if (!c.lastLightningTime) {
                          c.lastLightningTime = now - 1000; 
                          c.nextLightningInterval = 0;
                      }
                      if (now - c.lastLightningTime > c.nextLightningInterval) {
                          c.lastLightningTime = now;
                          c.nextLightningInterval = 200 + Math.random() * 100;
                          for (let k = 0; k < 3; k++) {
                              createBranchingLightning(c, now);
                          }
                      }
                }

                if (c.sizeIndex === 6 && !c.isRemoved) {
                     if (!c.lastLightningTime) {
                        c.lastLightningTime = now - 1000;
                        c.nextLightningInterval = 0;
                    }
                    if (now - c.lastLightningTime > c.nextLightningInterval) {
                        c.lastLightningTime = now;
                        c.nextLightningInterval = 200 + Math.random() * 100;

                        if (deps.collectBatch) {
                             const s = getItemState(c, now);
                             const cx = s.x + c.size/2;
                             const cy = s.y + c.size/2;
                             
                             const candidates = [];
                             const minDistSq = (c.size/2) * (c.size/2);

                             const totalCoins = activeItems.length;
                             for (let k = 0; k < totalCoins; k++) {
                                 const t = activeItems[k];
                                 if (!t) continue;
                                 if (t === c || t.isRemoved || t.settled === false) continue;
                                 if (t.sizeIndex > 3) continue;

                                 const tx = t.x + (t.size||baseCoinSize)/2;
                                 const ty = t.y + (t.size||baseCoinSize)/2;
                                 const dx = tx - cx;
                                 const dy = ty - cy;
                                 
                                 if (dx*dx + dy*dy > minDistSq) {
                                     candidates.push(t);
                                 }
                             }

                             if (candidates.length > 0) {
                                 for (let k = candidates.length - 1; k > 0; k--) {
                                     const j = Math.floor(Math.random() * (k + 1));
                                     [candidates[k], candidates[j]] = [candidates[j], candidates[k]];
                                 }
                                 
                                 const targets = candidates.slice(0, 3);
                                 const itemsToCollect = [];
                                 let audioPlayed = false;

                                 for (const target of targets) {
                                     const targetSize = target.size || baseCoinSize;
                                     const tx = target.x + targetSize/2;
                                     const ty = target.y + targetSize/2;
                                     
                                     createTargetedBranchingLightning(c, tx, ty);
                                     addStain(tx, ty, targetSize);
                                     itemsToCollect.push({ coin: target });
                                     
                                     if (!audioPlayed) {
                                         playAudio('sounds/lightning_strike.ogg', { volume: 0.25 });
                                         audioPlayed = true;
                                     }
                                 }
                                 
                                 if (itemsToCollect.length > 0) {
                                     deps.collectBatch(itemsToCollect);
                                 }
                             }
                        }
                    }
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
                    if (c.el && !c.forceDom) {
                        releaseItem(c.el);
                        c.el = null;
                    } else if (c.el) {
                        c.el.style.transition = 'none';
                        c.el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
                    }
                    if (!c.el) newlySettledBuffer.push(c);
                    continue;
                }
            }
        },

        onDrawSingleSettledItem: (ctx, c) => {
            const size = c.size || baseCoinSize;
            const renderable = getPreRenderedCoin(c.src, size);
            if (renderable) {
                const draw = (img) => {
                    if (c.rot || c.scale !== 1) {
                        ctx.save();
                        ctx.translate(c.x + size / 2, c.y + size / 2);
                        if (c.rot) ctx.rotate(c.rot * Math.PI / 180);
                        if (c.scale !== 1) ctx.scale(c.scale, c.scale);
                        ctx.drawImage(img, -size / 2, -size / 2, size, size);
                        ctx.restore();
                    } else {
                        ctx.drawImage(img, c.x, c.y, size, size);
                    }
                };
                if (renderable instanceof HTMLCanvasElement) {
                    draw(renderable);
                } else if (renderable.complete && renderable.naturalWidth > 0) {
                    draw(renderable);
                }
            }
        },

        onDrawFx: (fxCtx, fxCanvas, dt, now, getItemState) => {
            fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
            
            fxCtx.lineCap = 'round';
            fxCtx.lineJoin = 'round';
            for (let i = bolts.length - 1; i >= 0; i--) {
                const b = bolts[i];
                b.age += dt;
                if (b.age >= b.life) {
                    bolts.splice(i, 1);
                    continue;
                }

                let startX = b.x1, startY = b.y1;
                let endX = b.x2, endY = b.y2;

                if (b.parentCoin) {
                     const s = getItemState(b.parentCoin, now);
                     const cx = s.x + (b.parentCoin.size || baseCoinSize) / 2;
                     const cy = s.y + (b.parentCoin.size || baseCoinSize) / 2;
                     startX = cx + b.relX1;
                     startY = cy + b.relY1;
                     if (b.relX2 !== undefined) {
                         endX = cx + b.relX2;
                         endY = cy + b.relY2;
                     }
                }
                
                const alpha = 1 - (b.age / b.life);

                if (!b.points) {
                    b.points = [];
                    const segments = 6;
                    b.points.push({ x: 0, y: 0 }); 

                    const fullDx = endX - startX;
                    const fullDy = endY - startY;

                    for (let j = 1; j < segments; j++) {
                        const t = j / segments;
                        const tx = fullDx * t;
                        const ty = fullDy * t;
                        
                        const perpX = -fullDy;
                        const perpY = fullDx;
                        const len = Math.sqrt(perpX*perpX + perpY*perpY);
                        
                        let ox = 0, oy = 0;
                        if (len > 0) {
                            const jaggedness = b.jaggedScale || 40;
                            const scale = (Math.random() - 0.5) * jaggedness * (1 - Math.abs(t - 0.5));
                            ox = (perpX/len) * scale;
                            oy = (perpY/len) * scale;
                        }
                        b.points.push({ x: tx + ox, y: ty + oy });
                    }
                    b.points.push({ x: fullDx, y: fullDy }); 
                }
                
                const drawPath = (ctx, width, color) => {
                    ctx.lineWidth = width;
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    for (let j = 1; j < b.points.length; j++) {
                        const p = b.points[j];
                        ctx.lineTo(startX + p.x, startY + p.y);
                    }
                    ctx.stroke();
                };

                drawPath(fxCtx, (b.width || 3) * 3.5, `rgba(220, 245, 255, ${alpha * 0.3})`);
                drawPath(fxCtx, b.width || 3, `rgba(200, 240, 255, ${alpha})`);
            }

            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i];
                s.age += dt;
                if (s.age >= s.life) {
                    sparks.splice(i, 1);
                    continue;
                }
                
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                
                const alpha = 1 - (s.age / s.life);
                fxCtx.fillStyle = s.color;
                fxCtx.globalAlpha = alpha;
                fxCtx.beginPath();
                fxCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                fxCtx.fill();
                fxCtx.globalAlpha = 1;
            }
        },

        onDrawHitbox: (ctx, c, cx, cy, size) => {
            ctx.beginPath();
            const r = size / 2;
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        },

        onEnsureItemVisual: (el, c) => {
            const size = c.size || baseCoinSize;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.className = `coin coin--size-${c.sizeIndex || 0}`;
            
            el.style.transition = '';
            el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
            
            if (el.firstChild) {
                el.firstChild.src = getPreRenderedCoinUrl(c.src, size);
            }
            
            el.style.opacity = '1';
            el.dataset.mutationLevel = c.mutationLevel;
        },

        onClearPlayfield: (activeItems, removeItem, resetType) => {
            const keepBigCoins = isSurgeActive(2) && !!resetType;
            for (let i = activeItems.length - 1; i >= 0; i--) {
                const c = activeItems[i]; if (!c) continue;
                if (keepBigCoins && c.sizeIndex >= 4) {
                     c.mutationLevel = mutationUnlockedSnapshot ? mutationLevelSnapshot.toString() : '0';
                     if (c.el) c.el.dataset.mutationLevel = c.mutationLevel;
                     continue;
                }
                removeItem(activeItems[i], i);
            }
        }
    });

    let currentCoinSrcId = 0;
    function setCoinSprite(src) {
      if (!src) return;
      currentCoinSrc = src;
      currentCoinSrcId = 0;
      if (src && src !== 'RANDOM') {
          const m = src.match(/m(\d+)\.webp/);
          if (m) currentCoinSrcId = parseInt(m[1], 10);
      }
    }

    function findItemTargetsInRadius(centerX, centerY, radius, useVisualHitbox) {
        let searchRadius = radius;
        if (useVisualHitbox) {
             searchRadius = Math.max(radius, 260);
        }

        const radiusSq = radius * radius;
        const candidates = [];
        const activeCoins = base.getActiveItems();
        const count = activeCoins.length;
        
        const minX = centerX - searchRadius;
        const maxX = centerX + searchRadius;
        const minY = centerY - searchRadius;
        const maxY = centerY + searchRadius;

        const now = performance.now();
        
        for (let i = count - 1; i >= 0; i--) {
            const c = activeCoins[i]; if (!c) continue;

            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = base.getItemState(c, now);
                cx = s.x + (size / 2);
                cy = s.y + (size / 2);
            }
            
            if (cx < minX || cx > maxX) continue;
            if (cy < minY || cy > maxY) continue;

            const dx = cx - centerX;
            const dy = cy - centerY;
            
            let limitSq = radiusSq;
            if (useVisualHitbox && (c.sizeIndex || 0) > 0) {
                 const r = size / 2;
                 limitSq = r * r;
            }

            if ((dx*dx + dy*dy) <= limitSq) {
                if (!c.isRemoved) {
                    candidates.push(c);
                }
            }
        }
        return candidates;
    }

    function findItemTargetsInPath(x1, y1, x2, y2, radius, useVisualHitbox) {
        let searchRadius = radius;
        if (useVisualHitbox) {
             searchRadius = Math.max(radius, 260);
        }

        const radiusSq = radius * radius;
        const candidates = [];
        const activeCoins = base.getActiveItems();
        const count = activeCoins.length;

        const minX = Math.min(x1, x2) - searchRadius;
        const maxX = Math.max(x1, x2) + searchRadius;
        const minY = Math.min(y1, y2) - searchRadius;
        const maxY = Math.max(y1, y2) + searchRadius;

        const vx = x2 - x1;
        const vy = y2 - y1;
        const lenSq = vx * vx + vy * vy;
        const crossLimit = radiusSq * lenSq;
        const now = performance.now();

        for (let i = count - 1; i >= 0; i--) {
            const c = activeCoins[i]; if (!c) continue;

            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = base.getItemState(c, now);
                cx = s.x + (size / 2);
                cy = s.y + (size / 2);
            }
            
            if (cx < minX || cx > maxX) continue;
            if (cy < minY || cy > maxY) continue;

            const wx = cx - x1;
            const wy = cy - y1;
            
            const dot = wx * vx + wy * vy;
            
            let limitSq = radiusSq;
            if (useVisualHitbox && (c.sizeIndex || 0) > 0) {
                 const r = size / 2;
                 limitSq = r * r;
            }

            let hit = false;
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
            
            if (hit && !c.isRemoved) {
                candidates.push(c);
            }
        }
        return candidates;
    }

    function findCoinsInRadius(centerX, centerY, radius) {
        const radiusSq = radius * radius;
        const candidates = [];
        const activeCoins = base.getActiveItems();
        const count = activeCoins.length;
        
        const minX = centerX - radius;
        const maxX = centerX + radius;
        const minY = centerY - radius;
        const maxY = centerY + radius;

        const now = performance.now();
        
        for (let i = count - 1; i >= 0; i--) {
            const c = activeCoins[i]; if (!c) continue;

            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = base.getItemState(c, now);
                cx = s.x + (size / 2);
                cy = s.y + (size / 2);
            }
            
            if (cx < minX || cx > maxX) continue;
            if (cy < minY || cy > maxY) continue;

            const dx = cx - centerX;
            const dy = cy - centerY;
            
            if ((dx*dx + dy*dy) <= radiusSq) {
                candidates.push(c);
            }
        }
        return candidates;
    }

    function findCoinsInPath(x1, y1, x2, y2, radius) {
        const radiusSq = radius * radius;
        const candidates = [];
        const activeCoins = base.getActiveItems();
        const count = activeCoins.length;

        const minX = Math.min(x1, x2) - radius;
        const maxX = Math.max(x1, x2) + radius;
        const minY = Math.min(y1, y2) - radius;
        const maxY = Math.max(y1, y2) + radius;

        const vx = x2 - x1;
        const vy = y2 - y1;
        const lenSq = vx * vx + vy * vy;
        const crossLimit = radiusSq * lenSq;
        const now = performance.now();

        for (let i = count - 1; i >= 0; i--) {
            const c = activeCoins[i]; if (!c) continue;

            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = base.getItemState(c, now);
                cx = s.x + (size / 2);
                cy = s.y + (size / 2);
            }
            
            if (cx < minX || cx > maxX) continue;
            if (cy < minY || cy > maxY) continue;

            const wx = cx - x1;
            const wy = cy - y1;
            
            const dot = wx * vx + wy * vy;
            
            let hit = false;
            if (dot <= 0) {
                if ((wx * wx + wy * wy) <= radiusSq) hit = true;
            } else if (dot >= lenSq) {
                const dx = cx - x2;
                const dy = cy - y2;
                if ((dx * dx + dy * dy) <= radiusSq) hit = true;
            } else {
                const cross = wx * vy - wy * vx;
                if (cross * cross <= crossLimit) hit = true;
            }
            
            if (hit) {
                candidates.push(c);
            }
        }
        return candidates;
    }

    function playEntranceWave() {
        base.spawnBurst(1);
    }

    function setDependencies(d) {
        deps = { ...deps, ...d };
    }

    return {
        start: base.start,
        stop: base.stop,
        setRate: base.setRate,
        clearBacklog: base.clearBacklog,
        clearPlayfield: base.clearPlayfield,
        setCoinSprite,
        getCoinTransform: base.getItemTransform,
        findCoinsInRadius,
        findCoinsInPath,
        findItemTargetsInRadius,
        findItemTargetsInPath,
        ensureCoinVisual: base.ensureItemVisual,
        removeCoinTarget: base.removeItemTarget,
        detachCoin: base.detachItem,
        recycleCoin: base.recycleItem,
        stopAllWaveSounds,
        playEntranceWave,
        setDependencies,
        hasBigCoins: () => isSurgeActive(2) && base.getActiveItems().some(c => c && c.sizeIndex >= 4),
        getActiveCoins: base.getActiveItems,
    };
}
