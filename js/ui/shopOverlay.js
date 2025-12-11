// js/ui/shopOverlay.js

import { bank, getActiveSlot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { IS_MOBILE } from '../main.js';
import { openMerchant,
    ensureMerchantOverlay,
    primeTypingSfx,
    unlockMerchantTabs,
    hasMetMerchant,
    MERCHANT_MET_EVENT
} from './merchantTabs/dlgTab.js';
import { takePreloadedAudio } from '../util/audioCache.js';
import {
  AREA_KEYS,
  UPGRADE_TIES,
  getCurrentAreaKey,
  getUpgradesForArea,
  getLevel,
  getLevelNumber,
  getIconUrl,
  formatMultForUi,
  upgradeUiModel,
  buyOne,
  buyMax,
  buyTowards,
  evaluateBulkPurchase,
  getUpgradeLockState,
  evolveUpgrade,
  HM_EVOLUTION_INTERVAL,
} from '../game/upgrades.js';
import {
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../util/ghostTapGuard.js';
import { 
  AUTOMATION_AREA_KEY, 
  AUTOBUY_COIN_UPGRADES_ID,
  AUTOBUY_BOOK_UPGRADES_ID,
  AUTOBUY_GOLD_UPGRADES_ID,
  AUTOBUY_MAGIC_UPGRADES_ID,
  AUTOBUY_WORKSHOP_LEVELS_ID
} from '../game/automationUpgrades.js';

// --- Shared State ---
const ICON_DIR = 'img/';
const BASE_ICON_SRC_BY_COST = {
  coins: 'img/currencies/coin/coin_base.webp',
  books: 'img/currencies/book/book_base.webp',
  gold: 'img/currencies/gold/gold_base.webp',
  magic: 'img/currencies/magic/magic_base.webp',
  gears: 'img/currencies/gear/gear_base.webp',
};
const LOCKED_BASE_ICON_SRC = 'img/misc/locked_base.webp';
const MAXED_BASE_OVERLAY_SRC = 'img/misc/maxed.webp';
const AUTOMATED_OVERLAY_SRC = 'img/misc/green_border.webp';
const CURRENCY_ICON_SRC = {
  coins: 'img/currencies/coin/coin.webp',
  books: 'img/currencies/book/book.webp',
  gold: 'img/currencies/gold/gold.webp',
  magic: 'img/currencies/magic/magic.webp',
  gears: 'img/currencies/gear/gear.webp',
};

const FORGE_UNLOCK_UPGRADE_ID = 7;

const COST_TYPE_TO_AUTO_ID = {
  coins: AUTOBUY_COIN_UPGRADES_ID,
  books: AUTOBUY_BOOK_UPGRADES_ID,
  gold: AUTOBUY_GOLD_UPGRADES_ID,
  magic: AUTOBUY_MAGIC_UPGRADES_ID
};

function isUpgradeAutomated(upgDef) {
    if (!upgDef || !upgDef.costType) return false;
    const autoId = COST_TYPE_TO_AUTO_ID[upgDef.costType];
    if (!autoId) return false;
    
    // Check if player has the automation upgrade
    const autoLevel = getLevelNumber(AUTOMATION_AREA_KEY, autoId);
    if (autoLevel <= 0) return false;
    
    // Check toggle
    const slot = getActiveSlot();
    const slotSuffix = slot != null ? `:${slot}` : '';
    const key = `ccc:autobuy:${upgDef.area}:${upgDef.id}${slotSuffix}`;
    const val = localStorage.getItem(key);
    
    // Default is ON (if not '0')
    return val !== '0';
}

// --- Automation Mappings ---
// Maps standard cost types to the ID of the automation upgrade that unlocks autobuy for them.
const COST_TYPE_TO_AUTOBUY_ID = {
  coins: AUTOBUY_COIN_UPGRADES_ID,
  books: AUTOBUY_BOOK_UPGRADES_ID,
  gold: AUTOBUY_GOLD_UPGRADES_ID,
  magic: AUTOBUY_MAGIC_UPGRADES_ID
};

// Maps an Automation Upgrade ID to the cost type it controls (Master Switch logic).
const MASTER_AUTOBUY_IDS = {
  [AUTOBUY_COIN_UPGRADES_ID]: 'coins',
  [AUTOBUY_BOOK_UPGRADES_ID]: 'books',
  [AUTOBUY_GOLD_UPGRADES_ID]: 'gold',
  [AUTOBUY_MAGIC_UPGRADES_ID]: 'magic'
};


function resolveUpgradeId(upgLike) {
  if (!upgLike) return null;
  const rawId = typeof upgLike.id !== 'undefined' ? upgLike.id : upgLike;
  if (typeof rawId === 'number') {
    return Number.isFinite(rawId) ? Math.trunc(rawId) : null;
  }
  if (typeof rawId === 'string') {
    const parsed = Number.parseInt(rawId.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isForgeUnlockUpgrade(upgLike, mode) {
  return mode === 'standard' && resolveUpgradeId(upgLike) === FORGE_UNLOCK_UPGRADE_ID;
}

function getShopUiData(areaKey) {
    const defs = getUpgradesForArea(areaKey);
    const upgrades = {};
    for (const def of defs) {
        const lvlBn = getLevel(areaKey, def.id);
        const lvlNum = getLevelNumber(areaKey, def.id);
        const lockState = getUpgradeLockState(areaKey, def.id);
        const icon = lockState.iconOverride ?? getIconUrl(def);
        const title = lockState.titleOverride ?? def.title;
        const desc = lockState.descOverride ?? def.desc;
        const locked = !!lockState.locked;
        const hmReady = (def.upgType === 'HM')
            ? !!upgradeUiModel(areaKey, def.id)?.hmReadyToEvolve
            : false;
        upgrades[def.id] = {
            id: def.id,
            icon,
            title,
            desc,
            level: lvlBn,
            levelNumeric: lvlNum,
            area: def.area,
            meta: def,
            locked,
            lockState,
            useLockedBase: !!lockState.useLockedBase || locked,
            baseIconOverride: def.baseIconOverride || lockState.baseIconOverride || null,
            hmReady,
        };
    }
    return upgrades;
}

const SHOP_ADAPTERS = {
    standard: {
        title: 'Shop',
        delveButtonVisible: true,
        getUiData: () => getShopUiData(getCurrentAreaKey()),
        getUiModel: (id) => upgradeUiModel(getCurrentAreaKey(), id),
        buyOne: (id) => buyOne(getCurrentAreaKey(), id),
        buyMax: (id) => buyMax(getCurrentAreaKey(), id),
        buyNext: (id, amount) => buyTowards(getCurrentAreaKey(), id, amount),
        getLockState: (id) => getUpgradeLockState(getCurrentAreaKey(), id),
        evolve: (id) => evolveUpgrade(getCurrentAreaKey(), id),
        events: ['ccc:upgrades:changed', 'currency:change', 'xp:change', 'xp:unlock', MERCHANT_MET_EVENT]
    },
    automation: {
        title: 'Automation Shop',
        delveButtonVisible: false,
        getUiData: () => getShopUiData(AUTOMATION_AREA_KEY),
        getUiModel: (id) => upgradeUiModel(AUTOMATION_AREA_KEY, id),
        buyOne: (id) => buyOne(AUTOMATION_AREA_KEY, id),
        buyMax: (id) => buyMax(AUTOMATION_AREA_KEY, id),
        buyNext: (id, amount) => buyTowards(AUTOMATION_AREA_KEY, id, amount),
        getLockState: (id) => getUpgradeLockState(AUTOMATION_AREA_KEY, id),
        evolve: () => ({ evolved: false }),
        events: ['ccc:upgrades:changed', 'currency:change']
    }
};

function getAdapter(mode) {
    return SHOP_ADAPTERS[mode] || SHOP_ADAPTERS.standard;
}

if (typeof window !== 'undefined') {
  window.addEventListener('debug:change', (e) => {
    const activeSlot = typeof getActiveSlot === 'function' ? getActiveSlot() : null;
    const targetSlot = e?.detail?.slot ?? activeSlot;
    if (activeSlot != null && targetSlot != null && activeSlot !== targetSlot) return;
    updateShopOverlay(true);
  });
}

// --- Utils ---
export function blockInteraction(ms = 140) {
  if (!IS_MOBILE) return;

  let shield = document.getElementById('ccc-tap-shield');
  if (!shield) {
    shield = document.createElement('div');
    shield.id = 'ccc-tap-shield';
    Object.assign(shield.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647',
      pointerEvents: 'auto', background: 'transparent'
    });
    const eat = (e) => { e.stopPropagation(); e.preventDefault(); };
    ['pointerdown','pointerup','click','touchstart','touchend','mousedown','mouseup']
      .forEach(ev => shield.addEventListener(ev, eat, { capture: true, passive: false }));
  }
  document.body.appendChild(shield);
  clearTimeout(shield.__t);
  shield.__t = setTimeout(() => shield.remove(), ms);
}

function stripTags(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '');
}

// --- Audio ---
const PURCHASE_SFX_SRC = 'sounds/purchase_upg.ogg';
const EVOLVE_SFX_SRC = 'sounds/evolve_upg.ogg';
const MOBILE_PURCHASE_VOLUME = 0.12;
const DESKTOP_PURCHASE_VOLUME = 0.3;

function createSfxPlayer({ src, mobileVolume, desktopVolume }) {
  let base = null;
  // ... (Simplified re-implementation or kept minimal for brevity, 
  // but let's reuse the existing comprehensive logic for robustness)
  
  let ac = null;
  let gain = null;
  let buffer = null;
  let bufferPromise = null;
  let bufferPromiseHandled = false;
  let pendingPlays = 0;

  function ensureBase() {
    if (base) return base;
    const preloaded = takePreloadedAudio(src);
    const el = preloaded || new Audio(src);
    el.preload = 'auto';
    el.playsInline = true;
    el.crossOrigin = 'anonymous';
    el.load?.();
    base = el;
    return base;
  }

  function ensureWebAudio() {
    if (!IS_MOBILE) return false;
    const baseAudio = ensureBase();
    if (!baseAudio) return false;
    if (!('AudioContext' in window || 'webkitAudioContext' in window)) return false;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ac = null; return false; }
    if (!ac) return false;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (_) {} }
    if (!gain) { gain = ac.createGain(); gain.connect(ac.destination); }
    return true;
  }

  function ensureBuffer() {
    if (!ac) return null;
    if (buffer) return buffer;
    if (bufferPromise) return null;
    const srcUrl = ensureBase()?.currentSrc || src;
    try {
      bufferPromise = fetch(srcUrl)
        .then((resp) => (resp.ok ? resp.arrayBuffer() : Promise.reject(resp.status)))
        .then((buf) => new Promise((resolve, reject) => {
          let settled = false;
          ac.decodeAudioData(buf, (decoded) => { if (!settled) { settled = true; resolve(decoded); } }, (err) => { if (!settled) { settled = true; reject(err); } });
        }))
        .then((decoded) => { buffer = decoded; bufferPromise = null; return decoded; })
        .catch(() => { bufferPromise = null; return null; });
    } catch (_) { bufferPromise = null; }
    return buffer || null;
  }

  function playMobileFallback() {
    const baseAudio = ensureBase();
    if (!baseAudio) return;
    baseAudio.muted = false;
    baseAudio.volume = mobileVolume;
    try { baseAudio.currentTime = 0; } catch (_) {}
    baseAudio.play().catch(() => {});
  }

  function playMobileWebAudio() {
    if (!ensureWebAudio()) return false;
    if (!ac || !gain) return false;

    const playBuffer = (decoded) => {
      if (!decoded) return false;
      try {
        const node = ac.createBufferSource();
        node.buffer = decoded;
        node.connect(gain);
        try { gain.gain.setValueAtTime(mobileVolume, ac.currentTime); } catch (_) { gain.gain.value = mobileVolume; }
        node.start();
        return true;
      } catch (_) { return false; }
    };

    if (buffer) return playBuffer(buffer);
    pendingPlays += 1;
    if (!bufferPromise) ensureBuffer();
    
    if (bufferPromise && !bufferPromiseHandled) {
      bufferPromiseHandled = true;
      bufferPromise.then((decoded) => {
        const plays = Math.max(1, pendingPlays);
        pendingPlays = 0;
        if (!decoded) { for (let i = 0; i < plays; i++) playMobileFallback(); return; }
        for (let i = 0; i < plays; i++) { if (!playBuffer(decoded)) { playMobileFallback(); break; } }
      });
    }
    return true;
  }

  return {
    play() {
      try {
        if (IS_MOBILE) {
          if (playMobileWebAudio()) return;
          playMobileFallback();
          return;
        }
        const baseAudio = ensureBase();
        if (baseAudio) {
           baseAudio.volume = desktopVolume;
           const a = baseAudio.cloneNode();
           a.volume = desktopVolume;
           a.play().catch(() => {});
        }
      } catch {}
    },
  };
}

const purchaseSfx = createSfxPlayer({ src: PURCHASE_SFX_SRC, mobileVolume: MOBILE_PURCHASE_VOLUME, desktopVolume: DESKTOP_PURCHASE_VOLUME });
const evolveSfx = createSfxPlayer({ src: EVOLVE_SFX_SRC, mobileVolume: MOBILE_PURCHASE_VOLUME * 2, desktopVolume: DESKTOP_PURCHASE_VOLUME * 2 });

export function playPurchaseSfx() { purchaseSfx.play(); }
function playEvolveSfx() { evolveSfx.play(); }

function currencyIconHTML(type) {
  const src = CURRENCY_ICON_SRC[type] || CURRENCY_ICON_SRC.coins;
  return `<img alt="" src="${src}" class="currency-ico">`;
}

// 1×1 transparent WebP
const TRANSPARENT_PX = "data:image/webp;base64,UklGRhIAAABXRUJQVlA4IBgAAAAwAQCdASoIAAIAAAAcJaQAA3AA";

// --- Custom Scrollbar ---
export function ensureCustomScrollbar(overlayEl, sheetEl, scrollerSelector = '.shop-scroller') {
  const scroller = overlayEl?.querySelector(scrollerSelector);
  if (!scroller || scroller.__customScroll) return;

  const bar = document.createElement('div');
  bar.className = 'shop-scrollbar';
  const thumb = document.createElement('div');
  thumb.className = 'shop-scrollbar__thumb';
  bar.appendChild(thumb);
  sheetEl.appendChild(bar);

  scroller.__customScroll = { bar, thumb };

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const FADE_SCROLL_MS = 150;
  const FADE_DRAG_MS = 120;
  const supportsScrollEnd = 'onscrollend' in window;

  const syncScrollShadow = () => {
    const hasShadow = (scroller.scrollTop || 0) > 0;
    sheetEl?.classList.toggle('has-scroll-shadow', hasShadow);
  };

  const updateBounds = () => {
    if (!scroller.isConnected || !sheetEl.isConnected) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sheetRect = sheetEl.getBoundingClientRect();
    const top = Math.max(0, scrollerRect.top - sheetRect.top);
    const bottom = Math.max(0, sheetRect.bottom - scrollerRect.bottom);
    bar.style.top = top + 'px';
    bar.style.bottom = bottom + 'px';
  };

  const updateThumb = () => {
    const { scrollHeight, clientHeight, scrollTop } = scroller;
    const barH = bar.clientHeight;
    const visibleRatio = clientHeight / Math.max(1, scrollHeight);
    const thumbH = Math.max(28, Math.round(barH * visibleRatio));
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const range = Math.max(0, barH - thumbH);
    const y = Math.round((scrollTop / maxScroll) * range);
    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translateY(${y}px)`;
    bar.style.display = (scrollHeight <= clientHeight + 1) ? 'none' : '';
  };

  const updateAll = () => { updateBounds(); updateThumb(); syncScrollShadow(); };
  const showBar = () => { if (!isTouch) return; sheetEl.classList.add('is-scrolling'); clearTimeout(scroller.__fadeTimer); };
  const scheduleHide = (delay) => { if (!isTouch) return; clearTimeout(scroller.__fadeTimer); scroller.__fadeTimer = setTimeout(() => { sheetEl.classList.remove('is-scrolling'); }, delay); };
  const onScroll = () => { updateThumb(); syncScrollShadow(); if (isTouch) showBar(); if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS); };
  const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) scroller.addEventListener('scrollend', onScrollEnd, { passive: true });

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);
  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll);

  // Drag logic omitted for brevity as it's purely UI polish, but we can keep it if space permits.
  // ...Keeping logic...
  let dragging = false;
  let dragStartY = 0;
  let startScrollTop = 0;
  const startDrag = (e) => { dragging = true; dragStartY = e.clientY; startScrollTop = scroller.scrollTop; thumb.classList.add('dragging'); showBar(); try { thumb.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); };
  const onDragMove = (e) => { if (!dragging) return; const range = Math.max(1, bar.clientHeight - thumb.clientHeight); const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight); const deltaY = e.clientY - dragStartY; scroller.scrollTop = startScrollTop + (deltaY / range) * scrollMax; };
  const endDrag = (e) => { if (!dragging) return; dragging = false; thumb.classList.remove('dragging'); scheduleHide(FADE_DRAG_MS); try { thumb.releasePointerCapture(e.pointerId); } catch {} };
  thumb.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', onDragMove, { passive: true });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  
  bar.addEventListener('pointerdown', (e) => { if (e.target === thumb) return; const rect = bar.getBoundingClientRect(); const clickY = e.clientY - rect.top; const thH = thumb.clientHeight; const range = Math.max(0, bar.clientHeight - thH); const targetY = Math.max(0, Math.min(clickY - thH / 2, range)); const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight); scroller.scrollTop = (targetY / Math.max(1, range)) * scrollMax; showBar(); scheduleHide(FADE_SCROLL_MS); });
}

// --- Logic Helpers ---
function levelsRemainingToCap(upg, currentLevelBn, currentLevelNumber) {
  if (!upg) return BigNum.fromInt(0);
  const capBn = upg.lvlCapBn?.clone?.() ?? (Number.isFinite(upg.lvlCap) ? BigNum.fromAny(upg.lvlCap) : null);
  if (!capBn) return BigNum.fromInt(0);
  if (capBn.isInfinite?.()) return BigNum.fromAny('Infinity');

  let lvlBn;
  try { lvlBn = currentLevelBn instanceof BigNum ? currentLevelBn : BigNum.fromAny(currentLevelBn ?? currentLevelNumber ?? 0); } 
  catch { const fallback = Math.max(0, Math.floor(Number(currentLevelNumber) || 0)); lvlBn = BigNum.fromInt(fallback); }
  
  if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);
  try {
    const capPlain = capBn.toPlainIntegerString?.();
    const lvlPlain = lvlBn.toPlainIntegerString?.();
    if (capPlain === 'Infinity') return BigNum.fromAny('Infinity');
    if (capPlain && lvlPlain && capPlain !== 'Infinity' && lvlPlain !== 'Infinity') {
      const delta = BigInt(capPlain) - BigInt(lvlPlain);
      if (delta > 0n) return BigNum.fromAny(delta.toString());
      return BigNum.fromInt(0);
    }
  } catch {}
  
  const capNumber = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;
  if (!Number.isFinite(capNumber)) return BigNum.fromAny('Infinity');
  const lvlNumber = Math.max(0, Math.floor(Number(currentLevelNumber) || 0));
  const room = Math.max(0, capNumber - lvlNumber);
  return BigNum.fromInt(room);
}

function computeAffordableLevels(upg, currentLevelNumeric, currentLevelBn) {
  // ... (Identical logic to original file, omitted for brevity but assumed present. 
  // Since I am overwriting the file, I must include it.)
  let lvlBn;
  try { lvlBn = currentLevelBn instanceof BigNum ? currentLevelBn : BigNum.fromAny(currentLevelBn ?? currentLevelNumeric ?? 0); }
  catch { const fallback = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0)); lvlBn = BigNum.fromInt(fallback); }
  if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);

  const lvl = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));
  const cap = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;

  const walletEntry = bank[upg.costType];
  const walletValue = walletEntry?.value;
  const walletBn = walletValue instanceof BigNum ? walletValue : BigNum.fromAny(walletValue ?? 0);
  if (walletBn.isZero?.()) return BigNum.fromInt(0);

  if (walletBn.isInfinite?.()) {
    const isHmType = upg?.upgType === 'HM';
    const maxed = Number.isFinite(cap) && lvl >= cap;
    if ((isHmType && !maxed) || !Number.isFinite(cap)) return BigNum.fromAny('Infinity');
    return levelsRemainingToCap(upg, lvlBn, currentLevelNumeric);
  }
  if (Number.isFinite(cap) && lvl >= cap) return BigNum.fromInt(0);

  try {
    if (typeof upg.costAtLevel === 'function') {
        const c0 = BigNum.fromAny(upg.costAtLevel(lvl));
        const c1 = BigNum.fromAny(upg.costAtLevel(lvl + 1)); // Fix: levelBigNumToNumber not in scope? just use lvl+1
        const farProbeLevel = Math.min(Number.isFinite(cap) ? cap : lvl + 32, lvl + 32);
        const cFar = BigNum.fromAny(upg.costAtLevel(farProbeLevel));
        const isTrulyFlat = c0.cmp(c1) === 0 && c0.cmp(cFar) === 0;

        if (isTrulyFlat) {
          const remainingBn = levelsRemainingToCap(upg, lvlBn, lvl);
          const room = Number.isFinite(upg.lvlCap) ? Math.min(Math.max(0, Math.floor(Number(remainingBn.toString()))), Number.MAX_SAFE_INTEGER - 2) : Number.MAX_SAFE_INTEGER;
          let lo = 0, hi = Math.max(0, room);
          while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            const midBn = BigNum.fromInt(mid);
            const total = typeof c0.mulBigNumInteger === 'function' ? c0.mulBigNumInteger(midBn) : BigNum.fromAny(c0 ?? 0).mulBigNumInteger(midBn);
            if (total.cmp(walletBn) <= 0) lo = mid; else hi = mid - 1;
          }
          return BigNum.fromInt(lo);
        }
    }
  } catch {}
  
  const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : undefined;
  const { count } = evaluateBulkPurchase(upg, lvlBn, walletBn, room, { fastOnly: true });
  return count ?? BigNum.fromInt(0);
}

// --- Shop Instance Class ---

class ShopInstance {
    constructor(mode) {
        this.mode = mode;
        this.overlayEl = null;
        this.sheetEl = null;
        this.isOpen = false;
        this.eventsBound = false;
        this.closeTimer = null;
        this.postOpenPointer = false;
        this.upgrades = {};
        this.delveBtnEl = null;
        this.updateHandler = this.update.bind(this);
    }
    
    get adapter() {
        return getAdapter(this.mode);
    }
    
    get delveButtonVisible() {
        return this.adapter.delveButtonVisible;
    }
    
    updateDelveGlow() {
        if (!this.delveBtnEl || this.mode !== 'standard') return;
        const met = hasMetMerchant();
        this.delveBtnEl.classList.toggle('is-new', !met);
    }

    buildUpgradesData() {
        this.upgrades = this.adapter.getUiData();
    }
    
    render() {
        const grid = this.overlayEl?.querySelector('.shop-grid');
        if (!grid) return;
        
        const seenIds = new Set();
        
        for (const key in this.upgrades) {
            const upg = this.upgrades[key];
            seenIds.add(String(upg.id));
            
            let btn = grid.querySelector(`.shop-upgrade[data-upg-id="${upg.id}"]`);
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'shop-upgrade';
                btn.setAttribute('data-upgid', upg.id);
                btn.type = 'button';
                btn.setAttribute('role', 'gridcell');
                btn.dataset.upgId = String(upg.id);
                
                const tile = document.createElement('div');
                tile.className = 'shop-tile';
                const baseImg = document.createElement('img');
                baseImg.className = 'base';
                baseImg.alt = '';
                const iconImg = document.createElement('img');
                iconImg.className = 'icon';
                iconImg.alt = '';
                iconImg.addEventListener('error', () => { iconImg.src = TRANSPARENT_PX; });
                
                tile.appendChild(baseImg);
                tile.appendChild(iconImg);
                btn.appendChild(tile);
                grid.appendChild(btn);
                
                // Listeners
                btn.addEventListener('click', (event) => {
                    const el = event.currentTarget;
                    if (el.disabled || el.dataset.lockedPlain === '1') {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return;
                    }
                    if (shouldSkipGhostTap(el)) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return;
                    }
                    if (el.upgMeta) openUpgradeOverlay(el.upgMeta, this.mode);
                });
                
                btn.addEventListener('contextmenu', (e) => {
                    if (IS_MOBILE) return;
                    const el = e.currentTarget;
                    if (el.dataset.locked === '1') return;
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (!el.upgMeta) return;
					
                    const model = this.adapter.getUiModel(el.upgMeta.id);
                    if (model?.hmReadyToEvolve) {
                        const { evolved } = this.adapter.evolve(el.upgMeta.id);
                        if (evolved) {
                            playEvolveSfx();
                            this.update();
                        }
                        return;
                    }
					
                    const { bought } = this.adapter.buyMax(el.upgMeta.id);
                    const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
                    
                    if (!boughtBn.isZero?.()) {
                        playPurchaseSfx();
                        if (isForgeUnlockUpgrade(el.upgMeta, this.mode)) {
                            try { unlockMerchantTabs(['reset']); } catch {}
                        }
                        this.update();
                    }
                });
            }
            
            // Update Meta
            btn.upgMeta = upg.meta;
            
            // Logic derived from original renderShopGrid...
            const locked = !!upg.locked;
            const lockIcon = upg.lockState?.iconOverride;
            const hasMysteriousIcon = typeof lockIcon === 'string' && lockIcon.includes('mysterious');
            const isMysterious = locked && (upg.lockState?.hidden || hasMysteriousIcon);
            const isPlainLocked = locked && !isMysterious;

            btn.classList.toggle('is-locked', locked);
            btn.classList.toggle('is-locked-plain', isPlainLocked);
            btn.disabled = isPlainLocked;
            if (isPlainLocked) {
              btn.setAttribute('aria-disabled', 'true');
              btn.setAttribute('tabindex', '-1');
            } else {
              btn.removeAttribute('aria-disabled');
              btn.removeAttribute('tabindex');
            }
            btn.dataset.locked = locked ? '1' : '0';
            btn.dataset.lockedPlain = isPlainLocked ? '1' : '0';
            btn.dataset.mysterious = isMysterious ? '1' : '0';

            const isHM = upg.meta?.upgType === 'HM';
            const evolveReady = isHM && upg.hmReady;
            btn.classList.toggle('hm-evolve-ready', evolveReady);
            
            const canPlusBn = locked ? BigNum.fromInt(0) : computeAffordableLevels(upg.meta, upg.levelNumeric, upg.level);
            const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
            const levelHtml = formatNumber(upg.level);
            const levelPlain = stripTags(levelHtml);
            const plusHtml = formatNumber(plusBn);
            const plusPlain = stripTags(plusHtml);
            const hasPlus = !plusBn.isZero?.();
            
            const rawCap = Number.isFinite(upg.lvlCap) ? upg.lvlCap : (Number.isFinite(upg.meta?.lvlCap) ? upg.meta.lvlCap : Infinity);
            const capNumber = Number.isFinite(rawCap) ? Math.max(0, Math.floor(rawCap)) : Infinity;
            const levelNumber = Number.isFinite(upg.levelNumeric) ? upg.levelNumeric : NaN;
            const capReached = evolveReady ? false : (upg.level?.isInfinite?.() ? true : (Number.isFinite(capNumber) && Number.isFinite(levelNumber) ? levelNumber >= capNumber : false));
            
            const isSingleLevelCap = Number.isFinite(capNumber) && capNumber === 1;
            const isUnlockUpgrade = !!upg.meta?.unlockUpgrade;
            const showUnlockableBadge = !locked && isUnlockUpgrade && !capReached;
            const showUnlockedBadge = !locked && isUnlockUpgrade && !showUnlockableBadge && capReached;

            let badgeHtml, badgePlain, needsTwoLines = false, isTextBadge = false;

            if (locked) {
                badgeHtml = ''; badgePlain = '';
                const reason = isMysterious ? (upg.lockState?.reason || '').trim() : '';
                const ariaLabel = reason ? `${upg.title} (Locked, ${reason})` : `${upg.title} (Locked)`;
                btn.setAttribute('aria-label', ariaLabel);
            } else {
                if (showUnlockableBadge || showUnlockedBadge) {
                    badgeHtml = showUnlockableBadge ? 'Unlockable' : 'Unlocked';
                    badgePlain = badgeHtml;
                    isTextBadge = true;
                } else if (!locked && isSingleLevelCap && !isUnlockUpgrade) {
                    if (capReached) { badgeHtml = 'Owned'; badgePlain = 'Owned'; }
                    else if (hasPlus) { badgeHtml = 'Purchasable'; badgePlain = 'Purchasable'; }
                    else { badgeHtml = 'Not Owned'; badgePlain = 'Not Owned'; }
                    isTextBadge = true;
                } else {
                    const numericLevel = Number.isFinite(upg.levelNumeric) ? upg.levelNumeric : NaN;
                    const plainDigits = String(levelPlain || '').replace(/,/g, '');
                    const isInf = /∞|Infinity/i.test(plainDigits);
                    const over999 = Number.isFinite(numericLevel) ? numericLevel >= 1000 : (isInf || /^\d{4,}$/.test(plainDigits));
                    needsTwoLines = hasPlus && over999;
                    if (needsTwoLines) {
                        badgeHtml = `<span class="badge-lvl">${levelHtml}</span><span class="badge-plus">(+${plusHtml})</span>`;
                        badgePlain = `${levelPlain} (+${plusPlain})`;
                    } else {
                        badgeHtml = hasPlus ? `${levelHtml} (+${plusHtml})` : levelHtml;
                        badgePlain = hasPlus ? `${levelPlain} (+${plusPlain})` : levelPlain;
                    }
                }
                btn.setAttribute('aria-label', `${upg.title}, ${badgePlain}`);
            }
            
            if (locked) btn.title = isMysterious ? 'Hidden Upgrade' : 'Locked Upgrade';
            else if (upg.meta?.unlockUpgrade) btn.title = 'Left-click: Details • Right-click: Unlock';
            else btn.title = 'Left-click: Details • Right-click: Buy Max';
            
            // DOM Structure Update
            const tileEl = btn.firstElementChild;
            const baseImgEl = tileEl.querySelector('.base');
            const iconImgEl = tileEl.querySelector('.icon');
            
            const costType = upg.meta?.costType || 'coins';
            const useLockedBase = upg.useLockedBase || locked;
            const baseSrc = useLockedBase ? LOCKED_BASE_ICON_SRC : (upg.baseIconOverride || BASE_ICON_SRC_BY_COST[costType] || BASE_ICON_SRC_BY_COST.coins);
            if (baseImgEl.src !== baseSrc) baseImgEl.src = baseSrc;
            
            const iconSrc = upg.icon || TRANSPARENT_PX;
            if (iconImgEl._lastSrc !== iconSrc) { iconImgEl.src = iconSrc; iconImgEl._lastSrc = iconSrc; }
            
            let maxedOverlay = tileEl.querySelector('.maxed-overlay');
            const isAutomated = !locked && isUpgradeAutomated(upg.meta);
            const showMaxed = !locked && capReached;
            const showAutomated = !locked && !capReached && !evolveReady && isAutomated;

            if (showMaxed || showAutomated) {
                if (!maxedOverlay) {
                    maxedOverlay = document.createElement('img');
                    maxedOverlay.className = 'maxed-overlay';
                    maxedOverlay.alt = '';
                    tileEl.insertBefore(maxedOverlay, iconImgEl);
                }
				const targetSrc = showMaxed ? MAXED_BASE_OVERLAY_SRC : AUTOMATED_OVERLAY_SRC;
                if (maxedOverlay.src !== targetSrc) maxedOverlay.src = targetSrc;
            } else if (maxedOverlay) maxedOverlay.remove();
            
            let badge = tileEl.querySelector('.level-badge');
            if (!locked) {
                if (!badge) { badge = document.createElement('span'); badge.className = 'level-badge'; tileEl.appendChild(badge); }
                badge.className = 'level-badge';
                if (isTextBadge) badge.classList.add('text-badge');
                if (needsTwoLines) badge.classList.add('two-line');
                if (hasPlus || showUnlockableBadge) badge.classList.add('can-buy');
                if (capReached) badge.classList.add('is-maxed');
                if (badgeHtml === badgePlain) { if (badge.textContent !== badgeHtml) badge.textContent = badgeHtml; }
                else { if (badge.innerHTML !== badgeHtml) badge.innerHTML = badgeHtml; }
            } else if (badge) badge.remove();
        }
        
        // Cleanup stale
        Array.from(grid.children).forEach(child => {
            if (child.dataset.upgId && !seenIds.has(child.dataset.upgId)) child.remove();
        });
    }

    ensureOverlay() {
        if (this.overlayEl) return;
        
        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'shop-overlay';
        if (this.mode === 'automation') {
            this.overlayEl.classList.add('automation-shop-overlay');
            // Unique ID not strictly required by CSS but useful
            this.overlayEl.id = 'automation-shop-overlay'; 
        } else {
            this.overlayEl.id = 'shop-overlay';
        }
        
        this.sheetEl = document.createElement('div');
        this.sheetEl.className = 'shop-sheet';
        this.sheetEl.setAttribute('role', 'dialog');
        
        const grabber = document.createElement('div');
        grabber.className = 'shop-grabber';
        grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
        
        const content = document.createElement('div');
        content.className = 'shop-content';
        
        const header = document.createElement('header');
        header.className = 'shop-header';
        header.innerHTML = `<div class="shop-title">${this.adapter.title}</div><div class="shop-line" aria-hidden="true"></div>`;
        
        const grid = document.createElement('div');
        grid.className = 'shop-grid';
        if (this.mode === 'standard') grid.id = 'shop-grid'; // backwards compat for ID query
        grid.setAttribute('role', 'grid');
        
        const scroller = document.createElement('div');
        scroller.className = 'shop-scroller';
        scroller.appendChild(grid);
        
        content.append(header, scroller);
        ensureCustomScrollbar(this.overlayEl, this.sheetEl, '.shop-scroller');
        
        const actions = document.createElement('div');
        actions.className = 'shop-actions';
        
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'shop-close';
        closeBtn.textContent = 'Close';
        
        actions.appendChild(closeBtn);
        
        if (this.delveButtonVisible) {
            const delveBtn = document.createElement('button');
            delveBtn.type = 'button';
            delveBtn.className = 'shop-delve';
            delveBtn.textContent = 'Delve';
            delveBtn.addEventListener('click', (e) => {
                if (e && e.isTrusted && shouldSkipGhostTap(delveBtn)) return;
                primeTypingSfx();
                openMerchant();
            });
            this.delveBtnEl = delveBtn;
            this.updateDelveGlow();
            actions.append(delveBtn);
        }
        
        this.sheetEl.append(grabber, content, actions);
        this.overlayEl.appendChild(this.sheetEl);
        document.body.appendChild(this.overlayEl);
        
        // Listeners
        this.overlayEl.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            this.postOpenPointer = true;
        }, { capture: true, passive: true });
        
        this.overlayEl.addEventListener('touchstart', (e) => {
             this.postOpenPointer = true;
        }, { capture: true, passive: true });
        
        this.overlayEl.addEventListener('click', (e) => {
            if (!IS_MOBILE) return;
            if (!this.postOpenPointer) {
                e.preventDefault(); e.stopImmediatePropagation();
                return;
            }
        }, { capture: true });
        
        closeBtn.addEventListener('click', () => {
             if (IS_MOBILE) blockInteraction(80);
             this.close();
        }, { passive: true });
        
        setupDragToClose(grabber, this.sheetEl, () => this.isOpen, () => {
             this.isOpen = false;
             this.closeTimer = setTimeout(() => {
                 this.closeTimer = null;
                 this.close(true);
             }, 150);
        });
        
        this.update(true);
    }
    
    open() {
        this.ensureOverlay();
        
        if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
        
        // Bind events if needed
        if (!this.eventsBound) {
            this.adapter.events.forEach(evt => window.addEventListener(evt, this.updateHandler));
            if (this.mode === 'standard') {
                document.addEventListener('ccc:upgrades:changed', this.updateHandler);
            }
            this.eventsBound = true;
        }
        
        this.update(true);
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.sheetEl.style.transition = 'none';
        this.sheetEl.style.transform = 'translateY(100%)';
        this.overlayEl.style.pointerEvents = 'auto';
        
        void this.sheetEl.offsetHeight;
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.sheetEl.style.transition = '';
                this.sheetEl.style.transform = '';
                this.overlayEl.classList.add('is-open');
                this.postOpenPointer = false;
                
                if (IS_MOBILE) {
                    try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
                }
                
                blockInteraction(10);
                ensureCustomScrollbar(this.overlayEl, this.sheetEl);
                
                const focusable = this.overlayEl.querySelector('.shop-upgrade') || this.overlayEl.querySelector('.shop-grid');
                if (focusable) focusable.focus();
            });
        });
    }
    
    close(force = false) {
        const forceClose = force === true;
        const overlayOpen = this.overlayEl?.classList?.contains('is-open');
        
        if (!forceClose && !this.isOpen && !overlayOpen) {
            if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
            return;
        }
        
        if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
        
        this.isOpen = false;
        if (this.sheetEl) {
            this.sheetEl.style.transition = '';
            this.sheetEl.style.transform = '';
        }
        if (this.overlayEl) {
            this.overlayEl.classList.remove('is-open');
            this.overlayEl.style.pointerEvents = 'none';
        }
        this.postOpenPointer = false;
        
        if (this.eventsBound) {
             this.adapter.events.forEach(evt => window.removeEventListener(evt, this.updateHandler));
             if (this.mode === 'standard') {
                 document.removeEventListener('ccc:upgrades:changed', this.updateHandler);
             }
             this.eventsBound = false;
        }
    }
    
    update(force = false) {
        if (!force && !this.isOpen) return;
        this.buildUpgradesData();
        this.render();
        this.updateDelveGlow();
    }
}

// --- Static Instances ---
const shops = {
    standard: new ShopInstance('standard'),
    automation: new ShopInstance('automation')
};

export function openShop(mode = 'standard') {
    const instance = shops[mode] || shops.standard;
    instance.open();
}

export function closeShop(force = false) {
    // Attempt to close all open shops
    Object.values(shops).forEach(s => s.close(force));
}

export function updateShopOverlay(force = false) {
    // Update all open shops
    Object.values(shops).forEach(s => s.update(force));
}

export function setUpgradeCount() { updateShopOverlay(true); }

export function getUpgrades() { 
    // Return standard upgrades for backward compat? 
    // Or merge? getUpgrades was previously only returning current adapter data.
    // If standard is open, return standard. If automation is open, return automation.
    // If both, prioritizing automation makes sense? 
    // Or standard is "main" upgrades.
    // Let's assume this is mostly for standard shop.
    return shops.standard.upgrades;
}

// --- Upgrade Overlay (Shared) ---
let upgOverlayEl = null;
let upgSheetEl = null;
let upgOpen = false;
let upgOverlayCleanup = null;

function ensureUpgradeOverlay() {
  if (upgOverlayEl) return;
  upgOverlayEl = document.createElement('div');
  upgOverlayEl.className = 'upg-overlay';

  upgSheetEl = document.createElement('div');
  upgSheetEl.className = 'upg-sheet';
  upgSheetEl.setAttribute('role', 'dialog');
  upgSheetEl.setAttribute('aria-modal', 'false');
  upgSheetEl.setAttribute('aria-label', 'Upgrade');

  const grab = document.createElement('div');
  grab.className = 'upg-grabber';
  grab.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const header = document.createElement('header');
  header.className = 'upg-header';
  const content = document.createElement('div');
  content.className = 'upg-content';
  const actions = document.createElement('div');
  actions.className = 'upg-actions';

  upgSheetEl.append(grab, header, content, actions);
  upgOverlayEl.appendChild(upgSheetEl);
  document.body.appendChild(upgOverlayEl);

  upgOverlayEl.addEventListener('pointerdown', (e) => {
    if (!IS_MOBILE) return;
    if (e.pointerType === 'mouse') return;
    if (e.target === upgOverlayEl) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  upgOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (e.target === upgOverlayEl) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  let drag = null;
  function onDragStart(e) {
    if (!upgOpen) return;
    const y = typeof e.clientY === 'number' ? e.clientY : (e.touches?.[0]?.clientY || 0);
    drag = { startY: y, lastY: y, moved: 0 };
    upgSheetEl.style.transition = 'none';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(e) {
    if (!drag) return;
    const y = e.clientY;
    if (typeof y !== 'number') return;
    const dy = Math.max(0, y - drag.startY);
    drag.lastY = y;
    drag.moved = dy;
    upgSheetEl.style.transform = `translateY(${dy}px)`;
  }
  function onDragEnd(e) {
    if (!drag) return;
    const shouldClose = drag.moved > 140;
    upgSheetEl.style.transition = 'transform 160ms ease';
    upgSheetEl.style.transform = shouldClose ? 'translateY(100%)' : 'translateY(0)';
    if (shouldClose) {
      if (IS_MOBILE && (!e || e.pointerType !== 'mouse')) try { blockInteraction(120); } catch {}
      setTimeout(closeUpgradeMenu, 160);
    }
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
  }
  grab.addEventListener('pointerdown', onDragStart, { passive: true });
}

function closeUpgradeMenu() {
  if (IS_MOBILE) try { blockInteraction(160); } catch {}
  if (typeof upgOverlayCleanup === 'function') { const fn = upgOverlayCleanup; upgOverlayCleanup = null; try { fn(); } catch {} }
  upgOpen = false;
  if (!upgOverlayEl || !upgSheetEl) return;
  upgSheetEl.style.transition = '';
  upgSheetEl.style.transform = '';
  upgOverlayEl.classList.remove('is-open');
  upgOverlayEl.style.pointerEvents = 'none';
}

function openHmMilestoneDialog(lines) {
  // ... (Re-implement logic or use existing. I will copy existing logic for brevity)
  const existing = document.querySelector('.hm-milestones-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'hm-milestones-overlay';
  overlay.setAttribute('role', 'dialog');
  const dialog = document.createElement('div');
  dialog.className = 'hm-milestones-dialog';
  const title = document.createElement('h3');
  title.className = 'hm-milestones-title';
  title.textContent = 'Milestones';
  const list = document.createElement('ul');
  list.className = 'hm-milestones-list';
  for (const line of lines) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'hm-milestone-text';
    if (line && typeof line === 'object') { text.textContent = line.text ?? ''; if (line.achieved) li.classList.add('hm-milestone-achieved'); } 
    else { text.textContent = line; }
    li.appendChild(text); list.appendChild(li);
  }
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hm-milestones-close';
  closeBtn.textContent = 'Close';
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKeydown); };
  const onKeydown = (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  dialog.append(title, list, closeBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  if (typeof closeBtn.focus === 'function') closeBtn.focus({ preventScroll: true });
}

export function openUpgradeOverlay(upgDef, mode = 'standard') {
  ensureUpgradeOverlay();
  upgOpen = true;
  let upgOpenLocal = true;

  const adapter = getAdapter(mode);
  
  // Initial checks
  const initialLockState = adapter.getLockState(upgDef.id) || {};
  const initialLocked = !!initialLockState.locked;
  const initialMysterious = initialLocked && (initialLockState.hidden || initialLockState.hideEffect || initialLockState.hideCost || (typeof initialLockState.iconOverride === 'string' && initialLockState.iconOverride.includes('mysterious')));
  if (initialLocked && !initialMysterious) { upgOpen = false; return; }

  const isHM = (upgDef.upgType === 'HM');
  const isEndlessXp = (upgDef.tie === UPGRADE_TIES.ENDLESS_XP);
  
  function ensureChild(parent, className, tagName = 'div') {
      const targetClasses = className.split(' ').filter(c => c.length > 0);
      let el = null; const extras = [];
      for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i];
          if (tagName && child.tagName.toLowerCase() !== tagName.toLowerCase()) continue;
          if (targetClasses.every(cls => child.classList.contains(cls))) { if (!el) el = child; else extras.push(child); }
      }
      extras.forEach(e => e.remove());
      if (!el) { el = document.createElement(tagName); el.className = className; parent.appendChild(el); }
      return el;
  }
  const spacer = (h) => { const s = document.createElement('div'); s.style.height = h; return s; };
  const makeLine = (html) => { const d = document.createElement('div'); d.className = 'upg-line'; d.innerHTML = html; return d; };
  
  function recenterUnlockOverlayIfNeeded(model) {
     const content = upgSheetEl.querySelector('.upg-content');
     if (!content) return;
     const lockState = model?.lockState || adapter.getLockState(upgDef.id) || {};
     const isHiddenUpgrade = !!(lockState.hidden || lockState.hideEffect || lockState.hideCost);
     if (!model || !model.unlockUpgrade || isHiddenUpgrade) { content.style.marginTop = ''; return; }
     
     const header = upgSheetEl.querySelector('.upg-header');
     const actions = upgSheetEl.querySelector('.upg-actions');
     if (!header || !actions) return;
     
     content.style.marginTop = '';
     const headerRect = header.getBoundingClientRect();
     const actionsRect = actions.getBoundingClientRect();
     const contentRect = content.getBoundingClientRect();
     const available = actionsRect.top - headerRect.bottom;
     const freeSpace = available - contentRect.height;
     if (freeSpace <= 0) return;
     content.style.marginTop = `${freeSpace * 0.42}px`;
  }
  
  let initialRender = true;
  
  const rerender = () => {
      const model = adapter.getUiModel(upgDef.id);
      if (!model) return;
      
      const lockState = model.lockState || adapter.getLockState(upgDef.id);
      const locked = !!lockState?.locked;
      const isHiddenUpgrade = locked && (lockState?.hidden || lockState?.hideEffect || lockState?.hideCost);
      const isUnlockVisible = !!model.unlockUpgrade && !isHiddenUpgrade;
      
      upgSheetEl.classList.toggle('is-locked-hidden', isHiddenUpgrade);
      
      const header = upgSheetEl.querySelector('.upg-header');
      const title = ensureChild(header, 'upg-title');
      if (title.textContent !== (model.displayTitle || model.upg.title)) title.textContent = model.displayTitle || model.upg.title;
      
      const evolveReady = !!model.hmReadyToEvolve;
      const capReached = evolveReady ? false : (model.lvlBn?.isInfinite?.() ? true : (Number.isFinite(model.upg.lvlCap) ? model.lvl >= model.upg.lvlCap : false));
      
      const level = ensureChild(header, 'upg-level');
      const capHtml = model.lvlCapFmtHtml ?? model.upg.lvlCapFmtHtml ?? formatNumber(model.lvlCapBn);
      const capPlain = model.lvlCapFmtText ?? model.upg.lvlCapFmtText ?? stripTags(capHtml);
      const levelHtml = evolveReady ? `Level ${model.lvlFmtHtml} / ${capHtml} (EVOLVE READY)` : (capReached ? `Level ${model.lvlFmtHtml} / ${capHtml} (MAXED)` : `Level ${model.lvlFmtHtml} / ${capHtml}`);
      const levelPlain = stripTags(levelHtml);
      if (level.innerHTML !== levelHtml) level.innerHTML = levelHtml;
      if (level.getAttribute('aria-label') !== levelPlain) level.setAttribute('aria-label', levelPlain);
      level.hidden = isHiddenUpgrade;
      if (!isHiddenUpgrade) level.removeAttribute('aria-hidden');
      
      upgSheetEl.classList.toggle('is-maxed', capReached);
      upgSheetEl.classList.toggle('hm-evolve-ready', evolveReady);
      upgSheetEl.classList.toggle('is-unlock-upgrade', isUnlockVisible);
      upgSheetEl.classList.toggle('is-hm-upgrade', isHM && !isHiddenUpgrade);
      upgSheetEl.classList.toggle('is-endless-xp', isEndlessXp);
      upgSheetEl.classList.toggle('is-magnet-upgrade', upgDef.tie === UPGRADE_TIES.MAGNET);
	  upgSheetEl.classList.toggle('is-no-effect', !model.effect);

            // --- Automation Toggle Logic ---
      let autoToggleWrapper = header.querySelector('.auto-toggle-wrapper');

      // Check for Master Upgrade logic in Automation Shop
      const masterCostType = (mode === 'automation') ? MASTER_AUTOBUY_IDS[upgDef.id] : null;
      // Also check for Workshop Level Master Switch (ID 6 in automation shop)
      const isWorkshopMaster = (mode === 'automation' && upgDef.id === AUTOBUY_WORKSHOP_LEVELS_ID);

      const isAutomationMaster = !!masterCostType;
      
      // Check for Standard Upgrade logic in Standard Shop
      const standardAutobuyId = (mode === 'standard') ? COST_TYPE_TO_AUTOBUY_ID[upgDef.costType] : null;

      let autobuyLevel = 0;
      if (standardAutobuyId) {
          autobuyLevel = getLevelNumber(AUTOMATION_AREA_KEY, standardAutobuyId);
      } else if (isAutomationMaster || isWorkshopMaster) {
          // If viewing the master upgrade itself, we check its own level
          autobuyLevel = getLevelNumber(AUTOMATION_AREA_KEY, upgDef.id);
      }

      const hasAutobuyer = autobuyLevel > 0;
      const showAutoToggle = hasAutobuyer && (isAutomationMaster || standardAutobuyId || isWorkshopMaster);

      if (!showAutoToggle) {
          if (autoToggleWrapper) autoToggleWrapper.remove();
      } else {
         if (!autoToggleWrapper) {
             autoToggleWrapper = document.createElement('div');
             autoToggleWrapper.className = 'auto-toggle-wrapper hm-view-milestones-row';
             autoToggleWrapper.style.marginTop = '12px';
             header.appendChild(autoToggleWrapper);
         }
         
         let toggleBtn = autoToggleWrapper.querySelector('button');
         if (!toggleBtn) {
             toggleBtn = document.createElement('button');
             toggleBtn.type = 'button';
             toggleBtn.style.padding = '10px 14px';
             toggleBtn.style.fontSize = '16px';
             toggleBtn.style.width = 'auto';
             toggleBtn.style.minWidth = '180px';
             
             toggleBtn.addEventListener('click', (e) => {
                 if (typeof toggleBtn._onClick === 'function') toggleBtn._onClick(e);
             });
             
             autoToggleWrapper.appendChild(toggleBtn);
         }
         
         const activeSlot = getActiveSlot();
         const slotSuffix = activeSlot != null ? `:${activeSlot}` : '';

         let isEnabled = true;
         if (isAutomationMaster) {
             const key = `ccc:autobuy:master:${masterCostType}${slotSuffix}`;
             // Check if ANY child upgrade is enabled
             const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
             let anyEnabled = false;
             for (const u of upgrades) {
                 if (u.costType === masterCostType) {
                     const childKey = `ccc:autobuy:${u.area}:${u.id}${slotSuffix}`;
                     if (localStorage.getItem(childKey) !== '0') {
                         anyEnabled = true;
                         break;
                     }
                 }
             }
             isEnabled = anyEnabled;
         } else {
             // Standard or Workshop Master
             const key = `ccc:autobuy:${upgDef.area}:${upgDef.id}${slotSuffix}`;
             isEnabled = localStorage.getItem(key) !== '0';
         }

         if (isEnabled) {
             toggleBtn.className = 'shop-delve';
             toggleBtn.textContent = 'Automation: ON';
             toggleBtn.style.backgroundColor = '';
         } else {
             toggleBtn.className = 'shop-close';
             toggleBtn.textContent = 'Automation: OFF';
             toggleBtn.style.backgroundColor = '';
         }
         
         toggleBtn._onClick = (e) => {
             e.preventDefault(); e.stopPropagation();
             if (IS_MOBILE) blockInteraction(50);
             
             const newState = !isEnabled;
             const val = newState ? '1' : '0';
             
             if (isAutomationMaster) {
                 localStorage.setItem(`ccc:autobuy:master:${masterCostType}${slotSuffix}`, val);
                 const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE); 
                 upgrades.forEach(u => {
                    if (u.costType === masterCostType) {
                        localStorage.setItem(`ccc:autobuy:${u.area}:${u.id}${slotSuffix}`, val);
                    }
                 });
             } else {
                 localStorage.setItem(`ccc:autobuy:${upgDef.area}:${upgDef.id}${slotSuffix}`, val);
             }
             rerender();
         };
      }
      // -------------------------------
      
      const content = upgSheetEl.querySelector('.upg-content');
      if (initialRender) { content.scrollTop = 0; initialRender = false; }
      
      const desc = ensureChild(content, 'upg-desc centered');
      desc.classList.toggle('lock-desc', isHiddenUpgrade);
      const baseDesc = (model.displayDesc || model.upg.desc || '').trim();
      if (evolveReady) {
          desc.classList.add('hm-evolve-note');
          if (desc.textContent !== 'Evolve this upgrade to multiply its effect by 1000x') desc.textContent = 'Evolve this upgrade to multiply its effect by 1000x';
      } else if (baseDesc) {
          desc.classList.remove('hm-evolve-note');
          if (desc.textContent !== baseDesc) desc.textContent = baseDesc;
          desc.hidden = false;
      } else desc.hidden = true;
      
      const info = ensureChild(content, 'upg-info');
      info.innerHTML = '';
      info.appendChild(spacer('12px'));
      
      if (locked && lockState?.reason && !isHiddenUpgrade) {
          const descText = (model.displayDesc || '').trim();
          const reasonText = String(lockState.reason ?? '').trim();
          if (descText !== reasonText) {
              const note = document.createElement('div'); note.className = 'upg-line lock-note'; note.textContent = lockState.reason;
              info.appendChild(note); info.appendChild(spacer('12px'));
          }
      }
      if (model.effect && !(locked && lockState?.hideEffect)) {
          info.appendChild(makeLine(`<span class="bonus-line">${model.effect}</span>`)); info.appendChild(spacer('12px'));
      }
      
      const iconHTML = currencyIconHTML(model.upg.costType);
      const nextPriceBn = model.nextPrice instanceof BigNum ? model.nextPrice : BigNum.fromAny(model.nextPrice || 0);
      const stopBuying = capReached || evolveReady;
      
      if (!model.unlockUpgrade && !stopBuying && (!locked || !lockState?.hideCost)) {
          const costs = document.createElement('div'); costs.className = 'upg-costs';
          const lineCost = document.createElement('div'); lineCost.className = 'upg-line';
          lineCost.innerHTML = `Cost: ${iconHTML} ${bank[model.upg.costType].fmt(nextPriceBn)}`;
          costs.appendChild(lineCost);
          
          if (isHM) {
             const lineMilestone = document.createElement('div'); lineMilestone.className = 'upg-line';
             let milestoneCost = '—';
             try {
                if (model.hmNextMilestone && model.hmNextMilestone.cmp(model.lvlBn) > 0) {
                    const deltaBn = model.hmNextMilestone.sub(model.lvlBn);
                    const deltaPlain = deltaBn.toPlainIntegerString?.();
                    const deltaNum = Math.max(0, Math.floor(Number(deltaPlain && deltaPlain !== 'Infinity' ? deltaPlain : Number(deltaBn.toString() || 0))));
                    const { spent } = evaluateBulkPurchase(model.upg, model.lvlBn, BigNum.fromAny('Infinity'), deltaNum);
                    milestoneCost = bank[model.upg.costType].fmt(spent);
                }
             } catch {}
             lineMilestone.innerHTML = `Cost to next milestone: ${iconHTML} ${milestoneCost}`;
             costs.appendChild(lineMilestone);
          }
          
          const lineHave = document.createElement('div'); lineHave.className = 'upg-line';
          lineHave.innerHTML = `You have: ${iconHTML} ${bank[model.upg.costType].fmt(model.have)}`;
          costs.appendChild(lineHave);
          info.appendChild(costs);
      }
      
      // Milestones Row
      if (isHM && !isHiddenUpgrade) {
          let milestonesRow = content.querySelector('.hm-view-milestones-row');
          if (!milestonesRow) {
              milestonesRow = document.createElement('div'); milestonesRow.className = 'hm-view-milestones-row';
              const btn = document.createElement('button'); btn.type='button'; btn.className='shop-delve hm-view-milestones'; btn.textContent='View Milestones';
              btn.addEventListener('click', () => {
                 const milestones = Array.isArray(model.hmMilestones) ? model.hmMilestones : [];
                 const evolutions = Math.max(0, Math.floor(Number(model.hmEvolutions ?? 0)));
                 const evolutionOffset = (() => { try { return BigInt(HM_EVOLUTION_INTERVAL) * BigInt(evolutions); } catch { return 0n; } })();
                 const lines = milestones.sort((a,b)=>(Number(a?.level||0)-Number(b?.level||0))).map(m => {
                     const lvl = Math.max(0, Math.floor(Number(m?.level||0)));
                     const milestoneLevelBn = (() => {
                         if (model.lvlBn?.isInfinite?.()) return BigNum.fromAny('Infinity');
                         try { return BigNum.fromAny((BigInt(lvl) + evolutionOffset).toString()); } catch { return BigNum.fromAny(lvl + (HM_EVOLUTION_INTERVAL * evolutions)); }
                     })();
                     const levelText = milestoneLevelBn?.isInfinite?.() ? 'Infinity' : formatNumber(milestoneLevelBn);
                     const mult = formatMultForUi(m?.multiplier??m?.mult??m?.value??1);
                     const target = `${m?.target??m?.type??'self'}`.toLowerCase();
                     const achieved = (() => {
                        if (model.lvlBn?.isInfinite?.()) return true;
                        try { return model.lvlBn?.cmp?.(milestoneLevelBn) >= 0; } catch {}
                        return false; 
                     })();
                     let text = `Level ${levelText}: Multiplies this upgrade’s effect by ${mult}x`;
                     if (target === 'xp') text = `Level ${levelText}: Multiplies XP value by ${mult}x`;
                     if (target === 'coin'||target==='coins') text = `Level ${levelText}: Multiplies Coin value by ${mult}x`;
                     if (target === 'mp') text = `Level ${levelText}: Multiplies MP value by ${mult}x`;
                     return { text, achieved };
                 });
                 openHmMilestoneDialog(lines);
              });
              milestonesRow.appendChild(btn); content.appendChild(milestonesRow);
          }
      } else {
          const mr = content.querySelector('.hm-view-milestones-row'); if(mr) mr.remove();
      }
      
      // Actions
      const actions = upgSheetEl.querySelector('.upg-actions');
      let closeBtn = actions.querySelector('.shop-close');
      if (!closeBtn) {
          closeBtn = document.createElement('button'); closeBtn.type='button'; closeBtn.className='shop-close'; closeBtn.textContent='Close';
          closeBtn.addEventListener('click', () => { upgOpenLocal = false; closeUpgradeMenu(); });
          actions.appendChild(closeBtn);
      }
      
      if (locked || capReached) {
          actions.querySelectorAll('button:not(.shop-close)').forEach(btn => btn.remove());
          if (document.activeElement && document.activeElement !== closeBtn && !actions.contains(document.activeElement)) closeBtn.focus();
      } else {
          const canAffordNext = model.have.cmp(nextPriceBn) >= 0;
          const ensureButton = (className, text, onClick, index, disabled=false) => {
              let btn = actions.querySelector(`.${className.split(' ').join('.')}`);
              if (!btn) {
                  btn = document.createElement('button'); btn.type='button'; btn.className=className; btn.textContent=text;
                  
                  const invoke = () => { if (typeof btn._onClick === 'function') btn._onClick(); };
                  if ('PointerEvent' in window) btn.addEventListener('pointerdown', (e) => { if(e.pointerType==='mouse'||(typeof e.button==='number'&&e.button!==0))return; invoke(); e.preventDefault(); }, {passive:false});
                  else btn.addEventListener('touchstart', (e)=>{ invoke(); e.preventDefault(); }, {passive:false});
                  btn.addEventListener('click', ()=>{ if(IS_MOBILE)return; invoke(); });
                  
                  const siblings = actions.children;
                  if (index >= siblings.length) actions.appendChild(btn); else actions.insertBefore(btn, siblings[index]);
              }
              btn._onClick = onClick;
              if(btn.textContent!==text) btn.textContent=text;
              if(btn.disabled!==disabled) btn.disabled=disabled;
              return btn;
          };
          
          if (evolveReady) {
              actions.querySelectorAll('button:not(.shop-close):not(.hm-evolve-btn)').forEach(b => b.remove());
              ensureButton('shop-delve hm-evolve-btn', 'Evolve', () => {
                  const { evolved } = adapter.evolve(upgDef.id);
                  if (evolved) { playEvolveSfx(); updateShopOverlay(); rerender(); }
              }, 1, false);
              recenterUnlockOverlayIfNeeded(model);
              return;
          }
          
          if (model.unlockUpgrade) {
               actions.querySelectorAll('button:not(.shop-close):not(.btn-unlock)').forEach(b => b.remove());
               ensureButton('shop-delve btn-unlock', 'Unlock', () => {
                   const { bought } = adapter.buyOne(upgDef.id);
                   const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
                   if (!boughtBn.isZero?.()) {
                       playPurchaseSfx();
                       if (isForgeUnlockUpgrade(upgDef, mode)) try { unlockMerchantTabs(['reset']); } catch {}
                       updateShopOverlay(); rerender();
                   }
               }, 1, !canAffordNext);
               recenterUnlockOverlayIfNeeded(model);
               return;
          }
          
          actions.querySelectorAll('.hm-evolve-btn, .btn-unlock').forEach(b => b.remove());
          
          const performBuy = () => {
              const fresh = adapter.getUiModel(upgDef.id);
              if (fresh.have.cmp(fresh.nextPrice instanceof BigNum ? fresh.nextPrice : BigNum.fromAny(fresh.nextPrice||0)) < 0) return;
              const { bought } = adapter.buyOne(upgDef.id);
              const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
              if (!boughtBn.isZero?.()) { playPurchaseSfx(); updateShopOverlay(); rerender(); }
          };
          ensureButton('shop-delve btn-buy-one', 'Buy', performBuy, 1, !canAffordNext);
          
          const performBuyMax = () => {
              const fresh = adapter.getUiModel(upgDef.id);
              if (fresh.have.cmp(BigNum.fromInt(1)) < 0) return;
              const { bought } = adapter.buyMax(upgDef.id);
              const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
              if (!boughtBn.isZero?.()) { playPurchaseSfx(); updateShopOverlay(); rerender(); }
          };
          ensureButton('shop-delve btn-buy-max', 'Buy Max', performBuyMax, 2, !canAffordNext);
          
          if (isHM) {
              const performBuyNext = () => {
                  const fresh = adapter.getUiModel(upgDef.id);
                  if (fresh.hmReadyToEvolve) return;
                  const target = fresh.hmNextMilestone;
                  if (!target || !fresh.lvlBn || target.cmp(fresh.lvlBn) <= 0) {
                      const { bought } = adapter.buyMax(upgDef.id);
                      if ((bought instanceof BigNum ? bought : BigNum.fromAny(bought??0)).isZero?.()) return;
                      playPurchaseSfx(); updateShopOverlay(); rerender(); return;
                  }
                  let deltaNum = 0;
                  try { const diffPlain = target.sub(fresh.lvlBn).toPlainIntegerString?.(); deltaNum = Math.max(0, Math.floor(Number((diffPlain&&diffPlain!=='Infinity')?diffPlain:target.sub(fresh.lvlBn).toString()))); } catch {}
                  const walletRaw = bank[fresh.upg.costType]?.value;
                  const walletBn = walletRaw instanceof BigNum ? walletRaw : BigNum.fromAny(walletRaw??0);
                  const evalResult = evaluateBulkPurchase(fresh.upg, fresh.lvlBn, walletBn, deltaNum);
                  const count = evalResult.count;
                  let reachable = false;
                  try { const plain = count?.toPlainIntegerString?.(); reachable = (plain&&plain!=='Infinity') ? Number(plain)>=deltaNum : Number(count??0)>=deltaNum; } catch {}
                  const purchase = reachable ? adapter.buyNext(upgDef.id, deltaNum) : adapter.buyMax(upgDef.id);
                  const boughtBn = purchase.bought instanceof BigNum ? purchase.bought : BigNum.fromAny(purchase.bought??0);
                  if (!boughtBn.isZero?.()) { playPurchaseSfx(); updateShopOverlay(); rerender(); }
              };
              ensureButton('shop-delve btn-buy-next', 'Buy Next', performBuyNext, 3, model.have.cmp(BigNum.fromInt(1)) < 0);
          } else {
              const stale = actions.querySelector('.btn-buy-next'); if (stale) stale.remove();
          }
      }
      recenterUnlockOverlayIfNeeded(model);
  };
  
  const onUpdate = () => { if (!upgOpenLocal) return; rerender(); };
  adapter.events.forEach(evt => window.addEventListener(evt, onUpdate));
  if (mode === 'standard') document.addEventListener('ccc:upgrades:changed', onUpdate);
  
  rerender();
  upgOverlayEl.classList.add('is-open');
  upgOverlayEl.classList.toggle('is-automation-upgrade', mode === 'automation');
  upgOverlayEl.style.pointerEvents = 'auto';
  blockInteraction(140);
  upgSheetEl.style.transition = 'none';
  upgSheetEl.style.transform = 'translateY(100%)';
  void upgSheetEl.offsetHeight;
  requestAnimationFrame(() => { upgSheetEl.style.transition = ''; upgSheetEl.style.transform = ''; });
  
  upgOverlayCleanup = () => {
     upgOpenLocal = false;
     adapter.events.forEach(evt => window.removeEventListener(evt, onUpdate));
     if (mode === 'standard') document.removeEventListener('ccc:upgrades:changed', onUpdate);
  };
}

export function setupDragToClose(grabberEl, sheetEl, isOpenFn, performCloseFn) {
  let drag = null;
  function onDragStart(e) {
    if (!isOpenFn()) return;
    const clientY = typeof e.clientY === 'number' ? e.clientY : (e.touches?.[0]?.clientY || 0);
    drag = { startY: clientY, lastY: clientY, startT: performance.now(), moved: 0, canceled: false };
    sheetEl.style.transition = 'none';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(e) {
    if (!drag || drag.canceled) return;
    const y = e.clientY;
    if (typeof y !== 'number') return;
    const dy = Math.max(0, y - drag.startY);
    drag.lastY = y;
    drag.moved = dy;
    sheetEl.style.transform = `translateY(${dy}px)`;
  }
  function onDragEnd() {
    if (!drag || drag.canceled) return cleanupDrag();
    const dt = Math.max(1, performance.now() - drag.startT);
    const dy = drag.moved;
    const velocity = dy / dt;
    const shouldClose = (velocity > 0.55 && dy > 40) || dy > 140;
    if (shouldClose) {
      suppressNextGhostTap(100);
      blockInteraction(80);
      sheetEl.style.transition = 'transform 140ms ease-out';
      sheetEl.style.transform = 'translateY(100%)';
      performCloseFn();
    } else {
      sheetEl.style.transition = 'transform 180ms ease';
      sheetEl.style.transform = 'translateY(0)';
    }
    cleanupDrag();
  }
  function onDragCancel() {
    if (!drag) return;
    drag.canceled = true;
    sheetEl.style.transition = 'transform 180ms ease';
    sheetEl.style.transform = 'translateY(0)';
    cleanupDrag();
  }
  function cleanupDrag() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    drag = null;
  }
  grabberEl.addEventListener('pointerdown', onDragStart);
  grabberEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
}
