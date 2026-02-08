// js/ui/popups.js

import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { CURRENCIES, isCurrencyLocked, isStorageKeyLocked, getActiveSlot, getCurrency } from '../util/storage.js';

const DEFAULT_DURATION = 6767;

const POPUP_ORDER = ['coins', 'xp', 'books', 'gold', 'mp', 'magic', 'gears', 'dna'];

const POPUP_META = {
  [CURRENCIES.COINS]: {
    icon: 'img/currencies/coin/coin.webp',
    iconAlt: 'Coin',
  },
  xp: {
    icon: 'img/stats/xp/xp.webp',
    iconAlt: 'XP',
  },
  [CURRENCIES.BOOKS]: {
    icon: 'img/currencies/book/book.webp',
    iconAlt: 'Book',
  },
  [CURRENCIES.GOLD]: {
    icon: 'img/currencies/gold/gold.webp',
    iconAlt: 'Gold',
  },
  mp: {
    icon: 'img/stats/mp/mp.webp',
    iconAlt: 'Mutation Power',
  },
  [CURRENCIES.MAGIC]: {
    icon: 'img/currencies/magic/magic.webp',
    iconAlt: 'Magic',
  },
  [CURRENCIES.GEARS]: {
    icon: 'img/currencies/gear/gear.webp',
    iconAlt: 'Gears',
  },
  [CURRENCIES.DNA]: {
    icon: 'img/currencies/dna/dna.webp',
    iconAlt: 'DNA',
  },
};

let container = null;
let initialized = false;
const lastKnownAmounts = new Map();
const activePopups = new Map();

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'currency-popups';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);
  return container;
}

function bnFromAny(value) {
  if (value == null) return null;
  if (value instanceof BigNum) return value.clone?.() ?? value;
  if (typeof value.clone === 'function' && value.sig != null) {
    try { return value.clone(); } catch {}
  }
  try { return BigNum.fromAny(value); } catch { return null; }
}

function isZero(bn) {
  if (!bn) return true;
  if (typeof bn.isZero === 'function') {
    try { return bn.isZero(); } catch { return false; }
  }
  return false;
}

function updateEntry(entry) {
  if (!entry) return;
  const { amountEl, amount, meta } = entry;
  const formatted = meta.formatAmount ? meta.formatAmount(amount) : formatNumber(amount);
  if (amountEl) amountEl.innerHTML = formatted;
}

function scheduleRemoval(entry, duration = DEFAULT_DURATION) {
  if (!entry) return;
  if (entry.timeoutId) return; // already scheduled; do NOT reset
  entry.timeoutId = window.setTimeout(() => {
    activePopups.delete(entry.type);
    entry.element.classList.remove('is-visible');
    entry.element.classList.add('is-leaving');
    const remove = () => {
      entry.element.removeEventListener('transitionend', remove);
      entry.element.remove();
    };
    entry.element.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, 480);
  }, duration);
}

function createPopupEntry(type, meta, amount) {
  ensureContainer();
  const element = document.createElement('div');
  element.className = 'currency-popup';
  element.setAttribute('role', 'status');

  const plus = document.createElement('span');
  plus.className = 'currency-popup__plus';
  plus.textContent = '+';

  const icon = document.createElement('img');
  icon.className = 'currency-popup__icon';
  icon.src = meta.icon;
  icon.alt = meta.iconAlt || '';

  const text = document.createElement('span');
  text.className = 'currency-popup__text';

  const amountEl = document.createElement('span');
  amountEl.className = 'currency-popup__amount';

  text.append(amountEl);
  element.append(plus, icon, text);
  element.dataset.type = type;

  return {
    type,
    meta,
    element,
    amountEl,
    amount: amount.clone?.() ?? amount,
    timeoutId: null,
  };
}

function showPopup(type, amount, overrides = {}) {
  if (typeof window !== 'undefined' && window.__tsunamiActive) return;
  // Check locks
  const slot = getActiveSlot();
  if (slot != null) {
      if (['xp'].includes(type)) {
          if (isStorageKeyLocked(`ccc:xp:progress:${slot}`)) return;
      } else if (['mp'].includes(type)) {
          if (isStorageKeyLocked(`ccc:mutation:progress:${slot}`)) return;
      } else if (Object.values(CURRENCIES).includes(type)) {
          if (isCurrencyLocked(type, slot)) return;
      }
  }

  const baseMeta = POPUP_META[type];
  const meta = Object.assign({ duration: DEFAULT_DURATION, accumulate: true }, baseMeta || {}, overrides);
  if (!meta.icon) return;

  const bnAmount = bnFromAny(amount);
  if (!bnAmount || isZero(bnAmount)) return;

  const existing = meta.accumulate !== false ? activePopups.get(type) : null;

  if (existing) {
    // Update the number but DO NOT reset its lifetime or animations.
    existing.amount = existing.amount.add(bnAmount);
    existing.meta = meta;
    updateEntry(existing);
    return;
  }

  const entry = createPopupEntry(type, meta, bnAmount);
  entry.meta = meta;
  updateEntry(entry);
  activePopups.set(type, entry);

  const host = ensureContainer();

  // Insert based on order (coins first, xp second, books last, gears very last)
  const index = POPUP_ORDER.indexOf(type);
  let insertBefore = null;
  
  if (index >= 0) {
    const children = Array.from(host.children);
    for (const child of children) {
      const childType = child.dataset.type;
      const childIndex = POPUP_ORDER.indexOf(childType);
      if (childIndex > index) {
        insertBefore = child;
        break;
      }
    }
  }

  if (insertBefore) host.insertBefore(entry.element, insertBefore);
  else host.appendChild(entry.element);

  requestAnimationFrame(() => entry.element.classList.add('is-visible'));
  scheduleRemoval(entry, meta.duration); // scheduled ONCE at creation
}

function getAllCurrencies() {
  const all = {};
  for (const key of Object.values(CURRENCIES)) {
    all[key] = getCurrency(key);
  }
  return all;
}

function syncLastKnown() {
  try {
    const all = getAllCurrencies();
    Object.entries(all).forEach(([key, value]) => {
      const bn = bnFromAny(value) || BigNum.fromInt(0);
      lastKnownAmounts.set(key, bn.clone?.() ?? bn);
    });
    if (!lastKnownAmounts.has('mp')) {
      lastKnownAmounts.set('mp', BigNum.fromInt(0));
    }
  } catch {
    lastKnownAmounts.clear();
  }
}

function clearActivePopups() {
  activePopups.forEach((entry) => {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    entry.element.remove();
  });
  activePopups.clear();
}

function handleCurrencyChange(event) {
  const detail = event?.detail;
  if (!detail?.key) return;
  const key = detail.key;
  const current = bnFromAny(detail.value) || BigNum.fromInt(0);
  const prev = lastKnownAmounts.get(key) || BigNum.fromInt(0);
  const zero = BigNum.fromInt(0);
  let delta = null;
  const detailDelta = detail.delta != null ? bnFromAny(detail.delta) : null;
  if (detailDelta && typeof detailDelta.cmp === 'function' && detailDelta.cmp(zero) > 0) {
    delta = detailDelta;
  } else if (typeof current.cmp === 'function' && current.cmp(prev) > 0) {
    delta = current.sub(prev);
  }
  if (delta && !(typeof delta.isZero === 'function' && delta.isZero())) {
    showPopup(key, delta);
  }
  lastKnownAmounts.set(key, current.clone?.() ?? current);
}

function handleXpChange(event) {
  const detail = event?.detail;
  if (!detail) return;
  const xpAdded = bnFromAny(detail.xpAdded);
  if (xpAdded && !isZero(xpAdded)) showPopup('xp', xpAdded);
}

function handleMutationChange(event) {
  const detail = event?.detail;
  if (!detail) return;
  const delta = bnFromAny(detail.delta);
  if (delta && !isZero(delta)) {
    showPopup('mp', delta);
  }
  const nextProgress = bnFromAny(detail.progress);
  if (nextProgress) {
    lastKnownAmounts.set('mp', nextProgress.clone?.() ?? nextProgress);
  }
}

function handleSlotChange() {
  clearActivePopups();
  syncLastKnown();
}

export function initPopups() {
  if (initialized) return;
  initialized = true;
  ensureContainer();
  syncLastKnown();
  window.addEventListener('currency:change', handleCurrencyChange);
  window.addEventListener('xp:change', handleXpChange);
  window.addEventListener('mutation:change', handleMutationChange);
  window.addEventListener('saveSlot:change', handleSlotChange);
}

export function teardownpopups() {
  if (!initialized) return;
  window.removeEventListener('currency:change', handleCurrencyChange);
  window.removeEventListener('xp:change', handleXpChange);
  window.removeEventListener('mutation:change', handleMutationChange);
  window.removeEventListener('saveSlot:change', handleSlotChange);
  clearActivePopups();
  lastKnownAmounts.clear();
  if (container) container.remove();
  container = null;
  initialized = false;
}
