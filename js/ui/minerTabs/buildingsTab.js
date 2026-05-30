import { getActiveSlot } from '../../util/storage.js';

const BUILDINGS_UNLOCKED_KEY_BASE = 'ccc:buildingsUnlocked';

export function isBuildingsUnlocked() {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${BUILDINGS_UNLOCKED_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setBuildingsUnlocked(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${BUILDINGS_UNLOCKED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${BUILDINGS_UNLOCKED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
}

export function initBuildingsPanel(minerOverlayEl, minerSheetEl, tabsEl, panelsWrapEl) {
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'merchant-tab';
  tabBtn.dataset.tab = 'buildings';
  tabBtn.textContent = 'Buildings';
  tabBtn.title = 'Buildings';
  
  const panel = document.createElement('section');
  panel.className = 'merchant-panel buildings-tab';
  panel.id = 'miner-panel-buildings';
  
  const placeholder = document.createElement('div');
  placeholder.style.padding = '16px';
  placeholder.textContent = 'Buildings coming soon...';
  
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
  
  updateBuildingsPanelVisibility(minerSheetEl);
}

export function updateBuildingsPanelVisibility(minerSheetEl) {
  const tabsEl = minerSheetEl.querySelector('.merchant-tabs');
  if (!tabsEl) return;
  const tabBtn = tabsEl.querySelector('[data-tab="buildings"]');
  if (!tabBtn) return;
  
  if (isBuildingsUnlocked()) {
    tabBtn.textContent = 'Buildings';
    tabBtn.title = 'Buildings';
    tabBtn.classList.remove('is-locked');
    tabBtn.disabled = false;
  } else {
    tabBtn.textContent = '???';
    tabBtn.title = '???';
    tabBtn.classList.add('is-locked');
    tabBtn.disabled = true;
    if (tabBtn.classList.contains('is-active')) {
      const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
      if (dlgTab) dlgTab.click();
    }
  }
}

window.onBuildingsUpgradeUnlocked = function() {
  setBuildingsUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-sheet');
  if (minerSheetEl) {
      updateBuildingsPanelVisibility(minerSheetEl);
  }
};

if (typeof window !== 'undefined') {
  window.resetSystem = window.resetSystem || {};
  Object.assign(window.resetSystem, {
    updateBuildingsPanelVisibility,
  });
}
