import { IS_MOBILE } from '../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from './shopOverlay.js';
import { suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { getResearchNodeLevel } from '../game/labNodes.js';
import { getFlowUnlockState } from './merchantTabs/flowTab.js';

const HELP_ENTRIES = [
  {
    id: 1,
    title: "Intro",
    icon: "img/currencies/coin/coin.webp",
    tldr: "Placeholder TLDR for Intro.",
    text: "Placeholder text for Intro.",
    themeClass: "is-intro",
    isVisible: () => true // Always unlocked
  },
  {
    id: 2,
    title: "Forge",
    icon: "img/misc/forge.webp",
    tldr: "Placeholder TLDR for Forge.",
    text: "Placeholder text for Forge.",
    themeClass: "is-forge",
    isVisible: () => {
        try {
            const override = window.resetSystem?.getForgeDebugOverrideState?.();
            if (override != null) return override;
        } catch {}
        try { return !!window.resetSystem?.isForgeUnlocked?.(); }
        catch { return false; }
    }
  },
  {
    id: 3,
    title: "Infuse",
    icon: "img/misc/infuse.webp",
    tldr: "Placeholder TLDR for Infuse.",
    text: "Placeholder text for Infuse.",
    themeClass: "is-infuse",
    isVisible: () => {
        try {
            const override = window.resetSystem?.getInfuseDebugOverrideState?.();
            if (override != null) return override;
        } catch {}
        try { return !!window.resetSystem?.isInfuseUnlocked?.(); }
        catch { return false; }
    }
  },
  {
    id: 4,
    title: "Surge",
    icon: "img/misc/surge.webp",
    tldr: "Placeholder TLDR for Surge.",
    text: "Placeholder text for Surge.",
    themeClass: "is-surge",
    isVisible: () => {
        try {
            const override = window.resetSystem?.getSurgeDebugOverrideState?.();
            if (override != null) return override;
        } catch {}
        try { return !!window.resetSystem?.isSurgeUnlocked?.(); }
        catch { return false; }
    }
  },
  {
    id: 5,
    title: "Experiment",
    icon: "img/misc/experiment.webp",
    tldr: "Placeholder TLDR for Experiment.",
    text: "Placeholder text for Experiment.",
    themeClass: "is-experiment",
    isVisible: () => {
        try { return getResearchNodeLevel(4) >= 1; }
        catch { return false; }
    }
  },
  {
    id: 6,
    title: "Flow",
    icon: "img/stats/fp/fp.webp",
    tldr: "Placeholder TLDR for Flow.",
    text: "Placeholder text for Flow.",
    themeClass: "is-flow",
    isVisible: () => {
        try { return !!getFlowUnlockState(); }
        catch { return false; }
    }
  }
];


let currentEntryId = HELP_ENTRIES[0].id;

let overlayEl = null;
let sheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

function buildOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'sas-overlay';
  overlayEl.id = 'help-overlay';
  overlayEl.style.zIndex = '4015';

  sheetEl = document.createElement('div');
  sheetEl.className = 'sas-sheet';
  sheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Help</div><div class="sas-line" aria-hidden="true"></div>`;

  const container = document.createElement('div');
  container.className = 'help-container';

  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(container);

  content.append(header, scroller);

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  sheetEl.append(grabber, content, actions);
  overlayEl.appendChild(sheetEl);
  document.body.appendChild(overlayEl);

  ensureCustomScrollbar(overlayEl, sheetEl, '.sas-scroller');

  // Listeners
  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  overlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  overlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeHelpOverlay();
  }, { passive: true });

  setupDragToClose(grabber, sheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeHelpOverlay(true);
    }, 150);
  });
}

function renderHelpContent() {
  if (!overlayEl) return;
  const container = overlayEl.querySelector('.help-container');
  if (!container) return;

  // Filter entries to only show visible ones
  const visibleEntries = HELP_ENTRIES.filter(e => e.isVisible());
  
  // If current entry is no longer visible, reset to Intro (which is always visible)
  if (!visibleEntries.find(e => e.id === currentEntryId)) {
    currentEntryId = 1;
  }

  const currentEntry = HELP_ENTRIES.find(e => e.id === currentEntryId) || HELP_ENTRIES[0];

  // Build Sidebar
  let sidebarHtml = '<aside class="help-sidebar">';
  visibleEntries.forEach(entry => {
    const isActive = entry.id === currentEntryId ? 'is-active' : '';
    // map id to class string
    const classMap = {1: 'is-intro', 2: 'is-forge', 3: 'is-infuse', 4: 'is-surge', 5: 'is-experiment', 6: 'is-flow'};
    const themeClass = classMap[entry.id];
    sidebarHtml += `<button type="button" class="help-layer ${isActive} ${themeClass}" data-help-id="${entry.id}">
      <img src="${entry.icon}" alt="">
      <span>${entry.title}</span>
    </button>`;
  });
  sidebarHtml += '</aside>';

  // Build Content
  const classMap = {1: 'is-intro', 2: 'is-forge', 3: 'is-infuse', 4: 'is-surge', 5: 'is-experiment', 6: 'is-flow'};
  const currentThemeClass = classMap[currentEntry.id];
  
  let paragraphContent = '';
  if (currentEntry.tldr) {
    paragraphContent = `<strong>TLDR: ${currentEntry.tldr}</strong><br>${currentEntry.text}`;
  } else {
    paragraphContent = currentEntry.text;
  }
  
  const contentHtml = `
    <div class="help-content-area">
      <div class="help-card ${currentThemeClass}">
        <h3>${currentEntry.title}</h3>
        <p>${paragraphContent}</p>
        <h3 style="visibility:hidden">${currentEntry.title}</h3>
      </div>
    </div>
  `;

  // Build Spacer (Right side empty column)
  const spacerHtml = '<div class="help-spacer"></div>';

  container.innerHTML = sidebarHtml + contentHtml + spacerHtml;

  // Add event listeners to sidebar buttons
  const buttons = container.querySelectorAll('.help-layer');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-help-id'), 10);
      if (id && id !== currentEntryId) {
        currentEntryId = id;
        renderHelpContent(); // Re-render content
      }
    });
  });
}

export function updateHelpOverlay() {
  if (isOpen) {
    renderHelpContent();
  }
}

if (typeof window !== 'undefined') {
  window.helpSystem = window.helpSystem || {};
  window.helpSystem.updateHelpOverlay = updateHelpOverlay;
  
  window.addEventListener('lab:node:change', () => {
    updateHelpOverlay();
  });
  window.addEventListener('unlock:change', () => {
    updateHelpOverlay();
  });
}

export function openHelpOverlay() {
  buildOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  renderHelpContent();

  if (isOpen) return;
  isOpen = true;

  sheetEl.style.transition = 'none';
  sheetEl.style.transform = 'translateY(100%)';
  overlayEl.style.pointerEvents = 'auto';

  void sheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sheetEl.style.transition = '';
      sheetEl.style.transform = '';
      overlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(overlayEl, sheetEl, '.sas-scroller');
    });
  });
}

export function closeHelpOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = overlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (sheetEl) {
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
  }
  if (overlayEl) {
    overlayEl.classList.remove('is-open');
    overlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}
