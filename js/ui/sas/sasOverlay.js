import { createSASOverlay } from './sasOverlayBuilder.js';
import { openMainSettingsOverlay } from './mainSettingsOverlay.js';
import { openVisualsOverlay } from './visualsOverlay.js';
import { openPerformanceOverlay } from './performanceOverlay.js';
import { openConfirmationsOverlay } from './confirmationsOverlay.js';
import { openCurrenciesOverlay } from './currenciesOverlay.js';
import { openLevelsOverlay } from './levelsOverlay.js';
import { openMultipliersOverlay } from './multipliersOverlay.js';
import { openAchievementsOverlay } from './achievementsOverlay.js';
import { openDiscordOverlay } from './discordOverlay.js';
import { hasDoneForgeReset } from '../merchantTabs/resetTab.js';
import { getXpState } from '../../game/xpSystem.js';

function populateSasButtons(overlayEl) {
  const grid = overlayEl.querySelector('.sas-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');
  
  const mainBtn = document.createElement("button");
  mainBtn.className = "sas-btn";
  mainBtn.textContent = "Main";
  mainBtn.addEventListener("click", () => { openMainSettingsOverlay(); });
  grid.appendChild(mainBtn);

  const visBtn = document.createElement("button");
  visBtn.className = "sas-btn";
  visBtn.textContent = "Visuals";
  visBtn.addEventListener("click", () => { openVisualsOverlay(); });
  if (!hasDoneForgeReset()) {
    visBtn.style.display = 'none';
  }
  grid.appendChild(visBtn);
  // We add an event listener to unhide it.
  const updateVisBtnVisibility = () => {
    if (hasDoneForgeReset()) {
      visBtn.style.display = '';
    }
  };

  window.addEventListener('forge:completed', updateVisBtnVisibility);

  const perfBtn = document.createElement("button");
  perfBtn.className = "sas-btn";
  perfBtn.textContent = "Performance";
  perfBtn.addEventListener("click", () => { openPerformanceOverlay(); });
  grid.appendChild(perfBtn);

  const confBtn = document.createElement("button");
  confBtn.className = "sas-btn";
  confBtn.textContent = "Confirmations";
  confBtn.addEventListener("click", () => { openConfirmationsOverlay(); });
  if (!hasDoneForgeReset()) {
    confBtn.style.display = 'none';
  }
  grid.appendChild(confBtn);
  // We add an event listener to unhide it.
  const updateConfBtnVisibility = () => {
    if (hasDoneForgeReset()) {
      confBtn.style.display = '';
    }
  };
  
  const curBtn = document.createElement("button");
  curBtn.className = "sas-btn sas-btn-currencies";
  curBtn.textContent = "Currencies";
  curBtn.addEventListener("click", () => { openCurrenciesOverlay(); });
  grid.appendChild(curBtn);
  
  const lvlBtn = document.createElement("button");
  lvlBtn.className = "sas-btn sas-btn-levels";
  lvlBtn.textContent = "Levels";
  lvlBtn.addEventListener("click", () => { openLevelsOverlay(); });
  
  // hide if XP is not unlocked
  if (!getXpState()?.unlocked) {
    lvlBtn.style.display = 'none';
  }
  grid.appendChild(lvlBtn);

  const multBtn = document.createElement("button");
  multBtn.className = "sas-btn sas-btn-multipliers";
  multBtn.textContent = "Multipliers";
  multBtn.addEventListener("click", () => { openMultipliersOverlay(); });
  grid.appendChild(multBtn);
  
  const updateLvlBtnVisibility = () => {
    if (getXpState()?.unlocked) {
      lvlBtn.style.display = '';
    } else {
      lvlBtn.style.display = 'none';
    }
  };
  
  window.addEventListener('xp:unlock', updateLvlBtnVisibility);
  window.addEventListener('level:change', (e) => {
    if (e.detail?.prefix === 'xp') {
      updateLvlBtnVisibility();
    }
  });

  const achievementsBtn = document.createElement("button");
  achievementsBtn.className = "sas-btn sas-btn-achievements";
  achievementsBtn.textContent = "Achievements";
  achievementsBtn.addEventListener("click", () => { openAchievementsOverlay(); });
  if (!hasDoneForgeReset()) {
    achievementsBtn.style.display = 'none';
  }
  grid.appendChild(achievementsBtn);

  const updateAchievementsBtnVisibility = () => {
    if (hasDoneForgeReset()) {
      achievementsBtn.style.display = '';
    }
  };

  // Just subscribe to something or rely on global re-render, but better to add an event listener
  window.addEventListener('forge:completed', updateConfBtnVisibility);
  window.addEventListener('forge:completed', updateAchievementsBtnVisibility);

  const backBtn = document.createElement("button");
  backBtn.className = "sas-btn sas-btn-back-menu";
  backBtn.textContent = "Back to Menu";
  backBtn.addEventListener("click", () => {
    const tpOverlay = document.createElement('div');
    tpOverlay.style.position = 'fixed';
    tpOverlay.style.inset = '0';
    tpOverlay.style.backgroundColor = '#000';
    tpOverlay.style.color = '#fff';
    tpOverlay.style.display = 'grid';
    tpOverlay.style.placeItems = 'center';
    tpOverlay.style.zIndex = '99999999';
    tpOverlay.style.fontSize = '24px';
    tpOverlay.textContent = 'Telporting to Menu...';
    document.body.appendChild(tpOverlay);
    
    setTimeout(() => {
      window.location.reload();
    }, 50);
  });
  grid.appendChild(backBtn);
  
  const discordBtn = document.createElement("button");
  discordBtn.className = "sas-btn sas-btn-discord";
  discordBtn.textContent = "Discord";
  discordBtn.addEventListener("click", () => { openDiscordOverlay(); });
  grid.appendChild(discordBtn);
}

const sasOverlay = createSASOverlay({
  id: 'sas-overlay',
  title: 'Stats & Settings',
  containerClass: 'sas-grid',
  // Use default zIndex of 4010 from builder or unset
  zIndex: '',
  focusSelector: '.sas-btn, .sas-grid',
  onRender: (overlayEl) => {
    populateSasButtons(overlayEl);
  }
});

export function openSasOverlay() {
  sasOverlay.open();
}

export function closeSasOverlay(force = false) {
  sasOverlay.close(force);
}
