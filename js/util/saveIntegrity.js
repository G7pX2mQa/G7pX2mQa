// js/util/saveIntegrity.js
import {
  STORAGE_PREFIX,
  getActiveSlot,
  getSlotSignature,
  setSlotSignature,
  markSaveSlotModified,
  getSlotSignatureKey,
  getSlotModifiedFlagKey,
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
      const modKey = getSlotModifiedFlagKey(slot);
      if (key === sigKey || key === modKey) {
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

function init() {
  if (typeof window === 'undefined') return;
  runIntegrityCheck();
  ensureWatcher();
  window.addEventListener('saveSlot:change', () => runIntegrityCheck());
  window.addEventListener('saveIntegrity:storageMutation', handleStorageMutationEvent, { passive: true });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetTrustedSlots();
        runIntegrityCheck();
      }
    });
  }
}

init();
