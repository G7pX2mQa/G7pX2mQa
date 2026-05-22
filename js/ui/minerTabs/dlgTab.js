// js/ui/minerTabs/dlgTab.js
import { getActiveSlot } from '../../util/storage.js';
import { MINER_DIALOGUES } from '../../misc/minerDialogues.js';
import { blockInteraction, updateShopOverlay, closeDelveSpecificOverlays } from '../shopOverlay.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';
import { playAudio } from '../../util/audioManager.js';
import { MYSTERIOUS_ICON_SRC, HIDDEN_DIALOGUE_TITLE, LOCKED_DIALOGUE_TITLE, DEFAULT_MYSTERIOUS_BLURB, DEFAULT_LOCKED_BLURB, DEFAULT_LOCK_MESSAGE, DIALOGUE_STATUS_ORDER, HAS_POINTER_EVENTS, HAS_TOUCH_EVENTS, bindRapidActivation, primeTypingSfx, startTypingSfx, stopTypingSfx, typeText, DialogueEngine, openDialogueLockInfo, injectScrollTimelineStyles, ensureMerchantScrollbar, setDelveElements, openDelveOverlay } from '../delveCore.js';

const MINER_ICON_SRC = 'img/misc/mysterious.webp';
const MINER_MET_KEY_BASE = 'ccc:minerMet';

const sk = (base) => base + ':' + getActiveSlot();

export function hasMetMiner() {
  try {
    return localStorage.getItem(sk(MINER_MET_KEY_BASE)) === '1';
  } catch {
    return false;
  }
}

let minerOverlayEl = null;
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

    const actions = document.createElement('div');
    actions.className = 'merchant-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'merchant-close';
    closeBtn.textContent = 'Close';
    actions.appendChild(closeBtn);

    minerSheetEl.append(grabber, header, content, actions);
    minerOverlayEl.appendChild(minerSheetEl);
    document.body.appendChild(minerOverlayEl);

    // Initial setup for Dialogue List
    panelDialogue.__dlgInit = true;
    const list = document.createElement('div');
    list.className = 'merchant-dialogue-list';
    panelDialogue.appendChild(list);
    panelDialogue.__dlgList = list;

    closeBtn.addEventListener('click', closeMiner);
    ensureMerchantScrollbar('.merchant-content');
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
    
    renderDialogueList();
    
    openDelveOverlay(minerOverlayEl, minerSheetEl);

    try {
        localStorage.setItem(sk(MINER_MET_KEY_BASE), '1');
    } catch {}
    
    updateShopOverlay(true);
}

export function closeMiner() {
    if (minerOverlayEl) {
        minerOverlayEl.classList.remove('is-open');
        minerOverlayEl.setAttribute('inert', '');
    }
}
