import { IS_MOBILE } from '../../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from '../shopOverlay.js';
import { suppressNextGhostTap } from '../../util/ghostTapGuard.js';

let visualsOverlayEl = null;
let visualsSheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

function buildVisualsOverlay() {
  if (visualsOverlayEl) return;

  visualsOverlayEl = document.createElement('div');
  visualsOverlayEl.className = 'sas-overlay';
  visualsOverlayEl.id = 'visuals-overlay';

  // Ensure it has a higher z-index to stay above sasOverlay
  visualsOverlayEl.style.zIndex = '4010';

  visualsSheetEl = document.createElement('div');
  visualsSheetEl.className = 'sas-sheet';
  visualsSheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Visuals</div><div class="sas-line" aria-hidden="true"></div>`;

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'sas-settings-container';
  
  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(settingsContainer);

  content.append(header, scroller);
  ensureCustomScrollbar(visualsOverlayEl, visualsSheetEl, '.sas-scroller');

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  visualsSheetEl.append(grabber, content, actions);
  visualsOverlayEl.appendChild(visualsSheetEl);
  document.body.appendChild(visualsOverlayEl);

  // Listeners
  visualsOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  visualsOverlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  visualsOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeVisualsOverlay();
  }, { passive: true });

  setupDragToClose(grabber, visualsSheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeVisualsOverlay(true);
    }, 150);
  });
}

function renderVisuals() {
  if (!visualsOverlayEl) return;
  const container = visualsOverlayEl.querySelector('.sas-settings-container');
  if (!container) return;
  
  container.innerHTML = "";
  // Empty for now as requested
}

export function openVisualsOverlay() {
  buildVisualsOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  renderVisuals();

  if (isOpen) return;
  isOpen = true;

  visualsSheetEl.style.transition = 'none';
  visualsSheetEl.style.transform = 'translateY(100%)';
  visualsOverlayEl.style.pointerEvents = 'auto';

  void visualsSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      visualsSheetEl.style.transition = '';
      visualsSheetEl.style.transform = '';
      visualsOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(visualsOverlayEl, visualsSheetEl, '.sas-scroller');

      const focusable = visualsOverlayEl.querySelector('.sas-close');
      if (focusable) focusable.focus();
    });
  });
}

export function closeVisualsOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = visualsOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (visualsSheetEl) {
    visualsSheetEl.style.transition = '';
    visualsSheetEl.style.transform = '';
  }
  if (visualsOverlayEl) {
    visualsOverlayEl.classList.remove('is-open');
    visualsOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}