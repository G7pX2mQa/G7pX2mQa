// js/game/resetSystem.js

import { BigNum } from '../util/bigNum.js';
import {
  bank,
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
  onCurrencyChange,
  CURRENCIES,
} from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import {
  getXpState,
  resetXpProgress,
  onXpChange,
} from './xpSystem.js';
import {
  AREA_KEYS,
  UPGRADE_TIES,
  getUpgradesForArea,
  getLevelNumber,
  setLevel,
  approxLog10BigNum,
  bigNumFromLog10,
} from './upgrades.js';
import {
  initMutationSystem,
  unlockMutationSystem,
  isMutationUnlocked,
  getMutationCoinSprite,
  onMutationChange,
} from './mutationSystem.js';

const BN = BigNum;
const bnZero = () => BN.fromInt(0);
const bnOne = () => BN.fromInt(1);

const GOLD_ICON_SRC = 'img/currencies/gold/gold.png';
const RESET_ICON_SRC = 'img/misc/forge.png';

const FORGE_UNLOCK_KEY = (slot) => `ccc:reset:forge:${slot}`;
const FORGE_COMPLETED_KEY = (slot) => `ccc:reset:forge:completed:${slot}`;

const MIN_FORGE_LEVEL = BN.fromInt(31);

const resetState = {
  slot: null,
  forgeUnlocked: false,
  hasDoneForgeReset: false,
  pendingGold: bnZero(),
  panel: null,
  pendingEl: null,
  requirementEl: null,
  actionBtn: null,
  statusEl: null,
  layerButtons: {},
};

const watchers = [];
let watchersBoundSlot = null;
let initialized = false;
let mutationUnsub = null;
let pendingGoldInputSignature = null;
let coinChangeUnsub = null;
let xpChangeUnsub = null;
function resetPendingGoldSignature() {
  pendingGoldInputSignature = null;
}

function cleanupWatchers() {
  while (watchers.length) {
    const stop = watchers.pop();
    try { stop?.(); } catch {}
  }
}

function ensureValueListeners() {
  if (!coinChangeUnsub && typeof onCurrencyChange === 'function') {
    coinChangeUnsub = onCurrencyChange((detail = {}) => {
      if (detail?.key && detail.key !== CURRENCIES.COINS) return;
      if (detail?.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
      recomputePendingGold();
    });
  }
  if (!xpChangeUnsub && typeof onXpChange === 'function') {
    xpChangeUnsub = onXpChange((detail = {}) => {
      if (detail?.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
      recomputePendingGold();
      updateResetPanel();
    });
  }
}

function levelToNumber(levelBn) {
  if (!levelBn || typeof levelBn !== 'object') return 0;
  if (levelBn.isInfinite?.()) return Number.POSITIVE_INFINITY;
  try {
    const plain = levelBn.toPlainIntegerString?.();
    if (plain && plain !== 'Infinity' && plain.length <= 15) {
      const num = Number(plain);
      if (Number.isFinite(num)) return num;
    }
  } catch {}
  const approx = approxLog10BigNum(levelBn);
  if (!Number.isFinite(approx)) return Number.POSITIVE_INFINITY;
  if (approx > 308) return Number.POSITIVE_INFINITY;
  return Math.pow(10, approx);
}

function getXpLevelBn() {
  try {
    const state = getXpState();
    if (state && state.xpLevel) return state.xpLevel;
  } catch {}
  return bnZero();
}

function computeForgeGold(coinsBn, levelBn) {
  if (!coinsBn || typeof coinsBn !== 'object') return bnZero();
  if (coinsBn.isZero?.()) return bnZero();
  const logCoins = approxLog10BigNum(coinsBn);
  if (!Number.isFinite(logCoins)) {
    return logCoins > 0 ? BN.fromAny('Infinity') : bnZero();
  }
  const logScaled = logCoins - 5;
  if (!Number.isFinite(logScaled)) return bnZero();
  const pow2 = bigNumFromLog10(logScaled * Math.log10(2));
  const levelNum = Math.max(0, levelToNumber(levelBn));
  const levelFactor = Math.max(0, (levelNum - 30) / 5);
  const pow14 = levelFactor <= 0
    ? bnOne()
    : bigNumFromLog10(levelFactor * Math.log10(1.4));
  const floorLog = Math.floor(logScaled);
  const pow115 = floorLog <= 0
    ? bnOne()
    : bigNumFromLog10(floorLog * Math.log10(1.15));
  let total = BN.fromInt(10);
  total = total.mulBigNumInteger(pow2);
  total = total.mulBigNumInteger(pow14);
  total = total.mulBigNumInteger(pow115);
  const floored = total.floorToInteger();
  return floored.isZero?.() ? bnZero() : floored;
}

function getXpLevelNumber() {
  return Math.max(0, levelToNumber(getXpLevelBn()));
}

function ensureResetSlot() {
  if (resetState.slot != null) return resetState.slot;
  const slot = getActiveSlot();
  resetState.slot = slot;
  return slot;
}

function setForgeResetCompleted(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  resetState.hasDoneForgeReset = !!value;
  try { localStorage.setItem(FORGE_COMPLETED_KEY(slot), resetState.hasDoneForgeReset ? '1' : '0'); }
  catch {}
  primeStorageWatcherSnapshot(FORGE_COMPLETED_KEY(slot));
}

function setForgeUnlocked(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  resetState.forgeUnlocked = !!value;
  try { localStorage.setItem(FORGE_UNLOCK_KEY(slot), resetState.forgeUnlocked ? '1' : '0'); }
  catch {}
  primeStorageWatcherSnapshot(FORGE_UNLOCK_KEY(slot));
}

function readPersistentFlags(slot) {
  if (slot == null) {
    resetState.forgeUnlocked = false;
    resetState.hasDoneForgeReset = false;
    return;
  }
  try {
    resetState.forgeUnlocked = localStorage.getItem(FORGE_UNLOCK_KEY(slot)) === '1';
  } catch {
    resetState.forgeUnlocked = false;
  }
  try {
    resetState.hasDoneForgeReset = localStorage.getItem(FORGE_COMPLETED_KEY(slot)) === '1';
  } catch {
    resetState.hasDoneForgeReset = false;
  }
}

function bindStorageWatchers(slot) {
  if (watchersBoundSlot === slot) return;
  cleanupWatchers();
  watchersBoundSlot = slot;
  if (slot == null) return;
  watchers.push(watchStorageKey(FORGE_UNLOCK_KEY(slot), {
    onChange(value) {
      const next = value === '1';
      if (resetState.forgeUnlocked !== next) {
        resetState.forgeUnlocked = next;
        updateResetPanel();
      }
    },
  }));
  watchers.push(watchStorageKey(FORGE_COMPLETED_KEY(slot), {
    onChange(value) {
      const next = value === '1';
      if (resetState.hasDoneForgeReset !== next) {
        resetState.hasDoneForgeReset = next;
        updateResetPanel();
      }
    },
  }));
}

function getPendingInputSignature(coins, level) {
  const coinSig = coins?.toStorage?.()
    ?? coins?.toString?.()
    ?? String(coins ?? '');
  const levelSig = level?.toStorage?.()
    ?? level?.toString?.()
    ?? String(level ?? '');
  return `${coinSig}|${levelSig}`;
}

function recomputePendingGold(force = false) {
  const coins = bank.coins?.value ?? bnZero();
  const level = getXpLevelBn();
  const signature = getPendingInputSignature(coins, level);
  if (!force && pendingGoldInputSignature === signature) {
    return;
  }
  pendingGoldInputSignature = signature;
  resetState.pendingGold = computeForgeGold(coins, level);
  updateResetPanel();
}

function canAccessForgeTab() {
  return resetState.forgeUnlocked || getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.UNLOCK_FORGE) >= 1;
}

function meetsLevelRequirement() {
  try {
    const levelBn = getXpLevelBn();
    if (levelBn && typeof levelBn.cmp === 'function') {
      return levelBn.cmp(MIN_FORGE_LEVEL) >= 0;
    }
  } catch {}
  return false;
}

export function isForgeUnlocked() {
  return !!resetState.forgeUnlocked || canAccessForgeTab();
}

export function hasDoneForgeReset() {
  return !!resetState.hasDoneForgeReset;
}

export function computePendingForgeGold() {
  recomputePendingGold();
  return resetState.pendingGold.clone?.() ?? resetState.pendingGold;
}

export function canPerformForgeReset() {
  if (!isForgeUnlocked()) return false;
  if (!meetsLevelRequirement()) return false;
  if (resetState.pendingGold.isZero?.()) return false;
  const coins = bank.coins?.value;
  if (!coins || coins.isZero?.()) return false;
  return true;
}

function resetUpgrades() {
  const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
  for (const upg of upgrades) {
    if (!upg) continue;
    const tieKey = upg.tieKey || upg.tie;
    if (tieKey === UPGRADE_TIES.UNLOCK_XP || tieKey === UPGRADE_TIES.UNLOCK_FORGE) continue;
    if (upg.costType === 'gold') continue;
    setLevel(AREA_KEYS.STARTER_COVE, upg.id, 0);
  }
}

export function performForgeReset() {
  if (!canPerformForgeReset()) return false;
  const reward = resetState.pendingGold.clone?.() ?? resetState.pendingGold;
  try { bank.gold.add(reward); } catch {}
  try { bank.coins.set(0); } catch {}
  try { bank.books.set(0); } catch {}
  try { resetXpProgress({ keepUnlock: true }); } catch {}
  resetUpgrades();
  recomputePendingGold();
  setForgeUnlocked(true);
  if (!resetState.hasDoneForgeReset) {
    setForgeResetCompleted(true);
  }
  initMutationSystem();
  unlockMutationSystem();
  updateResetPanel();
  return true;
}

function formatBn(value) {
  try { return formatNumber(value); }
  catch { return value?.toString?.() ?? '0'; }
}

function setLayerActive(layer) {
  for (const key in resetState.layerButtons) {
    resetState.layerButtons[key].classList.toggle('is-active', key === layer);
  }
}

function buildPanel(panelEl) {
  panelEl.innerHTML = `
    <div class="merchant-reset">
      <aside class="merchant-reset__sidebar">
        <button type="button" class="merchant-reset__layer is-active" data-reset-layer="forge">
          <img src="${RESET_ICON_SRC}" alt="">
          <span>Forge</span>
        </button>
      </aside>
      <div class="merchant-reset__main">
        <header class="merchant-reset__header">
          <img src="${RESET_ICON_SRC}" alt="" class="merchant-reset__icon">
          <div class="merchant-reset__titles">
            <h3>Forge Reset</h3>
            <p>Reset coins, XP, and upgrades (except Unlock XP & Forge) to earn Gold.</p>
          </div>
        </header>
        <div class="merchant-reset__body">
          <div class="merchant-reset__reward">
            <img src="${GOLD_ICON_SRC}" alt="">
            <span data-reset-pending>0</span>
          </div>
          <div class="merchant-reset__status" data-reset-status></div>
          <button type="button" class="merchant-reset__action" data-reset-action>Perform Forge Reset</button>
        </div>
      </div>
    </div>
  `;
  resetState.panel = panelEl;
  resetState.pendingEl = panelEl.querySelector('[data-reset-pending]');
  resetState.statusEl = panelEl.querySelector('[data-reset-status]');
  resetState.actionBtn = panelEl.querySelector('[data-reset-action]');
  resetState.layerButtons = {
    forge: panelEl.querySelector('[data-reset-layer="forge"]'),
  };
  Object.entries(resetState.layerButtons).forEach(([key, btn]) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      setLayerActive(key);
      updateResetPanel();
    });
  });
  if (resetState.actionBtn) {
    resetState.actionBtn.addEventListener('click', () => {
      if (performForgeReset()) {
        updateResetPanel();
      }
    });
  }
  updateResetPanel();
}

export function initResetPanel(panelEl) {
  if (!panelEl || panelEl.__resetInit) return;
  panelEl.__resetInit = true;
  buildPanel(panelEl);
}

function updatePendingDisplay() {
  if (!resetState.pendingEl) return;
  resetState.pendingEl.innerHTML = formatBn(resetState.pendingGold);
}

function updateStatusDisplay() {
  if (!resetState.statusEl) return;
  if (!isForgeUnlocked()) {
    resetState.statusEl.textContent = 'Unlock the Forge upgrade to access resets.';
    return;
  }
  if (!meetsLevelRequirement()) {
    resetState.statusEl.textContent = 'Reach XP Level 31 to perform a Forge reset.';
    return;
  }
  if (resetState.pendingGold.isZero?.()) {
    resetState.statusEl.textContent = 'Collect more coins to earn Gold from a Forge reset.';
    return;
  }
  const rewardHtml = formatBn(resetState.pendingGold);
  resetState.statusEl.innerHTML = `Resetting will grant ${rewardHtml} Gold.`;
}

function updateActionState() {
  if (!resetState.actionBtn) return;
  const disabled = !canPerformForgeReset();
  resetState.actionBtn.disabled = disabled;
}

export function updateResetPanel() {
  if (!resetState.panel) return;
  updatePendingDisplay();
  updateStatusDisplay();
  updateActionState();
}

export function onForgeUpgradeUnlocked() {
  initResetSystem();
  setForgeUnlocked(true);
  updateResetPanel();
}

function bindGlobalEvents() {
  if (typeof window === 'undefined') return;
  window.addEventListener('currency:change', (e) => {
    if (e.detail?.key === 'coins') {
      recomputePendingGold();
    }
  });
  window.addEventListener('xp:change', () => {
    recomputePendingGold();
    updateResetPanel();
  });
}

export function initResetSystem() {
  if (initialized) {
    resetState.slot = getActiveSlot();
    resetPendingGoldSignature();
    ensureValueListeners();
    recomputePendingGold(true);
    return;
  }
  initialized = true;
  initMutationSystem();
  const slot = getActiveSlot();
  resetState.slot = slot;
  resetPendingGoldSignature();
  readPersistentFlags(slot);
  if (resetState.hasDoneForgeReset && !isMutationUnlocked()) {
    try { unlockMutationSystem(); } catch {}
  }
  if (!resetState.forgeUnlocked && canAccessForgeTab()) {
    setForgeUnlocked(true);
  }
  bindStorageWatchers(slot);
  ensureValueListeners();
  bindGlobalEvents();
  recomputePendingGold(true);
  if (mutationUnsub) {
    try { mutationUnsub(); } catch {}
    mutationUnsub = null;
  }
  mutationUnsub = onMutationChange(() => {
    const sprite = getMutationCoinSprite();
    if (typeof window !== 'undefined' && window.spawner && typeof window.spawner.setCoinSprite === 'function') {
      try { window.spawner.setCoinSprite(sprite); } catch {}
    }
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      const nextSlot = getActiveSlot();
      resetState.slot = nextSlot;
      resetPendingGoldSignature();
      readPersistentFlags(nextSlot);
      if (resetState.hasDoneForgeReset && !isMutationUnlocked()) {
        try { unlockMutationSystem(); } catch {}
      }
      if (!resetState.forgeUnlocked && canAccessForgeTab()) {
        setForgeUnlocked(true);
      }
      bindStorageWatchers(nextSlot);
      ensureValueListeners();
      recomputePendingGold(true);
      updateResetPanel();
    });
  }
}

if (typeof window !== 'undefined') {
  window.resetSystem = window.resetSystem || {};
  Object.assign(window.resetSystem, {
    initResetSystem,
    performForgeReset,
    computePendingForgeGold,
  });
}
