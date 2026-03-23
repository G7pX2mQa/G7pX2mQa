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
    const row = document.createElement("div");
    row.className = "setting-row";

    const desc = document.createElement("div");
    desc.className = "setting-description";
    
    if (def.type === "toggle") {
      const labelSpan = document.createElement("span");
      // Use span instead of label so clicks on the empty space don't naturally trigger it.
      // We will handle the span click manually via event listener on the row.
      labelSpan.textContent = def.label;
      labelSpan.style.cursor = "pointer";
      labelSpan.className = "setting-text-label";
      // This prevents the label from expanding to fill the rest of the flex container
      labelSpan.style.flex = "0 1 auto";
      // Explicitly set width to fit-content to be safe
      labelSpan.style.width = "max-content";
      
      desc.appendChild(labelSpan);
    } else {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = def.label;
      desc.appendChild(labelSpan);
    }

    if (def.hasExtraInfo && def.info) {
      const infoIcon = document.createElement("span");
      infoIcon.className = "setting-info-icon";
      const infoIconImg = document.createElement("img");
      infoIconImg.src = "img/misc/i.webp";
      infoIconImg.style.width = "1.2em";
      infoIconImg.style.height = "1.2em";
      infoIconImg.style.display = "block";
      infoIconImg.style.borderRadius = "50%";
      infoIcon.appendChild(infoIconImg);
      
      const infoTooltip = document.createElement("div");
      infoTooltip.className = "setting-info-tooltip";
      infoTooltip.textContent = def.info;
      
      infoIcon.appendChild(infoTooltip);
      desc.appendChild(infoIcon);
    }

    if (def.type === "toggle") {
      const toggleContainer = document.createElement("div");
      toggleContainer.className = "setting-toggle";
      
      // We create a custom toggle switch
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.className = "setting-toggle-input";
      toggleInput.id = `setting_toggle_${key}`;
      toggleInput.checked = settingsManager.get(key);

      const toggleLabel = document.createElement("label");
      toggleLabel.htmlFor = `setting_toggle_${key}`;
      toggleLabel.className = "setting-toggle-label";

      toggleInput.addEventListener("change", (e) => {
        settingsManager.set(key, e.target.checked);
      });

      // Optionally update input if setting changes from elsewhere while open
      const unsub = settingsManager.subscribe(key, (newVal) => {
        toggleInput.checked = newVal;
      });
      unsubscribers.push(unsub);

      toggleContainer.append(toggleInput, toggleLabel);
      const clickGap = document.createElement("div");
      clickGap.className = "setting-click-gap";
      row.append(toggleContainer, clickGap, desc);

      row.style.cursor = 'default';
      desc.style.cursor = 'default';
      row.addEventListener('click', (e) => {
        // Only allow clicking the actual row element (the gap) or the specific text label.
        // Clicks strictly on `desc` will be ignored.
        if (e.target === clickGap || e.target.classList.contains('setting-text-label')) {
          toggleInput.click();
        }
      });
    } else {
      row.append(desc);
    }
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
