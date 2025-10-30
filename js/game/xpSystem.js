// js/game/xpSystem.js

import { BigNum } from '../util/bigNum.js';
import { bank, getActiveSlot } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';

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
  return approx;
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
  updateXpRequirement();
  const reqIsInf = requirementBn.isInfinite?.() || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite());
  if (reqIsInf) {
    xpState.progress = bnZero();
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
    const nextReqInf = requirementBn.isInfinite?.() || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite());
    if (nextReqInf) {
      xpState.progress = bnZero();
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
    multiplierBn = working.floorToInteger();
  } else {
    multiplierBn = approximateCoinMultiplierFromBigNum(xpState.xpLevel);
  }

  const multIsInf = multiplierBn.isInfinite?.() || (typeof multiplierBn.isInfinite === 'function' && multiplierBn.isInfinite());
  try { multApi.set(multiplierBn.clone?.() ?? multiplierBn); } catch {}
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

function ensureStateLoaded() {
  const slot = getActiveSlot();
  if (slot == null) {
    lastSlot = null;
    stateLoaded = false;
    xpState.unlocked = false;
    resetLockedXpState();
    return xpState;
  }
  if (stateLoaded && slot === lastSlot) return xpState;
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
  return xpState;
}

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;
  try { localStorage.setItem(KEY_UNLOCK(slot), xpState.unlocked ? '1' : '0'); } catch {}
  try { localStorage.setItem(KEY_XP_LEVEL(slot), xpState.xpLevel.toStorage()); } catch {}
  try { localStorage.setItem(KEY_PROGRESS(slot), xpState.progress.toStorage()); } catch {}
}

function handleXpLevelUpRewards() {
  try {
    if (bank?.coins?.mult?.multiplyByDecimal) {
      bank.coins.mult.multiplyByDecimal('1.1');
    }
  } catch {}
  try {
    if (bank?.books?.add) {
      bank.books.add(bnOne());
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
}

export function initXpSystem() {
  ensureHudRefs();
  ensureStateLoaded();
  updateXpRequirement();
  updateHud();
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

export function addXp(amount, { silent = false } = {}) {
  ensureStateLoaded();
  if (!xpState.unlocked) {
    return { unlocked: false, xpLevelsGained: bnZero(), xpAdded: bnZero(), xpLevel: xpState.xpLevel, requirement: requirementBn };
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
  if (inc.isZero?.() || (typeof inc.isZero === 'function' && inc.isZero())) {
    updateHud();
    return { unlocked: true, xpLevelsGained: bnZero(), xpAdded: inc, xpLevel: xpState.xpLevel, requirement: requirementBn };
  }
  xpState.progress = xpState.progress.add(inc);
  updateXpRequirement();
  let xpLevelsGained = bnZero();
  let guard = 0;
  const limit = 100000;
  while (xpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    xpState.progress = xpState.progress.sub(requirementBn);
    xpState.xpLevel = xpState.xpLevel.add(bnOne());
    xpLevelsGained = xpLevelsGained.add(bnOne());
    handleXpLevelUpRewards();
    updateXpRequirement();
    const reqIsInf = requirementBn.isInfinite?.() || (typeof requirementBn.isInfinite === 'function' && requirementBn.isInfinite());
    if (reqIsInf) {
      xpState.progress = bnZero();
      break;
    }
    guard += 1;
  }
  if (guard >= limit) {
    xpState.progress = bnZero();
  }
  persistState();
  updateHud();
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
    lastSyncedCoinApproxKey = typeof xpState.xpLevel?.toStorage === 'function' ? xpState.xpLevel.toStorage() : null;
  }
  const detail = {
    unlocked: true,
    xpLevelsGained: xpLevelsGained.clone?.() ?? xpLevelsGained,
    xpAdded: inc.clone?.() ?? inc,
    xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
    progress: xpState.progress.clone?.() ?? xpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
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

if (typeof window !== 'undefined') {
  window.xpSystem = window.xpSystem || {};
  Object.assign(window.xpSystem, {
    initXpSystem,
    unlockXpSystem,
    addXp,
    getXpState,
    isXpSystemUnlocked,
    getXpRequirementForXpLevel,
  });
}
