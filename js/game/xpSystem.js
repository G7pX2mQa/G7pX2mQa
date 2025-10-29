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
let highestCachedLevel = 0n;

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
  try {
    const sci = typeof bn.toScientific === 'function' ? bn.toScientific(6) : String(bn);
    if (!sci || sci === '0') return Number.NEGATIVE_INFINITY;
    if (sci === 'Infinity') return Number.POSITIVE_INFINITY;
    const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
    if (match) {
      const mant = parseFloat(match[1]);
      const exp = parseInt(match[2], 10) || 0;
      if (!(mant > 0) || !Number.isFinite(mant)) return Number.NEGATIVE_INFINITY;
      return Math.log10(mant) + exp;
    }
    const num = Number(sci);
    if (!Number.isFinite(num) || num <= 0) return Number.NEGATIVE_INFINITY;
    return Math.log10(num);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
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

  if (!levelPlain || levelPlain === 'Infinity') {
    return BigNum.fromAny('Infinity');
  }

  let targetLevel;
  try {
    targetLevel = BigInt(levelPlain);
  } catch {
    targetLevel = 0n;
  }

  if (targetLevel <= 0n) {
    const baseRequirement = xpRequirementCache.get('0');
    return baseRequirement.clone?.() ?? baseRequirement;
  }

  if (targetLevel > highestCachedLevel) {
    let currentLevel = highestCachedLevel;
    let currentRequirement = xpRequirementCache.get(currentLevel.toString());
    if (!currentRequirement) {
      currentRequirement = BigNum.fromInt(10);
      xpRequirementCache.set(currentLevel.toString(), currentRequirement);
    }

    while (currentLevel < targetLevel) {
      const nextLevel = currentLevel + 1n;
      let nextRequirement = currentRequirement.mulDecimalFloor('1.1');
      if (nextLevel > 1n && ((nextLevel - 1n) % 10n === 0n)) {
        nextRequirement = nextRequirement.mulDecimalFloor('2.5');
      }
      xpRequirementCache.set(nextLevel.toString(), nextRequirement);
      currentRequirement = nextRequirement;
      currentLevel = nextLevel;
    }
    highestCachedLevel = currentLevel;
  }

  const cached = xpRequirementCache.get(targetLevel.toString());
  if (cached) {
    return cached.clone?.() ?? cached;
  }

  return BigNum.fromInt(1);
}

function updateXpRequirement() {
  requirementBn = xpRequirementForXpLevel(xpState.xpLevel);
}

function resetLockedXpState() {
  xpState.xpLevel = bnZero();
  xpState.progress = bnZero();
  updateXpRequirement();
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
