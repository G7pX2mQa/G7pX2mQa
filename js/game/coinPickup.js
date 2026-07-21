// js/game/coinPickup.js

import { bank, CURRENCIES, getActiveSlot, isCurrencyLocked } from '../util/storage.js';
import { incrementLifetimeSizeCoinsCollected, checkSecretAchievements } from './secretAchievements.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { unlockShop } from '../ui/hudButtons.js';
import { addXp, isXpSystemUnlocked } from './xpSystem.js';
import { coinsCollected, globalCoinsCollected, currentArea, AREAS } from '../main.js';
import { IS_MOBILE } from '../util/platformChecker.js';
import {
  addMutationPower,
  isMutationUnlocked,
  getMutationState,
  onMutationChange,
  computeMutationMultiplierForLevel,
} from './mutationSystem.js';
import { getMpValueMultiplierBn, getMagnetLevel, getLevelNumber } from './upgrades.js';
import { RAINBOW_GEM_AREA_KEY } from './rainbowGemUpgrades.js';
import { playAudio } from '../util/audioManager.js';
import { onCoinCollected, addComboChangeListener, removeComboChangeListener } from './comboSystem.js';
import { getComboUiString } from './surgeEffects.js';
import { settingsManager } from './settingsManager.js';
import { createMagnetController, initInteractionBrush, computeMagnetUnitPx } from './collectionCore.js';
import { setHtmlOrText } from '../util/uiHelpers.js';
import { MAX_VISUALS } from "./spawnerCore.js";

let mutationUnlockedSnapshot = false;
let mutationLevelIsInfiniteSnapshot = false;
let mutationCurrentLevelStr = '0';
let mutationUnsub = null;

export function updateMutationSnapshot(state) {
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
    mutationCurrentLevelStr = state.level?.inf || state.level?.e >= BigNum.DEFAULT_PRECISION ? 'Infinity' : (state.level?.toPlainIntegerString?.() ?? '0');
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

let hudUpdateScheduled = false;
const scheduleHudUpdate = () => {
  if (hudUpdateScheduled) return;
  hudUpdateScheduled = true;
  requestAnimationFrame(() => {
    hudUpdateScheduled = false;
    updateHudFn();
  });
};

export function setCoinMultiplier(x) {
  COIN_MULTIPLIER = x;
  try {
    if (bank.coins?.mult?.set) {
      bank.coins.mult.set(x);
    }
  } catch {}
}

export function refreshMpValueMultiplierCache() {
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

export function clearPendingGains() {
  pendingCoinGain = null;
  pendingXpGain = null;
  pendingMutGain = null;
}

let coinMultiplierBn = null;
let coinMultiplierIsInfinite = false;

export const refreshCoinMultiplierCache = () => {
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

  refreshMpValueMultiplierCache();

  // If spawnLevelStr is null/undefined, use current mutation level (passive generation)
  const levelStr = spawnLevelStr ?? mutationCurrentLevelStr;
  const mutationMultiplier = computeMutationMultiplier(levelStr);
  
  if (mutationMultiplier) {
    try { inc = inc.mulBigNumInteger(mutationMultiplier); } catch {}
    try { xpInc = xpInc.mulBigNumInteger(mutationMultiplier); } catch {}
  }
  
  const mpGain = (typeof isMutationUnlocked === 'function' && isMutationUnlocked())
    ? BigNum.fromInt(1)
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
  
  const totalCoin = coinGain.mulBigNumInteger(BigNum.fromAny(count));
  const totalXp = xpGain.mulBigNumInteger(BigNum.fromAny(count));
  const totalMp = mpGain.mulBigNumInteger(BigNum.fromAny(count));

  const coinsLocked = isCurrencyLocked(CURRENCIES.COINS);
  const incIsZero = typeof totalCoin?.isZero === 'function' ? totalCoin.isZero() : false;

  if (!incIsZero && !coinsLocked) {
    try {
      coinsVal = coinsVal?.add ? coinsVal.add(totalCoin) : cloneBn(totalCoin);
    } catch {
      coinsVal = cloneBn(totalCoin);
    }
  }
  scheduleHudUpdate();

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
  playfieldSelector   = '.playfield',
  coinsLayerSelector  = '.coins-layer',
  hudAmountSelector   = '.hud-top .coin-amount',
  coinSelector        = '.spawner-item, [data-coin], .coin-sprite',
  soundSrc            = 'sounds/pickup.ogg',
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
  
  // Listen for combo changes (including max combo updates triggered by tsunami exponent)
  addComboChangeListener(scheduleHudUpdate);
  ensureMpValueMultiplierSync();

  pf.style.touchAction = 'none';

  let magnetController = null;
  coinsVal = bank.coins.value;
  
  updateHudFn = () => {
    const formatted = formatNumber(coinsVal);
    const comboStr = getComboUiString();
    const fullText = formatted + comboStr;

    setHtmlOrText(amt, fullText);
  };
  
  refreshCoinMultiplierCache();
  scheduleHudUpdate();

  const onCurrencyChange = (e) => {
    if (!e?.detail) return;
    if (e.detail.key === 'coins') {
      coinsVal = e.detail.value;
      scheduleHudUpdate();
    }
  };
  window.addEventListener('currency:change', onCurrencyChange);

  const onSaveSlotChange = () => {
    coinsVal = bank.coins.value;
    scheduleHudUpdate();
    
    // Check if shop should be unlocked on slot change
    const activeSlot = getActiveSlot();
    if (activeSlot != null) {
      const SHOP_UNLOCK_KEY   = `ccc:unlock:shop:${activeSlot}`;
      const SHOP_PROGRESS_KEY = `ccc:unlock:shop:progress:${activeSlot}`;
      const p = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10);
      localStorage.setItem(SHOP_PROGRESS_KEY, String(p));
      if (p >= 10 && localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
        try { unlockShop(); } catch {}
        localStorage.setItem(SHOP_UNLOCK_KEY, '1');
      }
    }
  };
  window.addEventListener('saveSlot:change', onSaveSlotChange);

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
  if (slot != null) {
    const SHOP_UNLOCK_KEY   = `ccc:unlock:shop:${slot}`;
    const SHOP_PROGRESS_KEY = `ccc:unlock:shop:progress:${slot}`;
    const p = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10);
    localStorage.setItem(SHOP_PROGRESS_KEY, String(p));
    if (p >= 10 && localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
      try { unlockShop(); } catch {}
      localStorage.setItem(SHOP_UNLOCK_KEY, '1');
    }
  }

  const resolvedSrc = new URL(soundSrc, document.baseURI).href;
  
  // Optimization: use _coinObj if present, fallback to dataset/matches
  const isCoin = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      // Fast path: Check for attached object
      if (el._itemObj) return !el._itemObj.isRemoved && el.dataset.collected !== '1';
      return el.dataset.collected !== '1' && el.matches(coinSelector);
  };

  function ensureInteractive(el){ try { el.style.pointerEvents = 'auto'; } catch {} }
  cl.querySelectorAll(coinSelector).forEach(ensureInteractive);
  
  // ----- Audio Handling -----
  // Replaced with audioManager
  const COIN_VOLUME = IS_MOBILE ? 0.12 : 0.3;
  let lastAt = 0;

  function playSound(src = resolvedSrc){
    // Debounce slightly for default sound to avoid overwhelming accumulation
    if (src === resolvedSrc) {
        const now = performance.now();
        if ((now - lastAt) < 20) return; 
        lastAt = now;
    }
    
    // Use shared audio manager
    playAudio(src, { 
        volume: COIN_VOLUME
    });
  }

  function animateAndRemove(el, opts = {}){
    const coinObj = el && el._itemObj;
    // Notify spawner that this coin is "taken" so physics stops
    if (spawner && typeof spawner.detachCoin === 'function') {
        spawner.detachCoin(opts.coin || coinObj || el);
    }

    const recycle = () => {
        if (!el) return;
        if (spawner && typeof spawner.recycleCoin === 'function') {
            spawner.recycleCoin(el);
        } else {
            el.remove();
        }
    };

    if (disableAnimation || IS_MOBILE || settingsManager.get('pickup_animation') === false) {
        recycle();
        return; 
    }
    
    let start = 'translate3d(0,0,0)';
    if (opts.transform) {
        if (opts.transform !== 'none') start = opts.transform;
    } else {
        // Fallback if no transform passed (shouldn't happen with new logic)
        start = el.style.transform || 'translate3d(0,0,0)';
    }

    el.style.setProperty('--ccc-start', start);
    el.classList.add('item--collected');
    
    let complete = false;
    const done = () => { 
        if (complete) return;
        complete = true;
        el.removeEventListener('animationend', done); 
        recycle();
    };
    el.addEventListener('animationend', done);
    setTimeout(done, 600);
  }

  function collectBatch(items) {
    if (!items || !items.length) return;
    if (typeof currentArea !== 'undefined' && typeof AREAS !== 'undefined' && currentArea !== AREAS.STARTER_COVE) return;
    
    refreshMpValueMultiplierCache();

    // Find best sound and max size in batch
    let bestSoundSrc = resolvedSrc;
    let maxSizeIndex = -1;
    let foundSound = false;

    for (const item of items) {
        const coinObj = item.coin || (item.el && item.el._itemObj);
        if (coinObj) {
            if (coinObj.sizeIndex !== undefined) {
                if (coinObj.sizeIndex > maxSizeIndex) {
                    maxSizeIndex = coinObj.sizeIndex;
                    if (coinObj.soundSrc) {
                        bestSoundSrc = coinObj.soundSrc;
                        foundSound = true;
                    }
                }
            } else if (coinObj.soundSrc && !foundSound) {
                bestSoundSrc = coinObj.soundSrc;
                foundSound = true;
            }
        }
    }

    playSound(bestSoundSrc);

    let totalCoin = null;
    let totalXp = null;
    let totalMp = null;
    let collectedCount = 0;

    const coinsLocked = isCurrencyLocked(CURRENCIES.COINS);
    const xpEnabled = typeof isXpSystemUnlocked === 'function' ? isXpSystemUnlocked() : true;
    const mutEnabled = typeof isMutationUnlocked === 'function' && isMutationUnlocked();


    let visualCount = 0;

    const coinGroups = {};
    let needsSecretCheck = false;

    for (const item of items) {
      let el = item.el;
      let coinObj = item.coin;
      
      if (!coinObj && el && el._itemObj) coinObj = el._itemObj;
      if (el && !isCoin(el)) continue;
      if (coinObj && coinObj.isRemoved) continue;

      if (coinObj && coinObj.sizeIndex !== undefined) {
          if (coinObj.sizeIndex >= 4 && coinObj.sizeIndex <= 6) {
              incrementLifetimeSizeCoinsCollected(coinObj.sizeIndex);
              needsSecretCheck = true;
          }
      }

      collectedCount++;
      if (el) el.dataset.collected = '1';



      if (visualCount < MAX_VISUALS) {
           if (!el && coinObj && spawner && spawner.ensureCoinVisual) {
               el = spawner.ensureCoinVisual(coinObj);
               if (el) el.dataset.collected = '1';
           }
           if (el) {
               animateAndRemove(el, item.opts || {});
               visualCount++;
           } else {
               if (coinObj && spawner && spawner.removeCoinTarget) spawner.removeCoinTarget(coinObj);
           }
      } else {
           if (coinObj && spawner && spawner.removeCoinTarget) {
               spawner.removeCoinTarget(coinObj);
           } else if (el) {
               if (spawner && spawner.detachCoin) spawner.detachCoin(coinObj || el);
               if (spawner && spawner.recycleCoin) spawner.recycleCoin(el);
               else el.remove();
           }
      }

      const base = el ? resolveCoinBase(el) : BASE_COIN_VALUE;
      const spawnLevelStr = coinObj?.mutationLevel ?? (el?.dataset?.mutationLevel || null);
      const valMult = (coinObj && coinObj.valueMultiplier && coinObj.valueMultiplier > 1) ? coinObj.valueMultiplier : 1;
      
      const baseKey = (base && typeof base.toString === 'function') ? base.toString() : '1';
      const groupKey = `${baseKey}|v${valMult}|m${spawnLevelStr}`;
      if (!coinGroups[groupKey]) {
          coinGroups[groupKey] = { count: 0, base, spawnLevelStr, valMult };
      }
      coinGroups[groupKey].count++;
    }

    if (collectedCount === 0) return;

    // Process grouped gains to avoid massive BigNum overhead
    for (const key in coinGroups) {
      const g = coinGroups[key];
      let inc = applyCoinMultiplier(g.base);
      let xpInc = cloneBn(XP_PER_COIN);
      let mpInc = BigNum.fromInt(1);

      if (g.valMult > 1) {
          try { inc = inc.mulDecimalFloor(g.valMult); } catch {}
          try { xpInc = xpInc.mulDecimalFloor(g.valMult); } catch {}
          try { mpInc = mpInc.mulDecimalFloor(g.valMult); } catch {}
      }

      const mutationMultiplier = computeMutationMultiplier(g.spawnLevelStr);
      if (mutationMultiplier) {
        try { inc = inc.mulBigNumInteger(mutationMultiplier); } catch {}
        try { xpInc = xpInc.mulBigNumInteger(mutationMultiplier); } catch {}
      }

      if (g.count > 1) {
          try { 
              const groupCountBn = BigNum.fromInt(g.count);
              inc = inc.mulBigNumInteger(groupCountBn); 
              xpInc = xpInc.mulBigNumInteger(groupCountBn);
              mpInc = mpInc.mulBigNumInteger(groupCountBn);
          } catch {}
      }

      if (!coinsLocked) {
         totalCoin = mergeGain(totalCoin, inc);
      }
      if (xpEnabled) {
         totalXp = mergeGain(totalXp, xpInc);
      }
      if (mutEnabled) {
         totalMp = mergeGain(totalMp, mpInc);
      }
    }

    if (typeof window !== 'undefined' && typeof window.currentArea !== 'undefined' && window.currentArea === 1) { // 1 is AREAS.STARTER_COVE
        window.coinsCollected += collectedCount;
        const slot = getActiveSlot();
        if (slot != null) {
            try {
                localStorage.setItem(`ccc:coinsCollected:${slot}`, String(window.coinsCollected));
            } catch {}
        }
    }
    
    if (typeof window !== 'undefined') {
        window.globalCoinsCollected += collectedCount;
        try {
            localStorage.setItem('ccc:globalCoinsCollected', String(window.globalCoinsCollected));
        } catch {}
    }

    onCoinCollected();

    if (totalCoin && !totalCoin.isZero?.()) {
      try {
        coinsVal = coinsVal?.add ? coinsVal.add(totalCoin) : cloneBn(totalCoin);
      } catch {
        coinsVal = cloneBn(totalCoin);
      }
      queueCoinGain(totalCoin);
      scheduleHudUpdate();
    }
    
    if (totalXp && !totalXp.isZero?.()) {
      queueXpGain(totalXp);
    }
    
    if (totalMp && !totalMp.isZero?.()) {
      queueMutationGain(totalMp);
    }

    const activeSlot = getActiveSlot();
    if (activeSlot != null) {
      const SHOP_UNLOCK_KEY   = `ccc:unlock:shop:${activeSlot}`;
      const SHOP_PROGRESS_KEY = `ccc:unlock:shop:progress:${activeSlot}`;
      if (localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
        const current = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10);
        const next = current + collectedCount;
        localStorage.setItem(SHOP_PROGRESS_KEY, String(next));
        if (next >= 10) {
          try { unlockShop(); } catch {}
          localStorage.setItem(SHOP_UNLOCK_KEY, '1');
        }
      }
    }

    if (needsSecretCheck) {
      checkSecretAchievements();
    }
  }

  function collect(el, opts = {}) {
    collectBatch([{ el, opts }]);
    return true;
  }

  magnetController = createMagnetController({
    playfield: pf,
    itemsLayer: cl,
    itemSelector: coinSelector,
    collectFn: collect,
    collectBatchFn: collectBatch,
    spawner,
  });


  const brushController = initInteractionBrush({
    playfield: pf,
    itemsLayer: cl,
    itemSelector: coinSelector,
    isItemValid: isCoin,
    spawner,
    collectBatch,
    collect,
  });

  cl.addEventListener('pointerdown', brushController.onDelegatedInteract, { passive: true });
  if (!IS_MOBILE) {
    cl.addEventListener('mouseover', brushController.onDelegatedInteract, { passive: true });
  }


  function setMobileVolume(v){
    // Mobile volume handled externally or ignored for now
  }


  const destroy = () => {
    if (brushController) {
      brushController.destroy();
    }
    try {
      cl.removeEventListener('pointerdown', brushController.onDelegatedInteract);
      if (!IS_MOBILE) {
        cl.removeEventListener('mouseover', brushController.onDelegatedInteract);
      }
    } catch {}
    flushPendingGains();

    updateHudFn = () => {};
    if (typeof window !== 'undefined') {

      window.removeEventListener('beforeunload', flushPendingGains);
      window.removeEventListener('currency:multiplier', onCoinMultiplierChange);
      window.removeEventListener('currency:change', onCurrencyChange);
      window.removeEventListener('saveSlot:change', onSaveSlotChange);

    }
    if (typeof mutationUnsub === 'function') {
      try { mutationUnsub(); } catch {}
      mutationUnsub = null;
    }
    removeComboChangeListener(scheduleHudUpdate);
    if (magnetController?.destroy) {
      try { magnetController.destroy(); } catch {}
      magnetController = null;
    }

    try { ['pointerdown','pointermove','pointerup','mousemove'].forEach(evt => pf.replaceWith(pf.cloneNode(true))); } catch {}
  };

  coinPickup = { destroy };

  return {
    get count(){ return coinsVal; },
    set count(v){
      coinsVal = BigNum.fromAny ? BigNum.fromAny(v) : BigNum.fromInt(Number(v) || 0);
      scheduleHudUpdate();
    },
    setMobileVolume,
    destroy,
    collectBatch,
    getMagnetUnitPx: computeMagnetUnitPx,
  };
}
