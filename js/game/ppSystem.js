import { safeMultiplyBigNum } from './upgrades.js';
import { getBuildingLevel, getBuildingBonus } from '../ui/minerTabs/buildingsTab.js';
import { BigNum, approxLog10BigNum as approxLog10, bigNumFromLog10 } from '../util/bigNum.js';
import { getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { syncDpPpHudLayout } from '../ui/hudLayout.js';
import { applyStatMultiplierOverride } from '../util/debugPanel.js';





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
      targetLevel = Number(l.toString());
  } catch {}
  if (targetLevel < 0) return BigNum.fromInt(1000);
  let l = targetLevel;
  if (l >= 4e12) {
      const diff = l - 4e12;
      l += Math.pow(diff, 1.5) / 1e4;
  }
  return bigNumFromLog10(3 * (l + 1));
}

function updatePpRequirement() {
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
  } catch {
  }
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

function persistState() {
  const slot = getActiveSlot();
  if (slot == null) return;

  const expected = {
    [KEY_UNLOCK(slot)]: ppState.unlocked ? '1' : '0',
    [KEY_PP_LEVEL(slot)]: ppState.ppLevel.toString(),
    [KEY_PROGRESS(slot)]: ppState.progress.toString(),
  };

  try {
    for (const [key, value] of Object.entries(expected)) {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function ensurePpStorageWatchers() {}


function notifyPpSubscribers(detail) {}

function progressRatio(progress, requirement) { try { return progress.div(requirement).toNumber(); } catch { return 0; } }

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
    if (ppLevelValue) ppLevelValue.textContent = '0';
    if (progress) {
      const reqHtml = formatNumber(requirementBn);
      progress.innerHTML = `<span class="pp-progress-current">0</span><span class="pp-progress-separator">/</span><span class="pp-progress-required">${reqHtml}</span><span class="pp-progress-suffix">PP</span>`;
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
    ppLevelValue.textContent = formatNumber(ppState.ppLevel);
  }
  if (progress) {
    const currentHtml = formatNumber(ppState.progress);
    const reqHtml = formatNumber(requirementBn);
    progress.innerHTML = `<span class="pp-progress-current">${currentHtml}</span><span class="pp-progress-separator">/</span><span class="pp-progress-required">${reqHtml}</span><span class="pp-progress-suffix">PP</span>`;
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
  }
  persistState();
  updateHud();
  const detail = getPpState();
  try {
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
  const gainIsInf = isInfinite(inc);

  if (progressIsInf || levelIsInf || gainIsInf) {
    const inf = BigNum.fromAny('Infinity');
    
    ppState.ppLevel = inf.clone?.() ?? inf;
    ppState.progress = inf.clone?.() ?? inf;
    
    updatePpRequirement();

    }

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

  if (ppState.progress.cmp(requirementBn) < 0) {
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
      currentLevelNum = Number(ppState.ppLevel.toPlainIntegerString?.() ?? ppState.ppLevel.toString());
    } catch {
      currentLevelNum = 0;
    }

    if (Number.isFinite(currentLevelNum)) {
      const getLogForLevel = (levelNum) => {
        let l = levelNum;
        if (l >= 4e12) {
            const diff = l - 4e12;
            l += Math.pow(diff, 1.5) / 1e4;
        }
        return 3 * (l + 1);
      };

      let minAdd = 0;
      let maxAdd = 1000000;
      let bestAdd = -1;

      if (getLogForLevel(currentLevelNum + maxAdd) <= currentProgressLog) {
        while (getLogForLevel(currentLevelNum + maxAdd) <= currentProgressLog) {
            if (!Number.isFinite(getLogForLevel(currentLevelNum + maxAdd))) break;
            minAdd = maxAdd;
            maxAdd *= 2;
        }
      }

      while (minAdd <= maxAdd) {
        const mid = Math.floor((minAdd + maxAdd) / 2);
        if (getLogForLevel(currentLevelNum + mid) <= currentProgressLog) {
          bestAdd = mid;
          minAdd = mid + 1;
        } else {
          maxAdd = mid - 1;
        }
      }

      if (bestAdd > 0) {
        const safeGainStr = bestAdd.toString();
        let safeGainBn;
        try { safeGainBn = BigNum.fromAny(safeGainStr); } catch { safeGainBn = null; }
        if (safeGainBn) {
          ppState.ppLevel = ppState.ppLevel.add(safeGainBn);
          ppLevelsGained = ppLevelsGained.add(safeGainBn);
          updatePpRequirement();
        }
      }
    }
  }

  let guard = 0;
  const limit = 500;
  
  while (ppState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
    ppState.progress = ppState.progress.sub(requirementBn);
    ppState.ppLevel = ppState.ppLevel.add(bnOne());
    ppLevelsGained = ppLevelsGained.add(bnOne());
    
    updatePpRequirement();
    
    guard += 1;
  }
  
  if (guard >= limit && ppState.progress.cmp(requirementBn) >= 0) {
      updatePpRequirement();
  }

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

export function getPpState() {
  ensureStateLoaded();
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
