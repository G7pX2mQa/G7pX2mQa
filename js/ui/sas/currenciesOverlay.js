// js/ui/sas/currenciesOverlay.js

import { createSASOverlay } from './sasOverlayBuilder.js';
import { CURRENCIES } from '../../util/storage.js';
import { bank } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { settingsManager } from '../../game/settingsManager.js';
import { createDropdown } from './dropdownUtils.js';
import { AUTOMATION_AREA_KEY, MASTER_AUTOBUY_IDS } from '../../game/automationUpgrades.js';
import { getLevelNumber } from '../../game/upgrades.js';
import { setAllAutobuyersForCostType, getCollectiveAutobuyerState } from '../../game/automationEffects.js';


// Base icon mapping for default states if they don't exactly match the folder name
const BASE_ICONS = {
  coins: 'img/currencies/coin/coin_plus_base.webp',
  books: 'img/currencies/book/book_plus_base.webp',
  gold: 'img/currencies/gold/gold_plus_base.webp',
  magic: 'img/currencies/magic/magic_plus_base.webp',
  gears: 'img/currencies/gear/gear_plus_base.webp',
  waves: 'img/currencies/wave/wave_plus_base.webp',
  dna: 'img/currencies/dna/dna_plus_base.webp',
};

const ICONS = {
  coins: 'img/currencies/coin/coin.webp',
  books: 'img/currencies/book/book.webp',
  gold: 'img/currencies/gold/gold.webp',
  magic: 'img/currencies/magic/magic.webp',
  gears: 'img/currencies/gear/gear.webp',
  waves: 'img/currencies/wave/wave.webp',
  dna: 'img/currencies/dna/dna.webp',
};

// Returns a key like "currency_coins_popups"
function getToggleKey(currency, type) {
  return `currency_${currency}_${type}`;
}

// Ensures default values for these keys exist
function ensureCurrencySettings() {
  const currencies = Object.values(CURRENCIES);
  currencies.forEach(c => {
    if (settingsManager.get(getToggleKey(c, 'popups')) === undefined) {
      settingsManager.set(getToggleKey(c, 'popups'), true);
    }
    if (settingsManager.get(getToggleKey(c, 'automated')) === undefined) {
      settingsManager.set(getToggleKey(c, 'automated'), true);
    }
    if (settingsManager.get(getToggleKey(c, 'pinned')) === undefined) {
      settingsManager.set(getToggleKey(c, 'pinned'), false);
    }
  });
}

function createCurrencyRow(container, isUniversal, currencyId, iconSrc, baseSrc, amountText) {
  const row = document.createElement('div');
  row.className = 'currency-row' + (isUniversal ? ' universal-row' : '');
  if (currencyId && currencyId !== 'universal') row.dataset.currency = currencyId;
  
  const info = document.createElement('div');
  info.className = 'currency-info';
  
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'currency-icon-wrapper';
  
  const iconImg = document.createElement('img');
  iconImg.className = 'currency-base';
  iconImg.src = baseSrc;
  
  iconWrapper.appendChild(iconImg);
  
  const amountDiv = document.createElement('div');
  amountDiv.className = 'currency-amount';
  amountDiv.textContent = amountText;
  
  info.appendChild(iconWrapper);
  info.appendChild(amountDiv);
  
  row.appendChild(info);

  // Dropdown controls
  const controls = document.createElement('div');
  controls.className = 'currency-controls';

  const opts = [
    { value: 'popups', label: 'Popups' },
    { value: 'automated', label: 'Automated' },
    { value: 'pinned', label: 'Pinned' },
  ];

  const getDropdownValue = () => {
    if (!isUniversal) {
      const selected = [];
      if (settingsManager.get(getToggleKey(currencyId, 'popups'))) selected.push('popups');
      
      const collectiveState = getCollectiveAutobuyerState(currencyId);
      let isAuto = collectiveState > 0;
      
      if (isAuto) selected.push('automated');
      if (settingsManager.get(getToggleKey(currencyId, 'pinned'))) selected.push('pinned');
      return selected;
    } else {
      const allCurrencies = Object.values(CURRENCIES);
      const selected = [];
      ['popups', 'automated', 'pinned'].forEach(type => {
        if (type === 'automated') {
           if (allCurrencies.every(c => getCollectiveAutobuyerState(c) === 1)) {
              selected.push(type);
           }
        } else {
           if (allCurrencies.every(c => settingsManager.get(getToggleKey(c, type)))) {
             selected.push(type);
           }
        }
      });
      return selected;
    }
  };

  const setDropdownValue = (newVals) => {
    const prevVals = getDropdownValue();
    const toggledType = ['popups', 'automated', 'pinned'].find(type => 
      prevVals.includes(type) !== newVals.includes(type)
    );

    if (!toggledType) return;

    if (!isUniversal) {
      const newVal = newVals.includes(toggledType);
      settingsManager.set(getToggleKey(currencyId, toggledType), newVal);
      if (toggledType === 'pinned') {
        window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
      }
      if (toggledType === 'automated') {
        setAllAutobuyersForCostType(currencyId, newVal);
        window.dispatchEvent(new CustomEvent('currency:change', { detail: { ignoreOverlayRender: true } }));
        window.dispatchEvent(new CustomEvent('ccc:upgrades:changed'));
      }
      const overlayEl = container.closest('.sas-overlay');
      if (overlayEl) {
        const universalRow = overlayEl.querySelector('.universal-row');
        if (universalRow && universalRow._updateDropdownVisually) {
          universalRow._updateDropdownVisually();
        }
      }
    } else {
      const allCurrencies = Object.values(CURRENCIES);
      allCurrencies.forEach(c => {
        settingsManager.set(getToggleKey(c, 'popups'), newVals.includes('popups'));
        settingsManager.set(getToggleKey(c, 'automated'), newVals.includes('automated'));
        settingsManager.set(getToggleKey(c, 'pinned'), newVals.includes('pinned'));
      });
      
      // Update visually without full re-render
      const overlayEl = container.closest('.sas-overlay');
      if (overlayEl) {
        // Update all child dropdown wrappers instead of replacing the DOM
        const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
        rows.forEach(row => {
          if (row._updateDropdownVisually) {
            row._updateDropdownVisually();
          }
        });
      }
      
      // Always dispatch event when modifying the universal toggle to apply any pin changes
      window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
      if (toggledType === 'automated') {
        const isAutoEnabled = newVals.includes('automated');
        allCurrencies.forEach(c => setAllAutobuyersForCostType(c, isAutoEnabled));
        window.dispatchEvent(new CustomEvent('currency:change', { detail: { ignoreOverlayRender: true } }));
        window.dispatchEvent(new CustomEvent('ccc:upgrades:changed'));
      }
    }
  };

  const getDisplayValue = (vals) => {
    let hasAutoVariance = false;
    if (isUniversal) {
      const allCurrencies = Object.values(CURRENCIES);
      let hasVariance = false;
      ['popups', 'automated', 'pinned'].forEach(type => {
        if (type === 'automated') {
           const firstVal = getCollectiveAutobuyerState(allCurrencies[0]);
           if (firstVal === 0.5) {
               hasVariance = true;
               hasAutoVariance = true;
           }
           for (let i = 1; i < allCurrencies.length; i++) {
             const state = getCollectiveAutobuyerState(allCurrencies[i]);
             if (state !== firstVal || state === 0.5) {
               hasVariance = true;
               hasAutoVariance = true;
               break;
             }
           }
        } else {
           const firstVal = settingsManager.get(getToggleKey(allCurrencies[0], type));
           for (let i = 1; i < allCurrencies.length; i++) {
             if (settingsManager.get(getToggleKey(allCurrencies[i], type)) !== firstVal) {
               hasVariance = true;
               break;
             }
           }
        }
      });
      if (hasVariance) {
        const span = document.createElement("span");
        span.textContent = "Variance within currencies detected";
        span.style.color = "#ffaa00";
        return span;
      }
    }

    const makeSpan = (text, isTruthy) => {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.color = isTruthy ? '#44ff44' : '#ff4444';
      return span;
    };
    
    const verticalBar = () => {
      const span = document.createElement('span');
      span.textContent = '| ';
      span.style.color = 'inherit';
      return span;
    };

    const hasPopups = vals.includes('popups');
    const isAuto = vals.includes('automated');
    const isPinned = vals.includes('pinned');

    let isMasterUnlocked = false;
    let collectiveState = 0;
    if (currencyId && !isUniversal) {
      collectiveState = getCollectiveAutobuyerState(currencyId);
      const masterUpgIdEntry = Object.entries(MASTER_AUTOBUY_IDS).find(([id, key]) => key === currencyId);
      if (masterUpgIdEntry) {
        const masterId = parseInt(masterUpgIdEntry[0]);
        if (getLevelNumber(AUTOMATION_AREA_KEY, masterId) > 0) {
          isMasterUnlocked = true;
        }
      }
    }

    let autoText = '';
    if (isUniversal) {
      if (hasAutoVariance) {
        autoText = 'Variance within currencies detected';
      } else {
        autoText = isAuto ? 'Is/Could be automated' : 'Is not/Wouldn\'t be automated';
      }
    } else {
      if (collectiveState === 0.5) {
        autoText = 'Is sort of automated';
      } else {
        if (isMasterUnlocked) {
          autoText = collectiveState === 1 ? 'Is automated' : 'Is not automated';
        } else {
          autoText = collectiveState === 1 ? 'Could be automated' : 'Wouldn\'t be automated';
        }
      }
    }

    // Set color based on state
    let autoSpan;
    if (!isUniversal && collectiveState === 0.5) {
      autoSpan = document.createElement('span');
      autoSpan.textContent = autoText;
      autoSpan.style.color = '#ffff44'; // Yellow for sort of
    } else if (isUniversal && hasAutoVariance) {
      autoSpan = document.createElement('span');
      autoSpan.textContent = autoText;
      autoSpan.style.color = '#ffaa00'; // Orange for variance
    } else {
      autoSpan = makeSpan(autoText, isUniversal ? isAuto : collectiveState === 1);
    }

    return [
      makeSpan(hasPopups ? 'Has popups' : 'No popups', hasPopups),
      verticalBar(),
      autoSpan,
      verticalBar(),
      makeSpan(isPinned ? 'Is pinned' : 'Is not pinned', isPinned)
    ];
  };

  const { wrapper, cleanup, updateDisplay } = createDropdown({
    getOptions: () => opts,
    getValue: getDropdownValue,
    setValue: setDropdownValue,
    isChecklist: true,
    getDisplayValue: getDisplayValue,
  });

  row._cleanupDropdown = cleanup;
  row._updateDropdownVisually = updateDisplay;

  controls.appendChild(wrapper);
  row.appendChild(controls);

  container.appendChild(row);
}
function populateCurrenciesOverlay(overlayEl) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');
  
  ensureCurrencySettings();
  
  // Universal Row
  const uniqueCount = Object.keys(CURRENCIES).length;
  createCurrencyRow(grid, true, 'universal', 'img/misc/mysterious.webp', 'img/misc/locked_base.webp', "Universal Toggle");

  // Child Rows
  const currenciesList = Object.values(CURRENCIES);
  currenciesList.forEach(currency => {
    const val = bank[currency]?.value;
    const amountStr = formatNumber(val);
    const iconSrc = ICONS[currency] || 'img/misc/mysterious.webp';
    const baseSrc = BASE_ICONS[currency] || 'img/misc/locked.webp';
    createCurrencyRow(grid, false, currency, iconSrc, baseSrc, amountStr + ' ' + (currency.charAt(0).toUpperCase() + currency.slice(1)));
  });
}


function handleOutsideClick(e) {
  if (!currenciesOverlay.isOpen) return;
  const overlayEl = currenciesOverlay.overlayEl;
  if (!overlayEl) return;
  
  if (!e.target.closest('.setting-dropdown-wrapper')) {
    const openMenus = overlayEl.querySelectorAll('.setting-dropdown-menu.is-open');
    openMenus.forEach(menu => {
      menu.classList.remove('is-open');
    });
  }
}

function handleCurrencyChange(e) {
  if (e.detail && e.detail.ignoreOverlayRender) return;
  if (!currenciesOverlay.isOpen) return;
  const overlayEl = currenciesOverlay.overlayEl;
  if (!overlayEl) return;
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  
  // If specific currency changed, update only that row
  if (e.detail && e.detail.key) {
    const currencyId = e.detail.key;
    const row = grid.querySelector(`.currency-row[data-currency="${currencyId}"]`);
    if (row) {
      const amountEl = row.querySelector('.currency-amount');
      if (amountEl) {
        const val = bank[currencyId]?.value;
        amountEl.textContent = formatNumber(val) + ' ' + (currencyId.charAt(0).toUpperCase() + currencyId.slice(1));
      }
    }
  } else {
    // If no specific detail, full re-render values
    populateCurrenciesOverlay(overlayEl);
  }
}

const currenciesOverlay = createSASOverlay({
  id: 'currencies-overlay',
  title: 'Currencies',
  containerClass: 'currencies-grid',
  focusSelector: '.currency-row, .currencies-grid',
  onRender: (overlayEl) => {
    populateCurrenciesOverlay(overlayEl);
    window.addEventListener('currency:change', handleCurrencyChange);
    document.addEventListener('click', handleOutsideClick);
  },
  onClose: () => {
    window.removeEventListener('currency:change', handleCurrencyChange);
    document.removeEventListener('click', handleOutsideClick);
    // Cleanup dynamic dropdown listeners
    if (currenciesOverlay.overlayEl) {
      const rows = currenciesOverlay.overlayEl.querySelectorAll('.currency-row');
      rows.forEach(row => {
        if (row._cleanupDropdown) row._cleanupDropdown();
      });
    }
  }
});

export function openCurrenciesOverlay() {
  currenciesOverlay.open();
}

export function closeCurrenciesOverlay(force = false) {
  currenciesOverlay.close(force);
}
