import { getActiveSlot } from '../../util/storage.js';
import { MINER_DIALOGUES } from '../../misc/minerDialogues.js';
import { blockInteraction, updateShopOverlay, closeDelveSpecificOverlays } from '../shopOverlay.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { IS_MOBILE } from '../../main.js';
import { playAudio } from '../../util/audioManager.js';
import { MYSTERIOUS_ICON_SRC, HIDDEN_DIALOGUE_TITLE, LOCKED_DIALOGUE_TITLE, DEFAULT_MYSTERIOUS_BLURB, DEFAULT_LOCKED_BLURB, DEFAULT_LOCK_MESSAGE, DIALOGUE_STATUS_ORDER, HAS_POINTER_EVENTS, HAS_TOUCH_EVENTS, bindRapidActivation, primeTypingSfx, startTypingSfx, stopTypingSfx, typeText, DialogueEngine, openDialogueLockInfo, injectScrollTimelineStyles, ensureMerchantScrollbar } from '../delveCore.js';

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

export function openMiner() {
    if (!minerOverlayEl) {
        minerOverlayEl = document.createElement('div');
        minerOverlayEl.className = 'merchant-overlay is-miner';
        
        const sheet = document.createElement('div');
        sheet.className = 'merchant-sheet';
        sheet.setAttribute('role', 'dialog');

        const grabber = document.createElement('div');
        grabber.className = 'merchant-grabber';
        const handle = document.createElement('div');
        handle.className = 'grab-handle';
        grabber.appendChild(handle);

        const content = document.createElement('div');
        content.className = 'merchant-content';

        const header = document.createElement('header');
        header.className = 'merchant-header';

        const portrait = document.createElement('img');
        portrait.src = MINER_ICON_SRC;
        portrait.alt = '';
        portrait.className = 'merchant-portrait';

        const titleCol = document.createElement('div');
        titleCol.className = 'merchant-title-col';
        const name = document.createElement('h2');
        name.className = 'merchant-name';
        name.textContent = 'Miner';
        const subtitle = document.createElement('div');
        subtitle.className = 'merchant-subtitle';
        subtitle.textContent = 'Delve';
        titleCol.appendChild(name);
        titleCol.appendChild(subtitle);

        header.appendChild(portrait);
        header.appendChild(titleCol);

        const tabs = document.createElement('div');
        tabs.className = 'merchant-tabs';
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'merchant-tab is-active';
        tabBtn.textContent = 'Dialogue';
        tabs.appendChild(tabBtn);

        const tabContent = document.createElement('div');
        tabContent.className = 'merchant-tab-content';
        const scroller = document.createElement('div');
        scroller.className = 'merchant-scroller';
        const list = document.createElement('div');
        list.className = 'dialogue-list';
        scroller.appendChild(list);
        tabContent.appendChild(scroller);

        content.appendChild(header);
        content.appendChild(tabs);
        content.appendChild(tabContent);

        const actions = document.createElement('div');
        actions.className = 'merchant-actions';
        const leaveBtn = document.createElement('button');
        leaveBtn.type = 'button';
        leaveBtn.className = 'merchant-close';
        leaveBtn.textContent = 'Leave';
        actions.appendChild(leaveBtn);

        sheet.appendChild(grabber);
        sheet.appendChild(content);
        sheet.appendChild(actions);

        minerOverlayEl.appendChild(sheet);

        document.body.appendChild(minerOverlayEl);
        
        leaveBtn.addEventListener('click', () => {
            closeMiner();
        });
        
        const dialogueList = list;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dialogue-card is-unlocked';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'dialogue-card__icon';
        const btnImg = document.createElement('img');
        btnImg.src = MYSTERIOUS_ICON_SRC;
        btnImg.alt = '';
        iconDiv.appendChild(btnImg);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'dialogue-card__info';
        const btnTitle = document.createElement('div');
        btnTitle.className = 'dialogue-card__title';
        btnTitle.textContent = 'Talk to Miner';
        const btnBlurb = document.createElement('div');
        btnBlurb.className = 'dialogue-card__blurb';
        btnBlurb.textContent = 'Placeholder';
        infoDiv.appendChild(btnTitle);
        infoDiv.appendChild(btnBlurb);

        btn.appendChild(iconDiv);
        btn.appendChild(infoDiv);

        dialogueList.appendChild(btn);
    }
    minerOverlayEl.classList.add('is-open');
    try {
        localStorage.setItem(sk(MINER_MET_KEY_BASE), '1');
    } catch {}
    updateShopOverlay(true);
}

export function closeMiner() {
    if (minerOverlayEl) {
        minerOverlayEl.classList.remove('is-open');
    }
}