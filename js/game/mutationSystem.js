// js/game/mutationSystem.js

import { BigNum } from '../util/bigNum.js';
import {
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
} from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { approxLog10BigNum, bigNumFromLog10 } from './upgrades.js';
import { syncXpMpHudLayout } from '../ui/hudLayout.js';
import {
  addExternalCoinMultiplierProvider,
  addExternalXpGainMultiplierProvider,
  refreshCoinMultiplierFromXpLevel,
} from './xpSystem.js';

const KEY_PREFIX = 'ccc:mutation';
const KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
const KEY_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
const KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;

const BN = BigNum;
const bnZero = () => BN.fromInt(0);
const bnOne = () => BN.fromInt(1);

const MP_LOG10_BASE = Math.log10(2);
const CONST_RATIO = (10 - 1) / (Math.pow(1.12, 50) - 1);

const mutationState = {
  unlocked: false,
  level: bnZero(),
  progress: bnZero(),
  requirement: bnZero(),
  slot: null,
};

const hudRefs = {
  container: null,
  bar: null,
  fill: null,
  levelValue: null,
  progress: null,
};

const listeners = new Set();
const watcherCleanups = [];
let watchersBoundSlot = null;
let initialized = false;
let unregisterCoinMultiplierProvider = null;
let unregisterXpGainMultiplierProvider = null;

function scheduleCoinMultiplierRefresh() {
  try { refreshCoinMultiplierFromXpLevel(); } catch {}
}

function ensureExternalMultiplierProviders() {
  if (!unregisterCoinMultiplierProvider && typeof addExternalCoinMultiplierProvider === 'function') {
    try {
      unregisterCoinMultiplierProvider = addExternalCoinMultiplierProvider(({ baseMultiplier, xpUnlocked }) => {
        if (!xpUnlocked) return baseMultiplier;
        initMutationSystem();
        if (!mutationState.unlocked) return baseMultiplier;
        const mut = getMutationMultiplier();
        if (!mut || mut.isZero?.()) return baseMultiplier;
        try {
          const source = baseMultiplier instanceof BN
            ? baseMultiplier.clone?.() ?? baseMultiplier
            : BigNum.fromAny(baseMultiplier ?? 0);
          return source.mulBigNumInteger(mut);
        } catch {
          return baseMultiplier;
        }
      });
    } catch { unregisterCoinMultiplierProvider = null; }
  }
  if (!unregisterXpGainMultiplierProvider && typeof addExternalXpGainMultiplierProvider === 'function') {
    try {
      unregisterXpGainMultiplierProvider = addExternalXpGainMultiplierProvider(({ baseGain, xpUnlocked }) => {
        if (!xpUnlocked) return baseGain;
        initMutationSystem();
        if (!mutationState.unlocked) return baseGain;
        const mut = getMutationMultiplier();
        if (!mut || mut.isZero?.()) return baseGain;
        try {
          const source = baseGain instanceof BN
            ? baseGain.clone?.() ?? baseGain
            : BigNum.fromAny(baseGain ?? 0);
          return source.mulBigNumInteger(mut);
        } catch {
          return baseGain;
        }
      });
    } catch { unregisterXpGainMultiplierProvider = null; }
  }
}

function cloneBigNum(value) {
  if (value instanceof BN) {
    try { return value.clone?.() ?? BN.fromAny(value); }
    catch { return bnZero(); }
  }
  try { return BN.fromAny(value ?? 0); }
  catch { return bnZero(); }
}

function quantizeRequirement(value) {
  if (!value || typeof value !== 'object') return bnZero();
  if (value.isInfinite?.()) return value.clone?.() ?? value;
  const sci = typeof value.toScientific === 'function' ? value.toScientific(18) : '';
  if (!sci || sci === 'Infinity') return value.clone?.() ?? value;
  const match = sci.match(/^(\d+(?:\.\d+)?)e([+-]?\d+)$/i);
  if (!match) return value.clone?.() ?? value;
  const exp = parseInt(match[2], 10);
  const digits = exp + 1;
  if (digits <= 18) {
    const floored = value.floorToInteger?.() ?? value.clone?.() ?? value;
    const plain = floored.toPlainIntegerString?.();
    if (!plain || plain === 'Infinity') return floored;
    try {
      const quant = (BigInt(plain) / 100n) * 100n;
      if (quant <= 0n) return BN.fromInt(100);
      return BN.fromAny(quant.toString());
    } catch {
      return floored;
    }
  }
  return value.clone?.() ?? value;
}

function levelToNumber(level) {
  if (!level || typeof level !== 'object') return 0;
  if (level.isInfinite?.()) return Number.POSITIVE_INFINITY;
  try {
    const plain = level.toPlainIntegerString?.();
    if (plain && plain !== 'Infinity' && plain.length <= 15) {
      const num = Number(plain);
      if (Number.isFinite(num)) return num;
    }
  } catch {}
  const approxLog = approxLog10BigNum(level);
  if (!Number.isFinite(approxLog)) return Number.POSITIVE_INFINITY;
  if (approxLog > 308) return Number.POSITIVE_INFINITY;
  return Math.pow(10, approxLog);
}

function computeRequirement(levelBn) {
  const levelNum = levelToNumber(levelBn);
  if (!Number.isFinite(levelNum)) {
    return BN.fromAny('Infinity');
  }
  const m = Math.max(0, levelNum + 1);
  const tail = Math.max(0, m - 10);
  const poly = -0.0022175354763501742 * m * m
    + 0.20449967884058884 * m
    + 2.016778189084622
    + 0.20418426693226513 * Math.pow(tail, 1.6418337930413576);
  if (!Number.isFinite(poly)) {
    return BN.fromAny('Infinity');
  }
  let factor = 1;
  if (m > 10) {
    const powTerm = Math.pow(1.12, m - 10);
    if (!Number.isFinite(powTerm)) {
      return BN.fromAny('Infinity');
    }
    factor += CONST_RATIO * (powTerm - 1);
    if (!Number.isFinite(factor)) {
      return BN.fromAny('Infinity');
    }
  }
  const totalLog10 = poly * factor;
  if (!Number.isFinite(totalLog10)) {
    return BN.fromAny('Infinity');
  }
  const raw = bigNumFromLog10(totalLog10);
  return quantizeRequirement(raw);
}

function ensureRequirement() {
  const req = computeRequirement(mutationState.level);
  mutationState.requirement = req;
}

function progressRatio(progressBn, requirement) {
  if (!requirement || typeof requirement !== 'object') return 0;
  const reqInf = requirement.isInfinite?.();
  if (reqInf) return 0;
  const reqZero = requirement.isZero?.();
  if (reqZero) return 0;
  if (!progressBn || typeof progressBn !== 'object') return 0;
  const progZero = progressBn.isZero?.();
  if (progZero) return 0;
  const logProg = approxLog10BigNum(progressBn);
  const logReq = approxLog10BigNum(requirement);
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
  hudRefs.container = document.querySelector('[data-mp-hud].mp-counter');
  if (!hudRefs.container) return false;
  hudRefs.bar = hudRefs.container.querySelector('.mp-bar');
  hudRefs.fill = hudRefs.container.querySelector('.mp-bar__fill');
  hudRefs.levelValue = hudRefs.container.querySelector('.mp-level-value');
  hudRefs.progress = hudRefs.container.querySelector('[data-mp-progress]');
  return true;
}

function formatBn(bn) {
  try { return formatNumber(bn); }
  catch {
    try { return bn.toPlainIntegerString?.() ?? String(bn); }
    catch { return '0'; }
  }
}

function updateHud() {
  if (!ensureHudRefs()) return;
  const { container, bar, fill, levelValue, progress } = hudRefs;
  if (!container) return;
  if (!mutationState.unlocked) {
    container.setAttribute('hidden', '');
    if (fill) {
      fill.style.setProperty('--mp-fill', '0%');
      fill.style.width = '0%';
    }
    if (levelValue) levelValue.textContent = '0';
    if (progress) {
      const reqHtml = formatBn(mutationState.requirement);
      progress.innerHTML = `0<span class="mp-progress-separator">/</span><span class="mp-progress-required">${reqHtml}</span><span class="mp-progress-suffix">MP</span>`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', '0');
      const reqPlain = formatBn(mutationState.requirement).replace(/<[^>]*>/g, '');
      bar.setAttribute('aria-valuetext', `0 / ${reqPlain || '10'} MP`);
    }
    syncXpMpHudLayout();
    return;
  }

  container.removeAttribute('hidden');
  const req = mutationState.requirement;
  const ratio = progressRatio(mutationState.progress, req);
  const pct = `${(ratio * 100).toFixed(2)}%`;
  if (fill) {
    fill.style.setProperty('--mp-fill', pct);
    fill.style.width = pct;
  }
  if (levelValue) {
    levelValue.innerHTML = formatBn(mutationState.level);
  }
  if (progress) {
    const currentHtml = formatBn(mutationState.progress);
    const reqHtml = formatBn(req);
    progress.innerHTML = `<span class="mp-progress-current">${currentHtml}</span><span class="mp-progress-separator">/</span><span class="mp-progress-required">${reqHtml}</span><span class="mp-progress-suffix">MP</span>`;
  }
  if (bar) {
    bar.setAttribute('aria-valuenow', (ratio * 100).toFixed(2));
    const currPlain = formatBn(mutationState.progress).replace(/<[^>]*>/g, '');
    const reqPlain = formatBn(req).replace(/<[^>]*>/g, '');
    bar.setAttribute('aria-valuetext', `${currPlain} / ${reqPlain} MP`);
  }
  syncXpMpHudLayout();
}

function emitChange(reason = 'update') {
  const snapshot = getMutationState();
  listeners.forEach((cb) => {
    try { cb(snapshot, reason); } catch {}
  });
}

function persistState() {
  let slot = mutationState.slot;
  if (slot == null) {
    slot = getActiveSlot();
    if (slot != null) {
      mutationState.slot = slot;
    }
  }
  if (slot == null) return;
  try { localStorage.setItem(KEY_UNLOCK(slot), mutationState.unlocked ? '1' : '0'); }
  catch {}
  try { localStorage.setItem(KEY_LEVEL(slot), mutationState.level.toStorage()); }
  catch {}
  try { localStorage.setItem(KEY_PROGRESS(slot), mutationState.progress.toStorage()); }
  catch {}
  primeStorageWatcherSnapshot(KEY_UNLOCK(slot));
  primeStorageWatcherSnapshot(KEY_LEVEL(slot));
  primeStorageWatcherSnapshot(KEY_PROGRESS(slot));
}

function normalizeProgress() {
  if (!mutationState.unlocked) return;
  ensureRequirement();
  let currentReq = mutationState.requirement;
  if (!currentReq || typeof currentReq !== 'object') return;
  if (currentReq.isInfinite?.()) {
    mutationState.progress = bnZero();
    return;
  }
  let guard = 0;
  const limit = 100000;
  while (mutationState.progress.cmp?.(currentReq) >= 0 && guard < limit) {
    mutationState.progress = mutationState.progress.sub(currentReq);
    mutationState.level = mutationState.level.add(bnOne());
    ensureRequirement();
    currentReq = mutationState.requirement;
    if (!currentReq || typeof currentReq !== 'object') {
      mutationState.progress = bnZero();
      break;
    }
    if (currentReq.isInfinite?.()) {
      mutationState.progress = bnZero();
      break;
    }
    guard += 1;
  }
  if (guard >= limit) {
    mutationState.progress = bnZero();
  }
}

function applyState(newState, { skipPersist = false } = {}) {
  mutationState.unlocked = !!newState.unlocked;
  mutationState.level = cloneBigNum(newState.level);
  mutationState.progress = cloneBigNum(newState.progress);
  ensureRequirement();
  if (!mutationState.unlocked) {
    mutationState.progress = bnZero();
  }
  if (!skipPersist) persistState();
  updateHud();
  emitChange('load');
  scheduleCoinMultiplierRefresh();
}

function readStateFromStorage(slot) {
  const targetSlot = slot ?? getActiveSlot();
  if (targetSlot == null) {
    applyState({ unlocked: false, level: bnZero(), progress: bnZero() }, { skipPersist: true });
    mutationState.slot = null;
    return;
  }
  let unlocked = false;
  let level = bnZero();
  let progress = bnZero();
  try { unlocked = localStorage.getItem(KEY_UNLOCK(targetSlot)) === '1'; }
  catch {}
  try {
    const rawLvl = localStorage.getItem(KEY_LEVEL(targetSlot));
    if (rawLvl) level = BN.fromAny(rawLvl);
  } catch {}
  try {
    const rawProg = localStorage.getItem(KEY_PROGRESS(targetSlot));
    if (rawProg) progress = BN.fromAny(rawProg);
  } catch {}
  applyState({ unlocked, level, progress }, { skipPersist: true });
  mutationState.slot = targetSlot;
}

function cleanupWatchers() {
  while (watcherCleanups.length) {
    const stop = watcherCleanups.pop();
    try { stop?.(); } catch {}
  }
}

function bindStorageWatchers(slot) {
  if (watchersBoundSlot === slot) return;
  cleanupWatchers();
  watchersBoundSlot = slot;
  if (slot == null) return;
  watcherCleanups.push(watchStorageKey(KEY_UNLOCK(slot), {
    onChange(value) {
      const nextUnlocked = value === '1';
      if (mutationState.unlocked !== nextUnlocked) {
        mutationState.unlocked = nextUnlocked;
        if (!nextUnlocked) {
          mutationState.progress = bnZero();
        }
        ensureRequirement();
        updateHud();
        emitChange('storage');
        scheduleCoinMultiplierRefresh();
      }
    },
  }));
  watcherCleanups.push(watchStorageKey(KEY_LEVEL(slot), {
    onChange(value) {
      if (!value) return;
      try {
        const next = BN.fromAny(value);
        if (mutationState.level.cmp?.(next) !== 0) {
          mutationState.level = next;
          ensureRequirement();
          updateHud();
          emitChange('storage');
          scheduleCoinMultiplierRefresh();
        }
      } catch {}
    },
  }));
  watcherCleanups.push(watchStorageKey(KEY_PROGRESS(slot), {
    onChange(value) {
      if (!value) return;
      try {
        const next = BN.fromAny(value);
        if (mutationState.progress.cmp?.(next) !== 0) {
          mutationState.progress = next;
          ensureRequirement();
          updateHud();
          emitChange('storage');
        }
      } catch {}
    },
  }));
}

export function initMutationSystem() {
  ensureExternalMultiplierProviders();
  if (initialized) {
    ensureHudRefs();
    updateHud();
    return getMutationState();
  }
  initialized = true;
  ensureHudRefs();
  const slot = getActiveSlot();
  mutationState.slot = slot;
  readStateFromStorage(slot);
  bindStorageWatchers(slot);
  updateHud();
  scheduleCoinMultiplierRefresh();
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      const nextSlot = getActiveSlot();
      mutationState.slot = nextSlot;
      readStateFromStorage(nextSlot);
      bindStorageWatchers(nextSlot);
      updateHud();
      scheduleCoinMultiplierRefresh();
      emitChange('slot');
    });
  }
  return getMutationState();
}

export function getMutationState() {
  return {
    unlocked: mutationState.unlocked,
    level: cloneBigNum(mutationState.level),
    progress: cloneBigNum(mutationState.progress),
    requirement: cloneBigNum(mutationState.requirement),
  };
}

export function isMutationUnlocked() {
  return !!mutationState.unlocked;
}

export function unlockMutationSystem() {
  initMutationSystem();
  if (mutationState.unlocked) return false;
  mutationState.unlocked = true;
  ensureRequirement();
  persistState();
  updateHud();
  emitChange('unlock');
  scheduleCoinMultiplierRefresh();
  return true;
}

export function addMutationPower(amount) {
  initMutationSystem();
  if (!mutationState.unlocked) return getMutationState();
  let inc;
  try {
    inc = amount instanceof BN ? amount : BN.fromAny(amount ?? 0);
  } catch {
    inc = bnZero();
  }
  if (inc.isZero?.()) return getMutationState();
  const incClone = inc.clone?.() ?? inc;
  const prevLevel = mutationState.level.clone?.() ?? mutationState.level;
  const prevProgress = mutationState.progress.clone?.() ?? mutationState.progress;
  mutationState.progress = mutationState.progress.add(incClone);
  normalizeProgress();
  persistState();
  updateHud();
  emitChange('progress');
  const levelsGained = mutationState.level.sub(prevLevel);
  if (!levelsGained.isZero?.()) {
    scheduleCoinMultiplierRefresh();
  }
  if (typeof window !== 'undefined') {
    const detail = {
      delta: incClone.clone?.() ?? incClone,
      levelsGained: levelsGained.clone?.() ?? levelsGained,
      level: mutationState.level.clone?.() ?? mutationState.level,
      progress: mutationState.progress.clone?.() ?? mutationState.progress,
      requirement: mutationState.requirement.clone?.() ?? mutationState.requirement,
      previousLevel: prevLevel.clone?.() ?? prevLevel,
      previousProgress: prevProgress.clone?.() ?? prevProgress,
    };
    try { window.dispatchEvent(new CustomEvent('mutation:change', { detail })); } catch {}
  }
  return getMutationState();
}

export function getMutationMultiplier() {
  initMutationSystem();
  if (!mutationState.unlocked) return bnOne();
  const levelNum = levelToNumber(mutationState.level);
  if (!Number.isFinite(levelNum)) return BN.fromAny('Infinity');
  if (levelNum <= 0) return bnOne();
  const log10 = levelNum * MP_LOG10_BASE;
  return bigNumFromLog10(log10);
}

export function getMutationCoinSprite() {
  if (!mutationState.unlocked || mutationState.level.isZero?.()) {
    return 'img/currencies/coin/coin.png';
  }

  const levelNum = levelToNumber(mutationState.level);
  if (!Number.isFinite(levelNum)) {
    return 'img/mutations/m25.png';
  }
  const idx = Math.max(1, Math.min(25, Math.floor(levelNum)));

  return `img/mutations/m${idx}.png`;
}


export function onMutationChange(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

if (typeof window !== 'undefined') {
  window.mutationSystem = window.mutationSystem || {};
  Object.assign(window.mutationSystem, {
    initMutationSystem,
    unlockMutationSystem,
    addMutationPower,
    getMutationState,
    getMutationMultiplier,
    isMutationUnlocked,
  });
}
