import { IS_MOBILE } from '../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from './shopOverlay.js';
import { suppressNextGhostTap } from '../util/ghostTapGuard.js';

const HELP_ENTRIES = [
  {
    id: 'basics',
    title: 'Basics',
    heading: 'How to Play',
    content: 'Click the coins to collect them. Once you have enough coins, you can buy upgrades in the shop to collect coins automatically or increase your clicking power.'
  },
  {
    id: 'upgrades',
    title: 'Upgrades',
    heading: 'Understanding Upgrades',
    content: 'Upgrades increase your coin production. Some upgrades affect your active clicks, while others increase your passive income over time.'
  },
  {
    id: 'prestige',
    title: 'Prestige',
    heading: 'Resetting for Power',
    content: 'Once you reach a certain point, you can reset your progress to earn special currencies. These currencies can be used to purchase powerful permanent upgrades.'
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

  const currentEntry = HELP_ENTRIES.find(e => e.id === currentEntryId);

  // Build Sidebar
  let sidebarHtml = '<aside class="help-sidebar">';
  HELP_ENTRIES.forEach(entry => {
    const isActive = entry.id === currentEntryId ? 'is-active' : '';
    sidebarHtml += `<button type="button" class="help-layer ${isActive}" data-help-id="${entry.id}">
      <img src="img/misc/forge.webp" alt="">
      <span>${entry.title}</span>
    </button>`;
  });
  sidebarHtml += '</aside>';

  // Build Content
  const contentHtml = `
    <div class="help-content-area">
      <div class="help-card">
        <h3>${currentEntry.heading}</h3>
        <p>${currentEntry.content}</p>
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
      const id = btn.getAttribute('data-help-id');
      if (id && id !== currentEntryId) {
        currentEntryId = id;
        renderHelpContent(); // Re-render content
      }
    });
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
