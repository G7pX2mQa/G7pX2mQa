// js/game/coinPickup.js

import { bank, CURRENCIES, getActiveSlot, isCurrencyLocked } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { unlockShop } from '../ui/hudButtons.js';
import { addXp, isXpSystemUnlocked } from './xpSystem.js';
import { IS_MOBILE } from '../main.js';
import {
  addMutationPower,
  isMutationUnlocked,
  getMutationState,
  onMutationChange,
  computeMutationMultiplierForLevel,
} from './mutationSystem.js';
import { getMpValueMultiplierBn, getMagnetLevel } from './upgrades.js';
import { createCursorTrail } from './cursorTrail.js';

let mutationUnlockedSnapshot = false;
let mutationLevelIsInfiniteSnapshot = false;
let mutationCurrentLevelStr = '0';
let mutationUnsub = null;

function updateMutationSnapshot(state) {
  if (!state || typeof state !== 'object') {
    mutationUnlockedSnapshot = false;
    mutationLevelIsInfiniteSnapshot = false;
    mutationCurrentLevelStr = '0';
    mutationMultiplierCache.clear();
    return;
  }

  mutationUnlockedSnapshot = !!state.unlocked;
  mutationLevelIsInfiniteSnapshot = !!state.level?.isInfinite?.();
  try {
    mutationCurrentLevelStr = state.level?.toPlainIntegerString?.() ?? '0';
  } catch {
    mutationCurrentLevelStr = '0';
  }

  if (!mutationUnlockedSnapshot) {
    mutationMultiplierCache.clear();
  } else if (mutationLevelIsInfiniteSnapshot) {
    mutationMultiplierCache.clear();
  }
}

function initMutationSnapshot() {
  if (typeof mutationUnsub === 'function') {
    try { mutationUnsub(); } catch {}
  }
  try {
    updateMutationSnapshot(getMutationState());
  } catch {
    mutationUnlockedSnapshot = false;
    mutationMultiplierCache.clear();
  }
  try {
    mutationUnsub = onMutationChange((snapshot) => { updateMutationSnapshot(snapshot); });
  } catch {
    mutationUnsub = null;
  }
}

let coinPickup = null;

const XP_PER_COIN = BigNum.fromInt(1);
const BASE_COIN_VALUE = BigNum.fromInt(1);
const BN_ONE = BigNum.fromInt(1);

let BN_INF;
try {
  BN_INF = BigNum.fromAny('Infinity');
} catch {
  BN_INF = null;
}

const mutationMultiplierCache = new Map();
let COIN_MULTIPLIER = '1';
let mpValueMultiplierBn = BigNum.fromInt(1);
let mpMultiplierListenersBound = false;

// Module-level state for queuing and HUD updates
let pendingCoinGain = null;
let pendingXpGain = null;
let pendingMutGain = null;
let flushScheduled = false;
let coinsVal = null; // Cached BigNum value for HUD
let updateHudFn = () => {}; // No-op until initialized

export function setCoinMultiplier(x) {
  COIN_MULTIPLIER = x;
  try {
    if (bank.coins?.mult?.set) {
      bank.coins.mult.set(x);
    }
  } catch {}
}

function refreshMpValueMultiplierCache() {
  try {
    const next = getMpValueMultiplierBn();
    if (next instanceof BigNum) {
      mpValueMultiplierBn = next.clone?.() ?? next;
    } else if (next != null) {
      mpValueMultiplierBn = BigNum.fromAny(next);
    } else {
      mpValueMultiplierBn = BigNum.fromInt(1);
    }
  } catch {
    mpValueMultiplierBn = BigNum.fromInt(1);
  }
}

function ensureMpValueMultiplierSync() {
  if (mpMultiplierListenersBound) return;
  mpMultiplierListenersBound = true;
  refreshMpValueMultiplierCache();
  if (typeof document !== 'undefined') {
    document.addEventListener('ccc:upgrades:changed', refreshMpValueMultiplierCache);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', refreshMpValueMultiplierCache);
  }
}

function resolveCoinBase(el) {
  if (el?.dataset?.bn) {
    try { return BigNum.fromAny(el.dataset.bn); } catch {}
  }
  if (el?.dataset?.value) {
    try { return BigNum.fromAny(el.dataset.value); } catch {}
  }
  try { return BASE_COIN_VALUE.clone?.() ?? BigNum.fromInt(1); }
  catch { return BigNum.fromInt(1); }
}

const MAGNET_UNIT_RATIO = 0.03;
const MAGNET_COLLECTION_BUFFER = 8; // Small buffer for collection feel

function computeMagnetUnitPx() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const root = document.documentElement;
  const vw = Math.max(0, window.innerWidth || root?.clientWidth || 0);
  const vh = Math.max(0, window.innerHeight || root?.clientHeight || 0);
  if (!(vw > 0 && vh > 0)) return 0;
  const minDim = Math.min(vw, vh);
  return minDim * MAGNET_UNIT_RATIO;
}

function createMagnetController({ playfield, coinsLayer, coinSelector, collectFn, spawner }) {
  if (!playfield || !coinsLayer || typeof collectFn !== 'function') {
    return { destroy() {} };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }

  const indicator = document.createElement('div');
  indicator.className = 'magnet-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  playfield.appendChild(indicator);

  let pointerInside = false;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let localX = 0;
  let localY = 0;
  // Track last local position for interpolation
  let lastLocalX = null;
  let lastLocalY = null;

  let unitPx = computeMagnetUnitPx();
  let magnetLevel = 0;
  let radiusPx = 0;
  let rafId = 0;
  let destroyed = false;
  let playfieldRect = null;

  const updatePlayfieldRect = () => {
    if (destroyed) return;
    playfieldRect = playfield.getBoundingClientRect();
  };

  const hideIndicator = () => {
    indicator.classList.remove('is-visible');
    indicator.style.transform = 'translate3d(-9999px, -9999px, 0)';
    lastLocalX = null;
    lastLocalY = null;
  };

  const updateIndicator = () => {
    if (!pointerInside || radiusPx <= 0) {
      hideIndicator();
      return;
    }
    const diameter = radiusPx * 2;
    indicator.style.width = `${diameter}px`;
    indicator.style.height = `${diameter}px`;
    indicator.style.transform = `translate3d(${localX - radiusPx}px, ${localY - radiusPx}px, 0)`;
    indicator.classList.add('is-visible');
  };

  const sweepCoins = () => {
    if (!pointerInside || radiusPx <= 0) return;
    
    // Optimized: Use Spawner's spatial lookup if available
    if (spawner && typeof spawner.findCoinsInRadius === 'function') {
        // spawner operates in local playfield coordinates (x, y relative to top-left of playfield)
        // localX, localY are already relative to playfieldRect
        
        const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
        
        let candidates = [];
        // Use swept path check if available && we have a previous position
        if (typeof spawner.findCoinsInPath === 'function' && lastLocalX !== null && lastLocalY !== null) {
             candidates = spawner.findCoinsInPath(lastLocalX, lastLocalY, localX, localY, radiusWithBuffer);
        } else {
             candidates = spawner.findCoinsInRadius(localX, localY, radiusWithBuffer);
        }

        // Update last position
        lastLocalX = localX;
        lastLocalY = localY;
        
        if (candidates && candidates.length > 0) {
            // READ Phase: Batch read transforms for animation
            const transforms = [];
            // Re-enabled animation for everyone
             for (let i = 0; i < candidates.length; i++) {
                 // Optimization: since we are managing transforms in JS now, we could ask Spawner for the transform string?
                 // Or just read it from style.transform which is fast-ish if we haven't dirtied layout?
                 // Actually, standard getComputedStyle is fine here because we aren't calling getBoundingClientRect anymore.
                 // Even better: read inline style since Spawner sets it!
                 const el = candidates[i];
                 transforms.push(el.style.transform || 'translate3d(0,0,0)');
             }
            
            // WRITE Phase: Collect
            for (let i = 0; i < candidates.length; i++) {
                collectFn(candidates[i], { transform: transforms[i] });
            }
        }
    } else {
        // Fallback (Slow) - should not be hit if spawner is passed
        const coins = coinsLayer.children;
        const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
        const toCollect = [];
        
        for (let i = coins.length - 1; i >= 0; i--) {
          const coin = coins[i];
          if (coin.dataset.collected === '1') continue;
          if (!coin.matches(coinSelector)) continue;
    
          const rect = coin.getBoundingClientRect();
          const coinX = rect.left + rect.width / 2;
          const coinY = rect.top + rect.height / 2;
          const dx = coinX - pointerClientX;
          const dy = coinY - pointerClientY;
          if (Math.hypot(dx, dy) <= radiusWithBuffer) {
            toCollect.push(coin);
          }
        }
    
        if (!toCollect.length) return;
    
        const transforms = [];
        for (let i = 0; i < toCollect.length; i++) {
            const el = toCollect[i];
            const cs = window.getComputedStyle(el);
            transforms.push(cs.transform);
        }
    
        for (let i = 0; i < toCollect.length; i++) {
            collectFn(toCollect[i], { transform: transforms[i] });
        }
    }
  };

  const runSweep = () => {
    rafId = 0;
    if (!pointerInside || radiusPx <= 0 || destroyed) return;
    sweepCoins();
    ensureSweepLoop();
  };

  const ensureSweepLoop = () => {
    if (!pointerInside || radiusPx <= 0 || rafId || destroyed) return;
    rafId = requestAnimationFrame(runSweep);
  };

  const updatePointerFromEvent = (e) => {
    if (!e || destroyed) return;
    if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return;
    pointerClientX = e.clientX;
    pointerClientY = e.clientY;
    
    if (!playfieldRect) updatePlayfieldRect();
    const rect = playfieldRect;

    localX = pointerClientX - rect.left;
    localY = pointerClientY - rect.top;
    pointerInside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
    updateIndicator();
    ensureSweepLoop();
  };

  const handlePointerLeave = () => {
    pointerInside = false;
    hideIndicator();
    lastLocalX = null;
    lastLocalY = null;
  };

  const refreshMagnetLevel = () => {
    const nextLevel = getMagnetLevel();
    magnetLevel = nextLevel;
    radiusPx = magnetLevel * unitPx;
    updateIndicator();
    ensureSweepLoop();
  };

  const handleResize = () => {
    unitPx = computeMagnetUnitPx();
    radiusPx = magnetLevel * unitPx;
    updatePlayfieldRect();
    updateIndicator();
    ensureSweepLoop();
  };

  const destroy = () => {
    destroyed = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    try { window.removeEventListener('resize', handleResize); } catch {}
    try { window.removeEventListener('saveSlot:change', refreshMagnetLevel); } catch {}
    try { document.removeEventListener('ccc:upgrades:changed', refreshMagnetLevel); } catch {}
    try { playfield.removeEventListener('pointermove', updatePointerFromEvent); } catch {}
    try { playfield.removeEventListener('pointerdown', updatePointerFromEvent); } catch {}
    try { playfield.removeEventListener('pointerenter', updatePointerFromEvent); } catch {}
    try { playfield.removeEventListener('pointerleave', handlePointerLeave); } catch {}
    try { playfield.removeEventListener('pointercancel', handlePointerLeave); } catch {}
    try { indicator.remove(); } catch {}
  };

  const pointerOpts = { passive: true };
  playfield.addEventListener('pointermove', updatePointerFromEvent, pointerOpts);
  playfield.addEventListener('pointerdown', updatePointerFromEvent, pointerOpts);
  playfield.addEventListener('pointerenter', updatePointerFromEvent, pointerOpts);
  playfield.addEventListener('pointerleave', handlePointerLeave, pointerOpts);
  playfield.addEventListener('pointercancel', handlePointerLeave, pointerOpts);
  window.addEventListener('resize', handleResize);
  window.addEventListener('saveSlot:change', refreshMagnetLevel);
  document.addEventListener('ccc:upgrades:changed', refreshMagnetLevel);

  refreshMagnetLevel();

  return { destroy };
}

// Queue helpers moved to module scope
const cloneBn = (value) => {
  if (!value) return BigNum.fromInt(0);
  if (typeof value.clone === 'function') {
    try { return value.clone(); } catch {}
  }
  try { return BigNum.fromAny(value); } catch { return BigNum.fromInt(0); }
};

const mergeGain = (current, gain) => {
  if (!gain) return current;
  if (!current) return cloneBn(gain);
  try { return current.add(gain); }
  catch {
    try {
      const base = cloneBn(current);
      return base.add(gain);
    } catch {
      return cloneBn(gain);
    }
  }
};

const flushPendingGains = () => {
  const coinGain = pendingCoinGain;
  pendingCoinGain = null;
  if (coinGain && !coinGain.isZero?.()) {
    try { bank.coins.add(coinGain); } catch {}
  }

  const xpGain = pendingXpGain;
  pendingXpGain = null;
  if (xpGain && !xpGain.isZero?.()) {
    try { addXp(xpGain); } catch {}
  }

  const mutGain = pendingMutGain;
  pendingMutGain = null;
  if (mutGain && !mutGain.isZero?.()) {
    try { addMutationPower(mutGain); } catch {}
  }
};

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    flushPendingGains();
  });
};

const queueCoinGain = (gain) => {
  pendingCoinGain = mergeGain(pendingCoinGain, gain);
  scheduleFlush();
};

const queueXpGain = (gain) => {
  pendingXpGain = mergeGain(pendingXpGain, gain);
  scheduleFlush();
};

const queueMutationGain = (gain) => {
  pendingMutGain = mergeGain(pendingMutGain, gain);
  scheduleFlush();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingGains, { passive: true });
}

let coinMultiplierBn = null;
let coinMultiplierIsInfinite = false;

const refreshCoinMultiplierCache = () => {
  try {
    const multHandle = bank?.coins?.mult;
    if (!multHandle || typeof multHandle.get !== 'function') {
      coinMultiplierBn = null;
      coinMultiplierIsInfinite = false;
      return;
    }
    const next = multHandle.get();
    if (!next) {
      coinMultiplierBn = BigNum.fromInt(1);
      coinMultiplierIsInfinite = false;
      return;
    }
    coinMultiplierBn = next.clone?.() ?? BigNum.fromAny(next);
    coinMultiplierIsInfinite = !!coinMultiplierBn?.isInfinite?.();
  } catch {
    coinMultiplierBn = null;
    coinMultiplierIsInfinite = false;
  }
};

const applyCoinMultiplier = (value) => {
  let base;
  try {
    base = value instanceof BigNum
      ? (value.clone?.() ?? value)
      : BigNum.fromAny(value ?? 0);
  } catch {
    try {
      return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(value) : BigNum.fromInt(0);
    } catch {
      return BigNum.fromInt(0);
    }
  }

  if (!coinMultiplierBn) refreshCoinMultiplierCache();
  const mult = coinMultiplierBn;
  if (!mult) {
    try { return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(base) : base.clone?.() ?? base; }
    catch { return base.clone?.() ?? base; }
  }
  const multIsInf = coinMultiplierIsInfinite || mult.isInfinite?.();
  if (multIsInf) {
    try { return BigNum.fromAny('Infinity'); }
    catch { return base.clone?.() ?? base; }
  }
  if (base.isZero?.()) {
    return base.clone?.() ?? base;
  }
  try {
    return base.mulBigNumInteger(mult);
  } catch {
    try { return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(base) : base.clone?.() ?? base; }
    catch { return base.clone?.() ?? base; }
  }
};

const computeMutationMultiplier = (spawnLevelStr) => {
  if (!mutationUnlockedSnapshot) return null;

  if (mutationLevelIsInfiniteSnapshot) {
    if (BN_INF) {
      try { return BN_INF.clone?.() ?? BN_INF; }
      catch { return BN_INF; }
    }
    return null;
  }

  if (!spawnLevelStr) return null;
  const key = String(spawnLevelStr).trim();
  if (!key) return null;

  const cached = mutationMultiplierCache.get(key);
  if (cached) {
    try { return cached.clone?.() ?? BigNum.fromAny(cached); }
    catch { mutationMultiplierCache.delete(key); }
  }

  let levelBn;
  try {
    levelBn = BigNum.fromAny(key);
  } catch {
    return null;
  }

  let multiplier;
  try {
    multiplier = computeMutationMultiplierForLevel(levelBn);
  } catch {
    multiplier = null;
  }

  if (!multiplier) return null;
  const isIdentity = multiplier.cmp?.(BN_ONE) === 0;
  const stored = multiplier.clone?.() ?? multiplier;
  mutationMultiplierCache.set(key, stored);
  if (isIdentity) return null;
  try { return stored.clone?.() ?? stored; }
  catch { return stored; }
};

// --- New Logic for Passive/Active Automation ---

function calculateCoinValue(spawnLevelStr) {
  const base = BASE_COIN_VALUE.clone?.() ?? BigNum.fromInt(1);
  let inc = applyCoinMultiplier(base);
  let xpInc = cloneBn(XP_PER_COIN);

  // If spawnLevelStr is null/undefined, use current mutation level (passive generation)
  const levelStr = spawnLevelStr ?? mutationCurrentLevelStr;
  const mutationMultiplier = computeMutationMultiplier(levelStr);
  
  if (mutationMultiplier) {
    try { inc = inc.mulBigNumInteger(mutationMultiplier); } catch {}
    try { xpInc = xpInc.mulBigNumInteger(mutationMultiplier); } catch {}
  }
  
  const mpGain = (typeof isMutationUnlocked === 'function' && isMutationUnlocked())
    ? cloneBn(mpValueMultiplierBn)
    : BigNum.fromInt(0);

  return { coinGain: inc, xpGain: xpInc, mpGain };
}

export function getPassiveCoinReward() {
  const { coinGain, xpGain, mpGain } = calculateCoinValue(null);
  return { 
    coins: coinGain, 
    xp: xpGain, 
    mp: mpGain 
  };
}

export function triggerPassiveCollect(count = 1) {
  if (count <= 0) return;
  const { coinGain, xpGain, mpGain } = calculateCoinValue(null);
  
  const totalCoin = coinGain.mulBigNumInteger(BigNum.fromInt(count));
  const totalXp = xpGain.mulBigNumInteger(BigNum.fromInt(count));
  const totalMp = mpGain.mulBigNumInteger(BigNum.fromInt(count));

  const coinsLocked = isCurrencyLocked(CURRENCIES.COINS);
  const incIsZero = typeof totalCoin?.isZero === 'function' ? totalCoin.isZero() : false;

  if (!incIsZero && !coinsLocked) {
    try {
      coinsVal = coinsVal?.add ? coinsVal.add(totalCoin) : cloneBn(totalCoin);
    } catch {
      coinsVal = cloneBn(totalCoin);
    }
  }
  updateHudFn();

  if (!incIsZero) {
    queueCoinGain(totalCoin);
  }

  const xpEnabled = typeof isXpSystemUnlocked === 'function' ? isXpSystemUnlocked() : true;
  const xpIsZero = typeof totalXp?.isZero === 'function' ? totalXp.isZero() : false;
  if (xpEnabled && !xpIsZero) {
    queueXpGain(totalXp);
  }

  if (!totalMp.isZero?.()) {
    queueMutationGain(totalMp);
  }
}

export function initCoinPickup({
  spawner,
  playfieldSelector   = '.area-cove .playfield',
  coinsLayerSelector  = '.area-cove .coins-layer',
  hudAmountSelector   = '.hud-top .coin-amount',
  coinSelector        = '.coin, [data-coin], .coin-sprite',
  soundSrc            = 'sounds/coin_pickup.ogg',
  storageKey          = 'ccc:coins',
  disableAnimation    = false, // Force false to re-enable on mobile
} = {}) {
  if (coinPickup?.destroy) {
    coinPickup.destroy();
  }
  
  const pf  = document.querySelector(playfieldSelector);
  const cl  = document.querySelector(coinsLayerSelector);
  const amt = document.querySelector(hudAmountSelector);
  if (!pf || !cl || !amt) {
    console.warn('[coinPickup] missing required nodes', { pf: !!pf, cl: !!cl, amt: !!amt });
    return { destroy(){} };
  }

  initMutationSnapshot();
  ensureMpValueMultiplierSync();

  pf.style.touchAction = 'none';

  let magnetController = null;
  let cursorTrail = null;
  coinsVal = bank.coins.value;
  
  updateHudFn = () => {
    const formatted = formatNumber(coinsVal);
    if (formatted.includes('<span')) {
      amt.innerHTML = formatted;
    } else {
      amt.textContent = formatted;
    }
  };
  
  refreshCoinMultiplierCache();
  updateHudFn();

  const onCurrencyChange = (e) => {
    if (!e?.detail) return;
    if (e.detail.key === 'coins') {
      coinsVal = e.detail.value;
      updateHudFn();
    }
  };
  window.addEventListener('currency:change', onCurrencyChange);

  const onCoinMultiplierChange = (event) => {
    if (!event?.detail || event.detail.key !== 'coins') return;
    try {
      const { mult } = event.detail;
      if (mult instanceof BigNum) {
        coinMultiplierBn = mult.clone?.() ?? mult;
      } else if (mult != null) {
        coinMultiplierBn = BigNum.fromAny(mult);
      } else {
        coinMultiplierBn = BigNum.fromInt(1);
      }
      coinMultiplierIsInfinite = !!coinMultiplierBn?.isInfinite?.();
    } catch {
      coinMultiplierBn = null;
      coinMultiplierIsInfinite = false;
    }
  };
  window.addEventListener('currency:multiplier', onCoinMultiplierChange);

  // ----- Slot-scoped shop unlock/progress keys -----
  const slot = getActiveSlot();
  if (slot == null) {
    console.warn('[coinPickup] init called before a save slot is selected.');
    return { destroy(){} };
  }
  const SHOP_UNLOCK_KEY   = `ccc:unlock:shop:${slot}`;
  const SHOP_PROGRESS_KEY = `ccc:unlock:shop:progress:${slot}`;

  const legacyP = localStorage.getItem('ccc:unlock:shop:progress');
  const legacyU = localStorage.getItem('ccc:unlock:shop');
  if (legacyP != null && localStorage.getItem(SHOP_PROGRESS_KEY) == null) {
    localStorage.setItem(SHOP_PROGRESS_KEY, legacyP);
  }
  if (legacyU != null && localStorage.getItem(SHOP_UNLOCK_KEY) == null) {
    localStorage.setItem(SHOP_UNLOCK_KEY, legacyU);
  }
  localStorage.removeItem('ccc:unlock:shop:progress');
  localStorage.removeItem('ccc:unlock:shop');

  {
    const p = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10);
    localStorage.setItem(SHOP_PROGRESS_KEY, String(p));
    if (p >= 10 && localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
      try { unlockShop(); } catch {}
      localStorage.setItem(SHOP_UNLOCK_KEY, '1');
    }
  }

  const resolvedSrc = new URL(soundSrc, document.baseURI).href;
  const isCoin = (el) => el instanceof HTMLElement && el.dataset.collected !== '1' && el.matches(coinSelector);

  function ensureInteractive(el){ try { el.style.pointerEvents = 'auto'; } catch {} }
  cl.querySelectorAll(coinSelector).forEach(ensureInteractive);
  
  // ----- Audio (Mobile: WebAudio + fallback) -----
  let ac = null, masterGain = null, buffer = null;
  let webAudioReady = false, webAudioLoading = false;

  let mobileFallback = null;
  function playCoinMobileFallback(){
    if (!mobileFallback){
      mobileFallback = new Audio(resolvedSrc);
      mobileFallback.preload = 'auto';
    }
    mobileFallback.muted = false;
    mobileFallback.volume = 0.12; // Const
    try {
      mobileFallback.currentTime = 0;
      mobileFallback.play();
    } catch {}
  }

  async function initWebAudioOnce(){
    if (webAudioReady || webAudioLoading) return;
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return;

    webAudioLoading = true;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = 0.12; // Const
    masterGain.connect(ac.destination);

    try {
      const res = await fetch(resolvedSrc, { cache: 'force-cache' });
      const arr = await res.arrayBuffer();
      buffer = await new Promise((ok, err) => ac.decodeAudioData(arr, ok, err));
      if (ac.state === 'suspended') { try { await ac.resume(); } catch {} }
      webAudioReady = true;
    } catch (e) {
      console.warn('[coinPickup] WebAudio init failed:', e);
    } finally {
      webAudioLoading = false;
    }
  }

  function playCoinWebAudio(){
    if (ac && ac.state === 'suspended'){ try { ac.resume(); } catch {} }

    if (IS_MOBILE && (!webAudioReady || !ac || !buffer || !masterGain || (ac && ac.state !== 'running'))) {
      if (!webAudioLoading) initWebAudioOnce();
      playCoinMobileFallback();
      return true;
    }

    if (!webAudioReady || !ac || !buffer || !masterGain) {
      if (!webAudioLoading) initWebAudioOnce();
      return true;
    }

    try {
      const src = ac.createBufferSource();
      src.buffer = buffer;
      try { src.detune = 0; } catch {}
      masterGain.gain.setValueAtTime(0.12, ac.currentTime);
      src.connect(masterGain);
      const t = ac.currentTime + Math.random()*0.006;
      src.start(t);
      return true;
    } catch (e){
      console.warn('[coinPickup] playCoinWebAudio error:', e);
      if (IS_MOBILE) playCoinMobileFallback();
      return false;
    }
  }

  function playSound(){
    if (IS_MOBILE) return playCoinWebAudio();
    return playCoinHtmlAudio();
  }

  const warm = () => { if (IS_MOBILE) initWebAudioOnce(); };
  ['pointerdown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, warm, { once: true, passive: true, capture: true });
    pf.addEventListener(evt, warm, { once: true, passive: true, capture: true });
  });

  let pool = null, pIdx = 0, lastAt = 0;
  if (!IS_MOBILE){
    pool = Array.from({ length: 8 }, () => { const a = new Audio(resolvedSrc); a.preload = 'auto'; a.volume = 0.3; return a; });
  }
  function playCoinHtmlAudio(){
    const now = performance.now(); if ((now - lastAt) < 40) return; lastAt = now;
    const a = pool[pIdx++ % pool.length];
    try { a.currentTime = 0; a.play(); } catch {}
  }

  function animateAndRemove(el, opts = {}){
    if (disableAnimation || IS_MOBILE) {
        if (spawner && typeof spawner.detachCoin === 'function') {
           spawner.detachCoin(el);
        }
        el.remove(); 
        return; 
    }
    
    // Notify spawner that this coin is "taken" so physics stops
    if (spawner && typeof spawner.detachCoin === 'function') {
        spawner.detachCoin(el);
    }
    
    let start = 'translate3d(0,0,0)';
    if (opts.transform) {
        if (opts.transform !== 'none') start = opts.transform;
    } else {
        // Fallback if no transform passed (shouldn't happen with new logic)
        start = el.style.transform || 'translate3d(0,0,0)';
    }

    el.style.setProperty('--ccc-start', start);
    el.classList.add('coin--collected');
    const done = () => { el.removeEventListener('animationend', done); el.remove(); };
    el.addEventListener('animationend', done);
    setTimeout(done, 600);
  }

  function collect(el, opts = {}) {
    if (!isCoin(el)) return false;
    el.dataset.collected = '1';

    playSound();
    animateAndRemove(el, opts);

    const base = resolveCoinBase(el);
    // Explicitly use element's mutation level
    const spawnLevelStr = el.dataset.mutationLevel || null;
    
    // We inline logic partially or reuse calculateCoinValue with custom base?
    // calculateCoinValue uses BASE_COIN_VALUE global.
    // Here we have 'base' from element.
    // Let's implement inline to preserve element-specific base behavior
    
    const coinsLocked = isCurrencyLocked(CURRENCIES.COINS);
    let inc = applyCoinMultiplier(base);
    let xpInc = cloneBn(XP_PER_COIN);

    const mutationMultiplier = computeMutationMultiplier(spawnLevelStr);
    if (mutationMultiplier) {
      try { inc = inc.mulBigNumInteger(mutationMultiplier); } catch {}
      try { xpInc = xpInc.mulBigNumInteger(mutationMultiplier); } catch {}
    }

    const incIsZero = typeof inc?.isZero === 'function' ? inc.isZero() : false;
    if (!incIsZero && !coinsLocked) {
      try {
        coinsVal = coinsVal?.add ? coinsVal.add(inc) : cloneBn(inc);
      } catch {
        coinsVal = cloneBn(inc);
      }
    }
    updateHudFn();
    if (!incIsZero) {
      queueCoinGain(inc);
    }

    const xpEnabled = typeof isXpSystemUnlocked === 'function' ? isXpSystemUnlocked() : true;
    const xpIsZero = typeof xpInc?.isZero === 'function' ? xpInc.isZero() : false;
    if (xpEnabled && !xpIsZero) {
      queueXpGain(xpInc);
    }

    if (typeof isMutationUnlocked === 'function' && isMutationUnlocked()) {
      const mpGain = cloneBn(mpValueMultiplierBn);
      if (!mpGain.isZero?.()) {
        queueMutationGain(mpGain);
      }
    }

    if (localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
      const next = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10) + 1;
      localStorage.setItem(SHOP_PROGRESS_KEY, String(next));
      if (next >= 10) {
        try { unlockShop(); } catch {}
        localStorage.setItem(SHOP_UNLOCK_KEY, '1');
      }
    }

    return true;
  }

  magnetController = createMagnetController({
    playfield: pf,
    coinsLayer: cl,
    coinSelector,
    collectFn: collect,
    spawner, // Pass spawner for optimized lookup
  });

  cursorTrail = createCursorTrail(pf);
  const onDelegatedInteract = (e) => {
    if (e.target === cl) return;
    const target = e.target.closest(coinSelector);
    if (target && isCoin(target)) {
      collect(target);
    }
  };

  cl.addEventListener('pointerdown', onDelegatedInteract, { passive: true });
  if (!IS_MOBILE) {
    cl.addEventListener('mouseover', onDelegatedInteract, { passive: true });
  }

  const BRUSH_R = 25; // Slightly larger for single check
  let cachedPfRect = null;
  const updateCachedRect = () => { cachedPfRect = pf.getBoundingClientRect(); };
  window.addEventListener('resize', updateCachedRect);
  window.addEventListener('scroll', updateCachedRect, { passive: true });
  updateCachedRect();

  let lastBrushLocalX = null;
  let lastBrushLocalY = null;

  // Reset brush history on leave
  pf.addEventListener('pointerleave', () => {
      lastBrushLocalX = null;
      lastBrushLocalY = null;
  }, { passive: true });

  function brushAt(x,y){
    if (spawner && typeof spawner.findCoinsInRadius === 'function') {
        if (!cachedPfRect) updateCachedRect();
        const localX = x - cachedPfRect.left;
        const localY = y - cachedPfRect.top;
        
        let candidates = [];
        if (typeof spawner.findCoinsInPath === 'function' && lastBrushLocalX !== null && lastBrushLocalY !== null) {
            candidates = spawner.findCoinsInPath(lastBrushLocalX, lastBrushLocalY, localX, localY, BRUSH_R);
        } else {
            candidates = spawner.findCoinsInRadius(localX, localY, BRUSH_R);
        }
        
        lastBrushLocalX = localX;
        lastBrushLocalY = localY;

        if (candidates && candidates.length > 0) {
             const transforms = [];
             for (let i = 0; i < candidates.length; i++) {
                 const el = candidates[i];
                 transforms.push(el.style.transform || 'translate3d(0,0,0)');
             }
            
            for (let i = 0; i < candidates.length; i++) {
                collect(candidates[i], { transform: transforms[i] });
            }
        }
    } else {
        // Fallback: Legacy slow method (forced sync layout)
        const OFF = [[0,0],[18,0],[-18,0],[0,18],[0,-18]];
        for (let k=0;k<OFF.length;k++){
          const px = x + OFF[k][0], py = y + OFF[k][1];
          const stack = document.elementsFromPoint(px, py);
          for (let i=0;i<stack.length;i++){
            const el = stack[i];
            if (isCoin(el)) { collect(el); }
          }
        }
    }
  }

  let pending = null, brushScheduled = false;
  function scheduleBrush(x,y){
    pending = {x,y};
    if (!brushScheduled){
      brushScheduled = true;
      requestAnimationFrame(() => {
        if (pending){ brushAt(pending.x, pending.y); pending = null; }
        brushScheduled = false;
      });
    }
  }

  pf.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });
  pf.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });
  pf.addEventListener('pointerup',   (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });
  pf.addEventListener('mousemove', (e) => { scheduleBrush(e.clientX, e.clientY); }, { passive: true });

  function setMobileVolume(v){
    const vol = Math.max(0, Math.min(1, Number(v) || 0));
    if (masterGain && ac) masterGain.gain.setValueAtTime(vol, ac.currentTime);
    if (mobileFallback) mobileFallback.volume = vol;
  }

  const destroy = () => {
    flushPendingGains();
    updateHudFn = () => {};
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateCachedRect);
      window.removeEventListener('beforeunload', flushPendingGains);
      window.removeEventListener('currency:multiplier', onCoinMultiplierChange);
      window.removeEventListener('currency:change', onCurrencyChange);
    }
    if (typeof mutationUnsub === 'function') {
      try { mutationUnsub(); } catch {}
      mutationUnsub = null;
    }
    if (magnetController?.destroy) {
      try { magnetController.destroy(); } catch {}
      magnetController = null;
    }
    if (cursorTrail?.destroy) {
      try { cursorTrail.destroy(); } catch {}
      cursorTrail = null;
    }
    try {
      cl.removeEventListener('pointerdown', onDelegatedInteract);
      if (!IS_MOBILE) {
        cl.removeEventListener('mouseover', onDelegatedInteract);
      }
    } catch {}
    try { ['pointerdown','pointermove','pointerup','mousemove'].forEach(evt => pf.replaceWith(pf.cloneNode(true))); } catch {}
  };

  coinPickup = { destroy };

  return {
    get count(){ return coinsVal; },
    set count(v){
      coinsVal = BigNum.fromAny ? BigNum.fromAny(v) : BigNum.fromInt(Number(v) || 0);
      updateHudFn();
    },
    setMobileVolume,
    destroy,
  };
}
