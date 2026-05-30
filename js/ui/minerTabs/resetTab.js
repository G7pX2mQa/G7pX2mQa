import { getActiveSlot, bank, CURRENCIES, UC_MATERIALS, getCurrencyMultiplierScaledBN } from '../../util/storage.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { formatNumber } from '../../util/numFormat.js';
import { getDpState, isDpSystemUnlocked, resetDpProgress } from '../../game/dpSystem.js';
import { BigNum, approxLog10BigNum, bigNumFromLog10 } from '../../util/bigNum.js';
import { settingsManager } from '../../game/settingsManager.js';
import { getUcMaterialAccumulators, resetUcMaterialAccumulators, UC_MATERIAL_DATA } from '../../game/ucSpawner.js';
import { getUpgradesForArea, AREA_KEYS, setLevel } from '../../game/upgrades.js';
import { resetLab } from '../../game/labNodes.js';
import { applySurgeResetLogic } from '../merchantTabs/resetTab.js';
import { WATERWHEEL_DEFS } from '../merchantTabs/flowTab.js';

const COMBINE_UNLOCKED_KEY_BASE = 'ccc:combineUnlocked';
const COMBINE_COMPLETED_KEY_BASE = 'ccc:combineCompleted';
const COMBINE_ICON_SRC = 'img/currencies/cores.webp';

let resetState = {
  slot: null,
  combineUnlocked: false,
  hasDoneCombineReset: false,
  pendingCores: BigNum.fromInt(0),
  flagsPrimed: false,
  panel: null,
  elements: {
    combine: {
      card: null,
      status: null,
      btn: null,
    }
  }
};

let initialized = false;

function formatBn(value, isSurge = false) {
  if (value === Infinity || (value && (value === 'Infinity' || (typeof value.isInfinite === 'function' && value.isInfinite())))) {
    if (isSurge) {
      return '<span class="surge-infinity-symbol">∞</span>';
    }
    return '<span class="infinity-symbol">∞</span>';
  }
  let bn = value instanceof BigNum ? value : BigNum.fromAny(value);
  try { return formatNumber(bn); }
  catch { return value?.toString?.() ?? '0'; }
}

function ensureResetSlot() {
  const slot = getActiveSlot();
  if (slot == null) throw new Error("No active save slot");
  return slot;
}

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
  resetState.combineUnlocked = !!value;
}

export function hasDoneCombineReset() {
  const slotKey = String(getActiveSlot() ?? 'default');
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${COMBINE_COMPLETED_KEY_BASE}:${slotKey}`) === '1';
  } catch {
    return false;
  }
}

export function setCombineResetCompleted(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${COMBINE_COMPLETED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${COMBINE_COMPLETED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
  resetState.hasDoneCombineReset = !!value;
}

function updateResetButtonContent(btn, state, iconSrc, pendingAmountBn, isSurge = false) {
  if (!btn) return;
  const { disabled, msg } = state;
  
  if (btn.disabled !== disabled) btn.disabled = disabled;
  
  const targetMode = msg ? 'msg' : 'action';
  const currentMode = btn.dataset.mode;
  
  if (targetMode === 'msg') {
      if (currentMode !== 'msg' || btn.textContent !== msg) {
          btn.innerHTML = `<span class="merchant-reset__req-msg">${msg}</span>`;
          btn.dataset.mode = 'msg';
      }
      return;
  }
  
  const amountStr = formatBn(pendingAmountBn, isSurge);
  
  if (currentMode !== 'action') {
      btn.innerHTML = `
        <span class="merchant-reset__action-plus">+</span>
        <span class="merchant-reset__action-icon"><img src="${iconSrc}" alt=""></span>
        <span class="merchant-reset__action-amount">${amountStr}</span>
      `;
      btn.dataset.mode = 'action';
  } else {
      const amtEl = btn.querySelector('.merchant-reset__action-amount');
      if (amtEl && amtEl.textContent !== amountStr) {
          amtEl.textContent = amountStr;
      }
  }
}

export function getPotentialScrap() {
   let totalVal = BigNum.fromInt(0);
   const dpLevelNum = isDpSystemUnlocked() ? Number(getDpState().dpLevel.toString()) : 0;
   const scrapMultiplier = getCurrencyMultiplierScaledBN(CURRENCIES.SCRAP);

   for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
       const t = UC_MATERIAL_DATA[i];
       const matKey = t.name;
       const owned = bank[matKey]?.value || BigNum.fromInt(0);
       
       if (owned.cmp(0) > 0) {
           const materialValue = BigNum.fromAny(t.value || 0);
           const val = materialValue.mulBigNumInteger(scrapMultiplier).mulScaledIntFloor(1, 18);
           const totalMatVal = val.mulBigNumInteger(owned);
           totalVal = totalVal.add(totalMatVal);
       }
   }
   return totalVal;
}

export function computeCombineCores(scrapBn, potentialScrapBn, dpLevelBn) {
    const totalScrap = scrapBn.add(potentialScrapBn);
    
    // Total Scrap base threshold: 1e7
    const logScrap = approxLog10BigNum(totalScrap);
    
    // DP Level base threshold: 25
    const dpLevel = Math.max(0, Number(dpLevelBn.toString()));
    
    const logScaled = Math.max(0, (!Number.isFinite(logScrap) ? 0 : logScrap) - 7);
    const pow2 = logScaled <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(logScaled * Math.log10(2));
    
    const levelFactor = Math.max(0, (dpLevel - 25) / 5);
    const pow14 = levelFactor <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(levelFactor * Math.log10(1.4));
    
    const floorLog = Math.floor(logScaled);
    const pow115 = floorLog <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(floorLog * Math.log10(1.15));
    
    let total = BigNum.fromInt(10);
    total = total.mulBigNumInteger(pow2);
    total = total.mulBigNumInteger(pow14);
    total = total.mulBigNumInteger(pow115);
    
    const floored = total.floorToInteger();
    if (floored.cmp(BigNum.fromInt(10)) < 0) return BigNum.fromInt(10);
    return floored;
}

export function recomputePendingCores() {
    const scrap = bank.scrap?.value ?? BigNum.fromInt(0);
    const potentialScrap = getPotentialScrap();
    const dpLevel = isDpSystemUnlocked() ? getDpState().dpLevel : BigNum.fromInt(0);
    
    resetState.pendingCores = computeCombineCores(scrap, potentialScrap, dpLevel);
    updateCombineCard();
}

function checkCombineRequirements() {
    let uniqueCount = 0;
    for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
       const matKey = UC_MATERIAL_DATA[i].name;
       const owned = bank[matKey]?.value || BigNum.fromInt(0);
       if (owned.cmp(0) > 0) {
           uniqueCount++;
       }
    }
    return uniqueCount >= 3;
}

export function performCombineReset() {
    if (!isCombineUnlocked()) return false;
    
    if (settingsManager.get('combine_confirmation')) {
        if (!window.confirm("Are you sure you want to do a Combine reset?")) return false;
    }
    
    if (!checkCombineRequirements()) {
        return false;
    }
    
    if (resetState.pendingCores.isZero?.()) {
        return false;
    }
    
    const reward = resetState.pendingCores.clone?.() ?? resetState.pendingCores;
    
    // Add cores
    try {
        if (bank.CORES?.add) {
            bank.CORES.add(reward);
        }
    } catch {}
    
    // Wipe Experiment (also wipes Surge, Lab nodes)
    try {
        applySurgeResetLogic(BigNum.fromInt(0), { playEffects: false });
        // Wipe Lab (similar to Experiment reset logic, no exceptions by default unless surge 100 which isn't our concern here)
        resetLab();
    } catch {}
    
    // Wipe Waterwheels levels/fp to 0
    try {
        if (typeof window !== 'undefined' && window.flowSystem) {
           for (const id in WATERWHEEL_DEFS) {
               if (window.flowSystem.setWaterwheelLevel) window.flowSystem.setWaterwheelLevel(id, BigNum.fromInt(0));
               if (window.flowSystem.setWaterwheelFp) window.flowSystem.setWaterwheelFp(id, 0);
           }
        }
    } catch {}

    // Wipe Scrap
    try { bank.scrap.set(0); } catch {}
    
    // Wipe Materials
    try {
        for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
           const matKey = UC_MATERIAL_DATA[i].name;
           if (bank[matKey]) bank[matKey].set(0);
        }
        
        // Zero accumulators
        resetUcMaterialAccumulators();
    } catch {}
    
    // Wipe DP/Depth
    try {
        resetDpProgress({ keepUnlock: true });
        if (window.spawner && typeof window.spawner.clearPlayfield === 'function') {
            window.spawner.clearPlayfield('underwater_cavern');
        }
    } catch {}
    
    // Wipe Scrap Upgrades
    try {
        const upgrades = getUpgradesForArea(AREA_KEYS.UNDERWATER_CAVERN);
        for (const upg of upgrades) {
            if (!upg) continue;
            const tieKey = upg.tieKey || upg.tie;
            // Exceptions: Don't wipe unlocks that cost DP or other currencies. Only scrap.
            if (upg.costType === 'scrap') {
                setLevel(AREA_KEYS.UNDERWATER_CAVERN, upg.id, 0, true);
            }
        }
    } catch {}
    
    // Play sound
    if (typeof window !== 'undefined') {
        const audio = new Audio('sounds/combine.ogg');
        audio.play().catch(() => {});
    }
    
    if (!hasDoneCombineReset()) {
        setCombineResetCompleted(true);
        if (typeof window !== 'undefined' && window.onBuildingsUpgradeUnlocked) {
            window.onBuildingsUpgradeUnlocked();
        }
    }
    
    recomputePendingCores();
    return true;
}

function updateCombineCard() {
    const el = resetState.elements.combine;
    if (!el.card || !el.btn) return;
    
    if (!isCombineUnlocked()) {
        if (el.card.style.display !== 'none') el.card.style.display = 'none';
        return;
    }
    
    if (el.card.style.display !== 'flex') el.card.style.display = 'flex';
    
    el.card.classList.toggle('is-complete', !!hasDoneCombineReset());
    
    if (el.status) {
        if (hasDoneCombineReset()) {
            if (el.status.innerHTML !== '') el.status.innerHTML = '';
        } else {
            const expected = `
              <span style="color:#ffffff; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
                Combining for the first time will unlock new Shop upgrades and a new tab: <span style="color: black; text-shadow: 0 0 5px white, 0 0 10px white;">Buildings</span><br>
                This new tab will allow you to create powerful Buildings to help you progress
              </span>
            `.trim();
            if (el.status.innerHTML !== expected) el.status.innerHTML = expected;
        }
    }
    
    if (!checkCombineRequirements()) {
        updateResetButtonContent(el.btn, { disabled: true, msg: 'Need at least 3 unique Materials' });
        return;
    }
    
    updateResetButtonContent(el.btn, { disabled: false }, COMBINE_ICON_SRC, resetState.pendingCores);
}

function initCombineTabUI(panel) {
  panel.innerHTML = `
    <div class="merchant-reset miner-reset">
      <aside class="merchant-reset__sidebar">
        <button type="button" class="merchant-reset__layer" data-reset-layer="combine">
          <img src="${COMBINE_ICON_SRC}" alt="">
          <span>Combine</span>
        </button>
      </aside>

      <div class="merchant-reset__list">
        <!-- COMBINE CARD -->
        <div class="merchant-reset__card merchant-reset__main is-combine" id="reset-card-combine">
          <div class="merchant-reset__layout">
            <header class="merchant-reset__header">
              <div class="merchant-reset__titles">
                <h3 style="color: white; text-shadow: 0 0 5px white;">Combine</h3>
              </div>
            </header>

            <div class="merchant-reset__content">
              <div class="merchant-reset__titles">
                <p data-reset-desc="combine">
                  Resets everything Experiment does as well as Waterwheels, Scrap, Materials, DP, Depth, and Scrap upgrades for Cores<br>
                  Increase pending Core amount by increasing Scrap or potential Scrap (collective value of all Materials) and Depth
                </p>
              </div>
              <div class="merchant-reset__status" data-reset-status="combine"></div>
            </div>
            
            <div class="merchant-reset__actions">
              <button type="button" class="merchant-reset__action" data-reset-action="combine">
                <span class="merchant-reset__action-plus">+</span>
                <span class="merchant-reset__action-icon">
                  <img src="${COMBINE_ICON_SRC}" alt="">
                </span>
                <span class="merchant-reset__action-amount" data-reset-pending="combine">0</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="merchant-reset__spacer"></div>
    </div>
  `;
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
  
  initCombineTabUI(panel);
  
  resetState.elements.combine.card = panel.querySelector('#reset-card-combine');
  resetState.elements.combine.status = panel.querySelector('[data-reset-status="combine"]');
  resetState.elements.combine.btn = panel.querySelector('[data-reset-action="combine"]');
  
  resetState.elements.combine.btn.addEventListener('click', () => {
     if (performCombineReset()) {
         recomputePendingCores();
     }
  });
  
  tabsEl.appendChild(tabBtn);
  panelsWrapEl.appendChild(panel);
  
  tabBtn.addEventListener('click', () => {
    const allTabs = tabsEl.querySelectorAll('.merchant-tab');
    const allPanels = panelsWrapEl.querySelectorAll('.merchant-panel');
    allTabs.forEach(t => t.classList.remove('is-active'));
    allPanels.forEach(p => p.classList.remove('is-active'));
    tabBtn.classList.add('is-active');
    panel.classList.add('is-active');
    recomputePendingCores();
  });
  
  updateCombinePanelVisibility(minerSheetEl);
  recomputePendingCores();
  
  if (typeof window !== 'undefined') {
      window.addEventListener('currency:change', (e) => {
          if (e.detail?.key === 'scrap' || UC_MATERIALS.includes(e.detail?.key)) {
              recomputePendingCores();
          }
      });
      window.addEventListener('level:change', (e) => {
          if (e.detail?.prefix === 'dp') {
              recomputePendingCores();
          }
      });
  }
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
    if (tabBtn.classList.contains('is-active')) {
      const dlgTab = tabsEl.querySelector('[data-tab="dialogue"]');
      if (dlgTab) dlgTab.click();
    }
  }
}

window.onCombineUpgradeUnlocked = function() {
  setCombineUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-sheet');
  if (minerSheetEl) {
      updateCombinePanelVisibility(minerSheetEl);
  }
};

if (typeof window !== 'undefined') {
  window.resetSystem = window.resetSystem || {};
  Object.assign(window.resetSystem, {
    initCombinePanel,
    updateCombinePanelVisibility,
    isCombineUnlocked,
    setCombineUnlocked,
    hasDoneCombineReset,
    setCombineResetCompleted,
    performCombineReset,
    computeCombineCores,
    getPotentialScrap,
    recomputePendingCores
  });
}
