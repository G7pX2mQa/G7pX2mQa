import { initSellPanel, updateSellPanelVisibility, isSellUnlocked, setSellUnlocked } from './sellTab.js';
// js/ui/minerTabs/dlgTab.js
import { getActiveSlot } from '../../util/storage.js';
import { MINER_DIALOGUES } from '../../misc/minerDialogues.js';
import { blockInteraction, updateShopOverlay, closeDelveSpecificOverlays } from '../shopOverlay.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';
import { setAudioUnderwater } from '../../util/audioManager.js';
import { setTypingActive, MYSTERIOUS_ICON_SRC, HIDDEN_DIALOGUE_TITLE, LOCKED_DIALOGUE_TITLE, DEFAULT_MYSTERIOUS_BLURB, DEFAULT_LOCKED_BLURB, DEFAULT_LOCK_MESSAGE, DIALOGUE_STATUS_ORDER, HAS_POINTER_EVENTS, HAS_TOUCH_EVENTS, bindRapidActivation, primeTypingSfx, startTypingSfx, stopTypingSfx, typeText, DialogueEngine, openDialogueLockInfo, injectScrollTimelineStyles, ensureMerchantScrollbar, setDelveElements, openDelveOverlay } from '../delveCore.js';

const MINER_ICON_SRC = 'img/misc/miner.webp';
const MINER_MET_KEY_BASE = 'ccc:minerMet';
export const MINER_MET_EVENT = 'ccc:miner:met';

const sk = (base) => base + ':' + getActiveSlot();

export function hasMetMiner() {
  try {
    return localStorage.getItem(sk(MINER_MET_KEY_BASE)) === '1';
  } catch {
    return false;
  }
}

let minerOverlayEl = null;
let minerUnlockListenerBound = false;
let minerSheetEl = null;

function ensureMinerOverlay() {
    if (minerOverlayEl) return;
    
    minerSheetEl = document.createElement('div');
    minerOverlayEl = document.createElement('div');

    minerOverlayEl.className = 'merchant-overlay is-miner';
    minerOverlayEl.id = 'miner-overlay';
    minerOverlayEl.setAttribute('inert', '');

    minerSheetEl.className = 'merchant-sheet';
    minerSheetEl.setAttribute('role', 'dialog');
    minerSheetEl.setAttribute('aria-modal', 'false');
    minerSheetEl.setAttribute('aria-label', 'Miner');

    const grabber = document.createElement('div');
    grabber.className = 'merchant-grabber';
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

    const header = document.createElement('header');
    header.className = 'merchant-header';
    header.innerHTML = `
        <div class="merchant-title">Miner</div>
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
    panelDialogue.id = 'miner-panel-dialogue';

    
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'merchant-tab is-active';
    tabBtn.dataset.tab = 'dialogue';
    tabBtn.textContent = 'Dialogue';
    tabBtn.title = 'Dialogue';
    tabs.appendChild(tabBtn);

    panelsWrap.appendChild(panelDialogue);
    content.append(tabs, panelsWrap);
    
    // Add tab switching logic for dialogue tab
    tabBtn.addEventListener('click', () => {
      const allTabs = tabs.querySelectorAll('.merchant-tab');
      const allPanels = panelsWrap.querySelectorAll('.merchant-panel');
      allTabs.forEach(t => t.classList.remove('is-active'));
      allPanels.forEach(p => p.classList.remove('is-active'));
      tabBtn.classList.add('is-active');
      panelDialogue.classList.add('is-active');
    });

    initSellPanel(minerSheetEl, tabs, panelsWrap);


    const actions = document.createElement('div');
    actions.className = 'merchant-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'merchant-close';
    closeBtn.textContent = 'Close';
    actions.appendChild(closeBtn);

        // First-time chat overlay
    const firstChat = document.createElement('div');
    firstChat.className = 'merchant-firstchat merchant-firstchat--initial';
    firstChat.innerHTML = `
        <div class="merchant-firstchat__card" role="dialog" aria-label="First chat">
        <div class="merchant-firstchat__header">
          <div class="name">Miner</div>
          <div class="rule" aria-hidden="true"></div>
        </div>
        <div class="merchant-firstchat__row">
          <img class="merchant-firstchat__icon" src="${MINER_ICON_SRC}" alt="">
          <div class="merchant-firstchat__text" id="miner-first-line">...</div>
        </div>
        <div class="merchant-firstchat__choices" id="miner-first-choices"></div>
        </div>
    `;

    minerSheetEl.append(grabber, header, content, actions, firstChat);
    minerOverlayEl.appendChild(minerSheetEl);
    document.body.appendChild(minerOverlayEl);

    // Initial setup for Dialogue List
    panelDialogue.__dlgInit = true;
    const antisocialMsg = document.createElement('div');
    antisocialMsg.className = 'miner-antisocial-msg';
    antisocialMsg.textContent = 'The Miner does not wish to chat with you right now';
    panelDialogue.appendChild(antisocialMsg);




    closeBtn.addEventListener('click', closeMiner);
    ensureMerchantScrollbar('.merchant-content');

    if (!minerUnlockListenerBound && typeof window !== 'undefined') {
        const handleUnlockChange = () => {
            if (minerSheetEl && minerOverlayEl && minerOverlayEl.classList.contains('is-open')) {
                updateSellPanelVisibility(minerSheetEl);
            }
        };
        window.addEventListener('unlock:change', handleUnlockChange, { passive: true });
        window.addEventListener('saveSlot:change', handleUnlockChange, { passive: true });
        window.addEventListener('currency:change', handleUnlockChange, { passive: true });
        window.addEventListener('debug:change', handleUnlockChange, { passive: true });
        minerUnlockListenerBound = true;
    }
}

function runFirstMeet() {
  const fc = minerOverlayEl.querySelector('.merchant-firstchat');
  const textEl = fc.querySelector('#miner-first-line');
  const rowEl  = fc.querySelector('.merchant-firstchat__row');
  const cardEl = fc.querySelector('.merchant-firstchat__card');
  const choicesEl = fc.querySelector('#miner-first-choices');

  const engine = new DialogueEngine({
      textEl,
      choicesEl,
      skipTargets: [textEl, rowEl, cardEl],
      pauseMultiplier: 2000 / 22,
      onEnd: () => {
      document.removeEventListener('keydown', onEscToCancel, { capture: true });
      try { localStorage.setItem(sk(MINER_MET_KEY_BASE), '1'); } catch {}
      try { window.dispatchEvent(new Event(MINER_MET_EVENT)); } catch {}
      fc.classList.remove('is-visible');
      minerOverlayEl.classList.remove('firstchat-active');
      }
  });

  engine.load(MINER_DIALOGUES[0]);
  let ended = false;
  const cancelWithoutReward = () => {
      if (ended) return;
      ended = true;
      document.removeEventListener('keydown', onEscToCancel, { capture: true });
      fc.classList.remove('is-visible');
      minerOverlayEl.classList.remove('firstchat-active');
      stopTypingSfx();
        setTypingActive(false);
 
      setAudioUnderwater(false);
  };

  const onEscToCancel = (e) => {
    if (e.key !== 'Escape') return;
    if (!fc.isConnected) return;
    cancelWithoutReward();
  };
  
  document.addEventListener('keydown', onEscToCancel, { capture: true });

  engine.start();
}

function resetFirstChatOverlayState() {
  if (!minerOverlayEl) return;
  const fc = minerOverlayEl.querySelector('.merchant-firstchat--initial');
  if (!fc) return;

  fc.classList.remove('is-visible');

  const textEl = fc.querySelector('#miner-first-line');
  if (textEl) {
      textEl.classList.remove('is-typing');
      textEl.textContent = '...';
  }

  const choicesEl = fc.querySelector('#miner-first-choices');
  if (choicesEl) {
      choicesEl.classList.remove('is-visible');
      choicesEl.style.opacity = '0';
      choicesEl.style.transform = 'translateY(6px)';
      choicesEl.style.pointerEvents = 'none';
      choicesEl.style.minHeight = '';
      choicesEl.innerHTML = '';
  }

  minerOverlayEl.classList.remove('firstchat-active');
}

function renderDialogueList() {
    const panel = document.getElementById('miner-panel-dialogue');
    if (!panel) return;
    const list = panel.__dlgList;
    if (!list) return;

    list.innerHTML = '';

    // Create placeholder
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dlg-card is-unlocked';
    btn.dataset.dlgId = 'miner_placeholder';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'dlg-title';
    titleEl.textContent = 'Talk to Miner';
    
    const blurbEl = document.createElement('div');
    blurbEl.className = 'dlg-blurb';
    blurbEl.textContent = 'Placeholder';
    
    const rewardEl = document.createElement('div');
    rewardEl.className = 'dlg-reward';
    
    btn.append(titleEl, blurbEl, rewardEl);
    list.appendChild(btn);
}

export function openMiner() {
  ensureMinerOverlay();
  setDelveElements(minerOverlayEl, minerSheetEl);
    
    // renderDialogueList();

    
    let met = false;
    try {
        met = localStorage.getItem(sk(MINER_MET_KEY_BASE)) === '1';
    } catch {
        met = false;
    }
    
    updateSellPanelVisibility(minerSheetEl);


    if (!met) {
        minerOverlayEl.classList.add('firstchat-instant');
    }

    // Ensure no orphaned audio
    stopTypingSfx();
        setTypingActive(false);
        setAudioUnderwater(false);

    if (!met) {
        const fc = minerOverlayEl.querySelector('.merchant-firstchat');
        fc?.classList.add('is-visible');
        minerOverlayEl.classList.add('firstchat-active');
        runFirstMeet();
    }
    
    openDelveOverlay(minerOverlayEl, minerSheetEl);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (minerOverlayEl.classList.contains('firstchat-instant')) {
                minerSheetEl.style.transition = 'none';
            }
        });
    });
    
    updateShopOverlay(true);
}

export function closeMiner() {
    if (minerOverlayEl) {
        minerOverlayEl.classList.remove('is-open');
        minerOverlayEl.classList.remove('firstchat-instant');
        resetFirstChatOverlayState();
        minerOverlayEl.setAttribute('inert', '');
        
        minerSheetEl.style.transition = '';
        minerSheetEl.style.transform = '';
        
        stopTypingSfx();
        setTypingActive(false);
        setAudioUnderwater(false);
    }
}
