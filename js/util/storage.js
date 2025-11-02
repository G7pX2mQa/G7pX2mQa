// js/util/storage.js
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';

const PREFIX = 'ccc:';

const MULT_SCALE = 18;
const MULT_SCALE_TAG = 'XM:';

const STORAGE_WATCH_INTERVAL_MS = 140;

const storageWatchers = new Map();
let storageWatcherTimer = null;

function ensureStorageWatcherTimer() {
  if (storageWatcherTimer != null || storageWatchers.size === 0) return;
  const root = typeof window !== 'undefined' ? window : globalThis;
  storageWatcherTimer = root.setInterval(runStorageWatchers, STORAGE_WATCH_INTERVAL_MS);
}

function stopStorageWatcherTimerIfIdle() {
  if (storageWatchers.size !== 0 || storageWatcherTimer == null) return;
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.clearInterval(storageWatcherTimer);
  storageWatcherTimer = null;
}

function parseWith(entry, raw) {
  if (!entry || typeof entry.parse !== 'function') return raw;
  try {
    return entry.parse(raw);
  } catch {
    return raw;
  }
}

function valuesEqual(entry, a, b) {
  if (!entry || typeof entry.equals !== 'function') {
    return Object.is(a, b);
  }
  try {
    return entry.equals(a, b);
  } catch {
    return Object.is(a, b);
  }
}

function runStorageWatchers() {
  if (storageWatchers.size === 0) {
    stopStorageWatcherTimerIfIdle();
    return;
  }
  storageWatchers.forEach((entries, key) => {
    if (!entries || entries.size === 0) return;
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    entries.forEach((entry) => {
      if (!entry) return;
      const parsed = parseWith(entry, raw);
      if (!entry.initialized) {
        entry.lastRaw = raw;
        entry.lastValue = parsed;
        entry.initialized = true;
        if (entry.emitCurrentValue) {
          try {
            entry.onChange?.(parsed, {
              key,
              raw,
              previous: undefined,
              previousRaw: undefined,
              initial: true,
              rawChanged: true,
              valueChanged: true,
            });
          } catch {}
        }
        return;
      }
      const rawChanged = raw !== entry.lastRaw;
      const valueChanged = !valuesEqual(entry, entry.lastValue, parsed);
      if (!rawChanged && !valueChanged) return;
      const previousValue = entry.lastValue;
      const previousRaw = entry.lastRaw;
      entry.lastRaw = raw;
      entry.lastValue = parsed;
      try {
        entry.onChange?.(parsed, {
          key,
          raw,
          previous: previousValue,
          previousRaw,
          rawChanged,
          valueChanged,
        });
      } catch {}
    });
  });
}

export function watchStorageKey(key, {
  parse,
  equals,
  onChange,
  emitCurrentValue = false,
} = {}) {
  if (!key || typeof localStorage === 'undefined') {
    return () => {};
  }
  const entry = {
    parse,
    equals,
    onChange,
    emitCurrentValue,
    lastRaw: undefined,
    lastValue: undefined,
    initialized: false,
  };
  let set = storageWatchers.get(key);
  if (!set) {
    set = new Set();
    storageWatchers.set(key, set);
  }
  set.add(entry);
  ensureStorageWatcherTimer();
  return () => {
    const entries = storageWatchers.get(key);
    if (!entries) return;
    entries.delete(entry);
    if (entries.size === 0) {
      storageWatchers.delete(key);
      stopStorageWatcherTimerIfIdle();
    }
  };
}

export function primeStorageWatcherSnapshot(key, rawValue) {
  if (!key) return;
  const entries = storageWatchers.get(key);
  if (!entries || entries.size === 0) return;
  let raw = rawValue;
  if (raw === undefined) {
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
  }
  entries.forEach((entry) => {
    if (!entry) return;
    entry.lastRaw = raw;
    entry.lastValue = parseWith(entry, raw);
    entry.initialized = true;
  });
}

function bigNumEquals(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof BigNum && typeof a.cmp === 'function') {
    try { return a.cmp(b) === 0; } catch {}
  }
  if (b instanceof BigNum && typeof b.cmp === 'function') {
    try { return b.cmp(a) === 0; } catch {}
  }
  if (typeof a?.cmp === 'function') {
    try { return a.cmp(b) === 0; } catch {}
  }
  if (typeof b?.cmp === 'function') {
    try { return b.cmp(a) === 0; } catch {}
  }
  try {
    return Object.is(String(a), String(b));
  } catch {
    return Object.is(a, b);
  }
}

function parseBigNumOrZero(raw) {
  if (raw == null) return BigNum.fromInt(0);
  try {
    return BigNum.fromAny(raw);
  } catch {
    return BigNum.fromInt(0);
  }
}

const currencyWatcherCleanup = new Map();
let currencyWatcherBoundSlot = null;

function cleanupCurrencyWatchers() {
  currencyWatcherCleanup.forEach((stop) => {
    try { stop?.(); } catch {}
  });
  currencyWatcherCleanup.clear();
}

function bindCurrencyWatchersForSlot(slot) {
  if (slot === currencyWatcherBoundSlot) return;
  cleanupCurrencyWatchers();
  currencyWatcherBoundSlot = slot ?? null;
  if (slot == null) return;
  for (const currencyKey of Object.values(CURRENCIES)) {
    const storageKey = `${KEYS.CURRENCY[currencyKey]}:${slot}`;
    const stop = watchStorageKey(storageKey, {
      parse: parseBigNumOrZero,
      equals: bigNumEquals,
      onChange: (value, meta) => {
        if (!meta?.valueChanged) return;
        if (typeof window === 'undefined') return;
        try {
          window.dispatchEvent(new CustomEvent('currency:change', { detail: { key: currencyKey, value } }));
        } catch {}
      },
    });
    currencyWatcherCleanup.set(storageKey, stop);
  }
}

function initCurrencyStorageWatchers() {
  if (typeof window === 'undefined') return;
  bindCurrencyWatchersForSlot(getActiveSlot());
  window.addEventListener('saveSlot:change', () => {
    bindCurrencyWatchersForSlot(getActiveSlot());
  });
}

initCurrencyStorageWatchers();

// -------------------- KEYS --------------------
export const KEYS = {
  HAS_OPENED_SAVE_SLOT: `${PREFIX}hasOpenedSaveSlot`,
  SAVE_SLOT:            `${PREFIX}saveSlot`,
  CURRENCY:   {},
  MULTIPLIER: {},
};

// -------------------- CURRENCIES --------------------
export const CURRENCIES = {
  COINS: 'coins',
  BOOKS: 'books',
};

export function getActiveSlot() {
  const raw = localStorage.getItem(KEYS.SAVE_SLOT);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function setActiveSlot(n) {
  const v = Math.max(1, parseInt(n, 10) || 1);
  localStorage.setItem(KEYS.SAVE_SLOT, String(v));
  try {
    window.dispatchEvent(new CustomEvent('saveSlot:change', { detail: { slot: v } }));
  } catch {}
}

function keyFor(base, slot = getActiveSlot()) {
  if (slot == null) return null;
  return `${base}:${slot}`;
}


// build per-currency keys
for (const key of Object.values(CURRENCIES)) {
  KEYS.CURRENCY[key]   = `${PREFIX}${key}`;
  KEYS.MULTIPLIER[key] = `${PREFIX}mult:${key}`; // one key only
}

// -------------------- SAVE-SLOT HELPERS --------------------
export function getHasOpenedSaveSlot() {
  return localStorage.getItem(KEYS.HAS_OPENED_SAVE_SLOT) === 'true';
}
export function setHasOpenedSaveSlot(value) {
  localStorage.setItem(KEYS.HAS_OPENED_SAVE_SLOT, value ? 'true' : 'false');
}

// -------------------- DEFAULTS --------------------
export function ensureStorageDefaults() {
  if (localStorage.getItem(KEYS.HAS_OPENED_SAVE_SLOT) === null) {
    setHasOpenedSaveSlot(false);
  }
}

export function ensureCurrencyDefaults() {
  const slot = getActiveSlot();
  if (slot == null) return; // only seed AFTER a slot is chosen
  for (const key of Object.values(CURRENCIES)) {
    const k = `${KEYS.CURRENCY[key]}:${slot}`;
    if (!localStorage.getItem(k)) localStorage.setItem(k, '0');
  }
}

export function ensureMultiplierDefaults() {
  const slot = getActiveSlot();
  if (slot == null) return; // only seed AFTER a slot is chosen
  for (const key of Object.values(CURRENCIES)) {
    const km = `${KEYS.MULTIPLIER[key]}:${slot}`;
    if (!localStorage.getItem(km)) {
      const theor = scaledFromIntBN(BigNum.fromInt(1));
      setMultiplierScaled(key, theor);
    } else {
      getMultiplierScaled(key);
    }
  }
}

// -------------------- AMOUNTS (BN) --------------------
export function getCurrency(key) {
  const k = keyFor(KEYS.CURRENCY[key]);
  if (!k) return BigNum.fromInt(0);
  const raw = localStorage.getItem(k);
  if (!raw) return BigNum.fromInt(0);
  try { return BigNum.fromAny(raw); } catch { return BigNum.fromInt(0); }
}

export function setCurrency(key, value) {
  const k = keyFor(KEYS.CURRENCY[key]);
  if (!k) return;
  try {
    let bn = BigNum.fromAny(value);
    if (bn.isNegative?.()) bn = BigNum.fromInt(0);
    const raw = bn.toStorage();
    localStorage.setItem(k, raw);
    primeStorageWatcherSnapshot(k, raw);
    try { window.dispatchEvent(new CustomEvent('currency:change', { detail: { key, value: bn } })); } catch {}
  } catch (e) { console.warn('Currency save failed:', key, value, e); }
}


function scaledFromIntBN(intBN) {
  return intBN.mulScaledIntFloor(1n, -MULT_SCALE);
}

// theoretical (×10^MULT_SCALE) → integer BN multiplier (floor), min 1
function intFromScaled(theorBN) {
  const bn = BigNum.fromAny(theorBN);
  if (bn.isInfinite()) return bn.clone();
  const scaled = bn.mulScaledIntFloor(1n, MULT_SCALE);
  if (scaled.isZero()) return BigNum.fromInt(1);
  return scaled;
}

function getMultiplierScaled(key) {
  const k = keyFor(KEYS.MULTIPLIER[key]);
  if (!k) return scaledFromIntBN(BigNum.fromInt(1));
  const raw = localStorage.getItem(k);
  if (!raw || !raw.startsWith(MULT_SCALE_TAG)) {
    const theor = scaledFromIntBN(BigNum.fromInt(1));
    setMultiplierScaled(key, theor);
    return theor;
  }
  const payload = raw.slice(MULT_SCALE_TAG.length);
  try { return BigNum.fromAny(payload); } catch {
    const theor = scaledFromIntBN(BigNum.fromInt(1));
    setMultiplierScaled(key, theor);
    return theor;
  }
}

function setMultiplierScaled(key, theoreticalBN) {
  const k = keyFor(KEYS.MULTIPLIER[key]);
  if (!k) return;
  const bn = BigNum.fromAny(theoreticalBN);
  localStorage.setItem(k, MULT_SCALE_TAG + bn.toStorage());
  try {
    window.dispatchEvent(new CustomEvent('currency:multiplier', {
      detail: { key, mult: intFromScaled(bn) }
    }));
  } catch {}
}

// public integer BN multiplier (derived)
export function getCurrencyMultiplierBN(key) {
  return intFromScaled(getMultiplierScaled(key));
}

// public set integer BN multiplier (stored as scaled theoretical)
export function setCurrencyMultiplierBN(key, intBNValue) {
  const v = BigNum.fromAny(intBNValue);
  const theor = scaledFromIntBN(v);
  setMultiplierScaled(key, theor);
  return v;
}

export function peekCurrency(slot, key) {
  const raw = localStorage.getItem(`${KEYS.CURRENCY[key]}:${slot}`);
  if (!raw) return BigNum.fromInt(0);
  try { return BigNum.fromAny(raw); } catch { return BigNum.fromInt(0); }
}

// -------------------- UTILITIES --------------------
export function clearAllStorage() {
  Object.values(KEYS).forEach((v) => {
    if (typeof v === 'string') {
      localStorage.removeItem(v);
    } else if (typeof v === 'object') {
      Object.values(v).forEach((sub) => localStorage.removeItem(sub));
    }
  });
}

export function getAllCurrencies() {
  const all = {};
  for (const key of Object.values(CURRENCIES)) all[key] = getCurrency(key);
  return all;
}

// -------------------- Optional direct currency{} --------------------
export const currency = {
  get coins() { return getCurrency(CURRENCIES.COINS); },
  set coins(v) { setCurrency(CURRENCIES.COINS, v); },

  get books() { return getCurrency(CURRENCIES.BOOKS); },
  set books(v) { setCurrency(CURRENCIES.BOOKS, v); },
};

// -------------------- BANK FACADE --------------------
function makeCurrencyHandle(key) {
  // callable preview: bank.coins("1e3")
  const fn = (x) => {
    try {
      const bn = BigNum.fromAny(x);
      return typeof formatNumber === 'function' ? formatNumber(bn) : bn.toString();
    } catch {
      return 'NaN';
    }
  };

  Object.defineProperty(fn, 'value', {
    get() { return getCurrency(key); }
  });

  fn.toString = function toString() {
    return this.value.toString();
  };

  // amount mutations
  fn.add = function add(x) {
    const amt  = BigNum.fromAny(x);
    const next = this.value.add(amt);
    setCurrency(key, next);
    return next;
  };

fn.sub = function sub(x) {
  const amt = BigNum.fromAny(x);
  const cur = this.value;

  let next = cur.sub(amt);
  if (next.isNegative?.()) next = BigNum.fromInt(0);

  setCurrency(key, next);
  return next;
};



  fn.set = function set(x) {
    const val = BigNum.fromAny(x);
    setCurrency(key, val);
    return val;
  };

  fn.fmt = function fmt(x) {
    const bn = BigNum.fromAny(x);
    return typeof formatNumber === 'function' ? formatNumber(bn) : bn.toString();
  };

  // multiplier API (single-key theoretical + floor)
  fn.mult = {
    get() {
      return getCurrencyMultiplierBN(key);
    },
    set(x) {
      return setCurrencyMultiplierBN(key, x);
    },
    multiplyByInt(x) {
      const factor = BigNum.fromAny(x).floorToInteger();
      let theor = getMultiplierScaled(key).mulBigNumInteger(factor);
      if (theor.isZero()) theor = scaledFromIntBN(BigNum.fromInt(1));
      setMultiplierScaled(key, theor);
      return intFromScaled(theor);
    },
    multiplyByDecimal(x) {
      // parse "1.2" → { numer, scale }
      let parsed;
      try { parsed = BigNum._parseDecimalMultiplier(String(x), MULT_SCALE); }
      catch { parsed = { numer: 1n, scale: 0 }; }
      let theor = getMultiplierScaled(key).mulScaledIntFloor(parsed.numer, parsed.scale);
      if (theor.isZero()) theor = scaledFromIntBN(BigNum.fromInt(1));
      setMultiplierScaled(key, theor);
      const next = intFromScaled(theor);
      return next.isZero() ? BigNum.fromInt(1) : next;
    },
    multiplyByPercent(pct) {
      const factor = (Number(pct) / 100) + 1;
      return this.multiplyByDecimal(String(factor));
    },
    applyTo(amount) {
      const mult = this.get();
      if (mult.isInfinite()) {
        return BigNum.fromAny('Infinity');
      }
      const amt = BigNum.fromAny(amount, mult.p);
      if (amt.isZero() || mult.isZero()) return amt.clone();
      return amt.mulBigNumInteger(mult);
    }
  };

  fn.addWithMultiplier = function addWithMultiplier(baseAmount) {
    const inc = fn.mult.applyTo(baseAmount);
    return fn.add(inc);
  };

  return fn;
}

export const bank = new Proxy({}, {
  get(_, prop) {
    if (Object.values(CURRENCIES).includes(prop)) return makeCurrencyHandle(prop);
    if (typeof prop === 'string' && CURRENCIES[prop.toUpperCase?.()]) {
      return makeCurrencyHandle(CURRENCIES[prop.toUpperCase()]);
    }
    return undefined;
  }
});

if (typeof window !== 'undefined') {
  window.bank = bank;
  window.coins = bank.coins;
  window.books = bank.books;
}

