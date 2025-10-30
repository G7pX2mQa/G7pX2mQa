// js/util/storage.js
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';

const PREFIX = 'ccc:';

const MULT_SCALE = 18;
const MULT_SCALE_TAG = 'XM:';

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
    localStorage.setItem(k, bn.toStorage());
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

// Optional globals for console/dev
if (typeof window !== 'undefined') {
  window.bank = bank;
  window.coins = bank.coins;
  window.books = bank.books;
}
