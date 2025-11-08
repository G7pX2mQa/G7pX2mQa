// js/game/coinPickup.js

import { bank, getActiveSlot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { unlockShop } from '../ui/hudButtons.js';
import { addXp, isXpSystemUnlocked } from './xpSystem.js';
import {
  addMutationPower,
  isMutationUnlocked,
  getMutationState,
  onMutationChange,
} from './mutationSystem.js';
import { bigNumFromLog10 } from './upgrades.js';

const LOG10_2 = Math.log10(2);
const LARGE_DELTA_THRESHOLD = 1_000_000n;

let mutationUnlockedSnapshot = false;
let mutationLevelSnapshot = 0n;
let mutationUnsub = null;

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

function initMutationSnapshot() {
  if (typeof mutationUnsub === 'function') {
    try { mutationUnsub(); } catch {}
  }
  try {
    updateMutationSnapshot(getMutationState());
  } catch {
    mutationUnlockedSnapshot = false;
    mutationLevelSnapshot = 0n;
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
let COIN_MULTIPLIER = '1';

export function setCoinMultiplier(x) {
  COIN_MULTIPLIER = x;
  try {
    if (bank.coins?.mult?.set) {
      bank.coins.mult.set(x);
    }
  } catch {}
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

export function initCoinPickup({
  playfieldSelector   = '.area-cove .playfield',
  coinsLayerSelector  = '.area-cove .coins-layer',
  hudAmountSelector   = '.hud-top .coin-amount',
  coinSelector        = '.coin, [data-coin], .coin-sprite',
  soundSrc            = 'sounds/coin_pickup.mp3',
  storageKey          = 'ccc:coins',
  disableAnimation    = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window),
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
  
  pf.style.touchAction = 'none';

  let coins = bank.coins.value;
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
  const updateHud = () => {
    const formatted = formatNumber(coins);
    if (formatted.includes('<span')) {
      amt.innerHTML = formatted;
    } else {
      amt.textContent = formatted;
    }
  };
  refreshCoinMultiplierCache();
  updateHud();

  const cloneBn = (value) => {
    if (!value) return BigNum.fromInt(0);
    if (typeof value.clone === 'function') {
      try { return value.clone(); } catch {}
    }
    try { return BigNum.fromAny(value); } catch { return BigNum.fromInt(0); }
  };

  const computeMutationRatio = (spawnLevelStr) => {
    if (!mutationUnlockedSnapshot) return null;
    if (!spawnLevelStr) return null;
    let delta;
    try {
      const spawnLevel = BigInt(spawnLevelStr);
      delta = spawnLevel - mutationLevelSnapshot;
    } catch {
      return null;
    }
    if (delta === 0n) return null;
    const absDelta = delta > 0n ? delta : -delta;
    if (absDelta > LARGE_DELTA_THRESHOLD) {
      if (delta > 0n) {
        try { return BigNum.fromAny('Infinity'); }
        catch { return BigNum.fromInt(Number.MAX_SAFE_INTEGER); }
      }
      return BigNum.fromInt(0);
    }
    const deltaNumber = Number(delta);
    if (!Number.isFinite(deltaNumber) || deltaNumber === 0) return null;
    const ratioLog = deltaNumber * LOG10_2;
    if (!Number.isFinite(ratioLog)) {
      if (deltaNumber > 0) {
        try { return BigNum.fromAny('Infinity'); }
        catch { return BigNum.fromInt(Number.MAX_SAFE_INTEGER); }
      }
      return BigNum.fromInt(0);
    }
    try {
      return bigNumFromLog10(ratioLog);
    } catch {
      return deltaNumber > 0 ? BigNum.fromAny('Infinity') : BigNum.fromInt(0);
    }
  };

  let pendingCoinGain = null;
  let pendingXpGain = null;
  let pendingMutGain = null;
  let pendingPearlCount = 0;
  let flushScheduled = false;

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

    if (pendingPearlCount > 0) {
      try { bank.pearls.add(BigNum.fromInt(pendingPearlCount)); } catch {}
      try { updatePearlHud(); } catch {}
      pendingPearlCount = 0;
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

  const queuePearlGain = (count = 1) => {
    pendingPearlCount += count;
    scheduleFlush();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushPendingGains, { passive: true });
  }

  try {
    if (bank.coins?.mult?.get && bank.coins?.mult?.set) {
      const curr = bank.coins.mult.get(); // BN
      if (curr.toPlainIntegerString() === '1' && COIN_MULTIPLIER && COIN_MULTIPLIER !== '1') {
        bank.coins.mult.set(COIN_MULTIPLIER);
      }
    }
  } catch {}

  const onCurrencyChange = (e) => {
    if (!e?.detail) return;
    if (e.detail.key === 'coins') {
      coins = e.detail.value;
      updateHud();
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
  // const MAP_UNLOCK_KEY = `ccc:unlock:map:${slot}`; // (future)

  // (optional) migrate any legacy unsuffixed keys once
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

  // normalize existing progress for this slot
  {
    const p = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || '0', 10);
    localStorage.setItem(SHOP_PROGRESS_KEY, String(p));
    if (p >= 10 && localStorage.getItem(SHOP_UNLOCK_KEY) !== '1') {
      try { unlockShop(); } catch {}
      localStorage.setItem(SHOP_UNLOCK_KEY, '1');
    }
  }

  // ----- Helpers -----
  const IS_MOBILE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);
  const DESKTOP_VOLUME = 0.3;
  const MOBILE_VOLUME  = 0.12;
  const resolvedSrc = new URL(soundSrc, document.baseURI).href;

  // coins test
  const isCoin = (el) => el instanceof HTMLElement && el.dataset.collected !== '1' && el.matches(coinSelector);

  // Make current & future coins receptive to events even if CSS had pointer-events:none
  function ensureInteractive(el){ try { el.style.pointerEvents = 'auto'; } catch {} }
  cl.querySelectorAll(coinSelector).forEach(ensureInteractive);
  const mo = new MutationObserver((recs) => {
    for (const r of recs){
      r.addedNodes.forEach(n => { if (n instanceof HTMLElement && n.matches(coinSelector)) { ensureInteractive(n); bindCoinDirect(n); } });
    }
  });
  mo.observe(cl, { childList: true, subtree: true });

  // ----- Audio (Mobile: WebAudio + fallback) -----
  let ac = null, masterGain = null, buffer = null;
  let webAudioReady = false, webAudioLoading = false, webAudioAttempted = false;
  let queuedPlays = 0;

  let mobileFallback = null;
  function playCoinMobileFallback(){
    if (!mobileFallback){
      mobileFallback = new Audio(resolvedSrc);
      mobileFallback.preload = 'auto';
    }
    // Re-apply the intended volume on every play (guards against drift)
    mobileFallback.muted = false;
    mobileFallback.volume = MOBILE_VOLUME;
    try {
      mobileFallback.currentTime = 0;
      mobileFallback.play();
    } catch {}
  }

  async function initWebAudioOnce(){
    if (webAudioReady || webAudioLoading) return;
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return;

    webAudioLoading = true; webAudioAttempted = true;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = MOBILE_VOLUME;
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
      playCoinMobileFallback();   // respects MOBILE_VOLUME
      return true;
    }

    // Desktop: if this ever happens (unlikely), let WA path return to caller
    if (!webAudioReady || !ac || !buffer || !masterGain) {
      if (!webAudioLoading) initWebAudioOnce();
      return true;
    }

    try {
      const src = ac.createBufferSource();
      src.buffer = buffer;
      try { src.detune = 0; } catch {}

      // Re-assert the correct volume on every play
      masterGain.gain.setValueAtTime(MOBILE_VOLUME, ac.currentTime);

      src.connect(masterGain);
      const t = ac.currentTime + Math.random()*0.006; // avoid phasing when many play
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

  // Warm WebAudio eager on any gesture (window + playfield), capture=true so overlays don’t block
  const warm = () => { if (IS_MOBILE) initWebAudioOnce(); };
  ['pointerdown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, warm, { once: true, passive: true, capture: true });
    pf.addEventListener(evt, warm, { once: true, passive: true, capture: true });
  });

  // ----- Desktop audio pool -----
  let pool = null, pIdx = 0, lastAt = 0;
  if (!IS_MOBILE){
    pool = Array.from({ length: 8 }, () => { const a = new Audio(resolvedSrc); a.preload = 'auto'; a.volume = 0.3; return a; });
  }
  function playCoinHtmlAudio(){
    const now = performance.now(); if ((now - lastAt) < 40) return; lastAt = now;
    const a = pool[pIdx++ % pool.length];
    try { a.currentTime = 0; a.play(); } catch {}
  }

  // ----- Collecting -----
  function animateAndRemove(el){
    if (disableAnimation) { el.remove(); return; }
    const cs = getComputedStyle(el);
    const start = cs.transform && cs.transform !== 'none' ? cs.transform : 'translate3d(0,0,0)';
    el.style.setProperty('--ccc-start', start);
    el.classList.add('coin--collected');
    const done = () => { el.removeEventListener('animationend', done); el.remove(); };
    el.addEventListener('animationend', done);
    setTimeout(done, 600);
  }

function collect(el) {
  if (!isCoin(el)) return false;
  el.dataset.collected = '1';

  playSound();
  animateAndRemove(el);

  const base = resolveCoinBase(el);

  let inc = applyCoinMultiplier(base);
  let xpInc = cloneBn(XP_PER_COIN);

  const spawnLevelStr = el.dataset.mutationLevel || null;
  const mutationRatio = computeMutationRatio(spawnLevelStr);
  if (mutationRatio) {
    try { inc = inc.mulBigNumInteger(mutationRatio); } catch {}
    try { xpInc = xpInc.mulBigNumInteger(mutationRatio); } catch {}
  }

  const incIsZero = typeof inc?.isZero === 'function' ? inc.isZero() : false;
  if (!incIsZero) {
    try {
      coins = coins?.add ? coins.add(inc) : cloneBn(inc);
    } catch {
      coins = cloneBn(inc);
    }
    updateHud();
    queueCoinGain(inc);
  } else {
    updateHud();
  }

  const xpEnabled = typeof isXpSystemUnlocked === 'function' ? isXpSystemUnlocked() : true;
  const xpIsZero = typeof xpInc?.isZero === 'function' ? xpInc.isZero() : false;
  if (xpEnabled && !xpIsZero) {
    queueXpGain(xpInc);
  }

  if (el.dataset.pearl === '1') {
    queuePearlGain(1);
  }

  if (typeof isMutationUnlocked === 'function' && isMutationUnlocked()) {
    queueMutationGain(BigNum.fromInt(1));
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

  // direct coin events as a safety net (helps if elementsFromPoint misses due to CSS)
  function bindCoinDirect(coin){
    coin.addEventListener('pointerdown', (e) => { collect(coin); }, { passive: true });
    coin.addEventListener('mouseenter', () => { if (!IS_MOBILE) collect(coin); }, { passive: true });
  }
  cl.querySelectorAll(coinSelector).forEach(bindCoinDirect);

  // Brush sweep — checks several offsets so you can “graze” coins while swiping
  const BRUSH_R = 18; // px
  const OFF = [[0,0],[BRUSH_R,0],[-BRUSH_R,0],[0,BRUSH_R],[0,-BRUSH_R]];
  function brushAt(x,y){
    // Primary: use hit-test stack
    for (let k=0;k<OFF.length;k++){
      const px = x + OFF[k][0], py = y + OFF[k][1];
      const stack = document.elementsFromPoint(px, py);
      for (let i=0;i<stack.length;i++){
        const el = stack[i];
        if (isCoin(el)) { collect(el); }
      }
    }
  }

  // Schedule brush per frame for performance
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

  // Touch / pen
  pf.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });
  pf.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });
  pf.addEventListener('pointerup',   (e) => { if (e.pointerType !== 'mouse') scheduleBrush(e.clientX, e.clientY); }, { passive: true });

  // Desktop mouse hover sweep (lightly throttled by rAF above)
  pf.addEventListener('mousemove', (e) => { scheduleBrush(e.clientX, e.clientY); }, { passive: true });

  // Public API + cleanup
  function setMobileVolume(v){
    const vol = Math.max(0, Math.min(1, Number(v) || 0));
    if (masterGain && ac) masterGain.gain.setValueAtTime(vol, ac.currentTime);
    if (mobileFallback) mobileFallback.volume = vol;
  }

  const destroy = () => {
    flushPendingGains();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', flushPendingGains);
      window.removeEventListener('currency:multiplier', onCoinMultiplierChange);
      window.removeEventListener('currency:change', onCurrencyChange);
    }
    if (typeof mutationUnsub === 'function') {
      try { mutationUnsub(); } catch {}
      mutationUnsub = null;
    }
    try { mo.disconnect(); } catch {}
    try { ['pointerdown','pointermove','pointerup','mousemove'].forEach(evt => pf.replaceWith(pf.cloneNode(true))); } catch {}
  };

  coinPickup = { destroy };

  return {
    get count(){ return coins; },
    set count(v){
      coins = BigNum.fromAny ? BigNum.fromAny(v) : BigNum.fromInt(Number(v) || 0);
      updateHud();
      // Note: saving is handled via bank.set inside bank.coins.add in your storage layer
    },
    setMobileVolume,
    destroy,
  };
}
