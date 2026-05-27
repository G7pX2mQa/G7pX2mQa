import { ensureMerchantScrollbar } from '../delveCore.js';
import { getActiveSlot, UC_MATERIALS, bank } from '../../util/storage.js';
import { formatNumber } from '../../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { UC_MATERIAL_DATA, getUcMaterialAccumulators } from '../../game/ucSpawner.js';
import { getDpState, isDpSystemUnlocked } from '../../game/dpSystem.js';
import { createDropdown } from '../sas/dropdownUtils.js';
import { playPurchaseSfx } from '../shopOverlay.js';
import { registerTick, registerFrame } from '../../game/gameLoop.js';
import { BigNum } from '../../util/bigNum.js';

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
    } catch {}
  }
}


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
  ensureMerchantScrollbar(minerOverlayEl, minerSheetEl, '.sell-center-col', 'sell-scrollbar');

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
           dpLevelNum = Number(dpState.dpLevel.toString());
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

   if (isDpSystemUnlocked()) {
       sellPanelDomCache.infoBox.innerHTML = `
          <b>Sell materials for Scrap, use Scrap to buy upgrades</b><br>
          Current Depth: ${formatNumber(BigNum.fromAny(dpLevelNum))}m<br>
          ${alwaysSpawnsStr}<br>
          ${nextUnlockStr}
       `;
   } else {
       sellPanelDomCache.infoBox.innerHTML = `
          <b>Sell materials for Scrap, use Scrap to buy upgrades</b>
       `;
   }

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
       rowCache.ownedEl.textContent = formatNumber(owned);
       
       const scrapMultiplier = 1;
       const val = (t.value || 0) * scrapMultiplier;
       rowCache.valEl.textContent = formatNumber(BigNum.fromAny(val));
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
   
   let localSellAmount = '1';

   const dropdownObj = createDropdown({
       getOptions: () => DROPDOWN_OPTIONS,
       getValue: () => localSellAmount,
       setValue: (val) => {
           if (val === 'custom') {
             const res = prompt("Enter a custom amount. Integers, percentages, and fractions are supported inputs.");
             if (res !== null && res.trim() !== "") {
                 const parsed = parseCustomAmount(res);
                 if (parsed) {
                     localSellAmount = parsed.display || res.trim();
                 }
             }
           } else {
               localSellAmount = val;
           }
           dropdownObj.updateDisplay();
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
       const amt = calculateSellAmount(rowCache.currentOwned, localSellAmount);
       if (amt.cmp(0) <= 0) return;
       
       bank[matKey].sub(amt);
       const totalValue = amt.mulDecimalFloor(rowCache.currentVal);
       bank.scrap.add(totalValue);
       

       playPurchaseSfx();
       updateSellTab();
       

       // Visual items spawn
       let parsedNum = 1;
       if (amt.cmp(5) >= 0) {
           parsedNum = 5;
       } else {
           try {
               parsedNum = Number(amt.toPlainIntegerString());
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
               y: sellCanvases[side].height - 40,
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
  if (!panel || !panel.classList.contains('is-active')) return;
  if (!panel.closest('.merchant-overlay.is-open') && !document.querySelector('.miner-sheet.is-sell-active')) return;

  const beltSpeed = 60; // px/s
  beltOffset = (beltOffset + beltSpeed * dt) % 40;

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

  // Render pool items
  for (let i = conveyorPool.length - 1; i >= 0; i--) {
    const item = conveyorPool[i];
    const { canvas, ctx, width, height } = sellCanvases[item.side];
    if (!ctx || width === 0 || height === 0) continue;

    if (item.state === 'falling') {
      let hitEndpoint = false;
      // Force speed sync with belt
      item.speed = beltSpeed; 
      
      if (item.side === 'left') {
        item.y -= item.speed * dt;
        // fully inside top box
        if (item.y + 24 <= 80) hitEndpoint = true;
      } else {
        item.y += item.speed * dt;
        // fully inside bottom box
        if (item.y - 24 >= height - 80) hitEndpoint = true;
      }
      
      if (hitEndpoint) {
        if (item.side === 'left') {
            // Teleport to right side top (centered in box)
            item.side = 'right';
            const rightWidth = sellCanvases['right'].width;
            item.x = rightWidth / 2;
            item.y = 40;
        } else {
            // Hit bottom right endpoint -> particles
            item.state = 'particle';
            item.particles = [];
            const numParticles = 3 + Math.floor(Math.random() * 3); // 3 to 5
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
      } else {
        // Draw falling image
        ctx.save();
        const img = getMaterialImage(item.matKey);
        if (img && img.complete && img.naturalHeight !== 0) {
            // Draw image centered
            ctx.drawImage(img, item.x - 24, item.y - 24, 48, 48);
        } else {
            // Fallback just in case
            ctx.translate(item.x, item.y);
            ctx.beginPath();
            ctx.arc(0, 0, 24, 0, 2 * Math.PI);
            ctx.fillStyle = 'gray';
            ctx.fill();
        }
        ctx.restore();
      }
    } else if (item.state === 'particle') {
      let alive = false;
      for (const p of item.particles) {
        p.vy += 500 * dt; // Gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= (1.0 / 0.9) * dt; // Fade out over ~0.9s

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = 'rgb(192, 192, 192)';
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
      if (!alive) {
        conveyorPool.splice(i, 1);
      }
    }
  }

  // Draw endpoints OVER items
  ['left', 'right'].forEach(side => {
    let { ctx, width, height } = sellCanvases[side];
    if (!ctx || width === 0 || height === 0) return;
    
    // Magical Black Box endpoints
    ctx.fillStyle = '#050505';
    const boxSize = 80;
    // Top box
    ctx.fillRect(width / 2 - boxSize / 2, 0, boxSize, boxSize);
    // Bottom box
    ctx.fillRect(width / 2 - boxSize / 2, height - boxSize, boxSize, boxSize);
  });
});
