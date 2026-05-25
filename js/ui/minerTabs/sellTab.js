import { ensureMerchantScrollbar } from '../delveCore.js';
import { getActiveSlot, UC_MATERIALS, bank } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { UC_MATERIAL_DATA, getUcMaterialAccumulators } from '../../game/ucSpawner.js';
import { getDpState } from '../../game/dpSystem.js';
import { createDropdown } from '../sas/dropdownUtils.js';
import { playAudio } from '../../util/audioManager.js';
import { registerTick } from '../../game/gameLoop.js';
import { BigNum } from '../../util/bigNum.js';

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

const BASE_VALUES = {
  stone: 1,
  copper: 10,
  iron: 1000,
  pure_gold: 1e6,
  diamond: 1e10,
  emerald: 1e15,
  ruby: 1e21,
  obsidian: 1e28,
  unobtainium: 1e36,
  prismatium: 1e45
};

const DROPDOWN_OPTIONS = [
  { value: '1', label: '1' },
  { value: '1%', label: '1%' },
  { value: '5%', label: '5%' },
  { value: '10%', label: '10%' },
  { value: '25%', label: '25%' },
  { value: '50%', label: '50%' },
  { value: '100%', label: '100%' },
  { value: 'custom', label: 'Custom' }
];

let selectedSellAmount = '1';

function parseCustomAmount(inputStr) {
  let str = inputStr.trim().toLowerCase();
  
  if (str === 'inf' || str === 'max' || str === '100%') {
      return { type: 'percent', val: 100 };
  }
  
  // Try fraction
  const fracMatch = str.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) {
      str = ((num / den) * 100).toFixed(2) + '%';
    }
  }

  // Try percentage
  const pctMatch = str.match(/^([\d.]+)\s*%$/);
  if (pctMatch) {
    let pct = parseFloat(pctMatch[1]);
    if (!isNaN(pct)) {
      if (pct > 100) {
        // Disregard > hundreds place
        const asStr = Math.floor(pct).toString();
        const lastTwo = asStr.slice(-2);
        pct = parseFloat(lastTwo) + (pct - Math.floor(pct));
      }
      return { type: 'percent', val: pct };
    }
  }
  
  // Try absolute number
  const numMatch = str.match(/^[\d.]+$/);
  if (numMatch) {
    const num = parseFloat(numMatch[0]);
    if (!isNaN(num) && num > 0) {
       return { type: 'absolute', val: num };
    }
  }
  
  return null;
}
function calculateSellAmount(totalOwnedBn, amountSelection) {
  if (totalOwnedBn.cmp(0) <= 0) return BigNum.fromInt(0);

  if (amountSelection === '1') {
    return BigNum.min(totalOwnedBn, BigNum.fromInt(1));
  }

  let parsed = parseCustomAmount(amountSelection);
  if (!parsed) {
     return BigNum.min(totalOwnedBn, BigNum.fromInt(1));
  }

  if (parsed.type === 'absolute') {
    return BigNum.min(totalOwnedBn, BigNum.fromNumber(parsed.val));
  } else if (parsed.type === 'percent') {
    const pct = parsed.val / 100;
    let amount = totalOwnedBn.mulDecimalFloor(pct);
    if (amount.cmp(0) <= 0 && pct > 0 && totalOwnedBn.cmp(0) > 0) {
       amount = BigNum.fromInt(1);
    }
    return BigNum.min(totalOwnedBn, amount);
  }
  
  return BigNum.fromInt(1);
}

function getGradient(key) {
  const entry = RESOURCE_REGISTRY.find(r => r.key === key);
  let bg = entry ? entry.bgGradient : 'black';
  if (bg && bg.includes('to bottom')) {
      bg = bg.replace('to bottom', '90deg');
  }
  return bg;
}


let sellPanelDomCache = {};
let sellPanelTickObj = null;

export function initSellPanel(minerOverlayEl, minerSheetEl, tabsEl, panelsWrapEl) {
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'merchant-tab';
  tabBtn.dataset.tab = 'sell';
  tabBtn.textContent = 'Sell';
  tabBtn.title = 'Sell';
  
  const panel = document.createElement('section');
  panel.className = 'merchant-panel sell-tab';
  panel.id = 'miner-panel-sell';
  
  const centerCol = document.createElement('div');
  centerCol.className = 'sell-center-col';

  const scrapCounterWrap = document.createElement('div');
  scrapCounterWrap.className = 'scrap-counter';
  scrapCounterWrap.style.marginTop = '-16px';
  scrapCounterWrap.style.marginBottom = '12px';
  scrapCounterWrap.innerHTML = `
    <img src="img/currencies/scrap/scrap_plus_base.webp" alt="" class="scrap-plus"/>
    <div class="scrap-bar">
      <span class="scrap-amount">0</span>
    </div>
  `;

  const infoBox = document.createElement('div');
  infoBox.className = 'sell-explainer';
  
  const listContainer = document.createElement('div');
  listContainer.className = 'sell-list';

  const header = document.createElement('div');
  header.className = 'sell-list-header';
  header.innerHTML = `
    <div class="list-head-name">Material</div>
    <div>Owned</div>
    <div>Value</div>
    <div>Sell</div>
  `;
  listContainer.appendChild(header);

  centerCol.appendChild(scrapCounterWrap);
  centerCol.appendChild(infoBox);
  centerCol.appendChild(listContainer);
  panel.appendChild(centerCol);

  sellPanelDomCache = { infoBox, listContainer, rows: {} };

  tabBtn.addEventListener('click', () => {
    const allTabs = tabsEl.querySelectorAll('.merchant-tab');
    const allPanels = panelsWrapEl.querySelectorAll('.merchant-panel');
    allTabs.forEach(t => t.classList.remove('is-active'));
    allPanels.forEach(p => p.classList.remove('is-active'));
    
    tabBtn.classList.add('is-active');
    panel.classList.add('is-active');
    minerSheetEl.classList.add('is-sell-active');
    
    updateSellTab();
  });

  const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
  if (dlgTab) {
    dlgTab.addEventListener('click', () => {
      panel.classList.remove('is-active');
      dlgTab.classList.add('is-active');
      minerSheetEl.classList.remove('is-sell-active');
    });
  }

  tabsEl.appendChild(tabBtn);
  panelsWrapEl.appendChild(panel);
  ensureMerchantScrollbar(minerOverlayEl, minerSheetEl, '.sell-center-col', 'sell-scrollbar');

  if (!sellPanelTickObj) {
     sellPanelTickObj = registerTick(() => {
         if (panel.classList.contains('is-active')) {
             updateSellTab();
         }
     });
     if (typeof window !== 'undefined') window.addEventListener('resize', debouncedAlignSellColumns);
  }

  return { tabBtn, panel };
}



export function updateSellTab() {
   if (!sellPanelDomCache.listContainer) return;
   
   let dpLevelNum = 0;
   try {
       const dpState = getDpState();
       if (dpState && dpState.dpLevel) {
           dpLevelNum = Number(dpState.dpLevel.toString());
       }
   } catch {}

   // Track historical seen materials
   let seenMaterials = [];
   try {
       const stored = localStorage.getItem('ccc:sellSeenMaterials');
       if (stored) {
           seenMaterials = JSON.parse(stored);
       }
   } catch {}
   
   let highestMatIdx = 0;
   let nextMatIdx = -1;

   for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
       const t = UC_MATERIAL_DATA[i];
       if (dpLevelNum >= t.start) {
           highestMatIdx = i;
           if (!seenMaterials.includes(t.name)) {
               seenMaterials.push(t.name);
           }
       }
   }
   
   try {
       localStorage.setItem('ccc:sellSeenMaterials', JSON.stringify(seenMaterials));
   } catch {}
   
   for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
       const t = UC_MATERIAL_DATA[i];
       if (dpLevelNum < t.start) {
           nextMatIdx = i;
           break;
       }
   }

   const highestMatName = RESOURCE_REGISTRY.find(r => r.key === UC_MATERIALS[highestMatIdx])?.singular || 'Stone';
   let nextUnlockStr = '';
   if (nextMatIdx !== -1) {
       nextUnlockStr = `Next material starts spawning at: ${formatNumber(UC_MATERIAL_DATA[nextMatIdx].start)}m`;
   } else {
       nextUnlockStr = `You have reached the highest material.`;
   }

   let alwaysSpawnsStr = `${highestMatName} always spawns at: ${formatNumber(UC_MATERIAL_DATA[highestMatIdx].max)}m`;
   if (highestMatIdx === 0) {
       alwaysSpawnsStr = `Stone always spawns at: 0m`;
   }

   sellPanelDomCache.infoBox.innerHTML = `
      <b>Sell materials for Scrap, use Scrap to buy upgrades</b><br>
      Current Depth: ${formatNumber(dpLevelNum)}m<br>
      ${alwaysSpawnsStr}<br>
      ${nextUnlockStr}
   `;

   const accumulators = getUcMaterialAccumulators();

   for (let i = 0; i < UC_MATERIALS.length; i++) {
       const matKey = UC_MATERIALS[i];
       const t = UC_MATERIAL_DATA[i];
       
       if (!seenMaterials.includes(t.name)) {
           if (sellPanelDomCache.rows[matKey]) {
               sellPanelDomCache.rows[matKey].rowEl.remove();
               delete sellPanelDomCache.rows[matKey];
           }
           continue;
       }

       if (!sellPanelDomCache.rows[matKey]) {
           createSellRow(matKey, i);
       }

       const rowCache = sellPanelDomCache.rows[matKey];
       
       let acc = accumulators[i];
       if (i === 0) acc = 1.0;
       
       if (dpLevelNum >= t.max && i !== 0) acc = 1.0;
       
       if (acc >= 1.0) {
           rowCache.fillEl.style.width = '100%';
           rowCache.textEl.textContent = 'Always spawns';
       } else {
           const pct = Math.min(100, Math.max(0, acc * 100));
           rowCache.fillEl.style.width = `${pct}%`;
           rowCache.textEl.textContent = `Progress: ${(Math.floor(acc * 100) / 100).toFixed(2)}/1.00`;
       }

       const owned = bank[matKey]?.value || BigNum.fromInt(0);
       rowCache.ownedEl.textContent = formatNumber(owned);
       
       const scrapMultiplier = 1;
       const val = (t.value || 0) * scrapMultiplier;
       rowCache.valEl.textContent = formatNumber(BigNum.fromAny(val));
       rowCache.currentVal = val;
       rowCache.currentOwned = owned;
   }
   debouncedAlignSellColumns();
}
function createLocalDropdown() {
    const dropdown = createDropdown({
        getOptions: () => DROPDOWN_OPTIONS,
        getValue: () => selectedSellAmount,
        setValue: (val) => {
            if (val === 'custom') {
              const res = prompt("Enter custom amount (e.g., 50% or 10):", "50%");
              if (res !== null && res.trim() !== "") {
                  const parsed = parseCustomAmount(res);
                  if (parsed) {
                      selectedSellAmount = res.trim();
                  }
              }
            } else {
                selectedSellAmount = val;
            }
        }
    });
    dropdown.wrapper.classList.add('sell-dropdown-wrapper');
    return dropdown;
}

function createSellRow(matKey, index) {
   const entry = RESOURCE_REGISTRY.find(r => r.key === matKey);
   const iconSrc = entry ? entry.icon : '';

   const rowEl = document.createElement('div');
   rowEl.className = 'sell-row';

   const colBar = document.createElement('div');
   colBar.className = 'sell-col-bar';
   
   const iconWrap = document.createElement('div');
   iconWrap.className = 'sell-bar-icon-wrap';
   
   const iconBase = document.createElement('img');
   iconBase.className = 'sell-bar-icon-base';
   iconBase.src = 'img/currencies/scrap/scrap_base.webp';

   const iconTop = document.createElement('img');
   iconTop.className = 'sell-bar-icon-top';
   iconTop.src = iconSrc;
   
   iconWrap.append(iconBase, iconTop);

   const track = document.createElement('div');
   track.className = 'sell-bar-track';
   
   const fill = document.createElement('div');
   fill.className = 'sell-bar-fill';
   fill.style.background = getGradient(matKey);
   
   const text = document.createElement('div');
   text.className = 'sell-bar-text';
   
   track.append(fill, text);
   colBar.append(iconWrap, track);

   const colOwned = document.createElement('div');
   colOwned.className = 'sell-col-owned';

   const colVal = document.createElement('div');
   colVal.className = 'sell-col-val';

   const colSell = document.createElement('div');
   colSell.className = 'sell-col-sell';
   
   const dropdownWrap = document.createElement('div');
   const { wrapper: dropdownEl, updateDisplay } = createLocalDropdown();
   
   dropdownWrap.appendChild(dropdownEl);

   const sellBtn = document.createElement('button');
   sellBtn.className = 'sell-btn';
   sellBtn.textContent = 'Sell';
   sellBtn.addEventListener('click', () => {
       const rowCache = sellPanelDomCache.rows[matKey];
       const amt = calculateSellAmount(rowCache.currentOwned, selectedSellAmount);
       if (amt.cmp(0) <= 0) return;
       
       bank[matKey].sub(amt);
       const totalValue = amt.mulDecimalFloor(rowCache.currentVal);
       bank.scrap.add(totalValue);
       
       playAudio('sounds/purchase_upg.ogg', { volume: 0.5 });
       updateSellTab();
   });

   colSell.append(dropdownWrap, sellBtn);

   rowEl.append(colBar, colOwned, colVal, colSell);
   sellPanelDomCache.listContainer.appendChild(rowEl);

   sellPanelDomCache.rows[matKey] = {
       rowEl,
       fillEl: fill,
       textEl: text,
       ownedEl: colOwned,
       valEl: colVal,
       dropdownWrapper: dropdownWrap
   };
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

window.onSellUpgradeUnlocked = function() {
  setSellUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-sheet');
  if (minerSheetEl) {
      updateSellPanelVisibility(minerSheetEl);
  }
}

/**
 * Refines the alignment of the Sell tab columns by measuring header positions
 * and applying compensatory transforms to the row values.
 */
let alignSellTimeout = null;
export function debouncedAlignSellColumns() {
    if (alignSellTimeout) cancelAnimationFrame(alignSellTimeout);
    alignSellTimeout = requestAnimationFrame(alignSellColumns);
}

function alignSellColumns() {
    const sellPanel = document.getElementById('miner-panel-sell');
    if (!sellPanel || !sellPanel.isConnected) return;
    
    const header = sellPanel.querySelector('.sell-list-header');
    
    const rows = Array.from(sellPanel.querySelectorAll('.sell-row'));
    const ownedEls = [];
    const valEls = [];
    const stateEls = [];
    
    if (header && header.children.length >= 4) {
        ownedEls.push(header.children[1]);
        valEls.push(header.children[2]);
        stateEls.push(header.children[3]);
    }
    
    rows.forEach(row => {
        const o = row.querySelector('.sell-col-owned');
        const v = row.querySelector('.sell-col-val');
        const s = row.querySelector('.sell-col-sell');
        if (o) ownedEls.push(o);
        if (v) valEls.push(v);
        if (s) stateEls.push(s);
    });

    if (typeof window !== "undefined" && window.innerWidth <= 650) {
        ownedEls.forEach(el => { if (el.style.transform !== '') el.style.transform = ''; });
        valEls.forEach(el => { if (el.style.transform !== '') el.style.transform = ''; });
        stateEls.forEach(el => { if (el.style.transform !== '') el.style.transform = ''; });
        return;
    }
    
    if (!header || header.offsetParent === null) return;
    if (header.children.length < 4) return;

    ownedEls.forEach(el => el.style.transform = '');
    valEls.forEach(el => el.style.transform = '');
    stateEls.forEach(el => el.style.transform = '');

    const getCenter = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.left + rect.width / 2;
    };
    
    let maxOwnedCenter = 0;
    ownedEls.forEach(el => maxOwnedCenter = Math.max(maxOwnedCenter, getCenter(el)));
    
    let maxValCenter = 0;
    valEls.forEach(el => maxValCenter = Math.max(maxValCenter, getCenter(el)));
    
    let maxStateCenter = 0;
    stateEls.forEach(el => maxStateCenter = Math.max(maxStateCenter, getCenter(el)));

    const alignGroup = (els, targetCenter, headerOffset = 0) => {
        els.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const center = rect.left + rect.width / 2;
            let diff = targetCenter - center;
            
            if (index === 0 && header && header.contains(els[0])) { 
                diff += headerOffset;
            }

            if (Math.abs(diff) > 0.5) {
                el.style.transform = `translateX(${diff}px)`;
            }
        });
    };
    
    alignGroup(ownedEls, maxOwnedCenter);
    alignGroup(valEls, maxValCenter);
    alignGroup(stateEls, maxStateCenter, -1);
}
