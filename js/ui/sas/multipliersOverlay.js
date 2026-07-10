import { setHtmlOrText } from '../../util/uiHelpers.js';
import { createSASOverlay } from './sasOverlayBuilder.js';
import { RESOURCE_REGISTRY, RESOURCE_REGISTRY_EXTRAS } from '../../game/offlinePanel.js';
import { bank, CURRENCIES, isCurrencyUnlocked } from '../../util/storage.js';
import { formatMultForUi } from '../../util/numFormat.js';
import { createDropdown } from "./dropdownUtils.js";
import { getActiveSlot } from '../../util/storage.js';
import { isBuildingUnlocked } from '../minerTabs/buildingsTab.js';
import { UC_MATERIALS } from '../../util/storage.js';

function isMultiplierGreaterThanOne(multiplier) {
  if (multiplier == null) return false;
  if (typeof multiplier === 'number') return multiplier > 1;
  if (multiplier && typeof multiplier.cmp === 'function') {
    // Assuming cmp(1) returns > 0 if multiplier > 1
    return multiplier.cmp(1) > 0;
  }
  return false;
}

const _unlockedCache = new Set();
let _lastSlot = null;

function isMultiplierEverUnlocked(key) {
  const slot = getActiveSlot();
  if (slot == null) return false;
  if (_lastSlot !== slot) {
    _unlockedCache.clear();
    _lastSlot = slot;
  }
  if (_unlockedCache.has(key)) {
    return true;
  }
  const k = `ccc:multiplier_unlocked:${key}:${slot}`;
  const val = localStorage.getItem(k) === 'true';
  if (val) {
    _unlockedCache.add(key);
  }
  return val;
}

function setMultiplierEverUnlocked(key) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const k = `ccc:multiplier_unlocked:${key}:${slot}`;
  localStorage.setItem(k, 'true');
  if (_lastSlot === slot) {
    _unlockedCache.add(key);
  }
}


function createMultiplierRow(container, key, iconSrc, baseSrc, multiplierText, config) {
  const row = document.createElement('div');
  row.className = 'currency-row';
  row.dataset.key = key;
  
  if (config && config.bgGradient) {
    row.style.setProperty('background', config.bgGradient, 'important');
  }

  const info = document.createElement('div');
  info.className = 'currency-info';
  // Adjust info flex so content is centered if possible
  info.style.justifyContent = 'center';

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'currency-icon-wrapper';
  // Since we aren't displaying the name, maybe add some margin or layout adjustments.

  const iconImg = document.createElement('img');
  iconImg.className = 'currency-base';
  iconImg.src = baseSrc || iconSrc;
  
  iconWrapper.appendChild(iconImg);

  if (config?.noPlusBase && iconSrc && baseSrc && iconSrc !== baseSrc) {
    const innerIcon = document.createElement('img');
    innerIcon.className = 'currency-icon';
    innerIcon.src = iconSrc;
    innerIcon.onerror = () => {
      innerIcon.src = 'img/currencies/coin/coin_plus_base.webp';
    };
    iconWrapper.appendChild(innerIcon);
  }

  const amountDiv = document.createElement('div');
  amountDiv.classList.add('multipliers-amount');
  amountDiv.classList.add('currency-amount');
  amountDiv.style.flex = 'none';
  amountDiv.style.marginLeft = '10px';
  setHtmlOrText(amountDiv, `${config?.plural || config?.singular || key}: ${multiplierText}x`);

  info.appendChild(iconWrapper);
  info.appendChild(amountDiv);

  row.appendChild(info);

  // Add invisible dropdown to match the height of other overlays
  const controls = document.createElement('div');
  controls.className = 'currency-controls';
  controls.style.visibility = 'hidden';
  controls.style.pointerEvents = 'none';

  const { wrapper, cleanup } = createDropdown({
    getOptions: () => [{ value: 'hidden', label: 'Hidden' }],
    getValue: () => 'hidden',
    setValue: () => {},
  });

  controls.appendChild(wrapper);
  row.appendChild(controls);

  row._cleanupDropdown = cleanup;

  container.appendChild(row);
}

function getUnlockedCurrencies() {
  return Object.values(CURRENCIES).filter(c => c !== CURRENCIES.VOID_GEMS && isCurrencyUnlocked(c));
}

function processResourceRow(config, grid, initialized) {
  let multiplier = 1;
  let isCurrency = false;

  if (config.key === 'voidGems') {
    return;
  }

  if (config.type === 'currency') {
    isCurrency = true;
    if (bank[config.key] && bank[config.key].mult) {
      try {
        multiplier = bank[config.key].mult.get();
      } catch (e) {
        multiplier = 1;
      }
    }
  } else {
    let keyToUse = config.key;
    if (config.type === 'levelStat' && config.key !== 'research_levels' && config.key !== 'waterwheel_levels') {
        return;
    }
    
    if (keyToUse === 'waves' || keyToUse === 'waves_levels') {
        keyToUse = 'surge_wave'; // Maps to surgeWaveSystem.getSurgeWaveMultiplier()
    }

    const camelKey = keyToUse.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    const sysName = camelKey + 'System';
    const methodName = 'get' + camelKey.charAt(0).toUpperCase() + camelKey.slice(1) + 'Multiplier';
    
    if (window[sysName] && typeof window[sysName][methodName] === 'function') {
      multiplier = window[sysName][methodName]();
    } else {
      multiplier = 1;
    }
  }

  let unlocked = isMultiplierEverUnlocked(config.key);
  if (!unlocked && isMultiplierGreaterThanOne(multiplier)) {
    setMultiplierEverUnlocked(config.key);
    unlocked = true;
  }

  if (unlocked && UC_MATERIALS.includes(config.key)) {
    if (!isBuildingUnlocked(config.key)) {
      unlocked = false;
    }
  }

  if (!initialized) {
    // First pass: create all possible rows, but hide them initially
    let iconSrc = config.icon || "img/misc/mysterious.webp";
    let baseSrc = isCurrency ? config.baseIcon || "img/misc/locked.webp" : iconSrc;
    
    if (!isCurrency && iconSrc && iconSrc.endsWith('.webp')) {
        const parts = iconSrc.split('/');
        const filename = parts.pop();
        const baseName = filename.replace('.webp', '');
        baseSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
    }
    
    let overrides = { ...config };
    if (config.key === 'research_levels') overrides = { ...config, ...RESOURCE_REGISTRY_EXTRAS['research_levels'] };
    if (config.key === 'waterwheel_levels') overrides = { ...config, ...RESOURCE_REGISTRY_EXTRAS['waterwheel_levels'] };
    
    // Update icon and base icon if changed by overrides
    if (overrides.icon) {
        iconSrc = overrides.icon;
        baseSrc = isCurrency ? (overrides.baseIcon || "img/misc/locked.webp") : iconSrc;
        if (!isCurrency && iconSrc && iconSrc.endsWith('.webp')) {
            const parts = iconSrc.split('/');
            const filename = parts.pop();
            const baseName = filename.replace('.webp', '');
            baseSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
        }
    }

    const rowText = formatMultForUi(multiplier);
    createMultiplierRow(grid, config.key, iconSrc, baseSrc, rowText, overrides);
    const newRow = grid.lastElementChild;
    
    // Initially set innerHTML (as createMultiplierRow relies on it)
    const amountDiv = newRow.querySelector('.multipliers-amount');
    
    grid._rows[config.key] = {
      row: newRow,
      amountDiv: amountDiv,
      plural: overrides.plural || overrides.singular || config.key,
      lastText: `${overrides.plural || overrides.singular || config.key}: ${rowText}x`
    };
    
    if (!unlocked) {
      newRow.style.display = 'none';
    }
  } else {
    // Fast path update
    const rowData = grid._rows[config.key];
    if (rowData) {
      if (unlocked) {
        rowData.row.style.display = '';
        const newText = `${rowData.plural}: ${formatMultForUi(multiplier)}x`;
        if (rowData.lastText !== newText) {
          rowData.lastText = newText;
          setHtmlOrText(rowData.amountDiv, newText);
        }
      } else {
        rowData.row.style.display = 'none';
      }
    }
  }
}

function populateMultipliersOverlay(overlayEl, keysToUpdate = null) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  
  let noteEl = overlayEl.querySelector('.multipliers-note');
  if (!noteEl) {
    noteEl = document.createElement('div');
    noteEl.className = 'multipliers-note';
    noteEl.style.color = 'white';
    noteEl.style.textAlign = 'center';
    noteEl.style.fontSize = '18px';
    noteEl.textContent = 'Note: Currency or stat multipliers will only appear here if they have changed from their default value of 1x';
    grid.parentElement.insertBefore(noteEl, grid);
  }
  
  grid.setAttribute('role', 'grid');

  const initialized = grid.hasAttribute('data-initialized');
  if (!initialized) {
    grid.innerHTML = "";
    grid._rows = {};
  }

  if (keysToUpdate && initialized) {
    keysToUpdate.forEach(key => {
      const config = RESOURCE_REGISTRY.find(c => c.key === key);
      if (config) {
        processResourceRow(config, grid, true);
      }
    });
  } else {
    RESOURCE_REGISTRY.forEach(config => {
      processResourceRow(config, grid, initialized);
    });
  }
  
  if (!initialized) {
    grid.setAttribute('data-initialized', 'true');
  }
}

let updatePending = false;
let pendingKeys = new Set();
let fullUpdatePending = false;

function handleMultiplierChange(e) {
  if (!multipliersOverlay.isOpen) return;
  const overlayEl = multipliersOverlay.overlayEl;
  if (!overlayEl) return;
  
  if (e && e.detail && e.detail.key) {
    pendingKeys.add(e.detail.key);
  } else {
    fullUpdatePending = true;
  }
  
  if (!updatePending) {
    updatePending = true;
    requestAnimationFrame(() => {
      updatePending = false;
      const keysToUpdate = fullUpdatePending ? null : Array.from(pendingKeys);
      pendingKeys.clear();
      fullUpdatePending = false;
      populateMultipliersOverlay(overlayEl, keysToUpdate);
    });
  }
}

const multipliersOverlay = createSASOverlay({
  id: 'multipliers-overlay',
  title: 'Multipliers',
  containerClass: 'currencies-grid',
  focusSelector: '.currency-row, .currencies-grid',
  onRender: (overlayEl) => {
    populateMultipliersOverlay(overlayEl);
    window.addEventListener('currency:multiplier', handleMultiplierChange);
    window.addEventListener('ccc:upgrades:changed', handleMultiplierChange);
    window.addEventListener('currency:unlock', handleMultiplierChange);
    window.addEventListener('xp:unlock', handleMultiplierChange);
    window.addEventListener('unlock:change', handleMultiplierChange);
    // Might want more events if level multipliers change differently
  },
  onClose: () => {
    window.removeEventListener('currency:multiplier', handleMultiplierChange);
    window.removeEventListener('ccc:upgrades:changed', handleMultiplierChange);
    window.removeEventListener('currency:unlock', handleMultiplierChange);
    window.removeEventListener('xp:unlock', handleMultiplierChange);
    window.removeEventListener('unlock:change', handleMultiplierChange);
    if (multipliersOverlay.overlayEl) {
      const rows = multipliersOverlay.overlayEl.querySelectorAll('.currency-row');
      rows.forEach(row => {
        if (row._cleanupDropdown) row._cleanupDropdown();
      });
    }
  }
});

export function openMultipliersOverlay() {
  multipliersOverlay.open();
}

export function closeMultipliersOverlay(force = false) {
  multipliersOverlay.close(force);
}
