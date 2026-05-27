// js/ui/merchantTabs/dlgTab.js
let merchantOverlayEl = null;
let merchantSheetEl = null;

import { __isTypingActive, activeTypingAudio, TYPING_SFX_SRC, setDelveElements, setTypingActive, setActiveTypingAudio, openDelveOverlay } from '../delveCore.js';
import { 
  bank,
  getActiveSlot,
  watchStorageKey,
  primeStorageWatcherSnapshot,
} from '../../util/storage.js';
import { BigNum } from '../../util/bigNum.js';
import { MERCHANT_DIALOGUES } from '../../misc/merchantDialogues.js';
import { getXpState, isXpSystemUnlocked } from '../../game/xpSystem.js';
import { initResetPanel, initResetSystem, updateResetPanel, isForgeUnlocked, hasDoneForgeReset, hasDoneInfuseReset, hasDoneSurgeReset, isSurgeUnlocked, getCurrentSurgeLevel } from './resetTab.js';
import { initWorkshopTab, updateWorkshopTab } from './workshopTab.js';
import { initWarpTab, updateWarpTab } from './warpTab.js';
import { initLabTab, updateLabTab, hasVisitedLab } from './labTab.js';
import { initFlowTab, updateFlowTab, getFlowUnlockState, setFlowUnlockChecker } from './flowTab.js';
import { isLabUnlocked } from '../../game/surgeEffects.js';
import { blockInteraction, updateShopOverlay, closeDelveSpecificOverlays } from '../shopOverlay.js';
import {
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';
import { playAudio, setAudioUnderwater } from '../../util/audioManager.js';
import { playSecretDlgBossFightSequence } from '../../game/secretDlgBossVisuals.js';
import { getLifetimeBossBeaten } from '../../game/secretAchievements.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import {
  MYSTERIOUS_ICON_SRC,
  HIDDEN_DIALOGUE_TITLE,
  LOCKED_DIALOGUE_TITLE,
  DEFAULT_MYSTERIOUS_BLURB,
  DEFAULT_LOCKED_BLURB,
  DEFAULT_LOCK_MESSAGE,
  DIALOGUE_STATUS_ORDER,
  HAS_POINTER_EVENTS,
  HAS_TOUCH_EVENTS,
  DialogueEngine,
  typeText,
  primeTypingSfx,
  startTypingSfx,
  stopTypingSfx,
  injectScrollTimelineStyles,
  ensureMerchantScrollbar,
  bindRapidActivation,
  openDialogueLockInfo,
} from '../delveCore.js';


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
  { key: 'flow',     label: 'Flow',    unlocked: false, lockedLabel: '???' },
];

const merchantTabUnlockState = new Map([
  ['dialogue', true],
  ['reset', false],
  ['workshop', false],
  ['warp', false],
  ['lab', false],
  ['flow', false],
]);

const FORGE_COMPLETED_KEY_BASE = 'ccc:reset:forge:completed';




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

export function isLabUnlockedLocal() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  try {
    if (typeof isLabUnlocked === 'function' && isLabUnlocked()) return true;
    return localStorage.getItem(LAB_UNLOCK_KEY(slot)) === '1';
  } catch {
    return false;
  }
}

function syncLabTabUnlockState() {
  setMerchantTabUnlocked('lab', isLabUnlockedLocal());
}

// Inject surge level check into flowTab
setFlowUnlockChecker((level) => {
    // We assume surge level is available via isSurgeUnlocked or similar, 
    // but the most reliable is directly checking current level
    const surgeLevel = typeof getCurrentSurgeLevel === 'function' ? getCurrentSurgeLevel() : 0n;
    if (surgeLevel === Infinity || (typeof surgeLevel === 'string' && surgeLevel === 'Infinity')) return true;
    if (surgeLevel === Number.POSITIVE_INFINITY) return true;

    if (typeof surgeLevel === 'bigint') {
        return surgeLevel >= BigInt(level);
    }
    if (typeof surgeLevel === 'number') {
        return surgeLevel >= level;
    }
    return false;
});

function syncFlowTabUnlockState() {
    setMerchantTabUnlocked('flow', getFlowUnlockState());
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
    window.addEventListener('unlock:change', handler);
    window.addEventListener('debug:change', handler);
    window.addEventListener('surge:level:change', handler);
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

  if (reward.type === 'waves') {
    try {
      bank.waves.add(reward.amount);
    } catch (e) {
      console.warn('Failed to grant waves reward:', reward, e);
    }
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent('merchantReward', { detail: reward }));
  } catch {}
}

function rewardLabel(reward) {
  if (!reward) return '';
  const config = RESOURCE_REGISTRY.find(r => r.key === reward.type);
  if (config) {
    const isOne = (Number(reward.amount) === 1);
    const displayName = isOne ? config.singular : config.plural;
    return `Reward: ${reward.amount} ${displayName}`;
  }
  return 'Reward available';
}

export const DLG_CATALOG = {
  1: {
    title: 'A Generous Gift',
    blurb: 'The Merchant is feeling extra nice today',
    scriptId: 1,
    reward: { type: 'coins', amount: 100 }, rewardNode: 'm2b',
    unlock: (progress) => true,
    once: true,
  },
  2: {
    title: 'A New Experience',
    blurb: 'Discuss the XP system with the Merchant',
    scriptId: 2,
    reward: { type: 'books', amount: 5 }, rewardNode: 'm3a',
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
    reward: { type: 'gold', amount: 10 }, rewardNode: 'm5a',
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
  5: {
    title: 'A Powerful Surge',
    blurb: 'Converse with the Merchant about the Surge reset and how powerful it is',
    scriptId: 5,
    reward: { type: 'waves', amount: 5 }, rewardNode: 'm6a',
    once: true,
    unlock: (progress) => {
      if (typeof hasDoneSurgeReset === 'function' && hasDoneSurgeReset()) {
        return true;
      }
      if (!progress?.xpUnlocked || (progress?.xpLevel ?? 0) < 201) {
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
        requirement: 'Do a Surge reset to reveal this dialogue',
        message: 'Do a Surge reset to reveal this dialogue',
        icon: MYSTERIOUS_ICON_SRC,
        headerTitle: HIDDEN_DIALOGUE_TITLE,
        ariaLabel: 'Hidden merchant dialogue, do a Surge reset to reveal this dialogue',
      };
    },
  },
  6: {
    title: 'The Empty Lab',
    blurb: 'Ask about the Lab',
    scriptId: 6,
    reward: { type: 'coins', amount: 2 }, rewardNode: 'n0',
    once: true,
    unlock: (progress) => {
      if (typeof isLabUnlocked === 'function' && isLabUnlocked()) {
        return true;
      }

      const surgeLevel = typeof getCurrentSurgeLevel === 'function' ? getCurrentSurgeLevel() : 0n;
      let isSurge8 = false;
      if (surgeLevel === Infinity) isSurge8 = true;
      else if (typeof surgeLevel === 'bigint') isSurge8 = surgeLevel >= 8n;
      else if (typeof surgeLevel === 'number') isSurge8 = surgeLevel >= 8;

      if (isSurge8) {
        return true;
      }

      if (typeof hasDoneSurgeReset === 'function' && hasDoneSurgeReset()) {
        return {
          status: 'mysterious',
          requirement: 'Reach Surge 8 to reveal this dialogue',
          message: 'Reach Surge 8 to reveal this dialogue',
          icon: MYSTERIOUS_ICON_SRC,
          headerTitle: HIDDEN_DIALOGUE_TITLE,
          ariaLabel: 'Hidden merchant dialogue, reach Surge 8 to reveal this dialogue',
        };
      }
      
      return {
        status: 'locked',
        title: '???',
        blurb: 'Locked',
        tooltip: 'Locked Dialogue',
        ariaLabel: 'Locked Dialogue',
      };
    },
  },
  4: {
    title: 'A Magic Touch',
    blurb: 'Learn about the Merchant’s magical powers',
    scriptId: 4,
    reward: { type: 'magic', amount: 10 }, rewardNode: 'm7a',
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


let merchantCloseBtn  = null;
let merchantOpen      = false;
let merchantDrag      = null;
let merchantLastFocus = null;
let merchantEventsBound = false;
let merchantTabs = { buttons: {}, panels: {}, tablist: null };

// ========================= Typing SFX =========================




let _isLabDialogueOpen = false;
export function isLabDialogueOpen() {
    return _isLabDialogueOpen;
}







// ========================= Typewriter =========================


// ========================= DialogueEngine =========================




function openDialogueModal(id, meta) {
  primeTypingSfx();

  let scriptId = meta.scriptId;
  if (meta.scriptId === 6) {
      _isLabDialogueOpen = true;
  }
  if (isLabUnlockedLocal() && typeof hasVisitedLab === 'function' && !hasVisitedLab()) {
      scriptId = 1000;
  }

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
        <div class="merchant-firstchat__text">...</div>
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
      if (meta.scriptId === 6) {
          _isLabDialogueOpen = false;
      }
	document.removeEventListener('keydown', onEscToCancel, { capture: true });
      overlay.classList.remove('is-visible');
      merchantOverlayEl.classList.remove('firstchat-active');
      stopTypingSfx();
      setTypingActive(false);
      setAudioUnderwater(false);
      overlay.remove();
  };

  const cancelWithoutReward = () => {
      if (ended) return;
      ended = true;
      closeModal();               // no reward
      stopTypingSfx();
      setTypingActive(false);
      setAudioUnderwater(false);
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

      if (info && info.exploded) {
        renderDialogueList();
        closeModal();
        playDialogueExplosion();
        return;
      }
      if (info && info.noReward) {
        renderDialogueList();
        closeModal();
        return;
      }
      if (info && info.startBossFight) {
        renderDialogueList();
        closeModal();
        startBossFightSequence();
        return;
      }

      completeDialogueOnce(id, meta);
      renderDialogueList();
      closeModal();
  }
});

  const state = loadDlgState();
  const claimed = !!state[id]?.claimed;

  const script = structuredClone(MERCHANT_DIALOGUES[scriptId]);

  if (meta.scriptId === 6 && script?.nodes?.m3a && getLifetimeBossBeaten()) {
      script.nodes.m3a.say = 'Hey, you already beat me in the boss battle, why are you back again? Whatever. Starting boss battl<span style="overflow-wrap: anywhere; word-break: break-all;">ႁᩓഡᗌԈ˃ɫᵝӬӉ̕ƞ❨▯Ḭ≽∈ኖক⇋ಽ᷵Ƈᜉ⍕᪕␤৔ᚈ௮ᤙᕘ᧤⢞ॿⅉਟၨҮႻᾡ⅌͓Ⓕяⵠⷳᕛ⣊ၧ಼ᝧ⪤ԃ✓ó⎻᭣ᡍᐍᏭᘫᲘ⬪⤯➚႐ᙠໍґሜ⟒ἐᩬೀⴲᔦⳄѯᣆҫ⤄╮ቼ✓ணၷᘑർ‫༡࿷᭭⋚ᬭᠴ⩭ල፫ᶰ⌰⽶ᱣ᝕ᢷ₠ᎧἬⶪ⾑⼱₱ႁᩓഡᗌԈ˃ɫᵝӬӉ̕ƞ❨▯Ḭ≽∈ኖক⇋ಽ✓≽ணၷᘑർ࿷᭭⋚ᬭᠴ</span>';
  }

  if (meta.reward && !meta.rewardNode) {
      throw new Error(`Dialogue ${id} has a reward but no rewardNode declared.`);
  }

  if (claimed && meta.reward && meta.rewardNode) {
      const rNode = script.nodes[meta.rewardNode];
      if (rNode) {
          const capText = String(meta.reward.type || '').charAt(0).toUpperCase() + String(meta.reward.type || '').slice(1);
          rNode.say = `I've already given you ${capText}, goodbye.`;
          const nextNode = script.nodes[rNode.next];
          if (nextNode && nextNode.type === 'choice') {
              nextNode.options = [
                  { label: 'Goodbye.', to: 'end_nr' },
                  { label: 'Goodbye.', to: 'end_nr' },
                  { label: 'Goodbye.', to: 'end_nr' },
              ];
          }
      }
  }

  engine.load(script);
  engine.start();
}

// ========================= Delve Menu =========================
const SCROLL_TIMELINE_STYLES_ID = 'ccc-scroll-timeline-styles';




function ensureMerchantOverlay() {
  if (merchantOverlayEl) return;
  merchantOverlayEl = document.createElement("div");
  merchantSheetEl = document.createElement("div");

  merchantOverlayEl.className = 'merchant-overlay';
  merchantOverlayEl.id = 'merchant-overlay';
  merchantOverlayEl.setAttribute('inert', '');

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

  const panelFlow = document.createElement('section');
  panelFlow.className = 'merchant-panel';
  panelFlow.id = 'merchant-panel-flow';

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();
  syncWarpTabUnlockState();
  syncLabTabUnlockState();
  syncFlowTabUnlockState();

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
  merchantTabs.panels['flow']   = panelFlow;
  merchantTabs.tablist = tabs;

  panelsWrap.append(panelDialogue, panelReset, panelWorkshop, panelWarp, panelLab, panelFlow);
  content.append(tabs, panelsWrap);

  syncForgeTabUnlockState();
  syncWorkshopTabUnlockState();

  try { initResetSystem(); } catch {}
  try { initFlowTab(panelFlow); } catch {}

  if (!forgeUnlockListenerBound && typeof window !== 'undefined') {
      const handleUnlockChange = (event) => {
      const { key, slot } = event?.detail ?? {};
      if (slot != null && slot !== getActiveSlot()) return;
      
      if (key === 'forge' || !key) syncForgeTabUnlockState();
      if (key === 'infuse' || !key) syncWorkshopTabUnlockState();
      if (key === 'surge_completed' || !key) syncWarpTabUnlockState();
      if (key === 'lab' || key === 'tsunami' || !key) syncLabTabUnlockState();
      if (key === 'flow' || !key) syncFlowTabUnlockState();
      };
      window.addEventListener('unlock:change', handleUnlockChange, { passive: true });
      window.addEventListener('saveSlot:change', handleUnlockChange, { passive: true });
      // Also update flow tab on surge level change
      window.addEventListener('surge:level:change', () => syncFlowTabUnlockState(), { passive: true });
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
        <div class="merchant-firstchat__text" id="merchant-first-line">...</div>
      </div>
      <div class="merchant-firstchat__choices" id="merchant-first-choices"></div>
      </div>
  `;

  merchantSheetEl.append(grabber, header, content, actions, firstChat);
  merchantOverlayEl.appendChild(merchantSheetEl);
  document.body.appendChild(merchantOverlayEl);
  initDialogueTab();
  ensureMerchantScrollbar(merchantOverlayEl, merchantSheetEl);

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
      const config = RESOURCE_REGISTRY.find(r => r.key === meta.reward.type);
      const iconSrc = config ? config.icon : null;
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
function playDialogueExplosion() {
  const explosionContainer = document.createElement('div');
  explosionContainer.style.position = 'fixed';
  explosionContainer.style.top = '0';
  explosionContainer.style.left = '0';
  explosionContainer.style.width = '100vw';
  explosionContainer.style.height = '100vh';
  explosionContainer.style.pointerEvents = 'auto'; // Block interaction with underlying elements
  explosionContainer.style.cursor = 'none'; // Hide cursor during explosion
  explosionContainer.style.zIndex = '999999';
  explosionContainer.style.overflow = 'hidden';
  document.body.appendChild(explosionContainer);

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  explosionContainer.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particles = [];
  let isAnimating = true;

  const colors = ['#ff4500', '#ff8c00', '#ffd700', '#ffffff', '#ff0000'];

  class Particle {
    constructor(x, y, isLong, customAngle = null, customSpeed = null, customSize = null) {
      this.x = x;
      this.y = y;
      
      const angle = customAngle !== null ? customAngle : Math.random() * Math.PI * 2;
      const speed = customSpeed !== null ? customSpeed : (isLong ? (Math.random() * 20 + 5) : (Math.random() * 10 + 2));
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      
      this.size = customSize !== null ? customSize : (isLong ? (Math.random() * 300 + 100) : (Math.random() * 150 + 50));
      this.color = colors[Math.floor(Math.random() * colors.length)];
      
      this.life = 1.0;
      this.decay = isLong ? (Math.random() * 0.005 + 0.005) : (Math.random() * 0.02 + 0.02);
      this.gravity = isLong ? 0.3 : 0.15;
      
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.life -= this.decay;
      this.size *= 0.98;
    }

    draw(ctx) {
      if (this.life <= 0) return;

      // Draw particle
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.life;
      ctx.fill();


      ctx.globalAlpha = 1.0;
    }
  }

  const spawnParticles = (isLong, currentCount = 0) => {
    const numParticles = isLong ? 1000 : 50;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Normal random particles
    for (let i = 0; i < numParticles; i++) {
      particles.push(new Particle(centerX, centerY, isLong));
    }
    
    // Add thick "donut" particle ring for short explosions
    if (!isLong) {
      const ringParticles = 150 + currentCount * 50; // More particles each time
      const baseSpeed = Math.max(10, 40 - currentCount * 1.5); // Slower each time
      const thickness = 20; // Spread of speeds to create a donut
      const sizeMultiplier = 1 + (currentCount * 0.2); // Bigger particles each time
      
      for (let i = 0; i < ringParticles; i++) {
        const angle = Math.random() * Math.PI * 2; // Randomize angle for natural distribution
        const speed = baseSpeed + Math.random() * thickness;
        
        // Base sizes roughly scaled by the multiplier
        const pSize = (Math.random() * 150 + 50) * sizeMultiplier;
        
        particles.push(new Particle(centerX, centerY, isLong, angle, speed, pSize));
      }
    }
  };

  const animate = () => {
    if (!isAnimating) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
    
    requestAnimationFrame(animate);
  };
  
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  let count = 0;
  const totalShort = 10;
  const delay = 150; // 150ms

  spawnParticles(false, 0); // Immediate first one
  playAudio('sounds/explosion_short.ogg', { volume: 0.8 });
  count++;

  const intervalId = setInterval(() => {
    if (count < totalShort) {
      playAudio('sounds/explosion_short.ogg', { volume: 0.8 });
      spawnParticles(false, count);
      count++;
    } else {
      clearInterval(intervalId);
      // We are already inside the interval, so this is 150ms after the 10th explosion.
      playAudio('sounds/explosion_long.ogg', { volume: 1.0 });
      spawnParticles(true, count);
      // Wait 1.5 seconds before re-allowing clicks
      setTimeout(() => {
        explosionContainer.style.pointerEvents = 'none';
      }, 1500);
      // Wait for long explosion to finish before removing container
      setTimeout(() => {
        isAnimating = false;
        explosionContainer.remove();
      }, 5000); // Increased duration to allow particles to fall and fade
    }
  }, delay);
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
      if (info && info.exploded) {
        textEl.textContent = '...';
        renderDialogueList();
        playDialogueExplosion();
        return;
      }
      if (info && info.noReward) {
        textEl.textContent = '...';
        renderDialogueList();
        return;
      }
      if (info && info.startBossFight) {
        textEl.textContent = '...';
        renderDialogueList();
        startBossFightSequence();
        return;
      }
      completeDialogueOnce(id, meta);
	textEl.textContent = '...';
	renderDialogueList();
	}
  });

  const script = MERCHANT_DIALOGUES[meta.scriptId];
  engine.load(script);
  engine.start();
}

export function startBossFightSequence() {
    // 0. Dispatch music stop
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('audio:stopMusic'));

    // 1. Black screen overlay
    const overlay = document.createElement('div');
    overlay.id = 'bossfight-sequence-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'black';
    overlay.style.zIndex = '2147483645';
    overlay.style.pointerEvents = 'all';
    overlay.style.cursor = 'none'; // Hide cursor
    document.body.appendChild(overlay);
    
    // 2. Set active flag
    window.__bossFightSequenceActive = true;
    
    // 3. Stop spawning
    if (window.spawner && typeof window.spawner.stop === 'function') {
        window.spawner.stop();
        if (typeof window.spawner.stopAllWaveSounds === "function") {
            window.spawner.stopAllWaveSounds();
        }
    }

    // 4. Start visuals after 5 seconds
    setTimeout(() => {
        // Remove black screen
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }

        // Create container for boss fight visuals
        const visualsContainer = document.createElement('div');
        visualsContainer.id = 'bossfight-visuals-container';
        visualsContainer.style.position = 'fixed';
        visualsContainer.style.inset = '0';
        visualsContainer.style.zIndex = '2147483641';
        document.body.appendChild(visualsContainer);

        // Start visuals and return to normal Cove state when complete
        playSecretDlgBossFightSequence(visualsContainer, () => {
            window.__bossFightSequenceActive = false;

            if (visualsContainer && visualsContainer.parentNode) {
                visualsContainer.parentNode.removeChild(visualsContainer);
            }

            const transitionOverlay = document.getElementById('bossfight-sequence-overlay');
            if (transitionOverlay && transitionOverlay.parentNode) {
                transitionOverlay.parentNode.removeChild(transitionOverlay);
            }

            const victoryOverlay = document.getElementById('boss-victory-container');
            if (victoryOverlay && victoryOverlay.parentNode) {
                victoryOverlay.parentNode.removeChild(victoryOverlay);
            }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('audio:restartMusic'));
            }

            if (window.spawner && typeof window.spawner.start === 'function') {
                window.spawner.start();
                if (typeof window.spawner.playEntranceWave === 'function') {
                    window.spawner.playEntranceWave();
                }
            }

            forceCloseCoveOverlays();
        }, {});
    }, 5000);
}

function forceCloseCoveOverlays() {
  const hadNoOverlayTransitions = document.body.classList.contains('no-overlay-transitions');
  if (!hadNoOverlayTransitions) {
    document.body.classList.add('no-overlay-transitions');
  }

  closeMerchant();

  const closeSelectors = [
    '.offline-close-btn',
    '.hm-milestones-close',
    '.merchant-close',
    '.shop-close',
    '.sas-close'
  ];
  closeSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((btn) => {
      try { btn.click(); } catch {}
    });
  });

  if (!hadNoOverlayTransitions) {
    requestAnimationFrame(() => {
      document.body.classList.remove('no-overlay-transitions');
    });
  }
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
      textEl.textContent = '...';
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
  setDelveElements(merchantOverlayEl, merchantSheetEl);
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

  // Restore last tab (MOVED UP)
  let last = 'dialogue';
  try { last = localStorage.getItem(sk(MERCHANT_TAB_KEY_BASE)) || 'dialogue'; } catch {}

  if (forcedDialogueTab) {
    last = 'dialogue';
  }

  selectMerchantTab(last);

  // Ensure no orphaned audio
  stopTypingSfx();
      setTypingActive(false);
      setAudioUnderwater(false);

  // First-time chat
  if (!met) {
    const fc = merchantOverlayEl.querySelector('.merchant-firstchat');
    fc?.classList.add('is-visible');
    merchantOverlayEl.classList.add('firstchat-active');
    runFirstMeet();
  }

  // Reset transform and transition and apply the standard Delve logic
  openDelveOverlay(merchantOverlayEl, merchantSheetEl);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (merchantOverlayEl.classList.contains('firstchat-instant')) {
          merchantSheetEl.style.transition = 'none';
      }

      if (merchantCloseBtn && typeof merchantCloseBtn.focus === 'function') {
      try { merchantCloseBtn.focus({ preventScroll: true }); } catch {}
      }
    });
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
      setTypingActive(false);
      setAudioUnderwater(false);
  setTypingActive(false);
      setAudioUnderwater(false);
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
      closeDelveSpecificOverlays();
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
    const delay = document.body.classList.contains('no-overlay-transitions') ? 0 : 150;
    setTimeout(() => { closeMerchant(); }, delay);
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

  if (merchantSheetEl) {
    if (key === 'lab') merchantSheetEl.classList.add('is-lab-active');
    else merchantSheetEl.classList.remove('is-lab-active');

    if (key === 'flow') merchantSheetEl.classList.add('is-flow-active');
    else merchantSheetEl.classList.remove('is-flow-active');
  }

  for (const k in merchantTabs.buttons) {
    merchantTabs.buttons[k].classList.toggle('is-active', k === key);
  }
  for (const k in merchantTabs.panels) {
    merchantTabs.panels[k].classList.toggle('is-active', k === key);
  }

  if (key === 'dialogue') {
    try { renderDialogueList(); } catch {}
  }
  if (key === 'reset') {
    try { initResetPanel(merchantTabs.panels['reset']); } catch {}
    try { updateResetPanel(); } catch {}
  }
  if (key === 'workshop') {
    try { initWorkshopTab(merchantTabs.panels['workshop']); } catch {}
  }
  if (key === 'warp') {
    try { initWarpTab(merchantTabs.panels['warp']); } catch {}
    try { updateWarpTab(); } catch {}
  }
  if (key === 'lab') {
    try { initLabTab(merchantTabs.panels['lab']); } catch {}
    if (typeof hasVisitedLab === 'function' && !hasVisitedLab()) {
        runLabIntroDialogue();
    }
    try { updateLabTab(); } catch {}
  }
  if (key === 'flow') {
    try { initFlowTab(merchantTabs.panels['flow']); } catch {}
    try { updateFlowTab(); } catch {}
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

export function isMerchantOpen() {
  return merchantOpen;
}

export function isViewingLabTab() {
  if (!merchantOpen) return false;
  const btn = merchantTabs.buttons['lab'];
  return btn && btn.classList.contains('is-active');
}

export function unlockMerchantTabs(keys = []) {
  keys.forEach(key => setMerchantTabUnlocked(key, true));
}

export function runTsunamiDialogue(container, onComplete, tsunamiControls) {
  const scriptPart1 = {
    start: 'n1',
    nodes: {
      'n1': { type: 'line', say: 'O Great Tsunami...', next: 'c1' },
      'c1': { type: 'choice', options: [{ label: '...', to: 'n2' }] },
      'n2': { type: 'line', say: 'Cover this Cove in your wet embrace...', next: 'c2' },
      'c2': { type: 'choice', options: [{ label: '...', to: 'n3' }] },
      'n3': { type: 'line', say: 'We have thirsted for far too long...', next: 'c3' },
      'c3': { type: 'choice', options: [{ label: '...', to: 'n4' }] },
      'n4': { type: 'line', say: 'Awaken what once was lost...', next: 'c4' },
      'c4': { type: 'choice', options: [{ label: '...', to: 'n5' }] },
      'n5': { type: 'line', say: 'You will have my deepest gratitude...', next: 'c5' },
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
        <div class="merchant-firstchat__text" id="tsunami-dlg-line" style="user-select: none; -webkit-user-select: none;">...</div>
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
            <div class="merchant-firstchat__text" id="tsunami-dlg-line-2" style="user-select: none; -webkit-user-select: none;">...</div>
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
                  say: 'I am sure the <span style="color:#00e5ff">Player</span> will have some questions when they wake up, but I will deal with that when I must.', 
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
      setTypingActive(false);
      setAudioUnderwater(false);
                  setTypingActive(false);
      setAudioUnderwater(false);
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
      setTypingActive(false);
      setAudioUnderwater(false);
        setTypingActive(false);
      setAudioUnderwater(false);
        
        if (tsunamiControls && tsunamiControls.hideCursor) tsunamiControls.hideCursor();
        
        runPart2();
    }
  });

  engine.load(scriptPart1);
  engine.start();
}

export function runLabIntroDialogue() {
    const overlay = document.createElement('div');
    overlay.className = 'merchant-firstchat is-visible';
    overlay.style.zIndex = '99998';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.userSelect = 'none';
    overlay.style.webkitUserSelect = 'none';
    
    overlay.innerHTML = `
      <div class="merchant-firstchat__card" role="dialog" aria-label="Lab Introduction">
        <div class="merchant-firstchat__header">
          <div class="name">${getMerchantName()}</div>
          <div class="rule" aria-hidden="true"></div>
        </div>
        <div class="merchant-firstchat__row">
          <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
          <div class="merchant-firstchat__text" id="lab-intro-line" style="user-select: none; -webkit-user-select: none;">...</div>
        </div>
        <div class="merchant-firstchat__choices" id="lab-intro-choices"></div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const textEl = overlay.querySelector('#lab-intro-line');
    const choicesEl = overlay.querySelector('#lab-intro-choices');
    const rowEl = overlay.querySelector('.merchant-firstchat__row');
    const cardEl = overlay.querySelector('.merchant-firstchat__card');

    primeTypingSfx();

    const script = {
        start: 'n1',
        nodes: {
            'n1': { 
                type: 'line', 
                say: 'Hey, <span style="color:#00e5ff">Player</span>, welcome to the Lab. I\'ll keep it brief: Research nodes, increase your Lab Level to research nodes faster, and you\'ll be making tons of Coins. Your Surge Milestones were temporarily sacrificed to the Tsunami but that\'s not important, get to researching!', 
                next: 'c1' 
            },
            'c1': { 
                type: 'choice', 
                options: [
                    { label: 'I don\'t understand.', to: 'end_nr' },
                    { label: 'Tsunami sacrifice?', to: 'end_nr' },
                    { label: '???', to: 'end_nr' }
                ] 
            }
        }
    };

    const blockEsc = (e) => {
        if (e.key === 'Escape') {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    document.addEventListener('keydown', blockEsc, { capture: true });

    const engine = new DialogueEngine({
        textEl,
        choicesEl,
        skipTargets: [textEl, rowEl, cardEl],
        onEnd: () => {
            document.removeEventListener('keydown', blockEsc, { capture: true });
            stopTypingSfx();
      setTypingActive(false);
      setAudioUnderwater(false);
            setTypingActive(false);
      setAudioUnderwater(false);
            overlay.remove();
        }
    });

    engine.load(script);
    engine.start();
}

export function runPostTsunamiShopDialogue(onComplete) {
    const overlay = document.createElement('div');
    overlay.className = 'merchant-firstchat is-visible';
    overlay.style.zIndex = '99998';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.userSelect = 'none';
    overlay.style.webkitUserSelect = 'none';
    
    overlay.innerHTML = `
      <div class="merchant-firstchat__card" role="dialog" aria-label="Urgent Message">
        <div class="merchant-firstchat__header">
          <div class="name">${getMerchantName()}</div>
          <div class="rule" aria-hidden="true"></div>
        </div>
        <div class="merchant-firstchat__row">
          <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
          <div class="merchant-firstchat__text" id="post-tsunami-line" style="user-select: none; -webkit-user-select: none;">...</div>
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
                    { label: 'The lab?', to: 'end' },
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
      setTypingActive(false);
      setAudioUnderwater(false);
            setTypingActive(false);
      setAudioUnderwater(false);
            overlay.remove();
            if (onComplete) onComplete();
        }
    });

    engine.load(script);
    engine.start();
}

// Expose for other modules that may build UI later
export { ensureMerchantOverlay };
