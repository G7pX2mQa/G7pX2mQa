// js/ui/shopOverlay.js

import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { openMerchant,
    ensureMerchantOverlay,
    primeTypingSfx,
    unlockMerchantTabs,
    hasMetMerchant,
    MERCHANT_MET_EVENT
} from './merchantDelve/dlgTab.js';
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
} from '../game/upgrades.js';
import {
  markGhostTapTarget,
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../util/ghostTapGuard.js';


let shopOverlayEl = null;
let shopSheetEl = null;
let shopOpen = false;
let drag = null;
let eventsBound = false;
let delveBtnEl = null;
let updateDelveGlow = null;
let shopCloseTimer = null;
const IS_MOBILE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);
let __shopOpenStamp = 0;
let __shopPostOpenPointer = false;


const ICON_DIR = 'img/';
const BASE_ICON_SRC_BY_COST = {
  coins: 'img/currencies/coin/coin_base.png',
  books: 'img/currencies/book/book_base.png',
  gold: 'img/currencies/gold/gold_base.png',
};
const LOCKED_BASE_ICON_SRC = 'img/misc/locked_base.png';
const MAXED_BASE_OVERLAY_SRC = 'img/misc/maxed.png';
const CURRENCY_ICON_SRC = {
  coins: 'img/currencies/coin/coin.png',
  books: 'img/currencies/book/book.png',
  gold: 'img/currencies/gold/gold.png',
};

const FORGE_UNLOCK_UPGRADE_ID = 7;

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

function isForgeUnlockUpgrade(upgLike) {
  return resolveUpgradeId(upgLike) === FORGE_UNLOCK_UPGRADE_ID;
}

export function blockInteraction(ms = 140) {
  const isCoarse = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);
  if (!isCoarse) return;

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

const PURCHASE_SFX_SRC = 'sounds/purchase_upg.mp3';
const MOBILE_PURCHASE_VOLUME = 0.12;
const DESKTOP_PURCHASE_VOLUME = 0.3;

let __purchaseBase = null;
let __purchaseAc = null;
let __purchaseGain = null;
let __purchaseBuffer = null;
let __purchaseBufferPromise = null;
let __purchaseBufferPromiseHandled = false;
let __purchasePendingPlays = 0;

function ensurePurchaseBase() {
  if (__purchaseBase) return __purchaseBase;

  const preloaded = takePreloadedAudio(PURCHASE_SFX_SRC);
  const el = preloaded || new Audio(PURCHASE_SFX_SRC);
  el.preload = 'auto';
  el.playsInline = true;
  el.crossOrigin = 'anonymous';
  el.load?.();
  __purchaseBase = el;
  return __purchaseBase;
}

function ensurePurchaseWebAudio() {
  if (!IS_MOBILE) return false;
  const base = ensurePurchaseBase();
  if (!base) return false;

  if (!('AudioContext' in window || 'webkitAudioContext' in window)) {
    return false;
  }

  try {
    __purchaseAc = __purchaseAc || new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    __purchaseAc = null;
    return false;
  }

  if (!__purchaseAc) return false;

  if (__purchaseAc.state === 'suspended') {
    try { __purchaseAc.resume(); } catch (_) {}
  }

  if (!__purchaseGain) {
    __purchaseGain = __purchaseAc.createGain();
    __purchaseGain.connect(__purchaseAc.destination);
  }

  return true;
}

function ensurePurchaseBuffer() {
  if (!__purchaseAc) return null;
  if (__purchaseBuffer) return __purchaseBuffer;
  if (__purchaseBufferPromise) return null;

  const src = ensurePurchaseBase()?.currentSrc || PURCHASE_SFX_SRC;

  try {
    __purchaseBufferPromise = fetch(src)
      .then((resp) => (resp.ok ? resp.arrayBuffer() : Promise.reject(resp.status)))
      .then((buf) => new Promise((resolve, reject) => {
        let settled = false;
        const onOk = (decoded) => {
          if (settled) return;
          settled = true;
          resolve(decoded);
        };
        const onErr = (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const ret = __purchaseAc.decodeAudioData(buf, onOk, onErr);
        if (ret && typeof ret.then === 'function') {
          ret.then(onOk, onErr);
        }
      }))
      .then((decoded) => {
        __purchaseBuffer = decoded;
        __purchaseBufferPromise = null;
        __purchaseBufferPromiseHandled = false;
        return decoded;
      })
      .catch(() => {
        __purchaseBufferPromise = null;
        __purchaseBufferPromiseHandled = false;
        return null;
      });
    __purchaseBufferPromiseHandled = false;
  } catch (_) {
    __purchaseBufferPromise = null;
    __purchaseBufferPromiseHandled = false;
  }

  return __purchaseBuffer || null;
}

function playPurchaseMobileWebAudio() {
  if (!ensurePurchaseWebAudio()) return false;

  if (!__purchaseAc || !__purchaseGain) return false;

  const playBuffer = (buffer) => {
    if (!buffer) return false;
    try {
      const node = __purchaseAc.createBufferSource();
      node.buffer = buffer;
      node.connect(__purchaseGain);

      const t = __purchaseAc.currentTime;
      try {
        __purchaseGain.gain.setValueAtTime(MOBILE_PURCHASE_VOLUME, t);
      } catch (_) {
        __purchaseGain.gain.value = MOBILE_PURCHASE_VOLUME;
      }

      node.start();
      return true;
    } catch (_) {
      return false;
    }
  };

  if (__purchaseBuffer) {
    return playBuffer(__purchaseBuffer);
  }

  __purchasePendingPlays += 1;

  if (!__purchaseBufferPromise) {
    ensurePurchaseBuffer();
  }

  if (!__purchaseBufferPromise) {
    const plays = Math.max(1, __purchasePendingPlays);
    __purchasePendingPlays = 0;
    for (let i = 0; i < plays; i += 1) {
      playPurchaseMobileFallback();
    }
    return true;
  }

  if (__purchaseBufferPromise && !__purchaseBufferPromiseHandled) {
    __purchaseBufferPromiseHandled = true;
    __purchaseBufferPromise.then((buffer) => {
      const plays = Math.max(1, __purchasePendingPlays);
      __purchasePendingPlays = 0;

      if (!buffer) {
        for (let i = 0; i < plays; i += 1) {
          playPurchaseMobileFallback();
        }
        return;
      }

      for (let i = 0; i < plays; i += 1) {
        if (!playBuffer(buffer)) {
          playPurchaseMobileFallback();
          break;
        }
      }
    });
  }

  return true;
}

function playPurchaseMobileFallback() {
  const base = ensurePurchaseBase();
  if (!base) return;

  base.muted = false;
  base.volume = MOBILE_PURCHASE_VOLUME;
  try { base.currentTime = 0; } catch (_) {}
  base.play().catch(() => {});
}

function playPurchaseDesktop() {
  const base = ensurePurchaseBase();
  if (!base) return;

  base.volume = DESKTOP_PURCHASE_VOLUME;
  const a = base.cloneNode();
  a.volume = DESKTOP_PURCHASE_VOLUME;
  a.play().catch(() => {});
}

function playPurchaseSfx() {
  try {
    if (IS_MOBILE) {
      if (playPurchaseMobileWebAudio()) return;
      playPurchaseMobileFallback();
      return;
    }

    playPurchaseDesktop();
  } catch {}
}

function currencyIconHTML(type) {
  const src = CURRENCY_ICON_SRC[type] || CURRENCY_ICON_SRC.coins;
  return `<img alt="" src="${src}" class="coin-ico">`;
}


// 1×1 transparent PNG (fallback when an icon is missing)
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3x0S8AAAAASUVORK5CYII=';

// Upgrades registry (minimal for now)
let upgrades = {};

// ---------- Custom Scrollbar ----------
function ensureCustomScrollbar() {
  const scroller = shopOverlayEl?.querySelector('.shop-scroller');
  if (!scroller || scroller.__customScroll) return;

  const bar = document.createElement('div');
  bar.className = 'shop-scrollbar';
  const thumb = document.createElement('div');
  thumb.className = 'shop-scrollbar__thumb';
  bar.appendChild(thumb);
  shopSheetEl.appendChild(bar);

  scroller.__customScroll = { bar, thumb };

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const FADE_SCROLL_MS = 150;
  const FADE_DRAG_MS = 120;
  const supportsScrollEnd = 'onscrollend' in window;

  const syncScrollShadow = () => {
    const hasShadow = (scroller.scrollTop || 0) > 0;
    shopSheetEl?.classList.toggle('has-scroll-shadow', hasShadow);
  };


  const updateBounds = () => {
    const grab = shopOverlayEl.querySelector('.shop-grabber');
    const header = shopOverlayEl.querySelector('.shop-header');
    const actions = shopOverlayEl.querySelector('.shop-actions');

    const top = ((grab?.offsetHeight || 0) + (header?.offsetHeight || 0)) | 0;
    const bottom = (actions?.offsetHeight || 0) | 0;

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

  const updateAll = () => {
    updateBounds();
    updateThumb();
    syncScrollShadow();
  };

  const showBar = () => {
    if (!isTouch) return;
    shopSheetEl.classList.add('is-scrolling');
    clearTimeout(scroller.__fadeTimer);
  };
  const scheduleHide = (delay) => {
    if (!isTouch) return;
    clearTimeout(scroller.__fadeTimer);
    scroller.__fadeTimer = setTimeout(() => {
      shopSheetEl.classList.remove('is-scrolling');
    }, delay);
  };

  const onScroll = () => {
    updateThumb();
    syncScrollShadow();
    if (isTouch) showBar();
    if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS);
  };

  const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) {
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
  }

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);
  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll);

  // --- Drag to scroll ---
  let dragging = false;
  let dragStartY = 0;
  let startScrollTop = 0;

  const startDrag = (e) => {
    dragging = true;
    dragStartY = e.clientY;
    startScrollTop = scroller.scrollTop;
    thumb.classList.add('dragging');
    showBar();
    try { thumb.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  };

  const onDragMove = (e) => {
    if (!dragging) return;
    const barH = bar.clientHeight;
    const thH = thumb.clientHeight;
    const range = Math.max(1, barH - thH);
    const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const deltaY = e.clientY - dragStartY;
    const scrollDelta = (deltaY / range) * scrollMax;
    scroller.scrollTop = startScrollTop + scrollDelta;
  };

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
    scheduleHide(FADE_DRAG_MS);
    try { thumb.releasePointerCapture(e.pointerId); } catch {}
  };

  thumb.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', onDragMove, { passive: true });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // --- Click track to jump ---
  bar.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const rect = bar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;

    const barH = bar.clientHeight;
    const thH = thumb.clientHeight;
    const range = Math.max(0, barH - thH);
    const targetY = Math.max(0, Math.min(clickY - thH / 2, range));

    const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = (targetY / Math.max(1, range)) * scrollMax;

    showBar();
    scheduleHide(FADE_SCROLL_MS);
  });
}

// ---------- Upgrades ----------
function buildUpgradesData() {
  const areaKey = getCurrentAreaKey();
  const defs = getUpgradesForArea(areaKey);
  upgrades = {}; // reset
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
}

function levelsRemainingToCap(upg, currentLevelBn, currentLevelNumber) {
  if (!upg) return BigNum.fromInt(0);

  const capBn = upg.lvlCapBn?.clone?.() ?? (Number.isFinite(upg.lvlCap)
    ? BigNum.fromAny(upg.lvlCap)
    : null);

  if (!capBn) return BigNum.fromInt(0);
  if (capBn.isInfinite?.()) return BigNum.fromAny('Infinity');

  let lvlBn;
  try {
    lvlBn = currentLevelBn instanceof BigNum
      ? currentLevelBn
      : BigNum.fromAny(currentLevelBn ?? currentLevelNumber ?? 0);
  } catch {
    const fallback = Math.max(0, Math.floor(Number(currentLevelNumber) || 0));
    lvlBn = BigNum.fromInt(fallback);
  }

  if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);

  try {
    const capPlain = capBn.toPlainIntegerString?.();
    const lvlPlain = lvlBn.toPlainIntegerString?.();
    if (capPlain === 'Infinity') return BigNum.fromAny('Infinity');
    if (capPlain && lvlPlain && capPlain !== 'Infinity' && lvlPlain !== 'Infinity') {
      const capInt = BigInt(capPlain);
      const lvlInt = BigInt(lvlPlain);
      const delta = capInt - lvlInt;
      if (delta > 0n) {
        return BigNum.fromAny(delta.toString());
      }
      return BigNum.fromInt(0);
    }
  } catch {}

  const capNumber = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  if (!Number.isFinite(capNumber)) return BigNum.fromAny('Infinity');

  const lvlNumber = Math.max(0, Math.floor(Number(currentLevelNumber) || 0));
  const room = Math.max(0, capNumber - lvlNumber);
  if (room > 0) {
    try { return BigNum.fromAny(room); }
    catch { return BigNum.fromInt(room | 0); }
  }

  return BigNum.fromInt(0);
}

function computeAffordableLevels(upg, currentLevelNumeric, currentLevelBn) {
  let lvlBn;
  try {
    lvlBn = currentLevelBn instanceof BigNum
      ? currentLevelBn
      : BigNum.fromAny(currentLevelBn ?? currentLevelNumeric ?? 0);
  } catch {
    const fallback = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));
    lvlBn = BigNum.fromInt(fallback);
  }
  if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);

  const lvl = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));
  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;

  const walletEntry = bank[upg.costType];
  const walletValue = walletEntry?.value;
  const walletBn = walletValue instanceof BigNum
    ? walletValue
    : BigNum.fromAny(walletValue ?? 0);
  if (walletBn.isZero?.()) return BigNum.fromInt(0);

  if (walletBn.isInfinite?.()) {
    const isHmType = upg?.upgType === 'HM';
    const maxed = Number.isFinite(cap) && lvl >= cap;
    if ((isHmType && !maxed) || !Number.isFinite(cap)) {
      return BigNum.fromAny('Infinity');
    }
    return levelsRemainingToCap(upg, lvlBn, currentLevelNumeric);
  }

  if (Number.isFinite(cap) && lvl >= cap) return BigNum.fromInt(0);

  try {
    const nextLvlNum = levelBigNumToNumber(lvlBn.add(BigNum.fromInt(1)));
    const c0 = BigNum.fromAny(upg.costAtLevel(lvl));
    const c1 = BigNum.fromAny(upg.costAtLevel(nextLvlNum));

    const farProbeLevel = Math.min(
      Number.isFinite(cap) ? cap : lvl + 32,
      lvl + 32
    );
    const cFar = BigNum.fromAny(upg.costAtLevel(farProbeLevel));

    const isTrulyFlat = c0.cmp(c1) === 0 && c0.cmp(cFar) === 0;

    if (isTrulyFlat) {
      const remainingBn = levelsRemainingToCap(upg, lvlBn, lvl);
      const room = Number.isFinite(upg.lvlCap)
        ? Math.min(
            Math.max(0, Math.floor(levelBigNumToNumber(remainingBn))),
            Number.MAX_SAFE_INTEGER - 2
          )
        : Number.MAX_SAFE_INTEGER;

      let lo = 0;
      let hi = Math.max(0, room);
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const midBn = BigNum.fromInt(mid);
        const total = typeof c0.mulBigNumInteger === 'function'
          ? c0.mulBigNumInteger(midBn)
          : BigNum.fromAny(c0 ?? 0).mulBigNumInteger(midBn);
        if (total.cmp(walletBn) <= 0) lo = mid;
        else hi = mid - 1;
      }
      return BigNum.fromInt(lo);
    }

    const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : undefined;
    const { count } = evaluateBulkPurchase(upg, lvlBn, walletBn, room, { fastOnly: true });
    return count ?? BigNum.fromInt(0);
    } catch {
  }

  const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : undefined;
  const { count } = evaluateBulkPurchase(upg, lvlBn, walletBn, room, { fastOnly: true });
  return count ?? BigNum.fromInt(0);
}

function renderShopGrid() {
  const grid = shopOverlayEl?.querySelector('#shop-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const key in upgrades) {
    const upg = upgrades[key];

    const btn = document.createElement('button');
    btn.className = 'shop-upgrade';
    btn.setAttribute('data-upgid', upg.id);
    btn.type = 'button';
    btn.setAttribute('role', 'gridcell');
    btn.dataset.upgId = String(upg.id);

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

    const canPlusBn = locked
      ? BigNum.fromInt(0)
      : computeAffordableLevels(upg.meta, upg.levelNumeric, upg.level);
    const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
    const levelHtml = formatNumber(upg.level);
    const levelPlain = stripTags(levelHtml);
    const plusHtml = formatNumber(plusBn);
    const plusPlain = stripTags(plusHtml);
    const hasPlus = !plusBn.isZero?.();
    const rawCap = Number.isFinite(upg.lvlCap)
      ? upg.lvlCap
      : (Number.isFinite(upg.meta?.lvlCap) ? upg.meta.lvlCap : Infinity);
    const capNumber = Number.isFinite(rawCap)
      ? Math.max(0, Math.floor(rawCap))
      : Infinity;
    const levelDigits = Number.parseFloat(String(levelPlain || '').replace(/,/g, ''));
    const levelNumber = Number.isFinite(upg.levelNumeric)
      ? upg.levelNumeric
      : (Number.isFinite(levelDigits) ? levelDigits : NaN);
    const hasFiniteCap = Number.isFinite(capNumber);
    const capReached = evolveReady ? false : (hasFiniteCap && Number.isFinite(levelNumber)
      ? levelNumber >= capNumber
      : false);
    const isBookValueUpgrade = upg.meta?.tie === UPGRADE_TIES.BOOK_VALUE_I;
    const isSingleLevelCap = hasFiniteCap && capNumber === 1;
    const isUnlockUpgrade = !!upg.meta?.unlockUpgrade || (isSingleLevelCap && !isBookValueUpgrade);
    const showUnlockableBadge = !locked && isUnlockUpgrade && !capReached;
    const showUnlockedBadge = !locked && isUnlockUpgrade && !showUnlockableBadge && capReached;
    let badgeHtml;
    let badgePlain;
        let needsTwoLines = false;
    if (locked) {
      badgeHtml = '';
      badgePlain = '';
      const reason = isMysterious ? (upg.lockState?.reason || '').trim() : '';
      const ariaLabel = reason
        ? `${upg.title} (Locked, ${reason})`
        : `${upg.title} (Locked)`;
      btn.setAttribute('aria-label', ariaLabel);
    } else {
  if (showUnlockableBadge || showUnlockedBadge) {
    badgeHtml = showUnlockableBadge ? 'Unlockable' : 'Unlocked';
    badgePlain = badgeHtml;
    btn.setAttribute('aria-label', `${upg.title}, ${badgePlain}`);
  } else {
    const numericLevel = Number.isFinite(upg.levelNumeric) ? upg.levelNumeric : NaN;
    const plainDigits  = String(levelPlain || '').replace(/,/g, '');
    const isInf        = /∞|Infinity/i.test(plainDigits);
    const over999      = Number.isFinite(numericLevel)
      ? numericLevel >= 1000
      : (isInf || /^\d{4,}$/.test(plainDigits));

    needsTwoLines = hasPlus && over999;

    if (needsTwoLines) {
      const lvlSpan  = `<span class="badge-lvl">${levelHtml}</span>`;
      const plusSpan = `<span class="badge-plus">(+${plusHtml})</span>`;
      badgeHtml  = `${lvlSpan}${plusSpan}`;
      badgePlain = `${levelPlain} (+${plusPlain})`;
    } else {
      badgeHtml  = hasPlus ? `${levelHtml} (+${plusHtml})` : levelHtml;
      badgePlain = hasPlus ? `${levelPlain} (+${plusPlain})` : levelPlain;
    }
    btn.setAttribute('aria-label', `${upg.title}, level ${badgePlain}`);
  }
}

        if (locked) {
          btn.title = isMysterious ? 'Hidden Upgrade' : 'Locked Upgrade';
        } else if (upg.meta?.unlockUpgrade) {
          btn.title = 'Left-click: Details • Right-click: Unlock';
        } else {
          btn.title = 'Left-click: Details • Right-click: Buy Max';
        }

    const tile = document.createElement('div');
    tile.className = 'shop-tile';

    const baseImg = document.createElement('img');
    baseImg.className = 'base';
    const costType = upg.meta?.costType || 'coins';
    const useLockedBase = upg.useLockedBase || locked;
    const fallbackBaseSrc = BASE_ICON_SRC_BY_COST[costType] || BASE_ICON_SRC_BY_COST.coins;
    const resolvedBaseSrc = upg.baseIconOverride || fallbackBaseSrc;
    baseImg.src = useLockedBase
      ? LOCKED_BASE_ICON_SRC
      : resolvedBaseSrc;
    baseImg.alt = '';

    const iconImg = document.createElement('img');
    iconImg.className = 'icon';
    iconImg.src = upg.icon || TRANSPARENT_PX;
    iconImg.alt = '';
    iconImg.addEventListener('error', () => { iconImg.src = TRANSPARENT_PX; });

    btn.addEventListener('click', (event) => {
      if (btn.disabled || isPlainLocked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (shouldSkipGhostTap(btn)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      markGhostTapTarget(btn);
      openUpgradeOverlay(upg.meta);
    });

    btn.addEventListener('pointerdown', (event) => {
      if (btn.disabled || isPlainLocked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      if (event.pointerType !== 'mouse') {
        markGhostTapTarget(btn);
      }
    });

    btn.addEventListener('contextmenu', (e) => {
      if (IS_MOBILE) return;
      if (locked) return;
      e.preventDefault();
      e.stopPropagation();
      const areaKey = getCurrentAreaKey();
      const { bought } = buyMax(areaKey, upg.id);
      const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
      if (!boughtBn.isZero?.()) {
        playPurchaseSfx();
        if (isForgeUnlockUpgrade(upg.meta)) {
          try { unlockMerchantTabs(['reset']); } catch {}
        }
        updateShopOverlay();
      }
    });

    tile.appendChild(baseImg);
    if (!locked && capReached) {
      const maxedOverlay = document.createElement('img');
      maxedOverlay.className = 'maxed-overlay';
      maxedOverlay.src = MAXED_BASE_OVERLAY_SRC;
      maxedOverlay.alt = '';
      tile.appendChild(maxedOverlay);
    }
    tile.appendChild(iconImg);

    if (!locked) {
      const badge = document.createElement('span');
      badge.className = 'level-badge';
      if (needsTwoLines) badge.classList.add('two-line');

      if (badgeHtml === badgePlain) {
        badge.textContent = badgeHtml;
      } else {
        badge.innerHTML = badgeHtml;
      }
      if (hasPlus || showUnlockableBadge) badge.classList.add('can-buy');
      if (capReached) badge.classList.add('is-maxed');
      tile.appendChild(badge);
    }
    btn.appendChild(tile);
    grid.appendChild(btn);
  }
}

// ---------- Overlay ----------
function ensureShopOverlay() {
  if (shopOverlayEl) return;

  shopOverlayEl = document.createElement('div');
  shopOverlayEl.className = 'shop-overlay';
  shopOverlayEl.id = 'shop-overlay';

  shopSheetEl = document.createElement('div');
  shopSheetEl.className = 'shop-sheet';
  shopSheetEl.setAttribute('role', 'dialog');
  shopSheetEl.setAttribute('aria-modal', 'false');
  shopSheetEl.setAttribute('aria-label', 'Shop');

  const grabber = document.createElement('div');
  grabber.className = 'shop-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'shop-content';

  const header = document.createElement('header');
  header.className = 'shop-header';
  header.innerHTML = `
    <div class="shop-title">Shop</div>
    <div class="shop-line" aria-hidden="true"></div>
  `;

  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.id = 'shop-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Shop Upgrades');

  const scroller = document.createElement('div');
  scroller.className = 'shop-scroller';
  scroller.appendChild(grid);

  content.append(header, scroller);
  ensureCustomScrollbar();

  const actions = document.createElement('div');
  actions.className = 'shop-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shop-close';
  closeBtn.textContent = 'Close';
  
  const delveBtn = document.createElement('button');
  delveBtn.type = 'button';
  delveBtn.className = 'shop-delve';
  delveBtn.textContent = 'Delve';

  const openDelveOverlay = () => {
    if (shouldSkipGhostTap(delveBtn)) return;
    markGhostTapTarget(delveBtn);
    primeTypingSfx();
    openMerchant();
  };

  delveBtn.addEventListener('click', openDelveOverlay);

  delveBtnEl = delveBtn;
  updateDelveGlow = () => {
    if (!delveBtnEl) return;
    const met = hasMetMerchant();
    delveBtnEl.classList.toggle('is-new', !met);
  };
  updateDelveGlow();

  actions.appendChild(closeBtn);
  actions.append(delveBtn);

  shopSheetEl.append(grabber, content, actions);
  shopOverlayEl.appendChild(shopSheetEl);
  document.body.appendChild(shopOverlayEl);

shopOverlayEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  __shopPostOpenPointer = true;
}, { capture: true, passive: true });

shopOverlayEl.addEventListener('touchstart', () => {
  __shopPostOpenPointer = true;
}, { capture: true, passive: true });

shopOverlayEl.addEventListener('click', (e) => {
  if (!IS_MOBILE) return;
  if (!__shopPostOpenPointer) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
}, { capture: true });

  updateShopOverlay(true);


  if (!eventsBound) {
    eventsBound = true;

function onCloseClick(e) {
  if (IS_MOBILE) {
    blockInteraction(80);
  }
  closeShop();
}

closeBtn.addEventListener('click', onCloseClick, { passive: true });

const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
if (hasPointerEvents) {
  closeBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    // Keep marking for safety, but no global suppression
    markGhostTapTarget(closeBtn);
    blockInteraction(80);
    closeShop();
    e.preventDefault();
  }, { passive: false });
} else {
  closeBtn.addEventListener('touchstart', (e) => {
    markGhostTapTarget(closeBtn);
    blockInteraction(80);
    closeShop();
    e.preventDefault();
  }, { passive: false });
}
	
    const onDelvePointerDown = (e) => {
      if (e.pointerType === 'mouse') return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      markGhostTapTarget(delveBtn);
      primeTypingSfx();
      openMerchant();
      e.preventDefault();
    };

    const onDelveTouchStart = (e) => {
      markGhostTapTarget(delveBtn);
      primeTypingSfx();
      openMerchant();
      e.preventDefault();
    };

    if (hasPointerEvents) {
      delveBtn.addEventListener('pointerdown', onDelvePointerDown, { passive: false });
    } else {
      delveBtn.addEventListener('touchstart', onDelveTouchStart, { passive: false });
    }

    document.addEventListener('keydown', onKeydownForShop);
    grabber.addEventListener('pointerdown', onDragStart);
    grabber.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    let _shopBadgeTimer = null;
      const scheduleShopRerender = () => {
        if (!shopOpen) return;
        clearTimeout(_shopBadgeTimer);
        _shopBadgeTimer = setTimeout(() => {
          updateShopOverlay();
        }, 60);
      };

      window.addEventListener('currency:change', scheduleShopRerender);
      window.addEventListener('xp:change', scheduleShopRerender);
      window.addEventListener('xp:unlock', scheduleShopRerender);

    const onUpgradesChanged = () => {
      if (!shopOpen) return;
      updateShopOverlay();
    };

    document.addEventListener('ccc:upgrades:changed', onUpgradesChanged);

    window.addEventListener(MERCHANT_MET_EVENT, () => {
      if (typeof updateDelveGlow === 'function') updateDelveGlow();
      if (shopOpen) updateShopOverlay();
    });
  }
}

// --- Upgrade Fullscreen Overlay ---
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

const IS_COARSE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);

upgOverlayEl.addEventListener('pointerdown', (e) => {
  if (!IS_COARSE) return;
  if (e.pointerType === 'mouse') return;
  if (e.target === upgOverlayEl) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

upgOverlayEl.addEventListener('click', (e) => {
  const IS_COARSE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);
  if (!IS_COARSE) return;
  if (e.target === upgOverlayEl) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
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
      if (IS_COARSE && (!e || e.pointerType !== 'mouse')) {
        try { blockInteraction(120); } catch {}
      }
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
  const IS_COARSE =
    (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);

  if (IS_COARSE) {
    try { blockInteraction(160); } catch {}
  }

  if (typeof upgOverlayCleanup === 'function') {
    const fn = upgOverlayCleanup;
    upgOverlayCleanup = null;
    try { fn(); } catch {}
  }

  upgOpen = false;
  if (!upgOverlayEl || !upgSheetEl) return;
  upgSheetEl.style.transition = '';
  upgSheetEl.style.transform = '';
  upgOverlayEl.classList.remove('is-open');
  upgOverlayEl.style.pointerEvents = 'none';
}

function formatMult(value) {
  if (value instanceof BigNum) return `${formatNumber(value)}x`;

  const asNum = Number(value);
  if (Number.isFinite(asNum)) {
    return formatFourDigitsFloorNumber(asNum) + 'x';
  }

  try {
    const bn = BigNum.fromAny(value);
    return `${formatNumber(bn)}x`;
  } catch {
    return '0x';
  }
}

function formatFourDigitsFloorNumber(v) {
  const abs = Math.abs(v);

  if (abs >= 10000) {
    return formatNumber(BigNum.fromAny(v));
  }

  const intDigits = abs >= 1 ? Math.floor(abs).toString().length : 0;
  const decimals = Math.max(0, 4 - intDigits);

  const groupThousands = (s) => {
    let sign = '';
    if (s.startsWith('-')) { sign = '-'; s = s.slice(1); }
    return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  if (decimals === 0) {
    const floored = (v >= 0) ? Math.floor(v) : Math.ceil(v);
    let s = String(floored);
    if (Math.abs(floored) >= 1000) s = groupThousands(s);
    return s;
  }

  const factor = Math.pow(10, decimals);
  const floored = (v >= 0)
    ? Math.floor(v * factor) / factor
    : Math.ceil(v * factor) / factor;

  let s = floored.toFixed(decimals);
  let [i, f = ''] = s.split('.');
  if (Math.abs(floored) >= 1000) i = groupThousands(i);
  f = f.replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

export function openUpgradeOverlay(upgDef) {
  ensureUpgradeOverlay();
  upgOpen = true;
  let upgOpenLocal = true;

  const areaKey = getCurrentAreaKey();
  const initialLockState = getUpgradeLockState(areaKey, upgDef.id) || {};
  const initialLocked = !!initialLockState.locked;
  const initialMysterious = initialLocked && (
    initialLockState.hidden ||
    initialLockState.hideEffect ||
    initialLockState.hideCost ||
    (typeof initialLockState.iconOverride === 'string' &&
      initialLockState.iconOverride.includes('mysterious'))
  );
  if (initialLocked && !initialMysterious) {
    upgOpen = false;
    return;
  }

  const isHM = (upgDef.upgType === 'HM');
  const ui = () => upgradeUiModel(areaKey, upgDef.id);

  // small helpers
  const spacer = (h) => { const s = document.createElement('div'); s.style.height = h; return s; };
  const makeLine = (html) => { const d = document.createElement('div'); d.className = 'upg-line'; d.innerHTML = html; return d; };

    function recenterUnlockOverlayIfNeeded(model) {
    const content = upgSheetEl.querySelector('.upg-content');
    if (!content) return;

    // Check current lock state so we can skip hidden/mysterious sheets
    const lockState = model?.lockState || getUpgradeLockState(areaKey, upgDef.id) || {};
    const isHiddenUpgrade = !!(
      lockState.hidden ||
      lockState.hideEffect ||
      lockState.hideCost
    );

    // Only do special layout for *visible* unlock-type upgrades.
    // Hidden upgrades should use the normal hidden layout.
    if (!model || !model.unlockUpgrade || isHiddenUpgrade) {
      content.style.marginTop = '';
      return;
    }

    const header  = upgSheetEl.querySelector('.upg-header');
    const actions = upgSheetEl.querySelector('.upg-actions');
    if (!header || !actions) return;

    // Reset first so measurements are clean
    content.style.marginTop = '';

    const headerRect  = header.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    const available = actionsRect.top - headerRect.bottom;
    const freeSpace = available - contentRect.height;
    if (freeSpace <= 0) return;

    const BIAS = 0.42;
    const topOffset = freeSpace * BIAS;

    content.style.marginTop = `${topOffset}px`;
  }

  const rerender = () => {
    const model = ui();
    if (!model) return;

    const lockState = model.lockState || getUpgradeLockState(areaKey, upgDef.id);
    const locked = !!lockState?.locked;
    const isHiddenUpgrade = locked && (
      lockState?.hidden || lockState?.hideEffect || lockState?.hideCost
    );
    const lockHidden = locked && isHiddenUpgrade;

    const isUnlockVisible = !!model.unlockUpgrade && !lockHidden;

    upgSheetEl.classList.toggle('is-locked-hidden', lockHidden);

    const header = upgSheetEl.querySelector('.upg-header');
    header.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'upg-title';
    title.textContent = model.displayTitle || model.upg.title;

    const evolveReady = !!model.hmReadyToEvolve;
    const capReached = evolveReady
      ? false
      : (model.lvlBn?.isInfinite?.()
        ? true
        : (Number.isFinite(model.upg.lvlCap)
          ? model.lvl >= model.upg.lvlCap
          : false));
    const level = document.createElement('div');
    level.className = 'upg-level';
    const capHtml = model.lvlCapFmtHtml ?? model.upg.lvlCapFmtHtml ?? formatNumber(model.lvlCapBn);
    const capPlain = model.lvlCapFmtText ?? model.upg.lvlCapFmtText ?? stripTags(capHtml);
    const levelHtml = evolveReady
      ? `Level ${model.lvlFmtHtml} / ${capHtml} (EVOLVE READY)`
      : (capReached
        ? `Level ${model.lvlFmtHtml} / ${capHtml} (MAXED)`
        : `Level ${model.lvlFmtHtml} / ${capHtml}`);
    const levelPlain = evolveReady
      ? `Level ${model.lvlFmtText} / ${capPlain} (EVOLVE READY)`
      : (capReached
        ? `Level ${model.lvlFmtText} / ${capPlain} (MAXED)`
        : `Level ${model.lvlFmtText} / ${capPlain}`);
    level.innerHTML = levelHtml;
    level.setAttribute('aria-label', levelPlain);
    if (isHiddenUpgrade) {
      level.hidden = true;
    } else {
      level.hidden = false;
      level.removeAttribute('aria-hidden');
    }

    upgSheetEl.classList.toggle('is-maxed', capReached);
    upgSheetEl.classList.toggle('hm-evolve-ready', evolveReady);
    upgSheetEl.classList.toggle('is-unlock-upgrade', isUnlockVisible);
    header.append(title, level);

    const content = upgSheetEl.querySelector('.upg-content');
    content.innerHTML = '';

    const desc = document.createElement('div');
    desc.className = 'upg-desc centered';
    if (lockHidden) desc.classList.add('lock-desc');
    desc.textContent = model.displayDesc || model.upg.desc;
    content.appendChild(desc);

    if (evolveReady) {
      const evolveNote = document.createElement('div');
      evolveNote.className = 'upg-line hm-evolve-note';
      evolveNote.textContent = 'Evolve this upgrade to multiply its effect by 1000x';
      content.appendChild(evolveNote);
    }

    const info = document.createElement('div');
    info.className = 'upg-info';

    info.appendChild(spacer('12px'));
    if (locked && lockState?.reason && !isHiddenUpgrade) {
      const descText = (model.displayDesc || '').trim();
      const reasonText = String(lockState.reason ?? '').trim();
      const isDuplicateNote = descText && descText === reasonText;
      if (!isDuplicateNote) {
        const note = document.createElement('div');
        note.className = 'upg-line lock-note';
        note.textContent = lockState.reason;
        info.appendChild(note);
        info.appendChild(spacer('12px'));
      }
    }
    if (model.effect && !(locked && lockState?.hideEffect)) {
      const effectText = model.effect;
      info.appendChild(makeLine(`<span class="bonus-line">${effectText}</span>`));
      info.appendChild(spacer('12px'));
    }

    // dynamic currency icon based on costType
    const iconHTML    = currencyIconHTML(model.upg.costType);
    const nextPriceBn = model.nextPrice instanceof BigNum
      ? model.nextPrice
      : BigNum.fromAny(model.nextPrice || 0);

    // costs only if not capped and not an unlock-type
    const stopBuying = capReached || evolveReady;
    if (!model.unlockUpgrade && !stopBuying && (!locked || !lockState?.hideCost)) {
      const costs = document.createElement('div');
      costs.className = 'upg-costs';

      const lineCost = document.createElement('div');
      lineCost.className = 'upg-line';
      lineCost.innerHTML = `Cost: ${iconHTML} ${bank[model.upg.costType].fmt(nextPriceBn)}`;
      costs.appendChild(lineCost);

      if (isHM) {
        const lineMilestone = document.createElement('div');
        lineMilestone.className = 'upg-line';
        let milestoneCost = '—';
        try {
          if (model.hmNextMilestone && model.hmNextMilestone.cmp(model.lvlBn) > 0) {
            const deltaBn = model.hmNextMilestone.sub(model.lvlBn);
            const deltaPlain = deltaBn.toPlainIntegerString?.();
            const deltaNum = Math.max(
              0,
              Math.floor(Number(deltaPlain && deltaPlain !== 'Infinity' ? deltaPlain : Number(deltaBn.toString() || 0)))
            );
            const { spent } = evaluateBulkPurchase(
              model.upg,
              model.lvlBn,
              BigNum.fromAny('Infinity'),
              deltaNum,
            );
            milestoneCost = bank[model.upg.costType].fmt(spent);
          }
        } catch {}
        lineMilestone.innerHTML = `Cost to next milestone: ${iconHTML} ${milestoneCost}`;
        costs.appendChild(lineMilestone);
      }

      const lineHave = document.createElement('div');
      lineHave.className = 'upg-line';
      lineHave.innerHTML = `You have: ${iconHTML} ${bank[model.upg.costType].fmt(model.have)}`;
      costs.appendChild(lineHave);

      info.appendChild(costs);
    }

    content.appendChild(info);

    if (isHM) {
      const milestonesRow = document.createElement('div');
      milestonesRow.className = 'hm-view-milestones-row';
      const viewMilestonesBtn = document.createElement('button');
      viewMilestonesBtn.type = 'button';
      viewMilestonesBtn.className = 'shop-delve hm-view-milestones';
      viewMilestonesBtn.textContent = 'View Milestones';
      viewMilestonesBtn.addEventListener('click', () => {
        const milestones = Array.isArray(model.hmMilestones) ? model.hmMilestones : [];
        if (!milestones.length) return;
        const lines = milestones
          .sort((a, b) => (Number(a?.level ?? 0) - Number(b?.level ?? 0)))
          .map((m) => {
            const lvl = Math.max(0, Math.floor(Number(m?.level ?? 0)));
            const mult = formatMultForUi(m?.multiplier ?? m?.mult ?? m?.value ?? 1);
            const target = `${m?.target ?? m?.type ?? 'self'}`.toLowerCase();
            if (target === 'xp') return `L${lvl}: Multiplies XP value by ${mult}x`;
            if (target === 'coin' || target === 'coins') return `L${lvl}: Multiplies Coin value by ${mult}x`;
            if (target === 'mp') return `L${lvl}: Multiplies MP value by ${mult}x`;
            return `L${lvl}: Multiplies this upgrade’s effect by ${mult}x`;
          });
        alert(lines.join('\n'));
      });
      milestonesRow.appendChild(viewMilestonesBtn);
      content.appendChild(milestonesRow);
    }

    // ---------- actions ----------
    const actions = upgSheetEl.querySelector('.upg-actions');
    actions.innerHTML = '';
	
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'shop-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => { upgOpenLocal = false; closeUpgradeMenu(); });

    if ('PointerEvent' in window) {
      closeBtn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        markGhostTapTarget(closeBtn);
        suppressNextGhostTap(320);
        blockInteraction(160);
        upgOpenLocal = false;
        closeUpgradeMenu();
        e.preventDefault();
      }, { passive: false });
    } else {
      closeBtn.addEventListener('touchstart', (e) => {
        markGhostTapTarget(closeBtn);
        suppressNextGhostTap(320);
        blockInteraction(160);
        upgOpenLocal = false;
        closeUpgradeMenu();
        e.preventDefault();
      }, { passive: false });
    }
	
    if (locked) {
      actions.append(closeBtn);
      closeBtn.focus();
    } else if (capReached) {
      actions.append(closeBtn);
      closeBtn.focus();
    } else {
      const canAffordNext = model.have.cmp(nextPriceBn) >= 0;

      if (evolveReady) {
        const evolveBtn = document.createElement('button');
        evolveBtn.type = 'button';
        evolveBtn.className = 'shop-delve hm-evolve-btn';
        evolveBtn.textContent = 'Evolve';
        evolveBtn.addEventListener('click', () => {
          const { evolved } = evolveUpgrade(areaKey, upgDef.id);
          if (!evolved) return;
          playPurchaseSfx();
          updateShopOverlay();
          rerender();
        });
        actions.append(closeBtn, evolveBtn);
        evolveBtn.focus();
        recenterUnlockOverlayIfNeeded(model);
        return;
      }

      if (model.unlockUpgrade) {
        const unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'shop-delve';
        unlockBtn.textContent = 'Unlock';
        unlockBtn.disabled = !canAffordNext;
        unlockBtn.addEventListener('click', () => {
          const { bought } = buyOne(areaKey, upgDef.id);
          const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
          if (!boughtBn.isZero?.()) {
            playPurchaseSfx();
            if (isForgeUnlockUpgrade(upgDef)) {
              try { unlockMerchantTabs(['reset']); } catch {}
            }
            updateShopOverlay();
            rerender();
          }
        });
		
        actions.append(closeBtn, unlockBtn);
        (canAffordNext ? unlockBtn : closeBtn).focus();
        recenterUnlockOverlayIfNeeded(model);
        return;
      }

      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'shop-delve';
      buyBtn.textContent = 'Buy';
      buyBtn.disabled = !canAffordNext;

      // Core buy logic shared by pointer/touch and click fallback
      const performBuy = () => {
        const fresh = upgradeUiModel(areaKey, upgDef.id);
        const priceNow = fresh.nextPrice instanceof BigNum
          ? fresh.nextPrice
          : BigNum.fromAny(fresh.nextPrice || 0);
        if (fresh.have.cmp(priceNow) < 0) return;

        const { bought } = buyOne(areaKey, upgDef.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (boughtBn.isZero?.()) return;

        playPurchaseSfx();
        updateShopOverlay();
        rerender();
      };

      // Mobile: drive purchase off pointer/touch so Safari's click
      // cancellation doesn't limit how fast you can spam the button.
      if ('PointerEvent' in window) {
        buyBtn.addEventListener('pointerdown', (event) => {
          // Ignore mouse here; desktop uses the click handler below
          if (event.pointerType === 'mouse') return;
          if (typeof event.button === 'number' && event.button !== 0) return;

          if (typeof markGhostTapTarget === 'function') {
            // Small window: eats ghost taps that land elsewhere,
            // but repeated taps on this button are still allowed
            markGhostTapTarget(buyBtn, 160);
          }

          performBuy();
          event.preventDefault();
        }, { passive: false });
      } else {
        // Older touch-only browsers
        buyBtn.addEventListener('touchstart', (event) => {
          if (typeof markGhostTapTarget === 'function') {
            markGhostTapTarget(buyBtn, 160);
          }

          performBuy();
          event.preventDefault();
        }, { passive: false });
      }

      // Desktop / non-touch fallback – simple click is fine here.
      buyBtn.addEventListener('click', (event) => {
        // On mobile we already handled the tap in pointer/touch handler
        if (IS_MOBILE) return;

        if (typeof markGhostTapTarget === 'function') {
          markGhostTapTarget(buyBtn, 160);
        }

        performBuy();
      });


      const buyMaxBtn = document.createElement('button');
      buyMaxBtn.type = 'button';
      buyMaxBtn.className = 'shop-delve';
      buyMaxBtn.textContent = 'Buy Max';
      buyMaxBtn.disabled = !canAffordNext;
      buyMaxBtn.addEventListener('click', () => {
        const fresh = upgradeUiModel(areaKey, upgDef.id);
        if (fresh.have.cmp(BigNum.fromInt(1)) < 0) return;
        const { bought } = buyMax(areaKey, upgDef.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (!boughtBn.isZero?.()) {
          playPurchaseSfx();
          updateShopOverlay();
          rerender();
        }
      });

      actions.append(closeBtn, buyBtn, buyMaxBtn);

      // Only HM gets Buy Next
      if (isHM) {
        const buyNextBtn = document.createElement('button');
        buyNextBtn.type = 'button';
        buyNextBtn.className = 'shop-delve';
        buyNextBtn.textContent = 'Buy Next';
        buyNextBtn.disabled = model.have.cmp(BigNum.fromInt(1)) < 0;
        buyNextBtn.addEventListener('click', () => {
          const fresh = upgradeUiModel(areaKey, upgDef.id);
          if (fresh.hmReadyToEvolve) return;
          const target = fresh.hmNextMilestone;
          if (!target || !fresh.lvlBn || target.cmp(fresh.lvlBn) <= 0) {
            const { bought } = buyMax(areaKey, upgDef.id);
            const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
            if (!boughtBn.isZero?.()) {
              playPurchaseSfx();
              updateShopOverlay();
              rerender();
            }
            return;
          }

          let deltaNum = 0;
          try {
            const diffPlain = target.sub(fresh.lvlBn).toPlainIntegerString?.();
            if (diffPlain && diffPlain !== 'Infinity') deltaNum = Number(diffPlain);
            else deltaNum = Number(target.sub(fresh.lvlBn).toString());
          } catch {}
          deltaNum = Math.max(0, Math.floor(deltaNum));

          const walletRaw = bank[fresh.upg.costType]?.value;
          const walletBn = walletRaw instanceof BigNum
            ? walletRaw
            : BigNum.fromAny(walletRaw ?? 0);
          const evalResult = evaluateBulkPurchase(fresh.upg, fresh.lvlBn, walletBn, deltaNum);
          const count = evalResult.count;
          let reachable = false;
          try {
            const plain = count?.toPlainIntegerString?.();
            if (plain && plain !== 'Infinity') reachable = Number(plain) >= deltaNum;
            else reachable = Number(count ?? 0) >= deltaNum;
          } catch {}

          const purchase = reachable
            ? buyTowards(areaKey, upgDef.id, deltaNum)
            : buyMax(areaKey, upgDef.id);
          const boughtBn = purchase.bought instanceof BigNum
            ? purchase.bought
            : BigNum.fromAny(purchase.bought ?? 0);
          if (!boughtBn.isZero?.()) {
            playPurchaseSfx();
            updateShopOverlay();
            rerender();
          }
        });
        actions.appendChild(buyNextBtn);
      }

      (canAffordNext ? buyBtn : closeBtn).focus();
    }
	
	recenterUnlockOverlayIfNeeded(model);
  };

  const onCurrencyChange = () => {
    if (!upgOpenLocal) return;
    rerender();
  };

  const onUpgradesChanged = () => {
    if (!upgOpenLocal) return;
    rerender();
  };

    window.addEventListener('currency:change', onCurrencyChange);
    window.addEventListener('xp:change', onCurrencyChange);
    window.addEventListener('xp:unlock', onCurrencyChange);
    document.addEventListener('ccc:upgrades:changed', onUpgradesChanged);

  // open + animate
  rerender();
  upgOverlayEl.classList.add('is-open');
  upgOverlayEl.style.pointerEvents = 'auto';
  blockInteraction(140);
  upgSheetEl.style.transition = 'none';
  upgSheetEl.style.transform = 'translateY(100%)';
  void upgSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    upgSheetEl.style.transition = '';
    upgSheetEl.style.transform = '';
  });

  // ESC to close
  const onKey = (e) => {
    if (!upgOpenLocal) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      upgOpenLocal = false;
      closeUpgradeMenu();
    }
  };
  window.addEventListener('keydown', onKey, true);

  upgOverlayCleanup = () => {
    upgOpenLocal = false;
      window.removeEventListener('currency:change', onCurrencyChange);
      window.removeEventListener('xp:change', onCurrencyChange);
      window.removeEventListener('xp:unlock', onCurrencyChange);
	  document.removeEventListener('ccc:upgrades:changed', onUpgradesChanged);
      window.removeEventListener('keydown', onKey, true);
  };
}

// ---------- Controls ----------
function onKeydownForShop(e) {
  if (!shopOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeShop();
  }
}

export function openShop() {
  ensureShopOverlay();

  if (shopCloseTimer) {
    clearTimeout(shopCloseTimer);
    shopCloseTimer = null;
  }

  if (typeof updateDelveGlow === 'function') updateDelveGlow();
  updateShopOverlay(true);

  if (shopOpen) return;

  shopOpen = true;
  shopSheetEl.style.transition = 'none';
  shopSheetEl.style.transform = '';
  shopOverlayEl.style.pointerEvents = 'auto';

  void shopSheetEl.offsetHeight;
requestAnimationFrame(() => {
shopSheetEl.style.transition = '';
shopOverlayEl.classList.add('is-open');

__shopOpenStamp = performance.now(); // harmless to keep
__shopPostOpenPointer = false;

// Optional now; can keep or delete
if (IS_MOBILE) {
  try {
    setTimeout(() => suppressNextGhostTap(240), 120);
  } catch {}
}

  blockInteraction(10);
  ensureCustomScrollbar();
  const focusable =
    shopOverlayEl.querySelector('#shop-grid .shop-upgrade') ||
    shopOverlayEl.querySelector('#shop-grid');
  if (focusable) focusable.focus();
});
}

export function closeShop(force = false) {
  const forceClose = force === true;
  const overlayOpen = shopOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !shopOpen && !overlayOpen) {
    if (shopCloseTimer) {
      clearTimeout(shopCloseTimer);
      shopCloseTimer = null;
    }
    return;
  }

  if (shopCloseTimer) {
    clearTimeout(shopCloseTimer);
    shopCloseTimer = null;
  }

  shopOpen = false;
  if (shopSheetEl) {
    shopSheetEl.style.transition = '';
    shopSheetEl.style.transform = '';
  }
  shopOverlayEl.classList.remove('is-open');
  shopOverlayEl.style.pointerEvents = 'none';
  __shopPostOpenPointer = false;
}

// ---------- Drag ----------
function onDragStart(e) {
  if (!shopOpen) return;

  const clientY = typeof e.clientY === 'number'
    ? e.clientY
    : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

  drag = { startY: clientY, lastY: clientY, startT: performance.now(), moved: 0, canceled: false };
  shopSheetEl.style.transition = 'none';

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
}

function onDragMove(e) {
  if (!drag || drag.canceled) return;
  const y = e.clientY;
  if (typeof y !== 'number') return;

  const dy = Math.max(0, y - drag.startY);
  drag.lastY = y;
  drag.moved = dy;
  shopSheetEl.style.transform = `translateY(${dy}px)`;
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
    shopSheetEl.style.transition = 'transform 140ms ease-out';
    shopSheetEl.style.transform = 'translateY(100%)';
    shopOpen = false;

    shopCloseTimer = setTimeout(() => {
      shopCloseTimer = null;
      closeShop(true);
    }, 150);
  } else {
    shopSheetEl.style.transition = 'transform 180ms ease';
    shopSheetEl.style.transform = 'translateY(0)';
  }

  cleanupDrag();
}

function onDragCancel() {
  if (!drag) return;
  drag.canceled = true;
  shopSheetEl.style.transition = 'transform 180ms ease';
  shopSheetEl.style.transform = 'translateY(0)';
  cleanupDrag();
}

function cleanupDrag() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragCancel);
  drag = null;
}

export function updateShopOverlay(force = false) {
  if (!force && !shopOpen) return;
  buildUpgradesData();
  renderShopGrid();
}

export function setUpgradeCount() { updateShopOverlay(true); }

export function getUpgrades() { return upgrades; }
