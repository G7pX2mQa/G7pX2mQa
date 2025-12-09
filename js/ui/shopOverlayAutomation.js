
import { IS_MOBILE } from '../main.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose, playPurchaseSfx } from './shopOverlay.js';
import { getAllAutomationUiModels, buyAutomationUpgrade, onAutomationChanged } from '../game/automationUpgrades.js';
import { CURRENCIES } from '../util/storage.js';

let automationOverlayEl = null;
let automationSheetEl = null;
let automationOpen = false;
let eventsBound = false;
let automationCloseTimer = null;
let __automationPostOpenPointer = false;

function renderAutomationGrid() {
  const grid = automationOverlayEl?.querySelector('#automation-shop-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const models = getAllAutomationUiModels();

  for (const model of models) {
    const btn = document.createElement('button');
    btn.className = 'shop-upgrade';
    btn.type = 'button';
    btn.dataset.upgId = String(model.id);

    const tile = document.createElement('div');
    tile.className = 'shop-tile';

    const baseImg = document.createElement('img');
    baseImg.className = 'base';
    // Use 'gear' base if available, or fallback. existing bases: coin, book, gold, magic.
    // 'gear' base exists? 'img/currencies/gear/gear_base.webp' exists in manifest.
    baseImg.src = 'img/currencies/gear/gear_base.webp';
    baseImg.alt = '';

    const iconImg = document.createElement('img');
    iconImg.className = 'icon';
    iconImg.src = model.icon;
    iconImg.alt = '';

    const badge = document.createElement('span');
    badge.className = 'level-badge';

    const isSingleLevel = model.lvlCap === 1;
    let badgeText = '';
    let isTextBadge = false;

    if (model.isMaxed) {
      if (isSingleLevel) {
        badgeText = 'Owned';
        isTextBadge = true;
      } else {
        badgeText = 'MAXED';
        isTextBadge = true;
      }
    } else {
      if (isSingleLevel) {
        if (model.canAfford) {
          badgeText = 'Purchasable';
        } else {
          badgeText = 'Not Owned';
        }
        isTextBadge = true;
      } else {
        badgeText = `${model.level}`;
      }
    }
    badge.textContent = badgeText;
    if (isTextBadge) badge.classList.add('text-badge');

    if (model.canAfford) badge.classList.add('can-buy');
    if (model.isMaxed) badge.classList.add('is-maxed');

    tile.appendChild(baseImg);
    tile.appendChild(iconImg);
    tile.appendChild(badge);
    btn.appendChild(tile);

    // Title / Cost / Desc tooltip behavior is usually handled by `openUpgradeOverlay` in shopOverlay.js
    // But here we might want a simple "Click to buy" or reuse the fullscreen overlay?
    // The requirement is "match the existing style".
    // Existing shop clicks open a full screen overlay.
    // I should probably implement `openAutomationUpgradeOverlay` or reuse `openUpgradeOverlay`.
    // But `openUpgradeOverlay` in `shopOverlay.js` is tied to `upgrades.js` models/logic.
    // It's easier to implement a direct buy here or a simple confirmation?
    // Given the complexity of the full overlay, for now I'll make clicking BUY directly?
    // Or I should replicate the overlay?
    // "Populate... matching the visual style of the existing Shop upgrades".
    // The requested style is the GRID card.
    // I'll make the card buy on click for simplicity unless requested otherwise.
    // Wait, `shopOverlay.js` says `btn.title = ... Left-click: Details ...`.
    // If I make it buy on click, it's faster.
    // I'll stick to buy on click for efficiency for now, or just add a tooltip.
    
    // Add simple tooltip
    let tooltip = `${model.title}\n${model.desc}\n\n`;
    if (model.isMaxed) {
        tooltip += 'Max Level Reached';
    } else {
        tooltip += `Cost: ${model.costFmt} Gears\n`;
        tooltip += `${model.effect}`;
    }
    btn.title = tooltip;

    btn.addEventListener('click', (e) => {
        if (shouldSkipGhostTap(btn)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (model.isMaxed) return;
        
        if (buyAutomationUpgrade(model.id)) {
            playPurchaseSfx();
            updateAutomationShop(); // Rerender
        }
    });

    grid.appendChild(btn);
  }
}

function updateAutomationShop() {
    if (!automationOpen) return;
    renderAutomationGrid();
}

function ensureAutomationOverlay() {
  if (automationOverlayEl) return;

  automationOverlayEl = document.createElement('div');
  automationOverlayEl.className = 'shop-overlay automation-shop-overlay'; 
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

  const scroller = document.createElement('div');
  scroller.className = 'shop-scroller automation-shop-scroller'; 
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
    
    setupDragToClose(grabber, automationSheetEl, () => automationOpen, () => {
        automationOpen = false;
        automationCloseTimer = setTimeout(() => {
          automationCloseTimer = null;
          closeAutomationShop(true);
        }, 150);
    });
    
    // Listeners
    onAutomationChanged(updateAutomationShop);
    if (typeof window !== 'undefined') {
        window.addEventListener('currency:change', (e) => {
            if (e.detail.key === CURRENCIES.GEARS) {
                updateAutomationShop();
            }
        });
    }
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
  
  updateAutomationShop();

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
