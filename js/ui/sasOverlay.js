// js/ui/sasOverlay.js

import { IS_MOBILE } from '../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from './shopOverlay.js';
import { suppressNextGhostTap } from '../util/ghostTapGuard.js';

let sasOverlayEl = null;
let sasSheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

function buildSasOverlay() {
  if (sasOverlayEl) return;

  sasOverlayEl = document.createElement('div');
  sasOverlayEl.className = 'sas-overlay';
  sasOverlayEl.id = 'sas-overlay';

  sasSheetEl = document.createElement('div');
  sasSheetEl.className = 'sas-sheet';
  sasSheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Stats & Settings</div><div class="sas-line" aria-hidden="true"></div>`;

  const grid = document.createElement('div');
  grid.className = 'sas-grid';
  grid.setAttribute('role', 'grid');

  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(grid);

  content.append(header, scroller);
  ensureCustomScrollbar(sasOverlayEl, sasSheetEl, '.sas-scroller');

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  sasSheetEl.append(grabber, content, actions);
  sasOverlayEl.appendChild(sasSheetEl);
  document.body.appendChild(sasOverlayEl);

  // Listeners
  sasOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  sasOverlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  sasOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeSasOverlay();
  }, { passive: true });

  setupDragToClose(grabber, sasSheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeSasOverlay(true);
    }, 150);
  });
}

function generateRandomButtons() {
  if (!sasOverlayEl) return;
  const grid = sasOverlayEl.querySelector('.sas-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const numButtons = Math.floor(Math.random() * 12) + 1; // 1 to 12

  for (let i = 0; i < numButtons; i++) {
    const btn = document.createElement('button');
    btn.className = 'sas-btn';
    btn.textContent = `Button ${i + 1}`;
    grid.appendChild(btn);
  }
}

export function openSasOverlay() {
  buildSasOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  
  generateRandomButtons();

  if (isOpen) return;
  isOpen = true;

  sasSheetEl.style.transition = 'none';
  sasSheetEl.style.transform = 'translateY(100%)';
  sasOverlayEl.style.pointerEvents = 'auto';

  void sasSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sasSheetEl.style.transition = '';
      sasSheetEl.style.transform = '';
      sasOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(sasOverlayEl, sasSheetEl, '.sas-scroller');

      const focusable = sasOverlayEl.querySelector('.sas-btn') || sasOverlayEl.querySelector('.sas-grid');
      if (focusable) focusable.focus();
    });
  });
}

export function closeSasOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = sasOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (sasSheetEl) {
    sasSheetEl.style.transition = '';
    sasSheetEl.style.transform = '';
  }
  if (sasOverlayEl) {
    sasOverlayEl.classList.remove('is-open');
    sasOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}