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
    getAutomationUpgradesAdapterData,
    buyAutomationUpgrade,
    buyMaxAutomationUpgrade,
    getAutomationUiModel
} from '../game/automationUpgrades.js';


let shopOverlayEl = null;
let shopSheetEl = null;
let shopOpen = false;
let eventsBound = false;
let delveBtnEl = null;
let updateDelveGlow = null;
let shopCloseTimer = null;
let __shopOpenStamp = 0;
let __shopPostOpenPointer = false;

// Mode state: 'standard' or 'automation'
let currentShopMode = 'standard';

const SHOP_ADAPTERS = {
    standard: {
        title: 'Shop',
        delveButtonVisible: true,
        getUiData: () => {
            const areaKey = getCurrentAreaKey();
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
        },
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
        getUiData: () => getAutomationUpgradesAdapterData(),
        getUiModel: (id) => getAutomationUiModel(id),
        buyOne: (id) => buyAutomationUpgrade(id),
        buyMax: (id) => buyMaxAutomationUpgrade(id),
        buyNext: () => ({ bought: BigNum.fromInt(0) }), // Not supported yet
        getLockState: () => ({ locked: false }),
        evolve: () => ({ evolved: false }),
        events: ['ccc:automation:changed', 'currency:change']
    }
};

function getAdapter() {
    return SHOP_ADAPTERS[currentShopMode] || SHOP_ADAPTERS.standard;
}

if (typeof window !== 'undefined') {
  window.addEventListener('debug:change', (e) => {
    const activeSlot = typeof getActiveSlot === 'function' ? getActiveSlot() : null;
    const targetSlot = e?.detail?.slot ?? activeSlot;
    if (activeSlot != null && targetSlot != null && activeSlot !== targetSlot) return;
    updateShopOverlay(true);
  });
}

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
const CURRENCY_ICON_SRC = {
  coins: 'img/currencies/coin/coin.webp',
  books: 'img/currencies/book/book.webp',
  gold: 'img/currencies/gold/gold.webp',
  magic: 'img/currencies/magic/magic.webp',
  gears: 'img/currencies/gear/gear.webp',
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
  return currentShopMode === 'standard' && resolveUpgradeId(upgLike) === FORGE_UNLOCK_UPGRADE_ID;
}

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

function openHmMilestoneDialog(lines) {
  const existing = document.querySelector('.hm-milestones-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'hm-milestones-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Milestones');

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

    if (line && typeof line === 'object') {
      text.textContent = line.text ?? '';
      if (line.achieved) li.classList.add('hm-milestone-achieved');
    } else {
      text.textContent = line;
    }

    li.appendChild(text);
    list.appendChild(li);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hm-milestones-close';
  closeBtn.textContent = 'Close';

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown);
  };

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);

  dialog.appendChild(title);
  dialog.appendChild(list);
  dialog.appendChild(closeBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  if (typeof closeBtn.focus === 'function') {
    closeBtn.focus({ preventScroll: true });
  }
}

function stripTags(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '');
}

const PURCHASE_SFX_SRC = 'sounds/purchase_upg.ogg';
const EVOLVE_SFX_SRC = 'sounds/evolve_upg.ogg';
const MOBILE_PURCHASE_VOLUME = 0.12;
const DESKTOP_PURCHASE_VOLUME = 0.3;

function createSfxPlayer({ src, mobileVolume, desktopVolume }) {
  let base = null;
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

    if (!('AudioContext' in window || 'webkitAudioContext' in window)) {
      return false;
    }

    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      ac = null;
      return false;
    }

    if (!ac) return false;

    if (ac.state === 'suspended') {
      try { ac.resume(); } catch (_) {}
    }

    if (!gain) {
      gain = ac.createGain();
      gain.connect(ac.destination);
    }

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
          const ret = ac.decodeAudioData(buf, onOk, onErr);
          if (ret && typeof ret.then === 'function') {
            ret.then(onOk, onErr);
          }
        }))
        .then((decoded) => {
          buffer = decoded;
          bufferPromise = null;
          bufferPromiseHandled = false;
          return decoded;
        })
        .catch(() => {
          bufferPromise = null;
          bufferPromiseHandled = false;
          return null;
        });
      bufferPromiseHandled = false;
    } catch (_) {
      bufferPromise = null;
      bufferPromiseHandled = false;
    }

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

        const t = ac.currentTime;
        try {
          gain.gain.setValueAtTime(mobileVolume, t);
        } catch (_) {
          gain.gain.value = mobileVolume;
        }

        node.start();
        return true;
      } catch (_) {
        return false;
      }
    };

    if (buffer) {
      return playBuffer(buffer);
    }

    pendingPlays += 1;

    if (!bufferPromise) {
      ensureBuffer();
    }

    if (!bufferPromise) {
      const plays = Math.max(1, pendingPlays);
      pendingPlays = 0;
      for (let i = 0; i < plays; i += 1) {
        playMobileFallback();
      }
      return true;
    }

    if (bufferPromise && !bufferPromiseHandled) {
      bufferPromiseHandled = true;
      bufferPromise.then((decoded) => {
        const plays = Math.max(1, pendingPlays);
        pendingPlays = 0;

        if (!decoded) {
          for (let i = 0; i < plays; i += 1) {
            playMobileFallback();
          }
          return;
        }

        for (let i = 0; i < plays; i += 1) {
          if (!playBuffer(decoded)) {
            playMobileFallback();
            break;
          }
        }
      });
    }

    return true;
  }

  function playDesktop() {
    const baseAudio = ensureBase();
    if (!baseAudio) return;

    baseAudio.volume = desktopVolume;
    const a = baseAudio.cloneNode();
    a.volume = desktopVolume;
    a.play().catch(() => {});
  }

  return {
    play() {
      try {
        if (IS_MOBILE) {
          if (playMobileWebAudio()) return;
          playMobileFallback();
          return;
        }

        playDesktop();
      } catch {}
    },
  };
}

const purchaseSfx = createSfxPlayer({
  src: PURCHASE_SFX_SRC,
  mobileVolume: MOBILE_PURCHASE_VOLUME,
  desktopVolume: DESKTOP_PURCHASE_VOLUME,
});

const evolveSfx = createSfxPlayer({
  src: EVOLVE_SFX_SRC,
  mobileVolume: MOBILE_PURCHASE_VOLUME * 2,
  desktopVolume: DESKTOP_PURCHASE_VOLUME * 2,
});

export function playPurchaseSfx() {
  purchaseSfx.play();
}

function playEvolveSfx() {
  evolveSfx.play();
}

function currencyIconHTML(type) {
  const src = CURRENCY_ICON_SRC[type] || CURRENCY_ICON_SRC.coins;
  return `<img alt="" src="${src}" class="currency-ico">`;
}

// 1×1 transparent WebP (fallback when an icon is missing)
const TRANSPARENT_PX =
  "data:image/webp;base64,UklGRhIAAABXRUJQVlA4IBgAAAAwAQCdASoIAAIAAAAcJaQAA3AA";

// Upgrades registry (minimal for now)
let upgrades = {};

// ---------- Custom Scrollbar ----------
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
    const grab = overlayEl.querySelector('.shop-grabber');
    const header = overlayEl.querySelector('.shop-header');
    const actions = overlayEl.querySelector('.shop-actions');

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
    sheetEl.classList.add('is-scrolling');
    clearTimeout(scroller.__fadeTimer);
  };
  const scheduleHide = (delay) => {
    if (!isTouch) return;
    clearTimeout(scroller.__fadeTimer);
    scroller.__fadeTimer = setTimeout(() => {
      sheetEl.classList.remove('is-scrolling');
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
  upgrades = getAdapter().getUiData();
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
    // Note: for standard upgrades, costAtLevel is available. For automation, it might not be if we don't expose it.
    // Standard shop logic relies on `upg.costAtLevel` existing on the meta object.
    // If not, we fallback to evaluateBulkPurchase which needs to be robust.
    
    if (typeof upg.costAtLevel === 'function') {
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

  const adapter = getAdapter();

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
    const levelIsInfinite = isHM && upg.level?.isInfinite?.();
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
    const capReached = evolveReady
      ? false
      : (levelIsInfinite
        ? true
        : (hasFiniteCap && Number.isFinite(levelNumber)
          ? levelNumber >= capNumber
          : false));
    const isSingleLevelCap = hasFiniteCap && capNumber === 1;
    const isUnlockUpgrade = !!upg.meta?.unlockUpgrade;
    const showUnlockableBadge = !locked && isUnlockUpgrade && !capReached;
    const showUnlockedBadge = !locked && isUnlockUpgrade && !showUnlockableBadge && capReached;
    let badgeHtml;
    let badgePlain;
    let needsTwoLines = false;
    let isTextBadge = false;

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
    isTextBadge = true;
    btn.setAttribute('aria-label', `${upg.title}, ${badgePlain}`);
  } else if (!locked && isSingleLevelCap && !isUnlockUpgrade) {
    if (capReached) {
      badgeHtml = 'Owned';
      badgePlain = 'Owned';
    } else if (hasPlus) {
      badgeHtml = 'Purchasable';
      badgePlain = 'Purchasable';
    } else {
      badgeHtml = 'Not Owned';
      badgePlain = 'Not Owned';
    }
    isTextBadge = true;
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
      openUpgradeOverlay(upg.meta);
    });

    btn.addEventListener('contextmenu', (e) => {
      if (IS_MOBILE) return;
      if (locked) return;
      e.preventDefault();
      e.stopPropagation();
      const { bought } = adapter.buyMax(upg.id);
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
      if (isTextBadge) badge.classList.add('text-badge');
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
  // Title is set in updateShopOverlay
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
  ensureCustomScrollbar(shopOverlayEl, shopSheetEl);

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

  const openDelveOverlay = (e) => {
    if (e && e.isTrusted && shouldSkipGhostTap(delveBtn)) return;
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

    document.addEventListener('keydown', onKeydownForShop);
    
    setupDragToClose(grabber, shopSheetEl, () => shopOpen, () => {
        shopOpen = false;
        shopCloseTimer = setTimeout(() => {
          shopCloseTimer = null;
          closeShop(true);
        }, 150);
    });

    // Event binding is now dynamic based on openShop()
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

upgOverlayEl.addEventListener('pointerdown', (e) => {
  if (!IS_MOBILE) return;
  if (e.pointerType === 'mouse') return;
  if (e.target === upgOverlayEl) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

upgOverlayEl.addEventListener('click', (e) => {
  if (!IS_MOBILE) return;
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
      if (IS_MOBILE && (!e || e.pointerType !== 'mouse')) {
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
  if (IS_MOBILE) {
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

  const adapter = getAdapter();

  const areaKey = getCurrentAreaKey(); // Only used for standard shop, but harmless
  const initialLockState = adapter.getLockState(upgDef.id) || {};
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
  const isEndlessXp = (upgDef.tie === UPGRADE_TIES.ENDLESS_XP);
  const ui = () => adapter.getUiModel(upgDef.id);

  // small helpers
  const spacer = (h) => { const s = document.createElement('div'); s.style.height = h; return s; };
  const makeLine = (html) => { const d = document.createElement('div'); d.className = 'upg-line'; d.innerHTML = html; return d; };

    function recenterUnlockOverlayIfNeeded(model) {
    const content = upgSheetEl.querySelector('.upg-content');
    if (!content) return;

    // Check current lock state so we can skip hidden/mysterious sheets
    const lockState = model?.lockState || adapter.getLockState(upgDef.id) || {};
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

    const lockState = model.lockState || adapter.getLockState(upgDef.id);
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
    content.scrollTop = 0;
    upgSheetEl.classList.toggle('is-hm-upgrade', isHM && !isHiddenUpgrade);
    upgSheetEl.classList.toggle('is-endless-xp', isEndlessXp);

    const desc = document.createElement('div');
    desc.className = 'upg-desc centered';
    if (lockHidden) desc.classList.add('lock-desc');
    const baseDesc = (model.displayDesc || model.upg.desc || '').trim();
    if (evolveReady) {
      desc.classList.add('hm-evolve-note');
      desc.textContent = 'Evolve this upgrade to multiply its effect by 1000x';
    } else if (baseDesc) {
      desc.textContent = baseDesc;
    } else {
      desc.hidden = true;
    }
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

    if (isHM && !isHiddenUpgrade) {
      const milestonesRow = document.createElement('div');
      milestonesRow.className = 'hm-view-milestones-row';
      const viewMilestonesBtn = document.createElement('button');
      viewMilestonesBtn.type = 'button';
      viewMilestonesBtn.className = 'shop-delve hm-view-milestones';
      viewMilestonesBtn.textContent = 'View Milestones';
      viewMilestonesBtn.addEventListener('click', () => {
        const milestones = Array.isArray(model.hmMilestones) ? model.hmMilestones : [];
        if (!milestones.length) return;
        const evolutions = Math.max(0, Math.floor(Number(model.hmEvolutions ?? 0)));
        const evolutionOffset = (() => {
          try { return BigInt(HM_EVOLUTION_INTERVAL) * BigInt(evolutions); }
          catch { return 0n; }
        })();
        const formatMilestoneLevel = (levelBn) => {
          if (model.lvlBn?.isInfinite?.()) return 'Infinity';
          try {
            const levelBnSafe = levelBn instanceof BigNum
              ? levelBn
              : BigNum.fromAny(levelBn ?? 0);
            const formatted = formatNumber(levelBnSafe);
            if (typeof formatted === 'string') {
              return formatted.replace(/<[^>]*>/g, '') || formatted;
            }
          } catch {}
          return formatNumber(levelBn);
        };
        const lines = milestones
          .sort((a, b) => (Number(a?.level ?? 0) - Number(b?.level ?? 0)))
          .map((m) => {
            const lvl = Math.max(0, Math.floor(Number(m?.level ?? 0)));
            const milestoneLevelBn = (() => {
              if (model.lvlBn?.isInfinite?.()) return BigNum.fromAny('Infinity');
              try { return BigNum.fromAny((BigInt(lvl) + evolutionOffset).toString()); }
              catch { return BigNum.fromAny(lvl + (HM_EVOLUTION_INTERVAL * evolutions)); }
            })();
            const milestonePlain = milestoneLevelBn?.toPlainIntegerString?.();
            const levelText = formatMilestoneLevel(milestoneLevelBn);
            const mult = formatMultForUi(m?.multiplier ?? m?.mult ?? m?.value ?? 1);
            const target = `${m?.target ?? m?.type ?? 'self'}`.toLowerCase();
            const achieved = (() => {
              if (model.lvlBn?.isInfinite?.()) return true;
              try { return model.lvlBn?.cmp?.(milestoneLevelBn) >= 0; }
              catch {}
              if (Number.isFinite(model.lvl) && milestonePlain && milestonePlain !== 'Infinity') {
                const approxTarget = Number(milestonePlain);
                if (Number.isFinite(approxTarget)) return model.lvl >= approxTarget;
              }
              return false;
            })();
            if (target === 'xp') return { text: `Level ${levelText}: Multiplies XP value by ${mult}x`, achieved };
            if (target === 'coin' || target === 'coins') return { text: `Level ${levelText}: Multiplies Coin value by ${mult}x`, achieved };
            if (target === 'mp') return { text: `Level ${levelText}: Multiplies MP value by ${mult}x`, achieved };
            return { text: `Level ${levelText}: Multiplies this upgrade’s effect by ${mult}x`, achieved };
          });
        openHmMilestoneDialog(lines);
      });
      milestonesRow.appendChild(viewMilestonesBtn);
      content.appendChild(milestonesRow);
    }

    // ---------- actions ----------
    const actions = upgSheetEl.querySelector('.upg-actions');
    const existingCloseBtn = actions.querySelector('.shop-close');
    let closeBtn;

    if (existingCloseBtn) {
        closeBtn = existingCloseBtn;
    } else {
        actions.innerHTML = '';
        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'shop-close';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => { upgOpenLocal = false; closeUpgradeMenu(); });
        actions.appendChild(closeBtn);
    }
	
    if (locked || capReached) {
       const others = actions.querySelectorAll('button:not(.shop-close)');
       others.forEach(btn => btn.remove());
       if (document.activeElement && document.activeElement !== closeBtn && !actions.contains(document.activeElement)) {
          closeBtn.focus();
       }
    } else {
      const canAffordNext = model.have.cmp(nextPriceBn) >= 0;

      const ensureButton = (className, text, onClick, index, disabled = false) => {
          let btn = actions.querySelector(`.${className.split(' ').join('.')}`);
          if (!btn) {
              btn = document.createElement('button');
              btn.type = 'button';
              btn.className = className;
              btn.textContent = text;
              if (onClick) {
                  // Bind events
                  if ('PointerEvent' in window) {
                      btn.addEventListener('pointerdown', (event) => {
                          if (event.pointerType === 'mouse') return;
                          if (typeof event.button === 'number' && event.button !== 0) return;
                          onClick();
                          event.preventDefault();
                      }, { passive: false });
                  } else {
                      btn.addEventListener('touchstart', (event) => {
                          onClick();
                          event.preventDefault();
                      }, { passive: false });
                  }
                  btn.addEventListener('click', (event) => {
                      if (IS_MOBILE) return;
                      onClick();
                  });
              }
              // Insert at correct position (index 0 = close btn)
              const siblings = actions.children;
              if (index >= siblings.length) actions.appendChild(btn);
              else actions.insertBefore(btn, siblings[index]);
          }
          if (btn.textContent !== text) btn.textContent = text;
          if (btn.disabled !== disabled) btn.disabled = disabled;
          return btn;
      };

      if (evolveReady) {
        // Remove buttons that aren't the evolve button or close button
        actions.querySelectorAll('button:not(.shop-close):not(.hm-evolve-btn)').forEach(b => b.remove());
        
        ensureButton('shop-delve hm-evolve-btn', 'Evolve', () => {
          const { evolved } = adapter.evolve(upgDef.id);
          if (!evolved) return;
          playEvolveSfx();
          updateShopOverlay();
          rerender();
        }, 1, false);

        recenterUnlockOverlayIfNeeded(model);
        return;
      }

      if (model.unlockUpgrade) {
         // Remove buttons that aren't the unlock button or close button.
         // We identify the unlock button by class 'btn-unlock' to be safe (which we add now).
         actions.querySelectorAll('button:not(.shop-close):not(.btn-unlock)').forEach(b => b.remove());
         
         const unlockBtn = ensureButton('shop-delve btn-unlock', 'Unlock', () => {
            const { bought } = adapter.buyOne(upgDef.id);
            const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
            if (!boughtBn.isZero?.()) {
                playPurchaseSfx();
                if (isForgeUnlockUpgrade(upgDef)) {
                try { unlockMerchantTabs(['reset']); } catch {}
                }
                updateShopOverlay();
                rerender();
            }
         }, 1, !canAffordNext);
		
         recenterUnlockOverlayIfNeeded(model);
         return;
      }
      
      // Standard Buy mode: clear Evolve/Unlock buttons if present
      actions.querySelectorAll('.hm-evolve-btn, .btn-unlock').forEach(b => b.remove());

      const performBuy = () => {
        // const fresh = upgradeUiModel(areaKey, upgDef.id);
        const fresh = adapter.getUiModel(upgDef.id);
        const priceNow = fresh.nextPrice instanceof BigNum
          ? fresh.nextPrice
          : BigNum.fromAny(fresh.nextPrice || 0);
        if (fresh.have.cmp(priceNow) < 0) return;

        const { bought } = adapter.buyOne(upgDef.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (boughtBn.isZero?.()) return;

        playPurchaseSfx();
        updateShopOverlay();
        rerender();
      };
      
      const buyBtn = ensureButton('shop-delve btn-buy-one', 'Buy', performBuy, 1, !canAffordNext);

      const performBuyMax = () => {
        // const fresh = upgradeUiModel(areaKey, upgDef.id);
        const fresh = adapter.getUiModel(upgDef.id);
        if (fresh.have.cmp(BigNum.fromInt(1)) < 0) return;
        const { bought } = adapter.buyMax(upgDef.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (!boughtBn.isZero?.()) {
          playPurchaseSfx();
          updateShopOverlay();
          rerender();
        }
      };
      
      const buyMaxBtn = ensureButton('shop-delve btn-buy-max', 'Buy Max', performBuyMax, 2, !canAffordNext);

      if (isHM) {
        const performBuyNext = () => {
          // const fresh = upgradeUiModel(areaKey, upgDef.id);
          const fresh = adapter.getUiModel(upgDef.id);
          if (fresh.hmReadyToEvolve) return;
          const target = fresh.hmNextMilestone;
          if (!target || !fresh.lvlBn || target.cmp(fresh.lvlBn) <= 0) {
            const { bought } = adapter.buyMax(upgDef.id);
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
            ? adapter.buyNext(upgDef.id, deltaNum)
            : adapter.buyMax(upgDef.id);
          const boughtBn = purchase.bought instanceof BigNum
            ? purchase.bought
            : BigNum.fromAny(purchase.bought ?? 0);
          if (!boughtBn.isZero?.()) {
            playPurchaseSfx();
            updateShopOverlay();
            rerender();
          }
        };
        
        ensureButton('shop-delve btn-buy-next', 'Buy Next', performBuyNext, 3, model.have.cmp(BigNum.fromInt(1)) < 0);
      } else {
          // If NOT hard mode, ensure no "Buy Next" button remains from a previous state (unlikely but safe)
          const stale = actions.querySelector('.btn-buy-next');
          if (stale) stale.remove();
      }
    }
	
	recenterUnlockOverlayIfNeeded(model);
  };

  const onUpdate = () => {
    if (!upgOpenLocal) return;
    rerender();
  };

  const onEvent = () => onUpdate();

  // Register all events from adapter
  adapter.events.forEach(evt => window.addEventListener(evt, onEvent));
  // Standard upgrades also use document event
  if (currentShopMode === 'standard') {
      document.addEventListener('ccc:upgrades:changed', onEvent);
  }

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
    // local ESC handling removed, relying on global
  };
  window.addEventListener('keydown', onKey, true);

  upgOverlayCleanup = () => {
    upgOpenLocal = false;
    adapter.events.forEach(evt => window.removeEventListener(evt, onEvent));
    if (currentShopMode === 'standard') {
        document.removeEventListener('ccc:upgrades:changed', onEvent);
    }
    window.removeEventListener('keydown', onKey, true);
  };
}

// ---------- Controls ----------
function onKeydownForShop(e) {
  if (!shopOpen) return;
  // local ESC handling removed, relying on global
}

// Global update handler ref
let activeShopUpdateHandler = null;

export function openShop(mode = 'standard') {
  ensureShopOverlay();

  currentShopMode = mode;
  const adapter = getAdapter();

  if (mode === 'automation') {
    shopOverlayEl.classList.add('automation-shop-overlay');
  } else {
    shopOverlayEl.classList.remove('automation-shop-overlay');
  }

  if (shopCloseTimer) {
    clearTimeout(shopCloseTimer);
    shopCloseTimer = null;
  }

  // Bind Events if not already done for this specific mode session
  if (activeShopUpdateHandler) {
      // Clean up previous listeners if switching modes (though usually we close first)
      const prevAdapter = SHOP_ADAPTERS.standard; // Fallback cleanup
      prevAdapter.events.forEach(e => window.removeEventListener(e, activeShopUpdateHandler));
      SHOP_ADAPTERS.automation.events.forEach(e => window.removeEventListener(e, activeShopUpdateHandler));
      document.removeEventListener('ccc:upgrades:changed', activeShopUpdateHandler);
  }

  activeShopUpdateHandler = () => {
      if (!shopOpen) return;
      // Debounce?
      updateShopOverlay();
  };
  
  adapter.events.forEach(evt => window.addEventListener(evt, activeShopUpdateHandler));
  if (mode === 'standard') {
      document.addEventListener('ccc:upgrades:changed', activeShopUpdateHandler);
  }
  
  // Update UI Elements based on Mode
  if (shopOverlayEl) {
      const titleEl = shopOverlayEl.querySelector('.shop-title');
      if (titleEl) titleEl.textContent = adapter.title;
      
      const delveBtn = shopOverlayEl.querySelector('.shop-delve');
      if (delveBtn) {
          delveBtn.style.display = adapter.delveButtonVisible ? '' : 'none';
      }
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
  ensureCustomScrollbar(shopOverlayEl, shopSheetEl);
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

  // Cleanup listeners
  if (activeShopUpdateHandler) {
      const adapter = getAdapter(); // current
      adapter.events.forEach(evt => window.removeEventListener(evt, activeShopUpdateHandler));
      if (currentShopMode === 'standard') {
          document.removeEventListener('ccc:upgrades:changed', activeShopUpdateHandler);
      }
      activeShopUpdateHandler = null;
  }
}

// ---------- Drag ----------
export function setupDragToClose(grabberEl, sheetEl, isOpenFn, performCloseFn) {
  let drag = null;

  function onDragStart(e) {
    if (!isOpenFn()) return;

    const clientY = typeof e.clientY === 'number'
      ? e.clientY
      : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

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

export function updateShopOverlay(force = false) {
  if (!force && !shopOpen) return;
  buildUpgradesData();
  renderShopGrid();
}

export function setUpgradeCount() { updateShopOverlay(true); }

export function getUpgrades() { return upgrades; }
