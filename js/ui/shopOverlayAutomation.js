
import { IS_MOBILE } from '../main.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from './shopOverlay.js';

let automationOverlayEl = null;
let automationSheetEl = null;
let automationOpen = false;
let eventsBound = false;
let automationCloseTimer = null;
let __automationPostOpenPointer = false;

function ensureAutomationOverlay() {
  if (automationOverlayEl) return;

  automationOverlayEl = document.createElement('div');
  automationOverlayEl.className = 'shop-overlay automation-shop-overlay'; // Reuse shop styles + specific class
  automationOverlayEl.id = 'automation-shop-overlay';

  automationSheetEl = document.createElement('div');
  automationSheetEl.className = 'shop-sheet';
  automationSheetEl.setAttribute('role', 'dialog');
  automationSheetEl.setAttribute('aria-modal', 'false');
  automationSheetEl.setAttribute('aria-label', 'Automation Shop');

  const grabber = document.createElement('div');
  grabber.className = 'shop-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'shop-content';

  const header = document.createElement('header');
  header.className = 'shop-header';
  header.innerHTML = `
    <div class="shop-title">Automation Shop</div>
    <div class="shop-line" aria-hidden="true"></div>
  `;

  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.id = 'automation-shop-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Automation Upgrades');
  // Empty for now as requested

  const scroller = document.createElement('div');
  scroller.className = 'shop-scroller automation-shop-scroller'; // Distinct class for ghost tap exclusion
  scroller.appendChild(grid);

  content.append(header, scroller);

  const actions = document.createElement('div');
  actions.className = 'shop-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shop-close';
  closeBtn.textContent = 'Close';

  actions.appendChild(closeBtn);

  automationSheetEl.append(grabber, content, actions);
  automationOverlayEl.appendChild(automationSheetEl);
  document.body.appendChild(automationOverlayEl);

  automationOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    __automationPostOpenPointer = true;
  }, { capture: true, passive: true });

  automationOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!__automationPostOpenPointer) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  ensureCustomScrollbar(automationOverlayEl, automationSheetEl, '.automation-shop-scroller');

  if (!eventsBound) {
    eventsBound = true;

    function onCloseClick(e) {
      if (IS_MOBILE) {
        blockInteraction(80);
      }
      closeAutomationShop();
    }

    closeBtn.addEventListener('click', onCloseClick, { passive: true });
    
    // Drag to dismiss logic
    setupDragToClose(grabber, automationSheetEl, () => automationOpen, () => {
        automationOpen = false;
        automationCloseTimer = setTimeout(() => {
          automationCloseTimer = null;
          closeAutomationShop(true);
        }, 150);
    });
  }
}

export function openAutomationShop() {
  ensureAutomationOverlay();

  if (automationCloseTimer) {
    clearTimeout(automationCloseTimer);
    automationCloseTimer = null;
  }

  if (automationOpen) return;

  automationOpen = true;
  automationSheetEl.style.transition = 'none';
  automationSheetEl.style.transform = '';
  automationOverlayEl.style.pointerEvents = 'auto';

  void automationSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    automationSheetEl.style.transition = '';
    automationOverlayEl.classList.add('is-open');
    __automationPostOpenPointer = false;

    if (IS_MOBILE) {
      try {
        setTimeout(() => suppressNextGhostTap(240), 120);
      } catch {}
    }

    blockInteraction(10);
    ensureCustomScrollbar(automationOverlayEl, automationSheetEl, '.automation-shop-scroller');
  });
}

export function closeAutomationShop(force = false) {
  const forceClose = force === true;
  const overlayOpen = automationOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !automationOpen && !overlayOpen) {
    if (automationCloseTimer) {
      clearTimeout(automationCloseTimer);
      automationCloseTimer = null;
    }
    return;
  }

  if (automationCloseTimer) {
    clearTimeout(automationCloseTimer);
    automationCloseTimer = null;
  }

  automationOpen = false;
  if (automationSheetEl) {
    automationSheetEl.style.transition = '';
    automationSheetEl.style.transform = '';
  }
  automationOverlayEl.classList.remove('is-open');
  automationOverlayEl.style.pointerEvents = 'none';
  __automationPostOpenPointer = false;
}
