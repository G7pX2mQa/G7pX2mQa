// js/game/xpSystem.js

import { BigNum } from '../util/bigNum.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { syncXpMpHudLayout } from '../ui/hudLayout.js';

const KEY_PREFIX = 'ccc:xp';
const KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
const KEY_XP_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
const KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;

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
// === FAST XP BULK CONSUMER (decade-skip with binary search) =================
const RATIO_PER_LEVEL_NUM = 1.1;
const DECADE_BONUS_NUM    = 2.5;
const LOG10_R             = Math.log10(RATIO_PER_LEVEL_NUM);
const LOG10_Q             = Math.log10(Math.pow(RATIO_PER_LEVEL_NUM, 10) * DECADE_BONUS_NUM);

// Parse a BigNum level into a (finite) BigInt if possible
function levelToBigIntSafe(levelBn) {
  let s = '0';
  try { s = levelBn.toPlainIntegerString?.() ?? levelBn.toString?.() ?? '0'; } catch {}
  try { return BigInt(s); } catch { return 0n; }
}

function bnFromBigInt(i) {
  try { return BigNum.fromAny(i.toString()); } catch { return BigNum.fromInt(0); }
}

// Sum requirements for <=10 levels starting at a specific *integer* level.
function sumRequirementsFromLevel(startLevelBigInt, count /* 0..10 */) {
  let sum = bnZero();
  if (count <= 0) return sum;
  for (let k = 0n; k < BigInt(count); k++) {
    const lvl = startLevelBigInt + k;
    const req = xpRequirementForXpLevel(bnFromBigInt(lvl));
    sum = sum.add(req);
  }
  return sum;
}

// Geometric series factor for d whole decades:  S10 * (q^d - 1) / (q - 1)
function decadesFactorBn(d /* Number */) {
  if (!(d > 0)) return bnZero();
  const q = Math.pow(RATIO_PER_LEVEL_NUM, 10) * DECADE_BONUS_NUM;

  // Avoid overflow in Math.pow for huge d
  let log10Factor;
  const A = d * LOG10_Q; // log10(q^d)
  if (A > 12) {
    // For big A, log10((q^d - 1)/(q - 1)) ≈ A - log10(q - 1)
    log10Factor = A - Math.log10(q - 1);
  } else {
    const series = (Math.pow(q, d) - 1) / (q - 1);
    log10Factor = Math.log10(series <= 0 ? 0.0000000001 : series);
  }
  return bigNumFromLog10(log10Factor);
}

// Cost of buying n levels starting at integer level L0, using
//  - partial to finish the current decade (≤10 terms, exact),
//  - whole decades with geometric sum (closed form),
//  - partial remainder in final decade (≤9 terms, exact).
function costForNLevels(L0BigInt, nBigInt /* BigInt */) {
  let spent = bnZero();
  let remaining = nBigInt < 0n ? 0n : nBigInt;
  let L = L0BigInt;

  // 1) finish current decade
  const off = L % 10n;
  const firstChunk = remaining < (10n - off) ? remaining : (10n - off);
  if (firstChunk > 0n) {
    spent = spent.add(sumRequirementsFromLevel(L, Number(firstChunk)));
    L += firstChunk;
    remaining -= firstChunk;
  }
  if (remaining <= 0n) return { spent, endLevelBigInt: L };

  // 2) whole decades
  const dBig = remaining / 10n;
  if (dBig > 0n) {
    const S10 = sumRequirementsFromLevel(L, 10); // exact 10-term sum at this boundary
    // For very large d, clamp the numeric used for factor to keep it finite;
    // the log-space path handles magnitude anyway.
    const dNum = Number(dBig > 9007199254740991n ? 9007199254740991n : dBig);
    const factor = decadesFactorBn(dNum);         // (q^d - 1)/(q - 1) as BN
    spent = spent.add(S10.mul(factor));
    L += dBig * 10n;
    remaining -= dBig * 10n;
  }

  // 3) remainder inside the last decade
  if (remaining > 0n) {
    spent = spent.add(sumRequirementsFromLevel(L, Number(remaining)));
    L += remaining;
    remaining = 0n;
  }

  return { spent, endLevelBigInt: L };
}

function maxAffordableLevels(L0BigInt, progressBn) {
  let lo = 0n, hi = 1n;
  while (true) {
    const { spent } = costForNLevels(L0BigInt, hi);
    if (spent.cmp?.(progressBn) > 0) break;
    if (bigNumIsInfinite(spent)) break;
    lo = hi;
    hi <<= 1n;
  }

  while (lo + 1n < hi) {
    const mid = (lo + hi) >> 1n;
    const { spent } = costForNLevels(L0BigInt, mid);
    if (spent.cmp?.(progressBn) <= 0) lo = mid;
    else hi = mid;
  }
  const { spent } = costForNLevels(L0BigInt, lo);
  return { levels: lo, spent };
}

function awardBooksBulk(levelsGainedBn) {
  try {
    if (typeof externalBookRewardProvider?.bulk === 'function') {
      const maybe = externalBookRewardProvider.bulk({
        levels: levelsGainedBn.clone?.() ?? levelsGainedBn,
        basePerLevel: bnOne(),
        xpLevelBefore: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
      });
      if (maybe instanceof BigNum) {
        bank.books.add(maybe.clone?.() ?? maybe);
        return;
      } else if (maybe != null) {
        bank.books.add(BigNum.fromAny(maybe));
        return;
      }
    }
  } catch {}
  try { bank.books.add(levelsGainedBn.clone?.() ?? levelsGainedBn); } catch {}
}

function fastNormalizeAndApplyRewards({ applyRewards = false } = {}) {
  if (bigNumIsInfinite(xpState.progress)) {
    try { xpState.xpLevel = infinityRequirementBn.clone?.() ?? infinityRequirementBn; } catch {}
    xpState.progress = bnZero();
    updateXpRequirement();
    syncCoinMultiplierWithXpLevel(true);
    return;
  }
  updateXpRequirement();
  if (requirementBn.isInfinite?.() || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite())) return;

  const L0 = levelToBigIntSafe(xpState.xpLevel);
  const { levels, spent } = maxAffordableLevels(L0, xpState.progress);

  if (levels > 0n) {
    const levelsBn = bnFromBigInt(levels);
    try { xpState.xpLevel = xpState.xpLevel.add(levelsBn); } catch {}
    try { xpState.progress = xpState.progress.sub(spent); }  catch { xpState.progress = bnZero(); }

    if (applyRewards) {
      awardBooksBulk(levelsBn);
    }
    updateXpRequirement();
  }
}

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

function approximateCoinMultiplierFromBigNum(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const levelLog = computeLevelLogTerm(levelBn);
  let totalLog = levelLog;
  const bonusLog = computeBonusLogTerm(levelBn);
  if (bonusLog) {
    totalLog = totalLog.add?.(bonusLog) ?? totalLog;
  }
  const logNumber = logBigNumToNumber(totalLog);
  if (!Number.isFinite(logNumber)) {
    return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const approx = bigNumFromLog10(logNumber);
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
    if (typeof window !== 'undefined') {
      const detail = {
        unlocked: current.unlocked,
        xpLevelsGained: xpLevelsGained?.clone?.() ?? xpLevelsGained,
        xpAdded: xpAdded?.clone?.() ?? xpAdded,
        xpLevel: current.xpLevel?.clone?.() ?? current.xpLevel,
        progress: current.progress?.clone?.() ?? current.progress,
        requirement: current.requirement?.clone?.() ?? current.requirement,
        source: 'storage',
        changeType: reason,
      };
      try { window.dispatchEvent(new CustomEvent('xp:change', { detail })); } catch {}
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
  const reqIsInf = requirement.isInfinite?.() || (typeof requirement.isInfinite === 'function' && requirement.isInfinite());
  if (reqIsInf) return 0;
  const reqIsZero = requirement.isZero?.() || (typeof requirement.isZero === 'function' && requirement.isZero());
  if (reqIsZero) return 0;
  if (!progressBn || typeof progressBn !== 'object') return 0;
  const progIsZero = progressBn.isZero?.() || (typeof progressBn.isZero === 'function' && progressBn.isZero());
  if (progIsZero) return 0;
  const logProg = approxLog10(progressBn);
  const logReq = approxLog10(requirement);
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
  fastNormalizeAndApplyRewards({ applyRewards });
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
  if (!plain || plain === 'Infinity') {
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
  if (!xpState.unlocked) {
    resetLockedXpState();
    return xpState;
  }
  updateXpRequirement();
  normalizeProgress(false);
  syncCoinMultiplierWithXpLevel();
  ensureXpStorageWatchers();
  return xpState;
}

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;
  try {
    const raw = xpState.unlocked ? '1' : '0';
    localStorage.setItem(KEY_UNLOCK(slot), raw);
    primeStorageWatcherSnapshot(KEY_UNLOCK(slot), raw);
  } catch {}
  try {
    const raw = xpState.xpLevel.toStorage();
    localStorage.setItem(KEY_XP_LEVEL(slot), raw);
    primeStorageWatcherSnapshot(KEY_XP_LEVEL(slot), raw);
  } catch {}
  try {
    const raw = xpState.progress.toStorage();
    localStorage.setItem(KEY_PROGRESS(slot), raw);
    primeStorageWatcherSnapshot(KEY_PROGRESS(slot), raw);
  } catch {}
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
    if (bank?.books?.add) {
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

export function initXpSystem() {
  ensureHudRefs();
  ensureStateLoaded();
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

export function addXp(amount, { silent = false, applyProviders = true } = {}) {
  ensureStateLoaded();
  if (!xpState.unlocked) {
    return {
      unlocked: false,
      xpLevelsGained: bnZero(),
      xpAdded: bnZero(),
      xpLevel: xpState.xpLevel,
      requirement: requirementBn,
    };
  }

  // Parse incoming XP to BigNum
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

  // Apply external XP gain providers (if any)
  if (applyProviders && !inc.isZero?.()) {
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

  // No-op if zero after providers
  if (inc.isZero?.() || (typeof inc.isZero === 'function' && inc.isZero())) {
    updateHud();
    return {
      unlocked: true,
      xpLevelsGained: bnZero(),
      xpAdded: inc,
      xpLevel: xpState.xpLevel,
      requirement: requirementBn,
    };
  }

  // Accept truly unbounded packets: ∞ XP → level ∞, progress 0 (no loops)
  if (bigNumIsInfinite(inc)) {
    xpState.progress = bnZero();
    try {
      xpState.xpLevel = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    } catch {
      xpState.xpLevel = infinityRequirementBn;
    }
    updateXpRequirement();
    persistState();
    updateHud();
    syncCoinMultiplierWithXpLevel(true);

    const detailInf = {
      unlocked: true,
      xpLevelsGained: infinityRequirementBn, // represents "jumped to ∞"
      xpAdded: inc,
      xpLevel: xpState.xpLevel,
      progress: xpState.progress,
      requirement: requirementBn,
    };
    if (!silent) {
      try { window.dispatchEvent(new CustomEvent('xp:change', { detail: detailInf })); } catch {}
    }
    return detailInf;
  }

  // Regular (finite) packet: add, then fast-bulk normalize (O(log N))
  xpState.progress = xpState.progress.add(inc);
  updateXpRequirement();

  const prevLevel = xpState.xpLevel.clone?.() ?? xpState.xpLevel;
  fastNormalizeAndApplyRewards({ applyRewards: true });

  let xpLevelsGained = bnZero();
  try {
    xpLevelsGained = xpState.xpLevel.sub?.(prevLevel) ?? bnZero();
  } catch {
    xpLevelsGained = bnZero();
  }

  // Persist + HUD + coin sync once
  persistState();
  updateHud();
  syncCoinMultiplierWithXpLevel(true);

  const detail = {
    unlocked: true,
    xpLevelsGained,
    xpAdded: inc,
    xpLevel: xpState.xpLevel,
    progress: xpState.progress,
    requirement: requirementBn,
  };
  if (!silent) {
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

export function isXpSystemUnlocked() {
  ensureStateLoaded();
  return !!xpState.unlocked;
}

export function getXpRequirementForXpLevel(xpLevel) {
  return xpRequirementForXpLevel(xpLevel);
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
    isXpSystemUnlocked,
    getXpRequirementForXpLevel,
    setExternalCoinMultiplierProvider,
    addExternalCoinMultiplierProvider,
    refreshCoinMultiplierFromXpLevel,
    setExternalXpGainMultiplierProvider,
    addExternalXpGainMultiplierProvider,
    setExternalBookRewardProvider,
    resetXpProgress,
  });
}
