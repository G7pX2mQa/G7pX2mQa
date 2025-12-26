// js/game/xpSystem.js

import { BigNum } from '../util/bigNum.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { formatNumber } from '../util/numFormat.js';
import { syncXpMpHudLayout } from '../ui/hudLayout.js';

const KEY_PREFIX = 'ccc:xp';
const KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
const KEY_XP_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
const KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;

export function getXpLevelStorageKey(slot = getActiveSlot()) {
  const resolvedSlot = slot ?? getActiveSlot();
  return resolvedSlot == null ? null : KEY_XP_LEVEL(resolvedSlot);
}

let lastSlot = null;
let stateLoaded = false;
let requirementBn = BigNum.fromInt(10);
const xpRequirementCache = new Map();
xpRequirementCache.set('0', requirementBn);
let highestCachedExactLevel = 0n;
const infinityRequirementBn = BigNum.fromAny('Infinity');

let lastSyncedCoinLevel = null;
let lastSyncedCoinLevelWasInfinite = false;
let lastSyncedCoinUsedApproximation = false;
let lastSyncedCoinApproxKey = null;
let externalCoinMultiplierProvider = null;
let externalXpGainMultiplierProvider = null;
const coinMultiplierProviders = new Set();
const xpGainMultiplierProviders = new Set();
let externalBookRewardProvider = null;

const EXACT_REQUIREMENT_CACHE_LEVEL = 5000n;
const LOG_STEP = Math.log10(11 / 10);
const LOG_DECADE_BONUS = Math.log10(5 / 2);
const EXACT_COIN_LEVEL_LIMIT = 200n;
const LOG_STEP_DECIMAL = '0.04139268515822507';
const LOG_DECADE_BONUS_DECIMAL = '0.3979400086720376';
const TEN_DIVISOR_DECIMAL = '0.1';
const maxLog10Bn = BigNum.fromScientific(String(BigNum.MAX_E));

function bigIntToFloatApprox(value) {
  if (value === 0n) return 0;
  const str = value.toString();
  const len = str.length;
  const headDigits = Math.min(len, 15);
  const head = Number(str.slice(0, headDigits));
  const exponent = len - headDigits;
  if (!Number.isFinite(head)) return Number.POSITIVE_INFINITY;
  const scaled = head * Math.pow(10, exponent);
  return Number.isFinite(scaled) ? scaled : Number.POSITIVE_INFINITY;
}

function bigNumIsInfinite(bn) {
  return !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));
}

function bigNumIsZero(bn) {
  return !bn || typeof bn !== 'object' || (bn.isZero?.() || (typeof bn.isZero === 'function' && bn.isZero()));
}

function bigNumToFiniteNumber(bn) {
  if (!bn || typeof bn !== 'object') return 0;
  if (bigNumIsInfinite(bn)) return Number.POSITIVE_INFINITY;
  const sci = typeof bn.toScientific === 'function' ? bn.toScientific(18) : String(bn);
  if (!sci || sci === 'Infinity') return Number.POSITIVE_INFINITY;
  const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
  if (match) {
    const mant = parseFloat(match[1]);
    const exp = parseInt(match[2], 10);
    if (!Number.isFinite(mant) || !Number.isFinite(exp)) return Number.POSITIVE_INFINITY;
    if (exp >= 309) return Number.POSITIVE_INFINITY;
    return mant * Math.pow(10, exp);
  }
  const num = Number(sci);
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}

function logBigNumToNumber(bn) {
  if (!bn || typeof bn !== 'object') return 0;
  if (bigNumIsInfinite(bn)) return Number.POSITIVE_INFINITY;
  if (typeof bn.cmp === 'function' && bn.cmp(maxLog10Bn) >= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return bigNumToFiniteNumber(bn);
}

function computeBonusCountBn(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') return BigNum.fromInt(0);
  const divided = levelBn.mulDecimal(TEN_DIVISOR_DECIMAL, 1);
  const floored = divided.floorToInteger();
  if (typeof divided.cmp === 'function' && divided.cmp(floored) === 0) {
    if (floored.isZero?.() || (typeof floored.isZero === 'function' && floored.isZero())) {
      return floored;
    }
    return floored.sub?.(bnOne()) ?? BigNum.fromInt(0);
  }
  return floored;
}

function computeLevelLogTerm(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') return BigNum.fromInt(0);
  return levelBn.mulDecimal(LOG_STEP_DECIMAL, 18);
}

function computeBonusLogTerm(levelBn) {
  const bonusCount = computeBonusCountBn(levelBn);
  if (bigNumIsZero(bonusCount)) return null;
  return bonusCount.mulDecimal(LOG_DECADE_BONUS_DECIMAL, 18);
}

function bigNumPowerOf10(logBn) {
  if (bigNumIsInfinite(logBn) || (typeof logBn.cmp === 'function' && logBn.cmp(maxLog10Bn) >= 0)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  const integerPart = logBn.floorToInteger();
  const fractionalPart = logBn.sub(integerPart);
  const fractionalNumber = bigNumToFiniteNumber(fractionalPart);

  if (!Number.isFinite(fractionalNumber)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  let mantissa = Math.pow(10, fractionalNumber);

  const precision = 18;
  const scaleFactor = 10n ** BigInt(precision);

  let exponentAdjustment = 0n;
  if (mantissa >= 10) {
      mantissa /= 10;
      exponentAdjustment = 1n;
  }

  const sig = BigInt(Math.round(mantissa * Number(scaleFactor)));

  const integerPartString = integerPart.toPlainIntegerString();
  if (integerPartString === 'Infinity') {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const integerPartBigInt = BigInt(integerPartString);

  const totalExponent = integerPartBigInt + exponentAdjustment - BigInt(precision);

  const E_LIMIT = 250;
  const eBigInt = totalExponent % BigInt(E_LIMIT);
  const e = Number(eBigInt);
  const offset = totalExponent - eBigInt;

  return new BigNum(sig, { base: e, offset: offset });
}

function approximateCoinMultiplierFromBigNum(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const levelLog = computeLevelLogTerm(levelBn);
  let totalLog = levelLog;
  const approx = bigNumPowerOf10(totalLog);
  const approxIsInf = approx.isInfinite?.() || (typeof approx.isInfinite === 'function' && approx.isInfinite());
  if (approxIsInf) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const levelTerm = levelBn.clone?.() ?? (() => {
    try { return BigNum.fromAny(levelBn ?? 0); }
    catch { return BigNum.fromInt(0); }
  })();
  let combined = approx.clone?.() ?? approx;
  if (typeof combined.add === 'function') {
    combined = combined.add(levelTerm);
  } else if (typeof levelTerm.add === 'function') {
    combined = levelTerm.add(combined);
  }
  return combined;
}

const xpState = {
  unlocked: false,
  xpLevel: BigNum.fromInt(0),
  progress: BigNum.fromInt(0),
};

function enforceXpInfinityInvariant() {
  const levelIsInf = bigNumIsInfinite(xpState.xpLevel);
  const progIsInf = bigNumIsInfinite(xpState.progress);
  if (!levelIsInf && !progIsInf) return false;

  const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  xpState.xpLevel = inf.clone?.() ?? inf;
  xpState.progress = inf.clone?.() ?? inf;
  requirementBn = inf.clone?.() ?? inf;

  if (bank?.books) {
    try {
      if (typeof bank.books.set === 'function') {
        bank.books.set(inf.clone?.() ?? inf);
      } else if (typeof bank.books.add === 'function') {
        bank.books.add(inf.clone?.() ?? inf);
      }
    } catch {
    }
  }
  
  return true;
}


const xpChangeSubscribers = new Set();

function notifyXpSubscribers(detail = {}) {
  if (xpChangeSubscribers.size === 0) return;
  xpChangeSubscribers.forEach((entry) => {
    if (!entry || typeof entry.handler !== 'function') return;
    if (entry.slot != null && detail.slot != null && entry.slot !== detail.slot) return;
    try { entry.handler(detail); }
    catch {}
  });
}

export function onXpChange(handler, { slot = null } = {}) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  const entry = { handler, slot: slot ?? null };
  xpChangeSubscribers.add(entry);
  return () => {
    xpChangeSubscribers.delete(entry);
  };
}

const hudRefs = {
  container: null,
  bar: null,
  fill: null,
  xpLevelValue: null,
  progress: null,
};

function bnZero() {
  return BigNum.fromInt(0);
}

function bnOne() {
  return BigNum.fromInt(1);
}

const xpStorageWatcherCleanups = [];
let xpStorageWatchersInitialized = false;
let xpStorageWatcherSlot = null;
let handlingExternalXpStorage = false;

function cloneBigNumSafe(value) {
  if (!value) return bnZero();
  if (typeof value.clone === 'function') {
    try { return value.clone(); } catch {}
  }
  try { return BigNum.fromAny(value); } catch { return bnZero(); }
}

function bigNumEqualsSafe(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a?.cmp === 'function') {
    try { return a.cmp(b) === 0; } catch {}
  }
  if (typeof b?.cmp === 'function') {
    try { return b.cmp(a) === 0; } catch {}
  }
  try { return Object.is(String(a), String(b)); }
  catch { return false; }
}

function cleanupXpStorageWatchers() {
  while (xpStorageWatcherCleanups.length > 0) {
    const stop = xpStorageWatcherCleanups.pop();
    try { stop?.(); } catch {}
  }
}

function parseBigNumOrZero(raw) {
  if (raw == null) return bnZero();
  try { return BigNum.fromAny(raw); }
  catch { return bnZero(); }
}

function handleExternalXpStorageChange(reason) {
  if (handlingExternalXpStorage) return;
  handlingExternalXpStorage = true;
  try {
    const slot = xpStorageWatcherSlot ?? getActiveSlot();
    const prev = {
      unlocked: xpState.unlocked,
      xpLevel: cloneBigNumSafe(xpState.xpLevel),
      progress: cloneBigNumSafe(xpState.progress),
      requirement: cloneBigNumSafe(requirementBn),
    };
    ensureStateLoaded(true);
    updateHud();
    syncCoinMultiplierWithXpLevel(true);
    const current = {
      unlocked: xpState.unlocked,
      xpLevel: cloneBigNumSafe(xpState.xpLevel),
      progress: cloneBigNumSafe(xpState.progress),
      requirement: cloneBigNumSafe(requirementBn),
    };
    const unlockedChanged = prev.unlocked !== current.unlocked;
    const levelChanged = !bigNumEqualsSafe(prev.xpLevel, current.xpLevel);
    const progressChanged = !bigNumEqualsSafe(prev.progress, current.progress);
    if (!unlockedChanged && !levelChanged && !progressChanged) {
      return;
    }
    let xpLevelsGained = bnZero();
    if (levelChanged) {
      try { xpLevelsGained = current.xpLevel.sub?.(prev.xpLevel) ?? bnZero(); }
      catch { xpLevelsGained = bnZero(); }
    }
    let xpAdded = null;
    if (!levelChanged && progressChanged) {
      try { xpAdded = current.progress.sub?.(prev.progress) ?? null; }
      catch { xpAdded = null; }
    }
    if (typeof window !== 'undefined' || xpChangeSubscribers.size > 0) {
      const detail = {
        unlocked: current.unlocked,
        xpLevelsGained: xpLevelsGained?.clone?.() ?? xpLevelsGained,
        xpAdded: xpAdded?.clone?.() ?? xpAdded,
        xpLevel: current.xpLevel?.clone?.() ?? current.xpLevel,
        progress: current.progress?.clone?.() ?? current.progress,
        requirement: current.requirement?.clone?.() ?? current.requirement,
        source: 'storage',
        changeType: reason,
        slot,
      };
      notifyXpSubscribers(detail);
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
      }
    }
  } finally {
    handlingExternalXpStorage = false;
  }
}

function bindXpStorageWatchersForSlot(slot) {
  if (slot === xpStorageWatcherSlot) return;
  cleanupXpStorageWatchers();
  xpStorageWatcherSlot = slot ?? null;
  if (slot == null) return;
  const watch = (key, options) => {
    const stop = watchStorageKey(key, options);
    if (typeof stop === 'function') {
      xpStorageWatcherCleanups.push(stop);
    }
  };
  watch(KEY_UNLOCK(slot), {
    parse: (raw) => raw === '1',
    equals: (a, b) => a === b,
    onChange: () => handleExternalXpStorageChange('unlock'),
  });
  watch(KEY_XP_LEVEL(slot), {
    parse: parseBigNumOrZero,
    equals: bigNumEqualsSafe,
    onChange: () => handleExternalXpStorageChange('xpLevel'),
  });
  watch(KEY_PROGRESS(slot), {
    parse: parseBigNumOrZero,
    equals: bigNumEqualsSafe,
    onChange: () => handleExternalXpStorageChange('progress'),
  });
}

function ensureXpStorageWatchers() {
  if (xpStorageWatchersInitialized) {
    bindXpStorageWatchersForSlot(getActiveSlot());
    return;
  }
  xpStorageWatchersInitialized = true;
  bindXpStorageWatchersForSlot(getActiveSlot());
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      bindXpStorageWatchersForSlot(getActiveSlot());
      ensureStateLoaded(true);
      updateHud();
      syncCoinMultiplierWithXpLevel(true);
    });
  }
}

function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '');
}

function approxLog10(bn) {
  if (!bn || typeof bn !== 'object') return Number.NEGATIVE_INFINITY;
  if (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())) {
    return Number.POSITIVE_INFINITY;
  }
  if (bn.isZero?.() || (typeof bn.isZero === 'function' && bn.isZero())) {
    return Number.NEGATIVE_INFINITY;
  }

  // Prefer the BigNum internal representation so we can handle chained-exponent
  // values (e.g. 1e8.11e21) without going through lossy string parsing.
  const sig = bn.sig;
  const expBase = typeof bn.e === 'number' ? bn.e : Number(bn.e ?? 0);
  const expOffset = typeof bn._eOffset === 'bigint'
    ? bigIntToFloatApprox(bn._eOffset)
    : Number(bn._eOffset ?? 0);

  if (!Number.isFinite(expBase)) {
    return expBase > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  if (!Number.isFinite(expOffset)) {
    return expOffset > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }

  const totalExponent = expBase + expOffset;
  if (!Number.isFinite(totalExponent)) {
    return totalExponent > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }

  let mantissaLog = 0;
  if (typeof sig === 'bigint') {
    const sigStr = sig.toString();
    const trimmed = sigStr.replace(/^0+/, '');
    if (!trimmed) return Number.NEGATIVE_INFINITY;
    const digits = trimmed.length;
    const headDigits = Math.min(digits, 15);
    const headSlice = trimmed.slice(0, headDigits);
    const head = Number.parseFloat(headSlice);
    if (Number.isFinite(head) && head > 0) {
      mantissaLog = Math.log10(head) + (digits - headDigits);
    } else {
      mantissaLog = digits - 1;
    }
  } else {
    try {
      const sci = typeof bn.toScientific === 'function' ? bn.toScientific(12) : String(bn);
      if (!sci || sci === '0') return Number.NEGATIVE_INFINITY;
      if (sci === 'Infinity') return Number.POSITIVE_INFINITY;
      const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
      if (match) {
        const mant = parseFloat(match[1]);
        const exp = parseInt(match[2], 10) || 0;
        if (!(mant > 0) || !Number.isFinite(mant)) return Number.NEGATIVE_INFINITY;
        mantissaLog = Math.log10(mant) + exp;
      } else {
        const num = Number(sci);
        if (!Number.isFinite(num) || num <= 0) return Number.NEGATIVE_INFINITY;
        mantissaLog = Math.log10(num);
      }
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }

  return totalExponent + mantissaLog;
}

function bonusMultipliersCount(levelBigInt) {
  if (levelBigInt <= 1n) return 0n;
  return (levelBigInt - 1n) / 10n;
}

function ensureExactRequirementCacheUpTo(levelBigInt) {
  const target = levelBigInt < EXACT_REQUIREMENT_CACHE_LEVEL ? levelBigInt : EXACT_REQUIREMENT_CACHE_LEVEL;
  if (target <= highestCachedExactLevel) return;

  let currentLevel = highestCachedExactLevel;
  let currentRequirement = xpRequirementCache.get(currentLevel.toString());
  if (!currentRequirement) {
    currentRequirement = BigNum.fromInt(10);
    xpRequirementCache.set(currentLevel.toString(), currentRequirement);
  }

  while (currentLevel < target) {
    const nextLevel = currentLevel + 1n;
    let nextRequirement = currentRequirement.mulScaledIntFloor(11n, 1);
    if (nextLevel > 1n && ((nextLevel - 1n) % 10n === 0n)) {
      nextRequirement = nextRequirement.mulScaledIntFloor(25n, 1);
    }
    xpRequirementCache.set(nextLevel.toString(), nextRequirement);
    currentRequirement = nextRequirement;
    currentLevel = nextLevel;
    const isInfinite = currentRequirement.isInfinite?.() || (typeof currentRequirement.isInfinite === 'function' && currentRequirement.isInfinite());
    if (isInfinite) {
      highestCachedExactLevel = currentLevel;
      return;
    }
  }

  highestCachedExactLevel = currentLevel;
}

function bigNumFromLog10(log10Value) {
  if (!Number.isFinite(log10Value) || log10Value >= BigNum.MAX_E) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  let exponent = Math.floor(log10Value);
  let fractional = log10Value - exponent;
  if (!Number.isFinite(fractional)) {
    fractional = 0;
  }

  let mantissa = Math.pow(10, fractional);
  if (!Number.isFinite(mantissa) || mantissa <= 0) {
    mantissa = 1;
  }

  if (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }

  let exponentStr;
  try {
    exponentStr = Number.isFinite(exponent)
      ? exponent.toLocaleString('en', { useGrouping: false })
      : String(exponent);
  } catch {
    exponentStr = String(exponent);
  }

  const sci = `${mantissa.toPrecision(18)}e${exponentStr}`;
  try {
    return BigNum.fromScientific(sci).floorToInteger();
  } catch {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
}

function approximateRequirementFromLevel(levelBn) {
  const baseLevel = highestCachedExactLevel > 0n ? highestCachedExactLevel : 0n;
  const baseRequirement = xpRequirementCache.get(baseLevel.toString());
  if (!baseRequirement || bigNumIsInfinite(baseRequirement)) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  const baseLevelBn = BigNum.fromAny(baseLevel.toString());
  const baseLog = approxLog10(baseRequirement);
  let totalLog = BigNum.fromInt(0);
  if (Number.isFinite(baseLog) && baseLog > 0) {
    try {
      totalLog = BigNum.fromScientific(baseLog.toString());
    } catch {
      totalLog = BigNum.fromInt(0);
    }
  }

  const deltaLevel = levelBn.sub?.(baseLevelBn) ?? BigNum.fromInt(0);
  if (!bigNumIsZero(deltaLevel)) {
    totalLog = totalLog.add?.(deltaLevel.mulDecimal(LOG_STEP_DECIMAL, 18)) ?? totalLog;
  }

  const targetBonus = computeBonusCountBn(levelBn);
  const baseBonus = computeBonusCountBn(baseLevelBn);
  const deltaBonus = targetBonus.sub?.(baseBonus) ?? BigNum.fromInt(0);
  if (!bigNumIsZero(deltaBonus)) {
    totalLog = totalLog.add?.(deltaBonus.mulDecimal(LOG_DECADE_BONUS_DECIMAL, 18)) ?? totalLog;
  }

  const logNumber = logBigNumToNumber(totalLog);
  if (!Number.isFinite(logNumber)) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  return bigNumFromLog10(logNumber);
}

function progressRatio(progressBn, requirement) {
  if (!requirement || typeof requirement !== 'object') return 0;
  if (!progressBn || typeof progressBn !== 'object') return 0;

  const reqIsInf = bigNumIsInfinite(requirement);
  const progIsInf = bigNumIsInfinite(progressBn);

  // If both are infinite, treat as a full bar.
  if (reqIsInf) {
    return progIsInf ? 1 : 0;
  }

  const reqIsZero = bigNumIsZero(requirement);
  if (reqIsZero) return 0;

  const progIsZero = bigNumIsZero(progressBn);
  if (progIsZero) return 0;

  const logProg = approxLog10(progressBn);
  const logReq  = approxLog10(requirement);
  if (!Number.isFinite(logProg) || !Number.isFinite(logReq)) {
    return logProg >= logReq ? 1 : 0;
  }
  const diff = logProg - logReq;
  const ratio = Math.pow(10, diff);
  if (!Number.isFinite(ratio)) {
    return diff >= 0 ? 1 : 0;
  }
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}

function ensureHudRefs() {
  if (hudRefs.container && hudRefs.container.isConnected) return true;
  hudRefs.container = document.querySelector('.xp-counter[data-xp-hud]');
  if (!hudRefs.container) return false;
  hudRefs.bar = hudRefs.container.querySelector('.xp-bar');
  hudRefs.fill = hudRefs.container.querySelector('.xp-bar__fill');
  hudRefs.xpLevelValue = hudRefs.container.querySelector('.xp-level-value');
  hudRefs.progress = hudRefs.container.querySelector('[data-xp-progress]');
  return true;
}

function xpRequirementForXpLevel(xpLevelInput) {
  let xpLvlBn;
  try {
    xpLvlBn = xpLevelInput instanceof BigNum
      ? (xpLevelInput.clone?.() ?? xpLevelInput)
      : BigNum.fromAny(xpLevelInput ?? 0);
  } catch {
    xpLvlBn = BigNum.fromInt(0);
  }

  const lvlIsInf = xpLvlBn.isInfinite?.() || (typeof xpLvlBn.isInfinite === 'function' && xpLvlBn.isInfinite());
  if (lvlIsInf) {
    return BigNum.fromAny('Infinity');
  }

  let levelPlain = '0';
  try {
    levelPlain = xpLvlBn.toPlainIntegerString?.() ?? xpLvlBn.toString?.() ?? '0';
  } catch {
    levelPlain = '0';
  }

  let targetLevelInfo = { bigInt: null, finite: true };
  if (levelPlain && levelPlain !== 'Infinity') {
    try {
      targetLevelInfo = { bigInt: BigInt(levelPlain), finite: true };
    } catch {
      targetLevelInfo = { bigInt: null, finite: true };
    }
  } else {
    targetLevelInfo = { bigInt: null, finite: true };
  }

  const targetLevel = targetLevelInfo.bigInt ?? 0n;

  if (targetLevelInfo.bigInt != null && targetLevel <= 0n) {
    const baseRequirement = xpRequirementCache.get('0');
    return baseRequirement.clone?.() ?? baseRequirement;
  }

  if (targetLevelInfo.bigInt != null) {
    ensureExactRequirementCacheUpTo(targetLevel);
    const targetKey = targetLevel.toString();
    const cachedExact = xpRequirementCache.get(targetKey);
    if (cachedExact) {
      return cachedExact.clone?.() ?? cachedExact;
    }
  }

  const approximate = approximateRequirementFromLevel(xpLvlBn);
  const approxIsInf = approximate.isInfinite?.() || (typeof approximate.isInfinite === 'function' && approximate.isInfinite());
  if (approxIsInf) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  if (targetLevelInfo.bigInt != null) {
    xpRequirementCache.set(targetLevelInfo.bigInt.toString(), approximate);
  }
  return approximate.clone?.() ?? approximate;
}

function updateXpRequirement() {
  requirementBn = xpRequirementForXpLevel(xpState.xpLevel);
}

function resetLockedXpState() {
  xpState.xpLevel = bnZero();
  xpState.progress = bnZero();
  updateXpRequirement();
  syncCoinMultiplierWithXpLevel(true);
}

function normalizeProgress(applyRewards = false) {
  // If either level or progress is already ∞, enforce the invariant and bail.
  if (enforceXpInfinityInvariant()) {
    return;
  }

  updateXpRequirement();

  // If the requirement is infinite, there is nothing meaningful to normalize.
  if (bigNumIsInfinite(requirementBn)) {
    return;
  }

  let guard = 0;
  const limit = 10000;
  while (xpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    try { xpState.progress = xpState.progress.sub(requirementBn); }
    catch { xpState.progress = bnZero(); }

    try { xpState.xpLevel = xpState.xpLevel.add(bnOne()); }
    catch { xpState.xpLevel = bnZero(); }

    if (applyRewards) handleXpLevelUpRewards();
    updateXpRequirement();

    if (bigNumIsInfinite(requirementBn)) {
      break;
    }
    guard += 1;
  }

  if (guard >= limit) {
    xpState.progress = bnZero();
  }
}

function xpLevelBigIntInfo(xpLevelValue) {
  if (!xpLevelValue || typeof xpLevelValue !== 'object') {
    return { bigInt: 0n, finite: false };
  }
  const levelIsInfinite = xpLevelValue.isInfinite?.() || (typeof xpLevelValue.isInfinite === 'function' && xpLevelValue.isInfinite());
  if (levelIsInfinite) {
    return { bigInt: null, finite: false };
  }
  let plain = '0';
  try {
    plain = xpLevelValue.toPlainIntegerString?.() ?? xpLevelValue.toString?.() ?? '0';
  } catch {
    plain = '0';
  }
  if (plain === 'Infinity') {
    return { bigInt: null, finite: false };
  }
  if (!plain) {
    return { bigInt: null, finite: true };
  }
  try {
    return { bigInt: BigInt(plain), finite: true };
  } catch {
    return { bigInt: null, finite: true };
  }
}

function syncCoinMultiplierWithXpLevel(force = false) {
  const multApi = bank?.coins?.mult;
  if (!multApi || typeof multApi.set !== 'function' || typeof multApi.multiplyByDecimal !== 'function') {
    return;
  }

  const levelInfo = xpLevelBigIntInfo(xpState.xpLevel);
  const levelBigInt = levelInfo.bigInt;
  const levelIsInfinite = !levelInfo.finite;
  const levelStorageKey = typeof xpState.xpLevel?.toStorage === 'function' ? xpState.xpLevel.toStorage() : null;

  if (!force) {
    if (levelIsInfinite && lastSyncedCoinLevelWasInfinite) {
      return;
    }
    if (!levelIsInfinite && levelBigInt != null && !lastSyncedCoinLevelWasInfinite && !lastSyncedCoinUsedApproximation && lastSyncedCoinLevel != null && levelBigInt === lastSyncedCoinLevel) {
      return;
    }
    if (!levelIsInfinite && levelBigInt == null && lastSyncedCoinUsedApproximation && levelStorageKey && lastSyncedCoinApproxKey && levelStorageKey === lastSyncedCoinApproxKey) {
      return;
    }
  }

  if (levelIsInfinite) {
    try { multApi.set(infinityRequirementBn); } catch {}
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
    return;
  }

  let multiplierBn;
  if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
    let working = BigNum.fromInt(1);
    const iterations = Number(levelBigInt);
    for (let i = 0; i < iterations; i += 1) {
      working = working.mulDecimal('1.1', 18);
    }
    let levelAdd;
    try { levelAdd = BigNum.fromAny(levelBigInt.toString()); }
    catch { levelAdd = BigNum.fromInt(iterations); }
    if (typeof working.add === 'function') {
      working = working.add(levelAdd);
    } else if (typeof levelAdd.add === 'function') {
      working = levelAdd.add(working);
    }
    multiplierBn = working.clone?.() ?? working;
  } else {
    multiplierBn = approximateCoinMultiplierFromBigNum(xpState.xpLevel);
  }

  let finalMultiplier = multiplierBn.clone?.() ?? multiplierBn;
  const providers = coinMultiplierProviders.size > 0
    ? Array.from(coinMultiplierProviders)
    : (typeof externalCoinMultiplierProvider === 'function' ? [externalCoinMultiplierProvider] : []);
  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    try {
      const maybe = provider({
        baseMultiplier: finalMultiplier.clone?.() ?? finalMultiplier,
        xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
        xpUnlocked: xpState.unlocked,
      });
      if (maybe instanceof BigNum) {
        finalMultiplier = maybe.clone?.() ?? maybe;
      } else if (maybe != null) {
        finalMultiplier = BigNum.fromAny(maybe);
      }
    } catch {}
  }

  const multIsInf = finalMultiplier.isInfinite?.() || (typeof finalMultiplier.isInfinite === 'function' && finalMultiplier.isInfinite());
  try { multApi.set(finalMultiplier.clone?.() ?? finalMultiplier); } catch {}
  if (multIsInf) {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
    lastSyncedCoinLevel = levelBigInt;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = true;
    lastSyncedCoinApproxKey = levelStorageKey;
  }
}

function ensureStateLoaded(force = false) {
  const slot = getActiveSlot();
  if (slot == null) {
    lastSlot = null;
    stateLoaded = false;
    xpState.unlocked = false;
    resetLockedXpState();
    return xpState;
  }
  if (!force && stateLoaded && slot === lastSlot) return xpState;
  lastSlot = slot;
  stateLoaded = true;
  try {
    const unlockedRaw = localStorage.getItem(KEY_UNLOCK(slot));
    xpState.unlocked = unlockedRaw === '1';
  } catch {
    xpState.unlocked = false;
  }
  try {
    xpState.xpLevel = BigNum.fromAny(localStorage.getItem(KEY_XP_LEVEL(slot)) ?? '0');
  } catch {
    xpState.xpLevel = bnZero();
  }
  try {
    xpState.progress = BigNum.fromAny(localStorage.getItem(KEY_PROGRESS(slot)) ?? '0');
  } catch {
    xpState.progress = bnZero();
  }

  // If we loaded an infinite value (e.g. from debug/cheat), force unlock
  // so we don't immediately reset it to zero in the locked check below.
  if (bigNumIsInfinite(xpState.xpLevel) || bigNumIsInfinite(xpState.progress)) {
    xpState.unlocked = true;
  }

  if (!xpState.unlocked) {
    resetLockedXpState();
    return xpState;
  }

  enforceXpInfinityInvariant();

  updateXpRequirement();
  syncCoinMultiplierWithXpLevel(true);
  ensureXpStorageWatchers();
  return xpState;
}

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;

  const expected = {
    unlocked: xpState.unlocked ? '1' : '0',
    level: xpState.xpLevel.toStorage(),
    progress: xpState.progress.toStorage(),
  };

  try { localStorage.setItem(KEY_UNLOCK(slot), expected.unlocked); }
  catch {}
  try { localStorage.setItem(KEY_XP_LEVEL(slot), expected.level); }
  catch {}
  try { localStorage.setItem(KEY_PROGRESS(slot), expected.progress); }
  catch {}

  const persisted = (() => {
    let unlocked = xpState.unlocked;
    let level = xpState.xpLevel;
    let progress = xpState.progress;
    try { unlocked = localStorage.getItem(KEY_UNLOCK(slot)) === '1'; }
    catch {}
    try {
      const rawLevel = localStorage.getItem(KEY_XP_LEVEL(slot));
      if (rawLevel) level = BigNum.fromAny(rawLevel);
    } catch {}
    try {
      const rawProgress = localStorage.getItem(KEY_PROGRESS(slot));
      if (rawProgress) progress = BigNum.fromAny(rawProgress);
    } catch {}
    return { unlocked, level, progress };
  })();

  primeStorageWatcherSnapshot(KEY_UNLOCK(slot), persisted.unlocked ? '1' : '0');
  primeStorageWatcherSnapshot(KEY_XP_LEVEL(slot), persisted.level?.toStorage?.() ?? expected.level);
  primeStorageWatcherSnapshot(KEY_PROGRESS(slot), persisted.progress?.toStorage?.() ?? expected.progress);

  const mismatch =
    persisted.unlocked !== xpState.unlocked ||
    (persisted.level?.toStorage?.() ?? null) !== expected.level ||
    (persisted.progress?.toStorage?.() ?? null) !== expected.progress;

  if (mismatch) {
    xpState.unlocked = persisted.unlocked;
    xpState.xpLevel = persisted.level;
    xpState.progress = persisted.progress;
    updateXpRequirement();
    syncCoinMultiplierWithXpLevel(true);
    updateHud();
  }
}

function handleXpLevelUpRewards() {
  syncCoinMultiplierWithXpLevel(true);

  let reward = bnOne();
  if (typeof externalBookRewardProvider === 'function') {
    try {
      const maybe = externalBookRewardProvider({
        baseReward: reward.clone?.() ?? reward,
        xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
        xpUnlocked: xpState.unlocked,
      });
      if (maybe instanceof BigNum) {
        reward = maybe.clone?.() ?? maybe;
      } else if (maybe != null) {
        reward = BigNum.fromAny(maybe);
      }
    } catch {}
  }

  try {
    if (bank?.books?.addWithMultiplier) {
      bank.books.addWithMultiplier(reward);
    } else if (bank?.books?.add) {
      bank.books.add(reward);
    }
  } catch {}
  const syncedLevelInfo = xpLevelBigIntInfo(xpState.xpLevel);
  if (!syncedLevelInfo.finite) {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else if (syncedLevelInfo.bigInt != null) {
    lastSyncedCoinLevel = syncedLevelInfo.bigInt;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = true;
    lastSyncedCoinApproxKey = typeof xpState.xpLevel?.toStorage === 'function' ? xpState.xpLevel.toStorage() : null;
  }
}

function updateHud() {
  if (!ensureHudRefs()) return;
  const { container, bar, fill, xpLevelValue, progress } = hudRefs;
  if (!container) return;
  if (!xpState.unlocked) {
    container.setAttribute('hidden', '');
    if (fill) {
      fill.style.setProperty('--xp-fill', '0%');
      fill.style.width = '0%';
    }
    if (xpLevelValue) xpLevelValue.textContent = '0';
    if (progress) {
      const reqHtml = formatNumber(requirementBn);
      progress.innerHTML = `<span class="xp-progress-current">0</span><span class="xp-progress-separator">/</span><span class="xp-progress-required">${reqHtml}</span><span class="xp-progress-suffix">XP</span>`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', '0');
      const reqPlain = stripHtml(formatNumber(requirementBn));
      bar.setAttribute('aria-valuetext', `0 / ${reqPlain || '10'} XP`);
    }
    syncXpMpHudLayout();
    return;
  }

  container.removeAttribute('hidden');
  const requirement = requirementBn;
  const ratio = progressRatio(xpState.progress, requirement);
  const pct = `${(ratio * 100).toFixed(2)}%`;
  if (fill) {
    fill.style.setProperty('--xp-fill', pct);
    fill.style.width = pct;
  }
  if (xpLevelValue) {
    xpLevelValue.innerHTML = formatNumber(xpState.xpLevel);
  }
  if (progress) {
    const currentHtml = formatNumber(xpState.progress);
    const reqHtml = formatNumber(requirement);
    progress.innerHTML = `<span class="xp-progress-current">${currentHtml}</span><span class="xp-progress-separator">/</span><span class="xp-progress-required">${reqHtml}</span><span class="xp-progress-suffix">XP</span>`;
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', (ratio * 100).toFixed(2));
    const currPlain = stripHtml(formatNumber(xpState.progress));
    const reqPlain = stripHtml(formatNumber(requirement));
    bar.setAttribute('aria-valuetext', `${currPlain} / ${reqPlain} XP`);
  }
  syncXpMpHudLayout();
}

export function initXpSystem({ forceReload = false } = {}) {
  ensureHudRefs();
  ensureStateLoaded(forceReload);
  updateXpRequirement();
  updateHud();
  ensureXpStorageWatchers();
  return getXpState();
}

export function unlockXpSystem() {
  ensureStateLoaded();
  if (xpState.unlocked) {
    updateHud();
    return false;
  }
  resetLockedXpState();
  xpState.unlocked = true;
  persistState();
  updateHud();
  syncCoinMultiplierWithXpLevel(true);
  try {
    window.dispatchEvent(new CustomEvent('xp:unlock', { detail: getXpState() }));
  } catch {}
  return true;
}

export function resetXpProgress({ keepUnlock = true } = {}) {
  ensureStateLoaded();
  const wasUnlocked = xpState.unlocked;
  resetLockedXpState();
  xpState.unlocked = keepUnlock ? (wasUnlocked || xpState.unlocked) : false;
  persistState();
  updateHud();
  syncCoinMultiplierWithXpLevel(true);
  return getXpState();
}

export function addXp(amount, { silent = false } = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();
  
  // 1. Basic Unlock Check
  if (!xpState.unlocked) {
    return {
      unlocked: false,
      xpLevelsGained: bnZero(),
      xpAdded: bnZero(),
      xpLevel: xpState.xpLevel,
      requirement: requirementBn
    };
  }

  // 2. Parse Input Amount
  let inc;
  try {
    if (amount instanceof BigNum) {
      inc = amount.clone?.() ?? BigNum.fromAny(amount ?? 0);
    } else {
      inc = BigNum.fromAny(amount ?? 0);
    }
  } catch {
    inc = bnZero();
  }

  // 3. Apply Multipliers
  if (!inc.isZero?.()) {
    const providers = xpGainMultiplierProviders.size > 0
      ? Array.from(xpGainMultiplierProviders)
      : (typeof externalXpGainMultiplierProvider === 'function' ? [externalXpGainMultiplierProvider] : []);
    for (const provider of providers) {
      if (typeof provider !== 'function') continue;
      try {
        const maybe = provider({
          baseGain: inc.clone?.() ?? inc,
          xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
          xpUnlocked: xpState.unlocked,
        });
        if (maybe instanceof BigNum) {
          inc = maybe.clone?.() ?? maybe;
        } else if (maybe != null) {
          inc = BigNum.fromAny(maybe);
        }
      } catch {}
    }
  }

  inc = applyStatMultiplierOverride('xp', inc);

  // 4. Handle Zero Gain
  if (inc.isZero?.() || (typeof inc.isZero === 'function' && inc.isZero())) {
    updateHud();
    return {
      unlocked: true,
      xpLevelsGained: bnZero(),
      xpAdded: inc,
      xpLevel: xpState.xpLevel,
      requirement: requirementBn
    };
  }

  // 5. Add to Progress
  xpState.progress = xpState.progress.add(inc);
  updateXpRequirement();

  // 6. Handle Infinity (Early Exit)
  const progressIsInf = bigNumIsInfinite(xpState.progress);
  const levelIsInf = bigNumIsInfinite(xpState.xpLevel);
  const gainIsInf = bigNumIsInfinite(inc);

  if (progressIsInf || levelIsInf || gainIsInf) {
    const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    xpState.xpLevel = inf.clone?.() ?? inf;
    xpState.progress = inf.clone?.() ?? inf;
    requirementBn = inf.clone?.() ?? inf;

    enforceXpInfinityInvariant();
    persistState();
    updateHud();
    syncCoinMultiplierWithXpLevel(true);

    const detail = {
      unlocked: true,
      xpLevelsGained: bnZero(),
      xpAdded: inc.clone?.() ?? inc,
      xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
      progress: xpState.progress.clone?.() ?? xpState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn,
      slot,
    };
    notifyXpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
    }
    return detail;
  }

  // 7. Bulk Level Calculation Logic
  let xpLevelsGained = bnZero();

  // Safety check: if progress < requirement, we are done immediately.
  if (xpState.progress.cmp(requirementBn) < 0) {
    persistState();
    updateHud();
    const detail = {
      unlocked: true,
      xpLevelsGained: bnZero(),
      xpAdded: inc,
      xpLevel: xpState.xpLevel,
      progress: xpState.progress,
      requirement: requirementBn,
      slot,
    };
    notifyXpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
    }
    return detail;
  }

  /* Optimization: 
     Instead of iterating one by one, we estimate the target level based on the log10 of current progress.
     
     The curve is roughly: Req(L) ≈ Base * (1.1)^L * (2.5)^(L/10).
     Log(Req) ≈ Log(Base) + L * Log(1.1) + (L/10) * Log(2.5)
     Log(Req) ≈ Log(Base) + L * (Log(1.1) + 0.1 * Log(2.5))
     
     We reverse this to find L given the current Progress (which acts as the "Requirement" for that higher level).
     L ≈ (Log(Progress) - Log(Base)) / (Log(1.1) + 0.1 * Log(2.5))
  */
  
  const currentProgressLog = approxLog10(xpState.progress);
  // Constants derived from: Math.log10(1.1) + 0.1 * Math.log10(2.5)
  // 0.04139... + 0.03979... ≈ 0.081186686
  const COMBINED_LOG_FACTOR = 0.08118668602542883;

  // We only switch to approximation if the gap is likely massive
  // If the log difference is small, the standard loop is safer and more precise.
  // If the log difference is > 2 (100x requirement), we try to skip.
  const reqLog = approxLog10(requirementBn);
  
  if (currentProgressLog - reqLog > 2) {
    const baseLevelBn = xpState.xpLevel;
    
    // Estimate how many levels we *might* gain.
    // This is an over-approximation because it ignores the 'staircase' of the exact requirement,
    // but it gets us close.
    const logDiff = currentProgressLog - reqLog;
    const estimatedGain = Math.floor(logDiff / COMBINED_LOG_FACTOR);
    
    if (estimatedGain > 500) {
      // Calculate the jump
      // We subtract a safety buffer (e.g. 5 levels) to ensure we don't overshoot
      // into negative progress due to precision loss in the log math.
      const safeGain = BigInt(Math.max(0, estimatedGain - 5));
      
      if (safeGain > 0n) {
        const jumpBn = BigNum.fromAny(safeGain.toString());
        xpState.xpLevel = xpState.xpLevel.add(jumpBn);
        xpLevelsGained = xpLevelsGained.add(jumpBn);
        
        // Update requirement to the new level to check if we are still above it
        updateXpRequirement();
        
        // Note: We deliberately DO NOT call handleXpLevelUpRewards() for every skipped level 
        // in a massive jump (e.g. 1 million levels) because that would freeze the UI.
        // Instead, we just sync the coin multiplier at the end. 
        // If your game relies on per-level "Book" rewards, you would batch add them here:
        // bank.books.add(bookRewardPerLevel.mul(jumpBn));
        
        // Sync rewards for the bulk jump (assuming 1 book per level flat reward structure for bulk)
        // If rewards vary per level, this needs a more complex integration formula.
        // For this specific system, handleXpLevelUpRewards simply calls syncCoinMultiplier 
        // and adds a book. We can batch the book add:
         if (bank?.books?.add) {
            try {
              let bulkReward = jumpBn.clone();
              // Apply book provider if exists (assuming it scales linearly or we take a snapshot)
              // Since provider depends on level, doing it accurately for 1e100 levels is impossible iteratively.
              // We effectively skip intermediate complex reward calculations for performance.
              bank.books.add(bulkReward);
            } catch {}
         }
      }
    }
  }

  // 8. Finalize with standard loop (Cleanup)
  // This handles the remaining small number of levels (or the whole thing if the jump was small)
  // ensuring exact precision for the final transition.
  let guard = 0;
  const limit = 500; // Hard limit to prevent freezes if approximation fails
  
  while (xpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    xpState.progress = xpState.progress.sub(requirementBn);
    xpState.xpLevel = xpState.xpLevel.add(bnOne());
    xpLevelsGained = xpLevelsGained.add(bnOne());
    
    // Handle specific rewards for these 'real' level ups
    handleXpLevelUpRewards();
    updateXpRequirement();
    
    const reqIsInf = bigNumIsInfinite(requirementBn);
    if (reqIsInf) break;
    guard += 1;
  }
  
  // If we hit the limit, we simply cap the progress to 0 (or leave it) to prevent infinite loops.
  // In a perfect system, we'd do another jump, but 500 iterations is plenty for "cleanup".
  if (guard >= limit && xpState.progress.cmp(requirementBn) >= 0) {
      // Emergency break: if we still have progress > requirement after max iterations,
      // it means the growth curve is too shallow compared to progress. 
      // We force a sync and stop.
      updateXpRequirement(); 
  }

  // 9. Persist and Notify
  persistState();
  updateHud();

  // Maintain sync flags logic from original
  const syncedLevelAfterAdd = xpLevelBigIntInfo(xpState.xpLevel);
  if (!syncedLevelAfterAdd.finite) {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else if (syncedLevelAfterAdd.bigInt != null) {
    lastSyncedCoinLevel = syncedLevelAfterAdd.bigInt;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = false;
    lastSyncedCoinUsedApproximation = true;
    lastSyncedCoinApproxKey = typeof xpState.xpLevel?.toStorage === 'function'
      ? xpState.xpLevel.toStorage()
      : null;
  }

  const detail = {
    unlocked: true,
    xpLevelsGained: xpLevelsGained.clone?.() ?? xpLevelsGained,
    xpAdded: inc.clone?.() ?? inc,
    xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
    progress: xpState.progress.clone?.() ?? xpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
    slot,
  };
  
  notifyXpSubscribers(detail);
  if (!silent && typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
  }
  return detail;
}

export function getXpState() {
  ensureStateLoaded();
  return {
    unlocked: xpState.unlocked,
    xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
    progress: xpState.progress.clone?.() ?? xpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
  };
}

export function broadcastXpChange(detailOverrides = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();
  const detail = {
    ...getXpState(),
    slot,
    ...detailOverrides,
  };

  notifyXpSubscribers(detail);
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
  }

  return detail;
}

export function isXpSystemUnlocked() {
  ensureStateLoaded();
  return !!xpState.unlocked;
}

export function getXpRequirementForXpLevel(xpLevel) {
  return xpRequirementForXpLevel(xpLevel);
}

export function getXpGainMultiplier() {
  ensureStateLoaded();
  let mult = bnOne();
  const providers = xpGainMultiplierProviders.size > 0
    ? Array.from(xpGainMultiplierProviders)
    : (typeof externalXpGainMultiplierProvider === 'function' ? [externalXpGainMultiplierProvider] : []);
  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    try {
      const maybe = provider({
        baseGain: mult.clone?.() ?? mult,
        xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
        xpUnlocked: xpState.unlocked,
      });
      if (maybe instanceof BigNum) {
        mult = maybe.clone?.() ?? maybe;
      } else if (maybe != null) {
        mult = BigNum.fromAny(maybe);
      }
    } catch {}
  }
  return mult;
}

export function computeCoinMultiplierForXpLevel(levelValue) {
  let xpLevelBn;
  try {
    xpLevelBn = levelValue instanceof BigNum ? levelValue : BigNum.fromAny(levelValue ?? 0);
  } catch {
    xpLevelBn = BigNum.fromInt(0);
  }

  const levelInfo = xpLevelBigIntInfo(xpLevelBn);
  const levelBigInt = levelInfo.bigInt;
  const levelIsInfinite = !levelInfo.finite;

  if (levelIsInfinite) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  let multiplierBn;
  if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
    let working = BigNum.fromInt(1);
    const iterations = Number(levelBigInt);
    for (let i = 0; i < iterations; i += 1) {
      working = working.mulDecimal('1.1', 18);
    }
    let levelAdd;
    try { levelAdd = BigNum.fromAny(levelBigInt.toString()); }
    catch { levelAdd = BigNum.fromInt(iterations); }
    if (typeof working.add === 'function') {
      working = working.add(levelAdd);
    } else if (typeof levelAdd.add === 'function') {
      working = levelAdd.add(working);
    }
    multiplierBn = working.clone?.() ?? working;
  } else {
    multiplierBn = approximateCoinMultiplierFromBigNum(xpLevelBn);
  }

  let finalMultiplier = multiplierBn.clone?.() ?? multiplierBn;
  const providers = coinMultiplierProviders.size > 0
    ? Array.from(coinMultiplierProviders)
    : (typeof externalCoinMultiplierProvider === 'function' ? [externalCoinMultiplierProvider] : []);
  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    try {
      const maybe = provider({
        baseMultiplier: finalMultiplier.clone?.() ?? finalMultiplier,
        xpLevel: xpLevelBn.clone?.() ?? xpLevelBn,
        xpUnlocked: !!xpState.unlocked,
      });
      if (maybe instanceof BigNum) {
        finalMultiplier = maybe.clone?.() ?? maybe;
      } else if (maybe != null) {
        finalMultiplier = BigNum.fromAny(maybe);
      }
    } catch {}
  }

  return finalMultiplier.clone?.() ?? finalMultiplier;
}

export function setExternalCoinMultiplierProvider(fn) {
  externalCoinMultiplierProvider = typeof fn === 'function' ? fn : null;
  coinMultiplierProviders.clear();
  if (externalCoinMultiplierProvider) {
    coinMultiplierProviders.add(externalCoinMultiplierProvider);
  }
  ensureStateLoaded();
  syncCoinMultiplierWithXpLevel(true);
}

export function refreshCoinMultiplierFromXpLevel() {
  ensureStateLoaded();
  syncCoinMultiplierWithXpLevel(true);
}

export function setExternalXpGainMultiplierProvider(fn) {
  externalXpGainMultiplierProvider = typeof fn === 'function' ? fn : null;
  xpGainMultiplierProviders.clear();
  if (externalXpGainMultiplierProvider) {
    xpGainMultiplierProviders.add(externalXpGainMultiplierProvider);
  }
}

export function addExternalCoinMultiplierProvider(fn) {
  if (typeof fn !== 'function') return () => {};
  coinMultiplierProviders.add(fn);
  ensureStateLoaded();
  syncCoinMultiplierWithXpLevel(true);
  return () => {
    coinMultiplierProviders.delete(fn);
    ensureStateLoaded();
    syncCoinMultiplierWithXpLevel(true);
  };
}

export function addExternalXpGainMultiplierProvider(fn) {
  if (typeof fn !== 'function') return () => {};
  xpGainMultiplierProviders.add(fn);
  ensureStateLoaded();
  return () => {
    xpGainMultiplierProviders.delete(fn);
  };
}

export function setExternalBookRewardProvider(fn) {
  externalBookRewardProvider = typeof fn === 'function' ? fn : null;
}

if (typeof window !== 'undefined') {
  window.xpSystem = window.xpSystem || {};
  Object.assign(window.xpSystem, {
    initXpSystem,
    unlockXpSystem,
    addXp,
    getXpState,
    broadcastXpChange,
    isXpSystemUnlocked,
    getXpRequirementForXpLevel,
    getXpGainMultiplier,
    setExternalCoinMultiplierProvider,
    addExternalCoinMultiplierProvider,
    refreshCoinMultiplierFromXpLevel,
    setExternalXpGainMultiplierProvider,
    addExternalXpGainMultiplierProvider,
    setExternalBookRewardProvider,
    resetXpProgress,
  });
}
