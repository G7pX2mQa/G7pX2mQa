// js/util/saveIntegrity.js
// If a player modifies their save file manually (e.g., console commands, local storage editing, JSON tampering),
// A one-way flag, `hasModifiedSave`, will become true and turn the shop button's color brown,
// Which I like to call the poop-shop of shame.
// Used to detect cheaters.
import {
  STORAGE_PREFIX,
  getActiveSlot,
  getSlotSignature,
  setSlotSignature,
  markSaveSlotModified,
  getSlotSignatureKey,
  hasModifiedSave,
} from './storage.js';

const SIGNATURE_POLL_INTERVAL_MS = 10000;
const TRUSTED_MUTATION_GRACE_MS = 750;
const TRUSTED_SWEEP_DELAY_MS = 50;
let watcherId = null;
let trustedSweepTimer = null;

const trustedSlotsUntil = new Map();

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function noteTrustedSlot(slot, ttl = TRUSTED_MUTATION_GRACE_MS) {
  if (!slot || slot <= 0) return;
  trustedSlotsUntil.set(slot, nowMs() + ttl);
}

function slotRecentlyTrusted(slot) {
  if (!slot || slot <= 0) return false;
  const expiry = trustedSlotsUntil.get(slot);
  if (expiry == null) return false;
  if (expiry <= nowMs()) {
    trustedSlotsUntil.delete(slot);
    return false;
  }
  return true;
}

function resetTrustedSlots() {
  trustedSlotsUntil.clear();
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

// In-memory snapshot of expected localStorage state per slot.
// This lets us detect manual/out-of-band changes while the game is running.
const expectedStateBySlot = new Map();
let integrityInternalWriteDepth = 0;

function parseSlotFromKey(key) {
  if (!key) return null;
  const match = /:(\d+)$/.exec(String(key));
  if (!match) return null;
  const slot = Number.parseInt(match[1], 10);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
}

function rebuildExpectedStateForSlot(slot) {
  const snapshot = new Map();
  if (!hasLocalStorage()) {
    expectedStateBySlot.set(slot, snapshot);
    return snapshot;
  }
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const keySlot = parseSlotFromKey(key);
      if (keySlot == null || keySlot !== slot) continue;
      let value = '';
      try {
        value = localStorage.getItem(key) ?? '';
      } catch {
        value = '';
      }
      snapshot.set(key, value);
    }
  } catch {}
  expectedStateBySlot.set(slot, snapshot);
  return snapshot;
}

function ensureExpectedStateForSlot(slot) {
  if (!Number.isFinite(slot) || slot <= 0) return null;
  if (expectedStateBySlot.has(slot)) return expectedStateBySlot.get(slot);
  return rebuildExpectedStateForSlot(slot);
}

export function beforeSlotWrite(key) {
  if (!hasLocalStorage()) return;
  if (integrityInternalWriteDepth > 0) return;

  const strKey = String(key);
  if (!strKey.startsWith(STORAGE_PREFIX)) return;

  const slot = parseSlotFromKey(strKey);

  if (slot == null) return;

  const snapshot = ensureExpectedStateForSlot(slot);
  if (!snapshot) return;

  try {
    for (const [snapKey, expectedValue] of snapshot.entries()) {
      let actualValue = '';
      try {
        actualValue = localStorage.getItem(snapKey) ?? '';
      } catch {
        actualValue = '';
      }
      if (actualValue !== expectedValue) {
        if (integrityInternalWriteDepth === 0) {
          integrityInternalWriteDepth += 1;
          try {
            markSaveSlotModified(slot);
          } finally {
            integrityInternalWriteDepth -= 1;
          }
        }
        rebuildExpectedStateForSlot(slot);
        return;
      }
    }
  } catch {}
}

export function afterSlotWrite(key, value) {
  const strKey = String(key);
  if (!strKey.startsWith(STORAGE_PREFIX)) return;
  const slot = parseSlotFromKey(strKey);
  if (slot == null) return;

  const snapshot = ensureExpectedStateForSlot(slot) || new Map();
  snapshot.set(strKey, String(value ?? ''));
  expectedStateBySlot.set(slot, snapshot);
}

function computeSignature(entries = []) {
  let hash = 0;
  for (const entry of entries) {
    for (let i = 0; i < entry.length; i += 1) {
      hash = ((hash << 5) - hash + entry.charCodeAt(i)) >>> 0;
    }
    hash = (hash + 0x9e3779b1) >>> 0;
  }
  return `${entries.length}|${hash.toString(16)}`;
}

function collectEntriesBySlot() {
  const map = new Map();
  if (!hasLocalStorage()) return map;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const slotMatch = key.match(/:(\d+)$/);
      if (!slotMatch) continue;
      const slot = parseInt(slotMatch[1], 10);
      if (!Number.isFinite(slot) || slot <= 0) continue;
      const sigKey = getSlotSignatureKey(slot);
      if (key === sigKey) {
        if (!map.has(slot)) map.set(slot, []);
        continue;
      }
      let value = '';
      try { value = localStorage.getItem(key) ?? ''; }
      catch {}
      if (!map.has(slot)) map.set(slot, []);
      map.get(slot).push(`${key}=${value}`);
    }
  } catch {}
  map.forEach((entries) => entries.sort());
  return map;
}

function getCandidateSlots(entriesBySlot) {
  const slots = new Set();
  if (entriesBySlot) {
    entriesBySlot.forEach((_, slot) => slots.add(slot));
  }
  const active = getActiveSlot();
  if (Number.isFinite(active) && active > 0) slots.add(active);
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.slot-card').forEach((_, idx) => slots.add(idx + 1));
  }
  return [...slots].filter((slot) => Number.isFinite(slot) && slot > 0);
}

function verifySlotIntegrity(slot, entries) {
  if (!slot || slot <= 0) return;
  const list = Array.isArray(entries) ? entries : [];
  const stored = getSlotSignature(slot);
  if (list.length === 0) {
    if (stored) {
      if (!slotRecentlyTrusted(slot)) {
        markSaveSlotModified(slot);
      }
      setSlotSignature(slot, null);
    }
    return;
  }
  const signature = computeSignature(list);
  const mismatch = signature !== stored;
  if (stored && mismatch && !slotRecentlyTrusted(slot)) {
    markSaveSlotModified(slot);
  }
  if (signature !== stored) {
    setSlotSignature(slot, signature);
  }
}

function runIntegrityCheck() {
  if (!hasLocalStorage()) return;
  const entriesBySlot = collectEntriesBySlot();
  const slots = getCandidateSlots(entriesBySlot);
  slots.forEach((slot) => {
    const entries = entriesBySlot.get(slot) ?? [];
    verifySlotIntegrity(slot, entries);
  });
}

function scheduleTrustedMutationSweep() {
  if (trustedSweepTimer != null) return;
  const root = typeof window !== 'undefined' ? window : globalThis;
  trustedSweepTimer = root.setTimeout(() => {
    trustedSweepTimer = null;
    runIntegrityCheck();
  }, TRUSTED_SWEEP_DELAY_MS);
}

function handleStorageMutationEvent(event) {
  const detail = event?.detail;
  if (!detail) return;
  const rawSlot = typeof detail.slot === 'number' ? detail.slot : Number.parseInt(detail.slot, 10);
  const slot = Number.isFinite(rawSlot) ? rawSlot : null;
  if (!Number.isFinite(slot) || slot <= 0) return;
  if (detail.trusted) {
    noteTrustedSlot(slot);
    scheduleTrustedMutationSweep();
    return;
  }
  trustedSlotsUntil.delete(slot);
  runIntegrityCheck();
}

function ensureWatcher() {
  if (typeof window === 'undefined') return;
  if (watcherId != null) return;
  watcherId = window.setInterval(runIntegrityCheck, SIGNATURE_POLL_INTERVAL_MS);
}

const POOP_SHOP_BG  = 'linear-gradient(180deg,#a9793d,#7b5534)';
const POOP_SHOP_FLAG = '1';

let poopShopTimer = null;

function getShopButtonElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.hud-bottom .game-btn[data-btn="shop"]');
}

function enforcePoopShopStyle() {
  const btn = getShopButtonElement();
  if (!btn) return;

  const isModded = hasModifiedSave();

  if (!isModded) {
    if (btn.dataset.poopShopApplied === POOP_SHOP_FLAG || btn.style.backgroundImage || btn.style.background) {
      btn.style.backgroundImage = '';
      btn.style.background = '';
      delete btn.dataset.poopShopApplied;
    }
    return;
  }

  const current = btn.style.backgroundImage || btn.style.background;
  if (current !== POOP_SHOP_BG || btn.dataset.poopShopApplied !== POOP_SHOP_FLAG) {
    btn.style.backgroundImage = POOP_SHOP_BG;
    btn.dataset.poopShopApplied = POOP_SHOP_FLAG;
  }
}

function startPoopShopEnforcer() {
  if (typeof window === 'undefined') return;
  if (poopShopTimer != null) return;

  enforcePoopShopStyle();
  poopShopTimer = window.setInterval(enforcePoopShopStyle, 50);

  window.addEventListener('saveSlot:change', enforcePoopShopStyle);
  window.addEventListener('saveSlot:modified', (ev) => {
    try {
      const active = getActiveSlot();
      if (ev?.detail?.slot === active) {
        enforcePoopShopStyle();
      }
    } catch {
      enforcePoopShopStyle();
    }
  });
}

function init() {
  if (typeof window === 'undefined') return;
  runIntegrityCheck();
  ensureWatcher();
  startPoopShopEnforcer();
  window.addEventListener('saveSlot:change', () => runIntegrityCheck());
  window.addEventListener('saveIntegrity:storageMutation', handleStorageMutationEvent, { passive: true });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetTrustedSlots();
        runIntegrityCheck();
        enforcePoopShopStyle();
      }
    });
  }
}

init();
