// js/ui/merchantDelve/dlgTab.js
import {
  bank,
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
} from '../../util/storage.js';
import { BigNum } from '../../util/bigNum.js';
import { MERCHANT_DIALOGUES } from '../../misc/merchantDialogues.js';
import { getXpState, isXpSystemUnlocked } from '../../game/xpSystem.js';
import { initResetPanel, initResetSystem, updateResetPanel, isForgeUnlocked, hasDoneForgeReset, hasDoneInfuseReset } from './resetTab.js';
import { initWorkshopTab, updateWorkshopTab } from './workshopTab.js';
import { blockInteraction } from '../shopOverlay.js';
import {
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

const MERCHANT_ICON_SRC = 'img/misc/merchant.webp';
const MERCHANT_MET_KEY_BASE  = 'ccc:merchantMet';
const MERCHANT_TAB_KEY_BASE  = 'ccc:merchantTab';
export const MERCHANT_DLG_STATE_KEY_BASE = 'ccc:merchant:dlgState';
export const MERCHANT_MET_EVENT = 'ccc:merchant:met';
const sk = (base) => `${base}:${getActiveSlot()}`;

export function hasMetMerchant() {
  try {
    return localStorage.getItem(sk(MERCHANT_MET_KEY_BASE)) === '1';
  } catch {
    return false;
  }
}

const MERCHANT_TABS_DEF = [
  { key: 'dialogue',  label: 'Dialogue', unlocked: true },
  { key: 'reset',     label: 'Reset',    unlocked: false, lockedLabel: '???' },
  { key: 'workshop',  label: 'Workshop', unlocked: false, lockedLabel: '???' },
];

const merchantTabUnlockState = new Map([
  ['dialogue', true],
  ['reset', false],
  ['workshop', false],
]);

const REWARD_ICON_SRC = {
  coins: 'img/currencies/coin/coin.webp',
  books: 'img/currencies/book/book.webp',
  gold: 'img/currencies/gold/gold.webp',
};

const MYSTERIOUS_ICON_SRC = 'img/misc/mysterious.webp';
const HIDDEN_DIALOGUE_TITLE = 'Hidden Dialogue';
const LOCKED_DIALOGUE_TITLE = 'Locked Dialogue';
const DEFAULT_MYSTERIOUS_BLURB = 'Hidden Dialogue';
const DEFAULT_LOCKED_BLURB = 'Locked';
const DEFAULT_LOCK_MESSAGE = 'Locked Dialogue';
const DIALOGUE_STATUS_ORDER = { locked: 0, mysterious: 1, unlocked: 2 };
const FORGE_COMPLETED_KEY_BASE = 'ccc:reset:forge:completed';

const HAS_POINTER_EVENTS = typeof window !== 'undefined' && 'PointerEvent' in window;
const HAS_TOUCH_EVENTS = !HAS_POINTER_EVENTS && typeof window !== 'undefined' && 'ontouchstart' in window;

function bindRapidActivation(target, handler, { once = false } = {}) {
  if (!target || typeof handler !== 'function') return () => {};
  let used = false;
  let pointerTriggered = false;
  let activePointerId = null;

  const run = (event) => {
    if (once && used) return;
    if (event?.type === 'click' && event.isTrusted && shouldSkipGhostTap(target)) {
      event.preventDefault?.();
      return;
    }
    // markGhostTapTarget removed - global handler manages clicks
    used = once ? true : used;
    Promise.resolve(handler(event)).catch(() => {});
    if (once) cleanup();
  };

  const resetPointerTrigger = () => {
    pointerTriggered = false;
    activePointerId = null;
  };

  const onClick = (event) => {
    if (pointerTriggered) {
      resetPointerTrigger();
      return;
    }
    run(event);
  };

const onPointerDown = (event) => {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  pointerTriggered = true;
  activePointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
  suppressNextGhostTap(160);
};

  const onPointerUp = (event) => {
    if (!pointerTriggered) return;
    if (activePointerId != null && typeof event.pointerId === 'number' && event.pointerId !== activePointerId) {
      return;
    }
    resetPointerTrigger();
    // run(event) removed here to prevent double-firing if global handler also triggers click
    // or if standard click follows. Let 'click' event handle execution.
  };

  const onPointerCancel = () => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
  };

const onTouchStart = (event) => {
  pointerTriggered = true;
  suppressNextGhostTap(160);
};

  const onTouchEnd = (event) => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
    // run(event) removed here as well
  };

  const onTouchCancel = () => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
  };

  const cleanup = () => {
    target.removeEventListener('click', onClick);
    if (HAS_POINTER_EVENTS) {
      target.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    } else if (HAS_TOUCH_EVENTS) {
      target.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    }
  };

  target.addEventListener('click', onClick);
  // We keep pointer listeners mainly for visual feedback or state tracking if needed,
  // but rely on 'click' for the action, which the global ghost tap system will dispatch rapidly.
  // Actually, for instant feedback, we might still want pointerdown logic if we weren't using the global system.
  // With global system: pointerdown -> immediate click. So 'click' handler is sufficient for logic.
  // The original rapid activation code was manually handling touch/pointer to avoid 300ms delay.
  // Now global system does that. So we can simplify this heavily.
  // BUT: bindRapidActivation handles 'once' logic and event suppression.
  // Let's keep it simple: just listen for click.
  
  // Removing manual pointer handling for activation, relying on global ghost tap
  // to fire 'click' event immediately on pointerdown.
  
  return () => { target.removeEventListener('click', onClick); };
}

function dialogueStatusRank(status) {
  return DIALOGUE_STATUS_ORDER[status] ?? 0;
}

function snapshotLockDisplay(info) {
  if (!info || typeof info !== 'object') return null;
  return {
    title: info.title ?? null,
    blurb: info.blurb ?? null,
    tooltip: info.tooltip ?? null,
    message: info.message ?? null,
    icon: info.icon ?? null,
    headerTitle: info.headerTitle ?? null,
    ariaLabel: info.ariaLabel ?? null,
  };
}

function buildUnlockedDialogueInfo(meta) {
  return {
    status: 'unlocked',
    unlocked: true,
    title: meta.title,
    blurb: meta.blurb,
    tooltip: '',
    message: '',
    icon: null,
    headerTitle: null,
    ariaLabel: meta.title || 'Merchant dialogue',
  };
}

let progressEventsBound = false;
let merchantDlgWatcherInitialized = false;
let forgeUnlockListenerBound = false;

function setMerchantTabUnlocked(key, unlocked) {
  const def = MERCHANT_TABS_DEF.find(t => t.key === key);
  if (!def) return;

  const lockedLabel = def.lockedLabel || '???';
  const normalized = !!unlocked;
  merchantTabUnlockState.set(key, normalized);
  def.unlocked = normalized;

  const btn = merchantTabs.buttons[key];
  if (btn) {
    btn.disabled = !normalized;
    btn.classList.toggle('is-locked', !normalized);
    btn.textContent = normalized ? def.label : lockedLabel;
    btn.title = normalized ? (def.label || 'Tab') : '???';
  }

  if (!normalized && merchantTabs.buttons[key]?.classList.contains('is-active')) {
    selectMerchantTab('dialogue');
  }
}

function syncForgeTabUnlockState() {
  let unlocked = false;
  try { unlocked = !!isForgeUnlocked?.(); }
  catch {}
  setMerchantTabUnlocked('reset', unlocked);
}

function syncWorkshopTabUnlockState() {
  let unlocked = false;
  try { unlocked = !!hasDoneInfuseReset?.(); }
  catch {}
  setMerchantTabUnlocked('workshop', unlocked);
}

let merchantDlgWatcherSlot = null;
let merchantDlgWatcherCleanup = null;

function bigNumToSafeInteger(value) {
  if (value && typeof value === 'object') {
    if (typeof value.toPlainIntegerString === 'function') {
      try {
        const plain = value.toPlainIntegerString();
        if (plain != null) {
          const parsed = Number.parseInt(plain, 10);
          if (Number.isFinite(parsed)) return parsed;
        }
      } catch {}
    }
    if (typeof value.toString === 'function') {
      try {
        const str = value.toString();
        if (str != null) {
          const parsed = Number.parseInt(str, 10);
          if (Number.isFinite(parsed)) return parsed;
        }
      } catch {}
    }
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  return Math.floor(numeric);
}

function getPlayerProgress() {
  const progress = {
    xpUnlocked: false,
    xpLevel: 0,
    hasForgeReset: false,
  };

  try {
    progress.xpUnlocked = typeof isXpSystemUnlocked === 'function' && isXpSystemUnlocked();
  } catch {
    progress.xpUnlocked = false;
  }

  if (progress.xpUnlocked) {
    try {
      const state = typeof getXpState === 'function' ? getXpState() : null;
      if (state && typeof state === 'object') {
        progress.xpLevel = bigNumToSafeInteger(state.xpLevel);
      }
    } catch {
      progress.xpLevel = 0;
    }
  }
  
  try {
    progress.hasForgeReset = typeof hasDoneForgeReset === 'function' && hasDoneForgeReset();
  } catch {
    progress.hasForgeReset = false;
  }
  
  return progress;
}

function resolveDialogueLock(meta, progress) {
  let rawState;
  try {
    rawState = typeof meta.unlock === 'function' ? meta.unlock(progress) : true;
  } catch {
    rawState = false;
  }

  const rawObj = (rawState && typeof rawState === 'object') ? rawState : null;
  let status = 'locked';

  if (rawState === true) {
    status = 'unlocked';
  } else if (rawObj) {
    const normalized = String(rawObj.status ?? '').toLowerCase();
    if (normalized === 'unlocked' || rawObj.unlocked === true) {
      status = 'unlocked';
    } else if (normalized === 'mysterious') {
      status = 'mysterious';
    } else {
      status = 'locked';
    }
  } else if (rawState === false || rawState == null) {
    status = 'locked';
  }

  const info = {
    status,
    unlocked: status === 'unlocked',
    title: status === 'unlocked' ? meta.title : '???',
    blurb: status === 'unlocked'
      ? meta.blurb
      : (status === 'mysterious' ? DEFAULT_MYSTERIOUS_BLURB : DEFAULT_LOCKED_BLURB),
    tooltip: '',
    message: '',
    icon: null,
    headerTitle: null,
    ariaLabel: '',
  };

  if (status === 'unlocked') {
    info.ariaLabel = meta.title || 'Merchant dialogue';
    return info;
  }

info.title = rawObj?.title ?? '???'
info.blurb = rawObj?.requirement
  ?? rawObj?.message
  ?? rawObj?.tooltip
  ?? (status === 'mysterious' ? DEFAULT_MYSTERIOUS_BLURB : DEFAULT_LOCKED_BLURB)
info.tooltip = rawObj?.tooltip
  ?? (status === 'locked' ? 'Locked Dialogue' : 'Hidden Dialogue');

info.message = rawObj?.message ?? (status === 'mysterious' ? DEFAULT_LOCK_MESSAGE : '');
info.icon = rawObj?.icon ?? (status === 'mysterious' ? MYSTERIOUS_ICON_SRC : null);
info.headerTitle = rawObj?.headerTitle ?? (status === 'mysterious' ? HIDDEN_DIALOGUE_TITLE : LOCKED_DIALOGUE_TITLE);
info.ariaLabel = rawObj?.ariaLabel ?? (status === 'mysterious'
  ? 'Hidden merchant dialogue'
  : 'Locked merchant dialogue');


  return info;
}

function ensureProgressEvents() {
  if (progressEventsBound) return;
  progressEventsBound = true;

  const handler = onProgressChanged;

  if (typeof window !== 'undefined') {
    window.addEventListener('xp:change', handler);
    window.addEventListener('xp:unlock', handler);
    window.addEventListener('forge:completed', (event) => {
      const detailSlot = event?.detail?.slot;
      if (detailSlot != null && detailSlot !== getActiveSlot()) return;
      handler();
    });
  }

  document.addEventListener('ccc:upgrades:changed', handler);

  const slot = getActiveSlot();
  if (slot != null) {
    const key = `${FORGE_COMPLETED_KEY_BASE}:${slot}`;
    watchStorageKey(key, { onChange: handler });
  }
}

function onProgressChanged() {
  renderDialogueList();
}

function completeDialogueOnce(id, meta) {
  const state = loadDlgState();
  const k = String(id);
  const prev = state[k] || {};

  if (meta.once && prev.claimed) return false;

  prev.claimed = true;
  state[k] = prev;
  saveDlgState(state);

  grantReward(meta.reward);
  return true;
}


function grantReward(reward) {
  if (!reward) return;

  if (reward.type === 'coins') {
    try {
      bank.coins.add(reward.amount);
    } catch (e) {
      console.warn('Failed to grant coin reward:', reward, e);
    }
    return;
  }

  if (reward.type === 'books') {
    try {
      bank.books.addWithMultiplier?.(reward.amount) ?? bank.books.add(reward.amount);
    } catch (e) {
      console.warn('Failed to grant book reward:', reward, e);
    }
    return;
  }

  if (reward.type === 'gold') {
    try {
      bank.gold.add(reward.amount);
    } catch (e) {
      console.warn('Failed to grant gold reward:', reward, e);
    }
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent('merchantReward', { detail: reward }));
  } catch {}
}

function rewardLabel(reward) {
  if (!reward) return '';
  if (reward.type === 'coins') return `Reward: ${reward.amount} coins`;
  if (reward.type === 'books') return `Reward: ${reward.amount} Books`;
  if (reward.type === 'gold')  return `Reward: ${reward.amount} Gold`;
  return 'Reward available';
}

export const DLG_CATALOG = {
  1: {
    title: 'A Generous Gift',
    blurb: 'The Merchant is feeling extra nice today.',
    scriptId: 1,
    reward: { type: 'coins', amount: 100 },
    unlock: (progress) => true,
    once: true,
  },
  2: {
    title: 'A New Experience',
    blurb: 'Discuss the XP system with the Merchant.',
    scriptId: 2,
    reward: { type: 'books', amount: 5 },
    once: true,
    unlock: (progress) => {
      if (!progress?.xpUnlocked) {
        return {
          status: 'mysterious',
          requirement: 'Unlock the XP system to reveal this dialogue',
          message: 'Unlock the XP system to reveal this dialogue',
          icon: MYSTERIOUS_ICON_SRC,
          headerTitle: HIDDEN_DIALOGUE_TITLE,
          ariaLabel: 'Hidden merchant dialogue, unlock the XP system to reveal this dialogue',
        };
      }
      return true;
    },
  },
  3: {
    title: 'A Golden Opportunity',
    blurb: 'Ask the Merchant a few questions about the Forge.',
    scriptId: 3,
    reward: { type: 'gold', amount: 10 },
    once: true,
    unlock: (progress) => {
      if (progress?.hasForgeReset) {
        return true;
      }

      if (!progress?.xpUnlocked || (progress?.xpLevel ?? 0) < 31) {
        return {
          status: 'locked',
          title: '???',
          blurb: DEFAULT_LOCKED_BLURB,
          tooltip: 'Locked Dialogue',
          ariaLabel: 'Locked Dialogue',
        };
      }

      return {
        status: 'mysterious',
        requirement: 'Do a Forge reset to reveal this dialogue',
        message: 'Do a Forge reset to reveal this dialogue',
        icon: MYSTERIOUS_ICON_SRC,
        headerTitle: HIDDEN_DIALOGUE_TITLE,
        ariaLabel: 'Hidden merchant dialogue, do a Forge reset to reveal this dialogue',
      };
    },
  },
};

export function loadDlgState() {
  try { return JSON.parse(localStorage.getItem(sk(MERCHANT_DLG_STATE_KEY_BASE)) || '{}'); } catch { return {}; }
}

export function saveDlgState(s) {
  const key = sk(MERCHANT_DLG_STATE_KEY_BASE);
  try {
    const payload = JSON.stringify(s);
    localStorage.setItem(key, payload);
    try { primeStorageWatcherSnapshot(key, payload); } catch {}
  } catch {}
}

function parseDlgStateRaw(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function cleanupMerchantDlgStateWatcher() {
  const stop = merchantDlgWatcherCleanup;
  merchantDlgWatcherCleanup = null;
  if (typeof stop === 'function') {
    try { stop(); } catch {}
  }
}

function handleMerchantDlgStateChange(_, meta = {}) {
  if (!meta?.rawChanged) return;
  renderDialogueList();
}

function bindMerchantDlgStateWatcherForSlot(slot) {
  if (slot === merchantDlgWatcherSlot) return;
  cleanupMerchantDlgStateWatcher();
  merchantDlgWatcherSlot = slot ?? null;
  if (slot == null) {
    renderDialogueList();
    return;
  }
  const storageKey = `${MERCHANT_DLG_STATE_KEY_BASE}:${slot}`;
  merchantDlgWatcherCleanup = watchStorageKey(storageKey, {
    parse: parseDlgStateRaw,
    onChange: handleMerchantDlgStateChange,
  });
  try { primeStorageWatcherSnapshot(storageKey); } catch {}
  renderDialogueList();
}

function ensureMerchantDlgStateWatcher() {
  if (merchantDlgWatcherInitialized) {
    bindMerchantDlgStateWatcherForSlot(getActiveSlot());
    return;
  }
  merchantDlgWatcherInitialized = true;
  bindMerchantDlgStateWatcherForSlot(getActiveSlot());
  if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => {
      bindMerchantDlgStateWatcherForSlot(getActiveSlot());
    });
  }
}

ensureMerchantDlgStateWatcher();

// ----- Module state -----
let merchantOverlayEl = null;
let merchantSheetEl   = null;
let merchantCloseBtn  = null;
let merchantOpen      = false;
let merchantDrag      = null;
let merchantLastFocus = null;
let merchantEventsBound = false;
let merchantTabs = { buttons: {}, panels: {}, tablist: null };

// ========================= Typing SFX (WebAudio, zero-latency, mobile volume) =========================
const TYPING_SFX_SOURCE = ['sounds/merchant_typing.ogg']; // ensure this asset exists

let __audioCtx = null;
let __typingGain = null;
let __typingBuffer = null;     // decoded buffer (once)
let __bufferLoadPromise = null;

let __typingSfx = null;        // fallback <audio> element
let __typingSource = null;     // MediaElementSource (once)
let __bufferSource = null;     // current BufferSource (recreated each start)

let __typingSfxPrimed = false;
let __isTypingActive  = false;

function ensureAudioCtx() {
  if (!__audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    __audioCtx = new Ctx();
  }
  if (!__typingGain) {
    __typingGain = __audioCtx.createGain();
    __typingGain.gain.value = IS_MOBILE ? 0.15 : 0.3;  // mobile quieter
    __typingGain.connect(__audioCtx.destination);
  }
}

function pickSupportedSrc() { return TYPING_SFX_SOURCE[0]; }

async function loadTypingBuffer() {
  ensureAudioCtx();
  if (__typingBuffer) return __typingBuffer;
  if (__bufferLoadPromise) return __bufferLoadPromise;

  const url = pickSupportedSrc();
  __bufferLoadPromise = (async () => {
    const res = await fetch(url, { cache: 'force-cache' });
    const arr = await res.arrayBuffer();
    return await __audioCtx.decodeAudioData(arr);
  })()
  .then(buf => (__typingBuffer = buf))
  .catch(err => { console.warn('Typing SFX decode failed:', err); __bufferLoadPromise = null; });

  return __bufferLoadPromise;
}

function ensureTypingAudioElement() {
  if (__typingSfx) return __typingSfx;
  const a = new Audio();
  a.loop = true;
  a.preload = 'auto';
  a.muted = false;
  a.volume = 1.0; // iOS ignores this; gain node controls volume

  const url = pickSupportedSrc();
  a.src = url;

  __typingSfx = a;
  return a;
}

function ensureElementGraph() {
  ensureAudioCtx();
  ensureTypingAudioElement();
  if (!__typingSource) {
    __typingSource = __audioCtx.createMediaElementSource(__typingSfx);
    __typingSource.connect(__typingGain);
  }
}

export function setTypingGainForDevice() {
  if (!__typingGain) return;
  __typingGain.gain.value = IS_MOBILE ? 0.15 : 0.3;
}

// Prime from a user gesture — silent, no AbortError spam
export function primeTypingSfx() {
  if (__typingSfxPrimed) return;
  __typingSfxPrimed = true;

  ensureAudioCtx();
  __audioCtx.resume().catch(()=>{});

  // Kick off buffer decode early
  loadTypingBuffer();

  // Satisfy autoplay policies silently via element path
  const a = ensureTypingAudioElement();
  ensureElementGraph();

  const prevLoop = a.loop;
  const prevMuted = a.muted;
  a.loop = false;
  a.muted = true;

  a.play()
    .then(() => { a.pause(); a.currentTime = 0; })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        console.warn('Typing SFX prime error:', err);
        __typingSfxPrimed = false;
      }
    })
    .finally(() => { a.loop = prevLoop; a.muted = prevMuted; });
}

async function startTypingSfx() {
  ensureAudioCtx();
  await __audioCtx.resume().catch(()=>{});

  await loadTypingBuffer();

  // Prefer zero-latency buffer path
  if (__isTypingActive && __typingBuffer) {
    if (__bufferSource) {
      try { __bufferSource.stop(0); } catch {}
      try { __bufferSource.disconnect(); } catch {}
      __bufferSource = null;
    }
    __bufferSource = __audioCtx.createBufferSource();
    __bufferSource.buffer = __typingBuffer;
    __bufferSource.loop = true;
    __bufferSource.connect(__typingGain);
    __bufferSource.start(0);
    return;
  }

  // Fallback element path (rare first-line race)
  ensureElementGraph();
  if (__isTypingActive && __typingSfx) {
    __typingSfx.currentTime = 0;
    try { await __typingSfx.play(); }
    catch {
      const once = () => { if (__isTypingActive) __typingSfx.play().catch(()=>{}); document.removeEventListener('click', once); };
      document.addEventListener('click', once, { once: true });
    }
  }
}

function stopTypingSfx() {
  if (__bufferSource) {
    try { __bufferSource.stop(0); } catch {}
    try { __bufferSource.disconnect(); } catch {}
    __bufferSource = null;
  }
  if (__typingSfx) {
    __typingSfx.pause();
    __typingSfx.currentTime = 0;
  }
}

// Keep gain correct if device/orientation changes
window.matchMedia?.('(any-pointer: coarse)')?.addEventListener?.('change', setTypingGainForDevice);
window.addEventListener('orientationchange', setTypingGainForDevice);

// ========================= Typewriter =========================
function typeText(el, full, msPerChar = 22, skipTargets = []) {
  return new Promise((resolve) => {
    let i = 0, skipping = false;
    let armed = false;

    __isTypingActive = true;
    startTypingSfx();

    const skip = (e) => { if (!armed) return; e.preventDefault(); skipping = true; };
    const onKey = (e) => { if (!armed) return; if (e.key === 'Enter' || e.key === ' ') skipping = true; };

    const targets = skipTargets.length ? skipTargets : [el];

    requestAnimationFrame(() => {
      armed = true;
      targets.forEach(t => t.addEventListener('click', skip, { once: true }));
      document.addEventListener('keydown', onKey, { once: true });
    });

    el.classList.add('is-typing');
    el.textContent = '';

    const cleanup = () => {
      targets.forEach(t => t.removeEventListener('click', skip));
      document.removeEventListener('keydown', onKey);
      el.classList.remove('is-typing');
      stopTypingSfx();
      __isTypingActive = false;
    };

    const tick = () => {
      if (skipping) { el.textContent = full; cleanup(); resolve(); return; }
      el.textContent = full.slice(0, i++);
      if (i <= full.length) setTimeout(tick, msPerChar);
      else { cleanup(); resolve(); }
    };
    tick();
  });
}

// ========================= DialogueEngine =========================
class DialogueEngine {
  constructor({ textEl, choicesEl, skipTargets, onEnd }) {
    this.textEl = textEl;
    this.choicesEl = choicesEl;
    this.skipTargets = skipTargets;
    this.onEnd = onEnd || (() => {});
    this.nodes = {};
    this.current = null;

    this.deferNextChoices = false;
    this._reservedH = 0;
  }

  load(script) {
    this.nodes = script.nodes || {};
    this.startId = script.start;
  }

  async start() {
    if (!this.startId) return;
    await this.goto(this.startId);
  }

  async goto(id) {
    const node = this.nodes[id];
    if (!node) return;
    this.current = id;

    if (node.type === 'line') {
      const nextNode = this.nodes[node.next];

      // Pre-render next choices invisibly to reserve height (unless deferring)
      if (!this.deferNextChoices && nextNode && nextNode.type === 'choice') {
        this._renderChoices(nextNode.options || [], true);
      } else {
        this._hideChoices();
      }

      await typeText(this.textEl, node.say, node.msPerChar ?? 22, this.skipTargets);

      if (nextNode && nextNode.type === 'choice') {
        this.current = node.next;

        if (this.deferNextChoices) {
          this.deferNextChoices = false;
          this._renderChoices(nextNode.options || [], false); // build & reveal now
          this.choicesEl.style.minHeight = '';
          return;
        }

        this._revealPreparedChoices();
        return;
      }

      this.choicesEl.style.minHeight = '';
      if (node.next === 'end' || node.end === true) return this.onEnd();
      if (node.next) return this.goto(node.next);
      return;
    }

    if (node.type === 'choice') {
      this._renderChoices(node.options || [], false);
    }
  }

  _hideChoices() {
    this.choicesEl.classList.remove('is-visible');
    this._applyInlineChoiceHide();
  }

  _renderChoices(options, prepare = false) {
    this.choicesEl.innerHTML = '';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.textContent = opt.label;
      const unbind = bindRapidActivation(btn, async (event) => {
        event?.stopPropagation?.();
        this._reservedH = this.choicesEl.offsetHeight | 0;
        this.choicesEl.style.minHeight = this._reservedH + 'px';
        this._hideChoices();
        this.choicesEl.innerHTML = '';

        this.deferNextChoices = true;

        if (opt.to === 'end') {
          return this.onEnd({ noReward: false });
        }
        if (opt.to === 'end_nr') {
          return this.onEnd({ noReward: true });
        }

        await this.goto(opt.to);
      }, { once: true });
      this.choicesEl.appendChild(btn);
    }

    if (prepare) {
      this.choicesEl.classList.remove('is-visible');
      this._applyInlineChoiceHide();
      return;
    }
    this._clearInlineChoiceHide();
    requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
  }

  _revealPreparedChoices() {
    this._clearInlineChoiceHide();
    requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
  }

  _applyInlineChoiceHide() {
    this.choicesEl.style.opacity = '0';
    this.choicesEl.style.transform = 'translateY(6px)';
    this.choicesEl.style.pointerEvents = 'none';
  }

  _clearInlineChoiceHide() {
    this.choicesEl.style.opacity = '';
    this.choicesEl.style.transform = '';
    this.choicesEl.style.pointerEvents = '';
  }
}

function openDialogueLockInfo(lockInfo = {}) {
  if (!merchantOverlayEl) return;

  primeTypingSfx();

  const overlay = document.createElement('div');
  overlay.className = 'merchant-firstchat merchant-lockinfo';
  overlay.setAttribute('data-dismissible', '1');
  overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="${lockInfo.ariaLabel || HIDDEN_DIALOGUE_TITLE}">
      <div class="merchant-firstchat__header">
        <div class="name"></div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row merchant-lockinfo__row">
        <img class="merchant-firstchat__icon" src="${lockInfo.icon || MYSTERIOUS_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text merchant-lockinfo__message"></div>
      </div>
      <div class="merchant-firstchat__actions merchant-lockinfo__actions">
        <button type="button" class="merchant-firstchat__continue merchant-lockinfo__close">Close</button>
      </div>
    </div>
  `;

  merchantOverlayEl.appendChild(overlay);

  const cardEl = overlay.querySelector('.merchant-firstchat__card');
  const nameEl = overlay.querySelector('.merchant-firstchat__header .name');
  const messageEl = overlay.querySelector('.merchant-lockinfo__message');
  const closeBtn = overlay.querySelector('.merchant-lockinfo__close');

  nameEl.textContent = lockInfo.headerTitle || HIDDEN_DIALOGUE_TITLE;
  messageEl.textContent = lockInfo.message || DEFAULT_LOCK_MESSAGE;

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  merchantOverlayEl.classList.add('firstchat-active');

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('is-visible');
    merchantOverlayEl.classList.remove('firstchat-active');
    stopTypingSfx();
    __isTypingActive = false;
    document.removeEventListener('keydown', onEsc, true);
    setTimeout(() => overlay.remove(), 160);
  };

  const onEsc = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
  };

  document.addEventListener('keydown', onEsc, true);

overlay.addEventListener('pointerdown', (e) => {
  if (!cardEl.contains(e.target)) {
    // Don’t arm global ghost guard for background taps — just shield briefly
    e.preventDefault();
    blockInteraction(160);
    close();
  }
});

const doCloseFromBtn = (e) => {
  if (!e || e.pointerType !== 'mouse') blockInteraction(160);
  close();
};

  bindRapidActivation(closeBtn, () => { doCloseFromBtn(); }, { once: true });

  closeBtn.focus?.();
}

function openDialogueModal(id, meta) {
  primeTypingSfx();

  const overlay = document.createElement('div');
  overlay.className = 'merchant-firstchat';
  overlay.setAttribute('data-dismissible', '1');
  overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="${meta.title}">
      <div class="merchant-firstchat__header">
        <div class="name">Merchant</div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row">
        <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text">…</div>
      </div>
      <div class="merchant-firstchat__choices"></div>
    </div>
  `;
  merchantOverlayEl.appendChild(overlay);
const onEscToCancel = (e) => {
  if (e.key !== 'Escape') return;
  if (!overlay.isConnected) return;
  cancelWithoutReward();
};

document.addEventListener('keydown', onEscToCancel, { capture: true });


  // fade/blur in (same behavior as first meet)
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  merchantOverlayEl.classList.add('firstchat-active');

  // local refs
  const textEl    = overlay.querySelector('.merchant-firstchat__text');
  const rowEl     = overlay.querySelector('.merchant-firstchat__row');
  const cardEl    = overlay.querySelector('.merchant-firstchat__card');
  const choicesEl = overlay.querySelector('.merchant-firstchat__choices');

  let ended = false;

  // Close helpers — end (with reward) vs cancel (no reward)
  const closeModal = () => {
	document.removeEventListener('keydown', onEscToCancel, { capture: true });
    overlay.classList.remove('is-visible');
    merchantOverlayEl.classList.remove('firstchat-active');
    stopTypingSfx();
    __isTypingActive = false;
    // small delay to let fade finish
    setTimeout(() => overlay.remove(), 160);
  };

  const cancelWithoutReward = () => {
    if (ended) return;
    ended = true;
    closeModal();               // no reward
    renderDialogueList();       // refresh UI state
  };

overlay.addEventListener('pointerdown', (e) => {
  if (!cardEl.contains(e.target)) {
    e.preventDefault();
    if (e.pointerType !== 'mouse') blockInteraction(160);
    cancelWithoutReward();
  }
});

const engine = new DialogueEngine({
  textEl,
  choicesEl,
  skipTargets: [textEl, rowEl, cardEl],
  onEnd: (info) => {
    if (ended) return;
    ended = true;

    if (info && info.noReward) {
      closeModal();
      renderDialogueList();
      return;
    }

    completeDialogueOnce(id, meta);
    closeModal();
    renderDialogueList();
  }
});

  const state = loadDlgState();
  const claimed = !!state[id]?.claimed;

  const script = structuredClone(MERCHANT_DIALOGUES[meta.scriptId]);

  if (claimed && script.nodes.m2b && script.nodes.c2a && meta.scriptId === 1) {
    script.nodes.m2b.say = 'I\'ve already given you Coins, goodbye.';
    script.nodes.c2a.options = [
      { label: 'Goodbye.', to: 'end_nr' },
      { label: 'Goodbye.', to: 'end_nr' },
      { label: 'Goodbye.', to: 'end_nr' },
    ];
  }

  if (claimed && meta.scriptId === 2 && script.nodes.m2a) {
    script.nodes.m2a.say = 'I\'ve already given you Books, goodbye.';
	if (script.nodes.c2a) {
      script.nodes.c2a.options = [
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
      ];
    }
  }
  
  if (claimed && meta.scriptId === 3 && script.nodes.m5a) {
    script.nodes.m5a.say = 'I\'ve already given you Gold, goodbye.';
    if (script.nodes.c5a) {
      script.nodes.c5a.options = [
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
      ];
    }
  }

  engine.load(script);
  engine.start();
}

// ========================= Merchant Overlay (Delve) =========================
function ensureMerchantScrollbar() {
  const scroller = merchantOverlayEl?.querySelector('.merchant-content');
  if (!scroller || scroller.__customScroll) return;
  if (!merchantSheetEl) return;

  const bar = document.createElement('div');
  bar.className = 'merchant-scrollbar';
  const thumb = document.createElement('div');
  thumb.className = 'merchant-scrollbar__thumb';
  bar.appendChild(thumb);
  merchantSheetEl.appendChild(bar);

  const isTouch = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
  const FADE_SCROLL_MS = 150;
  const FADE_DRAG_MS = 120;
  const supportsScrollEnd = 'onscrollend' in window;
  let fadeTimer = null;

  const syncScrollShadow = () => {
    const hasShadow = (scroller.scrollTop || 0) > 0;
    merchantSheetEl?.classList.toggle('has-scroll-shadow', hasShadow);
  };

  const updateBounds = () => {
    const grabber = merchantOverlayEl.querySelector('.merchant-grabber');
    const header  = merchantOverlayEl.querySelector('.merchant-header');
    const actions = merchantOverlayEl.querySelector('.merchant-actions');

    const top = ((grabber?.offsetHeight || 0) + (header?.offsetHeight || 0)) | 0;
    const bottom = (actions?.offsetHeight || 0) | 0;

    bar.style.top = top + 'px';
    bar.style.bottom = bottom + 'px';
  };

  const updateThumb = () => {
    const { scrollHeight, clientHeight, scrollTop } = scroller;
    const barH = bar.clientHeight || 1;

    const visibleRatio = clientHeight / Math.max(1, scrollHeight);
    const thumbH = Math.max(28, Math.round(barH * visibleRatio));

    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const range = Math.max(0, barH - thumbH);
    const y = Math.round((scrollTop / maxScroll) * range);

    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translateY(${y}px)`;

    bar.style.display = (scrollHeight <= clientHeight + 1) ? 'none' : '';
  };

  const updateAll = () => {
    updateBounds();
    updateThumb();
    syncScrollShadow();
  };

  const showBar = () => {
    if (!isTouch) return;
    merchantSheetEl.classList.add('is-scrolling');
    if (fadeTimer) clearTimeout(fadeTimer);
  };

  const scheduleHide = (delay) => {
    if (!isTouch) return;
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      merchantSheetEl.classList.remove('is-scrolling');
    }, delay);
  };

  const onScroll = () => {
    updateThumb();
    syncScrollShadow();
    if (isTouch) showBar();
    if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS);
  };

  const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) {
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
  }

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);
  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll);

  // ----- Drag thumb to scroll -----
  let dragging = false;
  let dragStartY = 0;
  let startScrollTop = 0;

  const startDrag = (e) => {
    dragging = true;
    dragStartY = e.clientY;
    startScrollTop = scroller.scrollTop;
    thumb.classList.add('dragging');
    showBar();
    try { thumb.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  };

  const onDragMove = (e) => {
    if (!dragging) return;
    const barH = bar.clientHeight || 1;
    const thH = thumb.clientHeight || 1;
    const range = Math.max(1, barH - thH);
    const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const deltaY = e.clientY - dragStartY;
    const scrollDelta = (deltaY / range) * scrollMax;
    scroller.scrollTop = startScrollTop + scrollDelta;
  };

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
    scheduleHide(FADE_DRAG_MS);
    try { thumb.releasePointerCapture(e.pointerId); } catch {}
  };

  thumb.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', onDragMove, { passive: true });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Click track to jump
  bar.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const rect = bar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;

    const barH = bar.clientHeight || 1;
    const thH = thumb.clientHeight || 1;
    const range = Math.max(0, barH - thH);
    const targetY = Math.max(0, Math.min(clickY - thH / 2, range));

    const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = (targetY / Math.max(1, range)) * scrollMax;

    showBar();
    scheduleHide(FADE_SCROLL_MS);
  });

  // mark so we don't double-init
  scroller.__customScroll = { bar, thumb, ro, updateAll };
}

function ensureMerchantOverlay() {
  if (merchantOverlayEl) return;

  merchantOverlayEl = document.createElement('div');
  merchantOverlayEl.className = 'merchant-overlay';
  merchantOverlayEl.id = 'merchant-overlay';
  merchantOverlayEl.setAttribute('inert', '');

  merchantSheetEl = document.createElement('div');
  merchantSheetEl.className = 'merchant-sheet';
  merchantSheetEl.setAttribute('role', 'dialog');
  merchantSheetEl.setAttribute('aria-modal', 'false');
  merchantSheetEl.setAttribute('aria-label', 'Merchant');

  const grabber = document.createElement('div');
  grabber.className = 'merchant-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const header = document.createElement('header');
  header.className = 'merchant-header';
  header.innerHTML = `
    <div class="merchant-title">Merchant</div>
    <div class="merchant-line" aria-hidden="true"></div>
  `;

  const content = document.createElement('div');
  content.className = 'merchant-content';

  const tabs = document.createElement('div');
  tabs.className = 'merchant-tabs';
  tabs.setAttribute('role', 'tablist');

  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'merchant-panels';

  const panelDialogue = document.createElement('section');
  panelDialogue.className = 'merchant-panel is-active';
  panelDialogue.id = 'merchant-panel-dialogue';

  const panelReset = document.createElement('section');
  panelReset.className = 'merchant-panel';
  panelReset.id = 'merchant-panel-reset';

  const panelWorkshop = document.createElement('section');
  panelWorkshop.className = 'merchant-panel';
  panelWorkshop.id = 'merchant-panel-workshop';

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();

  MERCHANT_TABS_DEF.forEach(def => {
    if (def.key === 'dialogue') merchantTabUnlockState.set('dialogue', true);
    const stored = merchantTabUnlockState.get(def.key);
    const unlocked = stored != null ? stored : !!def.unlocked;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'merchant-tab';
    btn.dataset.tab = def.key;
    const lockedLabel = def.lockedLabel || '???';
    btn.textContent = unlocked ? def.label : lockedLabel;
      if (!unlocked) {
        btn.classList.add('is-locked');
        btn.disabled = true;
        btn.title = '???';
      } else {
      btn.title = def.label || 'Tab';
    }
    def.unlocked = unlocked;
    merchantTabUnlockState.set(def.key, unlocked);
    bindRapidActivation(btn, (event) => {
      if (btn.disabled) {
        event?.preventDefault?.();
        return;
      }
      selectMerchantTab(def.key);
    });

    tabs.appendChild(btn);
    merchantTabs.buttons[def.key] = btn;
  });

  merchantTabs.panels['dialogue']  = panelDialogue;
  merchantTabs.panels['reset']     = panelReset;
  merchantTabs.panels['workshop']  = panelWorkshop;
  merchantTabs.tablist = tabs;

  panelsWrap.append(panelDialogue, panelReset, panelWorkshop);
  content.append(tabs, panelsWrap);

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();

  try { initResetSystem(); } catch {}
  try { initResetPanel(panelReset); } catch {}
  try { updateResetPanel(); } catch {}
  
  try { initWorkshopTab(panelWorkshop); } catch {}

  if (!forgeUnlockListenerBound && typeof window !== 'undefined') {
    const handleUnlockChange = (event) => {
      const { key, slot } = event?.detail ?? {};
      if (slot != null && slot !== getActiveSlot()) return;
      
      if (key === 'forge' || !key) syncForgeTabUnlockState();
      if (key === 'infuse' || !key) syncWorkshopTabUnlockState();
    };
    window.addEventListener('unlock:change', handleUnlockChange, { passive: true });
    window.addEventListener('saveSlot:change', handleUnlockChange, { passive: true });
    forgeUnlockListenerBound = true;
  }

    const actions = document.createElement('div');
    actions.className = 'merchant-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'merchant-close';
    closeBtn.textContent = 'Close';
    merchantCloseBtn = closeBtn;
    actions.appendChild(closeBtn);

  // First-time chat overlay
  const firstChat = document.createElement('div');
  firstChat.className = 'merchant-firstchat merchant-firstchat--initial';
  firstChat.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="First chat">
      <div class="merchant-firstchat__header">
        <div class="name">Merchant</div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row">
        <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text" id="merchant-first-line">…</div>
      </div>
      <div class="merchant-firstchat__choices" id="merchant-first-choices"></div>
    </div>
  `;

  merchantSheetEl.append(grabber, header, content, actions, firstChat);
  merchantOverlayEl.appendChild(merchantSheetEl);
  document.body.appendChild(merchantOverlayEl);
  initDialogueTab();
  ensureMerchantScrollbar();

  if (!merchantEventsBound) {
    merchantEventsBound = true;

    const onCloseClick = () => { closeMerchant(); };

    bindRapidActivation(closeBtn, onCloseClick, { once: false });
    document.addEventListener('keydown', onKeydownForMerchant);
    grabber.addEventListener('pointerdown', onMerchantDragStart);
    grabber.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    // Allow priming via any pointer in the overlay (mobile-safe)
    merchantOverlayEl.addEventListener('pointerdown', primeTypingSfx, { once: true });
  }
}

// Called once when Merchant overlay is created
function initDialogueTab() {
  const panel = document.getElementById('merchant-panel-dialogue');
  if (!panel || panel.__dlgInit) return;
  panel.__dlgInit = true;

  const list = document.createElement('div');
  list.className = 'merchant-dialogue-list';
  panel.appendChild(list);

  panel.__dlgList = list;
  ensureProgressEvents();
  renderDialogueList();
}

function renderDialogueList() {
  const panel = document.getElementById('merchant-panel-dialogue');
  if (!panel) return;

  const list = panel.__dlgList;
  if (!list) return;

  const progress = getPlayerProgress();
  const state = loadDlgState();
  let stateDirty = false;

  list.innerHTML = '';

  Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
    const entryState = state[id] || {};
    const storedStatus = entryState.status || 'locked';
    const storedRank = dialogueStatusRank(storedStatus);

    let lockInfo = resolveDialogueLock(meta, progress);
    let status = lockInfo.status;
    let rank = dialogueStatusRank(status);

    if (rank > storedRank) {
      entryState.status = status;
      if (status === 'mysterious') {
        entryState.lockSnapshot = snapshotLockDisplay(lockInfo);
      } else if (status === 'unlocked') {
        delete entryState.lockSnapshot;
      }
      state[id] = entryState;
      stateDirty = true;
    } else if (rank < storedRank) {
      if (storedStatus === 'unlocked') {
        lockInfo = buildUnlockedDialogueInfo(meta);
        status = 'unlocked';
        rank = dialogueStatusRank(status);
      } else if (storedStatus === 'mysterious') {
        const snapshot = entryState.lockSnapshot || snapshotLockDisplay(lockInfo) || {};
        lockInfo = {
          status: 'mysterious',
          unlocked: false,
          title: snapshot.title ?? lockInfo.title ?? '???',
          blurb: snapshot.blurb ?? lockInfo.blurb ?? DEFAULT_MYSTERIOUS_BLURB,
          tooltip: snapshot.tooltip ?? lockInfo.tooltip ?? 'Hidden Dialogue',
          message: snapshot.message ?? lockInfo.message ?? DEFAULT_LOCK_MESSAGE,
          icon: snapshot.icon ?? lockInfo.icon ?? MYSTERIOUS_ICON_SRC,
          headerTitle: snapshot.headerTitle ?? lockInfo.headerTitle ?? HIDDEN_DIALOGUE_TITLE,
          ariaLabel: snapshot.ariaLabel ?? lockInfo.ariaLabel ?? 'Hidden merchant dialogue',
        };
        status = 'mysterious';
        rank = dialogueStatusRank(status);
      }
    }

    const unlocked = status === 'unlocked';
    const isMysterious = status === 'mysterious';
    const locked = status === 'locked';
    const claimed = !!entryState.claimed;
    const showComplete = unlocked && !!(meta.once && claimed);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dlg-card';
    card.dataset.dlgStatus = status;
    card.disabled = !!locked;

    if (locked) {
      card.classList.add('is-locked');
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('tabindex', '-1');
    } else {
      card.removeAttribute('aria-disabled');
      card.removeAttribute('tabindex');
    }

    if (isMysterious) {
      card.classList.add('is-mysterious');
    }

    const title = document.createElement('div');
    title.className = 'dlg-title';
    title.textContent = unlocked ? meta.title : (lockInfo.title ?? '???');

    const blurb = document.createElement('div');
    blurb.className = 'dlg-blurb';
    blurb.textContent = unlocked ? meta.blurb : (lockInfo.blurb ?? '');

    const reward = document.createElement('div');
    reward.className = 'dlg-reward';

    if (unlocked && meta.reward) {
      const iconSrc = REWARD_ICON_SRC[meta.reward.type];

      if (iconSrc) {
        reward.classList.add('has-reward');
        reward.innerHTML = `
          <span class="reward-label">Reward:</span>
          <span class="reward-chunk" style="--reward-icon: url('${iconSrc}')">
            <span class="reward-icon" aria-hidden="true"></span>
            <span class="amt">${meta.reward.amount}</span>
          </span>
        `;

        reward.setAttribute(
          'aria-label',
          `Reward: ${meta.reward.amount} ${meta.reward.type}`
        );
      } else {
        reward.textContent = rewardLabel(meta.reward);
      }
    } else {
      reward.textContent = '';
      reward.style.display = 'none';
    }

    const ariaLabel = unlocked
      ? `${meta.title}${showComplete ? ' (completed)' : ''}`
      : (lockInfo.ariaLabel || (isMysterious ? 'Hidden merchant dialogue' : 'Locked merchant dialogue'));
    card.setAttribute('aria-label', ariaLabel);

    if (lockInfo.tooltip) {
      card.title = lockInfo.tooltip;
    } else if (unlocked) {
      card.title = 'Left-click: Start Dialogue';
    } else {
      card.removeAttribute('title');
    }

    card.append(title, blurb, reward);

    if (showComplete) {
      card.classList.add('is-complete');
      const again = document.createElement('div');
      again.className = 'dlg-again';
      again.textContent = 'Ask Again?';
      card.classList.add('has-again');
      card.append(again);
    }

    list.appendChild(card);

    const handleCardClick = (event) => {
      if (card.classList.contains('is-locked') && !isMysterious) {
        event?.preventDefault?.();
        return;
      }
      if (unlocked) {
        openDialogueModal(id, meta);
      } else if (isMysterious) {
        openDialogueLockInfo(lockInfo);
      }
    };

    if (unlocked || isMysterious) {
      bindRapidActivation(card, handleCardClick);
    }
  });

  if (stateDirty) {
    saveDlgState(state);
  }
}

// Runs a conversation inside the Dialogue tab (not the first-time overlay)
function startConversation(id, meta) {
  const panel = document.getElementById('merchant-panel-dialogue');
  if (!panel) return;

  const textEl = panel.querySelector('.merchant-text');     // from your bubble
  const bubble = panel.querySelector('.merchant-bubble');
  const row = panel;                                        // big tap target
  let choicesEl = panel.querySelector('.merchant-choices');

  // Ensure blank + hide choices before typing
  choicesEl.classList.remove('is-visible');
  choicesEl.innerHTML = '';

  const engine = new DialogueEngine({
    textEl,
    choicesEl,
    skipTargets: [textEl, row, bubble],
    onEnd: (info) => {
	  if (info && info.noReward) {
        textEl.textContent = '…';
        renderDialogueList();
        return;
      }
      completeDialogueOnce(id, meta);
	textEl.textContent = '…';
	renderDialogueList();
	}
  });

  const script = MERCHANT_DIALOGUES[meta.scriptId];
  engine.load(script);
  engine.start();
}

function runFirstMeet() {
  const fc = merchantOverlayEl.querySelector('.merchant-firstchat');
  const textEl = fc.querySelector('#merchant-first-line');
  const rowEl  = fc.querySelector('.merchant-firstchat__row');
  const cardEl = fc.querySelector('.merchant-firstchat__card');
  const choicesEl = fc.querySelector('#merchant-first-choices');

  const engine = new DialogueEngine({
    textEl,
    choicesEl,
    skipTargets: [textEl, rowEl, cardEl],
    onEnd: () => {
      try { localStorage.setItem(sk(MERCHANT_MET_KEY_BASE), '1'); } catch {}
      try { window.dispatchEvent(new Event(MERCHANT_MET_EVENT)); } catch {}
      fc.classList.remove('is-visible');
      merchantOverlayEl.classList.remove('firstchat-active');
    }
  });

  engine.load(MERCHANT_DIALOGUES[0]);
  engine.start();
}

function resetFirstChatOverlayState() {
  if (!merchantOverlayEl) return;
  const fc = merchantOverlayEl.querySelector('.merchant-firstchat--initial');
  if (!fc) return;

  fc.classList.remove('is-visible');

  const textEl = fc.querySelector('#merchant-first-line');
  if (textEl) {
    textEl.classList.remove('is-typing');
    textEl.textContent = '…';
  }

  const choicesEl = fc.querySelector('#merchant-first-choices');
  if (choicesEl) {
    choicesEl.classList.remove('is-visible');
    choicesEl.style.opacity = '0';
    choicesEl.style.transform = 'translateY(6px)';
    choicesEl.style.pointerEvents = 'none';
    choicesEl.style.minHeight = '';
    choicesEl.innerHTML = '';
  }

  merchantOverlayEl.classList.remove('firstchat-active');
}

export function openMerchant() {
  ensureMerchantOverlay();
  if (merchantOpen) return;

  const activeEl = document.activeElement;
  if (activeEl instanceof HTMLElement && !merchantOverlayEl.contains(activeEl)) {
    merchantLastFocus = activeEl;
  } else {
    merchantLastFocus = null;
  }
  merchantOpen = true;

  // Check whether this is the very first time we’re meeting the Merchant
  let met = false;
  try {
    met = localStorage.getItem(sk(MERCHANT_MET_KEY_BASE)) === '1';
  } catch {
    met = false;
  }

  // For the very first chat, pin the sheet in place (no slide-up animation)
  if (!met) {
    merchantOverlayEl.classList.add('firstchat-instant');
  }

  // Reset transform and transition
  merchantSheetEl.style.transition = 'none';
  merchantSheetEl.style.transform = '';
  merchantOverlayEl.removeAttribute('inert');

  // Animate in next frame
  void merchantSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    // Only restore the sheet transition for normal opens
    if (!merchantOverlayEl.classList.contains('firstchat-instant')) {
      merchantSheetEl.style.transition = '';
    }

    merchantOverlayEl.classList.add('is-open');
    blockInteraction(140);

    if (merchantCloseBtn && typeof merchantCloseBtn.focus === 'function') {
      try { merchantCloseBtn.focus({ preventScroll: true }); } catch {}
    }

    // Restore last tab
    let last = 'dialogue';
    try { last = localStorage.getItem(sk(MERCHANT_TAB_KEY_BASE)) || 'dialogue'; } catch {}
    selectMerchantTab(last);

    // Ensure no orphaned audio
    stopTypingSfx();

    // First-time chat
    if (!met) {
      const fc = merchantOverlayEl.querySelector('.merchant-firstchat');
      fc?.classList.add('is-visible');
      merchantOverlayEl.classList.add('firstchat-active');
      runFirstMeet();
    }
  });
}

export function closeMerchant() {
  if (!merchantOpen) return;
  
  if (IS_MOBILE) {
    try { suppressNextGhostTap(100); } catch {}
    try { blockInteraction(80); } catch {}
  }

  merchantOpen = false;
  merchantSheetEl.style.transition = '';
  merchantSheetEl.style.transform = '';
  merchantOverlayEl.classList.remove('is-open');
  merchantOverlayEl.classList.remove('firstchat-instant');
  resetFirstChatOverlayState();

  const activeEl = document.activeElement;
  if (activeEl && merchantOverlayEl.contains(activeEl)) {
    let target = merchantLastFocus;
    if (!target || !target.isConnected) {
      target = document.querySelector('[data-btn="shop"], .btn-shop');
    }
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch {}
    }
  }

  merchantOverlayEl.setAttribute('inert', '');
  merchantLastFocus = null;
  stopTypingSfx();
  __isTypingActive = false;
}

function onKeydownForMerchant(e) {
  if (!merchantOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMerchant();
    return;
  }

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (/^[0-9]$/.test(e.key)) {
    const num = parseInt(e.key, 10);
    const requestedIndex = (num === 0 ? 9 : num - 1);

    let maxUnlockedIndex = -1;
    for (let i = 0; i < MERCHANT_TABS_DEF.length; i++) {
      if (merchantTabUnlockState.get(MERCHANT_TABS_DEF[i].key)) {
        maxUnlockedIndex = i;
      }
    }

    if (maxUnlockedIndex === -1) maxUnlockedIndex = 0;

    let targetIndex = requestedIndex;
    if (targetIndex > maxUnlockedIndex) {
      targetIndex = maxUnlockedIndex;
    }

    if (targetIndex >= 0 && targetIndex < MERCHANT_TABS_DEF.length) {
      e.preventDefault();
      selectMerchantTab(MERCHANT_TABS_DEF[targetIndex].key);
    }
  }
}

// Drag to dismiss
function onMerchantDragStart(e) {
  if (!merchantOpen) return;

  const clientY = typeof e.clientY === 'number'
    ? e.clientY
    : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

  merchantDrag = {
    startY: clientY,
    lastY: clientY,
    startT: performance.now(),
    moved: 0,
    canceled: false,
  };

  merchantSheetEl.style.transition = 'none';

  window.addEventListener('pointermove', onMerchantDragMove, { passive: true });
  window.addEventListener('pointerup', onMerchantDragEnd);
  window.addEventListener('pointercancel', onMerchantDragCancel);
}

function onMerchantDragMove(e) {
  if (!merchantDrag || merchantDrag.canceled) return;
  const y = e.clientY;
  if (typeof y !== 'number') return;
  const dy = Math.max(0, y - merchantDrag.startY);
  merchantDrag.lastY = y;
  merchantDrag.moved = dy;
  merchantSheetEl.style.transform = `translateY(${dy}px)`;
}

function onMerchantDragEnd() {
  if (!merchantDrag || merchantDrag.canceled) { cleanupMerchantDrag(); return; }
  const dt = Math.max(1, performance.now() - merchantDrag.startT);
  const dy = merchantDrag.moved;
  const velocity = dy / dt;
  const shouldClose = (velocity > 0.55 && dy > 40) || dy > 140;

  if (shouldClose) {
    suppressNextGhostTap(160);
    merchantSheetEl.style.transition = 'transform 140ms ease-out';
    merchantSheetEl.style.transform = 'translateY(100%)';
    setTimeout(() => { closeMerchant(); }, 150);
  } else {
    merchantSheetEl.style.transition = 'transform 180ms ease';
    merchantSheetEl.style.transform = 'translateY(0)';
  }
  cleanupMerchantDrag();
}

function onMerchantDragCancel() {
  if (!merchantDrag) return;
  merchantDrag.canceled = true;
  merchantSheetEl.style.transition = 'transform 180ms ease';
  merchantSheetEl.style.transform = 'translateY(0)';
  cleanupMerchantDrag();
}

function cleanupMerchantDrag() {
  window.removeEventListener('pointermove', onMerchantDragMove);
  window.removeEventListener('pointerup', onMerchantDragEnd);
  window.removeEventListener('pointercancel', onMerchantDragCancel);
  merchantDrag = null;
}

function selectMerchantTab(key) {
  const def = MERCHANT_TABS_DEF.find(t => t.key === key);
  const unlocked = merchantTabUnlockState.get(key);
  if (!def || !unlocked) key = 'dialogue';

  for (const k in merchantTabs.buttons) {
    merchantTabs.buttons[k].classList.toggle('is-active', k === key);
  }
  for (const k in merchantTabs.panels) {
    merchantTabs.panels[k].classList.toggle('is-active', k === key);
  }

  if (key === 'dialogue') {
    try { renderDialogueList(); } catch {}
  }

  try { localStorage.setItem(sk(MERCHANT_TAB_KEY_BASE), key); } catch {}
}

export function unlockMerchantTabs(keys = []) {
  keys.forEach(key => setMerchantTabUnlocked(key, true));
}

// Expose for other modules that may build UI later
export { ensureMerchantOverlay };
