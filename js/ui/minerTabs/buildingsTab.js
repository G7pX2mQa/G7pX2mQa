import { getActiveSlot } from '../../util/storage.js';
import { getHighestDpLevel } from '../../game/dpSystem.js';
import { UC_MATERIAL_DATA } from '../../game/ucSpawner.js';
import { setupDragToClose } from '../shopOverlay.js';
import { BigNum, approxLog10BigNum, bigNumFromLog10 } from '../../util/bigNum.js';
import { levelBigNumToNumber, evaluateBulkPurchase } from '../../game/upgrades.js';
import { formatMultForUi, formatNumber } from '../../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { playPurchaseSfx } from '../shopOverlay.js';


const BUILDINGS_UNLOCKED_KEY_BASE = 'ccc:buildingsUnlocked';
const BUILDING_ITEM_UNLOCKED_KEY_BASE = 'ccc:buildingItemUnlocked';

export function isBuildingUnlocked(id) {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${BUILDING_ITEM_UNLOCKED_KEY_BASE}:${id}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setBuildingUnlocked(id, value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${BUILDING_ITEM_UNLOCKED_KEY_BASE}:${id}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${BUILDING_ITEM_UNLOCKED_KEY_BASE}:${id}:${slotKey}`);
      }
    } catch {}
  }
}

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

function createBuildingCard(id, title, iconSrc, baseSrc, isLocked, mysteriousText, level, plusLevel) {
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

    if (!isLocked && level !== undefined) {
        const badge = document.createElement('div');
        badge.className = 'level-badge';
        
        let hasPlus = false;
        if (plusLevel && typeof plusLevel.isZero === 'function') {
             hasPlus = !plusLevel.isZero();
        } else if (plusLevel) {
             hasPlus = true;
        }

        let needsTwoLines = false;
        if (hasPlus) {
            badge.classList.add('can-buy');
            let plusLevelStr = formatNumber(plusLevel);
            let plainPlusStr = String(plusLevelStr || '').replace(/,/g, '');
            let isInf = /∞|Infinity/i.test(plainPlusStr);
            let numericPlus = parseFloat(plainPlusStr);
            let over999 = Number.isFinite(numericPlus) ? numericPlus >= 1000 : (isInf || /^\d{4,}$/.test(plainPlusStr));
            needsTwoLines = over999;
        }
        
        if (needsTwoLines) {
            badge.classList.add('two-line');
            badge.innerHTML = `<span class="badge-lvl">${level}</span><span class="badge-plus">(+${formatNumber(plusLevel)})</span>`;
        } else if (hasPlus) {
            badge.textContent = `${level} (+${formatNumber(plusLevel)})`;
        } else {
            badge.textContent = level;
        }
        
        tile.appendChild(badge);
    }

    btn.appendChild(tile);

    return { btn, baseImg, iconImg };
}

export function renderBuildingsGrid(gridEl) {
    gridEl.innerHTML = '';

    let highestDepth = 0;
    try {
        const hDp = getHighestDpLevel();
        if (hDp) highestDepth = Number(hDp.toString());
    } catch {}

    const buildings = [];
    
    // 1. Core Building
    if (!isBuildingUnlocked('core')) setBuildingUnlocked('core', true);
    buildings.push({
        id: 'core',
        title: 'Core Building',
        iconSrc: '',
        baseSrc: 'img/currencies/core/core_plus_base.webp',
        isLocked: false,
        mysteriousText: '',
        level: formatNumber(getBuildingLevel("core")),
        plusLevel: getAffordableBuildingLevels("core")
    });

    // 2. Crystal Building
    const crystalLocked = !isBuildingUnlocked('crystal');
    buildings.push({
        id: 'crystal',
        title: 'Crystal Building',
        iconSrc: '',
        baseSrc: 'img/currencies/crystal/crystal_plus_base.webp',
        isLocked: crystalLocked,
        mysteriousText: 'Perform the ??? reset to reveal this Building',
        level: formatNumber(getBuildingLevel("crystal")),
        plusLevel: getAffordableBuildingLevels("crystal")
    });

    // 3-12. Material Buildings (Stone to Prismatium)
    const baseIconStr = 'img/currencies/scrap/scrap_base.webp';
    for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
        const mat = UC_MATERIAL_DATA[i];
        let isLocked = true;
        
        if (isBuildingUnlocked(mat.name)) {
            isLocked = false;
        } else {
            const conditionMet = mat.name === 'stone' ? true : highestDepth >= mat.start;
            if (conditionMet) {
                setBuildingUnlocked(mat.name, true);
                isLocked = false;
            }
        }

        buildings.push({
            id: mat.name,
            title: mat.name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Building',
            iconSrc: `img/materials/${mat.name}.webp`,
            baseSrc: baseIconStr,
            isLocked: isLocked,
            mysteriousText: `Reach Depth: ${mat.start}m to reveal this Building`,
            level: formatNumber(getBuildingLevel(mat.name)),
            plusLevel: getAffordableBuildingLevels(mat.name)
        });
    }

    buildings.forEach(b => {
        const card = createBuildingCard(b.id, b.title, b.iconSrc, b.baseSrc, b.isLocked, b.mysteriousText, b.level, b.plusLevel);
        
        if (b.isLocked) {
            card.btn.title = 'Hidden Building';
            card.btn.addEventListener('click', () => {
                openMysteriousBuildingOverlay(b.mysteriousText);
            });
        } else {
            card.btn.title = 'Left-click: View Building • Right-click: Buy Max';
            card.btn.addEventListener('click', () => { openBuildingDetailOverlay(b.id); });
            card.btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                currentBuildingId = b.id;
                handlePurchase('max');
                currentBuildingId = null;
            });

            
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

  document.addEventListener('ccc:buildings:changed', () => {
    if (panel.classList.contains('is-active') && isBuildingsUnlocked()) {
      renderBuildingsGrid(grid);
    }
    // Update the building overlay if it is open
    if (currentBuildingId) {
        updateOverlayUi();
    }
  });

  window.addEventListener('currency:change', () => {
    // Update the building overlay if it is open
    if (currentBuildingId) {
        updateOverlayUi();
    }
  });

  // Listen for depth changes and re-render the grid if the tab is currently active
  window.addEventListener('dp:change', () => {
    if (panel.classList.contains('is-active') && isBuildingsUnlocked()) {
      renderBuildingsGrid(grid);
    }
  });

  let animationFrameId;
  function updateLoop() {
    if (panel.classList.contains('is-active') && isBuildingsUnlocked()) {
      updateBuildingGridBadges(grid);
    }
    animationFrameId = requestAnimationFrame(updateLoop);
  }
  updateLoop();
}

function updateBuildingGridBadges(gridEl) {
    if (!gridEl) return;
    const cards = gridEl.querySelectorAll('.shop-upgrade:not(.is-locked)');
    cards.forEach(card => {
        const id = card.dataset.buildingId;
        if (!id) return;
        
        const levelBn = getBuildingLevel(id);
        const plusLevelBn = getAffordableBuildingLevels(id);
        
        let levelStr = formatNumber(levelBn);
        let plusLevelStr = formatNumber(plusLevelBn);
        
        let hasPlus = false;
        if (plusLevelBn && typeof plusLevelBn.isZero === 'function') {
             hasPlus = !plusLevelBn.isZero();
        } else if (plusLevelBn) {
             hasPlus = true;
        }

        let needsTwoLines = false;
        if (hasPlus) {
            let plainPlusStr = String(plusLevelStr || '').replace(/,/g, '');
            let isInf = /∞|Infinity/i.test(plainPlusStr);
            let numericPlus = parseFloat(plainPlusStr);
            let over999 = Number.isFinite(numericPlus) ? numericPlus >= 1000 : (isInf || /^\d{4,}$/.test(plainPlusStr));
            needsTwoLines = over999;
        }

        let badgeHtml = '';
        let badgePlain = '';

        if (needsTwoLines) {
            badgeHtml = `<span class="badge-lvl">${levelStr}</span><span class="badge-plus">(+${plusLevelStr})</span>`;
        } else if (hasPlus) {
            badgePlain = `${levelStr} (+${plusLevelStr})`;
        } else {
            badgePlain = levelStr;
        }
        
        let badge = card.querySelector('.level-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'level-badge';
            const tile = card.querySelector('.shop-tile');
            if (tile) tile.appendChild(badge);
        }
        
        badge.className = 'level-badge'; // reset class
        if (needsTwoLines) badge.classList.add('two-line');
        if (hasPlus) badge.classList.add('can-buy');
        
        if (badgeHtml) {
            if (badge.innerHTML !== badgeHtml) badge.innerHTML = badgeHtml;
        } else {
            if (badge.textContent !== badgePlain) badge.textContent = badgePlain;
        }
    });
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

const BUILDING_OVERLAY_CLOSE_MS = 120;
const BUILDING_OVERLAY_OPEN_TRANSITION = 'transform var(--shop-anim)';
const BUILDING_OVERLAY_CLOSE_TRANSITION = `transform ${BUILDING_OVERLAY_CLOSE_MS}ms ease-out`;

function applyBuildingOverlayTransition(sheet, transition = BUILDING_OVERLAY_OPEN_TRANSITION) {
    if (!sheet) return;
    sheet.style.transition = transition;
}

function openBuildingOverlaySheet(overlay, sheet) {
    if (!overlay || !sheet) return;
    applyBuildingOverlayTransition(sheet);
    overlay.classList.add('is-open');
    overlay.style.pointerEvents = 'auto';
    sheet.style.transform = 'translateY(100%)';
    void sheet.offsetHeight;
    sheet.style.transform = 'translateY(0)';
}

function finishBuildingOverlayClose(overlay, onClosed) {
    const delay = document.body.classList.contains('no-overlay-transitions') ? 0 : BUILDING_OVERLAY_CLOSE_MS;
    setTimeout(() => {
        overlay.classList.remove('is-open');
        if (typeof onClosed === 'function') onClosed();
    }, delay);
}

function ensureMysteriousBuildingOverlay() {
    if (document.getElementById('mysterious-building-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mysterious-building-overlay';
    overlay.className = 'upg-overlay';
    
    const sheet = document.createElement('div');
    sheet.className = 'upg-sheet';
    applyBuildingOverlayTransition(sheet);
    sheet.style.display = 'flex';
    sheet.style.flexDirection = 'column';
    
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
    
    setupDragToClose(grabber, sheet, 
        () => overlay.classList.contains('is-open'), 
        closeMysteriousBuildingOverlay
    );
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

    openBuildingOverlaySheet(sheet);
}

function closeMysteriousBuildingOverlay() {
    const overlay = document.getElementById('mysterious-building-overlay');
    if (!overlay) return;
    if (overlay.style.pointerEvents === 'none') return;
    overlay.style.pointerEvents = 'none';
    const sheet = overlay.querySelector('.upg-sheet');
    applyBuildingOverlayTransition(sheet);
    sheet.style.transform = 'translateY(100%)';
    finishBuildingOverlayClose(overlay);
}


// ----------------- Building Math & State ----------------- //

const BUILDING_LEVEL_KEY_BASE = 'ccc:buildingLevel';

export const BUILDING_IDS = [
    'core', 'crystal', 'stone', 'copper', 'iron', 'pure_gold', 'diamond', 
    'emerald', 'ruby', 'sapphire', 'unobtainium', 'prismatium'
];

export function getBuildingLevel(id) {
    const slotKey = String(getActiveSlot() ?? 'default');
    if (typeof localStorage === 'undefined') return BigNum.fromInt(0);
    try {
        const val = localStorage.getItem(`${BUILDING_LEVEL_KEY_BASE}:${id}:${slotKey}`);
        if (!val) return BigNum.fromInt(0);
        return BigNum.fromAny(val);
    } catch {
        return BigNum.fromInt(0);
    }
}

export function setBuildingLevel(id, levelBn) {
    const slotKey = String(getActiveSlot() ?? 'default');
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(`${BUILDING_LEVEL_KEY_BASE}:${id}:${slotKey}`, levelBn.toStorage ? levelBn.toStorage() : String(levelBn));
    } catch {}
}

export function addBuildingLevel(id, amountToAddBn) {
    let currentLevel = getBuildingLevel(id);
    let newLevel = currentLevel.add(amountToAddBn);
    setBuildingLevel(id, newLevel);
    return newLevel;
}

export function getBuildingRatio(id) {
    let idx = BUILDING_IDS.indexOf(id);
    if (idx <= 2) return 1.20;
    return 1.20 + ((idx - 2) * 0.04);
}

export function getBuildingCostLog10AtLevel(id, levelBn) {
    const ratio = getBuildingRatio(id);
    const levelNum = levelBigNumToNumber(levelBn);
    
    const softcapStart = 1_000_000_000;
    
    if (levelNum > softcapStart) {
        const delta = levelNum - softcapStart;
        const rate = 2.0665e-12;
        const startRatioLog10 = Math.log10(ratio);
        const ratioLog10 = startRatioLog10 * Math.exp(rate * delta);
        return levelNum * ratioLog10; 
    }
    
    return levelNum * Math.log10(ratio);
}

export function getBuildingCost(id, levelBn) {
    const costLog10 = getBuildingCostLog10AtLevel(id, levelBn);
    return bigNumFromLog10(costLog10).floorToInteger();
}

let _precalcCeil100 = null;
function getPrecalcCeil100() {
    if (_precalcCeil100 !== null) return _precalcCeil100;
    let val = 1;
    for (let i = 0; i < 100; i++) {
        val = Math.ceil(val * 1.2);
    }
    _precalcCeil100 = BigNum.fromAny(val);
    return _precalcCeil100;
}

export function getBuildingBonus(id, levelBn) {
    if (!levelBn || levelBn.isZero?.()) return BigNum.fromInt(1);
    
    const levelNum = levelBigNumToNumber(levelBn);
    
    if (id === 'crystal') {
        return bigNumFromLog10(levelNum * Math.log10(3));
    }
    
    if (levelNum <= 100) {
        let val = 1;
        for (let i = 0; i < levelNum; i++) {
            val = Math.ceil(val * 1.2);
        }
        return BigNum.fromAny(val);
    } else {
        const base100 = getPrecalcCeil100();
        const excess = levelNum - 100;
        const excessMultLog10 = excess * Math.log10(1.2);
        const excessMult = bigNumFromLog10(excessMultLog10);
        return base100.mulBigNumInteger(excessMult);
    }
}

// ----------------- Building Overlay ----------------- //

let overlayEl = null;
let currentBuildingId = null;

export const BUILDING_NAMES = {
    core: 'Reactor', crystal: 'Obelisk', stone: 'Foundry', copper: 'Charger', iron: 'Refinery',
    pure_gold: 'Vault', diamond: 'Oil Rig', emerald: 'Greenhouse', ruby: 'Radiator',
    sapphire: 'Centrifuge', unobtainium: 'Beacon', prismatium: 'Singularity Generator'
};


function getBuildingTotalCostLog10(ratio, startLevel, count) {
    if (count <= 0) return Number.NEGATIVE_INFINITY;

    const lastLevel = startLevel + count - 1;
    
    const softcapStart = 1_000_000_000;
    const rate = 2.0665e-12;
    
    let lastCostLog10;
    if (lastLevel > softcapStart) {
        const delta = lastLevel - softcapStart;
        const startRatioLog10 = Math.log10(ratio);
        const ratioLog10 = startRatioLog10 * Math.exp(rate * delta);
        lastCostLog10 = lastLevel * ratioLog10; 
    } else {
        lastCostLog10 = lastLevel * Math.log10(ratio);
    }
    
    const delta = Math.max(0, lastLevel - softcapStart);
    const localRatioLog10 = Math.log10(ratio) * Math.exp(rate * delta);
    const LN10 = Math.log(10);
    const localRatioLn = localRatioLog10 * LN10;
    
    const negLocalRatioLn = -localRatioLn;
    const denom = -Math.log1p(-Math.exp(negLocalRatioLn));
    
    return lastCostLog10 + (denom / LN10);
}

function evaluateBuildingBulkPurchase(id, startLevelBn, walletBn, maxLevels, ratio) {
    const startLevelNum = levelBigNumToNumber(startLevelBn);
    const walletLog10 = approxLog10BigNum(walletBn);
    let lo = 0;
    let hi = typeof maxLevels === 'number' && isFinite(maxLevels) ? maxLevels : 1e12;
    let best = 0;
    
    if (getBuildingCostLog10AtLevel(id, startLevelBn) > walletLog10) {
        return { count: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    
    if (hi === 1e12) {
        hi = 1;
        while (getBuildingTotalCostLog10(ratio, startLevelNum, hi) <= walletLog10) {
            lo = hi;
            hi *= 2;
            if (hi >= 1e15) {
                hi = 1e15;
                break;
            }
        }
    }

    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const costLog10 = getBuildingTotalCostLog10(ratio, startLevelNum, mid);
        if (costLog10 <= walletLog10) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    
    return {
        count: BigNum.fromAny(best),
        spent: bigNumFromLog10(getBuildingTotalCostLog10(ratio, startLevelNum, best))
    };
}

function getAffordableBuildingLevels(id) {
    if (typeof window === 'undefined' || !window.bank) return BigNum.fromInt(0);
    const currencyKey = BUILDING_CURRENCY_KEYS[id];
    if (!currencyKey) return BigNum.fromInt(0);
    const walletHandle = window.bank[currencyKey];
    if (!walletHandle) return BigNum.fromInt(0);
    
    let walletBn = walletHandle.value instanceof BigNum ? walletHandle.value : BigNum.fromAny(walletHandle.value ?? 0);
    if (walletBn.isZero?.()) return BigNum.fromInt(0);
    
    let startLevelBn = getBuildingLevel(id);
    
    const ratio = getBuildingRatio(id);
    const outcome = evaluateBuildingBulkPurchase(id, startLevelBn, walletBn, 1e12, ratio);
    let count = outcome.count;
    if (typeof count === 'number') count = BigNum.fromAny(count);
    return count || BigNum.fromInt(0);
}

const BUILDING_BONUS_TEXTS = {
    core: "Next level's DP bonus", crystal: "Next level's Coin bonus", stone: "Next level's Scrap bonus",
    copper: "Next level's Stone value bonus", iron: "Next level's Copper value bonus",
    pure_gold: "Next level's Iron value bonus", diamond: "Next level's Pure Gold value bonus",
    emerald: "Next level's Diamond value bonus", ruby: "Next level's Emerald value bonus",
    sapphire: "Next level's Ruby value bonus", unobtainium: "Next level's Sapphire value bonus",
    prismatium: "Next level's Unobtainium value bonus"
};

const BUILDING_CURRENCY_IMAGES = {
    core: 'img/currencies/core/core.webp', crystal: 'img/currencies/crystal/crystal.webp',
    stone: 'img/materials/stone.webp', copper: 'img/materials/copper.webp', iron: 'img/materials/iron.webp',
    pure_gold: 'img/materials/pure_gold.webp', diamond: 'img/materials/diamond.webp',
    emerald: 'img/materials/emerald.webp', ruby: 'img/materials/ruby.webp',
    sapphire: 'img/materials/sapphire.webp', unobtainium: 'img/materials/unobtainium.webp',
    prismatium: 'img/materials/prismatium.webp'
};

const BUILDING_CURRENCY_KEYS = {
    core: 'core', crystal: 'crystal', stone: 'stone', copper: 'copper', iron: 'iron',
    pure_gold: 'pure_gold', diamond: 'diamond', emerald: 'emerald', ruby: 'ruby',
    sapphire: 'sapphire', unobtainium: 'unobtainium', prismatium: 'prismatium'
};

export function initBuildingOverlay() {
    if (document.getElementById('building-detail-overlay')) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'building-detail-overlay';
    overlayEl.className = 'upg-overlay';
    overlayEl.style.zIndex = '9999';

    const sheet = document.createElement('div');
    sheet.className = 'upg-sheet';
    applyBuildingOverlayTransition(sheet);
    sheet.style.display = 'flex';
    sheet.style.flexDirection = 'column';

    const canvasContainer = document.createElement('div');
    canvasContainer.style.position = 'absolute';
    canvasContainer.style.top = '0';
    canvasContainer.style.left = '0';
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '100%';
    canvasContainer.style.zIndex = '0';
    canvasContainer.style.pointerEvents = 'none';
    
    const canvas = document.createElement('canvas');
    canvas.id = 'building-detail-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvasContainer.appendChild(canvas);
    
    sheet.appendChild(canvasContainer);

    const grabber = document.createElement('div');
    grabber.className = 'upg-grabber';
    grabber.innerHTML = `<div class="grab-handle"></div>`;
    grabber.style.zIndex = '1';
    
    const header = document.createElement('header');
    header.className = 'upg-header';
    header.style.zIndex = '1';
    header.style.background = 'transparent';
    header.style.borderBottom = 'none';
    
    const content = document.createElement('div');
    content.className = 'upg-content';
    content.style.flex = '1';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.justifyContent = 'flex-end';
    content.style.zIndex = '1';
    content.style.position = 'relative';
    
    const levelTextContainer = document.createElement("div");
    levelTextContainer.style.textAlign = "center";
    levelTextContainer.style.marginBottom = "10px";
    levelTextContainer.style.fontSize = "28px";
    levelTextContainer.style.fontWeight = "bold";
    levelTextContainer.style.textShadow = "0 2px 4px rgba(0,0,0,0.8)";
    levelTextContainer.id = "building-detail-level-text";
    
    content.appendChild(levelTextContainer);

    const buildingHitbox = document.createElement("div");
    buildingHitbox.style.width = "300px";
    buildingHitbox.style.height = "5px";
    buildingHitbox.style.margin = "0 auto";
    buildingHitbox.style.pointerEvents = "none";
    content.appendChild(buildingHitbox);

    const bonusRow = document.createElement("div");
    bonusRow.id = "building-detail-bonus-row";
    bonusRow.style.margin = "0";
    bonusRow.style.padding = "0";
    bonusRow.className = "upg-line";
    bonusRow.style.lineHeight = "0.9";
    bonusRow.style.textAlign = "center";
    bonusRow.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
    
    const costRow = document.createElement("div");
    costRow.id = "building-detail-cost-row";
    costRow.style.margin = "0";
    costRow.style.marginTop = "6px";
    costRow.style.padding = "0";
    costRow.className = "upg-line";
    costRow.style.lineHeight = "0.9";
    costRow.style.textAlign = "center";
    costRow.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";

    const walletRow = document.createElement("div");
    walletRow.id = "building-detail-wallet-row";
    walletRow.style.margin = "0";
    walletRow.style.marginTop = "-8px";
    walletRow.style.padding = "0";
    walletRow.className = "upg-line";
    walletRow.style.lineHeight = "0.9";
    walletRow.style.textAlign = "center";
    walletRow.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";

    const textContainer = document.createElement("div");
    textContainer.className = "upg-costs";
    textContainer.style.gap = "0px";
    textContainer.style.justifyContent = "center";
    textContainer.style.marginBottom = "-11px";
    
    
    textContainer.appendChild(bonusRow);
    textContainer.appendChild(costRow);
    textContainer.appendChild(walletRow);

    content.appendChild(textContainer);
    
    const btnBuyCheap = document.createElement("button");
    btnBuyCheap.className = "shop-delve";
    btnBuyCheap.id = "building-btn-buy-cheap";
    btnBuyCheap.textContent = "Buy Cheap";
    
    const btnBuyMax = document.createElement("button");
    btnBuyMax.className = "shop-delve";
    btnBuyMax.id = "building-btn-buy-max";
    btnBuyMax.textContent = "Buy Max";
    
    const btnBuy = document.createElement("button");
    btnBuy.className = "shop-delve";
    btnBuy.id = "building-btn-buy";
    btnBuy.textContent = "Buy";

    const actions = document.createElement("div");
    actions.className = "upg-actions";
    actions.style.zIndex = "1";
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.flexWrap = "wrap";
    actions.style.justifyContent = "center";
    
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "shop-close";
    btnClose.textContent = "Close";

    actions.appendChild(btnClose);
    actions.appendChild(btnBuy);
    actions.appendChild(btnBuyMax);
    actions.appendChild(btnBuyCheap);
    sheet.append(grabber, header, content, actions);
    overlayEl.appendChild(sheet);
    document.body.appendChild(overlayEl);
    
    overlayEl.addEventListener('pointerdown', (e) => {
        if (e.target === overlayEl) {
            closeBuildingDetailOverlay();
        }
    });
    
    setupDragToClose(grabber, sheet, 
        () => overlayEl.classList.contains('is-open'), 
        closeBuildingDetailOverlay
    );
    
    const closeBtn = actions.querySelector('.shop-close');
    closeBtn.addEventListener('click', closeBuildingDetailOverlay);
    
    btnBuy.addEventListener('click', () => handlePurchase('buy'));
    btnBuyMax.addEventListener('click', () => handlePurchase('max'));
    btnBuyCheap.addEventListener('click', () => handlePurchase('cheap'));
}

export function openBuildingDetailOverlay(id) {
    initBuildingOverlay();
    currentBuildingId = id;
    
    const sheet = overlayEl.querySelector('.upg-sheet');
    const header = overlayEl.querySelector('.upg-header');
    
    let properName = id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let buildingName = BUILDING_NAMES[id] || 'Building';
    
    header.innerHTML = `<div class="upg-title">${properName} Building: ${buildingName}</div>`;
    
    updateOverlayUi();

    openBuildingOverlaySheet(overlayEl, sheet);
    

    import('../../misc/buildingVisuals.js').then(module => {
        module.startCanvasLoop(id, overlayEl.querySelector('#building-detail-canvas'));
    });
}

function closeBuildingDetailOverlay() {
    if (!overlayEl) return;
    if (overlayEl.style.pointerEvents === 'none') return;
    overlayEl.style.pointerEvents = 'none';
    const sheet = overlayEl.querySelector('.upg-sheet');
    applyBuildingOverlayTransition(sheet);
    sheet.style.transform = 'translateY(100%)';
    finishBuildingOverlayClose(overlayEl, () => {
        import('../../misc/buildingVisuals.js').then(module => {
            module.stopCanvasLoop();
        });
        currentBuildingId = null;
    });
}

export function updateOverlayUi() {
    if (!currentBuildingId) return;
    const id = currentBuildingId;
    
    const levelBn = getBuildingLevel(id);
    const nextLevelBn = levelBn.add(BigNum.fromInt(1));
    const costBn = getBuildingCost(id, levelBn);
    
    const currencyKey = BUILDING_CURRENCY_KEYS[id];
    const walletHandle = window.bank?.[currencyKey];
    let walletBn = BigNum.fromInt(0);
    if (walletHandle) {
         walletBn = walletHandle.value instanceof BigNum ? walletHandle.value : BigNum.fromAny(walletHandle.value ?? 0);
    }
    
    const currentBonus = getBuildingBonus(id, levelBn);
    const nextBonus = getBuildingBonus(id, nextLevelBn);
    
    const imgStr = `<img src="${BUILDING_CURRENCY_IMAGES[id]}" style="width: 1em; height: 1em; vertical-align: middle; transform: translateY(-4px);">`;
    
    const matName = RESOURCE_REGISTRY.find(r => r.key === currencyKey)?.singular || 'Stone';

    document.getElementById('building-detail-level-text').textContent = `Building Level ${formatNumber(levelBn)}`;
    
    document.getElementById('building-detail-bonus-row').innerHTML = 
        `${BUILDING_BONUS_TEXTS[id] || 'Bonus'}: ${formatMultForUi(currentBonus)}x &rarr; ${formatMultForUi(nextBonus)}x`;
        
    document.getElementById('building-detail-cost-row').innerHTML = 
        `Cost: ${imgStr} ${formatNumber(costBn)} ${matName}`;
        
    document.getElementById('building-detail-wallet-row').innerHTML = 
        `You have: ${imgStr} ${formatNumber(walletBn)} ${matName}`;
        
    const btnBuy = document.getElementById('building-btn-buy');
    btnBuy.disabled = walletBn.cmp(costBn) < 0;
    document.getElementById('building-btn-buy-max').disabled = walletBn.cmp(costBn) < 0;
    document.getElementById('building-btn-buy-cheap').disabled = walletBn.cmp(costBn) < 0;
}

export function handlePurchaseOuter(id, type) {
    currentBuildingId = id;
    handlePurchase(type);
    currentBuildingId = null;
}

function handlePurchase(type) {
    if (!currentBuildingId) return;
    const id = currentBuildingId;
    
    const currencyKey = BUILDING_CURRENCY_KEYS[id];
    const walletHandle = window.bank?.[currencyKey];
    if (!walletHandle) return;
    
    let walletBn = walletHandle.value instanceof BigNum ? walletHandle.value : BigNum.fromAny(walletHandle.value ?? 0);
    let startLevelBn = getBuildingLevel(id);
    
    let costToDeduct = BigNum.fromInt(0);
    let levelsToAdd = 0;
    
    
    const maxLevels = type === 'buy' ? 1 : BigNum.fromAny('Infinity');
    
    if (type === 'buy') {
        const costBn = getBuildingCost(id, startLevelBn);
        if (walletBn.cmp(costBn) >= 0) {
            costToDeduct = costBn;
            levelsToAdd = 1;
        }
    } else if (type === 'max' || type === 'cheap') {
        // evaluateBulkPurchase returns { count, spent }
        let evalWallet = walletBn;
        if (type === 'cheap') evalWallet = walletBn.div(10);
        
        const ratio = getBuildingRatio(id);
        const outcome = evaluateBuildingBulkPurchase(id, startLevelBn, evalWallet, 1e12, ratio);
        
        let count = outcome.count;
        if (typeof count === 'number') count = BigNum.fromAny(count);
        
        if (count.cmp(0) > 0) {
            levelsToAdd = count;
            costToDeduct = outcome.spent ?? BigNum.fromInt(0);
        }
    }
    
    const levelsToAddCmp = typeof levelsToAdd === 'number' ? levelsToAdd > 0 : levelsToAdd.cmp(0) > 0;
    if (levelsToAddCmp) {
        if (walletHandle.sub) walletHandle.sub(costToDeduct);
        const oldLevel = getBuildingLevel(id);
        const newLevel = addBuildingLevel(id, BigNum.fromAny(levelsToAdd));
        
        playPurchaseSfx();
        
        document.dispatchEvent(new CustomEvent('ccc:buildings:changed'));
        
        import('../../misc/buildingVisuals.js').then(module => {
            module.triggerLevelUpAnimation();
            module.checkTierUp(id, oldLevel, newLevel);
        });
        
        updateOverlayUi();
        
        const gridCardBadge = document.querySelector(`.shop-upgrade[data-building-id="${id}"] .level-badge`);
        if (gridCardBadge) gridCardBadge.textContent = formatNumber(newLevel);
    }
}

window.renderBuildingsGrid = renderBuildingsGrid;
window.getAffordableBuildingLevels = getAffordableBuildingLevels;
window.setBuildingUnlocked = setBuildingUnlocked;
window.setBuildingUnlockedById = setBuildingUnlocked;
window.createBuildingCard = createBuildingCard;
