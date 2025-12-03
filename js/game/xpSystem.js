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

const LOG_MAX = Math.log10(1e311);

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

function to_log(x) {
  if (x == null) return Number.NEGATIVE_INFINITY;
  if (typeof x === 'number') {
    if (!(x > 0)) return Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY;
    return Math.log10(x);
  }
  return approxLog10(x);
}

function clampLogValue(logValue) {
  if (logValue === Number.NEGATIVE_INFINITY) return logValue;
  if (!Number.isFinite(logValue)) return LOG_MAX;
  return Math.min(logValue, LOG_MAX);
}

function from_log(logx) {
  if (!Number.isFinite(logx)) {
    if (logx === Number.POSITIVE_INFINITY) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    return BigNum.fromInt(0);
  }
  return bigNumFromLog10(logx);
}

function normalizeLogMultiplier(logValue) {
  if (logValue === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (logValue === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(logValue)) return Number.POSITIVE_INFINITY;
  return logValue;
}

function to_log_multiplier(value) {
  if (value && typeof value.log_mult === 'number') {
    return normalizeLogMultiplier(value.log_mult);
  }
  const rawLog = to_log(value);
  if (rawLog === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(rawLog)) return rawLog;
  return rawLog;
}

function accumulateMultiplierLog(baseLog, deltaLog) {
  if (baseLog === Number.POSITIVE_INFINITY || deltaLog === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  if (deltaLog === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
  if (baseLog === Number.NEGATIVE_INFINITY) return deltaLog;
  if (!Number.isFinite(baseLog) || !Number.isFinite(deltaLog)) return Number.POSITIVE_INFINITY;
  return baseLog + deltaLog;
}

function applyMultiplierToValueLog(valueLog, multiplierLog) {
  if (valueLog === Number.NEGATIVE_INFINITY || multiplierLog === Number.NEGATIVE_INFINITY) {
    return Number.NEGATIVE_INFINITY;
  }
  if (valueLog === Number.POSITIVE_INFINITY || multiplierLog === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Number.isFinite(valueLog) || !Number.isFinite(multiplierLog)) {
    return Number.POSITIVE_INFINITY;
  }
  return valueLog + multiplierLog;
}

function extractMultiplierDeltaLog(result, currentTotalLog) {
  if (result && typeof result.log_mult === 'number') {
    return normalizeLogMultiplier(result.log_mult);
  }
  const candidateLog = to_log_multiplier(result);
  if (candidateLog === Number.NEGATIVE_INFINITY || candidateLog === Number.POSITIVE_INFINITY) {
    return candidateLog;
  }
  if (!Number.isFinite(candidateLog) || !Number.isFinite(currentTotalLog)) {
    return candidateLog;
  }
  return candidateLog - currentTotalLog;
}

function log_sum_exp(loga, logb) {
  if (loga === Number.POSITIVE_INFINITY || logb === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  if (loga === Number.NEGATIVE_INFINITY) return logb;
  if (logb === Number.NEGATIVE_INFINITY) return loga;
  const maxLog = Math.max(loga, logb);
  const minLog = Math.min(loga, logb);
  const delta = minLog - maxLog;
  return maxLog + Math.log10(1 + Math.pow(10, delta));
}

function log_sum_list(values) {
  if (!values || values.length === 0) return Number.NEGATIVE_INFINITY;
  let total = Number.NEGATIVE_INFINITY;
  for (const entry of values) {
    total = log_sum_exp(total, entry);
  }
  return total;
}

function log_mul(loga, logb) {
  if (loga === Number.NEGATIVE_INFINITY || logb === Number.NEGATIVE_INFINITY) {
    return Number.NEGATIVE_INFINITY;
  }
  if (loga === Number.POSITIVE_INFINITY || logb === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  return loga + logb;
}

function normalizeLevelToBigInt(levelInput) {
  if (typeof levelInput === 'bigint') {
    return levelInput < 0n ? 0n : levelInput;
  }
  if (levelInput instanceof BigNum) {
    const info = xpLevelBigIntInfo(levelInput);
    if (info.bigInt != null) {
      return info.bigInt < 0n ? 0n : info.bigInt;
    }
    return 0n;
  }
  if (typeof levelInput === 'number') {
    if (!Number.isFinite(levelInput) || levelInput <= 0) return 0n;
    try { return BigInt(Math.floor(levelInput)); }
    catch { return 0n; }
  }
  try {
    return BigInt(levelInput);
  } catch {
    return 0n;
  }
}

function logScaleBigIntToScientific(scaledLog) {
  if (scaledLog <= 0n) return '0e0';
  const digits = scaledLog.toString();
  const precision = Math.min(digits.length, 18);
  const head = digits.slice(0, precision);
  const mantissa = head.length > 1 ? `${head[0]}.${head.slice(1)}` : head;
  const exponent = (digits.length - 1) - 18;
  return `${mantissa}e${exponent}`;
}

function logRequirementScaledFromInput(logInput) {
  if (logInput && typeof logInput._scaledLog === 'bigint') {
    return logInput._scaledLog;
  }

  let sci;
  if (logInput instanceof BigNum) {
    sci = logInput.toScientific(18);
  } else if (typeof logInput === 'number') {
    if (!Number.isFinite(logInput)) return null;
    sci = logInput.toExponential(18);
  } else if (typeof logInput === 'string') {
    sci = logInput.trim();
  }

  if (!sci) return null;

  const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
  if (!match) return null;

  const [, mantissaStr, expStr] = match;
  const digits = mantissaStr.replace('.', '');
  const fracDigits = (mantissaStr.split('.')[1] ?? '').length;
  let scaledExp;
  try {
    scaledExp = BigInt(parseInt(expStr, 10) - fracDigits + 18);
  } catch {
    return null;
  }

  let scaledMantissa;
  try { scaledMantissa = BigInt(digits); }
  catch { return null; }

  if (scaledExp >= 0) {
    return scaledMantissa * (10n ** scaledExp);
  }

  const divisor = 10n ** (-scaledExp);
  if (divisor === 0n) return null;
  return scaledMantissa / divisor;
}

export function log_requirement(levelInput) {
  const levelBigInt = normalizeLevelToBigInt(levelInput);
  const scaled = LOG_REQUIREMENT_BASE_SCALED + (levelBigInt * LOG_REQUIREMENT_STEP_SCALED);
  const logBn = BigNum.fromScientific(logScaleBigIntToScientific(scaled));
  logBn._scaledLog = scaled;
  return logBn;
}

export function level_from_log_xp(log_xp) {
  const scaledLog = logRequirementScaledFromInput(log_xp);
  if (scaledLog == null) {
    const isInfiniteInput = log_xp === Number.POSITIVE_INFINITY
      || (log_xp instanceof BigNum
        && (log_xp.isInfinite?.() || (typeof log_xp.isInfinite === 'function' && log_xp.isInfinite())));
    if (isInfiniteInput && MAX_MEANINGFUL_XP_LEVEL > 0n) {
      return BigNum.fromAny(MAX_MEANINGFUL_XP_LEVEL.toString());
    }
    return BigNum.fromInt(0);
  }

  if (LOG_MAX_SCALED != null && scaledLog > LOG_MAX_SCALED) {
    return BigNum.fromAny(clampLevelBigInt(MAX_LEVEL_CAP_BIGINT).toString());
  }

  const adjusted = scaledLog - LOG_REQUIREMENT_BASE_SCALED;
  if (adjusted <= 0) return BigNum.fromInt(0);

  let levelBigInt = adjusted / LOG_REQUIREMENT_STEP_SCALED;
  if (MAX_MEANINGFUL_XP_LEVEL > 0n && levelBigInt > MAX_MEANINGFUL_XP_LEVEL) {
    levelBigInt = MAX_MEANINGFUL_XP_LEVEL;
  }

  return BigNum.fromAny(levelBigInt);
}

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
const LOG_REQUIREMENT_SCALE = 1_000_000_000_000_000_000n; // 1e18 fixed-point scale for log values
const LOG_REQUIREMENT_BASE_SCALED = LOG_REQUIREMENT_SCALE; // log10(10) == 1
const LOG_REQUIREMENT_STEP_SCALED = BigInt('41392685158225070'); // log10(1.1) * 1e18
const maxLog10Bn = BigNum.fromScientific(String(BigNum.MAX_E));
const LOG_MAX_SCALED = logRequirementScaledFromInput(LOG_MAX);
const MAX_REQUIREMENT_BN = from_log(LOG_MAX);
const LOG_MAX_LEVEL_CAP = (() => {
  if (LOG_MAX_SCALED == null) return 0n;
  const adjusted = LOG_MAX_SCALED - LOG_REQUIREMENT_BASE_SCALED;
  if (adjusted <= 0) return 0n;
  const level = adjusted / LOG_REQUIREMENT_STEP_SCALED;
  if (MAX_MEANINGFUL_XP_LEVEL > 0n && level > MAX_MEANINGFUL_XP_LEVEL) {
    return MAX_MEANINGFUL_XP_LEVEL;
  }
  return level;
})();
const MAX_LEVEL_CAP_BIGINT = LOG_MAX_LEVEL_CAP > 0n ? LOG_MAX_LEVEL_CAP
  : (MAX_MEANINGFUL_XP_LEVEL > 0n ? MAX_MEANINGFUL_XP_LEVEL : 0n);
const AVERAGE_LOG_LEVEL_STEP = LOG_STEP + (LOG_DECADE_BONUS / 10);
const AVERAGE_LEVEL_RATIO = Math.pow(10, AVERAGE_LOG_LEVEL_STEP);
const AVERAGE_RATIO_MINUS_ONE_LOG10 = Math.log10(Math.max(AVERAGE_LEVEL_RATIO - 1, Number.MIN_VALUE));

function computeMaxMeaningfulLevel() {
  const maxScaledLog = logRequirementScaledFromInput(BigNum.MAX_E);
  if (maxScaledLog == null) return 0n;
  const adjusted = maxScaledLog - LOG_REQUIREMENT_BASE_SCALED;
  if (adjusted <= 0) return 0n;
  return adjusted / LOG_REQUIREMENT_STEP_SCALED;
}

const MAX_MEANINGFUL_XP_LEVEL = computeMaxMeaningfulLevel();

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

function coinMultiplierLogForExactLevel(levelBigInt) {
  if (levelBigInt == null || levelBigInt < 0n) return Number.NEGATIVE_INFINITY;
  const iterations = Number(levelBigInt);
  if (!Number.isFinite(iterations) || iterations < 0) return Number.NEGATIVE_INFINITY;
  const growthLog = iterations * LOG_STEP;
  const additiveLog = iterations > 0 ? Math.log10(iterations) : Number.NEGATIVE_INFINITY;
  return log_sum_exp(growthLog, additiveLog);
}

function coinMultiplierLogForLevel(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') {
    return Number.POSITIVE_INFINITY;
  }

  const levelInfo = xpLevelBigIntInfo(levelBn);
  const levelBigInt = levelInfo.bigInt;
  const levelIsInfinite = !levelInfo.finite;
  if (levelIsInfinite) {
    return Number.POSITIVE_INFINITY;
  }

  if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
    return coinMultiplierLogForExactLevel(levelBigInt);
  }

  const levelLogBn = computeLevelLogTerm(levelBn);
  let totalLog = logBigNumToNumber(levelLogBn);
  const bonusLog = computeBonusLogTerm(levelBn);
  if (bonusLog) {
    totalLog += logBigNumToNumber(bonusLog);
  }

  if (!Number.isFinite(totalLog)) {
    return Number.POSITIVE_INFINITY;
  }

  const levelAddLog = to_log(levelBn);
  return log_sum_exp(totalLog, levelAddLog);
}

const xpState = {
  unlocked: false,
  xpLevel: BigNum.fromInt(0),
  progress: BigNum.fromInt(0),
};

const xpLogs = {
  progress: Number.NEGATIVE_INFINITY,
  requirement: Math.log10(10),
  coinMultiplier: Number.NEGATIVE_INFINITY,
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

function updateProgressLog() {
  xpLogs.progress = clampLogValue(to_log(xpState.progress));
}

function updateRequirementLog() {
  xpLogs.requirement = clampLogValue(to_log(requirementBn));
}

function updateCoinMultiplierLog(logMultiplier) {
  xpLogs.coinMultiplier = normalizeLogMultiplier(logMultiplier);
}

function meetsRequirementByLog() {
  if (xpLogs.requirement === Number.POSITIVE_INFINITY) return false;
  if (xpLogs.progress === Number.POSITIVE_INFINITY) return true;
  return xpLogs.progress >= xpLogs.requirement;
}

function bnZero() {
  return BigNum.fromInt(0);
}

function bnOne() {
  return BigNum.fromInt(1);
}

function clampLevelBigInt(levelBigInt) {
  if (levelBigInt == null) return 0n;
  return levelBigInt > MAX_LEVEL_CAP_BIGINT ? MAX_LEVEL_CAP_BIGINT : levelBigInt;
}

function clampXpLevel(valueBn) {
  const normalized = normalizeLevelToBigInt(valueBn);
  const capped = clampLevelBigInt(normalized);
  if (normalized !== capped) {
    return { level: BigNum.fromAny(capped.toString()), clamped: true };
  }
  return { level: valueBn instanceof BigNum ? valueBn : BigNum.fromAny(normalized.toString()), clamped: false };
}

function isMaxLevel(valueBn = xpState.xpLevel) {
  if (MAX_LEVEL_CAP_BIGINT <= 0n) return false;
  return normalizeLevelToBigInt(valueBn) >= MAX_LEVEL_CAP_BIGINT;
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
    return MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
  }

  const safeLog = clampLogValue(logNumber);
  return bigNumFromLog10(safeLog);
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
    xpLvlBn = BigNum.fromAny(clampLevelBigInt(MAX_LEVEL_CAP_BIGINT).toString());
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

  let targetLevel = targetLevelInfo.bigInt ?? 0n;
  targetLevel = clampLevelBigInt(targetLevel);

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

  if (targetLevel >= MAX_LEVEL_CAP_BIGINT) {
    return MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
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
  if (isMaxLevel(xpState.xpLevel)) {
    requirementBn = MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
  }
  updateRequirementLog();
}

function resetLockedXpState() {
  xpState.xpLevel = bnZero();
  xpState.progress = bnZero();
  updateXpRequirement();
  updateProgressLog();
  syncCoinMultiplierWithXpLevel(true);
}

function normalizeProgress(applyRewards = false) {
  // If either level or progress is already ∞, enforce the invariant and bail.
  if (enforceXpInfinityInvariant()) {
    return;
  }

  updateXpRequirement();
  updateProgressLog();

  // If the requirement is infinite, there is nothing meaningful to normalize.
  if (bigNumIsInfinite(requirementBn)) {
    return;
  }

  let guard = 0;
  const limit = 10000;
  while (meetsRequirementByLog() && guard < limit) {
    try { xpState.progress = xpState.progress.sub(requirementBn); }
    catch { xpState.progress = bnZero(); }
    updateProgressLog();

    try { xpState.xpLevel = xpState.xpLevel.add(bnOne()); }
    catch { xpState.xpLevel = bnZero(); }

    if (applyRewards) handleXpLevelUpRewards();
    updateXpRequirement();
    updateProgressLog();

    if (bigNumIsInfinite(requirementBn)) {
      break;
    }
    guard += 1;
  }

  if (guard >= limit) {
    xpState.progress = bnZero();
    updateProgressLog();
  }
}

function xpLevelBigIntInfo(xpLevelValue) {
  if (!xpLevelValue || typeof xpLevelValue !== 'object') {
    return { bigInt: 0n, finite: false };
  }

  const levelIsInfinite =
    (typeof xpLevelValue.isInfinite === 'function' && xpLevelValue.isInfinite()) ||
    xpLevelValue.isInfinite?.() === true;

  if (levelIsInfinite) {
    try { multApi.set(infinityRequirementBn); } catch {}
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
    updateCoinMultiplierLog(Number.POSITIVE_INFINITY);

    const capped = clampLevelBigInt(MAX_LEVEL_CAP_BIGINT);
    return { bigInt: capped, finite: false };
  }

  const levelBigInt = normalizeLevelToBigInt(xpLevelValue);
  
  let multiplierLog = coinMultiplierLogForLevel(xpState.xpLevel);
  let logSpaceMultiplier = from_log(multiplierLog);

  const providersLog = coinMultiplierProviders.size > 0
    ? Array.from(coinMultiplierProviders)
    : (typeof externalCoinMultiplierProvider === 'function'
        ? [externalCoinMultiplierProvider]
        : []);

  for (const provider of providersLog) {
    if (typeof provider !== 'function') continue;
    try {
      const baseMultiplier = logSpaceMultiplier.clone?.() ?? logSpaceMultiplier;
      const maybe = provider({
        baseMultiplier,
        xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
        xpUnlocked: xpState.unlocked,
        logMultiplier: multiplierLog,
      });

      const deltaLog = extractMultiplierDeltaLog(maybe, multiplierLog);
      if (deltaLog != null) {
        multiplierLog = accumulateMultiplierLog(multiplierLog, deltaLog);
        logSpaceMultiplier = from_log(multiplierLog);
      }
    } catch {
    }
  }

  const multLogIsInf =
    multiplierLog === Number.POSITIVE_INFINITY ||
    (typeof logSpaceMultiplier?.isInfinite === 'function' && logSpaceMultiplier.isInfinite()) ||
    logSpaceMultiplier?.isInfinite?.() === true;

  updateCoinMultiplierLog(multiplierLog);
  try { multApi.set(logSpaceMultiplier.clone?.() ?? logSpaceMultiplier); } catch {}

  if (multLogIsInf) {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
    return { bigInt: levelBigInt ?? null, finite: false };
  }

  let multiplierBn;

  if (typeof levelBigInt === 'bigint' && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
    let working = BigNum.fromInt(1);
    const iterations = Number(levelBigInt);

    for (let i = 0; i < iterations; i += 1) {
      working = working.mulDecimal('1.1', 18);
    }

    let levelAdd;
    try {
      levelAdd = BigNum.fromAny(levelBigInt.toString());
    } catch {
      levelAdd = BigNum.fromInt(iterations);
    }

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

  const providersBn = coinMultiplierProviders.size > 0
    ? Array.from(coinMultiplierProviders)
    : (typeof externalCoinMultiplierProvider === 'function'
        ? [externalCoinMultiplierProvider]
        : []);

  for (const provider of providersBn) {
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
    } catch {
    }
  }

  const multBnIsInf =
    (typeof finalMultiplier?.isInfinite === 'function' && finalMultiplier.isInfinite()) ||
    finalMultiplier?.isInfinite?.() === true;
	
  updateCoinMultiplierLog(finalMultiplier);
  try { multApi.set(finalMultiplier.clone?.() ?? finalMultiplier); } catch {}

  if (multBnIsInf) {
    lastSyncedCoinLevel = null;
    lastSyncedCoinLevelWasInfinite = true;
    lastSyncedCoinUsedApproximation = false;
    lastSyncedCoinApproxKey = null;
  } else if (typeof levelBigInt === 'bigint' && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
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

  return { bigInt: levelBigInt, finite: true };
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
  if (!xpState.unlocked) {
    resetLockedXpState();
    return xpState;
  }

  enforceXpInfinityInvariant();
  const { level: cappedLevel, clamped } = clampXpLevel(xpState.xpLevel);
  if (clamped) {
    xpState.xpLevel = cappedLevel;
  }

  updateXpRequirement();
  updateProgressLog();
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
  updateSyncedCoinLevelCache();
}

function updateSyncedCoinLevelCache() {
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

function handleBulkLevelUpRewards(levelsBigInt) {
  if (levelsBigInt == null || typeof levelsBigInt !== 'bigint' || levelsBigInt <= 0n) return;

  const levelsBn = BigNum.fromAny(levelsBigInt.toString());
  syncCoinMultiplierWithXpLevel(true);

  let reward = bnOne();
  let rewardLog = to_log(reward);
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
      rewardLog = to_log(reward);
    } catch {}
  }

  const totalRewardLog = log_mul(rewardLog, to_log(levelsBn));
  let totalReward = from_log(totalRewardLog);

  try {
    if (bank?.books?.addWithMultiplier) {
      bank.books.add(totalReward);
    }
  } catch {}
  updateSyncedCoinLevelCache();
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
    xpLevelValue.innerHTML = isMaxLevel() ? 'Max Level' : formatNumber(xpState.xpLevel);
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

function approximateLevelCostLog(levelsBigInt, requirementLog10) {
  if (levelsBigInt == null || levelsBigInt <= 0n) return Number.POSITIVE_INFINITY;

  const levelCount = Number(levelsBigInt);
  if (!Number.isFinite(levelCount) || levelCount <= 0) return Number.POSITIVE_INFINITY;

  const baseLog = Number.isFinite(requirementLog10) ? requirementLog10 : approxLog10(requirementBn);
  if (!Number.isFinite(baseLog)) return Number.POSITIVE_INFINITY;

  if (levelCount <= 32) {
    let currentRequirementLog = baseLog;
    const requirementLogs = [];
    for (let i = 0; i < levelCount; i += 1) {
      requirementLogs.push(currentRequirementLog);
      currentRequirementLog += LOG_STEP;
      const nextLevelIndex = i + 1;
      if (nextLevelIndex % 10 === 0) {
        currentRequirementLog += LOG_DECADE_BONUS;
      }
    }
    return log_sum_list(requirementLogs);
  }

  return baseLog + (levelCount * AVERAGE_LOG_LEVEL_STEP) - AVERAGE_RATIO_MINUS_ONE_LOG10;
}

function fastLevelGainFromProgress() {
  const levelInfo = xpLevelBigIntInfo(xpState.xpLevel);
  if (!levelInfo.finite) return 0n;

  updateProgressLog();
  const logProgress = xpLogs.progress;
  const logRequirement = xpLogs.requirement;
  if (!Number.isFinite(logProgress) || !Number.isFinite(logRequirement)) return 0n;

  const diff = logProgress - logRequirement;
  if (diff < 6) return 0n;

  const estimate = Math.floor(diff / AVERAGE_LOG_LEVEL_STEP);
  if (!Number.isFinite(estimate) || estimate <= 0) return 0n;

  let lo = 1n;
  let hi = BigInt(Math.min(estimate, 1_000_000_000));
  let best = 0n;
  let safety = 0;
  while (lo <= hi && safety < 80) {
    const mid = (lo + hi) >> 1n;
    const costLog = approximateLevelCostLog(mid, logRequirement);
    if (!Number.isFinite(costLog)) {
      hi = mid - 1n;
      safety += 1;
      continue;
    }
    const cost = bigNumFromLog10(costLog);
    const cmp = xpState.progress.cmp?.(cost) ?? -1;
    if (cmp >= 0) {
      best = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
    safety += 1;
  }

  if (best <= 0n) return 0n;

  const finalCost = bigNumFromLog10(approximateLevelCostLog(best, logRequirement));
  if (!finalCost || typeof finalCost.cmp !== 'function') return 0n;
  if (xpState.progress.cmp(finalCost) < 0) return 0n;

  xpState.progress = xpState.progress.sub(finalCost);
  updateProgressLog();
  try {
    xpState.xpLevel = xpState.xpLevel.add(BigNum.fromAny(best.toString()));
  } catch {
    xpState.xpLevel = BigNum.fromAny(best.toString());
  }
  handleBulkLevelUpRewards(best);
  updateXpRequirement();
  return best;
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
  if (!xpState.unlocked) {
    return {
      unlocked: false,
      xpLevelsGained: bnZero(),
      xpAdded: bnZero(),
      xpLevel: xpState.xpLevel,
      requirement: requirementBn
    };
  }

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

  const baseGainLog = to_log(inc);
  let gainMultiplierLog = 0;

  // External XP gain multipliers
  if (!inc.isZero?.()) {
    const providers = xpGainMultiplierProviders.size > 0
      ? Array.from(xpGainMultiplierProviders)
      : (typeof externalXpGainMultiplierProvider === 'function' ? [externalXpGainMultiplierProvider] : []);
    for (const provider of providers) {
      if (typeof provider !== 'function') continue;
      try {
        const currentGainLog = applyMultiplierToValueLog(baseGainLog, gainMultiplierLog);
        const currentGain = from_log(currentGainLog);
        const maybe = provider({
          baseGain: inc.clone?.() ?? inc,
          currentGain,
          xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
          xpUnlocked: xpState.unlocked,
          logMultiplier: gainMultiplierLog,
          logGain: baseGainLog,
        });
        const deltaLog = extractMultiplierDeltaLog(maybe, currentGainLog);
        if (deltaLog != null) {
          gainMultiplierLog = accumulateMultiplierLog(gainMultiplierLog, deltaLog);
        }
      } catch {}
    }
  }

  const finalGainLog = applyMultiplierToValueLog(baseGainLog, gainMultiplierLog);
  inc = from_log(finalGainLog);
  inc = applyStatMultiplierOverride('xp', inc);

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

  // Apply gain
  xpState.progress = xpState.progress.add(inc);
  updateXpRequirement();
  updateProgressLog();

  // If the gain, the current progress, or the current level is infinite,
  // snap the entire XP system (level, progress, requirement, and coin multiplier) to ∞.
  const progressIsInf = xpState.progress?.isInfinite?.()
    || (typeof xpState.progress?.isInfinite === 'function' && xpState.progress.isInfinite());
  const levelIsInf = xpState.xpLevel?.isInfinite?.()
    || (typeof xpState.xpLevel?.isInfinite === 'function' && xpState.xpLevel.isInfinite());
  const gainIsInf = inc?.isInfinite?.()
    || (typeof inc?.isInfinite === 'function' && inc.isInfinite());

  if (progressIsInf || levelIsInf || gainIsInf) {
    const { level: cappedLevel } = clampXpLevel(xpState.xpLevel);
    xpState.xpLevel = cappedLevel;
    xpState.progress = MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
    requirementBn = MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
    updateProgressLog();
    updateRequirementLog();
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
    persistState();
    updateHud();
    return detail;
  }

  // Normal finite-path level up loop (with bulk fast-forwarding)
  let xpLevelsGained = bnZero();
  let guard = 0;
  const limit = 100000;
  while (meetsRequirementByLog()) {
    const bulkLevels = fastLevelGainFromProgress();
    if (bulkLevels > 0n) {
      xpLevelsGained = xpLevelsGained.add(BigNum.fromAny(bulkLevels.toString()));
      const reqIsInf = requirementBn.isInfinite?.()
        || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite());
      if (reqIsInf) {
        break;
      }
      continue;
    }

    if (guard >= limit) {
      // Only clamp finite progress if we truly hit the guard.
      xpState.progress = bnZero();
      updateProgressLog();
      break;
    }

    xpState.progress = xpState.progress.sub(requirementBn);
    updateProgressLog();
    const { level: clampedLevel, clamped } = clampXpLevel(xpState.xpLevel.add(bnOne()));
    xpState.xpLevel = clampedLevel;
    xpLevelsGained = xpLevelsGained.add(bnOne());
    if (clamped) {
      xpState.progress = MAX_REQUIREMENT_BN.clone?.() ?? MAX_REQUIREMENT_BN;
      updateProgressLog();
      break;
    }
    handleXpLevelUpRewards();
    updateXpRequirement();
    updateProgressLog();
    const reqIsInf = requirementBn.isInfinite?.()
      || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite());
    if (reqIsInf) {
      break;
    }
    guard += 1;
  }

  persistState();
  updateHud();

  updateSyncedCoinLevelCache();

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

export function computeCoinMultiplierForXpLevel(levelValue) {
  let xpLevelBn;
  try {
    xpLevelBn = levelValue instanceof BigNum ? levelValue : BigNum.fromAny(levelValue ?? 0);
  } catch {
    xpLevelBn = BigNum.fromInt(0);
  }

  let multiplierLog = coinMultiplierLogForLevel(xpLevelBn);
  if (multiplierLog === Number.POSITIVE_INFINITY) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  let finalMultiplier = from_log(multiplierLog);
  const providers = coinMultiplierProviders.size > 0
    ? Array.from(coinMultiplierProviders)
    : (typeof externalCoinMultiplierProvider === 'function' ? [externalCoinMultiplierProvider] : []);
  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    try {
      const baseMultiplier = finalMultiplier.clone?.() ?? finalMultiplier;
      const maybe = provider({
        baseMultiplier,
        xpLevel: xpLevelBn.clone?.() ?? xpLevelBn,
        xpUnlocked: !!xpState.unlocked,
        logMultiplier: multiplierLog,
      });
      const deltaLog = extractMultiplierDeltaLog(maybe, multiplierLog);
      if (deltaLog != null) {
        multiplierLog = accumulateMultiplierLog(multiplierLog, deltaLog);
        finalMultiplier = from_log(multiplierLog);
      }
    } catch {}
  }

  const result = finalMultiplier.clone?.() ?? finalMultiplier;
  updateCoinMultiplierLog(multiplierLog);
  return result;
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

function runXpSystemLogSumTests() {
  const results = [];
  const assertNear = (name, actual, expected, tolerance = 1e-9) => {
    const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
    results.push({ name, pass, actual, expected });
  };

  const hugeGapSum = log_sum_exp(Math.log10(1e150), Math.log10(1e200));
  const hugeGapExpected = Math.log10(1e200) + Math.log10(1 + 1e-50);
  assertNear('log_sum_exp handles extremely different magnitudes', hugeGapSum, hugeGapExpected);

  const balancedSum = log_sum_list([Math.log10(1e200), Math.log10(1e200)]);
  const balancedExpected = Math.log10(2) + Math.log10(1e200);
  assertNear('log_sum_list combines equal large values', balancedSum, balancedExpected);

  const listWithNegInf = log_sum_list([Number.NEGATIVE_INFINITY, Math.log10(1e200), Number.NEGATIVE_INFINITY]);
  assertNear('log_sum_list ignores negative infinity entries', listWithNegInf, Math.log10(1e200));

  const combinedLog = log_sum_exp(to_log(BigNum.fromAny('1e200')), to_log(BigNum.fromAny('1e150')));
  const combinedBn = from_log(combinedLog);
  const combinedBnLog = to_log(combinedBn);
  assertNear('from_log preserves log_sum_exp scale for large BigNums', combinedBnLog, combinedLog);

  const smallCostLog = approximateLevelCostLog(2n, Math.log10(1e200));
  const expectedSmallCost = log_sum_list([Math.log10(1e200), Math.log10(1e200) + LOG_STEP]);
  assertNear('approximateLevelCostLog uses log summation for small batches', smallCostLog, expectedSmallCost);

  const stackedMultiplier = accumulateMultiplierLog(Math.log10(1e50), Math.log10(1e100));
  const appliedMultiplierLog = applyMultiplierToValueLog(Math.log10(1e5), stackedMultiplier);
  results.push({
    name: 'stacked multiplier logs avoid overflow when applied to XP',
    pass: Number.isFinite(appliedMultiplierLog) && Math.abs(appliedMultiplierLog - Math.log10(1e155)) < 1e-6,
    actual: appliedMultiplierLog,
    expected: Math.log10(1e155),
  });

  const highLevel = BigNum.fromAny('1e310');
  const logHighLevel = log_requirement(highLevel);
  const logHighScientific = logHighLevel.toScientific(6);
  results.push({
    name: 'log_requirement stays finite at extremely high levels',
    pass: !bigNumIsInfinite(logHighLevel) && logHighScientific !== 'Infinity',
    actual: logHighScientific,
  });

  const recoveredLevel = level_from_log_xp(logHighLevel);
  const recoveredPlain = recoveredLevel.toPlainIntegerString?.() ?? '';
  const targetPlain = highLevel.toPlainIntegerString?.() ?? '';
  results.push({
    name: 'level_from_log_xp correctly inverts geometric growth logs',
    pass: recoveredPlain === targetPlain,
    actual: recoveredPlain,
    expected: targetPlain,
  });

  const largeLogXp = Math.log10(1e250);
  const largeLogScaled = logRequirementScaledFromInput(largeLogXp);
  const expectedLargeLevel = (() => {
    if (largeLogScaled == null) return 0n;
    const adjusted = largeLogScaled - LOG_REQUIREMENT_BASE_SCALED;
    if (adjusted <= 0) return 0n;
    let level = adjusted / LOG_REQUIREMENT_STEP_SCALED;
    if (MAX_MEANINGFUL_XP_LEVEL > 0n && level > MAX_MEANINGFUL_XP_LEVEL) {
      level = MAX_MEANINGFUL_XP_LEVEL;
    }
    return level;
  })();
  const largeLevelInfo = xpLevelBigIntInfo(level_from_log_xp(largeLogXp));
  results.push({
    name: 'level_from_log_xp handles extremely large XP gains',
    pass: largeLevelInfo.bigInt === expectedLargeLevel,
    actual: largeLevelInfo.bigInt?.toString?.(),
    expected: expectedLargeLevel?.toString?.(),
  });

  const cappedLevelInfo = xpLevelBigIntInfo(level_from_log_xp(BigNum.fromAny('1e400')));
  const expectedCap = MAX_MEANINGFUL_XP_LEVEL.toString();
  results.push({
    name: 'level_from_log_xp caps at the maximum meaningful level',
    pass: cappedLevelInfo.bigInt?.toString?.() === expectedCap,
    actual: cappedLevelInfo.bigInt?.toString?.(),
    expected: expectedCap,
  });

  const oversizedLogXp = LOG_MAX + 100;
  const oversizedLevel = level_from_log_xp(oversizedLogXp);
  const oversizedLevelBigInt = normalizeLevelToBigInt(oversizedLevel);
  results.push({
    name: 'level_from_log_xp clamps levels when XP logs exceed LOG_MAX',
    pass: oversizedLevelBigInt === MAX_LEVEL_CAP_BIGINT,
    actual: oversizedLevelBigInt?.toString?.(),
    expected: MAX_LEVEL_CAP_BIGINT.toString(),
  });

  const clampedRequirementLog = clampLogValue(to_log(BigNum.fromAny('1e400')));
  results.push({
    name: 'log tracking clamps requirement logs above LOG_MAX',
    pass: clampedRequirementLog === LOG_MAX,
    actual: clampedRequirementLog,
    expected: LOG_MAX,
  });

  return results;
}

export function runXpSystemUnitTests({ verbose = false } = {}) {
  const results = runXpSystemLogSumTests();
  if (verbose && typeof console !== 'undefined') {
    const failed = results.filter((r) => !r.pass);
    if (failed.length === 0) {
      console.log('[xpSystem] All log-sum tests passed.');
    } else {
      console.warn('[xpSystem] Log-sum tests failed:', failed);
    }
  }
  return results;
}

if (typeof process !== 'undefined' && process?.env?.XP_SYSTEM_RUN_TESTS === '1') {
  runXpSystemUnitTests({ verbose: true });
}

if (typeof window !== 'undefined') {
  window.xpSystem = window.xpSystem || {};
  Object.assign(window.xpSystem, {
    initXpSystem,
    unlockXpSystem,
    addXp,
    getXpState,
    isXpSystemUnlocked,
    getXpRequirementForXpLevel,
    setExternalCoinMultiplierProvider,
    addExternalCoinMultiplierProvider,
    refreshCoinMultiplierFromXpLevel,
    setExternalXpGainMultiplierProvider,
    addExternalXpGainMultiplierProvider,
    setExternalBookRewardProvider,
    log_requirement,
    level_from_log_xp,
    runXpSystemUnitTests,
    resetXpProgress,
  });
}
