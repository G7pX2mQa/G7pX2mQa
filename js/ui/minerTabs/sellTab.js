import { CURRENCIES, getActiveSlot, UC_MATERIALS, bank, getCurrencyMultiplierScaledBN } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { UC_MATERIAL_DATA, getUcMaterialAccumulators } from '../../game/ucSpawner.js';
import { getDpState, isDpSystemUnlocked } from '../../game/dpSystem.js';
import { createDropdown } from '../sas/dropdownUtils.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { registerTick, registerFrame, TICK_RATE } from '../../game/gameLoop.js';
import { BigNum } from '../../util/bigNum.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_SELL_ID } from '../../game/automationUpgrades.js';
import { getLevelNumber } from '../../game/upgrades.js';
import { settingsManager } from '../../game/settingsManager.js';
import { setHtmlOrText } from '../../util/uiHelpers.js';

const SELL_UNLOCKED_KEY_BASE = 'ccc:sellUnlocked';
const SELL_VIEWED_KEY_BASE = 'ccc:sellViewed';

export function hasViewedSellTab() {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${SELL_VIEWED_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setSellTabViewed(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${SELL_VIEWED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${SELL_VIEWED_KEY_BASE}:${slotKey}`);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ccc:upgrades:changed'));
      }
    } catch {}
  }
}


let cachedSellUnlockedStates = {};

export function isSellUnlocked() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  if (cachedSellUnlockedStates[slot] !== undefined && cachedSellUnlockedStates[slot] !== null) return cachedSellUnlockedStates[slot];
  const slotKey = String(slot);
  if (typeof localStorage === 'undefined') return false;
  try {
    const result = localStorage.getItem(`${SELL_UNLOCKED_KEY_BASE}:${slotKey}`) === '1';
    cachedSellUnlockedStates[slot] = result;
    return result;
  } catch {
    return false;
  }
}

export function setSellUnlocked(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (slot != null) {
    cachedSellUnlockedStates[slot] = !!value;
  }
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

if (typeof window !== 'undefined') {
  const invalidateSellCache = () => { cachedSellUnlockedStates = {}; };
  window.addEventListener('saveSlot:change', invalidateSellCache);
  window.addEventListener('unlock:change', invalidateSellCache);
}

const BASE_VALUES = {
  stone: 1,
  copper: 10,
  iron: 1000,
  pure_gold: 1e6,
  diamond: 1e10,
  emerald: 1e15,
  ruby: 1e21,
  sapphire: 1e28,
  unobtainium: 1e36,
  prismatium: 1e45
};

const DROPDOWN_OPTIONS = [
  { value: '1', label: '1' },
  { value: '10%', label: '10%' },
  { value: '25%', label: '25%' },
  { value: '50%', label: '50%' },
  { value: '100%', label: '100%' },
  { value: 'custom', label: 'Custom' }
];

function parseCustomAmount(inputStr) {
  let str = inputStr.trim().toLowerCase();
  
  if (str === 'inf' || str === 'max' || str === '100%') {
      return { type: 'percent', val: 100, display: '100%' };
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
        return { type: 'percent', val: 100, display: '100%' };
      }
      
      let [intPart, decPart] = pctMatch[1].split('.');
      if (!decPart) {
          return { type: 'percent', val: pct, display: pctMatch[1] + '%' };
      }
      
      if (decPart.length > 2) {
          decPart = decPart.substring(0, 2);
          pct = parseFloat(`${intPart}.${decPart}`);
          return { type: 'percent', val: pct, display: `${intPart}.${decPart}%` };
      } else {
          return { type: 'percent', val: pct, display: pctMatch[1] + '%' };
      }
    }
  }
  
  // Try absolute number
  const numMatch = str.match(/^-?[\d.]+$/);
  if (numMatch) {
    let num = parseFloat(numMatch[0]);
    if (!isNaN(num)) {
       num = Math.floor(num);
       if (num < 0) num = 0;
       if (num > 1000) num = 1000;
       return { type: 'absolute', val: num, display: num.toString() };
    }
  }
  
  return null;
}

function calculateTheoreticalSellAmount(totalOwnedBn, amountSelection) {
  if (totalOwnedBn.cmp(0) <= 0 && amountSelection !== '1' && amountSelection !== '100%') {
      // If we don't own any but they asked for 999, we should theoretically show 999.
      // Actually, if we own 0, percent based is 0, absolute is absolute.
  }

  if (amountSelection === '1') {
    return BigNum.fromInt(1);
  }

  let parsed = parseCustomAmount(amountSelection);
  if (!parsed) {
     return BigNum.fromInt(1);
  }

  if (parsed.type === 'absolute') {
    return BigNum.fromAny(parsed.val);
  } else if (parsed.type === 'percent') {
    const pct = parsed.val / 100;
    let amount = totalOwnedBn.mulDecimalFloor(pct);
    if (amount.cmp(0) <= 0 && pct > 0 && totalOwnedBn.cmp(0) > 0) {
       amount = BigNum.fromInt(1);
    }
    return amount;
  }
  
  return BigNum.fromInt(1);
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
    return BigNum.min(totalOwnedBn, BigNum.fromAny(parsed.val));
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



let conveyorPool = [];
let spawnLeft = true;

const sellCanvases = {
  left: { canvas: null, ctx: null, width: 0, height: 0 },
  right: { canvas: null, ctx: null, width: 0, height: 0 }
};

function syncSellLayout() {
  if (!sellPanelDomCache.sideLeft || !sellPanelDomCache.sideRight) return;
  const updateBounds = (col, data) => {
      const rect = col.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      data.width = rect.width;
      data.height = rect.height;
      if (!data.canvas) {
          data.canvas = col.querySelector('canvas');
          if (data.canvas) data.ctx = data.canvas.getContext('2d', { alpha: true });
      }
      if (data.canvas) {
          const targetWidth = Math.round(rect.width * dpr);
          const targetHeight = Math.round(rect.height * dpr);
          if (data.canvas.width !== targetWidth || data.canvas.height !== targetHeight) {
              data.canvas.width = targetWidth;
              data.canvas.height = targetHeight;
              data.ctx.scale(dpr, dpr);
          }
      }
  };
  updateBounds(sellPanelDomCache.sideLeft, sellCanvases.left);
  updateBounds(sellPanelDomCache.sideRight, sellCanvases.right);
}

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
  
  const sideLeft = document.createElement('div');
  sideLeft.className = 'sell-side-col sell-side-left';
  const canvasLeft = document.createElement('canvas');
  canvasLeft.style.position = 'absolute';
  canvasLeft.style.top = '0';
  canvasLeft.style.left = '0';
  canvasLeft.style.width = '100%';
  canvasLeft.style.height = '100%';
  sideLeft.appendChild(canvasLeft);
  
  const sideRight = document.createElement('div');
  sideRight.className = 'sell-side-col sell-side-right';
  const canvasRight = document.createElement('canvas');
  canvasRight.style.position = 'absolute';
  canvasRight.style.top = '0';
  canvasRight.style.left = '0';
  canvasRight.style.width = '100%';
  canvasRight.style.height = '100%';
  sideRight.appendChild(canvasRight);

  const centerCol = document.createElement('div');
  centerCol.className = 'sell-center-col';

  const scrapCounterWrap = document.createElement('div');
  scrapCounterWrap.className = 'scrap-counter';
  scrapCounterWrap.style.marginTop = '-16px';
  scrapCounterWrap.style.marginBottom = '12px';

  
  let formatted = '0';
  try {
    formatted = bank.scrap?.fmt?.(bank.scrap.value) ?? '0';
  } catch {}

  scrapCounterWrap.innerHTML = `
    <img src="img/currencies/scrap/scrap_plus_base.webp" alt="" class="scrap-plus"/>
    <div class="scrap-bar">
      <span class="scrap-amount">${formatted}</span>
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
  panel.appendChild(sideLeft);
  panel.appendChild(centerCol);
  panel.appendChild(sideRight);

  sellPanelDomCache = { infoBox, listContainer, rows: {}, sideLeft, sideRight, canvasLeft, canvasRight };


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

  syncSellLayout();
  if (typeof window !== 'undefined') window.addEventListener('resize', syncSellLayout);

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
   if (!hasViewedSellTab()) setSellTabViewed(true);
   if (!sellPanelDomCache.listContainer) return;
   
   let dpLevelNum = 0;
   try {
       const dpState = getDpState();
       if (dpState && dpState.dpLevel) {
           dpLevelNum = (dpState.dpLevel.inf ? Infinity : (dpState.dpLevel.sig * Math.pow(10, dpState.dpLevel.e)));
       }
   } catch {}

   // Track historical seen materials
   let seenMaterials = [];
   try {
       const stored = localStorage.getItem(`ccc:sellSeenMaterials:${getActiveSlot()}`);
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
       localStorage.setItem(`ccc:sellSeenMaterials:${getActiveSlot()}`, JSON.stringify(seenMaterials));
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
       nextUnlockStr = `Next material starts spawning at: ${formatNumber(BigNum.fromAny(UC_MATERIAL_DATA[nextMatIdx].start))}m`;
   } else {
       nextUnlockStr = `You have reached the highest material`;
   }

   let alwaysSpawnsStr = `${highestMatName} always spawns at: ${formatNumber(BigNum.fromAny(UC_MATERIAL_DATA[highestMatIdx].max))}m`;
   if (highestMatIdx === 0) {
       alwaysSpawnsStr = `Stone always spawns at: 0m`;
   }


   const isDpUnlocked = isDpSystemUnlocked();
   let baseHTML = `<b>Sell materials for Scrap, use Scrap to buy upgrades</b>`;
   if (isDpUnlocked) {
       baseHTML += `<br>Current Depth: ${formatNumber(BigNum.fromAny(dpLevelNum))}m<br>${alwaysSpawnsStr}<br>${nextUnlockStr}`;
   }

   const autoSellLevel = getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_SELL_ID);
   const autoSellSetting = settingsManager.get("auto_sell_efficiency");
   const autoSellMult = autoSellSetting !== undefined ? (autoSellSetting / 100) : 1;

   if (autoSellLevel >= 1 && autoSellMult > 0) {
       let eff = 0;
       if (autoSellLevel === 1) eff = 0.000001; // 0.0001%
       else if (autoSellLevel === 2) eff = 0.0001; // 0.01%
       else if (autoSellLevel === 3) eff = 0.01; // 1%
       else if (autoSellLevel >= 4) eff = 1.0;

       const scrapMultiplier = getCurrencyMultiplierScaledBN(CURRENCIES.SCRAP);
       let totalScrapGain = BigNum.fromInt(0);

       for (let j = 0; j < UC_MATERIALS.length; j++) {
           const matKey = UC_MATERIALS[j];
           const matData = UC_MATERIAL_DATA[j];
           if (bank[matKey] && bank[matKey].value.cmp(0) > 0) {
               const owned = bank[matKey].value;
               const materialValue = BigNum.fromAny(matData.value || 0);
               const valPerMaterial = materialValue.mulBigNumInteger(scrapMultiplier).mulScaledIntFloor(1, BigNum.DEFAULT_PRECISION);
               const potentialScrap = owned.mulBigNumInteger(valPerMaterial);
               
               if (eff === 1.0) {
                   totalScrapGain = totalScrapGain.add(potentialScrap);
               } else {
                   totalScrapGain = totalScrapGain.add(potentialScrap.mulDecimal(eff));
               }
           }
       }

       const scrapPerSec = totalScrapGain.mulDecimal(autoSellMult).mulBigNumInteger(BigNum.fromAny(TICK_RATE));
       const formattedScrapPerSec = formatNumber(scrapPerSec);
       baseHTML += `<br><span style="color:#02e815"><b>Current Scrap/sec: ${formattedScrapPerSec}</b></span>`;
   }

   setHtmlOrText(sellPanelDomCache.infoBox, baseHTML);

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
       
       const materialName = RESOURCE_REGISTRY.find(r => r.key === matKey)?.singular || '';

       if (acc >= 1.0) {
           rowCache.fillEl.style.width = '100%';
           rowCache.textEl.textContent = materialName ? `${materialName} always spawns` : 'Always spawns';
       } else {
           acc += 1e-9;
           const pct = Math.min(100, Math.max(0, acc * 100));
           rowCache.fillEl.style.width = `${pct}%`;
           rowCache.textEl.textContent = materialName 
               ? `${materialName} progress: ${(Math.floor(acc * 100) / 100).toFixed(2)}/1.00` 
               : `Progress: ${(Math.floor(acc * 100) / 100).toFixed(2)}/1.00`;
       }

       const owned = bank[matKey]?.value || BigNum.fromInt(0);
       const ownedStr = formatNumber(owned);
       setHtmlOrText(rowCache.ownedEl, ownedStr);
       
       const scrapMultiplier = getCurrencyMultiplierScaledBN(CURRENCIES.SCRAP);
       const materialValue = BigNum.fromAny(t.value || 0);
       const val = materialValue.mulBigNumInteger(scrapMultiplier).mulScaledIntFloor(1, BigNum.DEFAULT_PRECISION);
       
       const localAmountStr = rowCache.localSellAmount || '1';
       const theoreticalAmt = calculateTheoreticalSellAmount(owned, localAmountStr);
       const displayVal = theoreticalAmt.mulBigNumInteger(val);

       const valStr = formatNumber(displayVal);
       setHtmlOrText(rowCache.valEl, valStr);
       rowCache.currentVal = val;
       rowCache.currentOwned = owned;
   }
   debouncedAlignSellColumns();
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
   
   const initVal = localStorage.getItem(`ccc:sellAmount:${getActiveSlot()}:${matKey}`) || '1';
   const dropdownObj = createDropdown({
       getOptions: () => DROPDOWN_OPTIONS,
       getValue: () => {
           const rowCache = sellPanelDomCache.rows[matKey];
           return rowCache ? rowCache.localSellAmount : initVal;
       },
       setValue: (val) => {
           let newAmount = '1';
           const rowCache = sellPanelDomCache.rows[matKey];
           if (val === 'custom') {
             const res = prompt("Enter a custom amount. Integers, percentages, and fractions are supported inputs.");
             if (res !== null && res.trim() !== "") {
                 const parsed = parseCustomAmount(res);
                 if (parsed) {
                     newAmount = parsed.display || res.trim();
                     if (rowCache) {
                           rowCache.localSellAmount = newAmount;
                           localStorage.setItem(`ccc:sellAmount:${getActiveSlot()}:${matKey}`, newAmount);
                       }
                 }
             }
           } else {
               newAmount = val;
               if (rowCache) {
                           rowCache.localSellAmount = newAmount;
                           localStorage.setItem(`ccc:sellAmount:${getActiveSlot()}:${matKey}`, newAmount);
                       }
           }
           dropdownObj.updateDisplay();
           updateSellTab();
       }
   });
   dropdownObj.wrapper.classList.add('sell-dropdown-wrapper');

   const dropdownWrap = document.createElement('div');
   dropdownWrap.appendChild(dropdownObj.wrapper);

   const sellBtn = document.createElement('button');
   sellBtn.className = 'sell-btn';
   sellBtn.textContent = 'Sell';
   sellBtn.addEventListener('click', () => {
       const rowCache = sellPanelDomCache.rows[matKey];
       const amt = calculateSellAmount(rowCache.currentOwned, rowCache.localSellAmount);
       if (amt.cmp(0) <= 0) return;
       
       if (!rowCache.currentOwned.isInfinite()) {
		   bank[matKey].sub(amt);
	   }
       const totalValue = amt.mulBigNumInteger(rowCache.currentVal);
       bank.scrap.add(totalValue);
       

       playPurchaseSfx();
       updateSellTab();
       

       // Visual items spawn
       let parsedNum = 1;
       if (amt.cmp(5) >= 0) {
           parsedNum = 5;
       } else {
           try {
               parsedNum = amt.inf || amt.e >= BigNum.DEFAULT_PRECISION ? Infinity : Number(amt.toPlainIntegerString());
           } catch (e) {
               parsedNum = 5;
           }
       }
       const numItems = Math.min(5, Math.max(1, parsedNum));

       for (let k = 0; k < numItems; k++) {
           const side = 'left';
           const width = sellCanvases[side].width;
           
           conveyorPool.push({
               x: width / 2,
               y: sellCanvases[side].height - 78,
               matKey: matKey,
               // Use a fixed speed base and no random factor for sync, or just a single belt speed var
               speed: 60, 
               side: side,
               state: 'falling'
           });
       }
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
       dropdownWrapper: dropdownWrap,
       localSellAmount: localStorage.getItem(`ccc:sellAmount:${getActiveSlot()}:${matKey}`) || '1'
   };
}


let lastInfoBoxDpLevel = null;
let lastInfoBoxHighestMatIdx = null;

export function updateSellPanelVisibility(minerSheetEl) {
  if (!minerSheetEl) {
    minerSheetEl = document.querySelector('.merchant-overlay.is-miner .merchant-sheet');
  }
  if (!minerSheetEl) return;

  const tabsEl = minerSheetEl.querySelector('.merchant-tabs');
  if (!tabsEl) return;
  const tabBtn = tabsEl.querySelector('[data-tab="sell"]');
  if (!tabBtn) return;
  
  const unlocked = isSellUnlocked();
  const targetText = unlocked ? 'Sell' : '???';
  const targetTitle = unlocked ? 'Sell' : '???';
  const targetDisabled = !unlocked;

  if (tabBtn.textContent !== targetText) {
    tabBtn.textContent = targetText;
  }
  if (tabBtn.title !== targetTitle) {
    tabBtn.title = targetTitle;
  }
  if (tabBtn.disabled !== targetDisabled) {
    tabBtn.disabled = targetDisabled;
  }
  const hasLocked = tabBtn.classList.contains('is-locked');
  if (hasLocked !== targetDisabled) {
    tabBtn.classList.toggle('is-locked', targetDisabled);
  }

  if (!unlocked && tabBtn.classList.contains('is-active')) {
    const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
    if (dlgTab) dlgTab.click();
  }
}

window.onSellUpgradeUnlocked = function() {
  setSellUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-overlay.is-miner .merchant-sheet');
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

    if (typeof window !== "undefined" && window.innerWidth <= 900) {
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


function getMachineColors(baseR, baseG, baseB) {
  const calc = (val, offset) => {
    if (val === 0) return 0;
    return Math.max(0, Math.min(255, val + offset));
  };
  return {
    base: `rgb(${baseR}, ${baseG}, ${baseB})`,
    highlight: `rgb(${calc(baseR, 20)}, ${calc(baseG, 20)}, ${calc(baseB, 20)})`,
    shadow: `rgb(${calc(baseR, -16)}, ${calc(baseG, -16)}, ${calc(baseB, -16)})`
  };
}

let beltOffset = 0;

const BG_CHUNK_HEIGHT = 250;
let bgLayers = [
    { chunks: [], offset: 0, speedMult: 0.05, color: 'rgb(18, 12, 10)', minInset: 0.1, maxInset: 0.3 },
    { chunks: [], offset: 0, speedMult: 0.1, color: 'rgb(28, 20, 16)', minInset: 0.3, maxInset: 0.5 },
    { chunks: [], offset: 0, speedMult: 0.15, color: 'rgb(42, 30, 24)', minInset: 0.5, maxInset: 0.7 }
];



function generateBgChunk(layerConf, lastChunk) {
    const leftPoints = [];
    const rightPoints = [];
    const crystals = [];
    
    const numPoints = 5; 
    const step = BG_CHUNK_HEIGHT / numPoints;
    
    for (let i = 0; i <= numPoints; i++) {
        if (i === 0 && lastChunk) {
            leftPoints.push(lastChunk.leftPoints[numPoints]);
            rightPoints.push(lastChunk.rightPoints[numPoints]);
        } else {
            const range = layerConf.maxInset - layerConf.minInset;
            leftPoints.push(layerConf.minInset + Math.random() * range);
            rightPoints.push(layerConf.minInset + Math.random() * range);
        }
    }
    
    // Only spawn crystals in the most foreground layer
    if (layerConf.speedMult >= 0.15) {
        const colors = [
            {r: 0, g: 255, b: 255}, // Bright Cyan
            {r: 148, g: 0, b: 211}, // Deep Purple
            {r: 235, g: 30, b: 50}, // Red (Ruby)
            {r: 40, g: 220, b: 100} // Green (Emerald)
        ];
        
        const numSegments = 3;
        const segmentHeight = BG_CHUNK_HEIGHT / numSegments;
        
        // Distribute 1 to 2 clusters per vertical segment for even density
        for (let seg = 0; seg < numSegments; seg++) {
            const crystalsInSegment = 1 + Math.floor(Math.random() * 2);
            
            for (let i = 0; i < crystalsInSegment; i++) {
                const baseY = (seg * segmentHeight) + (Math.random() * segmentHeight);
                const sharedColor = colors[Math.floor(Math.random() * colors.length)];
                
                // Spawn mirrored on both left and right sides
                for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
                    const side = sideIdx === 0 ? 'left' : 'right';
                    
                    // Add slight vertical jitter to break perfect symmetry
                    let y = baseY;
                    if (sideIdx === 1) {
                         y += (Math.random() - 0.5) * 40; 
                         // Clamp to chunk bounds just in case
                         y = Math.max(0, Math.min(BG_CHUNK_HEIGHT, y));
                    }
                    
                    // Generate multiple faceted clusters for a geode effect
                    const clusters = [];
                    const numPieces = 3 + Math.floor(Math.random() * 3);
                    for(let p=0; p<numPieces; p++) {
                        const pSize = 4 + Math.random() * 6;
                        const numVertices = 4 + Math.floor(Math.random() * 4);
                        const facets = [];
                        for (let v = 0; v < numVertices; v++) {
                             const angle = (v / numVertices) * Math.PI * 2;
                             const rad = pSize * (0.6 + Math.random() * 0.6);
                             const shade = 0.6 + Math.random() * 0.6;
                             facets.push({ dx: Math.cos(angle) * rad, dy: Math.sin(angle) * rad, shade });
                        }
                        clusters.push({
                            ox: (Math.random()-0.5) * 10,
                            oy: (Math.random()-0.5) * 10,
                            facets,
                            size: pSize
                        });
                    }

                    const xRatio = 0.2 + Math.random() * 0.5;

                    // Calculate interpPct identically to the render loop
                    const pointIdx = Math.floor(y / step);
                    // Generate bg chunk runs from 0 to numPoints (inclusive), so numPoints is the max index
                    const nextIdx = Math.min(numPoints, pointIdx + 1);
                    const ratio = (y - pointIdx * step) / step;
                    
                    let interpPct;
                    if (side === 'left') {
                        const currentPct = leftPoints[pointIdx];
                        const nextPct = leftPoints[nextIdx];
                        interpPct = currentPct * (1 - ratio) + nextPct * ratio;
                    } else {
                        const currentPct = rightPoints[pointIdx];
                        const nextPct = rightPoints[nextIdx];
                        interpPct = currentPct * (1 - ratio) + nextPct * ratio;
                    }

                    const baseXOffset = interpPct * xRatio;

                    // Pre-render the crystal to an offscreen canvas
                    let cachedImage;
                    if (typeof OffscreenCanvas !== 'undefined') {
                        cachedImage = new OffscreenCanvas(40, 40);
                    } else {
                        cachedImage = document.createElement('canvas');
                        cachedImage.width = 40;
                        cachedImage.height = 40;
                    }
                    const octx = cachedImage.getContext('2d');
                    octx.translate(20, 20); // Center drawing

                    for (const cl of clusters) {
                        const px = cl.ox;
                        const py = cl.oy;
                        if (cl.facets && cl.facets.length > 0) {
                            for (let v = 0; v < cl.facets.length; v++) {
                                const p1 = cl.facets[v];
                                const p2 = cl.facets[(v + 1) % cl.facets.length];
                                
                                octx.beginPath();
                                octx.moveTo(px, py); // center point
                                octx.lineTo(px + p1.dx, py + p1.dy);
                                octx.lineTo(px + p2.dx, py + p2.dy);
                                octx.closePath();
                                
                                // Calculate shaded color for this facet
                                const r = Math.min(255, sharedColor.r * p1.shade);
                                const g = Math.min(255, sharedColor.g * p1.shade);
                                const b = Math.min(255, sharedColor.b * p1.shade);
                                octx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                                octx.fill();
                            }
                        }
                    }

                    crystals.push({
                        side, 
                        y,
                        baseXOffset,
                        cachedImage
                    });
                }
            }
        }
    }
    
    const chunk = { leftPoints, rightPoints, crystals };
    return chunk;
}

// Generate initial chunks for each layer
for (const layer of bgLayers) {
    let last = null;
    for (let i = 0; i < 8; i++) {
        const chunk = generateBgChunk(layer, last);
        layer.chunks.push(chunk);
        last = chunk;
    }
}

const imageCache = {};

function getMaterialImage(matKey) {
  if (imageCache[matKey]) return imageCache[matKey];
  const config = RESOURCE_REGISTRY.find(r => r.key === matKey);
  if (config && config.icon) {
    const img = new Image();
    img.src = config.icon;
    imageCache[matKey] = img;
    return img;
  }
  return null;
}


registerFrame((time, dt) => {
  const panel = document.getElementById('miner-panel-sell');
  const isViewed = panel && panel.classList.contains('is-active') && 
                   (panel.closest('.merchant-overlay.is-open') || document.querySelector('.miner-sheet.is-sell-active'));

  if (!isViewed && conveyorPool.length === 0) return;

  const beltSpeed = 60; // px/s
  
  // Scroll the backgrounds continuously
  // Left canvas background scrolls UP, Right canvas background scrolls DOWN
  const isAnimating = panel && panel.closest('.merchant-overlay.is-animating') !== null;
  if (isViewed && !isAnimating) {
      for (const layer of bgLayers) {
          layer.offset += beltSpeed * layer.speedMult * dt;
          while (layer.offset >= BG_CHUNK_HEIGHT) {
              layer.offset -= BG_CHUNK_HEIGHT;
              layer.chunks.shift();
              const lastChunk = layer.chunks[layer.chunks.length - 1];
              layer.chunks.push(generateBgChunk(layer, lastChunk));
          }
      }
  }



  if (isViewed || conveyorPool.length > 0) { 
    beltOffset = (beltOffset + beltSpeed * dt) % 40; 
  }

  // Update item logic independent of view state
  for (let i = conveyorPool.length - 1; i >= 0; i--) {
    const item = conveyorPool[i];
    let sideHeight = sellCanvases[item.side].height;
    
    // Fallback if dimensions aren't synced yet but logic still needs to run
    if (sideHeight === 0 && panel) {
        const col = panel.querySelector(item.side === 'left' ? '.sell-side-left' : '.sell-side-right');
        if (col) sideHeight = col.getBoundingClientRect().height;
    }

    if (item.state === 'falling') {
      let hitEndpoint = false;
      item.speed = beltSpeed; 
      
      if (item.side === 'left') {
        item.y -= item.speed * dt;
        if (item.y <= 78) hitEndpoint = true;
      } else {
        item.y += item.speed * dt;
        if (sideHeight > 0 && item.y >= sideHeight - 78) hitEndpoint = true;
      }
      
      if (hitEndpoint) {
        if (item.side === 'left') {
            item.side = 'right';
            const rightWidth = sellCanvases['right'].width;
            item.x = rightWidth / 2;
            item.y = 78;
        } else {
            item.state = 'particle';
            item.particles = [];
            const numParticles = 3 + Math.floor(Math.random() * 3);
            for (let p = 0; p < numParticles; p++) {
              item.particles.push({
                x: item.x + (Math.random() - 0.5) * 20,
                y: item.y,
                vx: (Math.random() - 0.5) * 100,
                vy: -100 - Math.random() * 100,
                alpha: 1.0,
                size: 4 + Math.random() * 2
              });
            }
        }
      }
    } else if (item.state === 'particle') {
      let alive = false;
      for (const p of item.particles) {
        p.vy += 500 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= (1.0 / 0.9) * dt;
        if (p.alpha > 0) alive = true;
      }
      if (!alive) {
        conveyorPool.splice(i, 1);
        continue;
      }
    }
  }

  if (!isViewed) return;

  ['left', 'right'].forEach(side => {
    let { canvas, ctx, width, height } = sellCanvases[side];
    let parentEl = canvas ? canvas.parentElement : null;
    if (parentEl && parentEl.clientWidth > 0 && width === 0) {
      syncSellLayout();
      width = sellCanvases[side].width;
      height = sellCanvases[side].height;
    }
    if (!ctx || width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // Render parallax cavern walls
    ctx.save();
    
    // Fill base chasm color (dark dirt)
    ctx.fillStyle = 'rgb(15, 10, 8)';
    ctx.fillRect(0, 0, width, height);


    
    const trackStartX = width / 2 - 24;
    const trackEndX = width / 2 + 24;
    
    // Draw central dark chasm under the belt
    ctx.fillStyle = '#030303';
    ctx.fillRect(trackStartX - 20, 0, (trackEndX + 20) - (trackStartX - 20), height);

    // Draw static structural iron struts perfectly distributed between the chutes
    const chuteSize = 80;
    const drawableHeight = height - (chuteSize * 2);
    const numStruts = 3;
    const numGaps = numStruts + 1;
    const strutSpacing = drawableHeight / numGaps;
    const strutHeight = 8;
    
    // Equal distribution starting from just below the top chute down to just above the bottom chute
    for (let gap = 1; gap <= numStruts; gap++) {
        // Calculate center y for the strut so it is perfectly evenly spaced
        const sy = chuteSize + (gap * strutSpacing) - (strutHeight / 2);
        
        ctx.fillStyle = 'rgb(20, 20, 20)'; // base
        ctx.fillRect(trackStartX - 20, sy, (trackEndX + 20) - (trackStartX - 20), strutHeight);
        
        // Highlights & Shadows (+20 / -16 rule)
        ctx.fillStyle = 'rgb(40, 40, 40)'; // highlight
        ctx.fillRect(trackStartX - 20, sy, (trackEndX + 20) - (trackStartX - 20), 2);
        
        ctx.fillStyle = 'rgb(4, 4, 4)'; // shadow
        ctx.fillRect(trackStartX - 20, sy + strutHeight - 2, (trackEndX + 20) - (trackStartX - 20), 2);
    }
    
    // Draw parallax layers
    for (const layer of bgLayers) {
        ctx.fillStyle = layer.color;
        
        // Draw left wall
        ctx.beginPath();
        // Determine rendering direction based on side to match parallax flow
        if (side === 'right') {
            // Right side scrolls DOWN
            ctx.moveTo(0, height);
            for (let i = 0; i < layer.chunks.length; i++) {
                const chunk = layer.chunks[i];
                const chunkY = (i * BG_CHUNK_HEIGHT) - layer.offset;
                
                const numPoints = chunk.leftPoints.length - 1;
                const step = BG_CHUNK_HEIGHT / numPoints;
                for (let j = 0; j <= numPoints; j++) {
                     const y = height - (chunkY + j * step);
                     const targetMaxX = trackStartX - 15;
                     const wallX = targetMaxX * chunk.leftPoints[j];
                     ctx.lineTo(wallX, y);
                }
            }
            ctx.lineTo(0, 0);
        } else {
            // Left side scrolls UP
            ctx.moveTo(0, 0);
            for (let i = 0; i < layer.chunks.length; i++) {
                const chunk = layer.chunks[i];
                const chunkY = (i * BG_CHUNK_HEIGHT) - layer.offset;
                
                const numPoints = chunk.leftPoints.length - 1;
                const step = BG_CHUNK_HEIGHT / numPoints;
                for (let j = 0; j <= numPoints; j++) {
                     const y = chunkY + j * step;
                     const targetMaxX = trackStartX - 15;
                     const wallX = targetMaxX * chunk.leftPoints[j];
                     ctx.lineTo(wallX, y);
                }
            }
            ctx.lineTo(0, height);
        }
        ctx.fill();
        
        // Draw right wall
        ctx.beginPath();
        if (side === 'right') {
            ctx.moveTo(width, height);
            for (let i = 0; i < layer.chunks.length; i++) {
                const chunk = layer.chunks[i];
                const chunkY = (i * BG_CHUNK_HEIGHT) - layer.offset;
                const numPoints = chunk.rightPoints.length - 1;
                const step = BG_CHUNK_HEIGHT / numPoints;
                for (let j = 0; j <= numPoints; j++) {
                     const y = height - (chunkY + j * step);
                     const targetMinX = trackEndX + 15;
                     const availableWidth = width - targetMinX;
                     const rawX = availableWidth * chunk.rightPoints[j];
                     const wallX = width - rawX;
                     ctx.lineTo(wallX, y);
                }
            }
            ctx.lineTo(width, 0);
        } else {
            ctx.moveTo(width, 0);
            for (let i = 0; i < layer.chunks.length; i++) {
                const chunk = layer.chunks[i];
                const chunkY = (i * BG_CHUNK_HEIGHT) - layer.offset;
                const numPoints = chunk.rightPoints.length - 1;
                const step = BG_CHUNK_HEIGHT / numPoints;
                for (let j = 0; j <= numPoints; j++) {
                     const y = chunkY + j * step;
                     const targetMinX = trackEndX + 15;
                     const availableWidth = width - targetMinX;
                     const rawX = availableWidth * chunk.rightPoints[j];
                     const wallX = width - rawX;
                     ctx.lineTo(wallX, y);
                }
            }
            ctx.lineTo(width, height);
        }
        ctx.fill();

        // Draw crystals
        for (let i = 0; i < layer.chunks.length; i++) {
            const chunk = layer.chunks[i];
            const chunkY = (i * BG_CHUNK_HEIGHT) - layer.offset;
            const numPoints = chunk.leftPoints.length - 1;
            const step = BG_CHUNK_HEIGHT / numPoints;
            
            for (let c = 0; c < chunk.crystals.length; c++) {
                 const crystal = chunk.crystals[c];
                 const cy = side === 'right' ? height - (chunkY + crystal.y) : chunkY + crystal.y;
                 
                 if (cy < -50 || cy > height + 50) continue;
                 
                 let cx;
                 if (crystal.side === 'left') {
                     const targetMaxX = trackStartX - 15;
                     cx = targetMaxX * crystal.baseXOffset;
                     cx = Math.max(cx, 25);
                 } else {
                     const targetMinX = trackEndX + 15;
                     const availableWidth = width - targetMinX;
                     cx = width - (availableWidth * crystal.baseXOffset);
                     cx = Math.min(cx, width - 25);
                 }
                 
                 if (crystal.cachedImage) {
                     ctx.drawImage(crystal.cachedImage, cx - 20, cy - 20);
                 }
            }
        }
    }
    ctx.restore();

    // Draw conveyor belt track
    ctx.fillStyle = 'rgb(20, 20, 20)';
    ctx.fillRect(width / 2 - 24, 80, 48, height - 160);
    
    // Draw track outlines
    ctx.strokeStyle = 'rgb(80, 80, 80)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 24, 80);
    ctx.lineTo(width / 2 - 24, height - 80);
    ctx.moveTo(width / 2 + 24, 80);
    ctx.lineTo(width / 2 + 24, height - 80);
    ctx.stroke();
    
    // Draw belt treads
    ctx.strokeStyle = 'rgb(100, 100, 100)'; // Lightened for visibility
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const currentOffset = side === 'left' ? -beltOffset : beltOffset;
    let startY = 80 + (currentOffset % 40);
    if (startY > 80) startY -= 40;
    
    for (let y = startY; y < height - 80; y += 40) {
      if (y > 80 && y < height - 80) {
        ctx.moveTo(width / 2 - 24, y);
        ctx.lineTo(width / 2 + 24, y);
      }
    }
    ctx.stroke();
    });

  // Render pool items (drawing only) UNDER chutes
  for (let i = conveyorPool.length - 1; i >= 0; i--) {
    const item = conveyorPool[i];
    const { canvas, ctx, width, height } = sellCanvases[item.side];
    if (!ctx || width === 0 || height === 0) continue;

    if (item.state === 'falling') {
      ctx.save();
      const img = getMaterialImage(item.matKey);
      if (img && img.complete && img.naturalHeight !== 0) {
          ctx.drawImage(img, item.x - 24, item.y - 24, 48, 48);
      } else {
          ctx.translate(item.x, item.y);
          ctx.beginPath();
          ctx.ellipse(0, 0, 24, 12, 0, 0, 2 * Math.PI);
          ctx.fillStyle = 'gray';
          ctx.fill();
      }
      ctx.restore();
    } else if (item.state === 'particle') {
      for (const p of item.particles) {
        if (p.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = 'rgb(192, 192, 192)';
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
    }
  }

  // Draw Mechanical Chutes OVER items
  ['left', 'right'].forEach(side => {
    let { ctx, width, height } = sellCanvases[side];
    if (!ctx || width === 0 || height === 0) return;
    
    const boxSize = 80;
    const trackX = width / 2 - boxSize / 2;
    
    // Helper to draw a mechanical chute
    const drawChute = (yPos, isTop) => {
        // Base metallic frame
        ctx.fillStyle = 'rgb(20, 20, 20)';
        ctx.fillRect(trackX - 10, yPos - 10, boxSize + 20, boxSize + 20);
        
        if (isTop) {
            // Highlights (+20)
            ctx.fillStyle = 'rgb(40, 40, 40)';
            ctx.fillRect(trackX - 10, yPos - 10, boxSize + 20, 4); // Top
            ctx.fillRect(trackX - 10, yPos - 10, 4, boxSize + 20); // Left
            ctx.fillRect(trackX + boxSize + 6, yPos - 10, 4, boxSize + 20); // Right

            // Shadows (-16)
            ctx.fillStyle = 'rgb(4, 4, 4)';
            ctx.fillRect(trackX - 10, yPos + boxSize + 6, boxSize + 20, 4); // Bottom
        } else {
            // Highlights (+20)
            ctx.fillStyle = 'rgb(40, 40, 40)';
            ctx.fillRect(trackX - 10, yPos + boxSize + 6, boxSize + 20, 4); // Bottom
            ctx.fillRect(trackX - 10, yPos - 10, 4, boxSize + 20); // Left
            ctx.fillRect(trackX + boxSize + 6, yPos - 10, 4, boxSize + 20); // Right

            // Shadows (-16)
            ctx.fillStyle = 'rgb(4, 4, 4)';
            ctx.fillRect(trackX - 10, yPos - 10, boxSize + 20, 4); // Top
        }
    };

    drawChute(0, true); // Top box
    drawChute(height - boxSize, false); // Bottom box
  });
});
