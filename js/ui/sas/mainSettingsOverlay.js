// js/ui/sas/mainSettingsOverlay.js

import { IS_MOBILE } from '../../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from '../shopOverlay.js';
import { suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { settingsManager, SETTING_DEFINITIONS } from '../../game/settingsManager.js';

let mainSettingsOverlayEl = null;
let mainSettingsSheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

// Store unsubscribe functions for settings so they can be cleaned up
const unsubscribers = [];

function buildMainSettingsOverlay() {
  if (mainSettingsOverlayEl) return;

  mainSettingsOverlayEl = document.createElement('div');
  mainSettingsOverlayEl.className = 'sas-overlay';
  mainSettingsOverlayEl.id = 'main-settings-overlay';

  // Ensure it has a higher z-index to stay above sasOverlay
  mainSettingsOverlayEl.style.zIndex = '4010';

  mainSettingsSheetEl = document.createElement('div');
  mainSettingsSheetEl.className = 'sas-sheet';
  mainSettingsSheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Main Settings</div><div class="sas-line" aria-hidden="true"></div>`;

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'main-settings-container';

  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(settingsContainer);

  content.append(header, scroller);
  ensureCustomScrollbar(mainSettingsOverlayEl, mainSettingsSheetEl, '.sas-scroller');

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  mainSettingsSheetEl.append(grabber, content, actions);
  mainSettingsOverlayEl.appendChild(mainSettingsSheetEl);
  document.body.appendChild(mainSettingsOverlayEl);

  // Listeners
  mainSettingsOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  mainSettingsOverlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  mainSettingsOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeMainSettingsOverlay();
  }, { passive: true });

  setupDragToClose(grabber, mainSettingsSheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeMainSettingsOverlay(true);
    }, 150);
  });
}

function renderSettings() {
  if (!mainSettingsOverlayEl) return;
  const container = mainSettingsOverlayEl.querySelector('.main-settings-container');
  if (!container) return;

  container.innerHTML = '';
  // Cleanup old listeners
  while (unsubscribers.length > 0) {
    unsubscribers.pop()();
  }

  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    const row = document.createElement('div');
    row.className = 'setting-row';

    const desc = document.createElement('div');
    desc.className = 'setting-description';
    desc.textContent = def.label;

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'setting-toggle';
    
    // We create a custom toggle switch
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'setting-toggle-input';
    toggleInput.id = `setting_toggle_${key}`;
    toggleInput.checked = settingsManager.get(key);

    const toggleLabel = document.createElement('label');
    toggleLabel.htmlFor = `setting_toggle_${key}`;
    toggleLabel.className = 'setting-toggle-label';

    toggleInput.addEventListener('change', (e) => {
      settingsManager.set(key, e.target.checked);
    });

    // Optionally update input if setting changes from elsewhere while open
    const unsub = settingsManager.subscribe(key, (newVal) => {
      toggleInput.checked = newVal;
    });
    unsubscribers.push(unsub);

    toggleContainer.append(toggleInput, toggleLabel);
    row.append(toggleContainer, desc);
    container.appendChild(row);
  }
}

export function openMainSettingsOverlay() {
  buildMainSettingsOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  
  renderSettings();

  if (isOpen) return;
  isOpen = true;

  mainSettingsSheetEl.style.transition = 'none';
  mainSettingsSheetEl.style.transform = 'translateY(100%)';
  mainSettingsOverlayEl.style.pointerEvents = 'auto';

  void mainSettingsSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mainSettingsSheetEl.style.transition = '';
      mainSettingsSheetEl.style.transform = '';
      mainSettingsOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(mainSettingsOverlayEl, mainSettingsSheetEl, '.sas-scroller');
    });
  });
}

export function closeMainSettingsOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = mainSettingsOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (mainSettingsSheetEl) {
    mainSettingsSheetEl.style.transition = '';
    mainSettingsSheetEl.style.transform = '';
  }
  if (mainSettingsOverlayEl) {
    mainSettingsOverlayEl.classList.remove('is-open');
    mainSettingsOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}