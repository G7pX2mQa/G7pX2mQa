// js/ui/currencyAndLevelPins.js

import { settingsManager } from '../game/settingsManager.js';
import { CURRENCIES, getCurrency } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../game/offlinePanel.js';


import { bank } from '../util/storage.js';

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

  // Re-render pins when save slot changes
  window.addEventListener('saveSlot:change', refreshPinnedCurrencies);
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

    const currencyConfig = RESOURCE_REGISTRY.find(c => c.key === id);
    if (currencyConfig && currencyConfig.bgGradient) {
      bar.style.setProperty('background', currencyConfig.bgGradient, 'important');
    }

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
      textSpan.innerHTML = formatNumber(amount);
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
      span.innerHTML = formatNumber(getCurrency(id));
    }
  });
}

// --- LEVEL PINS ---

let pinnedLevelsContainer = null;
let levelSubscriptions = {};

const levelStateCache = {};
window.addEventListener("level:change", (e) => {
    if (e.detail && e.detail.prefix) {
        levelStateCache[e.detail.prefix] = e.detail;
    }
});

function getLevelStatValue(prefix) {
    return levelStateCache[prefix]?.level || 0;
}

function getLevelProgRatio(prefix) {
    return levelStateCache[prefix]?.ratio || 0;
}
export function initPinnedLevels(parentEl) {
  if (pinnedLevelsContainer) return;

  pinnedLevelsContainer = document.createElement('div');
  pinnedLevelsContainer.className = 'pinned-levels';
  pinnedLevelsContainer.id = 'pinned-levels';
  
  parentEl.appendChild(pinnedLevelsContainer);

  settingsManager.subscribe('user_interface', updateLevelsVisibility);
  updateLevelsVisibility(settingsManager.get('user_interface'));

  refreshPinnedLevels();

  const levelConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelStat');
  levelConfigs.forEach(levelConfig => {
    const prefix = levelConfig.key.replace('_levels', '');
    const pinKey = `level_${prefix}_pinned`;
    settingsManager.subscribe(pinKey, () => refreshPinnedLevels());
  });

  window.addEventListener('resize', layoutPinnedLevels);
  window.addEventListener('orientationchange', layoutPinnedLevels);
  window.addEventListener('menu:visibilitychange', (e) => {
    if (e.detail && !e.detail.visible) {
      requestAnimationFrame(() => {
        layoutPinnedLevels();
      });
    }
  });
  window.addEventListener('levels:pinsChanged', refreshPinnedLevels);

  // Re-render pins when save slot changes
  window.addEventListener('saveSlot:change', refreshPinnedLevels);
}

function updateLevelsVisibility(isVisible) {
  if (pinnedLevelsContainer) {
    if (isVisible === false) {
      pinnedLevelsContainer.style.display = 'none';
    } else {
      pinnedLevelsContainer.style.display = 'block';
    }
  }
}

export function refreshPinnedLevels() {
  if (!pinnedLevelsContainer) return;

  pinnedLevelsContainer.innerHTML = '';
  
  Object.values(levelSubscriptions).forEach(unsub => unsub());
  levelSubscriptions = {};

  const levelConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelStat');
  const pinnedPrefixes = [];
  
  levelConfigs.forEach(levelConfig => {
    const prefix = levelConfig.key.replace('_levels', '');
    const isPinned = settingsManager.get(`level_${prefix}_pinned`);
    if (isPinned) {
      pinnedPrefixes.push({ prefix, levelConfig });
    }
  });

  pinnedPrefixes.forEach(({ prefix, levelConfig }) => {
    const el = document.createElement('div');
    el.className = 'pinned-level-wrapper';
    el.id = `pinned-level-${prefix}`;

    const bar = document.createElement('div');
    bar.className = 'pinned-level';
    bar.dataset.level = prefix; 

    const icon = document.createElement('img');
    icon.className = 'pinned-level-icon';
    
    let iconSrc = levelConfig.icon || 'img/misc/mysterious.webp';
    if (iconSrc && iconSrc.endsWith('.webp')) {
      const parts = iconSrc.split('/');
      const filename = parts.pop();
      const baseName = filename.replace('.webp', '');
      iconSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
    }
    icon.src = iconSrc;
    icon.onerror = () => {
      icon.src = 'img/misc/mysterious.webp';
    };
    
    const textSpan = document.createElement('span');
    textSpan.className = 'pinned-level-value';
    
    const fill = document.createElement('div');
    fill.className = 'pinned-level-fill';
    bar.appendChild(fill);
    bar.appendChild(icon);
    bar.appendChild(textSpan);
    el.appendChild(bar);
    pinnedLevelsContainer.appendChild(el);

    const progConfig = RESOURCE_REGISTRY.find(c => c.key === prefix);
    if (progConfig) {
      if (progConfig.pinBgGradient) bar.style.setProperty('--pinned-bg', progConfig.pinBgGradient);
      if (progConfig.borderColor) bar.style.setProperty('--pinned-border-color', progConfig.borderColor);
      if (progConfig.barOutline) bar.style.setProperty('--pinned-border-w', progConfig.barOutline);
      if (progConfig.barBoxShadow) bar.style.setProperty('--pinned-box-shadow', progConfig.barBoxShadow);
      
      if (progConfig.fillGradient) fill.style.setProperty('--pinned-fill', progConfig.fillGradient);
      if (progConfig.glassBg) fill.style.setProperty('--pinned-glass-bg', progConfig.glassBg);
      if (progConfig.glassOpacity) fill.style.setProperty('--pinned-glass-opacity', progConfig.glassOpacity);
    }

    const updateValAndProg = () => {
      const amount = getLevelStatValue(prefix);
      textSpan.innerHTML = formatNumber(amount);
      const ratio = getLevelProgRatio(prefix);
      fill.style.setProperty('--progress', `${(ratio * 100).toFixed(2)}%`);
    };
    
    updateValAndProg();

    const handleEvent = () => updateValAndProg();
    
    const genericHandleEvent = (e) => {
        if (e.detail && e.detail.prefix === prefix) {
            updateValAndProg();
        }
    };
    window.addEventListener("level:change", genericHandleEvent);
    levelSubscriptions[prefix] = () => window.removeEventListener("level:change", genericHandleEvent);
  });

  layoutPinnedLevels();
}

export function layoutPinnedLevels() {
  if (!pinnedLevelsContainer) return;

  const children = Array.from(pinnedLevelsContainer.querySelectorAll('.pinned-level-wrapper'));
  if (children.length === 0) return;

  const hudBottom = document.querySelector('.hud-bottom');
  if (!hudBottom) {
    children.forEach((el, index) => {
      el.style.left = '0px';
      el.style.top = `${index * (28 + 8)}px`; 
    });
    return;
  }

  const pinnedRect = pinnedLevelsContainer.getBoundingClientRect();
  const hudRect = hudBottom.getBoundingClientRect();

  const availableHeight = hudRect.top - pinnedRect.top;

  const ITEM_HEIGHT = 28;
  const GAP_Y = 8;
  const TOTAL_ITEM_H = ITEM_HEIGHT + GAP_Y;
  
  let itemsAboveHud = Math.floor((availableHeight + GAP_Y) / TOTAL_ITEM_H);
  if (itemsAboveHud < 0) itemsAboveHud = 0; 
  
  const hudTopOffset = availableHeight;
  const firstOverlappingTopPx = Math.max(itemsAboveHud * TOTAL_ITEM_H, hudTopOffset);

  children.forEach((el, index) => {
    if (index < itemsAboveHud) {
      el.style.left = '0px';
      el.style.top = `${index * TOTAL_ITEM_H}px`;// js/ui/currencyAndLevelPins.js

import { settingsManager } from '../game/settingsManager.js';
import { CURRENCIES, getCurrency } from '../util/storage.js';
import { formatNumber } from '../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../game/offlinePanel.js';


import { bank } from '../util/storage.js';

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

  // Re-render pins when save slot changes
  window.addEventListener('saveSlot:change', refreshPinnedCurrencies);
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

    const currencyConfig = RESOURCE_REGISTRY.find(c => c.key === id);
    if (currencyConfig && currencyConfig.bgGradient) {
      bar.style.setProperty('background', currencyConfig.bgGradient, 'important');
    }

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
      textSpan.innerHTML = formatNumber(amount);
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
      span.innerHTML = formatNumber(getCurrency(id));
    }
  });
}

// --- LEVEL PINS ---

let pinnedLevelsContainer = null;
let levelSubscriptions = {};

const levelStateCache = {};
window.addEventListener("level:change", (e) => {
    if (e.detail && e.detail.prefix) {
        levelStateCache[e.detail.prefix] = e.detail;
    }
});

function getLevelStatValue(prefix) {
    return levelStateCache[prefix]?.level || 0;
}

function getLevelProgRatio(prefix) {
    return levelStateCache[prefix]?.ratio || 0;
}
export function initPinnedLevels(parentEl) {
  if (pinnedLevelsContainer) return;

  pinnedLevelsContainer = document.createElement('div');
  pinnedLevelsContainer.className = 'pinned-levels';
  pinnedLevelsContainer.id = 'pinned-levels';
  
  parentEl.appendChild(pinnedLevelsContainer);

  settingsManager.subscribe('user_interface', updateLevelsVisibility);
  updateLevelsVisibility(settingsManager.get('user_interface'));

  refreshPinnedLevels();

  const levelConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelStat');
  levelConfigs.forEach(levelConfig => {
    const prefix = levelConfig.key.replace('_levels', '');
    const pinKey = `level_${prefix}_pinned`;
    settingsManager.subscribe(pinKey, () => refreshPinnedLevels());
  });

  window.addEventListener('resize', layoutPinnedLevels);
  window.addEventListener('orientationchange', layoutPinnedLevels);
  window.addEventListener('menu:visibilitychange', (e) => {
    if (e.detail && !e.detail.visible) {
      requestAnimationFrame(() => {
        layoutPinnedLevels();
      });
    }
  });
  window.addEventListener('levels:pinsChanged', refreshPinnedLevels);

  // Re-render pins when save slot changes
  window.addEventListener('saveSlot:change', refreshPinnedLevels);
}

function updateLevelsVisibility(isVisible) {
  if (pinnedLevelsContainer) {
    if (isVisible === false) {
      pinnedLevelsContainer.style.display = 'none';
    } else {
      pinnedLevelsContainer.style.display = 'block';
    }
  }
}

export function refreshPinnedLevels() {
  if (!pinnedLevelsContainer) return;

  pinnedLevelsContainer.innerHTML = '';
  
  Object.values(levelSubscriptions).forEach(unsub => unsub());
  levelSubscriptions = {};

  const levelConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelStat');
  const pinnedPrefixes = [];
  
  levelConfigs.forEach(levelConfig => {
    const prefix = levelConfig.key.replace('_levels', '');
    const isPinned = settingsManager.get(`level_${prefix}_pinned`);
    if (isPinned) {
      pinnedPrefixes.push({ prefix, levelConfig });
    }
  });

  pinnedPrefixes.forEach(({ prefix, levelConfig }) => {
    const el = document.createElement('div');
    el.className = 'pinned-level-wrapper';
    el.id = `pinned-level-${prefix}`;

    const bar = document.createElement('div');
    bar.className = 'pinned-level';
    bar.dataset.level = prefix; 

    const icon = document.createElement('img');
    icon.className = 'pinned-level-icon';
    
    let iconSrc = levelConfig.icon || 'img/misc/mysterious.webp';
    if (iconSrc && iconSrc.endsWith('.webp')) {
      const parts = iconSrc.split('/');
      const filename = parts.pop();
      const baseName = filename.replace('.webp', '');
      iconSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
    }
    icon.src = iconSrc;
    icon.onerror = () => {
      icon.src = 'img/misc/mysterious.webp';
    };
    
    const textSpan = document.createElement('span');
    textSpan.className = 'pinned-level-value';
    
    const fill = document.createElement('div');
    fill.className = 'pinned-level-fill';
    bar.appendChild(fill);
    bar.appendChild(icon);
    bar.appendChild(textSpan);
    el.appendChild(bar);
    pinnedLevelsContainer.appendChild(el);

    const progConfig = RESOURCE_REGISTRY.find(c => c.key === prefix);
    if (progConfig) {
      if (progConfig.pinBgGradient) bar.style.setProperty('--pinned-bg', progConfig.pinBgGradient);
      if (progConfig.borderColor) bar.style.setProperty('--pinned-border-color', progConfig.borderColor);
      if (progConfig.barOutline) bar.style.setProperty('--pinned-border-w', progConfig.barOutline);
      if (progConfig.barBoxShadow) bar.style.setProperty('--pinned-box-shadow', progConfig.barBoxShadow);
      
      if (progConfig.fillGradient) fill.style.setProperty('--pinned-fill', progConfig.fillGradient);
      if (progConfig.glassBg) fill.style.setProperty('--pinned-glass-bg', progConfig.glassBg);
      if (progConfig.glassOpacity) fill.style.setProperty('--pinned-glass-opacity', progConfig.glassOpacity);
    }

    const updateValAndProg = () => {
      const amount = getLevelStatValue(prefix);
      textSpan.innerHTML = formatNumber(amount);
      const ratio = getLevelProgRatio(prefix);
      fill.style.setProperty('--progress', `${(ratio * 100).toFixed(2)}%`);
    };
    
    updateValAndProg();

    const handleEvent = () => updateValAndProg();
    
    const genericHandleEvent = (e) => {
        if (e.detail && e.detail.prefix === prefix) {
            updateValAndProg();
        }
    };
    window.addEventListener("level:change", genericHandleEvent);
    levelSubscriptions[prefix] = () => window.removeEventListener("level:change", genericHandleEvent);
  });

  layoutPinnedLevels();
}

export function layoutPinnedLevels() {
  if (!pinnedLevelsContainer) return;

  const children = Array.from(pinnedLevelsContainer.querySelectorAll('.pinned-level-wrapper'));
  if (children.length === 0) return;

  const hudBottom = document.querySelector('.hud-bottom');
  if (!hudBottom) {
    children.forEach((el, index) => {
      el.style.left = '0px';
      el.style.top = `${index * (28 + 8)}px`; 
    });
    return;
  }

  const pinnedRect = pinnedLevelsContainer.getBoundingClientRect();
  const hudRect = hudBottom.getBoundingClientRect();

  const availableHeight = hudRect.top - pinnedRect.top;

  const ITEM_HEIGHT = 28;
  const GAP_Y = 8;
  const TOTAL_ITEM_H = ITEM_HEIGHT + GAP_Y;
  
  let itemsAboveHud = Math.floor((availableHeight + GAP_Y) / TOTAL_ITEM_H);
  if (itemsAboveHud < 0) itemsAboveHud = 0; 
  
  const hudTopOffset = availableHeight;
  const firstOverlappingTopPx = Math.max(itemsAboveHud * TOTAL_ITEM_H, hudTopOffset);

  children.forEach((el, index) => {
    if (index < itemsAboveHud) {
      el.style.left = '0px';
      el.style.top = `${index * TOTAL_ITEM_H}px`;
    } else {
      const rowInHud = index - itemsAboveHud;
      el.style.left = '0px';
      el.style.top = `${firstOverlappingTopPx + (rowInHud * TOTAL_ITEM_H)}px`;
    }
  });
}

setInterval(() => {
  if (pinnedLevelsContainer && pinnedLevelsContainer.style.display !== 'none') {
    refreshPinnedLevelsValues();
  }
}, 100);

function refreshPinnedLevelsValues() {
  if (!pinnedLevelsContainer) return;
  const children = pinnedLevelsContainer.querySelectorAll('.pinned-level-wrapper');
  children.forEach(el => {
    const prefix = el.id.replace('pinned-level-', '');
    const config = RESOURCE_REGISTRY.find(c => c.key === prefix + '_levels');
    if (config) {
        const span = el.querySelector('.pinned-level-value');
        if (span) {
          span.innerHTML = formatNumber(getLevelStatValue(prefix));
        }
        const bar = el.querySelector('.pinned-level');
        const fill = el.querySelector('.pinned-level-fill');
        if (bar && fill) {
          const ratio = getLevelProgRatio(prefix);
          fill.style.setProperty('--progress', `${(ratio * 100).toFixed(2)}%`);
        }
    }
  });
}

// Request initial state on load
if (typeof window !== 'undefined') {
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('level:requestState'));
    }, 100);
}
