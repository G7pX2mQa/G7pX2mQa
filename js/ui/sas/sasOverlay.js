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
import { openShortcutsOverlay } from './shortcutsOverlay.js';
import { hasDoneForgeReset, isForgeUnlocked } from '../merchantTabs/resetTab.js';
import { hasMetMerchant, MERCHANT_MET_EVENT } from '../merchantTabs/dlgTab.js';
import { getXpState } from '../../game/xpSystem.js';
import { IS_MOBILE } from '../../main.js';
import { disableGlobalOverlayEsc } from '../../util/globalOverlayEsc.js';
import { clearActiveSlot } from '../../util/storage.js';
import { enterArea, AREAS } from '../../main.js';

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
  if (!isForgeUnlocked()) {
    confBtn.style.display = 'none';
  }
  grid.appendChild(confBtn);
  // We add an event listener to unhide it.
  const updateConfBtnVisibility = () => {
    if (isForgeUnlocked()) {
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
  window.addEventListener('unlock:change', (e) => {
    if (e.detail?.key === 'forge') updateConfBtnVisibility();
  });
  window.addEventListener('forge:completed', updateAchievementsBtnVisibility);

  const backBtn = document.createElement("button");
  backBtn.className = "sas-btn sas-btn-back-menu";
  backBtn.textContent = "Back to Menu";
  backBtn.addEventListener("click", () => {
    // This now triggers saveSlot:change with null which clears most cache.
    clearActiveSlot();

    // Add the class temporarily to document body so overlays skip transition logic
    document.body.classList.add('no-overlay-transitions');
    
    // Close all overlays forcefully without transitions
    window.dispatchEvent(new CustomEvent('ccc:close-delve-overlays'));
    window.dispatchEvent(new CustomEvent('shop:close'));
    closeSasOverlay(true);
    
    // Instantly force close all active overlays handled by the sas system via DOM
    document.querySelectorAll('.sas-overlay.is-open').forEach(el => {
        el.classList.remove('is-open');
        el.style.transition = 'none'; // Force no transition
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        
        // Find inner sheet and remove transition
        const sheet = el.querySelector('.sas-sheet');
        if (sheet) {
            sheet.style.transition = 'none';
            sheet.style.transform = 'translateY(100%)';
        }
    });
    
    // Clear notifications and popups
    import('../notifications.js').then(m => {
      if (m.nukeNotifications) m.nukeNotifications(true);
    }).catch(()=>{});
    const notificationsEl = document.getElementById('notifications-container');
    if (notificationsEl) notificationsEl.innerHTML = '';
    
    // Close other possible overlays
    import('../merchantTabs/dlgTab.js').then(m => m.closeMerchant && m.closeMerchant()).catch(()=>{});
    import('../minerTabs/dlgTab.js').then(m => m.closeMiner && m.closeMiner()).catch(()=>{});
    import('../shopOverlay.js').then(m => m.closeShop && m.closeShop(true)).catch(()=>{});
    
    // We already exported clearActivePopups and handled saveSlot:change in popups.js
    // so popups should be clearing themselves nicely when clearActiveSlot is called.
    
    // Switch the area which handles stopping spawner, game elements etc
    enterArea(AREAS.MENU);
    
    // Remove the class added above just in case
    setTimeout(() => {
        document.body.classList.remove('no-overlay-transitions');
    }, 50);
  });
  grid.appendChild(backBtn);
  
  const shortcutsBtn = document.createElement("button");
  shortcutsBtn.className = "sas-btn sas-btn-shortcuts";
  shortcutsBtn.textContent = "Shortcuts";
  shortcutsBtn.addEventListener("click", () => { openShortcutsOverlay(); });
  
  if (IS_MOBILE || !hasMetMerchant()) {
    shortcutsBtn.style.display = 'none';
  }

  window.addEventListener(MERCHANT_MET_EVENT, () => {
    if (!IS_MOBILE) {
      shortcutsBtn.style.display = '';
    }
  });

  grid.appendChild(shortcutsBtn);

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
