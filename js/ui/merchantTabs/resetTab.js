import { getActiveSlot, bank, CURRENCIES, UC_MATERIALS, getCurrencyMultiplierScaledBN } from '../../util/storage.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { formatNumber } from '../../util/numFormat.js';
import { getDpState, isDpSystemUnlocked, resetDpProgress } from '../../game/dpSystem.js';
import { isPpSystemUnlocked } from '../../game/ppSystem.js';
import { unlockPpSystem } from '../../game/ppSystem.js';
import { BigNum, approxLog10BigNum, bigNumFromLog10 } from '../../util/bigNum.js';
import { settingsManager } from '../../game/settingsManager.js';
import { resetUcEacAccumulator } from '../../game/automationEffects.js';
import { resetUcMaterialAccumulators, resetUcEacMaterialAccumulators, UC_MATERIAL_DATA } from '../../game/ucSpawner.js';
import { getUpgradesForArea, AREA_KEYS, setLevel } from '../../game/upgrades.js';
import { resetLab, RESEARCH_NODES } from '../../game/labNodes.js';
import { applySurgeResetLogic, getCurrentSurgeLevel, getSurgeBarLevelKey } from '../merchantTabs/resetTab.js';
import { isBuildingsUnlocked } from './buildingsTab.js';
import { isSurgeActive } from '../../game/surgeEffects.js';
import { playAudio } from "../../util/audioManager.js";
import { BUILDING_IDS } from "./buildingsTab.js";
import { WATERWHEEL_DEFS, setWaterwheelLevel, setWaterwheelFp, stopAllWaterwheels } from '../merchantTabs/flowTab.js';

const COMBINE_UNLOCKED_KEY_BASE = 'ccc:combineUnlocked';
const COMBINE_COMPLETED_KEY_BASE = 'ccc:combineCompleted';
const COMBINE_ICON_SRC = 'img/currencies/core/core.webp';

const COMPRESS_UNLOCKED_KEY_BASE = 'ccc:compressUnlocked';
const COMPRESS_COMPLETED_KEY_BASE = 'ccc:compressCompleted';
const COMPRESS_ICON_SRC = 'img/currencies/crystal/crystal.webp';

let resetState = {
  slot: null,
  combineUnlocked: false,
  hasDoneCombineReset: false,
  pendingCores: BigNum.fromInt(0),
  compressUnlocked: false,
  hasDoneCompressReset: false,
  pendingCrystals: BigNum.fromInt(0),
  flagsPrimed: false,
  panel: null,
  elements: {
    combine: {
      card: null,
      status: null,
      btn: null,
    },
    compress: {
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
  ensurePersistentFlagsPrimed();
  return !!resetState.combineUnlocked;
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
  updateCombineCard();
  try { window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'combine', slot } })); } catch {}
}

export function hasDoneCombineReset() {
  ensurePersistentFlagsPrimed();
  return !!resetState.hasDoneCombineReset;
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


export function isCompressUnlocked() {
  ensurePersistentFlagsPrimed();
  return !!resetState.compressUnlocked;
}

export function setCompressUnlocked(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${COMPRESS_UNLOCKED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${COMPRESS_UNLOCKED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
  resetState.compressUnlocked = !!value;
  updateCompressCard();
  try { window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'compress', slot } })); } catch {}
}

export function hasDoneCompressReset() {
  ensurePersistentFlagsPrimed();
  return !!resetState.hasDoneCompressReset;
}

export function setCompressResetCompleted(value, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (typeof localStorage !== 'undefined') {
    try {
      if (value) {
        localStorage.setItem(`${COMPRESS_COMPLETED_KEY_BASE}:${slotKey}`, '1');
      } else {
        localStorage.removeItem(`${COMPRESS_COMPLETED_KEY_BASE}:${slotKey}`);
      }
    } catch {}
  }
  resetState.hasDoneCompressReset = !!value;
}

export function performCompressReset() {
    if (!isCompressUnlocked()) return false;

    if (settingsManager.get('compress_confirmation')) {
        if (!window.confirm("Are you sure you want to do a Compress reset?")) return false;
    }
    
    if (!checkCompressRequirements()) {
        return false;
    }
    
    if (resetState.pendingCrystals.isZero?.()) {
        return false;
    }
    
    const reward = resetState.pendingCrystals.clone?.() ?? resetState.pendingCrystals;
    
    // Add crystals
    try {
        if (bank.CRYSTALS?.add) {
            bank.CRYSTALS.add(reward);
        }
    } catch {}
    
    setCompressResetCompleted(true);
    
    // Play Compress reset sound
    try {
        playAudio('sounds/compress_reset.ogg', { type: 'sfx' });
        
        
    } catch {}

    // Resets everything Combine does
    applyCombineResetLogic({ playSurgeEffects: false });
    
    // Reset all buildings except crystal
    const slot = ensureResetSlot();
    const isBuildingsUnl = isBuildingsUnlocked();
    if (isBuildingsUnl) {
        if (typeof localStorage !== 'undefined') {
            for (const buildingId of BUILDING_IDS) {
                if (buildingId !== 'crystal') {
                    localStorage.removeItem(`ccc:buildingLevel:${buildingId}:${slot}`);
                }
            }
        }
        try {
            if (typeof window !== 'undefined') {
                if (window.resetSystem?.updateBuildingsPanelVisibility) {
                    window.resetSystem.updateBuildingsPanelVisibility();
                }
                if (window.resetSystem?.updateBuildingsOverlayUi) {
                    window.resetSystem.updateBuildingsOverlayUi();
                }
            }
        } catch {}
    }
    
    // Set surge to 200
    try {
        const surgeKey = getSurgeBarLevelKey(slot);
        localStorage.setItem(surgeKey, '200');
        window.dispatchEvent(new CustomEvent("surge:level:change", { detail: { slot, level: 200 } }));
        window.dispatchEvent(new CustomEvent("level:change", { detail: { prefix: "waves", level: 200, isUnlocked: true } }));
    } catch {}
    
    // Reset waves to 0
    try {
        if (bank.waves?.set) {
            bank.waves.set(0);
        }
    } catch {}
    
    try {
        window.dispatchEvent(new CustomEvent('compress:reset', { detail: { slot } }));
    } catch {}

    try {
        unlockPpSystem();
    } catch {}

    return true;
}

function applyCombineResetLogic({ playSurgeEffects = false } = {}) {
    const slot = ensureResetSlot();
    
    // Wipe Experiment (also wipes Surge, Lab nodes)
    try {
        applySurgeResetLogic(BigNum.fromInt(0), { playEffects: playSurgeEffects });
        // Wipe Lab
        let labExceptions = [4];
        if (isSurgeActive(100)) {
            labExceptions = RESEARCH_NODES.map(n => n.id);
        }
        resetLab(labExceptions);
    } catch {}

    // Wipe DNA
    try { bank.DNA.set(0); } catch {}
    
    // Wipe DNA Upgrades
    try {
        const upgrades = getUpgradesForArea('dna');
        for (const upg of upgrades) {
            if (!upg) continue;
            setLevel('dna', upg.id, 0, true, { resetHmEvolutions: true });
        }
    } catch {}

    // Wipe Scrap
    try {
        if (bank.scrap) bank.scrap.set(0);
    } catch {}
    
    // Wipe Materials
    try {
        for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
           const matKey = UC_MATERIAL_DATA[i].name;
           if (bank[matKey]) bank[matKey].set(0);
        }
        
        // Zero accumulators
        resetUcMaterialAccumulators();
		resetUcEacMaterialAccumulators();
        resetUcEacAccumulator();
    } catch {}
    
    // Wipe DP/Depth
    try {
        resetDpProgress({ keepUnlock: true });
        if (window.ucSpawner && typeof window.ucSpawner.clearPlayfield === 'function') {
            window.ucSpawner.clearPlayfield('underwater_cavern');
        }
    } catch {}
    
    // Reset Waterwheels
    try {
        for (const id in WATERWHEEL_DEFS) {
            setWaterwheelLevel(id, 0);
            setWaterwheelFp(id, 0);
        }
        
        stopAllWaterwheels();
    } catch {}
    
    // Core/Scrap upgrades reset
    try {
        const ucUpgrades = getUpgradesForArea(AREA_KEYS.UNDERWATER_CAVERN);
        if (typeof localStorage !== 'undefined') {
            for (let j = 0; j < ucUpgrades.length; j++) {
                const upg = ucUpgrades[j];
                if (!upg) continue;
                localStorage.removeItem(`ccc:upgrade:${AREA_KEYS.UNDERWATER_CAVERN}:${upg.id}:${slot}`);
            }
        }
        for (let j = 0; j < ucUpgrades.length; j++) {
            const upg = ucUpgrades[j];
            if (!upg) continue;
            if (upg.costType === 'scrap') {
                setLevel(AREA_KEYS.UNDERWATER_CAVERN, upg.id, 0, true, { resetHmEvolutions: true });
            } else {
                setLevel(AREA_KEYS.UNDERWATER_CAVERN, upg.id, BigNum.fromInt(0), true, { resetHmEvolutions: true });
            }
        }
    } catch {}
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
      if (amtEl && amtEl.innerHTML !== amountStr) {
          amtEl.innerHTML = amountStr;
      }
  }
}

export function getPotentialScrap() {
   let totalVal = BigNum.fromInt(0);
   const _dpLevel = isDpSystemUnlocked() ? getDpState().dpLevel : null;
   const dpLevelNum = _dpLevel ? (_dpLevel.inf ? Infinity : (_dpLevel.sig * Math.pow(10, _dpLevel.e))) : 0;
   const scrapMultiplier = getCurrencyMultiplierScaledBN(CURRENCIES.SCRAP);

   for (let i = 0; i < UC_MATERIAL_DATA.length; i++) {
       const t = UC_MATERIAL_DATA[i];
       const matKey = t.name;
       const owned = bank[matKey]?.value || BigNum.fromInt(0);
       
       if (owned.cmp(0) > 0) {
           const materialValue = BigNum.fromAny(t.value || 0);
           const val = materialValue.mulBigNumInteger(scrapMultiplier).mulScaledIntFloor(1, BigNum.DEFAULT_PRECISION);
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
    
    // DP Level base threshold: 31
    const dpLevel = Math.max(0, (dpLevelBn.inf ? Infinity : (dpLevelBn.sig * Math.pow(10, dpLevelBn.e))));
    
    if (!Number.isFinite(logScrap)) {
        if (logScrap > 0) return BigNum.fromAny('Infinity');
    }

    if (dpLevel === Infinity) {
        if (logScrap >= 7) return BigNum.fromAny('Infinity');
    }

    const logScaled = Math.max(0, logScrap - 7);
    const pow2 = logScaled <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(logScaled * Math.log10(2));
    
    const levelFactor = Math.max(0, (dpLevel - 30) / 5);
    const pow14 = levelFactor <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(levelFactor * Math.log10(1.4));
    
    const floorLog = Math.floor(logScaled);
    const pow115 = floorLog <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(floorLog * Math.log10(1.15));

    
    let total = BigNum.fromInt(10);
    total = total.mulBigNumInteger(pow2);
    total = total.mulBigNumInteger(pow14);
    total = total.mulBigNumInteger(pow115);
    
    let finalTotal = total;
    if (bank.cores && bank.cores.mult) {
        try {
            const mult = bank.cores.mult.get();
            if (mult && !mult.isZero?.()) {
                finalTotal = finalTotal.mulBigNumInteger ? finalTotal.mulBigNumInteger(mult) : finalTotal;
            }
        } catch(e){}
    }
    const floored = finalTotal.floorToInteger();
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
    
    
    // Play sound
    if (typeof window !== 'undefined') {
        playAudio('sounds/combine_reset.ogg', { type: 'sfx' });
        
    }
    
    if (!isBuildingsUnlocked()) {
        if (typeof window !== 'undefined' && window.onBuildingsUpgradeUnlocked) {
            window.onBuildingsUpgradeUnlocked();
        }
    }
    
    setCombineResetCompleted(true);
    applyCombineResetLogic({ playSurgeEffects: false });
    recomputePendingCoresAndCrystals();
    return true;
}


function ensurePersistentFlagsPrimed() {
  const slot = getActiveSlot();
  if (slot == null) {
    resetState.flagsPrimed = false;
    return;
  }
  if (resetState.slot !== slot) {
    resetState.slot = slot;
    resetState.flagsPrimed = false;
  }
  if (!resetState.flagsPrimed) {
    readPersistentFlags(slot);
  }
}

function readPersistentFlags(slot) {
  if (slot == null) {
    resetState.combineUnlocked = false;
    resetState.hasDoneCombineReset = false;
    resetState.compressUnlocked = false;
    resetState.hasDoneCompressReset = false;
    resetState.flagsPrimed = false;
    return;
  }
  try {
    resetState.combineUnlocked = localStorage.getItem(`${COMBINE_UNLOCKED_KEY_BASE}:${slot}`) === '1';
  } catch {
    resetState.combineUnlocked = false;
  }
  try {
    resetState.hasDoneCombineReset = localStorage.getItem(`${COMBINE_COMPLETED_KEY_BASE}:${slot}`) === '1';
  } catch {
    resetState.hasDoneCombineReset = false;
  }
  try {
    resetState.compressUnlocked = localStorage.getItem(`${COMPRESS_UNLOCKED_KEY_BASE}:${slot}`) === '1';
  } catch {
    resetState.compressUnlocked = false;
  }
  try {
    resetState.hasDoneCompressReset = localStorage.getItem(`${COMPRESS_COMPLETED_KEY_BASE}:${slot}`) === '1';
  } catch {
    resetState.hasDoneCompressReset = false;
  }
  
  resetState.flagsPrimed = true;
}

function updateCombineCard() {
    const el = resetState.elements.combine;
    if (!el.card || !el.btn) return;
    
    ensurePersistentFlagsPrimed();
    
    if (!isCombineUnlocked()) {
        if (el.card.style.display !== 'none') el.card.style.display = 'none';
        return;
    }
    
    if (!el.card.style.display || el.card.style.display === 'none') { el.card.style.display = 'flex'; }
    
    el.card.classList.toggle('is-complete', !!hasDoneCombineReset());
    
    if (el.status) {
        if (hasDoneCombineReset()) {
            if (el.status.innerHTML !== '') el.status.innerHTML = '';
        } else {
            const expected = `
              <span style="color:#02e815; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
                Combining for the first time will unlock new Shop upgrades and a new tab: <strong style="color: black; text-shadow: 0 0 5px white, 0 0 10px white;">Buildings</strong><br>
                This new tab will allow you to upgrade powerful Buildings to help you progress
              </span>
            `.trim();
            if (el.status.innerHTML !== expected) el.status.innerHTML = expected;
        }
    }
    
    if (!checkCombineRequirements()) {
        updateResetButtonContent(el.btn, { disabled: true, msg: 'Get at least 3 unique Materials to perform a Combine reset' });
        return;
    }
    
    updateResetButtonContent(el.btn, { disabled: false }, COMBINE_ICON_SRC, resetState.pendingCores);
}


function updateCompressCard() {
    const el = resetState.elements.compress;
    if (!el.card || !el.btn) return;
    
    ensurePersistentFlagsPrimed();
    
    const panel = resetState.panel || document.getElementById('miner-panel-reset');
    const compressLayerBtn = panel ? panel.querySelector('[data-reset-layer="compress"]') : null;
    
    if (!isCompressUnlocked()) {
        if (el.card.style.display !== 'none') el.card.style.display = 'none';
        if (compressLayerBtn && compressLayerBtn.style.display !== 'none') compressLayerBtn.style.display = 'none';
        return;
    }
    
    if (!el.card.style.display || el.card.style.display === 'none') { el.card.style.display = 'flex'; }
    if (compressLayerBtn && compressLayerBtn.style.display !== 'flex') compressLayerBtn.style.display = 'flex';
    
    el.card.classList.toggle('is-complete', !!hasDoneCompressReset());
    
    if (el.status) {
        if (hasDoneCompressReset()) {
            if (el.status.innerHTML !== '') el.status.innerHTML = '';
        } else {
            const expected = `
              <span style="color:#02e815; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
                Reaching Depth: 101m unlocked the Crystal building; you can preview it before you reset to see what it's like<br>
                Compressing for the first time will unlock new Shop upgrades and <strong style="color:#ff66d9; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">Pressure</strong><br>
                Collect Materials to get PP; increasing Pressure will yield double DP and Material value per atm of Pressure<br>
                Compressing for the first time will also replace the Surge 200 milestone with something new<br>
                Additionally, the Surge requirement to perform Compress will be moved to Surge 250 once Pressure is unlocked
              </span>
            `.trim();
            if (!el.status.innerHTML.includes('Pressure')) el.status.innerHTML = expected;
        }
    }
    
    if (!checkCompressRequirements()) {
        const reqSurge = isPpSystemUnlocked() ? 250 : 200;
        updateResetButtonContent(el.btn, { disabled: true, msg: `Reach Depth: 101m and Surge ${reqSurge} to perform a Compress reset` });
    } else {
        updateResetButtonContent(el.btn, { disabled: false }, COMPRESS_ICON_SRC, resetState.pendingCrystals);
    }
}

function initCombineTabUI(panel) {
  panel.innerHTML = `
    <div class="merchant-reset miner-reset">
      <aside class="merchant-reset__sidebar">
        <button type="button" class="merchant-reset__layer is-active" data-reset-layer="combine">
          <img src="img/misc/combine.webp" alt="">
          <span>Combine</span>
        </button>
        <button type="button" class="merchant-reset__layer" data-reset-layer="compress" style="display: none;">
          <img src="img/misc/compress.webp" alt="">
          <span>Compress</span>
        </button>
      </aside>

      <div class="merchant-reset__list">
        <!-- COMBINE CARD -->
        <div class="merchant-reset__card merchant-reset__main is-combine" id="reset-card-combine">
          <div class="merchant-reset__layout">
            <header class="merchant-reset__header">
              <div class="merchant-reset__titles">
                <h3>Combine</h3>
              </div>
            </header>

            <div class="merchant-reset__content">
              <div class="merchant-reset__titles">
                <p data-reset-desc="combine">
                  Resets everything Experiment does as well as DNA, DNA upgrades, Waterwheels, Scrap, Materials, DP, Depth, and Scrap upgrades for Cores<br>
                  Increase pending Core amount by increasing Scrap or potential Scrap (collective value of all held Materials) and Depth
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
        <!-- COMPRESS CARD -->
        <div class="merchant-reset__card merchant-reset__main is-compress" id="reset-card-compress" style="display: none;">
          <div class="merchant-reset__layout">
            <header class="merchant-reset__header">
              <div class="merchant-reset__titles">
                <h3>Compress</h3>
              </div>
            </header>

            <div class="merchant-reset__content">
              <div class="merchant-reset__titles">
                <p data-reset-desc="compress">
                  Resets everything Combine does as well as all Buildings (except Crystal's) and sets your Surge to 200 (and Waves to 0) for Crystals<br>
                  Increase pending Crystal amount by increasing Scrap or potential Scrap and Surge past 200
                </p>
              </div>
              <div class="merchant-reset__status" data-reset-status="compress"></div>
            </div>
            
            <div class="merchant-reset__actions">
              <button type="button" class="merchant-reset__action" data-reset-action="compress">
                <span class="merchant-reset__action-plus">+</span>
                <span class="merchant-reset__action-icon">
                  <img src="${COMPRESS_ICON_SRC}" alt="">
                </span>
                <span class="merchant-reset__action-amount" data-reset-pending="compress">0</span>
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
  
  resetState.panel = panel;
  initCombineTabUI(panel);
  
  resetState.elements.combine.card = panel.querySelector('#reset-card-combine');
  resetState.elements.combine.status = panel.querySelector('[data-reset-status="combine"]');
  resetState.elements.combine.btn = panel.querySelector('[data-reset-action="combine"]');
  
  
  const combineLayerBtn = panel.querySelector('[data-reset-layer="combine"]');
  const compressLayerBtn = panel.querySelector('[data-reset-layer="compress"]');
  
  if (combineLayerBtn && compressLayerBtn) {
      combineLayerBtn.addEventListener('click', () => {
          combineLayerBtn.classList.add('is-active');
          compressLayerBtn.classList.remove('is-active');
          if (resetState.elements.combine.card) {
              const scrollContainer = resetState.elements.combine.card.closest('.miner-reset');
              if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
              else resetState.elements.combine.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      });
      compressLayerBtn.addEventListener('click', () => {
          compressLayerBtn.classList.add('is-active');
          combineLayerBtn.classList.remove('is-active');
          if (resetState.elements.compress.card) {
              resetState.elements.compress.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
      });
  }

  resetState.elements.compress.card = panel.querySelector('#reset-card-compress');
  resetState.elements.compress.status = panel.querySelector('[data-reset-status="compress"]');
  resetState.elements.compress.btn = panel.querySelector('[data-reset-action="compress"]');
  
  resetState.elements.compress.btn.addEventListener('click', () => {
     if (performCompressReset()) {
         recomputePendingCoresAndCrystals();
     }
  });

  resetState.elements.combine.btn.addEventListener('click', () => {
     if (performCombineReset()) {
         recomputePendingCoresAndCrystals();
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
    
  });
  
  updateCombinePanelVisibility(minerSheetEl);
  updateCompressPanelVisibility(minerSheetEl);
  recomputePendingCoresAndCrystals();
  
  if (typeof window !== 'undefined') {
      window.addEventListener('currency:change', (e) => {
          if (e.detail?.key === 'scrap' || UC_MATERIALS.includes(e.detail?.key)) {
              recomputePendingCoresAndCrystals();
          }
      });
      window.addEventListener('level:change', (e) => {
          if (e.detail?.prefix === 'dp') {
              recomputePendingCoresAndCrystals();
          }
      });
      window.addEventListener('dp:change', (e) => {
          recomputePendingCoresAndCrystals();
      });
      window.addEventListener('surge:level:change', (e) => {
          recomputePendingCoresAndCrystals();
      });
  }
}


function checkCompressRequirements() {
    let dpLevelNum = 0;
    try {
       const state = getDpState();
       dpLevelNum = (state.dpLevel.inf ? Infinity : (state.dpLevel.sig * Math.pow(10, state.dpLevel.e)));
    } catch {}
    
    let surgeLevel = 0;
    try {
        surgeLevel = getCurrentSurgeLevel();
    } catch {}
    
    const reqSurge = isPpSystemUnlocked() ? 250 : 200;
    return dpLevelNum >= 101 && surgeLevel >= reqSurge;
}

export function computeCompressCrystals(scrapBn, potentialScrapBn, surgeLevel) {
    const totalScrap = scrapBn.add(potentialScrapBn);
    
    // Scale start at 1e33 Scrap instead
    const logScrap = approxLog10BigNum(totalScrap);
    
    if (!Number.isFinite(logScrap)) {
        if (logScrap > 0) return BigNum.fromAny('Infinity');
    }

    if (surgeLevel === Infinity) {
        if (logScrap >= 33) return BigNum.fromAny('Infinity');
    }
    
    const logScaled = Math.max(0, logScrap - 33);
    const pow2 = logScaled <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(logScaled * Math.log10(2));
    
    const floorLog = Math.floor(logScaled);
    const pow115 = floorLog <= 0 ? BigNum.fromInt(1) : bigNumFromLog10(floorLog * Math.log10(1.15));
    
    let total = BigNum.fromInt(10);
    total = total.mulBigNumInteger(pow2);
    total = total.mulBigNumInteger(pow115);
    
    if (surgeLevel > 200) {
        const surgeFactor = surgeLevel - 200;
        // multiply 1.5x compounding each Surge level after 200
        const surgePowBn = bigNumFromLog10(surgeFactor * Math.log10(1.5));
        total = total.mulBigNumInteger(surgePowBn);
    }
    
    let finalTotal = total;
    if (bank.crystals && bank.crystals.mult) {
        try {
            const mult = bank.crystals.mult.get();
            if (mult && !mult.isZero?.()) {
                finalTotal = finalTotal.mulBigNumInteger ? finalTotal.mulBigNumInteger(mult) : finalTotal;
            }
        } catch(e){}
    }
    const floored = finalTotal.floorToInteger();
    if (floored.cmp(BigNum.fromInt(10)) < 0) return BigNum.fromInt(10);
    return floored;
}

export function recomputePendingCrystals() {
    const scrap = bank.scrap?.value ?? BigNum.fromInt(0);
    const potentialScrap = getPotentialScrap();
    let surgeLevel = 0;
    try {
        surgeLevel = getCurrentSurgeLevel();
    } catch {}
    resetState.pendingCrystals = computeCompressCrystals(scrap, potentialScrap, surgeLevel);
}

export function recomputePendingCoresAndCrystals() {
    recomputePendingCores();
    recomputePendingCrystals();
    updateCompressCard();
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



function updateCompressPanelVisibility(minerSheetEl) {
  const tabsEl = minerSheetEl.querySelector('.merchant-tabs');
  if (!tabsEl) return;
  const tabBtn = tabsEl.querySelector('[data-tab="reset"]');
  if (!tabBtn) return;
  
  if (isCompressUnlocked() || isCombineUnlocked()) {
    tabBtn.textContent = 'Reset';
    tabBtn.title = 'Reset';
    tabBtn.classList.remove('is-locked');
    tabBtn.disabled = false;
  }
  
  const panel = resetState.panel || document.getElementById('miner-panel-reset');
  if (panel) {
      const compressLayerBtn = panel.querySelector('[data-reset-layer="compress"]');
      if (compressLayerBtn) {
          compressLayerBtn.style.display = isCompressUnlocked() ? 'flex' : 'none';
      }
  }
}


window.onCompressUpgradeUnlocked = function() {
  setCompressUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-overlay.is-miner .merchant-sheet');
  if (minerSheetEl) {
      updateCombinePanelVisibility(minerSheetEl);
      updateCompressPanelVisibility(minerSheetEl);
  }
};

window.onCombineUpgradeUnlocked = function() {
  setCombineUnlocked(true);
  const minerSheetEl = document.querySelector('.merchant-overlay.is-miner .merchant-sheet');
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
    recomputePendingCores,
    updateCombineCard,
    isCompressUnlocked,
    setCompressUnlocked,
    hasDoneCompressReset,
    setCompressResetCompleted,
    performCompressReset,
    updateCompressCard,
    updateCompressPanelVisibility
  });
}
