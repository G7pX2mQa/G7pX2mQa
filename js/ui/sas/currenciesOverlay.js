// js/ui/sas/currenciesOverlay.js

import { createSASOverlay } from './sasOverlayBuilder.js';
import { CURRENCIES } from '../../util/storage.js';
import { bank } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { settingsManager } from '../../game/settingsManager.js';
import { createDropdown } from './dropdownUtils.js';

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
    if (settingsManager.get(getToggleKey(c, 'autobuy')) === undefined) {
      settingsManager.set(getToggleKey(c, 'autobuy'), false);
    }
    if (settingsManager.get(getToggleKey(c, 'pin')) === undefined) {
      settingsManager.set(getToggleKey(c, 'pin'), false);
    }
  });
}

function createCurrencyRow(container, isMaster, currencyId, iconSrc, baseSrc, amountText) {
  const row = document.createElement('div');
  row.className = 'currency-row' + (isMaster ? ' master-row' : '');
  if (currencyId && currencyId !== 'master') row.dataset.currency = currencyId;
  
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
    { value: 'autobuy', label: 'Autobuy' },
    { value: 'pin', label: 'Pin' },
  ];

  const getDropdownValue = () => {
    if (!isMaster) {
      const selected = [];
      if (settingsManager.get(getToggleKey(currencyId, 'popups'))) selected.push('popups');
      if (settingsManager.get(getToggleKey(currencyId, 'autobuy'))) selected.push('autobuy');
      if (settingsManager.get(getToggleKey(currencyId, 'pin'))) selected.push('pin');
      return selected;
    } else {
      const allCurrencies = Object.values(CURRENCIES);
      const selected = [];
      ['popups', 'autobuy', 'pin'].forEach(type => {
        if (allCurrencies.every(c => settingsManager.get(getToggleKey(c, type)))) {
          selected.push(type);
        }
      });
      return selected;
    }
  };

  const setDropdownValue = (newVals) => {
    const prevVals = getDropdownValue();
    const toggledType = ['popups', 'autobuy', 'pin'].find(type => 
      prevVals.includes(type) !== newVals.includes(type)
    );

    if (!toggledType) return;

    const newVal = newVals.includes(toggledType);

    if (!isMaster) {
      settingsManager.set(getToggleKey(currencyId, toggledType), newVal);
      if (toggledType === 'pin') {
        window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
      }
    } else {
      const allCurrencies = Object.values(CURRENCIES);
      allCurrencies.forEach(c => {
        settingsManager.set(getToggleKey(c, toggledType), newVal);
      });
      
      // Update visually without full re-render
      const overlayEl = container.closest('.sas-overlay');
      if (overlayEl) {
        // Update all child dropdown wrappers instead of replacing the DOM
        const rows = overlayEl.querySelectorAll('.currency-row:not(.master-row)');
        rows.forEach(row => {
          if (row._updateDropdownVisually) {
            row._updateDropdownVisually();
          }
        });
      }
      
      if (toggledType === 'pin') {
        window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
      }
    }
  };

  const getDisplayValue = (vals) => {
    const popupsStr = vals.includes('popups') ? 'Has popups' : 'No popups';
    const autoStr = vals.includes('autobuy') ? 'Is automated' : 'Is not automated';
    const pinStr = vals.includes('pin') ? 'Is pinned' : 'Is not pinned';
    return `${popupsStr}, ${autoStr}, ${pinStr}`;
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
  
  // Master Row
  const uniqueCount = Object.keys(CURRENCIES).length;
  createCurrencyRow(grid, true, 'master', 'img/misc/mysterious.webp', 'img/misc/locked_base.webp', `Unique Currencies Count: ${uniqueCount}`);

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
