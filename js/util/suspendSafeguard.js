// js/util/suspendSafeguard.js
// Improves local storage tracking by supplying helper functions for saveIntegrity.js,
// And also supplies a frequent IndexedDB snapshot to back up progress if corrupted
import { beforeSlotWrite, afterSlotWrite } from './saveIntegrity.js';

const STORAGE_PREFIX = 'ccc:';
const DB_NAME = 'ccc:safety';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'latest';
const SLOT_SIGNATURE_PREFIX = `${STORAGE_PREFIX}slotSig`;
const SLOT_MOD_FLAG_PREFIX = `${STORAGE_PREFIX}slotMod`;
const FLUSH_DEBOUNCE_MS = 1000;

let dbPromise = null;
let flushTimer = null;
let dirty = false;
let lastDirtyReason = 'init';
let installAttempted = false;
let restoreAttempted = false;
let pendingImmediateFlush = false;

function canUseIndexedDb() {
  if (typeof indexedDB === 'undefined') return false;
  try {
    return typeof indexedDB.open === 'function';
  } catch {
    return false;
  }
}

function canUseLocalStorage() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const testKey = `${STORAGE_PREFIX}__test__`;
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

async function openDatabase() {
  if (!canUseIndexedDb()) throw new Error('IndexedDB unavailable');
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let resolved = false;
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch (err) {
          console.warn('Failed to upgrade suspend safeguard DB', err);
        }
      };
      request.onsuccess = () => {
        resolved = true;
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch {}
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        if (!resolved) {
          reject(request.error || new Error('Failed to open suspend safeguard DB'));
        }
      };
      request.onblocked = () => {
        // Nothing special, but ensure promise settles eventually
      };
    } catch (err) {
      reject(err);
    }
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

function captureSnapshot() {
  if (!canUseLocalStorage()) return null;
  const data = {};
  let captured = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      let value = null;
      try {
        value = localStorage.getItem(key);
      } catch {
        value = null;
      }
      if (value == null) continue;
      data[key] = value;
      captured = true;
    }
  } catch (err) {
    console.warn('Failed to read localStorage for snapshot', err);
    return null;
  }

  return {
    data,
    savedAt: Date.now(),
    hasData: captured,
  };
}

async function putSnapshot(snapshot) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      let settled = false;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => { if (!settled) { settled = true; resolve(true); } };
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('Snapshot transaction aborted')); } };
      tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error('Snapshot transaction error')); } };
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(snapshot, SNAPSHOT_KEY);
      request.onerror = () => {
        if (!settled) {
          settled = true;
          reject(request.error || new Error('Snapshot write failed'));
        }
      };
    });
    return true;
  } catch (err) {
    console.warn('Failed to persist suspend snapshot', err);
    return false;
  }
}

async function readSnapshot() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.oncomplete = () => { if (!settled) { settled = true; resolve(null); } };
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('Snapshot read aborted')); } };
      tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error('Snapshot read error')); } };
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SNAPSHOT_KEY);
      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        resolve(request.result || null);
      };
      request.onerror = () => {
        if (!settled) {
          settled = true;
          reject(request.error || new Error('Snapshot get failed'));
        }
      };
    });
  } catch (err) {
    console.warn('Failed to load suspend snapshot', err);
    return null;
  }
}

function requestPersistentStorage() {
  try {
    if (navigator?.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch {}
}

function captureStackTrace() {
  try {
    throw new Error('ccc-storage-write');
  } catch (err) {
    return err?.stack || '';
  }
}

function parseSlotFromKey(key) {
  if (!key) return null;
  const match = /:(\d+)$/.exec(String(key));
  if (!match) return null;
  const slot = parseInt(match[1], 10);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
}

const DEVTOOLS_CONSOLE_FRAME_RE = /\bat <anonymous>:\d+:\d+\b/;

function isTrustedStorageStack(stack) {
  if (typeof stack !== 'string' || stack.length === 0) return false;
  
  if (DEVTOOLS_CONSOLE_FRAME_RE.test(stack)) return false;

  return true;
}

function notifySaveIntegrityOfStorageMutation(key, stack) {
  if (typeof window === 'undefined') return;
  if (!key) return;
  const strKey = String(key);
  if (!strKey.startsWith(STORAGE_PREFIX)) return;
  if (strKey.startsWith(SLOT_SIGNATURE_PREFIX) || strKey.startsWith(SLOT_MOD_FLAG_PREFIX)) return;
  const slot = parseSlotFromKey(strKey);
  if (slot == null) return;
  try {
    const detail = {
      key: strKey,
      slot,
      trusted: isTrustedStorageStack(stack),
    };
    window.dispatchEvent(new CustomEvent('saveIntegrity:storageMutation', { detail }));
  } catch {}
}

function installStorageHooks() {
  if (typeof localStorage === 'undefined') return;
  try {
    const proto = Object.getPrototypeOf(localStorage);
    if (!proto || proto.__cccStoragePatched) return;

    const originalSet = proto.setItem;
    const originalRemove = proto.removeItem;
    const originalClear = proto.clear;

if (typeof originalSet === 'function') {
  proto.setItem = function patchedSetItem(key, value) {
    const stack = captureStackTrace();
    const strKey = String(key);

	const isTrackedGameKey =
      this === localStorage &&
      strKey.startsWith(STORAGE_PREFIX);


    // Before we write, verify nothing in this slot changed behind our back.
    if (isTrackedGameKey) {
      try {
        beforeSlotWrite(strKey);
      } catch {}
    }

    let result;
    try {
      result = originalSet.apply(this, arguments);
    } finally {
      try {
        if (isTrackedGameKey) {
          markProgressDirty('setItem');
          // Keep the in-memory expected state in sync with what we just wrote.
          try {
            afterSlotWrite(strKey, value);
          } catch {}
        }

        // We still want integrity events for game keys, but we've already
        // excluded slotSig/slotMod inside notifySaveIntegrityOfStorageMutation.
        if (this === localStorage && strKey.startsWith(STORAGE_PREFIX)) {
          notifySaveIntegrityOfStorageMutation(strKey, stack);
        }
      } catch {}
    }
    return result;
  };
}

    if (typeof originalRemove === 'function') {
      proto.removeItem = function patchedRemoveItem(key) {
        const stack = captureStackTrace();
        let result;
        try {
          result = originalRemove.apply(this, arguments);
        } finally {
          try {
            if (this === localStorage && String(key).startsWith(STORAGE_PREFIX)) {
              markProgressDirty('removeItem');
              notifySaveIntegrityOfStorageMutation(key, stack);
            }
          } catch {}
        }
        return result;
      };
    }

    if (typeof originalClear === 'function') {
      proto.clear = function patchedClear() {
        const stack = captureStackTrace();
        let result;
        try {
          result = originalClear.apply(this, arguments);
        } finally {
          try {
            if (this === localStorage) {
              markProgressDirty('clear');
              notifySaveIntegrityOfStorageMutation(null, stack);
            }
          } catch {}
        }
        return result;
      };
    }

    Object.defineProperty(proto, '__cccStoragePatched', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch (err) {
    console.warn('Failed to patch Storage prototype for suspend safeguards', err);
  }
}

function scheduleFlush(reason = 'idle') {
  lastDirtyReason = reason || lastDirtyReason;
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    const reasonToUse = lastDirtyReason;
    dirty = false;
    void flushBackupSnapshot(reasonToUse);
  }, FLUSH_DEBOUNCE_MS);
}

function cancelFlushTimer() {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
}

export function markProgressDirty(reason = 'dirty') {
  try {
    scheduleFlush(reason);
  } catch {}
}

async function performFlush(reason = 'manual') {
  if (!canUseLocalStorage() || !canUseIndexedDb()) return false;
  const snapshot = captureSnapshot();
  if (!snapshot) return false;
  snapshot.reason = reason;
  pendingImmediateFlush = false;
  const ok = await putSnapshot(snapshot);
  if (!ok) {
    // Keep dirty flag so another attempt can happen later
    dirty = true;
    scheduleFlush('retry');
  }
  return ok;
}

export async function flushBackupSnapshot(reason = 'manual', { immediate = false } = {}) {
  if (!canUseLocalStorage() || !canUseIndexedDb()) return false;
  if (immediate) {
    cancelFlushTimer();
    dirty = false;
    pendingImmediateFlush = true;
    return performFlush(reason);
  }
  dirty = true;
  lastDirtyReason = reason || lastDirtyReason;
  return performFlush(reason);
}

function flushBeforeSuspend(reason) {
  if (!canUseIndexedDb() || !canUseLocalStorage()) return;
  cancelFlushTimer();
  dirty = false;
  pendingImmediateFlush = true;
  void performFlush(reason);
}

function hasAnyPrefixedKeys() {
  if (!canUseLocalStorage()) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) return true;
    }
  } catch {}
  return false;
}

export async function restoreFromBackupIfNeeded() {
  if (restoreAttempted) return false;
  restoreAttempted = true;
  if (!canUseLocalStorage() || !canUseIndexedDb()) return false;

  let shouldRestore = false;
  try {
    if (!hasAnyPrefixedKeys()) {
      shouldRestore = true;
    } else {
      const activeSlot = localStorage.getItem(`${STORAGE_PREFIX}saveSlot`);
      if (activeSlot) {
        const coinKey = `${STORAGE_PREFIX}coins:${activeSlot}`;
        if (localStorage.getItem(coinKey) == null) {
          shouldRestore = true;
        }
      }
    }
  } catch {
    shouldRestore = false;
  }

  if (!shouldRestore) return false;

  const snapshot = await readSnapshot();
  if (!snapshot?.data) return false;

  let restored = false;
  try {
    for (const [key, value] of Object.entries(snapshot.data)) {
      if (value == null) continue;
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
        restored = true;
      }
    }
  } catch (err) {
    console.warn('Failed to restore snapshot into localStorage', err);
  }

  if (restored) {
    markProgressDirty('restored');
  }

  return restored;
}

export function installSuspendSafeguards() {
  if (installAttempted) return;
  installAttempted = true;
  if (typeof window === 'undefined') return;

  requestPersistentStorage();
  installStorageHooks();

  const onVisibilityChange = () => {
    if (document.hidden) {
      flushBeforeSuspend('visibility-hidden');
    } else {
      markProgressDirty('visibility-visible');
    }
  };

  try { document.addEventListener('visibilitychange', onVisibilityChange, { passive: true }); } catch {}
  try { window.addEventListener('pagehide', () => flushBeforeSuspend('pagehide'), { capture: true }); } catch {}
  try { window.addEventListener('beforeunload', () => flushBeforeSuspend('beforeunload')); } catch {}
  try { document.addEventListener('freeze', () => flushBeforeSuspend('freeze')); } catch {}
  try { window.addEventListener('pageshow', () => markProgressDirty('pageshow')); } catch {}
  try { window.addEventListener('focus', () => markProgressDirty('focus')); } catch {}
  try { window.addEventListener('storage', (event) => {
    if (!event) return;
    if (event.storageArea !== localStorage) return;
    if (event.key && !String(event.key).startsWith(STORAGE_PREFIX)) return;
    markProgressDirty('storage-event');
  }); } catch {}

  markProgressDirty('boot');
}

export function getSuspendMetadata() {
  return {
    pendingImmediateFlush,
    dirty,
    lastDirtyReason,
  };
}
