// js/game/spawner.js

import { takePreloadedAudio } from '../util/audioCache.js';
import { getMutationState, onMutationChange } from './mutationSystem.js';
import { IS_MOBILE } from '../main.js';
import { isSurge2Active } from './surgeEffects.js';
import { playAudio } from '../util/audioManager.js';
import { waterSystem} from './webgl/waterSystem.js';

let mutationUnlockedSnapshot = false;
let mutationLevelSnapshot = 0n;

const MAX_ACTIVE_COINS_MOBILE = 2500

// Cache for coin images (src -> Image)
const imgCache = new Map();

function updateMutationSnapshot(state) {
  if (!state || typeof state !== 'object') {
    mutationUnlockedSnapshot = false;
    mutationLevelSnapshot = 0n;
    return;
  }
  mutationUnlockedSnapshot = !!state.unlocked;
  try {
    const level = state.level;
    const plain = typeof level?.toPlainIntegerString === 'function'
      ? level.toPlainIntegerString()
      : null;
    mutationLevelSnapshot = plain && plain !== 'Infinity' ? BigInt(plain) : 0n;
  } catch {
    mutationLevelSnapshot = 0n;
  }
}

try {
  updateMutationSnapshot(getMutationState());
} catch {
  mutationUnlockedSnapshot = false;
  mutationLevelSnapshot = 0n;
}

try {
  onMutationChange((snapshot) => { updateMutationSnapshot(snapshot); });
} catch {}

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

// Surge 2 Constants
const COIN_SIZES = [40, 55, 80, 125, 200, 320, 512];
// Ratio of radius where lightning originates (to match the inner ridge of the coin art)
const LIGHTNING_START_RADIUS_RATIO = 0.78;
const COIN_VALUE_MULTS = [1, 25, 625, 15625, 390625, 9765625, 244140625];
// Probabilities for Size 1 to 6 (Size 0 is fallback) while the Surge 2 milestone is active
const COIN_CHANCES = [
    0,          // Size 0 (N/A)
    0.1,        // Size 1: 1/10
    0.01,       // Size 2: 1/100
    0.001,      // Size 3: 1/1000
    0.0001,     // Size 4: 1/10000
    0.00001,    // Size 5: 1/100000
    0.000001,    // Size 6: 1/1000000
];
const COIN_SOUND_SUFFIXES = [
    '', // Size 0 uses default
    '_size1.ogg',
    '_size2.ogg',
    '_size3.ogg',
    '_size4.ogg',
    '_size5.ogg',
    '_size6.ogg'
];

export function createSpawner({
    playfieldSelector = '.area-cove .playfield',
    waterSelector = '.water-base',
    surgesHost = '.surges',
    coinsHost = '.coins-layer',
    coinSrc = 'img/coin/coin.webp',
    coinSize: baseCoinSize = 40, // Renamed to baseCoinSize
    animationDurationMs = 1500,
    surgeLifetimeMs = 1400,
    surgeWidthVw = 22,
    coinsPerSecond = 1,
    perFrameBudget = 24,
    maxActiveCoins = IS_MOBILE ? MAX_ACTIVE_COINS_MOBILE : 10000,
    initialBurst = 1,
    coinTtlMs = 1e99,
    waveSoundSrc = 'sounds/wave_spawn.ogg',
    waveSoundDesktopVolume = 0.45,
    waveSoundMobileVolume  = 0.2,
    waveSoundMinIntervalMs = 160,
    enableDropShadow = false,
} = {}) {

    let currentCoinSrc = coinSrc;

    const refs = {
        pf: document.querySelector(playfieldSelector),
        w: document.querySelector(waterSelector),
        s: document.querySelector(surgesHost),
        c: document.querySelector(coinsHost),
        hud: document.getElementById('hud-bottom'),
    };

    function validRefs() {
        return !!(refs.pf && refs.w && refs.s && refs.c);
    }

    if (!validRefs()) {
        console.warn('[Spawner] Missing required nodes. Check your selectors:', {
            playfieldSelector,
            waterSelector,
            surgesHost,
            coinsHost
        });
    }

    // MULTI-LAYER CANVAS SYSTEM
    // We create one canvas per size (0-6).
    // Size 0: z-index 10
    // Size 1: z-index 20
    // ...
    // Size 6: z-index 70
    // Active DOM coins will be interleaved via CSS (11, 21, ..., 71).
    const NUM_LAYERS = 7;
    const canvases = [];
    const contexts = [];
    let canvasDirty = false;

    if (refs.c) {
        for (let i = 0; i < NUM_LAYERS; i++) {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.inset = '0';
            canvas.style.pointerEvents = 'none';
            // Base z-index for settled coins of this size
            canvas.style.zIndex = `${10 + (i * 10)}`; 
            refs.c.appendChild(canvas);
            
            const ctx = canvas.getContext('2d', { alpha: true });
            canvases.push(canvas);
            contexts.push(ctx);
        }
    }

    let fxCanvas = null;
    let fxCtx = null;
    if (refs.c) {
        fxCanvas = document.createElement('canvas');
        fxCanvas.style.position = 'absolute';
        fxCanvas.style.inset = '0';
        fxCanvas.style.pointerEvents = 'none';
        // FX sits on top of everything
        fxCanvas.style.zIndex = '100'; 
        refs.c.appendChild(fxCanvas);
        fxCtx = fxCanvas.getContext('2d', { alpha: true });
    }

    let deps = {
        collectBatch: null,
        getMagnetUnit: null
    };

    function setDependencies(d) {
        deps = { ...deps, ...d };
    }

    let M = {
        pfRect: null,
        wRect: null,
        safeBottom: 0,
        pfW: 0
    };

    function computeMetrics() {
        if (!validRefs())
            return false;
        const pfRect = refs.pf.getBoundingClientRect();
        const wRect = refs.w.getBoundingClientRect();
        const hudH = refs.hud ? refs.hud.getBoundingClientRect().height : 0;

        M = {
            pfRect,
            wRect,
            safeBottom: pfRect.height - hudH,
            pfW: pfRect.width
        };

        const dpr = window.devicePixelRatio || 1;
        
        // Resize all layer canvases
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
                    ctx.imageSmoothingQuality = 'high';
                }
            }
        });
        
        // Mark dirty to redraw settled coins on resized canvases
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
        if (!document.hidden)
            computeMetrics();
    });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const COIN_POOL_MAX = Math.max(2000, maxActiveCoins * 3);
    const SURGE_POOL_MAX = 800;
    const COIN_MARGIN = 12;

    const coinPool = [];
    const surgePool = [];

    const activeCoins = [];
    const newlySettledBuffer = [];

    function makeCoin() {
        const el = document.createElement('div');
        el.className = 'coin';
        el.style.position = 'absolute';
        el.style.pointerEvents = 'auto';
        el.style.borderRadius = '50%';
        el.style.willChange = 'transform';
        el.style.contain = 'layout style size';
        
        const inner = document.createElement('img');
        inner.className = 'coin-inner';
        inner.draggable = false;
        inner.alt = '';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.src = currentCoinSrc;
        inner.style.objectFit = 'contain';
        inner.style.borderRadius = '50%';
        
        el.appendChild(inner);

        if (enableDropShadow)
            el.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,.35))';
        return el;
    }
    const getCoin = () => (coinPool.length ? coinPool.pop() : makeCoin());
    
    function releaseCoin(el) {
       el.style.transition = '';
       el.style.transform = '';
       el.style.opacity = '1';
       
       el.classList.remove('coin--collected');
       // Remove size classes
       for (let i = 0; i <= 6; i++) {
           el.classList.remove(`coin--size-${i}`);
       }
       el.style.removeProperty('--ccc-start');

       delete el.dataset.dieAt;
       delete el.dataset.mutationLevel;
       delete el.dataset.collected;
       
       el.style.willChange = 'transform';
       
       if (el.parentNode) el.remove();
       if (coinPool.length < COIN_POOL_MAX) coinPool.push(el);
    }
    
    function removeCoin(coinObj, knownIndex = -1) {
        if (coinObj.isRemoved) return;
        coinObj.isRemoved = true;
        
        let idx = knownIndex;
        if (idx === -1 || activeCoins[idx] !== coinObj) {
            idx = activeCoins.indexOf(coinObj);
        }
        if (idx !== -1) {
            activeCoins.splice(idx, 1);
        }
        
        if (coinObj.el) {
            releaseCoin(coinObj.el);
            coinObj.el = null;
        } else {
            // Was on canvas, need redraw
            canvasDirty = true;
        }
    }
    
    function detachCoin(coinEl) {
        const coinObj = coinEl._coinObj;
        if (coinObj) {
            const idx = activeCoins.indexOf(coinObj);
            if (idx !== -1) {
                activeCoins.splice(idx, 1);
            }
            coinEl._coinObj = null;
        }
    }

    function makeSurge() {
        const el = document.createElement('div');
        el.className = 'wave-surge';
        el.style.willChange = 'transform, opacity';
        return el;
    }
    const getSurge = () => (surgePool.length ? surgePool.pop() : makeSurge());
    function releaseSurge(el) {
        el.classList.remove('run', 'run-b');
        if (el.parentNode)
            el.remove();
        if (surgePool.length < SURGE_POOL_MAX)
            surgePool.push(el);
    }
    
    const waveURL = new URL(waveSoundSrc, document.baseURI).href;
    let waveLastAt = 0;

    function playWaveOncePerBurst() {
      const now = performance.now();
      if (now - waveLastAt < waveSoundMinIntervalMs) return;
      waveLastAt = now;
      
      const vol = IS_MOBILE ? waveSoundMobileVolume : waveSoundDesktopVolume;
      playAudio(waveURL, { volume: vol });
    }

    function planCoinFromWave(wave, coinSize, sizeIndex) {
        if (!wave) return null;
        const { x: waveX, y: waveTop, w: waveW } = wave;

        const crestCenter = waveX + waveW / 2 + (Math.random() * 60 - 30);
        const startX = crestCenter - coinSize / 2;
        const startY = waveTop + 10 - coinSize / 2;

        const drift = Math.random() * 100 - 50;
        
        let endX;
        
        // Logic to "tend toward the middle" for larger coins
        // and handle overflow.
        const effectiveMargin = COIN_MARGIN + (sizeIndex >= 3 ? 15 * (sizeIndex - 2) : 0);
        
        if (coinSize >= M.pfW) {
            // If coin is wider than playfield, center it
            endX = (M.pfW - coinSize) / 2;
        } else {
            // Restrict bounds for larger coins
            const minX = effectiveMargin;
            const maxX = M.pfW - coinSize - effectiveMargin;
            
            // If margin made range invalid, fallback to center or simple clamp
            if (minX >= maxX) {
                 endX = (M.pfW - coinSize) / 2;
            } else {
                 endX = clamp(startX + drift, minX, maxX);
            }
        }

        const minY = Math.max(M.wRect.height + 80, 120);
        const maxY = Math.max(minY + 40, M.safeBottom - coinSize - 6);
        const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
        
        const jitterMs = Math.random() * 100;

        return {
            x0: startX,
            y0: startY,
            x1: endX,
            y1: endY,
            jitterMs,
        };
    }

    function planSpawn() {
        if (!validRefs())
            return null;
        if (!M.pfRect || !M.wRect)
            computeMetrics();

        if (maxActiveCoins !== Infinity && activeCoins.length >= maxActiveCoins) {
            let indexToRemove = 0;
            if (isSurge2Active()) {
                indexToRemove = -1;
                for (let i = 0; i < activeCoins.length; i++) {
                    if (activeCoins[i].sizeIndex < 4) {
                        indexToRemove = i;
                        break;
                    }
                }
                if (indexToRemove === -1) return null;
            }
            const oldest = activeCoins[indexToRemove];
            if (oldest) removeCoin(oldest, indexToRemove);
        }

        const pfW = M.pfW;
        const waveW = clamp(pfW * (surgeWidthVw / 100), 220, 520);
        const leftMax = Math.max(1, pfW - waveW - COIN_MARGIN * 2);
        const waveX = Math.random() * leftMax + COIN_MARGIN;

        const waterToPfTop = M.wRect.top - M.pfRect.top;
        const waveTop = Math.max(0, waterToPfTop + M.wRect.height * 0.05);

        const wave = {
            x: waveX,
            y: waveTop,
            w: waveW
        };

        // Determine coin size
        let sizeIndex = 0;
        if (isSurge2Active()) {
            const r = Math.random();
            for (let i = 6; i >= 1; i--) {
                if (r < COIN_CHANCES[i]) {
                    sizeIndex = i;
                    break;
                }
            }
        }
        
        const size = COIN_SIZES[sizeIndex];

        const coinPlan = planCoinFromWave(wave, size, sizeIndex);
        if (!coinPlan) return null;

        return {
            wave,
            coin: planCoinFromWave(wave, size, sizeIndex),
            sizeIndex
        };
    }

    function commitBatch(batch) {
      if (!batch.length || !validRefs()) return;

      const wavesFrag = document.createDocumentFragment();
      const coinsFrag = document.createDocumentFragment();
      
      const newSurges = [];
      const newCoins = [];
      const now = performance.now();

      for (const { wave, coin, sizeIndex } of batch) {
        if (wave) {
          const surge = getSurge();
          surge.style.left = `${wave.x}px`;
          surge.style.top = `${wave.y}px`;
          surge.style.width = `${wave.w}px`;
          wavesFrag.appendChild(surge);
          newSurges.push(surge);
        }

        const size = COIN_SIZES[sizeIndex];
        const valMult = COIN_VALUE_MULTS[sizeIndex];
        const forceDom = sizeIndex >= 4;

        const el = getCoin();
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.className = `coin coin--size-${sizeIndex}`; // Add size class
        // Update inner image src
        if (el.firstChild) {
             el.firstChild.src = currentCoinSrc;
        }
        
        el.style.transform = `translate3d(${coin.x0}px, ${coin.y0}px, 0) rotate(-10deg) scale(0.96)`;
        el.style.opacity = '1';

        if (mutationUnlockedSnapshot) {
          el.dataset.mutationLevel = mutationLevelSnapshot.toString();
        } else {
          el.dataset.mutationLevel = '0';
        }
        
        const coinObj = {
            mutationLevel: mutationUnlockedSnapshot ? mutationLevelSnapshot.toString() : '0',
            el,
            src: currentCoinSrc,
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
            // Surge 2 properties
            size: size,
            sizeIndex: sizeIndex,
            valueMultiplier: valMult,
            forceDom: forceDom,
            soundSrc: COIN_SOUND_SUFFIXES[sizeIndex] ? `sounds/coin_pickup${COIN_SOUND_SUFFIXES[sizeIndex]}` : null,
            // Pre-calculate trajectory bounds for fast spatial rejection
            // We pad by size to account for the coin's dimensions and rotation
            bMinX: Math.min(coin.x0, coin.x1) - size,
            bMaxX: Math.max(coin.x0, coin.x1) + size,
            bMinY: Math.min(coin.y0, coin.y1) - size,
            bMaxY: Math.max(coin.y0, coin.y1) + size
        };
        
        el._coinObj = coinObj;
        activeCoins.push(coinObj);
        newCoins.push(coinObj);
        
        coinsFrag.appendChild(el);
      }

      refs.s.appendChild(wavesFrag);
      refs.c.appendChild(coinsFrag);

      if (newCoins.length > 0) {
          requestAnimationFrame(() => {
            for (const c of newCoins) {
                if (!c.el) continue;
                c.el.style.transition = `transform ${animationDurationMs}ms ${CUBIC_BEZIER} ${c.jitterMs}ms`;
                c.el.style.transform = `translate3d(${c.endX}px, ${c.endY}px, 0) rotate(0deg) scale(1)`;
            }
          });
      }

      requestAnimationFrame(() => {
        if (newSurges.length) playWaveOncePerBurst();

        for (const surge of newSurges) {
          if (surge.classList.contains('run')) {
            surge.classList.remove('run');
            surge.classList.add('run-b');
          } else {
            surge.classList.remove('run-b');
            surge.classList.add('run');
          }
          const onEnd = (e) => {
            if (e.target === surge) releaseSurge(surge);
          };
          surge.addEventListener('animationend', onEnd, { once: true });
        }
      });
    }

    function spawnBurst(n = 1) {
        if (!validRefs())
            return;
        if (!M.pfRect || !M.wRect)
            computeMetrics();
        const batch = [];
        for (let i = 0; i < n; i++) {
            const plan = planSpawn();
            if (plan) {
                batch.push(plan);
            }
        }
        if (batch.length)
            commitBatch(batch);
    }

    function getCoinState(c, now) {
        if (c.settled || c.isRemoved) {
            return { x: c.x, y: c.y, rot: 0, scale: 1 };
        }
        const elapsed = now - c.startTime;
        if (elapsed < 0) {
            return { x: c.startX, y: c.startY, rot: -10, scale: 0.96 };
        }
        let t = elapsed / c.duration;
        if (t >= 1) {
             return { x: c.endX, y: c.endY, rot: 0, scale: 1 };
        }
        const ease = easeOutCubic(t);
        const x = c.startX + (c.endX - c.startX) * ease;
        const y = c.startY + (c.endY - c.startY) * ease;
        const rot = -10 + (10 * ease);
        const scale = 0.96 + (0.04 * ease);
        return { x, y, rot, scale };
    }

    function drawSingleSettledCoin(ctx, c) {
        const img = getImage(c.src);
        if (img && img.complete && img.naturalWidth > 0) {
             // Use coin specific size
             const size = c.size || baseCoinSize;
             ctx.drawImage(img, c.x, c.y, size, size);
        }
    }

    function drawSettledCoins() {
        if (!contexts.length) return;
        
        if (canvasDirty) {
            // Clear all canvases
            contexts.forEach((ctx, i) => {
                if (canvases[i]) {
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvases[i].width, canvases[i].height);
                    ctx.restore();
                    
                    if (enableDropShadow) {
                         ctx.save();
                         ctx.shadowColor = 'rgba(0,0,0,0.35)';
                         ctx.shadowBlur = 2;
                         ctx.shadowOffsetY = 2;
                    }
                }
            });

            const count = activeCoins.length;
            for (let i = 0; i < count; i++) {
                const c = activeCoins[i];
                if (c.settled && !c.isRemoved && !c.el) {
                    const layerIdx = c.sizeIndex || 0;
                    if (contexts[layerIdx]) {
                        drawSingleSettledCoin(contexts[layerIdx], c);
                    }
                }
            }
            
            if (enableDropShadow) {
                contexts.forEach(ctx => ctx.restore());
            }

            canvasDirty = false;
            newlySettledBuffer.length = 0;
        } else if (newlySettledBuffer.length > 0) {
            if (enableDropShadow) {
                 contexts.forEach(ctx => {
                     ctx.save();
                     ctx.shadowColor = 'rgba(0,0,0,0.35)';
                     ctx.shadowBlur = 2;
                     ctx.shadowOffsetY = 2;
                 });
            }

            for (let i = 0; i < newlySettledBuffer.length; i++) {
                const c = newlySettledBuffer[i];
                if (!c.isRemoved && c.settled && !c.el) {
                    const layerIdx = c.sizeIndex || 0;
                    if (contexts[layerIdx]) {
                        drawSingleSettledCoin(contexts[layerIdx], c);
                    }
                }
            }

            if (enableDropShadow) {
                 contexts.forEach(ctx => ctx.restore());
            }
            newlySettledBuffer.length = 0;
        }
    }

    let rate = coinsPerSecond;
    let rafId = null;
    let last = performance.now();
    let carry = 0;
    
    function loop(now) {
      if (!M.pfRect || !M.wRect) computeMetrics();

      let dt = (now - last) / 1000;
      last = now;
      
      if (dt > 0.1) dt = 0.1;
      
      {
          for (let i = activeCoins.length - 1; i >= 0; i--) {
              const c = activeCoins[i];
              if (!c) continue; // Safety check if array was mutated
              
              if (now >= c.dieAt) {
                  removeCoin(c, i);
                  continue;
              }
              
              // NEW: Size 5 Logic (Blue Lightning) moved here
              if (c.sizeIndex === 5 && !c.isRemoved) {
                    if (!c.lastLightningTime) {
                        c.lastLightningTime = now - 1000; 
                        c.nextLightningInterval = 0;
                    }
                    if (now - c.lastLightningTime > c.nextLightningInterval) {
                        c.lastLightningTime = now;
                        c.nextLightningInterval = 200 + Math.random() * 100;
                        // Spawn 3 simultaneous bolts
                        for (let k = 0; k < 3; k++) {
                            createBranchingLightning(c, now);
                        }
                    }
              }

              // Size 6 Logic
              if (c.sizeIndex === 6 && !c.isRemoved) {
                   if (!c.lastLightningTime) {
                      c.lastLightningTime = now - 1000;
                      c.nextLightningInterval = 0;
                  }
                  if (now - c.lastLightningTime > c.nextLightningInterval) {
                      c.lastLightningTime = now;
                      c.nextLightningInterval = 200 + Math.random() * 100;

                      if (deps.collectBatch) {
                           const s = getCoinState(c, now);
                           const cx = s.x + c.size/2;
                           const cy = s.y + c.size/2;
                           
                           // Identify potential candidates globally (no radius limit)
                           const candidates = [];
                           const minDistSq = (c.size/2) * (c.size/2);

                           const totalCoins = activeCoins.length;
                           for (let k = 0; k < totalCoins; k++) {
                               const t = activeCoins[k];
                               if (t === c || t.isRemoved || t.settled === false) continue;
                               // Only attack size 3 or lower
                               if (t.sizeIndex > 3) continue;

                               const tx = t.x + (t.size||baseCoinSize)/2;
                               const ty = t.y + (t.size||baseCoinSize)/2;
                               const dx = tx - cx;
                               const dy = ty - cy;
                               
                               // Ensure not overlapping source
                               if (dx*dx + dy*dy > minDistSq) {
                                   candidates.push(t);
                               }
                           }

                           if (candidates.length > 0) {
                               // Shuffle candidates to pick up to 3 distinct ones
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

              if (c.settled) {
                // OLD Size 5 Logic REMOVED

                continue;
              }
              
              const elapsed = now - c.startTime;
              if (elapsed < 0) continue;
              
              let t = elapsed / c.duration;
              if (t >= 1) {
                  c.settled = true;
                  c.x = c.endX;
                  c.y = c.endY;
                  c.rot = 0;
                  c.scale = 1;
                  // If forceDom (Size 4+), we keep it as DOM element and do NOT push to canvas buffer
                  if (c.el && !c.forceDom) {
                      releaseCoin(c.el);
                      c.el = null;
                      newlySettledBuffer.push(c);
                  } else if (c.el) {
                      // Ensure final state is set properly for DOM coins
                      c.el.style.transition = 'none';
                      c.el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
                  }
                  continue;
              }
              
              // Optimization: We skip updating c.x/y/rot/scale every frame.
              // We calculate them on-demand for hit testing.
              // Visuals are handled by CSS transitions so this is safe.
          }
      }

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
                const plan = planSpawn();
                if (plan) {
                    batch.push(plan);
                }
             }
             if (batch.length) {
                 commitBatch(batch);
             }
          }
      }

      drawSettledCoins();
      drawFx(dt);

      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (rafId) return;
      if (!validRefs()) {
        console.warn('[Spawner] start() called but required nodes are missing.');
        return;
      }
      computeMetrics();

      if (initialBurst > 0 && rafId === null) {
        spawnBurst(initialBurst);
      }

      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (!rafId)
            return;
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
        const keepBigCoins = isSurge2Active() && !!resetType;
        for (let i = activeCoins.length - 1; i >= 0; i--) {
            const c = activeCoins[i];
            if (keepBigCoins && c.sizeIndex >= 4) {
                 c.mutationLevel = mutationUnlockedSnapshot ? mutationLevelSnapshot.toString() : '0';
                 if (c.el) c.el.dataset.mutationLevel = c.mutationLevel;
                 continue;
            }
            removeCoin(activeCoins[i], i);
        }
        clearBacklog();
    }

    function setCoinSprite(src) {
      if (!src) return;
      currentCoinSrc = src;
    }

    function getCoinTransform(el) {
        const c = el._coinObj;
        if (!c) return el.style.transform || 'translate3d(0,0,0)';
        const { x, y, rot, scale } = getCoinState(c, performance.now());
        return `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    }
    
    function ensureCoinVisual(c) {
        if (c.el) return c.el;
        if (c.isRemoved) return null;
        
        const el = getCoin();
        const size = c.size || baseCoinSize;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.className = `coin coin--size-${c.sizeIndex || 0}`;
        
        el.style.transition = '';
        el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
        
        if (el.firstChild) {
            el.firstChild.src = c.src;
        }
        
        el.style.opacity = '1';
        el.dataset.mutationLevel = c.mutationLevel;
        
        el._coinObj = c;
        c.el = el;
        refs.c.appendChild(el);
        canvasDirty = true;
        return el;
    }

    function findCoinTargetsInRadius(centerX, centerY, radius, useVisualHitbox) {
        let searchRadius = radius;
        if (useVisualHitbox) {
             searchRadius = Math.max(radius, 260);
        }

        const radiusSq = radius * radius;
        const candidates = [];
        const count = activeCoins.length;
        
        const minX = centerX - searchRadius;
        const maxX = centerX + searchRadius;
        const minY = centerY - searchRadius;
        const maxY = centerY + searchRadius;

        const now = performance.now();
        
        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];

            // Fast rejection based on trajectory bounds
            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = getCoinState(c, now);
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

    function findCoinTargetsInPath(x1, y1, x2, y2, radius, useVisualHitbox) {
        let searchRadius = radius;
        if (useVisualHitbox) {
             searchRadius = Math.max(radius, 260);
        }

        const radiusSq = radius * radius;
        const candidates = [];
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

        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];

            // Fast rejection based on trajectory bounds
            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = getCoinState(c, now);
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

    function removeCoinTarget(c) {
        removeCoin(c);
    }

    function findCoinsInRadius(centerX, centerY, radius) {
        const radiusSq = radius * radius;
        const candidates = [];
        const count = activeCoins.length;
        
        const minX = centerX - radius;
        const maxX = centerX + radius;
        const minY = centerY - radius;
        const maxY = centerY + radius;

        const now = performance.now();
        
        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];

            // Fast rejection based on trajectory bounds
            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = getCoinState(c, now);
                cx = s.x + (size / 2);
                cy = s.y + (size / 2);
            }
            
            if (cx < minX || cx > maxX) continue;
            if (cy < minY || cy > maxY) continue;

            const dx = cx - centerX;
            const dy = cy - centerY;
            
            if ((dx*dx + dy*dy) <= radiusSq) {
                if (!c.el && !c.isRemoved) {
                     ensureCoinVisual(c);
                }
                if (c.el) candidates.push(c.el);
            }
        }
        return candidates;
    }

    function findCoinsInPath(x1, y1, x2, y2, radius) {
        const radiusSq = radius * radius;
        const candidates = [];
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

        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];

            // Fast rejection based on trajectory bounds
            if (c.bMaxX < minX || c.bMinX > maxX || c.bMaxY < minY || c.bMinY > maxY) {
                continue;
            }

            const size = c.size || baseCoinSize;
            
            let cx, cy;
            if (c.settled) {
                cx = c.x + (size / 2);
                cy = c.y + (size / 2);
            } else {
                const s = getCoinState(c, now);
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
                if (!c.el && !c.isRemoved) {
                     ensureCoinVisual(c);
                }
                if (c.el) candidates.push(c.el);
            }
        }
        return candidates;
    }

   document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (!rafId) start();
    }
  });

    function playEntranceWave() {
        if (!validRefs()) return;
        spawnBurst(1);
    }

    // --- FX System ---
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
            life: 0.15 // seconds
        });
    }

    function addStain(cx, cy, size) {
        if (!refs.pf) return;
        const st = document.createElement('div');
        st.className = 'coin-stain';
        const d = size * 1.2;
        st.style.width = `${d}px`;
        st.style.height = `${d}px`;
        st.style.left = `${cx - d/2}px`;
        st.style.top = `${cy - d/2}px`;
        refs.pf.appendChild(st);
        
        // Remove after 2.5s
        setTimeout(() => {
            st.style.opacity = '0';
            setTimeout(() => { if(st.parentNode) st.remove(); }, 1000);
        }, 2500);
    }

    // NEW HELPER
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
         // Calculate start pos on source coin rim
         // We can use parentCoin support but endX/endY will be absolute.
         // However, we need to know the initial angle to pick the start point on the rim.
         // Since drawFx recalculates startX based on parentCoin, we need relX1 to be fixed.
         
         const now = performance.now();
         const s = getCoinState(sourceCoin, now);
         const cx = s.x + size/2;
         const cy = s.y + size/2;
         
         const dx = targetX - cx;
         const dy = targetY - cy;
         const angle = Math.atan2(dy, dx);
         const dist = Math.sqrt(dx*dx + dy*dy);
         
         const startDist = (size / 2) * LIGHTNING_START_RADIUS_RATIO; 
         const relStartX = Math.cos(angle) * startDist;
         const relStartY = Math.sin(angle) * startDist;
         
         // Main bolt
         // Start is relative to parent, End is absolute.
         bolts.push({
             parentCoin: sourceCoin,
             relX1: relStartX, relY1: relStartY,
             x2: targetX, y2: targetY,
             age: 0,
             life: 0.25,
             width: 6,
             jaggedScale: 25
         });
         
         // Branches for visual complexity ("tons of branches")
         // We calculate branches in absolute space based on the current snapshot of Main Bolt.
         
         const startX = cx + relStartX;
         const startY = cy + relStartY;
         
         const numBranches = 6 + Math.floor(Math.random() * 5); // Increased for complexity
         for (let i = 0; i < numBranches; i++) {
             const t = 0.1 + Math.random() * 0.8; // Split 10-90% along path
             
             // Interpolate along the straight line for split point
             const splitX = startX + (targetX - startX) * t;
             const splitY = startY + (targetY - startY) * t;
             
             const branchAngle = angle + (Math.random() * 1.6 - 0.8); // deviation
             const branchLen = dist * (0.1 + Math.random() * 0.3); // length relative to total distance
             
             const endBX = splitX + Math.cos(branchAngle) * branchLen;
             const endBY = splitY + Math.sin(branchAngle) * branchLen;
             
             bolts.push({
                 x1: splitX, y1: splitY,
                 x2: endBX, y2: endBY,
                 age: 0,
                 life: 0.25, // match main
                 width: 2.0,
                 jaggedScale: 15
             });
             
             // Occasional sub-branch
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

    function drawFx(dt) {
        if (!fxCtx || !fxCanvas) return;
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        
        const now = performance.now();

        // Update and draw bolts
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
                 const s = getCoinState(b.parentCoin, now);
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
            fxCtx.strokeStyle = `rgba(200, 240, 255, ${alpha})`;
            fxCtx.lineWidth = b.width || 3;
            fxCtx.shadowColor = 'rgba(220, 245, 255, 0.9)';
            fxCtx.shadowBlur = 20;
            
            // Jagged line
            const segments = 6;
            fxCtx.beginPath();
            fxCtx.moveTo(startX, startY);
            
            for (let j = 1; j <= segments; j++) {
                const t = j / segments;
                const tx = startX + (endX - startX) * t;
                const ty = startY + (endY - startY) * t;
                
                if (j === segments) {
                    fxCtx.lineTo(endX, endY);
                } else {
                    const perpX = -(endY - startY);
                    const perpY = (endX - startX);
                    const len = Math.sqrt(perpX*perpX + perpY*perpY);
                    const jaggedness = b.jaggedScale || 40;
                    if (len > 0) {
                        const scale = (Math.random() - 0.5) * jaggedness * (1 - Math.abs(t - 0.5)); // Bulge in middle
                        fxCtx.lineTo(tx + (perpX/len)*scale, ty + (perpY/len)*scale);
                    } else {
                        fxCtx.lineTo(tx, ty);
                    }
                }
            }
            fxCtx.stroke();
            fxCtx.shadowBlur = 0;
        }


        // Draw sparks
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
    }

    return {
        start,
        stop,
        setRate,
        clearBacklog,
        clearPlayfield,
        setCoinSprite,
        getCoinTransform,
        findCoinsInRadius,
        findCoinsInPath,
        findCoinTargetsInRadius,
        findCoinTargetsInPath,
        ensureCoinVisual,
        removeCoinTarget,
        detachCoin,
        recycleCoin: releaseCoin,
        playEntranceWave,
        setDependencies,
        hasBigCoins: () => isSurge2Active() && activeCoins.some(c => c.sizeIndex >= 4),
    };
}
