// js/ui/popups.js

import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { CURRENCIES, getAllCurrencies } from '../util/storage.js';

const DEFAULT_DURATION = 3200;

const POPUP_ORDER = ['coins', 'xp', 'books'];

const POPUP_META = {
  [CURRENCIES.COINS]: {
    icon: 'img/currencies/coin/coin.png',
    iconAlt: 'Coin',
  },
  xp: {
    icon: 'img/stats/xp/xp.png',
    iconAlt: 'XP',
  },
  [CURRENCIES.BOOKS]: {
    icon: 'img/currencies/book/book.png',
    iconAlt: 'Book',
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
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'currency-popup__text';

  const amountEl = document.createElement('span');
  amountEl.className = 'currency-popup__amount';

  text.append(amountEl);
  element.append(plus, icon, text);

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

  // Insert based on order (coins first, xp second, books last)
  const index = POPUP_ORDER.indexOf(type);
  let insertBefore = null;
  if (index >= 0) {
    for (let i = index + 1; i < POPUP_ORDER.length; i++) {
      const next = activePopups.get(POPUP_ORDER[i]);
      if (next?.element?.parentNode === host) {
        insertBefore = next.element;
        break;
      }
    }
  }

  if (insertBefore) host.insertBefore(entry.element, insertBefore);
  else host.appendChild(entry.element);

  requestAnimationFrame(() => entry.element.classList.add('is-visible'));
  scheduleRemoval(entry, meta.duration); // scheduled ONCE at creation
}

function syncLastKnown() {
  try {
    const all = getAllCurrencies();
    Object.entries(all).forEach(([key, value]) => {
      const bn = bnFromAny(value) || BigNum.fromInt(0);
      lastKnownAmounts.set(key, bn.clone?.() ?? bn);
    });
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
  if (typeof current.cmp === 'function' && current.cmp(prev) > 0) {
    const delta = current.sub(prev);
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
  window.addEventListener('saveSlot:change', handleSlotChange);
}

export function teardownpopups() {
  if (!initialized) return;
  window.removeEventListener('currency:change', handleCurrencyChange);
  window.removeEventListener('xp:change', handleXpChange);
  window.removeEventListener('saveSlot:change', handleSlotChange);
  clearActivePopups();
  lastKnownAmounts.clear();
  if (container) container.remove();
  container = null;
  initialized = false;
}
