
import { IS_MOBILE } from '../main.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose, playPurchaseSfx } from './shopOverlay.js';
import { getAllAutomationUiModels, buyAutomationUpgrade, onAutomationChanged, getAutomationUiModel } from '../game/automationUpgrades.js';
import { CURRENCIES } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';

let automationOverlayEl = null;
let automationSheetEl = null;
let automationOpen = false;
let eventsBound = false;
let automationCloseTimer = null;
let __automationPostOpenPointer = false;

// --- Details Overlay State ---
let detailsOverlayEl = null;
let detailsSheetEl = null;
let detailsOpen = false;
let currentDetailsId = null;

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

    btn.title = model.isMaxed ? 'Max Level Reached' : 'Click for details';

    btn.addEventListener('click', (e) => {
        if (shouldSkipGhostTap(btn)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        openAutomationDetails(model.id);
    });

    grid.appendChild(btn);
  }
}

function updateAutomationShop() {
    if (automationOpen) renderAutomationGrid();
    if (detailsOpen && currentDetailsId != null) renderDetailsOverlay();
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

// ---------------- Details Overlay Implementation ----------------

function ensureDetailsOverlay() {
  if (detailsOverlayEl) return;
  
  detailsOverlayEl = document.createElement('div');
  detailsOverlayEl.className = 'upg-overlay'; // Reuse existing class for consistent styling
  
  detailsSheetEl = document.createElement('div');
  detailsSheetEl.className = 'upg-sheet';
  detailsSheetEl.setAttribute('role', 'dialog');
  detailsSheetEl.setAttribute('aria-modal', 'false');
  detailsSheetEl.setAttribute('aria-label', 'Upgrade Details');

  const grab = document.createElement('div');
  grab.className = 'upg-grabber';
  grab.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const header = document.createElement('header');
  header.className = 'upg-header';

  const content = document.createElement('div');
  content.className = 'upg-content';

  const actions = document.createElement('div');
  actions.className = 'upg-actions';

  detailsSheetEl.append(grab, header, content, actions);
  detailsOverlayEl.appendChild(detailsSheetEl);
  document.body.appendChild(detailsOverlayEl);

  detailsOverlayEl.addEventListener('pointerdown', (e) => {
    if (!IS_MOBILE) return;
    if (e.pointerType === 'mouse') return;
    if (e.target === detailsOverlayEl) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  detailsOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (e.target === detailsOverlayEl) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  setupDragToClose(grab, detailsSheetEl, () => detailsOpen, () => {
      detailsOpen = false;
      setTimeout(() => {
          closeDetailsOverlay();
      }, 150);
  });
}

function renderDetailsOverlay() {
  if (!detailsOpen || currentDetailsId == null) return;
  const model = getAutomationUiModel(currentDetailsId);
  if (!model) {
      closeDetailsOverlay();
      return;
  }

  const header = detailsSheetEl.querySelector('.upg-header');
  header.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'upg-title';
  title.textContent = model.title;

  const level = document.createElement('div');
  level.className = 'upg-level';
  if (model.isMaxed) {
      level.textContent = `Level ${model.level} / ${model.lvlCap} (MAXED)`;
      detailsSheetEl.classList.add('is-maxed');
  } else {
      level.textContent = `Level ${model.level} / ${model.lvlCap}`;
      detailsSheetEl.classList.remove('is-maxed');
  }
  header.append(title, level);

  const content = detailsSheetEl.querySelector('.upg-content');
  content.innerHTML = '';
  content.scrollTop = 0;

  const desc = document.createElement('div');
  desc.className = 'upg-desc centered';
  desc.textContent = model.desc || '';
  content.appendChild(desc);

  const info = document.createElement('div');
  info.className = 'upg-info';

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.height = '12px';
  info.appendChild(spacer);

  if (model.effect) {
      const line = document.createElement('div');
      line.className = 'upg-line';
      line.innerHTML = `<span class="bonus-line">${model.effect}</span>`;
      info.appendChild(line);
      
      const spacer2 = document.createElement('div');
      spacer2.style.height = '12px';
      info.appendChild(spacer2);
  }

  if (!model.isMaxed) {
      const costs = document.createElement('div');
      costs.className = 'upg-costs';
      const iconHTML = `<img alt="" src="img/currencies/gear/gear.webp" class="currency-ico">`;
      
      const lineCost = document.createElement('div');
      lineCost.className = 'upg-line';
      lineCost.innerHTML = `Cost: ${iconHTML} ${model.costFmt}`;
      costs.appendChild(lineCost);
      
      const lineHave = document.createElement('div');
      lineHave.className = 'upg-line';
      lineHave.innerHTML = `You have: ${iconHTML} ${formatNumber(model.have)}`;
      costs.appendChild(lineHave);

      info.appendChild(costs);
  }

  content.appendChild(info);

  const actions = detailsSheetEl.querySelector('.upg-actions');
  actions.innerHTML = '';
  
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shop-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeDetailsOverlay());
  actions.appendChild(closeBtn);

  if (!model.isMaxed) {
      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'shop-delve btn-buy-one';
      buyBtn.textContent = 'Buy';
      buyBtn.disabled = !model.canAfford;
      
      buyBtn.addEventListener('click', () => {
          if (buyAutomationUpgrade(model.id)) {
             playPurchaseSfx();
             renderDetailsOverlay();
             // Also update parent shop
             renderAutomationGrid();
          }
      });
      
      actions.appendChild(buyBtn);
  }
}

export function openAutomationDetails(id) {
  ensureDetailsOverlay();
  currentDetailsId = id;
  detailsOpen = true;

  renderDetailsOverlay();
  
  detailsOverlayEl.classList.add('is-open');
  detailsOverlayEl.style.pointerEvents = 'auto';
  blockInteraction(140);
  detailsSheetEl.style.transition = 'none';
  detailsSheetEl.style.transform = 'translateY(100%)';
  void detailsSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    detailsSheetEl.style.transition = '';
    detailsSheetEl.style.transform = '';
  });
}

function closeDetailsOverlay() {
  if (IS_MOBILE) {
    try { blockInteraction(160); } catch {}
  }

  detailsOpen = false;
  currentDetailsId = null;
  if (!detailsOverlayEl || !detailsSheetEl) return;
  
  detailsSheetEl.style.transition = '';
  detailsSheetEl.style.transform = '';
  detailsOverlayEl.classList.remove('is-open');
  detailsOverlayEl.style.pointerEvents = 'none';
}
