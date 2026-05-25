import { getActiveSlot } from '../../util/storage.js';

const SELL_UNLOCKED_KEY_BASE = 'ccc:sellUnlocked';

export function isSellUnlocked() {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${SELL_UNLOCKED_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setSellUnlocked(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${SELL_UNLOCKED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${SELL_UNLOCKED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
}

export function initSellPanel(minerSheetEl, tabsEl, panelsWrapEl) {
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'merchant-tab';
  tabBtn.dataset.tab = 'sell';
  tabBtn.textContent = 'Sell';
  tabBtn.title = 'Sell';
  
  const panel = document.createElement('section');
  panel.className = 'merchant-panel';
  panel.id = 'miner-panel-sell';
  panel.innerHTML = ``;
  
  // Tab switching logic is usually handled by `bindRapidActivation` or something similar.
  // We'll let the overlay code wire up tab clicks, or we wire it up here if it isn't centralized.
  
  tabBtn.addEventListener('click', () => {
    // Basic tab switching
    const allTabs = tabsEl.querySelectorAll('.merchant-tab');
    const allPanels = panelsWrapEl.querySelectorAll('.merchant-panel');
    allTabs.forEach(t => t.classList.remove('is-active'));
    allPanels.forEach(p => p.classList.remove('is-active'));
    
    tabBtn.classList.add('is-active');
    panel.classList.add('is-active');
  });

  // Also hook up existing dialogue tab to hide sell panel
  const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
  if (dlgTab) {
    dlgTab.addEventListener('click', () => {
      panel.classList.remove('is-active');
      dlgTab.classList.add('is-active');
    });
  }

  tabsEl.appendChild(tabBtn);
  panelsWrapEl.appendChild(panel);

  return { tabBtn, panel };
}


export function updateSellPanelVisibility(minerSheetEl) {
  const tabsEl = minerSheetEl.querySelector('.merchant-tabs');
  if (!tabsEl) return;
  const tabBtn = tabsEl.querySelector('[data-tab="sell"]');
  if (!tabBtn) return;
  
  if (isSellUnlocked()) {
    tabBtn.textContent = 'Sell';
    tabBtn.title = 'Sell';
    tabBtn.classList.remove('is-locked');
    tabBtn.disabled = false;
  } else {
    tabBtn.textContent = '???';
    tabBtn.title = '???';
    tabBtn.classList.add('is-locked');
    tabBtn.disabled = true;
  }
}


// Global hook for upgrades.js
window.onSellUpgradeUnlocked = function() {
  setSellUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-sheet');
  if (minerSheetEl) {
      updateSellPanelVisibility(minerSheetEl);
  }
}
