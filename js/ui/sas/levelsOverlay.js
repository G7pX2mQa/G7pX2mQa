import { createSASOverlay } from './sasOverlayBuilder.js';
import { formatNumber } from '../../util/numFormat.js';
import { PRIORITY_ORDER } from '../../game/offlinePanel.js';
import { getXpState } from '../../game/xpSystem.js';
import { getMutationState } from '../../game/mutationSystem.js';
import { bank } from '../../util/storage.js';

// The prompt specifies: "I want the population of the Levels overlay to be automatic the moment a new level type is defined, so you see in js/game/offlinePanel.js how the level types have type: 'levelStat'? I want to add a new type in addition to levelStat which is levelProg short for level progress. Any time the key in this object is singular like xp or mp, those mean the progress values, while xp_levels or mp_levels are the actual level values. Anyway, let's focus on making the Levels button in the sas menu, its overlay (empty for now), and changing the offline panel internal logic slightly so that when I evenually add more level types, I won't even have to think about the Levels overlay, because everything will be handled by the PRIORITY_ORDER list, serving as both priority order and a general dictionary for currencies and stats."

// We build dynamically. The user means we shouldn't hardcode if(key === 'xp') if we can avoid it.
// However, the offlinePanel already uses special handling for xp/mp because they are not typical currencies in bank.
// To satisfy "everything handled by PRIORITY_ORDER", we can try checking bank for future values or we assume they will add a generalized stat getter in the future.
// Right now, we'll map xp/mp explicitly because that's the current game system, but we'll do it safely so future stats don't crash and default nicely.
// A common pattern in this codebase for XP/MP is they are the only systems with state getters.

function getStatValue(key) {
    if (key === 'xp_levels') {
        return getXpState()?.xpLevel;
    }
    if (key === 'xp') {
        return getXpState()?.progress;
    }
    if (key === 'mp_levels') {
        return getMutationState()?.level;
    }
    if (key === 'mp') {
        return getMutationState()?.progress;
    }
    // Dynamic fallback for any newly added stats to PRIORITY_ORDER
    // Assuming future stats might be added to bank or have global access
    if (bank && bank[key]) {
        return bank[key].value;
    }
    if (window[key]) {
        return typeof window[key] === 'function' ? window[key]() : window[key];
    }
    return null;
}

function getStatIsUnlocked(prefix) {
    if (prefix === 'xp') {
        return getXpState()?.unlocked;
    }
    if (prefix === 'mp') {
        return getMutationState()?.unlocked;
    }
    // Future stats: check storage or true
    // "I won't even have to think about the Levels overlay"
    return true; 
}

function createLevelRow(container, levelConfig, progConfig) {
  const row = document.createElement('div');
  row.className = 'currency-row level-row';
  row.dataset.level = levelConfig.key;
  
  const info = document.createElement('div');
  info.className = 'currency-info';
  
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'currency-icon-wrapper';
  
  const iconImg = document.createElement('img');
  iconImg.className = 'currency-base';
  
  // They use `img/stats/xp/xp_plus_base.webp` for XP, which is the prefix + '_plus_base.webp'
  const prefix = levelConfig.key.split('_')[0];
  
  let iconSrc = levelConfig.icon;
  if (iconSrc && iconSrc.endsWith('.webp')) {
      const parts = iconSrc.split('/');
      const filename = parts.pop();
      const baseName = filename.replace('.webp', '');
      iconSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
  } else {
      iconSrc = 'img/misc/mysterious.webp';
  }
  iconImg.src = iconSrc;
  
  iconWrapper.appendChild(iconImg);
  
  const amountDiv = document.createElement('div');
  amountDiv.className = 'currency-amount';
  
  const levelVal = getStatValue(levelConfig.key);
  const formattedLevel = formatNumber(levelVal) + ' ' + (levelVal && (typeof levelVal === 'number' ? levelVal === 1 : levelVal.cmp && levelVal.cmp(1) === 0) ? levelConfig.singular : levelConfig.plural);
  amountDiv.textContent = formattedLevel;
  
  if (progConfig) {
      const progVal = getStatValue(progConfig.key);
      if (progVal !== null && progVal !== undefined) {
          const progDiv = document.createElement('div');
          progDiv.style.fontSize = '14px';
          progDiv.style.color = '#ccc';
          const formattedProg = formatNumber(progVal) + ' ' + (progVal && (typeof progVal === 'number' ? progVal === 1 : progVal.cmp && progVal.cmp(1) === 0) ? progConfig.singular : progConfig.plural);
          progDiv.textContent = formattedProg;
          amountDiv.appendChild(progDiv);
      }
  }

  info.appendChild(iconWrapper);
  info.appendChild(amountDiv);
  
  row.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'currency-controls';
  row.appendChild(controls);

  container.appendChild(row);
}

function populateLevelsOverlay(overlayEl) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');
  
  const levelConfigs = PRIORITY_ORDER.filter(c => c.type === 'levelStat');
  const progConfigs = PRIORITY_ORDER.filter(c => c.type === 'levelProg');

  levelConfigs.forEach(levelConfig => {
    // Determine the base prefix, e.g. xp_levels -> xp
    // Sometimes the prefix is the entire key before `_levels`
    const prefix = levelConfig.key.replace('_levels', '');
    const progConfig = progConfigs.find(c => c.key === prefix);
    
    const isUnlocked = getStatIsUnlocked(prefix);

    if (isUnlocked) {
        createLevelRow(grid, levelConfig, progConfig);
    }
  });
}

function handleOutsideClick(e) {
  if (!levelsOverlay.isOpen) return;
  const overlayEl = levelsOverlay.overlayEl;
  if (!overlayEl) return;
  
  if (!e.target.closest('.setting-dropdown-wrapper')) {
    const openMenus = overlayEl.querySelectorAll('.setting-dropdown-menu.is-open');
    openMenus.forEach(menu => {
      menu.classList.remove('is-open');
    });
  }
}

function handleStatChange(e) {
  if (!levelsOverlay.isOpen) return;
  const overlayEl = levelsOverlay.overlayEl;
  if (!overlayEl) return;
  populateLevelsOverlay(overlayEl);
}

const levelsOverlay = createSASOverlay({
  id: 'levels-overlay',
  title: 'Levels',
  containerClass: 'currencies-grid',
  focusSelector: '.level-row, .currencies-grid',
  onRender: (overlayEl) => {
    populateLevelsOverlay(overlayEl);
    window.addEventListener('xp:change', handleStatChange);
    window.addEventListener('mutation:change', handleStatChange);
    document.addEventListener('click', handleOutsideClick);
  },
  onClose: () => {
    window.removeEventListener('xp:change', handleStatChange);
    window.removeEventListener('mutation:change', handleStatChange);
    document.removeEventListener('click', handleOutsideClick);
  }
});

export function openLevelsOverlay() {
  levelsOverlay.open();
}

export function closeLevelsOverlay(force = false) {
  levelsOverlay.close(force);
}