import { createSASOverlay } from './sasOverlayBuilder.js';
import { RESOURCE_REGISTRY, RESOURCE_REGISTRY_EXTRAS } from '../../game/offlinePanel.js';
import { bank, CURRENCIES, isCurrencyUnlocked } from '../../util/storage.js';
import { formatMultForUi } from '../../util/numFormat.js';
import { getXpGainMultiplier, isXpSystemUnlocked } from '../../game/xpSystem.js';
import { getMutationGainMultiplier, isMutationUnlocked } from '../../game/mutationSystem.js';
import { getRpMult } from '../merchantTabs/labTab.js';
import { getFpMultiplier, isFlowUnlocked } from '../merchantTabs/flowTab.js';
import { createDropdown } from "./dropdownUtils.js";
import { isLabUnlocked } from '../../game/surgeEffects.js';

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

  const amountDiv = document.createElement('div');
  amountDiv.classList.add('multipliers-amount');
  amountDiv.classList.add('currency-amount');
  amountDiv.style.flex = 'none';
  amountDiv.style.marginLeft = '10px';
  amountDiv.innerHTML = `${config?.plural || config?.singular || key}: ${multiplierText}x`;

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

function populateMultipliersOverlay(overlayEl) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');

  const processResource = (config) => {
    let unlocked = false;
    let multiplier = 1;
    let isCurrency = false;

    if (config.key === 'xp') {
      unlocked = isXpSystemUnlocked();
      if (unlocked) multiplier = getXpGainMultiplier();
    } else if (config.key === 'mp') {
      unlocked = isMutationUnlocked();
      if (unlocked) multiplier = getMutationGainMultiplier();
    } else if (config.key === 'research_levels') {
      unlocked = isLabUnlocked();
      if (unlocked) multiplier = getRpMult();
    } else if (config.key === 'waterwheel_levels') {
      unlocked = isFlowUnlocked();
      if (unlocked) multiplier = getFpMultiplier();
    } else if (config.type === 'currency' && config.key !== 'voidGems') {
      unlocked = isCurrencyUnlocked(config.key);
      if (unlocked && bank[config.key] && bank[config.key].mult) {
        try {
          multiplier = bank[config.key].mult.get();
        } catch (e) {
          multiplier = 1;
        }
      }
      isCurrency = true;
    } else {
      // Unhandled or explicitly ignored
      return;
    }

    if (unlocked) {
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


      createMultiplierRow(grid, config.key, iconSrc, baseSrc, formatMultForUi(multiplier), overrides);
    }
  };

  // We loop exactly over RESOURCE_REGISTRY to preserve the intertwined visual priority order.
  RESOURCE_REGISTRY.forEach(config => {
      processResource(config);
  });
}

function handleMultiplierChange(e) {
  if (!multipliersOverlay.isOpen) return;
  const overlayEl = multipliersOverlay.overlayEl;
  if (!overlayEl) return;
  populateMultipliersOverlay(overlayEl);
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
