// js/game/dpSystem.js

import { BigNum, approxLog10BigNum as approxLog10, bigNumFromLog10 } from '../util/bigNum.js';
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { registerTick } from './gameLoop.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { formatNumber } from '../util/numFormat.js';
import { syncDpHudLayout } from '../ui/hudLayout.js';

const KEY_PREFIX = 'ccc:dp';
const KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
const KEY_DP_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
const KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;

export function getDpLevelStorageKey(slot = getActiveSlot()) {
  const resolvedSlot = slot ?? getActiveSlot();
  return resolvedSlot == null ? null : KEY_DP_LEVEL(resolvedSlot);
}

let lastSlot = null;
let stateLoaded = false;
let requirementBn = BigNum.fromInt(10);
const dpRequirementCache = new Map();
dpRequirementCache.set('0', requirementBn);
let highestCachedExactLevel = 0n;
const infinityRequirementBn = BigNum.fromAny('Infinity');

let lastSyncedMultiplier = null;
let dpTickListener = null;
let externalCoinMultiplierProvider = null;
let externalDpGainMultiplierProvider = null;
const coinMultiplierProviders = new Set();
const dpGainMultiplierProviders = new Set();
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
  let fractionalNumber = bigNumToFiniteNumber(fractionalPart);

  if (!Number.isFinite(fractionalNumber)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  // At extremely high levels, the fractional part is lost to precision limits.
  // We inject a deterministic pseudo-random mantissa to make the numbers look nicer
  // without causing flickering UI or breaking math stability.
  let intPartNum;
  try {
      intPartNum = Number(integerPart.toPlainIntegerString?.() ?? integerPart.toString());
  } catch {
      intPartNum = logBigNumToNumber(integerPart);
  }
  if (fractionalNumber === 0 && Number.isFinite(intPartNum) && intPartNum > 100) {
      fractionalNumber = Math.abs(Math.sin(intPartNum));
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

  return new BigNum(sig, { base: e + Number(offset) });
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

const dpState = {
  unlocked: false,
  dpLevel: BigNum.fromInt(0),
  progress: BigNum.fromInt(0),
};

function enforceDpInfinityInvariant() {
  const levelIsInf = bigNumIsInfinite(dpState.dpLevel);
  const progIsInf = bigNumIsInfinite(dpState.progress);
  if (!levelIsInf && !progIsInf) return false;

  const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  dpState.dpLevel = inf.clone?.() ?? inf;
  dpState.progress = inf.clone?.() ?? inf;
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

function notifyDpSubscribers(detail = {}) {
  if (xpChangeSubscribers.size === 0) return;
  xpChangeSubscribers.forEach((entry) => {
    if (!entry || typeof entry.handler !== 'function') return;
    if (entry.slot != null && detail.slot != null && entry.slot !== detail.slot) return;
    try { entry.handler(detail); }
    catch {}
  });
}

export function onDpChange(handler, { slot = null } = {}) {
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
  dpLevelValue: null,
  progress: null,
};

function bnZero() {
  return BigNum.fromInt(0);
}

function bnOne() {
  return BigNum.fromInt(1);
}

const dpStorageWatcherCleanups = [];
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
  while (dpStorageWatcherCleanups.length > 0) {
    const stop = dpStorageWatcherCleanups.pop();
    try { stop?.(); } catch {}
  }
}

function parseBigNumOrZero(raw) {
  if (raw == null) return bnZero();
  try { return BigNum.fromAny(raw); }
  catch { return bnZero(); }
}

function handleExternalDpStorageChange(reason) {
  if (handlingExternalXpStorage) return;
  handlingExternalXpStorage = true;
  try {
    const slot = xpStorageWatcherSlot ?? getActiveSlot();
    const prev = {
      unlocked: dpState.unlocked,
      dpLevel: cloneBigNumSafe(dpState.dpLevel),
      progress: cloneBigNumSafe(dpState.progress),
      requirement: cloneBigNumSafe(requirementBn),
    };
    ensureStateLoaded(true);
    updateHud();
    ;;
    const current = {
      unlocked: dpState.unlocked,
      dpLevel: cloneBigNumSafe(dpState.dpLevel),
      progress: cloneBigNumSafe(dpState.progress),
      requirement: cloneBigNumSafe(requirementBn),
    };
    const unlockedChanged = prev.unlocked !== current.unlocked;
    const levelChanged = !bigNumEqualsSafe(prev.dpLevel, current.dpLevel);
    const progressChanged = !bigNumEqualsSafe(prev.progress, current.progress);
    if (!unlockedChanged && !levelChanged && !progressChanged) {
      return;
    }
    let dpLevelsGained = bnZero();
    if (levelChanged) {
      try { dpLevelsGained = current.dpLevel.sub?.(prev.dpLevel) ?? bnZero(); }
      catch { dpLevelsGained = bnZero(); }
    }
    let xpAdded = null;
    if (!levelChanged && progressChanged) {
      try { xpAdded = current.progress.sub?.(prev.progress) ?? null; }
      catch { xpAdded = null; }
    }
    if (typeof window !== 'undefined' || xpChangeSubscribers.size > 0) {
      const detail = {
        unlocked: current.unlocked,
        dpLevelsGained: dpLevelsGained?.clone?.() ?? dpLevelsGained,
        dpAdded: xpAdded?.clone?.() ?? xpAdded,
        dpLevel: current.dpLevel?.clone?.() ?? current.dpLevel,
        progress: current.progress?.clone?.() ?? current.progress,
        requirement: current.requirement?.clone?.() ?? current.requirement,
        source: 'storage',
        changeType: reason,
        slot,
      };
      notifyDpSubscribers(detail);
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
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
      dpStorageWatcherCleanups.push(stop);
    }
  };
  watch(KEY_UNLOCK(slot), {
    parse: (raw) => raw === '1',
    equals: (a, b) => a === b,
    onChange: () => handleExternalDpStorageChange('unlock'),
  });
  watch(KEY_DP_LEVEL(slot), {
    parse: parseBigNumOrZero,
    equals: bigNumEqualsSafe,
    onChange: () => handleExternalDpStorageChange('dpLevel'),
  });
  watch(KEY_PROGRESS(slot), {
    parse: parseBigNumOrZero,
    equals: bigNumEqualsSafe,
    onChange: () => handleExternalDpStorageChange('progress'),
  });
}

function ensureDpStorageWatchers() {
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
      ;;
    });
  }
}

function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '');
}


function bonusMultipliersCount(levelBigInt) {
  if (levelBigInt <= 1n) return 0n;
  return (levelBigInt - 1n) / 10n;
}

function ensureExactRequirementCacheUpTo(levelBigInt) {
  const target = levelBigInt < EXACT_REQUIREMENT_CACHE_LEVEL ? levelBigInt : EXACT_REQUIREMENT_CACHE_LEVEL;
  if (target <= highestCachedExactLevel) return;

  let currentLevel = highestCachedExactLevel;
  let currentRequirement = dpRequirementCache.get(currentLevel.toString());
  if (!currentRequirement) {
    currentRequirement = BigNum.fromInt(10);
    dpRequirementCache.set(currentLevel.toString(), currentRequirement);
  }

  while (currentLevel < target) {
    const nextLevel = currentLevel + 1n;
    let nextRequirement = currentRequirement.mulScaledIntFloor(11n, 1);
    if (nextLevel > 1n && ((nextLevel - 1n) % 10n === 0n)) {
      nextRequirement = nextRequirement.mulScaledIntFloor(25n, 1);
    }
    dpRequirementCache.set(nextLevel.toString(), nextRequirement);
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


function approximateRequirementFromLevel(levelBn) {
  const baseLevel = highestCachedExactLevel > 0n ? highestCachedExactLevel : 0n;
  const baseRequirement = dpRequirementCache.get(baseLevel.toString());
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

  const softcapStartBn = BigNum.fromAny("1000000000000"); // 1 Trillion
  if (levelBn.cmp?.(softcapStartBn) > 0) {
    const softcapDeltaBn = levelBn.sub?.(softcapStartBn) ?? BigNum.fromInt(0);
    let softcapDeltaNum;
    try {
        softcapDeltaNum = Number(softcapDeltaBn.toString());
    } catch {
        softcapDeltaNum = logBigNumToNumber(softcapDeltaBn);
    }

    if (Number.isFinite(softcapDeltaNum) && softcapDeltaNum > 0) {
      // Hit Infinity at ~4 Trillion total (delta = 3 Trillion)
      const baseSoftcapLog = 5;
      const rate = 2.3605777e-10;
      const penaltyLog10 = baseSoftcapLog * Math.exp(rate * softcapDeltaNum);

      if (!Number.isFinite(penaltyLog10) || penaltyLog10 >= 1.7976931348623157e+308) {
        return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
      }

      const penaltyBn = BigNum.fromAny(penaltyLog10);
      totalLog = totalLog.add?.(penaltyBn) ?? totalLog;
    } else if (softcapDeltaNum > 0 || bigNumIsInfinite(softcapDeltaBn)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
  }

  const logNumber = logBigNumToNumber(totalLog);
  if (!Number.isFinite(logNumber) || logNumber >= 1.7976931348623157e+308) {
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
  hudRefs.container = document.querySelector('.dp-counter[data-dp-hud]');
  if (!hudRefs.container) return false;
  hudRefs.bar = hudRefs.container.querySelector('.dp-bar');
  hudRefs.fill = hudRefs.container.querySelector('.dp-bar__fill');
  hudRefs.dpLevelValue = hudRefs.container.querySelector('.dp-level-value');
  hudRefs.progress = hudRefs.container.querySelector('[data-dp-progress]');
  return true;
}

function dpRequirementForLevel(dpLevelInput) {
  let dpLvlBn;
  try {
    dpLvlBn = dpLevelInput instanceof BigNum
      ? (dpLevelInput.clone?.() ?? dpLevelInput)
      : BigNum.fromAny(dpLevelInput ?? 0);
  } catch {
    dpLvlBn = BigNum.fromInt(0);
  }

  const lvlIsInf = dpLvlBn.isInfinite?.() || (typeof dpLvlBn.isInfinite === 'function' && dpLvlBn.isInfinite());
  if (lvlIsInf) {
    return BigNum.fromAny('Infinity');
  }

  let dpLvlNum = 0;
  try { dpLvlNum = Number(dpLvlBn.toString()); } catch {}
  
  if (dpLvlNum === 0) {
      return BigNum.fromInt(10);
  }

  const reqLog = Math.log10(10) + dpLvlNum * Math.log10(1.5);
  return bigNumFromLog10(BigNum.fromAny(reqLog));
}

function updateDpRequirement() {
  requirementBn = dpRequirementForLevel(dpState.dpLevel);
}

function resetLockedDpState() {
  dpState.dpLevel = bnZero();
  dpState.progress = bnZero();
  updateDpRequirement();
  ;;
}

function isKeyLocked(key) {
  if (typeof window !== 'undefined' && window.__cccLockedStorageKeys) {
    return window.__cccLockedStorageKeys.has(key);
  }
  return false;
}

function normalizeProgress(applyRewards = false) {
  // If either level or progress is already ∞, enforce the invariant and bail.
  if (enforceDpInfinityInvariant()) {
    return;
  }

  const slot = getActiveSlot();
  if (slot != null && isKeyLocked(KEY_DP_LEVEL(slot))) {
    // If level is locked, we can't level up. Just update requirement and return.
    updateDpRequirement();
    return;
  }

  updateDpRequirement();

  // If the requirement is infinite, there is nothing meaningful to normalize.
  if (bigNumIsInfinite(requirementBn)) {
    return;
  }

  let guard = 0;
  const limit = 10000;
  while (dpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    try { dpState.progress = dpState.progress.sub(requirementBn); }
    catch { dpState.progress = bnZero(); }

    try { dpState.dpLevel = dpState.dpLevel.add(bnOne()); }
    catch { dpState.dpLevel = bnZero(); }

    if (applyRewards) handleDpLevelUpRewards();
    updateDpRequirement();

    if (bigNumIsInfinite(requirementBn)) {
      break;
    }
    guard += 1;
  }

  if (guard >= limit) {
    dpState.progress = bnZero();
  }
}

function dpLevelBigIntInfo(dpLevelValue) {
  if (!dpLevelValue || typeof dpLevelValue !== 'object') {
    return { bigInt: 0n, finite: false };
  }
  const levelIsInfinite = dpLevelValue.isInfinite?.() || (typeof dpLevelValue.isInfinite === 'function' && dpLevelValue.isInfinite());
  if (levelIsInfinite) {
    return { bigInt: null, finite: false };
  }
  let plain = '0';
  try {
    plain = dpLevelValue.toPlainIntegerString?.() ?? dpLevelValue.toString?.() ?? '0';
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

export function syncCoinMultiplierWithDpLevel(force = false) {}

function ensureStateLoaded(force = false) {
  const slot = getActiveSlot();
  if (slot == null) {
    lastSlot = null;
    stateLoaded = false;
    dpState.unlocked = false;
    resetLockedDpState();
    return dpState;
  }
  if (!force && stateLoaded && slot === lastSlot) return dpState;
  lastSlot = slot;
  stateLoaded = true;
  try {
    const unlockedRaw = localStorage.getItem(KEY_UNLOCK(slot));
    dpState.unlocked = unlockedRaw === '1';
  } catch {
    dpState.unlocked = false;
  }
  try {
    dpState.dpLevel = BigNum.fromAny(localStorage.getItem(KEY_DP_LEVEL(slot)) ?? '0');
    if (dpState.dpLevel && typeof dpState.dpLevel.cmp === 'function' && dpState.dpLevel.cmp(4500000000000) >= 0) {
      dpState.dpLevel = BigNum.fromAny('Infinity');
    }
  } catch {
    dpState.dpLevel = bnZero();
  }
  try {
    dpState.progress = BigNum.fromAny(localStorage.getItem(KEY_PROGRESS(slot)) ?? '0');
  } catch {
    dpState.progress = bnZero();
  }

  // If we loaded an infinite value (e.g. from debug/cheat), force unlock
  // so we don't immediately reset it to zero in the locked check below.
  if (bigNumIsInfinite(dpState.dpLevel) || bigNumIsInfinite(dpState.progress)) {
    dpState.unlocked = true;
  }

  if (!dpState.unlocked) {
    resetLockedDpState();
    return dpState;
  }

  enforceDpInfinityInvariant();

  updateDpRequirement();
  ;;
  ensureDpStorageWatchers();
  return dpState;
}

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;

  const expected = {
    unlocked: dpState.unlocked ? '1' : '0',
    level: dpState.dpLevel.toStorage(),
    progress: dpState.progress.toStorage(),
  };

  try { localStorage.setItem(KEY_UNLOCK(slot), expected.unlocked); }
  catch {}
  try { localStorage.setItem(KEY_DP_LEVEL(slot), expected.level); }
  catch {}
  try { localStorage.setItem(KEY_PROGRESS(slot), expected.progress); }
  catch {}

  const persisted = (() => {
    let unlocked = dpState.unlocked;
    let level = dpState.dpLevel;
    let progress = dpState.progress;
    try { unlocked = localStorage.getItem(KEY_UNLOCK(slot)) === '1'; }
    catch {}
    try {
      const rawLevel = localStorage.getItem(KEY_DP_LEVEL(slot));
      if (rawLevel) level = BigNum.fromAny(rawLevel);
    } catch {}
    try {
      const rawProgress = localStorage.getItem(KEY_PROGRESS(slot));
      if (rawProgress) progress = BigNum.fromAny(rawProgress);
    } catch {}
    return { unlocked, level, progress };
  })();

  primeStorageWatcherSnapshot(KEY_UNLOCK(slot), persisted.unlocked ? '1' : '0');
  primeStorageWatcherSnapshot(KEY_DP_LEVEL(slot), persisted.level?.toStorage?.() ?? expected.level);
  primeStorageWatcherSnapshot(KEY_PROGRESS(slot), persisted.progress?.toStorage?.() ?? expected.progress);

  const mismatch =
    persisted.unlocked !== dpState.unlocked ||
    (persisted.level?.toStorage?.() ?? null) !== expected.level ||
    (persisted.progress?.toStorage?.() ?? null) !== expected.progress;

  if (mismatch) {
    dpState.unlocked = persisted.unlocked;
    dpState.dpLevel = persisted.level;
    if (dpState.dpLevel && typeof dpState.dpLevel.cmp === 'function' && dpState.dpLevel.cmp(4500000000000) >= 0) {
      dpState.dpLevel = BigNum.fromAny('Infinity');
    }
    dpState.progress = persisted.progress;
    updateDpRequirement();
    ;;
    updateHud();
  }
}

function handleDpLevelUpRewards() {
  ;;

  let reward = bnOne();
  if (typeof externalBookRewardProvider === 'function') {
    try {
      const maybe = externalBookRewardProvider({
        baseReward: reward.clone?.() ?? reward,
        dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
        dpUnlocked: dpState.unlocked,
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
}

function updateHud() {
  if (!ensureHudRefs()) return;
  const { container, bar, fill, dpLevelValue, progress } = hudRefs;
  if (!container) return;
  if (!container.closest('.area-cavern')) {
    container.setAttribute('hidden', '');
    syncDpHudLayout();
    return;
  }

  container.removeAttribute('hidden');
  const requirement = requirementBn;
  const ratio = progressRatio(dpState.progress, requirement);
  const pct = `${(ratio * 100).toFixed(2)}%`;
  if (fill) {
    fill.style.setProperty('--dp-fill', pct);
    fill.style.width = pct;
  }
  if (dpLevelValue) {
    dpLevelValue.innerHTML = formatNumber(dpState.dpLevel);
  }
  if (progress) {
    const currentHtml = formatNumber(dpState.progress);
    const reqHtml = formatNumber(requirement);
    progress.innerHTML = `<span class="dp-progress-current">${currentHtml}</span><span class="dp-progress-separator">/</span><span class="dp-progress-required">${reqHtml}</span><span class="dp-progress-suffix">DP</span>`;
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', (ratio * 100).toFixed(2));
    const currPlain = stripHtml(formatNumber(dpState.progress));
    const reqPlain = stripHtml(formatNumber(requirement));
    bar.setAttribute('aria-valuetext', `${currPlain} / ${reqPlain} DP`);
  }
  syncDpHudLayout();
}

export function initDpSystem({ forceReload = false } = {}) {
  // Auto unlock DP system
  if (!dpState.unlocked) {
      dpState.unlocked = true;
      persistState();
  }
  ensureHudRefs();
  ensureStateLoaded(forceReload);
  updateDpRequirement();
  updateHud();
  ensureDpStorageWatchers();
  if (!dpTickListener) {
    dpTickListener = registerTick(() => {});
  }
  return getDpState();
}

export function unlockDpSystem() {
  ensureStateLoaded();
  if (dpState.unlocked) {
    updateHud();
    return false;
  }
  resetLockedDpState();
  dpState.unlocked = true;
  persistState();
  updateHud();
  ;;
  const detail = getDpState();
  try {
    window.dispatchEvent(new CustomEvent('dp:unlock', { detail }));
    window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } }));
  } catch {}
  return true;
}

export function resetDpProgress({ keepUnlock = true } = {}) {
  ensureStateLoaded();
  const wasUnlocked = dpState.unlocked;
  resetLockedDpState();
  dpState.unlocked = keepUnlock ? (wasUnlocked || dpState.unlocked) : false;
  persistState();
  updateHud();
  ;;
  const detail = getDpState();
  try {
    window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } }));
  } catch {}
  return detail;
}

export function getDpProgressRatio() {
  ensureStateLoaded();
  return progressRatio(dpState.progress, requirementBn);
}

export function addDp(amount, { silent = false } = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();

  // If Progress is locked, we cannot accumulate DP without causing lag/reverts.
  if (slot != null && isKeyLocked(KEY_PROGRESS(slot))) {
    return {
      unlocked: dpState.unlocked,
      dpLevelsGained: bnZero(),
      dpAdded: bnZero(),
      dpLevel: dpState.dpLevel,
      progress: dpState.progress,
      requirement: requirementBn,
      slot
    };
  }
  
  // 1. Basic Unlock Check
  if (!dpState.unlocked) {
    return {
      unlocked: false,
      dpLevelsGained: bnZero(),
      dpAdded: bnZero(),
      dpLevel: dpState.dpLevel,
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
    const providers = dpGainMultiplierProviders.size > 0
      ? Array.from(dpGainMultiplierProviders)
      : (typeof externalDpGainMultiplierProvider === 'function' ? [externalDpGainMultiplierProvider] : []);
    for (const provider of providers) {
      if (typeof provider !== 'function') continue;
      try {
        const maybe = provider({
          baseGain: inc.clone?.() ?? inc,
          dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
          dpUnlocked: dpState.unlocked,
        });
        if (maybe instanceof BigNum) {
          inc = maybe.clone?.() ?? maybe;
        } else if (maybe != null) {
          inc = BigNum.fromAny(maybe);
        }
      } catch {}
    }
  }

  inc = applyStatMultiplierOverride('dp', inc);

  // 4. Handle Zero Gain
  if (inc.isZero?.() || (typeof inc.isZero === 'function' && inc.isZero())) {
    updateHud();
    return {
      unlocked: true,
      dpLevelsGained: bnZero(),
      dpAdded: inc,
      dpLevel: dpState.dpLevel,
      requirement: requirementBn
    };
  }

  // 5. Add to Progress
  dpState.progress = dpState.progress.add(inc);
  updateDpRequirement();

  // Check if Level is locked before attempting to level up
  const levelLocked = slot != null && isKeyLocked(KEY_DP_LEVEL(slot));

  // 6. Handle Infinity (Early Exit)
  const progressIsInf = bigNumIsInfinite(dpState.progress);
  const levelIsInf = bigNumIsInfinite(dpState.dpLevel);
  const gainIsInf = bigNumIsInfinite(inc);

  if (progressIsInf || levelIsInf || gainIsInf) {
    const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    
    // Only set DP Level to infinity if it's not locked.
    // If it is locked, it stays at its current value (unless it was already infinite).
    if (!levelLocked) {
        dpState.dpLevel = inf.clone?.() ?? inf;
    }
    
    dpState.progress = inf.clone?.() ?? inf;
    
    // Requirement becomes infinity if level is infinity, OR if we force it.
    // If level is finite but locked, requirement is finite.
    // But we just set progress to infinity.
    // If progress is infinite and requirement is finite, that's fine.
    // We should recompute requirement based on actual level.
    updateDpRequirement();

    enforceDpInfinityInvariant();
    persistState();
    updateHud();
    ;;

    const detail = {
      unlocked: true,
      dpLevelsGained: bnZero(),
      dpAdded: inc.clone?.() ?? inc,
      dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
      progress: dpState.progress.clone?.() ?? dpState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn,
      slot,
    };
    notifyDpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  // 7. Bulk Level Calculation Logic
  let dpLevelsGained = bnZero();

  // Safety check: if progress < requirement, we are done immediately.
  if (dpState.progress.cmp(requirementBn) < 0) {
    persistState();
    updateHud();
    const detail = {
      unlocked: true,
      dpLevelsGained: bnZero(),
      dpAdded: inc,
      dpLevel: dpState.dpLevel,
      progress: dpState.progress,
      requirement: requirementBn,
      slot,
    };
    notifyDpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  if (!levelLocked) {
      /* Optimization: */
      const currentProgressLog = approxLog10(dpState.progress);
      const reqLog = approxLog10(requirementBn);
      
      if (currentProgressLog - reqLog > 2) {
        const baseLevelBn = dpState.dpLevel;
        let currentLevelNum;
        try {
          currentLevelNum = Number(baseLevelBn.toPlainIntegerString?.() ?? baseLevelBn.toString());
        } catch {
          currentLevelNum = 0;
        }

        if (Number.isFinite(currentLevelNum)) {
            // Fast binary search to find target level to prevent lag
            const getLogForLevel = (levelNum) => {
                return Math.log10(10) + levelNum * Math.log10(1.5);
            };

            let low = currentLevelNum;
            let high = Math.max(currentLevelNum, 4500000000000);
            let best = currentLevelNum;

            for (let i = 0; i < 60; i++) {
                const mid = Math.floor((low + high) / 2);
                const midLog = getLogForLevel(mid);
                if (midLog <= currentProgressLog) {
                    best = mid;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            const bestBn = BigNum.fromAny(best);
            const delta = bestBn.sub?.(baseLevelBn) ?? bnZero();
            if (delta.cmp?.(bnZero()) > 0) {
                dpLevelsGained = delta;
                dpState.dpLevel = bestBn;
                updateDpRequirement();
                
                // Subtract the sum of all passed levels. This is an approximation since a sum of geometric series.
                // S = a(1 - r^n)/(1-r)
                // For simplicity, we can just zero out progress if we skipped a lot, or try to keep progress exact.
                // Since incremental games usually don't care about remainder when jumping millions of levels:
                dpState.progress = dpState.progress.sub?.(requirementBn) ?? bnZero();
            }
        }
      } else {
      // 8. Finalize with standard loop (Cleanup)
      let guard = 0;
      const limit = 500; // Hard limit to prevent freezes if approximation fails
      
      while (dpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
        dpState.progress = dpState.progress.sub(requirementBn);
        dpState.dpLevel = dpState.dpLevel.add(bnOne());
        dpLevelsGained = dpLevelsGained.add(bnOne());
        
        handleDpLevelUpRewards();
        updateDpRequirement();
        
        const reqIsInf = bigNumIsInfinite(requirementBn);
        if (reqIsInf) break;
        guard += 1;
      }
      
      if (guard >= limit && dpState.progress.cmp(requirementBn) >= 0) {
          updateDpRequirement();
      }
      if (dpState.dpLevel && typeof dpState.dpLevel.cmp === 'function' && dpState.dpLevel.cmp(4500000000000) >= 0) {
        dpState.dpLevel = BigNum.fromAny('Infinity');
        updateDpRequirement();
      }
    }
  }

  // 9. Persist and Notify
  persistState();
  updateHud();


  const detail = {
    unlocked: true,
    dpLevelsGained: dpLevelsGained.clone?.() ?? dpLevelsGained,
    dpAdded: inc.clone?.() ?? inc,
    dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
    progress: dpState.progress.clone?.() ?? dpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
    slot,
  };
  
  notifyDpSubscribers(detail);
  if (!silent && typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
  }
  return detail;
}

export function getDpState() {
  if (dpState.dpLevel && typeof dpState.dpLevel.cmp === 'function' && dpState.dpLevel.cmp(4500000000000) >= 0 && !dpState.dpLevel.isInfinite?.()) {
    dpState.dpLevel = bigNumFromAny('Infinity');
    dpState.xpProgress = bigNumFromAny('Infinity');
    dpState.xpRequirement = bigNumFromAny('Infinity');
  }
  ensureStateLoaded();
  return {
    unlocked: dpState.unlocked,
    dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
    progress: dpState.progress.clone?.() ?? dpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
  };
}

export function broadcastDpChange(detailOverrides = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();
  const detail = {
    ...getDpState(),
    slot,
    ...detailOverrides,
  };

  notifyDpSubscribers(detail);
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
  }

  return detail;
}

export function isDpSystemUnlocked() {
  ensureStateLoaded();
  return !!dpState.unlocked;
}

export function getDpRequirementForLevel(dpLevel) {
  return dpRequirementForLevel(dpLevel);
}

export function getDpGainMultiplier() {
  ensureStateLoaded();
  let mult = bnOne();
  const providers = dpGainMultiplierProviders.size > 0
    ? Array.from(dpGainMultiplierProviders)
    : (typeof externalDpGainMultiplierProvider === 'function' ? [externalDpGainMultiplierProvider] : []);
  for (const provider of providers) {
    if (typeof provider !== 'function') continue;
    try {
      const maybe = provider({
        baseGain: mult.clone?.() ?? mult,
        dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
        dpUnlocked: dpState.unlocked,
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

export function computeCoinMultiplierForDpLevel(levelValue) {
  let dpLevelBn;
  try {
    dpLevelBn = levelValue instanceof BigNum ? levelValue : BigNum.fromAny(levelValue ?? 0);
  } catch {
    dpLevelBn = BigNum.fromInt(0);
  }

  const levelInfo = dpLevelBigIntInfo(dpLevelBn);
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
    multiplierBn = approximateCoinMultiplierFromBigNum(dpLevelBn);
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
        dpLevel: dpLevelBn.clone?.() ?? dpLevelBn,
        dpUnlocked: !!dpState.unlocked,
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
  ;;
}


export function setExternalDpGainMultiplierProvider(fn) {
  externalDpGainMultiplierProvider = typeof fn === 'function' ? fn : null;
  dpGainMultiplierProviders.clear();
  if (externalDpGainMultiplierProvider) {
    dpGainMultiplierProviders.add(externalDpGainMultiplierProvider);
  }
}

export function addExternalCoinMultiplierProvider(fn) {
  if (typeof fn !== 'function') return () => {};
  coinMultiplierProviders.add(fn);
  ensureStateLoaded();
  ;;
  return () => {
    coinMultiplierProviders.delete(fn);
    ensureStateLoaded();
    ;;
  };
}

export function addExternalDpGainMultiplierProvider(fn) {
  if (typeof fn !== 'function') return () => {};
  dpGainMultiplierProviders.add(fn);
  ensureStateLoaded();
  return () => {
    dpGainMultiplierProviders.delete(fn);
  };
}

export function setExternalBookRewardProvider(fn) {
  externalBookRewardProvider = typeof fn === 'function' ? fn : null;
}

if (typeof window !== 'undefined') {
  window.dpSystem = window.dpSystem || {};
  Object.assign(window.dpSystem, {
    initDpSystem,
    unlockDpSystem,
    addDp,
    getDpState,
    broadcastDpChange,
    isDpSystemUnlocked,
    getDpRequirementForLevel,
    getDpGainMultiplier,
    
    
    setExternalDpGainMultiplierProvider,
    addExternalDpGainMultiplierProvider,
    setExternalBookRewardProvider,
    resetDpProgress,
    getDpProgressRatio
  });
}
