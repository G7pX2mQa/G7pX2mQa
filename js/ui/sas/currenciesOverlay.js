// js/ui/sas/currenciesOverlay.js

import { createSASOverlay } from './sasOverlayBuilder.js';
import { CURRENCIES } from '../../util/storage.js';
import { bank } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { settingsManager } from '../../game/settingsManager.js';

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

  const info = document.createElement('div');
  info.className = 'currency-info';
  
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'currency-icon-wrapper';
  
  const baseImg = document.createElement('img');
  baseImg.className = 'currency-base';
  baseImg.src = baseSrc;
  
  const iconImg = document.createElement('img');
  iconImg.className = 'currency-icon';
  iconImg.src = iconSrc;
  
  iconWrapper.appendChild(baseImg);
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
  
  const btn = document.createElement('button');
  btn.className = 'currency-dropdown-btn';
  btn.textContent = 'Settings';
  
  const menu = document.createElement('div');
  menu.className = 'currency-dropdown-menu';
  
  const createToggle = (label, type) => {
    const toggleRow = document.createElement('label');
    toggleRow.className = 'currency-toggle-row';
    toggleRow.textContent = label;
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'currency-checkbox';
    
    // Check state
    if (!isMaster) {
      cb.checked = settingsManager.get(getToggleKey(currencyId, type)) === true;
      cb.addEventListener('change', (e) => {
        settingsManager.set(getToggleKey(currencyId, type), e.target.checked);
        if (type === 'pin') {
          window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
        }
      });
    } else {
      // For master, evaluate if all are true
      const allCurrencies = Object.values(CURRENCIES);
      const allChecked = allCurrencies.every(c => settingsManager.get(getToggleKey(c, type)) === true);
      const anyChecked = allCurrencies.some(c => settingsManager.get(getToggleKey(c, type)) === true);
      cb.checked = allChecked;
      if (!allChecked && anyChecked) {
        cb.indeterminate = true;
      }
      
      cb.addEventListener('change', (e) => {
        const newVal = e.target.checked;
        allCurrencies.forEach(c => {
          settingsManager.set(getToggleKey(c, type), newVal);
        });
        // Re-render to update the child toggles
        populateCurrenciesOverlay(container);
        if (type === 'pin') {
          window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
        }
      });
    }
    
    toggleRow.appendChild(cb);
    return toggleRow;
  };

  menu.appendChild(createToggle('Popups', 'popups'));
  menu.appendChild(createToggle('Autobuy', 'autobuy'));
  menu.appendChild(createToggle('Pin', 'pin'));

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('is-open');
    // Close any other open menus
    document.querySelectorAll('.currency-dropdown-menu.is-open').forEach(m => m.classList.remove('is-open'));
    if (!isOpen) {
      menu.classList.add('is-open');
    }
  });
  
  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!row.contains(e.target)) {
      menu.classList.remove('is-open');
    }
  });

  controls.appendChild(btn);
  controls.appendChild(menu);
  
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
  createCurrencyRow(grid, true, 'master', 'img/misc/mysterious.webp', 'img/misc/locked.webp', `Unique Currencies Count: ${uniqueCount}`);

  // Child Rows
  const currenciesList = Object.values(CURRENCIES);
  currenciesList.forEach(currency => {
    const val = bank.amount(currency);
    const amountStr = formatNumber(val);
    const iconSrc = ICONS[currency] || 'img/misc/mysterious.webp';
    const baseSrc = BASE_ICONS[currency] || 'img/misc/locked.webp';
    createCurrencyRow(grid, false, currency, iconSrc, baseSrc, amountStr);
  });
}

const currenciesOverlay = createSASOverlay({
  id: 'currencies-overlay',
  title: 'Currencies',
  containerClass: 'currencies-grid',
  focusSelector: '.currency-row, .currencies-grid',
  onRender: (overlayEl) => {
    populateCurrenciesOverlay(overlayEl);
  }
});

export function openCurrenciesOverlay() {
  currenciesOverlay.open();
}

export function closeCurrenciesOverlay(force = false) {
  currenciesOverlay.close(force);
}