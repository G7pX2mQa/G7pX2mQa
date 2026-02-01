// js/ui/merchantTabs/dlgTab.js
import {
  bank,
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
} from '../../util/storage.js';
import { BigNum } from '../../util/bigNum.js';
import { MERCHANT_DIALOGUES } from '../../misc/merchantDialogues.js';
import { getXpState, isXpSystemUnlocked } from '../../game/xpSystem.js';
import { initResetPanel, initResetSystem, updateResetPanel, isForgeUnlocked, hasDoneForgeReset, hasDoneInfuseReset, hasDoneSurgeReset } from './resetTab.js';
import { initWorkshopTab, updateWorkshopTab } from './workshopTab.js';
import { initWarpTab, updateWarpTab } from './warpTab.js';
import { initLabTab, updateLabTab } from './labTab.js';
import { blockInteraction, updateShopOverlay } from '../shopOverlay.js';
import {
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';
import { playAudio, setMusicUnderwater } from '../../util/audioManager.js';

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


const JEFF_UNLOCK_KEY_BASE = 'ccc:unlock:jeff';

export function isJeffUnlocked() {
  try {
    return localStorage.getItem(sk(JEFF_UNLOCK_KEY_BASE)) === '1';
  } catch {
    return false;
  }
}

export function setJeffUnlocked(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const key = `${JEFF_UNLOCK_KEY_BASE}:${slot}`;
  const normalized = !!value;
  try {
    localStorage.setItem(key, normalized ? '1' : '0');
    updateMerchantNameInUI();
  } catch {}
}

function getMerchantName() {
  return isJeffUnlocked() ? 'Jeff' : 'Merchant';
}

function updateMerchantNameInUI() {
  const name = getMerchantName();
  
  if (merchantOverlayEl) {
    const modalNames = merchantOverlayEl.querySelectorAll('.merchant-firstchat:not(.merchant-firstchat--initial) .merchant-firstchat__header .name');
    modalNames.forEach((modalName) => {
      if (modalName && (modalName.textContent === 'Merchant' || modalName.textContent === 'Jeff')) {
        modalName.textContent = name;
      }
    });
  }
}


const MERCHANT_TABS_DEF = [
  { key: 'dialogue',  label: 'Dialogue', unlocked: true },
  { key: 'reset',     label: 'Reset',    unlocked: false, lockedLabel: '???' },
  { key: 'workshop',  label: 'Workshop', unlocked: false, lockedLabel: '???' },
  { key: 'warp',     label: 'Warp',    unlocked: false, lockedLabel: '???' },
  { key: 'lab',      label: 'Lab',     unlocked: false, lockedLabel: '???' },
];

const merchantTabUnlockState = new Map([
  ['dialogue', true],
  ['reset', false],
  ['workshop', false],
  ['warp', false],
  ['lab', false],
]);

const REWARD_ICON_SRC = {
  coins: 'img/currencies/coin/coin.webp',
  books: 'img/currencies/book/book.webp',
  gold: 'img/currencies/gold/gold.webp',
  magic: 'img/currencies/magic/magic.webp',
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
    Promise.resolve(handler(event)).catch((e) => console.error(e));
    if (once) cleanup();
  };

  const resetPointerTrigger = () => {
    pointerTriggered = false;
    activePointerId = null;
  };

  const onClick = (event) => {
    // Simplified logic: Allow synthetic events (from ghostTapGuard) to pass through.
    // The previous check blocked them because pointerTriggered was true during the synthetic click
    // (which happens inside the pointerdown event dispatch on touch devices).
    if (pointerTriggered) {
      resetPointerTrigger();
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

function syncWarpTabUnlockState() {
  let unlocked = false;
  try {
    if (typeof hasDoneSurgeReset === 'function') {
      unlocked = hasDoneSurgeReset();
    }
  } catch {}
  setMerchantTabUnlocked('warp', unlocked);
}

const LAB_UNLOCK_KEY = (slot) => `ccc:unlock:lab:${slot}`;

function isLabUnlocked() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  try { return localStorage.getItem(LAB_UNLOCK_KEY(slot)) === '1'; } catch { return false; }
}

function syncLabTabUnlockState() {
  setMerchantTabUnlocked('lab', isLabUnlocked());
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

  try {
    progress.hasInfuseReset = typeof hasDoneInfuseReset === 'function' && hasDoneInfuseReset();
  } catch {
    progress.hasInfuseReset = false;
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

  if (reward.type === 'magic') {
    try {
      bank.magic.add(reward.amount);
    } catch (e) {
      console.warn('Failed to grant magic reward:', reward, e);
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
    blurb: 'The Merchant is feeling extra nice today',
    scriptId: 1,
    reward: { type: 'coins', amount: 100 },
    unlock: (progress) => true,
    once: true,
  },
  2: {
    title: 'A New Experience',
    blurb: 'Discuss the XP system with the Merchant',
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
    blurb: 'Ask the Merchant a few questions about the Forge',
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
  4: {
    title: 'A Magic Touch',
    blurb: 'Learn about the Merchant’s magical powers',
    scriptId: 4,
    reward: { type: 'magic', amount: 10 },
    once: true,
    unlock: (progress) => {
      if (progress?.hasInfuseReset) return true;
      if (!progress?.xpUnlocked || (progress?.xpLevel ?? 0) < 101) {
        return {
          status: 'locked',
          title: '???',
          blurb: 'Locked',
          tooltip: 'Locked Dialogue',
          ariaLabel: 'Locked Dialogue',
        };
      }
      return {
        status: 'mysterious',
        requirement: 'Do an Infuse reset to reveal this dialogue',
        message: 'Do an Infuse reset to reveal this dialogue',
        icon: MYSTERIOUS_ICON_SRC,
        headerTitle: HIDDEN_DIALOGUE_TITLE,
        ariaLabel: 'Hidden merchant dialogue, do an Infuse reset to reveal this dialogue',
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

// ========================= Typing SFX =========================
const TYPING_SFX_SRC = 'sounds/merchant_typing.ogg';
let activeTypingAudio = null;
let __isTypingActive = false;

// Kept for signature compatibility
export function setTypingGainForDevice() {} 

export function primeTypingSfx() {
    import('../../util/audioManager.js').then(({ loadAudio }) => {
        loadAudio(TYPING_SFX_SRC);
    });
}

function startTypingSfx() {
    if (activeTypingAudio) return;
    
    const vol = IS_MOBILE ? 0.15 : 0.3;
    activeTypingAudio = playAudio(TYPING_SFX_SRC, { 
        volume: vol,
        loop: true 
    });
}

function stopTypingSfx() {
    if (activeTypingAudio) {
        if (activeTypingAudio.stop) activeTypingAudio.stop();
        activeTypingAudio = null;
    }
}

// ========================= Typewriter =========================
function typeText(el, full, msPerChar = 22, skipTargets = []) {
  return new Promise((resolve) => {
    // Basic HTML parser for typewriter
    const segments = [];
    let currentText = '';
    let inTag = false;
    
    for (let i = 0; i < full.length; i++) {
        const char = full[i];
        if (char === '<') {
            if (currentText) {
                segments.push({ type: 'text', content: currentText });
                currentText = '';
            }
            inTag = true;
            currentText += char;
        } else if (char === '>' && inTag) {
            currentText += char;
            segments.push({ type: 'tag', content: currentText });
            currentText = '';
            inTag = false;
        } else {
            currentText += char;
        }
    }
    if (currentText) {
        segments.push({ type: inTag ? 'tag' : 'text', content: currentText });
    }

    let segIndex = 0;
    let charIndex = 0;
    let skipping = false;
    let armed = false;
    let buffer = '';

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
    el.innerHTML = '';

    const cleanup = () => {
      targets.forEach(t => t.removeEventListener('click', skip));
      document.removeEventListener('keydown', onKey);
      el.classList.remove('is-typing');
      stopTypingSfx();
      __isTypingActive = false;
    };

    const tick = () => {
      if (skipping) {
          el.innerHTML = full;
          cleanup();
          resolve();
          return;
      }
      
      if (segIndex >= segments.length) {
          cleanup();
          resolve();
          return;
      }

      const seg = segments[segIndex];
      
      if (seg.type === 'tag') {
          buffer += seg.content;
          el.innerHTML = buffer;
          segIndex++;
          tick();
      } else {
          // Type text char by char
          buffer += seg.content[charIndex];
          el.innerHTML = buffer;
          charIndex++;
          
          if (charIndex >= seg.content.length) {
              segIndex++;
              charIndex = 0;
          }
          setTimeout(tick, msPerChar);
      }
    };
    tick();
  });
}

// ========================= DialogueEngine =========================
class DialogueEngine {
  constructor({ textEl, choicesEl, skipTargets, onEnd, onChoice }) {
    this.textEl = textEl;
    this.choicesEl = choicesEl;
    this.skipTargets = skipTargets;
    this.onEnd = onEnd || (() => {});
    this.onChoice = onChoice;
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
        this.onChoice?.(this.current, opt);
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
  setMusicUnderwater(true);

  const overlay = document.createElement('div');
  overlay.className = 'merchant-firstchat';
  overlay.setAttribute('data-dismissible', '1');
  overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="${meta.title}">
      <div class="merchant-firstchat__header">
        <div class="name">${getMerchantName()}</div>
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
    setMusicUnderwater(false);
	document.removeEventListener('keydown', onEscToCancel, { capture: true });
    overlay.classList.remove('is-visible');
    merchantOverlayEl.classList.remove('firstchat-active');
    stopTypingSfx();
    __isTypingActive = false;
    overlay.remove();
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
    onChoice: (nodeId, opt) => {
      if (meta.scriptId === 4 && nodeId === 'c4b') {
        setJeffUnlocked(true);
      }
    },
  onEnd: (info) => {
    if (ended) return;
    ended = true;

    if (info && info.noReward) {
      renderDialogueList();
      closeModal();
      return;
    }

    completeDialogueOnce(id, meta);
    renderDialogueList();
    closeModal();
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

  if (claimed && meta.scriptId === 2 && script.nodes.m3a) {
    script.nodes.m3a.say = 'I\'ve already given you Books, goodbye.';
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

  if (claimed && meta.scriptId === 4 && script.nodes.m7a) {
    script.nodes.m7a.say = 'I\'ve already given you Magic, goodbye.';
    if (script.nodes.c7a) {
      script.nodes.c7a.options = [
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
        { label: 'Goodbye.', to: 'end_nr' },
      ];
    }
  }

  engine.load(script);
  engine.start();
}

// ========================= Delve Menu =========================
const SCROLL_TIMELINE_STYLES_ID = 'ccc-scroll-timeline-styles';
function injectScrollTimelineStyles() {
  if (document.getElementById(SCROLL_TIMELINE_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = SCROLL_TIMELINE_STYLES_ID;
  style.textContent = `
    @keyframes scroll-thumb-move {
      0% { transform: translate(0, 0); }
      100% { transform: translate(var(--thumb-x, 0), var(--thumb-y, 0)); }
    }
  `;
  document.head.appendChild(style);
}

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

  // --- Scroll-Driven Animation Support Check ---
  const supportsTimelineScope = CSS.supports('timeline-scope', 'none');
  const useCssTimeline = supportsTimelineScope && CSS.supports('animation-timeline', 'scroll()');

  if (useCssTimeline) {
    injectScrollTimelineStyles();
    const uniqueId = Math.random().toString(36).slice(2, 8);
    const timelineName = `--merchant-scroll-${uniqueId}`;
    
    merchantSheetEl.style.timelineScope = timelineName;
    scroller.style.scrollTimelineName = timelineName;
    scroller.style.scrollTimelineAxis = 'block'; // Merchant only has vertical
    
    thumb.style.animationName = 'scroll-thumb-move';
    thumb.style.animationTimeline = timelineName;
    thumb.style.animationDuration = '1ms';
    thumb.style.animationTimingFunction = 'linear';
    thumb.style.animationFillMode = 'both';
  }

  let lastShadow = null;
  const syncScrollShadow = () => {
    const hasShadow = (scroller.scrollTop || 0) > 0;
    if (lastShadow === hasShadow) return;
    lastShadow = hasShadow;
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

  let lastState = {};
  const updateThumb = () => {
    const { scrollHeight, clientHeight, scrollTop } = scroller;
    const barH = bar.clientHeight || scroller.clientHeight || 1;

    if (
        lastState.scrollHeight === scrollHeight &&
        lastState.clientHeight === clientHeight &&
        lastState.barH === barH &&
        (useCssTimeline || lastState.scrollTop === scrollTop)
    ) {
        return;
    }
    lastState = { scrollHeight, clientHeight, scrollTop, barH };

    const visibleRatio = clientHeight / Math.max(1, scrollHeight);
    const thumbH = Math.max(28, Math.round(barH * visibleRatio));

    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const range = Math.max(0, barH - thumbH);
    
    thumb.style.height = thumbH + 'px';
    
    if (useCssTimeline) {
        thumb.style.setProperty('--thumb-y', `${range}px`);
        thumb.style.setProperty('--thumb-x', '0px');
    } else {
        const y = Math.round((scrollTop / maxScroll) * range);
        thumb.style.transform = `translateY(${y}px)`;
    }

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

  // Always listen to scroll for shadows and visibility
  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) {
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
  }

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);
  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll); // Initial kick

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
  updateAll();
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

  const panelWarp = document.createElement('section');
  panelWarp.className = 'merchant-panel';
  panelWarp.id = 'merchant-panel-warp';

  const panelLab = document.createElement('section');
  panelLab.className = 'merchant-panel';
  panelLab.id = 'merchant-panel-lab';

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();
  syncWarpTabUnlockState();
  syncLabTabUnlockState();

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
  merchantTabs.panels['warp']      = panelWarp;
  merchantTabs.panels['lab']       = panelLab;
  merchantTabs.tablist = tabs;

  panelsWrap.append(panelDialogue, panelReset, panelWorkshop, panelWarp, panelLab);
  content.append(tabs, panelsWrap);

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();

  try { initResetSystem(); } catch {}
  try { initResetPanel(panelReset); } catch {}
  try { updateResetPanel(); } catch {}
  
  try { initWorkshopTab(panelWorkshop); } catch {}
  try { initWarpTab(panelWarp); } catch {}
  try { initLabTab(panelLab); } catch {}

  if (!forgeUnlockListenerBound && typeof window !== 'undefined') {
    const handleUnlockChange = (event) => {
      const { key, slot } = event?.detail ?? {};
      if (slot != null && slot !== getActiveSlot()) return;
      
      if (key === 'forge' || !key) syncForgeTabUnlockState();
      if (key === 'infuse' || !key) syncWorkshopTabUnlockState();
      if (key === 'surge_completed' || !key) syncWarpTabUnlockState();
      if (key === 'lab' || !key) syncLabTabUnlockState();
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

function handleDialogueCardClick(event) {
  const card = event.currentTarget;
  if (!card) return;
  const ctx = card._dlgCtx;
  if (!ctx) return;

  if (card.classList.contains('is-locked') && !ctx.isMysterious) {
    event?.preventDefault?.();
    return;
  }
  if (ctx.unlocked) {
    openDialogueModal(ctx.id, ctx.meta);
  } else if (ctx.isMysterious) {
    openDialogueLockInfo(ctx.lockInfo);
  }
}

function renderDialogueList() {
  const panel = document.getElementById('merchant-panel-dialogue');
  if (!panel) return;

  const list = panel.__dlgList;
  if (!list) return;

  const progress = getPlayerProgress();
  const state = loadDlgState();
  let stateDirty = false;

  const seenIds = new Set();

  Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
    seenIds.add(String(id));
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

    let card = list.querySelector(`.dlg-card[data-dlg-id="${id}"]`);
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'dlg-card';
      card.dataset.dlgId = String(id);
      
      const titleEl = document.createElement('div');
      titleEl.className = 'dlg-title';
      
      const blurbEl = document.createElement('div');
      blurbEl.className = 'dlg-blurb';
      
      const rewardEl = document.createElement('div');
      rewardEl.className = 'dlg-reward';
      
      card.append(titleEl, blurbEl, rewardEl);
      list.appendChild(card);
      
      // Bind once; handler uses element context
      bindRapidActivation(card, handleDialogueCardClick);
    }

    // Update Context
    card._dlgCtx = { id, meta, lockInfo, unlocked, isMysterious };

    // Update Classes
    card.dataset.dlgStatus = status;
    if (card.disabled !== !!locked) card.disabled = !!locked;
    card.classList.toggle('is-locked', locked);
    card.classList.toggle('is-mysterious', isMysterious);
    card.classList.toggle('is-complete', !!showComplete);
    card.classList.toggle('has-again', !!showComplete);

    if (locked) {
      if (card.getAttribute('aria-disabled') !== 'true') card.setAttribute('aria-disabled', 'true');
      if (card.getAttribute('tabindex') !== '-1') card.setAttribute('tabindex', '-1');
    } else {
      if (card.hasAttribute('aria-disabled')) card.removeAttribute('aria-disabled');
      if (card.hasAttribute('tabindex')) card.removeAttribute('tabindex');
    }

    // Update Content
    const titleEl = card.querySelector('.dlg-title');
    const titleText = unlocked ? meta.title : (lockInfo.title ?? '???');
    if (titleEl.textContent !== titleText) titleEl.textContent = titleText;

    const blurbEl = card.querySelector('.dlg-blurb');
    const blurbText = unlocked ? meta.blurb : (lockInfo.blurb ?? '');
    if (blurbEl.textContent !== blurbText) blurbEl.textContent = blurbText;

    const rewardEl = card.querySelector('.dlg-reward');
    if (unlocked && meta.reward) {
      const iconSrc = REWARD_ICON_SRC[meta.reward.type];
      if (iconSrc) {
        // Reuse inner structure if it matches, to avoid flicker
        if (!rewardEl.classList.contains('has-reward')) {
           rewardEl.classList.add('has-reward');
           rewardEl.innerHTML = `
            <span class="reward-label">Reward:</span>
            <span class="reward-chunk">
                <span class="reward-icon" aria-hidden="true"></span>
                <span class="amt"></span>
                <span class="currency-name"></span>
            </span>
           `;
        }
        
        // Update reward visual data
        if (rewardEl.style.getPropertyValue('--reward-icon') !== `url('${iconSrc}')`) {
            rewardEl.style.setProperty('--reward-icon', `url('${iconSrc}')`);
        }
        const amtEl = rewardEl.querySelector('.amt');
        const amtText = String(meta.reward.amount);
        if (amtEl && amtEl.textContent !== amtText) amtEl.textContent = amtText;

        const nameEl = rewardEl.querySelector('.currency-name');
        if (nameEl) {
          const typeStr = String(meta.reward.type || '');
          const capText = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
          if (nameEl.textContent !== capText) nameEl.textContent = capText;
        }
        
        const rewardLabelText = `Reward: ${meta.reward.amount} ${meta.reward.type}`;
        if (rewardEl.getAttribute('aria-label') !== rewardLabelText) {
            rewardEl.setAttribute('aria-label', rewardLabelText);
        }
      } else {
        rewardEl.classList.remove('has-reward');
        const text = rewardLabel(meta.reward);
        if (rewardEl.textContent !== text) rewardEl.textContent = text;
        if (rewardEl.style.display !== '') rewardEl.style.display = '';
        rewardEl.removeAttribute('aria-label');
      }
      if (rewardEl.style.display === 'none') rewardEl.style.display = '';
    } else {
      if (rewardEl.textContent !== '') rewardEl.textContent = '';
      if (rewardEl.style.display !== 'none') rewardEl.style.display = 'none';
    }

    const ariaLabel = unlocked
      ? `${meta.title}${showComplete ? ' (completed)' : ''}`
      : (lockInfo.ariaLabel || (isMysterious ? 'Hidden merchant dialogue' : 'Locked merchant dialogue'));
    if (card.getAttribute('aria-label') !== ariaLabel) card.setAttribute('aria-label', ariaLabel);

    if (lockInfo.tooltip) {
      if (card.title !== lockInfo.tooltip) card.title = lockInfo.tooltip;
    } else if (unlocked) {
      const hint = 'Left-click: Start Dialogue';
      if (card.title !== hint) card.title = hint;
    } else {
      if (card.hasAttribute('title')) card.removeAttribute('title');
    }

    // "Ask Again" footer
    let againEl = card.querySelector('.dlg-again');
    if (showComplete) {
      if (!againEl) {
        againEl = document.createElement('div');
        againEl.className = 'dlg-again';
        againEl.textContent = 'Ask Again?';
        card.appendChild(againEl);
      }
    } else if (againEl) {
      againEl.remove();
    }
  });
  
  // Cleanup stale
  Array.from(list.children).forEach(child => {
      if (child.dataset.dlgId && !seenIds.has(child.dataset.dlgId)) {
          child.remove();
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

  setMusicUnderwater(true);

  // Ensure blank + hide choices before typing
  choicesEl.classList.remove('is-visible');
  choicesEl.innerHTML = '';

  const engine = new DialogueEngine({
    textEl,
    choicesEl,
    skipTargets: [textEl, row, bubble],
    onEnd: (info) => {
      setMusicUnderwater(false);
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

  setMusicUnderwater(true);

  const engine = new DialogueEngine({
    textEl,
    choicesEl,
    skipTargets: [textEl, rowEl, cardEl],
    onEnd: () => {
      setMusicUnderwater(false);
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

  // Check for pending Lab unlock
  const slot = getActiveSlot();
  let forcedDialogueTab = false;

  if (slot != null) {
      const pendingKey = `ccc:tsunami:labPending:${slot}`;
      if (localStorage.getItem(pendingKey) === '1') {
          try { localStorage.removeItem(pendingKey); } catch {}
          try { localStorage.setItem(LAB_UNLOCK_KEY(slot), '1'); } catch {}
          syncLabTabUnlockState();
          try { window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'lab', slot } })); } catch {}
          forcedDialogueTab = true;
      }
  }

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
    
    if (forcedDialogueTab) {
        last = 'dialogue';
    }
    
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
  
  setMusicUnderwater(false);

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
  if (key === 'warp') {
    try { updateWarpTab(); } catch {}
  }
  if (key === 'lab') {
    try { updateLabTab(); } catch {}
  }

  try { localStorage.setItem(sk(MERCHANT_TAB_KEY_BASE), key); } catch {}

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const scroller = merchantOverlayEl?.querySelector(".merchant-content");
      if (scroller && scroller.__customScroll && typeof scroller.__customScroll.updateAll === "function") {
        scroller.__customScroll.updateAll();
      } else {
      }
    });
  });
}

export function unlockMerchantTabs(keys = []) {
  keys.forEach(key => setMerchantTabUnlocked(key, true));
}

export function runTsunamiDialogue(container, onComplete, tsunamiControls) {
  const scriptPart1 = {
    start: 'n1',
    nodes: {
      'n1': { type: 'line', say: 'O Great Tsunami…', next: 'c1' },
      'c1': { type: 'choice', options: [{ label: '...', to: 'n2' }] },
      'n2': { type: 'line', say: 'Cover this Cove in your wet embrace…', next: 'c2' },
      'c2': { type: 'choice', options: [{ label: '...', to: 'n3' }] },
      'n3': { type: 'line', say: 'We have thirsted for far too long…', next: 'c3' },
      'c3': { type: 'choice', options: [{ label: '...', to: 'n4' }] },
      'n4': { type: 'line', say: 'Awaken what once was lost…', next: 'c4' },
      'c4': { type: 'choice', options: [{ label: '...', to: 'n5' }] },
      'n5': { type: 'line', say: 'You will have my deepest gratitude…', next: 'c5' },
      'c5': { type: 'choice', options: [{ label: '...', to: 'end' }] },
    }
  };

  const overlay = document.createElement('div');
  overlay.className = 'merchant-firstchat is-visible';
  overlay.style.zIndex = '2147483647'; 
  overlay.style.userSelect = 'none';
  overlay.style.webkitUserSelect = 'none';
  
  overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="Tsunami Dialogue">
      <div class="merchant-firstchat__header">
        <div class="name">Merchant</div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row">
        <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text" id="tsunami-dlg-line" style="user-select: none; -webkit-user-select: none;">…</div>
      </div>
      <div class="merchant-firstchat__choices" id="tsunami-dlg-choices"></div>
    </div>
  `;
  
  container.appendChild(overlay);
  
  const textEl = overlay.querySelector('#tsunami-dlg-line');
  const choicesEl = overlay.querySelector('#tsunami-dlg-choices');
  const rowEl = overlay.querySelector('.merchant-firstchat__row');
  const cardEl = overlay.querySelector('.merchant-firstchat__card');

  primeTypingSfx();

  const blockEsc = (e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  document.addEventListener('keydown', blockEsc, { capture: true });

  const runPart2 = () => {
    // 15 seconds visual effect then fade
    setTimeout(() => {
        // Trigger Beacon Effect
        if (tsunamiControls && tsunamiControls.triggerBeacons) {
            tsunamiControls.triggerBeacons();
        }
        
        // Wait 15 seconds for effect
        setTimeout(() => {
            // Trigger Fade
            if (tsunamiControls && tsunamiControls.triggerFinalFade) {
                tsunamiControls.triggerFinalFade();
            }
            
            // Wait 5 seconds for fade
            setTimeout(() => {
                // Final Dialogue
                runFinalLine();
            }, 5000);
            
        }, 15000);
        
    }, 1000); // 1s delay start
  };

  const runFinalLine = () => {
      if (tsunamiControls && tsunamiControls.showCursor) tsunamiControls.showCursor();

      // Re-show overlay content for final line
      overlay.innerHTML = `
        <div class="merchant-firstchat__card" role="dialog" aria-label="Tsunami Dialogue">
          <div class="merchant-firstchat__header">
            <div class="name">Merchant</div>
            <div class="rule" aria-hidden="true"></div>
          </div>
          <div class="merchant-firstchat__row">
            <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
            <div class="merchant-firstchat__text" id="tsunami-dlg-line-2" style="user-select: none; -webkit-user-select: none;">…</div>
          </div>
          <div class="merchant-firstchat__choices" id="tsunami-dlg-choices-2"></div>
        </div>
      `;
      
      const textEl2 = overlay.querySelector('#tsunami-dlg-line-2');
      const choicesEl2 = overlay.querySelector('#tsunami-dlg-choices-2');
      const rowEl2 = overlay.querySelector('.merchant-firstchat__row');
      const cardEl2 = overlay.querySelector('.merchant-firstchat__card');
      
      const finalScript = {
          start: 'final',
          nodes: {
              'final': { 
                  type: 'line', 
                  say: 'I’m sure the <span style="color:#00e5ff">Player</span> will have some questions when they wake up, but I will deal with that when I must.', 
                  next: 'end' 
              },
              'end': { type: 'choice', options: [{ label: '...', to: 'end' }] }
          }
      };
      
      const engine2 = new DialogueEngine({
          textEl: textEl2,
          choicesEl: choicesEl2,
          skipTargets: [textEl2, rowEl2, cardEl2],
          onEnd: () => {
              // Hide Dialogue
              overlay.innerHTML = ''; // Hide UI
              if (tsunamiControls && tsunamiControls.hideCursor) tsunamiControls.hideCursor();
              
              // 5 seconds darkness
              setTimeout(() => {
                  document.removeEventListener('keydown', blockEsc, { capture: true });
                  stopTypingSfx();
                  __isTypingActive = false;
                  overlay.remove();
                  if (onComplete) onComplete();
              }, 5000);
          }
      });
      
      engine2.load(finalScript);
      engine2.start();
  };

  const engine = new DialogueEngine({
    textEl,
    choicesEl,
    skipTargets: [textEl, rowEl, cardEl],
    onEnd: () => {
        // Hide Dialogue UI temporarily
        overlay.innerHTML = '';
        stopTypingSfx();
        __isTypingActive = false;
        
        if (tsunamiControls && tsunamiControls.hideCursor) tsunamiControls.hideCursor();
        
        runPart2();
    }
  });

  engine.load(scriptPart1);
  engine.start();
}

export function runPostTsunamiShopDialogue(onComplete) {
    const overlay = document.createElement('div');
    overlay.className = 'merchant-firstchat is-visible';
    overlay.style.zIndex = '2147483647';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    
    overlay.innerHTML = `
      <div class="merchant-firstchat__card" role="dialog" aria-label="Urgent Message">
        <div class="merchant-firstchat__header">
          <div class="name">Merchant</div>
          <div class="rule" aria-hidden="true"></div>
        </div>
        <div class="merchant-firstchat__row">
          <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
          <div class="merchant-firstchat__text" id="post-tsunami-line">…</div>
        </div>
        <div class="merchant-firstchat__choices" id="post-tsunami-choices"></div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const textEl = overlay.querySelector('#post-tsunami-line');
    const choicesEl = overlay.querySelector('#post-tsunami-choices');
    const rowEl = overlay.querySelector('.merchant-firstchat__row');
    const cardEl = overlay.querySelector('.merchant-firstchat__card');

    primeTypingSfx();

    const script = {
        start: 'n1',
        nodes: {
            'n1': { 
                type: 'line', 
                say: '<span style="color:#00e5ff">Player</span>, quickly, come to the Lab.', 
                next: 'c1' 
            },
            'c1': { 
                type: 'choice', 
                options: [
                    { label: 'What?', to: 'end' },
                    { label: 'The Lab?', to: 'end' },
                    { label: '???', to: 'end' }
                ] 
            }
        }
    };

    const engine = new DialogueEngine({
        textEl,
        choicesEl,
        skipTargets: [textEl, rowEl, cardEl],
        onEnd: () => {
            stopTypingSfx();
            __isTypingActive = false;
            overlay.remove();
            if (onComplete) onComplete();
        }
    });

    engine.load(script);
    engine.start();
}

// Expose for other modules that may build UI later
export { ensureMerchantOverlay };
