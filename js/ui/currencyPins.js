// js/ui/currencyPins.js

import { settingsManager } from '../game/settingsManager.js';
import { CURRENCIES, getCurrency } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';

let pinnedContainer = null;
let currencySubscriptions = {};
let settingsSubscriptions = {};

export function initPinnedCurrencies(parentEl) {
  if (pinnedContainer) return;

  pinnedContainer = document.createElement('div');
  pinnedContainer.className = 'pinned-currencies';
  pinnedContainer.id = 'pinned-currencies';
  
  parentEl.appendChild(pinnedContainer);

  // Subscribe to UI visibility
  settingsManager.subscribe('user_interface', updateVisibility);
  updateVisibility(settingsManager.get('user_interface'));

  // Initial render
  refreshPinnedCurrencies();

  // Watch for setting changes to 'currency_{id}_pinned'
  // Since settingsManager.subscribe only works if the key exists or is added,
  // we need to subscribe individually or rely on a global settings change event.
  // We'll manually subscribe to all possible currencies.
  Object.values(CURRENCIES).forEach(id => {
    const pinKey = `currency_${id}_pinned`;
    settingsManager.subscribe(pinKey, () => refreshPinnedCurrencies());
  });

  // Re-layout on resize
  window.addEventListener('resize', layoutPinnedCurrencies);
  window.addEventListener('orientationchange', layoutPinnedCurrencies);
  
  // Re-layout when game area becomes visible
  window.addEventListener('menu:visibilitychange', (e) => {
    if (e.detail && !e.detail.visible) {
      // The menu is hidden, which means the game area is now visible.
      // Wait for the next frame to ensure the DOM has updated and layout is calculated.
      requestAnimationFrame(() => {
        layoutPinnedCurrencies();
      });
    }
  });
}

function updateVisibility(isVisible) {
  if (pinnedContainer) {
    if (isVisible === false) {
      pinnedContainer.style.display = 'none';
    } else {
      pinnedContainer.style.display = 'block';
    }
  }
}

export function refreshPinnedCurrencies() {
  if (!pinnedContainer) return;

  pinnedContainer.innerHTML = '';
  
  // Clear old currency subscriptions
  Object.values(currencySubscriptions).forEach(unsub => unsub());
  currencySubscriptions = {};

  const pinnedIds = [];
  Object.values(CURRENCIES).forEach(id => {
    const isPinned = settingsManager.get(`currency_${id}_pinned`);
    if (isPinned) {
      pinnedIds.push(id);
    }
  });

  pinnedIds.forEach(id => {
    const el = document.createElement('div');
    el.className = 'pinned-currency-wrapper'; // changed wrapper class
    el.id = `pinned-currency-${id}`;

    const bar = document.createElement('div');
    bar.className = 'pinned-currency';
    bar.dataset.currency = id; // Add data-currency attribute for shared CSS gradients

    const icon = document.createElement('img');
    icon.className = 'pinned-currency-icon';
    // Map ID to icon filename. Many are id_plus_base.webp
    // Some IDs have an 's' at the end (books, gears, waves) but the image files are singular
    const iconBaseName = id.endsWith('s') ? id.slice(0, -1) : id;
    icon.src = `img/currencies/${iconBaseName}/${iconBaseName}_plus_base.webp`;
    icon.onerror = () => {
      icon.src = 'img/currencies/coin/coin_plus_base.webp'; // fallback
    };
    
    const textSpan = document.createElement('span');
    textSpan.className = 'pinned-currency-value';
    
    bar.appendChild(icon);
    bar.appendChild(textSpan);
    el.appendChild(bar);
    pinnedContainer.appendChild(el);

    // Update value and subscribe to changes
    const updateVal = () => {
      const amount = getCurrency(id);
      textSpan.textContent = formatNumber(amount);
    };
    
    updateVal();

    // Setup listener. The game uses window event 'currency:change'
    const handleEvent = (e) => {
      if (e.detail && e.detail.key === id) {
        updateVal();
      }
    };
    window.addEventListener('currency:change', handleEvent);
    currencySubscriptions[id] = () => window.removeEventListener('currency:change', handleEvent);
  });

  layoutPinnedCurrencies();
}

export function layoutPinnedCurrencies() {
  if (!pinnedContainer) return;

  const children = Array.from(pinnedContainer.querySelectorAll('.pinned-currency-wrapper'));
  if (children.length === 0) return;

  const hudBottom = document.querySelector('.hud-bottom');
  if (!hudBottom) {
    // If hud-bottom doesn't exist, just stack them vertically
    children.forEach((el, index) => {
      el.style.left = '0px';
      el.style.top = `${index * (28 + 8)}px`; // 28px height + 8px gap
    });
    return;
  }

  const pinnedRect = pinnedContainer.getBoundingClientRect();
  const hudRect = hudBottom.getBoundingClientRect();

  // Available vertical space from top of pinned container to top of hud-bottom
  const availableHeight = hudRect.top - pinnedRect.top;

  const ITEM_HEIGHT = 28;
  const GAP_Y = 8;
  const GAP_X = 8;
  const TOTAL_ITEM_H = ITEM_HEIGHT + GAP_Y;

  // We need the horizontal width for snaking
  // .pinned-currency is 150px wide + 14px left margin
  const ITEM_WIDTH = 150 + 14; 
  const TOTAL_ITEM_W = ITEM_WIDTH + GAP_X;

  // Find how many items fit entirely before the HUD
  let itemsAboveHud = Math.floor((availableHeight + GAP_Y) / TOTAL_ITEM_H);
  if (itemsAboveHud < 0) itemsAboveHud = 0; // Edge case if pinned container is below HUD
  
  // Calculate the vertical offset to start overlapping items so they fall entirely inside the HUD.
  // We align the first overlapping item either at its natural spacing if it already falls
  // exactly on the HUD line, or we push it down exactly to the HUD's top offset.
  const hudTopOffset = availableHeight;
  const firstOverlappingTopPx = Math.max(itemsAboveHud * TOTAL_ITEM_H, hudTopOffset);

  // Determine how many items comfortably fit vertically within the HUD's height
  let itemsInsideHud = Math.floor((hudRect.height + GAP_Y) / TOTAL_ITEM_H);
  if (itemsInsideHud < 1) itemsInsideHud = 1; // Fallback to at least 1 item to prevent divide-by-zero or empty columns

  const firstColCapacity = itemsAboveHud + itemsInsideHud;

  children.forEach((el, index) => {
    if (index < itemsAboveHud) {
      // First column, above the HUD
      el.style.left = '0px';
      el.style.top = `${index * TOTAL_ITEM_H}px`;
    } else if (index < firstColCapacity) {
      // First column, overlapping the HUD
      const rowInHud = index - itemsAboveHud;
      el.style.left = '0px';
      el.style.top = `${firstOverlappingTopPx + (rowInHud * TOTAL_ITEM_H)}px`;
    } else {
      // Snaking horizontally inside the HUD bounds
      const snakedIndex = index - firstColCapacity;
      const col = Math.floor(snakedIndex / itemsInsideHud) + 1;
      const rowInHud = snakedIndex % itemsInsideHud;

      el.style.left = `${col * TOTAL_ITEM_W}px`;
      el.style.top = `${firstOverlappingTopPx + (rowInHud * TOTAL_ITEM_H)}px`;
    }
  });
}

// Ensure values are updated if there's no event dispatching by polling
// Alternatively, we could hook into the game loop
setInterval(() => {
  if (pinnedContainer && pinnedContainer.style.display !== 'none') {
    refreshPinnedCurrenciesValues();
  }
}, 100);

function refreshPinnedCurrenciesValues() {
  if (!pinnedContainer) return;
  const children = pinnedContainer.querySelectorAll('.pinned-currency-wrapper');
  children.forEach(el => {
    const id = el.id.replace('pinned-currency-', '');
    const span = el.querySelector('.pinned-currency-value');
    if (span) {
      span.textContent = formatNumber(getCurrency(id));
    }
  });
}
