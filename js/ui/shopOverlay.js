// js/ui/shopOverlay.js

import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { openMerchant,
    ensureMerchantOverlay,
    primeTypingSfx,
    unlockMerchantTabs
} from './delveTabDlg.js';
import { takePreloadedAudio } from '../util/audioCache.js';
import {
  AREA_KEYS,
  getCurrentAreaKey,
  getUpgradesForArea,
  getLevel,
  getLevelNumber,
  getIconUrl,
  upgradeUiModel,
  buyOne,
  buyMax,
  evaluateBulkPurchase,
  getUpgradeLockState,
} from '../game/upgrades.js';


let shopOverlayEl = null;
let shopSheetEl = null;
let shopOpen = false;
let drag = null; // {startY, lastY, startT, moved, canceled}
let eventsBound = false;
const IS_MOBILE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);

const ICON_DIR = 'img/';
const BASE_ICON_SRC_BY_COST = {
  coins: 'img/currencies/coin/coin_base.png',
  books: 'img/currencies/book/book_base.png',
};
const CURRENCY_ICON_SRC = {
  coins: 'img/currencies/coin/coin.png',
  books: 'img/currencies/book/book.png',
};

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
  const scroller = shopOverlayEl?.querySelector('.shop-content');
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

  const updateAll = () => { updateBounds(); updateThumb(); };

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
    const lockState = getUpgradeLockState(areaKey, def);
    const icon = lockState.iconOverride ?? getIconUrl(def);
    const title = lockState.titleOverride ?? def.title;
    const desc = lockState.descOverride ?? def.desc;
    const locked = !!lockState.locked;
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

  if (lvlBn.isInfinite?.()) {
    return BigNum.fromInt(0);
  }

  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  const lvl = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));

  const walletEntry = bank[upg.costType];
  const walletValue = walletEntry?.value;
  const walletBn = walletValue instanceof BigNum
    ? walletValue
    : BigNum.fromAny(walletValue ?? 0);

  if (walletBn.isZero?.()) return BigNum.fromInt(0);

  if (walletBn.isInfinite?.()) {
    const isHmType = (upg?.upgType === 'HM');
    const maxed = Number.isFinite(cap) && (lvl >= cap);

    if (isHmType && !maxed) {
      return BigNum.fromAny('Infinity');
    }

    if (!Number.isFinite(cap)) {
      return BigNum.fromAny('Infinity');
    }
    return levelsRemainingToCap(upg, lvlBn, currentLevelNumeric);
  }

  if (Number.isFinite(cap) && lvl >= cap) return BigNum.fromInt(0);

  try {
    const c0 = BigNum.fromAny(upg.costAtLevel(lvl));
    const c1 = BigNum.fromAny(upg.costAtLevel(lvl + 1));
    const isFlat = c0?.cmp?.(c1) === 0;

    if (isFlat) {
      const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : Number.MAX_SAFE_INTEGER;

      let lo = 0;
      let hi = Math.max(0, room);

      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const midBn = BigNum.fromInt(mid);
        const total = typeof c0.mulBigNumInteger === 'function'
          ? c0.mulBigNumInteger(midBn)
          : BigNum.fromAny(c0 ?? 0).mulBigNumInteger(midBn);
        if (total.cmp(walletBn) <= 0) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return BigNum.fromInt(lo);
    }
  } catch {
  }

  const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : undefined;
  const { count } = evaluateBulkPurchase(upg, lvl, walletBn, room, { fastOnly: true });
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
    btn.classList.toggle('is-locked', locked);
    if (locked) {
      btn.setAttribute('aria-disabled', 'true');
      btn.dataset.locked = '1';
    } else {
      btn.removeAttribute('aria-disabled');
      btn.dataset.locked = '0';
    }

    const canPlusBn = locked
      ? BigNum.fromInt(0)
      : computeAffordableLevels(upg.meta, upg.levelNumeric, upg.level);
    const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
    const levelHtml = formatNumber(upg.level);
    const levelPlain = stripTags(levelHtml);
    const plusHtml = formatNumber(plusBn);
    const plusPlain = stripTags(plusHtml);
    const hasPlus = !plusBn.isZero?.();
    let badgeHtml;
    let badgePlain;
    if (locked) {
      badgeHtml = '';
      badgePlain = '';
      const reason = upg.lockState?.reason;
      const ariaLabel = reason
        ? `${upg.title} (Locked, ${reason})`
        : `${upg.title} (Locked)`;
      btn.setAttribute('aria-label', ariaLabel);
    } else {
      badgeHtml = hasPlus ? `${levelHtml} (+${plusHtml})` : levelHtml;
      badgePlain = hasPlus ? `${levelPlain} (+${plusPlain})` : levelPlain;
      btn.setAttribute('aria-label', `${upg.title}, level ${badgePlain}`);
    }
    if (locked) {
      btn.title = upg.lockState?.reason || 'Locked upgrade';
    } else {
      btn.title = 'Left-click: Details • Right-click: Buy Max';
    }

    const tile = document.createElement('div');
    tile.className = 'shop-tile';


    const baseImg = document.createElement('img');
    baseImg.className = 'base';
    const costType = upg.meta?.costType || 'coins';
    baseImg.src = BASE_ICON_SRC_BY_COST[costType] || BASE_ICON_SRC_BY_COST.coins;
    baseImg.alt = '';
    baseImg.decoding = 'async';
    baseImg.loading = 'lazy';

    const iconImg = document.createElement('img');
    iconImg.className = 'icon';
    iconImg.src = upg.icon || TRANSPARENT_PX;
    iconImg.alt = '';
    iconImg.decoding = 'async';
    iconImg.loading = 'lazy';
    iconImg.addEventListener('error', () => { iconImg.src = TRANSPARENT_PX; });

    btn.addEventListener('click', () => openUpgradeOverlay(upg.meta));

    // Right-click: Buy Max (desktop)
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
        buildUpgradesData();
        renderShopGrid();
      }
    });

    if (!locked) {
      const badge = document.createElement('span');
      badge.className = 'level-badge';
      if (badgeHtml === badgePlain) {
        badge.textContent = badgeHtml;
      } else {
        badge.innerHTML = badgeHtml;
      }
      if (hasPlus) badge.classList.add('can-buy');
      tile.append(baseImg, iconImg, badge);
    } else {
      tile.append(baseImg, iconImg);
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
  shopOverlayEl.setAttribute('aria-hidden', 'true');

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
    <div class="shop-title">SHOP</div>
    <div class="shop-line" aria-hidden="true"></div>
  `;

  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.id = 'shop-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Shop Upgrades');

  content.append(header, grid);
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

  delveBtn.addEventListener('click', () => {
    primeTypingSfx();
    openMerchant();
  });

  actions.appendChild(closeBtn);
  actions.append(delveBtn);

  shopSheetEl.append(grabber, content, actions);
  shopOverlayEl.appendChild(shopSheetEl);
  document.body.appendChild(shopOverlayEl);

  buildUpgradesData();
  renderShopGrid();

  if (!eventsBound) {
    eventsBound = true;

    closeBtn.addEventListener('click', closeShop);
    document.addEventListener('keydown', onKeydownForShop);
    grabber.addEventListener('pointerdown', onDragStart);
    grabber.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    // === Debounced live update for (+N) badge and green state ===
    let _shopBadgeTimer = null;
    window.addEventListener('currency:change', () => {
      if (!shopOpen) return;
      clearTimeout(_shopBadgeTimer);
      _shopBadgeTimer = setTimeout(() => {
        buildUpgradesData();
        renderShopGrid();
      }, 60); // debounce avoids spamming on rapid tick updates
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
  upgOverlayEl.setAttribute('aria-hidden', 'true');

  upgSheetEl = document.createElement('div');
  upgSheetEl.className = 'upg-sheet';
  upgSheetEl.setAttribute('role', 'dialog');
  upgSheetEl.setAttribute('aria-modal', 'false');
  upgSheetEl.setAttribute('aria-label', 'Upgrade');

  // Top grabber (visual consistency with other sheets)
  const grab = document.createElement('div');
  grab.className = 'upg-grabber';
  grab.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  // Header + content areas
  const header = document.createElement('header');
  header.className = 'upg-header';

  const content = document.createElement('div');
  content.className = 'upg-content'; // scroll area

  // Actions row at bottom (reuse shop button tints)
  const actions = document.createElement('div');
  actions.className = 'upg-actions';

  upgSheetEl.append(grab, header, content, actions);
  upgOverlayEl.appendChild(upgSheetEl);
  document.body.appendChild(upgOverlayEl);

  // Pull-up drag to close (same feel as other sheets)
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
  function onDragEnd() {
    if (!drag) return;
    const shouldClose = drag.moved > 140;
    upgSheetEl.style.transition = 'transform 160ms ease';
    upgSheetEl.style.transform = shouldClose ? 'translateY(100%)' : 'translateY(0)';
    if (shouldClose) setTimeout(closeUpgradeMenu, 160);
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
  }
  grab.addEventListener('pointerdown', onDragStart, { passive: true });
}

function closeUpgradeMenu() {
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
  upgOverlayEl.setAttribute('aria-hidden', 'true');
}

function formatMult(value) {
  if (value instanceof BigNum) {
    return `${formatNumber(value)}x`;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      const bn = BigNum.fromAny(value);
      return `${formatNumber(bn)}x`;
    }

    let s = value.toFixed(3);
    s = s.replace(/\.?0+$/, '');
    return s + 'x';
  }

  try {
    const bn = BigNum.fromAny(value ?? 0);
    return `${formatNumber(bn)}x`;
  } catch {
    const fallback = Number(value) || 0;
    let s = fallback.toFixed(3);
    s = s.replace(/\.?0+$/, '');
    return s + 'x';
  }
}

export function openUpgradeOverlay(upgDef) {
  ensureUpgradeOverlay();
  upgOpen = true;
  let upgOpenLocal = true;

  const areaKey = getCurrentAreaKey();
  const isHM = (upgDef.upgType === 'HM');
  const ui = () => upgradeUiModel(areaKey, upgDef.id);

  // small helpers
  const spacer = (h) => { const s = document.createElement('div'); s.style.height = h; return s; };
  const makeLine = (html) => { const d = document.createElement('div'); d.className = 'upg-line'; d.innerHTML = html; return d; };

  const rerender = () => {
    const model = ui();
    if (!model) return;

    const lockState = model.lockState || getUpgradeLockState(areaKey, upgDef.id);
    const locked = !!lockState?.locked;
    const isHiddenUpgrade = locked && (
      lockState?.hidden || lockState?.hideEffect || lockState?.hideCost
    );

    const header = upgSheetEl.querySelector('.upg-header');
    header.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'upg-title';
    title.textContent = model.displayTitle || model.upg.title;

    const capReached = model.lvlBn?.isInfinite?.()
      ? true
      : (Number.isFinite(model.upg.lvlCap)
        ? model.lvl >= model.upg.lvlCap
        : false);
    const level = document.createElement('div');
    level.className = 'upg-level';
    const capHtml = model.lvlCapFmtHtml ?? model.upg.lvlCapFmtHtml ?? formatNumber(model.lvlCapBn);
    const capPlain = model.lvlCapFmtText ?? model.upg.lvlCapFmtText ?? stripTags(capHtml);
    const levelHtml = capReached
      ? `Level ${model.lvlFmtHtml} / ${capHtml} (MAX)`
      : `Level ${model.lvlFmtHtml} / ${capHtml}`;
    const levelPlain = capReached
      ? `Level ${model.lvlFmtText} / ${capPlain} (MAX)`
      : `Level ${model.lvlFmtText} / ${capPlain}`;
    level.innerHTML = levelHtml;
    level.setAttribute('aria-label', levelPlain);
    if (isHiddenUpgrade) {
      level.hidden = true;
      level.setAttribute('aria-hidden', 'true');
    } else {
      level.hidden = false;
      level.removeAttribute('aria-hidden');
    }

    upgSheetEl.classList.toggle('is-maxed', capReached);
    header.append(title, level);

    const content = upgSheetEl.querySelector('.upg-content');
    content.innerHTML = '';

    const desc = document.createElement('div');
    desc.className = 'upg-desc centered';
    desc.textContent = model.displayDesc || model.upg.desc;
    content.appendChild(desc);

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
    const effectMultiplierFn = model.upg.effectMultiplier;
    let hasMultiplierLine = false;
    if (!locked && typeof effectMultiplierFn === 'function') {
      const mult = effectMultiplierFn(model.lvl);
      const multStr = formatMult(mult);
      const multHtml = multStr.includes('∞') ? multStr.replace('∞', '<span class="infty">∞</span>') : multStr;
      info.appendChild(
        makeLine(`<span class="bonus-line">Coin spawn rate bonus: ${multHtml}</span>`)
      );
      info.appendChild(spacer('12px'));
      hasMultiplierLine = true;
    }
    if (model.effect && !(locked && lockState?.hideEffect)) {
      const effectText = model.effect;
      const effectPrefix = effectText.split(':')[0]?.trim().toLowerCase();
      const duplicateBonus = hasMultiplierLine && effectPrefix === 'coin spawn rate bonus';
      if (!duplicateBonus) {
        info.appendChild(makeLine(`<span class="bonus-line">${effectText}</span>`));
        info.appendChild(spacer('12px'));
      }
    }

    // dynamic currency icon based on costType
    const iconHTML    = currencyIconHTML(model.upg.costType);
    const nextPriceBn = model.nextPrice instanceof BigNum
      ? model.nextPrice
      : BigNum.fromAny(model.nextPrice || 0);

    // costs only if not capped
    if (!capReached && (!locked || !lockState?.hideCost)) {
      const costs = document.createElement('div');
      costs.className = 'upg-costs';

      const lineCost = document.createElement('div');
      lineCost.className = 'upg-line';
      lineCost.innerHTML = `Cost: ${iconHTML} ${bank[model.upg.costType].fmt(nextPriceBn)}`;
      costs.appendChild(lineCost);

      if (isHM) {
        const lineMilestone = document.createElement('div');
        lineMilestone.className = 'upg-line';
        // milestone total cost will be wired later
        lineMilestone.innerHTML = `Cost to next milestone: ${iconHTML} —`;
        costs.appendChild(lineMilestone);
      }

      const lineHave = document.createElement('div');
      lineHave.className = 'upg-line';
      lineHave.innerHTML = `You have: ${iconHTML} ${bank[model.upg.costType].fmt(model.have)}`;
      costs.appendChild(lineHave);

      info.appendChild(costs);
    }

    content.appendChild(info);

    // ---------- actions ----------
    const actions = upgSheetEl.querySelector('.upg-actions');
    actions.innerHTML = '';

    // Close (always)
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'shop-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => { upgOpenLocal = false; closeUpgradeMenu(); });

    if (locked) {
      actions.append(closeBtn);
      closeBtn.focus();
    } else if (capReached) {
      // MAX: only Close (no Buy/Buy Max/Buy Next)
      actions.append(closeBtn);
      closeBtn.focus();
    } else {
      const canAffordNext = model.have.cmp(nextPriceBn) >= 0;

      // Buy 1 — with fresh re-check before spending
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'shop-delve';
      buyBtn.textContent = 'Buy';
      buyBtn.disabled = !canAffordNext;
      buyBtn.addEventListener('click', () => {
        const fresh = upgradeUiModel(areaKey, upgDef.id);
        const priceNow = fresh.nextPrice instanceof BigNum
          ? fresh.nextPrice
          : BigNum.fromAny(fresh.nextPrice || 0);
        if (fresh.have.cmp(priceNow) < 0) return;

        const { bought } = buyOne(areaKey, upgDef.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (!boughtBn.isZero?.()) {
          playPurchaseSfx();
          buildUpgradesData();
          renderShopGrid();
          rerender();
        }
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
          buildUpgradesData();
          renderShopGrid();
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
        // TODO: hook milestone purchasing when milestones are added
        actions.appendChild(buyNextBtn);
      }

      (canAffordNext ? buyBtn : closeBtn).focus();
    }
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
  document.addEventListener('ccc:upgrades:changed', onUpgradesChanged);

  // open + animate
  rerender();
  upgOverlayEl.classList.add('is-open');
  upgOverlayEl.setAttribute('aria-hidden', 'false');
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

  // Always rebuild UI data & recompute potential levels on open
  buildUpgradesData();
  renderShopGrid();

  if (shopOpen) return;

  shopOpen = true;
  shopSheetEl.style.transition = 'none';
  shopSheetEl.style.transform = '';
  shopOverlayEl.setAttribute('aria-hidden', 'false');

  void shopSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    shopSheetEl.style.transition = '';
    shopOverlayEl.classList.add('is-open');
    ensureCustomScrollbar();
    const focusable =
      shopOverlayEl.querySelector('#shop-grid .shop-upgrade') ||
      shopOverlayEl.querySelector('#shop-grid');
    if (focusable) focusable.focus();
  });
}

export function closeShop() {
  if (!shopOpen) return;
  if (shopSheetEl) {
    shopSheetEl.style.transition = '';
    shopSheetEl.style.transform = '';
  }
  shopOpen = false;
  shopOverlayEl.classList.remove('is-open');
  shopOverlayEl.setAttribute('aria-hidden', 'true');
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
    shopSheetEl.style.transition = 'transform 140ms ease-out';
    shopSheetEl.style.transform = 'translateY(100%)';
    setTimeout(closeShop, 150);
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

// ---------- API ----------
export function setUpgradeCount() { buildUpgradesData(); renderShopGrid(); }

export function getUpgrades() { return upgrades; }
