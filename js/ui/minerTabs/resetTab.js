import { getActiveSlot } from '../../util/storage.js';

const COMBINE_UNLOCKED_KEY_BASE = 'ccc:combineUnlocked';

export function isCombineUnlocked() {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${COMBINE_UNLOCKED_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setCombineUnlocked(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${COMBINE_UNLOCKED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${COMBINE_UNLOCKED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
}

export function initCombinePanel(minerOverlayEl, minerSheetEl, tabsEl, panelsWrapEl) {
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'merchant-tab';
  tabBtn.dataset.tab = 'reset';
  tabBtn.textContent = 'Reset';
  tabBtn.title = 'Reset';
  
  const panel = document.createElement('section');
  panel.className = 'merchant-panel reset-tab';
  panel.id = 'miner-panel-reset';
  
  const placeholder = document.createElement('div');
  placeholder.style.padding = '16px';
  placeholder.textContent = 'Combine reset coming soon...';
  
  panel.appendChild(placeholder);
  
  tabsEl.appendChild(tabBtn);
  panelsWrapEl.appendChild(panel);
  
  tabBtn.addEventListener('click', () => {
    const allTabs = tabsEl.querySelectorAll('.merchant-tab');
    const allPanels = panelsWrapEl.querySelectorAll('.merchant-panel');
    allTabs.forEach(t => t.classList.remove('is-active'));
    allPanels.forEach(p => p.classList.remove('is-active'));
    tabBtn.classList.add('is-active');
    panel.classList.add('is-active');
  });
  
  updateCombinePanelVisibility(minerSheetEl);
}

export function updateCombinePanelVisibility(minerSheetEl) {
  const tabsEl = minerSheetEl.querySelector('.merchant-tabs');
  if (!tabsEl) return;
  const tabBtn = tabsEl.querySelector('[data-tab="reset"]');
  if (!tabBtn) return;
  
  if (isCombineUnlocked()) {
    tabBtn.textContent = 'Reset';
    tabBtn.title = 'Reset';
    tabBtn.classList.remove('is-locked');
    tabBtn.disabled = false;
  } else {
    tabBtn.textContent = '???';
    tabBtn.title = '???';
    tabBtn.classList.add('is-locked');
    tabBtn.disabled = true;
  }
}

window.onCombineUpgradeUnlocked = function() {
  setCombineUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-sheet');
  if (minerSheetEl) {
      updateCombinePanelVisibility(minerSheetEl);
  }
};