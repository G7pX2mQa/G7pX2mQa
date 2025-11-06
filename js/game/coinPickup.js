// js/game/coinPickup.js

import { bank, getActiveSlot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { unlockShop } from '../ui/hudButtons.js';
import { addXp, isXpSystemUnlocked } from './xpSystem.js';
import { addMutationPower, isMutationUnlocked } from './mutationSystem.js';

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
  
  pf.style.touchAction = 'none';

  let coins = bank.coins.value;
  const updateHud = () => {
    const formatted = formatNumber(coins);
    if (formatted.includes('<span')) {
      amt.innerHTML = formatted;
    } else {
      amt.textContent = formatted;
    }
  };
  updateHud();

  try {
    if (bank.coins?.mult?.get && bank.coins?.mult?.set) {
      const curr = bank.coins.mult.get(); // BN
      if (curr.toPlainIntegerString() === '1' && COIN_MULTIPLIER && COIN_MULTIPLIER !== '1') {
        bank.coins.mult.set(COIN_MULTIPLIER);
      }
    }
  } catch {}

  window.addEventListener('currency:change', (e) => {
    if (!e?.detail) return;
    if (e.detail.key === 'coins') {
      coins = e.detail.value;
      updateHud();
    }
  });

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

  let inc = bank.coins.mult.applyTo(base);
  let xpInc = XP_PER_COIN;

  const mutStamp = el.__mutBn;
  let mutMultiplier = null;
  if (mutStamp) {
    mutMultiplier = mutStamp.clone?.() ?? mutStamp;
  } else if (el.dataset?.mut) {
    try { mutMultiplier = BigNum.fromAny(el.dataset.mut); } catch {}
  }

  if (mutMultiplier && !mutMultiplier.isZero?.()) {
    inc   = inc.mulBigNumInteger(mutMultiplier);
    xpInc = xpInc.mulBigNumInteger(mutMultiplier);
  }

  try { bank.coins.add(inc); } catch {}
  try { addXp(xpInc); } catch {}
  updateHud();

  if (el.dataset.pearl === '1') {
    try { bank.pearls.add(BigNum.fromInt(1)); } catch {}
    updatePearlHud();
  }

  if (typeof isMutationUnlocked === 'function' && isMutationUnlocked()) {
    try { addMutationPower(BigNum.fromInt(1)); } catch {}
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
    try { mo.disconnect(); } catch {}
    try { ['pointerdown','pointermove','pointerup','mousemove'].forEach(evt => pf.replaceWith(pf.cloneNode(true))); } catch {}
    // We don’t tear down window warm handlers; they’re once:true so harmless.
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
