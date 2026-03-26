import { IS_MOBILE } from '../../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from '../shopOverlay.js';
import { suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { renderSettingsMenu } from './settingsRenderer.js';

let performanceOverlayEl = null;
let performanceSheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

const unsubscribers = [];

function buildPerformanceOverlay() {
  if (performanceOverlayEl) return;

  performanceOverlayEl = document.createElement('div');
  performanceOverlayEl.className = 'sas-overlay';
  performanceOverlayEl.id = 'performance-overlay';

  // Ensure it has a higher z-index to stay above sasOverlay
  performanceOverlayEl.style.zIndex = '4010';

  performanceSheetEl = document.createElement('div');
  performanceSheetEl.className = 'sas-sheet';
  performanceSheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Performance</div><div class="sas-line" aria-hidden="true"></div>`;

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'sas-settings-container';
  
  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(settingsContainer);

  content.append(header, scroller);
  ensureCustomScrollbar(performanceOverlayEl, performanceSheetEl, '.sas-scroller');

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  performanceSheetEl.append(grabber, content, actions);
  performanceOverlayEl.appendChild(performanceSheetEl);
  document.body.appendChild(performanceOverlayEl);

  // Listeners
  performanceOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  performanceOverlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  performanceOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closePerformanceOverlay();
  }, { passive: true });

  setupDragToClose(grabber, performanceSheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closePerformanceOverlay(true);
    }, 150);
  });
}


export function openPerformanceOverlay() {
  buildPerformanceOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  renderSettingsMenu(performanceOverlayEl, '.sas-settings-container', 'performance', unsubscribers);

  if (isOpen) return;
  isOpen = true;

  performanceSheetEl.style.transition = 'none';
  performanceSheetEl.style.transform = 'translateY(100%)';
  performanceOverlayEl.style.pointerEvents = 'auto';

  void performanceSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performanceSheetEl.style.transition = '';
      performanceSheetEl.style.transform = '';
      performanceOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(performanceOverlayEl, performanceSheetEl, '.sas-scroller');

      const focusable = performanceOverlayEl.querySelector('.sas-close');
      if (focusable) focusable.focus();
    });
  });
}

export function closePerformanceOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = performanceOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (performanceSheetEl) {
    performanceSheetEl.style.transition = '';
    performanceSheetEl.style.transform = '';
  }
  if (performanceOverlayEl) {
    performanceOverlayEl.classList.remove('is-open');
    performanceOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}