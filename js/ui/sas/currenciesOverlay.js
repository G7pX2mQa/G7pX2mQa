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

  if (isUniversal) {
    opts.push({ value: 'paintbrush', label: 'Paint Brush Multi-Toggle', isButton: true });
  }

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
      let hasVariance = false;
      
      ['popups', 'automated', 'pinned'].forEach(type => {
        if (type === 'automated') {
           const firstVal = getCollectiveAutobuyerState(allCurrencies[0]);
           if (firstVal === 0.5) {
               hasVariance = true;
           }
           for (let i = 1; i < allCurrencies.length; i++) {
             const state = getCollectiveAutobuyerState(allCurrencies[i]);
             if (state !== firstVal || state === 0.5) {
               hasVariance = true;
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
        return [];
      }

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
    if (newVals.includes('paintbrush')) {
      // User clicked the paintbrush button
      openPaintBrushMode();
      return;
    }

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
      
      const isAutoEnabled = newVals.includes('automated');
      allCurrencies.forEach(c => setAllAutobuyersForCostType(c, isAutoEnabled));
      
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
      
      window.dispatchEvent(new CustomEvent('currency:change', { detail: { ignoreOverlayRender: true } }));
      window.dispatchEvent(new CustomEvent('ccc:upgrades:changed'));
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
    createCurrencyRow(grid, false, currency, iconSrc, baseSrc, amountStr + ' ' + (currency === 'dna' ? 'DNA' : currency.charAt(0).toUpperCase() + currency.slice(1)));
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
        amountEl.textContent = formatNumber(val) + ' ' + (currencyId === 'dna' ? 'DNA' : currencyId.charAt(0).toUpperCase() + currencyId.slice(1));
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

let paintBrushActive = false;
let paintBrushPopup = null;
let paintBrushState = {
  popups: false,
  automated: false,
  pinned: false
};

function getUniversalState() {
  const allCurrencies = Object.values(CURRENCIES);
  let state = { popups: true, automated: true, pinned: true };

  ['popups', 'automated', 'pinned'].forEach(type => {
    if (type === 'automated') {
       if (!allCurrencies.every(c => getCollectiveAutobuyerState(c) === 1)) {
          state.automated = false;
       }
    } else {
       if (!allCurrencies.every(c => settingsManager.get(getToggleKey(c, type)))) {
         state[type] = false;
       }
    }
  });
  return state;
}

function openPaintBrushMode() {
  if (paintBrushActive) return;
  paintBrushActive = true;
  
  // Get initial state from universal toggle
  paintBrushState = getUniversalState();

  // Create Popup
  paintBrushPopup = document.createElement('div');
  paintBrushPopup.className = 'paintbrush-popup';
  paintBrushPopup.style.position = 'fixed';
  paintBrushPopup.style.top = '0';
  paintBrushPopup.style.left = '50%';
  paintBrushPopup.style.transform = 'translateX(-50%)';
  paintBrushPopup.style.background = '#111';
  paintBrushPopup.style.color = '#fff';
  paintBrushPopup.style.border = '1px solid #444';
  paintBrushPopup.style.borderTop = 'none';
  paintBrushPopup.style.borderBottomLeftRadius = '8px';
  paintBrushPopup.style.borderBottomRightRadius = '8px';
  paintBrushPopup.style.padding = '15px';
  paintBrushPopup.style.zIndex = '10000';
  paintBrushPopup.style.width = '400px';
  paintBrushPopup.style.maxWidth = '90vw';
  paintBrushPopup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
  paintBrushPopup.style.display = 'flex';
  paintBrushPopup.style.flexDirection = 'column';
  paintBrushPopup.style.gap = '15px';

  // Toggles container
  const togglesContainer = document.createElement('div');
  togglesContainer.style.display = 'flex';
  togglesContainer.style.justifyContent = 'space-around';
  togglesContainer.style.padding = '5px 0';

  const createToggle = (key, label) => {
    const labelEl = document.createElement('label');
    labelEl.style.display = 'flex';
    labelEl.style.alignItems = 'center';
    labelEl.style.gap = '5px';
    labelEl.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = paintBrushState[key];
    checkbox.addEventListener('change', (e) => {
      paintBrushState[key] = e.target.checked;
    });

    labelEl.appendChild(checkbox);
    labelEl.appendChild(document.createTextNode(label));
    return labelEl;
  };

  togglesContainer.appendChild(createToggle('popups', 'Popups'));
  togglesContainer.appendChild(createToggle('automated', 'Automated'));
  togglesContainer.appendChild(createToggle('pinned', 'Pinned'));

  // Descriptive text
  const textEl = document.createElement('div');
  textEl.style.fontSize = '0.9em';
  textEl.style.lineHeight = '1.4';
  textEl.style.color = '#ccc';
  textEl.style.textAlign = 'center';
  textEl.textContent = "Left click and drag over any currency row to apply specific changes in accordance to the dropdown options listed right above this text. Use this tool to apply an arbitrary customization of settings to an arbitrary amount of currencies quickly. While this tool is active, rows covered in red will be unchanged, and rows covered in green will have changes applied.";

  // Buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.justifyContent = 'space-between';
  buttonsContainer.style.gap = '10px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel changes';
  cancelBtn.style.background = '#aa0000';
  cancelBtn.style.color = '#fff';
  cancelBtn.style.border = 'none';
  cancelBtn.style.padding = '8px 15px';
  cancelBtn.style.borderRadius = '4px';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.flex = '1';
  cancelBtn.addEventListener('click', closePaintBrushMode);

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply changes';
  applyBtn.style.background = '#008800';
  applyBtn.style.color = '#fff';
  applyBtn.style.border = 'none';
  applyBtn.style.padding = '8px 15px';
  applyBtn.style.borderRadius = '4px';
  applyBtn.style.cursor = 'pointer';
  applyBtn.style.flex = '1';
  applyBtn.addEventListener('click', applyPaintBrushChanges);

  buttonsContainer.appendChild(cancelBtn);
  buttonsContainer.appendChild(applyBtn);

  paintBrushPopup.appendChild(togglesContainer);
  paintBrushPopup.appendChild(textEl);
  paintBrushPopup.appendChild(buttonsContainer);

  document.body.appendChild(paintBrushPopup);

  initPaintBrushEvents();
}

function closePaintBrushMode() {
  if (!paintBrushActive) return;
  paintBrushActive = false;
  if (paintBrushPopup) {
    paintBrushPopup.remove();
    paintBrushPopup = null;
  }
  cleanupPaintBrushEvents();
}

function applyPaintBrushChanges() {
  const overlayEl = currenciesOverlay.overlayEl;
  if (!overlayEl) {
    closePaintBrushMode();
    return;
  }

  const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
  let changedAny = false;
  let changedPins = false;
  let changedAuto = false;

  rows.forEach(row => {
    const overlay = row.querySelector('.paintbrush-row-overlay');
    if (overlay && overlay.dataset.state === 'green') {
      const currencyId = row.dataset.currency;
      if (!currencyId) return;

      changedAny = true;

      const newPopups = paintBrushState.popups;
      const newAutomated = paintBrushState.automated;
      const newPinned = paintBrushState.pinned;

      if (settingsManager.get(getToggleKey(currencyId, 'popups')) !== newPopups) {
        settingsManager.set(getToggleKey(currencyId, 'popups'), newPopups);
      }

      if (settingsManager.get(getToggleKey(currencyId, 'pinned')) !== newPinned) {
        settingsManager.set(getToggleKey(currencyId, 'pinned'), newPinned);
        changedPins = true;
      }

      // getCollectiveAutobuyerState returns 0, 0.5, or 1.
      // We only care if we are flipping from 0/0.5 to 1, or 1/0.5 to 0.
      const currentState = getCollectiveAutobuyerState(currencyId);
      const isAuto = currentState > 0;
      if (isAuto !== newAutomated) {
        setAllAutobuyersForCostType(currencyId, newAutomated);
        changedAuto = true;
      }
      
      settingsManager.set(getToggleKey(currencyId, 'automated'), newAutomated);
      
      if (row._updateDropdownVisually) {
        row._updateDropdownVisually();
      }
    }
  });

  if (changedAny) {
    if (changedPins) {
      window.dispatchEvent(new CustomEvent('currencies:pinsChanged'));
    }
    if (changedAuto) {
      window.dispatchEvent(new CustomEvent('currency:change', { detail: { ignoreOverlayRender: true } }));
      window.dispatchEvent(new CustomEvent('ccc:upgrades:changed'));
    }
    
    const universalRow = overlayEl.querySelector('.universal-row');
    if (universalRow && universalRow._updateDropdownVisually) {
      universalRow._updateDropdownVisually();
    }
  }

  closePaintBrushMode();
}

let isPaintBrushMouseDown = false;
let hoveredRowDuringPaintBrush = null;

function handlePaintBrushMouseDown(e) {
  if (!paintBrushActive) return;
  if (e.button !== 0) return; // Only left click
  isPaintBrushMouseDown = true;
  flipRowStateFromEvent(e);
}

function handlePaintBrushMouseUp(e) {
  if (!paintBrushActive) return;
  if (e.button !== 0) return;
  isPaintBrushMouseDown = false;
  hoveredRowDuringPaintBrush = null;
}

function handlePaintBrushMouseEnter(e) {
  if (!paintBrushActive || !isPaintBrushMouseDown) return;
  flipRowStateFromEvent(e);
}

function handlePaintBrushMouseLeave(e) {
  if (!paintBrushActive) return;
  const row = e.currentTarget;
  if (hoveredRowDuringPaintBrush === row) {
    hoveredRowDuringPaintBrush = null;
  }
}

function flipRowStateFromEvent(e) {
  const row = e.currentTarget;
  if (hoveredRowDuringPaintBrush === row) return; // Already flipped this entry
  
  const overlay = row.querySelector('.paintbrush-row-overlay');
  if (overlay) {
    if (overlay.dataset.state === 'red') {
      overlay.dataset.state = 'green';
      overlay.style.background = 'rgba(0, 255, 0, 0.3)';
    } else {
      overlay.dataset.state = 'red';
      overlay.style.background = 'rgba(255, 0, 0, 0.3)';
    }
  }
  hoveredRowDuringPaintBrush = row;
}

function initPaintBrushEvents() {
  // Disable normal dropdowns
  const overlayEl = currenciesOverlay.overlayEl;
  if (overlayEl) {
    const controls = overlayEl.querySelectorAll('.currency-controls');
    controls.forEach(c => {
      c.style.pointerEvents = 'none';
    });
    
    // Disable user select to prevent text selection while dragging
    overlayEl.style.userSelect = 'none';

    const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
    rows.forEach(r => {
      // Ensure row is positioned relatively for the absolute overlay
      if (window.getComputedStyle(r).position === 'static') {
        r.style.position = 'relative';
      }
      
      // Add red overlay
      const overlay = document.createElement('div');
      overlay.className = 'paintbrush-row-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '-10px'; // Cover entire width plus some change
      overlay.style.right = '-10px';
      overlay.style.bottom = '0';
      overlay.style.background = 'rgba(255, 0, 0, 0.3)';
      overlay.style.zIndex = '10';
      overlay.style.pointerEvents = 'none'; // Let the row receive mouse events
      overlay.dataset.state = 'red';
      r.appendChild(overlay);

      // Attach mouse events directly to the row
      r.addEventListener('mousedown', handlePaintBrushMouseDown);
      r.addEventListener('mouseenter', handlePaintBrushMouseEnter);
      r.addEventListener('mouseleave', handlePaintBrushMouseLeave);
    });
    
    document.addEventListener('mouseup', handlePaintBrushMouseUp);
  }
}

function cleanupPaintBrushEvents() {
  const overlayEl = currenciesOverlay.overlayEl;
  if (overlayEl) {
    const controls = overlayEl.querySelectorAll('.currency-controls');
    controls.forEach(c => {
      c.style.pointerEvents = '';
    });
    
    overlayEl.style.userSelect = '';

    const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
    rows.forEach(r => {
      const overlay = r.querySelector('.paintbrush-row-overlay');
      if (overlay) overlay.remove();
      
      r.removeEventListener('mousedown', handlePaintBrushMouseDown);
      r.removeEventListener('mouseenter', handlePaintBrushMouseEnter);
      r.removeEventListener('mouseleave', handlePaintBrushMouseLeave);
    });
    
    document.removeEventListener('mouseup', handlePaintBrushMouseUp);
  }
  isPaintBrushMouseDown = false;
  hoveredRowDuringPaintBrush = null;
}
