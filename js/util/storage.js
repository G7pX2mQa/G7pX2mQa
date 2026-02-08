// js/util/storage.js
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';

const PREFIX = 'ccc:';
export const STORAGE_PREFIX = PREFIX;

const SLOT_SIGNATURE_PREFIX = `${PREFIX}slotSig`;
const SLOT_MODIFIED_PREFIX = `${PREFIX}slotMod`;

const MULT_SCALE = 18;
const MULT_SCALE_TAG = 'XM:';

const STORAGE_WATCH_INTERVAL_MS = 140;

const storageWatchers = new Map();
let storageWatcherTimer = null;

const currencyChangeSubscribers = new Set();

function normalizeSlotValue(slot) {
  const n = parseInt(slot, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function slotSignatureKey(slot) {
  const normalized = normalizeSlotValue(slot);
  if (normalized == null) return null;
  return `${SLOT_SIGNATURE_PREFIX}:${normalized}`;
}

function slotModifiedKey(slot) {
  const normalized = normalizeSlotValue(slot);
  if (normalized == null) return null;
  return `${SLOT_MODIFIED_PREFIX}:${normalized}`;
}

function notifyCurrencySubscribers(detail = {}) {
  if (currencyChangeSubscribers.size === 0) return;
  currencyChangeSubscribers.forEach((entry) => {
    if (!entry || typeof entry.handler !== 'function') return;
    if (entry.key && detail.key && entry.key !== detail.key) return;
    if (entry.slot != null && detail.slot != null && entry.slot !== detail.slot) return;
    try { entry.handler(detail); }
    catch {}
  });
}

export function onCurrencyChange(handler, { key = null, slot = null } = {}) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  const entry = {
    handler,
    key: key ?? null,
    slot: slot ?? null,
  };
  currencyChangeSubscribers.add(entry);
  return () => {
    currencyChangeSubscribers.delete(entry);
  };
}

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
        const detail = { key: currencyKey, value, slot };
        notifyCurrencySubscribers(detail);
        try {
          window.dispatchEvent(new CustomEvent('currency:change', { detail }));
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

// -------------------- HEARTBEAT / OFFLINE TRACKING --------------------
let lastSaveTimeTimer = null;
let hasEnteredGameSession = false;

export function notifyGameSessionStarted() {
  hasEnteredGameSession = true;
}

export function getLastSaveTimeKey(slot = getActiveSlot()) {
  if (slot == null) return null;
  return `${PREFIX}lastSaveTime:${slot}`;
}

export function updateLastSaveTime() {
  if (!hasEnteredGameSession) return;
  // If the document is hidden, we STOP updating the heartbeat.
  // This causes the lastSaveTime to "drift" into the past,
  // so when the user returns, (Date.now() - lastSaveTime) reflects
  // the entire time they were away/tabbed-out.
  if (document.hidden) return;
  
  const slot = getActiveSlot();
  if (slot == null) return;
  const now = Date.now();
  try {
    localStorage.setItem(getLastSaveTimeKey(slot), String(now));
  } catch {}
}

export function getLastSaveTime() {
  const slot = getActiveSlot();
  if (slot == null) return 0;
  try {
    const raw = localStorage.getItem(getLastSaveTimeKey(slot));
    const val = parseInt(raw, 10);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

function initHeartbeat() {
  if (typeof window === 'undefined') return;
  
  // Update every 1 second (was 2s), but only if visible
  if (!lastSaveTimeTimer) {
    lastSaveTimeTimer = setInterval(updateLastSaveTime, 1000);
  }

  // Ensure we save immediately before unloading
  window.addEventListener('beforeunload', () => {
      // Force update regardless of visibility state on unload
      if (!hasEnteredGameSession) return;
      const slot = getActiveSlot();
      if (slot != null) {
          try { localStorage.setItem(getLastSaveTimeKey(slot), String(Date.now())); } catch {}
      }
  });
  
  // When coming back to visibility, we do NOT update immediately here.
  // We let the game loop or offline tracker handle the time diff first.
}

initHeartbeat();

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
  GOLD: 'gold',
  MAGIC: 'magic',
  GEARS: 'gears',
  WAVES: 'waves',
  DNA: 'dna',
};

let _activeSlotCache = undefined;

export function getActiveSlot() {
  if (_activeSlotCache !== undefined) return _activeSlotCache;
  const raw = localStorage.getItem(KEYS.SAVE_SLOT);
  const n = parseInt(raw, 10);
  const val = Number.isFinite(n) && n > 0 ? n : null;
  _activeSlotCache = val;
  return val;
}

export function setActiveSlot(n) {
  const v = Math.max(1, parseInt(n, 10) || 1);
  _activeSlotCache = v;
  localStorage.setItem(KEYS.SAVE_SLOT, String(v));
  try {
    window.dispatchEvent(new CustomEvent('saveSlot:change', { detail: { slot: v } }));
  } catch {}
}

export function clearActiveSlot() {
  _activeSlotCache = null;
  localStorage.removeItem(KEYS.SAVE_SLOT);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.SAVE_SLOT) {
      if (e.newValue === null) {
        _activeSlotCache = null;
      } else {
        const n = parseInt(e.newValue, 10);
        _activeSlotCache = Number.isFinite(n) && n > 0 ? n : null;
      }
      try {
         window.dispatchEvent(new CustomEvent('saveSlot:change', { detail: { slot: _activeSlotCache } }));
      } catch {}
    }
  });
}

function keyFor(base, slot = getActiveSlot()) {
  if (slot == null) return null;
  return `${base}:${slot}`;
}

function isDebugLocked(key) {
  try {
    const lockedKeys = globalThis?.__cccLockedStorageKeys;
    return lockedKeys?.has?.(key) ?? false;
  } catch {
    return false;
  }
}

export function isStorageKeyLocked(key) {
  return isDebugLocked(key);
}

export function getSlotSignatureKey(slot = getActiveSlot()) {
  return slotSignatureKey(slot);
}

export function getSlotModifiedFlagKey(slot = getActiveSlot()) {
  return slotModifiedKey(slot);
}

export function getSlotSignature(slot = getActiveSlot()) {
  if (typeof localStorage === 'undefined') return null;
  const key = slotSignatureKey(slot);
  if (!key) return null;
  try { return localStorage.getItem(key); }
  catch { return null; }
}

export function setSlotSignature(slot, signature) {
  if (typeof localStorage === 'undefined') return;
  const key = slotSignatureKey(slot);
  if (!key) return;
  try {
    if (signature == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(signature));
    }
  } catch {}
}

export function hasModifiedSave(slot = getActiveSlot()) {
  if (typeof localStorage === 'undefined') return false;
  const key = slotModifiedKey(slot);
  if (!key) return false;
  try { return localStorage.getItem(key) === '1'; }
  catch { return false; }
}

export function markSaveSlotModified(slot = getActiveSlot()) {
  if (typeof localStorage === 'undefined') return;
  const normalized = normalizeSlotValue(slot);
  if (normalized == null) return;
  if (hasModifiedSave(normalized)) return;
  const key = slotModifiedKey(normalized);
  if (!key) return;
  try {
    localStorage.setItem(key, '1');
  } catch { return; }
  try {
    window.dispatchEvent(new CustomEvent('saveSlot:modified', { detail: { slot: normalized } }));
  } catch {}
}


for (const key of Object.values(CURRENCIES)) {
  KEYS.CURRENCY[key]   = `${PREFIX}${key}`;
  KEYS.MULTIPLIER[key] = `${PREFIX}mult:${key}`; // one key only
}

initCurrencyStorageWatchers();

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

export function setCurrency(key, value, { delta = null, previous = null } = {}) {
  const slot = getActiveSlot();
  const k = keyFor(KEYS.CURRENCY[key], slot);
  const prev = previous ?? getCurrency(key);
  const zero = BigNum.fromInt(0);
  if (!k) return prev;
  if (isCurrencyLocked(key, slot)) {
    // ⚡ Bolt: Return early to prevent event spam and GC pressure when value is locked.
    return prev;
  } // Respect debug-panel storage locks

  let bn;
  try { bn = BigNum.fromAny(value); }
  catch { bn = BigNum.fromInt(0); }
  if (bn.isNegative?.()) bn = BigNum.fromInt(0);

  const expectedRaw = bn.toStorage();

  try { localStorage.setItem(k, expectedRaw); }
  catch {}

  let persistedRaw = null;
  try { persistedRaw = localStorage.getItem(k); }
  catch {}

  const effectiveRaw = persistedRaw ?? expectedRaw;
  let effective = bn;
  try {
    if (persistedRaw != null) {
      effective = BigNum.fromAny(persistedRaw);
      if (effective.isNegative?.()) effective = BigNum.fromInt(0);
    }
  } catch {}
  
  primeStorageWatcherSnapshot(k, effectiveRaw);

  const changed = !bigNumEquals(prev, effective);

  const parseDelta = (source) => {
    if (source == null) return null;
    try {
      const bnDelta = source instanceof BigNum ? source.clone?.() ?? source : BigNum.fromAny(source);
      if (typeof bnDelta.cmp === 'function') {
        return bnDelta.cmp(zero) > 0 ? bnDelta : null;
      }
      if (!bnDelta.isZero?.()) return bnDelta;
    } catch {}
    return null;
  };

  const providedDelta = parseDelta(delta);
  let deltaBn = null;
  if (changed) {
    try { deltaBn = effective.sub?.(prev); }
    catch {}
  }
  if (!deltaBn || deltaBn.isZero?.() || (typeof deltaBn.cmp === 'function' && deltaBn.cmp(zero) <= 0)) {
    deltaBn = providedDelta;
  }

  if (changed || deltaBn) {
    const detail = { key, value: effective, slot, delta: deltaBn ?? undefined };
    notifyCurrencySubscribers(detail);
    try { window.dispatchEvent(new CustomEvent('currency:change', { detail })); } catch {}
  }

  return effective;
}

function scaledFromIntBN(intBN) {
  return intBN.mulScaledIntFloor(1n, -MULT_SCALE);
}

// theoretical (×10^MULT_SCALE) → integer BN multiplier (floor), min 1
function intFromScaled(theorBN) {
  const bn = BigNum.fromAny(theorBN);
  if (bn.isInfinite()) return bn.clone();
  const scaled = bn.mulScaledIntFloor(1n, MULT_SCALE);
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

function setMultiplierScaled(key, theoreticalBN, slot = getActiveSlot()) {
  const k = keyFor(KEYS.MULTIPLIER[key], slot);
  if (!k) return;
  if (isCurrencyLocked(key, slot)) return; // Respect debug-panel storage locks
  let prev = scaledFromIntBN(BigNum.fromInt(1));
  const existingRaw = localStorage.getItem(k);
  if (existingRaw?.startsWith?.(MULT_SCALE_TAG)) {
    try {
      prev = BigNum.fromAny(existingRaw.slice(MULT_SCALE_TAG.length));
    } catch {}
  }
  const bn = BigNum.fromAny(theoreticalBN);
  const raw = MULT_SCALE_TAG + bn.toStorage();
  try { localStorage.setItem(k, raw); }
  catch {}

  let persistedRaw = null;
  try { persistedRaw = localStorage.getItem(k); }
  catch {}

  const effectiveRaw = persistedRaw ?? raw;
  let effective = bn;
  try {
    const payload = effectiveRaw?.startsWith?.(MULT_SCALE_TAG)
      ? effectiveRaw.slice(MULT_SCALE_TAG.length)
      : null;
    if (payload != null) effective = BigNum.fromAny(payload);
  } catch {}
  // Keep any live storage watchers (and save-integrity snapshots) aligned with the
  // freshly-written multiplier so follow-up writes don't look like manual tampering.
  try { primeStorageWatcherSnapshot(k, effectiveRaw); } catch {}
  if (!bigNumEquals(prev, effective)) {
    try {
      window.dispatchEvent(new CustomEvent('currency:multiplier', {
        detail: { key, mult: intFromScaled(effective), slot }
      }));
    } catch {}
  }
}

export function getCurrencyMultiplierBN(key) {
  return intFromScaled(getMultiplierScaled(key));
}

export function isCurrencyLocked(key, slot = getActiveSlot()) {
  const k = keyFor(KEYS.CURRENCY[key], slot);
  return isDebugLocked(k);
}

// public set integer BN multiplier (stored as scaled theoretical)
export function setCurrencyMultiplierBN(key, intBNValue) {
  const v = BigNum.fromAny(intBNValue);
  const theor = scaledFromIntBN(v);
  setMultiplierScaled(key, theor, getActiveSlot());
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
    const effective = setCurrency(key, next, { delta: amt, previous: this.value });
    return effective;
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
    let delta = null;
    let current;
    try {
      current = this.value;
      if (current && typeof current.sub === 'function') {
        delta = val.sub(current);
      }
    } catch {}
    const effective = setCurrency(key, val, { delta, previous: current });
    return effective;
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
  for (const currency of Object.values(CURRENCIES)) {
    window[currency] = bank[currency];
  }
}
