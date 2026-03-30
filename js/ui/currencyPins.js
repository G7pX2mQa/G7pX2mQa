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

  // Watch for setting changes to 'currency_{id}_pin'
  // Since settingsManager.subscribe only works if the key exists or is added,
  // we need to subscribe individually or rely on a global settings change event.
  // We'll manually subscribe to all possible currencies.
  Object.values(CURRENCIES).forEach(id => {
    const pinKey = `currency_${id}_pin`;
    settingsManager.subscribe(pinKey, () => refreshPinnedCurrencies());
  });

  // Re-layout on resize
  window.addEventListener('resize', layoutPinnedCurrencies);
  window.addEventListener('orientationchange', layoutPinnedCurrencies);
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
    const isPinned = settingsManager.get(`currency_${id}_pin`);
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

  // Find how many items fit entirely before the HUD
  // Plus 2 items that are allowed to overlap the HUD in the first column
  let N = Math.floor((availableHeight + GAP_Y) / TOTAL_ITEM_H);
  if (N < 0) N = 0; // Edge case if pinned container is below HUD
  
  const firstColCapacity = N + 2;

  // We need the horizontal width for snaking
  // .pinned-currency is 225px wide + 14px left margin
  const ITEM_WIDTH = 225 + 14; 
  const TOTAL_ITEM_W = ITEM_WIDTH + GAP_X;

  children.forEach((el, index) => {
    if (index < firstColCapacity) {
      // First column
      el.style.left = '0px';
      el.style.top = `${index * TOTAL_ITEM_H}px`;
    } else {
      // Snaking horizontally, 2 items per column
      const snakedIndex = index - firstColCapacity;
      const col = Math.floor(snakedIndex / 2) + 1;
      const rowInCol = snakedIndex % 2;

      // They should align vertically with the bottom two items of the first column.
      const baseYIndex = firstColCapacity - 2 + rowInCol;
      const topPx = baseYIndex * TOTAL_ITEM_H;

      el.style.left = `${col * TOTAL_ITEM_W}px`;
      el.style.top = `${topPx}px`;
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
