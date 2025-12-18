// js/game/spawner.js

import { takePreloadedAudio } from '../util/audioCache.js';
import { getMutationState, onMutationChange } from './mutationSystem.js';
import { IS_MOBILE } from '../main.js';
import { getLevelNumber } from './upgrades.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';

let mutationUnlockedSnapshot = false;
let mutationLevelSnapshot = 0n;

const MAX_ACTIVE_COINS_MOBILE = 600

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

export function createSpawner({
    playfieldSelector = '.area-cove .playfield',
    waterSelector = '.water-base',
    surgesHost = '.surges',
    coinsHost = '.coins-layer',
    coinSrc = 'img/coin/coin.webp',
    coinSize = 40,
    animationDurationMs = 1500,
    surgeLifetimeMs = 1400,
    surgeWidthVw = 22,
    coinsPerSecond = 1,
    perFrameBudget = 24,
    backlogCap = 600,
    maxActiveCoins = IS_MOBILE ? MAX_ACTIVE_COINS_MOBILE : 5000,
    initialBurst = 1,
    coinTtlMs = 1e99,
    waveSoundSrc = 'sounds/wave_spawn.ogg',
    waveSoundDesktopVolume = 0.45,
    waveSoundMobileVolume  = 0.2,
    waveSoundMinIntervalMs = 160,
    enableDropShadow = false,
} = {}) {

    let currentCoinSrc = coinSrc;
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const MOBILE_BACKLOG_CAP = 50;
    let burstUntil = 0;

    const BURST_WINDOW_MS        = 120;
    const BURST_TIME_BUDGET_MS   = 10.0;
    const BURST_HARD_CAP         = 60;
    const ONE_SHOT_THRESHOLD     = 180;
    const NORMAL_TIME_BUDGET_MS  = 5.0;

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

    let canvas = null;
    let ctx = null;
    let canvasDirty = false;

    if (refs.c) {
        canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.inset = '0';
        canvas.style.pointerEvents = 'none';
        refs.c.appendChild(canvas);
        ctx = canvas.getContext('2d', { alpha: true });
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

        if (canvas) {
             const dpr = window.devicePixelRatio || 1;
             canvas.width = pfRect.width * dpr;
             canvas.height = pfRect.height * dpr;
             canvas.style.width = pfRect.width + 'px';
             canvas.style.height = pfRect.height + 'px';
             
             if (ctx) {
                 ctx.setTransform(1, 0, 0, 1, 0, 0);
                 ctx.scale(dpr, dpr);
                 ctx.imageSmoothingEnabled = true;
                 ctx.imageSmoothingQuality = 'high';
             }
             canvasDirty = true;
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

    function makeCoin() {
        const el = document.createElement('div');
        el.className = 'coin';
        el.style.position = 'absolute';
        el.style.width = `${coinSize}px`;
        el.style.height = `${coinSize}px`;
        el.style.background = `url(${currentCoinSrc}) center/contain no-repeat`;
        el.style.borderRadius = '50%';
        el.style.pointerEvents = 'auto';
        el.style.willChange = 'transform';
        el.style.contain = 'layout paint style size';
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
    let waveHtmlEl = null; 
    let waveHtmlSource = null;
    let waveLastAt = 0;
    let wavePool = null, waveIdx = 0;

    function ensureWavePool() {
      if (wavePool) return wavePool;

      const preloaded = takePreloadedAudio(waveSoundSrc);
      const poolSize = 4;
      wavePool = Array.from({ length: poolSize }, (_, idx) => {
        if (idx === 0 && preloaded) {
          preloaded.preload = 'auto';
          try { preloaded.currentTime = 0; } catch (_) {}
          preloaded.volume = 1;
          return preloaded;
        }
        const a = new Audio(waveURL);
        a.preload = 'auto';
        a.load?.();
        return a;
      });

      if (preloaded) {
        for (let i = 1; i < wavePool.length; i++) {
          wavePool[i].load?.();
        }
      }

      return wavePool;
    }

    function playWaveHtmlVolume(vol) {
      if (IS_MOBILE) {
        try {
          ac = ac || new (window.AudioContext || window.webkitAudioContext)();
          if (ac.state === 'suspended') ac.resume();
          gain = gain || ac.createGain();
          gain.gain.value = waveSoundMobileVolume;
          gain.connect(ac.destination);

          if (!waveHtmlEl) {
            waveHtmlEl = new Audio(waveURL);
            waveHtmlEl.preload = 'auto';
            waveHtmlEl.playsInline = true;
            waveHtmlEl.crossOrigin = 'anonymous';
          }
          if (!waveHtmlSource) {
            waveHtmlSource = ac.createMediaElementSource(waveHtmlEl);
            waveHtmlSource.connect(gain);
          }

          waveHtmlEl.muted = false;
          waveHtmlEl.volume = 1.0;
          waveHtmlEl.currentTime = 0;
          waveHtmlEl.play().catch(() => {});
          return;
        } catch (e) {
          try { const a = new Audio(waveURL); a.muted = true; a.play().catch(() => {}); } catch {}
          return;
        }
      }

      const pool = ensureWavePool();
      const a = pool[waveIdx++ % pool.length];
      a.volume = vol;
      try { a.currentTime = 0; a.play(); } catch {}
    }

    let ac = null, gain = null, waveBuf = null, waveLoading = false;
    async function ensureWaveWA() {
      if (waveBuf || waveLoading) return;
      waveLoading = true;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        gain = gain || ac.createGain();
        gain.gain.value = waveSoundMobileVolume;
        gain.connect(ac.destination);

        const res = await fetch(waveURL, { cache: 'force-cache' });
        const arr = await res.arrayBuffer();
        waveBuf = await new Promise((ok, err) =>
          ac.decodeAudioData ? ac.decodeAudioData(arr, ok, err) : ok(null)
        );
        if (ac.state === 'suspended') { try { await ac.resume(); } catch {} }
      } catch (_) {} finally { waveLoading = false; }
    }

    function playWaveMobile() {
      try { if (ac && ac.state === 'suspended') ac.resume(); } catch {}
      if (waveBuf && ac && gain) {
        try {
          const src = ac.createBufferSource();
          src.buffer = waveBuf;
          src.connect(gain);
          src.start();
          return;
        } catch {}
      }
      playWaveHtmlVolume(waveSoundMobileVolume);
      ensureWaveWA();
    }

    const warmWave = () => { if (IS_MOBILE) ensureWaveWA(); };
    ['pointerdown','touchstart'].forEach(evt =>
      window.addEventListener(evt, warmWave, { once: true, passive: true, capture: true })
    );

    ensureWavePool();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && IS_MOBILE && ac && ac.state === 'suspended') {
        try { ac.resume(); } catch {}
      }
    });

    function playWaveOncePerBurst() {
      const now = performance.now();
      if (now - waveLastAt < waveSoundMinIntervalMs) return;
      waveLastAt = now;
      if (IS_MOBILE) playWaveMobile();
      else          playWaveHtmlVolume(waveSoundDesktopVolume);
    }

    function planCoinFromWave(wave) {
        if (!wave) return null;
        const { x: waveX, y: waveTop, w: waveW } = wave;

        const crestCenter = waveX + waveW / 2 + (Math.random() * 60 - 30);
        const startX = crestCenter - coinSize / 2;
        const startY = waveTop + 10 - coinSize / 2;

        const drift = Math.random() * 100 - 50;
        const endX = clamp(startX + drift, COIN_MARGIN, M.pfW - coinSize - COIN_MARGIN);
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
            const oldest = activeCoins[0];
            if (oldest) removeCoin(oldest, 0);
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

        const coinPlan = planCoinFromWave(wave);
        if (!coinPlan) return null;

        return {
            wave,
            coin: coinPlan
        };
    }

    function commitBatch(batch) {
      if (!batch.length || !validRefs()) return;

      const wavesFrag = document.createDocumentFragment();
      const coinsFrag = document.createDocumentFragment();
      
      const newSurges = [];
      const newCoins = [];
      const now = performance.now();

      for (const { wave, coin } of batch) {
        if (wave) {
          const surge = getSurge();
          surge.style.left = `${wave.x}px`;
          surge.style.top = `${wave.y}px`;
          surge.style.width = `${wave.w}px`;
          wavesFrag.appendChild(surge);
          newSurges.push(surge);
        }

        const el = getCoin();
        el.style.background = `url(${currentCoinSrc}) center/contain no-repeat`;
        
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
            settled: false
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

    // Helper to draw a single coin image at its position
    // Assumes ctx is set up and valid
    function drawCoin(ctx, c) {
        const img = getImage(c.src);
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, c.x, c.y, coinSize, coinSize);
            return true;
        }
        return false;
    }

    function drawSingleCoin(c) {
        if (!ctx) return;
        
        // If the canvas is already dirty, a full redraw is pending anyway,
        // so we can skip this single draw to avoid redundancy.
        if (canvasDirty) return;

        if (enableDropShadow) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 2;
        }
        
        const drawn = drawCoin(ctx, c);
        
        if (enableDropShadow) {
            ctx.restore();
        }
        
        if (!drawn) {
            // Image not ready yet? We must force a retry later.
            canvasDirty = true;
        }
    }

    function drawSettledCoins() {
        if (!ctx || !canvasDirty) return;
        
        // Clear canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        // Optimization: Batch context operations
        // Settled coins always have rot=0 and scale=1, so we avoid per-coin save/restore/transform
        
        if (enableDropShadow) {
             ctx.save();
             ctx.shadowColor = 'rgba(0,0,0,0.35)';
             ctx.shadowBlur = 2;
             ctx.shadowOffsetY = 2;
        }

        const count = activeCoins.length;
        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];
            if (c.settled && !c.isRemoved && !c.el) {
                drawCoin(ctx, c);
            }
        }
        
        if (enableDropShadow) {
            ctx.restore();
        }

        canvasDirty = false;
    }

    let rate = coinsPerSecond;
    let rafId = null;
    let last = performance.now();
    let carry = 0;
    let queued = 0;
    
    function loop(now) {
      if (!M.pfRect || !M.wRect) computeMetrics();

      let dt = (now - last) / 1000;
      last = now;
      
      if (dt > 0.1) dt = 0.1;
      
      {
          for (let i = activeCoins.length - 1; i >= 0; i--) {
              const c = activeCoins[i];
              
              if (now >= c.dieAt) {
                  removeCoin(c, i);
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
                      releaseCoin(c.el);
                      c.el = null;
                      drawSingleCoin(c);
                  }
                  continue;
              }
              
              const ease = easeOutCubic(t);
              
              const curX = c.startX + (c.endX - c.startX) * ease;
              const curY = c.startY + (c.endY - c.startY) * ease;
              
              c.x = curX;
              c.y = curY;
              
              const rot = -10 + (10 * ease);
              const scale = 0.96 + (0.04 * ease);
              
              c.rot = rot;
              c.scale = scale;
          }
      }

      carry += rate * dt;
      const due = carry | 0;

      let cap = isTouch ? MOBILE_BACKLOG_CAP : backlogCap;
      const autoCollectLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID) || 0;
      if (autoCollectLevel > 0) {
        const activeCap = Math.min(perFrameBudget + 2, 30);
        if (cap > activeCap) {
          cap = activeCap;
        }
      }

      if (queued > cap) queued = cap;

      if (due > 0) {
        queued = Math.min(cap, queued + due);
        carry -= due;
      }

      let spawnTarget = Math.min(queued, perFrameBudget);
      let timeBudgetMs = NORMAL_TIME_BUDGET_MS;

      if (isTouch && now < burstUntil && queued > 0) {
        if (queued <= ONE_SHOT_THRESHOLD) {
          spawnTarget  = queued;
          timeBudgetMs = BURST_TIME_BUDGET_MS;
        } else {
          spawnTarget  = Math.min(queued, BURST_HARD_CAP);
          timeBudgetMs = BURST_TIME_BUDGET_MS;
        }
      }

      if (spawnTarget > 0) {
        const t0 = performance.now();
        const batch = [];
        let baseSpawned = 0;
        for (let i = 0; i < spawnTarget; i++) {
          if (performance.now() - t0 > timeBudgetMs) break;
          const plan = planSpawn();
          if (plan) {
            batch.push(plan);
            baseSpawned += 1;
          }
        }
        if (batch.length) {
          commitBatch(batch);
          if (baseSpawned > 0) {
            queued = Math.max(0, queued - baseSpawned);
          }
        }
      }

      drawSettledCoins();

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
        queued = 0;
        carry = 0;
        last = performance.now();
    }

    function clearPlayfield() {
        for (let i = activeCoins.length - 1; i >= 0; i--) {
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
        return `translate3d(${c.x}px, ${c.y}px, 0) rotate(${c.rot}deg) scale(${c.scale})`;
    }
    
    function findCoinsInRadius(centerX, centerY, radius) {
        const radiusSq = radius * radius;
        const candidates = [];
        const count = activeCoins.length;
        
        const minX = centerX - radius;
        const maxX = centerX + radius;
        const minY = centerY - radius;
        const maxY = centerY + radius;
        
        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];
            const cx = c.x + (coinSize / 2);
            if (cx < minX || cx > maxX) continue;
            
            const cy = c.y + (coinSize / 2);
            if (cy < minY || cy > maxY) continue;

            const dx = cx - centerX;
            const dy = cy - centerY;
            
            if ((dx*dx + dy*dy) <= radiusSq) {
                if (!c.el && !c.isRemoved) {
                     const el = getCoin();
                     el.style.transition = '';
                     el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
                     el.style.background = `url(${c.src}) center/contain no-repeat`;
                     el.style.opacity = '1';
                     el.dataset.mutationLevel = c.mutationLevel;
                     
                     el._coinObj = c;
                     c.el = el;
                     refs.c.appendChild(el);
                     canvasDirty = true;
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

        for (let i = 0; i < count; i++) {
            const c = activeCoins[i];
            const cx = c.x + (coinSize / 2);
            
            if (cx < minX || cx > maxX) continue;
            
            const cy = c.y + (coinSize / 2);
            
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
                     const el = getCoin();
                     el.style.transition = '';
                     el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(0deg) scale(1)`;
                     el.style.background = `url(${c.src}) center/contain no-repeat`;
                     el.style.opacity = '1';
                     el.dataset.mutationLevel = c.mutationLevel;
                     
                     el._coinObj = c;
                     c.el = el;
                     refs.c.appendChild(el);
                     canvasDirty = true;
                }
                if (c.el) candidates.push(c.el);
            }
        }
        return candidates;
    }

   document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (isTouch) burstUntil = performance.now() + BURST_WINDOW_MS;
      if (!rafId) start();
    }
  });
  
    function playEntranceWave() {
      if (!validRefs()) return;
      spawnBurst(1);
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
        detachCoin,
        recycleCoin: releaseCoin,
		playEntranceWave,
    };
}
