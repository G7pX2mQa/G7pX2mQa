import { safeMultiplyBigNum } from './upgrades.js';
import { getBuildingLevel, getBuildingBonus } from '../ui/minerTabs/buildingsTab.js';
import { BigNum, bigNumIsInfinite, approxLog10BigNum as approxLog10, bigNumFromLog10 } from '../util/bigNum.js';
import { getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { syncDpPpHudLayout } from '../ui/hudLayout.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';
import { setHtmlOrText } from '../util/uiHelpers.js';

function isKeyLocked(key) {
  if (typeof window !== 'undefined' && window.__cccLockedStorageKeys) {
    return window.__cccLockedStorageKeys.has(key);
  }
  return false;
}

// Ensure it's available earlier
isKeyLocked.defined = true;

const KEY_UNLOCK = (slot) => `ccc:ppUnlocked:${slot}`;
const KEY_PP_LEVEL = (slot) => `ccc:ppLevel:${slot}`;
const KEY_PROGRESS = (slot) => `ccc:ppProgress:${slot}`;

const ppState = {
  unlocked: false,
  ppLevel: bnZero(),
  progress: bnZero(),
};

let stateLoaded = false;
let lastSlot = null;
let requirementBn = bnZero();

function bnZero() {
  return BigNum.fromInt(0);
}

function bnOne() {
  return BigNum.fromInt(1);
}

function ppRequirementForPpLevel(ppLevel) {
  let targetLevel = 0;
  try {
      let l = BigNum.fromAny(ppLevel ?? 0);
      targetLevel = l.inf ? Infinity : (l.sig * Math.pow(10, l.e));
  } catch {}
  if (targetLevel < 0) return BigNum.fromInt(1000);
  
  const numLevel = targetLevel;
  let totalLog10 = 3 * (numLevel + 1);

  const softcapStart = 1e12; // 1 Trillion
  if (numLevel > softcapStart) {
      const softcapDeltaNum = numLevel - softcapStart;
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

  return bigNumFromLog10(totalLog10);
}

function updatePpRequirement() {
  if (enforcePpInfinityInvariant()) return;
  requirementBn = ppRequirementForPpLevel(ppState.ppLevel);
}

function resetLockedPpState() {
  ppState.ppLevel = bnZero();
  ppState.progress = bnZero();
  updatePpRequirement();
}

function ensureStateLoaded(force = false) {
  const slot = getActiveSlot();
  if (slot == null) {
    lastSlot = null;
    stateLoaded = false;
    ppState.unlocked = false;
    resetLockedPpState();
    return ppState;
  }
  if (!force && stateLoaded && slot === lastSlot) return ppState;
  lastSlot = slot;
  stateLoaded = true;
  ppState.unlocked = false;
  try {
    const rawUnlocked = localStorage.getItem(KEY_UNLOCK(slot));
    if (rawUnlocked === '1') ppState.unlocked = true;
  } catch {}
  try {
    ppState.ppLevel = BigNum.fromAny(localStorage.getItem(KEY_PP_LEVEL(slot)) ?? '0');
  } catch {
    ppState.ppLevel = bnZero();
  }
  try {
    ppState.progress = BigNum.fromAny(localStorage.getItem(KEY_PROGRESS(slot)) ?? '0');
  } catch {
    ppState.progress = bnZero();
  }

  if (!ppState.unlocked) {
    resetLockedPpState();
    return ppState;
  }

  updatePpRequirement();
  ensurePpStorageWatchers();
  return ppState;
}

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;

  const expected = {
    [KEY_UNLOCK(slot)]: ppState.unlocked ? '1' : '0',
    [KEY_PP_LEVEL(slot)]: ppState.ppLevel.toStorage?.() ?? ppState.ppLevel.toString(),
    [KEY_PROGRESS(slot)]: ppState.progress.toStorage?.() ?? ppState.progress.toString(),
  };

  try {
    for (const [key, value] of Object.entries(expected)) {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function ensurePpStorageWatchers() {}


function notifyPpSubscribers(detail) {}

function progressRatio(progressBn, requirement) {
  if (!requirement || typeof requirement !== 'object') return 0;
  if (!progressBn || typeof progressBn !== 'object') return 0;

  const reqIsInf = !!(requirement.isInfinite?.() || (typeof requirement.isInfinite === 'function' && requirement.isInfinite()));
  const progIsInf = !!(progressBn.isInfinite?.() || (typeof progressBn.isInfinite === 'function' && progressBn.isInfinite()));

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
    return 0;
  }
  if (logReq < -20) return 1;
  const rawRatio = Math.pow(10, logProg - logReq);
  
  if (Number.isNaN(rawRatio)) return 0;
  return Math.max(0, Math.min(1, rawRatio));
}

let hudRefs = {};

function ensureHudRefs() {
  if (hudRefs.container) return true;
  if (typeof document === 'undefined') return false;
  hudRefs = {
    container: document.querySelector('[data-pp-hud]'),
    bar: document.querySelector('.pp-bar'),
    fill: document.querySelector('.pp-bar__fill'),
    ppLevelValue: document.querySelector('.pp-level-value'),
    progress: document.querySelector('[data-pp-progress]')
  };
  return !!hudRefs.container;
}

function updateHud() {
  if (!ensureHudRefs()) return;
  const { container, bar, fill, ppLevelValue, progress } = hudRefs;
  if (!container) return;
  
  const gameRoot = document.getElementById('game-root');
  const isCavern = gameRoot && gameRoot.classList.contains('area-cavern');
  
  if (!isCavern && !container.closest('.area-cavern')) {
    container.setAttribute('hidden', '');
    syncDpPpHudLayout();
    return;
  }
  
  if (!ppState.unlocked) {
    container.setAttribute('hidden', '');
    if (fill) {
      fill.style.setProperty('--pp-fill', '0%');
      fill.style.width = '0%';
    }
    if (ppLevelValue) setHtmlOrText(ppLevelValue, '0');
    if (progress) {
      const reqHtml = formatNumber(requirementBn);
      setHtmlOrText(progress, `<span class="pp-progress-current">0</span><span class="pp-progress-separator">/</span><span class="pp-progress-required">${reqHtml}</span><span class="pp-progress-suffix">PP</span>`);
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', '0');
      const reqPlain = requirementBn ? requirementBn.toString() : '10';
      bar.setAttribute('aria-valuetext', `0 / ${reqPlain} PP`);
    }
    syncDpPpHudLayout();
    return;
  }
  
  container.removeAttribute('hidden');
  const ratio = progressRatio(ppState.progress, requirementBn);
  const pct = Math.min(100, Math.max(0, ratio * 100));
  if (fill) {
    fill.style.setProperty('--pp-fill', `${pct}%`);
    fill.style.width = `${pct}%`;
  }
  if (ppLevelValue) {
    setHtmlOrText(ppLevelValue, formatNumber(ppState.ppLevel));
  }
  if (progress) {
    const currentHtml = formatNumber(ppState.progress);
    const reqHtml = formatNumber(requirementBn);
    setHtmlOrText(progress, `<span class="pp-progress-current">${currentHtml}</span><span class="pp-progress-separator">/</span><span class="pp-progress-required">${reqHtml}</span><span class="pp-progress-suffix">PP</span>`);
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', pct.toString());
    const currPlain = ppState.progress ? ppState.progress.toString() : '0';
    const reqPlain = requirementBn ? requirementBn.toString() : '10';
    bar.setAttribute('aria-valuetext', `${currPlain} / ${reqPlain} PP`);
  }
  syncDpPpHudLayout();
}

const externalPpMultiplierProviders = [];
export function addExternalPpMultiplierProvider(fn) {
  if (typeof fn === 'function') externalPpMultiplierProviders.push(fn);
}

export function initPpSystem(forceReload = false) {
  ensureHudRefs();
  ensureStateLoaded(forceReload);
  updatePpRequirement();
  updateHud();
  ensurePpStorageWatchers();
  return getPpState();
}

export function resetPpProgress({ keepUnlock = true } = {}) {
  ensureStateLoaded();
  const wasUnlocked = ppState.unlocked;
  resetLockedPpState();
  ppState.unlocked = keepUnlock ? (wasUnlocked || ppState.unlocked) : false;
  persistState();
  updateHud();
  const detail = getPpState();
  try {
    window.dispatchEvent(new CustomEvent('pp:change', { detail }));
    window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } }));
  } catch {}
  return detail;
}

export function getPpProgressRatio() {
  ensureStateLoaded();
  return progressRatio(ppState.progress, requirementBn);
}

export function getPpMultiplier() {
  let ppMult = BigNum.fromInt(1);
  for (const provider of externalPpMultiplierProviders) {
    try {
      const val = provider(ppMult);
      if (val instanceof BigNum) {
        ppMult = val;
      } else if (val) {
        ppMult = ppMult.mulBigNumInteger(BigNum.fromAny(val));
      }
    } catch {}
  }
  return ppMult;
}

export function addPp(amount, { silent = false } = {}) {
  ensureStateLoaded();
  const slot = lastSlot ?? getActiveSlot();

  if (slot != null && isKeyLocked(KEY_PROGRESS(slot))) {
    return {
      unlocked: ppState.unlocked,
      ppLevelsGained: bnZero(),
      ppAdded: bnZero(),
      ppLevel: ppState.ppLevel,
      progress: ppState.progress,
      requirement: requirementBn,
      slot
    };
  }

  const wasLevelInf = !!(ppState.ppLevel?.isInfinite?.() || (typeof ppState.ppLevel?.isInfinite === 'function' && ppState.ppLevel.isInfinite()));
  const wasProgInf = !!(ppState.progress?.isInfinite?.() || (typeof ppState.progress?.isInfinite === 'function' && ppState.progress.isInfinite()));

  if (wasLevelInf && wasProgInf) {
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
    
    if (!inc.isZero?.()) {
      try { window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'pp', delta: inc, progress: ppState.progress } })); } catch {}
    }

    return {
      unlocked: true,
      ppLevelsGained: bnZero(),
      ppAdded: inc,
      ppLevel: ppState.ppLevel,
      progress: ppState.progress,
      requirement: requirementBn,
      slot
    };
  }

  if (!ppState.unlocked) {
    return {
      unlocked: false,
      ppLevelsGained: bnZero(),
      ppAdded: bnZero(),
      ppLevel: ppState.ppLevel,
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

  const ppMult = getPpMultiplier();
  
  if (ppMult instanceof BigNum && !ppMult.isZero?.()) {
      inc = inc.mulBigNumInteger ? inc.mulBigNumInteger(ppMult) : inc;
  }

  inc = applyStatMultiplierOverride('pp', inc);

  if (inc.isZero?.() || (typeof inc.isZero === 'function' && inc.isZero())) {
    updateHud();
    return {
      unlocked: true,
      ppLevelsGained: bnZero(),
      ppAdded: inc,
      ppLevel: ppState.ppLevel,
      requirement: requirementBn
    };
  }

  ppState.progress = ppState.progress.add(inc);
  updatePpRequirement();

  const isInfinite = (bn) => !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));

  const progressIsInf = isInfinite(ppState.progress);
  const levelIsInf = isInfinite(ppState.ppLevel);

  const justBecameInf = (levelIsInf && !wasLevelInf) || (progressIsInf && !wasProgInf);
  
  if (justBecameInf) {
    enforcePpInfinityInvariant();
    persistState();
    updateHud();

    const detail = {
      unlocked: true,
      ppLevelsGained: bnZero(),
      ppAdded: inc.clone?.() ?? inc,
      ppLevel: ppState.ppLevel.clone?.() ?? ppState.ppLevel,
      progress: ppState.progress.clone?.() ?? ppState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn,
      slot,
    };
    notifyPpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('pp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'pp', delta: detail.ppAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  let ppLevelsGained = bnZero();

  if (isInfinite(requirementBn) || ppState.progress.cmp(requirementBn) < 0) {
    persistState();
    updateHud();
    const detail = {
      unlocked: true,
      ppLevelsGained: bnZero(),
      ppAdded: inc,
      ppLevel: ppState.ppLevel,
      progress: ppState.progress,
      requirement: requirementBn,
      slot,
    };
    notifyPpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('pp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'pp', delta: detail.ppAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  // Fast approximation if a large bulk was added
  const currentProgressLog = approxLog10(ppState.progress);
  const reqLog = approxLog10(requirementBn);
  
  if (currentProgressLog - reqLog > 2) {
    let currentLevelNum;
    try {
      currentLevelNum = bigNumIsInfinite(ppState.ppLevel) ? Infinity : (ppState.ppLevel.sig * Math.pow(10, ppState.ppLevel.e));
    } catch {
      currentLevelNum = 0;
    }

    if (Number.isFinite(currentLevelNum)) {
      const getLogForLevel = (levelNum) => {
        let totalLog10 = 3 * (levelNum + 1);
        const softcapStart = 1e12; // 1 Trillion
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
        if (midLog === Number.POSITIVE_INFINITY) break;
      }

      const estimatedGain = best - currentLevelNum;
      if (estimatedGain > 10) {
        const safeGain = Math.max(0, estimatedGain - 5);
        if (safeGain > 0 && safeGain <= Number.MAX_SAFE_INTEGER) {
          const levelLocked = slot != null && isKeyLocked(KEY_PP_LEVEL(slot));
          if (!levelLocked) {
            const safeGainBn = BigNum.fromAny(safeGain.toString());
            ppState.ppLevel = ppState.ppLevel.add(safeGainBn);
            ppLevelsGained = ppLevelsGained.add(safeGainBn);
            updatePpRequirement();
          }
        }
      }
    }
  }

  let guard = 0;
  const limit = 500;
  
  while (ppState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    if (isInfinite(requirementBn) || isInfinite(ppState.progress)) break;
    const levelLocked = slot != null && isKeyLocked(KEY_PP_LEVEL(slot));
    if (levelLocked) break;
    ppState.progress = ppState.progress.sub(requirementBn);
    ppState.ppLevel = ppState.ppLevel.add(bnOne());
    ppLevelsGained = ppLevelsGained.add(bnOne());
    
    updatePpRequirement();
    
    guard += 1;
  }
  
  if (guard >= limit && ppState.progress.cmp(requirementBn) >= 0) {
      updatePpRequirement();
  }

  if (enforcePpInfinityInvariant()) {
    persistState();
    updateHud();

    const detail = {
      unlocked: true,
      ppLevelsGained: ppLevelsGained.clone?.() ?? ppLevelsGained,
      ppAdded: inc.clone?.() ?? inc,
      ppLevel: ppState.ppLevel.clone?.() ?? ppState.ppLevel,
      progress: ppState.progress.clone?.() ?? ppState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn,
      slot,
    };
    notifyPpSubscribers(detail);
    if (!silent && typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('pp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'pp', delta: detail.ppAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } })); } catch {}
    }
    return detail;
  }

  persistState();
  updateHud();

  const detail = {
    unlocked: true,
    ppLevelsGained: ppLevelsGained.clone?.() ?? ppLevelsGained,
    ppAdded: inc.clone?.() ?? inc,
    ppLevel: ppState.ppLevel.clone?.() ?? ppState.ppLevel,
    progress: ppState.progress.clone?.() ?? ppState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
    slot,
  };
  
  notifyPpSubscribers(detail);
  if (!silent && typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('pp:change', { detail })); window.dispatchEvent(new CustomEvent('stat:change', { detail: { key: 'pp', delta: detail.ppAdded, progress: detail.progress } })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } })); } catch {}
  }
  return detail;
}


function enforcePpInfinityInvariant() {
  const isInfinite = (bn) => !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));
  const levelIsInf = isInfinite(ppState.ppLevel);
  const progIsInf = isInfinite(ppState.progress);
  if (!levelIsInf && !progIsInf) return false;

  const inf = BigNum.fromAny('Infinity');
  const slot = ppState.slot ?? getActiveSlot();
  const levelLocked = slot != null && isKeyLocked(KEY_PP_LEVEL(slot));
  const progressLocked = slot != null && isKeyLocked(KEY_PROGRESS(slot));

  let fullyInf = true;

  if (!levelLocked) {
    ppState.ppLevel = inf.clone?.() ?? inf;
  } else if (!isInfinite(ppState.ppLevel)) {
    fullyInf = false;
  }
  
  if (!progressLocked) {
    ppState.progress = inf.clone?.() ?? inf;
  }
  
  if (fullyInf) {
    requirementBn = inf.clone?.() ?? inf;
  }
  return fullyInf;
}

export function getPpState() {
  ensureStateLoaded();
  const slot = ppState.slot ?? getActiveSlot();
  const levelLocked = slot != null && isKeyLocked(KEY_PP_LEVEL(slot));
  if (!levelLocked && typeof ppState.ppLevel?.cmp === 'function' && ppState.ppLevel.cmp(4500000000000) >= 0 && !ppState.ppLevel.isInfinite?.()) {
    ppState.ppLevel = BigNum.fromAny('Infinity');
  }
  enforcePpInfinityInvariant();
  return {
    unlocked: ppState.unlocked,
    ppLevel: ppState.ppLevel.clone?.() ?? ppState.ppLevel,
    progress: ppState.progress.clone?.() ?? ppState.progress,
    requirement: requirementBn.clone?.() ?? requirementBn,
  };
}

export function isPpSystemUnlocked() {
  ensureStateLoaded();
  return !!ppState.unlocked;
}

export function getPpRequirementForPpLevel(ppLevel) {
  return ppRequirementForPpLevel(ppLevel);
}

export function unlockPpSystem() {
  ensureStateLoaded();
  if (ppState.unlocked) {
    updateHud();
    return false;
  }
  resetLockedPpState();
  ppState.unlocked = true;
  persistState();
  updateHud();
  const detail = getPpState();
  try { window.dispatchEvent(new CustomEvent('pp:unlock', { detail })); window.dispatchEvent(new CustomEvent('level:change', { detail: { prefix: 'pp', level: detail.ppLevel, progress: detail.progress, requirement: detail.requirement, isUnlocked: detail.unlocked, ratio: getPpProgressRatio() } })); } catch {}
  return true;
}


if (typeof window !== 'undefined') {
  window.ppSystem = window.ppSystem || {};
  Object.assign(window.ppSystem, {
    addExternalPpMultiplierProvider,
    getPpMultiplier,
    initPpSystem,
    unlockPpSystem,
    addPp,
    getPpState,
    isPpSystemUnlocked,
    getPpRequirementForPpLevel,
    resetPpProgress,
    getPpProgressRatio
  });
}
