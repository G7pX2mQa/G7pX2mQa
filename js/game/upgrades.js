// js/game/upgrades.js
import { bank, getActiveSlot, watchStorageKey, primeStorageWatcherSnapshot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import {
  unlockXpSystem,
  isXpSystemUnlocked,
  getXpState,
  addExternalCoinMultiplierProvider,
  setExternalBookRewardProvider,
  addExternalXpGainMultiplierProvider,
  refreshCoinMultiplierFromXpLevel,
} from './xpSystem.js';
import { getMutationMultiplier } from './mutationSystem.js';
import {
  initResetSystem,
  onForgeUpgradeUnlocked,
  isForgeUnlocked,
  hasDoneForgeReset,
} from '../ui/merchantDelve/resetTab.js';

export const MAX_LEVEL_DELTA = BigNum.fromAny('Infinity');

const HM_EVOLUTION_INTERVAL = 1000;
const HM_EVOLUTION_EFFECT_MULT_BN = BigNum.fromInt(1000);
const DEFAULT_AREA_KEY = '';

function hasScaling(upg) {
  try {
    const scaling = ensureUpgradeScaling(upg);
    if (!scaling) return false;
    if (scaling.ratioMinus1 > 0) return true;

    const c0 = BigNum.fromAny(upg.costAtLevel?.(0) ?? 0);
    const c1 = BigNum.fromAny(upg.costAtLevel?.(1) ?? 0);
    const cF = BigNum.fromAny(upg.costAtLevel?.(32) ?? 0);
    return !(c0.cmp(c1) === 0 && c0.cmp(cF) === 0);
  } catch {
    return false;
  }
}

const SCALED_INFINITY_LVL_LOG10 = 308;
function isInfinityLevelForScaled(upg, lvlBn) {
  if (!hasScaling(upg)) return false;
  try {
    const bn = lvlBn?.clone ? lvlBn : BigNum.fromAny(lvlBn ?? 0);
    if (bn.isInfinite?.()) return true;
    const log10 = approxLog10BigNum(bn);
    return Number.isFinite(log10) && log10 >= SCALED_INFINITY_LVL_LOG10;
  } catch {
    return false;
  }
}

export function approxLog10BigNum(value) {
  if (!(value instanceof BigNum)) {
    try {
      value = BigNum.fromAny(value ?? 0);
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }
  if (!value) return Number.NEGATIVE_INFINITY;
  if (value.isZero?.()) return Number.NEGATIVE_INFINITY;
  if (value.isInfinite?.()) return Number.POSITIVE_INFINITY;
  let storage;
  try {
    storage = value.toStorage();
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  const parts = storage.split(':');
  const sigStr = parts[2] ?? '0';
  let expPart = parts[3] ?? '0';
  let offsetStr = '0';
  const caret = expPart.indexOf('^');
  if (caret >= 0) {
    offsetStr = expPart.slice(caret + 1) || '0';
    expPart = expPart.slice(0, caret) || '0';
  }
  const baseExp = Number(expPart || '0');
  const offset = Number(offsetStr || '0');
  const sigNum = Number(sigStr || '0');
  if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
  const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
  return Math.log10(sigNum) + expSum;
}

export function bigNumFromLog10(log10Value) {
  if (!Number.isFinite(log10Value)) {
    return log10Value > 0 ? BigNum.fromAny('Infinity') : BigNum.fromInt(0);
  }
  
  if (log10Value <= -1e12) return BigNum.fromInt(0);
  const p = BigNum.DEFAULT_PRECISION;
  let intPart = Math.floor(log10Value);
  let frac = log10Value - intPart;
  if (frac < 0) {
    frac += 1;
    intPart -= 1;
  }
  const mantissa = Math.pow(10, frac + (p - 1));
  const sig = BigInt(Math.max(1, Math.round(mantissa)));
  const exp = intPart - (p - 1);
  return new BigNum(sig, exp, p);
}

export const UPGRADE_TIES = {
  FASTER_COINS: 'coin_0',
  UNLOCK_XP: 'none_0',
  FASTER_COINS_II: 'book_0',
  COIN_VALUE_I: 'book_1',
  BOOK_VALUE_I: 'book_2',
  XP_VALUE_I: 'coin_1',
  UNLOCK_FORGE: 'none_1',
  COIN_VALUE_II: 'gold_0',
  XP_VALUE_II: 'gold_1',
  MP_VALUE_I: 'gold_2',
  MAGNET: 'gold_3',
  ENDLESS_XP: 'hm_xp_0',
};

const LOCKED_UPGRADE_ICON_DATA_URL = 'img/misc/locked.png';
const MYSTERIOUS_UPGRADE_ICON_DATA_URL = 'img/misc/mysterious.png';
const HIDDEN_UPGRADE_TITLE = 'Hidden Upgrade';
const LOCKED_UPGRADE_TITLE = 'Locked Upgrade';
const FORGE_PLACEHOLDER_TIES = new Set([
  UPGRADE_TIES.COIN_VALUE_II,
  UPGRADE_TIES.XP_VALUE_II,
  UPGRADE_TIES.MP_VALUE_I,
  UPGRADE_TIES.MAGNET,
  UPGRADE_TIES.ENDLESS_XP,
]);
const SPECIAL_LOCK_STATE_TIES = new Set([
  UPGRADE_TIES.UNLOCK_XP,
  UPGRADE_TIES.UNLOCK_FORGE,
  ...FORGE_PLACEHOLDER_TIES,
]);
const XP_MYSTERY_UPGRADE_TIES = new Set([
  UPGRADE_TIES.FASTER_COINS_II,
  UPGRADE_TIES.COIN_VALUE_I,
  UPGRADE_TIES.BOOK_VALUE_I,
  UPGRADE_TIES.XP_VALUE_I,
]);
const XP_MYSTERY_LEGACY_KEYS = new Set([
  'starter_cove:3',
  'starter_cove:4',
  'starter_cove:5',
  'starter_cove:6',
]);
const MERCHANT_MET_KEY_BASE = 'ccc:merchantMet';
const SHOP_REVEAL_STATE_KEY_BASE = 'ccc:shop:reveals';
const SHOP_PERMA_UNLOCK_KEY_BASE = 'ccc:shop:permaUnlocks';
const SHOP_PERMA_MYST_KEY_BASE   = 'ccc:shop:permaMyst';
const SHOP_REVEAL_STATUS_ORDER = { locked: 0, mysterious: 1, unlocked: 2 };
const shopRevealStateCache = new Map();
const shopPermaUnlockStateCache = new Map();
const shopPermaMystStateCache   = new Map();
const upgradeTieLookup = new Map();
const BOOK_VALUE_TIE_KEY = normalizeUpgradeTie(UPGRADE_TIES.BOOK_VALUE_I);

const BN = BigNum;
const toBn = (x) => BN.fromAny(x ?? 0);

function effectBN(fn) {
  return (level) => {
    const L = toBn(level);
    let out;
    try { out = fn({ L, BN }); } catch { out = 1; }
    if (out instanceof BN) return out;
    const n = Number(out);
    if (Number.isFinite(n)) return n;
    try { return BN.fromAny(out ?? 1); } catch { return BN.fromInt(1); }
  };
}

const E = {
  addPctPerLevel(p) {
    const pNum = Number(p);
    const pStr = String(pNum);
    return (level) => {
      const L = toBn(level);
      try {
        const plain = L.toPlainIntegerString?.();
        if (plain && plain !== 'Infinity' && plain.length <= 15) {
          const lvl = Math.max(0, Number(plain));
          return 1 + pNum * lvl;
        }
      } catch {}
      try { return BN.fromInt(1).add(L.mulDecimal(pStr)); }
catch {
  const logL = approxLog10BigNum(L);
  if (Number.isFinite(logL)) {
    const logTerm = logL + Math.log10(Math.abs(pNum || 0));
    return bigNumFromLog10(logTerm);
  }
  return BigNum.fromAny('Infinity');
}

    };
  },

  addFlatPerLevel(x) {
    const xNum = Number(x);
    const xStr = String(xNum);
    return (level) => {
      const L = toBn(level);
      try {
        const plain = L.toPlainIntegerString?.();
        if (plain && plain !== 'Infinity' && plain.length <= 15) {
          const lvl = Math.max(0, Number(plain));
          return 1 + xNum * lvl;
        }
      } catch {}
      try { return BN.fromInt(1).add(L.mulDecimal(xStr)); } catch { return 1; }
    };
  },
  
  powPerLevel(base) {
  const baseNum = Number(base);
  const b = Number.isFinite(baseNum) ? baseNum : Number(toBn(base).toScientific(6));
  const log10b = Math.log10(b);

  return (level) => {
    const L = toBn(level);

    try {
      const plain = L.toPlainIntegerString?.();
      if (plain && plain !== 'Infinity' && plain.length <= 7) {
        const lvl = Math.max(0, Number(plain));
        const log10 = log10b * lvl;

        if (log10 < 308) {
          const val = Math.pow(b, lvl);
          if (Number.isFinite(val)) return val;
        }
        return bigNumFromLog10(log10);
      }
    } catch {}
	
      try {
      const approxLvl = levelBigNumToNumber(L);
      const log10 = log10b * approxLvl;
      return bigNumFromLog10(log10);
      } catch {
      return BigNum.fromInt(1);
      }
    };
  }
};

function shopStatusRank(status) {
  return SHOP_REVEAL_STATUS_ORDER[status] ?? 0;
}

function classifyUpgradeStatus(lockState) {
  if (!lockState || lockState.locked === false) return 'unlocked';
  if (lockState.hidden) return 'mysterious';
  return 'locked';
}

function upgradeRevealKey(areaKey, upg) {
  const normArea = normalizeAreaKey(areaKey || upg?.area);
  if (!normArea) return null;
  const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
  if (tieKey) {
    return `${normArea}:${tieKey}`;
  }
  const rawId = normalizeUpgradeId(upg?.id);
  let idStr = '';
  if (typeof rawId === 'number') {
    if (!Number.isFinite(rawId)) return null;
    idStr = String(Math.trunc(rawId));
  } else if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    if (!trimmed) return null;
    idStr = trimmed;
  } else {
    return null;
  }
  return `${normArea}:${idStr}`;
}

function upgradeLegacyRevealKey(areaKey, upg) {
  const normArea = normalizeAreaKey(areaKey || upg?.area);
  if (!normArea) return null;
  const rawId = normalizeUpgradeId(upg?.id);
  if (rawId == null) return null;
  if (typeof rawId === 'number') {
    if (!Number.isFinite(rawId)) return null;
    return `${normArea}:${Math.trunc(rawId)}`;
  }
  const trimmed = String(rawId).trim();
  return trimmed ? `${normArea}:${trimmed}` : null;
}

function migrateUpgradeStateKey(state, fromKey, toKey) {
  if (!state || !state.upgrades || typeof state.upgrades !== 'object') return false;
  if (!fromKey || !toKey || fromKey === toKey) return false;
  if (state.upgrades[toKey]) return false;
  if (!state.upgrades[fromKey]) return false;
  state.upgrades[toKey] = state.upgrades[fromKey];
  delete state.upgrades[fromKey];
  return true;
}

function ensureShopRevealState(slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (shopRevealStateCache.has(slotKey)) {
    return shopRevealStateCache.get(slotKey);
  }

  let parsed = { upgrades: {} };
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${SHOP_REVEAL_STATE_KEY_BASE}:${slotKey}`);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          const upgrades = (obj.upgrades && typeof obj.upgrades === 'object') ? obj.upgrades : {};
          parsed = { upgrades };
        }
      }
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') parsed = { upgrades: {} };
  if (!parsed.upgrades || typeof parsed.upgrades !== 'object') parsed.upgrades = {};

  shopRevealStateCache.set(slotKey, parsed);
  return parsed;
}

function saveShopRevealState(state, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (!state || typeof state !== 'object') {
    state = { upgrades: {} };
  }
  if (!state.upgrades || typeof state.upgrades !== 'object') {
    state.upgrades = {};
  }
  shopRevealStateCache.set(slotKey, state);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${SHOP_REVEAL_STATE_KEY_BASE}:${slotKey}`, JSON.stringify(state));
  } catch {}
}

function ensureShopPermaUnlockState(slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (shopPermaUnlockStateCache.has(slotKey)) {
    return shopPermaUnlockStateCache.get(slotKey);
  }

  let parsed = { upgrades: {} };
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${SHOP_PERMA_UNLOCK_KEY_BASE}:${slotKey}`);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          const upgrades = (obj.upgrades && typeof obj.upgrades === 'object') ? obj.upgrades : {};
          parsed = { upgrades };
        }
      }
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') parsed = { upgrades: {} };
  if (!parsed.upgrades || typeof parsed.upgrades !== 'object') parsed.upgrades = {};

  shopPermaUnlockStateCache.set(slotKey, parsed);
  return parsed;
}

function saveShopPermaUnlockState(state, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (!state || typeof state !== 'object') {
    state = { upgrades: {} };
  }
  if (!state.upgrades || typeof state.upgrades !== 'object') {
    state.upgrades = {};
  }
  shopPermaUnlockStateCache.set(slotKey, state);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${SHOP_PERMA_UNLOCK_KEY_BASE}:${slotKey}`, JSON.stringify(state));
  } catch {}
}

function ensureShopPermaMystState(slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (shopPermaMystStateCache.has(slotKey)) {
    return shopPermaMystStateCache.get(slotKey);
  }
  let parsed = { upgrades: {} };
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${SHOP_PERMA_MYST_KEY_BASE}:${slotKey}`);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          const upgrades = (obj.upgrades && typeof obj.upgrades === 'object') ? obj.upgrades : {};
          parsed = { upgrades };
        }
      }
    } catch {}
  }
  if (!parsed || typeof parsed !== 'object') parsed = { upgrades: {} };
  if (!parsed.upgrades || typeof parsed.upgrades !== 'object') parsed.upgrades = {};
  shopPermaMystStateCache.set(slotKey, parsed);
  return parsed;
}

function saveShopPermaMystState(state, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (!state || typeof state !== 'object') state = { upgrades: {} };
  if (!state.upgrades || typeof state.upgrades !== 'object') state.upgrades = {};
  shopPermaMystStateCache.set(slotKey, state);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${SHOP_PERMA_MYST_KEY_BASE}:${slotKey}`, JSON.stringify(state));
  } catch {}
}

function markUpgradePermanentlyMysterious(areaKey, upg, slot = getActiveSlot()) {
  const key = upgradeRevealKey(areaKey, upg);
  if (!key) return;
  const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
  const state = ensureShopPermaMystState(slot);
  if (state.upgrades[key]) return;
  state.upgrades[key] = true;
  if (legacyKey && state.upgrades[legacyKey]) {
    delete state.upgrades[legacyKey];
  }
  saveShopPermaMystState(state, slot);
}

function isUpgradePermanentlyMysterious(areaKey, upg, slot = getActiveSlot()) {
  const key = upgradeRevealKey(areaKey, upg);
  if (!key) return false;
  const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
  const state = ensureShopPermaMystState(slot);
  if (state.upgrades[key]) return true;
  if (legacyKey && state.upgrades[legacyKey]) {
    state.upgrades[key] = state.upgrades[legacyKey];
    delete state.upgrades[legacyKey];
    saveShopPermaMystState(state, slot);
    return true;
  }
  return false;
}

function markUpgradePermanentlyUnlocked(areaKey, upg, slot = getActiveSlot()) {
  const key = upgradeRevealKey(areaKey, upg);
  if (!key) return;
  const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
  const state = ensureShopPermaUnlockState(slot);
  if (state.upgrades[key]) return;
  state.upgrades[key] = true;
  if (legacyKey && state.upgrades[legacyKey]) {
    delete state.upgrades[legacyKey];
  }
  saveShopPermaUnlockState(state, slot);
}

function isUpgradePermanentlyUnlocked(areaKey, upg, slot = getActiveSlot()) {
  const key = upgradeRevealKey(areaKey, upg);
  if (!key) return false;
  const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
  const state = ensureShopPermaUnlockState(slot);
  if (state.upgrades[key]) return true;
  if (legacyKey && state.upgrades[legacyKey]) {
    state.upgrades[key] = state.upgrades[legacyKey];
    delete state.upgrades[legacyKey];
    saveShopPermaUnlockState(state, slot);
    return true;
  }
  return false;
}

function determineLockState(ctx) {
  // Be robust if called unbound or without ctx.upg
  const upgRef = (ctx && ctx.upg) ? ctx.upg : (this && typeof this === 'object' ? this : null);
  const tieKey = normalizeUpgradeTie(upgRef?.tie ?? upgRef?.tieKey);
  const area = ctx?.areaKey || AREA_KEYS.STARTER_COVE;

  if (!tieKey || !SPECIAL_LOCK_STATE_TIES.has(tieKey)) {
    return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
  }

  // If any level has already been bought, it’s unlocked.
  let currentLevel = 0;
  try {
    currentLevel = (upgRef && typeof upgRef.id !== 'undefined') ? getLevelNumber(area, upgRef.id) : 0;
  } catch {}
  if (currentLevel >= 1) {
    return { locked: false, hidden: false, useLockedBase: false };
  }

  // XPs unlocked?
  let xpUnlocked = false;
  try {
    xpUnlocked = (ctx && typeof ctx.xpUnlocked !== 'undefined')
      ? !!ctx.xpUnlocked
      : safeIsXpUnlocked();
  } catch {}

  function determineUnlockXpLockState() {
    if (safeHasMetMerchant()) {
      // Merchant met -> upgrade is fully visible and purchasable
      return {
        locked: false,
        hidden: false,
        hideCost: false,
        hideEffect: false,
        useLockedBase: false,
      };
    }

    // Merchant not met -> mysterious placeholder
    const revealText = 'Explore the Delve menu to reveal this upgrade';
    return {
      locked: true,
      iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
      titleOverride: HIDDEN_UPGRADE_TITLE,
      descOverride: revealText,
      reason: revealText,
      hidden: true,
      hideCost: true,
      hideEffect: true,
      useLockedBase: true,
    };
  }

  // ==== Unlock XP ====
  if (tieKey === UPGRADE_TIES.UNLOCK_XP) {
    return determineUnlockXpLockState();
  }

  // ==== Unlock Forge ====
  if (tieKey === UPGRADE_TIES.UNLOCK_FORGE) {
    // No XP system -> LOCKED padlock
    if (!xpUnlocked) {
      return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
    }
    // Before 31 -> show same requirement text as mysterious, but without generic "hidden" line
    let xp31 = false;
    try { const xpBn = currentXpLevelBigNum(); xp31 = levelBigNumToNumber(xpBn) >= 31; } catch {}
    if (!xp31) {
      const revealText = (upgRef?.revealRequirement) || 'Reach XP Level 31 to reveal this upgrade';
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        hidden: true,
        hideCost: true, hideEffect: true, useLockedBase: true,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
      };
    }
    // XP ≥ 31 -> visible/unlocked
    return { locked: false };
  }

  if (hasDoneForgeReset() || isUpgradePermanentlyUnlocked(area, upgRef)) {
    try { markUpgradePermanentlyUnlocked(area, upgRef); } catch {}
    return { locked: false, hidden: false, useLockedBase: false };
  }

  // No XP system -> LOCKED padlock
  if (!xpUnlocked) {
    return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
  }

  if (isUpgradePermanentlyMysterious(area, upgRef)) {
    const revealText = 'Do a Forge reset to reveal this upgrade';
    return {
      locked: true,
      iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
      hidden: true, hideCost: true, hideEffect: true, useLockedBase: true,
      titleOverride: HIDDEN_UPGRADE_TITLE,
      descOverride: revealText,
      reason: revealText,
    };
  }

  // Compute XP ≥ 31 once (for the *first-time* reveal/burn)
  let xp31 = false;
  try { const xpBn = currentXpLevelBigNum(); xp31 = levelBigNumToNumber(xpBn) >= 31; } catch {}

// Before 31 -> hard LOCKED (not mysterious, not clickable)
if (!xp31) {
  const revealText = 'Do a Forge reset to reveal this upgrade';
  return {
    locked: true,
    iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
    useLockedBase: true,
    titleOverride: LOCKED_UPGRADE_TITLE,
    descOverride: revealText,
    reason: revealText,
    hidden: false,
    hideCost: false,
    hideEffect: false,
  };
}

  // First time hitting 31 -> burn perma-mysterious and show MYSTERIOUS
  try { markUpgradePermanentlyMysterious(area, upgRef); } catch {}
  return {
    locked: true,
    iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
    hidden: true, hideCost: true, hideEffect: true, useLockedBase: true,
  };
}

function snapshotUpgradeLockState(lockState) {
  if (!lockState || typeof lockState !== 'object') return null;
  const snapshot = {};
  const keys = [
    'iconOverride',
    'titleOverride',
    'descOverride',
    'reason',
    'hideCost',
    'hideEffect',
    'hidden',
    'useLockedBase',
  ];
  for (const key of keys) {
    if (lockState[key] !== undefined) snapshot[key] = lockState[key];
  }
  return snapshot;
}

function normalizeAreaKey(areaKey) {
  if (typeof areaKey === 'string') {
    const trimmed = areaKey.trim();
    if (trimmed) {
      return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
  }
  return '';
}

function normalizeUpgradeTie(tieValue) {
  if (typeof tieValue === 'string') {
    const trimmed = tieValue.trim();
    if (trimmed) {
      return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
  }
  return '';
}


function isXpAdjacentUpgrade(areaKey, upg) {
  const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
  if (tieKey && XP_MYSTERY_UPGRADE_TIES.has(tieKey)) {
    return true;
  }
  const normalizedId = normalizeUpgradeId(upg?.id);
  const numericId = typeof normalizedId === 'number'
    ? normalizedId
    : Number.parseInt(normalizedId, 10);
  const idKey = Number.isFinite(numericId)
    ? String(numericId)
    : (normalizedId != null ? String(normalizedId) : '');
  if (!idKey) return false;

  const areaCandidates = [];
  if (areaKey != null) areaCandidates.push(areaKey);
  if (upg?.area != null) areaCandidates.push(upg.area);

  for (const candidate of areaCandidates) {
    const normArea = normalizeAreaKey(candidate);
    if (!normArea) continue;
    if (XP_MYSTERY_LEGACY_KEYS.has(`${normArea}:${idKey}`)) {
      return true;
    }
  }

  return false;
}

function safeIsXpUnlocked() {
  try {
    return !!isXpSystemUnlocked();
  } catch {
    return false;
  }
}

function safeHasMetMerchant(slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${MERCHANT_MET_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

function currentXpLevelBigNum() {
  try {
    const state = typeof getXpState === 'function' ? getXpState() : null;
    if (state?.xpLevel instanceof BigNum) {
      return state.xpLevel.clone?.() ?? state.xpLevel;
    }
    if (state?.xpLevel != null) {
      return BigNum.fromAny(state.xpLevel);
    }
  } catch {}
  return BigNum.fromInt(0);
}

function bookValueMultiplierBn(level) {
  const L = ensureLevelBigNum(level);
  try {
    const plain = L.toPlainIntegerString?.();
    if (plain && plain !== 'Infinity' && plain.length <= 15) {
      const lvl = Math.max(0, Number(plain));
      return bigNumFromLog10(lvl * Math.log10(2)).floorToInteger();
    }
  } catch {}

  return BigNum.fromAny('Infinity');
}

function normalizedUpgradeLevel(levelValue) {
  if (typeof levelValue === 'number' && Number.isFinite(levelValue)) {
    return Math.max(0, Math.floor(levelValue));
  }
  if (typeof levelValue === 'bigint') {
    if (levelValue < 0n) return 0;
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const clamped = levelValue > maxSafe ? maxSafe : levelValue;
    return Number(clamped);
  }
  if (levelValue instanceof BigNum) {
    try {
      const plain = levelValue.toPlainIntegerString?.();
      if (plain && plain !== 'Infinity') {
        const parsed = Number.parseInt(plain, 10);
        if (Number.isFinite(parsed)) {
          return Math.max(0, parsed);
        }
      }
    } catch {}
  }
  return 0;
}

function hundredPercentPerLevelMultiplier(levelValue) {
  const lvl = normalizedUpgradeLevel(levelValue);
  if (lvl <= 0) {
    return BigNum.fromInt(1);
  }
  try {
    const asBigInt = BigInt(lvl) + 1n;
    return BigNum.fromAny(asBigInt.toString());
  } catch {
    try {
      return BigNum.fromAny(String(lvl + 1));
    } catch {
      return BigNum.fromInt(1);
    }
  }
}

function mergeLockStates(base, override) {
  const merged = Object.assign({ locked: false }, base || {});
  if (!override || typeof override !== 'object') return merged;
  const keys = [
    'locked',
    'iconOverride',
    'titleOverride',
    'descOverride',
    'reason',
    'hideCost',
    'hideEffect',
    'hidden',
    'useLockedBase',
  ];
  for (const key of keys) {
    if (override[key] !== undefined) merged[key] = override[key];
  }
  return merged;
}

function normalizeUpgradeId(upgId) {
  if (typeof upgId === 'number') {
    if (!Number.isFinite(upgId)) return upgId;
    return Math.trunc(upgId);
  }
  if (typeof upgId === 'string') {
    const trimmed = upgId.trim();
    if (!trimmed) return trimmed;
    if (/^[+-]?\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return trimmed;
  }
  return upgId;
}

function ensureLevelBigNum(value) {
  try {
    const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
    if (bn.isInfinite?.()) return bn.clone?.() ?? bn;
    const plain = bn.toPlainIntegerString?.();
    if (plain === 'Infinity') return BigNum.fromAny('Infinity');
    if (!plain) return BigNum.fromInt(0);
    const normalized = plain.replace(/^0+(?=\d)/, '');
    if (!normalized) return BigNum.fromInt(0);
    return BigNum.fromAny(normalized);
  } catch {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    return BigNum.fromInt(num);
  }
}

function levelBigNumToNumber(value) {
  let bn;
  try {
    bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
  } catch {
    return 0;
  }

  if (bn.isInfinite?.()) {
    return Number.POSITIVE_INFINITY;
  }

  try {
    const plain = bn.toPlainIntegerString?.();
    if (!plain || plain === 'Infinity') {
      return plain === 'Infinity' ? Number.MAX_VALUE : 0;
    }

    const digits = plain.replace(/^0+/, '');
    if (!digits) return 0;

    if (digits.length <= 15) {
      const num = Number(digits);
      return Number.isFinite(num) ? num : 0;
    }

    const lead = digits.slice(0, 15);
    const leadNum = Number(lead);
    const leadLen = lead.length;
    if (!Number.isFinite(leadNum) || leadNum <= 0) return 0;

    let mantissa = leadNum / Math.pow(10, leadLen - 1);
    let exponent = digits.length - 1;

    if (mantissa <= 0 || !Number.isFinite(mantissa)) return 0;

    if (mantissa >= 10) {
      const shift = Math.floor(Math.log10(mantissa));
      if (Number.isFinite(shift) && shift > 0) {
        mantissa /= Math.pow(10, shift);
        exponent += shift;
      }
    } else if (mantissa < 1) {
      const shift = Math.ceil(Math.log10(1 / mantissa));
      if (Number.isFinite(shift) && shift > 0) {
        mantissa *= Math.pow(10, shift);
        exponent -= shift;
      }
    }

    if (exponent > 308) {
      return Number.MAX_VALUE;
    }
    if (exponent < -324) {
      return 0;
    }

    const approx = mantissa * Math.pow(10, exponent);
    if (!Number.isFinite(approx)) {
      return exponent > 0 ? Number.MAX_VALUE : 0;
    }
    return approx;
  } catch {
    const approx = approxLog10BigNum(bn);
    if (!Number.isFinite(approx)) return Number.MAX_VALUE;
    if (approx > 308) return Number.MAX_VALUE;
    if (approx < -324) return 0;
    const value = Math.pow(10, approx);
    return Number.isFinite(value) ? value : Number.MAX_VALUE;
  }
}

const LN10 = Math.log(10);

function plainLevelDelta(nextLevelBn, prevLevelBn) {
  const next = ensureLevelBigNum(nextLevelBn);
  const prev = ensureLevelBigNum(prevLevelBn);

  if (next.isInfinite?.()) {
    return prev.isInfinite?.() ? BigNum.fromInt(0) : BigNum.fromAny('Infinity');
  }
  if (prev.isInfinite?.()) {
    return BigNum.fromInt(0);
  }

  try {
    const nextPlain = next.toPlainIntegerString?.();
    const prevPlain = prev.toPlainIntegerString?.();
    if (!nextPlain || !prevPlain) return BigNum.fromInt(0);
    if (nextPlain === 'Infinity') return BigNum.fromAny('Infinity');
    if (prevPlain === 'Infinity') return BigNum.fromInt(0);
    if (nextPlain === prevPlain) return BigNum.fromInt(0);
    const diff = BigInt(nextPlain) - BigInt(prevPlain);
    if (diff <= 0n) return BigNum.fromInt(0);
    return BigNum.fromAny(diff.toString());
  } catch {
    return BigNum.fromInt(0);
  }
}

function decimalMultiplierString(value) {
  if (!Number.isFinite(value) || value <= 0) return '1';
  let out = value.toFixed(12);
  out = out.replace(/0+$/, '');
  if (out.endsWith('.')) out += '0';
  return out;
}

const DEFAULT_SCALING_PRESETS = {
  STANDARD(upg) {
    const upgType = `${upg?.upgType ?? ''}`.toUpperCase();
    if (upgType === 'HM') {
      const evol = activeEvolutionsForUpgrade(upg);
      return 1.50 + (0.10 * evol);
    }
    return 1.20;
  },
  HM(upg) {
    return DEFAULT_SCALING_PRESETS.STANDARD(upg);
  },
  NM() {
    return 1.20;
  },
};

function normalizeHmEvolutionCount(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.max(0, Math.floor(n));
  return 0;
}

function activeEvolutionsForUpgrade(upg) {
  if (!upg) return 0;
  const active = Number(upg.activeEvolutions);
  if (Number.isFinite(active) && active >= 0) return active;
  return normalizeHmEvolutionCount(upg.numUpgEvolutions);
}

function hmLevelCapForEvolutions(evolutions) {
  const cycles = normalizeHmEvolutionCount(evolutions);
  const cap = HM_EVOLUTION_INTERVAL * (cycles + 1);
  const capBn = BigNum.fromAny(cap);
  return {
    cap,
    capBn,
    capFmtHtml: formatBigNumAsHtml(capBn),
    capFmtText: formatBigNumAsPlain(capBn),
  };
}

function hmMilestoneHits(levelBn, milestoneLevel) {
  if (!levelBn || typeof milestoneLevel !== 'number') return 0;
  try {
    const plain = levelBn.toPlainIntegerString?.();
    if (!plain || plain === 'Infinity') return 0;
    const lvl = BigInt(plain);
    const base = BigInt(Math.max(0, Math.floor(milestoneLevel)));
    const interval = BigInt(HM_EVOLUTION_INTERVAL);
    if (lvl < base) return 0;
    const delta = lvl - base;
    const cycles = delta / interval;
    return Number(cycles + 1n);
  } catch {
    const approx = levelBigNumToNumber(levelBn);
    if (!Number.isFinite(approx) || approx < milestoneLevel) return 0;
    const delta = approx - milestoneLevel;
    return Math.max(0, Math.floor(delta / HM_EVOLUTION_INTERVAL) + 1);
  }
}

function hmMilestoneMultiplier(multiplier, hits) {
  if (!(hits > 0)) return BigNum.fromInt(1);
  let out;
  try { out = BigNum.fromAny(multiplier ?? 1); }
  catch { out = BigNum.fromInt(1); }
  let result = out.clone?.() ?? out;
  for (let i = 1; i < hits; i += 1) {
    try { result = result.mulBigNumInteger(out); }
    catch {
      try { result = result.mulDecimal(String(out), 18); }
      catch { return BigNum.fromAny('Infinity'); }
    }
  }
  return result;
}

function resolveHmMilestones(upg, areaKey = DEFAULT_AREA_KEY) {
  const milestones = upg?.hmMilestones;
  if (Array.isArray(milestones)) return milestones;
  if (!milestones || typeof milestones !== 'object') return [];

  const normalizedArea = normalizeAreaKey(areaKey || upg?.area || DEFAULT_AREA_KEY);

  if (normalizedArea) {
    if (Array.isArray(milestones[normalizedArea])) return milestones[normalizedArea];
    if (Array.isArray(milestones[areaKey])) return milestones[areaKey];
  }

  if (Array.isArray(milestones.default)) return milestones.default;
  return [];
}

function safeMultiplyBigNum(base, factor) {
  let out = base instanceof BigNum ? base : BigNum.fromAny(base ?? 1);
  let f = factor instanceof BigNum ? factor : null;
  if (!f) {
    try { f = BigNum.fromAny(factor ?? 1); }
    catch { return out; }
  }
  try { return out.mulBigNumInteger(f); }
  catch {}
  try { return out.mulDecimal(f.toScientific?.(12) ?? String(factor ?? '1'), 18); }
  catch {}
  return out;
}

function applyHmEvolutionMeta(upg, evolutions = 0) {
  if (!upg || upg.upgType !== 'HM') return;
  const { cap, capBn, capFmtHtml, capFmtText } = hmLevelCapForEvolutions(evolutions);
  upg.activeEvolutions = evolutions;
  upg.lvlCap = cap;
  upg.lvlCapBn = capBn;
  upg.lvlCapFmtHtml = capFmtHtml;
  upg.lvlCapFmtText = capFmtText;
}

function computeHmMultipliers(upg, levelBn, areaKey = DEFAULT_AREA_KEY) {
  if (!upg || upg.upgType !== 'HM') {
    return {
      selfMult: BigNum.fromInt(1),
      xpMult: BigNum.fromInt(1),
      coinMult: BigNum.fromInt(1),
      mpMult: BigNum.fromInt(1),
    };
  }

  const milestones = resolveHmMilestones(upg, areaKey);
  let selfMult = BigNum.fromInt(1);
  let xpMult = BigNum.fromInt(1);
  let coinMult = BigNum.fromInt(1);
  let mpMult = BigNum.fromInt(1);

  for (const m of milestones) {
    const hits = hmMilestoneHits(levelBn, Number(m?.level ?? m?.lvl ?? 0));
    if (!(hits > 0)) continue;
    const mult = hmMilestoneMultiplier(m.multiplier ?? m.mult ?? m.value ?? 1, hits);
    const target = `${m.target ?? m.type ?? 'self'}`.toLowerCase();
    if (target === 'xp') {
      xpMult = safeMultiplyBigNum(xpMult, mult);
    } else if (target === 'coin' || target === 'coins') {
      coinMult = safeMultiplyBigNum(coinMult, mult);
    } else if (target === 'mp') {
      mpMult = safeMultiplyBigNum(mpMult, mult);
    } else {
      selfMult = safeMultiplyBigNum(selfMult, mult);
    }
  }

  const evolutions = activeEvolutionsForUpgrade(upg);
  for (let i = 0; i < evolutions; i += 1) {
    selfMult = safeMultiplyBigNum(selfMult, HM_EVOLUTION_EFFECT_MULT_BN);
  }

  return { selfMult, xpMult, coinMult, mpMult };
}

function hmNextMilestoneLevel(upg, levelBn, areaKey = DEFAULT_AREA_KEY) {
  if (!upg || upg.upgType !== 'HM') return null;
  const milestones = resolveHmMilestones(upg, areaKey);
  if (!milestones.length) return null;

  let best = null;
  for (const m of milestones) {
    const lvl = Math.max(0, Math.floor(Number(m?.level ?? m?.lvl ?? 0)));
    const hits = hmMilestoneHits(levelBn, lvl);
    let candidate = null;
    try {
      const base = BigInt(lvl);
      const nextHits = BigInt(Math.max(0, hits));
      const targetBi = base + (BigInt(HM_EVOLUTION_INTERVAL) * nextHits);
      if (targetBi > 0n) {
        candidate = BigNum.fromAny(targetBi.toString());
      }
    } catch {}
    if (!candidate) {
      const increment = BigNum.fromAny(HM_EVOLUTION_INTERVAL * Math.max(0, hits));
      try { candidate = increment.add(BigNum.fromAny(lvl)); }
      catch { candidate = BigNum.fromAny(lvl + HM_EVOLUTION_INTERVAL * hits); }
    }
    if (!candidate) continue;
    if (levelBn?.cmp?.(candidate) >= 0) {
      try { candidate = candidate.add(BigNum.fromAny(HM_EVOLUTION_INTERVAL)); }
      catch {}
    }
    if (!best || best.cmp(candidate) > 0) {
      best = candidate;
    }
  }
  return best;
}

function resolveDefaultScalingRatio(upg) {
  if (!upg) return null;

  const tryPreset = (name) => {
    const presetName = `${name ?? ''}`.toUpperCase();
    if (!presetName) return null;
    const presetFn = DEFAULT_SCALING_PRESETS[presetName];
    if (typeof presetFn !== 'function') return null;
    const ratio = presetFn(upg);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    return { ratio, preset: presetName };
  };

  return (
    tryPreset(upg.scalingPreset)
    || tryPreset(upg.upgType)
    || tryPreset('STANDARD')
  );
}

function ensureUpgradeScaling(upg) {
  if (!upg) return null;
  if (upg.scaling && upg.scaling.baseBn) return upg.scaling;
  try {
    const baseBn = BigNum.fromAny(upg.baseCost ?? upg.baseCostBn ?? 0);

    const providedScaling = upg.scaling ?? {};
    let ratio = Number(providedScaling.ratio);
    if (!(ratio > 0) || !Number.isFinite(ratio)) ratio = null;

    let ratioStr = typeof providedScaling.ratioStr === 'string'
      ? providedScaling.ratioStr.trim()
      : '';
    if (!ratio && ratioStr) {
      const parsed = Number(ratioStr);
      if (Number.isFinite(parsed) && parsed > 0) {
        ratio = parsed;
      }
    }

    let ratioLog10 = Number(providedScaling.ratioLog10);
    if (!Number.isFinite(ratioLog10)) ratioLog10 = null;
    if (!ratio && ratioLog10 != null) {
      const pow = Math.pow(10, ratioLog10);
      if (Number.isFinite(pow) && pow > 0) ratio = pow;
    }

    let ratioLn = Number(providedScaling.ratioLn);
    if (!Number.isFinite(ratioLn)) ratioLn = null;
    if (!ratio && ratioLn != null) {
      const exp = Math.exp(ratioLn);
      if (Number.isFinite(exp) && exp > 0) ratio = exp;
    }

    if (!ratio) {
      const ratioMinus1 = Number(providedScaling.ratioMinus1);
      if (Number.isFinite(ratioMinus1) && ratioMinus1 > 0) {
        ratio = ratioMinus1 + 1;
      }
    }

    let defaultPreset = null;
    if (!ratio) {
      const resolved = resolveDefaultScalingRatio(upg);
      if (resolved) {
        ratio = resolved.ratio;
        defaultPreset = resolved.preset;
      }
    }

    if (!(ratio > 1)) {
      ratio = 1;
      ratioStr = '1';
      ratioLog10 = 0;
      ratioLn = 0;
      var ratioMinus1 = 0;
    } else {
      ratio = Number(ratio);
      ratioStr = decimalMultiplierString(ratio);
      ratioLog10 = Math.log10(ratio);
      ratioLn = Math.log(ratio);
      var ratioMinus1 = Math.max(1e-12, ratio - 1);
    }

    const baseLog10 = approxLog10BigNum(baseBn);

    const scaling = Object.assign({}, providedScaling, {
      baseBn,
      baseLog10,
      ratio,
      ratioMinus1,
      ratioLog10,
      ratioLn,
      ratioStr,
      defaultPreset: defaultPreset ?? providedScaling.defaultPreset,
    });

    // Expose the in-progress scaling so recursive cost checks can use it
    upg.scaling = scaling;

    try {
      const c0 = BigNum.fromAny(upg.costAtLevel?.(0) ?? 0);
      const c1 = BigNum.fromAny(upg.costAtLevel?.(1) ?? 0);
      const cF = BigNum.fromAny(upg.costAtLevel?.(32) ?? 0);
      if (c0.cmp(c1) === 0 && c0.cmp(cF) === 0) {
        scaling.ratio = 1;
        scaling.ratioMinus1 = 0;
        scaling.ratioLog10 = 0;
        scaling.ratioLn = 0;
        scaling.ratioStr = '1';
      }
    } catch {}

    return scaling;
  } catch {
    return null;
  }
}

// Replace your entire costAtLevelUsingScaling with this
function costAtLevelUsingScaling(upg, level) {
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return BigNum.fromInt(0);
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  if (lvl === 0) return BigNum.fromAny(scaling.baseBn);

  // Approach A (robust & simple): multiply without flooring, floor once at end
  if (lvl <= 100) {
    let price = BigNum.fromAny(scaling.baseBn);
    for (let i = 0; i < lvl; i += 1) {
      // precise decimal multiply (no truncation each step)
      price = price.mulDecimal(scaling.ratioStr);
    }
    return price.floorToInteger();
  }

  // Existing mid-range anchor + tail (kept as-is)
  if (lvl < 10000) {
    const anchor = Math.max(0, lvl - 10);
    let price = bigNumFromLog10(scaling.baseLog10 + anchor * scaling.ratioLog10);
    for (let step = anchor; step < lvl; step += 1) {
      price = price.mulDecimal(scaling.ratioStr);
    }
    return price.floorToInteger();
  }

  // Very large levels: closed form via logs
  return bigNumFromLog10(scaling.baseLog10 + lvl * scaling.ratioLog10).floorToInteger();
}


function logExpMinus1(x) {
  if (!Number.isFinite(x)) return x;
  if (x < 1e-6) {
    return Math.log(Math.expm1(x));
  }
  if (x < 50) {
    return Math.log(Math.expm1(x));
  }
  const negExp = Math.exp(-x);
  return x + Math.log1p(-negExp);
}

function logSeriesTotal(upg, startLevel, count) {
  if (!(count > 0)) return Number.NEGATIVE_INFINITY;
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return Number.NEGATIVE_INFINITY;
  if (!(scaling.ratioMinus1 > 0) || !Number.isFinite(scaling.ratioLn)) {
    return Number.POSITIVE_INFINITY;
  }

  const startLn = (scaling.baseLog10 * LN10) + (startLevel * scaling.ratioLn);
  const growth = scaling.ratioLn * count;
  const numerLn = logExpMinus1(growth);
  if (!Number.isFinite(numerLn)) return Number.POSITIVE_INFINITY;
  const denomLn = Math.log(scaling.ratioMinus1);
  const totalLn = startLn + numerLn - denomLn;
  return totalLn / LN10;
}

function totalCostBigNum(upg, startLevel, count) {
  if (!(count > 0)) return BigNum.fromInt(0);
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return BigNum.fromInt(0);
  const targetLevel = startLevel + count;

  if (targetLevel <= 100) {
    let price = BigNum.fromAny(upg.costAtLevel(startLevel));
    let total = BigNum.fromInt(0);
    for (let i = 0; i < count; i += 1) {
      total = total.add(price);
      if (i + 1 < count) price = price.mulDecimalFloor(scaling.ratioStr);
    }
    return total;
  }

  if (targetLevel < 10000) {
    const tailCount = Math.min(10, count);
    const headCount = count - tailCount;
    let total = BigNum.fromInt(0);
    if (headCount > 0) {
      const headLog = logSeriesTotal(upg, startLevel, headCount);
      total = total.add(bigNumFromLog10(headLog));
    }
    if (tailCount > 0) {
      const tailStart = startLevel + headCount;
      let price = BigNum.fromAny(upg.costAtLevel(tailStart));
      for (let i = 0; i < tailCount; i += 1) {
        total = total.add(price);
        if (i + 1 < tailCount) price = price.mulDecimalFloor(scaling.ratioStr);
      }
    }
    return total;
  }

  const totalLog = logSeriesTotal(upg, startLevel, count);
  return bigNumFromLog10(totalLog);
}

function log10OnePlusPow10(exponent) {
  if (!Number.isFinite(exponent)) {
    if (exponent > 0) return exponent;
    if (exponent === 0) return Math.log10(2);
    return 0;
  }
  if (exponent > 308) return exponent;
  if (exponent < -20) {
    const pow = Math.pow(10, exponent);
    return pow / LN10;
  }
  const pow = Math.pow(10, exponent);
  if (!Number.isFinite(pow)) return exponent > 0 ? exponent : 0;
  return Math.log1p(pow) / LN10;
}

const MAX_LEVEL_DELTA_LIMIT = (() => {
  try {
    const approx = levelBigNumToNumber(MAX_LEVEL_DELTA);
    if (!Number.isFinite(approx)) return Number.POSITIVE_INFINITY;
    if (approx <= 0) return 0;
    return Math.floor(approx);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
})();

const FLOAT64_BUFFER = new ArrayBuffer(8);
const FLOAT64_VIEW = new Float64Array(FLOAT64_BUFFER);
const INT64_VIEW = new BigInt64Array(FLOAT64_BUFFER);

function nextDownPositive(value) {
  if (!(value > 0) || !Number.isFinite(value)) return value;
  FLOAT64_VIEW[0] = value;
  if (FLOAT64_VIEW[0] <= 0) return 0;
  INT64_VIEW[0] -= 1n;
  const next = FLOAT64_VIEW[0];
  return next > 0 ? next : 0;
}

function nextUpPositive(value) {
  if (!(value >= 0) || !Number.isFinite(value)) return value;
  FLOAT64_VIEW[0] = value;
  INT64_VIEW[0] += 1n;
  const next = FLOAT64_VIEW[0];
  return next > value ? next : value;
}

function safeDecrementCount(value) {
  if (!(value > 0)) return 0;
  const dec = Math.floor(value - 1);
  if (dec < value) return dec;
  const next = nextDownPositive(value);
  if (next < value) return next;
  return value > 1 ? value / 2 : 0;
}

function countToBigNum(count) {
  if (!(count > 0) || !Number.isFinite(count)) return BigNum.fromInt(0);
  const floored = Math.floor(count);
  if (!(floored > 0)) return BigNum.fromInt(0);
  if (floored <= Number.MAX_SAFE_INTEGER) {
    return BigNum.fromInt(floored);
  }
  let str;
  try {
    str = floored.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 });
  } catch {
    str = floored.toString();
  }
  if (!str || !/\d/.test(str)) return BigNum.fromInt(0);
  return BigNum.fromAny(str);
}

function calculateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
  const scaling = ensureUpgradeScaling(upg);
  const zero = BigNum.fromInt(0);
  const opts = options || {};
  const fastOnly = !!opts.fastOnly;
  if (!scaling) {
    return { count: zero, spent: zero, nextPrice: zero, numericCount: 0 };
  }

  const startLevelNum = Math.max(0, Math.floor(levelBigNumToNumber(startLevel)));

  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Number.POSITIVE_INFINITY;
  const maxLevelsNum = typeof maxLevels === 'number'
    ? maxLevels
    : levelBigNumToNumber(maxLevels);
  const capRoom = Number.isFinite(cap)
    ? Math.max(0, cap - startLevelNum)
    : MAX_LEVEL_DELTA_LIMIT;
  let room = Number.isFinite(maxLevelsNum)
    ? Math.max(0, Math.floor(maxLevelsNum))
    : MAX_LEVEL_DELTA_LIMIT;
  room = Math.min(room, MAX_LEVEL_DELTA_LIMIT, capRoom);
  if (!(room > 0)) {
    const nextPrice = capRoom <= 0 ? zero : BigNum.fromAny(upg.costAtLevel(startLevelNum));
    return { count: zero, spent: zero, nextPrice, numericCount: 0 };
  }

  // For small levels we can cheaply compute an exact floored progression, which
  // avoids undercounting caused by geometric approximations that ignore per-step
  // flooring (e.g., costs like 3 → 3 → 4 instead of 3 → 3.6 → 4.32).
  const remainingToHundred = 100 - startLevelNum;
  if (Number.isFinite(startLevelNum) && remainingToHundred > 0) {
    const limit = Math.min(room, remainingToHundred);
    let price = BigNum.fromAny(upg.costAtLevel(startLevelNum));
    let spent = zero;
    let count = 0;

    while (count < limit) {
      // Use the exact per-level cost function (with its own flooring logic)
      // instead of multiplying by ratio, so we don't drift when costs change
      // non-geometrically around low levels.
      price = BigNum.fromAny(upg.costAtLevel(startLevelNum + count));
      const newSpent = spent.add(price);
      if (newSpent.cmp(walletBn) > 0) break;
      spent = newSpent;
      count += 1;
    }

    const nextLevel = startLevelNum + count;
    const reachedCap = Number.isFinite(cap) && nextLevel >= cap;
    const nextPrice = reachedCap
      ? zero
      : BigNum.fromAny(upg.costAtLevel(nextLevel));
    const countBn = countToBigNum(count);

    return { count: countBn, spent, nextPrice, numericCount: count };
  }

let walletLog = approxLog10BigNum(walletBn);

const ratioLog10 = scaling.ratioLog10;
const ratioMinus1 = scaling.ratioMinus1;
const firstPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum));


const startPriceLog = scaling.baseLog10 + (startLevelNum * ratioLog10);

// Fallback: if walletLog isn't finite *or* magnitudes are so huge that
// double-precision subtraction will be meaningless, do a pure-BigNum search.
const needBnSearch =
  (ratioMinus1 > 0) && (
    !Number.isFinite(walletLog) ||
    (Math.abs(walletLog) > 1e6 && Math.abs(startPriceLog) > 1e6)
  );

if (needBnSearch) {
  // Quick "can't even buy 1" check
  const firstPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum));
  if (walletBn.cmp(firstPrice) < 0) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  // Bound the affordable count using only BigNum compares
  const hardLimit = Number.isFinite(room) ? Math.max(1, Math.floor(room)) : Number.MAX_VALUE;
  let lo = 1;
  let hi = 1;

while (hi < hardLimit) {
  const spentLog = logSeriesTotal(upg, startLevelNum, hi);
  const spentBn  = bigNumFromLog10(spentLog);
  if (spentBn.cmp(walletBn) <= 0) {
    const doubled = hi * 2;
    if (!Number.isFinite(doubled) || doubled <= hi) { hi = hardLimit; break; }
    lo = hi;
    hi = Math.min(doubled, hardLimit);
  } else {
    break;
  }
}

  let steps = 0;
  while (lo < hi && steps < 256) {
    const mid = Math.max(lo + 1, Math.floor((lo + hi + 1) / 2));
    const spentLog = logSeriesTotal(upg, startLevelNum, mid);
    const spentBn  = bigNumFromLog10(spentLog);
    if (spentBn.cmp(walletBn) <= 0) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
    steps++;
  }

  const count = Math.max(1, lo);
  const countBn = countToBigNum(count);

  // In fastOnly mode we can skip exact 'spent'; otherwise compute precisely.
  let spent = zero;
  let nextPrice = zero;
  if (!fastOnly) {
    spent = totalCostBigNum(upg, startLevelNum, count);
    if (Number.isFinite(cap)) {
      const capRoom = Math.max(0, Math.floor(cap - Math.min(startLevelNum, cap)));
      if (count >= capRoom) {
        nextPrice = zero;
      } else {
        nextPrice = bigNumFromLog10(startPriceLog + count * ratioLog10);
      }
    } else {
      nextPrice = bigNumFromLog10(startPriceLog + count * ratioLog10);
    }
  }

  return {
    count: countBn,
    spent,
    nextPrice,
    numericCount: count,
  };
}

  if (walletBn.cmp(firstPrice) < 0) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

let isConstantCost = false;
let secondPrice = null, farPrice = null;

try { secondPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum + 1)); } catch {}
try {
  const farProbe = Math.min(
    Number.isFinite(cap) ? Math.max(startLevelNum + 1, Math.floor(cap)) : startLevelNum + 32,
    startLevelNum + 32
  );
  farPrice = BigNum.fromAny(upg.costAtLevel(farProbe));
} catch {}
if (!isConstantCost && !(scaling.ratioMinus1 > 0)) {
  isConstantCost = true;
}

if (secondPrice && farPrice) {
  isConstantCost =
    secondPrice.cmp(firstPrice) === 0 &&
    farPrice.cmp(firstPrice) === 0;
}

if (!isConstantCost && !(scaling.ratioMinus1 > 0)) {
  isConstantCost = true;
}

  const limit = Number.isFinite(room)
    ? Math.max(0, Math.floor(room))
    : Number.MAX_VALUE;

  const pricePlain = firstPrice.toPlainIntegerString?.();
  const walletPlain = walletBn.toPlainIntegerString?.();
  const priceInt = pricePlain && pricePlain !== 'Infinity' ? BigInt(pricePlain) : null;
  const walletInt = walletPlain && walletPlain !== 'Infinity' ? BigInt(walletPlain) : null;

  if (isConstantCost) {
  const capBn = toUpgradeBigNum(upg.lvlCapBn ?? 'Infinity', 'Infinity');
  const lvlBn = toUpgradeBigNum(startLevel ?? 0, 0);
  const roomBn = capBn.isInfinite?.()
    ? BigNum.fromAny('Infinity')
    : capBn.sub(lvlBn).floorToInteger();

  const { count, countBn, spent, nextPrice } = estimateFlatBulk(
    firstPrice,
    walletBn,
    roomBn
  );

  return {
    count: countBn,
    spent,
    nextPrice,
    numericCount: count,
  };
}

if (!(ratioLog10 > 0) || !(ratioMinus1 > 0)) {
  const capBn = toUpgradeBigNum(upg.lvlCapBn ?? 'Infinity', 'Infinity');
  const lvlBn = toUpgradeBigNum(startLevel ?? 0, 0);
  const roomBn = capBn.isInfinite?.()
    ? BigNum.fromAny('Infinity')
    : capBn.sub(lvlBn).floorToInteger();

  const { count, countBn, spent, nextPrice } =
    estimateFlatBulk(firstPrice, walletBn, roomBn);

  return { count: countBn, spent, nextPrice, numericCount: count };
}

  const ratioMinus1Log = Math.log10(ratioMinus1);
  if (!Number.isFinite(ratioMinus1Log)) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  const logTarget = log10OnePlusPow10(walletLog + ratioMinus1Log - startPriceLog);
  let approxCount = logTarget / ratioLog10;
  if (!Number.isFinite(approxCount) || approxCount < 0) approxCount = 0;

  let count = Math.floor(Math.min(limit, approxCount));
  if (!Number.isFinite(count)) count = limit;
  if (count <= 0) count = 1;

  const EPS = 1e-7;
  let spentLog = logSeriesTotal(upg, startLevelNum, count);
  let tuneSteps = 0;
  const MAX_TUNE_STEPS = 2048;

  while (count > 0 && (!Number.isFinite(spentLog) || spentLog > walletLog + EPS) && tuneSteps < MAX_TUNE_STEPS) {
    const overshoot = Number.isFinite(spentLog)
      ? Math.max(1, Math.ceil((spentLog - walletLog) / Math.max(ratioLog10, 1e-12)))
      : Math.max(1, Math.floor(count / 2));
    const reduced = Math.max(0, Math.floor(count - overshoot));
    if (reduced < count) {
      count = reduced;
    } else {
      const next = nextDownPositive(count);
      if (!(next < count)) break;
      count = next;
    }
    spentLog = count > 0 ? logSeriesTotal(upg, startLevelNum, count) : Number.NEGATIVE_INFINITY;
    tuneSteps += 1;
  }

  if (count <= 0 || !Number.isFinite(count)) {
    if (walletBn.cmp(firstPrice) >= 0) {
      count = 1;
      spentLog = approxLog10BigNum(firstPrice);
    } else {
      return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
    }
  }

  if (count < limit) {
  const safeTimes2 = (x) => {
    const y = x * 2;
    return Number.isFinite(y) ? y : Number.MAX_VALUE;
  };

  let lo = count;
  let hi = Math.min(limit, Math.max(count + 1, safeTimes2(count)));
  let hiLog = logSeriesTotal(upg, startLevelNum, hi);

  while (lo < hi && Number.isFinite(hiLog) && hiLog <= walletLog + EPS && hi < limit) {
    lo = hi;
    hi = Math.min(limit, safeTimes2(hi));
    hiLog = logSeriesTotal(upg, startLevelNum, hi);
  }

  let left = lo, right = hi;
  for (let i = 0; i < 256 && left < right; i += 1) {
    const mid = Math.floor((left + right + 1) / 2);
    const midLog = logSeriesTotal(upg, startLevelNum, mid);
    if (Number.isFinite(midLog) && midLog <= walletLog + EPS) {
      left = mid;
      spentLog = midLog;
    } else {
      right = mid - 1;
    }
  }
  count = left;
}

  let spent = null;
  if (!fastOnly) {
    spent = totalCostBigNum(upg, startLevelNum, count);
    let guard = 0;
    while (spent.cmp(walletBn) > 0 && count > 0 && guard < MAX_TUNE_STEPS) {
      const decremented = safeDecrementCount(count);
      if (!(decremented < count)) break;
      count = decremented;
      spent = totalCostBigNum(upg, startLevelNum, count);
      guard += 1;
    }
    if (count <= 0) {
      return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
    }

    if (count < limit && guard < MAX_TUNE_STEPS) {
      while (count < limit && guard < MAX_TUNE_STEPS) {
        const nextLevel = startLevelNum + count;
        let nextCost;

        try {
          if (Number.isFinite(nextLevel) && nextLevel < Number.MAX_SAFE_INTEGER / 2) {
            nextCost = BigNum.fromAny(upg.costAtLevel(nextLevel));
          } else {
            const nextLog = startPriceLog + (count * ratioLog10);
            nextCost = bigNumFromLog10(nextLog).floorToInteger();
          }
        } catch {
          break;
        }

        const newSpent = spent.add(nextCost);
        if (newSpent.cmp(walletBn) > 0) {
          break;
        }

        spent = newSpent;
        count += 1;
        guard += 1;
      }
    }
  }

let nextPrice = zero;

const canUseNumericFinal =
  !fastOnly &&
  Number.isFinite(startLevelNum) &&
  Number.isFinite(count) &&
  startLevelNum < Number.MAX_SAFE_INTEGER / 2 &&
  count < Number.MAX_SAFE_INTEGER / 2;

if (!fastOnly) {
  if (Number.isFinite(cap)) {
    const capRoom = Math.max(0, Math.floor(cap - Math.min(startLevelNum, cap)));
    if (count >= capRoom) {
      nextPrice = zero;
    } else if (canUseNumericFinal) {
      const finalLevel = Math.floor(startLevelNum + count);
      nextPrice = BigNum.fromAny(upg.costAtLevel(finalLevel));
    } else {
      // Fallback: compute via logs to avoid unsafe integer math
      const nextLog = startPriceLog + count * ratioLog10;
      nextPrice = bigNumFromLog10(nextLog);
    }
  } else {
    if (canUseNumericFinal) {
      const finalLevel = Math.floor(startLevelNum + count);
      nextPrice = BigNum.fromAny(upg.costAtLevel(finalLevel));
    } else {
      const nextLog = startPriceLog + count * ratioLog10;
      nextPrice = bigNumFromLog10(nextLog);
    }
  }
}

  const countBn = countToBigNum(count);
  return {
    count: countBn,
    spent,
    nextPrice,
    numericCount: count,
  };
}

function computeBulkMeta(upg) {
  try {
    const basePrice = BigNum.fromAny(upg.costAtLevel(0));
    const nextPrice = BigNum.fromAny(
      typeof upg.nextCostAfter === 'function'
        ? upg.nextCostAfter(basePrice, 1)
        : upg.costAtLevel(1)
    );
    const logBase = approxLog10BigNum(basePrice);
    const logNext = approxLog10BigNum(nextPrice);
    if (!Number.isFinite(logBase) || !Number.isFinite(logNext)) return null;
    const ratioLog = logNext - logBase;
    if (!Number.isFinite(ratioLog) || ratioLog <= 0) return null;
    const ratio = Math.pow(10, ratioLog);
    if (!Number.isFinite(ratio) || ratio <= 1) return null;
    const denom = ratio - 1;
    if (!(denom > 0) || !Number.isFinite(denom)) return null;
    return {
      ratio,
      ratioLog,
      logDenom: Math.log10(denom),
    };
  } catch {
    return null;
  }
}

export function estimateFlatBulk(priceBn, walletBn, roomBn) {
  // Guardrails
  if (!(priceBn instanceof BigNum)) priceBn = BigNum.fromAny(priceBn ?? 0);
  if (!(walletBn instanceof BigNum)) walletBn = BigNum.fromAny(walletBn ?? 0);
  if (!(roomBn instanceof BigNum)) roomBn = BigNum.fromAny(roomBn ?? 0);
  if (priceBn.isZero?.()) return { count: 0 };
  if (walletBn.isZero?.()) return { count: 0 };

const wPlain = walletBn.toPlainIntegerString?.();
const pPlain = priceBn.toPlainIntegerString?.();
if (wPlain && wPlain !== 'Infinity' && pPlain && pPlain !== 'Infinity') {
  const q = BigInt(wPlain) / BigInt(pPlain);
  let countBn = BigNum.fromAny(q.toString());
  if (!roomBn.isInfinite?.() && countBn.cmp(roomBn) > 0) countBn = roomBn;
  const spent = priceBn.mulBigNumInteger(countBn);
  return { count: levelCapToNumber(countBn), countBn, spent, nextPrice: priceBn };
}

const wl = approxLog10BigNum(walletBn);
const pl = approxLog10BigNum(priceBn);
if (!Number.isFinite(wl) || !Number.isFinite(pl) || wl < pl) return { count: 0 };
let countBn = bigNumFromLog10(wl - pl).floorToInteger();
  
  if (!roomBn.isInfinite?.() && countBn.cmp(roomBn) > 0) countBn = roomBn;
  
  const spent = priceBn.mulBigNumInteger(countBn);
  const nextPrice = priceBn;
  
  return { count: levelCapToNumber(countBn), countBn, spent, nextPrice };
}

export function estimateGeometricBulk(priceBn, walletBn, meta, maxLevels) {
  if (!meta || maxLevels <= 0) return { count: 0 };
  const walletLog = approxLog10BigNum(walletBn);
  const priceLog = approxLog10BigNum(priceBn);
  if (!Number.isFinite(walletLog) || !Number.isFinite(priceLog)) return { count: 0 };
  if (walletLog < priceLog) return { count: 0 };

  const numerator = walletLog - priceLog + meta.logDenom;
  if (!Number.isFinite(numerator) || numerator <= 0) return { count: 0 };

  let hi = Math.floor(numerator / meta.ratioLog);
  if (!Number.isFinite(hi) || hi <= 0) return { count: 0 };
  hi = Math.min(hi, maxLevels);
  if (hi <= 0) return { count: 0 };

  let lo = 0;
  let hiBound = hi;
  for (let iter = 0; iter < 64 && lo < hiBound; iter += 1) {
    const mid = Math.max(0, Math.floor((lo + hiBound + 1) / 2));
    const spentLog = priceLog + mid * meta.ratioLog - meta.logDenom;
    if (spentLog <= walletLog) {
      lo = mid;
    } else {
      hiBound = mid - 1;
    }
  }

  const best = Math.min(lo, maxLevels);
  if (best <= 0) return { count: 0 };
  const spentLog = priceLog + best * meta.ratioLog - meta.logDenom;
  if (spentLog > walletLog) return { count: 0 };
  const nextPriceLog = priceLog + best * meta.ratioLog;
  const spent = bigNumFromLog10(spentLog);
  const nextPrice = bigNumFromLog10(nextPriceLog);
  return {
    count: best,
    spent,
    nextPrice,
    spentLog,
    nextPriceLog,
  };
}

function toUpgradeBigNum(value, fallback) {
  try {
    return BigNum.fromAny(value ?? fallback ?? 0);
  } catch {
    return BigNum.fromAny(fallback ?? 0);
  }
}

function levelCapToNumber(bn) {
  if (!(bn instanceof BigNum)) return Infinity;
  if (bn.isInfinite?.()) return Infinity;
  try {
    const plain = bn.toPlainIntegerString();
    if (plain === 'Infinity') return Infinity;
    if (!plain) return 0;
    if (plain.length > 15) return Number.MAX_SAFE_INTEGER;
    const num = Number(plain);
    if (!Number.isFinite(num)) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, Math.floor(num));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function formatBigNumAsHtml(bn) {
  return formatNumber(bn instanceof BigNum ? bn : BigNum.fromAny(bn ?? 0));
}

export function formatMultForUi(value) {
  try {
    if (value && (value instanceof BigNum || value.toPlainIntegerString)) {
      const log10 = approxLog10BigNum(value);
      if (Number.isFinite(log10) && log10 < 3) {
        const approx = Math.pow(10, log10);
        return String(approx.toFixed(3))
          .replace(/\.0+$/, '')
          .replace(/(\.\d*?)0+$/, '$1');
      }
      return formatNumber(value);
    }

    const n = Number(value) || 0;
    if (Math.abs(n) < 1000) {
      return String(n.toFixed(3))
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1');
    }
    return formatNumber(n);
  } catch {
    return '1';
  }
}


function formatBigNumAsPlain(bn) {
  return formatBigNumAsHtml(bn).replace(/<[^>]*>/g, '');
}

function safeCloneBigNum(value) {
  if (value instanceof BigNum) {
    try { return value.clone?.() ?? BigNum.fromAny(value); }
    catch { return BigNum.fromInt(0); }
  }
  try {
    return BigNum.fromAny(value ?? 0);
  } catch {
    return BigNum.fromInt(0);
  }
}

function emitUpgradeLevelChange(upg, prevLevelNum, prevLevelBn, nextLevelNum, nextLevelBn) {
  if (!upg || typeof upg.onLevelChange !== 'function') return;

  const oldBn = safeCloneBigNum(prevLevelBn ?? prevLevelNum ?? 0);
  const newBn = safeCloneBigNum(nextLevelBn ?? nextLevelNum ?? 0);
  const payload = {
    upgrade: upg,
    oldLevel: Number.isFinite(prevLevelNum)
      ? prevLevelNum
      : levelBigNumToNumber(oldBn),
    newLevel: Number.isFinite(nextLevelNum)
      ? nextLevelNum
      : levelBigNumToNumber(newBn),
    oldLevelBn: oldBn,
    newLevelBn: newBn,
  };

  try {
    upg.onLevelChange(payload);
  } catch {}
}

function nmCostBN(upg, level) {
  return costAtLevelUsingScaling(upg, level);
}

export const AREA_KEYS = {
  STARTER_COVE: 'starter_cove',
};

function syncBookCurrencyMultiplierFromUpgrade(levelOverride) {
  const multHandle = bank?.books?.mult;
  if (!multHandle || typeof multHandle.set !== 'function') return;

  let resolvedLevel = 0;
  const xpUnlocked = safeIsXpUnlocked();
  if (xpUnlocked) {
    if (Number.isFinite(levelOverride)) {
      resolvedLevel = Math.max(0, Math.floor(levelOverride));
    } else {
      const storedLevel = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_VALUE_I);
      resolvedLevel = Math.max(0, Number.isFinite(storedLevel) ? storedLevel : 0);
    }
  }

  let multiplier;
  try {
    multiplier = bookValueMultiplierBn(resolvedLevel);
  } catch {
    multiplier = BigNum.fromInt(1);
  }

  try {
    multHandle.set(multiplier.clone?.() ?? multiplier);
  } catch {}
}

/**
 * upgType:
 *  - "NM" = No Milestones
 *  - "HM" = Has Milestones
 *
 * Optional field:
 *  - scaling: Manually change the multiplicative scaling ratio of an upgrade; not necessary for upgrades that have no scaling
 */
const REGISTRY = [
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 1,
    tie: UPGRADE_TIES.FASTER_COINS,
    title: "Faster Coins",
    desc: "Increases coin spawn rate by +10% per level",
    lvlCap: 10,
    baseCost: 10,
    costType: "coins",
    upgType: "NM",
    icon: "sc_upgrade_icons/faster_coins.png",
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Coin spawn rate bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(0.10),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 2,
    tie: UPGRADE_TIES.UNLOCK_XP,
    title: "Unlock XP",
    desc: "Unlocks the XP system and a new Merchant dialogue\nXP system: Collect Coins for XP to level up and gain Books\nEach XP Level also boosts Coin value by a decent amount",
    lvlCap: 1,
    upgType: "NM",
    icon: "stats/xp/xp.png",
    baseIconOverride: "img/stats/xp/xp_base.png",
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState: determineLockState,
    effectSummary() { return ""; },
    onLevelChange({ newLevel, newLevelBn }) {
      const reached = Number.isFinite(newLevel)
        ? newLevel >= 1
        : (newLevelBn?.cmp?.(BigNum.fromInt(1)) ?? -1) >= 0;
      if (reached) { try { unlockXpSystem(); } catch {} }
    },
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 3,
    tie: UPGRADE_TIES.FASTER_COINS_II,
    title: "Faster Coins II",
    desc: "Increases Coin spawn rate by +10% per level",
    lvlCap: 15,
    baseCost: 1,
    costType: "books",
    upgType: "NM",
    icon: "sc_upgrade_icons/faster_coins2.png",
    requiresUnlockXp: true,
    costAtLevel() { return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1); },
    nextCostAfter() { return this.costAtLevel(); },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Coin spawn rate bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(0.10),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 4,
    tie: UPGRADE_TIES.COIN_VALUE_I,
    title: "Coin Value",
    desc: "Increases Coin value by +50% per level",
    lvlCap: 100,
    baseCost: 1,
    costType: "books",
    upgType: "NM",
    icon: "sc_upgrade_icons/coin_val1.png",
    requiresUnlockXp: true,
    costAtLevel() { return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1); },
    nextCostAfter() { return this.costAtLevel(); },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Coin value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(0.50),
    onLevelChange() { try { refreshCoinMultiplierFromXpLevel(); } catch {} },
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 5,
    tie: UPGRADE_TIES.BOOK_VALUE_I,
    title: "Book Value",
    desc: "Doubles Books gained when increasing XP Level",
    lvlCap: 1,
    baseCost: 10,
    costType: "books",
    upgType: "NM",
    icon: "sc_upgrade_icons/book_val1.png",
    requiresUnlockXp: true,
    costAtLevel() { return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1); },
    nextCostAfter() { return this.costAtLevel(); },
    effectSummary(level) {
      const mult = bookValueMultiplierBn(level);
      return `Book value bonus: ${formatMultForUi(mult)}x`;
    },
    onLevelChange({ newLevel }) { syncBookCurrencyMultiplierFromUpgrade(newLevel); },
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 6,
    tie: UPGRADE_TIES.XP_VALUE_I,
    title: "XP Value",
    desc: "Increases XP value by +200% per level",
    lvlCap: 10,
    baseCost: 1000,
    costType: "coins",
    upgType: "NM",
    icon: "sc_upgrade_icons/xp_val1.png",
    requiresUnlockXp: true,
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `XP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addFlatPerLevel(2),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 7,
    tie: UPGRADE_TIES.UNLOCK_FORGE,
    title: "Unlock Forge",
    desc: "Unlocks the Reset tab and the Forge reset in the Delve menu",
    lvlCap: 1,
    upgType: "NM",
    icon: "misc/forge.png",
    baseIconOverride: "img/stats/mp/mp_base.png",
    requiresUnlockXp: true,
    revealRequirement: 'Reach XP Level 31 to reveal this upgrade',
    unlockUpgrade: true,
    costAtLevel() { return BigNum.fromInt(0); },
    nextCostAfter() { return BigNum.fromInt(0); },
    computeLockState: determineLockState,
    onLevelChange({ newLevel }) {
      if ((newLevel ?? 0) >= 1) {
        try { onForgeUpgradeUnlocked(); } catch {}
      }
    },
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 8,
    tie: UPGRADE_TIES.COIN_VALUE_II,
    title: "Coin Value II",
    desc: "Increases Coin value by +100% per level",
    lvlCap: 100,
    baseCost: 1,
    costType: "gold",
    upgType: "NM",
    icon: "sc_upgrade_icons/coin_val2.png",
    requiresUnlockXp: true,
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    computeLockState: determineLockState,
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `Coin value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(1),
    onLevelChange() { try { refreshCoinMultiplierFromXpLevel(); } catch {} },
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 9,
    tie: UPGRADE_TIES.XP_VALUE_II,
    title: "XP Value II",
    desc: "Increases XP value by +100% per level",
    lvlCap: 100,
    baseCost: 3,
    costType: "gold",
    upgType: "NM",
    icon: "sc_upgrade_icons/xp_val2.png",
    requiresUnlockXp: true,
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    computeLockState: determineLockState,
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `XP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(1),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 10,
    tie: UPGRADE_TIES.MP_VALUE_I,
    title: "MP Value",
    desc: "Increases MP value by +100% per level",
    lvlCap: 100,
    baseCost: 25,
    costType: "gold",
    upgType: "NM",
    icon: "sc_upgrade_icons/mp_val1.png",
    requiresUnlockXp: true,
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    computeLockState: determineLockState,
    effectSummary(level) {
      const mult = this.effectMultiplier(level);
      return `MP value bonus: ${formatMultForUi(mult)}x`;
    },
    effectMultiplier: E.addPctPerLevel(1),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 11,
    tie: UPGRADE_TIES.MAGNET,
    title: "Magnet",
    desc: "Increases Magnet radius by +1 Unit per level\nMagnet: Increases the distance from which you can collect Coins",
    lvlCap: 10,
    baseCost: 100,
    costType: "gold",
    upgType: "NM",
    icon: "sc_upgrade_icons/magnet.png",
    requiresUnlockXp: true,
    scaling: { ratio: 2 },
    costAtLevel(level) { return nmCostBN(this, level); },
    nextCostAfter(_, nextLevel) { return nmCostBN(this, nextLevel); },
    computeLockState: determineLockState,
    effectSummary(level) {
      const units = normalizedUpgradeLevel(level); // zero-based (+0 units at level 0)
      const unitsText = formatMultForUi(units);
      const suffix = (unitsText === '1') ? 'Unit' : 'Units';
      return `Magnet radius: ${unitsText} ${suffix}`;
    },
    effectMultiplier: E.addPctPerLevel(1),
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 12,
    tie: UPGRADE_TIES.ENDLESS_XP,
    title: "Endless XP",
    desc: "The first Milestone-type upgrade\nMilestones: Reach a certain upgrade level for powerful buffs\nMultiplies XP value by 1.2x per level",
    lvlCap: HM_EVOLUTION_INTERVAL,
    baseCost: 1_000_000,
    costType: "coins",
    upgType: "HM",
    icon: "sc_upg_icons/xp_val_hm.png",
    requiresUnlockXp: true,
    scalingPreset: 'HM',
    hmMilestones: [
      { level: 10, multiplier: 1.5, target: 'self' },
      { level: 25, multiplier: 2, target: 'self' },
      { level: 50, multiplier: 5, target: 'mp' },
      { level: 100, multiplier: 10, target: 'xp' },
      { level: 200, multiplier: 15, target: 'coin' },
      { level: 400, multiplier: 25, target: 'self' },
      { level: 800, multiplier: 100, target: 'self' },
    ],
    costAtLevel(level) { return costAtLevelUsingScaling(this, level); },
    nextCostAfter(_, nextLevel) { return costAtLevelUsingScaling(this, nextLevel); },
    computeLockState: determineLockState,
    effectSummary(level) {
      const lvlBn = ensureLevelBigNum(level);
      let baseMult;
      try { baseMult = this.effectMultiplier(lvlBn); }
      catch { baseMult = 1; }
      const { selfMult } = computeHmMultipliers(this, lvlBn, this.area);
      const total = safeMultiplyBigNum(baseMult, selfMult);
      return `XP value bonus: ${formatMultForUi(total)}x`;
    },
    effectMultiplier: E.powPerLevel(1.2),
  },
];

for (const upg of REGISTRY) {
  const tieKey = normalizeUpgradeTie(upg.tie ?? upg.tieKey);
  upg.tieKey = tieKey;
  if (tieKey && !upgradeTieLookup.has(tieKey)) {
    upgradeTieLookup.set(tieKey, upg);
  }
  upg.baseCost = toUpgradeBigNum(upg.baseCost ?? 0, 0);
  upg.baseCostBn = upg.baseCost;
  upg.numUpgEvolutions = normalizeHmEvolutionCount(upg.numUpgEvolutions);
  if (upg.upgType === 'HM') {
    applyHmEvolutionMeta(upg, upg.numUpgEvolutions);
  } else {
    upg.lvlCapBn = toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
    upg.lvlCap = levelCapToNumber(upg.lvlCapBn);
    upg.lvlCapFmtHtml = formatBigNumAsHtml(upg.lvlCapBn);
    upg.lvlCapFmtText = formatBigNumAsPlain(upg.lvlCapBn);
  }

  const isSingleLevelCap = Number.isFinite(upg.lvlCap) && Math.max(0, Math.floor(upg.lvlCap)) === 1;
  const isBookValueUpgrade = tieKey === BOOK_VALUE_TIE_KEY;
  if (isSingleLevelCap && !isBookValueUpgrade) {
    upg.unlockUpgrade = true;
    upg.baseCost = BigNum.fromInt(0);
    upg.baseCostBn = upg.baseCost;
    upg.costAtLevel = () => BigNum.fromInt(0);
    upg.nextCostAfter = () => BigNum.fromInt(0);
  }

  upg.bulkMeta = computeBulkMeta(upg);
  ensureUpgradeScaling(upg);
}

/* ----------------------- Storage (per slot, per area) ---------------------- */

const areaStatePayloadCache = new Map(); // key → last serialized payload
const areaStateMemoryCache = new Map(); // key → last parsed array reference
const upgradeStateCache = new Map(); // key → { areaKey, upgId, upg, rec, arr, lvl, nextCostBn }
const areaUpgradeOrderCache = new Map();

function getAreaUpgradeOrder(areaKey) {
  const normalizedArea = normalizeAreaKey(areaKey);
  if (!normalizedArea) return null;

  if (areaUpgradeOrderCache.has(normalizedArea)) {
    return areaUpgradeOrderCache.get(normalizedArea);
  }

  const order = new Map();
  let rank = 0;
  for (const upg of REGISTRY) {
    if (normalizeAreaKey(upg?.area) !== normalizedArea) continue;
    const normalizedId = normalizeUpgradeId(upg?.id);
    if (normalizedId == null || order.has(normalizedId)) continue;
    order.set(normalizedId, rank);
    rank += 1;
  }

  areaUpgradeOrderCache.set(normalizedArea, order);
  return order;
}

function normalizeAreaStateRecordOrder(areaKey, arr) {
  if (!Array.isArray(arr) || arr.length <= 1) return false;
  const order = getAreaUpgradeOrder(areaKey);
  if (!(order?.size)) return false;

  const baseRank = order.size;
  const entries = arr.map((rec, idx) => {
    const normalizedId = normalizeUpgradeId(rec?.id);
    const rank = order.has(normalizedId)
      ? order.get(normalizedId)
      : baseRank + idx;
    return { rec, rank, idx };
  });

  let needsSort = false;
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (curr.rank < prev.rank || (curr.rank === prev.rank && curr.idx < prev.idx)) {
      needsSort = true;
      break;
    }
  }

  if (!needsSort) return false;

  entries.sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx));
  arr.length = 0;
  for (const entry of entries) arr.push(entry.rec);
  return true;
}

function parseUpgradeStateArray(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStateFromAvailableStorage(key, options = {}) {
  const {
    includeLocal = true,
  } = options || {};

  const result = {
    data: null,
    raw: null,
    storageChecked: false,
    storageFound: false,
    checkedLocal: false,
    foundLocal: false,
    sourceType: null,
  };

  if (!key) return result;

  const storages = [];
  try {
    if (includeLocal && typeof localStorage !== 'undefined') {
      storages.push({ storage: localStorage, type: 'local' });
      result.storageChecked = true;
      result.checkedLocal = true;
    }
  } catch {}

  for (const entry of storages) {
    const { storage, type } = entry || {};
    const getItem = storage?.getItem;
    if (typeof getItem !== 'function') continue;
    let raw;
    try { raw = getItem.call(storage, key); }
    catch { raw = null; }
    if (raw != null) {
      result.storageFound = true;
      if (type === 'local') result.foundLocal = true;
    }
    const parsed = parseUpgradeStateArray(raw);
    if (parsed) {
      const payload = typeof raw === 'string' && raw ? raw : (() => {
        try { return JSON.stringify(parsed); } catch { return null; }
      })();
      result.data = parsed;
      result.raw = payload;
      result.sourceType = type;
      return result;
    }
  }

  return result;
}

function cacheAreaState(key, arr, raw) {
  if (!key) return;
  if (Array.isArray(arr)) {
    areaStateMemoryCache.set(key, arr);
  }
  if (typeof raw === 'string') {
    areaStatePayloadCache.set(key, raw);
  }
}

function clearCachedAreaState(storageKey) {
  if (!storageKey) return;
  areaStateMemoryCache.delete(storageKey);
  areaStatePayloadCache.delete(storageKey);
}

function clearCachedUpgradeStates(areaKey, slot) {
  const slotKey = slot == null ? 'null' : String(slot);
  const prefix = `${slotKey}:${areaKey}:`;
  for (const key of upgradeStateCache.keys()) {
    if (key.startsWith(prefix)) {
      upgradeStateCache.delete(key);
    }
  }
}

function keyForArea(areaKey, slot = getActiveSlot()) {
  if (slot == null) return null;
  return `ccc:upgrades:${areaKey}:${slot}`;
}

const upgradeStorageWatcherCleanup = new Map();
let upgradeStorageWatcherBoundSlot = null;

function cleanupUpgradeStorageWatchers() {
  upgradeStorageWatcherCleanup.forEach((stop) => {
    try { stop?.(); } catch {}
  });
  upgradeStorageWatcherCleanup.clear();
}

function handleUpgradeStorageChange(areaKey, slot, storageKey, rawPayload, meta = {}) {
  if (!storageKey) return;
  const { rawChanged, valueChanged } = meta;
  if (!rawChanged && !valueChanged) return;

  try {
    if (typeof rawPayload === 'string') {
      const arr = parseUpgradeStateArray(rawPayload);
      if (arr) {
        cacheAreaState(storageKey, arr, rawPayload);
      } else {
        clearCachedAreaState(storageKey);
      }
    } else {
      clearCachedAreaState(storageKey);
    }
  } catch {
    clearCachedAreaState(storageKey);
  }

  clearCachedUpgradeStates(areaKey, slot);
  notifyChanged();
}

function bindUpgradeStorageWatchersForSlot(slot) {
  if (slot === upgradeStorageWatcherBoundSlot) return;
  cleanupUpgradeStorageWatchers();
  upgradeStorageWatcherBoundSlot = slot ?? null;
  if (slot == null) return;

  for (const areaKey of Object.values(AREA_KEYS)) {
    const storageKey = keyForArea(areaKey, slot);
    if (!storageKey) continue;
    const stop = watchStorageKey(storageKey, {
      parse: (raw) => (typeof raw === 'string' ? raw : null),
      onChange: (rawPayload, meta) => {
        if (!meta?.rawChanged && !meta?.valueChanged) return;
        handleUpgradeStorageChange(areaKey, slot, storageKey, rawPayload, meta);
      },
    });
    upgradeStorageWatcherCleanup.set(storageKey, stop);
  }
}

if (typeof window !== 'undefined') {
  bindUpgradeStorageWatchersForSlot(getActiveSlot());
  window.addEventListener('saveSlot:change', () => {
    bindUpgradeStorageWatchersForSlot(getActiveSlot());
  });
}

function loadAreaState(areaKey, slot = getActiveSlot(), options = {}) {
  const { forceReload = false } = options || {};
  const storageKey = keyForArea(areaKey, slot);
  if (!storageKey) return [];

  const backupKey = `${storageKey}:backup`;
  const primary = readStateFromAvailableStorage(storageKey, {
    includeLocal: true,
  });
  const backup = readStateFromAvailableStorage(backupKey, {
    includeLocal: true,
  });

  if (primary.storageChecked && !primary.storageFound && backup.data) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(backupKey);
      }
    } catch {}

    clearCachedAreaState(storageKey);
    clearCachedUpgradeStates(areaKey, slot);
    return [];
  }
  
  if (primary.data) {
    const normalized = normalizeAreaStateRecordOrder(areaKey, primary.data);
    if (normalized) {
      saveAreaState(areaKey, primary.data, slot);
    } else {
      cacheAreaState(storageKey, primary.data, primary.raw);
    }
    if (backup.storageFound) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(backupKey);
        }
      } catch {}
    }
    return primary.data;
  }

  if (backup.data) {
    const normalized = normalizeAreaStateRecordOrder(areaKey, backup.data);
    if (normalized) {
      saveAreaState(areaKey, backup.data, slot);
    } else {
      cacheAreaState(storageKey, backup.data, backup.raw);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const backupPayload = backup.raw ?? JSON.stringify(backup.data);
        localStorage.setItem(storageKey, backupPayload);
        localStorage.removeItem(backupKey);
      }
    } catch {}
    return backup.data;
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(backupKey);
    }
  } catch {}

  const storagesChecked = primary.storageChecked || backup.storageChecked;
  const storageHadValue = primary.storageFound || backup.storageFound;

  if (!forceReload && !storagesChecked) {
    const cached = areaStateMemoryCache.get(storageKey);
    if (Array.isArray(cached)) {
      normalizeAreaStateRecordOrder(areaKey, cached);
      return cached;
    }

    const cachedPayload = areaStatePayloadCache.get(storageKey);
    const parsed = parseUpgradeStateArray(cachedPayload);
    if (parsed) {
      const normalized = normalizeAreaStateRecordOrder(areaKey, parsed);
      if (normalized) {
        saveAreaState(areaKey, parsed, slot);
      } else {
        cacheAreaState(storageKey, parsed, cachedPayload);
      }
      return parsed;
    }
  }

  if (!storageHadValue) {
    clearCachedAreaState(storageKey);
    clearCachedUpgradeStates(areaKey, slot);
  }

  return [];
}

function saveAreaState(areaKey, stateArr, slot = getActiveSlot()) {
  const storageKey = keyForArea(areaKey, slot);
  if (!storageKey) return;

  const arr = Array.isArray(stateArr) ? stateArr : [];
  normalizeAreaStateRecordOrder(areaKey, arr);
  let payload = null;
  try {
    payload = JSON.stringify(arr);
  } catch {
    try { payload = JSON.stringify([]); }
    catch { payload = '[]'; }
  }

  cacheAreaState(storageKey, arr, payload);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, payload);
      try { primeStorageWatcherSnapshot(storageKey, payload); } catch {}
    }
  } catch {}

  try {
    const verify = localStorage.getItem(storageKey);
    if (verify !== payload) {
      localStorage.setItem(storageKey, payload);
      try { primeStorageWatcherSnapshot(storageKey, payload); } catch {}
    }
  } catch {}

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${storageKey}:backup`);
    }
  } catch {}
}

function resolveUpgradeIdentifier(areaKey, upgId) {
  if (upgId && typeof upgId === 'object' && typeof upgId.id !== 'undefined') {
    return normalizeUpgradeId(upgId.id);
  }
  const normalized = normalizeUpgradeId(upgId);
  if (typeof normalized === 'number' || normalized == null) {
    return normalized;
  }
  if (typeof normalized === 'string') {
    const tieKey = normalizeUpgradeTie(normalized);
    if (tieKey) {
      const upg = upgradeTieLookup.get(tieKey);
      if (upg) {
        const requestedArea = normalizeAreaKey(areaKey);
        if (!requestedArea || normalizeAreaKey(upg.area) === requestedArea) {
          return normalizeUpgradeId(upg.id);
        }
      }
    }
  }
  return normalized;
}

function upgradeCacheKey(areaKey, upgId, slot = getActiveSlot()) {
  const slotKey = slot == null ? 'null' : String(slot);
  const resolvedId = resolveUpgradeIdentifier(areaKey, upgId);
  return `${slotKey}:${areaKey}:${normalizeUpgradeId(resolvedId)}`;
}

function ensureUpgradeState(areaKey, upgId) {
  const resolvedId = resolveUpgradeIdentifier(areaKey, upgId);
  const normalizedId = normalizeUpgradeId(resolvedId);
  const slot = getActiveSlot();
  const key = upgradeCacheKey(areaKey, normalizedId, slot);
  let state = upgradeStateCache.get(key);
  if (state) return state;

  const upg = getUpgrade(areaKey, normalizedId);
  const arr = loadAreaState(areaKey, slot);
  let rec = arr.find(u => u && normalizeUpgradeId(u.id) === normalizedId);
  let recNeedsSave = false;
  if (!rec) {
    rec = { id: normalizedId, lvl: BigNum.fromInt(0).toStorage() };
    if (upg) {
      try {
        rec.nextCost = BigNum.fromAny(upg.costAtLevel(0)).toStorage();
      } catch {
        rec.nextCost = BigNum.fromInt(0).toStorage();
      }
    }
    rec.nextCostLvl = rec.lvl;
    arr.push(rec);
    saveAreaState(areaKey, arr, slot);
  } else if (rec.id !== normalizedId) {
    rec.id = normalizedId;
    recNeedsSave = true;
  }

  let hmEvolutions = 0;
  if (upg?.upgType === 'HM') {
    hmEvolutions = normalizeHmEvolutionCount(
      rec.hmEvolutions ?? rec.evolutions ?? rec.evol ?? upg.numUpgEvolutions
    );
    applyHmEvolutionMeta(upg, hmEvolutions);
  }

  const lvlBn = ensureLevelBigNum(rec.lvl);
  let lvl = levelBigNumToNumber(lvlBn);
try {
  const capBn = upg?.lvlCapBn ?? BigNum.fromAny('Infinity');
  if (!(capBn.isInfinite?.()) && lvlBn.cmp(capBn) > 0) {
    const clamped = capBn.clone?.() ?? capBn;
    lvl = levelBigNumToNumber(clamped);
    const clampedStorage = clamped.toStorage();
    rec.lvl = clampedStorage;
    rec.nextCost = BigNum.fromInt(0).toStorage();
    rec.nextCostLvl = clampedStorage;
    saveAreaState(areaKey, arr, slot);
  }
} catch {}

  let normalizedLvlStorage = null;
  try {
    normalizedLvlStorage = lvlBn?.toStorage?.() ?? ensureLevelBigNum(lvl).toStorage();
  } catch {}
  if (normalizedLvlStorage && rec.lvl !== normalizedLvlStorage) {
    rec.lvl = normalizedLvlStorage;
    recNeedsSave = true;
  }

  const costLevelStorage = typeof rec.nextCostLvl === 'string' ? rec.nextCostLvl : null;
  let nextCostStale = !costLevelStorage || costLevelStorage !== normalizedLvlStorage;

  let nextCostBn = null;
  if (!nextCostStale && rec.nextCost != null) {
    try {
      nextCostBn = BigNum.fromAny(rec.nextCost);
    } catch {
      nextCostBn = null;
      nextCostStale = true;
    }
  }

  if (!nextCostBn || nextCostStale) {
    if (upg) {
      try {
        nextCostBn = BigNum.fromAny(upg.costAtLevel(lvl));
      } catch {
        nextCostBn = BigNum.fromInt(0);
      }
    } else {
      nextCostBn = BigNum.fromInt(0);
    }
    try {
      rec.nextCost = nextCostBn.toStorage();
      if (normalizedLvlStorage) {
        rec.nextCostLvl = normalizedLvlStorage;
      } else {
        delete rec.nextCostLvl;
      }
      recNeedsSave = true;
    } catch {}
  }

  if (recNeedsSave) {
    try { saveAreaState(areaKey, arr, slot); }
    catch {}
  }

  if (upg?.upgType === 'HM' && lvlBn?.isInfinite?.()) {
    if (!upg.lvlCapBn?.isInfinite?.()) {
      const infCap = BigNum.fromAny('Infinity');
      upg.lvlCapBn = infCap;
      upg.lvlCap = Number.POSITIVE_INFINITY;
      upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
      upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
    }
  }

  state = { areaKey, upgId: normalizedId, upg, rec, arr, lvl, lvlBn, nextCostBn, slot, hmEvolutions };
  upgradeStateCache.set(key, state);
  return state;
}

function commitUpgradeState(state) {
  if (!state) return;
  const { areaKey } = state;
  const slot = state.slot ?? getActiveSlot();
  if (!areaKey || slot == null) return;

  const normalizedId = normalizeUpgradeId(state.upgId ?? state.rec?.id);
  let arr = loadAreaState(areaKey, slot, { forceReload: true });
  if (!Array.isArray(arr)) arr = [];

  let rec = arr.find(u => u && normalizeUpgradeId(u.id) === normalizedId);
  if (!rec) {
    rec = { id: normalizedId };
    arr.push(rec);
  } else if (rec.id !== normalizedId) {
    rec.id = normalizedId;
  }

try {
  const capBn = state.upg?.lvlCapBn ?? BigNum.fromAny('Infinity');
  let inBn = state.lvlBn?.clone?.() ?? ensureLevelBigNum(state.lvlBn ?? state.lvl);
  if (!(capBn.isInfinite?.()) && inBn.cmp(capBn) > 0) {
    inBn = capBn.clone?.() ?? capBn;
    state.lvlBn = inBn;
    state.lvl = levelBigNumToNumber(inBn);
  }
} catch {}

  try {
    rec.lvl = state.lvlBn?.toStorage?.() ?? ensureLevelBigNum(state.lvlBn ?? state.lvl).toStorage();
  } catch {
    rec.lvl = ensureLevelBigNum(state.lvl ?? 0).toStorage();
  }
  const currentLvlStorage = rec.lvl;

  if (state.nextCostBn != null) {
    try {
      rec.nextCost = BigNum.fromAny(state.nextCostBn).toStorage();
    } catch {
      try { rec.nextCost = BigNum.fromAny(state.nextCostBn ?? 0).toStorage(); }
      catch { rec.nextCost = BigNum.fromInt(0).toStorage(); }
    }
    rec.nextCostLvl = currentLvlStorage;
  } else {
    delete rec.nextCostLvl;
  }

  if (state.hmEvolutions != null) {
    rec.hmEvolutions = normalizeHmEvolutionCount(state.hmEvolutions);
  }

  saveAreaState(areaKey, arr, slot);
  state.rec = rec;
  state.arr = arr;
  state.slot = slot;
}

function invalidateUpgradeState(areaKey, upgId, slot = getActiveSlot()) {
  upgradeStateCache.delete(upgradeCacheKey(areaKey, upgId, slot));
}

export function getLevelNumber(areaKey, upgId) {
  return ensureUpgradeState(areaKey, upgId).lvl;
}

export function getHmEvolutions(areaKey, upgId) {
  return ensureUpgradeState(areaKey, upgId).hmEvolutions ?? 0;
}

export function getMpValueMultiplierBn() {
  let mult = hundredPercentPerLevelMultiplier(
    getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MP_VALUE_I)
  );
  try {
    const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
    const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
    const { mpMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
    mult = safeMultiplyBigNum(mult, mpMult);
  } catch {}
  return mult;
}

export function getMagnetLevel() {
  const lvl = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MAGNET);
  if (!Number.isFinite(lvl)) {
    return 0;
  }
  return Math.max(0, Math.floor(lvl));
}

function computeUpgradeLockStateFor(areaKey, upg) {
  if (!upg) return { locked: false };

  const xpUnlocked = safeIsXpUnlocked();
  const xpLevelBn = xpUnlocked ? currentXpLevelBigNum() : BigNum.fromInt(0);
  const xpLevel = xpUnlocked ? levelBigNumToNumber(xpLevelBn) : 0;

  let baseState = { locked: false };
if (upg.requiresUnlockXp && !xpUnlocked) {
  const isXpAdj = isXpAdjacentUpgrade(areaKey, upg);
  const xpRevealText = 'Unlock the XP system to reveal this upgrade';
  const unlockXpVisible = safeHasMetMerchant();

  if (isXpAdj) {
    if (!unlockXpVisible) {
      const meetText = 'Meet the Merchant to reveal "Unlock XP"';
      baseState = {
        locked: true,
        iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
        titleOverride: LOCKED_UPGRADE_TITLE,
        descOverride: meetText,
        reason: meetText,
        hidden: false,
        hideCost: false,
        hideEffect: false,
        useLockedBase: true,
      };
    } else {
      // XP-adjacent tiles show as mysterious (“?”)
      baseState = {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: xpRevealText,
        reason: xpRevealText,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
      };
    }
  } else {
    // Everyone else is a plain locked padlock (not mysterious / not clickable)
    baseState = {
      locked: true,
      iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
      titleOverride: LOCKED_UPGRADE_TITLE,
      descOverride: xpRevealText,
      reason: 'Purchase "Unlock XP" to reveal this upgrade',
      hidden: false,
      hideCost: false,
      hideEffect: false,
      useLockedBase: true,
    };
  }
}

  let state = mergeLockStates({ locked: false }, baseState);
  if (typeof upg.computeLockState === 'function') {
    try {
      const ctx = {
        areaKey,
        upg,
        xpUnlocked,
        xpLevelBn,
        xpLevel,
        baseLocked: state.locked,
        getUpgradeLevel(targetId) { return getLevelNumber(areaKey, targetId); },
      };
      const custom = upg.computeLockState(ctx);
      state = mergeLockStates(state, custom);
    } catch {}
  }

  const slot = getActiveSlot();
  const revealKey = upgradeRevealKey(areaKey, upg);
  const permaUnlocked = revealKey ? isUpgradePermanentlyUnlocked(areaKey, upg, slot) : false;
  if (revealKey) {
    const revealState = ensureShopRevealState(slot);
    const permaState  = ensureShopPermaUnlockState(slot);
    const permaMystState = ensureShopPermaMystState(slot);
    const hyphenKey   = revealKey.replace(/_/g, '-');
    const legacyKey   = upgradeLegacyRevealKey(areaKey, upg);

    let needsRevealSave = false;
    if (migrateUpgradeStateKey(revealState, hyphenKey, revealKey)) {
      needsRevealSave = true;
    }
    if (legacyKey && migrateUpgradeStateKey(revealState, legacyKey, revealKey)) {
      needsRevealSave = true;
    }
    if (needsRevealSave) {
      saveShopRevealState(revealState, slot);
    }

    let needsPermaSave = false;
    if (migrateUpgradeStateKey(permaState, hyphenKey, revealKey)) {
      needsPermaSave = true;
    }
    if (legacyKey && migrateUpgradeStateKey(permaState, legacyKey, revealKey)) {
      needsPermaSave = true;
    }
    if (needsPermaSave) {
      saveShopPermaUnlockState(permaState, slot);
    }

    let needsPermaMystSave = false;
    if (migrateUpgradeStateKey(permaMystState, hyphenKey, revealKey)) {
      needsPermaMystSave = true;
    }
    if (legacyKey && migrateUpgradeStateKey(permaMystState, legacyKey, revealKey)) {
      needsPermaMystSave = true;
    }
    if (needsPermaMystSave) {
      saveShopPermaMystState(permaMystState, slot);
    }
  }

  if (state.locked) {
    const hiddenState = !!state.hidden;
    if (!state.iconOverride) state.iconOverride = LOCKED_UPGRADE_ICON_DATA_URL;

    if (hiddenState) {
      if (!state.titleOverride) state.titleOverride = HIDDEN_UPGRADE_TITLE;
    } else if (!state.titleOverride || state.titleOverride === HIDDEN_UPGRADE_TITLE) {
      state.titleOverride = LOCKED_UPGRADE_TITLE;
    }

    if (state.useLockedBase == null) state.useLockedBase = true;
    if (!state.reason && upg?.revealRequirement) state.reason = upg.revealRequirement;

    if (!state.descOverride) {
      if (state.reason) {
        state.descOverride = `${state.reason}`;
      } else if (upg?.revealRequirement) {
        state.descOverride = upg.revealRequirement;
      } else if (hiddenState) {
        state.descOverride = 'This upgrade is currently hidden.';
      }
    }
  } else {
    state.hidden = false;
    state.hideCost = false;
    state.hideEffect = false;
    state.useLockedBase = false;
    if (state.iconOverride === LOCKED_UPGRADE_ICON_DATA_URL ||
        state.iconOverride === MYSTERIOUS_UPGRADE_ICON_DATA_URL) {
      delete state.iconOverride;
    }
    if (state.titleOverride === HIDDEN_UPGRADE_TITLE ||
        state.titleOverride === LOCKED_UPGRADE_TITLE) {
      delete state.titleOverride;
    }
    delete state.descOverride;
    delete state.reason;
  }

  if (state.locked && upg.requiresUnlockXp && !xpUnlocked && !state.iconOverride) {
    state.iconOverride = LOCKED_UPGRADE_ICON_DATA_URL;
  }

  if (revealKey) {
    const revealState = ensureShopRevealState(slot);
    const rec = revealState.upgrades[revealKey] || {};
    const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
    const isForgePlaceholder = tieKey && FORGE_PLACEHOLDER_TIES.has(tieKey);

    let storedStatus = rec.status || 'locked';

    if (isUpgradePermanentlyUnlocked(areaKey, upg, slot)) {
      storedStatus = 'unlocked';
    } else if (
      isUpgradePermanentlyMysterious(areaKey, upg, slot) &&
      storedStatus === 'locked'
    ) {
      let xpReached31 = false;
      try { xpReached31 = levelBigNumToNumber(currentXpLevelBigNum()) >= 31; } catch {}

      storedStatus = (isForgePlaceholder && !xpReached31) ? 'locked' : 'mysterious';
    }

    let storedRank = shopStatusRank(storedStatus);

    let currentStatus = classifyUpgradeStatus(state);
    let currentRank = shopStatusRank(currentStatus);

    const applyStoredMysterious = () => {
      state.locked = true;

      const snap = rec.snapshot;
      if (snap && typeof snap === 'object') {
        state = mergeLockStates(state, snap);
      }

      state.iconOverride  = MYSTERIOUS_UPGRADE_ICON_DATA_URL;
      state.titleOverride = HIDDEN_UPGRADE_TITLE;

      const reasonText =
        upg?.revealRequirement ||
        state.reason ||
        state.descOverride ||
        'This upgrade is currently hidden.';
      state.descOverride = reasonText;
      if (!state.reason && upg?.revealRequirement) state.reason = upg.revealRequirement;

      state.hidden      = true;
      state.hideCost    = true;
      state.hideEffect  = true;
      state.useLockedBase = true;
    };

    if (storedRank > currentRank) {
      if (storedStatus === 'unlocked') {
        state.locked = false;
        state.hidden = false;
        state.hideCost = false;
        state.hideEffect = false;
        state.useLockedBase = false;
      } else if (storedStatus === 'mysterious') {
        applyStoredMysterious();
      }
      currentStatus = classifyUpgradeStatus(state);
      currentRank = shopStatusRank(currentStatus);
    }

    let shouldSave = false;
    let normalizedStatus = (rec && typeof rec === 'object' && typeof rec.status === 'string')
      ? rec.status
      : 'locked';

    const isForgePlaceholderForSave = isForgePlaceholder;

    let xpReached31Now = false;
    try { xpReached31Now = levelBigNumToNumber(currentXpLevelBigNum()) >= 31; } catch {}

    if (isForgePlaceholderForSave && !xpReached31Now && normalizedStatus === 'mysterious') {
      normalizedStatus = 'locked';
    }

    if (!rec || typeof rec !== 'object' || Object.keys(rec).length !== 1 || rec.status !== normalizedStatus) {
      revealState.upgrades[revealKey] = { status: normalizedStatus };
      shouldSave = true;
    }

    if (currentRank > storedRank) {
      rec.status = currentStatus;
      revealState.upgrades[revealKey] = { status: rec.status };
      shouldSave = true;

      storedStatus = currentStatus;
      storedRank   = currentRank;

      if (currentStatus === 'unlocked') {
        markUpgradePermanentlyUnlocked(areaKey, upg, slot);
      } else if (currentStatus === 'mysterious') {
        let xpReached31 = false;
        try { xpReached31 = levelBigNumToNumber(currentXpLevelBigNum()) >= 31; } catch {}

        if (!isForgePlaceholder || xpReached31) {
          markUpgradePermanentlyMysterious(areaKey, upg, slot);
        }
      }
    }

    if (storedStatus === 'unlocked') {
      state.locked = false;
      state.hidden = false;
      state.hideCost = false;
      state.hideEffect = false;
      state.useLockedBase = false;

      if (state.iconOverride === LOCKED_UPGRADE_ICON_DATA_URL ||
          state.iconOverride === MYSTERIOUS_UPGRADE_ICON_DATA_URL) {
        delete state.iconOverride;
      }
      if (state.titleOverride === HIDDEN_UPGRADE_TITLE ||
          state.titleOverride === LOCKED_UPGRADE_TITLE) {
        delete state.titleOverride;
      }
      delete state.descOverride;
      delete state.reason;

      if (rec.status !== 'unlocked') {
        revealState.upgrades[revealKey] = { status: 'unlocked' };
        shouldSave = true;
      }
      markUpgradePermanentlyUnlocked(areaKey, upg, slot);

    } else if (storedStatus === 'mysterious' && currentStatus !== 'mysterious') {
      applyStoredMysterious();
      currentStatus = classifyUpgradeStatus(state);
      currentRank = shopStatusRank(currentStatus);
    }

    if (shouldSave) saveShopRevealState(revealState, slot);
  }
  
  return state;
}

function isUpgradeLocked(areaKey, upg) {
  return !!computeUpgradeLockStateFor(areaKey, upg).locked;
}

function isHmReadyToEvolve(upg, lvlBn, evolutions = null) {
  if (!upg || upg.upgType !== 'HM') return false;
  const safeEvol = Number.isFinite(evolutions)
    ? evolutions
    : activeEvolutionsForUpgrade(upg);
  const { capBn, cap } = hmLevelCapForEvolutions(safeEvol);
  try { return lvlBn?.cmp?.(capBn) >= 0; }
  catch {}
  const lvlNum = levelBigNumToNumber(lvlBn);
  return Number.isFinite(lvlNum) && lvlNum >= cap;
}

export function getLevel(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  if (state.lvlBn?.clone) return state.lvlBn.clone();
  return ensureLevelBigNum(state.lvl ?? 0);
}

export function peekNextPrice(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return BigNum.fromInt(0);

  if (state.nextCostBn && !state.nextCostBn.isZero?.()) {
    return state.nextCostBn.clone?.() ?? BigNum.fromAny(state.nextCostBn);
  }

  const lvlBn  = state.lvlBn ?? ensureLevelBigNum(state.lvl ?? 0);
  const nextBn = lvlBn.add(BigNum.fromInt(1));
  const nextNum = levelBigNumToNumber(nextBn);
  try {
    return BigNum.fromAny(upg.costAtLevel(nextNum));
  } catch {
    return BigNum.fromInt(0);
  }
}


export function setLevel(areaKey, upgId, lvl, clampToCap = true) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  const cap = upg?.lvlCap ?? Infinity;
  const prevLevelNum = state.lvl;
  const prevLevelBn = safeCloneBigNum(state.lvlBn ?? ensureLevelBigNum(state.lvl ?? 0));
  let desiredBn = ensureLevelBigNum(lvl);
  if (desiredBn.isInfinite?.()) {
    desiredBn = BigNum.fromAny('Infinity');
  }
   let nextBn = desiredBn;
  try {
    if (upg && isInfinityLevelForScaled(upg, nextBn)) {
      nextBn = BigNum.fromAny('Infinity');
    }
  } catch {}
  if (clampToCap && Number.isFinite(cap)) {
    const capBn = ensureLevelBigNum(cap);
    if (nextBn.cmp(capBn) > 0) nextBn = capBn;
  }
  if (clampToCap && Number.isFinite(cap)) {
    const capBn = ensureLevelBigNum(cap);
    if (nextBn.cmp(capBn) > 0) nextBn = capBn;
  }

  if (state.lvlBn?.cmp && state.lvlBn.cmp(nextBn) === 0) return state.lvl;
  const nextNum = levelBigNumToNumber(nextBn);

  if (!upg) {
    state.lvl = nextNum;
    state.lvlBn = nextBn;
    state.nextCostBn = BigNum.fromInt(0);
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    notifyChanged();
    return state.lvl;
  }

  state.lvl = nextNum;
  state.lvlBn = nextBn;
  try {
    state.nextCostBn = BigNum.fromAny(upg.costAtLevel(nextNum));
  } catch {
    state.nextCostBn = BigNum.fromInt(0);
  }

  commitUpgradeState(state);
  invalidateUpgradeState(areaKey, upgId);
  emitUpgradeLevelChange(upg, prevLevelNum, prevLevelBn, state.lvl, state.lvlBn);
  notifyChanged();
  return state.lvl;
}

/* ---------------------------- Registry helpers ---------------------------- */

export function getUpgradesForArea(areaKey) {
  return REGISTRY.filter(u => u.area === areaKey);
}

export function getUpgrade(areaKey, upgId) {
  const normalizedArea = normalizeAreaKey(areaKey);
  const normalizedId = normalizeUpgradeId(upgId);
  const tieKey = (typeof normalizedId === 'string')
    ? normalizeUpgradeTie(normalizedId)
    : normalizeUpgradeTie(upgId);
  return REGISTRY.find((u) => {
    if (normalizedArea && normalizeAreaKey(u.area) !== normalizedArea) return false;
    if (normalizeUpgradeId(u.id) === normalizedId) return true;
    if (tieKey && u.tieKey === tieKey) return true;
    return false;
  }) || null;
}

export function getUpgradeLockState(areaKey, upgId) {
  const upg = typeof upgId === 'object' && upgId ? upgId : getUpgrade(areaKey, upgId);
  return computeUpgradeLockStateFor(areaKey, upg);
}

function normalizeUpgradeIconPath(iconPath) {
  const raw = String(iconPath ?? '').trim();
  if (!raw) return '';

  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith('//')) return raw;

  const replaceSlashes = (value) => value.replace(/\\+/g, '/');
  let path = replaceSlashes(raw);

  if (path.startsWith('/')) {
    return path.replace(/\/{2,}/g, '/');
  }

  path = path.replace(/^\.\/+/u, '');
  while (path.startsWith('../')) {
    path = path.slice(3);
  }

  const segments = path
    .split('/')
    .map(seg => seg.trim())
    .filter(seg => seg && seg !== '.');

  if (!segments.length) return '';

  const normalized = [];
  for (const segment of segments) {
    if (segment === '..') {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  if (!normalized.length) return '';

  const SHARED_ROOTS = new Set(['stats', 'currencies', 'misc']);

  for (let i = 0; i < normalized.length; i += 1) {
    const lower = normalized[i].toLowerCase();
    if (lower === 'img') {
      normalized.splice(i, 1);
      i -= 1;
      continue;
    }

    if (lower === 'sc_upgrade_icons' || lower === 'sc_upg_icons') {
      normalized[i] = 'sc_upg_icons';
      while (normalized[i + 1] && /^(?:sc_upgrade_icons|sc_upg_icons)$/i.test(normalized[i + 1])) {
        normalized.splice(i + 1, 1);
      }
    }
  }

  if (!normalized.length) return '';

  if (
    normalized.length > 1
    && normalized[0].toLowerCase() === 'sc_upg_icons'
    && SHARED_ROOTS.has(normalized[1].toLowerCase())
  ) {
    normalized.shift();
  }

  if (normalized.length === 1) {
    normalized.unshift('sc_upg_icons');
  }

  const result = normalized.join('/');
  if (!result) return '';

  return `img/${result}`;
}

export function getIconUrl(upg) {
  if (!upg) return '';
  return normalizeUpgradeIconPath(upg.icon);
}

/* ------------------------------ Cost helpers ------------------------------ */

function sumNextNLevelsCost(upg, currentLevel, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += upg.costAtLevel(currentLevel + i);
  }
  return total;
}

export function costToBuyOne(areaKey, upgId) {
  const upg = getUpgrade(areaKey, upgId);
  const lvlBn = getLevel(areaKey, upgId);
  const lvl = levelBigNumToNumber(lvlBn);
  if (!upg) return 0;
  if (lvl >= upg.lvlCap) return 0;
  return upg.costAtLevel(lvl);
}

export function buyOne(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return { bought: 0, spent: 0 };

  if (isUpgradeLocked(areaKey, upg)) {
    return { bought: 0, spent: 0 };
  }

  const lvlNum = state.lvl;
  const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
  const prevLevelBn = safeCloneBigNum(lvlBn);

  if (lvlNum >= upg.lvlCap) return { bought: 0, spent: 0 };

  if (isInfinityLevelForScaled(upg, lvlBn)) {
    state.lvlBn = BigNum.fromAny('Infinity');
    state.lvl = levelBigNumToNumber(state.lvlBn);
    state.nextCostBn = BigNum.fromAny('Infinity');
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    notifyChanged();
    return { bought: 0, spent: 0 };
  }

  const rawPrice = state.nextCostBn ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
  const priceBn = rawPrice instanceof BigNum
    ? rawPrice
    : BigNum.fromAny(rawPrice ?? 0);

  const costType = upg.costType;
  const walletEntry = costType ? bank[costType] : null;

  let spent = BigNum.fromInt(0);

  if (walletEntry && !priceBn.isZero?.()) {
    const haveRaw = walletEntry.value;
    const have = haveRaw instanceof BigNum
      ? haveRaw
      : BigNum.fromAny(haveRaw ?? 0);

    if (have.cmp(priceBn) < 0) {
      return { bought: 0, spent: 0 };
    }

    spent = priceBn.clone?.() ?? BigNum.fromAny(priceBn);
    walletEntry.sub(spent);
  } else {
    if (!priceBn.isZero?.()) {
      return { bought: 0, spent: 0 };
    }
    spent = BigNum.fromInt(0);
  }

  const nextLevelBn = lvlBn.add(BigNum.fromInt(1));
  state.lvlBn = nextLevelBn;
  state.lvl = levelBigNumToNumber(nextLevelBn);
  state.nextCostBn = BigNum.fromAny(
    typeof upg.nextCostAfter === 'function'
      ? upg.nextCostAfter(spent, state.lvl)
      : upg.costAtLevel(state.lvl)
  );

  commitUpgradeState(state);
  invalidateUpgradeState(areaKey, upgId);
  emitUpgradeLevelChange(upg, lvlNum, prevLevelBn, state.lvl, state.lvlBn);
  notifyChanged();

  return { bought: 1, spent };
}

export function evolveUpgrade(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg || upg.upgType !== 'HM') return { evolved: false };

  const lvlBn = state.lvlBn ?? ensureLevelBigNum(state.lvl);
  if (!isHmReadyToEvolve(upg, lvlBn, state.hmEvolutions)) {
    return { evolved: false };
  }

  const nextEvol = normalizeHmEvolutionCount(state.hmEvolutions) + 1;
  state.hmEvolutions = nextEvol;
  applyHmEvolutionMeta(upg, nextEvol);

  try { state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl)); }
  catch { state.nextCostBn = BigNum.fromAny('Infinity'); }

  commitUpgradeState(state);
  invalidateUpgradeState(areaKey, upgId);
  emitUpgradeLevelChange(upg, state.lvl, lvlBn, state.lvl, lvlBn);
  notifyChanged();

  return { evolved: true };
}

export function buyMax(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return { bought: 0, spent: BigNum.fromInt(0) };

  if (isUpgradeLocked(areaKey, upg)) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const lvlNum = state.lvl;
  const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  if (Number.isFinite(cap) && lvlNum >= cap) return { bought: 0, spent: BigNum.fromInt(0) };

  const walletHandle = bank[upg.costType];
  const walletValue = walletHandle?.value;
  const wallet = walletValue instanceof BigNum
    ? walletValue.clone?.() ?? BigNum.fromAny(walletValue)
    : BigNum.fromAny(walletValue ?? 0);

  if (upg.unlockUpgrade) {
    const nextCost = state.nextCostBn?.clone?.() ?? BigNum.fromInt(0);
    if (nextCost.isZero?.()) {
      return buyOne(areaKey, upgId);
    }
  }

  if (wallet.isZero?.()) return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };

  if (wallet.isInfinite?.()) {
    const prevLevel = lvlBn.clone?.() ?? ensureLevelBigNum(lvlBn);
    const prevLevelNum = levelBigNumToNumber(prevLevel);
    const prevLevelStorage = prevLevel.toStorage?.();
    let targetLevelBn;

    if (upg.upgType === 'HM') {
      targetLevelBn = BigNum.fromAny('Infinity');

      if (!upg.lvlCapBn?.isInfinite?.()) {
        const infCap = BigNum.fromAny('Infinity');
        upg.lvlCapBn = infCap;
        upg.lvlCap = Number.POSITIVE_INFINITY;
        upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
        upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
      }
    } else {
      const capBn = upg.lvlCapBn?.clone?.() ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
      targetLevelBn = capBn?.clone?.() ?? capBn;
    }

    let purchased = targetLevelBn.sub(prevLevel);
    if (purchased.isZero?.()) {
      const plainDelta = plainLevelDelta(targetLevelBn, prevLevel);
      if (!plainDelta.isZero?.()) {
        purchased = plainDelta;
      }
    }
    if (purchased.isZero?.()) {
      const nextStorage = targetLevelBn.toStorage?.();
      if (prevLevelStorage && nextStorage && prevLevelStorage !== nextStorage) {
        if (targetLevelBn.isInfinite?.()) {
          try { purchased = BigNum.fromAny('Infinity'); }
          catch { purchased = BigNum.fromInt(1); }
        } else {
          purchased = BigNum.fromInt(1);
        }
      }
    }
    state.lvlBn = targetLevelBn.clone?.() ?? targetLevelBn;
    if (upg.upgType === 'NM' && Number.isFinite(upg.lvlCap)) {
      state.lvl = upg.lvlCap;
    } else {
      state.lvl = levelBigNumToNumber(state.lvlBn);
    }
    state.nextCostBn = BigNum.fromAny('Infinity');

    bank[upg.costType].set(wallet);

    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(
      upg,
      prevLevelNum,
      prevLevel,
      state.lvl,
      state.lvlBn,
    );
    notifyChanged();

    return { bought: purchased, spent: BigNum.fromInt(0) };
  }

  const nextCost = state.nextCostBn?.clone?.() ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
  if (wallet.cmp(nextCost) < 0) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const room = Number.isFinite(cap) ? Math.max(0, cap - lvlNum) : MAX_LEVEL_DELTA;
  if (!(room > 0)) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const outcome = calculateBulkPurchase(upg, lvlBn, wallet, room);
  const countBn = outcome.count instanceof BigNum
    ? outcome.count
    : BigNum.fromAny(outcome.count ?? 0);
  if (countBn.isZero?.()) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const spent = outcome.spent ?? BigNum.fromInt(0);
  const remaining = wallet.sub(spent);
  bank[upg.costType].set(remaining);

  const nextLevelBn = lvlBn.add(countBn);
  state.lvlBn = nextLevelBn;
  state.lvl = levelBigNumToNumber(nextLevelBn);
  if (outcome.nextPrice) {
    state.nextCostBn = outcome.nextPrice;
  } else if (Number.isFinite(state.lvl)) {
    state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
  } else {
    state.nextCostBn = BigNum.fromAny('Infinity');
  }
  commitUpgradeState(state);
  invalidateUpgradeState(areaKey, upgId);
  emitUpgradeLevelChange(upg, lvlNum, lvlBn, state.lvl, state.lvlBn);
  notifyChanged();

  return { bought: countBn, spent };
}

export function buyTowards(areaKey, upgId, maxLevels) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return { bought: 0, spent: BigNum.fromInt(0) };

  if (isUpgradeLocked(areaKey, upg)) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const lvlNum = state.lvl;
  const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  if (Number.isFinite(cap) && lvlNum >= cap) return { bought: 0, spent: BigNum.fromInt(0) };

  const walletHandle = bank[upg.costType];
  const walletValue = walletHandle?.value;
  const wallet = walletValue instanceof BigNum
    ? walletValue.clone?.() ?? BigNum.fromAny(walletValue)
    : BigNum.fromAny(walletValue ?? 0);

  if (wallet.isZero?.()) return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };

  const capRoom = Number.isFinite(cap) ? Math.max(0, cap - lvlNum) : undefined;
  const maxRoom = Number.isFinite(maxLevels)
    ? Math.max(0, Math.floor(maxLevels))
    : (maxLevels instanceof BigNum ? levelBigNumToNumber(maxLevels) : undefined);
  const room = Number.isFinite(capRoom)
    ? (Number.isFinite(maxRoom) ? Math.min(capRoom, maxRoom) : capRoom)
    : maxRoom;

  const outcome = calculateBulkPurchase(upg, lvlBn, wallet, room);
  const countBn = outcome.count instanceof BigNum
    ? outcome.count
    : BigNum.fromAny(outcome.count ?? 0);
  if (countBn.isZero?.()) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const spent = outcome.spent ?? BigNum.fromInt(0);
  const remaining = wallet.sub(spent);
  bank[upg.costType].set(remaining);

  const nextLevelBn = lvlBn.add(countBn);
  state.lvlBn = nextLevelBn;
  state.lvl = levelBigNumToNumber(nextLevelBn);
  if (outcome.nextPrice) {
    state.nextCostBn = outcome.nextPrice;
  } else if (Number.isFinite(state.lvl)) {
    state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
  } else {
    state.nextCostBn = BigNum.fromAny('Infinity');
  }
  commitUpgradeState(state);
  invalidateUpgradeState(areaKey, upgId);
  emitUpgradeLevelChange(upg, lvlNum, lvlBn, state.lvl, state.lvlBn);
  notifyChanged();

  return { bought: countBn, spent };
}

export function evaluateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
  const wallet = walletBn instanceof BigNum ? walletBn : BigNum.fromAny(walletBn ?? 0);
  const outcome = calculateBulkPurchase(upg, startLevel, wallet, maxLevels, options);
  return {
    count: outcome.count,
    spent: outcome.spent ?? BigNum.fromInt(0),
    nextPrice: outcome.nextPrice ?? BigNum.fromInt(0),
    numericCount: outcome.numericCount ?? 0,
  };
}

/* ------------------------------ Effects wiring ---------------------------- */

const BASE_CPS = 1;

export function computeUpgradeEffects(areaKey) {
  const ups = getUpgradesForArea(areaKey);
  let cpsMult = 1.0;
  let coinValueMultBn = BigNum.fromInt(1);
  let xpGainMultBn = BigNum.fromInt(1);
  let bookRewardMultBn = BigNum.fromInt(1);

  for (const u of ups) {
    const lvlBn = getLevel(areaKey, u.id);
    const lvlNum = levelBigNumToNumber(lvlBn);
    const tieKey = u.tieKey || normalizeUpgradeTie(u.tie);
    if (tieKey === UPGRADE_TIES.FASTER_COINS) {
      // Faster Coins
      cpsMult *= u.effectMultiplier(lvlNum);
    } else if (tieKey === UPGRADE_TIES.FASTER_COINS_II) {
      cpsMult *= u.effectMultiplier(lvlNum);
    } else if (tieKey === UPGRADE_TIES.COIN_VALUE_I) {
      const lvl = Math.max(0, Number.isFinite(lvlNum) ? lvlNum : 0);
      if (lvl > 0) {
        const factor = 1 + (0.5 * lvl);
        let str = factor.toFixed(6);
        str = str.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
        coinValueMultBn = coinValueMultBn.mulDecimal(str, 18);
      }
    } else if (tieKey === UPGRADE_TIES.COIN_VALUE_II) {
      const lvl = normalizedUpgradeLevel(lvlNum);
      if (lvl > 0) {
        try {
          const bonus = hundredPercentPerLevelMultiplier(lvl);
          coinValueMultBn = coinValueMultBn.mulBigNumInteger(bonus);
        } catch {}
      }
    } else if (tieKey === UPGRADE_TIES.BOOK_VALUE_I) {
      bookRewardMultBn = bookValueMultiplierBn(lvlNum);
    } else if (tieKey === UPGRADE_TIES.XP_VALUE_I) {
      const lvl = Math.max(0, Number.isFinite(lvlNum) ? lvlNum : 0);
      xpGainMultBn = BigNum.fromAny(1 + lvl * 2);
    } else if (tieKey === UPGRADE_TIES.XP_VALUE_II) {
      const lvl = normalizedUpgradeLevel(lvlNum);
      if (lvl > 0) {
        try {
          const bonus = hundredPercentPerLevelMultiplier(lvl);
          xpGainMultBn = xpGainMultBn.mulBigNumInteger(bonus);
        } catch {}
      }
    }
    // future upgrades here...
  }

  return {
    coinsPerSecondMult: cpsMult,
    coinsPerSecondAbsolute: BASE_CPS * cpsMult,
    coinValueMultiplier: coinValueMultBn,
    xpGainMultiplier: xpGainMultBn,
    bookRewardMultiplier: bookRewardMultBn,
  };
}

function registerXpUpgradeEffects() {
  try { initResetSystem(); } catch {}

  // ----- Coin value (Coin Value I + Coin Value II) -----
  try {
    addExternalCoinMultiplierProvider(({ baseMultiplier, xpUnlocked }) => {
      if (!xpUnlocked) return baseMultiplier;

      let result;
      try {
        result = baseMultiplier instanceof BigNum
          ? baseMultiplier.clone?.() ?? baseMultiplier
          : BigNum.fromAny(baseMultiplier ?? 0);
      } catch {
        result = BigNum.fromInt(0);
      }

      // Coin Value I: +50% per level
      try {
        const lvl1 = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_VALUE_I);
        const safeLvl1 = Math.max(0, Number.isFinite(lvl1) ? lvl1 : 0);
        if (safeLvl1 > 0) {
          let str = (1 + 0.5 * safeLvl1).toFixed(6);
          str = str.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
          try {
            result = result.mulDecimal(str, 18);
          } catch {}
        }
      } catch {}

      // Coin Value II (gold_0): +100% per level (independent of I)
      try {
        const lvl2 = normalizedUpgradeLevel(
          getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_VALUE_II)
        );
        if (lvl2 > 0) {
          const bonus = hundredPercentPerLevelMultiplier(lvl2);
          try {
            result = result.mulBigNumInteger(bonus);
          } catch {}
        }
      } catch {}

      // Endless XP (HM): milestone bonuses to coin value
      try {
        const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
        const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
        const { coinMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
        result = safeMultiplyBigNum(result, coinMult);
      } catch {}

      return result;
    });
  } catch {}

  // ----- XP value (XP Value I + XP Value II) -----
  try {
    addExternalXpGainMultiplierProvider(({ baseGain, xpUnlocked }) => {
      if (!xpUnlocked) return baseGain;

      let gain;
      try {
        gain = baseGain instanceof BigNum
          ? baseGain.clone?.() ?? baseGain
          : BigNum.fromAny(baseGain ?? 0);
      } catch {
        gain = BigNum.fromInt(0);
      }

      // XP Value I: +200% per level (1 + 2*lvl)
      try {
        const lvl1 = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.XP_VALUE_I);
        const safeLvl1 = Math.max(0, Number.isFinite(lvl1) ? lvl1 : 0);
        if (safeLvl1 > 0) {
          try {
            gain = gain.mulBigNumInteger(BigNum.fromAny(1 + safeLvl1 * 2));
          } catch {}
        }
      } catch {}

      // XP Value II (gold_1): +100% per level (independent of I)
      try {
        const lvl2 = normalizedUpgradeLevel(
          getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.XP_VALUE_II)
        );
        if (lvl2 > 0) {
          const bonus = hundredPercentPerLevelMultiplier(lvl2);
          try {
            gain = gain.mulBigNumInteger(bonus);
          } catch {}
        }
      } catch {}

      // Endless XP (HM): core effect + milestones
      try {
        const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
        const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
        let base = 1;
        try { base = hmUpg?.effectMultiplier?.(hmLvl) ?? 1; } catch {}
        const { selfMult, xpMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
        gain = safeMultiplyBigNum(gain, safeMultiplyBigNum(base, selfMult));
        gain = safeMultiplyBigNum(gain, xpMult);
      } catch {}

      return gain;
    });
  } catch {}

    // ----- Book value: affects Books gained on XP level-up -----
  try {
    setExternalBookRewardProvider(({ baseReward, xpUnlocked }) => {
      if (!xpUnlocked) return baseReward;

      // Clone base reward safely
      let reward;
      try {
        reward = baseReward instanceof BigNum
          ? baseReward.clone?.() ?? baseReward
          : BigNum.fromAny(baseReward ?? 0);
      } catch {
        reward = BigNum.fromInt(0);
      }

      // Look up current Book Value level (0 or 1 right now)
      let level = 0;
      try {
        level = normalizedUpgradeLevel(
          getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_VALUE_I)
        );
      } catch {
        level = 0;
      }

      // Convert the level into the actual Books multiplier
      let multiplier;
      try {
        multiplier = bookValueMultiplierBn(level);
      } catch {
        multiplier = BigNum.fromInt(1);
      }

      try {
        return reward.mulBigNumInteger(multiplier);
      } catch {
        return reward;
      }
    });
  } catch {}

  syncBookCurrencyMultiplierFromUpgrade();
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      try { syncBookCurrencyMultiplierFromUpgrade(); } catch {}
    });
  }
}

registerXpUpgradeEffects();

let listeners = [];
export function onUpgradesChanged(cb) {
  if (typeof cb === 'function') listeners.push(cb);
  return () => { listeners = listeners.filter(x => x !== cb); };
}
function notifyChanged() {
  try { listeners.forEach(cb => cb()); } catch {}
  try { document.dispatchEvent(new CustomEvent('ccc:upgrades:changed')); } catch {}
}

/* ----------------------- Area detection (DOM mapping) ---------------------- */

export function getCurrentAreaKey() {
  const gameRoot = document.getElementById('game-root');
  if (gameRoot?.classList?.contains('area-cove')) return AREA_KEYS.STARTER_COVE;
  return AREA_KEYS.STARTER_COVE;
}

/* ------------------------------ UI helpers -------------------------------- */

export function upgradeUiModel(areaKey, upgId) {
  const upg = getUpgrade(areaKey, upgId);
  if (!upg) return null;
  const lvlBn = getLevel(areaKey, upgId);
  const lvl = levelBigNumToNumber(lvlBn);
  const lvlFmtHtml = formatBigNumAsHtml(lvlBn);
  const lvlFmtText = formatBigNumAsPlain(lvlBn);
  const lvlCapBn = upg.lvlCapBn ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
  const lvlCapFmtHtml = upg.lvlCapFmtHtml ?? formatBigNumAsHtml(lvlCapBn);
  const lvlCapFmtText = upg.lvlCapFmtText ?? formatBigNumAsPlain(lvlCapBn);
  const nextPrice = lvl < upg.lvlCap ? peekNextPrice(areaKey, upgId) : BigNum.fromInt(0);
  const nextPriceFmt = formatBigNumAsHtml(nextPrice);
  const haveRaw = bank[upg.costType]?.value;
  const have = haveRaw instanceof BigNum
    ? haveRaw
    : BigNum.fromAny(haveRaw ?? 0);
  const lockState = getUpgradeLockState(areaKey, upgId);
  const locked = !!lockState.locked;
  const displayTitle = lockState.titleOverride ?? upg.title;
  const displayDesc = lockState.descOverride ?? upg.desc;
  const hmMilestones = resolveHmMilestones(upg, areaKey);
  let effect = '';
  if (typeof upg.effectSummary === 'function' && !(locked && lockState.hideEffect)) {
    effect = upg.effectSummary(lvl);
    if (typeof effect === 'string') effect = effect.trim();
  }
  const iconUrl = lockState.iconOverride ?? getIconUrl(upg);
  return {
    upg,
    lvl,
    lvlBn,
    lvlFmtHtml,
    lvlFmtText,
    lvlCapBn,
    lvlCapFmtHtml,
    lvlCapFmtText,
    nextPrice,
    nextPriceFmt,
    have,
    haveFmt: bank[upg.costType]?.fmt(have) ?? String(have),
    effect,
    iconUrl,
    lockState,
    locked,
    areaKey,
    hmMilestones,
    displayTitle,
    displayDesc,
    unlockUpgrade: !!upg.unlockUpgrade,
    hmEvolutions: upg.upgType === 'HM' ? getHmEvolutions(areaKey, upgId) : 0,
    hmReadyToEvolve: upg.upgType === 'HM' ? isHmReadyToEvolve(upg, lvlBn, getHmEvolutions(areaKey, upgId)) : false,
    hmNextMilestone: upg.upgType === 'HM' ? hmNextMilestoneLevel(upg, lvlBn, areaKey) : null,
  };
}

export function getHmNextMilestoneLevel(areaKey, upgId) {
  const upg = getUpgrade(areaKey, upgId);
  if (!upg || upg.upgType !== 'HM') return null;
  const lvlBn = getLevel(areaKey, upgId);
  return hmNextMilestoneLevel(upg, lvlBn, areaKey);
}

export function normalizeBigNum(value) {
  return bigNumFromLog10(approxLog10BigNum(value ?? 0));
}
