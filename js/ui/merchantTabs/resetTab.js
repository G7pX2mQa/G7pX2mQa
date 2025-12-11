// js/ui/merchantTabs/resetTab.js
import { BigNum } from '../../util/bigNum.js';
import {
  bank,
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
  onCurrencyChange,
  CURRENCIES,
} from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import {
  getXpState,
  resetXpProgress,
  onXpChange,
} from '../../game/xpSystem.js';
import {
  AREA_KEYS,
  UPGRADE_TIES,
  getUpgradesForArea,
  getLevelNumber,
  setLevel,
  approxLog10BigNum,
  bigNumFromLog10,
} from '../../game/upgrades.js';
import {
  initMutationSystem,
  unlockMutationSystem,
  isMutationUnlocked,
  getMutationCoinSprite,
  onMutationChange,
  getMutationState,
  getTotalCumulativeMp,
} from '../../game/mutationSystem.js';
import { shouldSkipGhostTap } from '../../util/ghostTapGuard.js';

const BN = BigNum;
const bnZero = () => BN.fromInt(0);
const bnOne = () => BN.fromInt(1);

const GOLD_ICON_SRC = 'img/currencies/gold/gold.webp';
const MAGIC_ICON_SRC = 'img/currencies/magic/magic.webp';
const RESET_ICON_SRC = 'img/misc/forge.webp';
const INFUSE_ICON_SRC = 'img/misc/infuse.webp';
const FORGE_RESET_SOUND_SRC = 'sounds/forge_reset.ogg';
const INFUSE_RESET_SOUND_SRC = 'sounds/infuse_reset.ogg';

let forgeResetAudio = null;
function playForgeResetSound() {
  try {
    if (!forgeResetAudio) {
      forgeResetAudio = new Audio(FORGE_RESET_SOUND_SRC);
    } else {
      forgeResetAudio.currentTime = 0;
    }
    forgeResetAudio.play().catch(() => {});
  } catch {}
}

let infuseResetAudio = null;
function playInfuseResetSound() {
  try {
    if (!infuseResetAudio) {
      infuseResetAudio = new Audio(INFUSE_RESET_SOUND_SRC);
    } else {
      infuseResetAudio.currentTime = 0;
    }
    infuseResetAudio.play().catch(() => {});
  } catch {}
}

const FORGE_UNLOCK_KEY = (slot) => `ccc:reset:forge:${slot}`;
const FORGE_COMPLETED_KEY = (slot) => `ccc:reset:forge:completed:${slot}`;
const FORGE_DEBUG_OVERRIDE_KEY = (slot) => `ccc:debug:forgeUnlocked:${slot}`;

const INFUSE_UNLOCK_KEY = (slot) => `ccc:reset:infuse:${slot}`;
const INFUSE_COMPLETED_KEY = (slot) => `ccc:reset:infuse:completed:${slot}`;
const INFUSE_DEBUG_OVERRIDE_KEY = (slot) => `ccc:debug:infuseUnlocked:${slot}`;

const MIN_FORGE_LEVEL = BN.fromInt(31);
const MIN_INFUSE_MUTATION_LEVEL = BN.fromInt(7);

const resetState = {
  slot: null,
  forgeUnlocked: false,
  forgeDebugOverride: null,
  hasDoneForgeReset: false,
  infuseUnlocked: false,
  infuseDebugOverride: null,
  hasDoneInfuseReset: false,
  pendingGold: bnZero(),
  pendingMagic: bnZero(),
  panel: null,
  elements: {
    forge: {
      card: null,
      status: null,
      btn: null,
    },
    infuse: {
      card: null,
      status: null,
      btn: null,
    },
  },
  layerButtons: {},
  flagsPrimed: false,
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

function notifyForgeUnlockChange() {
  const slot = resetState.slot ?? getActiveSlot();
  try {
    window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'forge', slot } }));
  } catch {}
}

function notifyInfuseUnlockChange() {
  const slot = resetState.slot ?? getActiveSlot();
  try {
    window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'infuse', slot } }));
  } catch {}
}

function getPendingGoldWithMultiplier(multiplierOverride = null) {
  try {
    if (multiplierOverride) {
      const mult = multiplierOverride instanceof BN ? multiplierOverride : BN.fromAny(multiplierOverride ?? 1);
      if (mult.isInfinite?.()) return BN.fromAny('Infinity');
      return resetState.pendingGold.mulBigNumInteger(mult);
    }
    return bank.gold?.mult?.applyTo?.(resetState.pendingGold) ?? resetState.pendingGold;
  } catch {
    return resetState.pendingGold;
  }
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
      recomputePendingMagic();
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

function computeInfuseMagicBase(coinsBn, cumulativeMpBn) {
  if (!coinsBn || coinsBn.isZero?.()) return bnZero();

  const threshold = BN.fromAny('1e11');
  if (coinsBn.cmp(threshold) < 0) return bnZero();

  const logCoins = approxLog10BigNum(coinsBn);
  if (!Number.isFinite(logCoins)) return BN.fromAny('Infinity');

  const logCRatio = logCoins - 11;
  if (logCRatio < 0) return bnZero();

  const LOG_BASE = 0.811078; // Math.log10(6.4726)
  const LOG_1_5 = 0.176091;  // Math.log10(1.5)
  const LOG_1_03 = 0.012837; // Math.log10(1.03)
  const LOG_2 = 0.301030;    // Math.log10(2)

  let logMpRatio = 0;
  if (cumulativeMpBn && !cumulativeMpBn.isZero?.()) {
    const logMp = approxLog10BigNum(cumulativeMpBn);
    if (Number.isFinite(logMp)) {
       logMpRatio = Math.max(0, logMp - 4);
    }
  }

  const term1 = logCRatio * LOG_1_5;
  const term2 = Math.floor(logCRatio) * LOG_1_03;
  const term3 = logMpRatio * LOG_2;

  const totalLog = LOG_BASE + term1 + term2 + term3;
  
  if (!Number.isFinite(totalLog)) return BN.fromAny('Infinity');
  
  return bigNumFromLog10(totalLog).floorToInteger();
}

function computeInfuseMagic(coinsBn, cumulativeMpBn, multiplierOverride = null) {
  const base = computeInfuseMagicBase(coinsBn, cumulativeMpBn);
  if (multiplierOverride) {
    const mult = multiplierOverride instanceof BN ? multiplierOverride : BN.fromAny(multiplierOverride ?? 1);
    if (mult.isInfinite?.()) return BN.fromAny('Infinity');
    return base.mulBigNumInteger(mult);
  }
  return bank.magic?.mult?.applyTo?.(base) ?? base;
}

export function computeForgeGoldFromInputs(coinsBn, levelBn) {
  return computeForgeGold(coinsBn, levelBn);
}

export function computeInfuseMagicFromInputs(coinsBn, cumulativeMpBn) {
  return computeInfuseMagic(coinsBn, cumulativeMpBn);
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

export function setForgeResetCompleted(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  resetState.hasDoneForgeReset = !!value;
  try { localStorage.setItem(FORGE_COMPLETED_KEY(slot), resetState.hasDoneForgeReset ? '1' : '0'); }
  catch {}
  try { window.dispatchEvent(new CustomEvent('forge:completed', { detail: { slot } })); }
  catch {}
}

export function setInfuseResetCompleted(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  resetState.hasDoneInfuseReset = !!value;
  try { localStorage.setItem(INFUSE_COMPLETED_KEY(slot), resetState.hasDoneInfuseReset ? '1' : '0'); }
  catch {}
  try { window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'infuse', slot } })); }
  catch {}
}

function getForgeDebugOverride(slot = getActiveSlot()) {
  if (slot == null) return null;
  try {
    const raw = localStorage.getItem(FORGE_DEBUG_OVERRIDE_KEY(slot));
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {}
  return null;
}

export function getForgeDebugOverrideState(slot = getActiveSlot()) {
  return getForgeDebugOverride(slot);
}

export function setForgeDebugOverride(value, slot = getActiveSlot()) {
  if (slot == null) return;
  const normalized = value == null ? null : !!value;
  if (resetState.forgeDebugOverride === normalized) return;

  resetState.forgeDebugOverride = normalized;

  if (normalized == null) {
    try { localStorage.removeItem(FORGE_DEBUG_OVERRIDE_KEY(slot)); } catch {}
  } else {
    try { localStorage.setItem(FORGE_DEBUG_OVERRIDE_KEY(slot), normalized ? '1' : '0'); }
    catch {}
  }
  primeStorageWatcherSnapshot(FORGE_DEBUG_OVERRIDE_KEY(slot));
  notifyForgeUnlockChange();
  updateResetPanel();
}

function getInfuseDebugOverride(slot = getActiveSlot()) {
  if (slot == null) return null;
  try {
    const raw = localStorage.getItem(INFUSE_DEBUG_OVERRIDE_KEY(slot));
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {}
  return null;
}

export function getInfuseDebugOverrideState(slot = getActiveSlot()) {
  return getInfuseDebugOverride(slot);
}

export function setInfuseUnlockedForDebug(value) {
  setInfuseUnlocked(value);
}

export function setInfuseDebugOverride(value, slot = getActiveSlot()) {
  if (slot == null) return;
  const normalized = value == null ? null : !!value;
  if (resetState.infuseDebugOverride === normalized) return;

  resetState.infuseDebugOverride = normalized;

  if (normalized == null) {
    try { localStorage.removeItem(INFUSE_DEBUG_OVERRIDE_KEY(slot)); } catch {}
  } else {
    try { localStorage.setItem(INFUSE_DEBUG_OVERRIDE_KEY(slot), normalized ? '1' : '0'); }
    catch {}
  }
  primeStorageWatcherSnapshot(INFUSE_DEBUG_OVERRIDE_KEY(slot));
  notifyInfuseUnlockChange();
  updateResetPanel();
}

function setInfuseUnlocked(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  const next = !!value;
  if (resetState.infuseUnlocked === next) return;
  resetState.infuseUnlocked = next;
  try { localStorage.setItem(INFUSE_UNLOCK_KEY(slot), resetState.infuseUnlocked ? '1' : '0'); }
  catch {}
  primeStorageWatcherSnapshot(INFUSE_UNLOCK_KEY(slot));
  notifyInfuseUnlockChange();
}

function setForgeUnlocked(value) {
  const slot = ensureResetSlot();
  if (slot == null) return;
  const next = !!value;
  if (resetState.forgeUnlocked === next) return;
  resetState.forgeUnlocked = next;
  try { localStorage.setItem(FORGE_UNLOCK_KEY(slot), resetState.forgeUnlocked ? '1' : '0'); }
  catch {}
  primeStorageWatcherSnapshot(FORGE_UNLOCK_KEY(slot));
  notifyForgeUnlockChange();
}

function readPersistentFlags(slot) {
  if (slot == null) {
    resetState.forgeUnlocked = false;
    resetState.forgeDebugOverride = null;
    resetState.hasDoneForgeReset = false;
    resetState.infuseUnlocked = false;
    resetState.infuseDebugOverride = null;
    resetState.hasDoneInfuseReset = false;
    resetState.flagsPrimed = false;
    return;
  }
  try {
    resetState.forgeUnlocked = localStorage.getItem(FORGE_UNLOCK_KEY(slot)) === '1';
  } catch {
    resetState.forgeUnlocked = false;
  }
  resetState.forgeDebugOverride = getForgeDebugOverride(slot);
  try {
    resetState.hasDoneForgeReset = localStorage.getItem(FORGE_COMPLETED_KEY(slot)) === '1';
  } catch {
    resetState.hasDoneForgeReset = false;
  }
  try {
    resetState.infuseUnlocked = localStorage.getItem(INFUSE_UNLOCK_KEY(slot)) === '1';
  } catch {
    resetState.infuseUnlocked = false;
  }
  try {
    resetState.hasDoneInfuseReset = localStorage.getItem(INFUSE_COMPLETED_KEY(slot)) === '1';
  } catch {
    resetState.hasDoneInfuseReset = false;
  }
  resetState.infuseDebugOverride = getInfuseDebugOverride(slot);
  resetState.flagsPrimed = true;
}

function ensurePersistentFlagsPrimed() {
  const slot = getActiveSlot();
  if (slot == null) {
    resetState.flagsPrimed = false;
    return;
  }
  if (resetState.slot !== slot) {
    resetState.slot = slot;
    resetPendingGoldSignature();
    resetState.flagsPrimed = false;
  }
  if (!resetState.flagsPrimed) {
    readPersistentFlags(slot);
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
        notifyForgeUnlockChange();
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
  watchers.push(watchStorageKey(FORGE_DEBUG_OVERRIDE_KEY(slot), {
    onChange(value) {
      let next = null;
      if (value === '1') next = true;
      else if (value === '0') next = false;
      if (resetState.forgeDebugOverride !== next) {
        resetState.forgeDebugOverride = next;
        notifyForgeUnlockChange();
        updateResetPanel();
      }
    },
  }));
  watchers.push(watchStorageKey(INFUSE_UNLOCK_KEY(slot), {
    onChange(value) {
      const next = value === '1';
      if (resetState.infuseUnlocked !== next) {
        resetState.infuseUnlocked = next;
        notifyInfuseUnlockChange();
        updateResetPanel();
      }
    },
  }));
  watchers.push(watchStorageKey(INFUSE_COMPLETED_KEY(slot), {
    onChange(value) {
      const next = value === '1';
      if (resetState.hasDoneInfuseReset !== next) {
        resetState.hasDoneInfuseReset = next;
        updateResetPanel();
      }
    },
  }));
  watchers.push(watchStorageKey(INFUSE_DEBUG_OVERRIDE_KEY(slot), {
    onChange(value) {
      let next = null;
      if (value === '1') next = true;
      else if (value === '0') next = false;
      if (resetState.infuseDebugOverride !== next) {
        resetState.infuseDebugOverride = next;
        notifyInfuseUnlockChange();
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

  if (!meetsLevelRequirement()) {
    resetState.pendingGold = bnZero();
  } else {
    resetState.pendingGold = computeForgeGold(coins, level);
  }

  updateResetPanel();
}

export function recomputePendingMagic(multiplierOverride = null) {
  const coins = bank.coins?.value ?? bnZero();
  const cumulativeMp = getTotalCumulativeMp();
  
  if (!meetsInfuseRequirement()) {
    resetState.pendingMagic = bnZero();
  } else {
    resetState.pendingMagic = computeInfuseMagic(coins, cumulativeMp, multiplierOverride);
  }
  updateResetPanel();
}


function canAccessForgeTab() {
  const override = getForgeDebugOverride();
  if (override != null) return !!override;
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

function meetsInfuseRequirement() {
  try {
    const mState = getMutationState();
    if (mState && mState.level && typeof mState.level.cmp === 'function') {
      return mState.level.cmp(MIN_INFUSE_MUTATION_LEVEL) >= 0;
    }
  } catch {}
  return false;
}

export function isForgeUnlocked() {
  ensurePersistentFlagsPrimed();
  const override = getForgeDebugOverride();
  if (override != null) return !!override;
  return !!resetState.forgeUnlocked || canAccessForgeTab();
}

export function isInfuseUnlocked() {
  ensurePersistentFlagsPrimed();
  const override = getInfuseDebugOverride();
  if (override != null) return !!override;
  return !!resetState.infuseUnlocked;
}

export function hasDoneForgeReset() {
  ensurePersistentFlagsPrimed();
  return !!resetState.hasDoneForgeReset;
}

export function hasDoneInfuseReset() {
  ensurePersistentFlagsPrimed();
  return !!resetState.hasDoneInfuseReset;
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

export function canPerformInfuseReset() {
  if (!isInfuseUnlocked()) return false;
  if (!meetsInfuseRequirement()) return false;
  if (resetState.pendingMagic.isZero?.()) return false;
  const coins = bank.coins?.value;
  if (!coins || coins.isZero?.()) return false;
  return true;
}

function resetUpgrades({ resetGold = false, resetMagic = false } = {}) {
  const upgrades = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
  for (const upg of upgrades) {
    if (!upg) continue;
    const tieKey = upg.tieKey || upg.tie;
    if (tieKey === UPGRADE_TIES.UNLOCK_XP || tieKey === UPGRADE_TIES.UNLOCK_FORGE || tieKey === UPGRADE_TIES.UNLOCK_INFUSE) continue;
    if (upg.costType === 'gold' && !resetGold) continue;
    if (upg.costType === 'magic' && !resetMagic) continue;
    setLevel(AREA_KEYS.STARTER_COVE, upg.id, 0, true, { resetHmEvolutions: true });
  }
}

function applyForgeResetEffects({ resetGold = false, resetMagic = false } = {}) {
  try { bank.coins.set(0); } catch {}
  try { bank.books.set(0); } catch {}
  try { resetXpProgress({ keepUnlock: true }); } catch {}
  resetUpgrades({ resetGold, resetMagic });
}

export function performForgeReset() {
  if (!canPerformForgeReset()) return false;
  const reward = resetState.pendingGold.clone?.() ?? resetState.pendingGold;
  try {
    const withMultiplier = bank.gold?.mult?.applyTo?.(reward) ?? reward;
    if (bank.gold?.add) {
      bank.gold.add(withMultiplier);
    }
  } catch {}
  
  applyForgeResetEffects({ resetGold: false });

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

export function performInfuseReset() {
  if (!canPerformInfuseReset()) return false;
  const reward = resetState.pendingMagic.clone?.() ?? resetState.pendingMagic;
  try {
    if (bank.magic?.add) {
       bank.magic.add(reward);
    }
  } catch {}

  applyForgeResetEffects({ resetGold: true });

  try { bank.gold.set(0); } catch {}
  
  try {
     const slot = getActiveSlot();
     const KEY_LEVEL = (s) => `ccc:mutation:level:${s}`;
     const KEY_PROGRESS = (s) => `ccc:mutation:progress:${s}`;
     localStorage.setItem(KEY_LEVEL(slot), '0');
     localStorage.setItem(KEY_PROGRESS(slot), '0');
     initMutationSystem({ forceReload: true });
  } catch {}

  recomputePendingGold();
  recomputePendingMagic();
  
  setInfuseUnlocked(true);
  if (!resetState.hasDoneInfuseReset) {
    setInfuseResetCompleted(true);
  }

  updateResetPanel();
  return true;
}

function formatBn(value) {
  try { return formatNumber(value); }
  catch { return value?.toString?.() ?? '0'; }
}

function buildPanel(panelEl) {
  panelEl.innerHTML = `
    <div class="merchant-reset">
      <aside class="merchant-reset__sidebar">
        <button type="button" class="merchant-reset__layer" data-reset-layer="forge">
          <img src="${RESET_ICON_SRC}" alt="">
          <span>Forge</span>
        </button>
        <button type="button" class="merchant-reset__layer" data-reset-layer="infuse" style="display:none">
          <img src="${INFUSE_ICON_SRC}" alt="">
          <span>Infuse</span>
        </button>
      </aside>
      
      <div class="merchant-reset__list">
        <!-- FORGE CARD -->
        <div class="merchant-reset__card merchant-reset__main" id="reset-card-forge">
          <div class="merchant-reset__layout">
            <header class="merchant-reset__header">
              <div class="merchant-reset__titles">
                <h3>Forge</h3>
              </div>
            </header>

            <div class="merchant-reset__content">
              <div class="merchant-reset__titles">
                <p data-reset-desc="forge">
                  Resets Coins, Books, XP, Coin upgrades, and Book upgrades for Gold<br>
                  Increase pending Gold amount by increasing Coins and XP Level<br>
                  The button below shows how much Gold you will get upon reset
                </p>
              </div>
              <div class="merchant-reset__status" data-reset-status="forge"></div>
            </div>

            <div class="merchant-reset__actions">
              <button type="button" class="merchant-reset__action" data-reset-action="forge">
                <span class="merchant-reset__action-plus">+</span>
                <span class="merchant-reset__action-icon">
                  <img src="${GOLD_ICON_SRC}" alt="">
                </span>
                <span class="merchant-reset__action-amount" data-reset-pending="forge">0</span>
              </button>
            </div>
          </div>
        </div>

        <!-- INFUSE CARD -->
        <div class="merchant-reset__card merchant-reset__main is-infuse" id="reset-card-infuse" style="display:none">
          <div class="merchant-reset__layout">
            <header class="merchant-reset__header">
              <div class="merchant-reset__titles">
                <h3>Infuse</h3>
              </div>
            </header>

            <div class="merchant-reset__content">
              <div class="merchant-reset__titles">
                <p data-reset-desc="infuse">
                  Resets everything Forge does as well as Gold, MP, and Gold upgrades for Magic<br>
                  Increase pending Magic amount by increasing Coins and MP
                </p>
              </div>
              <div class="merchant-reset__status" data-reset-status="infuse"></div>
            </div>

            <div class="merchant-reset__actions">
              <button type="button" class="merchant-reset__action" data-reset-action="infuse">
                <span class="merchant-reset__action-plus">+</span>
                <span class="merchant-reset__action-icon">
                  <img src="${MAGIC_ICON_SRC}" alt="">
                </span>
                <span class="merchant-reset__action-amount" data-reset-pending="infuse">0</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="merchant-reset__spacer"></div>
    </div>
  `;
  resetState.panel = panelEl;
  
  // Bind Forge Elements
  resetState.elements.forge.card = panelEl.querySelector('#reset-card-forge');
  resetState.elements.forge.status = panelEl.querySelector('[data-reset-status="forge"]');
  resetState.elements.forge.btn = panelEl.querySelector('[data-reset-action="forge"]');
  resetState.elements.forge.pending = panelEl.querySelector('[data-reset-pending="forge"]');

  // Bind Infuse Elements
  resetState.elements.infuse.card = panelEl.querySelector('#reset-card-infuse');
  resetState.elements.infuse.status = panelEl.querySelector('[data-reset-status="infuse"]');
  resetState.elements.infuse.btn = panelEl.querySelector('[data-reset-action="infuse"]');
  resetState.elements.infuse.pending = panelEl.querySelector('[data-reset-pending="infuse"]');

  // Sidebar Buttons
  resetState.layerButtons = {
    forge: panelEl.querySelector('[data-reset-layer="forge"]'),
    infuse: panelEl.querySelector('[data-reset-layer="infuse"]'),
  };
  
  // Sidebar Click Handlers (Scroll)
  Object.entries(resetState.layerButtons).forEach(([key, btn]) => {
    if (!btn) return;

    let lastPointerType = null;
    const handleClick = (e) => {
      if (e && e.isTrusted && shouldSkipGhostTap(btn)) return;
      // markGhostTapTarget removed - global handler manages clicks
      
      const card = resetState.elements[key]?.card;
      if (card) {
        const scrollContainer = card.closest('.merchant-content');
        if (key === 'forge' && scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    btn.addEventListener('click', (e) => {
        if (lastPointerType && lastPointerType !== 'mouse') {
            lastPointerType = null;
            return;
        }
        lastPointerType = null;
        handleClick(e);
    });
  });
  
  // Action Button Handlers
  if (resetState.elements.forge.btn) {
    resetState.elements.forge.btn.addEventListener('click', () => {
       if (performForgeReset()) {
         playForgeResetSound();
         updateResetPanel();
       }
    });
  }

  if (resetState.elements.infuse.btn) {
    resetState.elements.infuse.btn.addEventListener('click', () => {
       if (performInfuseReset()) {
         playInfuseResetSound();
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

function updateResetButtonContent(btn, state, iconSrc, pendingAmountBn) {
  if (!btn) return;
  const { disabled, msg } = state;
  
  if (btn.disabled !== disabled) btn.disabled = disabled;
  
  // State: "msg" or "action"
  const targetMode = msg ? 'msg' : 'action';
  const currentMode = btn.dataset.mode;
  
  if (targetMode === 'msg') {
      if (currentMode !== 'msg' || btn.textContent !== msg) {
          btn.innerHTML = `<span class="merchant-reset__req-msg">${msg}</span>`;
          btn.dataset.mode = 'msg';
      }
      return;
  }
  
  // Action mode
  const amountStr = formatBn(pendingAmountBn);
  
  if (currentMode !== 'action') {
      // Build structure
      btn.innerHTML = `
        <span class="merchant-reset__action-plus">+</span>
        <span class="merchant-reset__action-icon"><img src="${iconSrc}" alt=""></span>
        <span class="merchant-reset__action-amount">${amountStr}</span>
      `;
      btn.dataset.mode = 'action';
  } else {
      // Update amount only
      const amountEl = btn.querySelector('.merchant-reset__action-amount');
      if (amountEl && amountEl.textContent !== amountStr) {
          amountEl.textContent = amountStr;
      }
      // Ensure icon (in case it was somehow lost or incorrect, though unlikely here)
      const iconImg = btn.querySelector('.merchant-reset__action-icon img');
      if (iconImg && !iconImg.src.includes(iconSrc)) iconImg.src = iconSrc;
  }
}

function updateForgeCard({ goldMult = null } = {}) {
  const el = resetState.elements.forge;
  if (!el.card || !el.btn) return;

  if (!isForgeUnlocked()) {
     updateResetButtonContent(el.btn, { disabled: true, msg: 'Unlock the Forge upgrade to access resets' });
     return;
  }

  ensurePersistentFlagsPrimed();
  el.card.classList.toggle('is-forge-complete', !!resetState.hasDoneForgeReset);
  
  if (el.status) {
      if (resetState.hasDoneForgeReset) {
        if (el.status.innerHTML !== '') el.status.innerHTML = '';
      } else {
        const expected = `
          <span style="color:#02e815; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
            Forging for the first time will unlock new Shop upgrades, a new Merchant dialogue, and
            <strong style="color:#ffb347; text-shadow: 0 3px 6px rgba(0,0,0,0.55);
            ">Mutations</strong><br>
            Mutated Coins will yield more Coin and XP value than normal
          </span>
        `.trim();
        // Simple length check or substring to avoid constant re-render
        if (!el.status.innerHTML.includes('Mutations')) el.status.innerHTML = expected;
      }
  }

  if (!meetsLevelRequirement()) {
    updateResetButtonContent(el.btn, { disabled: true, msg: 'Reach XP Level 31 to perform a Forge reset' });
    return;
  }

  if (resetState.pendingGold.isZero?.()) {
    updateResetButtonContent(el.btn, { disabled: true, msg: 'Collect more coins to earn Gold from a Forge reset' });
    return;
  }

  updateResetButtonContent(el.btn, { disabled: false }, GOLD_ICON_SRC, getPendingGoldWithMultiplier(goldMult));
}

function updateInfuseCard() {
  const el = resetState.elements.infuse;
  if (!el.card || !el.btn) return;

  if (!isInfuseUnlocked()) {
    if (el.card.style.display !== 'none') el.card.style.display = 'none';
    if (resetState.layerButtons.infuse && resetState.layerButtons.infuse.style.display !== 'none') {
        resetState.layerButtons.infuse.style.display = 'none';
    }
    return;
  }

  if (el.card.style.display !== 'flex') el.card.style.display = 'flex';
  if (resetState.layerButtons.infuse && resetState.layerButtons.infuse.style.display !== 'flex') {
      resetState.layerButtons.infuse.style.display = 'flex';
  }

  ensurePersistentFlagsPrimed();
  
  el.card.classList.toggle('is-complete', !!resetState.hasDoneInfuseReset);

  if (el.status) {
      if (resetState.hasDoneInfuseReset) {
        if (el.status.innerHTML !== '') el.status.innerHTML = '';
      } else {
         const expected = `
          <span style="color:#02e815; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
            Infusing for the first time will unlock new Shop upgrades, a new Merchant dialogue, and a new tab in the Delve menu: <strong style="color:#c68cff">Workshop</strong><br>
            This new tab will allow you to passively generate Gears<br>
            Spend Gears on new upgrades in the Shop to automate various things
          </span>
         `.trim();
         if (!el.status.innerHTML.includes('Workshop')) el.status.innerHTML = expected;
      }
  }

  if (!meetsInfuseRequirement()) {
    updateResetButtonContent(el.btn, { disabled: true, msg: 'Reach Mutation Level 7 to perform an Infuse reset' });
    return;
  }
  
  if (resetState.pendingMagic.isZero?.()) {
    updateResetButtonContent(el.btn, { disabled: true, msg: 'Collect more coins to earn Magic from an Infuse reset' });
    return;
  }
  
  updateResetButtonContent(el.btn, { disabled: false }, MAGIC_ICON_SRC, resetState.pendingMagic);
}

export function updateResetPanel({ goldMult = null } = {}) {
  if (!resetState.panel) return;
  updateForgeCard({ goldMult });
  updateInfuseCard();
}

export function onForgeUpgradeUnlocked() {
  initResetSystem();
  setForgeUnlocked(true);
  updateResetPanel();
}

export function onInfuseUpgradeUnlocked() {
  initResetSystem();
  setInfuseUnlocked(true);
  updateResetPanel();
}

function bindGlobalEvents() {
  if (typeof window === 'undefined') return;
  window.addEventListener('currency:change', (e) => {
    if (e.detail?.key === 'coins') {
      recomputePendingGold();
      recomputePendingMagic();
    }
  });
  window.addEventListener('currency:multiplier', (e) => {
    const detail = e?.detail;
    if (!detail) return;
    if (detail.key === CURRENCIES.GOLD) {
      if (detail.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
      recomputePendingGold(true);
      // Pass the new multiplier explicitly so visual updates are instant
      const goldMult = detail.mult instanceof BigNum ? detail.mult : BN.fromAny(detail.mult ?? 1);
      
      // Force update with explicit override to ensure reactivity
      if (resetState.panel) {
        updateForgeCard({ goldMult });
      }
      return;
    }
    if (detail.key === CURRENCIES.MAGIC) {
      if (detail.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
      const magicMult = detail.mult instanceof BigNum ? detail.mult : BN.fromAny(detail.mult ?? 1);
      recomputePendingMagic(magicMult);
      // Ensure visual update happens immediately with the new multiplier
      if (resetState.panel) {
        updateInfuseCard();
      }
      return;
    }
  });
  window.addEventListener('xp:change', () => {
    recomputePendingGold();
    updateResetPanel();
  });
  window.addEventListener('mutation:change', () => {
    recomputePendingMagic();
    updateResetPanel();
  });
  window.addEventListener('debug:change', (e) => {
    if (e?.detail?.slot != null && resetState.slot != null && e.detail.slot !== resetState.slot) return;
    resetPendingGoldSignature();
    recomputePendingGold(true);
    recomputePendingMagic();
    updateResetPanel();
  });
}

export function initResetSystem() {
  if (initialized) {
    resetState.slot = getActiveSlot();
    resetPendingGoldSignature();
    ensureValueListeners();
    recomputePendingGold(true);
    recomputePendingMagic();
    return;
  }
  
  // Guard against circular dependency initialization issues
  try {
    initMutationSystem();
  } catch (e) {
    // If initMutationSystem fails (likely due to accessing hudRefs before mutationSystem fully loads in a circular dep cycle),
    // we abort initialization. This allows a subsequent call (e.g. from main.js) to succeed later.
    return;
  }

  initialized = true;
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
  recomputePendingMagic();
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
      recomputePendingMagic();
      updateResetPanel();
    });
  }
}

if (typeof window !== 'undefined') {
  window.resetSystem = window.resetSystem || {};
  Object.assign(window.resetSystem, {
    initResetSystem,
    performForgeReset,
    performInfuseReset,
    computePendingForgeGold,
    computeForgeGoldFromInputs,
    computeInfuseMagicFromInputs,
    getForgeDebugOverrideState,
    hasDoneForgeReset,
    isForgeUnlocked,
    setForgeDebugOverride,
    setForgeResetCompleted,
    updateResetPanel,
    isInfuseUnlocked,
    setInfuseDebugOverride,
    getInfuseDebugOverrideState,
    recomputePendingMagic,
    setInfuseUnlockedForDebug,
    setInfuseResetCompleted,
    hasDoneInfuseReset,
  });
}
