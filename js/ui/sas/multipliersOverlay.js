import { createSASOverlay } from './sasOverlayBuilder.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { bank, CURRENCIES, isCurrencyUnlocked } from '../../util/storage.js';
import { formatMultForUi } from '../../util/numFormat.js';
import { getXpGainMultiplier, isXpSystemUnlocked } from '../../game/xpSystem.js';
import { getMutationGainMultiplier, isMutationUnlocked } from '../../game/mutationSystem.js';

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
  amountDiv.className = 'currency-amount';
  amountDiv.style.flex = 'none';
  amountDiv.style.marginLeft = '10px';
  amountDiv.innerHTML = `${multiplierText}x`;

  info.appendChild(iconWrapper);
  info.appendChild(amountDiv);

  row.appendChild(info);

  container.appendChild(row);
}

function getUnlockedCurrencies() {
  return Object.values(CURRENCIES).filter(c => isCurrencyUnlocked(c));
}

function populateMultipliersOverlay(overlayEl) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');

  // Add Currencies
  const currenciesList = getUnlockedCurrencies();
  currenciesList.forEach(currency => {
    const config = RESOURCE_REGISTRY.find(c => c.key === currency);
    const iconSrc = config?.icon || "img/misc/mysterious.webp";
    const baseSrc = config?.baseIcon || "img/misc/locked.webp";
    
    let multiplier = 1;
    if (bank[currency] && bank[currency].mult) {
      try {
        multiplier = bank[currency].mult.get();
      } catch (e) {
        multiplier = 1;
      }
    }

    createMultiplierRow(grid, currency, iconSrc, baseSrc, formatMultForUi(multiplier), config);
  });

  // Add Levels (only type: 'levelProg', meaning xp, mp, etc.)
  const levelProgs = RESOURCE_REGISTRY.filter(c => c.type === 'levelProg');
  levelProgs.forEach(config => {
    let unlocked = false;
    let multiplier = 1;

    if (config.key === 'xp') {
      unlocked = isXpSystemUnlocked();
      if (unlocked) multiplier = getXpGainMultiplier();
    } else if (config.key === 'mp') {
      unlocked = isMutationUnlocked();
      if (unlocked) multiplier = getMutationGainMultiplier();
    } else {
       // fallback for other prog types if added
       if (typeof config.getState === 'function') {
         const state = config.getState();
         unlocked = state?.unlocked || state?.isUnlocked || false;
       }
       // We would need specific multiplier getters if there were more, but the task says:
       // "RP and FP do not exist in the resource registry and also they shouldn't... so we can figure something else out"
       // We will just show xp and mp for now, which are the main ones.
    }

    if (unlocked) {
      let iconSrc = config.icon || "img/misc/mysterious.webp";
      let baseSrc = iconSrc;
      if (iconSrc && iconSrc.endsWith('.webp')) {
          const parts = iconSrc.split('/');
          const filename = parts.pop();
          const baseName = filename.replace('.webp', '');
          baseSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
      }

      createMultiplierRow(grid, config.key, iconSrc, baseSrc, formatMultForUi(multiplier), config);
    }
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
    // Might want more events if level multipliers change differently
  },
  onClose: () => {
    window.removeEventListener('currency:multiplier', handleMultiplierChange);
    window.removeEventListener('ccc:upgrades:changed', handleMultiplierChange);
    window.removeEventListener('currency:unlock', handleMultiplierChange);
    window.removeEventListener('xp:unlock', handleMultiplierChange);
  }
});

export function openMultipliersOverlay() {
  multipliersOverlay.open();
}

export function closeMultipliersOverlay(force = false) {
  multipliersOverlay.close(force);
}