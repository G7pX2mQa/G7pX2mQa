import { BigNum, approxLog10BigNum as approxLog10 } from '../util/bigNum.js';
import { getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { syncDpHudLayout } from '../ui/hudLayout.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';

import { addExternalFpMultiplierProvider } from '../ui/merchantTabs/flowTab.js';

const externalDpMultiplierProviders = [];
export function addExternalDpMultiplierProvider(fn) {
  if (typeof fn === 'function') externalDpMultiplierProviders.push(fn);
}

let dpFpProviderRegistered = false;

function registerDpFpMultiplierProvider() {
  if (dpFpProviderRegistered) return;
  dpFpProviderRegistered = true;
  addExternalFpMultiplierProvider((mult) => {
      try {
          if (!isDpSystemUnlocked()) return mult;
          
          const state = getDpState();
          const levelStr = state.dpLevel.toString();
          let levelNum = Number(levelStr);
          
          if (!Number.isFinite(levelNum) || levelNum === 0) return mult;

          let powVal = Math.pow(1.1, levelNum);
          
          if (powVal >= 1e20 || !Number.isFinite(powVal)) {
               const exponent = levelNum * Math.log10(1.1);
               const mantissa = Math.pow(10, exponent % 1);
               const intPart = Math.floor(exponent);
               let nextMult = mult.mulDecimalFloor(mantissa);
               return nextMult.mulBigNumInteger(BigNum.fromAny("1e" + intPart));
          } else {
               return mult.mulDecimalFloor(powVal);
          }
      } catch {
          return mult;
      }
  });
}

const KEY_PREFIX = 'ccc:dp';
const KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
const KEY_DP_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
const KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;
const KEY_HIGHEST_LEVEL = (slot) => `${KEY_PREFIX}:highest_level:${slot}`;

let lastSlot = null;
let stateLoaded = false;
let requirementBn = BigNum.fromInt(10);

const dpState = {
  unlocked: false,
  dpLevel: BigNum.fromInt(0),
  progress: BigNum.fromInt(0),
  highestLevel: BigNum.fromInt(0),
};

const dpChangeSubscribers = new Set();

function notifyDpSubscribers(detail = {}) {
  if (dpChangeSubscribers.size === 0) return;
  dpChangeSubscribers.forEach((entry) => {
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
  dpChangeSubscribers.add(entry);
  return () => {
    dpChangeSubscribers.delete(entry);
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

const dpStorageWatcherCleanups = [];
let dpStorageWatchersInitialized = false;
let dpStorageWatcherSlot = null;
let handlingExternalDpStorage = false;

function cleanupDpStorageWatchers() {
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
  if (handlingExternalDpStorage) return;
  handlingExternalDpStorage = true;
  try {
    const slot = dpStorageWatcherSlot ?? getActiveSlot();
    const prev = {
      unlocked: dpState.unlocked,
      dpLevel: cloneBigNumSafe(dpState.dpLevel),
      progress: cloneBigNumSafe(dpState.progress),
      requirement: cloneBigNumSafe(requirementBn),
    };
    ensureStateLoaded(true);
    updateHud();
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
    let dpAdded = null;
    if (!levelChanged && progressChanged) {
      try { dpAdded = current.progress.sub?.(prev.progress) ?? null; }
      catch { dpAdded = null; }
    }
    if (typeof window !== 'undefined' || dpChangeSubscribers.size > 0) {
      const detail = {
        unlocked: current.unlocked,
        dpLevelsGained: dpLevelsGained?.clone?.() ?? dpLevelsGained,
        dpAdded: dpAdded?.clone?.() ?? dpAdded,
        dpLevel: current.dpLevel?.clone?.() ?? current.dpLevel,
        progress: current.progress?.clone?.() ?? current.progress,
        requirement: current.requirement?.clone?.() ?? current.requirement,
        source: 'storage',
        changeType: reason,
        slot,
      };
      notifyDpSubscribers(detail);
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'dp', delta: detail.dpAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
      }
    }
  } finally {
    handlingExternalDpStorage = false;
  }
}

function bindDpStorageWatchersForSlot(slot) {
  if (slot === dpStorageWatcherSlot) return;
  cleanupDpStorageWatchers();
  dpStorageWatcherSlot = slot ?? null;
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
  if (dpStorageWatchersInitialized) {
    bindDpStorageWatchersForSlot(getActiveSlot());
    return;
  }
  dpStorageWatchersInitialized = true;
  bindDpStorageWatchersForSlot(getActiveSlot());
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      bindDpStorageWatchersForSlot(getActiveSlot());
      ensureStateLoaded(true);
      updateHud();
    });
  }
}

function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '');
}

function progressRatio(progressBn, requirement) {
  if (!requirement || typeof requirement !== 'object') return 0;
  if (!progressBn || typeof progressBn !== 'object') return 0;

  const isInfinite = (bn) => !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));
  const reqIsInf = isInfinite(requirement);
  const progIsInf = isInfinite(progressBn);

  if (reqIsInf) {
    return progIsInf ? 1 : 0;
  }

  const reqIsZero = requirement.isZero?.() || (typeof requirement.isZero === 'function' && requirement.isZero());
  if (reqIsZero) return 0;

  const progIsZero = progressBn.isZero?.() || (typeof progressBn.isZero === 'function' && progressBn.isZero());
  if (progIsZero) return 0;

  if (progressBn.cmp(requirement) >= 0) return 1;

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

function dpRequirementForDpLevel(dpLevelInput) {
  let dpLvlBn;
  try {
    dpLvlBn = dpLevelInput instanceof BigNum
      ? (dpLevelInput.clone?.() ?? dpLevelInput)
      : BigNum.fromAny(dpLevelInput ?? 0);
  } catch {
    dpLvlBn = BigNum.fromInt(0);
  }

  // Formula: Requirement = 10 * 1.5 ^ DPLevel
  // DPLevel starts at 0, so DPLevel 0 -> req 10.
  let levelPlain = '0';
  try {
    levelPlain = dpLvlBn.toPlainIntegerString?.() ?? dpLvlBn.toString?.() ?? '0';
  } catch {
    levelPlain = '0';
  }

  if (levelPlain === 'Infinity') {
    return BigNum.fromAny('Infinity');
  }

  let targetLevelInfo = { num: null, finite: true };
  if (levelPlain && levelPlain !== 'Infinity') {
    try {
      targetLevelInfo = { num: Number(levelPlain), finite: true };
    } catch {
      targetLevelInfo = { num: null, finite: true };
    }
  } else {
    targetLevelInfo = { num: null, finite: true };
  }

  const targetLevel = targetLevelInfo.num ?? 0;
  
  const baseReq = BigNum.fromInt(10);
  if (targetLevel <= 0) return baseReq;

  // 10 * 1.5^level
  // Since 1.5 = 15/10, we can use mulScaledIntFloor or similar if BigNum supports it well
  // Or fallback to JS Math for reasonable levels, which should be fine as DP won't go to Infinity quickly
  const numLevel = Number(targetLevel);
  if (numLevel < 200) {
     return BigNum.fromAny(Math.floor(10 * Math.pow(1.5, numLevel)));
  } else {
     // Use Math for calculating scientific directly if levels get huge
     let totalLog10 = 1 + (numLevel * Math.log10(1.5));
     
     const softcapStart = 1e12; // 1 Trillion
     if (numLevel > softcapStart) {
         const softcapDeltaNum = numLevel - softcapStart;
         // Hit Infinity at ~4.0003 Trillion total (delta = 3.0003 Trillion)
         const baseSoftcapLog = 5;
         const rate = 2.36034e-10;
         const penaltyLog10 = baseSoftcapLog * Math.exp(rate * softcapDeltaNum);
         
         if (!Number.isFinite(penaltyLog10) || penaltyLog10 >= 1.7976931348623157e+308) {
             return BigNum.fromAny('Infinity');
         }
         totalLog10 += penaltyLog10;
         
         if (!Number.isFinite(totalLog10) || totalLog10 >= 1.7976931348623157e+308) {
             return BigNum.fromAny('Infinity');
         }
     }
     
     const intPart = Math.floor(totalLog10);
     const fracPart = totalLog10 - intPart;
     const mantissa = Math.pow(10, fracPart);
     return new BigNum(Number(Math.round(mantissa * 1e14)), { base: intPart - 14 });
  }
}

function updateDpRequirement() {
  requirementBn = dpRequirementForDpLevel(dpState.dpLevel);
}

function resetLockedDpState() {
  dpState.dpLevel = bnZero();
  dpState.progress = bnZero();
  updateDpRequirement();
}

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
  dpState.unlocked = false;
  try {
    const rawUnlocked = localStorage.getItem(KEY_UNLOCK(slot));
    if (rawUnlocked === '1') dpState.unlocked = true;
  } catch {}
  try {
    dpState.dpLevel = BigNum.fromAny(localStorage.getItem(KEY_DP_LEVEL(slot)) ?? '0');
  } catch {
    dpState.dpLevel = bnZero();
  }
  try {
    dpState.highestLevel = BigNum.fromAny(localStorage.getItem(KEY_HIGHEST_LEVEL(slot)) ?? '0');
  } catch {
    dpState.highestLevel = bnZero();
  }
  if (dpState.dpLevel.cmp(dpState.highestLevel) > 0) {
    dpState.highestLevel = dpState.dpLevel.clone?.() ?? dpState.dpLevel;
  }
  try {
    dpState.progress = BigNum.fromAny(localStorage.getItem(KEY_PROGRESS(slot)) ?? '0');
  } catch {
    dpState.progress = bnZero();
  }

  if (!dpState.unlocked) {
    resetLockedDpState();
    return dpState;
  }

  updateDpRequirement();
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
    highestLevel: dpState.highestLevel.toStorage(),
  };

  try { localStorage.setItem(KEY_UNLOCK(slot), expected.unlocked); }
  catch {}
  try { localStorage.setItem(KEY_DP_LEVEL(slot), expected.level); }
  catch {}
  try { localStorage.setItem(KEY_PROGRESS(slot), expected.progress); }
  catch {}
  try { localStorage.setItem(KEY_HIGHEST_LEVEL(slot), expected.highestLevel); }
  catch {}

  const persisted = (() => {
    let unlocked = dpState.unlocked;
    let level = dpState.dpLevel;
    let progress = dpState.progress;
    let highestLevel = dpState.highestLevel;
    try { unlocked = localStorage.getItem(KEY_UNLOCK(slot)) !== '0'; }
    catch {}
    try {
      const rawLevel = localStorage.getItem(KEY_DP_LEVEL(slot));
      if (rawLevel) level = BigNum.fromAny(rawLevel);
    } catch {}
    try {
      const rawProgress = localStorage.getItem(KEY_PROGRESS(slot));
      if (rawProgress) progress = BigNum.fromAny(rawProgress);
    } catch {}
    try {
      const rawHighestLevel = localStorage.getItem(KEY_HIGHEST_LEVEL(slot));
      if (rawHighestLevel) highestLevel = BigNum.fromAny(rawHighestLevel);
    } catch {}
    return { unlocked, level, progress, highestLevel };
  })();

  primeStorageWatcherSnapshot(KEY_UNLOCK(slot), persisted.unlocked ? '1' : '0');
  primeStorageWatcherSnapshot(KEY_DP_LEVEL(slot), persisted.level?.toStorage?.() ?? expected.level);
  primeStorageWatcherSnapshot(KEY_PROGRESS(slot), persisted.progress?.toStorage?.() ?? expected.progress);
  primeStorageWatcherSnapshot(KEY_HIGHEST_LEVEL(slot), persisted.highestLevel?.toStorage?.() ?? expected.highestLevel);

  const mismatch =
    persisted.unlocked !== dpState.unlocked ||
    (persisted.level?.toStorage?.() ?? null) !== expected.level ||
    (persisted.progress?.toStorage?.() ?? null) !== expected.progress ||
    (persisted.highestLevel?.toStorage?.() ?? null) !== expected.highestLevel;

  if (mismatch) {
    dpState.unlocked = persisted.unlocked;
    dpState.dpLevel = persisted.level;
    dpState.progress = persisted.progress;
    dpState.highestLevel = persisted.highestLevel;
    if (dpState.dpLevel.cmp?.(dpState.highestLevel) > 0) {
        dpState.highestLevel = dpState.dpLevel.clone?.() ?? dpState.dpLevel;
    }
    updateDpRequirement();
    updateHud();
  }
}

function updateHud() {
  if (!ensureHudRefs()) return;
  const { container, bar, fill, dpLevelValue, progress } = hudRefs;
  if (!container) return;
  const gameRoot = document.getElementById('game-root');
  const isCavern = gameRoot && gameRoot.classList.contains('area-cavern');
  if (!isCavern && !container.closest('.area-cavern')) {
    container.setAttribute('hidden', '');
    syncDpHudLayout();
    return;
  }
  if (!dpState.unlocked) {
    container.setAttribute('hidden', '');
    if (fill) {
      fill.style.setProperty('--dp-fill', '0%');
      fill.style.width = '0%';
    }
    if (dpLevelValue) dpLevelValue.textContent = '0';
    if (progress) {
      const reqHtml = formatNumber(requirementBn);
      progress.innerHTML = `<span class="dp-progress-current">0</span><span class="dp-progress-separator">/</span><span class="dp-progress-required">${reqHtml}</span><span class="dp-progress-suffix">DP</span>`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', '0');
      const reqPlain = stripHtml(formatNumber(requirementBn));
      bar.setAttribute('aria-valuetext', `0 / ${reqPlain || '10'} DP`);
    }
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
  const detail = getDpState();
  try { window.dispatchEvent(new CustomEvent('dp:unlock', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
  return true;
}

export function initDpSystem({ forceReload = false } = {}) {
  registerDpFpMultiplierProvider();
  ensureHudRefs();
  ensureStateLoaded(forceReload);
  updateDpRequirement();
  updateHud();
  ensureDpStorageWatchers();
  return getDpState();
}

export function resetDpProgress({ keepUnlock = true } = {}) {
  ensureStateLoaded();
  const wasUnlocked = dpState.unlocked;
  resetLockedDpState();
  dpState.unlocked = keepUnlock ? (wasUnlocked || dpState.unlocked) : false;
  if (dpState.dpLevel.cmp?.(dpState.highestLevel) > 0) {
    dpState.highestLevel = dpState.dpLevel.clone?.() ?? dpState.dpLevel;
  }
  persistState();
  updateHud();
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

export function getDpMultiplier() {
  let dpMult = BigNum.fromInt(1);
  for (const provider of externalDpMultiplierProviders) {
    try {
      const val = provider(dpMult);
      if (val instanceof BigNum) {
        dpMult = val;
      } else if (val) {
        dpMult = dpMult.mulBigNumInteger(BigNum.fromAny(val));
      }
    } catch {}
  }
  return dpMult;
}

export function addDp(amount, { silent = false } = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();

  if (!dpState.unlocked) {
    return {
      unlocked: false,
      dpLevelsGained: bnZero(),
      dpAdded: bnZero(),
      dpLevel: dpState.dpLevel,
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

  const dpMult = getDpMultiplier();
  
  if (dpMult instanceof BigNum && !dpMult.isZero?.()) {
      inc = inc.mulBigNumInteger ? inc.mulBigNumInteger(dpMult) : inc;
  }

  inc = applyStatMultiplierOverride('dp', inc);

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

  dpState.progress = dpState.progress.add(inc);
  updateDpRequirement();

  const isInfinite = (bn) => !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));

  const progressIsInf = isInfinite(dpState.progress);
  const levelIsInf = isInfinite(dpState.dpLevel);
  const gainIsInf = isInfinite(inc);

  if (progressIsInf || levelIsInf || gainIsInf) {
    const inf = BigNum.fromAny('Infinity');
    
    dpState.dpLevel = inf.clone?.() ?? inf;
    dpState.progress = inf.clone?.() ?? inf;
    
    updateDpRequirement();

    if (dpState.dpLevel.cmp?.(dpState.highestLevel) > 0) {
      dpState.highestLevel = dpState.dpLevel.clone?.() ?? dpState.dpLevel;
    }

    persistState();
    updateHud();

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
      try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'dp', delta: detail.dpAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  let dpLevelsGained = bnZero();

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
      try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'dp', delta: detail.dpAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  // Fast approximation if a large bulk was added
  const currentProgressLog = approxLog10(dpState.progress);
  const reqLog = approxLog10(requirementBn);
  
  if (currentProgressLog - reqLog > 2) {
    let currentLevelNum;
    try {
      currentLevelNum = Number(dpState.dpLevel.toPlainIntegerString?.() ?? dpState.dpLevel.toString());
    } catch {
      currentLevelNum = 0;
    }

    if (Number.isFinite(currentLevelNum)) {
      const getLogForLevel = (levelNum) => {
        let totalLog10 = 1 + (levelNum * Math.log10(1.5));
        const softcapStart = 1e12;
        if (levelNum > softcapStart) {
          const softcapDeltaNum = levelNum - softcapStart;
          const baseSoftcapLog = 5;
          const rate = 2.36034e-10;
          const penaltyLog10 = baseSoftcapLog * Math.exp(rate * softcapDeltaNum);
          if (!Number.isFinite(penaltyLog10) || penaltyLog10 >= 1.7976931348623157e+308) {
              return Number.POSITIVE_INFINITY;
          }
          totalLog10 += penaltyLog10;
        }
        return totalLog10;
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

      const estimatedGain = best - currentLevelNum;
      if (estimatedGain > 10) {
        const safeGain = Math.max(0, estimatedGain - 5);
        if (safeGain > 0 && safeGain <= Number.MAX_SAFE_INTEGER) {
          const safeGainBn = BigNum.fromAny(safeGain.toString());
          dpState.dpLevel = dpState.dpLevel.add(safeGainBn);
          dpLevelsGained = dpLevelsGained.add(safeGainBn);
          updateDpRequirement();
        }
      }
    }
  }

  let guard = 0;
  const limit = 500;
  
  while (dpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    dpState.progress = dpState.progress.sub(requirementBn);
    dpState.dpLevel = dpState.dpLevel.add(bnOne());
    dpLevelsGained = dpLevelsGained.add(bnOne());
    
    updateDpRequirement();
    
    guard += 1;
  }
  
  if (guard >= limit && dpState.progress.cmp(requirementBn) >= 0) {
      updateDpRequirement();
  }

  if (dpState.dpLevel.cmp?.(dpState.highestLevel) > 0) {
    dpState.highestLevel = dpState.dpLevel.clone?.() ?? dpState.dpLevel;
  }

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
    try { window.dispatchEvent(new CustomEvent('dp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'dp', delta: detail.dpAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'dp', level: detail.dpLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getDpProgressRatio() } })); } catch {}
  }
  return detail;
}

export function getDpState() {
  ensureStateLoaded();
  return {
    unlocked: dpState.unlocked,
    dpLevel: dpState.dpLevel.clone?.() ?? dpState.dpLevel,
    progress: dpState.progress.clone?.() ?? dpState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
    highestLevel: dpState.highestLevel.clone?.() ?? dpState.highestLevel,
  };
}

export function isDpSystemUnlocked() {
  ensureStateLoaded();
  return !!dpState.unlocked;
}

export function getDpRequirementForDpLevel(dpLevel) {
  return dpRequirementForDpLevel(dpLevel);
}

export function getHighestDpLevel() {
  ensureStateLoaded();
  return dpState.highestLevel;
}

if (typeof window !== 'undefined') {
  window.dpSystem = window.dpSystem || {};
  Object.assign(window.dpSystem, {
    addExternalDpMultiplierProvider,
    initDpSystem,
    unlockDpSystem,
    addDp,
    getDpState,
    isDpSystemUnlocked,
    getDpRequirementForDpLevel,
    resetDpProgress,
    getDpProgressRatio,
    getHighestDpLevel
  });
}
