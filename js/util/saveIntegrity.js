// js/util/saveIntegrity.js
// If a player modifies their save file manually (e.g., console commands, local storage editing, JSON tampering),
// A one-way flag, `hasModifiedSave`, will become true and turn the shop button's color brown,
// Which I like to call the poop-shop of shame.
// Used to detect cheaters.
import { activeStorageKeys } from '../main.js';
import {
  getActiveSlot,
  getSlotSignature,
  setSlotSignature,
  markSaveSlotModified,
  getSlotSignatureKey,
  getSlotModifiedFlagKey,
  hasModifiedSave,
} from './storage.js';

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
    const allKeys = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) allKeys.add(key);
    }
    if (window.__activeStorageKeys) {
      for (const key of window.__activeStorageKeys) {
        allKeys.add(key);
      }
    }

    for (const key of allKeys) {
      if (!key || !key.startsWith('ccc:')) continue;
      if (key.startsWith('ccc:debug:')) continue;
      if (key === getSlotModifiedFlagKey(slot)) continue;
      const keySlot = parseSlotFromKey(key);
      if (keySlot == null || keySlot !== slot) continue;
      
      let value = '';
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) continue;
        value = String(raw);
      } catch {
        continue;
      }
      snapshot.set(key, value);
    }
  } catch {}
  expectedStateBySlot.set(slot, snapshot);
  return snapshot;
}

function ensureExpectedStateForSlot(slot) {
  if (!Number.isFinite(slot) || slot <= 0) return null;
  if (hasModifiedSave(slot)) return null;
  if (expectedStateBySlot.has(slot)) return expectedStateBySlot.get(slot);
  return rebuildExpectedStateForSlot(slot);
}

export function beforeSlotWrite(key) {
  if (!hasLocalStorage()) return;
  if (integrityInternalWriteDepth > 0) return;

  const strKey = String(key);
  if (!strKey.startsWith('ccc:')) return;
  if (strKey.startsWith('ccc:debug:')) return;



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
  if (!strKey.startsWith('ccc:')) return;
  if (strKey.startsWith('ccc:debug:')) return;

  const slot = parseSlotFromKey(strKey);
  if (slot == null) return;

  const snapshot = ensureExpectedStateForSlot(slot) || new Map();
  snapshot.set(strKey, String(value ?? ''));
  expectedStateBySlot.set(slot, snapshot);
}

export function afterSlotRemove(key) {
  const strKey = String(key);
  if (!strKey.startsWith('ccc:')) return;
  if (strKey.startsWith('ccc:debug:')) return;

  const slot = parseSlotFromKey(strKey);
  if (slot == null) return;

  const snapshot = expectedStateBySlot.get(slot);
  if (snapshot) {
    snapshot.delete(strKey);
  }
}

function verifySlotIntegrity(slot) {
  if (!slot || slot <= 0) return;
  if (hasModifiedSave(slot)) return;
  
  let slotKeyCount = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ccc:') && key.endsWith(`:${slot}`)) {
        slotKeyCount++;
      }
    }
  } catch {}

  if (slotKeyCount === 0) {
    rebuildExpectedStateForSlot(slot);
    return;
  }

  const snapshot = expectedStateBySlot.get(slot);
  
  if (snapshot) {
    let hasMismatch = false;

    // Check if any expected key has been modified in native storage
    for (const [key, expectedVal] of snapshot.entries()) {
      let actualVal = '';
      try {
        const raw = localStorage.getItem(key);
        actualVal = raw == null ? '' : String(raw);
      } catch {}
      if (actualVal !== expectedVal) {
        hasMismatch = true;
        break;
      }
    }

    // Check if native storage has keys not in our snapshot
    if (!hasMismatch) {
      const allKeys = new Set();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) allKeys.add(key);
        }
        if (window.__activeStorageKeys) {
          for (const key of window.__activeStorageKeys) {
            allKeys.add(key);
          }
        }
      } catch {}

      for (const key of allKeys) {
        if (!key || !key.startsWith('ccc:')) continue;
        if (key.startsWith('ccc:debug:')) continue;
        if (key === getSlotModifiedFlagKey(slot)) continue;
        
        const slotMatch = key.match(/:(\d+)$/);
        if (!slotMatch || parseInt(slotMatch[1], 10) !== slot) continue;
        
        let value = null;
        try { value = localStorage.getItem(key); } catch {}
        if (value === null) continue; // Removed in buffer
        
        if (!snapshot.has(key)) {
          hasMismatch = true;
          break;
        }
      }
    }

    if (hasMismatch) {
      markSaveSlotModified(slot);
      rebuildExpectedStateForSlot(slot);
    }
  }
}

function getCandidateSlots() {
  const slots = new Set();
  const active = getActiveSlot();
  if (Number.isFinite(active) && active > 0) slots.add(active);
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.slot-card').forEach((_, idx) => slots.add(idx + 1));
  }
  return [...slots].filter((slot) => Number.isFinite(slot) && slot > 0);
}

function runIntegrityCheck() {
  if (!hasLocalStorage()) return;
  const slots = getCandidateSlots();
  slots.forEach((slot) => {
    ensureExpectedStateForSlot(slot);
    verifySlotIntegrity(slot);
  });
}

// Interval polling removed in favor of instant 'storage' event listener

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
  startPoopShopEnforcer();
  window.addEventListener('storage', () => runIntegrityCheck());
  window.addEventListener('saveSlot:change', () => runIntegrityCheck());
  window.addEventListener('saveIntegrity:rebuildSnapshot', (e) => rebuildExpectedStateForSlot(e.detail.slot));
  window.addEventListener('saveIntegrity:slotRemove', (e) => afterSlotRemove(e.detail.key));
  window.addEventListener('saveIntegrity:slotWrite', (e) => afterSlotWrite(e.detail.key, e.detail.value));
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        runIntegrityCheck();
        enforcePoopShopStyle();
      }
    });
  }
}

init();
