// js/ui/delveTabDlg.js

import { bank, getActiveSlot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { MERCHANT_DIALOGUES } from '../misc/merchantDialogues.js';
import { getXpState, isXpSystemUnlocked } from '../game/xpSystem.js';
import {
  markGhostTapTarget,
  shouldSkipGhostTap,
  suppressNextGhostTap,
} from '../util/ghostTapGuard.js';

const MERCHANT_ICON_SRC = 'img/misc/merchant.png';
const MERCHANT_MET_KEY_BASE  = 'ccc:merchantMet';
const MERCHANT_TAB_KEY_BASE  = 'ccc:merchantTab';
const MERCHANT_DLG_STATE_KEY_BASE = 'ccc:merchant:dlgState';
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
  { key: 'reset',     label: '???',      unlocked: false },
  { key: 'minigames', label: '???',      unlocked: false },
];

const MYSTERY_ICON_SRC = 'img/misc/mysterious.png';
const HIDDEN_DIALOGUE_TITLE = 'Hidden Dialogue';
const LOCKED_DIALOGUE_TITLE = 'Locked Dialogue';
const DEFAULT_MYSTERY_BLURB = 'Something hums behind the counter.';
const DEFAULT_LOCKED_BLURB = 'Locked';
const DEFAULT_LOCK_MESSAGE = 'This dialogue is hidden for now.';

const IS_MOBILE =
  (typeof window.IS_MOBILE !== 'undefined')
    ? window.IS_MOBILE
    : (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);

let progressEventsBound = false;

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
    } else if (normalized === 'mystery') {
      status = 'mystery';
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
      : (status === 'mystery' ? DEFAULT_MYSTERY_BLURB : DEFAULT_LOCKED_BLURB),
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
  ?? (status === 'mystery' ? DEFAULT_MYSTERY_BLURB : DEFAULT_LOCKED_BLURB)
info.tooltip = rawObj?.tooltip
  ?? (status === 'locked' ? 'Locked Dialogue' : 'Hidden Dialogue');

info.message = rawObj?.message ?? (status === 'mystery' ? DEFAULT_LOCK_MESSAGE : '');
info.icon = rawObj?.icon ?? (status === 'mystery' ? MYSTERY_ICON_SRC : null);
info.headerTitle = rawObj?.headerTitle ?? (status === 'mystery' ? HIDDEN_DIALOGUE_TITLE : LOCKED_DIALOGUE_TITLE);
info.ariaLabel = rawObj?.ariaLabel ?? (status === 'mystery'
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
  }

  document.addEventListener('ccc:upgrades:changed', handler);
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
    try { bank.coins.add(reward.amount); } catch (e) {
      console.warn('Failed to grant coin reward:', reward, e);
    }
    return;
  }
  try { window.dispatchEvent(new CustomEvent('merchantReward', { detail: reward })); } catch {}
}

function rewardLabel(reward) {
  if (!reward) return '';
  if (reward.type === 'coins') return `Reward: ${reward.amount} coins`;
  return 'Reward available';
}

// Dialogue catalog (add new entries over time)
const DLG_CATALOG = {
  1: {
    title: 'A Generous Offer',
    blurb: 'The Merchant is feeling extra nice today.',
    scriptId: 1,
    reward: { type: 'coins', amount: 100 },
    unlock: (progress) => true,
    once: true,
  },
  2: {
    title: 'Experience Broker',
    blurb: 'Talk about the freshly unlocked XP system.',
    scriptId: 2,
unlock: (progress) => {
  if (!progress?.xpUnlocked) {
    return {
      status: 'mystery',
      requirement: 'Unlock the XP system to reveal this dialogue.',
      message: 'Unlock the XP system to reveal this dialogue.',
      icon: MYSTERY_ICON_SRC,
      headerTitle: HIDDEN_DIALOGUE_TITLE,
      ariaLabel: 'Hidden merchant dialogue. Unlock the XP system to reveal this dialogue.',
    };
  }
  return true;
},
    once: false,
  },
  3: {
    title: 'Edge of Mastery',
    blurb: 'Placeholder musings for reaching XP level 999.',
    scriptId: 3,
unlock: (progress) => {
  if (!progress?.xpUnlocked) {
    return {
      status: 'locked',
      title: '???',
      blurb: DEFAULT_LOCKED_BLURB,
      tooltip: 'Locked',
      ariaLabel: 'Locked merchant dialogue.',
    };
  }
  if ((progress?.xpLevel ?? 0) < 999) {
    return {
      status: 'locked',
      title: '???',
      blurb: DEFAULT_LOCKED_BLURB,
      tooltip: 'Locked',
      ariaLabel: 'Locked merchant dialogue.',
    };
  }
  return true;
},
    once: false,
  },
};

function loadDlgState() {
  try { return JSON.parse(localStorage.getItem(sk(MERCHANT_DLG_STATE_KEY_BASE)) || '{}'); } catch { return {}; }
}

function saveDlgState(s) {
  try { localStorage.setItem(sk(MERCHANT_DLG_STATE_KEY_BASE), JSON.stringify(s)); } catch {}
}

// ----- Module state -----
let merchantOverlayEl = null;
let merchantSheetEl   = null;
let merchantOpen      = false;
let merchantDrag      = null;
let merchantEventsBound = false;
let merchantTabs = { buttons: {}, panels: {}, tablist: null };

// ========================= Typing SFX (WebAudio, zero-latency, mobile volume) =========================
const TYPING_SFX_SOURCE = ['sounds/merchant_typing.mp3']; // ensure this asset exists

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
    this.choicesEl.setAttribute('aria-hidden', 'true');
  }

  _renderChoices(options, prepare = false) {
    this.choicesEl.innerHTML = '';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.textContent = opt.label;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
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
      this.choicesEl.setAttribute('aria-hidden', 'true');
      return;
    }
    this.choicesEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
  }

  _revealPreparedChoices() {
    this.choicesEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
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
        <img class="merchant-firstchat__icon" src="${lockInfo.icon || MYSTERY_ICON_SRC}" alt="">
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
      e.preventDefault();
      close();
    }
  });

  closeBtn.addEventListener('click', () => close());

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

  // Click/tap outside the card cancels (NO reward)
  overlay.addEventListener('pointerdown', (e) => {
    // If the initial down was outside card, treat it as backdrop dismiss
    if (!cardEl.contains(e.target)) {
      e.preventDefault();
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
      // deliberate no-reward ending
      closeModal();
      renderDialogueList();
      return;
    }

    // normal completion path (claim + reward)
    completeDialogueOnce(id, meta);
    closeModal();
    renderDialogueList();
  }
});

  // --- Modify dialogue text if this is a replay (Ask Again) ---
  const state = loadDlgState();
  const claimed = !!state[id]?.claimed;

  // Make a safe copy so we can modify text dynamically
  const script = structuredClone(MERCHANT_DIALOGUES[meta.scriptId]);

  if (claimed && script.nodes.m2b && script.nodes.c2a) {
    // The player already did this once — surreal variant
    script.nodes.m2b.say = 'I already gave you coins, goodbye.';
    script.nodes.c2a.options = [
      { label: 'Goodbye.', to: 'end_nr' },
      { label: 'Goodbye.', to: 'end_nr' },
      { label: 'Goodbye.', to: 'end_nr' },
    ];
  }

  engine.load(script);
  engine.start();
}

// ========================= Merchant Overlay (Delve) =========================
function ensureMerchantOverlay() {
  if (merchantOverlayEl) return;

  // Overlay
  merchantOverlayEl = document.createElement('div');
  merchantOverlayEl.className = 'merchant-overlay';
  merchantOverlayEl.id = 'merchant-overlay';
  merchantOverlayEl.setAttribute('aria-hidden', 'true');

  // Sheet
  merchantSheetEl = document.createElement('div');
  merchantSheetEl.className = 'merchant-sheet';
  merchantSheetEl.setAttribute('role', 'dialog');
  merchantSheetEl.setAttribute('aria-modal', 'false');
  merchantSheetEl.setAttribute('aria-label', 'Merchant');

  // Grabber
  const grabber = document.createElement('div');
  grabber.className = 'merchant-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  // Content
  const content = document.createElement('div');
  content.className = 'merchant-content';

  // Header
  const header = document.createElement('header');
  header.className = 'merchant-header';
  header.innerHTML = `
    <div class="merchant-title">Merchant</div>
    <div class="merchant-line" aria-hidden="true"></div>
  `;

  // Tabs + Panels
  const tabs = document.createElement('div');
  tabs.className = 'merchant-tabs';
  tabs.setAttribute('role', 'tablist');

  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'merchant-panels';

  // Dialogue panel
  const panelDialogue = document.createElement('section');
  panelDialogue.className = 'merchant-panel is-active';
  panelDialogue.id = 'merchant-panel-dialogue';

  // Other panels (locked initially)
  const panelReset = document.createElement('section');
  panelReset.className = 'merchant-panel';
  panelReset.id = 'merchant-panel-reset';

  const panelMinigames = document.createElement('section');
  panelMinigames.className = 'merchant-panel';
  panelMinigames.id = 'merchant-panel-minigames';

  // Tabs setup
  MERCHANT_TABS_DEF.forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'merchant-tab';
    btn.dataset.tab = def.key;
    btn.textContent = def.unlocked ? def.label : '???';
    if (!def.unlocked) {
      btn.classList.add('is-locked');
      btn.disabled = true;
      btn.title = 'Locked';
    }
    btn.addEventListener('click', () => selectMerchantTab(def.key));
    tabs.appendChild(btn);
    merchantTabs.buttons[def.key] = btn;
  });

  merchantTabs.panels['dialogue']  = panelDialogue;
  merchantTabs.panels['reset']     = panelReset;
  merchantTabs.panels['minigames'] = panelMinigames;
  merchantTabs.tablist = tabs;

  panelsWrap.append(panelDialogue, panelReset, panelMinigames);
  content.append(header, tabs, panelsWrap);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'merchant-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'merchant-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  // First-time chat overlay
  const firstChat = document.createElement('div');
  firstChat.className = 'merchant-firstchat';
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

  merchantSheetEl.append(grabber, content, actions, firstChat);
  merchantOverlayEl.appendChild(merchantSheetEl);
  document.body.appendChild(merchantOverlayEl);
  initDialogueTab();

  if (!merchantEventsBound) {
    merchantEventsBound = true;

    const onCloseClick = () => {
      if (shouldSkipGhostTap(closeBtn)) return;
      closeMerchant();
    };

    closeBtn.addEventListener('click', onCloseClick);
    const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
    if (hasPointerEvents) {
      closeBtn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        markGhostTapTarget(closeBtn);
        suppressNextGhostTap();
        closeMerchant();
        e.preventDefault();
      }, { passive: false });
    } else {
      closeBtn.addEventListener('touchstart', (e) => {
        markGhostTapTarget(closeBtn);
        suppressNextGhostTap();
        closeMerchant();
        e.preventDefault();
      }, { passive: false });
    }

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

  list.innerHTML = '';

  Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
    const lockInfo = resolveDialogueLock(meta, progress);
    const unlocked = lockInfo.unlocked;
    const isMystery = lockInfo.status === 'mystery';
    const locked = lockInfo.status === 'locked';
    const entryState = state[id] || {};
    const claimed = !!entryState.claimed;
    const showComplete = unlocked && !!(meta.once && claimed);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dlg-card';
    card.dataset.dlgStatus = lockInfo.status;
    card.disabled = !!locked;

    if (locked) {
      card.classList.add('is-locked');
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('tabindex', '-1');
    } else {
      card.removeAttribute('aria-disabled');
      card.removeAttribute('tabindex');
    }

    if (isMystery) {
      card.classList.add('is-mystery');
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
      if (meta.reward.type === 'coins') {
        reward.classList.add('has-reward');
        reward.innerHTML = `
          <span class="reward-label">Reward:</span>
          <span class="coin">
            <span class="coin-icon" aria-hidden="true"></span>
            <span class="amt">${meta.reward.amount}</span>
          </span>
        `;
        reward.setAttribute('aria-label', `Reward: ${meta.reward.amount} coins`);
      } else {
        reward.textContent = rewardLabel(meta.reward);
      }
    } else {
      reward.textContent = '';
    }

    const ariaLabel = unlocked
      ? `${meta.title}${showComplete ? ' (completed)' : ''}`
      : (lockInfo.ariaLabel || (isMystery ? 'Hidden merchant dialogue' : 'Locked merchant dialogue'));
    card.setAttribute('aria-label', ariaLabel);

    if (lockInfo.tooltip) {
      card.title = lockInfo.tooltip;
    } else if (unlocked) {
      card.title = 'Open dialogue';
    } else {
      card.removeAttribute('title');
    }

    card.append(title, blurb, reward);

    if (showComplete) {
      card.classList.add('is-complete');
      const again = document.createElement('div');
      again.className = 'dlg-again';
      again.textContent = 'Ask Again?';
      again.setAttribute('aria-hidden', 'true');
      card.classList.add('has-again');
      card.append(again);
    }

    list.appendChild(card);

    if (unlocked) {
      card.addEventListener('click', () => openDialogueModal(id, meta));
    } else if (isMystery) {
      card.addEventListener('click', () => openDialogueLockInfo(lockInfo));
    }
  });
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
  choicesEl.setAttribute('aria-hidden', 'true');
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

export function openMerchant() {
  ensureMerchantOverlay();
  if (merchantOpen) return;
  merchantOpen = true;

  // Reset transform and transition
  merchantSheetEl.style.transition = 'none';
  merchantSheetEl.style.transform = '';
  merchantOverlayEl.setAttribute('aria-hidden', 'false');

  // Animate in next frame
  void merchantSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    merchantSheetEl.style.transition = '';
    merchantOverlayEl.classList.add('is-open');

    // Restore last tab
    let last = 'dialogue';
    try { last = localStorage.getItem(sk(MERCHANT_TAB_KEY_BASE)) || 'dialogue'; } catch {}
    selectMerchantTab(last);

    // Ensure no orphaned audio
    stopTypingSfx();

    // First-time chat
    let met = false;
    try { met = localStorage.getItem(sk(MERCHANT_MET_KEY_BASE)) === '1'; } catch {}
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
  merchantOpen = false;
  merchantSheetEl.style.transition = '';
  merchantSheetEl.style.transform = '';
  merchantOverlayEl.classList.remove('is-open');
  merchantOverlayEl.setAttribute('aria-hidden', 'true');
  stopTypingSfx();
  __isTypingActive = false;
}

function onKeydownForMerchant(e) {
  if (!merchantOpen) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeMerchant();
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
    suppressNextGhostTap();
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

// Tabs
function selectMerchantTab(key) {
  const def = MERCHANT_TABS_DEF.find(t => t.key === key);
  if (!def || !def.unlocked) key = 'dialogue';

  for (const k in merchantTabs.buttons) {
    merchantTabs.buttons[k].classList.toggle('is-active', k === key);
  }
  for (const k in merchantTabs.panels) {
    merchantTabs.panels[k].classList.toggle('is-active', k === key);
  }
  try { localStorage.setItem(sk(MERCHANT_TAB_KEY_BASE), key); } catch {}
}

export function unlockMerchantTabs(keys = []) {
  keys.forEach(key => {
    const def = MERCHANT_TABS_DEF.find(t => t.key === key);
    if (!def) return;
    def.unlocked = true;
    const btn = merchantTabs.buttons[key];
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-locked');
      btn.textContent = def.label;
    }
  });
}

// Expose for other modules that may build UI later
export { ensureMerchantOverlay };
