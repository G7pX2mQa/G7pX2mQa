import { getActiveSlot } from '../../util/storage.js';
import { getHighestDpLevel } from '../../game/dpSystem.js';
import { UC_MATERIAL_DATA } from '../../game/ucSpawner.js';

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

function createBuildingCard(id, title, iconSrc, baseSrc, isLocked, mysteriousText) {
    const btn = document.createElement('button');
    btn.className = 'shop-upgrade';
    if (isLocked) {
        btn.classList.add('is-locked');
    }
    btn.type = 'button';
    btn.dataset.buildingId = id;

    const tile = document.createElement('div');
    tile.className = 'shop-tile';

    const baseImg = document.createElement('img');
    baseImg.className = 'base';
    baseImg.src = isLocked ? 'img/misc/mysterious_plus_base.webp' : baseSrc;
    baseImg.alt = '';

    const iconImg = document.createElement('img');
    iconImg.className = 'icon';
    // If it's locked, just no icon, because base covers it
    iconImg.src = isLocked ? '' : iconSrc;
    iconImg.alt = '';
    
    if (isLocked || !iconSrc) {
        iconImg.style.display = 'none';
        iconImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // Transparent 1x1 gif
    } else {
        iconImg.style.display = '';
    }
    
    tile.appendChild(baseImg);
    tile.appendChild(iconImg);
    btn.appendChild(tile);

    return { btn, baseImg, iconImg };
}

function renderBuildingsGrid(gridEl) {
    gridEl.innerHTML = '';

    let highestDepth = 0;
    try {
        const hDp = getHighestDpLevel();
        if (hDp) highestDepth = Number(hDp.toString());
    } catch {}

    const buildings = [];
    
    // 1. Core Building
    buildings.push({
        id: 'core',
        title: 'Core Building',
        iconSrc: '',
        baseSrc: 'img/currencies/core/core_plus_base.webp',
        isLocked: false,
        mysteriousText: ''
    });

    // 2. Crystal Building
    buildings.push({
        id: 'crystal',
        title: 'Crystal Building',
        iconSrc: '',
        baseSrc: 'img/currencies/crystal/crystal_plus_base.webp',
        isLocked: true,
        mysteriousText: 'Perform the ??? reset to reveal this Building'
    });

    // 3-12. Material Buildings (Stone to Prismatium)
    const baseIconStr = 'img/currencies/scrap/scrap_base.webp';
    for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
        const mat = UC_MATERIAL_DATA[i];
        const isLocked = mat.name === 'stone' ? false : highestDepth < mat.start;
        buildings.push({
            id: mat.name,
            title: mat.name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Building',
            iconSrc: `img/materials/${mat.name}.webp`,
            baseSrc: baseIconStr,
            isLocked: isLocked,
            mysteriousText: `Reach Depth: ${mat.start}m to reveal this Building`
        });
    }

    buildings.forEach(b => {
        const card = createBuildingCard(b.id, b.title, b.iconSrc, b.baseSrc, b.isLocked, b.mysteriousText);
        
        if (b.isLocked) {
            card.btn.title = 'Hidden Building';
            card.btn.addEventListener('click', () => {
                openMysteriousBuildingOverlay(b.mysteriousText);
            });
        } else {
            card.btn.title = 'Left-click: View Building • Right-click: Buy Max';
            // Currently unlocked buildings do nothing
        }
        
        gridEl.appendChild(card.btn);
    });
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
  
  const scroller = document.createElement('div');
  scroller.className = 'shop-scroller';
  scroller.style.height = '100%';
  scroller.style.position = 'relative';

  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.id = 'buildings-grid';
  grid.setAttribute('role', 'grid');

  scroller.appendChild(grid);
  panel.appendChild(scroller);
  
  tabsEl.appendChild(tabBtn);
  panelsWrapEl.appendChild(panel);
  
  tabBtn.addEventListener('click', () => {
    const allTabs = tabsEl.querySelectorAll('.merchant-tab');
    const allPanels = panelsWrapEl.querySelectorAll('.merchant-panel');
    allTabs.forEach(t => t.classList.remove('is-active'));
    allPanels.forEach(p => p.classList.remove('is-active'));
    tabBtn.classList.add('is-active');
    panel.classList.add('is-active');
    
    // re-render the grid when the tab is clicked, just in case depth changed
    renderBuildingsGrid(grid);
  });
  
  updateBuildingsPanelVisibility(minerSheetEl);
  
  // Render grid immediately if unlocked, though typically it happens on click
  if (isBuildingsUnlocked()) {
      renderBuildingsGrid(grid);
  }
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

function ensureMysteriousBuildingOverlay() {
    if (document.getElementById('mysterious-building-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mysterious-building-overlay';
    overlay.className = 'upg-overlay';
    
    const sheet = document.createElement('div');
    sheet.className = 'upg-sheet';
    
    const grabber = document.createElement('div');
    grabber.className = 'upg-grabber';
    grabber.innerHTML = `<div class="grab-handle"></div>`;
    
    const header = document.createElement('header');
    header.className = 'upg-header';
    
    const content = document.createElement('div');
    content.className = 'upg-content';
    
    const actions = document.createElement('div');
    actions.className = 'upg-actions';
    
    sheet.append(grabber, header, content, actions);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) {
            closeMysteriousBuildingOverlay();
        }
    });
}

function openMysteriousBuildingOverlay(mysteriousText) {
    ensureMysteriousBuildingOverlay();
    const overlay = document.getElementById('mysterious-building-overlay');
    const sheet = overlay.querySelector('.upg-sheet');
    const header = overlay.querySelector('.upg-header');
    const content = overlay.querySelector('.upg-content');
    const actions = overlay.querySelector('.upg-actions');
    
    header.innerHTML = `
        <div class="upg-title">Hidden Building</div>
    `;

    content.innerHTML = `
        <div class="upg-desc centered lock-desc">${mysteriousText}</div>
    `;

    actions.innerHTML = `
        <button type="button" class="shop-close">Close</button>
    `;
    
    const closeBtn = actions.querySelector('.shop-close');
    closeBtn.addEventListener('click', closeMysteriousBuildingOverlay);

    overlay.classList.add('is-open');
    sheet.style.transform = 'translateY(100%)';
    void sheet.offsetHeight;
    sheet.style.transform = 'translateY(0)';
}

function closeMysteriousBuildingOverlay() {
    const overlay = document.getElementById('mysterious-building-overlay');
    if (!overlay) return;
    const sheet = overlay.querySelector('.upg-sheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
        overlay.classList.remove('is-open');
    }, 180);
}
